import "./globals.css";
import type { ReactNode } from "react";
import { Roboto, Roboto_Mono } from "next/font/google";
import { brand } from "@/lib/brand";

/** Material Design default UI typeface */
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

/** Material Design monospace for identifiers and code */
const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto-mono",
  display: "swap",
});

export const metadata = {
  title: brand.name,
  description: "Manufacturing intelligence and action platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${roboto.variable} ${robotoMono.variable}`}>
      <body style={{ ["--accent" as string]: brand.accent }}>{children}</body>
    </html>
  );
}
