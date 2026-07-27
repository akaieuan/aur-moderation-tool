import type { PolicyAction, StructuredSignal } from "@inertial/schemas";
import type {
  Condition,
  EscalationRule,
  PolicyDoc,
  Rule,
  SkillsBlock,
} from "./dsl.js";

import type { SkillMeta, SkillRegistry } from "@inertial/core";

/**
 * The part of a condition tree that actually fired, with the values observed
 * at match time.
 *
 * Recording the rule id alone makes an audit entry a pointer: the reader has
 * to go find the policy version that was live and re-read it. The witness
 * makes the entry self-contained — "toxic was 0.83, the rule wanted > 0.7".
 *
 * For `any:` only the branch that matched is kept; recording the others would
 * claim evidence the evaluator never relied on. For `all:` every branch is
 * kept, because every one had to hold.
 */
export type MatchWitness =
  | {
      kind: "channel";
      channel: string;
      field: "probability" | "confidence";
      op: "gt" | "lt" | "gte" | "lte" | "eq";
      threshold: number;
      observed: number;
    }
  | { kind: "entity"; entity: string; expected: boolean; observed: boolean }
  | { kind: "all"; of: MatchWitness[] }
  | { kind: "any"; matched: MatchWitness };

export interface EvaluationResult {
  action: PolicyAction;
  /** Rule id that fired, or undefined if the default action was used. */
  matchedRuleId?: string;
  /**
   * Why the rule fired. Undefined when the default action was used — there
   * was no condition, which is itself worth being able to tell apart from
   * "a rule fired but we didn't record why".
   */
  witness?: MatchWitness;
}

/**
 * Evaluate a per-instance policy against a StructuredSignal.
 *
 * Rules are evaluated in declaration order; first match wins. If no rule
 * matches, `policy.default` is returned (with `matchedRuleId` undefined so
 * the caller can record that fact in the audit log).
 */
export function evaluatePolicy(
  policy: PolicyDoc,
  signal: StructuredSignal,
): EvaluationResult {
  for (const rule of policy.rules) {
    const w = witness(rule.if, signal);
    if (w) {
      return { action: rule.action, matchedRuleId: rule.id, witness: w };
    }
  }
  return { action: policy.default };
}

/** Escalation rules to fire (skill names → run) given a partial signal. */
export function selectEscalations(
  policy: PolicyDoc,
  signal: StructuredSignal,
): Array<{ rule: EscalationRule; skills: readonly string[] }> {
  const out: Array<{ rule: EscalationRule; skills: readonly string[] }> = [];
  for (const rule of policy.escalation) {
    if (matches(rule.when, signal)) {
      out.push({ rule, skills: rule.run });
    }
  }
  return out;
}

/**
 * Apply per-instance skill governance to a registry, blocking any skill
 * that fails the policy. Mutates the registry in place. Idempotent.
 */
export function applySkillsPolicy(
  registry: SkillRegistry,
  policy: SkillsBlock,
): void {
  const allow = policy.allow ? new Set(policy.allow) : null;
  for (const meta of registry.list()) {
    const blockedByName = policy.block.includes(meta.name);
    const blockedByExec = policy.blockExecutionModel.includes(meta.executionModel);
    const blockedByLeak = policy.blockDataLeavingMachine && meta.dataLeavesMachine;
    const blockedByAllowList = allow !== null && !allow.has(meta.name);
    if (blockedByName || blockedByExec || blockedByLeak || blockedByAllowList) {
      registry.block(meta.name);
    }
  }
}

/** Whether a meta would be allowed under the policy (without mutating). */
export function isSkillAllowed(meta: SkillMeta, policy: SkillsBlock): boolean {
  if (policy.block.includes(meta.name)) return false;
  if (policy.blockExecutionModel.includes(meta.executionModel)) return false;
  if (policy.blockDataLeavingMachine && meta.dataLeavesMachine) return false;
  if (policy.allow && !policy.allow.includes(meta.name)) return false;
  return true;
}

/**
 * Evaluate a condition, returning *why* it matched rather than just whether.
 * Null means no match. The boolean `matches()` below is this with the
 * explanation thrown away, kept for callers that only need the predicate.
 */
function witness(cond: Condition, signal: StructuredSignal): MatchWitness | null {
  if ("all" in cond) {
    const of: MatchWitness[] = [];
    for (const c of cond.all) {
      const w = witness(c, signal);
      if (!w) return null;
      of.push(w);
    }
    return { kind: "all", of };
  }
  if ("any" in cond) {
    for (const c of cond.any) {
      const w = witness(c, signal);
      if (w) return { kind: "any", matched: w };
    }
    return null;
  }
  if ("channel" in cond) {
    const channel = signal.channels[cond.channel];
    // A channel the signal never carried is not a match. This is the "absence
    // is meaningful" rule: a skill that didn't run omits its channel, and an
    // omitted channel must not be read as a low score.
    if (!channel) return null;
    const field = cond.field ?? "probability";
    const observed =
      field === "probability" ? channel.probability : channel.confidence;
    if (!compare(observed, cond.op, cond.value)) return null;
    return {
      kind: "channel",
      channel: cond.channel,
      field,
      op: cond.op,
      threshold: cond.value,
      observed,
    };
  }
  if ("entity" in cond) {
    const observed = signal.entities.some((e) => e.type === cond.entity);
    const expected = cond.present !== false;
    return observed === expected
      ? { kind: "entity", entity: cond.entity, expected, observed }
      : null;
  }
  return null;
}

function matches(cond: Condition, signal: StructuredSignal): boolean {
  return witness(cond, signal) !== null;
}

function compare(
  lhs: number,
  op: "gt" | "lt" | "gte" | "lte" | "eq",
  rhs: number,
): boolean {
  switch (op) {
    case "gt":
      return lhs > rhs;
    case "lt":
      return lhs < rhs;
    case "gte":
      return lhs >= rhs;
    case "lte":
      return lhs <= rhs;
    case "eq":
      return lhs === rhs;
  }
}

/**
 * Convert the YAML-shaped PolicyDoc into the database-shaped `Policy` row
 * (per @inertial/schemas). The DSL's structured `if` tree gets serialized as a
 * JSON string so the existing `Policy.rules[].expression` field can hold it
 * for audit purposes.
 */
export function policyDocToRow(doc: PolicyDoc): {
  instance: string;
  version: number;
  basedOn: string | undefined;
  rules: Array<{
    id: string;
    expression: string;
    action: PolicyAction;
    description: string | undefined;
  }>;
  default: PolicyAction;
  createdAt: string;
  createdBy: string | undefined;
} {
  return {
    instance: doc.instance,
    version: doc.version,
    basedOn: doc.basedOn,
    rules: doc.rules.map((r: Rule) => ({
      id: r.id,
      expression: JSON.stringify(r.if),
      action: r.action,
      description: r.description,
    })),
    default: doc.default,
    createdAt: doc.createdAt ?? new Date().toISOString(),
    createdBy: doc.createdBy,
  };
}
