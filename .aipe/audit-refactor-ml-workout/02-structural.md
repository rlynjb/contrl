## Chapter 2 — Structural refactors

Larger scope than Chapter 1: changes that move code across file or module boundaries, change which thing depends on which, or separate two concerns that currently live in one place. Higher risk, but with much bigger leverage. This is the highest-stakes chapter in the book for this codebase.

### Map of the territory

- **Extract Module / Package** — **DEEP**: `src/services/database.ts` is 679 lines and does six entities + migrations + sync state + tombstones.
- **Inline Module / Class** — **DEEP**: four files (`ExerciseForm.tsx`, `SessionResult.tsx`, `session-helpers.ts`, `GlowCard.tsx`) are unreferenced from the live screens. Cull or commit.
- **Invert Dependency** — BRIEF: `database.ts` → `pushChanges` → `database.ts` is a near-cycle that works because of module-init order.
- **Hide Delegate** — NOT FOUND.
- **Separate Pure from Effectful** — **DEEP**: every db writer in `database.ts` ends with `pushChanges().catch(() => {})`.
- **Introduce Boundary / Anti-Corruption Layer** — BRIEF: `services/sync/mapper.ts` is already this; opine on its quality, not its existence.

### DEEP — Inline Module: kill the shadow components

**Where it shows up** (neutral)
- `src/components/ExerciseForm.tsx` (296 lines) — exports `ExerciseForm`, imported by no live screen.
- `src/components/SessionResult.tsx` (183 lines) — exports `SessionResultView`, imported by no live screen.
- `src/lib/session-helpers.ts` (50 lines) — exports `getGapText`, `getCompletionMessage`, imported only by `SessionResult.tsx`.
- `src/components/ui/GlowCard.tsx` (51 lines) — exports `GlowCard`, imported by no live screen.

Verified via `grep -rn "ExerciseForm\b\|SessionResultView\b\|GlowCard\b" --include="*.ts" --include="*.tsx"` — only self-references and the hook `useExerciseForm` (a distinct, live module).

The live `app/log/[category].tsx` renders the form and the result phase inline in one 1,200-line file. The four dead modules above are the structurally factored version of exactly that screen — they're what the screen *could* be, and once was, and almost was, and isn't.

**Why it's like this** (neutral)
The factored components likely came first; the screen was inlined later (perhaps to add features fast, perhaps to fight prop-drilling, perhaps because pose-camera coordination wanted access to multiple bits of form state at once). The factored versions weren't deleted because they still compile. There is no `git log` evidence in the prompt-visible history, but the shape is unambiguous.

**Take**
This is the single highest-leverage change in the codebase. Not because the dead code is hurting performance — it isn't, it isn't even bundled into screens — but because **it changes what the reader believes is in the repo.** A reader who opens `src/components/ExerciseForm.tsx` reasonably assumes it's the form, written here, used by screens. It isn't. Every minute you spend reading it is a minute spent reasoning about software that doesn't run. Worse, it sets up a "should we use this?" decision on every future change to logging that will get re-litigated by every new contributor (including future-you).

You have two honest options. **Either** delete `ExerciseForm.tsx`, `SessionResult.tsx`, `session-helpers.ts`, and `GlowCard.tsx`, accept that `log/[category].tsx` is the screen, and lean into making that screen as clean as a single-file screen can be (see Chapter 01's Extract Function opportunities). **Or** restore the factored architecture: make `log/[category].tsx` a thin router between `<ExerciseForm />` and `<SessionResultView />`, port `getMessage` into `session-helpers.ts`, delete the inline render functions from the screen. Either is defensible. The third option — leave it as is — is the one I'd push back on.

**The tradeoff**
Delete-path cost: ~580 lines of code go away, plus one `getCompletionMessage`/`getMessage` deduplication to do separately. Reconnect-path cost: the live screen is 1,200 lines and needs to be split, which is a real refactor (a few hours, careful diff review). **Breakpoint:** if the live `log/[category].tsx` is going to keep growing (gate-criteria UI, social sharing, AI-assisted form review), reconnect. If it's stable at "log a workout and see results," delete.

**What I'd watch for**
The dead components are subtly different from the live screen. `ExerciseForm.tsx` doesn't render the per-set hit/miss visual progress bar. `SessionResult.tsx` doesn't render the per-exercise short-set breakdown. If you reconnect, you'll be merging features back in, not just rewiring imports. Plan for that.

**Verdict:** Worth doing. If unsure which path, default to delete — locality of behaviour beats restoring a half-finished split.

### DEEP — Extract Module: `database.ts` → migrations + per-entity repositories

**Where it shows up** (neutral)
`src/services/database.ts` (679 lines) does:
- Lines 17–212: `getDatabase()`, `migrate()`, `seedExercisesIfEmpty()` — schema evolution and seeding.
- Lines 236–269: user CRUD.
- Lines 271–367: exercises CRUD (`getExercises`, `getExercisesByCategory`, `deleteSession` [misplaced — see below], `deleteAllExercises`, `deleteExercisesNotIn`, `upsertExercise`).
- Lines 369–430: sessions CRUD.
- Lines 432–488: gate progress CRUD.
- Lines 490–552: week progress CRUD.
- Lines 554–587: drafts CRUD.
- Lines 589–610: sync state CRUD.
- Lines 612–636: tombstones (`recordTombstone`, `getPendingTombstones`, `clearTombstones`).
- Lines 642–679: sync meta and `clearLocalForRestore`.

`deleteSession` at line 315 lives inside the "Exercises" section header. That's symptomatic of the file having grown past the point where the section headers are guiding the reader.

**Why it's like this** (neutral)
The natural shape of a small Expo app is "one services file per side effect" — there's one SQLite database, so there's one `database.ts`. The file grew with each new entity. The migration block grew with each schema change. Both were correct individually; nobody re-bound the boundaries.

**Take**
Two splits make the file readable again, and they have very different scopes:

1. **Extract `src/services/database/migrations.ts`.** This is the cheap one. Move `migrate()`, `seedExercisesIfEmpty()`, and the schema DDL into their own file. The runtime CRUD never reads or writes migration logic; the migration logic only runs once per app open. They share nothing except the `SQLiteDatabase` handle. The file shrinks by ~200 lines and gains a clear "schema evolution" surface.

2. **Extract `src/services/database/{user,exercises,sessions,gates,weeks,drafts,sync}.ts`.** This is the bigger one. Each entity gets its own file with its own row type, `rowTo*` mapper, and CRUD. The shared `getDatabase()` and the `pushChanges().catch(() => {})` boilerplate live in a `_common.ts` (or the writer-wrapper from the next DEEP section).

The first split is worth doing. The second one I'd defer until the third entity gets added (probably "challenges" or "social posts" if this app gets there).

**The tradeoff**
Cost of (1): ~30 minutes, one new file, no behaviour change. Cost of (2): a few hours, seven new files, lots of import lines updated, real review surface. Cost of doing neither: every future migration adds another `getAllAsync` + `if (!cols.has(...)) ALTER TABLE` block to a file that already has too many of them, and the next reader has to scroll past it to find the CRUD they actually came for.

**What I'd watch for**
The migration block has tricky parts that you don't want to perturb: the Sun→Mon `week_progress` rekey (lines 133–149), the `sync_deletions.notion_page_id` NOT-NULL detect-and-rebuild (lines 151–173), and the dual seeding of `sync_state` and `sync_meta` defaults. None of these are bugs — they're load-bearing for users upgrading from earlier versions. When you move them, *don't reorder them*. The rekey runs after the `ALTER TABLE` migrations because it reads rows that the alters made addressable. Preserve that.

**Verdict:** Worth doing the migrations split now. Worth doing the per-entity split eventually — not yet.

### DEEP — Separate Pure from Effectful: the `pushChanges().catch(() => {})` boilerplate

**Where it shows up** (neutral)
Eight call sites in `src/services/database.ts`, each immediately after an `INSERT`/`UPDATE`/`DELETE`:
- L268 `updateUserLevel`, L319 `deleteSession`, L329 `deleteAllExercises`, L343 `deleteExercisesNotIn`, L366 `upsertExercise`, L388 `insertSession`, L487 `updateGateProgress`, L551 `updateWeekProgress`.

Each writer mixes a local SQLite mutation with a fire-and-forget call to `pushChanges()` from the sync module. The `.catch(() => {})` is the muffler: if sync isn't configured, or it fails, the local write still succeeded.

**Why it's like this** (neutral)
The local-first invariant ("every change must eventually push") is true and important. The cheapest way to enforce it is to make every writer responsible for triggering its own push. That's where the boilerplate came from, and it works — the invariant holds.

**Take**
Two problems with the current shape:

(a) **It couples the persistence layer to the sync layer.** `database.ts` imports `pushChanges` from `./sync`. The sync module imports `* as db` from `../database` (or `@/services/database`). That's a static near-cycle that resolves because Node/Metro evaluates `index.ts` lazily and `pushChanges` is only called at runtime, not at module load. It works. It's also the kind of pattern that bites the moment somebody renames a barrel or reorders a file.

(b) **It puts the same five-character incantation in eight places.** That's not just DRY noise — it's a place where every writer has to remember to do the thing. Adding a ninth entity means adding the ninth `pushChanges().catch(() => {})` *and* not forgetting it.

The cleanest fix is a **Decorator** on the database writers: a `withSync<T extends (...args: any[]) => Promise<any>>(fn: T): T` that wraps any writer and fires `pushChanges()` afterward. Or, more in the spirit of the existing codebase, a **publish/subscribe** model: writers call `db.notifyWrite()` (a one-liner), sync subscribes once to `notifyWrite` at module load. Both centralize the rule. Both also remove the import cycle: the writer no longer knows about sync, only about a local pub/sub bus.

The cheapest fix is a single helper: `async function commit<T>(fn: () => Promise<T>): Promise<T> { const r = await fn(); pushChanges().catch(() => {}); return r }`. Every writer wraps its body in `return commit(async () => { ... })`. Same coupling, same boilerplate, fewer characters — but it doesn't earn the structural points the first two would.

**The tradeoff**
Cost of the Decorator: one new file, eight call sites changed. Cost of the pub/sub: one new file, eight call sites changed, one new subscriber registration in `_layout.tsx` or sync's init. Cost of the helper: nothing structural; trivial. Cost of doing nothing: the import near-cycle stays, and the rule lives in eight places.

**Breakpoint:** when the second side effect lands. The moment you want analytics or background reconciliation to also fire on writes, the pub/sub becomes the right answer regardless of whether sync alone justified it.

**What I'd watch for**
The `restoreInProgress` flag in `supabase-sync.ts:32` short-circuits `pushChanges` during pull-restore — that's why every writer can naively call push without worrying about thrashing the network during restore. Whatever shape you migrate to, preserve that contract. If you go pub/sub, the sync subscriber checks `restoreInProgress` and returns early; if you go Decorator, the decorator does. Don't accidentally move the check out of where it can no-op the fan-out.

**Verdict:** Worth doing eventually — pub/sub model when the second consumer appears, helper extraction now if you want the small win.

### BRIEF — Invert Dependency: database ↔ sync

`src/services/database.ts:2` imports `pushChanges` from `./sync`. `src/services/sync/supabase-sync.ts:1` imports `* as db` from `@/services/database`. It's not a hard cycle (TypeScript resolves it lazily because `pushChanges` is only called at runtime, not in module-init), but it's a tight handshake between two layers that "should" point one direction.

**Take + Verdict:** Worth fixing as part of the Separate-Pure-from-Effectful DEEP above. The pub/sub model breaks the cycle by introducing a bus that neither module owns — `database` exports `onWrite(cb)` or `notifyWrite()`, `sync` subscribes once. Don't do this as a standalone refactor — fold it into the larger work.

### BRIEF — Introduce Boundary: `services/sync/mapper.ts`

`src/services/sync/mapper.ts` is already a clean Anti-Corruption Layer between domain types (`WorkoutSession`, `Exercise`, etc.) and Supabase row shapes (`user_id`, `exercises_json`, `last_session_date`). Each entity has matched `toRemote`/`fromRemote` functions.

**Take + Verdict:** Don't refactor it, but read it as a model for how a boundary should look — it's small, it's symmetric, it's the only place where snake_case lives in the codebase, and it absorbs the legacy `notionPageId` ghost by always setting it to `null` on the way back from remote. The pattern is correct. The only critique is that the `r: any` parameter types on the `fromRemote` functions throw away the Supabase row type contract; tightening those (e.g. with a typed Supabase client or a hand-rolled `RemoteSessionRow` type) would be a small Chapter 01 Extract-Type. Worth doing — call it out, but it's BRIEF, not DEEP.

### Chapter close

**Take:** This is the chapter the codebase needs most. Composition cleanups (Chapter 01) are valuable and cheap, but they don't change the codebase's shape. The structural moves here — kill the shadow components, split the migrations out of `database.ts`, decouple write-then-push from the writer — change which decisions live where, and they're the difference between "this codebase is a small app that works" and "this codebase scales to the next feature without compounding tax." Of the three DEEPs, the shadow-component decision is the one I'd make first, because it's a one-week change that *clarifies what the codebase even is.* The other two are larger but more amenable to "carve off when it touches your current PR."
