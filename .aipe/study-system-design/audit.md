# System-design audit — contrl

Pass 1 of the audit-style two-pass output. Walks the 8 system-design lenses across the repo. Each lens either cites real `file:line` evidence or emits `not yet exercised` honestly. Findings significant enough to warrant a dedicated pattern walk cross-link to their Pass 2 file.

> Coach posture inherited from `teacher.md`: verdict-first, rank-what-matters, no hedging, no marketing language. Per-repo grounding only — every claim points at a file you can open.

---

## 1. system-map-and-boundaries

**What it does.** Three layered boxes (UI → Hooks → Domain → Persistence → Sync → Supabase) plus one parallel pipeline (Camera → worklet → JS-thread classifier → UI overlay). Full diagram in [`00-overview.md`](./00-overview.md).

**Components, responsibilities, connections:**

- **UI** — `app/_layout.tsx`, `app/(tabs)/*`, `app/log/*`, `app/settings/*`, `src/components/{ui,camera}/*`. Owns rendering and user input. Talks down to hooks only.
- **Hooks** — `src/hooks/{useDatabase,useExercises,useExerciseForm,useGameState}.ts`. Owns orchestration + React state. `useGameState.ts` is the load-bearing one: 6 state slices, 3 refs, the `logSession()` subroutine.
- **Domain** — `src/lib/game/*` (pure game-rule functions) + `src/lib/pose/*` (pure FSM + angle math). No I/O. Tested by feeding inputs and asserting outputs.
- **Persistence** — `src/services/database.ts` (679 LOC). Owns SQLite schema, migrations, and CRUD. Fires sync side effects (8 call sites).
- **Sync** — `src/services/sync/{client,config,mapper,supabase-sync}.ts`. Owns the local↔remote field mapping, the watermark scheme, and the push/pull paths.
- **External** — Supabase (Postgres + REST); MediaPipe pose detector (bundled model file); vision-camera frame processor (separate worklet thread).

**Trust boundaries** (where untrusted input crosses into trusted code) — see `.aipe/study-security/` for the full trust audit. Architecturally, the load-bearing ones are:

- Form input → in-memory hook state → SQLite (`src/services/database.ts` via parameterized `runAsync`).
- Supabase REST response → mapper (`src/services/sync/mapper.ts` — `r: any`, no schema validation today).
- Camera frame → MediaPipe → landmarks (numeric, on-device, never uploaded).
- *Planned:* user notes → LLM prompt (Phase 4, not built).

**External dependencies** — Supabase project (one), Anthropic API (planned), MediaPipe model file (bundled). No queues, no cache servers, no CDNs, no third-party auth providers (yet).

**No `not yet exercised`.** The map is complete.

---

## 2. request-response-and-data-flow

The important flows, end-to-end. Each is a "thing the user does" traced through every layer.

**Flow A — Log a workout session (the load-bearing write flow):**

```
  user taps "log set"                                              app/log/*
        │
        ▼
  useExerciseForm.updateValue(exIdx, setIdx, value, isHold)        hooks
        │
        ▼  (set complete → form emits session payload)
        │
  useGameState.logSession(session)                                 hooks
        │                                                          ↑
        ├─ evaluateSession(...)            ◄─── game rule           │
        ├─ applyGatePassCheck(...)         ◄─── game rule           │
        ├─ checkCategoryLevelUp(...)       ◄─── game rule           │
        ├─ updateWeekFromSession(...)      ◄─── game rule           │
        │  (six sequential awaits — NO transaction wrapping)        │
        │                                                          │
        ├─ insertSession(session)          ◄─── DB write           │
        ├─ updateGate(newGate)             ◄─── DB write           │
        ├─ updateUserLevel(...) IF level-up ◄── DB write            │
        ├─ updateWeek(newWeek)             ◄─── DB write           │
        │                                                          │
        └─ each DB write fires:                                    │
              pushChanges().catch(() => {})  ◄── fire-and-forget   │
                                                                    │
              ──► pushChanges() in supabase-sync.ts                 │
                    for each table (sequential):                    │
                      fetch dirty rows since last_pushed_at         │
                      map to remote shape                           │
                      upsert via Supabase REST                      │
                      ★ early-return on first error                 │
                    advance watermarks (only on full success)       │
```

**Flow B — Pose detection during a set (the load-bearing real-time flow):**

```
  camera frame                                                     PoseCamera.tsx
        │
        ▼  (worklet thread, vision-camera frameProcessor)
  MediaPipe detect(frame)
        │
        ▼  (still worklet thread)
  result.results[0].landmarks                                       worklet
        │
        ▼  runOnJS(onLandmarks)(landmarks)
        │
        ▼  (now on JS thread)
  src/lib/pose/exercises/<exercise>.ts                              JS thread
    extract angles from landmark indices
    smooth (EMA alpha ~0.4)
        │
        ▼
  src/lib/pose/rep-counter.ts                                       JS thread
    FSM: idle → ready → down → bottom → up
    hysteresis dead-zone
        │
        ▼  RepEvent { kind: 'rep', phase }
  SetCameraOverlay → SetCameraHUD                                   JS thread
    visible rep counter
    (set boundary detection → emits session payload to useGameState)
```

**Flow C — Reinstall recovery (the load-bearing read flow on a fresh install):**

```
  app launches with empty SQLite                                    persistence
        │
        ▼  migrate() runs on first DB open                          database.ts
        │
        ▼
  useDatabase → useGameState detects empty state                    hooks
        │
        ▼  pullRestoreIfFresh()                                     sync
        │
        ▼  for each table: select('*') from Supabase
        │  insert into local SQLite via mapper.fromRemote(...)
        │
        ▼
  reconstructFromSessions(sessions, user)                           domain
    folds session history → User levels + Gate progress
    Week progress is RE-derived from sessions (not pulled separately)
        │
        ▼
  hook state hydrated; UI renders restored
```

**The handoffs that matter:**

- **Worklet → JS thread** in Flow B is the load-bearing concurrency seam. `runOnJS(...)` crosses threads; pose math happens on the JS thread; the actual MediaPipe inference runs off the JS thread to keep the UI responsive. See `.aipe/study-runtime-systems/` for the threading model detail.
- **Hook → persistence → sync** at the end of Flow A is the load-bearing failure surface. `pushChanges().catch(() => {})` makes the sync invisible at every caller. See the dedicated pattern walk in [`04-watermark-based-incremental-sync.md`](./04-watermark-based-incremental-sync.md) and the failure analysis in `.aipe/drills/failure-handling-sync-partial-failure.md`.
- **Sync pull → reconstruct** at the end of Flow C is what makes pattern [`03-reconstruct-on-reinstall.md`](./03-reconstruct-on-reinstall.md) cheap: derived state (gates, levels, weeks) doesn't need its own sync round-trip.

---

## 3. state-ownership-and-source-of-truth

The state graph, and who owns each transition.

| State slice | Source of truth | Cached at | Who transitions |
|---|---|---|---|
| `User` (push/pull/squat levels) | `user_profile` table in SQLite | `useGameState.user` | `logSession()` via `checkCategoryLevelUp` |
| `Gate progress` (per-category gates) | `gate_progress` table | `useGameState.gates` | `logSession()` via `applyGatePassCheck` |
| `Sessions` (workout log) | `sessions` table | `useGameState.sessions` | `logSession()` via `insertSession`; never edited after write |
| `Week progress` | **DERIVED** from sessions; also cached in `week_progress` table | `useGameState.week` | `logSession()` recomputes from current week's sessions |
| `Streak` | **DERIVED** from week_progress | `useGameState.streak` | recomputed on load + on logSession |
| `Draft` (in-progress session) | `drafts` table (locally), never synced | `useGameState.draft` | `useExerciseForm`-driven updates |
| `Exercise catalog` | `exercises` table | `useExercises.exercises` (per-hook local cache) | seeded at first launch; rarely changes |
| `Sync watermarks` | `sync_meta` table | (not in React state — read on demand) | sync layer only |

**The source-of-truth rule for contrl:** **SQLite is canonical for all user state.** Supabase is a mirror, not the source. React state is a cache of SQLite for the current render. Three implications:

1. A bug in `useGameState` is local — refresh fixes it. A bug in SQLite is the user's data. Treat SQLite writes as the trust boundary.
2. Sync is *opportunistic enhancement*, not *required dependency*. The app works fully offline. (See [`01-local-first-canonical-with-cloud-mirror.md`](./01-local-first-canonical-with-cloud-mirror.md).)
3. Reinstall recovery doesn't need to round-trip every derived value — it needs only what's source-of-truth in cloud (sessions, user_profile, exercises) and reconstructs the rest. (See [`03-reconstruct-on-reinstall.md`](./03-reconstruct-on-reinstall.md).)

**The leakage finding** — `useGameState.ts` holds 6 state slices in one hook, including derived state (week, streak) alongside source-of-truth-mirrors (user, gates, sessions). This conflates two concerns: caching from SQLite, and deriving compound values. Documented in `.aipe/study-software-design/` as the cognitive-load hotspot. Architecturally, the symptom is that the hook is the only place where the derivation rules and the SQLite mirror coexist — extracting the derivation into a pure `applySessionToState` function (proposed in the software-design audit) would separate concerns.

**Per-hook caches** — `useExercises` and `useDatabase` each own their own state. No shared cache layer. At single-screen-component scale this is fine; if 3+ screens needed exercises, a Context would earn its place. Not yet exercised.

---

## 4. caching-and-invalidation

**SQLite IS the cache** for all server state. The architectural choice is to treat the local store as a write-through cache against Supabase, with `local → remote` being the source-to-mirror direction (not the reverse). This is the inverse of the typical web pattern (server is source; client is cache).

Invalidation strategy:

- **Local writes are always fresh** — they go to SQLite immediately; React state updates from there.
- **Remote reads only happen on reinstall** — `pullRestoreIfFresh` runs once when the local DB is empty (Flow C above); after that, the local DB is canonical until next reinstall.
- **There is no read-through cache invalidation problem** because reads don't fetch from Supabase in normal operation. The user's session list is what's in SQLite. If Supabase had different data, contrl wouldn't know — and at single-user scale, this is correct: the device wrote it; the device knows.

**In-memory caching:** React state in `useGameState` is the per-render cache of SQLite. Invalidation is automatic — `setState` triggers re-render with new data after every write.

**HTTP caching:** `not yet exercised`. Supabase REST responses are not cached client-side; the supabase-js client doesn't honor cache headers. Not relevant today because reads happen rarely.

**The architectural reading:** "caching" in contrl is really *replication direction*. The choice "local is canonical" is the entire caching strategy. It's load-bearing because it eliminates a whole class of cache-coherence problems web apps have to solve. (Documented in [`01-local-first-canonical-with-cloud-mirror.md`](./01-local-first-canonical-with-cloud-mirror.md).)

**The invalidation hole** — when sync writes back to Supabase, no notification reaches the device. If another writer (a future second device) updates the cloud, this device doesn't see it until next pull-restore. At Phase 2A's single-user-single-device scale this is by design. At Phase 4's multi-device (a future), this becomes a real coherence problem. Cross-link `.aipe/study-distributed-systems/` for the read-your-writes-across-devices problem.

---

## 5. storage-choice-and-durability-boundaries

**Two stores.** SQLite on-device (source of truth) + Postgres in Supabase (cloud mirror). Each owns what it owns:

- **SQLite (expo-sqlite, WAL mode)** — owns durability for user data on this device. Writes are durable to disk (WAL guarantees) before the function returns. Survives app force-quit, OS crash, reboot. Does NOT survive uninstall — uninstall = data loss unless reinstalled with cloud restore.
- **Supabase Postgres** — owns durability of the cloud mirror. Survives uninstall (this is what makes reinstall recovery possible). Anon key reaches every row today (no RLS); the durability guarantee is Postgres-strong, but the access guarantee is "single user trusts themselves with their own cloud."

**Why two stores at all** — see [`01-local-first-canonical-with-cloud-mirror.md`](./01-local-first-canonical-with-cloud-mirror.md). Single sentence: the app must work fully offline, so local has to be canonical; cloud must survive uninstall, so cloud has to be durable; therefore both stores exist, with sync as the bridge.

**Why these specific engines** — engine internals cross-link to `.aipe/study-database-systems/`. Architecturally:

- **expo-sqlite (WAL)** — chosen because (a) RN ecosystem; (b) WAL gives readers a snapshot during writes (no read-write contention); (c) zero-config durability on-device. The schema is documented in `.aipe/study-data-modeling/`.
- **Supabase Postgres + REST** — chosen because (a) the access pattern is row-shaped (relational fits); (b) RLS gives a clean future authz path even though it's not deployed yet; (c) the REST client is reasonable, the Realtime path is available if Phase 4 needs push notifications.

**Durability boundaries (what's guaranteed where):**

```
  durable                  ephemeral
  ─────────                ─────────
  SQLite WAL              React state
  Supabase Postgres       In-memory landmark sequences
                          MediaPipe inference state per frame
                          Sync watermarks ARE durable (in sync_meta)
                          restoreInProgress flag IS ephemeral (module-global, lost on app restart)
```

**Storage-choice red flag** — `restoreInProgress` being an in-memory flag (not a SQLite row in sync_state) means a force-quit mid-restore loses the "I was restoring" knowledge. The next launch may not realize the restore was interrupted; whether this is a bug depends on `pullRestoreIfFresh`'s idempotency, which is documented in [`03-reconstruct-on-reinstall.md`](./03-reconstruct-on-reinstall.md). The drill at `.aipe/drills/failure-handling-sync-partial-failure.md` doesn't cover this case; a separate drill would.

**Schema details** — for the table-by-table layout and the normalization choices, see `.aipe/study-data-modeling/`. This audit owns the **placement** of storage; that guide owns the **shape** within each store.

---

## 6. failure-handling-and-reliability

The shape of failure handling in contrl is "**local writes always succeed; sync failures are silent**." That's an honest one-line audit.

**What's defended:**

- **Local write failure** — SQLite errors (disk full, locked file) throw out of `runAsync` and propagate to the caller. The caller (useGameState's `logSession`) doesn't catch — the error bubbles to a React error boundary or the user sees a crash. Loud failure.
- **Migration failure** — `migrate()` runs at first DB open. If a step throws, the function exits; subsequent steps don't run; next launch retries from the start. Idempotency depends on `CREATE TABLE IF NOT EXISTS` and similar — not all 9 migration ops are individually idempotent. Documented as a study-data-modeling red flag.

**What's NOT defended:**

- **Sync push failure** — `pushChanges()` in `supabase-sync.ts` returns early on the first table that errors. Tables 3-5 are silently dropped. Caller uses `.catch(() => {})` so the error doesn't reach the UI. The user-visible symptom: data is in local SQLite but not in cloud; on reinstall, that data is gone. **This is the load-bearing failure surface.** See `.aipe/drills/failure-handling-sync-partial-failure.md` for the diagnose-and-fix walkthrough.
- **Sync pull-restore partial failure** — if `pullRestoreIfFresh` errors mid-restore (e.g., network drops after some rows inserted), the local DB is half-populated. `restoreInProgress` flag was set in-memory and is lost on app restart, so next launch may not realize the restore was interrupted. Documented above; uncovered by tests.
- **Concurrent two-device writes** — the watermark scheme assumes single writer. Not yet exercised at Phase 2A's hardcoded single USER_ID; becomes a real concern at Phase 4 multi-device.
- **Network failure during a write** — `pushChanges` reaches the supabase-js client; the client returns an error; logErr fires; early-return; same as the partial-failure case.

**Cross-link to `.aipe/study-distributed-systems/`** for the consistency-model framing (eventual; at-least-once; no read-your-writes across devices). The architecture choice is fine for single-user MVP; the discipline is to know it.

**Graceful degradation:** the app works fully offline. Sync failures degrade the cloud mirror, not the user's session. This is a property of the canonical-with-mirror choice, not of error handling.

---

## 7. scale-bottlenecks-and-evolution

**What breaks first at 10x:**

- **10x users (multi-user, Phase 4):** the load-bearing change is auth + RLS deployment. The anon key in the client bundle is correct *only if* RLS gates access; without RLS, multi-user means everyone reads everyone's data. This is documented in `.aipe/study-security/` as the top CRITICAL Phase 4 item.

- **10x sessions per user (multi-year history):**
  - The session list page (currently `select('*') from sessions order by date desc`) has no LIMIT and no pagination. At 5 years × 5 sessions/week × 50 weeks = ~1250 sessions, this is fine on-device; at 50,000 sessions (multi-decade or per-user multi-account aggregation), the unbounded list becomes a perf issue.
  - `reconstructFromSessions` folds the entire session history. O(n) over sessions. At n=50,000 this is still milliseconds on-device; at n=500,000, it's seconds. Not a 10x concern; a 100x concern.

- **10x devices per user (multi-device sync):**
  - The watermark scheme (`last_pushed_at` per table) assumes single writer. Two devices both pushing to `sessions` between pulls produces ordering ambiguity. Conflict resolution would need either timestamps + last-write-wins (acceptable for a journal of independent events like sessions) or CRDT-style merges (overkill).
  - The `restoreInProgress` flag is per-device; coordination between devices is non-existent. Two devices both restoring concurrently could double-write.

- **10x sync frequency (more sets per minute):**
  - 8 fire-and-forget pushes per `logSession()` means burst traffic. Supabase rate-limits per project. At MVP scale this is fine; at scale, you'd want a sync engine (the proposed refactor in `.aipe/study-software-design/`) that batches.

**What breaks first at 100x:**

- **100x data per user:** see above. `reconstructFromSessions` becomes seconds. Mitigation: snapshot the reconstructed state in `user_profile` and `gate_progress`; only fold sessions since the last snapshot.
- **100x users (Phase 4 + traction):** Supabase's free tier limits matter; index choices on the 9 tables matter — none of those indexes exist today (see `.aipe/study-database-systems/` and `.aipe/study-data-modeling/`).

**What stays stable:**

- **The pose pipeline.** On-device, no shared resources, no remote calls. Scales linearly with the number of devices using the app, which is the only way it should scale.
- **The local-first read path.** Every read is a SQLite query against per-user data on the device. No N-user contention.

**Which future change would force re-architecture:**

1. **Cloud-side computation** — if any logic (e.g., AI coaching aggregation across users) needed to run server-side, the "Supabase is dumb storage" assumption breaks. Today no such requirement; if it arrived, Supabase Edge Functions would be the natural first move, but the whole "local is canonical" frame would need revisiting.
2. **Real-time multi-device** — if a feature requires Device A's set to show up on Device B in seconds (rather than minutes-to-hours via pull-restore), the sync model has to flip from "opportunistic mirror" to "active subscription" (Supabase Realtime channels, possibly). This is a significant change.
3. **Shared exercises catalog** — today exercises are per-user. If exercises become a shared library (templates, community-contributed routines), the per-user RLS scope on that table changes; the schema-as-private-data assumption breaks for one table.

---

## 8. system-design-red-flags-audit

Ranked architectural risks. Cross-link to the related concept files where deep treatment lives.

```
  ┌─ Tier 1 — load-bearing risks ─────────────────────────────────────────┐
  │                                                                        │
  │  R1. RLS NOT DEPLOYED                                                  │
  │      Today: single hardcoded USER_ID; anon key has full table access.  │
  │      The architectural risk: Phase 4 auth ships, RLS not yet active,  │
  │      every authenticated user reads everyone's data for the window.    │
  │      Fix: deploy RLS BEFORE auth-enabled client ships. Same-release    │
  │      lockstep, not "in the next sprint."                               │
  │      See: .aipe/study-security/02-authentication-and-authorization.md  │
  │                                                                        │
  │  R2. SYNC PARTIAL-FAILURE DROPS TABLES SILENTLY                        │
  │      pushChanges() early-returns on the first failing table. Tables    │
  │      3-5 never get attempted. Data divergence becomes silent and       │
  │      permanent (until table 1 failure is fixed externally).            │
  │      Fix: accumulate {succeeded, failed}; advance per-table watermark. │
  │      See: .aipe/drills/failure-handling-sync-partial-failure.md        │
  │                                                                        │
  │  R3. NO EVAL SURFACE ANYWHERE                                          │
  │      Zero tests, zero eval scripts. MediaPipe accuracy assumed.        │
  │      Migration correctness assumed. Sync round-trip assumed.           │
  │      Architectural risk: the next refactor can break any of these     │
  │      invisibly. Documented as the recon load-bearing gap.              │
  │      See: .aipe/audits/recon-2026-06-04.md + .aipe/study-testing/      │
  │                                                                        │
  └────────────────────────────────────────────────────────────────────────┘

  ┌─ Tier 2 — significant but bounded today ──────────────────────────────┐
  │                                                                        │
  │  R4. FIRE-AND-FORGET SYNC AT 8 CALL SITES                              │
  │      pushChanges().catch(() => {}) everywhere a write happens.        │
  │      Callers can't surface sync state to the UI. No retry budget.     │
  │      Fix is structural: a sync engine layer between database.ts and  │
  │      supabase-sync.ts that owns the queue + retry + UI surface.       │
  │      Bounded today because: single user, opportunistic sync.          │
  │      See: .aipe/study-software-design/06-errors-and-special-cases.md  │
  │                                                                        │
  │  R5. INFO LEAKAGE AT THE PERSISTENCE/SYNC SEAM                         │
  │      Schema (database.ts), mapper (sync/mapper.ts), and types         │
  │      (types/index.ts) all encode the same field facts in three        │
  │      different conventions. Adding a column = 3-file diff.             │
  │      Fix: one FIELD_MAP source OR generate Supabase types.            │
  │      Bounded today because: schema is small (9 tables).                │
  │      See: .aipe/study-software-design/03-information-hiding-and-      │
  │           leakage.md                                                   │
  │                                                                        │
  │  R6. NO SECONDARY INDEXES ON HOT QUERIES                              │
  │      Implicit PK indexes only. "select * from sessions order by date  │
  │      desc" has no supporting index. At 1k sessions this is fine; at   │
  │      100k it's slow.                                                   │
  │      Fix: CREATE INDEX statements in migrate() per hot query.         │
  │      See: .aipe/study-data-modeling/ (full schema audit)               │
  │                                                                        │
  └────────────────────────────────────────────────────────────────────────┘

  ┌─ Tier 3 — note; revisit when scale changes ───────────────────────────┐
  │                                                                        │
  │  R7. SQL COLUMN-NAME INTERPOLATION IN updateUserLevel                  │
  │      `${category}_level` interpolated — gated only by TS type. Cheap  │
  │      fix: runtime whitelist map. Not biting today; will at multi-user. │
  │                                                                        │
  │  R8. NO RUNTIME SCHEMA VALIDATION ON SUPABASE RESPONSES               │
  │      mapper.fromRemote(r: any) — malformed cloud row crashes through  │
  │      JSON.parse. Bounded by "you control the cloud" today; ships as   │
  │      a real attack surface once RLS exists but is buggy.               │
  │                                                                        │
  │  R9. WATERMARK SCHEME IS SINGLE-WRITER                                 │
  │      Two-device concurrent writes are not handled. Phase 2A makes this │
  │      moot. Phase 4 multi-device makes it real.                         │
  │                                                                        │
  │  R10. restoreInProgress IS EPHEMERAL                                   │
  │      Module-global flag; lost on app restart. Force-quit mid-restore  │
  │      means next launch may not know restore was interrupted. Depends   │
  │      on pullRestoreIfFresh idempotency — bounded but worth a drill.    │
  │                                                                        │
  └────────────────────────────────────────────────────────────────────────┘
```

**Ranking summary:** R1 + R2 + R3 are the three load-bearing risks. R1 is Phase-4-lockstep work; R2 is the next failure-handling drill; R3 is the meta-risk that the other two can't be safely closed without it.

---

## Cross-links

- **Pattern walks (Pass 2):** [01](./01-local-first-canonical-with-cloud-mirror.md), [02](./02-on-device-ml-pipeline.md), [03](./03-reconstruct-on-reinstall.md), [04](./04-watermark-based-incremental-sync.md).
- **Foundation guides:** `.aipe/study-database-systems/` (storage engines), `.aipe/study-data-modeling/` (schema shape), `.aipe/study-distributed-systems/` (sync coordination semantics), `.aipe/study-runtime-systems/` (the threading model behind Flow B).
- **Adjacent audits:** `.aipe/study-software-design/` (module-level design), `.aipe/study-security/` (trust-axis view of the same boundaries), `.aipe/study-testing/` (the missing eval surface).
- **Drill writeups:** `.aipe/drills/failure-handling-sync-partial-failure.md` (R2 fix), `.aipe/drills/evals-pose-accuracy.md` (the first eval surface that closes R3).
