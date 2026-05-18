# A/B testing — single user

**Industry name(s):** A/B testing, randomized assignment, control/experimental arms, single-user A/B
**Type:** Industry standard

> Compare two recommender strategies (rules-only vs learned) by randomly assigning each session to one arm and measuring outcomes. With one user, statistical power is limited but the *discipline* — random assignment, logging, fair comparison — is the same as at scale. IK Module 1 anchor concept.

**See also:** → [11-recommender-framing](./11-recommender-framing.md) · → [16-training-run-logging](./16-training-run-logging.md)

---

## Why care

"Did the new model help?" is the question every product team faces. The answer requires comparison, and the comparison requires fairness — same users, same context, different treatment. A/B testing is the discipline. Even with one user, doing it right is the difference between "I think it works" and "I have data".

The pattern is **randomized arm assignment with outcome logging**. Universal across product analytics, drug trials, search ranking experiments. The single-user variant is IK Module 1's clever framing — A/B-ing the recommender against yourself.

---

## How it works

Two recommenders coexist. Each session, randomly assign one. Log which arm was used and the outcome. Aggregate the outcomes over enough sessions to compare.

### Setup

```typescript
type Arm = 'control' | 'experiment';

function assignArm(): Arm {
  return Math.random() < 0.5 ? 'control' : 'experiment';
}

function getRecommendation(arm: Arm, state: UserState): Recommendation {
  if (arm === 'control') return ruleBased(state);
  return learnedModel(state);
}
```

Per session: flip a coin, get a recommendation from the chosen arm, log `{arm, recommendation, outcome}`.

### Logging

```typescript
// per session, after completion
await db.logArm({
  session_id, arm, recommended_exercise_id,
  user_selected_exercise_id, session_clean, timestamp,
});
```

The outcome metric for the recommender: did the user choose the recommended exercise? Was that session clean? These are the success criteria.

### Aggregation

After N sessions per arm:

```
                       control (rules)   experiment (learned)
   sessions assigned         50                  52
   followed recommendation   30 (60%)            41 (79%)
   clean sessions            34 (68%)            42 (81%)
```

The experiment arm looks better. Question: is the difference real or noise?

### Statistical significance — limited at this scale

With ~50 sessions per arm, the noise floor on percentages is ~7% (binomial standard error). A 13% improvement (60% → 79% followed) is plausibly real but not bulletproof. At larger user counts the noise floor drops; at single-user scale you live with wider confidence intervals.

The honesty: this is a small-N experiment, not a clinical trial. The value is the *discipline* of comparison, not the certainty.

### Move 2.5 — Why this matters even at N=1

- It forces honesty about what counts as success.
- It creates a baseline (the rules arm) you can defend.
- It gives you something to *report* — "I ran a single-user A/B and saw a 13% lift on followed-rate" is much stronger than "I think the learned model is better".
- It scales — when contrl gets more users, the same logging schema gives you real statistical power.

### Move 3 — The principle

Every claim about model improvement needs a comparison. Without random assignment, the comparison is confounded by everything else that changed (the user got better, the weather changed, etc.). Randomization isolates the model's effect.

---

## A/B testing — diagram

```
                    session N begins
                            │
                            ▼
                  ┌─────────────────────┐
                  │  Math.random()       │
                  └──────────┬──────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
            control arm               experiment arm
            (rule-based)              (learned)
                │                         │
                ▼                         ▼
            recommendation           recommendation
                │                         │
                ▼                         ▼
            user logs session         user logs session
                │                         │
                ▼                         ▼
            log {arm, outcome}        log {arm, outcome}
                │                         │
                └────────────┬────────────┘
                             │
                             ▼
                       aggregate over N
                       compare arms

   Metrics per arm:
     followed-rate    user selected the recommended exercise
     clean-rate       session passed all targets
     adherence        sessions completed this week per category
```

---

## In this codebase

**Not yet implemented.** Phase 2C `B2C.18`. Expected:
- `src/services/ml/arm-assignment.ts` (new) — random arm assignment
- `src/services/ml/recommend.ts` (new) — dispatches to rule or learned
- New `arm_log` table or columns on sessions to record arm + outcome
- `docs/ml-results.md` — A/B aggregate analysis

---

## Elaborate

### Where this pattern comes from

A/B testing in ML systems is IK Module 1's anchor concept and dates back to Optimizely / Google's early experimentation systems (~2008). The single-user variant is uncommon in industry but valuable for portfolio-grade ML projects — it demonstrates the discipline without requiring user scale.

### The deeper principle

Comparison is the only honest signal. Anything else (you-think-it's-better, vibes, before-after) is confounded by time, user adaptation, environment. Randomization at the smallest reasonable unit (here, the session) is what isolates the effect.

### Where this breaks down

Single-user data has limited statistical power. A 5% lift might not be detectable; a 20% lift probably is. The smaller the effect you care about, the more sessions you need.

### What to explore next

- [11-recommender-framing](./11-recommender-framing.md) → the recommender being tested
- [16-training-run-logging](./16-training-run-logging.md) → the logging infrastructure

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Single-user A/B (planned)        │ Compare manually (alt)            │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Statistical power  │ Limited at low N                 │ Same                              │
│ Bias               │ Random assignment removes time   │ Time confound dominates           │
│ Implementation     │ Random + log                     │ "I think it's better"             │
│ Interview value    │ "I ran an A/B"                   │ "I tried it"                      │
│ Discipline         │ Forces metric definition         │ Skips the discipline              │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up

Statistical certainty at low N. Acceptable for a personal-project context.

### Sub-block 2 — what manual comparison would cost

Confounded results. "After I deployed the new model my form got better" — was it the model or your fatigue / motivation / new sleep schedule? Without random assignment you can't tell.

### Sub-block 3 — the breakpoint

Fine for personal use. At scale (10+ users), aim for ~1000 sessions per arm to detect 5% lifts.

### Sub-block 4 — what isn't a tradeoff

Always-control (deploy learned for half users, rules for the other half) is the production analog at scale. Same discipline, more power.

---

## Tech reference (industry pairing)

### Hand-rolled random assignment

- **Codebase uses:** Not yet. Planned via `Math.random()`.
- **Why it's here:** the simplest correct implementation for single-user.
- **Leading today:** Hand-rolled — `adoption-leading` for small experiments, 2026.
- **Why it leads:** zero infrastructure.
- **Runner-up:** GrowthBook / LaunchDarkly — `adoption-leading` for multi-user product A/B testing.

---

## Project exercises

### [B2C.18] Single-user A/B framing

- **Exercise ID:** `[B2C.18]`
- **What to build:** Random arm assignment per session; log arm + outcomes; after ~50 sessions per arm, write the analysis to `docs/ml-results.md`.
- **Why it earns its place:** the IK Module 1 A/B concept applied without the user-scale problem. Concrete output: a real comparison with real numbers.
- **Files to touch:** `src/services/ml/arm-assignment.ts`, `src/services/ml/recommend.ts`, `database.ts` (new column or table), `docs/ml-results.md`.
- **Done when:** the doc shows arm-by-arm followed-rate and clean-rate after sufficient sessions accumulate, plus an honest "is this significant?" paragraph.
- **Estimated effort:** 1–2 days

---

## Summary

### Concept recap

Two recommender arms (rule-based control, learned experimental) coexist; each session is randomly assigned to one. Outcomes (followed-rate, clean-rate) are logged. After enough sessions per arm, compare. With one user the statistical power is limited but the discipline is the same as at industry scale — random assignment, logged outcomes, fair comparison. The constraint forcing this design is the impossibility of running a clean before-after comparison without confounds. The cost is N sessions of "wasted" rule-arm assignment that could have been the better recommender.

### Key points

- Random assignment is what removes time/state confounds.
- Even N=1 user benefits from the discipline.
- Outcome metrics must be defined before the experiment.
- Single-user A/B is the right framing for IK Module 1 in a personal portfolio.

---

## Interview defense

### Likely questions

**Q: How do you A/B test with one user?  [mid]**
A: Random arm assignment per session. Each session, flip a coin: control gets the rule-based recommender, experiment gets the learned one. Log which arm and the outcome (did the user follow the recommendation, was the session clean). After ~50 sessions per arm, compare.

**Q: How do you know the difference is real?  [senior]**
A: I don't, with certainty — single-user N is too small for tight statistical bounds. The honest framing is "I observed a 13% lift on followed-rate; binomial standard error at N=50 per arm is ~7%, so this is *suggestive* but not conclusive". At scale (1000+ sessions per arm) the same setup would give significance. The value at N=1 is the discipline, not the certainty.

**Q: What's the recommender system production analog?  [arch]**
A: Same shape, more users. Deploy the new recommender to 10% of users, monitor outcome metrics, hold-out the other 90% on rules. Statistical power scales with user × session count. The risk at scale is novel: a learned recommender that nudges users in subtle ways could create feedback loops the rules don't. That's why long-running A/Bs matter, not just one-week ones.

### One-line anchors

- Random assignment isolates the model's effect.
- Even small N benefits from the discipline.
- Define outcome metrics before the experiment.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the assignment + logging flow.

### Level 2 — Explain it out loud
Why random assignment? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"A/B test the coaching prompt — do two different tones produce different user response?"

### Level 4 — Defend the decision you'd change
"Skip the A/B and just deploy the learned model." When?

### Quick check — code reference test
- What's the assignment mechanism?
- What table logs outcomes?
- What does "followed-rate" measure?

Then verify.
