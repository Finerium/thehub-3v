"use client";

// Blueprint 6.4 GlassDrawer: the glass call-out a citation chip opens into, at the right edge over a scrim. A native
// modal dialog carries the platform's focus trap (everything outside is inert), closes on Escape, and returns focus
// to the element that opened it; the component only mirrors `open` onto the element and reports `close`. The
// short scale-and-fade of 7.2 is in system.css (dialog.drawer[open]).
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "./cx";
import "./system.css";

export type GlassDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** A line under the title: the document id, the span id, whatever names the call-out. */
  subtitle?: ReactNode;
  width?: "md" | "lg";
  id?: string;
  className?: string;
};

const CLOSE_LABEL = "Close";

export function GlassDrawer({ open, onClose, title, subtitle, children, width = "md", id, className }: GlassDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      id={id}
      className={cx("drawer glass", className)}
      data-width={width}
      data-component="glass-drawer"
      onClose={onClose}
      onClick={(event) => {
        // A click on the scrim lands on the dialog element itself; a click inside lands on a child.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="drawer-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="mono mt-1 text-[12px] text-ink-700">{subtitle}</p> : null}
        </div>
        <button type="button" className="neu drawer-close" data-size="sm" onClick={() => ref.current?.close()}>
          {CLOSE_LABEL}
          <span aria-hidden className="mono">
            esc
          </span>
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </dialog>
  );
}
