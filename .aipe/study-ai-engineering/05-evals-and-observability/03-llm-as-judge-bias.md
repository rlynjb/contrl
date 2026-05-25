# LLM-as-judge bias

**Industry name(s):** LLM-as-judge bias, judge calibration, length bias, position bias, familiarity bias
**Type:** Industry standard

> LLMs grading other LLMs have predictable biases: they prefer longer outputs, outputs in styles they were trained on, and outputs that match their own response patterns. Without calibration against human ratings, judge scores drift from what humans would say. The discipline is measuring and correcting for the bias, not pretending it isn't there.

**See also:** → [02-eval-methods](./02-eval-methods.md) · → [01-eval-set-types](./01-eval-set-types.md) · → prompt-engineering [10-self-critique](../../study-prompt-engineering/10-self-critique.md)

---

## Why care

**Move 1.** You set up LLM-as-judge for your coaching agent. The judge is Opus 4; the candidate is Sonnet 4. Rubric: `{specificity, tone, actionability}` scored 1-5. You run 50 outputs through the judge. Average score: 4.2. You ship. Two weeks in, a user complains the coaching feels generic. You score the same outputs with a human reviewer. The human's average: 3.4. The judge was 0.8 points higher on a 5-point scale — systematically biased toward "this looks good enough" while the human caught the genericness the judge missed.

**Move 2.** That "what biases does my judge have" question is what LLM-as-judge calibration answers. Not the judge's score. Not the rubric's quality. Just the bias profile: which dimensions does the judge over-weight (length, fluency), which does it under-weight (subtle quality), and where does its score diverge from what humans would say. The discipline is the calibration loop, not pretending the bias isn't there.

**Why you need to answer that question at all:** Three failures hide in uncalibrated judging. First, **length bias** — judges consistently score longer outputs higher across most rubrics, even when length isn't a rubric criterion. Second, **familiarity bias** — outputs in styles the judge LLM produces itself (LLM-shaped prose) score higher than equally-good outputs in other styles. Third, **score inflation** — judges tend toward the middle-high end of the rubric scale; 1s and 2s are rarely given.

**Before / after.**

Without calibration:
- Judge scores: avg 4.2 across rubric dimensions.
- Confident in the score; ship.
- Production reality: humans rate ~3.4. The 0.8 point gap = systematic bias.
- Quality complaints arrive. Hard to diagnose because the metric said "fine."

With calibration:
- Score 20 outputs with both judge AND human. Compute Pearson correlation, per-dimension agreement rates, and bias offsets.
- Find: judge is +0.7 on tone dimension across the board. Apply linear correction (judge_tone_corrected = judge_tone - 0.7).
- Recalibrate quarterly + after any model swap.
- Judge scores now track human ratings within ±0.3.

**Move 5.** LLM-as-judge bias is what a biased calibrating instrument is in physical measurement — the scale reads 5g heavier than truth on every weight. The fix isn't to throw out the scale; it's to characterize the bias and subtract.

---

## How it works

### Move 1 — The mental model

Think of a thermometer that reads 2°C high on cold days but accurate on warm days. You can still use it — you just subtract 2 from cold readings. The bias is real; the instrument is still useful; calibration is what makes the readings actionable.

LLM judges are biased instruments. Characterize the bias, apply corrections, recalibrate periodically.

Strategy in plain English: **score 20 outputs with both judge AND human; measure agreement and per-dimension offsets; apply corrections; recalibrate quarterly or after any model swap.**

```
  Calibration loop

  ┌────────────────────────────────┐
  │ Pick 20 representative outputs  │
  └─────────────────┬──────────────┘
                    │
                    ▼
  ┌────────────────────────────────┐
  │ Score with judge AND human      │
  └─────────────────┬──────────────┘
                    │
                    ▼
  ┌────────────────────────────────┐
  │ Compute per-dimension:          │
  │   - agreement rate (>= n bucket) │
  │   - Pearson correlation         │
  │   - mean offset (judge - human)  │
  └─────────────────┬──────────────┘
                    │
                    ▼
  Agreement ≥ 85%?     YES → trust the judge for that dimension
                       NO  → fix rubric or use different judge
```

---

### Move 2 — The layered walkthrough

#### The four common biases

**1. Length bias.** Longer outputs score higher on most rubrics. Documented across GPT-4, Claude, Gemini. Magnitude varies; presence is consistent. If your candidate outputs vary in length, watch for this.

**2. Familiarity bias.** Outputs in the judge's own "style" (somewhat formal, well-structured, balanced) score higher than equally-good outputs in other styles (sparse, fragment, conversational). Affects creative-writing evals strongly; classifiers less so.

**3. Position bias** (in pairwise comparison). When asked "which is better, A or B?", judges have a small but real preference for one position (typically the second). Mitigation: ALWAYS randomize position; ALWAYS score both A-then-B and B-then-A and average.

**4. Score inflation.** Judges cluster scores toward the middle-high of the rubric. 1s and 2s rare; 4s and 5s dominate. Useful for distinguishing "great vs okay" but poor for distinguishing "bad vs terrible."

```
  Common biases and severity (rough)
  
  ┌──────────────────────────┬────────────────────────────────┐
  │ Bias type                │ Magnitude (typical)             │
  ├──────────────────────────┼────────────────────────────────┤
  │ Length                   │ +0.3 to +0.8 on 5-point scale   │
  │ Familiarity              │ +0.5 (for LLM-shaped outputs)   │
  │ Position (pairwise)      │ +5–10% preference for position 2 │
  │ Score inflation          │ Modal score = 4 on 1-5 scale    │
  └──────────────────────────┴────────────────────────────────┘
```

---

#### Calibration mechanics

**Step 1 — Pick the calibration set.** 20 outputs covering the range your evals will see. Don't cherry-pick easy or hard cases; sample randomly from a recent production trace + a few representative golden set cases.

**Step 2 — Score with judge.** Run all 20 through your judge model with the rubric.

**Step 3 — Score with human.** Same 20 outputs, same rubric, scored by one human (you or a teammate). Don't tell the human the judge's scores until after they finish.

**Step 4 — Compute the metrics:**

- **Pearson correlation** between judge and human scores per dimension. Above 0.7 is acceptable; below 0.5 means the judge isn't tracking human judgment.
- **Agreement rate** (within ±1 point on a 5-point scale, or exact match on booleans). Above 85% per dimension is the usable threshold.
- **Mean offset** (judge_score - human_score, averaged). Tells you the systematic shift.

**Step 5 — Apply corrections** if the offset is consistent. Subtract the mean offset from judge scores in production.

```
  Calibration spreadsheet (example)
  
  ┌────────┬───────┬───────┬───────────────────────────────┐
  │ Case   │ Judge │ Human │ Per-dimension offset           │
  ├────────┼───────┼───────┼───────────────────────────────┤
  │ ex_001 │  4.5  │  3.5  │ +1.0                           │
  │ ex_002 │  4.2  │  3.8  │ +0.4                           │
  │ ex_003 │  4.0  │  4.0  │  0.0                           │
  │ ex_004 │  3.5  │  3.0  │ +0.5                           │
  │ ...    │  ...  │  ...  │ ...                            │
  ├────────┼───────┼───────┼───────────────────────────────┤
  │ Mean   │  4.05 │  3.42 │ +0.63                          │
  │ Corr   │       │       │ 0.76                           │
  │ Agree  │       │       │ 75% within ±1                  │
  └────────┴───────┴───────┴───────────────────────────────┘
  
  → Judge over-scores by 0.63 on average; correlation 0.76 (acceptable);
    agreement 75% (below threshold). Action: tighten rubric language;
    re-calibrate.
```

---

#### Mitigation patterns

**1. Use a bigger or different-family judge.** Same-model self-judging shares blind spots. Sonnet 4 grading Sonnet 4 rubber-stamps. Opus 4 grading Sonnet 4 catches more. GPT-4o grading Sonnet 4 catches different things (cross-family bias diversity).

**2. Make the rubric concrete.** Vague rubrics maximize bias. "Is this good? 1-5" gives the judge nothing to anchor to — biases dominate. Concrete: "Does the output mention a specific session feature from the input? Yes/no" — the judge has less freedom to drift.

**3. Use boolean dimensions where possible.** Boolean (yes/no) checks have less drift than scalar 1-5 scores. When the dimension can be made boolean, do.

**4. Randomize position in pairwise.** Always score both A-then-B and B-then-A and average.

**5. Spot-check a sample in production.** Each release, take 10 production outputs, score with judge AND a human, check drift. Treat as the canary.

```
  Mitigation effectiveness (rough)
  
  ┌──────────────────────────────────┬─────────────────────────────┐
  │ Mitigation                       │ Effect on bias               │
  ├──────────────────────────────────┼─────────────────────────────┤
  │ Bigger judge (Opus vs Sonnet)    │ -30% to -50% bias              │
  │ Different-family judge (GPT→Anth)│ Different blind spots; mixed   │
  │ Boolean dimensions               │ Removes score-inflation         │
  │ Concrete rubric language         │ -20% to -40% bias              │
  │ Position randomization (pairwise)│ Eliminates position bias        │
  │ Production spot-checks           │ Catches drift quickly           │
  └──────────────────────────────────┴─────────────────────────────┘
```

---

### Move 3 — The principle

Every measurement instrument has bias. The discipline is to characterize it, not pretend it isn't there. LLM-as-judge bias is the LLM-specific instance of a general principle that physicists and statisticians have known since instruments existed: trust but calibrate. The mitigation is mechanical (bigger/different judge, concrete rubrics, boolean dimensions, regular calibration); the failure mode is treating the judge's score as ground truth.

---

## LLM-as-judge bias — diagram

```
┌─ Without calibration ────────────────────────────────────────────────────────┐
│                                                                              │
│   Production outputs → Judge scores → Decisions (ship, iterate)              │
│                              │                                               │
│                              ▼                                               │
│                       systematic bias drifts                                  │
│                       judgment away from human truth                          │
│                                                                              │
│   Result: confident-wrong scores; quality complaints surface late             │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ With calibration ───────────────────────────────────────────────────────────┐
│                                                                              │
│   20 outputs → Judge scores  →─┐                                              │
│                                ├→ compute per-dimension                       │
│                Human scores  →─┘   { correlation, agreement, offset }         │
│                                          │                                    │
│                                          ▼                                    │
│   Apply corrections (subtract offset; flag low-agreement dimensions)          │
│                                          │                                    │
│                                          ▼                                    │
│   Production outputs → Judge scores → Corrected scores → Decisions            │
│                                                                              │
│   Recalibrate quarterly or after any model swap (judge OR candidate)          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — applicable to the planned coaching agent.**

contrl's planned Phase 4 Path C coaching agent will use LLM-as-judge for subjective dimensions (tone, specificity, actionability). The calibration discipline is non-optional:

- **Judge model:** Anthropic Opus 4 (larger than candidate Sonnet 4)
- **Rubric:** concrete, with boolean dimensions where possible (`cites_classifier: bool`, `length_appropriate: bool`, `specificity_1_5`, `tone_1_5`, `actionability_1_5`)
- **Calibration set:** 20 outputs from a held-aside production trace + 5 golden cases
- **Cadence:** quarterly + after model swaps + before any release that changes the rubric

**Planned implementation paths:**
- `src/lib/agent/evals/judge.ts` — judge call wrapper
- `src/lib/agent/evals/calibration.json` — calibration set with judge + human scores
- `src/lib/agent/evals/calibration-report.md` — quarterly calibration report

Not yet on disk. Curriculum builds B4C.x.

---

## Elaborate

**Where this pattern comes from.** LLM-as-judge was named in 2023 papers (Zheng et al., "Judging LLM-as-a-Judge"). Bias documentation expanded through 2024. By 2026, calibration is consensus among production teams using LLM-as-judge. Hamel Husain's writing pushed the discipline into mainstream practice.

**The deeper principle.** Calibration is older than LLMs. Every measurement instrument has systematic bias; the question is whether you characterize it. The LLM-specific twist: the biases are predictable across model generations (length bias, familiarity bias) so calibration generalizes; but the magnitude shifts with model swaps, so recalibration is necessary.

**Where this breaks down.** Three places.

1. **Rubric mismatch with reality.** If the rubric is wrong (doesn't reflect what users actually care about), calibration against humans doesn't help — both the judge and human will score against the wrong thing.
2. **Tiny calibration sets.** Below ~15 outputs, statistical noise dominates; correlation estimates are unreliable. 20 is the floor.
3. **Stable populations of similar outputs.** If all your outputs are similar shape/length, calibration on a diverse set may not transfer to your narrow case. Sample calibration cases that look like production.

**What to explore next.**
- [02-eval-methods](./02-eval-methods.md) — when to use LLM-as-judge vs other methods.
- prompt-engineering [10-self-critique](../../study-prompt-engineering/10-self-critique.md) — related pattern where the LLM evaluates and revises its own output.
- Zheng et al. (2023) "Judging LLM-as-a-Judge" — canonical paper.

---

## Tradeoffs

| Cost dimension | Calibrated judge | Uncalibrated judge |
|---|---|---|
| Setup cost | 20-case scoring + analysis (~2-3 hrs) | Zero |
| Quarterly maintenance | 20-case re-scoring + report (~1-2 hrs) | Zero |
| Score reliability | High (corrected for known bias) | Low (raw judge scores) |
| Drift detection | Yes (calibration set tracks over time) | No |
| Trust in production | High | Low |

### Sub-block 1 — what we gave up

Hours per quarter for calibration. For a small project that's a few hours of senior time; tractable. The bigger investment is the initial rubric design and the 20-case scoring effort — maybe a day total to set up. After that, quarterly maintenance is light.

### Sub-block 2 — what no calibration would have cost

I've shipped uncalibrated judging. Cost pattern: month 1 judge scores look reasonable; month 2 user complaints arrive about issues the judge missed; month 3 hand-check reveals the judge has been over-scoring. Three months of "improving" outputs against a metric that didn't track quality. The fix was calibration; the cost was the three months.

### Sub-block 3 — the breakpoint

Calibration is the right call until: (a) the task uses only programmatic/reference-based methods (no judge needed); (b) you're in a one-shot evaluation that won't recur (calibration overhead doesn't amortize); (c) the eval is purely directional (e.g., "did the new prompt improve over the old?") and absolute calibration doesn't matter. For most production LLM-as-judge work, calibration matters.

### Sub-block 4 — what wasn't actually a tradeoff

"Calibration is expensive." Hours per quarter for the most consequential measurement in your eval pipeline is cheap. The work isn't optional; the cost is bounded.

---

## Tech reference (industry pairing)

### Anthropic Opus 4 as judge

- **Codebase uses:** Not yet — planned for contrl's coaching-agent judge.
- **Why it's here:** larger than candidate Sonnet 4; different bias profile from same-model judging.
- **Leading today:** Opus 4 — `adoption-leading` for production LLM-judge work, 2026.
- **Why it leads:** larger model reduces bias; reliable rubric adherence; lower length-bias than smaller judges.
- **Runner-up:** GPT-4o (cross-family) — same role with different bias profile.

### Promptfoo (calibration as a first-class concept)

- **Codebase uses:** Not yet.
- **Why it's here:** open-source eval harness with judge-calibration support built in.
- **Leading today:** Promptfoo — `innovation-leading` for open-source LLM evals, 2026.
- **Why it leads:** supports multiple judge models, pairwise comparison with position randomization, calibration set tracking.
- **Runner-up:** LangSmith Evals — closely related; commercial.

### Zheng et al. (2023) "Judging LLM-as-a-Judge"

- **Codebase uses:** N/A — methodology reference.
- **Why it's here:** the canonical paper documenting LLM-as-judge biases (position, length, familiarity).
- **Leading today:** still the foundational reference.
- **Why it leads:** controlled experiments across multiple models; quantifies bias magnitudes; introduces "MT-Bench" benchmark.
- **Runner-up:** Anthropic and OpenAI internal eval documentation — confirms bias trends across model generations.

---

## Project exercises

### [B4C.judge-calibration] Calibrate the coaching agent's judge

- **Exercise ID:** `[B4C.judge-calibration]` (hypothetical, post-Phase 4)
- **What to build:** Score 20 outputs with both Opus 4 (judge) and a human reviewer. Compute per-dimension Pearson correlation, agreement rate, mean offset. Generate calibration report. If agreement <85%, fix the rubric or switch judge.
- **Why it earns its place:** the discipline that makes the judge's scores meaningful.
- **Files to touch:** `src/lib/agent/evals/{calibration.json, calibration-report.md}` (planned).
- **Done when:** report exists; agreement reported; corrections (if any) documented.
- **Estimated effort:** `1–4hr`

---

## Summary

LLM-as-judge has predictable biases — length, familiarity, position, score inflation. The discipline is calibration: score 20 outputs with both judge AND human, compute agreement / correlation / offset per dimension, apply corrections, recalibrate quarterly. Mitigations: use a bigger or different-family judge; concrete rubrics; boolean dimensions where possible. Without calibration, judge scores drift from human judgment and become unreliable. For contrl's coaching agent: Case B, but the discipline is mandatory whenever LLM-as-judge is used.

**Key points:**

- **Length, familiarity, position, score inflation** are the common biases.
- **Bigger or different-family judge** reduces bias substantially.
- **Concrete rubrics + boolean dimensions** reduce score drift.
- **Calibration: 20 outputs, judge + human, ≥85% agreement.**
- **Recalibrate quarterly + after any model swap.**

---

## Interview defense

### What an interviewer is really asking

When asked "how do you trust LLM-as-judge scores?", they want to hear calibration. The shipped answer names the biases, describes the calibration loop, and gives a threshold (≥85% agreement). The unshipped answer says "we use Opus" without explaining what that buys.

### Likely questions

**[mid] What's wrong with using the same model as judge?**

Shared blind spots. Sonnet 4 grading Sonnet 4's output has the same priors that produced the output; bad outputs look fine to the judge. The fix is cross-tier (Opus grades Sonnet) or cross-family (GPT grades Anthropic). Reduces bias substantially.

```
  Same-model vs different-model judge
  
  Sonnet → Sonnet:    blind spots align; rubber-stamps
  Opus → Sonnet:      larger model catches more
  GPT-4o → Sonnet:    cross-family; different blind spots
```

---

**[senior] How do you calibrate?**

Score 20 representative outputs with both judge and a human reviewer. Compute per-dimension Pearson correlation, agreement rate (within ±1 on 5-point scale), and mean offset. Above 85% agreement = trust the judge. Below = fix the rubric or switch judges. Apply mean-offset corrections in production. Recalibrate quarterly and after any model swap (judge or candidate). The calibration set itself becomes a tracked artifact.

```
  Calibration metrics
  
  ┌─────────────────────────┬──────────────────────┐
  │ Metric                  │ Threshold             │
  ├─────────────────────────┼──────────────────────┤
  │ Pearson correlation     │ ≥ 0.7 acceptable      │
  │ Agreement rate (±1)     │ ≥ 85% per dimension   │
  │ Mean offset             │ < 0.5 acceptable      │
  └─────────────────────────┴──────────────────────┘
```

---

**[arch] How does this change at scale?**

Calibration overhead is human-bounded (one person's 1-2 hours per quarter, regardless of model volume). Judge cost scales with eval frequency — running on every PR at 100K cases/release is expensive ($100s); sampling a fraction with rolling drift detection is cheap ($10s). Calibration set composition matters at scale: representative sampling (not cherry-picked) becomes essential because production distributions shift over time.

---

### The question candidates always dodge

**"Just trust the judge — modern LLMs are great judges."**

Modern LLMs are good *with calibration*. Uncalibrated, they have measurable systematic biases — length, familiarity, score inflation — that produce confident-wrong scores. The "they're great" framing skips the discipline. Production teams that skip calibration discover the issue three months in when complaints arrive about quality the metric said was fine. Calibration takes hours per quarter; the cost of not doing it is the months you lose to wrong measurements.

---

### One-line anchors

- "Length, familiarity, position, inflation. The common biases."
- "20-case calibration: judge + human, ≥85% agreement per dimension."
- "Bigger judge (Opus > Sonnet) or cross-family (GPT > Anth) reduces bias."
- "Concrete rubrics + booleans where possible reduces drift."
- "Recalibrate quarterly + after any model swap."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the calibration loop: 20 outputs → judge + human → per-dimension metrics → corrections / fix rubric / change judge.

Pass: all four stages with the gate criteria (≥85% agreement).

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "How do you calibrate LLM-as-judge?" Checkpoints:
- Did you name 2+ biases?
- Did you mention the 20-case + agreement threshold?
- Did you mention recalibration cadence?

**Level 3 — Apply to a new scenario.**
A teammate ships LLM-as-judge for an output-quality task. Judge scores: avg 4.3. User complaints: quality is genuinely poor. Walk through the calibration to diagnose the gap.

Expected: score 20 outputs with judge + human. Find agreement rate. Likely outcomes: (a) low correlation = rubric is vague, rewrite; (b) high correlation + large mean offset = apply offset correction; (c) high correlation + small offset = judge is fine, rubric is missing the dimension users actually care about.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is hours per quarter for calibration. If you were shipping a one-time eval with no follow-up, would you skip calibration?

Defend with reference to sub-block 3 (one-shot evals where calibration overhead doesn't amortize).

**Quick check — code reference test.**
Without opening files, answer:
- What's the agreement threshold for trusting a judge?
- What's the cadence for recalibration?
- What does contrl plan for the coaching agent's judge?

Pass: ≥85%; quarterly + after model swaps; Opus 4 judging Sonnet 4 with calibrated rubric.
