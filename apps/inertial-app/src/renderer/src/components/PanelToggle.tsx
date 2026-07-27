import { PanelRight } from "lucide-react";
import type { RightPanelKind } from "./RightPanel.js";
import { cn } from "../lib/utils.js";

interface PanelToggleProps {
  value: RightPanelKind | null;
  onChange: (next: RightPanelKind | null) => void;
  className?: string;
}

/**
 * Open/close the right rail.
 *
 * This was a dropdown when the rail had three panels to pick between. With
 * only the dispatch trace left there's nothing to choose, so it's a toggle —
 * a menu with one item is a menu that wastes a click.
 */
export function PanelToggle({ value, onChange, className }: PanelToggleProps) {
  const open = value !== null;
  return (
    <button
      onClick={() => onChange(open ? null : "agent-activity")}
      aria-pressed={open}
      aria-label={open ? "Hide agent activity" : "Show agent activity"}
      title={open ? "Hide agent activity" : "Show agent activity"}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
        open
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <PanelRight className="h-4 w-4" strokeWidth={1.5} />
      {open && <span className="hidden sm:inline">Agent activity</span>}
    </button>
  );
}
