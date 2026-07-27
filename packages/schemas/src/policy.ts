import { z } from "zod";
import { ProbabilitySchema } from "./structured-signal.js";

/**
 * Action the PolicyEngine emits after evaluating signals against rules.
 * Each instance/platform configures which signals lead to which action.
 *
 * The inertial philosophy: an `action` is a *recommendation* until a human approves.
 * The auto-* actions still emit an audit row even when not human-reviewed.
 *
 * Two invariants are encoded here rather than left to the caller:
 *
 * 1. **Autonomy for inaction, never for destruction.** `auto-allow` may resolve
 *    on its own — leaving content up is reversible. `auto-remove` may not:
 *    it is a *proposal* that defaults to held, because removing someone's
 *    speech is not reversible in any way the author experiences as reversible.
 *
 * 2. **Two kinds of gate, never averaged.** `escalate.mandatory` is policy
 *    compliance — the operator said a human must see this, and the agent's
 *    confidence is deliberately not an input. `escalate.discretionary` is
 *    judgment — the system stopped because it doesn't know. The first is
 *    binary and machine-checkable; the second has a precision/recall shape.
 *    A single number averaging obedience with self-knowledge means nothing.
 *    See `gateClassOf` and the separate fields on EvalRun.
 */
export const PolicyActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("auto-allow"),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal("auto-remove"),
    reason: z.string(),
    /**
     * Held until a human approves. **Defaults to true, and that default is the
     * safety property** — not an onboarding convenience. When held, the action
     * emits `queue.quick` instead and the removal waits on a recorded approval.
     *
     * Setting this to false lets an agent destroy content unattended. It exists
     * so the choice is explicit and greppable, not so it's convenient.
     */
    heldForApproval: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("queue.quick"),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal("queue.deep"),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal("escalate.mandatory"),
    /** Why this hit mandatory escalation (e.g. "minor-adjacent"). */
    reason: z.string(),
    /** Number of reviewers required to reach consensus. Default 3 for 2-of-3. */
    reviewersRequired: z.number().int().min(2).max(5).default(3),
  }),
  z.object({
    kind: z.literal("escalate.discretionary"),
    /** Why the system stopped — e.g. "conflicting channels", "below floor". */
    reason: z.string(),
    /**
     * What the system was unsure about. Carried so the reviewer sees the edge
     * of competence rather than just the fact of a stop, and so ask-precision
     * can be scored after the fact against what the reviewer decided.
     */
    uncertainty: z.object({
      channel: z.string(),
      probability: ProbabilitySchema,
      /** Distinct from probability — how sure the agent is *of that estimate*. */
      confidence: ProbabilitySchema,
    }),
  }),
]);
export type PolicyAction = z.infer<typeof PolicyActionSchema>;

/**
 * Which gate an action represents, or `null` if it isn't a gate at all.
 *
 * Exported so the scorer and the runciter classify from one place instead of
 * re-deriving it from string literals. `auto-remove` counts as mandated while
 * held: the policy is asserting a human must precede the destructive act,
 * which is exactly what a compliance gate is.
 */
export type GateClass = "mandated" | "discretionary";

export function gateClassOf(action: PolicyAction): GateClass | null {
  switch (action.kind) {
    case "escalate.mandatory":
      return "mandated";
    case "escalate.discretionary":
      return "discretionary";
    case "auto-remove":
      return action.heldForApproval ? "mandated" : null;
    default:
      return null;
  }
}

/**
 * A single policy rule. Each rule has:
 *   - a condition (compiled from YAML expression to a JS predicate)
 *   - an action emitted when the condition matches
 *   - a stable id for audit-log reference
 *
 * Rules are evaluated in declaration order. First match wins.
 * If no rule matches, the default action is `auto-allow`.
 */
export const PolicyRuleSchema = z.object({
  id: z.string(),
  /** The original YAML `if:` expression, kept for auditability. */
  expression: z.string(),
  action: PolicyActionSchema,
  /** Optional human-readable explanation for the dashboard. */
  description: z.string().optional(),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

/**
 * Per-instance policy bundle. Loaded from YAML, versioned in Postgres.
 * Edits create a new version row; the active version is referenced by ID.
 */
export const PolicySchema = z.object({
  /** Stable instance identifier (matches InstanceContext.id). */
  instance: z.string(),
  /** Monotonic version. Incremented on every saved edit. */
  version: z.number().int().positive(),
  /** Optional preset this policy was forked from ("strict" | "standard" | "permissive"). */
  basedOn: z.string().optional(),
  rules: z.array(PolicyRuleSchema),
  /** Default action when no rule matches. Defaults to auto-allow. */
  default: PolicyActionSchema.default({
    kind: "auto-allow",
    reason: "no rule matched",
  }),
  createdAt: z.string().datetime(),
  /** Author of this policy version (operator handle). */
  createdBy: z.string().optional(),
});
export type Policy = z.infer<typeof PolicySchema>;
