// The role badge of the shell: the signed-in alias and role, or the Reviewer mode wording when a reviewer session
// renders (not built in this run, D-07). The (hub) layout passes the session it required, so there is no unsigned
// state to draw.
import type { Role } from "@/contracts/generated/serving";
import { StatusBadge } from "./StatusBadge";

type Props = {
  alias: string;
  role: Role;
  reviewer?: boolean;
};

export function RoleBadge({ alias, role, reviewer }: Props) {
  if (reviewer) return <StatusBadge kind="reviewer_mode" />;
  return (
    <span className="badge" data-tone="accent" data-role={role}>
      {role}
      <span className="mono font-normal text-ink-700">{alias}</span>
    </span>
  );
}
