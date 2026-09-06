// Blueprint 6.4 LayerToggle: generous and strict as two neumorphic chips, the selected one pressed with its mark.
// With `onChange` it is a client control; without it the chips submit `name=layer` in the surrounding GET form,
// so the Coverage Console can carry the layer in the URL with no client script.
import type { CoverageSummary } from "@/contracts/generated/coverage";
import { cx } from "./cx";
import { NeumorphicChip } from "./NeumorphicChip";
import "./system.css";

export type CoverageLayer = CoverageSummary["layer"];

export type LayerToggleProps = {
  value: CoverageLayer;
  onChange?: (layer: CoverageLayer) => void;
  /** The form field name when the chips submit (default `layer`). */
  name?: string;
  className?: string;
};

export const LAYERS: readonly CoverageLayer[] = ["generous", "strict"];
const GROUP_LABEL = "Coverage layer";

export function LayerToggle({ value, onChange, name = "layer", className }: LayerToggleProps) {
  return (
    <div className={cx("layers", className)} role="group" aria-label={GROUP_LABEL} data-component="layer-toggle">
      {LAYERS.map((layer) => (
        <NeumorphicChip
          key={layer}
          size="sm"
          active={value === layer}
          type={onChange ? "button" : "submit"}
          name={onChange ? undefined : name}
          value={onChange ? undefined : layer}
          onClick={onChange ? () => onChange(layer) : undefined}
        >
          {layer}
        </NeumorphicChip>
      ))}
    </div>
  );
}
