import Link from "next/link";
import { APPS } from "@/lib/apps";

export const metadata = {
  title: "jorgerente",
  description: "Apps personales de Jorge",
};

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-slate-900">jorgerente</h1>
        <p className="mt-1 text-sm text-slate-500">Tus apps personales.</p>

        <div className="mt-7 grid gap-3">
          {APPS.map((app) =>
            app.available ? (
              <Link
                key={app.path}
                href={app.path}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300"
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-white ${app.accent}`}
                  aria-hidden
                >
                  {app.glyph}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{app.name}</span>
                  <span className="block text-sm text-slate-500">{app.description}</span>
                </span>
                <span aria-hidden className="ml-auto text-slate-300">
                  →
                </span>
              </Link>
            ) : (
              // Shown but not linked: it's on the roadmap, and a dead tile is
              // clearer than pretending the module doesn't exist.
              <div
                key={app.path}
                className="flex items-center gap-4 rounded-xl border border-dashed border-slate-200 p-4 opacity-60"
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-white ${app.accent}`}
                  aria-hidden
                >
                  {app.glyph}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-700">{app.name}</span>
                  <span className="block text-sm text-slate-500">{app.description}</span>
                </span>
                <span className="ml-auto text-xs text-slate-400">próximamente</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
