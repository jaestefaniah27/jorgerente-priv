import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, handle } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
      throw new ApiError(400, "Suscripción push inválida");
    }
    db.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
       VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
    ).run(endpoint, p256dh, auth);
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    const endpoint = body?.endpoint;
    if (typeof endpoint !== "string") throw new ApiError(400, "Falta el endpoint");
    db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
    return NextResponse.json({ ok: true });
  });
}
