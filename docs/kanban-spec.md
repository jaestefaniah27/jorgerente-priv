# Spec — módulo Kanban (v1)

Decisiones cerradas para la primera versión del módulo Kanban (`/kanban`). Ver `docs/decisions/README.md` para el razonamiento detrás de cada una.

## Tableros
- Un tablero por proyecto (MX-5, teclado macro, TFM, PokerPoke, etc.).
- Vista global adicional que agrega tareas de todos los tableros, filtrable por proyecto(s), épica, prioridad.

## Columnas
- Fijas e iguales en todos los tableros: **Backlog / To Do / En progreso / Hecho**. No configurables en v1.
- Backlog es el estado por defecto de una tarea nueva: ahí se apilan antes de entrar en flujo activo. El botón "+ Nueva tarea" (que abre un formulario completo, no un campo suelto) solo aparece en la columna Backlog dentro de un tablero; desde ese formulario se puede marcar la casilla "Enviar directamente a To Do" para saltarse el Backlog en la creación. La vista global tiene su propio botón "+ Nueva tarea" equivalente (con selector de proyecto) que abre el mismo formulario.

## Épicas
- Pertenecen a un proyecto (tablero); una tarea solo puede colgar de una épica de su mismo proyecto.

## Tareas
Campos:
- Título, descripción.
- Épica (opcional, del mismo proyecto).
- Prioridad.
- Estimación de tiempo.
- Registro de tiempo dedicado: entradas manuales tipo worklog de Jira (fecha + horas/minutos), no cronómetro.
- Fecha límite: **opcional**.
- Aviso (recordatorio): **opcional, como mucho uno por tarea**, definido como desplazamiento relativo a la fecha límite (p. ej. "1 día antes", "1 hora antes"). Si se edita la fecha límite, el aviso se recalcula.

Fuera de alcance en v1 (descartado explícitamente): checklist/subtareas, adjuntos.

## Avisos / recordatorios (notificaciones)
- Canal: **Web Push** a la PWA instalada (no email, no solo aviso al abrir la app).
- Requiere: claves VAPID, suscripción push guardada por dispositivo/instalación, y un proceso en el servidor que revise periódicamente qué avisos tocan disparar "ahora" y los envíe.
- Ver detalle técnico e implicaciones de infraestructura en `docs/decisions/README.md` (entrada de fecha límite + avisos) y, cuando se implemente, en `docs/infra.md`.

## Autenticación
- Ninguna — la app es solo para Jorge. Protección, si la hay, a nivel de red/nginx, no de la app.
