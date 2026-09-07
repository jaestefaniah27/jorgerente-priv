import type { Metadata, Viewport } from "next";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import KanbanNav from "@/components/KanbanNav";

export const metadata: Metadata = {
  title: "Kanban — jorgerente",
  description: "Tablero Kanban personal de Jorge",
  manifest: "/kanban/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Kanban",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/kanban/icon-192.png",
    apple: "/kanban/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function KanbanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <ServiceWorkerRegister />
      <KanbanNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
