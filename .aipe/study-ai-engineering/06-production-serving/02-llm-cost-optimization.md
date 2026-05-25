# LLM cost optimization

**Industry name(s):** LLM cost optimization, token economics, model routing, prompt distillation
**Type:** Industry standard

> Production LLM cost is a function of four levers: input tokens × output tokens × model tier × call volume. The order of investigation is fixed — measure first, route per task second (Haiku for cheap, Sonnet for premium), cache the prefix third, trim prompts last. Cost optimization without measurement is theater.

**See also:** → [01-llm-caching](./01-llm-caching.md) · → [01-llm-foundations/06-token-economics](../01-llm-foundations/06-token-economics.md) · → [01-llm-foundations/07-heuristic-before-llm](../01-llm-foundations/07-heuristic-before-llm.md) · → prompt-engineering [06-single-purpose-chains](../../study-prompt-engineering/06-single-purpose-chains.md)

---

## Why care

**Move 1.** Your invoice arrives. $1,200 for the month. You expected ~$200. Investigation: one chain ran at higher volume than expected, and every call used Sonnet 4 when Haiku would have worked for the classification step. The "premium model for everything" pattern shipped because the chain was a single-call design, not multi-step routed. You can't fix it without redesigning the chain.

**Move 2.** That "what's driving cost and how do I lever it" question is what LLM cost optimization answers. Not which model to use globally. Not when to cache. Just the per-task economics: which steps actually need premium models, which can run on cheap models, what fraction of calls can be served from cache, and which calls don't need an LLM at all. The discipline is measure-first, then apply levers in order of leverage.

**Why you need to answer that question at all:** Three patterns drive most LLM cost waste. First, **one-model-for-all-tasks** — using premium models for steps a smaller model would handle (cost factor 5-15× for the cheap steps). Second, **uncached prefixes** — paying full price for bytes that repeat across calls (cost factor ~10× on cached-eligible prefix). Third, **LLM-when-heuristic-suffices** — paying for an LLM call when a regex or lookup would work (cost factor: infinite — the LLM call shouldn't exist).

**Before / after.**

Without cost discipline:
- One Sonnet 4 call per task. ~$0.005/call. 1000 tasks/day = $150/month.
- Bills creep up as volume grows; no per-task attribution to know which task is driving cost.

With cost discipline:
- Decompose task into 3 steps. Route step 1 + 2 to Haiku ($0.0002 + $0.0003). Route step 3 to Sonnet ($0.003). Enable prefix caching. Add heuristic short-circuit for the easy 20% of inputs (no LLM call at all).
- ~$0.0028/call average. 1000 tasks/day = $84/month. ~44% savings.

**Move 5.** LLM cost optimization is what database query optimization is for backend code — measure first (EXPLAIN ANALYZE / per-call cost log), find the hot spot, apply the smallest lever that fixes it, re-measure.

---

## How it works

### Move 1 — The mental model

Think of a backend pipeline where each function has a fixed cost:

```
  total_cost_per_request = 
    parse_cost + auth_cost + business_logic_cost + db_query_cost + serialize_cost
```

To reduce cost: identify which function dominates, optimize that one, re-measure. LLM cost works the same way:

```
  total_llm_cost_per_task = 
    sum over chains of:
      (input_tokens × input_price_per_token × cache_factor) +
      (output_tokens × output_price_per_token) +
      (call_count × overhead)
```

The levers: model tier (input/output price), cache factor (10× discount on cached prefix), call count (heuristics short-circuit some calls), token counts (shorter prompts, shorter responses).

Strategy in plain English: **measure cost per chain per call. Find the dominant cost. Apply the smallest lever that fixes it.**

```
  Cost levers in order of leverage (typical, your mileage varies)
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ Lever                              │ Typical savings              │
  ├──────────────────────────────────────────────────────────────────┤
  │ Heuristic short-circuit            │ 100% on calls eliminated     │
  │ Model routing per task             │ 5-15× on cheap steps          │
  │ Prefix caching                     │ ~90% on cacheable prefix      │
  │ Output token trimming              │ 10-30% on output cost          │
  │ Prompt trimming (input)            │ 10-30% on uncached input cost  │
  │ Provider switch                    │ ±50% (highly variable)         │
  └──────────────────────────────────────────────────────────────────┘
```

Note: the order matters. A 5× model-routing optimization on calls that shouldn't have been LLM calls at all is dwarfed by the heuristic short-circuit that eliminates those calls entirely.

---

### Move 2 — The layered walkthrough

#### Lever 1: heuristic short-circuit (highest leverage)

For inputs where the answer is obvious without an LLM, don't call the LLM. Detect those inputs cheaply and serve the deterministic answer.

```
  Heuristic-before-LLM pattern (from 01-llm-foundations/07)
  
  ┌──────────────────────────────────────────────────────────┐
  │ Input arrives                                             │
  └──────────────────────┬───────────────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────────────┐
  │ Heuristic check: simple rules / regex / lookup           │
  │   Examples:                                               │
  │     - Empty input → return default                        │
  │     - Exact keyword match → known answer                  │
  │     - Pattern match (e.g., "what is X?" form) → lookup    │
  └──────────────────────┬───────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       heuristic hits          no heuristic hit
       → return answer          → call LLM
       (0 cost)                 (full cost)
```

The discipline: log the heuristic-hit rate. At 20% hit rate, you're saving 20% of LLM cost. At 80% hit rate, you should ask whether you need the LLM at all.

For contrl's coaching agent: a heuristic short-circuit doesn't apply directly (every coaching message is unique), but a related pattern does — skip the agent entirely when the workout had no logged issues (form was clean, no exercises flagged, recommender's choice was the expected progression). The agent runs only when there's something interesting to coach about.

---

#### Lever 2: model routing per task

Use the smallest model that hits the eval threshold for each task.

```
  Routing rules of thumb (2026 pricing)
  
  ┌────────────────────────────────────────────────────────────────┐
  │ Task pattern                       │ First model to try         │
  ├────────────────────────────────────────────────────────────────┤
  │ Classification (3-5 classes)       │ Haiku                      │
  │ Extraction (structured fields)     │ Haiku                      │
  │ Format conversion                  │ Haiku                      │
  │ Short-form generation (caption)    │ Haiku then Sonnet          │
  │ Long-form generation (essay)       │ Sonnet                     │
  │ Reasoning over multiple inputs     │ Sonnet                     │
  │ Code generation                    │ Sonnet                     │
  │ Code review / complex reasoning    │ Opus                       │
  └────────────────────────────────────────────────────────────────┘
  
  Always validate against eval set; if Haiku passes, use Haiku.
```

The discipline: per chain, run the eval set on both candidate models. If the smaller model passes the eval threshold, ship it. Don't over-engineer the routing decision — most chains converge to either "smaller works" or "smaller doesn't."

---

#### Lever 3: prefix caching

Covered in detail in [01-llm-caching](./01-llm-caching.md). At minimum: enable `cache_control: { type: 'ephemeral' }` on the system + tools prefix. ~90% discount on cached prefix tokens. Trivial code change; no downside.

---

#### Lever 4: output token trimming

Long outputs cost more (output tokens are 5× input price on most providers). Reduce output length when possible:

- **Set `max_tokens` on every call.** Default to a reasonable cap (e.g., 500 for short-form, 2000 for long-form). Prevents runaway generation.
- **Prompt for concision.** "Respond in 50 words or fewer" is enforced by the model.
- **Use structured outputs instead of prose.** A JSON `{label, confidence}` is 30 tokens; the equivalent prose is 100+ tokens.

```
  Output cost shape (Sonnet 4 mid-2026)
  
  Input tokens:   $3.00 / 1M
  Output tokens:  $15.00 / 1M  ← 5× input pricing
  
  Implication: trimming 100 output tokens saves more than trimming
  500 input tokens. Output trimming has higher leverage per token.
```

---

#### Lever 5: prompt trimming (input side)

Lower leverage than output trimming but still real. Targets:

- **Long few-shot examples** — 3-5 good examples usually beats 10 mediocre ones; cut redundant ones.
- **Verbose instructions** — a clear instruction at 50 tokens beats a wordy one at 200.
- **Stale context** — old conversation history that no longer affects the answer can be summarized.

The discipline: review your prompt token-by-token quarterly. Look for the bits that aren't earning their place.

---

#### Lever 6: provider switching

Different providers have different pricing. Anthropic, OpenAI, Google all have similar tiers (cheap / mid / premium) but exact pricing fluctuates. Switching can save (or cost) 20-50%.

The catch: prompts tuned for one provider often need re-tuning on another. The "free 30% savings" from switching providers is often partly eaten by re-tuning effort + accuracy regressions on existing chains.

```
  Provider switch decision
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ Switch when:                                                       │
  │   - Volume justifies the migration effort                         │
  │   - New provider's model passes your eval set                     │
  │   - Cost gap is sustained (not a temporary promotion)             │
  │                                                                    │
  │ Don't switch when:                                                 │
  │   - Cost gap < 30% (re-tuning effort eats the savings)            │
  │   - Eval performance drops on the new provider                    │
  │   - You're early-stage and product fit is the priority             │
  └──────────────────────────────────────────────────────────────────┘
```

For contrl at solo-user scale: stick with Anthropic. Provider switching is a high-volume optimization.

---

### Move 3 — The principle

Cost optimization is a measure-and-lever discipline. Apply levers in order of leverage: heuristics > model routing > caching > output trimming > input trimming > provider switching. Each lever has a measurable effect; pursuing them without measurement produces noise that doesn't track cost. The discipline is the same as backend performance optimization — profile first, optimize the hot path, re-measure.

---

## LLM cost optimization — diagram

```
┌─ Step 1: Measure per-chain cost ─────────────────────────────────────────────┐
│                                                                              │
│   Per-call trace logs tokens_in + tokens_out + model + chain_name           │
│   Aggregate weekly: cost per chain                                            │
│   Rank chains by total cost                                                  │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ identify top-3 cost chains
                                      ▼
┌─ Step 2: Apply levers in order of leverage ──────────────────────────────────┐
│                                                                              │
│   For each top-cost chain:                                                   │
│                                                                              │
│     ┌──────────────────────────────────────────────────────────────────┐   │
│     │ a. Heuristic short-circuit possible?    YES → 100% savings on    │   │
│     │                                              hit cases            │   │
│     └──────────────────────────────────────────────────────────────────┘   │
│     ┌──────────────────────────────────────────────────────────────────┐   │
│     │ b. Smaller model passes eval threshold?  YES → 5-15× per call    │   │
│     └──────────────────────────────────────────────────────────────────┘   │
│     ┌──────────────────────────────────────────────────────────────────┐   │
│     │ c. Prefix cacheable?                     YES → ~90% on prefix    │   │
│     └──────────────────────────────────────────────────────────────────┘   │
│     ┌──────────────────────────────────────────────────────────────────┐   │
│     │ d. Output length necessary?              SET max_tokens cap       │   │
│     └──────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ re-measure
                                      ▼
┌─ Step 3: Iterate ────────────────────────────────────────────────────────────┐
│                                                                              │
│   Re-rank chains by cost. Top-cost chain may have shifted.                   │
│   Apply levers to the new top.                                               │
│   Stop when remaining cost is acceptable.                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl's planned coaching agent operates at solo scale.**

At ~1-2 calls per user per day with one user (current contrl scope), monthly LLM cost is trivial — maybe $1-2/month at full Sonnet pricing without any optimization. The cost-optimization discipline is study material until volume grows.

**That said,** even at solo scale, the levers that cost nothing to apply should be applied:
- **Enable prefix caching** (`cache_control` field). Trivial change, no downside.
- **Set `max_tokens` cap.** Prevents runaway generation; standard hygiene.
- **Heuristic short-circuit when no coaching is warranted.** Skip the LLM call when the workout had no flagged form issues — both saves cost and avoids generic coaching messages.

**Planned implementation paths:**
- `src/lib/agent/runner.ts` — cache_control + max_tokens
- `src/lib/agent/should-coach.ts` (planned) — the heuristic short-circuit that decides whether to call the coaching agent at all

If contrl scales (multiple users, multiple sessions per day per user) or adds an in-app chat surface with the coaching agent, the discipline becomes load-bearing.

---

## Elaborate

**Where this pattern comes from.** Backend performance optimization (measure, optimize hot path, re-measure) is decades old. The LLM-specific application crystallized 2023-2025 as production LLM bills became significant. Hamel Husain, Eugene Yan, and the OpenAI/Anthropic engineering blogs all converge on the "measure-first, route, cache, trim" sequence.

**The deeper principle.** Optimization without measurement is theater. Per-chain cost attribution is the load-bearing artifact — without it, you don't know which chain is the cost driver, and applied levers don't track the bill. The principle generalizes to any optimization domain.

**Where this breaks down.** Three places.

1. **Pre-product-fit projects.** Cost optimization on a chain you haven't validated is premature. Get the chain working; measure; then optimize.
2. **Tiny volumes.** A side project at 100 calls/month doesn't justify optimization effort — let it run at full price; the savings would be cents.
3. **High-stakes quality-critical chains.** Sometimes the premium model is genuinely required — code review, medical, legal contexts. Routing to a smaller model fails the eval set; cost optimization is bounded.

**What to explore next.**
- [01-llm-caching](./01-llm-caching.md) — the caching lever in detail.
- [01-llm-foundations/06-token-economics](../01-llm-foundations/06-token-economics.md) — pricing model framing.
- [01-llm-foundations/07-heuristic-before-llm](../01-llm-foundations/07-heuristic-before-llm.md) — the highest-leverage cost lever.
- prompt-engineering [06-single-purpose-chains](../../study-prompt-engineering/06-single-purpose-chains.md) — the chain decomposition that enables routing.

---

## Tradeoffs

| Cost dimension | Discipline applied | No discipline |
|---|---|---|
| Implementation effort | Per-chain analysis, eval re-runs, code changes | Zero |
| Cost savings (typical) | 30-70% at moderate volume | None (baseline cost) |
| Code complexity | Higher (multi-model routing, heuristics) | Lower (one model, no branching) |
| Iteration risk | Routing decisions need eval validation | None |
| Cost predictability | High (per-chain attribution) | Low (invoice surprises) |

### Sub-block 1 — what we gave up

The discipline takes time. Measurement infrastructure (per-call logging), eval re-runs on candidate models, code changes for routing and heuristics — for a 5-chain system, that's days to weeks of dedicated work. For projects where the savings won't pay back the time, skip.

### Sub-block 2 — what no discipline would have cost

Documented patterns of unoptimized chains:
- Always using premium models when smaller would work: 5-15× cost waste on cheap steps.
- No prefix caching: ~10× cost on cacheable prefix.
- LLM calls for inputs a heuristic would handle: infinite waste — calls that shouldn't exist.

At meaningful volume (>10K calls/day), unoptimized LLM chains can easily cost 3-5× what disciplined chains cost.

### Sub-block 3 — the breakpoint

Cost optimization is the right call until: (a) total monthly LLM cost is so small that engineering effort exceeds savings (~<$200/month); (b) you're pre-product-fit and optimization is premature; (c) the chain genuinely needs premium models for every step (rare, but real for high-stakes domains). For most production LLM systems past $500/month, the discipline pays back.

### Sub-block 4 — what wasn't actually a tradeoff

"Routing makes the code complex." The complexity is small — per-chain meta.json with model field + a thin wrapper that selects the model. The cognitive cost is one-time; the savings are recurring.

---

## Tech reference (industry pairing)

### Anthropic Haiku + Sonnet + Opus tiers

- **Codebase uses:** Sonnet 4 for the planned coaching agent. Haiku not yet needed (single chain).
- **Why it's here:** the per-task routing strategy.
- **Leading today:** Haiku 4.5 / Sonnet 4.6 / Opus 4.7 — `adoption-leading` for cost-conscious LLM apps, 2026.
- **Why it leads:** large price spread (15× between Haiku and Sonnet, 5× between Sonnet and Opus); shared API surface; easy to swap per task.
- **Runner-up:** OpenAI GPT-4o-mini / GPT-4o / o-series — equivalent tier strategy on OpenAI.

### Promptfoo cost reporting

- **Codebase uses:** Not yet — useful when chain count grows.
- **Why it's here:** eval harness with per-chain cost reporting built in.
- **Leading today:** Promptfoo — `innovation-leading` for open-source LLM eval + cost, 2026.
- **Why it leads:** integrates with multiple providers; reports per-eval cost; useful for cost-vs-quality tradeoff exploration.
- **Runner-up:** LangSmith Evals — commercial, similar features.

### Anthropic prompt caching

- **Codebase uses:** Planned for the coaching agent.
- **Why it's here:** the cheapest cost lever (one field, ~90% savings on cached prefix).
- **Leading today:** Anthropic `cache_control: { type: 'ephemeral' }` — `adoption-leading`, 2026.
- **Why it leads:** explicit control, observable hit/miss in response headers.
- **Runner-up:** OpenAI implicit caching.

---

## Project exercises

### [B4C.routing] Route the coaching agent's tools to cheap inference where possible

- **Exercise ID:** `[B4C.routing]` (hypothetical, post-Phase 4)
- **What to build:** The agent's tools (`get_classifier_output`, `get_form_history`, etc.) execute on the backend, not as LLM calls. But if the agent ever delegates sub-tasks to LLM calls (e.g., summarizing form history before passing to the main agent), route those sub-tasks to Haiku.
- **Why it earns its place:** demonstrates routing per task. For contrl's current scope it's a thin opportunity; the discipline matters at scale.
- **Files to touch:** wherever sub-task delegation lives (none currently planned).
- **Done when:** any sub-LLM-call in the agent loop runs on the cheapest model that passes its eval.
- **Estimated effort:** `1–4hr`

### [B4C.short-circuit] Skip coaching when no issues warrant it

- **Exercise ID:** `[B4C.short-circuit]` (hypothetical, post-Phase 4)
- **What to build:** A pre-agent heuristic that checks the workout's classifier outputs. If all reps were classified clean, all exercises hit target, and no negative signal exists, skip the LLM call entirely and render a simple "great session!" message.
- **Why it earns its place:** the highest-leverage cost lever. Plus the product benefit: avoids generic praise when there's nothing specific to say.
- **Files to touch:** `src/lib/agent/should-coach.ts` (planned), called before `src/lib/agent/runner.ts`.
- **Done when:** synthetic test with all-clean workout returns the default message without calling the LLM; synthetic test with flagged form triggers the LLM call.
- **Estimated effort:** `1–4hr`

---

## Summary

LLM cost optimization is a measure-first discipline. Per-call cost attribution → identify hot chains → apply levers in order of leverage (heuristics > routing > caching > output trimming > input trimming > provider switching). Each lever has known typical savings; the order matters because heuristic short-circuits eliminate calls entirely while later levers reduce per-call cost. For contrl at solo scale, the discipline is study material — but cost-free levers (caching, max_tokens, heuristic short-circuit) should always be applied.

**Key points:**

- **Measure first.** Per-call trace with tokens_in + tokens_out + model + chain_name.
- **Apply levers in order of leverage.** Heuristics > routing > caching > output trim.
- **Heuristic short-circuit eliminates calls** — highest leverage per chain.
- **Per-task model routing** saves 5-15× on cheap steps. Haiku for classifiers; Sonnet for generation.
- **Output tokens are 5× input pricing.** Output trimming has higher per-token leverage than input trimming.

---

## Interview defense

### What an interviewer is really asking

When asked "how do you optimize LLM cost?", they want to hear the measure-first discipline and the lever ordering. The shipped answer names heuristic short-circuit as the highest-leverage move (cuts calls entirely). The unshipped answer says "we use a cheaper model" without explaining how to decide which calls warrant the smaller model.

### Likely questions

**[mid] What are the biggest cost levers?**

In order of leverage: (1) heuristic short-circuit — eliminate LLM calls that don't need an LLM. 100% savings on those calls. (2) per-task model routing — Haiku for classifiers/extractors, Sonnet for generation. 5-15× savings on cheap steps. (3) prefix caching — ~90% savings on cacheable prefix tokens. (4) output token trimming — output is 5× input pricing, so trimming has high per-token leverage.

```
  Lever leverage (typical)
  
  ┌──────────────────────┬─────────────────────────────┐
  │ Heuristic short-circuit│ 100% on calls eliminated   │
  │ Model routing         │ 5-15× per call              │
  │ Prefix caching        │ ~90% on cached prefix       │
  │ Output trimming       │ 10-30% on output cost       │
  │ Input trimming        │ 10-30% on input cost        │
  └──────────────────────┴─────────────────────────────┘
```

---

**[senior] How do you decide which chains to optimize first?**

Per-call cost attribution. Log tokens_in + tokens_out + model + chain_name on every call. Aggregate weekly. Rank chains by total cost. Optimize the top 3. After applying levers, re-measure and re-rank — the top-cost chain may have shifted. Stop when remaining cost is acceptable. The discipline mirrors backend perf optimization: profile the hot path, optimize, re-profile.

---

**[arch] How does optimization scale with team size?**

Two things shift. First, per-chain cost dashboards become essential — at 50+ chains, manual investigation doesn't scale; you need automated drift detection on per-chain cost. Second, the routing decision becomes a design conversation, not just an implementation detail — when does a new chain need premium tier, what's the eval threshold, what's the routing policy across chains. Teams typically converge on a "routing matrix" — task-type to model-tier mapping — that informs every new chain.

```
  Cost discipline at team scale
  
  ┌─────────────────────┬──────────────────────────────────┐
  │ Solo (contrl today) │ Manual: enable cheap levers       │
  │ Small team (5)      │ Per-chain dashboards + weekly review │
  │ Larger team (20+)   │ Routing matrix + automated drift    │
  └─────────────────────┴──────────────────────────────────┘
```

---

### The question candidates always dodge

**"Just use the cheapest model for everything."**

That doesn't work because eval thresholds matter. Haiku passes the eval for some chains (classification, extraction); fails for others (subjective generation, complex reasoning). Forcing every chain to Haiku produces quality regressions that user complaints surface fast. The shipped discipline is per-chain eval validation: run candidate models against the eval set, pick the smallest that hits threshold. "Cheapest everywhere" is the symmetric error to "premium everywhere" — both skip the measurement.

---

### One-line anchors

- "Measure first. Per-call cost attribution per chain."
- "Levers in order: heuristic > routing > caching > output > input > provider."
- "Heuristic short-circuit is highest leverage — calls eliminated entirely."
- "Output tokens cost 5× input. Output trimming has higher per-token leverage."
- "Routing requires eval validation. Cheapest model that passes the threshold."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the lever stack ordered by leverage. Label typical savings per lever.

Pass: 4-6 levers in order; savings figures present.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "How do you optimize LLM cost?" Checkpoints:
- Did you mention measure-first?
- Did you mention the leverage ordering?
- Did you mention heuristic short-circuit as highest leverage?

**Level 3 — Apply to a new scenario.**
A teammate's LLM bill is $1500/month. They have 4 chains, all running Sonnet 4. Walk through the optimization plan.

Expected: log per-chain cost. Find the top chain (likely the generative one). For the bottom chains (likely classifiers): test Haiku — if it passes the eval, route. Enable prefix caching everywhere. Set max_tokens caps. Add heuristic short-circuit where applicable. Expected savings: 40-60% with these levers.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is the engineering time invested in optimization. At what volume is it not worth doing?

Defend with reference to sub-block 3 — below ~$200/month total LLM cost, optimization time may not pay back.

**Quick check — code reference test.**
Without opening files, answer:
- What's the highest-leverage cost lever?
- What's the input-vs-output pricing ratio for most models?
- Where does contrl's planned heuristic short-circuit live?

Pass: heuristic short-circuit; output is 5× input on most providers; `src/lib/agent/should-coach.ts` (planned).
