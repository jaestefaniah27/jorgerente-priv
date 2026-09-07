import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "jorgerente",
  description: "App personal de Jorge: Kanban + documentación",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
