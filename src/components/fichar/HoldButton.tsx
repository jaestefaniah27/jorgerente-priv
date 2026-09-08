"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const REWIND_MS = 150;

export type HoldVariant = "in" | "out" | "break" | "breakActive";

const VARIANTS: Record<HoldVariant, { button: string; ring: string }> = {
  in: { button: "bg-indigo-600 text-white hover:bg-indigo-500", ring: "#c7d2fe" },
  out: { button: "bg-slate-800 text-white hover:bg-slate-700", ring: "#94a3b8" },
  break: { button: "border-2 border-amber-400 bg-white text-amber-700 hover:bg-amber-50", ring: "#f59e0b" },
  breakActive: { button: "bg-amber-500 text-white hover:bg-amber-400", ring: "#fde68a" },
};

// Press-and-hold button: a progress ring traces the border while held, and the
// action only fires once it completes. Guards against a pocket tap doing
// something consequential, which a plain button can't.
export default function HoldButton({
  label,
  onComplete,
  holdMs = 2000,
  variant = "in",
  disabled = false,
  size = "lg",
}: {
  label: string;
  // Receives how long ago the press started, so the server can record the
  // action at the moment the press began rather than when the hold finished.
  onComplete: (pressedMsAgo: number) => void;
  holdMs?: number;
  variant?: HoldVariant;
  disabled?: boolean;
  size?: "lg" | "md";
}) {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => stopRaf, [stopRaf]);

  // Rewinding rather than snapping to zero makes an aborted press feel like a
  // deliberate cancel instead of a glitch.
  const rewind = useCallback(() => {
    stopRaf();
    startRef.current = null;
    const from = progressRef.current;
    if (from === 0) return;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / REWIND_MS);
      const value = from * (1 - k);
      progressRef.current = value;
      setProgress(value);
      if (k < 1) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(step);
  }, [stopRaf]);

  const begin = useCallback(() => {
    if (disabled) return;
    stopRaf();
    firedRef.current = false;
    startRef.current = performance.now();
    const step = (t: number) => {
      if (startRef.current === null) return;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / holdMs);
      progressRef.current = p;
      setProgress(p);
      if (p >= 1) {
        firedRef.current = true;
        startRef.current = null;
        rafRef.current = null;
        if (typeof navigator !== "undefined") navigator.vibrate?.(30);
        onComplete(Math.round(elapsed));
        // Leave the ring full for a beat, then clear it.
        window.setTimeout(() => {
          progressRef.current = 0;
          setProgress(0);
        }, 120);
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [disabled, holdMs, onComplete, stopRaf]);

  const end = useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false;
      startRef.current = null;
      return;
    }
    rewind();
  }, [rewind]);

  const styles = VARIANTS[variant];
  const pad = size === "lg" ? "px-10 py-5 text-lg" : "px-6 py-3 text-sm";

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        // Without this, a long press on iOS Safari opens the callout menu and
        // selects the button's text mid-hold.
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        begin();
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      onContextMenu={(e) => e.preventDefault()}
      // A hold guards against accidental taps; with a keyboard that risk
      // doesn't exist, so Enter/Space act immediately.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!disabled) onComplete(0);
        }
      }}
      style={{ touchAction: "none", WebkitTouchCallout: "none", userSelect: "none" }}
      className={`relative select-none rounded-full font-semibold shadow-sm transition-colors disabled:opacity-50 ${styles.button} ${pad}`}
    >
      {/* pathLength normalises the outline to 1 so the ring fills correctly at
          any button size, with no measuring. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          rx="9999"
          ry="9999"
          fill="none"
          stroke={styles.ring}
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - progress}
          opacity={progress > 0 ? 1 : 0}
        />
      </svg>
      {label}
    </button>
  );
}
