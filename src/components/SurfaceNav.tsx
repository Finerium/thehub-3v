"use client";

// The sheet index: the fourteen surfaces of blueprint 6.2 in their inventory order. Most resolve to the designed
// 404 until their tracks land. The current surface carries aria-current; the underline draws on hover and stays
// on the current item.
import Link from "next/link";
import { usePathname } from "next/navigation";

export const SURFACES = [
  { n: "01", name: "Home", href: "/" },
  { n: "02", name: "Ask", href: "/ask" },
  { n: "03", name: "Trace", href: "/trace" },
  { n: "04", name: "Document viewer", href: "/documents" },
  { n: "05", name: "Assets", href: "/assets" },
  { n: "06", name: "Failure Memory", href: "/failures" },
  { n: "07", name: "Coverage Console", href: "/coverage" },
  { n: "08", name: "Drafts", href: "/drafts" },
  { n: "09", name: "Integrity Register", href: "/integrity" },
  { n: "10", name: "Evaluation", href: "/evaluation" },
  { n: "11", name: "Guided loop", href: "/demo/loop" },
  { n: "12", name: "Tour", href: "/tour" },
  { n: "13", name: "Admin", href: "/admin" },
  { n: "14", name: "Auth", href: "/login" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SurfaceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Surfaces" className="index">
      {SURFACES.map((s) => (
        <Link key={s.href} href={s.href} aria-current={isCurrent(pathname, s.href) ? "page" : undefined}>
          <span className="n">{s.n}</span>
          <span className="draw">{s.name}</span>
        </Link>
      ))}
    </nav>
  );
}
