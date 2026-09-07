# Workflow de trabajo

## Documentación
- Toda especificación, decisión, workflow o nota de este proyecto se guarda en este repo (`docs/`), no solo en el chat ni en la memoria de Claude.
- Cambios de documentación se commitean igual que cambios de código.

## Deploy
- **Directo a `main`, con verificación.** Elegido explícitamente por Jorge para este proyecto (a diferencia del workflow dev→staging→aprobación de PokerPoke, que se considera excesivo para un proyecto personal en solitario).
- Antes de cada deploy: build limpio (`tsc`/lo que aplique) sin errores.
- Deploy: pull en `~/jorgerente_repo` en el servidor, instalar dependencias si han cambiado, `pm2 restart jorgerente`.
- Después de cada deploy: revisar logs de PM2 (`pm2 logs jorgerente --lines 50 --nostream`) para confirmar arranque limpio.
- Avisar a Jorge de cada deploy realizado (qué se desplegó, resultado de la verificación).

## Decisiones de arquitectura
- Decisiones no triviales (elección de stack, modelo de datos, autenticación, etc.) se registran como entrada corta en `docs/decisions/` con: fecha, contexto, decisión, alternativas consideradas.

## Estructura de módulos
- Cada módulo de la app (Kanban, Docs, futuros) vive bajo su propio path en `jorgerente.duckdns.org` (`/kanban`, `/docs`, ...), no en subdominios.
- Cada módulo debe ser instalable como PWA independiente (manifest + service worker con scope propio), para tener accesos directos separados en iOS/Android.
- Ver el detalle y el porqué en `docs/decisions/README.md` (decisión del 2026-09-07) y `docs/infra.md`.

## Convenciones de comunicación
- Jorge se comunica en español, de forma informal y directa.
- Confirmar diagnóstico/plan antes de implementar cambios grandes; para cambios pequeños y evidentes, proceder directamente.
