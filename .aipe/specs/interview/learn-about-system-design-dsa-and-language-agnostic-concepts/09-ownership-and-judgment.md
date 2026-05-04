# 9. Ownership and judgment

The non-obvious decisions, where senior thinking actually shows. For each: what I tried, what I rejected, what I chose.

**Session entry as JSON column, not a separate table.**
> Tried normalised. Rejected because every read needs all entries together and there's no cross-entry query I want. Chose embedded JSON. Cost: can't index on entry fields. Acceptable.

**Gate evaluation reads `hitTarget` per entry, not a `gates.json` rules table.**
> Originally had `gates.json` mapping (level, category) → required exercise IDs. Rejected once exercises moved to Notion: keeping a static rules file in lockstep with a remote-driven exercise list is a bug factory. Chose: every exercise contributes to cleanliness via its own `hitTarget`, and the gate rule reduces to "all entries hit." Removed `gates.json` and three dependent functions (see `AUDIT.md` "RESOLVED").

**Reinstall reconstruction triggered by `syncVersion` bump, not by DB-ready.**
> First version ran reconstruction on DB-ready. Bug: on a fresh install, DB is ready before sessions arrive, so reconstruction sees zero sessions and does nothing. Fix: trigger off `syncVersion` instead, which only bumps after a successful pull. Idempotence makes the re-run safe.

**The skill tree is on the Home tab, not its own tab.**
> Originally a separate tab. Rejected after using it: switching tabs to see your level, then back to log a workout, was four taps for what should be one. Inlined the tree under the week strip. The trade: Home is denser. Acceptable because density is a feature on a workout app — fewer taps to action.

**No Redux, no React Query.**
> Considered both. Rejected because three contexts + manual `syncVersion` invalidation cover every cross-cutting need today. The cost of either library is real (dev-time, bundle size, indirection) and the benefit is hypothetical at this scale.

**MAX_LEVEL = 5 is a hard cap.**
> Tried "level can grow unbounded." Rejected because the UI assumes a 5-row tree and adding a 6th row breaks the layout. Instead of generalising the tree, I capped the system. The trade: I can't ship "level 6" without a UI change. That's fine — adding a level is a content decision that should *force* a UI revisit anyway.

## Interview questions

**[mid] What's the hardest decision in the codebase?**

> Whether to store derived state at all. The arguments for: render performance, simpler hooks. The arguments against: it can drift from the source of truth and become a second database. I chose to store but treat it as a cache, with an explicit reconstructor as the contract. That decision is the one that almost everything in `src/lib/game/` is shaped around.

**[senior] What did you almost do but didn't?**

> I almost added a `users` table for multi-user support before realising the app is single-user-per-install with no auth. The Notion integration token *is* the auth — there's no scenario where two users share an install. So `user_profile` has one row. Adding a multi-user table would have multiplied join complexity for zero feature value. The thing I *would* still do: extract the rep-counter into its own package, because it's the most reusable piece of the codebase and the most self-contained. I haven't because I haven't needed to.

**[arch] What's the decision you're most likely to regret?**

> The 2-minute remote bias. It's a magic number, and magic numbers in conflict resolution are how silent data loss happens. I picked 2 because it felt right — clock skew is usually under a minute, two is a margin. If a real conflict happens *inside* the 2-minute window I will silently overwrite local with remote, even if local was newer-but-clock-skewed. The right thing is a vector clock or a Lamport timestamp, but Notion's API doesn't expose primitives I can use to build one. So I chose a pragmatic-but-fragile heuristic and I'd want to know what to replace it with the day this app gets a real backend.

## The hard question

**"Show me a part of this codebase you wish you'd written differently."**

> The `ExerciseEntry` shape. It carries both `actualReps[]` (an array per set) and `actualHoldSeconds[]` (the same shape for hold exercises). The `isHold` flag determines which one is meaningful, and the other is null/empty. I should have made it a tagged union: `{ kind: 'reps', actualReps: number[] } | { kind: 'hold', actualHoldSeconds: number[] }`. As is, the form code has `if (isHold) ... else ...` branches everywhere, and adding a third exercise type (asymmetric reps, time-under-tension) means another flag. I left it because changing the JSON shape touches the database, the mapper, the form, the result screen, and the camera HUD all at once. It's the right refactor but it's a 200-line refactor for negative line-count return today, so it sits on the audit. The lesson: the cost of wrong-shape data compounds. I should have caught this in the spec phase.
