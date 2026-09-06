// Blueprint 6.4 NeumorphicChip: the tactile chip of the four moment templates, the layer toggle and the threshold
// control (7.1: neumorphic treatment for tactile controls only). A button: pressed is :active, active is
// aria-pressed, disabled is disabled; every state carries a second cue beside the shadow (the icon or the label
// and, when active, the filled mark), never shadow alone. With `name` and `value` and no handler it submits a
// plain GET form, so a surface can use it without client script.
import type { ReactNode } from "react";
import { cx } from "./cx";
import "./system.css";

export type NeumorphicChipProps = {
  children: ReactNode;
  /** A glyph rendered beside the label; content, not decoration. */
  icon?: ReactNode;
  /** The selected state (aria-pressed), drawn inset with the filled mark. */
  active?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  name?: string;
  value?: string;
  size?: "sm" | "md";
  onClick?: () => void;
  className?: string;
  "aria-label"?: string;
  "aria-controls"?: string;
};

export function NeumorphicChip({
  children,
  icon,
  active,
  disabled,
  type = "button",
  name,
  value,
  size = "md",
  onClick,
  className,
  ...aria
}: NeumorphicChipProps) {
  return (
    <button
      type={type}
      name={name}
      value={value}
      className={cx("neu", className)}
      data-size={size}
      data-component="neumorphic-chip"
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onClick={onClick}
      {...aria}
    >
      {icon ? (
        <span className="neu-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
      {active ? <span className="neu-mark" aria-hidden /> : null}
    </button>
  );
}
