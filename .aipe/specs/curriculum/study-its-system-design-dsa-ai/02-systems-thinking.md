# 02 — Systems thinking

This is the richest chapter for this codebase. contrl is, structurally, a small distributed system — two stores (SQLite + Notion), one direction of authority for some entities, two for others, and a derived layer that must never be trusted as truth. Most of the interesting decisions live here.

---

## 2.1 — Source of truth, by entity 🟢

**What it is.** In any system with multiple stores, each piece of data must have exactly one authoritative source. The other stores are projections, caches, or replicas — never co-equal.

**Where it lives.** `.aipe/project/context.md` lines 21–25, materialised in:
- Exercises: Notion is authoritative. `pullExercises` at `src/services/notion/sync.ts:77` upserts every page from Notion and *prunes* anything local that Notion doesn't have (`deleteExercisesNotIn`). That prune is only safe because Notion is the single source.
- Sessions: bidirectional. Both stores hold sessions; conflicts are resolved by last-edit-wins (§2.3).
- Derived state (gates, levels, weeks): never synced. The session log is authoritative; everything else is a cache.

**Why it exists.** Without per-entity authority rules, sync devolves into ad-hoc conflict handling at every call site. Naming the rule once means every code path can follow it.

**General rule.** *Decide the authority rule per entity, not per system.* "We use last-edit-wins" is a system-wide claim; it's almost always wrong. Reference data, user data, and derived data want different rules.

---

## 2.2 — Sync ordering 🟡

**What it is.** When a sync touches multiple entity types, the order of operations encodes invariants: dependencies resolve before they're referenced, deletions don't race with pushes, etc.

**Where it lives.** `src/services/notion/sync.ts:46-65`:

1. Pull exercises (so session→exercise relations resolve when pushing).
2. Pull sessions (apply remote changes to local first).
3. Push local sessions (now we know what's actually unsynced).
4. Process deletions (after both stores are in sync, archive the orphans).
5. Update `lastSyncTimestamp` (only after success).

**Why it exists.** Each step depends on the prior step's effect. Pulling sessions before pushing means a remote-deleted session is removed locally before we'd otherwise re-push it. Updating the timestamp last means a crash mid-sync doesn't lose the in-progress window — next sync re-tries with the same `lastSync`.

**General rule.** *In any orchestrator, the order is the spec.* Reorder a step and you've changed the system's behaviour, often subtly. Comment the order or you'll regret it on the day someone "tidies up" `syncAll`.

---

## 2.3 — Last-edit-wins with bias 🔴

**What it is.** A conflict-resolution policy: when both sides of a sync edited the same record, keep the side with the later `updatedAt`. The "bias" is a tie-breaking window: edits within N seconds of each other go to a designated winner.

**Where it lives.** `src/services/notion/sync.ts:151-156`:

```ts
const diff = Math.abs(notionEditTime - localEditTime);
const notionWins = notionEditTime > localEditTime || diff < 120000;
```

If Notion is later, Notion wins. If they're within 2 minutes, Notion *also* wins. Otherwise local wins.

**Why it exists.** Two reasons stacked together. (1) Clock drift: device clocks and Notion clocks aren't synced; a 2-min window absorbs that. (2) Editorial bias: when a human edits a session in Notion, they probably meant the edit; when local code overwrote it within 2 minutes, that's likely auto-sync churn.

**General rule.** *Naive last-edit-wins is rarely the right answer; biased last-edit-wins is the workhorse.* The bias direction is a product decision, not a technical one — it should match where humans actually intend to edit.

**Go deeper.** This is in the same family as CRDTs but doesn't pretend to be one — it's eventually consistent, but not provably convergent across all interleavings. For contrl's actual use (one user, one device + one Notion editor), this is fine. If you ever had two devices editing concurrently, you'd want vector clocks or a proper CRDT.

---

## 2.4 — Idempotency 🟢

**What it is.** An operation is idempotent if running it twice produces the same result as running it once. Hard requirement for any system that retries.

**Where it lives.** Three layers in this codebase:

- **Migrations.** `migrate()` at `src/services/database.ts:24` uses `CREATE TABLE IF NOT EXISTS` and PRAGMA-driven `ALTER TABLE` (`database.ts:106-119`). Running it on every DB open is safe.
- **Reconstruction.** `reconstructFromSessions` at `src/lib/game/reconstruct.ts:13` is pure: same input → same output. Triggered after sync when `syncVersion` bumps; running it twice (e.g., after auto-sync, then again on a manual sync) yields the same gate progress.
- **Notion API retries.** `notionFetch` at `src/services/notion/api.ts:18` retries on 5xx (3 attempts) and on 429 (Retry-After). Notion's `PATCH /pages/:id` is idempotent — same body, same final state — which is what makes the retry safe.

**Why it exists.** Networks fail mid-call. Apps crash mid-sync. Without idempotency, every retry risks duplicating data or corrupting state.

**General rule.** *Operations safe to retry are easier to reason about, debug, and recover from.* Design for retry from the start; bolting it on later usually means inserting de-dup keys after the fact.

---

## 2.5 — Event log + derived cache (mini event sourcing) 🔴

**What it is.** Store the events; compute the state. Sessions are the events; gates, levels, week progress, streaks are derived. The same input log always produces the same state.

**Where it lives.**
- The log: the `sessions` table.
- The derivations: `src/lib/game/reconstruct.ts:13` (gates + levels), `src/lib/game/week-progress.ts`, `src/lib/game/streaks.ts`.
- The trigger: the spec calls this out — reconstruction runs *after* an auto-sync pull, gated by a `syncVersion` bump rather than initial DB load (which sees zero sessions).

**Why it exists.** Reinstall recovery. If derived state were primary, a reinstall + Notion sync would restore sessions but lose all progression — the user would have to re-earn levels. By treating derived state as cache, the only durable thing is the session log; everything else is a function of it.

**General rule.** *State that can be derived should be derived, not stored — until performance forces a cache.* And when you cache, make the cache invalidatable in one place. contrl's invalidation is "increment `syncVersion` and re-run reconstruct."

**Go deeper.** This is event sourcing in miniature. Read Martin Fowler's *Event Sourcing* article and Greg Young's CQRS talks; the patterns scale up cleanly but the core insight ("the log is the truth") is already here in 72 lines.

---

## 2.6 — Additive migrations 🟡

**What it is.** Schema changes that only add columns/tables/indices, never rename or drop. Old code on the new schema still works; new code on the old schema can fall back.

**Where it lives.** `src/services/database.ts:24` runs `CREATE TABLE IF NOT EXISTS` for every entity. After the table block, lines 106–137 (approximate; `wc -l` says the file is 578 lines) inspect `PRAGMA table_info` and run `ALTER TABLE … ADD COLUMN` for any missing columns: `tempo`, `notes`, `passed`, `created_at`.

**Why it exists.** The app ships to phones; you can't atomically migrate a fleet of installs. Additive-only migrations mean a user on yesterday's build can still open their database after today's migration runs and be unaffected.

**General rule.** *In any schema you don't fully control the deployment of, migrations are forward-only and additive.* Renames become add+backfill+remove-later (across multiple releases). Drops become "stop reading this column." A nice property of this approach: migrations compose — running them N times is safe.

---

## 2.7 — Soft delete + tombstones 🟡

**What it is.** Instead of deleting a row immediately, record a tombstone: "this entity was deleted, here's its remote ID, sync the deletion next time."

**Where it lives.** The `sync_deletions` table (`database.ts:94-100`), drained by `processDeletions` at `src/services/notion/sync.ts:260`. When a session is deleted locally, its Notion page ID is recorded; on next sync, `archivePage` is called.

**Why it exists.** You can be offline when you delete. You can also have never synced this entity remotely (in which case there's no tombstone needed — `processDeletions` skips on first sync). Tombstones make deletes durable and retry-safe.

**General rule.** *Deletes are operations, not absences.* A row that was never there and a row that was deleted are different states; the system needs to be able to tell them apart.

---

## 2.8 — Rate limiting + backoff 🟡

**What it is.** Cap the rate of outgoing requests, and on failure, wait longer before retrying. Standard hygiene for any external API.

**Where it lives.** `src/services/notion/api.ts:9-16` — global `lastRequestTime` enforces `RATE_LIMIT_DELAY = 350ms` between calls. `notionFetch:37-49` handles 429 (`Retry-After` header) and 5xx (linear backoff `(retries+1)*2000`, capped at 3 retries).

**Why it exists.** Notion's documented rate limit is ~3 req/s; 350ms gives headroom. 5xx retries shield the user from transient remote failures. 429 honour-Retry-After is correct behaviour for a polite client.

**General rule.** *Be a polite client.* Throttle yourself; back off on failure; honour `Retry-After`. The first time you DDoS your own API in a retry loop, you'll write rate limiting before the next API client.

---

## 2.9 — Race condition: post-sync reconstruction ordering 🔴

**What it is.** Two different sync triggers (auto-sync on app start; manual sync from settings) both end with "reload state." The race: if reconstruction runs on the *initial* DB-ready event (before sessions are pulled), it sees zero sessions and resets gates.

**Where it lives.** Spec, `.aipe/project/context.md:57` — "Triggered by `syncVersion` bump after auto-sync pull (not on the initial DB-ready load, which sees zero sessions)." The fix is to gate reconstruction on the sync-version signal, not on DB readiness.

**Why it exists.** This bug existed; the fix is documented. The general failure mode is "two events with overlapping responsibilities both fire and one wins inconsistently." The cure is to identify the *correct* triggering event and ignore the others.

**General rule.** *Race conditions are usually the wrong event firing the right code, not the right event firing the wrong code.* When a derived computation is wrong, ask: "what triggered it?" before asking "what did it compute?"

---

## 2.10 — Separation of concerns: storage vs. policy vs. UI 🟢

**What it is.** Each layer of the system knows about exactly one thing. Storage (`src/services/database.ts`) doesn't know what a "clean session" is. Policy (`src/lib/game/`) doesn't know about SQLite. UI (`src/components/`) doesn't know about Notion.

**Where it lives.**
- Storage: `services/database.ts` (CRUD), `services/notion/` (remote CRUD + sync).
- Policy: `src/lib/game/` (gate-check, progression, reconstruct, week-progress, streaks), `src/lib/pose/` (rep counting).
- UI: `src/components/`, `app/`.

**Why it exists.** A pure policy layer is trivially testable — pass in sessions, get gates back. If `reconstructFromSessions` had to call `database.getSessions`, you'd have to mock the database to test progression. Instead, the orchestrator at the call site fetches sessions and passes them in.

**General rule.** *Storage at the edges, policy in the middle, UI on top.* Policy is a pure function from input data to output state. The further you push side effects to the boundaries, the more of the codebase becomes provable by reading it.
