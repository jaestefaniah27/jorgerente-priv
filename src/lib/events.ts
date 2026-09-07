// Tiny window-event bus so independent client components (the nav's
// project list, the global view) stay in sync without introducing a state
// management library for one signal.
export const PROJECTS_CHANGED_EVENT = "kanban:projects-changed";

export function emitProjectsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
  }
}
