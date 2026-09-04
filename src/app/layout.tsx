import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/components/AppShell";
import { cx } from "@/components/cx";
import { display, mono, sans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s | ${PRODUCT_NAME}` },
  description:
    "A manufacturing knowledge hub for CALIBER 2026 Case 1: answers with evidence packets, abstains when the corpus cannot answer, and measures the failure knowledge that was never written down.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

// ARCHITECTURE 1.1: html, the three faces and a body on paper, nothing else. The shell (rail, sheet, title block)
// is drawn by src/app/(hub)/layout.tsx behind requireSession(); /login, the designed 404 and error.tsx render
// bare on this paper.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cx(display.variable, sans.variable, mono.variable)}>
      <body className="bg-paper">{children}</body>
    </html>
  );
}
