# Decisiones de arquitectura (ADR)

Registro corto de decisiones no triviales del proyecto. Una entrada por decisión, formato:

```
## AAAA-MM-DD — Título de la decisión

**Contexto:** por qué hacía falta decidir esto.
**Decisión:** qué se decidió.
**Alternativas consideradas:** qué otras opciones se valoraron y por qué se descartaron.
```

## 2026-09-07 — Enrutado por path bajo un único dominio, cada módulo instalable como PWA independiente

**Contexto:** la app va a tener varios módulos (tablero Kanban, documentación estilo Confluence, y posiblemente más en el futuro). Jorge quiere poder acceder directamente a cada uno y tener accesos directos independientes en el móvil (iOS/Android).

**Decisión:** todos los módulos se sirven bajo el mismo dominio `jorgerente.duckdns.org`, cada uno en su propio path (`/kanban`, `/docs`, etc.) en vez de subdominios separados. Cada path se monta como PWA instalable de forma independiente: `manifest.json` y service worker con `scope` propio para ese path (`start_url`/`scope` = `/kanban/`, `/docs/`, ...), de modo que "Añadir a pantalla de inicio" en iOS/Android instala solo ese módulo como si fuera una app suelta, aunque compartan dominio, certificado SSL y, probablemente, backend.

**Alternativas consideradas:** subdominios por módulo (`kanban.jorgerente.duckdns.org`) — descartado porque DuckDNS solo da gratis el hostname base, no subdominios de un dominio propio, y habría que dar de alta/gestionar SSL por cada uno; todo bajo `/` sin separación de paths — descartado porque no permite accesos directos independientes por módulo.

**Implicaciones para infra:** ver `docs/infra.md` — nginx enruta por prefijo de path en vez de un único `proxy_pass` a `/`.

## 2026-09-07 — Stack: Next.js + SQLite

**Contexto:** hacía falta elegir stack técnico para todo el proyecto, priorizando sencillez de desarrollo y mantenimiento sobre flexibilidad máxima.

**Decisión:** Next.js (App Router) como framework full-stack único, con SQLite como base de datos. Encaja de forma natural con el enrutado por path decidido arriba (cada módulo es una carpeta de rutas), incluye API routes sin montar un backend aparte, y SQLite no requiere infraestructura extra (un único archivo, sin servidor de BD que mantener).

**Alternativas consideradas:** Node/Express + React separados (patrón ya usado en PokerPoke, pero más piezas y build steps); Node sin dependencias + HTML/JS vanilla (máxima simplicidad a largo plazo, pero mucho más trabajo manual para un Kanban con drag-and-drop y un editor de documentos).

## 2026-09-07 — Fecha límite opcional + un aviso por tarea vía Web Push

**Contexto:** las tareas del Kanban necesitaban decidir si llevan fecha límite y, si la hay, cómo avisar de que se acerca o ha pasado.

**Decisión:** fecha límite opcional por tarea. Como mucho un aviso (recordatorio) por tarea, definido como desplazamiento relativo a la fecha límite (p. ej. "1 día antes"), que se recalcula si se edita la fecha límite. El aviso se entrega como notificación **Web Push** a la PWA instalada — no email, no solo aviso al abrir la app.

**Alternativas consideradas:** email (más simple de implementar, ya hay `msmtp` configurado en el servidor, pero menos inmediato); aviso solo al abrir la app (sin infraestructura de push/cron, pero no avisa si no entras); push + email a la vez (más completo pero el doble de piezas a mantener). Se descartaron por priorizar la inmediatez de una notificación de móvil real sobre la simplicidad de email, ya que el aviso programable era justo el punto de este cambio.

**Implicaciones técnicas:** requiere claves VAPID, guardar la suscripción push por dispositivo/instalación, y un proceso en el servidor (cron o similar vía PM2) que revise periódicamente qué avisos tocan disparar y los envíe. Se detallará en `docs/infra.md` cuando se implemente.

## 2026-09-08 — Corrección: el scope del service worker va SIN barra final

**Contexto:** la entrada de 2026-09-07 sobre enrutado por path fijó `start_url`/`scope` =
`/kanban/`, con barra final. Resultó estar mal y provocó un bug real: el botón "Activar
avisos" se quedaba colgado en "Comprobando…" para siempre.

**Por qué falla:** `navigator.serviceWorker.ready` solo se resuelve cuando el scope de un
registro cubre la URL de la página actual. El scope `/kanban/` **no** cubre `/kanban` (la
vista global), así que en esa página la promesa no se resolvía nunca, aunque el worker
estuviera registrado y activo. Reproducido en Chromium: en `/kanban` no se resuelve jamás,
en `/kanban/board/N` sí. No era un fallo de Safari, como se sospechó al principio. Por el
mismo motivo el manifest era inválido: su `start_url` (`/kanban`) quedaba fuera de su
propio `scope` (`/kanban/`), lo que además rompe la instalación como PWA.

**Decisión:** el scope de cada módulo es el path **sin barra final** (`/kanban`,
`/fichar`). Como el script vive en `<módulo>/sw.js`, ese scope más amplio requiere la
cabecera `Service-Worker-Allowed: <módulo>`, que se envía desde `next.config.ts`. Además,
el código de suscripción **no usa `serviceWorker.ready`**: busca el registro con
`getRegistrations()` y espera su activación, de modo que funciona desde cualquier página y
tolera registros antiguos con el scope viejo. Lógica compartida en `src/lib/sw-register.ts`.

**Alternativas consideradas:** dejar el scope en `/kanban/` y arreglar solo el cliente
(funcionaría para push, pero mantiene el manifest inválido y el worker sin controlar la
página); servir el `sw.js` desde la raíz para no necesitar la cabecera (scope máximo `/`,
pero un worker en la raíz por módulo se pisa entre sí).

## 2026-09-08 — Módulo Fichar: modelo de datos y gestión de olvidos

**Contexto:** módulo nuevo para registrar la jornada laboral, con contadores en vivo de
tiempo en oficina, de descanso y efectivo.

**Decisión (modelo):** en la base de datos **solo se guardan instantes, nunca duraciones
acumuladas** (`work_sessions` y `work_breaks`, con `started_at`/`ended_at`). Todos los
contadores se derivan de esas marcas más `now`, con las mismas fórmulas en servidor y
navegador (`src/lib/fichar.ts`). Así recargar la página, cambiar de dispositivo o cerrar el
navegador no descuadra nada. Cada sesión guarda además su `local_date` (día local de
Madrid), que es lo que agrupa por día y semana sin aritmética de zonas horarias en cada
consulta.

**Decisión (olvidos):** si se olvida fichar la salida, la jornada se corta a las
23:59:59.999 **del día en que empezó** y se marca `auto_closed` para que la UI pida
revisarla; editar la hora de salida limpia esa marca. El corte se aplica al principio de
cada petición a `/api/fichar/*`, no con un cron: la jornada olvidada queda cerrada la
próxima vez que se abra la app y la hora registrada es correcta igualmente, con una pieza
menos de infraestructura.

**Decisión (botones):** entrada, salida y descanso son de **mantener pulsado 2 segundos**
con un aro de progreso, para que un toque accidental no fiche. Se descartó lanzar la
petición al empezar a pulsar y cancelarla al soltar: no ahorra latencia (la UI ya se
actualiza al completarse el gesto, sin esperar al servidor) y arriesga un fichaje fantasma
si la cancelación no llega. En su lugar el cliente manda `pressed_ms_ago` y el servidor
registra `ahora - pressed_ms_ago`, así mantener 2 s no cuesta 2 s de jornada; se manda una
duración y no una fecha absoluta para que un reloj desajustado en el móvil dé igual.

**Alternativas consideradas:** botones de descanso separados para pausa y comida
(descartado: un solo contador de descanso, un solo botón); historial de solo lectura
(descartado: se puede editar y borrar, que es lo que hace útil el cierre automático);
base de datos propia para el módulo (descartado: mismo fichero SQLite, tablas nuevas).
