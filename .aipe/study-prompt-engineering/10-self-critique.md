# Self-critique and self-consistency

**Industry name(s):** Self-critique, self-refine, self-consistency, reflexion, critic-then-revise
**Type:** Industry standard

> Ask the model to evaluate its own output, then revise based on the evaluation. 2–5× the token budget for one extra step of reliability. Worth it on high-stakes outputs where the cost of a bad output exceeds the cost of N retries. The diminishing-returns problem is real: the critic shares blind spots with the generator.

**See also:** → [05-eval-driven-iteration](./05-eval-driven-iteration.md) · → [09-chain-of-thought](./09-chain-of-thought.md) · → [02-structured-outputs](./02-structured-outputs.md)

---

## Why care

**Move 1.** You build a chain that edits the user's own journal entries — proofreads, fixes typos, smooths awkward phrasing, while preserving the user's voice. You ship. Two weeks in, a user reports that the chain rewrote a meaningful sentence into a generic one. The user's entry "I'm angry at my brother and I don't want to apologize" became "There is some tension in my relationship with my brother that may benefit from communication." The chain produced something that looked grammatically polished but was a serious distortion of the user's actual writing. The model produced this in one forward pass with full confidence.

**Move 2.** That "did the model actually do the right thing, or did it produce something that *looks* right" question is what self-critique answers. Not whether the output is grammatical. Not whether it's well-formed. Just: was it correct on the dimensions that matter? The mechanism: a second LLM call where the model evaluates its own first output against a rubric, and either approves it or revises. The token cost is 2–5× a single call; the value is catching the class of failures where the model's first answer looks confident and is wrong.

**Why you need to answer that question at all:** Two failures live in single-pass generative chains. First, **confident wrongness** — the model produces output that's superficially good (well-formed, on-topic) but wrong on a dimension that matters (preserved meaning, factual accuracy, voice). Without a critique pass, you have no way to catch this short of human review. Second, **invisible quality decay** — the same chain runs thousands of times; quality drops 1% per week as the model upgrades and prompts subtly shift; you don't notice until the cumulative drift produces a complaint.

The diminishing-returns problem is real and important to name: a critic that shares blind spots with the generator will rubber-stamp the same bad outputs the generator produced. Sonnet critiquing Sonnet has the same priors that produced the bad output. The mitigation: cross-model critique (Opus 4 critiques Sonnet 4), rubric-based critique (the critic checks specific dimensions, not "is this good"), and periodic human spot-checks.

**Before / after.**

Without self-critique:
- Journal-edit chain produces "polished" output that distorts the user's meaning ~3% of the time. User reports rare, hard-to-debug.
- Each output is one forward pass. No audit trail of what the model thought about its own work.
- A bug in the prompt (added "professionalize the tone") causes meaning distortion; nobody catches it for a month because each output looks fine in isolation.

With self-critique:
- Same chain, but each output is critiqued against a rubric ("preserve user's voice; preserve emotional content; fix only typos and grammar"). On ~3% of outputs the critic flags voice-distortion and a revision pass produces a fixed output.
- Token cost: 2–3× per call. Latency: ~600ms extra.
- The "professionalize the tone" prompt bug surfaces immediately as a sustained critic-flag rate; gets caught at the next eval run.

**Move 5.** Self-critique is what pull-request review is for code — a second pass that catches what the author missed. The "PR reviewer" here is another model call against a rubric. It catches less than a human reviewer but more than no review.

---

## How it works

### Move 1 — The mental model

Picture a writer-and-editor relationship. The writer drafts; the editor reviews. The editor doesn't rewrite everything — they flag specific issues (this paragraph contradicts the lede, this transition is rough, this sentence is fine but the next one is unclear). The writer revises. The output is better than either the writer or the editor could produce alone.

Self-critique implements writer-and-editor with two LLM calls. The first call is the writer (produces the output). The second call is the editor (critiques against a rubric). If the critic flags issues, a third call revises. The cost is 2× to 3× the token budget; the value is catching first-draft errors that would have shipped.

The strategy in plain English: **generate, then critique against a rubric, then revise if needed. Use a different model for the critic where possible. Don't trust same-model self-critique blindly.**

```
  Writer-and-editor pattern (two-call self-critique)

  ┌──────────────────────────────────────────────────────────────┐
  │  Call 1 — Generator                                          │
  │    input: user request                                       │
  │    output: candidate response                                │
  └────────────────────────────┬─────────────────────────────────┘
                               │ candidate output
                               ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Call 2 — Critic (different model or same with rubric)       │
  │    input: candidate + rubric                                 │
  │    output: {                                                 │
  │      issues_found: bool,                                     │
  │      flags: [{field, problem, fix}],                         │
  │      revised: (revised output if issues_found)               │
  │    }                                                         │
  └────────────────────────────┬─────────────────────────────────┘
                               │ revised output (if needed)
                               ▼
                    return to caller
```

The pattern is structural: produce candidate, critique, revise. Each step has a typed output. Each step is observable.

---

### Move 2 — The layered walkthrough

#### When self-critique earns its tokens

The cost is 2-3× per call. The value: catching the class of "confident wrongness" failures. Worth doing when the cost of a bad output exceeds the cost of N extra calls.

```
  When self-critique pays

  ┌────────────────────────────────────┬──────────────────────────┐
  │ Task                               │ Self-critique?            │
  ├────────────────────────────────────┼──────────────────────────┤
  │ High-stakes generation             │                          │
  │   (medical advice, legal text,     │ Yes — error cost high     │
  │   user-content editing)            │                          │
  ├────────────────────────────────────┼──────────────────────────┤
  │ User-facing creative output        │                          │
  │   (image generation prompts,       │ Sometimes — depends on    │
  │   marketing copy)                  │ how visible errors are    │
  ├────────────────────────────────────┼──────────────────────────┤
  │ Cheap classifier                   │ No — error cost low,      │
  │                                    │ retry is enough           │
  ├────────────────────────────────────┼──────────────────────────┤
  │ Low-trust intermediate step in     │                          │
  │ a chain (e.g., LLM-extracted       │ Yes — downstream depends   │
  │ structured data)                   │ on this being right       │
  ├────────────────────────────────────┼──────────────────────────┤
  │ Subjective output where there's    │ Limited — critique has    │
  │ no clear right answer              │ no rubric to anchor       │
  └────────────────────────────────────┴──────────────────────────┘
```

If you're coming from frontend, this is the same calculus as "should I add an extra round-trip to validate?" — worth it when the cost of a bad result exceeds the cost of the round-trip. For most LLM chains, the cost-of-bad is small and self-critique is overhead. For high-stakes outputs, the cost-of-bad is large and self-critique is essential.

Boundary condition: don't add self-critique speculatively. The eval suite (see [05-eval-driven-iteration](./05-eval-driven-iteration.md)) is what tells you whether self-critique improves the chain — measure both variants on your eval set before committing to the 2-3× cost.

---

#### The critic's rubric

If self-critique is going to work, the critic needs a specific rubric — not "is this good?" but "does this preserve the user's voice / contain no fabricated facts / match the schema exactly." Vague rubrics produce rubber-stamp critics; specific rubrics produce useful critics.

```ts
// Illustrative — a generator/critic/revision pipeline for high-stakes edits
const EditCritique = z.object({
  voice_preserved: z.boolean().describe(
    "Does the edit preserve the user's distinctive voice? " +
    "If the original had specific emotional language, is it preserved? " +
    "If the original was casual, is the edit still casual?"
  ),
  meaning_preserved: z.boolean().describe(
    "Does the edit preserve the meaning of the original? " +
    "Are all factual claims preserved? Are all entities (names, places) preserved?"
  ),
  improvements_only: z.boolean().describe(
    "Does the edit only fix typos, grammar, and minor phrasing? " +
    "Or does it rewrite content?"
  ),
  flags: z.array(z.string()).describe(
    "Specific issues found. Empty if the edit is good."
  ),
});
```

Each field is a specific dimension the critic checks. Boolean fields are easier for the critic than 1-5 scales (binary judgment is more reliable than fine-grained scoring). The `flags` array lets the critic name specific problems for the revision step.

```
  Rubric shape: specific dimensions, not "is this good"

  Bad rubric                          Good rubric
  ─────────────────────────────────   ──────────────────────────────────────
  "Rate the output 1-5"               "Does it preserve the user's voice? (bool)
                                       Does it preserve meaning? (bool)
                                       Does it only fix typos/grammar? (bool)
                                       List specific issues found."

  Critic rubber-stamps                Critic checks named dimensions
  Score drifts toward 4               Each dimension has clear pass/fail
```

Boundary condition: the rubric should be designed against the chain's known failure modes. If the chain's failures are mostly "loses user voice," that's the dimension to check most carefully. If failures are mostly "introduces fabricated facts," check for that. The rubric is bespoke per chain; there's no universal critique rubric.

---

#### Cross-model critique vs same-model critique

The diminishing-returns problem: a critic that shares blind spots with the generator rubber-stamps the same bad outputs. Sonnet 4 critiquing Sonnet 4 has the same priors that produced the bad output — it's susceptible to the same "looks polished, is wrong" failures.

The mitigation: use a different model as the critic. Two patterns:

1. **Cross-family critique.** Anthropic generator + OpenAI critic, or vice versa. Different training distributions mean different blind spots.
2. **Cross-tier critique.** Sonnet 4 generator + Opus 4 critic. The bigger model catches what the smaller one missed.

```
  Critique-model selection

  ┌─────────────────────────────────────────────────────────────────┐
  │ Generator             │ Critic              │ Reliability         │
  ├──────────────────────┼─────────────────────┼─────────────────────┤
  │ Sonnet 4             │ Sonnet 4 (same)     │ Low — same blind spots │
  │ Sonnet 4             │ Opus 4 (bigger)     │ High — bigger catches more │
  │ Sonnet 4             │ GPT-4o (other family)│ High — different priors │
  │ Sonnet 4             │ Haiku (smaller)     │ Low — usually worse     │
  └─────────────────────────────────────────────────────────────────┘
```

Boundary condition: cross-family critique doubles your vendor dependency. If you're committed to Anthropic-only for compliance or operational reasons, cross-tier (Sonnet generator, Opus critic) is the right path.

---

#### Self-consistency: a different variant

A related but distinct pattern: self-consistency. Instead of generator + critic, you run the generator N times (with non-zero temperature for variation), get N candidate outputs, and pick the most consistent answer.

```
  Self-consistency for a classifier

  Run the classifier 5 times on the same input:
    Run 1 → "search"
    Run 2 → "search"
    Run 3 → "chat"     ◄─ outlier
    Run 4 → "search"
    Run 5 → "search"

  Final answer: "search" (4/5 votes)
  Confidence: 0.8 (4/5)
```

Self-consistency works for tasks with a discrete answer space (classification, structured extraction with fixed schema). It doesn't work for generative tasks where each run produces different prose — there's no way to vote.

```
  Self-critique vs self-consistency
  ┌─────────────────────────┬─────────────────────────┬─────────────────────────┐
  │                         │ Self-critique           │ Self-consistency        │
  ├─────────────────────────┼─────────────────────────┼─────────────────────────┤
  │ Mechanism               │ Generate → critique → revise│ Generate N → vote       │
  │ Calls per output        │ 2–3                     │ N (typically 3–7)       │
  │ Works on generative?    │ Yes — revision pass     │ No — outputs vary       │
  │ Works on classification?│ Yes — flags wrong label │ Yes — vote on label     │
  │ Diminishing returns     │ Critic shares blind spots│ Outliers vote-suppressed │
  └─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

Boundary condition: self-consistency is cheaper per "extra check" than self-critique (N parallel calls instead of N sequential). For classification tasks where you'd consider self-critique, self-consistency is often the better tool — and they can be combined: 3 generator calls + 1 critic that picks the best.

---

#### The audit loop

Self-critique's outputs are training data for prompt improvement. Log the cases where the critic flagged issues; periodically review them.

```ts
// Illustrative — self-consistency over N parallel samples
const result = await runWithCritique(input);
if (result.critic_flagged) {
  log.info({
    event: 'critic_flagged',
    chain: 'journal-edit',
    input,
    candidate_output: result.candidate,
    flags: result.flags,
    final_output: result.revised,
  });
}
```

A weekly review of `critic_flagged` events tells you what kinds of mistakes the generator is making. Sustained flags on "voice_preserved: false" means the generator's prompt has drifted toward overly-polished output; fix the prompt; flag rate drops.

```
  Audit loop turns critic flags into prompt improvements

  ┌────────────────────────────────────────────────────┐
  │  Production critic_flagged events                  │
  │    week of 2026-05-15:                              │
  │      voice_preserved=false: 47                      │
  │      meaning_preserved=false: 3                     │
  │      improvements_only=false: 22                    │
  └─────────────────────┬──────────────────────────────┘
                        │ pattern: voice + improvements_only
                        ▼
  ┌────────────────────────────────────────────────────┐
  │  Hypothesis: generator's prompt is too polishing.   │
  │    Add a constraint: "preserve user's casual tone,  │
  │    don't make sentences more formal."               │
  └─────────────────────┬──────────────────────────────┘
                        │
                        ▼
  ┌────────────────────────────────────────────────────┐
  │  Eval suite re-run with new generator prompt.       │
  │  Flag rate next week: ~5 voice_preserved violations.│
  │  Confirmed improvement.                             │
  └────────────────────────────────────────────────────┘
```

Boundary condition: the audit loop only works if the rubric is specific enough to attribute failures. "Output was bad" doesn't help; "voice_preserved was false" does.

---

### Move 3 — The principle

Self-critique is the LLM equivalent of asking a second pair of eyes to check the work — useful when the cost of being wrong is high, wasteful when the cost is low. The discipline that distinguishes useful self-critique from theater: a specific rubric (not "is it good"), a different model (or at least a different tier), and an audit loop that turns critic flags into prompt improvements. Without the rubric the critic rubber-stamps. Without the different model the critic shares blind spots. Without the audit loop the critique data goes to waste.

The full picture is below.

---

## Self-critique — diagram

The two-call (or three-call) pipeline with the audit loop.

```
┌─ Generator call ─────────────────────────────────────────────────────────────┐
│                                                                              │
│   Input → Generator (e.g., Sonnet 4) → candidate output                       │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ candidate
                                      ▼
┌─ Critic call ────────────────────────────────────────────────────────────────┐
│                                                                              │
│   {candidate, rubric} → Critic (e.g., Opus 4 or GPT-4o) → critique result    │
│                                                                              │
│   critique result:                                                           │
│     { voice_preserved: bool,                                                 │
│       meaning_preserved: bool,                                               │
│       improvements_only: bool,                                               │
│       flags: string[] }                                                      │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
   all dimensions pass                              one or more flagged
   → return candidate                               ┌──────────────────────────┐
                                                    │ Revision call             │
                                                    │   {candidate, flags}      │
                                                    │   → Generator with        │
                                                    │     critique context      │
                                                    │   → revised output        │
                                                    └────────┬─────────────────┘
                                                             │
                                                             ▼
                                                       return revised
                                                          │
                                                          ▼
┌─ Audit loop ─────────────────────────────────────────────────────────────────┐
│                                                                              │
│   Every critic-flagged case is logged.                                       │
│   Weekly review patterns → prompt improvements → eval re-run → ship.         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

The three-call pipeline (generator, critic, revision) catches the "confident wrongness" class of failures. The audit loop converts the cost into long-term prompt quality improvements.

---

## In this codebase

**Case B — not currently planned for contrl.**

contrl's planned coaching agent is the only LLM surface, and the cost-of-bad-output is medium (a wrong coaching message is annoying but not catastrophic — the user reads it, ignores it if wrong, the world goes on). Self-critique's 2-3× token cost doesn't pay back at contrl's scale and stakes:

- **Solo scale.** ~1-2 calls per day. Doubling token cost is pennies, not dollars. The cost case is moot; the bigger question is operational complexity.
- **Medium stakes.** No medical claims, no legal claims, no financial actions. Form coaching that lands wrong is recoverable.
- **Existing safety rails.** The 5 tools are read-only; the agent can't take any action that requires reversal. Schema validation catches structural drift. The eval suite catches behavioral drift.

When self-critique WOULD earn its place in contrl: if the coaching agent expanded to call write tools (e.g., automatically modifying the user's next workout plan), the critic pass becomes non-negotiable for the same reason it's non-negotiable on any agent with write authority.

**Lightweight alternative for contrl: prompt-level self-review.**

Instead of a full critic chain, the coaching agent's system prompt can include a final-section instruction: "Before finalizing the message, check: does it cite at most one cue? Does it avoid the rotation list? Is it under 80 words? If any answer is no, revise." This is single-call self-review — the model conditions on the constraints during generation, which catches some of the same failures as a separate critic pass at a fraction of the cost. It's a weaker version of the discipline but earns its place at contrl's scale.

**ML side — not applicable.**

The form classifier produces deterministic outputs. "Self-critique" doesn't have an analog for a discriminative model; the closest concept is model ensembling (running multiple models and voting), which is the self-consistency variant of this concept but in ML-classifier shape.

---

## Elaborate

**Where this pattern comes from.** Self-critique was named in Madaan et al. (2023) "Self-Refine: Iterative Refinement with Self-Feedback" and Shinn et al. (2023) "Reflexion: Language Agents with Verbal Reinforcement Learning." Self-consistency was Wang et al. (2022) "Self-Consistency Improves Chain-of-Thought Reasoning." Production adoption picked up through 2024 as critic-then-revise patterns became standard for high-stakes LLM applications.

**The deeper principle.** A second pass with a different perspective catches errors the first pass missed. This is generally true in software (code review), generally true in writing (editor relationship), and turns out to be true for LLMs (cross-model critique). The catch is that "different perspective" has to be genuinely different — same model critiquing itself with vague rubrics doesn't improve anything. The pattern works when the critic has rubric-defined criteria and ideally comes from a different model family or tier.

**Where this breaks down.** Three cases.

1. **Same-model self-critique without a specific rubric.** "Is this response good?" gets rubber-stamped. The diminishing-returns problem in its most acute form.
2. **Cost-constrained chains.** A classifier that gets 95% accuracy without critique and 96% with critique at 2× cost — the 1% gain rarely justifies doubling the bill.
3. **Subjective generation where there's no rubric.** A caption-writing chain producing creative prose has no clear "voice preserved" criterion to check; critique becomes vague vibe-checking.

**What to explore next.**
- [05-eval-driven-iteration](./05-eval-driven-iteration.md) → the audit loop's destination; critic flags become eval cases.
- [09-chain-of-thought](./09-chain-of-thought.md) → CoT and self-critique are complementary; CoT exposes reasoning, critique evaluates output.
- Madaan et al. (2023) "Self-Refine" — the canonical self-critique paper.
- Wang et al. (2022) "Self-Consistency" — the canonical self-consistency paper.

---

## Tradeoffs

| Cost dimension | Self-critique | Single-pass generation |
|---|---|---|
| Calls per output | 2–3 | 1 |
| Token cost | 2–3× | Baseline |
| Latency | +~600ms | Baseline |
| Catches confident-wrong outputs | Yes (with right rubric + critic model) | No |
| Audit trail | Critic flags logged | None |
| Implementation cost | New rubric, new chain wiring | Zero |
| Diminishing returns (same-model) | Real | N/A |

### Sub-block 1 — what we gave up

The 2–3× token cost is the main one. For high-volume chains, this is real money. For a chain doing 100k calls/day at $0.005/call uncached, self-critique adds ~$10–15k/month. Worth it only if the cost-of-bad-output exceeds that. For a chain editing the user's journal entries, the cost-of-bad is "user reports the chain rewrote their meaning" — a real user-trust event — and the token cost is justified. For a cheap classifier, the cost-of-bad is "wrong label routed to a wrong handler" — usually recoverable; not justified.

The other cost is **latency**. Two LLM calls in sequence add ~600ms over one. For background chains, no problem. For user-facing real-time chains, ~600ms can be the difference between "responsive" and "slow."

### Sub-block 2 — what no self-critique would have cost

I have shipped both. The no-critique cost on a journal-edit chain:

- **Day 1–7:** chain works. User reports zero issues.
- **Day 14:** a user reports the chain rewrote a meaningful sentence into something polished but generic. Investigation: model's "be helpful" prompt drift pushing toward over-polishing. No audit trail; can't tell how often this happens.
- **Day 30:** add lightweight self-critique with a "voice preserved" rubric. Catches the bug pattern at 3% of outputs immediately. Generator prompt fix drops to 0.5% by week 35.
- **Day 90:** zero similar reports. The 2× token cost has been paid; the user-trust event has been prevented.

The cost-of-bad on a journal-edit chain is high (the chain modifies the user's words). The 2× cost is the right price.

### Sub-block 3 — the breakpoint

Self-critique is the right call until: (a) the cost-of-bad-output is genuinely low (a classifier where wrong labels are recoverable downstream); (b) the chain is already very accurate (>97%) on a frontier model with clear examples — diminishing returns are large; (c) you can't afford 2× the token cost and 600ms more latency. For most high-stakes generative chains, self-critique is right.

### Sub-block 4 — what wasn't actually a tradeoff

"Adding self-critique adds complexity." It does, but the complexity is structured — one new schema, one new call site, one audit dashboard. The structural pieces are reusable across chains. The marginal complexity per additional chain with critique is small.

---

## Tech reference (industry pairing)

### Cross-model LLM-as-judge

- **Codebase uses:** Not currently planned for contrl. Reserved for if the coaching agent gains write authority over user data (workout plans, exercise schedules).
- **Why it's here:** the discipline of using a different model as the critic to avoid shared blind spots.
- **Leading today:** Claude Opus 4 — `adoption-leading` for critic-of-Sonnet, 2026.
- **Why it leads:** larger model, stronger reasoning, lower length-bias than smaller models, mature tool-use for rubric scoring.
- **Runner-up:** GPT-4o — comparable as critic of Claude outputs; valuable for cross-family blind-spot diversity.

### Structured rubric schemas (Zod)

- **Codebase uses:** Not currently planned for contrl. Reserved for the deferred write-authority case.
- **Why it's here:** the schema that turns "is it good?" into specific named dimensions (voice_preserved, meaning_preserved, etc.).
- **Leading today:** Zod with `.describe()` annotations — `adoption-leading` for production critique schemas, 2026.
- **Why it leads:** typed at the boundary; descriptions become part of the prompt the critic sees; boolean fields more reliable than 1-5 scales.
- **Runner-up:** JSON Schema with manual descriptions — same shape, slightly less ergonomic.

### Self-consistency voting (parallel calls + majority)

- **Codebase uses:** Not yet — alternative pattern for classification chains.
- **Why it's here:** the cheaper "multiple-model-runs vote on the answer" pattern. Doesn't require a separate critic model.
- **Leading today:** Hand-rolled across providers — `adoption-leading` for cost-constrained reliability gains on classification, 2026.
- **Why it leads:** N parallel calls have N × baseline cost but only baseline latency; works on any provider; combines with self-critique cleanly.
- **Runner-up:** Single-call with high-temperature reasoning — less reliable; voting beats it on edge cases.

---

## Project exercises

### [B4C.self-review] Add prompt-level self-review to the coaching agent

- **Exercise ID:** `[B4C.self-review]`
- **What to build:** Append a "before finalizing, check" block to `src/lib/agent/system.md` that asks the agent to verify the message cites at most one cue, avoids the rotation list, stays under 80 words, and references the right exercise. The check happens inside the same call — no separate critic pass.
- **Why it earns its place:** earns the discipline at contrl's scale without paying the 2× cost of a full critic pipeline.
- **Files to touch:** `src/lib/agent/system.md`.
- **Done when:** the eval suite measures any quality delta on edge cases (rotation list, word count); no token-cost doubling.
- **Estimated effort:** `<1hr`

### [defer] Full critic pipeline (if/when write authority arrives)

- **Exercise ID:** `[defer]` — not currently in scope
- **What to build:** If/when the coaching agent gains write authority (e.g., automatically updates the user's workout plan), wire a separate critic chain: generator (Sonnet 4) → critic (Opus 4) with a rubric checking destructive-edit avoidance, scope adherence, and user-consent assumptions. Revision if any flag false.
- **Why it earns its place:** mandatory the moment the agent has reversible-or-worse side effects.
- **Files to touch:** `src/lib/agent/critic.ts`, `src/lib/agent/runner.ts`.
- **Done when:** every write-authoritative call goes through critic; critic-flagged events logged.
- **Estimated effort:** `1–2 days` if/when the write surface lands.

---

## Summary

Self-critique generates → critiques against a rubric → revises if needed. It catches confident-wrong outputs that single-pass generation misses, at 2–3× the token cost. The discipline that makes it work: specific named-dimension rubrics (not "is it good"), cross-model or cross-tier critics (to avoid shared blind spots), and an audit loop that turns critic flags into long-term prompt improvements. Use it on high-stakes generative chains where cost-of-bad-output exceeds the 2× call cost; skip it on cheap classifiers and on already-very-accurate chains.

**Key points:**

- **2–3× cost is the price.** Worth it when cost-of-bad-output is high.
- **Use a different model as critic.** Sonnet critiquing Sonnet shares blind spots; Opus critiquing Sonnet catches more.
- **Specific named-dimension rubric, not "is it good."** Boolean checks per dimension beat vague 1-5 scales.
- **Audit loop is the long-term payoff.** Critic flags become eval cases; prompt improvements drop the flag rate.
- **Self-consistency is the cheaper alternative for classification.** Parallel calls + majority vote; lower latency than sequential critique.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "how do you make LLM outputs more reliable?", they want to hear whether you've shipped the second-pass pattern. The shipped answer names specific rubrics, cross-model critique, and the audit loop. The unshipped answer is "I add more instructions and hope."

### Likely questions

**[mid] When do you use self-critique?**

On high-stakes generative chains where the cost of a wrong output exceeds the 2× token cost of an extra critic pass. Editing user content. Producing user-visible structured output where correctness matters. Not on cheap classifiers where wrong labels are recoverable downstream. The decision is cost-of-bad vs cost-of-extra-call — measure it.

```
  When self-critique pays
  ┌─────────────────────────────┬──────────────────────┐
  │ High-stakes user content    │ Yes                  │
  │ Cheap classifier            │ No                   │
  │ Background generation       │ Maybe                │
  │ User-facing realtime        │ Only if budget allows │
  └─────────────────────────────┴──────────────────────┘
```

---

**[senior] Why use a different model for the critic?**

Because same-model self-critique shares blind spots. Sonnet 4 critiquing Sonnet 4 will rubber-stamp the same "confident polished but wrong" outputs that the generator produced. The mitigation is a different perspective — either cross-tier (Opus 4 critiquing Sonnet 4) or cross-family (GPT-4o critiquing Claude). The cost is doubled vendor dependency in the cross-family case, but the reliability gain is real.

```
  Same-model critique vs cross-model

  ┌────────────────────────────┬──────────────────────────────────┐
  │ Generator: Sonnet 4         │ Reliability                       │
  │ Critic:                     │                                  │
  │   Sonnet 4 (same)           │ Low — shared blind spots          │
  │   Opus 4 (bigger, same fam) │ High — bigger catches more        │
  │   GPT-4o (other family)     │ High — different priors           │
  │   Haiku (smaller)           │ Low — usually worse than gen      │
  └────────────────────────────┴──────────────────────────────────┘
```

---

**[arch] How does self-critique interact with eval-driven iteration?**

The audit loop is the bridge. Every critic-flagged event in production gets logged with the candidate output and the flagged dimensions. Weekly, you review patterns — if 47 cases this week flagged voice_preserved=false, the generator's prompt is over-polishing; add a constraint to the system prompt. Re-run the eval suite to confirm the flag rate drops. The critic isn't just a runtime check; it's a production-side signal feeding back into the prompt. Over time the generator gets better and the critic catches fewer issues — the 2× cost decreases as quality improves.

```
  Self-critique audit loop ↔ eval iteration

  ┌─────────────────────────────────────────────────────────────┐
  │ Production: critic-flagged events logged                     │
  │                                                              │
  │ Weekly review:                                               │
  │   patterns surface common failure modes                      │
  │                                                              │
  │ Add new generator prompt constraints OR add new eval cases   │
  │ that test the failure mode                                   │
  │                                                              │
  │ Re-run eval suite. Flag rate next week → drops.              │
  └─────────────────────────────────────────────────────────────┘
```

---

### The question candidates always dodge

**"Internet advice says self-critique improves all outputs. Why don't you use it everywhere?"**

Because the cost is real and the gain isn't universal. Same-model self-critique without a specific rubric is theater — the critic rubber-stamps. Generic "rate this output" critique adds tokens without catching real failures. The shipped form (specific rubric, cross-model critic, audit loop) does improve outputs, but at 2× cost — which only makes sense when the cost-of-bad-output is high. For a cheap classifier where wrong labels are recoverable, the math doesn't work. The "use everywhere" advice ignores cost; production teams that take that advice run out of LLM budget halfway through the quarter.

```
  Where the advice goes wrong

  Internet take                       Production reality
  ─────────────────────────────       ───────────────────────────────────
  "Self-critique improves outputs"    Only with specific rubric + diff model
  "Use it on every chain"             2× cost; only worth it on high-stakes
  "Same model is fine as critic"      Rubber-stamps own blind spots
```

---

### One-line anchors

- "Generator → critic → revision. 2–3× token cost for one extra reliability step."
- "Specific rubric per dimension, not 'is it good?'"
- "Cross-model critic. Sonnet generator + Opus critic, or Sonnet + GPT-4o."
- "Self-consistency for classification: parallel calls + majority vote. Cheaper than critique."
- "Audit loop: critic flags become eval cases, become prompt improvements."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the three-call pipeline (generator, critic, revision) plus the audit loop. Label the rubric's role in the critic call.

Pass: you got the three calls in order, the rubric on the critic, and the audit loop connecting critic flags to eval cases.

**Level 2 — Explain it out loud.**
Without notes, in under 90 seconds: "When and how do you use self-critique?" Checkpoints:
- Did you mention the cost-of-bad-output decision?
- Did you mention cross-model critique?
- Did you mention the audit loop?

If you skipped any: you described self-critique, not the discipline.

**Level 3 — Apply to a new scenario.**
A teammate wants to add self-critique to a 3-way classifier that currently gets 95% accuracy on Sonnet 4. Walk through whether it's worth the 2× cost.

Expected: probably not. At 95% baseline accuracy, the critic might catch a few more bad outputs (taking accuracy to 96–97%) but at 2× cost. For a high-volume classifier, that 1–2% improvement costs serious money. Better: focus on improving the eval suite to catch the 5% failures more reliably, or use self-consistency (3 parallel calls + vote) which is cheaper and works better for classification than critique-then-revise.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is "2× cost vs reliability gain." If you were starting a new generative chain that you knew would handle user-content edits, would you build in self-critique from Day 1 or add it after seeing failures?

There's no right answer. Defend with reference to the cost-of-bad-output (user trust on user content is high) and the build-from-Day-1 discipline ([03-prompts-as-code](./03-prompts-as-code.md) parallels).

**Quick check — code reference test.**
Without opening files, answer:
- What's the rule about the critic model?
- What's the rubric shape that beats "is it good?"
- What's the cheaper alternative for classification tasks?

Pass: different from generator (cross-tier or cross-family); specific boolean dimensions; self-consistency (parallel + vote).

---
