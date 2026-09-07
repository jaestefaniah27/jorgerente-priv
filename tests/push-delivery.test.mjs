// End-to-end test of the actual Web Push delivery mechanics (VAPID JWT
// signing + payload encryption via the `web-push` library), without
// depending on a real push service: we run a tiny local HTTP server that
// stands in for one, and verify the request web-push sends it looks like a
// real push (right headers, sends successfully, propagates a 410 as
// "expired" so the caller can prune the subscription).
//
// This is the piece that can't be exercised by hitting our own HTTP API
// (that only covers storing a subscription, not actually pushing to it),
// so it's a separate script.

import https from "node:https";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import webpush from "web-push";

// web-push always speaks HTTPS (it hardcodes Node's `https` module), so the
// fake push endpoint below needs a real, if self-signed, TLS cert.
function makeSelfSignedCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "push-test-cert-"));
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  execFileSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "1",
    "-nodes",
    "-subj",
    "/CN=localhost",
  ]);
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

// Mirrors src/lib/push.ts's sendPushToSubscription. Reimplemented here
// (rather than imported) because this plain-Node test doesn't run through
// the Next.js/TypeScript toolchain — see scripts/reminder-worker.mjs for
// the same tradeoff, made for the same reason.
async function sendPushToSubscription(sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (err) {
    const statusCode = err && typeof err === "object" ? err.statusCode : undefined;
    if (statusCode === 404 || statusCode === 410) return { ok: false, expired: true };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

let passed = 0;
let failed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
    console.error(`✗ ${msg}`);
  }
}

function makeFakeSubscriptionKeys() {
  const { publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const rawPoint = publicKey.export({ type: "spki", format: "der" }).subarray(-65); // uncompressed EC point
  const p256dh = Buffer.from(rawPoint).toString("base64url");
  const auth = crypto.randomBytes(16).toString("base64url");
  return { p256dh, auth };
}

const TLS_OPTS = makeSelfSignedCert();

function startFakeEndpoint(responseStatus) {
  return new Promise((resolve) => {
    const chunks = [];
    let capturedHeaders = null;
    const server = https.createServer(TLS_OPTS, (req, res) => {
      capturedHeaders = req.headers;
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        res.statusCode = responseStatus;
        res.end();
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        url: `https://127.0.0.1:${port}/push`,
        getHeaders: () => capturedHeaders,
        getBody: () => Buffer.concat(chunks),
      });
    });
  });
}

async function main() {
  // Self-signed test cert; scoped to this standalone test process only.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  webpush.setVapidDetails(
    "mailto:test@example.com",
    "BNQQL0RS6fLUKxxRrGJNLNfXewmLv-VMbH2LQ_i8BV0-y1EX5Ndgmq170OhdN1s-WO3_8b1_-10M5HXL93VtGpU",
    "-f4g-L-EvN-9rLAQQsWMcxs5DC_OXcZiFy_Cmgq4xsQ"
  );

  // --- Successful delivery -------------------------------------------
  {
    const endpoint = await startFakeEndpoint(201);
    const { p256dh, auth } = makeFakeSubscriptionKeys();
    const result = await sendPushToSubscription(
      { id: 1, endpoint: endpoint.url, p256dh, auth },
      { title: "Vence: prueba", body: "cuerpo del aviso", url: "/kanban" }
    );
    ok(result.ok === true, `delivery reports ok (got ${JSON.stringify(result)})`);

    const headers = endpoint.getHeaders();
    ok(
      String(headers["content-encoding"]).includes("aes128gcm"),
      `request is encrypted with aes128gcm (got ${headers["content-encoding"]})`
    );
    ok(String(headers["authorization"] || "").startsWith("vapid"), "request carries a VAPID Authorization header");
    ok(endpoint.getBody().length > 0, "encrypted payload body was actually sent");
    endpoint.server.close();
  }

  // --- Expired subscription (410) is reported so caller can prune it ----
  {
    const endpoint = await startFakeEndpoint(410);
    const { p256dh, auth } = makeFakeSubscriptionKeys();
    const result = await sendPushToSubscription(
      { id: 2, endpoint: endpoint.url, p256dh, auth },
      { title: "x", body: "y" }
    );
    ok(result.ok === false && result.expired === true, `410 is reported as expired (got ${JSON.stringify(result)})`);
    endpoint.server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFailures:\n" + failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
