"use client";

// Blueprint 6.3: the designed 5xx. An error thrown below the root layout lands here, bare on paper. Next.js hands
// a client boundary a message-stripped error in production; this page renders neither message nor stack, only
// the digest that names the event in the server log. The one next step re-renders the failed segment.
import type { CSSProperties } from "react";
import { DesignedState } from "@/components/DesignedState";

const CODE = "500";
const TITLE = "This sheet could not be drawn";
const EXPLANATION =
  "Something failed while the surface was rendered, and nothing is shown in its place. The reference below, when one is shown, names the event in the server log.";
const DIGEST_LABEL = "digest";
const TRY_AGAIN = "Try again";

type Props = { error: Error & { digest?: string }; reset: () => void };

export default function ErrorPage({ error, reset }: Props) {
  return (
    <DesignedState
      code={CODE}
      tone="defect"
      title={TITLE}
      explanation={EXPLANATION}
      reason={error.digest ? `${DIGEST_LABEL} ${error.digest}` : undefined}
    >
      <p className="rise mt-6" style={{ "--i": 4 } as CSSProperties}>
        <button type="button" className="neu cursor-pointer" onClick={reset}>
          {TRY_AGAIN}
          <span aria-hidden className="mono">&rarr;</span>
        </button>
      </p>
    </DesignedState>
  );
}
