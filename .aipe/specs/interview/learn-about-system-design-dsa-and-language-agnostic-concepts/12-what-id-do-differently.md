# 12. What I'd do differently

Honest retrospective. The structure: things I'd change today; things that were the right call at the time but aren't now; things I'd leave alone.

**I'd change today:**
- **Remove or fix `sessions.passed`.** Three sources of truth for a derived boolean. Either delete the column and always recompute, or guarantee it's set on insert. I left it because the audit caught it after the fact and the fix touches the sync mapper.
- **Add error boundaries on every screen.** The Home screen rendering null on error is a real bug. Half-day fix, deferred for shipping.
- **Tag `ExerciseEntry` as a discriminated union.** The `isHold` flag plus parallel arrays is a shape I'd design out of existence in v2.

**Right at the time, would change now:**
- **The 2-minute remote bias.** Pragmatic on Notion's API; would replace with a proper version field on a real backend.
- **`AUDIT.md` as a markdown file.** Borderline — issue tracker is the right home. Kept it as markdown for git checkpointing, but I'd revisit once the gap list grows past 20 items.
- **No automated test suite.** The reconstructor and the FSM both deserve unit tests. I have neither because building them mid-flight kept feeling like overhead. It isn't — the day I shipped reconstruction I should have shipped tests for it.

**I'd leave alone:**
- **Local-first architecture.** Right call, would make it again.
- **Three-context state model, no Redux.** Right size for the problem.
- **JSON-column session entries.** Denormalised on purpose; no query I'd run on the normalised form.
- **MAX_LEVEL = 5 hard cap.** A level-add should force a UI revisit anyway.
- **Spec-driven workflow.** The single biggest leverage in the codebase.
