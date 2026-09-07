# Infraestructura

## Servidor
- Oracle Cloud, IP `143.47.37.92`, usuario `ubuntu`.
- Acceso desde Claude vía MCP (`Authorization:*` tools — mismo conector que PokerPoke, con acceso de shell completo al servidor, no solo al repo de poker).
- Código de la app clonado en `~/jorgerente_repo` (deploy key dedicada, ver abajo).

## Dominio y red
- DuckDNS: `jorgerente.duckdns.org` → `143.47.37.92`.
- SSL: Let's Encrypt vía certbot, plugin nginx (mismo patrón que el resto de apps del servidor: koalas-quiz, tfm-audiorev, impostor, poker).
- Config nginx: `/etc/nginx/sites-available/jorgerente` (symlink en `sites-enabled`).
- **Enrutado por path, no por subdominio** (ver decisión en `docs/decisions/README.md`): un único server block para `jorgerente.duckdns.org` (443, SSL), con un `location` por módulo — `/kanban`, `/docs`, etc. — cada uno con su propio `proxy_pass`. Placeholder actual sirve todo en `/` mientras no hay módulos reales; se irá partiendo en `location` por path a medida que existan.
- Cada módulo debe servir su propio `manifest.json` y service worker con `scope` limitado a su path, para ser instalable como PWA independiente en iOS/Android (accesos directos separados por módulo aunque compartan dominio).

## Proceso
- PM2, nombre de proceso: `jorgerente`.
- Puerto: `8092` (elegido por ser el siguiente libre; en uso en el servidor: 3000/3001/3002 poker+impostor, 8000 omega-api, 8090 quiz, 8091 tfm-audiorev, 3010 mcp-poker).

## Acceso Git desde el servidor
- El servidor ya tenía una deploy key (`~/.ssh/github_poker`) pero solo con acceso al repo `poker` — no sirve para este proyecto.
- Se generó una deploy key nueva y dedicada: `~/.ssh/github_jorgerente`, con alias SSH `github-jorgerente` en `~/.ssh/config`.
- Añadida como *Deploy Key* en GitHub: Settings → Deploy keys del repo `jorgerente-priv`.
- Clonar/actualizar en el servidor con: `git -C ~/jorgerente_repo pull` (una vez clonado con `git clone github-jorgerente:jaestefaniah27/jorgerente-priv.git ~/jorgerente_repo`).

## Deploy
1. Cambios de código/documentación se commitean y pushean a `main` desde Claude (el contenedor en la nube tiene push directo al repo cuando el repo está autorizado en la sesión).
2. En el servidor: `cd ~/jorgerente_repo && git pull`.
3. Si hay cambios de dependencias: `npm install` en la carpeta correspondiente.
4. `pm2 restart jorgerente`.
5. Verificar: `pm2 logs jorgerente --lines 50 --nostream` + comprobar `https://jorgerente.duckdns.org`.
