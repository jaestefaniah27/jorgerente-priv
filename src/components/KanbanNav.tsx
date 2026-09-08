"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import NotificationsToggle from "./NotificationsToggle";
import type { Project } from "@/lib/types";
import { PROJECTS_CHANGED_EVENT } from "@/lib/events";

export default function KanbanNav() {
  const [projects, setProjects] = useState<Project[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    function refetch() {
      fetch("/api/kanban/projects")
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setProjects(data.projects ?? []);
        })
        .catch(() => {});
    }
    refetch();
    window.addEventListener(PROJECTS_CHANGED_EVENT, refetch);
    return () => {
      cancelled = true;
      window.removeEventListener(PROJECTS_CHANGED_EVENT, refetch);
    };
  }, [pathname]);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <Link href="/kanban" className="text-lg font-semibold text-indigo-700">
          jorgerente · Kanban
        </Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/kanban"
            className={`rounded-full px-3 py-1 ${
              pathname === "/kanban"
                ? "bg-indigo-100 font-semibold text-indigo-700"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Vista global
          </Link>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/kanban/board/${p.id}`}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${
                pathname === `/kanban/board/${p.id}`
                  ? "bg-indigo-100 font-semibold text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <NotificationsToggle />
        </div>
      </div>
    </header>
  );
}
