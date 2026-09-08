"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const REWIND_MS = 150;

export type HoldVariant = "in" | "out" | "break" | "breakActive";

// The ring is drawn OUTSIDE the button, so its colour has to contrast with the
// page background rather than with the button fill — that way it reads the
// same whichever variant is on screen.
const VARIANTS: Record<HoldVariant, { button: string; ring: string }> = {
  in: { button: "bg-indigo-600 text-white hover:bg-indigo-500", ring: "#4f46e5" },
  out: { button: "bg-slate-800 text-white hover:bg-slate-700", ring: "#334155" },
  break: { button: "border-2 border-amber-400 bg-white text-amber-700 hover:bg-amber-50", ring: "#f59e0b" },
  breakActive: { button: "bg-amber-500 text-white hover:bg-amber-400", ring: "#d97706" },
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
  // Fixed square boxes, so rounded-full gives a true circle rather than a pill.
  const box = size === "lg" ? "h-40 w-40 text-base" : "h-32 w-32 text-sm";

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
      className={`relative flex select-none items-center justify-center rounded-full px-4 text-center font-semibold leading-tight shadow-sm transition-colors disabled:opacity-50 ${styles.button} ${box}`}
    >
      {/* The button box is square, so a 0 0 100 100 viewBox maps to it without
          distortion and the ring is a real circle. r > 50 puts it just outside
          the button (hence overflow-visible), where it reads clearly instead of
          washing out against the fill. pathLength normalises the circumference
          to 1, so the fill works at any size with no measuring, and the
          rotation starts it at twelve o'clock. */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="pointer-events-none absolute inset-0 h-full w-full -rotate-90 overflow-visible"
      >
        {progress > 0 && (
          // Faint full circle behind the arc, so how much is left is visible.
          <circle cx="50" cy="50" r="54" fill="none" stroke={styles.ring} strokeWidth="4" opacity="0.2" />
        )}
        <circle
          cx="50"
          cy="50"
          r="54"
          fill="none"
          stroke={styles.ring}
          strokeWidth="4"
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
