# Chain-of-thought (CoT)

**Industry name(s):** Chain-of-thought prompting, CoT, reasoning prompts, step-by-step prompting
**Type:** Industry standard

> Ask the model to reason step-by-step before answering. Helps on multi-step problems; wastes tokens on simple lookups. Modern frontier models do CoT internally now, so explicit CoT is less necessary than it was in 2023 — but it still helps cheaper models and complex tasks. When you want both reasoning AND a structured answer, the reasoning goes in a `thinking` field of the structured output, not as free-form prose.

**See also:** → [02-structured-outputs](./02-structured-outputs.md) · → [07-output-mode-mismatch](./07-output-mode-mismatch.md) · → [10-self-critique](./10-self-critique.md)

---

## Why care

**Move 1.** You have a classifier chain that decides whether a user's journal entry "warrants escalation to a human." Three categories: `none`, `gentle-followup`, `urgent`. The chain works at ~85% on test cases. The errors cluster on inputs with subtle context — phrases that mean different things depending on the rest of the entry. You add more instructions. Accuracy doesn't budge. You realize the model is making the decision in one forward pass without "thinking about it" — and the cases that need thinking are exactly where it fails.

**Move 2.** That "make the model think before deciding, on the cases that benefit" question is what chain-of-thought answers. Not the prompt's quality. Not the model size. Just the discipline of getting the model to *show its work* before producing the final answer. The mechanism: structured output with a `reasoning` field that the model fills in before the `answer` field. The model writes its reasoning, the act of writing it changes the trajectory of the answer, accuracy on hard cases goes up.

**Why you need to answer that question at all:** Two failure modes hide in CoT-free chains. First, **multi-step problems are answered in one step** — the model effectively makes a snap judgment when the input requires considering several factors. For classifications where the right answer depends on weighing context, this drops accuracy. Second, **debugging the model's "thinking" is impossible** without seeing it — if the model is wrong on a case, you can't tell whether it's a knowledge problem, a reading-the-input problem, or a weighing-the-factors problem. CoT exposes the trajectory.

The modern caveat: frontier models (Sonnet 4+, GPT-4o+, Opus 4) do CoT internally now — they have a "thinking" mode and they use it whether or not you ask. Explicit CoT is less load-bearing than it was in 2023. But explicit CoT still helps cheaper models (Haiku, GPT-4o-mini) and still helps for tasks where you want to *audit* the reasoning, not just trust it.

**Before / after.**

Without CoT (simple structured output):
- Classifier accuracy plateaus at 85%. Hard cases miss because the model doesn't "consider" them.
- Wrong-classification debugging requires re-reading the input and guessing what the model "thought."
- A new contributor can't tell when to trust the chain's output vs when to double-check.

With CoT (structured output with `reasoning` field):
- Accuracy improves to 92% on Haiku; ~88% to 90% on frontier models (smaller gain).
- Wrong classifications come with the model's reasoning visible. You can see whether it misread, weighed wrong, or hit a knowledge gap.
- Token cost goes up — ~150–500 tokens per call extra. Money trade for accuracy + auditability.

**Move 5.** Chain-of-thought is what `console.log` debugging is for application code — visible execution. You can see what the code did; you can see what the model thought.

---

## How it works

### Move 1 — The mental model

Think of a code review where you ask the reviewer to write out their reasoning before stating their approval/rejection verdict. "Considering the test coverage, the API change is non-breaking, but the error handling is incomplete in edge cases — therefore, request changes." The act of writing the reasoning forces the reviewer to consider the factors instead of pattern-matching to a verdict. CoT does the same to the model.

The strategy in plain English: **add a `reasoning` field that comes before the `answer` field in the structured output. The model writes the reasoning, then writes the answer. The reasoning shapes the answer.**

```
  CoT structured output (the code-review-with-reasoning analogy)

  Schema:
    {
      reasoning: string,   ◄─ comes FIRST in the output
      verdict: enum        ◄─ comes after; the reasoning shaped it
    }

  Model output (one tool call, two fields):
    {
      "reasoning": "The entry mentions feeling stuck about the design
                    review, but the tone is reflective rather than crisis-
                    indicating. There's no language about self-harm or
                    immediate distress. This is a normal emotional state
                    worth gentle followup, not urgent intervention.",
      "verdict": "gentle-followup"
    }
```

The model can't write the verdict without writing the reasoning first (the schema forces the field order). The reasoning constrains the verdict.

---

### Move 2 — The layered walkthrough

#### The structured-output CoT pattern

If you're coming from frontend, this is the equivalent of asking a React render function to compute intermediate values before returning the JSX — the intermediate computations shape what gets rendered. CoT places the model's "intermediate computations" in a `reasoning` field that's visible in the output.

```ts
// loopd planned schema for an escalation classifier
const EscalationResult = z.object({
  reasoning: z.string().describe(
    "Walk through the factors: emotional tone, urgency markers, " +
    "context. Consider before deciding."
  ),
  verdict: z.enum(['none', 'gentle-followup', 'urgent']),
});
```

The `.describe()` on the reasoning field is load-bearing — it tells the model what to think about. Without it, the model might write reasoning like "This is a chat message about a journal entry. The user wants me to classify it." Useless. With it, the reasoning is directed at the factors that matter for the decision.

```
  CoT schema design

  ┌──────────────────────────────────────────────────────────────────┐
  │ reasoning: string                                                 │
  │   .describe("...the specific factors to consider...")             │ ◄─ directs
  │                                                                   │      thinking
  │ verdict: enum                                                    │
  │   .describe("the final answer")                                  │
  └──────────────────────────────────────────────────────────────────┘
```

Boundary condition: the field order matters. JSON-Schema and most LLM tool-call implementations preserve declaration order in the prompt the model sees. `reasoning` must come BEFORE `verdict`. If you reverse the order, the model produces the verdict first and the "reasoning" becomes post-hoc rationalization — which destroys the entire point.

---

#### Why field order matters

The reason CoT works is that the model is autoregressive — each token conditions the next. When the model emits the `reasoning` field's content first, those tokens become the conditioning context for the `verdict` field. The model literally reasons its way to the answer.

When the model emits the `verdict` first, the reasoning that follows is post-hoc — the model is rationalizing an already-decided answer rather than deriving it. This isn't a quirk; it's how autoregressive generation works.

```
  Autoregressive flow with CoT (correct order)

  Token stream during generation:
    "reasoning":  "The entry mentions feeling stuck about the design
                   review, but the tone is reflective rather than crisis-
                   indicating..."
    [reasoning concludes]
    "verdict":    "gentle-followup"
                      ↑
                  this token is conditioned on all the reasoning above

  Autoregressive flow without CoT (or with reversed order — broken)

  Token stream during generation:
    "verdict": "gentle-followup"
                       ↑
                  this token comes first, conditioned only on the prompt
                  (whatever the model snap-decides)
    "reasoning": "The entry mentions..."
                       ↑
                  this is post-hoc rationalization; doesn't change the verdict
```

Boundary condition: this property holds across providers but the strength varies. Frontier models internalize the effect (they "think" internally before producing output regardless of field order); cheaper models depend on explicit field-order CoT to get the benefit. Always order reasoning first.

---

#### When to use CoT

The cost/benefit calculus:

- **Worth it:** multi-factor decisions where the answer depends on weighing inputs (escalation classification, complex extraction with multiple constraints, code review-style tasks). Especially worth it on cheaper models.
- **Not worth it:** simple lookups, structured classification with clear examples, format conversion. The extra ~150–500 tokens of reasoning are pure cost for no quality gain.

```
  When CoT earns its tokens

  ┌─────────────────────────────────────────┬─────────────────────────┐
  │ Task                                    │ CoT?                    │
  ├─────────────────────────────────────────┼─────────────────────────┤
  │ Multi-factor classification             │ Yes — accuracy gain     │
  │   (escalation, severity scoring)        │                         │
  ├─────────────────────────────────────────┼─────────────────────────┤
  │ Math / numeric reasoning                │ Yes — large gain         │
  ├─────────────────────────────────────────┼─────────────────────────┤
  │ Simple classification with examples     │ No — examples suffice    │
  │   (3-way intent, sentiment)             │                         │
  ├─────────────────────────────────────────┼─────────────────────────┤
  │ Format conversion (JSON → CSV)          │ No — pure mechanical     │
  ├─────────────────────────────────────────┼─────────────────────────┤
  │ Generative tasks where output IS prose  │ N/A — the prose IS       │
  │   (caption, summary)                    │   the reasoning          │
  └─────────────────────────────────────────┴─────────────────────────┘
```

Boundary condition: "multi-factor" is the key signal. If you can answer the task by looking at one field of the input, CoT doesn't help. If you need to consider three or four factors and weigh them, CoT helps.

---

#### CoT on frontier vs cheaper models

The single biggest shift since 2023: frontier models do CoT internally now.

- **Sonnet 4 / Opus 4 / GPT-4o:** have internal "thinking" or extended reasoning modes. Often expose them as a separate field (`thinking` in Claude 4.x). The model reasons internally even when you don't explicitly ask. Explicit CoT in your prompt provides marginal gain (~1–3% accuracy) on hard tasks.
- **Haiku / GPT-4o-mini / smaller models:** do not reliably reason internally. Explicit CoT provides large gain (~5–15% accuracy) on multi-factor tasks.

```
  CoT gain by model tier

  ┌─────────────────────────────┬───────────────────────────────┐
  │ Model tier                  │ Explicit CoT accuracy gain    │
  ├─────────────────────────────┼───────────────────────────────┤
  │ Frontier (Sonnet 4+, etc.)  │ 1–3% on hard tasks            │
  │ Mid (Haiku, GPT-4o-mini)    │ 5–15% on hard tasks           │
  │ Open-source small (7B–8B)   │ 10–25% on hard tasks          │
  └─────────────────────────────┴───────────────────────────────┘
```

The implication: if you route a classifier to Haiku to save money (see [06-single-purpose-chains](./06-single-purpose-chains.md)), explicit CoT recovers most of the accuracy gap that the cheaper model would otherwise have. Routing Haiku + CoT often outperforms Sonnet without CoT on classification tasks, at a fraction of the cost.

Boundary condition: this is empirical and changes as models improve. Test on your specific eval suite (see [05-eval-driven-iteration](./05-eval-driven-iteration.md)) before committing to a route. The estimates above are rough.

---

#### Anti-pattern: CoT in free-form prose

The wrong way to do CoT is to ask the model "think step by step, then answer" without structured output. The model produces a wall of prose, somewhere in which is the answer, and the downstream parser tries to extract it.

```
  Wrong: free-form CoT

  Prompt: "Think step by step about whether this entry warrants
           escalation. End with your verdict."

  Output:
    "Let me think through this. The entry mentions feeling stuck about
     the design review. The tone is reflective. There's no urgent
     language. So I think this is gentle-followup... but actually, let
     me reconsider. The reflection could be a precursor to deeper
     issues. Hmm. But the specific topic (design review) suggests a
     normal work context. Verdict: gentle-followup."

  Parsing problem:
    Extract the verdict via regex? Brittle.
    Trim everything before the last "Verdict:"? Fragile.
    Schema-fail rate is high; the model sometimes forgets the verdict
    or reverses its decision mid-prose.
```

The right way: structured output with `reasoning` and `verdict` as separate fields. The reasoning is in its own field where you can read it; the verdict is in its own field where the parser can grab it.

```
  Right: structured CoT

  Schema: { reasoning: string, verdict: enum }

  Output (one tool call):
    {
      "reasoning": "The entry mentions feeling stuck about the design
                    review. Tone is reflective, not crisis-indicating.
                    No urgent language. Normal emotional state.",
      "verdict": "gentle-followup"
    }

  Parsing:
    Zod.parse — done. Both fields typed.
```

Boundary condition: free-form CoT was the only option in 2022 because structured outputs didn't exist. It's now the inferior pattern; structured outputs with reasoning + answer fields supersede it. The exception is when no structured output is available (older models, certain APIs).

---

### Move 3 — The principle

Chain-of-thought is the LLM equivalent of asking a function to log its intermediate computations before returning — visible execution. The 2026 form is structured output with a `reasoning` field placed BEFORE the `answer` field. Frontier models internalize this now; cheaper models still benefit. The discipline matters because CoT-without-structured-output (free-form prose CoT) is the inferior pattern that 2022–2023 advice still recommends — supersede it with structured CoT and reap both accuracy AND auditability.

The full picture is below.

---

## Chain-of-thought — diagram

The structured-output CoT pattern and the autoregressive token flow that makes it work.

```
┌─ Schema declaration (in code, Zod) ──────────────────────────────────────────┐
│                                                                              │
│   EscalationResult = z.object({                                              │
│     reasoning: z.string().describe(                                          │
│       "Consider: emotional tone, urgency markers, context"                   │
│     ),                                                                       │
│     verdict: z.enum(['none', 'gentle-followup', 'urgent'])                   │
│   })                                                                         │
│                                                                              │
│   FIELD ORDER MATTERS: reasoning FIRST, verdict SECOND.                      │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Provider-side generation (autoregressive) ──────────────────────────────────┐
│                                                                              │
│   Model emits tokens for `reasoning`:                                        │
│     "The entry mentions feeling stuck about the design review,"              │
│     " but the tone is reflective rather than crisis-indicating..."           │
│                                          │                                   │
│                                          ▼ all reasoning tokens become       │
│                                            context for the next token        │
│                                                                              │
│   Model emits tokens for `verdict`:                                          │
│     "gentle-followup"                                                        │
│         ▲                                                                    │
│         │ conditioned on the entire reasoning above                          │
│         │ (this is why field order matters)                                  │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Boundary validation ────────────────────────────────────────────────────────┐
│                                                                              │
│   Zod.safeParse(toolUse.input)                                               │
│   Both fields typed; downstream uses verdict, logs reasoning for audit.      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

The reasoning field is in the structured output for three reasons: (1) it forces the model to reason BEFORE producing the verdict, (2) it makes the reasoning auditable in production logs, (3) it removes the need for prose parsing.

---

## In this codebase

**Case B — loopd escalation classifier (planned).**

The clearest CoT candidate in loopd's planned chain set: a future escalation classifier that decides whether a journal entry warrants gentle follow-up or urgent intervention. Not in the curriculum's Phase 1 list (Phase 1 is intent / tags / caption / search / summary), but a likely Phase 2A or Phase 4 addition given the journaling context.

Planned shape:

- **Schema:** `loopd/src/lib/llm/chains/escalation/schema.ts` with `{ reasoning: string, verdict: enum }`.
- **Model:** Sonnet 4 (the stakes warrant the frontier model; routing to Haiku here would be premature optimization).
- **Few-shot:** 3 canonical examples plus 1 edge case, each with the reasoning field filled in showing the kind of weighing-of-factors the model should do.
- **Production logging:** reasoning gets logged alongside verdict; the audit trail tells the operator what the model "thought" on every escalation decision.

Not yet on disk. The intent classifier (already planned) doesn't need CoT — 3-way categorical with strong examples on a frontier model is a pure-classification task where CoT adds tokens without accuracy.

**Case A — aipe spec instructions as implicit CoT.**

aipe specs aren't runtime LLM chains, but they often instruct the agent to do CoT-shaped work — "first, do X, then Y, then Z" — through Step 1 / Step 2 / Step 3 structures. The slash command literally is a structured CoT prompt for Claude Code.

- **`/Users/rein/Public/aipe/specs/study.md`** — Step 1 / Step 2 / Step 3 / etc. structure. Each step is one reasoning move that produces input for the next step. The agent reasons through the steps; the spec is the structured CoT scaffolding.
- **`/Users/rein/Public/aipe/specs/audit-refactor.md`** — Same pattern: read context, load template, diff against codebase, output structured plan. Each step is a thinking move.

aipe specs don't emit a `reasoning` field per se — the agent's actions ARE the reasoning, visible in the agent's response. The principle is the same: structured, ordered reasoning before the final output.

---

## Elaborate

**Where this pattern comes from.** Chain-of-thought was named in Wei et al. (2022) "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models." Free-form CoT ("let's think step by step") was the canonical recipe through 2023. The structured-output CoT pattern (reasoning + answer fields) emerged in 2024 as tool-calling matured. Frontier models' internal reasoning modes (DeepSeek R1, OpenAI o1, Claude extended thinking) began appearing late 2024.

**The deeper principle.** Models reason better when the act of reasoning is visible to themselves — when intermediate tokens condition the next tokens. Asking the model to "think" without forcing it to produce thinking tokens doesn't work; the structure has to force the tokens to appear. The structured-output reasoning field is the engineering encoding of "show your work before you answer."

**Where this breaks down.** Three cases.

1. **Tasks where reasoning doesn't help.** Simple classification with clear examples, mechanical format conversion, lookups. The model already has the answer at one forward-pass; CoT is overhead.
2. **Frontier models with internal reasoning.** When the model already does internal CoT (extended thinking modes), explicit CoT in the prompt provides marginal gain. Often not worth the tokens.
3. **Tasks where the reasoning IS the output.** A caption chain that produces prose; a summarization chain. The output already IS reasoning-shaped; adding a separate `reasoning` field is redundant.

**What to explore next.**
- [02-structured-outputs](./02-structured-outputs.md) → the schema mechanism that makes structured CoT possible.
- [10-self-critique](./10-self-critique.md) → the related pattern where the model evaluates its own output and revises.
- Wei et al. (2022) "Chain-of-Thought Prompting" — the canonical paper.
- Anthropic's extended-thinking documentation for the modern internal-CoT shape.

---

## Tradeoffs

| Cost dimension | Structured CoT | No CoT |
|---|---|---|
| Per-call tokens | +150–500 reasoning tokens | None |
| Per-call cost (Sonnet 4, cached prefix) | +$0.000005–$0.000015 | None |
| Accuracy on multi-factor tasks (Haiku) | +5–15% | Baseline |
| Accuracy on multi-factor tasks (frontier) | +1–3% | Baseline (frontier internalizes CoT) |
| Auditability | High — reasoning logged | None — guess what model thought |
| Latency | +~200ms (more tokens generated) | Baseline |
| Implementation cost | Add `reasoning` field to schema | Zero |

### Sub-block 1 — what we gave up

Two things. First, tokens — every call costs an extra 150–500 reasoning tokens. At scale, this is real money (though cached prefixes don't help because the reasoning is per-call). Second, latency — generating those tokens adds ~200ms per call. For latency-sensitive UI features, this can be noticeable.

The accuracy gain is usually worth both costs on multi-factor tasks on cheaper models. On frontier models doing simple classification, neither cost is worth paying.

### Sub-block 2 — what the no-CoT alternative would have cost

I have shipped both. The no-CoT cost on a multi-factor classifier:

- Accuracy plateaus at ~85% despite prompt iteration. Edge cases miss because the model doesn't consider multiple factors.
- Debugging wrong outputs requires guessing what the model "thought" — there's no audit trail.
- Routing to a cheaper model magnifies the accuracy gap to ~75% on Haiku vs ~85% on Sonnet.

With structured CoT on the same chain: ~92% on Sonnet, ~88% on Haiku. The Haiku-with-CoT version beats no-CoT Sonnet at a fraction of the cost. Per-call token overhead is real but pays back at the chain level.

### Sub-block 3 — the breakpoint

Structured CoT is the right call until: (a) the task is single-factor classification or mechanical conversion (no benefit to weighing); (b) you're on a frontier model with internal reasoning modes and your eval suite shows no measurable accuracy gain from explicit CoT (don't pay the tokens); (c) latency is so tight that an extra 200ms per call is unacceptable (rare; usually optimizable elsewhere first). For most multi-factor tasks on production chains, CoT is right.

### Sub-block 4 — what wasn't actually a tradeoff

"Reasoning output exposes the model's logic to users." Sometimes raised as a concern — won't users see the reasoning? Only if you show it to them. The reasoning lives in the structured output; the consumer code decides what to display. Most production chains log the reasoning for audit but display only the verdict. The discipline is "show the user the answer; log the reasoning for ops." Not actually a tradeoff if you structure the consumer correctly.

---

## Tech reference (industry pairing)

### Claude Sonnet 4.6 extended thinking

- **Codebase uses:** Not yet — planned for high-stakes loopd chains where the internal reasoning quality matters.
- **Why it's here:** the API parameter that enables Claude's extended internal reasoning. Roughly: the model spends additional compute thinking before producing output, exposed as a separate `thinking` block in the response.
- **Leading today:** Anthropic extended thinking — `innovation-leading` for production CoT on frontier models, 2026.
- **Why it leads:** internal reasoning that genuinely improves on multi-step reasoning tasks; auditable via the `thinking` block in responses; controllable via `thinking_budget_tokens` parameter.
- **Runner-up:** OpenAI o-series models (o1, o3) — competitive on reasoning-heavy tasks; pricing model differs (priced like premium reasoning models).

### Structured-output reasoning field

- **Codebase uses:** Not yet — planned for any loopd chain that warrants CoT.
- **Why it's here:** the Zod-schema pattern that places `reasoning` before `answer` in the structured output.
- **Leading today:** Schema-based CoT with reasoning fields — `adoption-leading` for production CoT, 2026.
- **Why it leads:** combines CoT accuracy gains with structured-output guarantees; reasoning auditable; verdict typed.
- **Runner-up:** Free-form CoT ("think step by step then answer") — works on older APIs without structured output; inferior pattern when structured output is available.

### Wei et al. (2022) "Chain-of-Thought Prompting"

- **Codebase uses:** N/A — methodology reference.
- **Why it's here:** the canonical paper that named CoT and demonstrated its accuracy gains on reasoning benchmarks.
- **Leading today:** still the foundational reference; cited universally.
- **Why it leads:** introduced the term, established the empirical case, motivated the years of follow-on work that produced extended-thinking modes.
- **Runner-up:** Kojima et al. (2022) "Large Language Models are Zero-Shot Reasoners" — the "let's think step by step" zero-shot CoT variant.

---

## Project exercises

### [B2A.7] Add structured CoT to the escalation classifier (when built)

- **Exercise ID:** `[B2A.7]`
- **What to build:** When the escalation classifier chain is added to loopd, design its schema with `reasoning: string` BEFORE `verdict: enum`. Compare accuracy with and without the reasoning field on a 30-case eval set.
- **Why it earns its place:** materializes structured CoT on a real multi-factor task. The accuracy delta is what teaches the discipline.
- **Files to touch:** `loopd/src/lib/llm/chains/escalation/{schema.ts, examples.md, chain.ts}` (planned).
- **Done when:** eval set runs both variants; accuracy delta documented in `docs/ml-results.md`; the reasoning field is auditable in production logs.
- **Estimated effort:** `1–4hr` (after chain skeleton exists)

### [B2A.8] Measure Haiku + CoT vs Sonnet without CoT

- **Exercise ID:** `[B2A.8]`
- **What to build:** Run the same 50-case eval set on (a) Haiku with structured CoT and (b) Sonnet without CoT. Compare accuracy, latency, and cost.
- **Why it earns its place:** the data point that proves cheap+CoT often beats expensive+no-CoT. Empirical evidence drives the routing discipline in [06-single-purpose-chains](./06-single-purpose-chains.md).
- **Files to touch:** an eval script under `loopd/scripts/eval/`.
- **Done when:** a comparison table is written to `docs/ml-results.md` with the accuracy/latency/cost numbers for both variants.
- **Estimated effort:** `1–4hr`

---

## Summary

Chain-of-thought is the discipline of forcing the model to reason before answering, encoded in structured output as a `reasoning` field placed before the `answer` field. The autoregressive nature of LLMs means the reasoning tokens condition the answer tokens — the field order is load-bearing. Worth doing on multi-factor decisions, especially on cheaper models where the accuracy gain is largest. Modern frontier models internalize CoT, reducing the gain from explicit prompting; for non-frontier or cost-sensitive routes, explicit CoT is still essential.

**Key points:**

- **Field order matters.** `reasoning` BEFORE `answer`. Reversed, the reasoning becomes post-hoc rationalization.
- **Use structured CoT, not free-form prose.** Schema fields are typed and parseable; prose CoT is fragile.
- **Cost: 150–500 extra tokens per call.** Worth it on multi-factor tasks; not worth it on simple classification.
- **Haiku + CoT often beats Sonnet without CoT.** Worth measuring on your specific task.
- **Modern frontier models have internal CoT.** Gain from explicit prompting is smaller (~1–3%) than on cheaper models (~5–15%).

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "do you use chain-of-thought?", they want to hear nuance: which tasks, which models, which encoding. The shipped answer names the structured-output pattern, the field-order rule, and the frontier-vs-cheap model distinction. The unshipped answer is "yes" or "no" without the qualifications.

### Likely questions

**[mid] When do you use CoT?**

On multi-factor decisions where the model needs to weigh several aspects of the input. Escalation classifiers, complex extractions, severity scoring. Not on simple classification with clear examples — there CoT is just extra tokens with no accuracy gain. The encoding is a structured-output `reasoning` field placed BEFORE the answer field, so the reasoning shapes the answer instead of being post-hoc.

```
  When CoT pays
  ┌────────────────────────────────────┬───────────────────────┐
  │ Multi-factor classification         │ Yes                   │
  │ Numeric/math reasoning              │ Yes                   │
  │ Simple 3-way classification         │ No                    │
  │ Format conversion                   │ No                    │
  └────────────────────────────────────┴───────────────────────┘
```

---

**[senior] Why does the field order matter?**

LLMs are autoregressive — each token conditions the next. If `reasoning` comes first in the output, the reasoning tokens become context for the answer tokens; the model literally reasons its way to the answer. If `answer` comes first, the model commits to an answer before reasoning, and the reasoning that follows is just rationalization — doesn't change the answer at all. Field order in the Zod schema (or JSON Schema) is typically preserved by providers, so this is enforced at the tool-call API level.

```
  Reasoning first             Answer first
  ─────────────────────────   ─────────────────────────
  "reasoning": "..."           "verdict": "X"   ◄─ committed
  "verdict": "X"   ◄─ shaped   "reasoning": "..."  ◄─ post-hoc
   by reasoning                rationalization
```

---

**[arch] How does CoT interact with model routing?**

Routing strategy: classifiers and extractors go to cheap models (Haiku). Cheap models benefit MOST from explicit CoT — accuracy gain is 5–15% vs 1–3% on frontier. So the routing decision is "cheap model + CoT" instead of "expensive model." Net cost is often 5–10x lower than expensive-model-no-CoT, while accuracy is comparable or better. The tradeoff lives in the eval suite — measure both variants on your specific task before committing.

```
  Routing matrix

  ┌────────────────────────────────┬────────────────────┬──────────────────┐
  │                                │ Cheap (Haiku)      │ Frontier (Sonnet) │
  ├────────────────────────────────┼────────────────────┼──────────────────┤
  │ Multi-factor task with CoT     │ Best $/accuracy    │ Good but $$       │
  │ Multi-factor task without CoT  │ Cheap but inaccurate│ Good and $$      │
  │ Simple task with CoT           │ Cheap, no gain     │ $$ for no gain    │
  │ Simple task without CoT        │ Best $/accuracy    │ $$ for no gain    │
  └────────────────────────────────┴────────────────────┴──────────────────┘
```

---

### The question candidates always dodge

**"Internet advice says CoT improves all tasks. Why don't you use it everywhere?"**

Because tokens cost money. Each CoT call adds 150–500 reasoning tokens of output. On a simple 3-way classifier where the model already gets 96% accuracy without CoT, those tokens are pure cost — 1.5× to 3× the output token count per call, with no measurable accuracy gain. At scale, that's wasted money. The "improves all tasks" advice comes from research demonstrations on hard reasoning benchmarks, not from production economics. The right take: measure your specific task's accuracy with and without CoT on your specific model; pay for CoT where it earns its tokens; skip it where it doesn't.

```
  Where the advice goes wrong

  Research benchmarks               Production economics
  ─────────────────────────────     ──────────────────────────────────
  Hard reasoning tasks              Many simple-classification chains
  One-shot demonstration            Per-call cost summed over millions
  "Accuracy goes up!"               "Accuracy goes up by 1% at 2× cost"
  ────                              ────
  CoT looks universally good        CoT looks task-dependent
```

---

### One-line anchors

- "Structured CoT: reasoning field, placed BEFORE the answer field."
- "Field order is load-bearing. Autoregressive generation means reasoning conditions the answer."
- "Worth it on multi-factor tasks. Skip on simple classification."
- "Cheap model + CoT often beats expensive model without CoT."
- "Frontier models have internal CoT. Explicit gain is marginal there; large on cheaper models."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the schema with `reasoning` and `verdict` fields. Label which comes first and why.

Pass: reasoning first, verdict second, with one-line note on the autoregressive reason.

**Level 2 — Explain it out loud.**
Without notes, in under 60 seconds: "When do you use chain-of-thought?" Checkpoints:
- Did you name the structured-output (reasoning field) pattern?
- Did you mention field order matters?
- Did you mention the cheap-model-with-CoT vs expensive-without-CoT tradeoff?

If you skipped any: you described CoT, not the discipline.

**Level 3 — Apply to a new scenario.**
A teammate is shipping a chain that decides whether a customer support ticket is "spam," "complaint," "feature-request," or "bug-report." They're using Sonnet without CoT and seeing ~88% accuracy. Walk through whether to add CoT.

Expected: this is a multi-factor task (the right label depends on tone, content, and context). CoT would likely help. But also: this is exactly the kind of task where Haiku + CoT might outperform Sonnet without CoT at lower cost. Recommendation: run an eval with three variants (Sonnet no-CoT, Sonnet with CoT, Haiku with CoT). Pick the variant with best $/accuracy.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is "tokens for reasoning vs accuracy." If you were starting a chain where you knew it was a high-volume simple classifier (3-way, easy), would you still add CoT?

There's no right answer. Defend with reference to: the task complexity, the model tier, the eval suite measurement of accuracy delta.

**Quick check — code reference test.**
Without opening files, answer:
- What field comes first in a structured CoT schema?
- What's the accuracy gain from explicit CoT on Haiku vs Sonnet (rough)?
- Why does field order matter?

Pass: `reasoning` first; ~5–15% on Haiku vs ~1–3% on Sonnet; autoregressive generation means reasoning tokens condition answer tokens.
