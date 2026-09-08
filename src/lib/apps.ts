// The one list of modules. The home page, the app switcher and anything else
// that needs to know what exists all read from here, so adding a module means
// touching a single file.

export interface AppModule {
  /** Path the module lives at; also its service worker scope and PWA id. */
  path: string;
  name: string;
  description: string;
  /** Tailwind classes for the tile's accent. */
  accent: string;
  /** Single glyph used on the home tiles and in the switcher. */
  glyph: string;
  available: boolean;
}

export const APPS: AppModule[] = [
  {
    path: "/kanban",
    name: "Kanban",
    description: "Proyectos, tareas y épicas",
    accent: "bg-indigo-500",
    glyph: "▦",
    available: true,
  },
  {
    path: "/fichar",
    name: "Fichar",
    description: "Jornada laboral y descansos",
    accent: "bg-emerald-500",
    glyph: "◷",
    available: true,
  },
  {
    path: "/docs",
    name: "Docs",
    description: "Documentación estilo Confluence",
    accent: "bg-slate-400",
    glyph: "▤",
    available: false,
  },
];

export const AVAILABLE_APPS = APPS.filter((a) => a.available);

// "/kanban/board/3" belongs to "/kanban". Matching on a path segment rather
// than a prefix so a future "/kanbanX" wouldn't be mistaken for it.
export function currentApp(pathname: string): AppModule | undefined {
  return APPS.find((a) => pathname === a.path || pathname.startsWith(`${a.path}/`));
}
