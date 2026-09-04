import type { Metadata } from "next";
import { DesignedState } from "@/components/DesignedState";

export const metadata: Metadata = { title: "Not found" };

// Blueprint 6.3: the designed 404 with a next step.
export default function NotFound() {
  return (
    <DesignedState
      code="404"
      title="No sheet at this address"
      explanation="The address does not resolve to a surface of The Hub. The sheet index on the left lists every surface; a surface whose track has not landed yet resolves here as well."
      next={{ href: "/", label: "Back to Home" }}
    />
  );
}
