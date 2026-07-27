# Architecture refactor — phased plan

Derived from the akaOSS handoff, **after verifying its claims against this codebase**. Three of them
did not survive. Read §0 before executing any phase; two phases in the original sequence were
solving problems that do not exist.

Scope of this pass: **design, schema, and infrastructural wiring only.** No eval runs, no live model
or API calls. `pnpm typecheck` / `pnpm build` are the verification ceiling.

---

## §0 Corrections to the handoff

| Handoff claim | Verdict | What's actually true |
|---|---|---|
| `@inertial/eval` doesn't wrap `@eval-kit/core` | ✅ **True** | No eval-kit dep anywhere. Own Brier/ECE impl. |
| tag-kit not imported | ✅ **True** | Own `TAG_CATALOG` in `@inertial/core`. |
| "Dashboard built directly on shadcn, not HITL-KIT" | ❌ **False** | `components/hitl/types.ts` is **byte-identical** to the HITL Kit canonical file. `HitlCard`, `MiniTrace`, `SubagentStatusCard`, `ApproveRejectRow`, `BatchQueue`, `AiGenerationScale` are all vendored HITL Kit registry components. The README claim is substantially true — it's *vendored*, not npm-installed. |
| "`escalate` is one flat enum covering both gate types" | ❌ **False** | `PolicyActionSchema` already has `escalate.mandatory` with `reviewersRequired` (2-of-3 consensus). The real gap is the **absence of a discretionary variant**, not a conflation. |
| `auto-remove` may execute unattended | ⚠️ **Partly** | It has a `suppress` flag ("held, emits queue.quick instead") and the schema doc already says an action is *a recommendation until a human approves*. But `auto-remove` appears **nowhere outside `policy.ts`** — nothing implements it. The bug is the **default** (`suppress: false`), not live behaviour. |
| Routing witness discarded | ✅ **True** | `EvaluationResult = { action, matchedRuleId? }`. `matches()` returns a boolean; the matched subtree is dropped at `evaluator.ts:31`. |
| `SkillCalibration` lacks a version | ✅ **True** | `skillName` only. Swapping a model merges two records. |
| `TagScope` lacks `text-span` | ✅ **True** | Has modality / mediaAssetId / segment. The doc comment on line 8 already promises "span". |

**Consequence for sequencing:** the handoff's Phase 1 (split a conflated enum) is really *add the
missing half*. Its Phase 0 (delete kit claims) is really *correct one claim and qualify another*.

---

## §1 The kit decision — settled

The handoff asks for a decision. Taking **option 2**, for a reason it didn't have:
`@hitl-kit/gates@0.2.0` is published and its API is a direct match for the gate work in Phases 1–2.

```
confidence · cost · scope · approval-chain · rate-limit + compose + store
```

`approval-chain` is the mandated gate. `confidence` is the discretionary gate. `scope` is the
`skills:` block. There is a `failClosed` test suite, which is exactly the §3 invariant. This is not
a stretch fit — adopting it makes "no path to executed without an approval event" a property of a
tested library instead of an `if` in the runciter.

- **Adopt:** `@hitl-kit/gates` (real dependency, Phase 1).
- **Attribute:** the already-vendored `components/hitl/*` as HITL Kit registry components.
- **Defer:** eval-kit and tag-kit — unpublished. Mark as documented seams, don't claim them.

---

## Phase 0 — Tell the truth (no code)

**Files:** `README.md`, `CLAUDE.md`

- `@inertial/eval` "wraps `@eval-kit/core`" → **false, delete**. It implements Brier/ECE itself.
- Reviewer-tag layer → own `TAG_CATALOG`, not tag-kit. State it.
- Dashboard "built on HITL-KIT primitives" → **keep, qualify**: vendored from the HITL Kit shadcn
  registry, and `@hitl-kit/gates` is a real dependency as of Phase 1.
- Add a row to the existing "Not real (and what each gap blocks)" table for the unpublished kits.

**Done when:** every kit reference in prose matches `package.json`.
**Risk:** none.

---

## Phase 1 — The gate taxonomy

**Files:** `packages/schemas/src/policy.ts`, `packages/policy/src/{dsl,evaluator}.ts`, `apps/runciter`

Add the missing discretionary gate beside the existing mandated one, and never average them.

```ts
// mandated — policy compliance. Confidence is deliberately NOT an input.
{ kind: "escalate.mandatory", reason, reviewersRequired }   // exists today

// discretionary — judgment. The system stops because it doesn't know.
{ kind: "escalate.discretionary", reason, uncertainty: { channel, probability, confidence } }
```

The discriminant already carries the distinction; what's missing is that the *scorer* must report
them in separate fields. A compliance rate (binary: did an approval precede the act) averaged with a
judgment score (precision/recall shaped) produces a number that means nothing.

Wire `@hitl-kit/gates` `compose()` at the runciter's policy-application point so the gate chain is
library-owned. **Types and wiring only this phase — no runs.**

**Done when:** both kinds exist, `EvalRun` has separate compliance and judgment fields, typecheck green.
**Risk:** medium — `PolicyAction` is a discriminated union consumed by db (`jsonb().$type<>`), eval,
and the renderer. Adding a variant is additive, but every exhaustive `switch` needs the new arm.

---

## Phase 2 — Autonomy for inaction, never for destruction

**Files:** `packages/schemas/src/policy.ts`, `config/policies/default.yaml`

> The machine may resolve a case alone **only when the resolution is to do nothing.**

`auto-allow` resolves autonomously. `auto-remove` becomes a **held proposal** — it clears a
confidence floor *and* collects a recorded human approval before anything executes.

The minimal change is the default: `suppress: z.boolean().default(false)` → `.default(true)`, and
rename it off the dry-run framing (`heldForApproval`) so it reads as a safety property rather than
an onboarding toggle. Since nothing implements `auto-remove` yet, **this is free right now and
expensive later** — do it before the executor exists.

**Done when:** the type makes unattended removal unrepresentable without an explicit opt-out.
**Risk:** low — no current caller.

---

## Phase 3 — Make recorded runs re-scorable

**Files:** `packages/policy/src/evaluator.ts`, `packages/schemas/src/audit.ts`, `packages/db`

1. **Routing witness.** `matches()` returns `boolean`; return the matched condition subtree instead
   and carry it into `EvaluationResult`, then into the audit entry. The AST is already in hand at
   match time — it's discarded one line later. An audit row then answers *why* precisely rather than
   naming a rule id the reader has to go look up.
2. **Gate ordering.** Record how many task actions preceded the gate event. Compliance is entirely a
   question of ordering, and a chain that records *that* an approval happened but not *where*
   can't be re-scored.

**Default the ordering field to `null`, never `0`.** `0` reads as "approved before everything" and
manufactures compliance that was never observed.

**Done when:** an audit entry is sufficient to re-derive the routing decision without the policy file.
**Risk:** medium — new non-null column, needs a Drizzle migration. Do it before generating data worth keeping.

---

## Phase 4 — Calibration honesty

**Files:** `packages/eval/src/scoring.ts`, `packages/schemas/src/{eval,skill-registration}.ts`

1. **A crash must not score like a clean negative.** `scoring.ts` never references `agentsFailed`.
   The schema already models absence correctly at emission time — *"if an agent is uncertain or
   didn't run, it MUST omit the channel rather than emit a low probability"* — so the scorer has to
   honour it. Today a skill that throws plausibly improves its own Brier score.
2. **Version the calibration row.** Add `version` to `SkillRegistration`, carry it onto
   `SkillCalibration`. Without it, swapping toxic-bert for a successor silently merges two models
   into one number.

**Done when:** failed skills are excluded from scoring, and a row identifies (skill, version).
**Risk:** low — isolated in `@inertial/eval`. **No eval runs; unit-level reasoning only.**

---

## Phase 5 — Reviewer surface

**Files:** `apps/inertial-app/src/renderer/**`

**Cut.** The right rail's Notes and Chat panels are a general-assistant metaphor. This product is
approval flows and audit trails. Removing them deletes `RightPanel` branches, the `notes` arm of
`RightTab`, and the `PanelToggle` options — and buys back the rail for **Agent activity**, which
*is* the thesis (live inertial dispatch trace). One panel, always relevant, beats three that dilute.

**Add — the finding in words.** Carry a one-sentence plain-language reading alongside each
`SignalChannel` and render it where the eye lands first. `harassment.targeted · 0.94 · span 29..52`
is precise and tells a reviewer nothing about what the system *concluded*. The numbers stay — they
are what policy acts on. **The case that most needs this is the channel that emitted nothing:**
"never reached a conclusion" is not "cleared", and as a blank table cell that distinction is invisible.

**Add — `text-span` to `TagScope`.** The doc comment already promises span scope. A quoted paragraph
deserves the same precision as an audio segment.

**Restyle — akaSTYLE.** The delta is narrow and mostly mechanical:

| | Inertial today | akaSTYLE |
|---|---|---|
| Surfaces | pure neutral, chroma `0` | warm, hue `107` at near-zero chroma |
| Light bg | `oklch(1 0 0)` | `oklch(0.955 0.003 107)` — grey paper, cards lift off it |
| Dark bg | `oklch(0.145 0 0)` | `oklch(0.146 0.002 107)` — warm near-black |
| Accents | hex (`#7c3aed`, `#2563eb`) | oklch, moderate chroma |
| Accent role | fills and text throughout | **punctuation, never fills** (ADR 0002) |

The token *names* already match (`--accent-violet/blue/amber/emerald/rose`, `--border-strong`), so
this is a values swap in `index.css` plus the `--accent-emerald → --accent-green` alias — not a
rename. Add `--card-alpha`, `--card-border[-hover]`, `--hairline`, `--radius-card`, `--radius-pill`.

The "accents as punctuation" rule is the one with teeth: it's the correct fix for the **278
hardcoded palette utilities across 21 files** (`bg-emerald-500`, `text-rose-700 dark:…`) that
currently bypass the token layer. Migrate `SeverityIndicator`'s `Record<Severity, string>` maps
first — most severity colour flows through them, so it's the highest-leverage single file.

**Done when:** one right-rail panel, plain-language readings render, tokens are akaSTYLE, severity
colour resolves through tokens.
**Risk:** low per step, but this is the largest surface. Ship it in the order above — each is
independently revertible.

---

## Sequence

| Phase | Gate on finishing |
|---|---|
| 0 · README truth | prose matches `package.json` |
| 1 · Gate taxonomy | both gate kinds exist, scored separately, typecheck green |
| 2 · Held removal | unattended destruction unrepresentable |
| 3 · Audit witness + ordering | a recorded run is re-scorable |
| 4 · Calibration honesty | crash ≠ clean negative; rows carry version |
| 5 · Reviewer surface | one rail, plain-language readings, akaSTYLE |

0 → 2 are cheap and consequential. 3 must land **before** any data worth keeping is generated.
4 is isolated. 5 is the visible one and is safe to interleave.

## Do not touch

Per the handoff, and confirmed here: real Postgres persistence + hash chain (68 hermetic
integration tests), real classifiers (toxic-bert / Claude Vision / Voyage) and the four-tier
execution model with per-skill `dataLeavesMachine`, `video-frame-extract` + `VideoAgent`, the
33-schema contract layer, and the honest documentation — the "Not real" table, the 31-gold-event
caveat, and seed event #5 showing toxic-bert missing a threat at 0.50. That last one is the
local-vs-cloud capability gap *demonstrated rather than asserted*. Keep it.
