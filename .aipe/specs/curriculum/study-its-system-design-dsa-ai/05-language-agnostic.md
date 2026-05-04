# 05 — Language-agnostic principles

Concepts that transfer to any stack. Each one is grounded in this codebase, but the principle applies whether you're writing Rust, Go, Python, Elixir, or Kotlin. Use this chapter as the "vocabulary list" — these are the names of the patterns you'll use to discuss systems with people who don't know TypeScript.

---

## 5.1 — Single source of truth (SSoT) 🟢

**What it is.** Every entity has exactly one authoritative store. Other stores are projections.

**Codebase grounding.** Exercises live in Notion (authoritative); SQLite holds a cached copy. Sessions are bidirectional with Notion-biased conflict resolution. Derived state has SQLite as authoritative *cache*, but the session log as authoritative *truth*.

**Transfers to.** Database replicas, service-to-service caches, mobile/desktop sync, federated systems. The hard part is naming the truth, not implementing the sync.

**Sharper version of the rule.** *The system has a bug if any entity has two equal claims to authority.* "We'll merge them somehow" is not authority — it's hope.

---

## 5.2 — Idempotency 🟢

**What it is.** Same operation, same final state, regardless of how many times it runs.

**Codebase grounding.** Migrations (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN` guarded by `PRAGMA table_info`), reconstruction (pure function over sessions), Notion `PATCH /pages/:id` (overwrites, not appends).

**Transfers to.** REST API design (PUT vs. POST), Kubernetes controllers (reconcile loops), ETL jobs, deployment scripts, retry logic.

**Sharper version of the rule.** *If you can't run it twice safely, you can't retry it safely.* Retries are how distributed systems heal; idempotency is the prerequisite.

---

## 5.3 — Event log + projection 🟡

**What it is.** Store events; derive state. State is a *function of* the log, not a parallel record.

**Codebase grounding.** `sessions` table is the log. `gates`, `userLevels`, `weekProgress`, `streaks` are projections. `reconstructFromSessions(sessions)` is the projection function.

**Transfers to.** Event sourcing systems, CQRS, audit-log-first architectures, analytics pipelines (raw events → materialised views), redux/rxjs reducers.

**Sharper version of the rule.** *If two values disagree, one is the log and the other is the cache — never two equal versions of the truth.* Reconcile by recomputing the cache from the log.

---

## 5.4 — Finite state machines 🟢

**What it is.** A small set of named states, an alphabet of inputs, transitions defined per (state, input).

**Codebase grounding.** `RepCounter` at `src/lib/pose/rep-counter.ts:21`. Five states; one input (angle); transition function in the switch.

**Transfers to.** Parsers, protocol implementations (TCP, websockets), UI flows (multi-step forms, onboarding), order/payment lifecycles, animation systems, *anything* with stages.

**Sharper version of the rule.** *Anywhere you have ≥3 booleans whose combinations matter, you have a state machine — name the states.* Booleans hide the states; named states surface invariants the type checker can enforce.

---

## 5.5 — Hysteresis 🟡

**What it is.** Use two thresholds — one to enter a state, a different one to leave — to absorb noise.

**Codebase grounding.** `hysteresis: 10°` in the rep counter. Enter `ready` at `readyAngle - hysteresis`; leave when the input crosses the same point in the other direction (effectively a wider band).

**Transfers to.** Thermostats, autoscaling triggers, alerting systems ("flap dampening"), reconciliation policies, debouncing in UI, electronic schmitt triggers.

**Sharper version of the rule.** *Single thresholds bounce; bands stabilise.* Whenever a system flips back-and-forth around a threshold, widen the threshold into a band.

---

## 5.6 — Last-edit-wins with bias 🟡

**What it is.** A coarse, eventually-consistent conflict resolution rule with a tie-breaking window biased toward one side.

**Codebase grounding.** 2-minute Notion bias in `pullSessions` (`sync.ts:151-156`).

**Transfers to.** Any client-server sync without operational transforms or CRDTs — Dropbox, Google Drive at coarse granularity, mobile-first apps.

**Sharper version of the rule.** *Naive last-edit-wins is rarely right; biased last-edit-wins is the workhorse.* The bias direction is a product decision (where do humans actually edit?), not a technical one.

---

## 5.7 — Soft delete + tombstones 🟡

**What it is.** Record "deleted" as a state, not an absence. Sync the deletion as an event.

**Codebase grounding.** `sync_deletions` table; `processDeletions` archives them on next sync.

**Transfers to.** Any sync engine, any audit-required system, any system that supports "undo" beyond a single in-memory action stack.

**Sharper version of the rule.** *In a distributed system, "absent" and "deleted" are different — distinguish them.* The day they're conflated is the day a stale replica resurrects deleted data.

---

## 5.8 — Rate limiting + Retry-After 🟡

**What it is.** Cap your outgoing rate; back off on 5xx; honour `Retry-After` on 429.

**Codebase grounding.** `notionFetch` at `src/services/notion/api.ts:18-49`.

**Transfers to.** Every API client. Every job runner. Every webhook consumer. Every batch ingestion process.

**Sharper version of the rule.** *Polite clients survive; aggressive clients get blocked.* Treat rate-limiting as part of correctness, not as politeness.

---

## 5.9 — Additive migrations 🟢

**What it is.** Schema changes that only add. Renames become add+backfill+remove (over multiple releases). Drops become "stop reading first."

**Codebase grounding.** `migrate()` runs on every DB open with `IF NOT EXISTS` and column-existence checks.

**Transfers to.** Mobile apps, desktop apps, browser extensions, multi-tenant SaaS where you can't atomically migrate all tenants, any system with old clients in the wild.

**Sharper version of the rule.** *If you can't atomically deploy the migration, the migration must be backwards-compatible.* Old code on new schema must still work.

---

## 5.10 — Pure-function policy at the core 🟢

**What it is.** Policy decisions (gate evaluation, progression, week summary) are pure functions — input data → output data, no I/O.

**Codebase grounding.** `src/lib/game/` exports pure functions; storage and sync live elsewhere.

**Transfers to.** Functional cores in any language (Haskell-style, "functional core / imperative shell," Gary Bernhardt's pattern). Reducers in Redux. Pure pipelines in data engineering.

**Sharper version of the rule.** *Push side effects to the boundary; keep policy in the middle.* Anything pure is testable, parallelisable, and replayable. Anything that touches I/O is the opposite.

---

## 5.11 — Schema-first, types-mirror-storage 🟡

**What it is.** Declare the schema once; types and CRUD signatures conform. Drift becomes structural and visible.

**Codebase grounding.** SQLite DDL in `database.ts:25` mirrored 1:1 by types in `types/index.ts`.

**Transfers to.** Any ORM, any code-gen pipeline, any GraphQL schema, any Protobuf/Avro setup. The principle is upstream of the tool.

**Sharper version of the rule.** *One source of schema truth; everything else is generated or hand-conformed to it.* Independently authored types and DDL drift; same rule applies for OpenAPI ↔ types.

---

## 5.12 — Local-first IDs + late binding 🔴

**What it is.** Generate stable IDs locally; bind remote IDs as metadata when they arrive.

**Codebase grounding.** Sessions get a local ID at creation; `notion_page_id` is populated after first push.

**Transfers to.** Offline-first apps, optimistic UIs, peer-to-peer systems, any system that creates entities before round-tripping to a server.

**Sharper version of the rule.** *Treat the remote ID as metadata, not as the primary key.* This is also why many event-sourcing systems use client-generated UUIDs — same constraint, same answer.

---

## 5.13 — Discriminated unions for shape variation 🟡

**What it is.** Tag each variant of a union type with a literal; let the type system narrow exhaustively.

**Codebase grounding.** `{ type: 'plank' | 'rep', processor }` returned from `createPullProcessor`.

**Transfers to.** Algebraic data types in any typed language: Rust enums, Haskell sum types, OCaml variants, Swift enums with associated values, Kotlin sealed classes, Python `match` over `Literal` types.

**Sharper version of the rule.** *Tag the shape, narrow at the consumer.* Adding a variant becomes a compile error at every consumer that didn't account for it — exhaustiveness is the win.

---

## 5.14 — Boundary translation (mapper pattern) 🟡

**What it is.** Translate between domain shape and external shape at exactly one place.

**Codebase grounding.** `src/services/notion/mapper.ts` is the only file that knows both.

**Transfers to.** Any ORM, any API client, any RPC bridge, any IPC layer. Hexagonal architecture's "adapter" is this pattern at architecture scale.

**Sharper version of the rule.** *If domain code knows how a remote system shapes its JSON, your boundary has leaked.* The mapper is the firewall.

---

## 5.15 — Order is a spec, not an implementation detail 🔴

**What it is.** Orchestrators encode invariants in the order of their steps. Reordering changes behaviour.

**Codebase grounding.** `syncAll` in `notion/sync.ts:33` — pull exercises → pull sessions → push → deletions → bump timestamp. Each ordering decision is a correctness statement.

**Transfers to.** Database transactions, deployment pipelines, deferred-cleanup logic, lifecycle hooks (componentDidMount → effect → cleanup), saga patterns.

**Sharper version of the rule.** *Document orchestrator orderings or watch them be "tidied" into bugs.* The order *is* the design.
