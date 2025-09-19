import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Lapidatto Next Template",
  description: "Base Next.js para geração automática de projetos Lapidatto.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-surface text-foreground antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-6 py-16">
          {children}
        </main>
      </body>
    </html>
  );
}
