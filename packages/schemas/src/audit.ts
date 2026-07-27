import { z } from "zod";

/**
 * Audit log entry. Append-only and ordered.
 *
 * Entries carry a prevHash → hash linkage, which detects edits to a recorded
 * payload. Treat that as an integrity check, not a security guarantee: the
 * hash covers the payload but not `kind`, `ref`, or `actorId`, so this is not
 * a tamper-proof ledger and nothing here should be described as one.
 *
 * What the log is *for* is ordering. Compliance is a question of what preceded
 * what — did a recorded approval come before the consequential act — and that
 * only needs a reliable sequence, which is what this provides.
 *
 * Every state-changing operation in inertial emits one of these:
 *   - content event ingested
 *   - signal generated
 *   - policy rule matched
 *   - reviewer decision recorded
 *   - action dispatched back to platform
 *
 * The chain hash (`prevHash` -> `hash`) lets operators verify integrity by
 * walking the chain on a periodic basis.
 */
export const AuditEntrySchema = z.object({
  id: z.string().uuid(),
  /** Sequential index. Helpful for chain verification + UI pagination. */
  sequence: z.number().int().nonnegative(),
  /** Hash of the previous entry. Null for the genesis entry per instance. */
  prevHash: z.string().nullable(),
  /** SHA-256 over (prevHash || canonicalize(payload) || timestamp). */
  hash: z.string(),
  instanceId: z.string(),
  kind: z.enum([
    "event-ingested",
    "signal-generated",
    "policy-evaluated",
    "queue-routed",
    "review-started",
    "decision-recorded",
    "consensus-reached",
    "action-dispatched",
    "policy-updated",
    "reviewer-overridden",
    // Eval harness: runs are part of the chain so verification is provable.
    "eval-run-started",
    "eval-run-completed",
  ]),
  /** Stable reference to the entity this entry concerns. */
  ref: z.object({
    type: z.enum([
      "content-event",
      "signal",
      "review-item",
      "policy",
      "eval-run",
    ]),
    id: z.string(),
  }),
  /** Free-form payload. Schema varies by kind; canonicalized before hashing. */
  payload: z.record(z.string(), z.unknown()),
  /** Actor — null for system actions, set to user/reviewer ID otherwise. */
  actorId: z.string().nullable(),
  timestamp: z.string().datetime(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
