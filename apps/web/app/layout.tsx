import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Daftar",
  description: "Daftar finance workspace"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={`${sans.variable} ${mono.variable}`} lang="en">
      <body>{children}</body>
    </html>
  );
}
