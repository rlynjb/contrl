# Chapter 6 — The hard parts

This is the reflective chapter. Three prompts that interviewers use to surface what kind of engineer you are: the hardest bug you fixed, the part you're proudest of, the part you're least confident defending. They sound like soft questions. They are not soft questions. The way you answer the third one — "what's the part you'd least like me to drill into" — separates senior candidates from everyone else.

Most candidates fail in the same way: they either deflect ("nothing really, it all turned out pretty well") or they pick something trivial and call it "the hardest." Both register as evasive. The senior move is to pick something real, name what's actually hard about it, name your current honest grip on it, and let the interviewer decide whether they want to dig.

```
┌─ The confidence map of contrl's codebase ───────────────────────────────────────────────────┐
│                                                                                             │
│   HIGH CONFIDENCE — can defend in depth, can extend on the fly                              │
│   ────────────────────────────────────────────────────────────                              │
│                                                                                             │
│   ▓▓▓▓▓▓▓▓▓▓ Local-first architecture (SQLite source of truth, Supabase mirror)              │
│   ▓▓▓▓▓▓▓▓▓▓ Rep counter FSM + hysteresis tuning (you tuned α=0.4, 10°)                     │
│   ▓▓▓▓▓▓▓▓▓▓ Sync engine — pushChanges, pullRestoreIfFresh, restoreInProgress flag           │
│   ▓▓▓▓▓▓▓▓▓▓ Idempotent reconstruction (pure function, replay from session log)              │
│   ▓▓▓▓▓▓▓▓▓▓ Migration discipline (additive-only, PRAGMA table_info introspection)           │
│                                                                                             │
│   MEDIUM CONFIDENCE — can defend the surface, may hedge on internals                        │
│   ──────────────────────────────────────────────────────────────────                        │
│                                                                                             │
│   ▓▓▓▓▓▓▒▒▒▒ MediaPipe BlazePose internals (model architecture, training data)               │
│   ▓▓▓▓▓▓▒▒▒▒ WAL mode mechanics (you know the *why*; you didn't read the WAL paper)         │
│   ▓▓▓▓▓▓▒▒▒▒ React Native bridge perf at scale (you know it's ~528B/frame, not benchmarked) │
│   ▓▓▓▓▓▓▒▒▒▒ Supabase RLS policy specifics (designed Phase B at a high level)                │
│                                                                                             │
│   LOWER CONFIDENCE — owns the gap, "I don't know" recovery applies                          │
│   ────────────────────────────────────────────────────────────                              │
│                                                                                             │
│   ▓▓▓▒▒▒▒▒▒▒ ML/CRDT semantics for multi-device merge (Phase B/C; not designed in detail)   │
│   ▓▓▓▒▒▒▒▒▒▒ Phase 2C form classifier (planned; LightGBM via ONNX; not started)              │
│   ▓▓▓▒▒▒▒▒▒▒ Phase 4 LLM coaching agent (planned; 5 read-only tools; not started)            │
│   ▓▓▒▒▒▒▒▒▒▒ Bundle-size / cold-start metrics (haven't measured; not a constraint yet)       │
│                                                                                             │
│   ────────────────────────────────────────────────────────────                              │
│                                                                                             │
│   The map exists so you can choose where to lead. You lead into the high-confidence         │
│   territory and you have honest "I don't know" responses pre-loaded for the lower           │
│   confidence territory. The medium band is where the strong answers live — you know         │
│   enough to talk usefully, not enough to bluff into the model paper.                        │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

The point of this map is that you choose where to lead the conversation. When the interviewer asks "what's the hardest part?", you lead into high-confidence territory. When they ask "what's the part you'd least like me to drill into?", you point at a medium-confidence region and own it — not at a low-confidence region (you can't actually defend that), not at a high-confidence region (that's evasion).

---

## 6.1 — The hardest bug

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What's the hardest bug you fixed?"                                           │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you have a real story? Can you walk through symptoms → cause → fix at      │
│   the right altitude? Bonus signal: did the bug teach you something general     │
│   about the architecture? The strongest answers end with a generalizable        │
│   lesson, not just a patch.                                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "The pull-restore race in the sync engine. Symptoms: on reinstall, the user's data appeared correctly for a moment, then re-appeared duplicated under a stale USER_ID after the next push cycle.
>
> "The cause was order-of-operations between two things I'd designed separately. `pullRestoreIfFresh` writes rows to SQLite by calling the normal database writers — `db.upsertExercise`, `db.insertSession`, and so on. Every writer in `database.ts` has a fire-and-forget `pushChanges().catch(() => {})` at the end, because pushing on every write is the design. But during restore, the watermark `last_pushed_at` hadn't been set yet, so each triggered `pushChanges` ran with `since = null` — meaning 'everything since the beginning of time.' N concurrent pushes, each pushing all rows under whatever USER_ID was current at that moment.
>
> "The fix is two-part. A module-scope `restoreInProgress` flag in `supabase-sync.ts` that `pushChanges` checks at the top — early return if set. And the watermark calls happen *inside* the try block, *before* the `finally` clears the flag. So by the time the flag clears and normal pushes can run again, `since` is already 'now,' and the restore-written rows are older than 'now' — they don't qualify for push.
>
> "What it taught me: the writers shouldn't have called the sync engine directly. The coupling is what made the bug possible. A cleaner architecture has the writers emit events to a queue and the sync engine subscribe — then 'pause sync during restore' is the same primitive as 'pause the queue,' and the flag isn't needed. I left it as the flag because the fix works, but the refactor is on the list."

```
"What was the hardest bug?"
        │
        ▼
The pull-restore race + the architectural lesson it taught.
        │
        ├─► IF THEY ASK HOW LONG IT TOOK TO FIND
        │     "About a day. The symptom — duplicate rows tagged with
        │      stale USER_IDs — was visible in Supabase pretty quickly.
        │      The order-of-operations reasoning took longer. I traced
        │      it by adding a log line at the top of pushChanges and
        │      watching it fire N times during a single restore."
        │
        ├─► IF THEY ASK WHY IT WASN'T CAUGHT EARLIER
        │     "I tested pullRestoreIfFresh in isolation and pushChanges
        │      in isolation. They both worked. The bug was in their
        │      interaction at the watermark boundary — that's not the
        │      kind of bug a unit test catches; it needs an integration
        │      flow. I should have written that test before shipping,
        │      and didn't."
        │
        └─► IF THEY ASK WHAT YOU'D ADD NEXT
              "A pinned integration test that does: reset DB, run
               pullRestoreIfFresh against a fixture, assert no
               concurrent pushes fired, assert watermark is set, assert
               no duplicate rows appear after the next push cycle. The
               test exists in my head; it doesn't exist in the repo."
```

▸ The bug that teaches the architecture is the answer to this question. Pick the one with a generalizable lesson.

---

## 6.2 — The part you're proudest of

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What part of this are you proudest of?"                                      │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   What do you value as engineering? Do you pick the flashy feature or the       │
│   load-bearing infrastructure? The senior signal is that you pick something     │
│   *invisible* — a piece of architecture that does its job quietly — and you    │
│   explain *why* the invisible piece is the load-bearing one.                    │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "The idempotent reconstruction in `src/lib/game/reconstruct.ts`. It's a 72-line pure function — no I/O, no clock reads, no random IDs — that takes the session log and returns the user's levels and gate progress as if every session had been replayed live.
>
> "I'm proudest of it for two reasons. First, it's invisible. Most of the time it doesn't run — the local SQLite cache has the derived state already, and `pullRestoreIfFresh` populates it on reinstall. The reconstruction is the *fallback* when Supabase is unreachable during the first launch after a reinstall. That's the rare path, and it just works.
>
> "Second, the property that makes it work — purity — is what makes the whole local-first story defensible. Because the function never reads existing state, running it twice produces the same output as running it once. There's no 'amplification' concern: if it fires during a render race, nothing breaks. That property is what lets me trust the local SQLite cache. If the cache ever drifts, the reconstruction is the recovery path, and I know the recovery is deterministic.
>
> "What I'd change: the function doesn't currently checkpoint. At 50,000 sessions — about 50 years of daily training — replay would take ~300ms, visible in the post-install loading screen. The fix is a `state_checkpoints` table and replaying only the tail. I haven't built it because we're not close to that scale, but it's the natural next step."

┌─────────────────────────┬─────────────────────────────────┐
│ WEAK ANSWER             │ STRONG ANSWER                   │
├─────────────────────────┼─────────────────────────────────┤
│ "The rep counter — it's │ "The idempotent reconstruction. │
│ pretty cool that I got  │ It's a 72-line pure function    │
│ the camera and the FSM  │ that replays the session log    │
│ working together. The   │ deterministically. Most of the  │
│ skill tree UI is also   │ time it doesn't run — pull-     │
│ nice."                  │ restore handles reinstalls — but │
│                         │ the purity property is what     │
│                         │ makes the local-first cache     │
│                         │ trustable. Same input always    │
│                         │ produces the same output."      │
├─────────────────────────┼─────────────────────────────────┤
│ Why it's weak:          │ Why it works:                   │
│ "Pretty cool" is the    │ Picks an invisible piece — the  │
│ marketing tell. "Got    │ kind of thing only a senior     │
│ them working together"  │ engineer would name. Explains   │
│ describes effort, not   │ why the *property* (purity)     │
│ engineering. Two        │ matters more than the feature.  │
│ surface features        │ Connects the small piece to the │
│ named, no architectural │ whole architecture.             │
│ insight.                │                                 │
└─────────────────────────┴─────────────────────────────────┘

▸ The thing you're proudest of should be the thing only a senior engineer would notice.

---

## 6.3 — The part you're least confident defending

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What part of this would you least like me to drill into?"                    │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   This is the hardest question in the chapter. They're looking for self-       │
│   awareness without collapse. The candidate who deflects ("nothing really")     │
│   fails. The candidate who picks something low-confidence and rambles fails.    │
│   The candidate who picks something *medium*-confidence, names what they know   │
│   and what they don't, and offers a way to dig in — wins.                       │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Phase 2C — the planned form classifier. I've scoped it carefully but I haven't started it. The plan is a small LightGBM model trained on a feature vector derived from the pose landmarks — joint angle deltas, hold durations, range-of-motion features — exported to ONNX for on-device inference. I know the eval discipline (holdout, regression cases, adversarial set), I know the audit-trail discipline (a `classifier_outputs` table logging every prediction with the feature vector), and I've sketched the integration point in the FSM.
>
> "What I don't have is hands-on experience with LightGBM specifically, with ONNX runtime perf on mobile specifically, or with the feature engineering for body-pose classification specifically. I'd be working through a tutorial in real time during Phase 2C.
>
> "That's the part I'd least like you to drill into mid-interview, because beyond the architecture-level decisions, my answers thin out fast. If you do drill, the honest version is: I know what I'd build, I haven't built it. The good thing is that the architectural surface — where it integrates, what it logs, how it's evaluated — is well-defined and defensible. The internals of the model are the gap.
>
> "If we have time to dig in, I'd rather walk you through the audit-trail schema and the eval-set design, which I *can* defend. Want to do that, or somewhere else?"

The right move here is to **name what you don't know, name what you *do* know in that same territory, and offer a path you can actually walk**. You're not pretending to be confident; you're not collapsing into "I don't know"; you're showing the interviewer where the conversation could go productively.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHEN YOU DON'T KNOW                                                           ║
║                                                                               ║
║   They drill anyway: "How would you choose your LightGBM hyper-               ║
║   parameters? Walk me through learning rate, max depth, num leaves."          ║
║                                                                               ║
║   You haven't tuned LightGBM hyperparameters in production. You've            ║
║   read the docs.                                                               ║
║                                                                               ║
║   Say:                                                                        ║
║   "I haven't tuned LightGBM hyperparameters in production. The shape          ║
║    I'd reach for: small dataset means low max_depth (~6) to avoid             ║
║    overfit; class imbalance might be present in form-error data, so           ║
║    `is_unbalanced` or `scale_pos_weight` would be on the table; learning      ║
║    rate ~0.05 with early stopping on the validation set. That's the           ║
║    starting grid from the docs, not from my own measurements. The first       ║
║    real run would tell me where to focus. Is this the depth of detail         ║
║    you wanted, or did you want to dig into something specific?"               ║
║                                                                               ║
║   What this signals:                                                          ║
║   - you can name the relevant *parameters* (proves you read the docs),        ║
║   - you're explicit that you haven't measured them,                           ║
║   - you give an honest starting point ("the docs' grid"),                     ║
║   - you redirect to where you can be more useful.                             ║
║                                                                               ║
║   Do NOT say:                                                                 ║
║   "Yeah I'd probably do like learning rate 0.1, max depth 8, num leaves       ║
║    around 30 — those are good defaults."                                      ║
║   Fake-confident numbers on a topic you haven't tuned signals "candidate     ║
║   bluffs under pressure." Lose-condition.                                     ║
╚═══════════════════════════════════════════════════════════════════════════════╝

▸ Naming the gap is a senior signal. Rambling past the gap is the failure pattern.

---

## 6.4 — How to lead the conversation away from a weak spot

```
"What's the part you'd least like me to drill into?"
        │
        ▼
You name the planned Phase 2C / Phase 4 work. Architectural depth = high; internals = low.
        │
        ├─► IF THEY DRILL ANYWAY
        │     Be honest about the depth gap. Name what you *can*
        │     defend at the architectural surface (eval discipline,
        │     audit-trail logging, integration point). Offer the
        │     stronger conversation as an alternative.
        │
        ├─► IF THEY REDIRECT TO ARCHITECTURE
        │     Walk through the audit-trail design or the eval set
        │     design. Both are defensible because both are
        │     architectural, not internal.
        │
        └─► IF THEY ACCEPT THE FRAMING AND MOVE ON
              You handed them three things to ask about (architecture,
              eval, audit trail) and pulled them away from internals.
              Take the win and stay sharp on the next question.
```

The senior move is to offer a redirect that's productive, not evasive. "I can't go deep on LightGBM tuning — let's go deep on the eval set design instead" is a strong offer. "Let's not talk about the ML" is an evasion. The difference is whether you give the interviewer something useful in exchange for the redirect.

▸ A good redirect gives the interviewer something better. A bad redirect just steers them away.

---

## What you'd change

If you were re-doing the hard-parts narrative from scratch today, the change is **scope the planned Phase 2C and Phase 4 work even more explicitly in the README**. Today they're listed as "planned" in `aieng-curriculum.md`, but a reader (or interviewer) might not know exactly what's shipped versus scoped. The clarifying move is a one-paragraph "Status" section in the project README naming the three layers (shipped CV, planned ML, planned LLM) and the line between them. That makes the conversation easier for both sides — you're not defending implementations that don't exist, and they're not probing into them by accident.

▸ Make the line between "shipped" and "scoped" explicit. It's the kindest thing you can do for the interview.

---

## One-page summary

**Core claim:** Pick the right thing to be proud of (the invisible load-bearing infrastructure, not the flashy feature). Pick the right bug to defend (the one that taught you a generalizable lesson). Pick the right weakness to name (medium-confidence territory you can talk usefully about, not low-confidence territory you'd freeze on).

**Questions covered:**
- "What was the hardest bug?" → The pull-restore race. Order-of-operations between two separately-designed pieces. Fix: `restoreInProgress` flag + watermark-inside-try. Lesson: the writers shouldn't have called sync directly.
- "What are you proudest of?" → The idempotent reconstruction. 72-line pure function. Purity property is what makes the local-first cache trustable.
- "What would you least like me to drill into?" → Phase 2C form classifier. Architecture defensible; LightGBM internals are the gap. Offer audit-trail or eval-set design as the productive dig.
- "Walk me through LightGBM hyperparameters." (drill) → Name the relevant params from docs, be explicit you haven't tuned them in production, offer to redirect to architecture.

**Pull quotes:**
- "The bug that teaches the architecture is the answer to 'what's the hardest bug?'"
- "The thing you're proudest of should be the thing only a senior engineer would notice."
- "Naming the gap is a senior signal. Rambling past the gap is the failure pattern."
- "A good redirect gives the interviewer something better. A bad redirect just steers them away."

**What you'd change:** Make the line between "shipped" (CV + local-first + sync) and "scoped/planned" (Phase 2C ML, Phase 4 LLM) explicit in the README. Reduces accidental probing into territory you haven't built.
