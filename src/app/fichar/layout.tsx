import type { Metadata, Viewport } from "next";
import Link from "next/link";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import AppSwitcher from "@/components/AppSwitcher";

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
      {/* Same top band as Kanban, so switching between modules doesn't feel
          like landing in a different product. */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/fichar" className="text-lg font-semibold text-indigo-700">
            jorgerente · Fichar
          </Link>
          <AppSwitcher />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
