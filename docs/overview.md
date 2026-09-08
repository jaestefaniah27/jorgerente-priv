# Overview

## Qué es
App personal de Jorge: varios módulos bajo un único dominio, cada uno instalable como
PWA independiente. Sustituye tener las cosas repartidas entre notas, memoria de Claude y
repos sueltos.

## Módulos

| Módulo | Path | Estado | Spec |
|---|---|---|---|
| Kanban | `/kanban` | En producción | [`kanban-spec.md`](kanban-spec.md) |
| Fichar | `/fichar` | En producción | [`fichar-spec.md`](fichar-spec.md) |
| Docs (estilo Confluence) | `/docs` | Sin empezar | — |

- **Kanban**: un tablero por proyecto (Backlog / To Do / En progreso / Hecho) más una vista
  global filtrable entre proyectos; épicas, prioridades, estimaciones, registro manual de
  tiempo y avisos por Web Push con fecha límite.
- **Fichar**: registro de jornada laboral. Botones de mantener pulsado para entrada, salida
  y descanso; contadores en vivo de oficina / descanso / efectivo, totales semanales e
  historial editable.

## Stack
Next.js (App Router) + SQLite (better-sqlite3), desplegado con PM2 tras nginx en el
servidor Oracle de Jorge. Sin autenticación: instancia personal de un solo usuario.
Ver [`infra.md`](infra.md) para servidor, dominio y despliegue, y
[`workflow.md`](workflow.md) para cómo se trabaja en este repo.

## Pendiente
- Módulo de documentación (`/docs`).
- Iconos propios para cada PWA (ahora `/fichar` reutiliza los del Kanban).
- Posibles extras de Fichar aparcados en v1: aviso push para recordar fichar la salida y
  objetivo de horas semanales.
