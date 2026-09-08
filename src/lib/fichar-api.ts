// Shared helpers for the /api/fichar routes.

import type { NextRequest } from "next/server";
import { ApiError } from "./api-helpers";
import { addDays, compensatedNow, localDate } from "./fichar";
import { getSessionsBetween } from "./fichar-db";

// The clock buttons are press-and-hold and post `{ pressed_ms_ago }` so the
// action is recorded at the instant the press started. The body is optional
// (and absent bodies make req.json() throw), so this never rejects: an
// unusable value simply means "now".
export async function pressInstant(req: NextRequest): Promise<string> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const pressed =
    body && typeof body === "object" ? (body as Record<string, unknown>).pressed_ms_ago : undefined;
  return compensatedNow(pressed);
}

// Never let press compensation push an instant before the thing it belongs
// to — a hold started right after clocking in would otherwise close the
// session before it opened.
export function notBefore(instant: string, floor: string): string {
  return Date.parse(instant) < Date.parse(floor) ? floor : instant;
}

export function parseInstant(value: string, label = "Fecha inválida"): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new ApiError(400, label);
  return new Date(ms).toISOString();
}

export function assertOrder(startedAt: string, endedAt: string | null, message: string) {
  if (endedAt && Date.parse(endedAt) <= Date.parse(startedAt)) {
    throw new ApiError(400, message);
  }
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Checked in JS rather than SQL: open-ended intervals (ended_at NULL means
// "still running") are far easier to reason about as Infinity than as a
// three-way SQL condition.
export function assertNoSessionOverlap(id: number, startedAt: string, endedAt: string | null) {
  const from = addDays(localDate(startedAt), -1);
  const to = addDays(localDate(endedAt ?? startedAt), 1);
  const aStart = Date.parse(startedAt);
  const aEnd = endedAt ? Date.parse(endedAt) : Number.POSITIVE_INFINITY;

  for (const other of getSessionsBetween(from, to)) {
    if (other.id === id) continue;
    const bStart = Date.parse(other.started_at);
    const bEnd = other.ended_at ? Date.parse(other.ended_at) : Number.POSITIVE_INFINITY;
    if (overlaps(aStart, aEnd, bStart, bEnd)) {
      throw new ApiError(400, "Se solapa con otra jornada");
    }
  }
}

export function assertBreakFits(
  breakId: number,
  session: { started_at: string; ended_at: string | null; breaks: { id: number; started_at: string; ended_at: string | null }[] },
  startedAt: string,
  endedAt: string | null
) {
  const sStart = Date.parse(session.started_at);
  const sEnd = session.ended_at ? Date.parse(session.ended_at) : Number.POSITIVE_INFINITY;
  const aStart = Date.parse(startedAt);
  const aEnd = endedAt ? Date.parse(endedAt) : Number.POSITIVE_INFINITY;

  if (aStart < sStart || aEnd > sEnd) {
    throw new ApiError(400, "El descanso queda fuera de la jornada");
  }

  for (const other of session.breaks) {
    if (other.id === breakId) continue;
    const bStart = Date.parse(other.started_at);
    const bEnd = other.ended_at ? Date.parse(other.ended_at) : Number.POSITIVE_INFINITY;
    if (overlaps(aStart, aEnd, bStart, bEnd)) {
      throw new ApiError(400, "Se solapa con otro descanso");
    }
  }
}
