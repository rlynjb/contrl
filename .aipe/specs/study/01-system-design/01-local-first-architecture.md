# Local-first architecture

**Industry name(s):** Local-first software, offline-first, source-of-truth-on-device
**Type:** Industry standard

> The phone owns the data. The network is an enhancement, not a dependency. Every read hits SQLite; every write commits locally first; the cloud is a mirror that reconciles in the background.

**See also:** → [02-sqlite-as-source-of-truth](./02-sqlite-as-source-of-truth.md) · → [03-bidirectional-sync](./03-bidirectional-sync.md) · → [05-derived-state](./05-derived-state.md)

---

## Why care

You open a workout app, you're in the gym basement with two bars of signal, and you tap "log set". A standard cloud-first app shows a spinner, fails the request, queues a retry, and your set count flickers. A local-first app writes to disk, updates the screen, and reconciles to the cloud when signal returns — and you never noticed the network was involved.

The pattern is called **local-first software**. The principle: treat the device's storage as the source of truth and the cloud as a mirror. It belongs to the same family of problems as offline Gmail, Linear's optimistic UI, and SQLite-on-mobile patterns (Notion's recent rebuild, WhatsApp message storage). Modern mobile frameworks lean into it because mobile networks are unreliable enough that *any* synchronous-cloud assumption eventually breaks. Here's how that actually works in this codebase.

---

## How it works

You're standing at the bottom of a basement gym. The Wi-Fi is rubbish. You tap a checkbox, and three things happen, in this order: the UI shows the box checked, the SQLite write commits, and *eventually* the Notion page updates. The order matters more than any one of those three steps does.

The strategy is: **commit locally first, treat the cloud as eventual**.

### The single-process SQLite database

`src/services/database.ts` opens one connection, `contrl.db`, with `PRAGMA journal_mode = WAL`. WAL (write-ahead log) lets writes proceed without blocking concurrent reads — important on mobile because the UI thread reads the database constantly to keep the skill tree painted. If you're coming from frontend, this is like the difference between using `localStorage` (synchronous, blocks the main thread) and IndexedDB (async, can yield) — except this is async-everywhere and the locks are managed by SQLite, not the browser. The practical consequence: a 1ms write doesn't stall a 5ms read happening on the next frame.

All seven tables live here: `user_profile`, `exercises`, `sessions`, `gate_progress`, `week_progress`, `drafts`, `sync_deletions`. Every domain concept the app understands has a row somewhere in this database. Nothing about the app's state lives only in React state — if you killed the JS engine mid-workout, on relaunch the draft is on disk.

### The cloud as a mirror, not a master

Notion is *not* the source of truth for sessions. Session reads go to SQLite, never to the Notion API. The Notion sync (`src/services/notion/sync.ts`) runs in the background, copies new sessions up, pulls remote edits down, and updates the local rows. If Notion is unreachable, the app still works — every screen still renders, every workout can still be logged. The bridge from frontend: this is like React Query with `staleTime: Infinity` and a manual revalidation trigger, except the cache *is* the database, not a memory layer over it.

The practical consequence: if you uninstall the app and reinstall it on a new phone, the first sync pulls every session row from Notion into SQLite. Then `reconstructFromSessions` (see [06-reconstruction-on-reinstall](./06-reconstruction-on-reinstall.md)) replays the session history to rebuild gate state and levels. The cloud holds the *facts*; the local DB holds the facts *plus* derived state.

### Derived state never crosses the wire

`gate_progress`, `week_progress`, current level, current streak — none of these sync to Notion. They live only in SQLite. The rule: if it can be recomputed from sessions, it stays local. The pattern is called **derive-don't-sync**.

If you're coming from frontend, this is the same principle as `useMemo` over a derived value vs. storing it in state — except across a network boundary. The reason it matters: if both client and server can compute the same derived state, you have two sources of truth that can disagree, and reconciliation gets ugly fast. By making sessions the only synced entity, conflict resolution only has to handle one shape of data.

### What happens on the network boundary

Every Notion write goes through `notionFetch` (`src/services/notion/api.ts` L18). Sessions push as Notion pages; exercises pull as Notion pages; deletions archive Notion pages. The boundary is narrow on purpose — only one HTTP wrapper, one rate limiter, one retry policy. If the Notion API goes away tomorrow, you swap one provider directory and the rest of the app doesn't notice.

### Move 2.5 — Phase A vs Phase B

**Phase A (current):** local-first with manual + auto-sync to Notion. Single user. Notion is the cloud mirror. No multi-device conflict possible beyond the 2-minute remote-bias window because the same user can't realistically log on two devices simultaneously.

**Phase B (planned, not built):** the audit-trail spec (Phase 2C of the curriculum) adds *raw pose data per rep* to the local database. That data stays local — it never syncs to Notion. The schema didn't have to change much: the existing local-first architecture already assumes some data is local-only. Adding the form-classifier audit trail just adds one more local-only table.

### The principle

Local-first is what every mobile app eventually becomes once it grows past v1. The network is too unreliable, the latency budget is too tight, and the user's mental model is "this thing should work" — not "this thing should fail elegantly when offline". Cloud-first is the default people pick because it's easier to *start*; local-first is the default they migrate to once the support tickets start.

The full picture is below.

---

## Local-first architecture — diagram

```
                                ┌─ UI layer ────────────────────────────────┐
                                │  React Native screens                     │
                                │  read & write through hooks               │
                                └───────────┬───────────────────────────────┘
                                            │
                                            ▼  every read & write
┌─ Storage layer (on-device, source of truth) ─────────────────────────────────────────────────┐
│                                                                                              │
│   SQLite (contrl.db, WAL mode)                                                               │
│      user_profile · exercises · sessions · drafts · gate_progress · week_progress            │
│                              └─ derived (not synced) ─┘                                      │
│                                                                                              │
└──────────┬────────────────────────────────────┬──────────────────────────────────────────────┘
           │                                    │
           ▼  sync triggered                    │  on app open: load()
           │  (auto on open OR user-requested)  │  reads SQLite directly
           ▼                                    ▼
┌─ Network boundary (HTTPS, optional) ─────────────────────────────────────────────────────────┐
│                                                                                              │
│   src/services/notion/sync.ts                                                                │
│      pullExercises  →  pullSessions  →  pushSessions  →  processDeletions                    │
│      every request through rateLimit() + retry/backoff                                       │
│                                                                                              │
└─ Provider layer (cloud mirror) ──────────────────────────────────────────────────────────────┘
   Notion API   ·   Exercises DB   ·   Sessions DB   ·   User profile DB

If the network is gone, the boundary is just unreachable.
Everything above the boundary still works.
```

---

## In this codebase

**File:** `src/services/database.ts`
**Function / class:** `getDatabase()`, `migrate()`, `seedExercisesIfEmpty()`
**Line range:** L14–L167

The single entry point is `getDatabase()` — module-scoped singleton, opens `contrl.db` once per app lifetime, runs additive migrations, seeds exercises if empty.

**Sync orchestrator:** `src/services/notion/sync.ts` L33 `syncAll()`
**Sync version bump:** `src/hooks/NotionSyncContext.tsx` L53 `setSyncVersion(v => v + 1)`
**State reload on sync:** `src/hooks/useGameState.ts` L173 (`useEffect` on `syncVersion`)

The audit trail of "local writes that need to archive a Notion page" lives in `sync_deletions` (database.ts L94–L100) — the only acknowledgement that the local DB is more authoritative than the cloud.

---

## Elaborate

### Where this pattern comes from

Martin Kleppmann's "Local-First Software" essay (2019) named the pattern, but the technique predates the name — Apple Notes, OmniFocus, and every email client written before 2005 used local SQLite + sync. The recent resurgence is mobile-driven: cellular networks are unreliable enough that any app expected to work in elevators, basements, or airplanes ends up here.

### The deeper principle

Sources of truth replicate; derivations don't. If you sync the inputs, every node can recompute the derived state correctly — and conflict resolution only has to handle one shape of data (the inputs). If you sync the derived state too, you can have two sources of truth that disagree, and now you need to reconcile derived state across devices, which is a much harder problem than reconciling inputs.

### Where this breaks down

When the derived state is too expensive to recompute on demand (large data, complex models), local-first becomes painful — every client has to pay the recomputation cost. The fix is either to keep derivations cheap (which is the rule here — replay through `reconstructFromSessions` is O(sessions)) or to accept some derived-state sync (which adds the conflict-reconciliation problem back).

The other breakpoint: multi-user collaboration. Local-first works beautifully for single-user apps where conflicts are rare. For collaborative editing, you need CRDTs or operational transformation, which is a much bigger lift than the simple last-edit-wins rule used here.

### What to explore next

- [02-sqlite-as-source-of-truth](./02-sqlite-as-source-of-truth.md) → the storage layer in detail
- [03-bidirectional-sync](./03-bidirectional-sync.md) → how the mirror reconciles
- [05-derived-state](./05-derived-state.md) → the derive-don't-sync rule
- [06-reconstruction-on-reinstall](./06-reconstruction-on-reinstall.md) → what makes the rule load-bearing

---

## Tradeoffs

```
┌────────────────────┬────────────────────────────────┬────────────────────────────────────┐
│ Cost dimension     │ Local-first (path taken)       │ Cloud-first (alternative)          │
├────────────────────┼────────────────────────────────┼────────────────────────────────────┤
│ Offline UX         │ Free — app fully usable        │ Requires cache + queue + retries   │
│ Latency            │ ~1ms per write (SQLite)        │ 100–800ms per write (HTTPS+DB)     │
│ Code complexity    │ Sync engine + conflict logic   │ Network handlers + UI fallbacks    │
│ Conflict surface   │ Only on multi-device sync      │ Constant (every write races)       │
│ Cloud cost         │ Near-zero (sync rarely)        │ Pays per read + per write          │
│ Vendor lock-in     │ Low — Notion swappable         │ High — tied to backend stack       │
│ Debugging          │ Single source on device        │ Need to inspect client + server    │
│ Reinstall recovery │ Pull + replay (deterministic)  │ Authoritative server, trivial      │
└────────────────────┴────────────────────────────────┴────────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The biggest cost is reinstall recovery. When a user uninstalls and reinstalls, the local DB is empty. Cloud-first apps just hit the server again and the data is there. Local-first apps have to *re-derive* everything from the synced inputs: `reconstructFromSessions` is the load-bearing function that makes this work, and it's not free — it's a chronological replay through every session ever logged. At 10,000 sessions that's still milliseconds, but the recipe-for-disaster version of this (replay through 100k sessions, with side effects) is the reason most apps don't bother trying.

The other cost is multi-device. With one user on one phone the conflict surface is tiny. The 2-minute remote-bias rule in `pullSessions` handles the rare case where a user opens Notion in a browser, edits a session, then opens the phone. But this rule is a heuristic, not a CRDT — at multi-device scale it would break, and we know it.

A third cost: developer onboarding. A new engineer has to learn the sync engine, the migration system, the reconstruction flow, AND the React side. That's ~3 days of code-reading. A cloud-first version of the same app would let them skip everything below the network boundary.

### Sub-block 2 — what cloud-first would have cost

If contrl were cloud-first, the gym-basement workflow would mean every set-tap shows a spinner, then either succeeds (200ms+) or fails and re-queues. The user-perceived cost is enormous — that's not a feature, that's a bug they'd report on day one. The fix in a cloud-first app is to add an optimistic UI layer on top, then a cache, then a queue, then a retry policy — which is *more code* than the local-first approach, not less, because you end up rebuilding most of the local-first stack as an afterthought.

The infrastructure cost would also be real: hosting an authenticated backend with a database, paying per-request, monitoring for outages. Local-first pays Notion's free-tier API and is otherwise infrastructure-free.

### Sub-block 3 — the breakpoint

Fine until the app needs **real-time multi-user collaboration**. The moment two users editing the same session is a feature, last-edit-wins becomes unacceptable and the local-first stack needs to add CRDTs or be re-architected around a server-as-truth model. For a single-user fitness app the breakpoint is decades away. For a team-collaboration app it would be week one.

### Sub-block 4 — what wasn't actually a tradeoff

A common "obvious alternative" people raise is Firestore/Supabase realtime. They look local-first because they cache; they're actually cloud-first with a local cache. The conflict model is server-as-truth, latency depends on network round-trip for any *authoritative* read, and offline writes are queued but the conflict resolution is theirs, not yours. The genuine local-first stack is "your data on your disk, written by your code, synced by your code". The other approaches are cloud-first with frosting.

---

## Tech reference (industry pairing)

### expo-sqlite

- **Codebase uses:** `expo-sqlite` 16.x (per `package.json`). `SQLite.openDatabaseAsync('contrl.db')` in `src/services/database.ts` L18.
- **Why it's here:** the storage layer that makes "tap checkbox → ~1ms write → screen updates" possible. Sync writes would stall the UI thread; this is async-everywhere.
- **Leading today:** `expo-sqlite` — `adoption-leading`, 2026.
- **Why it leads:** ships with the Expo SDK; battle-tested WAL mode; mirrors the SQLite C API directly. Zero bridge cost for Expo projects.
- **Runner-up:** `op-sqlite` — `innovation-leading` JSI-direct binding for bare React Native projects. Faster on hot read paths, but ejecting from Expo to get it isn't a good trade for this app.

### Notion API as cloud provider

- **Codebase uses:** Direct `fetch` to `api.notion.com/v1` via `src/services/notion/api.ts` L26. No SDK.
- **Why it's here:** the cloud mirror. Users already keep their training notes in Notion; making the app push there for free is the killer feature.
- **Leading today:** Notion API — `adoption-leading` for user-facing personal database mirrors, 2026.
- **Why it leads:** zero infrastructure to operate; users already own their data in Notion; database-style records map cleanly to the domain.
- **Runner-up:** Supabase — `innovation-leading` for managed Postgres + auth + RLS + Storage; the alternative if "general-purpose backend" became a requirement.

### NativeWind + dark theme

- **Codebase uses:** NativeWind (Tailwind for RN) over `src/constants/theme.ts`. Inter typeface.
- **Why it's here:** styling layer; not load-bearing for the architecture pattern but worth naming.
- **Leading today:** NativeWind — `innovation-leading` for Tailwind-style RN, 2026.
- **Why it leads:** keeps style colocated with markup; same mental model as web Tailwind, which most developers already know.
- **Runner-up:** Tamagui — `innovation-leading` with compile-time optimization, more sophisticated theming.

---

## Summary

### Concept recap

Local-first means SQLite is the source of truth and Notion is the mirror. Every read in contrl hits the local database; every write commits locally first and reconciles to Notion in the background. The constraint that forced it was the workout context — basement gyms, weak cellular, latency budget under 50ms for a checkbox tap. The cost paid is the reinstall-recovery story (we rebuild derived state from session history via `reconstructFromSessions`) plus a sync engine that has to handle pull-then-push ordering, conflict resolution, and deletions.

### Key points

- Lives in step 1 (Data model) and step 4 (State ownership) of the system-design checklist.
- Every read goes to SQLite; the Notion API is never on the read path.
- Only sessions sync to Notion; gates, levels, weeks, streaks are derived locally and never synced.
- A reinstall pulls sessions from Notion, then replays them through `reconstructFromSessions` to rebuild derived state.
- The 2-minute remote-bias conflict rule is the entire multi-device story — it works because the user is realistically only on one device at a time.
- The cost paid is reinstall complexity; the alternative (cloud-first) would have paid that cost as constant network-fragility tax instead.

---

## Interview defense

### What an interviewer is really asking

Behind "why local-first" is "have you understood your latency budget, your offline story, your conflict surface, and your reinstall path — or did you copy this from a blog post?" The signal is whether you can name the cost of *not* going local-first and the cost of *going* local-first in the same breath.

### Likely questions

**Q: Why did you pick local-first over a Firestore-style cached cloud DB?  [mid]**
A: The user-perceived latency budget for a "tap a set checkbox" interaction is ~50ms. A cached cloud DB still requires a round-trip on cold reads and writes; SQLite is sub-millisecond regardless. The app is fully usable offline as a free side effect. The cost is a sync engine I had to write, which is several hundred lines of code in `src/services/notion/sync.ts` — but the alternative was rebuilding an optimistic-UI layer in every screen, which is much more code.

```
tap checkbox        local-first             cloud-first w/ cache
   │                   │                       │
   ▼                   ▼                       ▼
 ~1ms          SQLite write + UI       round-trip on cold read
                                        + optimistic UI fallback
                                        + reconcile on response
```

**Q: How do you handle a multi-device conflict?  [senior]**
A: The sync engine uses last-edit-wins with a 2-minute Notion bias — if the remote `last_edited_time` is within 2 minutes of the local `updated_at`, Notion wins. The reasoning is that for a single-user fitness app, the realistic conflict scenario is "I edited the session in Notion browser, then opened the phone". The remote bias protects that case. If I had multi-user collaboration as a requirement I'd need CRDTs or an OT engine — this rule would not survive it.

```
   Path taken (last-edit-wins + 2min remote bias)   │   Alternative (CRDT-based merge)
   ─────────────────────────────────────────────────┼─────────────────────────────────
   simple to implement (one comparison)             │   weeks of work + library choice
   correct for single-user                          │   correct for multi-user
   wrong for concurrent edits across devices        │   correct for concurrent edits
   no migration cost                                │   would change schema + sync
   breakpoint: multi-user collab as a feature       │   right call only if multi-user
```

**Q: What happens at 100,000 sessions on reinstall — does this still work?  [arch]**
A: `reconstructFromSessions` is O(n) over session count, but the constant is small (a sort and a per-session FSM step). 100k sessions is still well inside JS event-loop budget — probably 200ms — and it runs once, on reinstall, blocking only the initial post-sync render. The Notion pull is the actual scale concern: pagination caps at 100 pages per request, so 100k sessions is 1000 paginated calls × 350ms rate limit = ~6 minutes for the initial pull. Beyond ~10k sessions per user I'd need server-side pagination cursoring and probably a "rebuild from snapshot" path instead of replay.

```
┌─ at 100k sessions ──────────────────────────────────┐
│  Notion pull (10k pages × 350ms)   ~6 min  ←─ breaks first
│  SQLite insert (10k rows)          <1 sec
│  Reconstruct replay                ~200ms
└─────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: Why not just keep the cloud as the source of truth and cache aggressively?**
A: That's the path I'd take if the app were team-collaborative. For a single-user app the cache-aggressively approach pays the cost of cloud-first (network fragility, latency on first read, queue + retry) and inherits the cost of caching (cache invalidation bugs, staleness windows). I'd rather pay the cost of *being* local-first cleanly than the cost of *pretending* to be by way of a cache. The honest version of cloud-first-with-cache is "we have a cache but the source of truth disagrees with it sometimes" — which is the worst of both worlds.

```
   What I picked              vs   Cloud + aggressive cache
   ────────────────────────       ──────────────────────────
   SQLite is truth                Server is truth
   Cache invalidation N/A         Cache invalidation everywhere
   Offline = first-class          Offline = degraded mode
   Sync = explicit reconcile      Sync = implicit + bugs
   Conflict = one rule, 2min      Conflict = race conditions
```

### One-line anchors

- The phone owns the data; the cloud is a mirror.
- Sources of truth replicate; derivations don't.
- The 2-minute remote bias is the entire multi-device story.
- Reinstall correctness is paid for once, in `reconstructFromSessions`.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Close this file. Draw the layered diagram: UI → Domain → Storage layer (SQLite) — with a network-boundary line below storage, and Notion below the boundary. Label `syncAll` as the only thing crossing the boundary. Re-open and compare.

✓ Pass: your diagram has SQLite *above* the network boundary and Notion *below*, with `syncAll` as the single crossing.

### Level 2 — Explain it out loud
Explain local-first to an imaginary colleague who just asked "why is the app fast even with no signal?" Under 90 seconds.

Checkpoints:
- Did you name `src/services/database.ts` and the `contrl.db` SQLite file?
- Did you say *why* this approach was chosen (latency budget + offline use)?
- Did you name the tradeoff in one sentence (reinstall recovery cost)?

### Level 3 — Apply it to a new scenario
"You're asked to add a 'workout history' export feature that produces a CSV of all sessions. Should the export hit Notion or SQLite, and why?"

Write your answer. 3–5 sentences. Then open `src/services/database.ts` L307 (`getSessions`) and check whether your answer matches what the codebase would do.

### Level 4 — Defend the decision you'd change
"If I were starting contrl today, would I still pick local-first?" Answer in writing. Reference `src/services/notion/sync.ts` to support what exists, and name what would need to change for the alternative.

### Quick check — code reference test
Without opening files:
- What file does the SQLite open + migration live in?
- What function name is the sync orchestrator?
- Approximately what line range is the migration block?

Then open and verify.
