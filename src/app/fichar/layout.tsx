import type { Metadata, Viewport } from "next";
import Link from "next/link";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Fichar — jorgerente",
  description: "Registro de jornada laboral de Jorge",
  manifest: "/fichar/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Fichar",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/fichar/icon-192.png",
    apple: "/fichar/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function FicharLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <ServiceWorkerRegister basePath="/fichar" />
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">Fichar</span>
          <Link href="/kanban" className="text-sm text-slate-500 hover:text-indigo-700">
            Kanban →
          </Link>
        </div>
      </nav>
      <main className="flex-1">{children}</main>
    </div>
  );
}
