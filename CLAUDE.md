# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo state

Pre-alpha, month 1 of a 3-month roadmap. The workspace topology (apps, packages, package boundaries) is in place, but most packages under `apps/` and `packages/` are still empty scaffolds. The only package with real source today is `@inertial/schemas`. Treat the README's architecture diagram as the *target*, not the current code — when adding to an empty package, you are establishing its conventions.

## Naming convention

The project's vocabulary is from Philip K. Dick's *Ubik* (1969). Use these terms consistently when writing code, comments, and docs:

- **inertial** — the project name. Lowercase as a CLI/package name (`inertial`, `@inertial/*`); capitalized **Inertial** in prose. In *Ubik*, "inertials" are anti-telepaths who neutralize harmful psychic intrusion. The toolkit's sub-agents are *inertials* — each one neutralizes a class of harmful signal.
- **Runciter** — the orchestrator. The class in `@inertial/core` is `Runciter` (interface) / `InMemoryRunciter` (implementation). The host process lives at `apps/runciter`. Glen Runciter, in *Ubik*, runs the prudence organization that *dispatches* inertials. Read `runciter.dispatch(event) → inertials emit StructuredSignals`.
- **structured signals** — what inertials emit. Probability + confidence + evidence pointers. Never verdicts.

When writing new code or comments in this repo, prefer the project vocabulary: "the Runciter dispatches an inertial" over "the orchestrator dispatches an agent". Both are valid; the former matches the codebase's voice.

## Commands

Package manager is pnpm 10 (enforced via `packageManager`). Node ≥20.

Top-level (run from repo root, dispatch through Turbo):

- `pnpm build` — build all packages (`turbo run build`)
- `pnpm dev` — run all `dev` tasks in watch (persistent, uncached)
- `pnpm typecheck` — type-only check across the graph
- `pnpm lint` — lint across the graph
- `pnpm test` — run all package test tasks
- `pnpm clean` — `turbo run clean` plus `rm -rf node_modules`

Per-package (run inside a package dir, e.g. `packages/schemas`):

- `pnpm build` / `pnpm dev` / `pnpm typecheck` / `pnpm clean` — packages currently use plain `tsc -p tsconfig.json` (no bundler). `dev` is `tsc --watch`. `clean` removes `dist`, `.turbo`, and `*.tsbuildinfo`.

Turbo is configured so `build`, `typecheck`, and `test` depend on upstream `^build`, so a single package change rebuilds only what's needed. To target one package from the root: `pnpm --filter @inertial/schemas <script>` or `turbo run build --filter=@inertial/schemas`.

There is no test runner wired up yet, and no lint config — `pnpm test` / `pnpm lint` will currently no-op until packages add those scripts.

## Architecture

`inertial` is a multimodal content-moderation toolkit shipped alongside a reference Electron dashboard. Two products, one monorepo:

1. **`@inertial/*` toolkit** — reusable orchestration + moderation primitives (the `packages/` tree).
2. **`@inertial/app`** — Electron + React + Tailwind + shadcn dashboard for moderators (`apps/inertial-app`).

The intended runtime data flow (per README):

```
Connectors → Gateway (Hono ingest) → Runciter (orchestrator, in apps/runciter)
          → Inertials (vision, text, video, audio, identity, context)
          → Signal Aggregator → PolicyEngine (per-instance YAML)
          → Review Queues → @inertial/app (HITL) → Action Dispatcher + Audit Log + Eval Harness
```

### Layer responsibilities

- **`apps/gateway`** — Hono HTTP service. Owns ingest, webhook SDK, media download + perceptual hashing. Normalizes inbound platform payloads into `ContentEvent`s before they enter the Runciter. Media URLs in `ContentEvent.media[].url` are *internal* storage URLs (S3/R2/local), never the original platform URL — this normalization happens here.
- **`apps/runciter`** — the Runciter (orchestrator) host. Consumes `ContentEvent`s, dispatches inertials based on `event.modalities`, aggregates `StructuredSignal`s, runs the policy engine, and lands events on review queues. Logs use the `[runciter]` prefix.
- **`apps/inertial-app`** — Electron dashboard for human reviewers. The review surfaces under `components/hitl/` are HITL Kit primitives *vendored* from the [hitlkit.dev](https://hitlkit.dev) shadcn registry (copied in, not installed — treat them as upstream and avoid drifting them). Surfaces queues, signals, and decisions; emits `ReviewDecision`s.

### Package responsibilities

- **`@inertial/schemas`** — the lingua franca. Zod contracts for `ContentEvent`, `StructuredSignal`, `ReviewDecision`, `AgentTrace`. Every other package depends on this. **When adding a cross-package shape, add it here first.**
- **`@inertial/core`** — `Runciter` (orchestrator) interface + `InMemoryRunciter` impl + `BaseAgent` base class + skill / tool registries + aggregator + trace collector.
- **`@inertial/agents-{vision,video,text,audio,identity,context,cloud}`** — one nested workspace per modality inertial (and one for cloud-backed skills). Workspace globs are explicit: `packages/agents/*` and `packages/connectors/*` are listed separately in `pnpm-workspace.yaml`, so a new inertial must live directly under `packages/agents/`, not nested deeper.
- **`@inertial/policy`** — YAML loader + evaluator. Per-instance policies live in `config/policies/` and are resolved by `instance.id` from the event.
- **`@inertial/connectors-{activitypub,atproto,lemmy,sdk-webhook}`** — one workspace per source platform. Each connector's job is to emit normalized `ContentEvent`s; everything platform-specific (auth, pagination, payload shape) is contained here.
- **`@inertial/db`** — Drizzle + Postgres + pgvector. pgvector is the choice because perceptual-hash and embedding similarity search live alongside the relational data.
- **`@inertial/eval`** — the eval harness. Brier / ECE / agreement scoring is implemented here, *not* delegated to `@eval-kit/core` — that package is a design sibling, not a dependency (its gate release exists only on its main branch and was never published). Gold sets and suites live in `config/evals/`.
- **`@inertial/sdk`** — public SDK surface for external consumers.
- **`@inertial/registry`** — shadcn-compatible component registry (the toolkit's published UI primitives).

### Design invariant: signals, not verdicts

The README's tagline — "**inertials emit signals; the Runciter dispatches them; humans decide**" — is load-bearing. Inertials must emit typed structured signals; the *only* place a verdict is produced is the policy engine, and the *only* place a moderation action is committed is the human review path. When designing an inertial or signal type, resist the temptation to bake policy decisions into the inertial output.

### Federation / multi-tenancy model

`InstanceContextSchema` (in `@inertial/schemas`) carries an `id` that is either a federated instance domain (e.g. `mastodon.social`) or a centralized tenant/workspace ID. Policy resolution, queue routing, and audit logging are all keyed on this ID. Code that needs "which policy applies" should always go through `instance.id` — never the source platform alone.

## Conventions

- **TypeScript**: ESM-only (`"type": "module"`), strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Inherited from `tsconfig.base.json` — extend it rather than redeclaring options.
- **Build output**: each package builds to `dist/` via `tsc -p tsconfig.json`. Packages publish `./dist/index.js` + `./dist/index.d.ts` via the `exports` field; keep that shape consistent when scaffolding new packages.
- **Workspace deps**: pnpm is configured with `link-workspace-packages=true` and `prefer-workspace-packages=true`, so `"@inertial/schemas": "workspace:*"` will resolve locally without extra config.
- **Schema-first**: when a piece of data crosses a package boundary, define it in `@inertial/schemas` as a Zod schema and infer the TS type. This is already the pattern in `content-event.ts`.

## Deferred renames (don't touch yet)

The Postgres user / database / container is still named `aur` — renaming requires destroying the local Docker volume (`aur_pg_data`). The following files intentionally still reference `aur` and are scheduled for a separate follow-up:

- `docker-compose.yml` (service name, env vars, volume name)
- `package.json` `db:up` script (references `pg_isready -U aur -d aur`)
- Default `DATABASE_URL` strings (`postgres://aur:aur@...`)

Don't rewrite those references in passing — they go in a dedicated PR alongside the volume teardown + reseed.
