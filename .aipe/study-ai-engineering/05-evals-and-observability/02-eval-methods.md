# Eval methods

**Industry name(s):** Eval methods, scoring methods, programmatic / reference-based / LLM-as-judge
**Type:** Industry standard

> Three ways to score an LLM/ML output: programmatic (structural checks via regex, schema, count), reference-based (similarity to an expected output), and LLM-as-judge (a separate LLM grades against a rubric). Each has a job. Mixing them up gives you a number that doesn't measure what you think.

**See also:** → [01-eval-set-types](./01-eval-set-types.md) · → [03-llm-as-judge-bias](./03-llm-as-judge-bias.md) · → prompt-engineering [05-eval-driven-iteration](../../study-prompt-engineering/05-eval-driven-iteration.md)

---

## Why care

**Move 1.** You have an LLM that generates coaching messages. You want to score quality. You write a regex: "must contain at least one of `try`, `next time`, `focus on`." 92% of outputs match. You declare the chain good. Two weeks later a user complains the messages feel generic. You read 20 outputs — they all start with "Try focusing on..." The regex passes; quality is bad. The scoring method was structural, but the failure mode was tonal. You measured the wrong thing.

**Move 2.** That "what does my eval method actually measure" question is what eval methods answer. Not the eval set. Not the score. Just the *scoring mechanism*: programmatic checks (structural — fast, deterministic, blind to content), reference-based similarity (content — exact ground truth required), LLM-as-judge (subjective rubric — slow, expensive, biased). Each measures something different. Pick the one that matches the failure mode you're trying to catch.

**Why you need to answer that question at all:** Three failures hide in method mismatch. First, **structural pass with semantic fail** — regex/schema confirms the output's *shape* is right while its *content* is wrong. Second, **reference-based scoring of open-ended output** — comparing a generated paragraph to one "correct" paragraph penalizes valid variation. Third, **LLM-as-judge without calibration** — the judge has biases (length, fluency, familiarity) that drift your scores away from what humans would say.

**Before / after.**

Wrong method: regex on coaching messages (structural scoring of subjective output).
- 92% "pass." Means: the regex matched. Doesn't mean: the message was good.
- Production users disagree. Quality complaints arrive in week 3.

Right method: LLM-as-judge with a rubric (`{ specificity_1_5, tone_1_5, actionability_1_5, length_appropriate: bool }`), calibrated against 30 human-rated cases.
- Score per dimension. Aggregate weighted score.
- Pre-deployment human spot-checks confirm the judge's calibration.
- Production quality complaints surface as judge-score drops, not after-the-fact reports.

**Move 5.** Eval methods are what testing strategies are for application code — `assert(typeof x === 'string')` (programmatic), `expect(x).toEqual(expected)` (reference-based), and `expect(x).toMatchSnapshot()` (subjective comparison). The mismatch between method and failure mode is the bug. Pick the test for the property you're checking.

---

## How it works

### Move 1 — The mental model

Three test types in application code, three eval methods for ML/LLM:

```
  Application testing           ML/LLM eval methods
  ─────────────────────────     ─────────────────────────────
  Type checks (TS, schema)      Programmatic (regex, schema, count)
    "Is the shape correct?"       "Is the output's shape valid?"
    
  Equality assertions            Reference-based similarity
    "Does it equal expected?"     "Is it close to expected?"
    
  Snapshot / visual review       LLM-as-judge
    "Does a human approve?"       "Does another LLM approve?"
```

Each measures a different property. The discipline is matching the method to the property.

Strategy in plain English: **programmatic for structure; reference-based for one-right-answer outputs; LLM-as-judge for subjective quality. Most production evals mix all three.**

---

### Move 2 — The layered walkthrough

#### Method 1: programmatic checks

Direct code-based validation of the output's structural properties. Fast, deterministic, free.

**What it can check:**
- Schema conformance (Zod.parse, JSON Schema validation)
- Length constraints (output between N and M tokens)
- Keyword presence/absence (must contain X, must not contain Y)
- Regex pattern matching (output matches `^[A-Z][a-z]+: \d+$`)
- Field range checks (confidence 0.0–1.0)

**What it CAN'T check:**
- Whether the content is *correct*
- Whether the tone matches intent
- Whether reasoning is sound

```
  Programmatic check for the coaching agent (planned)
  
  programmatic_checks(output: AgentOutput): bool {
    return (
      output.coaching.length >= 50 &&
      output.coaching.length <= 300 &&
      !FORBIDDEN_OPENERS.some(p => output.coaching.startsWith(p)) &&
      output.classifier_was_referenced === true
    );
  }
```

Use it for the floor. Programmatic checks are what fail-fast looks like — outputs that violate the shape don't even get scored on quality.

---

#### Method 2: reference-based similarity

Compare the model's output to a known-correct output. Score by similarity (exact match, BLEU, ROUGE, semantic similarity via embeddings).

**Best for:** outputs with one (or a small set of) right answers — classifiers, extractors, structured outputs.

**Bad for:** generative tasks with valid variation — captions, summaries, creative writing. Penalizes legitimate variation.

```
  Reference-based scoring matrix
  
  ┌──────────────────────────────┬──────────────────────────────────┐
  │ Output type                  │ Reference-based works?            │
  ├──────────────────────────────┼──────────────────────────────────┤
  │ Classifier label             │ YES (exact match)                 │
  │ Extracted fields             │ YES (per-field exact or fuzzy)    │
  │ Translation (well-defined)   │ Partially (BLEU; multiple valid)  │
  │ Generated caption            │ NO (many valid wordings)          │
  │ Summary                      │ Partial (semantic similarity)      │
  │ Coaching message             │ NO (subjective)                   │
  └──────────────────────────────┴──────────────────────────────────┘
```

For the contrl form classifier: reference-based is ideal. The expected output is one of N labels; exact match scoring is appropriate.

For the contrl coaching agent: reference-based is wrong. There are dozens of valid coaching messages per session. Use LLM-as-judge instead.

```
  Reference-based scoring example (form classifier)
  
  case_001: features=[...], expected="clean"
    predicted="clean"          → match (1.0)
    
  case_002: features=[...], expected="shaky"
    predicted="shaky"          → match (1.0)
    
  case_003: features=[...], expected="incomplete"
    predicted="shaky"          → mismatch (0.0)
  
  Overall accuracy: 67% (2/3)
```

---

#### Method 3: LLM-as-judge

A separate LLM (ideally bigger or different family from the model under test) scores outputs against a structured rubric.

**Best for:** subjective quality dimensions (tone, helpfulness, narrative coherence, specificity).

**Worst for:** scoring outputs that are factually wrong but plausibly worded — the judge tends to score them high because they sound right.

```
  Judge rubric for the coaching agent (planned)
  
  rubric: {
    specificity: int 1-5,           // "1=generic; 5=mentions specific session features"
    tone: int 1-5,                  // "1=harsh/cold; 3=neutral; 5=warm and direct"
    actionability: int 1-5,         // "1=vague; 5=names one concrete thing to try"
    length_appropriate: bool,       // "fits in 80-200 word range"
    cites_classifier: bool          // "references something from get_classifier_output"
  }
  
  Judge model: Anthropic Opus 4 (larger than the candidate Sonnet 4)
  Calibration: spot-check 20 outputs against human ratings
  Run frequency: per release on golden set + per quarter on holdout
```

**Calibration discipline (critical):** the judge's bias profile differs from human bias. Test calibration: score 20 outputs with both the judge and a human reviewer; check agreement. If agreement > 85%, trust the judge for that rubric on that candidate model. If agreement < 70%, the rubric is too vague or the judge is too biased — fix it before relying on judge scores.

```
  LLM-as-judge calibration loop
  
  ┌─────────────────────────────────────────────┐
  │ Score 20 outputs with judge AND human       │
  ├─────────────────────────────────────────────┤
  │ agreement > 85%   → trust the judge          │
  │ agreement 70-85%  → tighten the rubric       │
  │ agreement < 70%   → switch judge or          │
  │                     redesign rubric          │
  └─────────────────────────────────────────────┘
```

Recalibrate quarterly or after any model swap (judge OR candidate).

---

#### When to mix methods

Most production evals use all three layered:

```
  Layered eval for the coaching agent (planned)
  
  Layer 1 (programmatic, fail-fast):
    if !output.matches_schema:
      score = 0; skip remaining layers
    if output.length out of range:
      score = 0
    if output.starts_with(forbidden_opener):
      score = 0
  
  Layer 2 (reference-based on the bits that have ground truth):
    if output.cites_classifier and 
       output.classifier_quote in get_classifier_output(workout_id):
      programmatic_quote_score = 1.0
    else:
      programmatic_quote_score = 0.0
  
  Layer 3 (LLM-as-judge on subjective dimensions):
    judge_scores = judge_model.score(output, rubric)
    // {specificity: 4, tone: 5, actionability: 3, ...}
  
  Aggregate:
    final_score = 0.3 * programmatic_floor + 
                  0.2 * reference_score + 
                  0.5 * judge_score_avg
```

The aggregate weights are tunable. The discipline is to make each layer's contribution explicit — knowing whether a regression came from a structural failure (Layer 1), a factual failure (Layer 2), or a quality drop (Layer 3) is the debugging signal.

---

### Move 3 — The principle

Each eval method measures a different property of the output. Mixing methods or picking the wrong one produces numbers that don't tell you what you think they're telling you. The discipline is to know what each method can and can't see, then pick the one that matches the failure mode you're trying to catch. Most production evals layer all three — programmatic floor + reference-based correctness + LLM-as-judge quality — with clear attribution per layer.

---

## Eval methods — diagram

```
┌─ Programmatic (deterministic, fast, structural) ─────────────────────────────┐
│                                                                              │
│   Inputs: model output                                                       │
│   Method: code-based checks (Zod, regex, length, range)                      │
│   Output: pass/fail or 0-1 score                                             │
│   Catches: shape violations, schema breaks, forbidden patterns                │
│   Misses: content correctness, tone, reasoning                                │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ if pass, continue
                                      ▼
┌─ Reference-based (deterministic, fast, factual) ─────────────────────────────┐
│                                                                              │
│   Inputs: model output + expected output                                     │
│   Method: similarity (exact match, BLEU, embedding cosine)                   │
│   Output: per-case 0-1 score                                                 │
│   Catches: factual incorrectness, label mismatch                              │
│   Misses: stylistic quality, valid variation                                  │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ scores blended with...
                                      ▼
┌─ LLM-as-judge (probabilistic, slow, subjective) ─────────────────────────────┐
│                                                                              │
│   Inputs: model output + rubric + judge model                                │
│   Method: separate LLM scores against rubric (1-5 per dimension or bool)     │
│   Output: per-dimension scores                                               │
│   Catches: quality, tone, specificity, narrative coherence                    │
│   Misses: factual errors that "sound right"                                   │
│                                                                              │
│   Calibration: spot-check vs human ratings; agreement >85% required           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                            Aggregate weighted score
                            with attribution per layer
```

Each layer catches what the next misses. The aggregate is meaningful because each component is.

---

## In this codebase

**Case A (partial) — contrl's planned eval discipline applies all three methods.**

For the **form classifier (B3.8)**:
- **Programmatic:** output is a label from a 4-element enum + confidence 0.0-1.0. Schema validation at the boundary; out-of-range confidence is a fail.
- **Reference-based:** ideal here. Each test case has expected label. Exact-match scoring.
- **LLM-as-judge:** not applicable. Labels are discrete; there's no subjective quality dimension.

For the **recommender (B3.9)**:
- **Programmatic:** output schema validation.
- **Reference-based:** partial — there isn't always one "right" exercise to recommend. A/B testing substitutes (B3.9's single-user A/B framing).

For the **coaching agent (Phase 4 Path C, B4C.x)**:
- **Programmatic:** schema, length range, forbidden openers, must-cite-classifier flag.
- **Reference-based:** partial — for the must-cite-classifier check, verify the quoted classifier content is actually in the tool output.
- **LLM-as-judge:** load-bearing. The agent's output is generative + subjective; reference-based scoring would penalize valid variation. Use Opus 4 as judge (larger than candidate Sonnet 4).

**Planned implementation paths:**
- `ml/scripts/eval.py` — programmatic + reference-based for form classifier
- `src/lib/agent/evals/` (planned) — all three layers for coaching agent

---

## Elaborate

**Where this pattern comes from.** The three-method framing is classical in IR/NLP — programmatic (exact match), reference-based (BLEU/ROUGE from machine translation), and human evaluation. LLM-as-judge (2023+) replaces "human eval" with a structured LLM-driven equivalent for scale. The Hamel Husain writings and the Anthropic+OpenAI eval guides codified the layered application.

**The deeper principle.** Different tests measure different properties. The application-testing parallel (unit / integration / e2e) holds in spirit: pick the test for the property you care about. The LLM-specific twist: LLM-as-judge introduces a non-deterministic measurement that itself needs calibration.

**Where this breaks down.** Three places.

1. **Truly subjective tasks with no rubric.** Creative writing, brand-voice generation. LLM-as-judge struggles; human eval is required.
2. **Adversarial inputs.** The methods score the *output's quality*; whether the output should have been refused (adversarial input) is a separate signal that programmatic checks must catch.
3. **Multi-turn tasks.** Scoring a single output is well-defined; scoring an N-turn conversation is harder — methods extend to per-turn or per-trajectory scoring, but the calibration story gets harder.

**What to explore next.**
- [01-eval-set-types](./01-eval-set-types.md) — what each method is scoring against (golden / regression / holdout / adversarial).
- [03-llm-as-judge-bias](./03-llm-as-judge-bias.md) — the calibration deep-dive.
- [08-machine-learning/07-confusion-matrices-and-per-class-metrics](../08-machine-learning/07-confusion-matrices-and-per-class-metrics.md) — ML-side metric framing.

---

## Tradeoffs

| Cost dimension | Programmatic | Reference-based | LLM-as-judge |
|---|---|---|---|
| Per-case cost | ~0 | ~0 (if expected is pre-stored) | ~$0.001–0.01 (judge LLM call) |
| Per-case latency | μs | μs | 500–2000ms |
| Catches structural bugs | YES | partial | partial |
| Catches factual errors | NO | YES (for ground-truth tasks) | partial (judge can be fooled) |
| Catches quality / tone | NO | NO | YES (with rubric + calibration) |
| Calibration needed | Minimal | Minimal | YES (spot-check quarterly) |
| Reproducibility | Perfect | Perfect | Probabilistic |

### Sub-block 1 — what we gave up

LLM-as-judge has real costs. Per case: ~$0.001-0.01 depending on rubric complexity and judge model. At 100 golden cases × monthly run, that's ~$0.1-1/month — tiny. At 100K production samples / month, it's $100-1000 — measurable. Calibration is the bigger cost: 20 cases × human-rated × spot-check labor is a few hours of senior eyeballs per quarter.

### Sub-block 2 — what wrong-method scoring would have cost

I've shipped wrong-method evals. The cost pattern:
- Pick programmatic for a generative task. Score: 92% pass. Confidence: high. Reality: outputs are technically correct but feel generic. User complaints surface in week 3.
- Pick reference-based for a subjective task. Score: 31% match. Hand-review reveals the model's outputs are *better* than the references in many cases — but the score says "broken." Two weeks debating whether the model regressed or the reference set is stale.

The cure was layered methods with explicit attribution. The cost was the lesson.

### Sub-block 3 — the breakpoint

The three-method layered approach is the right call until: (a) the task is purely structural (classifier with 4 labels) — reference-based alone suffices, skip LLM-as-judge; (b) the volume is so small that LLM-as-judge cost doesn't amortize (a one-shot tool used by one user once); (c) the task is so subjective that no rubric works — fall back to human eval, accept the slow loop.

### Sub-block 4 — what wasn't actually a tradeoff

"LLM-as-judge is unreliable." Misframed. Uncalibrated LLM-as-judge is unreliable. Calibrated against human ratings (>85% agreement), it's a useful proxy. The discipline isn't optional but isn't intractable — quarterly calibration is the cost.

---

## Tech reference (industry pairing)

### Promptfoo (eval harness with all three methods)

- **Codebase uses:** Not yet — planned for contrl's coaching-agent evals.
- **Why it's here:** open-source harness with programmatic / reference / LLM-judge support built in.
- **Leading today:** Promptfoo — `innovation-leading` for open-source LLM eval harnesses, 2026.
- **Why it leads:** YAML/JSON config, parallel execution, multiple judge models supported, CI-friendly.
- **Runner-up:** LangSmith Evals — closely related, LangChain-leaning.

### Anthropic Opus 4 as judge

- **Codebase uses:** Not yet — planned for the coaching agent's judge.
- **Why it's here:** larger than the candidate Sonnet 4, different bias profile from same-model judging.
- **Leading today:** Opus 4 — `adoption-leading` for production LLM-judge work on subjective tasks, 2026.
- **Why it leads:** larger model = more reliable rubric adherence; lower length-bias than smaller judges.
- **Runner-up:** GPT-4o — comparable, cross-family is even better for bias diversity.

### Hamel Husain's eval methodology

- **Codebase uses:** N/A — methodology reference.
- **Why it's here:** canonical 2024–2026 reference for production LLM evals, especially the calibration discipline for LLM-as-judge.
- **Leading today:** Hamel Husain's blog (hamel.dev) — `adoption-leading` for production LLM-eval discipline, 2026.
- **Why it leads:** practitioner-credible; specific calibration techniques over abstract principles.
- **Runner-up:** Eugene Yan's eugeneyan.com.

---

## Project exercises

### [B3.8 / B3.10] Programmatic + reference-based scoring for form classifier

- **Exercise ID:** `[B3.8]` (eval harness) + `[B3.10]` (calibration if LLM-as-judge added)
- **What to build:** `ml/scripts/eval.py` that scores classifier outputs against the four eval sets using programmatic + reference-based methods. Per-case score = exact match. Per-set aggregate score reported.
- **Why it earns its place:** the classifier task is well-suited to programmatic + reference-based; LLM-as-judge adds nothing.
- **Files to touch:** `ml/scripts/eval.py` (new).
- **Done when:** all four sets run; four scores reported per release.
- **Estimated effort:** `1–4hr`

### [B4C.eval] LLM-as-judge for coaching agent

- **Exercise ID:** `[B4C.eval]` (hypothetical, post-Phase 4)
- **What to build:** A rubric (`{ specificity, tone, actionability, length_appropriate, cites_classifier }`) + a calibration set of 20 outputs scored by both Opus 4 (judge) and a human. Compute agreement rate. If >85%, proceed with judge-driven evals.
- **Why it earns its place:** the coaching agent's output quality is subjective; programmatic + reference-based don't measure it.
- **Files to touch:** `src/lib/agent/evals/judge-rubric.md`, `src/lib/agent/evals/calibration.json`.
- **Done when:** calibration set agreement reported; judge trusted for the rubric; subsequent evals use the judge.
- **Estimated effort:** `1–2 days`

---

## Summary

Three eval methods, three jobs: programmatic (structural — fast, deterministic, blind to content), reference-based (factual — exact match against ground truth, deterministic), LLM-as-judge (subjective quality — slow, requires calibration). Most production evals layer all three with explicit weights. For contrl's form classifier: programmatic + reference-based. For the coaching agent: all three, with Opus 4 as judge calibrated against 20 human-rated cases.

**Key points:**

- **Programmatic for structure.** Schema, length, keyword, regex. Floor.
- **Reference-based for factual correctness.** Exact-match or similarity. Best for classifiers / extractors.
- **LLM-as-judge for subjective quality.** With a rubric, a bigger/different judge model, and quarterly calibration against human ratings.
- **Pick the method that matches the failure mode.** Wrong method = meaningless score.
- **Layer all three** in production evals with explicit per-layer attribution.

---

## Interview defense

### What an interviewer is really asking

When asked "how do you score LLM/ML outputs?", they want to hear that you know each method's job. The shipped answer names all three, says when to use each, and mentions LLM-as-judge calibration as non-optional. The unshipped answer says "we use BLEU" (or similar) without explaining when that's wrong.

### Likely questions

**[mid] What's the difference between programmatic and reference-based scoring?**

Programmatic checks the output's *shape* — does it match the schema, is it the right length, does it contain forbidden patterns. Reference-based checks the output's *content* — does it match the expected answer. Programmatic catches structural bugs; reference-based catches factual ones. Programmatic alone can pass while content is wrong; reference-based alone can fail while content is acceptably varied.

```
  Programmatic vs reference-based
  
  ┌─────────────────────────┬─────────────────────────┐
  │ Programmatic            │ Reference-based         │
  ├─────────────────────────┼─────────────────────────┤
  │ Shape correct?           │ Content matches expected?│
  │ Schema, length, regex    │ Exact match, BLEU, cosine│
  │ Deterministic            │ Deterministic            │
  │ Misses semantic errors   │ Penalizes valid variation │
  └─────────────────────────┴─────────────────────────┘
```

---

**[senior] When do you use LLM-as-judge?**

When the output's quality has subjective dimensions (tone, specificity, helpfulness) that programmatic and reference-based can't measure. Required: a rubric with concrete criteria, a judge model that's bigger or differently-trained than the candidate, and calibration against human ratings (>85% agreement). Without calibration, the judge's biases produce scores that don't predict human assessments. Recalibrate after model swaps and quarterly.

```
  LLM-as-judge gating
  
  ┌────────────────────────────────────────────────┐
  │ 1. Define rubric with concrete criteria         │
  │ 2. Judge model larger/different from candidate │
  │ 3. Score 20 outputs with judge + human         │
  │ 4. Agreement ≥85%? → trust the judge           │
  │    Agreement <85%? → fix rubric or judge       │
  │ 5. Recalibrate per quarter / model swap        │
  └────────────────────────────────────────────────┘
```

---

**[arch] How does evaluation cost scale?**

Three things scale differently. Programmatic + reference-based are essentially free per case — they run on golden + regression + holdout + adversarial at every release with negligible cost. LLM-as-judge is per-call cost — for a 50-case golden set scored monthly with Opus 4, ~$0.5/month. Run on production samples (100K/month for monitoring), it's $100-1000/month — real money. The mitigation: don't judge every sample. Sample a fraction; alert on judge-score drift over a rolling window. Calibration overhead is human-bounded — a couple hours per quarter regardless of model scale.

```
  Eval cost at scale
  
  ┌──────────────────────┬──────────────────┬──────────────────┐
  │                      │ 50 cases / release │ 100K cases / mo  │
  ├──────────────────────┼──────────────────┼──────────────────┤
  │ Programmatic         │ ~0                 │ ~0                │
  │ Reference-based      │ ~0                 │ ~0                │
  │ LLM-as-judge         │ ~$0.50             │ $100-1000        │
  │ Calibration (human)  │ N/A (quarterly)    │ ~2 hrs/quarter   │
  └──────────────────────┴──────────────────┴──────────────────┘
```

---

### The question candidates always dodge

**"Internet advice: just use the model to grade itself. Why is that wrong?"**

Because same-model self-judging produces scores that drift toward the model's biases. Sonnet 4 grading Sonnet 4's outputs has the same priors that produced the bad outputs — so the bad ones look fine to the judge. Cross-model (Opus 4 grading Sonnet 4, or GPT-4o grading Sonnet 4) catches what same-model misses. The advice "use the same model" comes from research papers about specific narrow tasks where the property happens to hold; doesn't generalize to production rubrics. Calibrated cross-model judging is the discipline.

```
  Same-model vs cross-model judging
  
  ┌─────────────────────────────┬────────────────────────────────────┐
  │ Same model (Sonnet→Sonnet)  │ Cross-model (Opus→Sonnet)          │
  ├─────────────────────────────┼────────────────────────────────────┤
  │ Shared blind spots          │ Different blind spots               │
  │ Rubber-stamps bad output    │ Catches what candidate missed       │
  │ Looks fine in short term    │ Better correlation with human ratings│
  └─────────────────────────────┴────────────────────────────────────┘
```

---

### One-line anchors

- "Three methods, three jobs. Programmatic = shape. Reference = factual. Judge = quality."
- "Pick the method that matches the failure mode you're catching."
- "LLM-as-judge requires a rubric, a different model, and >85% agreement with humans."
- "Most production evals layer all three with explicit attribution per layer."
- "For contrl: programmatic + reference for the classifier; all three for the coaching agent."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw three boxes: Programmatic / Reference-based / LLM-as-judge. Under each: what it catches and what it misses.

Pass: all three boxes with their job + miss noted.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "How do you score LLM outputs?" Checkpoints:
- Did you name all three methods?
- Did you mention LLM-as-judge calibration?
- Did you say to layer them?

**Level 3 — Apply to a new scenario.**
A teammate's chain summarizes documents. They use reference-based scoring (BLEU against a hand-written reference summary). Their golden score is 24% — terrible. Hand-review shows the model's summaries are actually better than the references. Walk through the diagnosis and fix.

Expected: BLEU is wrong-method for summarization (valid variation is penalized). Switch to LLM-as-judge with a rubric (`{covers_main_points, length_appropriate, factually_consistent, tone_matches}`), calibrate against 20 human ratings, run on the existing golden set. Score will move from 24% (meaningless) to a meaningful number that tracks human judgment.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is LLM-as-judge cost. If you were running a chain at 100K calls/day, would you judge every call or sample? Defend with reference to the scale table in [arch] above.

**Quick check — code reference test.**
Without opening files, answer:
- Which method works for the form classifier?
- Which method does the coaching agent need?
- What's the calibration agreement threshold for LLM-as-judge?

Pass: programmatic + reference-based; all three including LLM-as-judge; 85%.
