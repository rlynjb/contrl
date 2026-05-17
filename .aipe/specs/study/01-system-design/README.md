# 01 — System design

Architectural patterns in contrl. Read top-down: each file is self-contained but the order reflects dependencies.

## The 6-step mental checklist

Every system-design pattern in this codebase lives in one or more of these steps:

| Step | Question | Patterns that live here |
|---|---|---|
| **1. Data model** | What does state look like, where does it live? | local-first, sqlite-as-source-of-truth, derived-state |
| **2. Request / response flow** | How does data move from caller to callee? | bidirectional-sync, pose-detection-pipeline, react-context-and-sync-versioning |
| **3. Caching layers** | What's cached and what's authoritative? | debounced-draft-autosave |
| **4. State ownership** | Who decides what's true? | local-first, derived-state, reconstruction-on-reinstall, react-context-and-sync-versioning |
| **5. Failure handling** | What happens when things go wrong? | bidirectional-sync, conflict-resolution-last-edit-wins, rate-limiting-and-backoff, debounced-draft-autosave, reconstruction-on-reinstall, sqlite-as-source-of-truth |
| **6. Scale concerns** | What breaks at 10×? | rate-limiting-and-backoff |

If a pattern crosses two steps, it's listed in both. A pattern with no step is either trivia or wrong; every architectural concept should ground in at least one.

## File index

- **[01-local-first-architecture](./01-local-first-architecture.md)** — SQLite as source of truth; Notion as mirror; reads never hit the network. (steps 1, 4)
- **[02-sqlite-as-source-of-truth](./02-sqlite-as-source-of-truth.md)** — embedded SQLite, WAL mode, application-managed additive migrations, no ORM. (step 1)
- **[03-bidirectional-sync](./03-bidirectional-sync.md)** — fixed 4-step pipeline: pull exercises → pull sessions → push sessions → archive deletions. (steps 2, 5)
- **[04-conflict-resolution-last-edit-wins](./04-conflict-resolution-last-edit-wins.md)** — LWW with 2-min Notion-side bias absorbs the API's write-back jitter. (step 5)
- **[05-derived-state](./05-derived-state.md)** — gates, levels, weeks, streaks never sync; they're always computed from sessions. (step 4)
- **[06-reconstruction-on-reinstall](./06-reconstruction-on-reinstall.md)** — pure idempotent replay of session history; fires on the freshly-initialized fingerprint. (steps 4, 5)
- **[07-pose-detection-pipeline](./07-pose-detection-pipeline.md)** — camera → GPU-delegated MediaPipe → JS-side per-exercise FSM. (step 2)
- **[08-rate-limiting-and-backoff](./08-rate-limiting-and-backoff.md)** — 350ms client-side throttle + bounded retry + `Retry-After` honoring on every Notion call. (steps 5, 6)
- **[09-react-context-and-sync-versioning](./09-react-context-and-sync-versioning.md)** — monotonic `syncVersion` counter + `useEffect` watching it; the connective tissue between sync engine and UI. (steps 2, 4)
- **[10-debounced-draft-autosave](./10-debounced-draft-autosave.md)** — 500ms trailing debounce on form changes; `INSERT OR REPLACE` on the `drafts` table. (steps 3, 5)

## Full system map

The diagram in [`../00-overview.md`](../00-overview.md) is the load-bearing visual for this section. Every per-pattern diagram drills into a layer of that map.

## Where to drill in

- Need to understand sync end-to-end? Start at **03-bidirectional-sync**, then **04-conflict-resolution-last-edit-wins**, then **08-rate-limiting-and-backoff**.
- Need to understand state ownership? Start at **05-derived-state**, then **06-reconstruction-on-reinstall**.
- Need to understand the camera pipeline? Start at **07-pose-detection-pipeline**.
- Need to understand how the UI knows data changed? **09-react-context-and-sync-versioning**.
