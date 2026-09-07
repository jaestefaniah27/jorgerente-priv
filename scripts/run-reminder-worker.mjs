// Unconditional entrypoint for running the reminder worker under a process
// manager (PM2). This is what ecosystem.config.js points PM2 at, kept
// separate from scripts/reminder-worker.mjs so that file can stay a plain,
// side-effect-free module for tests (`import { createWorker } from
// "../scripts/reminder-worker.mjs"`) to import safely.

import { startWorkerLoop } from "./reminder-worker.mjs";

startWorkerLoop();
