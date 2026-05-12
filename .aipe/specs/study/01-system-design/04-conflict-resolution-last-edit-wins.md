# Conflict resolution — last-edit-wins with remote bias

**Industry name(s):** Last-Write-Wins (LWW), last-edit-wins reconciliation, asymmetric LWW with bias window
**Type:** Industry standard

> When the same session has been edited both locally and on Notion, the side with the more recent timestamp wins — but Notion wins ties within a 2-minute window, because Notion's `last_edited_time` is approximate and we'd rather trust the cloud than overwrite a real edit.

**See also:** → [03-bidirectional-sync](./03-bidirectional-sync.md) · → [01-local-first-architecture](./01-local-first-architecture.md)

---

## Why care

Two users open the same document, both edit the title, both hit save within a second of each other. What does the server show next? That's the canonical question of conflict resolution. In this app the same question shows up as: I edited a session in Notion's web view at 10:00:00; I opened the phone at 10:00:01 and it synced. Whose version is now on disk?

The pattern is **Last-Write-Wins (LWW)**. The simplest of the eventual-consistency strategies, used by Cassandra, DynamoDB single-key writes, and most early collaboration tools before CRDTs took over. The variant used here is **asymmetric LWW with a remote-bias window** — Notion's clock wins ties. Here's why that bias exists and how it works in this codebase.

---

## How it works

Two clocks, two ledgers. Each side records when it last changed a row. When they meet, you compare the timestamps and pick the newer one. The trick is that neither clock is *reliably* more accurate than the other, and "newer" within a few seconds of difference is essentially a coin flip.

The strategy: **compare timestamps, prefer remote within a fuzz window, accept the imperfection**.

### The comparison

```typescript
const notionEditTime = new Date(page.last_edited_time).getTime();
const localEditTime = localSession.updatedAt
  ? new Date(localSession.updatedAt).getTime()
  : 0;
const diff = Math.abs(notionEditTime - localEditTime);
const notionWins = notionEditTime > localEditTime || diff < 120000;
```

`pullSessions` in `src/services/notion/sync.ts` L150–L156. Two cases trigger a Notion-side win:
1. `notionEditTime > localEditTime` — straightforward: Notion's edit is strictly newer.
2. `diff < 120000` — even if local's `updated_at` is *slightly* ahead, if the difference is under 2 minutes, Notion still wins.

The bridge from frontend: this is like React's `Object.is` comparison in `useMemo` — when two values are "close enough", we treat them as equivalent and re-use the cached one. Here we're doing the same with timestamps and biasing toward Notion.

### Why the 2-minute bias

Notion's `last_edited_time` updates when *any* property changes — including properties we set during the same sync run (e.g., writing `contrl ID` back). That write happens after we've already read `last_edited_time`, so by the time the next sync runs, Notion's timestamp may be a few seconds newer than the local `updated_at` even though *we* were the ones who made it newer.

Without the bias, we'd pull the same row back down on every sync, overwriting any in-flight local edits the user made between syncs. The bias absorbs this jitter.

The other reason: Notion timestamps are at second-level precision; local timestamps are millisecond-level. Comparing them as equals is already lossy. 2 minutes is generous enough to swallow Notion's own write-back latency and any clock skew between device and server.

### What happens when Notion wins

```typescript
await upsertSessionFromNotion({
  ...localSession,
  ...notionSession,
  id: localSession.id,
  notionPageId: page.id,
} as WorkoutSession);
```

The local session is replaced with a *merged* record: spread the local session first, then override with Notion's fields, then force the local `id` (so primary-key references stay intact) and the remote `notionPageId`. This is a shallow merge — nested objects (`exercises: ExerciseEntry[]`) come entirely from one side, not field-by-field.

The practical consequence: if the user edited the exercise reps locally and someone else added notes to the same session in Notion, both edits don't merge. The session is replaced with Notion's version (because Notion won), and the local rep edits are lost. That's the cost of LWW vs CRDT.

### What happens when local wins

Nothing in `pullSessions`. We simply skip. The local row stays as-is; the push step (which runs next) will send the local version up.

```typescript
if (notionWins) {
  // upsert from Notion ...
}
// else: do nothing; local wins, push step handles it
```

This is *correct because* the push step uses `getUnsyncedSessions(lastSync)` which returns every session with `updated_at > lastSync`. If local won, local's `updated_at` is more recent than `lastSync`, so it'll get picked up.

### New-from-Notion case

If no matching local session exists, the Notion page is inserted as a new local row with `id: notionSession.id ?? `notion-${page.id}`` (L171). The fallback ID (`notion-<pageId>`) handles the case where Notion has a session that was never created by this app (e.g., someone added a row directly in Notion).

### The principle

LWW is the simplest correct conflict-resolution rule for asymmetric workloads — single user, single device, occasional cloud edits. It fails for symmetric workloads (multi-user concurrent editing) and that failure is fundamental: a single timestamp can't represent intent, so a "newer" edit isn't necessarily the *intended* edit. Every system that grows past single-user LWW eventually replaces it with vector clocks, CRDTs, or operational transforms.

The full picture is below.

---

## Conflict resolution — diagram

```
                     ┌──────────────────────────────────┐
                     │  Notion page  (remote)           │
                     │  last_edited_time = T_r          │
                     └────────────┬─────────────────────┘
                                  │
                                  ▼
                    ┌─ pullSessions, L150 ─────────────┐
                    │  diff = |T_r - T_l|              │
                    │  notionWins = T_r > T_l          │
                    │             OR diff < 120000     │
                    └────────────┬─────────────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                │                                   │
        notionWins == true                  notionWins == false
                │                                   │
                ▼                                   ▼
   ┌──────────────────────────┐         ┌──────────────────────────┐
   │ upsertSessionFromNotion  │         │ skip — local stays       │
   │ merged: {                │         │ pushSessions handles it  │
   │   ...localSession,       │         │                          │
   │   ...notionSession,      │         └──────────────────────────┘
   │   id: localSession.id,   │
   │   notionPageId: page.id  │
   │ }                        │
   └──────────────────────────┘

                                  T_r
                                   │
              ◄─ Notion wins ◄─────┼─────► local wins ►
                                   │
                            T_l - 2 minutes
            (remote bias absorbs Notion's own write-back jitter)
```

---

## In this codebase

**File:** `src/services/notion/sync.ts`
**Function / class:** `pullSessions()`
**Line range:** L104–L209, with the conflict comparison at L150–L156

The merge itself uses object-spread at L159–L164. The "new from Notion" branch is at L168–L182.

Related: the `contrl ID` rich-text property on Notion pages is set via the round-trip at L184–L193 — Notion gets the local ID written back so subsequent pulls can match by ID rather than relying solely on `notionPageId`.

---

## Elaborate

### Where this pattern comes from

LWW originated in early distributed systems (Lamport's clocks paper, 1978, and the systems that followed). It's the baseline against which every other conflict-resolution strategy is measured. The "asymmetric bias" variant shows up wherever one side has known clock-skew issues — common when one peer is a third-party API and the other is your own code.

### The deeper principle

A conflict rule has to be *deterministic* (same inputs produce same outputs) and *commutative* (the order of applying conflicts doesn't change the result). LWW is both, given a monotonic clock. The bias window adds asymmetry but preserves both properties as long as the bias direction is fixed.

### Where this breaks down

Multi-user concurrent editing. If Alice and Bob both edit the same session within 2 minutes, the second-to-sync wins regardless of who edited what. There's no field-level resolution — a single notes edit can clobber a multi-rep update. For multi-user the right tool is a CRDT (e.g., Yjs, Automerge) or a server-side operational-transform engine. Both are large lifts.

The 2-minute window also breaks if Notion's `last_edited_time` is delayed by more than 2 minutes (rare but possible during Notion API degradation). In that case, a stale Notion edit could erroneously overwrite a fresh local one.

### What to explore next

- [03-bidirectional-sync](./03-bidirectional-sync.md) → where the conflict rule sits in the pipeline
- [05-derived-state](./05-derived-state.md) → why we don't have to resolve conflicts on gates/levels/weeks

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬───────────────────────────────────┐
│ Cost dimension     │ LWW with bias (taken)            │ CRDT-based merge (alternative)    │
├────────────────────┼──────────────────────────────────┼───────────────────────────────────┤
│ Implementation     │ 2 comparisons, 1 spread          │ 500–2000 LOC + library            │
│ Multi-user safety  │ Wrong (overwrites)               │ Correct (concurrent edits merge)  │
│ Single-user safety │ Correct                          │ Correct (but overkill)            │
│ Schema impact      │ None                             │ Per-field versioning required     │
│ Bandwidth          │ Full record per change           │ Op-deltas (lower)                 │
│ Debugging          │ Easy — one comparison            │ Hard — distributed state          │
│ Performance        │ O(1) per row                     │ O(ops) per row                    │
│ Onboarding         │ ~5 minutes                       │ Days to understand semantics      │
└────────────────────┴──────────────────────────────────┴───────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is data loss in concurrent-edit scenarios. If a user edits session X in Notion at 10:00:00, then opens the phone (which had no idea about that edit) and edits session X locally at 10:00:30, then triggers a sync at 10:00:45 — the local edit wins (because both timestamps are within 2 minutes, but local is newer than `lastSync`). The Notion edit is *silently overwritten*. There's no surface in the UI to recover or even notice.

For a single-user fitness app this is rare and acceptable. For anything multi-user it's unacceptable. We're paying for simplicity with a real but rare data-loss risk.

The second cost is auditability. There's no log of "who edited what when". If a session looks wrong, the user has no way to see what *was* there before the last sync. Notion's "Page history" can recover deleted page versions but not field-level history.

### Sub-block 2 — what CRDT-based merging would have cost

A CRDT-based merge (e.g., Yjs for the JSON document, or Automerge for the whole session record) would mean: per-field versioning, op-deltas pushed instead of full records, a separate library (typically 50–200 KB minified). The implementation would be 500+ LOC plus the library, plus migration of all existing local sessions to a CRDT-compatible representation. For a single-user app the value is zero — we'd never see a conflict that the CRDT could resolve differently than LWW.

CRDT's real value is when concurrent edits are *expected* and *frequent*. Here they're rare and the consequences are small. Paying the CRDT cost would be over-engineering.

### Sub-block 3 — the breakpoint

Fine until **the app gains a shared-workout-plan feature** (a coach edits a plan, a client edits the same plan, both push). At that point LWW silently loses one side's edits and the bug surface becomes "why did my last set disappear?" tickets. The breakpoint is event-shaped: the moment multi-user concurrent editing becomes a feature, LWW is wrong and needs to be replaced.

### Sub-block 4 — what wasn't actually a tradeoff

Server-side conflict detection (e.g., 409 Conflict + client retry) wasn't an option because Notion's API doesn't expose conflict semantics — every PATCH succeeds and overwrites. We can't *opt into* server-side conflict detection without writing our own server, which would mean abandoning Notion as the cloud provider.

---

## Tech reference (industry pairing)

### Last-Write-Wins reconciliation

- **Codebase uses:** Inline timestamp comparison in `pullSessions` L150–L156.
- **Why it's here:** simple, correct for single-user, no dependencies.
- **Leading today:** LWW with bias — `adoption-leading` for single-user mobile-cloud sync, 2026.
- **Why it leads:** zero infrastructure, zero library dependency, debuggable in 30 seconds.
- **Runner-up:** CRDTs (Yjs, Automerge) — `innovation-leading` for multi-user concurrent editing; the right call when concurrent writes are frequent.

---

## Summary

### Concept recap

When a Notion-side session edit conflicts with a local-side edit, the side with the more recent timestamp wins — but Notion is biased by 2 minutes. The bias exists because Notion's `last_edited_time` updates when *we* write back to the page (e.g., setting `contrl ID`), making Notion's clock artificially newer immediately after a sync; the bias absorbs that jitter. The constraint that forced this was Notion's clock-precision and write-back behavior. The cost paid is data loss in true concurrent-edit cases — acceptable for a single-user app, unacceptable past that.

### Key points

- Lives in step 5 (Failure handling) of the system-design checklist.
- Notion wins if `notionEditTime > localEditTime` OR if `|diff| < 120000 ms`.
- The merge is a shallow spread: nested arrays come entirely from one side, not field-by-field.
- The bias is asymmetric — it always favors Notion, never local.
- Concurrent multi-user edits silently lose one side; rare for single-user, fatal at multi-user scale.
- The new-from-Notion fallback (`notion-${pageId}`) handles sessions added directly in Notion.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you resolve conflicts" is "do you understand that you have conflicts to resolve, and have you reasoned about when your rule is wrong?" Many candidates either don't realize their sync has conflicts or hand-wave with "last-write-wins" without naming the failure modes.

### Likely questions

**Q: What does last-write-wins mean in this codebase?  [mid]**
A: When `pullSessions` finds a Notion page that matches a local session, it compares `last_edited_time` (remote) with `updated_at` (local). If Notion is newer, or within 2 minutes either way, Notion wins and the local row gets replaced with a merged record (local id preserved, all other fields from Notion). If local is newer by more than 2 minutes, we skip — the push step will send the local version up.

```
   notionEditTime  ─────┐
                          ▼
   localEditTime  ──►  diff = |t_r - t_l|
                          │
                          ├──  t_r > t_l   ──► Notion wins
                          ├──  diff < 2min ──► Notion wins (bias)
                          └──  else        ──► local wins
```

**Q: Why bias toward Notion by 2 minutes?  [senior]**
A: Because Notion's `last_edited_time` updates whenever *any* property changes, including our own write-back of `contrl ID`. After a successful push, Notion's timestamp is a few seconds *newer* than the local `updated_at` even though we were the ones who made it newer. Without the bias, the next sync would pull that row back down and overwrite any local edits made in the meantime. The bias absorbs Notion's own write-back jitter. The cost is that genuine concurrent edits within 2 minutes silently lose one side — rare for single-user, but real.

```
   Without bias                       │   With 2-min bias (taken)
   ─────────────────────────────────  │   ──────────────────────────────────
   every sync re-pulls own writes     │   own writes absorbed by bias
   local edits clobbered constantly   │   local edits preserved between syncs
                                       │   genuine concurrent edits still lose
                                       │   (acceptable for single user)
```

**Q: How does this scale to 10 collaborators editing the same plan?  [arch]**
A: It doesn't. LWW is fundamentally wrong for multi-user concurrent editing because it can't represent intent — a "newer" edit doesn't mean the *intended* edit. The right tool at multi-user scale is a CRDT (Yjs, Automerge) for field-level merge, or operational transform on a centralized server. Either is a major rewrite: the data model changes from "session record" to "session ops list", the sync engine changes from "PATCH/POST" to "apply ops", and the local DB needs to store ops rather than (or alongside) the materialized record.

```
┌─ at 10 collaborators ───────────────────────────────────┐
│  LWW with 2-min bias       silently overwrites          │
│  ────────────────────────                               │
│  CRDT-based merge          field-level, correct ←─ ok   │
│  Server OT                 centralized, correct ←─ ok   │
└─────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: How do you detect that you've silently overwritten an edit?**
A: We don't, currently. There's no telemetry, no audit log. The user notices when their data looks wrong, files an issue, and the only recourse is Notion's page-history feature (which is per-page, not per-field). If this were a multi-user feature I'd want every PATCH to include the version it was based on (a kind of optimistic-lock token), and a 409-on-conflict path that surfaces a merge UI. Notion doesn't support that, so it's not implementable without a server in between.

```
   Picked (silent)                  │   Optimistic lock (alternative)
   ──────────────────────────────── │ ────────────────────────────────
   no version per record            │   version int per record
   overwrites win silently          │   PATCH includes prior version
   no UI surface for conflicts      │   server returns 409 on mismatch
   user reports bug → manual fix    │   client surfaces a merge UI
   right call for single user       │   right call for multi-user
```

### One-line anchors

- LWW is correct for single-user, silently wrong for multi-user.
- The 2-min bias absorbs Notion's own write-back jitter.
- Shallow spread merge — nested arrays come from one side only.
- The breakpoint is "shared editing as a feature".

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the conflict-resolution decision: two timestamps, the bias window, the two branches. Then verify against the diagram.

### Level 2 — Explain it out loud
Explain the 2-min bias to a teammate who asks "why does Notion get to win on ties?". Under 90 seconds.

### Level 3 — Apply it to a new scenario
"I edited a session in Notion at 10:00:00. I had it open on the phone (cached in memory) and edited reps locally at 10:00:30, then synced at 10:01:15. The Notion edit was lost. What happened?"

Trace the timestamps through L150–L156. Then check your trace against the actual flow.

### Level 4 — Defend the decision you'd change
"Would you keep LWW or switch to CRDTs if I told you a coach-client shared-plan feature is shipping in Q3?" Reference the relevant code and what would have to change.

### Quick check — code reference test
- What file holds the conflict resolution comparison?
- What line is the `diff < 120000` test on?

Then verify.
