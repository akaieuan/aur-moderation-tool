import { Activity } from "lucide-react";
import { useHistory, type HistoryEntry } from "../lib/history.js";
import type { RightPanelKind } from "./RightPanel.js";
import { RelativeTime } from "./RelativeTime.js";
import { cn } from "../lib/utils.js";

const LIMIT = 6;

interface SidebarHistoryProps {
  onOpenPanel: (kind: RightPanelKind) => void;
  collapsed?: boolean;
}

/**
 * Recent dispatch runs. Was three grouped sections (Chats / Agent runs /
 * Notes); the other two went with their panels, so the grouping went too —
 * a section header over the only section is noise.
 */
export function SidebarHistory({ onOpenPanel, collapsed = false }: SidebarHistoryProps) {
  const { entries } = useHistory();

  if (collapsed) return null;

  const items = entries
    .filter((e) => e.kind === "agent-activity")
    .slice(0, LIMIT);
  if (items.length === 0) return null;

  return (
    <div className="mt-4 px-1.5">
      <section>
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Agent runs
          </span>
          <button
            type="button"
            onClick={() => onOpenPanel("agent-activity")}
            className="text-[10px] text-muted-foreground/60 transition-colors hover:text-foreground"
            title="Open agent activity panel"
          >
            {items.length}
          </button>
        </div>
        <ul className="flex flex-col gap-px">
          {items.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} onOpen={onOpenPanel} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function HistoryRow({
  entry,
  onOpen,
}: {
  entry: HistoryEntry;
  onOpen: (kind: RightPanelKind) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(entry.kind)}
        title={entry.context ? `${entry.label} — ${entry.context}` : entry.label}
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Activity className="h-3 w-3 shrink-0" strokeWidth={1.5} />
        <span className="flex-1 truncate">{entry.label}</span>
        <RelativeTime
          iso={entry.at}
          className="shrink-0 text-[10px] tabular-nums opacity-60"
        />
      </button>
    </li>
  );
}
