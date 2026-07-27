import { cn } from "../lib/utils.js";

export type Severity = "low" | "medium" | "high";

export function severityFor(maxProbability: number): Severity {
  if (maxProbability >= 0.8) return "high";
  if (maxProbability >= 0.5) return "medium";
  return "low";
}

/**
 * Severity colour resolves through akaSTYLE accent tokens, not raw palette
 * utilities. The tokens already carry their own light/dark values, so these
 * maps no longer need a `dark:` twin for every entry — and a palette change
 * happens in index.css rather than across every file that shows a severity.
 */
const STRIPE: Record<Severity, string> = {
  low: "bg-accent-green",
  medium: "bg-accent-amber",
  high: "bg-accent-rose",
};

export function SeverityIndicator({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return <span aria-hidden className={cn("block h-full w-1 rounded-l-lg", STRIPE[severity], className)} />;
}

export const SEVERITY_TEXT: Record<Severity, string> = {
  low: "text-accent-green",
  medium: "text-accent-amber",
  high: "text-accent-rose",
};

export const SEVERITY_BG_SOFT: Record<Severity, string> = {
  low: "bg-accent-green/10",
  medium: "bg-accent-amber/10",
  high: "bg-accent-rose/10",
};

export const SEVERITY_BORDER_SOFT: Record<Severity, string> = {
  low: "border-accent-green/30",
  medium: "border-accent-amber/30",
  high: "border-accent-rose/30",
};

export const SEVERITY_BAR: Record<Severity, string> = {
  low: "bg-accent-green/80",
  medium: "bg-accent-amber/85",
  high: "bg-accent-rose/90",
};
