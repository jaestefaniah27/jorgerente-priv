import { NextResponse } from "next/server";
import { handle } from "@/lib/api-helpers";

export async function GET() {
  return handle(async () => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return NextResponse.json({ publicKey: null, enabled: false });
    }
    return NextResponse.json({ publicKey, enabled: true });
  });
}
