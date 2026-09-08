"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { msToClock, msToShort } from "@/lib/format";
import {
  sessionTotals,
  sumTotals,
  ZERO_TOTALS,
  type Totals,
  type WorkSession,
} from "@/lib/fichar";
import HoldButton from "./HoldButton";
import HistoryModal from "./HistoryModal";

export interface ClockState {
  session: WorkSession | null;
  todayClosed: Totals;
  weekClosed: Totals;
  todayDate: string;
  weekStart: string;
  hasAutoClosed: boolean;
}

type CounterKey = "oficina" | "descanso" | "efectivo";

const COUNTERS: { key: CounterKey; label: string; pick: (t: Totals) => number }[] = [
  { key: "oficina", label: "Oficina", pick: (t) => t.officeMs },
  { key: "descanso", label: "Descanso", pick: (t) => t.breakMs },
  { key: "efectivo", label: "Efectivo", pick: (t) => t.effectiveMs },
];

const STORAGE_KEY = "fichar:bigCounter";

// Which counter is shown big is a per-viewer convenience, so it lives in
// localStorage rather than the database. Exposed through useSyncExternalStore
// so the server renders the default and the client swaps in the stored value
// without a hydration mismatch.
let listeners: (() => void)[] = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function getStoredCounter(): CounterKey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "oficina" || raw === "descanso" || raw === "efectivo") return raw;
  } catch {
    // private mode can throw; the default is fine
  }
  return "efectivo";
}

const getServerCounter = (): CounterKey => "efectivo";

function storeCounter(key: CounterKey) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // not worth surfacing
  }
  listeners.forEach((l) => l());
}

export default function ClockPage({ initial }: { initial: ClockState }) {
  const [state, setState] = useState<ClockState>(initial);
  const [now, setNow] = useState(() => Date.now());
  const big = useSyncExternalStore(subscribe, getStoredCounter, getServerCounter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/fichar/state");
    if (res.ok) setState(await res.json());
  }, []);

  // Clocking in from the phone and then opening the laptop shouldn't show a
  // stale screen.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const live = state.session ? sessionTotals(state.session, now) : ZERO_TOTALS;
  const today = useMemo(() => sumTotals([state.todayClosed, live]), [state.todayClosed, live]);
  const week = useMemo(() => sumTotals([state.weekClosed, live]), [state.weekClosed, live]);

  const onBreak = Boolean(state.session?.breaks.some((b) => b.ended_at === null));

  // The UI is updated the moment the hold completes and the request travels in
  // parallel, so no wait is ever perceived. The server's answer then replaces
  // the guess — and on failure it corrects it.
  async function act(path: string, pressedMsAgo: number, optimistic: (s: ClockState) => ClockState) {
    setError(null);
    setBusy(true);
    setState(optimistic);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pressed_ms_ago: pressedMsAgo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se pudo registrar");
      }
    } catch {
      setError("Sin conexión con el servidor");
    } finally {
      await refresh().catch(() => {});
      setBusy(false);
    }
  }

  function clockIn(pressedMsAgo: number) {
    const startedAt = new Date(Date.now() - pressedMsAgo).toISOString();
    act("/api/fichar/clock-in", pressedMsAgo, (s) => ({
      ...s,
      session: {
        id: -1,
        started_at: startedAt,
        ended_at: null,
        local_date: s.todayDate,
        auto_closed: 0,
        breaks: [],
      },
    }));
  }

  function clockOut(pressedMsAgo: number) {
    const endedAt = new Date(Date.now() - pressedMsAgo).toISOString();
    act("/api/fichar/clock-out", pressedMsAgo, (s) => {
      if (!s.session) return s;
      const finished: WorkSession = {
        ...s.session,
        ended_at: endedAt,
        breaks: s.session.breaks.map((b) => (b.ended_at ? b : { ...b, ended_at: endedAt })),
      };
      const totals = sessionTotals(finished, Date.parse(endedAt));
      return {
        ...s,
        session: null,
        todayClosed: sumTotals([s.todayClosed, totals]),
        weekClosed: sumTotals([s.weekClosed, totals]),
      };
    });
  }

  function startBreak(pressedMsAgo: number) {
    const startedAt = new Date(Date.now() - pressedMsAgo).toISOString();
    act("/api/fichar/break/start", pressedMsAgo, (s) =>
      s.session
        ? {
            ...s,
            session: {
              ...s.session,
              breaks: [
                ...s.session.breaks,
                { id: -1, session_id: s.session.id, started_at: startedAt, ended_at: null },
              ],
            },
          }
        : s
    );
  }

  function stopBreak(pressedMsAgo: number) {
    const endedAt = new Date(Date.now() - pressedMsAgo).toISOString();
    act("/api/fichar/break/stop", pressedMsAgo, (s) =>
      s.session
        ? {
            ...s,
            session: {
              ...s.session,
              breaks: s.session.breaks.map((b) => (b.ended_at ? b : { ...b, ended_at: endedAt })),
            },
          }
        : s
    );
  }

  const bigCounter = COUNTERS.find((c) => c.key === big) ?? COUNTERS[2];

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-6">
      {state.hasAutoClosed && (
        <button
          onClick={() => setHistoryOpen(true)}
          className="mb-5 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-800 hover:bg-amber-100"
        >
          Alguna jornada se cerró sola a medianoche. Revísala en el historial.
        </button>
      )}

      {/* The three counters double as the picker for the big one. */}
      <div className="grid w-full grid-cols-3 gap-2">
        {COUNTERS.map((c) => {
          const selected = c.key === big;
          const isBreak = c.key === "descanso";
          return (
            <button
              key={c.key}
              onClick={() => storeCounter(c.key)}
              aria-pressed={selected}
              className={`rounded-xl border px-2 py-2.5 text-center transition-colors ${
                selected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"
              } ${isBreak && onBreak ? "ring-2 ring-amber-300" : ""}`}
            >
              <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {c.label}
              </span>
              <span className="mt-0.5 block text-sm font-semibold tabular-nums text-slate-900">
                {msToShort(c.pick(today))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          {bigCounter.label}
        </p>
        <p className="mt-1 text-6xl font-semibold tabular-nums text-slate-900 sm:text-7xl">
          {msToClock(bigCounter.pick(today))}
        </p>
        {onBreak && <p className="mt-2 text-sm font-medium text-amber-600">En descanso</p>}
      </div>

      {/* Roomy gap: the progress ring is drawn outside each button. */}
      <div className="mt-9 flex flex-col items-center gap-7">
        {state.session ? (
          <HoldButton
            label="Fichar salida"
            variant="out"
            disabled={busy}
            onComplete={clockOut}
          />
        ) : (
          <HoldButton label="Fichar entrada" variant="in" disabled={busy} onComplete={clockIn} />
        )}

        {state.session && (
          <HoldButton
            label={onBreak ? "Terminar descanso" : "Descanso"}
            variant={onBreak ? "breakActive" : "break"}
            size="md"
            disabled={busy}
            onComplete={onBreak ? stopBreak : startBreak}
          />
        )}
        <p className="text-xs text-slate-400">Mantén pulsado 2 segundos</p>
      </div>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      <div className="mt-10 w-full border-t border-slate-200 pt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Esta semana
        </p>
        <div className="grid grid-cols-3 gap-2">
          {COUNTERS.map((c) => (
            <div key={c.key} className="rounded-lg bg-slate-100 px-2 py-2 text-center">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {c.label}
              </span>
              <span className="mt-0.5 block text-sm font-semibold tabular-nums text-slate-800">
                {msToShort(c.pick(week))}
              </span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setHistoryOpen(true)}
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
        >
          Historial
        </button>
      </div>

      {historyOpen && (
        <HistoryModal
          initialWeekStart={state.weekStart}
          onClose={() => {
            setHistoryOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
