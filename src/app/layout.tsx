import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SiteHunter AI", template: "%s · SiteHunter AI" },
  description: "Prospecção automatizada e demonstrações de sites.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#070b14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
