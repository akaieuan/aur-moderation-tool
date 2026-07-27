import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Cpu, Eye } from "lucide-react";
import { cn } from "../lib/utils.js";
import { PanelToggle } from "./PanelToggle.js";

/**
 * The right rail carries one thing: the live dispatch trace.
 *
 * It used to also offer Notes (a per-case scratchpad) and Chat (an assistant
 * preview). Both were the general-assistant metaphor bolted onto a review
 * tool, and neither was about approval or audit — so they diluted the one
 * panel that *is* the thesis. Three panels a reviewer has to choose between
 * beats none, but one that's always the right answer beats three.
 */
export type RightPanelKind = "agent-activity";

export const RIGHT_PANEL_OPTIONS: ReadonlyArray<{
  key: RightPanelKind;
  label: string;
  Icon: typeof Activity;
  hint: string;
}> = [
  {
    key: "agent-activity",
    label: "Agent activity",
    Icon: Activity,
    hint: "Live inertial dispatch trace",
  },
];

interface RightPanelProps {
  kind: RightPanelKind;
  onChange: (next: RightPanelKind | null) => void;
}

export function RightPanel({ kind, onChange }: RightPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onChange(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  return (
    <aside className="relative flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-card/40 backdrop-blur">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 z-10 h-11"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />
      <div className="absolute right-3 top-2 z-20">
        <PanelToggle value={kind} onChange={onChange} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {kind === "agent-activity" && <AgentActivityPanel />}
      </div>
    </aside>
  );
}

function PanelSection({
  label,
  children,
  className,
  action,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("px-4 py-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ───────────────────────── Agent Activity ───────────────────────── */

type Stage = {
  name: string;
  kind: "in-process" | "remote-api";
  ms: number;
  status: "ok" | "warn" | "fail";
  output: string;
};

const DEMO_STAGES: Stage[] = [
  {
    name: "text-detect-spam-link",
    kind: "in-process",
    ms: 8,
    status: "ok",
    output: "spam-link-presence=0.04",
  },
  {
    name: "text-classify-toxicity@local",
    kind: "in-process",
    ms: 142,
    status: "ok",
    output: "toxic=0.62 insult=0.55",
  },
  {
    name: "text-classify-toxicity@anthropic",
    kind: "remote-api",
    ms: 412,
    status: "ok",
    output: "shadow: agreed",
  },
  {
    name: "policy-engine",
    kind: "in-process",
    ms: 4,
    status: "ok",
    output: "→ queue.quick (toxicity > 0.6)",
  },
];

function AgentActivityPanel() {
  const stages = DEMO_STAGES;
  const total = stages.reduce((acc, s) => acc + s.ms, 0);
  const remote = stages.filter((s) => s.kind === "remote-api").length;

  return (
    <div className="divide-y divide-border">
      <PanelSection label="Last dispatch">
        <div className="flex items-end justify-between gap-3">
          <div className="leading-none">
            <span className="text-2xl font-light tabular-nums tracking-tight">
              {total}
              <span className="ml-0.5 text-sm text-muted-foreground">ms</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 pb-1 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>all green</span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
          <Stat label="skills" value={stages.length} />
          <Stat label="local" value={stages.length - remote} />
          <Stat label="remote" value={remote} />
        </div>
      </PanelSection>

      <PanelSection
        label={`Trace · ${stages.length} steps`}
        action={
          <button className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground">
            full
            <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={2} />
          </button>
        }
      >
        <ol className="relative space-y-0">
          <span
            aria-hidden
            className="absolute left-[5px] top-2 bottom-2 w-px bg-border"
          />
          {stages.map((s) => (
            <li key={s.name} className="relative pl-5 py-1.5">
              <span
                className={cn(
                  "absolute left-0 top-2.5 h-[11px] w-[11px] rounded-full border-2 border-background",
                  STAGE_DOT[s.status],
                )}
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-foreground">
                  {s.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {s.ms}ms
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="truncate font-mono">{s.output}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm px-1 py-px font-mono uppercase tracking-wider",
                    s.kind === "remote-api"
                      ? "bg-[color:var(--accent-blue)]/10 text-[color:var(--accent-blue)]"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.kind === "remote-api" ? "remote" : "local"}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </PanelSection>

      <div className="px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Live trace appears here while the runciter dispatches inertials. Currently
          showing the last review.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center bg-card/60 py-2">
      <span className="text-sm font-medium tabular-nums leading-none">{value}</span>
      <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

const STAGE_DOT: Record<Stage["status"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-rose-500",
};

