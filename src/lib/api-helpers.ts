import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function handle(fn: () => Promise<NextResponse> | NextResponse) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonError(err.status, err.message);
    }
    console.error(err);
    return jsonError(500, "Error interno");
  }
}

export function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, `El campo "${field}" es obligatorio`);
  }
  return value.trim();
}

export function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  if (value == null) return undefined;
  if (typeof value !== "string") throw new ApiError(400, `El campo "${field}" debe ser texto`);
  return value;
}

export function optionalNumber(body: Record<string, unknown>, field: string): number | null | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new ApiError(400, `El campo "${field}" debe ser numérico`);
  return n;
}

export function parseIdParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, "Id inválido");
  }
  return id;
}
