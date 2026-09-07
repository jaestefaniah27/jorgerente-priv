// PM2 process definitions for the Kanban app and its reminder worker.
//
// Both explicitly use the nvm-installed Node 20 binary (Next.js 16 requires
// Node >=20.9, but this server's system-wide default Node used by the other
// PM2 apps is 18.19.1 — see docs/infra.md). Only these two processes use
// Node 20; nothing about the system default changes.
//
// Secrets (VAPID_* keys) and KANBAN_DB_PATH/PORT live in .env (gitignored,
// never committed). This file loads them at PM2-start time so both the
// Next.js server (which also auto-loads .env on its own) and the plain
// Node reminder-worker script (which does not) receive the same values.

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

const fileEnv = loadEnvFile(path.join(__dirname, ".env"));
const NODE20 = `${process.env.HOME}/.nvm/versions/node/v20.20.2/bin/node`;

module.exports = {
  apps: [
    {
      name: "jorgerente",
      cwd: __dirname,
      script: "node_modules/.bin/next",
      args: "start -p 8092",
      interpreter: NODE20,
      env: { NODE_ENV: "production", ...fileEnv },
    },
    {
      name: "jorgerente-reminders",
      cwd: __dirname,
      script: "scripts/run-reminder-worker.mjs",
      interpreter: NODE20,
      env: { NODE_ENV: "production", ...fileEnv },
    },
  ],
};
