# Instrucciones para Claude en este repo

Este es el repositorio del proyecto **jorgerente**: una app personal de Jorge, tablero Kanban + documentación estilo Jira + Confluence. Léelo entero antes de tocar código o infraestructura de este proyecto.

## Estado actual
Fase de kickoff. Las especificaciones funcionales de la app (qué entidades, qué vistas, qué features) todavía no están definidas — se hablarán más adelante. Lo que sí está fijado es la metodología de trabajo y la infraestructura, descritas abajo.

## Metodología
- **Toda la documentación del proyecto** (specs, decisiones, workflows, notas) vive en este repo, bajo `docs/`. No se documenta solo en el chat.
- **Workflow de deploy: directo a `main`, con verificación.** No hay rama `dev` ni entorno de staging separado (proyecto personal en solitario, a diferencia de PokerPoke). Antes y después de cada deploy: build limpio, tests si existen, y revisar logs de PM2. Avisar a Jorge de cada deploy.
- Decisiones de arquitectura relevantes se registran como ADR corto en `docs/decisions/`.
- Stack todavía por decidir — se fijará cuando se hablen las especificaciones.

## Infraestructura
Ver [`docs/infra.md`](docs/infra.md) para el detalle completo (servidor, dominio, nginx, PM2, SSL, cómo desplegar).

Resumen rápido:
- Servidor: Oracle Cloud, IP `143.47.37.92`, acceso vía MCP (`Authorization:*` tools) o SSH.
- Dominio: `jorgerente.duckdns.org` (DuckDNS → nginx → app).
- Código en el servidor: `~/jorgerente_repo` (clonado con la deploy key `github-jorgerente`).
- Proceso PM2: `jorgerente`.

## Convenciones heredadas de otros proyectos de Jorge (aplicar salvo que se diga lo contrario)
- Comunicación de Jorge: español informal, directo y breve.
- Confirmar el diagnóstico con Jorge antes de implementar cambios grandes.
- Higiene de contexto: una conversación nueva por feature/tarea grande cuando el contexto crezca mucho.
