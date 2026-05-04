# Appendix — Complexity cheat sheet

Every major data operation in the app, with current complexity and 10x-scale assessment.

| Operation | Where | Time | Space | Holds at 10x? |
|---|---|---|---|---|
| Insert session | `database.ts:insertSession` | O(1) | O(1) | Yes |
| Load all sessions | `database.ts:listSessions` | O(n) | O(n) | Yes (paginated read needed) |
| Group sessions by week | `app/(tabs)/history.tsx` | O(n) | O(n) | Yes |
| Filter sessions by category | UI/derivation | O(n) | O(n) | Yes (add index if hot) |
| Gate evaluation (online) | `gate-check.ts` | O(1) | O(1) | Yes |
| Gate reconstruction (offline) | `reconstruct.ts` | O(n log n) sort + O(n) replay | O(1) | Yes |
| Week progress recompute | `week-progress.ts` | O(n) over current week | O(1) | Yes |
| Streak recompute | `streaks.ts` | O(w) where w = weeks tracked | O(1) | Yes |
| Skill-tree render | `SkillTree.tsx` | O(n) index build + O(15) render | O(g) | Yes |
| Sync merge (sessions) | `notion/sync.ts` | O(n + m) with Map | O(n + m) | Yes |
| Sync prune (exercises) | `notion/sync.ts` | O(n + m) with Set | O(n + m) | Yes |
| Notion paginated pull | `notion/api.ts` | O(n) over n records, throttled to 350ms/req | O(page) | No — at 10x users the per-workspace rate limit dominates; need a real backend |
| Pose smoothing per frame | `pose/angles.ts` | O(1) | O(1) | Yes |
| FSM transition per frame | `pose/rep-counter.ts` | O(1) | O(1) | Yes |
| Draft autosave | `useExerciseForm` | O(1) debounced | O(1) | Yes |
| Save session + update gate | `database.ts` (txn) | O(1) | O(1) | Yes |

**Where the system is sublinear-bounded today and stays sublinear:** anything inside the runtime hot path (rendering, FSM, gate evaluation, draft save). These were written with the expectation that they'd run thousands of times a session.

**Where the system is linear today and degrades at scale:** session list loads, week grouping, reconstruction. All linear in total session count. At 10x — a power user with 5+ years of history — these are still well under 100ms on a modern phone but I'd add lazy windowing on the History screen.

**Where the system breaks at scale:** the Notion sync. Not because of algorithmic complexity — that part is fine — but because Notion's per-workspace rate limit becomes the bound when one integration is doing real volume. The fix is architectural (a real backend that fans out to Notion async), not algorithmic.
