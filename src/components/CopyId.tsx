"use client";

// The copy-to-clipboard control of TraceView (blueprint 6.4): a small accent button beside an id that writes the id
// to the clipboard and says "copied" for a moment (the verified token, the word beside the colour). Where the
// clipboard is unavailable the button stays and the id remains selectable text.
import { useEffect, useState } from "react";
import { cx } from "./cx";
import "./system.css";

export type CopyIdProps = {
  value: string;
  /** What the id is, for the accessible name ("trace id"). */
  label: string;
  className?: string;
};

const COPY = "copy";
const COPIED = "copied";
const SETTLE_MS = 1500;

export function CopyId({ value, label, className }: CopyIdProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      className={cx("copy", className)}
      data-copied={copied ? "true" : "false"}
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? COPIED : COPY}
    </button>
  );
}
