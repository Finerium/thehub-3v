// The app chrome: the rail (brand, sheet index, role badge), the sheet (main), the title block (footer). Server
// component drawn by src/app/(hub)/layout.tsx, which passes the session it required.
import type { ReactNode } from "react";
import type { Role } from "@/contracts/generated/serving";
import { RoleBadge } from "./RoleBadge";
import { SurfaceNav } from "./SurfaceNav";

export const PRODUCT_NAME = "The Hub";
export const FOOTER_LINE = "Unlisted deployment. The corpus is the organiser's property.";

type Props = {
  children: ReactNode;
  /** Short commit hash of the running build when the platform provides one. */
  commit: string | null;
  /** The signed-in session's alias and role, rendered on the rail's badge. */
  session: { alias: string; role: Role };
};

export function AppShell({ children, commit, session }: Props) {
  return (
    <div className="shell">
      <aside className="rail">
        <div>
          <p className="font-display text-[22px] font-semibold tracking-tight text-ink-900" style={{ fontVariationSettings: '"opsz" 24' }}>
            {PRODUCT_NAME}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-ink-500">Manufacturing knowledge hub, Case 1. Evidence or abstention.</p>
        </div>
        <SurfaceNav />
        <div className="mt-auto flex flex-col gap-2 border-t border-edge pt-4">
          <RoleBadge alias={session.alias} role={session.role} />
        </div>
      </aside>
      <div className="sheet">
        <main>{children}</main>
        <footer className="titleblock">
          <span>{FOOTER_LINE}</span>
          <span className="text-ink-500">{commit ? `commit ${commit}` : "local build"}</span>
        </footer>
      </div>
    </div>
  );
}
