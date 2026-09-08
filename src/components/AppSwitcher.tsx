"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AVAILABLE_APPS, currentApp } from "@/lib/apps";

// The four-squares button present in every module: opens a small menu to jump
// to another app without going back to the home page first.
export default function AppSwitcher() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const here = currentApp(pathname);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Cambiar de app"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          open
            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
            : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="currentColor">
          <rect x="0" y="0" width="6.5" height="6.5" rx="1.5" />
          <rect x="9.5" y="0" width="6.5" height="6.5" rx="1.5" />
          <rect x="0" y="9.5" width="6.5" height="6.5" rx="1.5" />
          <rect x="9.5" y="9.5" width="6.5" height="6.5" rx="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {AVAILABLE_APPS.map((app) => {
            const isHere = here?.path === app.path;
            return (
              <Link
                key={app.path}
                href={app.path}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50 ${
                  isHere ? "bg-indigo-50/60" : ""
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${app.accent}`}
                  aria-hidden
                >
                  {app.glyph}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{app.name}</span>
                  <span className="block truncate text-xs text-slate-500">{app.description}</span>
                </span>
                {isHere && (
                  <span className="ml-auto text-xs text-indigo-600" aria-label="app actual">
                    ●
                  </span>
                )}
              </Link>
            );
          })}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="block border-t border-slate-100 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50"
          >
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
