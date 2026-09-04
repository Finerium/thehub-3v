import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, PRODUCT_NAME } from "@/components/AppShell";
import { cx } from "@/components/cx";
import { display, mono, sans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s | ${PRODUCT_NAME}` },
  description:
    "A manufacturing knowledge hub for CALIBER 2026 Case 1: answers with evidence packets, abstains when the corpus cannot answer, and measures the failure knowledge that was never written down.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  return (
    <html lang="en" className={cx(display.variable, sans.variable, mono.variable)}>
      <body>
        <AppShell commit={commit}>{children}</AppShell>
      </body>
    </html>
  );
}
