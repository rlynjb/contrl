# Eval set types

**Industry name(s):** Eval sets, golden set, regression suite, holdout, adversarial set
**Type:** Industry standard

> Four kinds of test data with different jobs: golden sets (hand-curated, stable, representative), regression suites (grown from production failures), holdouts (untouched until measurement), and adversarial sets (worst-case inputs designed to break). Each protects against a different failure mode. Mixing them up means measuring the wrong thing.

**See also:** → [02-eval-methods](./02-eval-methods.md) · → [03-llm-as-judge-bias](./03-llm-as-judge-bias.md) · → [08-machine-learning/03-train-val-test-discipline](../08-machine-learning/03-train-val-test-discipline.md) · → prompt-engineering [05-eval-driven-iteration](../../study-prompt-engineering/05-eval-driven-iteration.md)

---

## Why care

**Move 1.** You build a classifier. You curate 30 test cases that look like real production inputs. The classifier scores 96% on the set. You ship. Two weeks in, a user reports a misclassification. You add the case to the eval set. Three weeks in, another report. Add it. Four months in your "eval set" is 80 cases, half of which were added because production failed. You start tweaking the prompt to pass these cases. The score climbs to 98%. You ship the new prompt. Two days later, three new production failures — all on cases that look superficially like ones already in the eval set. The set has become noise; the model has learned to pass the specific failures in the set, not the underlying pattern.

**Move 2.** That "what is each eval case for, and what does it measure" question is what eval set types answer. Not the score. Not the methodology. Just the *role* of each case. Four distinct roles: the golden set anchors what good looks like; the regression suite captures specific failures we never want to repeat; the holdout measures generalization (untouched until measurement); the adversarial set probes worst case. Each protects against a different failure mode. Mixing them produces meaningless numbers.

**Why you need to answer that question at all:** Three failures hide in undifferentiated eval sets. First, **overfitting to your own tests** — when you iterate against the set you use to score, the model learns the set, not the task. Second, **silent regression on uncovered patterns** — every production failure that should have triggered a new test case but didn't is a regression waiting to happen. Third, **misleading aggregate scores** — averaging across cases with different roles produces a number that doesn't mean anything. "96% accuracy on the eval set" tells you nothing if you don't know which 4% is the holdout vs the adversarial vs the regression.

**Before / after.**

Without typed eval sets:
- One set of 80 cases mixing happy path, edge cases, regressions, and "tricky inputs."
- Score: 96%. Means... what?
- Production failure → add to set → tweak prompt → score rises → ship → failure on a similar case.

With typed eval sets:
- Golden set: 30 hand-curated cases. Frozen for the project's life (or until the task itself changes). Iterate against this.
- Regression suite: 12 cases added from production failures. Frozen. Must pass; failures here block PRs.
- Holdout: 50 cases sampled from production, never inspected by the team. Run once per quarter. Measures generalization.
- Adversarial set: 15 cases designed to break the system (prompt injection, malformed inputs, edge cases).
- Score per set: 97% golden, 100% regression (must), 89% holdout, 71% adversarial. Four numbers, each meaningful.

**Move 5.** Typed eval sets are what unit/integration/e2e/load testing is for application code — different test types measure different properties, and reporting one aggregate "tests passed" number hides what each test is actually checking.

---

## How it works

### Move 1 — The mental model

Think of test types in a backend app:

- **Unit tests** — small, fast, run on every commit. They cover the things you know to test.
- **Integration tests** — broader, slower, run on PR. They cover the behavior across module boundaries.
- **E2E tests** — slow, expensive, run on deploys. They cover user-visible journeys.
- **Chaos / fuzz tests** — adversarial, run periodically. They probe what you didn't think of.

You wouldn't report a single "test pass rate" averaging across all four — each measures something different. LLM/ML eval sets need the same discipline.

```
  Four eval set types, four jobs

  ┌──────────────────────────────────────────────────────────────────────┐
  │ Type             │ Job                              │ Frozen?         │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Golden set       │ "What does good look like?"       │ Yes, until task │
  │                  │ Iterate against this.             │ changes         │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Regression suite │ "Don't repeat past failures."     │ Yes. Append     │
  │                  │ Must-pass.                        │ only.           │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Holdout          │ "Generalize to unseen cases."     │ Yes. Never look │
  │                  │ Measured once per release.        │ at it.          │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Adversarial set  │ "What breaks the system?"         │ Yes. Append     │
  │                  │ Worst-case probe.                 │ when found.     │
  └──────────────────────────────────────────────────────────────────────┘
```

Each set has a different job. Each is reported separately.

---

### Move 2 — The layered walkthrough

#### The golden set

20–50 hand-curated input/expected-output pairs covering canonical cases. The size is deliberate: small enough to maintain, large enough to cover the categories that matter.

**Categories to cover:**
- Happy path (8–15 cases): typical, expected inputs.
- Edge cases (5–10): rare inputs that production hits but dev tests usually miss.
- Adversarial (3–5): inputs designed to confuse — these can also live in the dedicated adversarial set, but a few representative cases in golden ground the set.

```
  Golden set structure (example: contrl form classifier)

  cases.json (planned):
  [
    { id: "happy-clean-pushup-1", features: [...], expected: "clean", category: "happy-path" },
    { id: "happy-shaky-pushup-1", features: [...], expected: "shaky", category: "happy-path" },
    { id: "edge-partial-rep-1", features: [...], expected: "incomplete", category: "edge-case" },
    { id: "edge-fast-tempo-1", features: [...], expected: "clean-but-fast", category: "edge-case" },
    { id: "adversarial-empty-features", features: [0,0,...], expected: "error|reject", category: "adversarial" }
    // ... 30 cases total
  ]
```

**Discipline:** the golden set is what you iterate against. Score on this set should go up over time. **It is NOT the holdout.** Iterating against the golden set, then reporting golden-set score, is the standard practice (not overfitting per se — it's the test you optimize for). The protection against overfitting is the *holdout*, which is separate.

---

#### The regression suite

Every production failure becomes a permanent test case. The suite grows monotonically — entries are never removed.

```
  regression_cases.json
  [
    {
      id: "regression-2026-03-15-form-classifier-001",
      features: [/* the actual production input that failed */],
      expected: "clean",
      incident: "User report 2026-03-15: classifier returned 'shaky' on a normal pushup. Root cause: shoulder visibility threshold too strict. Fixed in PR #142.",
      added_at: "2026-03-16"
    },
    // grows by 1-5 cases per quarter
  ]
```

**Discipline:** the regression suite must pass — failures block PRs. The case's input is captured *verbatim* from the production failure, not a cleaned-up version. Cleaning risks masking the bug.

```
  Regression suite over time
  
  cases
  ▲
  │             ╱─ regression set (grows monotonically)
  │           ╱
  │         ╱
  │       ╱
  │     ╱
  │   ╱
  │ ╱
  ──────────────────────────▶ time
  
  Each step up = one production failure prevented from recurring.
```

---

#### The holdout

A separate set of cases that the team **never inspects during iteration**. Untouched. Used only to measure how well the model generalizes beyond the golden set + regressions.

For contrl's planned form classifier (B2C builds): the curriculum specifies a 50-case "held-out self-labeled" set per B3.8. The discipline is: don't look at the cases during prompt iteration. Run once per release. Compare the holdout score to the golden score. If they diverge significantly (golden 96%, holdout 78%), you're overfitting.

```
  Holdout vs golden — what the gap tells you
  
  ┌────────────────────────┬─────────────────────────────────────┐
  │ Golden score / Holdout │ Diagnosis                            │
  ├────────────────────────┼─────────────────────────────────────┤
  │ Both high (96 / 92)    │ Healthy. Generalization is real.     │
  │ Golden high, hold low  │ Overfitting to golden. Stop tuning   │
  │ (96 / 75)              │ on it.                               │
  │ Both low (80 / 78)     │ Model is genuinely struggling.        │
  │                        │ Capability gap, not eval problem.     │
  └────────────────────────┴─────────────────────────────────────┘
```

**Discipline:** the holdout is sacred. If you peek at it (debug a case, look at why one example failed), it stops being a holdout. Mark cases as "consumed" and rotate them out. New cases sampled from recent production fill the slots.

---

#### The adversarial set

Inputs designed to break the system. Different from edge cases (which are rare-but-natural). Adversarial cases are constructed.

For LLM systems: prompt-injection attempts, content with embedded jailbreak instructions, encoded attacks, length-overflow probes.

For ML systems: out-of-distribution inputs (feature values far outside training range), missing features, null inputs, contradictory features.

```
  Adversarial set for contrl's form classifier (planned)
  
  cases:
    - all-zero features (sensor failure simulation)
    - features near training-set boundary (rare-but-real)
    - features outside training-set range (out-of-distribution)
    - features with one outlier value (sensor glitch)
    - features representing impossible-but-plausible bio (e.g., elbow > 180°)
  
  Expected behavior:
    - all-zero: classifier returns null/error or low-confidence
    - boundary: classifier handles, possibly with low confidence
    - out-of-distribution: classifier should flag confidence below threshold
    - outlier: classifier should be robust (median feature value behavior)
    - impossible: classifier should reject (validator catches before inference)
```

**Discipline:** the adversarial set's score is *not* expected to be high. Adversarial inputs are designed to break things. The expectation is: graceful degradation. Reporting "70% on adversarial" means the system fails gracefully on 70% of attacks — not that 30% of normal inputs fail.

---

### Move 3 — The principle

Different test types measure different properties. Reporting one aggregate score across types hides what each is checking. The discipline of typing eval cases is the LLM/ML equivalent of separating unit / integration / e2e / chaos tests in backend code. Each type protects against a different failure mode. Skipping any leaves a class of bugs invisible until production finds them.

---

## Eval set types — diagram

```
┌─ Four eval sets, four jobs, four scores ─────────────────────────────────────┐
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ GOLDEN SET (frozen until task changes)                              │   │
│  │   30 cases covering happy + edge + a few adversarial                │   │
│  │   YOU ITERATE AGAINST THIS                                          │   │
│  │   Reported: golden_score                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ REGRESSION SUITE (append-only, must-pass)                           │   │
│  │   Production failures captured verbatim                              │   │
│  │   YOU NEVER REMOVE CASES (only add)                                 │   │
│  │   Reported: regression_pass_rate (target 100%)                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ HOLDOUT (sacred — do not inspect during iteration)                  │   │
│  │   50 cases sampled from production, never looked at                  │   │
│  │   RUN ONCE PER RELEASE                                              │   │
│  │   Reported: holdout_score (compared to golden_score for             │   │
│  │   overfitting check)                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ADVERSARIAL SET (append when novel attacks found)                   │   │
│  │   Constructed to break the system                                    │   │
│  │   GRACEFUL DEGRADATION IS THE GOAL, NOT HIGH SCORE                  │   │
│  │   Reported: adversarial_graceful_rate                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Per release:
  golden: 97%   regression: 100%   holdout: 89%   adversarial: 71% graceful
```

Four sets, four numbers, four jobs. The set you iterate against is golden; the set you must pass is regression; the set that detects overfitting is holdout; the set that probes failure modes is adversarial.

---

## In this codebase

**Case A — contrl's planned eval discipline.**

Per curriculum Phase 3 builds:
- **B3.8 (form classifier eval harness):** "Python on test set + held-out self-labeled." The "test set" maps to the golden set + regression suite. The "held-out self-labeled" maps to the holdout.
- **B3.9 (recommender eval, single-user A/B):** different eval shape — A/B arm assignment + outcome logging — covered separately because single-user A/B has its own constraints.

**Planned file paths (contrl, Phase 3):**
- `ml/tests/golden.json` — golden set (30 cases)
- `ml/tests/regression.json` — regression suite (append-only)
- `ml/tests/holdout.json` — holdout (50 cases, never inspected)
- `ml/tests/adversarial.json` — adversarial set
- `ml/scripts/eval.py` — harness that runs all four and reports four numbers

Not yet on disk. The curriculum's Phase 3 starts after Phase 2C ships the classifier.

**For the planned coaching agent (Phase 4 Path C):**
- The same four-set discipline applies, but cases are coaching-agent-shaped (`{session_data: {...}, expected_coaching_traits: {...}}`).
- The holdout protects against overfitting to the team's intuition about what good coaching looks like.

---

## Elaborate

**Where this pattern comes from.** Train/val/test discipline has been ML orthodoxy since the 2000s. Holdout sets are the load-bearing piece. The LLM-side adaptation (golden + regression + holdout + adversarial) crystallized through 2023–2025 as production LLM teams scaled. Hamel Husain's writing is the canonical practitioner reference.

**The deeper principle.** Multiple test sets with distinct roles is the same shape as unit + integration + e2e tests in backend code. Each measures a property the others miss. The principle generalizes — any system where you optimize against test data needs a holdout to detect overfitting.

**Where this breaks down.** Two places.

1. **Truly small projects.** A side project with one classifier and 10 hand-labeled cases doesn't need four sets. One set, one number, accept the overfitting risk.
2. **Tasks with no clear ground truth.** Open-ended generation, creative writing — golden sets work, holdout sets are awkward (judging quality is the holdout-on-itself problem). Hybrid evals (rubric-based with LLM-as-judge) substitute.

**What to explore next.**
- [02-eval-methods](./02-eval-methods.md) — how to score each set type (programmatic vs reference-based vs LLM-as-judge).
- [03-llm-as-judge-bias](./03-llm-as-judge-bias.md) — calibration for judge-based scoring.
- [08-machine-learning/03-train-val-test-discipline](../08-machine-learning/03-train-val-test-discipline.md) — the ML-side parent concept.
- Hamel Husain's blog on production LLM evals.

---

## Tradeoffs

| Cost dimension | Typed eval sets (4 sets) | Single eval set |
|---|---|---|
| Setup cost | 4 files + harness per set | 1 file + harness |
| Cases to maintain | 30 golden + N regression + 50 holdout + 15 adversarial | 80 mixed |
| Reportable signals | 4 distinct scores | 1 aggregate |
| Overfitting detection | Yes (holdout vs golden) | No |
| Production-failure protection | Yes (regression suite) | No (or accidental) |
| Worst-case probe | Yes (adversarial) | No |

### Sub-block 1 — what we gave up

The setup cost. Four files instead of one. A harness that runs four sets and reports four numbers. For contrl's planned ML eval, that's ~1–2 days of harness work (B3.8 covers part of it). Worth it for any project that will iterate the classifier or coaching agent over months.

### Sub-block 2 — what a single set would have cost

I have shipped single-set eval discipline. The cost shape:
- Month 1: iterate against the set. Score climbs from 88% to 96%.
- Month 2: production failure on a case the eval set didn't cover. Add it. Score drops to 94%. Tune. Back to 97%.
- Month 4: notice that several recent production failures look similar to cases ALREADY in the set. Investigation: you've been tuning to pass specific cases, not the underlying pattern. Overfitting.
- Month 5: introduce a holdout (cases never iterated against). Holdout score: 81%. The 97% was theatre.

Typed sets from day 1 prevent this. The holdout is the load-bearing addition.

### Sub-block 3 — the breakpoint

Typed sets are the right call until: (a) the project is a single-shot evaluation that won't be iterated (one classifier, one ship, done); (b) the task has so few clear-ground-truth cases that splitting into 4 sets leaves each set too small to measure anything (rare; usually means you don't have enough labels yet). Otherwise, type the sets.

### Sub-block 4 — what wasn't actually a tradeoff

"Four sets is over-engineering for a small project." The golden + regression alone (2 sets, ~2 files) catches most of the value. Adversarial and holdout earn their place as the project scales. Starting with 2 and growing to 4 is honest progression. The discipline isn't all-or-nothing.

---

## Tech reference (industry pairing)

### Hand-rolled JSON eval sets

- **Codebase uses:** Not yet — contrl's planned ML evals will use JSON files under `ml/tests/`.
- **Why it's here:** the simplest viable shape. One file per set, one harness that reads them, one report.
- **Leading today:** hand-rolled JSON — `adoption-leading` for small-to-medium projects, 2026.
- **Why it leads:** no dependencies, diff-friendly, easy to inspect.
- **Runner-up:** Pytest / Vitest parameterized tests — same shape with framework integration; better when CI integration matters.

### Promptfoo / LangSmith Evals (LLM-specific)

- **Codebase uses:** Not yet — contrl's coaching-agent evals could use one of these.
- **Why it's here:** managed eval platforms with built-in golden/regression/holdout support, LLM-as-judge integration, A/B test runners.
- **Leading today:** Promptfoo — `innovation-leading` for open-source LLM eval harnesses, 2026.
- **Why it leads:** YAML/JSON config matches prompts-as-code shape; parallel execution; CI-friendly output; works across providers.
- **Runner-up:** LangSmith Evals — closely related; LangChain-leaning ecosystem.

### Hamel Husain's eval methodology

- **Codebase uses:** N/A — methodology reference.
- **Why it's here:** the canonical 2024–2026 practitioner reference for production LLM evals. Specific recommendations on golden set sizing, judge calibration, regression discipline.
- **Leading today:** Hamel Husain's blog (hamel.dev) — `adoption-leading` for production LLM-eval discipline, 2026.
- **Why it leads:** practitioner-credible (Hamel ships, hasn't just written), specific over abstract, calibration discipline.
- **Runner-up:** Eugene Yan's eugeneyan.com — closely related framing, broader scope.

---

## Project exercises

### [B3.8] Build the form classifier's four eval sets

- **Exercise ID:** `[B3.8]`
- **What to build:** Hand-curate 30 golden cases + initial 0 regression cases + 50 holdout cases (sample from a held-aside production trace) + 15 adversarial cases. Write a `ml/scripts/eval.py` that runs the classifier against all four and reports four scores.
- **Why it earns its place:** the canonical Phase 3 build that makes the classifier's quality measurable. Without it, every prompt/feature tweak is guesswork.
- **Files to touch:** `ml/tests/{golden,regression,holdout,adversarial}.json` (new); `ml/scripts/eval.py` (new).
- **Done when:** all four files have content; eval script outputs four numbers; one regression case added (probably synthetic at this stage) and verified to pass.
- **Estimated effort:** `1–2 days`

### [B3.9] Single-user A/B for the recommender

- **Exercise ID:** `[B3.9]`
- **What to build:** A different eval shape for the recommender — random arm assignment per session, outcome logged, statistical comparison after N sessions.
- **Why it earns its place:** the recommender is harder to eval offline (no clear ground truth for "right exercise"); A/B is the workaround.
- **Files to touch:** `src/lib/recommender/ab.ts` (planned).
- **Done when:** session-to-arm mapping persisted, outcome metric logged, comparison report generated.
- **Estimated effort:** `1–4hr`

### [B4C.eval] Eval set for the coaching agent (hypothetical, post-Phase 4)

- **What to build:** Four eval sets sized for the coaching-agent task. Golden = 20 cases. Regression starts empty. Holdout = 30 cases. Adversarial = 10 prompt-injection attempts via the notes field.
- **Why it earns its place:** the coaching agent's prompt will iterate; without typed sets, iteration produces noise.
- **Files to touch:** `src/lib/agent/tests/{golden,regression,holdout,adversarial}.json` (planned).
- **Done when:** harness runs all four and reports per-set scores.
- **Estimated effort:** `1 day`

---

## Summary

Four eval set types, four jobs: golden (anchor good), regression (don't repeat failures), holdout (measure generalization), adversarial (probe worst-case). Each is reported separately; aggregating across types produces meaningless numbers. The holdout is the load-bearing addition — it's the only set that detects overfitting to your own tests. For contrl: Case A for the planned Phase 2C/Phase 3 ML work (B3.8 + B3.9 builds) and Case A in spirit for the Phase 4 coaching agent.

**Key points:**

- **Four sets, four scores.** Aggregate scores hide what each set measures.
- **Golden set: iterate against this.** ~30 cases, frozen, covers happy + edge.
- **Regression suite: must-pass, append-only.** Production failures captured verbatim.
- **Holdout: NEVER inspect during iteration.** ~50 cases, run once per release. Compare to golden for overfitting detection.
- **Adversarial: graceful degradation is the goal.** Not high score — constructed to break things.

---

## Interview defense

### What an interviewer is really asking

When asked "how do you evaluate your ML model / LLM chain?", they want to hear whether you've internalized the typed-eval-set discipline. The shipped answer names all four sets and what each is for. The unshipped answer is "we have a test set."

### Likely questions

**[mid] What's the difference between a golden set and a holdout?**

The golden set is what you iterate against. You tune your prompt / model to pass it. The holdout is the set you never inspect during iteration — kept sacred — and use to measure whether your tuning is generalizing or overfitting. If golden score is 96% and holdout score is 75%, you're tuning to specific cases, not the underlying pattern.

```
  Golden vs holdout
  
  ┌─────────────────────────┬─────────────────────────┐
  │ Golden set              │ Holdout                  │
  ├─────────────────────────┼─────────────────────────┤
  │ Iterate against         │ Never look at            │
  │ Tune to pass            │ Run once per release      │
  │ Score reported per run  │ Score reported per release│
  │ Overfitting risk: real  │ Overfitting detector      │
  └─────────────────────────┴─────────────────────────┘
```

---

**[senior] What goes in the regression suite vs the golden set?**

Golden set is hand-curated to cover canonical patterns and known edge cases — what you anticipate matters. Regression suite is empirical: every production failure becomes a permanent case there, captured verbatim. Golden grows when the task changes; regression grows when reality surprises you. Discipline: regression cases must pass — failures block PRs. Golden cases are about average quality (score goes up); regression cases are about specific cases (always pass).

```
  Golden vs regression
  
  Golden                              Regression
  ───────────────────────────         ───────────────────────────────────
  hand-curated upfront                grown from production
  covers anticipated patterns         covers what surprised us
  score goes up over time             pass rate = 100% always
  frozen until task changes           append-only forever
```

---

**[arch] How do you handle eval-set size at scale?**

Two things shift. First, sets grow but maintenance has to stay bounded — once golden set is over ~80 cases, it stops being maintained. Cap it; remove old cases only when the task itself changes. Regression suite grows monotonically (no removal) but the count plateaus naturally — production failures get rarer as the model matures. Second, holdout rotation: as the team peeks at holdout cases during debugging, those cases get "consumed" and rotated out. New cases sampled from recent production refill the slots. The holdout never depletes; it rotates.

```
  Set sizes at maturity (typical)
  
  golden:        20–50 (capped; quality > quantity)
  regression:    grows monotonically; ~50–150 at 2 years
  holdout:       50–200; rotates as cases get inspected
  adversarial:   15–40; append when novel attacks found
```

---

### The question candidates always dodge

**"Just train on a big dataset and report the test score. Why all the sets?"**

Because "the test score" with one undifferentiated set hides the failure modes the four-set discipline catches. Production failures that recur because no one added them to the set; overfitting that goes undetected because there's no holdout; adversarial inputs that silently break the system because no one probed them. Aggregate accuracy across mixed case types is the same as averaging unit-test pass rate and load-test latency into one number — meaningless. The discipline is one of separating concerns, not bureaucracy.

```
  What single-set scoring misses
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ Production failure → not in set → won't be caught next release    │
  │ Overfitting → no holdout → discovered when users complain          │
  │ Worst-case input → no adversarial → "graceful failure" untested    │
  │ Score = average → meaningless if cases differ in role              │
  └──────────────────────────────────────────────────────────────────┘
```

---

### One-line anchors

- "Four eval set types, four jobs, four reported scores."
- "Golden = iterate. Regression = must-pass. Holdout = sacred. Adversarial = probe."
- "Holdout detects overfitting. Without it, golden-set scores are theatre."
- "Regression suite is append-only and verbatim."
- "Adversarial expects graceful degradation, not high score."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw four boxes labeled golden / regression / holdout / adversarial. Under each: one-line job description.

Pass: you got all four with correct jobs.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "What kinds of eval sets do you maintain and why?" Checkpoints:
- Did you name all four types?
- Did you say what each measures?
- Did you mention the holdout as the overfitting detector?

**Level 3 — Apply to a new scenario.**
A teammate has a chain with one 50-case eval set, scored 94%. They report a production failure. Walk through what to do.

Expected: add the production failure verbatim as a regression case. Separate the set into golden + holdout (sample ~30 for holdout, freeze; 20 stay as golden). Run all three; if holdout < golden by >10 points, declare overfitting and stop tuning until you have more data.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is maintenance overhead. If you were running a single-shot prompt that wouldn't be iterated, would you still maintain four sets?

There's no right answer. Defend with reference to sub-block 3 — the discipline doesn't apply uniformly to all projects.

**Quick check — code reference test.**
Without opening files, answer:
- Which set must you NOT inspect during iteration?
- Which set must pass at 100%?
- Where does contrl's planned eval discipline live (curriculum builds)?

Pass: holdout; regression; B3.8 (classifier) + B3.9 (recommender A/B).

---
Updated: 2026-05-29 — Dropped stale `loopd/tests/ml/golden.json` reference per v1.43.0 Hard repo-scope rule; planned paths list now contrl-only.
