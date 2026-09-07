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
