# Infraestructura

## Servidor
- Oracle Cloud, IP `143.47.37.92`, usuario `ubuntu`, arquitectura **aarch64 (ARM64)**.
- Acceso desde Claude vía MCP (`Authorization:*` tools — mismo conector que PokerPoke, con acceso de shell completo al servidor, no solo al repo de poker).
- Código de la app clonado en `~/jorgerente_repo` (deploy key dedicada, ver abajo).

## Dominio y red
- DuckDNS: `jorgerente.duckdns.org` → `143.47.37.92`.
- SSL: Let's Encrypt vía certbot, plugin nginx (mismo patrón que el resto de apps del servidor: koalas-quiz, tfm-audiorev, impostor, poker). Renovación automática ya configurada (`certbot.timer`, corre cada ~6h).
- Config nginx: `/etc/nginx/sites-available/jorgerente` (symlink en `sites-enabled`).
- **Enrutado por path, no por subdominio** (ver decisión en `docs/decisions/README.md`): un único server block para `jorgerente.duckdns.org` (443, SSL), con un `location` por módulo — `/kanban`, `/docs`, etc. — cada uno con su propio `proxy_pass`. Actualmente solo existe `/kanban`, servido por `location /` que proxea todo a la app (la propia app hace `redirect("/kanban")` en `/`); se irá partiendo en `location` por path a medida que existan más módulos.
- Cada módulo sirve su propio `manifest.webmanifest` y service worker con `scope` limitado a su path (`/kanban/manifest.webmanifest`, `/kanban/sw.js`, scope `/kanban/`), para ser instalable como PWA independiente en iOS/Android (accesos directos separados por módulo aunque compartan dominio).

## Node.js: versión dedicada vía nvm
El Node del sistema en este servidor es **v18.19.1** (usado por todas las demás apps PM2: poker, impostor, quiz, etc.). Next.js 16 requiere Node ≥20.9. Para no tocar el Node del sistema (y no arriesgar romper las otras apps):

- Se instaló Node **v20.20.2** vía `nvm` (`~/.nvm/versions/node/v20.20.2/`), **sin cambiar el default de nvm ni el del sistema**.
- Tanto para trabajar manualmente en el repo (`npm install`, `npm run build`, tests) como en los procesos PM2, hay que usar explícitamente ese binario:
  ```bash
  export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 20.20.2
  ```
- Los procesos PM2 (`ecosystem.config.js`) apuntan al binario absoluto `~/.nvm/versions/node/v20.20.2/bin/node` como `interpreter`, así que no dependen de que el shell tenga `nvm use` activo.

## better-sqlite3: pineado a v11, no v13
`better-sqlite3@13.x` no tiene prebuild para Node 20 + arm64 en este servidor, y **compilar esa versión desde el código fuente aquí produce un binario que compila sin errores pero segfaulta** en cuanto se hace `new Database(...)` (probado con y sin `-flto`; causa no identificada del todo, probablemente una incompatibilidad de la v13 con esta combinación exacta de Node 20/gcc13/arm64). `better-sqlite3@11.x` sí tiene un prebuild descargable (`prebuild-install`) que funciona correctamente. **package.json está pineado a `^11.10.0` — no subir de major sin volver a probar `new Database()` en este servidor concreto tras el `npm install`.**

## Proceso (PM2)
Definidos en `ecosystem.config.js` (en la raíz del repo, sí se commitea — no contiene secretos, los carga de `.env` en tiempo de arranque):

- **`jorgerente`** — la app Next.js. `next start -p 8092`. Puerto `8092` (elegido por ser el siguiente libre; en uso en el servidor: 3000/3001/3002 poker+impostor, 8000 omega-api, 8090 quiz, 8091 tfm-audiorev, 3010 mcp-poker).
- **`jorgerente-reminders`** — el worker de avisos (`scripts/run-reminder-worker.mjs`), proceso PM2 independiente. Sondea la base de datos cada 60s (`REMINDER_POLL_MS`) buscando tareas con `reminder_at` vencido y sin enviar, y manda el Web Push.
  - **Importante**: el entrypoint real es `scripts/run-reminder-worker.mjs`, NO `scripts/reminder-worker.mjs` directamente. `reminder-worker.mjs` exporta `createWorker` (para tests) y `startWorkerLoop`, pero decide si auto-arrancar el bucle comparando `process.argv[1]` — comparación que **no funciona bajo PM2**, porque PM2 lanza los scripts a través de su propio módulo de arranque en vez de invocar `node scripts/reminder-worker.mjs` directamente, así que ese argv nunca coincide y el bucle nunca arrancaba (aunque el proceso quedaba "online" sin errores — bug silencioso, encontrado al revisar los logs tras el primer deploy). `run-reminder-worker.mjs` es un wrapper de una línea que llama a `startWorkerLoop()` sin esa comprobación, y es el que arranca PM2.
- Ambos procesos usan el Node 20 de nvm como `interpreter` (ver arriba).
- `.env` (gitignored) contiene `PORT`, `KANBAN_DB_PATH`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Next.js carga `.env` automáticamente por sí mismo; `ecosystem.config.js` además lo parsea a mano y lo inyecta como `env` de PM2 para que también llegue al worker (un script plano que no tiene el autoload de dotenv de Next).
- Arrancar/reiniciar todo: `cd ~/jorgerente_repo && pm2 start ecosystem.config.js` (o `pm2 restart jorgerente jorgerente-reminders` si ya existen). Tras cualquier cambio hay que `pm2 save` para que sobreviva a un reinicio del servidor.

## Acceso Git desde el servidor
- El servidor ya tenía una deploy key (`~/.ssh/github_poker`) pero solo con acceso al repo `poker` — no sirve para este proyecto.
- Se generó una deploy key nueva y dedicada: `~/.ssh/github_jorgerente`, con alias SSH `github-jorgerente` en `~/.ssh/config`.
- Añadida como *Deploy Key* en GitHub: Settings → Deploy keys del repo `jorgerente-priv`.
- Clonar/actualizar en el servidor con: `git -C ~/jorgerente_repo pull` (una vez clonado con `git clone github-jorgerente:jaestefaniah27/jorgerente-priv.git ~/jorgerente_repo`).
- **El contenedor cloud de Claude NO tiene push directo a este repo** (el proxy de git de la sesión lo bloquea con "not in this session's authorized repository set"). El flujo real de trabajo es: Claude escribe/edita los archivos en `~/jorgerente_repo` en el servidor vía las tools de `Authorization` (`write_file`, `run_command`), y el commit+push se hace *desde el servidor*, que sí tiene la deploy key.

## Deploy (flujo real usado)
1. Claude escribe los archivos directamente en `~/jorgerente_repo` en el servidor (no hay push desde el contenedor cloud, ver arriba).
2. `cd ~/jorgerente_repo && git add -A && git commit -m "..." && git push origin main` — esto sí funciona porque se ejecuta en el servidor con la deploy key.
3. Si hay cambios de dependencias:
   ```bash
   export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 20.20.2
   npm install
   ```
   Si `better-sqlite3` no tiene prebuild para esta combinación Node/arch, revisar la sección de arriba antes de forzar una compilación desde código fuente.
4. `npm run build` (con Node 20 activo).
5. `pm2 restart jorgerente jorgerente-reminders` (o `pm2 start ecosystem.config.js` la primera vez) y `pm2 save`.
6. Verificar:
   - `pm2 logs jorgerente --lines 50 --nostream` y `pm2 logs jorgerente-reminders --lines 50 --nostream` (el worker debe loguear `[reminder-worker] arrancado, revisando cada 60000ms` al arrancar).
   - `curl https://jorgerente.duckdns.org/kanban` y `curl https://jorgerente.duckdns.org/api/kanban/projects`.
   - Banco de tests: `BASE_URL=https://jorgerente.duckdns.org node tests/api.test.mjs` (cuidado: esto crea y borra proyectos/tareas de prueba contra la base de datos real — revisar y limpiar cualquier resto con `curl -X DELETE .../api/kanban/projects/<id>` si hace falta).
