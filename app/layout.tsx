import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BetMind AI — Football Intelligence",
  description: "Data-driven football match insights, fixture tracking and transparent prediction analytics.",
  applicationName: "BetMind AI",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#080d18",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
