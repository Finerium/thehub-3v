// The role badge slot of the shell: the signed-in alias and role, or the Reviewer mode wording when a reviewer
// session renders (not built in this run, D-07). The auth track passes the session; without one the slot says so.
import type { Role } from "@/contracts/generated/serving";
import { StatusBadge } from "./StatusBadge";

type Props = {
  alias?: string;
  role?: Role;
  reviewer?: boolean;
};

export function RoleBadge({ alias, role, reviewer }: Props) {
  if (reviewer) return <StatusBadge kind="reviewer_mode" />;
  if (!role) {
    return (
      <span className="badge" data-tone="neutral">
        No session
      </span>
    );
  }
  return (
    <span className="badge" data-tone="accent" data-role={role}>
      {role}
      {alias ? <span className="mono font-normal text-ink-700">{alias}</span> : null}
    </span>
  );
}
