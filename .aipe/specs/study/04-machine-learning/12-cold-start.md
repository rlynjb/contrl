# Cold-start

**Industry name(s):** Cold-start problem, bootstrap problem, day-one recommendation
**Type:** Industry standard

> Day one, the user has no history. The recommender has nothing to learn from. The fix: rule-based defaults until enough sessions accumulate, then switch to the learned model.

**See also:** → [11-recommender-framing](./11-recommender-framing.md) · → [10-ab-testing-single-user](./10-ab-testing-single-user.md)

---

## Why care

Every recommender's worst day is day one. There's no signal to recommend from. Solutions range from "show popular items" (collaborative cold-start) to "ask the user a few questions" (content-based onboarding). Knowing the strategies and picking the right one matters more than any sophistication in the learned model.

The pattern is **cold-start handling** — explicit rules for the no-data regime. Universal across recommender systems; the right strategy depends on whether you're cold-starting users or items.

---

## How it works

Two cold-start types, one threshold-based dispatcher.

### Type 1 — User cold-start

Brand new user, no history. The system doesn't know their preferences.

Strategies:
- **Defaults.** Show "popular" items (popular among other users, if collaborative; popular by item attributes if content-based).
- **Onboarding questions.** Ask the user explicitly: "What's your goal? What's your current level?"
- **Implicit signal.** Use coarse signals available at signup (device, locale, app-install source) to bias defaults.

### Type 2 — Item cold-start

New item added, no engagement history. Pure collaborative filtering can't recommend it. Content-based handles it because item features exist.

### contrl-mo's cold-start

User cold-start applies (single user, day-one install). Item cold-start doesn't really apply because exercises are pre-seeded with rich features.

```typescript
function recommend(userState: UserState): Recommendation {
  if (userState.sessionCount < 5) {
    return ruleBasedRecommendation(userState);  // cold-start path
  }
  return learnedRecommendation(userState);       // warm path
}
```

The threshold (5 sessions) is product policy. Below that, no learned model can do better than rules — there isn't enough signal. Above that, the learned model may start adding value (validated via [10-ab-testing-single-user](./10-ab-testing-single-user.md)).

### Move 2.5 — What the rule-based fallback looks like

For a brand-new user (level 1, no sessions):
1. Recommend the L1 starter exercise for the category they pick.
2. If they pass, recommend the same exercise next time (build the gate).
3. If they fail, recommend the same exercise with `note: 'try scaling down'`.

Pure rules over the gate state. No model required.

### Move 3 — The principle

You can't learn from no data. The fix is rules that don't need data — and an explicit threshold for when learning kicks in. Pretending the cold-start away (e.g., training a learned model on 3 examples) is malpractice; the model will overfit and recommendations will be worse than rules.

---

## Cold-start — diagram

```
                user state, day 1
                       │
                       ▼
            ┌─────────────────────┐
            │ sessionCount < 5 ?  │
            └──────┬──────────────┘
                   │
        yes ───────┴───────── no
        │                       │
        ▼                       ▼
   rule-based             learned model
   (gate state            (trained on
    + last session         user's history)
    + level)
        │                       │
        └───────┬───────────────┘
                │
                ▼
         recommendation
```

---

## In this codebase

**Not yet implemented.** Phase 2C `B2C.14` (rules) and `B2C.16` (cold-start dispatcher).

Expected paths:
- Rules: `src/services/ml/recommend-rules.ts`
- Dispatcher: `src/services/ml/recommend.ts` — threshold check + arm assignment

---

## Elaborate

### Where this pattern comes from

The cold-start problem was formalized by Schein et al. (2002). Modern frameworks (Recsim, surprise) all bake in some cold-start handling. The "threshold + fallback" shape is the most common production approach.

### The deeper principle

Different data regimes need different strategies. A learned model and a rule-based fallback aren't competing — they cover different parts of the data lifecycle. The discipline is naming the regime threshold and dispatching correctly.

### Where this breaks down

When the threshold is wrong. If 5 sessions is too few, the learned model takes over before it can outperform rules — recommendations get worse. If 5 sessions is too many, you delay the benefit of the learned model. The threshold should be tuned: train the learned model on 3, 5, 10, 20 sessions and see when it starts beating rules in offline metrics.

### What to explore next

- [11-recommender-framing](./11-recommender-framing.md) → the two strategies
- [10-ab-testing-single-user](./10-ab-testing-single-user.md) → how to validate the threshold

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Threshold + fallback (planned)   │ Always learned (alt)             │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Day-1 UX           │ Rules give sensible defaults     │ Random or trivial output         │
│ Code complexity    │ One dispatcher                   │ One model path                   │
│ Model quality      │ Improves over time               │ Garbage at low N                 │
│ Threshold tuning   │ Needs validation                 │ N/A                              │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

A few sessions of "model would have been slightly better than rules" experience for the user — but only if the learned model would beat rules at N=4, which is unlikely.

### Sub-block 2 — what always-learned would cost

Day-1 user gets garbage. They never come back. The product fails at the most critical moment.

### Sub-block 3 — the breakpoint

Fine for any user-base. Threshold needs validation per use-case.

### Sub-block 4 — what isn't a tradeoff

Random day-1 recommendation was not picked because it ignores all signal (gate state, level).

---

## Tech reference (industry pairing)

### Threshold-based dispatch

- **Codebase uses:** Not yet. Planned via `if (sessionCount < 5)`.
- **Why it's here:** the simplest correct cold-start handler.
- **Leading today:** `adoption-leading` shape for recommender cold-start, 2026.

---

## Project exercises

### [B2C.16] Cold-start threshold

- **Exercise ID:** `[B2C.16]`
- **What to build:** Dispatcher with `< 5 sessions: rules; else learned`. Document threshold + reasoning in `docs/ml-recommender.md`. Validate threshold by re-running offline eval with different thresholds (3, 5, 10).
- **Why it earns its place:** the explicit naming of "where does the learned model start being better" — the senior signal in recommender design.
- **Files to touch:** `src/services/ml/recommend.ts`, `docs/ml-recommender.md`.
- **Done when:** the dispatcher is in place; the doc explains the threshold; eval results justify the value.
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

Cold-start happens when a recommender has no data to learn from — typically day one for a new user. The fix is a rule-based fallback that doesn't need data. contrl-mo's planned dispatcher uses a 5-session threshold: below it, rules; above it, the learned model. The threshold is product policy validated against offline metrics. The constraint forcing this design is that learned models trained on 3 examples overfit; rules don't have that failure mode. The cost paid is a few sessions of potentially-suboptimal recommendations that the learned model might have improved.

### Key points

- Cold-start = no data, no learning possible.
- Rules handle the cold regime; learned model handles the warm one.
- Threshold is product policy; validate offline.
- "Always learned" fails on day one.

---

## Interview defense

### Likely questions

**Q: What's cold-start?  [mid]**
A: The problem of recommending to users (or items) with no history. With no data, the learned model can't be trained or its predictions are noise. The fix: rule-based recommendations until enough data accumulates, then switch to learned. For contrl-mo's planned recommender, threshold is 5 sessions.

**Q: How did you pick 5 sessions?  [senior]**
A: Validated offline. Train the learned model on the first N sessions of historical data; eval on the next M sessions; compare against rule-based on the same M. The threshold is the smallest N where the learned model beats rules. Currently a placeholder of 5 with an open TODO to validate after enough data accumulates.

**Q: Multi-user version, 1000 new users a day — does this still apply?  [arch]**
A: Yes, and harder. User cold-start scales: every new user is cold. Strategies that earned their place: onboarding questions (explicit signal), implicit signal from device/locale, popular-item fallback. Item cold-start mostly doesn't apply because we control the item catalog and seed features.

### One-line anchors

- No data = no learning.
- Rules first; learn the residual.
- Threshold is product policy.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the threshold dispatcher.

### Level 2 — Explain it out loud
Why not always use the learned model? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"A new exercise is added. Item cold-start?"

### Level 4 — Defend the decision you'd change
"Lower the threshold to 1." When?

### Quick check — code reference test
- What's the planned threshold?
- What's the dispatcher path?
- Where will it live?

Then verify.
