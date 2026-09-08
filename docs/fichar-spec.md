# Módulo `fichar` — spec e implementación

Registro de jornada laboral: fichar entrada/salida y descansos, con contadores en vivo,
totales semanales e historial editable.

Este documento es **cerrado**: define qué construir con detalle suficiente para
implementarlo sin tomar decisiones nuevas. Si algo no está aquí, no entra en v1.

## Decisiones ya tomadas (no reabrir)

| Tema | Decisión |
|---|---|
| Ubicación | Módulo nuevo en `/fichar`, PWA independiente (igual patrón que `/kanban`) |
| Pausas | **Un solo botón** de descanso. Un único tipo, un único contador |
| Olvido de fichar salida | La jornada se **corta a medianoche local**, se marca `auto_closed` y se avisa en la UI |
| Historial | **Editable**: cambiar horas de entrada/salida y de descansos, y borrar |
| Base de datos | Mismo fichero SQLite que Kanban (`KANBAN_DB_PATH`), tablas nuevas |
| Zona horaria | `Europe/Madrid` para todo lo que sea "día" o "semana" |
| Semana | Lunes → domingo |
| Notificaciones push | **Fuera de v1**. El service worker es solo para instalar la PWA |

## Modelo de datos

Regla de oro: **solo se guardan instantes, nunca duraciones acumuladas.** Todos los
contadores se derivan de timestamps + `now`. Así un recargar de página, un cambio de
dispositivo o un cierre de navegador no pierden ni desincronizan nada.

Añadir a `SCHEMA_SQL` en `src/lib/db.ts`:

```sql
CREATE TABLE IF NOT EXISTS work_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  local_date TEXT NOT NULL,
  auto_closed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS work_breaks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_local_date ON work_sessions(local_date);
CREATE INDEX IF NOT EXISTS idx_work_sessions_open ON work_sessions(ended_at);
CREATE INDEX IF NOT EXISTS idx_work_breaks_session ON work_breaks(session_id);
```

Notas:

- `started_at` / `ended_at`: ISO UTC (`toISOString()`). `ended_at NULL` = en curso.
- `local_date`: `YYYY-MM-DD` en Madrid, derivado de `started_at`. Es lo que agrupa por
  día y por semana, sin hacer aritmética de zonas horarias en cada consulta.
- `auto_closed`: `1` si la cerró la regla de medianoche. **Se pone a `0` en cuanto Jorge
  edita `ended_at`** — así el aviso de "revisa esta jornada" desaparece solo al corregirla.
- Como toda jornada se corta a medianoche, ninguna cruza de día: `local_date` es siempre
  inequívoco.
- No hace falta migración de tablas existentes: son tablas nuevas, `CREATE TABLE IF NOT
  EXISTS` basta. **No tocar** la tabla `tasks` ni `migrateBacklogStatus()`.

## `src/lib/fichar.ts` (nuevo) — lógica compartida

Único sitio donde viven las fórmulas. La API y la UI importan de aquí; no duplicar
cálculos en componentes.

```ts
export const TZ = "Europe/Madrid";

export interface WorkBreak {
  id: number;
  session_id: number;
  started_at: string;
  ended_at: string | null;
}

export interface WorkSession {
  id: number;
  started_at: string;
  ended_at: string | null;
  local_date: string;
  auto_closed: number;
  breaks: WorkBreak[];
}

export interface Totals {
  officeMs: number;
  breakMs: number;
  effectiveMs: number;
}
```

### Fechas locales

```ts
// "YYYY-MM-DD" en Madrid. sv-SE ya formatea así.
export function localDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(iso));
}

function tzOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second
  );
  return (asUTC - at.getTime()) / 60000;
}

// Instante ISO de las 23:59:59.999 locales de ese día.
// El offset se mide a mediodía: en Madrid los cambios de hora ocurren de madrugada,
// así que a las 23:59 el offset es siempre el mismo que a las 12:00 del mismo día.
export function endOfLocalDayISO(dateStr: string): string {
  const offset = tzOffsetMinutes(new Date(`${dateStr}T12:00:00Z`));
  return new Date(Date.parse(`${dateStr}T23:59:59.999Z`) - offset * 60000).toISOString();
}

// Lunes de la semana de `dateStr`, como "YYYY-MM-DD".
export function mondayOf(dateStr: string): string { /* getUTCDay() sobre `${dateStr}T12:00:00Z`, domingo=0 → restar 6 */ }

// Suma n días a "YYYY-MM-DD" y devuelve "YYYY-MM-DD".
export function addDays(dateStr: string, n: number): string { /* ... */ }
```

### Duraciones

```ts
export function sessionTotals(session: WorkSession, nowMs: number): Totals {
  const start = Date.parse(session.started_at);
  const end = session.ended_at ? Date.parse(session.ended_at) : nowMs;
  const officeMs = Math.max(0, end - start);

  let breakMs = 0;
  for (const b of session.breaks) {
    const bStart = Date.parse(b.started_at);
    // un descanso abierto nunca cuenta más allá del fin de la jornada
    const bEnd = b.ended_at ? Date.parse(b.ended_at) : Math.min(nowMs, end);
    breakMs += Math.max(0, Math.min(bEnd, end) - Math.max(bStart, start));
  }
  breakMs = Math.min(breakMs, officeMs);

  return { officeMs, breakMs, effectiveMs: Math.max(0, officeMs - breakMs) };
}

export function sumTotals(list: Totals[]): Totals { /* suma campo a campo */ }
```

### Formato

Añadir a `src/lib/format.ts` (no tocar lo que ya hay):

```ts
export function msToClock(ms: number): string   // "02:47:15" — para el contador grande
export function msToShort(ms: number): string   // "2h 47m", "0m" si es cero — resto
```

`msToClock`: horas sin límite (`Math.floor(ms/3600000)`), sin días. Cada parte con
`padStart(2, "0")`.

## API — `src/app/api/fichar/`

Todos los handlers usan `handle()` y los helpers de `src/lib/api-helpers.ts`, igual que
el módulo Kanban. Todos llaman **primero** a `closeStaleSessions()`.

### `closeStaleSessions()` — en `src/lib/fichar-db.ts` (nuevo)

```
Para cada work_session con ended_at IS NULL y local_date < localDate(ahora):
  end = endOfLocalDayISO(session.local_date)
  UPDATE work_sessions SET ended_at = end, auto_closed = 1, updated_at = ahora
  UPDATE work_breaks SET ended_at = end WHERE session_id = ? AND ended_at IS NULL
```

Se ejecuta al principio de cada handler de `/api/fichar/*`. No hace falta cron: la
jornada olvidada queda cerrada la próxima vez que se abra la app, con la hora correcta
(medianoche), no con la hora de apertura.

### Endpoints

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/fichar/state` | — | `{ session, today, week, hasAutoClosed }` |
| POST | `/api/fichar/clock-in` | — | `201 { session }` |
| POST | `/api/fichar/clock-out` | — | `200 { session }` |
| POST | `/api/fichar/break/start` | — | `201 { break }` |
| POST | `/api/fichar/break/stop` | — | `200 { break }` |
| GET | `/api/fichar/week?start=YYYY-MM-DD` | — | `{ start, end, days, totals }` |
| PATCH | `/api/fichar/sessions/[id]` | `{ started_at?, ended_at? }` | `200 { session }` |
| DELETE | `/api/fichar/sessions/[id]` | — | `200 { ok: true }` |
| PATCH | `/api/fichar/breaks/[id]` | `{ started_at?, ended_at? }` | `200 { break }` |
| DELETE | `/api/fichar/breaks/[id]` | — | `200 { ok: true }` |

Detalle:

- **`GET /state`**: `session` = la jornada abierta con sus `breaks` (o `null`).
  `today` = `Totals` del día local de hoy (suma de todas sus jornadas).
  `week` = `Totals` de la semana en curso. `hasAutoClosed` = `true` si hay alguna sesión
  con `auto_closed = 1` en los últimos 7 días (dispara el aviso de la UI).
- **`POST /clock-in`**: `400 "Ya tienes una jornada abierta"` si existe una sin cerrar.
  Crea con `started_at = ahora`, `local_date = localDate(ahora)`.
- **`POST /clock-out`**: `400 "No tienes ninguna jornada abierta"` si no hay.
  Cierra también cualquier descanso abierto, con el mismo instante.
- **`POST /break/start`**: `400` si no hay jornada abierta, o si ya hay un descanso abierto.
- **`POST /break/stop`**: `400` si no hay descanso abierto.
- **`GET /week`**: `start` debe ser lunes (`400 "start debe ser un lunes"` si no).
  `days` = array de 7 objetos `{ date, sessions, totals }`, incluidos los días vacíos.
  `totals` = suma de la semana.

Validación de las ediciones (`PATCH`), en este orden, todas con `400`:

1. Fechas parseables (`Number.isFinite(Date.parse(v))`) → `"Fecha inválida"`.
2. `ended_at > started_at` → `"La salida debe ser posterior a la entrada"`.
3. Sesión: no puede solaparse con otra sesión → `"Se solapa con otra jornada"`.
4. Descanso: debe caber dentro de su sesión → `"El descanso queda fuera de la jornada"`.
   (Si la sesión está abierta, solo se comprueba el inicio.)
5. Descanso: no puede solaparse con otro descanso de la misma sesión → `"Se solapa con otro descanso"`.

Efectos secundarios de `PATCH /sessions/[id]`:

- Si cambia `started_at` → recalcular `local_date`.
- Si cambia `ended_at` → **`auto_closed = 0`** (ya está revisada a mano).
- Siempre → `updated_at = ahora`.

`DELETE /sessions/[id]` borra sus descansos en cascada (ya lo hace la FK, pero
`PRAGMA foreign_keys = ON` ya está activo en `db.ts`).

## UI — `/fichar`

Diseño **minimalista**: fondo claro, sin adornos, todo el peso visual en el contador
grande y el botón central. Tailwind, mismo lenguaje que Kanban (`slate` + `indigo`).

### Ficheros

- `src/app/fichar/layout.tsx` — metadata + manifest + PWA (copiar el patrón de
  `src/app/kanban/layout.tsx`), cabecera mínima con "Fichar" y enlace a `/kanban`.
- `src/app/fichar/page.tsx` — server component: `ensureSchema()`, lee el estado inicial y
  se lo pasa al cliente (evita el parpadeo inicial).
- `src/components/fichar/ClockPage.tsx` — client component, todo el estado en vivo.
- `src/components/fichar/HistoryModal.tsx` — historial semanal editable.

### Estructura visual (de arriba abajo)

```
┌──────────────────────────────────────────────┐
│  Fichar                          ← Kanban    │   cabecera fina
├──────────────────────────────────────────────┤
│  [!] Se cerró sola la jornada del 5 de sep.  │   solo si hasAutoClosed
│      Revísala en el historial.               │
│                                              │
│   ┌────────┐  ┌────────┐  ┌────────┐         │   fila de 3, seleccionables
│   │OFICINA │  │DESCANSO│  │EFECTIVO│         │
│   │ 3h 12m │  │ 0h 25m │  │ 2h 47m │         │
│   └────────┘  └────────┘  └────────┘         │
│                                              │
│                EFECTIVO                      │   etiqueta del grande
│               02:47:15                       │   contador grande
│                                              │
│           ┌──────────────────┐               │
│           │  FICHAR SALIDA   │               │   botón principal
│           └──────────────────┘               │
│           ┌──────────────────┐               │
│           │    Descanso      │               │   botón secundario
│           └──────────────────┘               │
│                                              │
│  ── Esta semana ──                           │
│   OFICINA 21h 5m · DESCANSO 3h 10m ·         │   3 contadores semanales
│   EFECTIVO 17h 55m                           │
│              [ Historial ]                   │
└──────────────────────────────────────────────┘
```

### Contadores

- Los **tres de arriba** son botones. El seleccionado se resalta (borde `indigo-500` +
  fondo `indigo-50`); los otros, borde `slate-200`. Al pulsarlos cambian cuál se muestra
  en grande. Todos llevan su etiqueta encima en mayúsculas pequeñas (`text-xs uppercase
  tracking-wide text-slate-500`).
- El **grande**: `text-6xl font-semibold tabular-nums` (`sm:text-7xl`), con su etiqueta
  encima. Formato `HH:MM:SS` vía `msToClock`.
- Los **tres pequeños** y los **semanales**: `msToShort` (sin segundos, menos ruido).
- Selección persistida en `localStorage` con la clave `fichar:bigCounter`
  (valores `oficina` | `descanso` | `efectivo`, por defecto `efectivo`).
  Envuelta en `try/catch` — puede lanzar en modo privado.

### Tick en vivo

```ts
const [now, setNow] = useState(() => Date.now());
useEffect(() => {
  const id = setInterval(() => setNow(Date.now()), 1000);
  return () => clearInterval(id);
}, []);
```

Todos los contadores salen de `sessionTotals(session, now)` sumado a los totales ya
cerrados del día que vienen del servidor. **No acumular en el cliente.**

Además, al recuperar el foco la pestaña (`visibilitychange` → visible) se vuelve a pedir
`GET /state`, para no quedarse desincronizado si se fichó desde el móvil.

### Estados de los botones

| Estado | Botón principal | Botón secundario |
|---|---|---|
| Sin fichar | `FICHAR ENTRADA` (indigo, grande) | oculto |
| Fichado, trabajando | `FICHAR SALIDA` (slate-800) | `Descanso` (ámbar, contorno) |
| Fichado, en descanso | `FICHAR SALIDA` (slate-800) | `Terminar descanso` (ámbar sólido) |

En descanso, el contador grande de "efectivo" se queda quieto (es correcto: el efectivo
no avanza) y la tarjeta de DESCANSO se resalta en ámbar para que se vea de un vistazo.

Todos los botones se deshabilitan mientras hay una petición en vuelo, y el estado se
refresca con la respuesta del servidor (nunca optimista: fichar mal es peor que esperar
200 ms).

### Historial

Modal a pantalla completa. Cabecera: `‹  Semana del 1 al 7 de septiembre  ›` + botón
"Esta semana" si no estás en la actual. Debajo, los totales de esa semana y una fila por
día (los 7, incluidos los vacíos, en gris):

```
lun 1 sep    09:02 → 18:15    8h 13m oficina · 45m descanso · 7h 28m efectivo   [✎]
             └ descanso 14:00 → 14:45                                     [✎] [🗑]
mar 2 sep    —
```

- Badge ámbar `cerrada automáticamente` en las sesiones con `auto_closed = 1`.
- `[✎]` en una sesión abre dos `input[type="datetime-local"]` (entrada y salida) +
  Guardar / Cancelar / Borrar. Igual para descansos.
- Los errores de validación del servidor se muestran en rojo dentro de la fila.
- Tras guardar o borrar, recargar la semana y también `GET /state`.

Navegación entre semanas: `start` sale de `mondayOf(hoy)` y se mueve con
`addDays(start, ±7)`. Sin límite hacia atrás; el botón `›` se deshabilita en la semana
actual (no hay futuro que ver).

## PWA — cuidado con esto

Se acaba de arreglar un bug de exactamente esto en Kanban. **No repetirlo.**

- `public/fichar/manifest.webmanifest`: `"start_url": "/fichar"`, `"scope": "/fichar"`
  (**sin barra final, y el `start_url` debe quedar dentro del `scope`**),
  `"display": "standalone"`, `name` "Fichar — jorgerente", `short_name` "Fichar",
  `background_color` `#0f172a`, `theme_color` `#4f46e5`, iconos 192 y 512.
- `public/fichar/icon-192.png` y `icon-512.png`: copiar de `public/kanban/`
  (`cp public/kanban/icon-192.png public/fichar/icon-192.png`, ídem 512).
  Iconos propios más adelante si Jorge quiere distinguirlos en la pantalla de inicio.
- `public/fichar/sw.js`: mínimo — `install` con `skipWaiting()`, `activate` con
  `clients.claim()`, y un `fetch` vacío (`self.addEventListener("fetch", () => {})`)
  para que sea instalable. **Sin handlers de `push` ni `notificationclick`**: este módulo
  no tiene notificaciones en v1.
- `next.config.ts`: añadir una segunda entrada a `headers()`:
  `{ source: "/fichar/sw.js", headers: [{ key: "Service-Worker-Allowed", value: "/fichar" }] }`.

### Refactor del registro del service worker

La lógica de registro está hoy dentro de `src/lib/push-client.ts` y tiene `/kanban`
incrustado. Extraerla para que sirva a los dos módulos:

1. Crear `src/lib/sw-register.ts` con
   `export async function ensureModuleServiceWorker(basePath: string): Promise<ServiceWorkerRegistration>`
   — es el cuerpo actual de `ensureServiceWorkerRegistration()`, pero con `basePath`
   (`"/kanban"`, `"/fichar"`) en lugar de las constantes fijas: URL del script
   `` `${basePath}/sw.js` ``, scope `basePath`, scope de reserva `` `${basePath}/` ``, y la
   búsqueda comparando `new URL(r.scope).pathname.replace(/\/+$/, "") === basePath`.
2. En `push-client.ts`, `ensureServiceWorkerRegistration()` pasa a ser
   `ensureModuleServiceWorker("/kanban")`. `findKanbanRegistration()` también usa el helper
   compartido. **No cambiar nada del comportamiento de Kanban** — los tests de UI existentes
   deben seguir pasando sin tocarlos.
3. `ServiceWorkerRegister.tsx` acepta `basePath?: string` con valor por defecto `"/kanban"`,
   para no romper su uso actual. `fichar/layout.tsx` lo usa como
   `<ServiceWorkerRegister basePath="/fichar" />`.

## Tests

### `tests/fichar-api.test.mjs` (nuevo)

Mismo estilo que `tests/api.test.mjs`: Node pelado, `ok(cond, msg)`, contra un servidor
con DB de usar y tirar. Casos mínimos:

1. `GET /state` sin nada → `session: null`, totales a 0.
2. `POST /clock-in` → 201, `ended_at` null, `local_date` = hoy.
3. `POST /clock-in` otra vez → 400.
4. `POST /break/start` → 201; otra vez → 400.
5. `POST /break/stop` → 200; otra vez → 400.
6. `POST /break/start` sin jornada abierta (tras clock-out) → 400.
7. `POST /clock-out` → 200, `ended_at` no nulo; otra vez → 400.
8. `POST /clock-out` con un descanso abierto → cierra también el descanso.
9. `GET /week?start=<lunes>` → 7 días, la jornada de hoy en su día correcto.
10. `GET /week?start=<martes>` → 400.
11. `PATCH /sessions/:id` con `ended_at` anterior a `started_at` → 400.
12. `PATCH /sessions/:id` con `ended_at` válido → 200 y `auto_closed` a 0.
13. `PATCH /breaks/:id` con un rango fuera de su sesión → 400.
14. `DELETE /sessions/:id` → 200, y sus descansos desaparecen.
15. `GET /api/kanban/tasks` sigue devolviendo 200 (no hemos roto el otro módulo).

### `tests/fichar-unit.test.mjs` (nuevo)

Patrón de `tests/reminder-worker.test.mjs`: SQLite temporal, sin servidor.

1. `localDate()` y `endOfLocalDayISO()` en horario de verano (julio, offset +02:00) y de
   invierno (enero, +01:00).
2. `mondayOf()` con un domingo (debe dar el lunes anterior, no el siguiente).
3. `sessionTotals()`: jornada cerrada con un descanso cerrado → oficina, descanso y
   efectivo correctos.
4. `sessionTotals()`: jornada abierta con descanso abierto, `nowMs` fijo → correcto.
5. `sessionTotals()`: descanso que quedó abierto y sesión cerrada después → el descanso se
   trunca al fin de la jornada, `effectiveMs >= 0`.
6. `closeStaleSessions()`: sesión abierta de ayer → se cierra a las 23:59:59.999 de ayer,
   `auto_closed = 1`, y su descanso abierto también se cierra.
7. `closeStaleSessions()`: sesión abierta de hoy → **no** se toca.

### `tests/fichar-ui.test.mjs` (nuevo)

Playwright con el Chromium ya instalado, mismo arranque que `tests/ui.test.mjs`
(`executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"`, `--no-sandbox`).

1. PWA: manifest 200, `scope === "/fichar"`, `start_url` dentro del scope, 2 iconos,
   `sw.js` 200 con `Service-Worker-Allowed: /fichar`.
2. En `/fichar`: el worker aparece en `getRegistrations()` con scope `/fichar`, activado, y
   `navigator.serviceWorker.ready` **se resuelve** (mismo guard que en `ui.test.mjs`,
   siempre con `Promise.race` contra un timeout para que una regresión falle en vez de
   colgar el test).
3. Estado inicial: se ve `Fichar entrada`, el contador grande a `00:00:00`.
4. Click en `Fichar entrada` → aparece `Fichar salida` y `Descanso`; tras esperar ~2s el
   contador de oficina ya no es `00:00:00`.
5. Click en `Descanso` → el botón pasa a `Terminar descanso`; el contador de descanso avanza.
6. Click en `Terminar descanso` → vuelve a `Descanso`.
7. Cambiar el contador grande: click en la tarjeta `OFICINA` → la etiqueta del grande pasa
   a `OFICINA`; recargar la página → sigue en `OFICINA` (localStorage).
8. Click en `Fichar salida` → vuelve `Fichar entrada`.
9. Abrir `Historial` → se ve la semana actual y el día de hoy con la jornada recién creada;
   `‹` cambia de semana y `›` vuelve.
10. Sin errores de consola en todo el flujo.

## Orden de ejecución

Cada paso termina con su verificación. No pasar al siguiente con algo en rojo.

1. **Datos y lógica**: tablas en `db.ts`, `src/lib/fichar.ts`, `src/lib/fichar-db.ts`,
   helpers en `format.ts`. → `npx tsc --noEmit` + `node tests/fichar-unit.test.mjs`.
2. **API**: los 9 endpoints. → `npm run build`, arrancar con DB de usar y tirar,
   `node tests/fichar-api.test.mjs`.
3. **Refactor del service worker** (`sw-register.ts` + `push-client.ts` + prop en
   `ServiceWorkerRegister`). → `node tests/ui.test.mjs` (los de Kanban, **sin tocarlos**)
   debe seguir en verde: 24 passed.
4. **PWA de fichar**: manifest, iconos, `sw.js`, header en `next.config.ts`.
5. **UI**: `layout.tsx`, `page.tsx`, `ClockPage.tsx`, `HistoryModal.tsx`.
   → `node tests/fichar-ui.test.mjs`.
6. **Suite completa** contra DB limpia: `api` (44) + `ui` (24) + `fichar-api` +
   `fichar-unit` + `fichar-ui` + `reminder-worker` (7) + `push-delivery` (5).
7. **Docs**: actualizar `docs/overview.md` (mencionar el módulo nuevo) y añadir un ADR
   corto en `docs/decisions/` con las 4 decisiones de la tabla de arriba.
8. **Deploy** (ver abajo) y avisar a Jorge.

## Recordatorios de deploy (este proyecto tiene trampas)

- El contenedor **no puede** hacer push a `jaestefaniah27/jorgerente-priv`. Se escriben los
  ficheros en el servidor con `mcp__Authorization__write_file` (rutas **absolutas**:
  `/home/ubuntu/jorgerente_repo/...`; las relativas cuelgan de `poker_repo`) y el
  `git add/commit/push` se hace **en el servidor**.
- Node 20 no es el del sistema. Todo npm/build va envuelto:
  `bash -lc 'export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 20.20.2; cd ~/jorgerente_repo && npm run build'`
- `better-sqlite3` clavado en v11.x (la v13 peta en este ARM64 + Node 20). No actualizarlo.
- Reiniciar con `pm2 restart jorgerente` y mirar `pm2 logs jorgerente --lines 30 --nostream`.
- Verificar en vivo antes de dar nada por bueno, y **limpiar los datos de prueba** que se
  creen contra producción.
