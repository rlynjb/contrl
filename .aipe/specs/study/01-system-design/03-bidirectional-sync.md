# Bidirectional sync

**Industry name(s):** Pull-then-push sync, deferred-write sync, mirror-with-mutation
**Type:** Industry standard

> `syncAll()` orchestrates a fixed four-step dance: pull exercises (Notion authoritative), pull sessions (last-edit-wins), push unsynced sessions, archive deletions. Ordering matters; doing it in any other order risks data loss.

**See also:** → [04-conflict-resolution-last-edit-wins](./04-conflict-resolution-last-edit-wins.md) · → [08-rate-limiting-and-backoff](./08-rate-limiting-and-backoff.md) · → [01-local-first-architecture](./01-local-first-architecture.md)

---

## Why care

Two timelines exist at once: what's on your phone and what's in Notion. They started equal at install time, then both drifted — you logged a set in the basement, your partner edited a session's notes in Notion at the kitchen table. When the phone comes back to signal, the sync has to merge those two timelines without losing either.

The pattern is **bidirectional sync**, sometimes called **deferred-write sync** or **eventually-consistent mirroring**. It's the same shape as Dropbox's file sync, Linear's offline mode, and Apple Notes' iCloud sync. The hard part isn't the network calls — it's deciding *what order* to do things in and *which side wins* when both have changed the same row. Here's how that actually works in this codebase.

---

## How it works

Imagine you and a friend are keeping a shared shopping list — one paper copy each. Every so often you meet up to reconcile. You compare lists, decide who's edited more recently, merge, and walk away with identical copies. The trick is doing it in a fixed order so neither of you ends up overwriting changes you haven't seen yet.

The strategy: **pull-then-push, in a fixed order, with per-entity conflict rules**.

### Step 1 — Pull exercises (authoritative-source merge)

```typescript
const pages = await queryDatabase(token, dbId);
const notionIds: string[] = [];
for (const page of pages) {
  if (page.archived) continue;
  const exercise = notionPageToExercise(page);
  await upsertExercise(exercise);
  notionIds.push(exercise.id);
}
await deleteExercisesNotIn(notionIds);
```

`pullExercises` in `src/services/notion/sync.ts` L77. Exercises are *reference data* — sourced from Notion, not user-generated. The rule: Notion is the source of truth, the local mirror is rebuilt every sync. Upsert every Notion exercise into SQLite, then `deleteExercisesNotIn(notionIds)` prunes any local row whose ID is no longer present in Notion. This is the **upsert-then-prune** pattern.

If you're coming from frontend, this is like the way React Query refetches a list query and replaces the cached result entirely — except the "cache" is SQLite and the replacement is row-by-row instead of object-level.

The practical consequence: if you delete an exercise in Notion, the next sync removes it locally. There's no per-row "deleted" flag because Notion owns the truth.

### Step 2 — Pull sessions (last-edit-wins merge)

`pullSessions` L104 is where the actual conflict resolution happens. Sessions are *user-generated*, so we can't blindly let Notion win — the user might have logged a set offline that Notion doesn't know about yet. The rule:

- Fetch all non-archived Notion pages.
- For each remote page, find a matching local session (by `contrl ID` rich-text property, or by `notionPageId`).
- If there's a match, compare `last_edited_time` (remote) vs. `updated_at` (local). Remote wins if remote is newer, or if the diff is within 120 seconds. (See [04-conflict-resolution-last-edit-wins](./04-conflict-resolution-last-edit-wins.md) for the why.)
- If there's no match, it's a new session from Notion — insert it.
- After processing all remote pages, check which *local* sessions had `notionPageId` but aren't in the remote set anymore. Those were deleted from Notion. Delete them locally.

The bridge from frontend: this is like a state reducer that takes two states (local + remote) and a conflict-resolution function, and produces a new state. Except the inputs are network-fetched and the output is persisted to disk.

### Step 3 — Push sessions (idempotent upsert)

```typescript
const unsynced = await getUnsyncedSessions(lastSync);
for (const session of unsynced) {
  if (session.notionPageId) {
    await updatePage(token, session.notionPageId, sessionToNotionProperties(session, ...));
  } else {
    const page = await createPage(token, dbId, sessionToNotionProperties(session, ...));
    await setSessionNotionPageId(session.id, page.id);
  }
}
```

`pushSessions` L213. `getUnsyncedSessions(lastSync)` returns every session where `notion_page_id IS NULL OR updated_at > lastSync`. For each:
- If we have a Notion page ID, `PATCH` it with the latest properties.
- If we don't (newly created locally), `POST` to create the page, then write the resulting Notion page ID back to the local row so the next sync knows it's been pushed.

The bridge from frontend: this is like an outbox queue that processes pending mutations against a remote API — same shape as offline-first apps that queue mutations in IndexedDB.

The condition under which it works: this step *must* run after the pull step. If we pushed first, we'd push a local session that Notion's already deleted, recreating it. Order matters.

### Step 4 — Process deletions (outbox archive)

```typescript
if (!lastSync) return;  // skip on first sync
const deletions = await getPendingDeletions();
for (const del of deletions) {
  await archivePage(token, del.notionPageId);
  cleared.push(del.id);
}
await clearDeletions(cleared);
```

`processDeletions` L260. When the user deletes a local session, `recordDeletion` writes a row to `sync_deletions` with the Notion page ID. On next sync, this loop archives those Notion pages and then clears the outbox rows.

**Skip on first sync** (`if (!lastSync) return`) is load-bearing: on a fresh install, the `sync_deletions` table is empty *anyway*, and if it weren't (somehow), the user has no context to confirm a destructive Notion mutation. Defensive.

### Move 2.5 — Phase A vs Phase B

**Phase A (current):** four-step pull-then-push runs end-to-end every sync. Synchronous. Errors collected in `result.errors`; no partial-retry. If `pullSessions` throws halfway through, `pushSessions` still runs (try/catch isolates each step).

**Phase B (planned):** when the audit-trail ML feature lands (curriculum Phase 2C), there will be a *fifth* entity to sync — but it's local-only, so it doesn't sync. The four-step orchestration doesn't change. What changes is the *data volume per session* — landmark series per rep is much larger than the rep counts. The schema already supports it (extra local-only table); the sync loop doesn't need to know.

### Move 3 — The principle

Every bidirectional sync engine eventually settles into a fixed-order pull-then-push pipeline because the alternatives are worse. Push-first risks creating duplicates of remote-deleted rows. Parallel pull-and-push risks race conditions on rows touched by both directions. Interleaving the steps means each step needs to know about every other step's partial state. A linear pipeline with isolated try/catch around each step is the only shape that's tractable to reason about.

The full picture is below.

---

## Bidirectional sync — diagram

```
┌─ Network boundary (HTTPS to Notion API) ─────────────────────────────────────────────────┐

   src/services/notion/sync.ts  ─  syncAll()  ──────────────────────────────────────────┐
                                                                                          │
   1. pullExercises(token, exercisesDbId)                                                 │
      ┌───────────────────────────────────────┐                                           │
      │ Notion authoritative for reference    │   upsertExercise + deleteExercisesNotIn   │
      │ data. Upsert all, prune the rest.     │                                           │
      └───────────────────────────────────────┘                                           │
                            │                                                             │
   2. pullSessions(token, sessionsDbId, lastSync)                                         │
      ┌──────────────────────────────────────────────────────────────────┐                │
      │  for each Notion page:                                           │                │
      │    match local by contrlId or notionPageId                       │                │
      │    if local exists:                                              │                │
      │      compare last_edited_time vs updated_at                      │                │
      │      Notion wins if newer OR diff < 2min                         │                │
      │    else: insert as new                                           │                │
      │  for each local that had notionPageId but not in remote set:     │                │
      │    delete locally  (cloud-side deletion propagated down)         │                │
      └──────────────────────────────────────────────────────────────────┘                │
                            │                                                             │
   3. pushSessions(token, sessionsDbId, lastSync)                                         │
      ┌──────────────────────────────────────────────────────────────────┐                │
      │  unsynced = sessions WHERE notion_page_id IS NULL                │                │
      │                       OR updated_at > lastSync                   │                │
      │  for each:                                                       │                │
      │    if notionPageId: PATCH                                        │                │
      │    else: POST  →  setSessionNotionPageId(localId, page.id)       │                │
      └──────────────────────────────────────────────────────────────────┘                │
                            │                                                             │
   4. processDeletions(token, lastSync)                                                   │
      ┌──────────────────────────────────────────────────────────────────┐                │
      │  if !lastSync: return        (skip first-ever sync)              │                │
      │  for each row in sync_deletions:                                 │                │
      │    archivePage(token, row.notion_page_id)                        │                │
      │    clearDeletions([row.id])                                      │                │
      └──────────────────────────────────────────────────────────────────┘                │
                            │                                                             │
   5. setLastSyncTimestamp(now)                                                           │
                            │                                                             │
   6. syncVersion++  →  useGameState reloads  →  reconstruction if first sync after empty │
                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**File:** `src/services/notion/sync.ts`
**Function / class:** `syncAll()`, `pullExercises()`, `pullSessions()`, `pushSessions()`, `processDeletions()`
**Line range:** L33–L290

Supporting plumbing:
- HTTP wrapper + rate limit: `src/services/notion/api.ts` L9–L57
- Domain ↔ Notion mapping: `src/services/notion/mapper.ts`
- Token + DB ID + lastSync persistence: `src/services/notion/config.ts`
- Outbox writes: `recordDeletion()` in `database.ts` L551
- syncVersion bump: `NotionSyncContext.tsx` L53

---

## Elaborate

### Where this pattern comes from

The "pull-then-push" ordering is older than the cloud — it's how rsync worked in 1996, how IMAP works, how `git pull` works. The intuition is: bring yourself up to date with the world *before* you contribute to it, so you don't overwrite something you haven't seen. Mobile-app sync engines (Realm Sync, Firestore offline, CouchDB, Watermelon) all replicate this rule.

### The deeper principle

Sync is two problems disguised as one. The first problem is *order* — what happens first, second, third. The second is *merge* — when local and remote disagree about the same row, who wins. Most failures come from confusing these two: trying to fix a merge bug by changing the order, or trying to fix an order bug with a smarter merge rule. They are independent and must be solved independently.

### Where this breaks down

Concurrent sync invocations break the rate-limit assumption (the module-level `lastRequestTime` in `api.ts` is shared across all in-flight requests). `NotionSyncContext` guards against this with `inFlightRef`, but cross-process invocation (e.g., a background widget) would defeat it. The sync also assumes single-user — multi-user with shared sessions would need a different conflict model entirely (CRDT or OT).

### What to explore next

- [04-conflict-resolution-last-edit-wins](./04-conflict-resolution-last-edit-wins.md) → the merge rule in detail
- [08-rate-limiting-and-backoff](./08-rate-limiting-and-backoff.md) → the throttle + retry policy
- [02-dsa/03-set-based-diffing](../02-dsa/03-set-based-diffing.md) → the upsert-then-prune algorithm

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Linear 4-step pipeline (taken)    │ Event-driven sync (alternative)  │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Reasoning surface  │ One ordered flow to read          │ N triggers across modules        │
│ Latency per sync   │ Sequential (~3–10s typical)       │ Concurrent (~1–3s)               │
│ Failure isolation  │ Per-step try/catch                │ Per-event handler                │
│ Race conditions    │ None (single in-flight)           │ Possible across handlers         │
│ Code volume        │ ~290 LOC in one file              │ More boilerplate                 │
│ Memory             │ All data in JS for a single sync  │ Lower (streamed)                 │
│ Debuggability      │ Linear log trace                  │ Need correlation IDs             │
│ At scale (10× data)│ Slower linearly                   │ Concurrent gains help            │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The biggest cost is *latency at scale*. With 10× the sessions, the pull pulls 10× more pages, the push pushes 10× more updates, all sequentially. Real-world numbers: ~500ms per Notion page round-trip (with the 350ms rate limit + ~150ms network), 100 pages per query response. At 1,000 sessions a sync is ~5 minutes. At 10,000 sessions it's ~50 minutes — unusable. We're paying for sequential simplicity in wallclock time.

The second cost is *memory*. `pullSessions` calls `getSessions()` (`database.ts` L307) which loads every local session into JS to compare against remote pages. At 100k sessions that's a few MB — fine on a phone, but a smell. Real-world streaming sync engines query lazily; we eagerly load.

The third cost is *all-or-nothing partial failure*. If `pullExercises` throws because Notion rate-limited us harder than expected, the catch handler logs and *the next steps still run* — but `pullSessions` might rely on freshly-pulled exercise IDs to resolve session relations. The current code accepts this trade because the error rate is low.

### Sub-block 2 — what event-driven would have cost

If we'd built sync as `[onLocalWrite → queue Notion update]` + `[poll Notion → apply remote update]`, every individual mutation would be faster (~100–200ms per write). But: every cross-event interaction would need ordering guarantees we don't have. Race example: user logs a session locally (write event A), user deletes that same session before A's push completes (write event B). Now we have a queued create-then-delete; if they reorder, the create wins and the delete loses. To handle this we'd need a per-row sequence number, a transactional queue, and probably a state machine per row. That's much more code than the 290 LOC linear sync engine.

### Sub-block 3 — the breakpoint

Fine until **a single user's session count exceeds ~5,000** or until **sync latency over 5 seconds is noticeable**. Either threshold pushes us toward concurrent pulls (parallelize per-table) or toward delta sync (a cursor into Notion's `last_edited_time` index instead of full pull). At ~5,000 sessions the user-perceived sync time exceeds a minute, which is the upper bound for "user will wait staring at a spinner".

### Sub-block 4 — what wasn't actually a tradeoff

CouchDB-style replication with multi-master conflict resolution would have been technically possible but practically wrong. Notion isn't a CouchDB-compatible peer — it's a structured-document API with no concept of "conflicts" or "replication". Building CouchDB semantics over it would have meant emulating multi-master inside the client, which trades the simple problem (single user, single device) for a generalized problem we don't have.

---

## Tech reference (industry pairing)

### Notion API as cloud provider

- **Codebase uses:** `fetch` directly to `https://api.notion.com/v1`. No SDK. `src/services/notion/api.ts` L26.
- **Why it's here:** the remote mirror. Notion's database-as-API treats databases like tables and pages like rows; mapping to the domain is mostly mechanical.
- **Leading today:** Notion API — `adoption-leading` for personal-use cloud mirrors, 2026.
- **Why it leads:** zero infrastructure to operate; users already store training context in Notion; database properties (rich-text, numbers, dates, relations) map cleanly.
- **Runner-up:** Supabase — `innovation-leading` managed Postgres + auth + RLS + Storage; the alternative if user-defined Notion data became too constraining.

### Sync orchestrator pattern (no library)

- **Codebase uses:** Hand-rolled `syncAll()` orchestrator in `src/services/notion/sync.ts`.
- **Why it's here:** the four-step pipeline is small enough that a library would add more onboarding cost than it saves.
- **Leading today:** Hand-rolled orchestrators — `adoption-leading` for app-specific sync, 2026.
- **Why it leads:** every sync engine ends up having app-specific merge rules (the 2-min remote bias here is one); a library that handles the generic case forces you to escape its abstractions for the specifics.
- **Runner-up:** Watermelon DB sync — `innovation-leading` for SQLite-backed RN apps that want the sync engine pre-built. Requires committing to its schema model.

---

## Summary

### Concept recap

`syncAll()` runs a four-step pipeline: pull exercises (Notion authoritative), pull sessions (last-edit-wins), push unsynced sessions, archive pending deletions. Each step is wrapped in try/catch so a failure in one doesn't block the others. After all four steps complete, `lastSyncTimestamp` is updated and `syncVersion++` triggers a game-state reload. The constraint forcing this shape was the need for a small, debuggable, single-user-correct sync engine. The cost is sequential latency at scale and the all-or-nothing semantics within a step.

### Key points

- Lives in step 2 (Request flow) and step 5 (Failure handling) of the system-design checklist.
- Order matters: pulling before pushing prevents re-creating cloud-deleted rows.
- Exercises follow upsert-then-prune (Notion authoritative); sessions follow last-edit-wins with 2-min bias.
- Deletions go to a local outbox (`sync_deletions`) and get archived on the next sync.
- A single in-flight guard (`inFlightRef` in `NotionSyncContext`) prevents concurrent syncs from stepping on each other.

---

## Interview defense

### What an interviewer is really asking

Behind "walk me through your sync" is "do you know why the order matters?" If you can't explain *why* pull-then-push, you didn't design it; you copied it. The deeper test is whether you can name the failure modes of every alternative ordering.

### Likely questions

**Q: Walk me through `syncAll`.  [mid]**
A: Four steps, in this order. Pull exercises — Notion is authoritative for reference data; we upsert every Notion exercise locally, then prune any local row not in the Notion set. Pull sessions — for each Notion page, match against local by `contrl ID` or `notionPageId`; if matched, last-edit-wins with a 2-minute remote bias; if unmatched, insert as new; any local session that had a Notion ID but isn't in the remote set was deleted from Notion, so delete locally. Push sessions — for every local session with `notionPageId == null` or `updated_at > lastSync`, either PATCH (if it has a Notion ID) or POST and write back the new Notion page ID. Process deletions — for every row in `sync_deletions`, archive the Notion page, then clear the outbox row. After all four steps, set `lastSync` and bump `syncVersion`.

```
   pull exercises  →  pull sessions  →  push sessions  →  archive deletions
                       │                  │                 │
                       ▼                  ▼                 ▼
        upsert-then-prune     last-edit-wins+2min   skip-if-first-sync
```

**Q: Why pull-then-push and not push-then-pull?  [senior]**
A: Push-first risks re-creating cloud-deleted rows. Concrete example: user deletes session X in Notion. The local DB still has X. If we push first, we PATCH or POST X to Notion, which un-archives or recreates the page. The next pull sees the page and assumes it's a valid remote session. Now X is "alive" again with no audit trail. Pull-first catches the remote delete *first*, removes X locally, and the push step has nothing to send.

```
   Pull-then-push (taken)        │   Push-then-pull (alternative)
   ──────────────────────────────│──────────────────────────────────
   1. pull: detect remote        │   1. push: PATCH a row that the
      delete, remove locally     │      cloud already deleted →
   2. push: nothing to send      │      RESURRECT
                                  │   2. pull: see the resurrected
                                  │      row, no idea it's a zombie
```

**Q: At 10,000 sessions per user, where does this break first?  [arch]**
A: The pull. `queryDatabase` paginates at 100 pages/response. 10,000 sessions = 100 paginated calls × 350ms rate limit = 35 seconds of network plus another ~30 seconds of HTTP latency. The push is gated by the same rate limit but is incremental — only sessions with `updated_at > lastSync` get pushed, which keeps it fast on subsequent syncs. The fix for pull at scale is delta sync: filter by `last_edited_time > lastSync` *on the Notion side* and only pull updates. The current code does this filter on the client because we still need to detect deletions, but that's the optimization that would unlock 10× scale.

```
┌─ at 10k sessions ────────────────────────────────────────────┐
│  pullExercises    ~1–2s (Notion exercises stay small)         │
│  pullSessions     ~60s+   ←─ breaks first                    │
│  pushSessions     bounded by unsynced count                  │
│  processDeletions bounded by outbox size                     │
└──────────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: What happens if `pullSessions` throws halfway through?**
A: The remaining steps still run. The try/catch in `syncAll` only catches at the outer scope; per-step try/catch wraps `pullExercises`, `pullSessions`, `pushSessions`, and `processDeletions` independently. A partial pull means the local DB has *some* remote sessions but not all; the next sync will reconcile because `pullSessions` always queries all pages, not a delta. The cost is that a flaky network mid-pull leaves the local DB in an inconsistent intermediate state until the next successful pull — but it's *always recoverable*, because Notion still holds the truth.

```
   What I picked (independent try/catch)   │   Strict transactional (alternative)
   ────────────────────────────────────────│──────────────────────────────────────
   any step's error caught + logged        │   first error aborts the rest
   subsequent steps still run              │   atomic: all or nothing
   intermediate state acceptable           │   intermediate state never visible
   next sync converges                     │   user has to retry manually
   correct for "eventually consistent"     │   correct for "must be atomic"
```

### One-line anchors

- Order matters more than merge rules.
- Pull before push — never push before you've seen what the cloud says.
- Exercises upsert-then-prune; sessions last-edit-wins.
- The outbox handles deletes because Notion has no "tombstone" concept.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the four steps in order. Mark which step would create zombie rows if moved. Label which entity has which conflict rule. Compare.

### Level 2 — Explain it out loud
Explain `syncAll` to a teammate who's about to debug a sync bug. Under 90 seconds.

### Level 3 — Apply it to a new scenario
"A user reports: I deleted a session on my phone yesterday and it's back today. What's the most likely cause?"

Write your hypothesis. Then trace: was the `sync_deletions` row written? Did the push pass? Open `src/services/notion/sync.ts` L260 (`processDeletions`) — what would skip the delete from completing?

### Level 4 — Defend the decision you'd change
"Would you replace the sequential pipeline with concurrent step execution?" Reference `src/services/notion/sync.ts` and `src/services/notion/api.ts` L9 (`rateLimit`) to support the argument.

### Quick check — code reference test
- What file does `syncAll` live in?
- What's the order of the four steps?
- Approximately what line range is `pullSessions`?

Then verify.
