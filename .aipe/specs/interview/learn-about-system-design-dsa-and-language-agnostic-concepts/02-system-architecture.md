# 2. System architecture

contrl is a single-binary Expo app. There is no server I own. The architecture is *local-first*: SQLite is the primary data store, the UI reads from it through React contexts, and Notion is treated as a peer replica — not a backend. That choice was deliberate. A bodyweight workout happens in a basement, on a phone with no LTE, and the user's expectation is that tapping checkboxes works whether or not the network exists.

The trade is real. I gave up server-side validation, server-side computation, and the ability to ship a fix to gate logic without a store update. I got back: zero hosting cost, full offline functionality, no auth flow, and a sync model where Notion doubles as the user's data export.

```
                 ┌──────────────────────────────────┐
                 │         Expo Router shell        │
                 │       app/_layout.tsx            │
                 └─────────────┬────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  (tabs)/     │       │  log/[cat]   │       │  settings/   │
│  home,       │       │  workout +   │       │  Notion cfg  │
│  history     │       │  result      │       │  + sync      │
└──────┬───────┘       └──────┬───────┘       └──────┬───────┘
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              ▼
              ┌────────────────────────────────┐
              │      React contexts/hooks       │
              │  useGameState, useExerciseForm, │
              │  NotionSyncContext, useDatabase │
              └───────────────┬─────────────────┘
                              ▼
              ┌────────────────────────────────┐
              │       src/services/             │
              │   database.ts (SQLite CRUD)     │
              │   notion/{api,sync,mapper,cfg}  │
              └───────┬───────────────┬─────────┘
                      ▼               ▼
              ┌──────────────┐  ┌─────────────┐
              │ expo-sqlite  │  │  Notion API │
              │  (on-device) │  │   (peer)    │
              └──────────────┘  └─────────────┘

              Side pipeline (frame-rate, JSI worklet):

              vision-camera frames ──▶ MediaPipe pose
                                           │
                                           ▼
                                    landmarks (33pt)
                                           │
                                           ▼
                                  src/lib/pose/angles.ts
                                           │
                                           ▼
                              src/lib/pose/rep-counter.ts
                              (FSM: idle→ready→down→bottom→up)
                                           │
                                           ▼
                                useExerciseForm (JS thread)
```

## Interview questions

**[mid] Walk me through what happens when the app cold-starts.**

> The root layout in `app/_layout.tsx` mounts `useDatabase` first, which opens the SQLite connection in `src/services/database.ts`, runs additive migrations, and seeds exercises from `src/data/exercises-seed.json` if the table is empty. Once the DB is ready, `useGameState` runs its first `load()` — pulling user, sessions, gates, and the current week into context. On a cold app this fires before any session data arrives, so the reinstall detector deliberately sees zero sessions and skips reconstruction. In parallel, `NotionSyncContext` checks whether Notion is configured and auto-sync is enabled; if so it calls `syncNow()`, which on completion bumps `syncVersion`. That bump triggers `load()` again. *That* second pass is the one where reconstruction runs. The two-phase load is deliberate — I'll defend it in chapter 5.

**[senior] Why local-first instead of a thin client + server?**

> Three reasons, ranked. First, the offline use case isn't a bonus, it's core: the app must work in a gym basement with no signal. Second, I'm one engineer; running a server means hosting, auth, schema migrations, and a deploy story I'd have to maintain alone. Third, Notion already gives me a free, structured, human-editable replica that doubles as data export and a settings UI. The trade I accepted: I can't ship a logic fix without a store update, and I can't run server-side validation. I mitigated the second by keeping all derived state in pure functions in `src/lib/game/` so I can unit-test it offline and trust the same code that runs on device.

**[arch] What breaks first if this app gets to 100k users?**

> The Notion sync is the bottleneck — it was designed for a single-user, ~hundreds-of-sessions-per-year load. At 100k users it doesn't break technically (each user has their own integration), but operationally it's wrong: Notion's per-integration rate limit is per workspace, and the 350ms throttle in `src/services/notion/api.ts` exists for one user. If I were redesigning at that scale, the answer is a real backend that owns the sessions table, with Notion demoted from "peer replica" to "optional export." The local-first SQLite stays — it remains the right primary store — but `sync.ts` becomes a client that talks to *my* server, which then asynchronously fans out to whichever export integrations the user enables. That's also when I'd add real auth, real conflict resolution semantics (vector clocks, not last-edit-wins with a 2-minute fudge), and a proper analytics pipeline.

## The hard question

**"You're calling Notion a 'peer replica' but you're also calling it the source of truth for exercises. Pick one."**

> Both are true and the contradiction is the point. *Reference data* (exercises) is one-directional: Notion is canonical, the local DB is a read-through cache. The pull step in `services/notion/sync.ts` upserts every remote exercise then prunes any local rows that no longer exist remotely — that's a master/replica relationship. *User-generated data* (sessions) is bidirectional with conflict resolution — that's a peer relationship. Calling the whole thing "peer-to-peer" or "master/replica" flattens a distinction that actually matters: the consequence of "Notion is canonical" is that I can confidently delete local exercises, and the consequence of "sessions are peer" is that I cannot. The two tables have different sync rules because they have different ownership semantics. If I'd treated them uniformly I'd either be losing user-edited session data on every pull, or accumulating zombie exercise rows forever.
