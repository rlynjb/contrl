# Token economics

**Industry name(s):** Token economics, LLM pricing, cost modeling, per-call cost attribution
**Type:** Industry standard

> Cost = input_tokens × input_price + output_tokens × output_price. Output is typically 5× input pricing. Cached prefix is ~10% of normal input price. Per-model pricing varies 15× between cheap (Haiku) and premium (Opus) tiers. The discipline is per-call cost attribution and per-chain monthly budgets, not provider-level invoice surprises.

**See also:** → [02-tokenization](./02-tokenization.md) · → [06-production-serving/01-llm-caching](../06-production-serving/01-llm-caching.md) · → [06-production-serving/02-llm-cost-optimization](../06-production-serving/02-llm-cost-optimization.md)

---

## Why care

**Move 1.** Your invoice arrives. Bigger than expected. You don't know which chain drove it. You investigate by reading recent logs, estimating which chain ran how often. Hours later you have a guess — one chain that fired more often than you knew about, plus the agent's output being longer than expected. Without per-call cost attribution, every invoice surprise is a research project.

**Move 2.** That "what does each call cost, and where is the money going" question is what token economics answers. Not the LLM provider's pricing page. Just the operational discipline: per-call cost computed at call time, tagged with chain and model, aggregated into per-chain dashboards.

**Why you need to answer that question at all:** Three failures hide in invoice-only attribution. First, **can't optimize what you can't see** — without per-chain attribution, you can't tell which chain to focus optimization on. Second, **invoice surprises** — finding out about cost growth a month after it started. Third, **budget overruns** — a chain that costs 10× expected isn't visible until it dominates the invoice.

**Move 5.** Token economics is what per-query cost is for database optimization — measure first, then optimize the expensive queries; ignoring the cheap ones is fine.

---

## How it works

### Move 1 — The mental model

The pricing formula:

```
  per_call_cost = (tokens_in × input_price)         // uncached portion
                + (tokens_in_cached × cached_price)  // cached prefix portion
                + (tokens_out × output_price)
```

Each provider publishes prices per model. You compute per-call cost from response headers (which include token counts).

```
  Anthropic Sonnet 4 pricing (mid-2026)
  
  Input (uncached):     $3.00 / 1M tokens
  Input (cache write):  $3.75 / 1M tokens  (~1.25× input)
  Input (cache hit):    $0.30 / 1M tokens  (~10% of input)
  Output:               $15.00 / 1M tokens (~5× input)
```

Strategy in plain English: **log token counts per call → compute cost → tag with chain → aggregate per chain monthly → optimize the top.**

---

### Move 2 — The layered walkthrough

#### Per-call cost computation

```ts
function computeCost(chain: string, model: string, usage: Usage): number {
  const prices = MODEL_PRICES[model];
  const inputCost = (usage.input_tokens / 1_000_000) * prices.input;
  const cacheReadCost = (usage.cache_read_input_tokens / 1_000_000) * prices.cacheRead;
  const cacheWriteCost = (usage.cache_creation_input_tokens / 1_000_000) * prices.cacheWrite;
  const outputCost = (usage.output_tokens / 1_000_000) * prices.output;
  return inputCost + cacheReadCost + cacheWriteCost + outputCost;
}

// Logged with the call
log.info({
  event: 'llm_call',
  chain,
  model,
  input_tokens: usage.input_tokens,
  output_tokens: usage.output_tokens,
  cost_usd: computeCost(chain, model, usage),
});
```

Each call's cost is computed and logged. Aggregation happens at the dashboard layer.

---

#### Per-chain monthly aggregation

```
  Per-chain cost dashboard (example)
  
  ┌─────────────────────────────┬─────────────────────────────┐
  │ Chain                       │ Cost / month (USD)            │
  ├─────────────────────────────┼─────────────────────────────┤
  │ coaching-agent              │ $42.30                       │
  │ form-classifier (planned)   │ $0 (deterministic; not LLM) │
  │ summary-chain (hypothetical)│ $128.50                      │
  └─────────────────────────────┴─────────────────────────────┘
  
  Plus per-chain breakdown:
    input_tokens_per_call (median, p99)
    output_tokens_per_call (median, p99)
    cache_hit_rate
    call_count
```

The breakdown tells you WHY one chain costs more — long prompts, long outputs, low cache hits, high call count, or expensive model.

---

#### Pricing ratios that matter

```
  Cost ratios (Sonnet 4, 2026)
  
  Output vs input:     5×  (output is 5× input pricing)
  Cache hit vs uncached input: 0.10×  (90% discount on cached prefix)
  Cache write vs uncached input: 1.25× (one-time premium on first call)
  Sonnet vs Haiku (same task): 15× (input); 4× (output)
  Opus vs Sonnet (same task): 5× (input); 5× (output)
  
  Implications:
    - Trimming output tokens has higher per-token leverage than trimming input.
    - Caching the prefix saves more than reducing the prefix size.
    - Routing to a smaller model is the biggest cost lever (15× spread).
```

---

#### Cost-per-task framing

For business framing, often clearer than per-call: cost per unit of work.

```
  Cost per task (example)
  
  Task: end-of-session coaching
    1 LLM call per task
    Average: 2K input + 600 output = 2.6K total tokens
    At Sonnet 4 pricing (uncached): 2K × $3 + 600 × $15 = $0.015/task
    At full caching: 2K × $0.30 + 600 × $15 = $0.0096/task
  
  Monthly volume estimate: 100 sessions/user × 1 user × $0.0096 = $0.96/month
```

For contrl at solo scale: pennies per month. The discipline is study material until volume grows.

---

### Move 3 — The principle

Cost optimization without per-call attribution is theater. The discipline: log token counts + computed cost per call, aggregate per chain monthly, optimize the top. The pricing structure (output 5× input, cached prefix 10% of normal, model tiers 15× spread) determines which levers matter most for which chains.

---

## Token economics — diagram

```
┌─ Per-call cost computation ──────────────────────────────────────────────────┐
│                                                                              │
│   tokens_in_uncached × input_price                                           │
│   + tokens_in_cached × cached_price                                          │
│   + tokens_out × output_price                                                │
│   = per_call_cost                                                            │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ log with chain + model
                                      ▼
┌─ Aggregation layer ──────────────────────────────────────────────────────────┐
│                                                                              │
│   Per-chain monthly:                                                         │
│     total_cost, call_count, avg_input_tok, avg_output_tok, cache_hit_rate    │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Decision layer ─────────────────────────────────────────────────────────────┐
│                                                                              │
│   Rank chains by total cost → optimize the top:                              │
│     route to cheaper model                                                   │
│     enable prefix caching                                                    │
│     trim output                                                              │
│     add heuristic short-circuit                                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B (planned) — contrl's coaching agent has trivial cost at solo scale.**

Estimated monthly cost for contrl:
- 1-2 coaching calls per day × ~$0.01/call = $0.30-0.60/month.

The discipline of per-call cost logging is still worth applying — provides the foundation for cost dashboards if/when volume grows. Trivial implementation cost.

**Planned implementation paths:**
- `src/lib/agent/runner.ts` — computes and logs cost per call.
- Cost dashboard: not yet; volume doesn't justify.

---

## Elaborate

**Where this pattern comes from.** Per-call cost attribution is borrowed from cloud infrastructure (per-service cost dashboards in AWS, GCP). Applied to LLM calls in 2023+ as production LLM bills grew.

**The deeper principle.** Attribution is the load-bearing artifact for any cost optimization. Without it, you don't know what to optimize.

**Where this breaks down.** Tiny volumes don't justify dashboards — a script that runs 100 LLM calls a month doesn't need cost attribution, just a periodic invoice check.

**What to explore next.**
- [06-production-serving/01-llm-caching](../06-production-serving/01-llm-caching.md) — the cache discount in detail.
- [06-production-serving/02-llm-cost-optimization](../06-production-serving/02-llm-cost-optimization.md) — the lever stack.

---

## Tradeoffs

(Covered in 06-production-serving/02-llm-cost-optimization. Summary: log per-call cost cheaply; optimize what dominates.)

---

## Tech reference (industry pairing)

### Anthropic usage in response

- **Codebase uses:** Planned via response.usage in `src/lib/agent/runner.ts`.
- **Why it's here:** the token counts for cost computation.
- **Leading today:** standard across providers — `adoption-leading`, 2026.
- **Why it leads:** universal; no custom infrastructure needed.

---

## Project exercises

### [B4C.cost-log] Log cost per call

- **What to build:** Compute cost from response.usage; log with chain + model.
- **Files to touch:** `src/lib/agent/runner.ts`.
- **Done when:** every coaching call emits a log entry with `cost_usd` field.
- **Estimated effort:** `<1hr`

---

## Summary

Token economics is per-call cost attribution. Compute cost = input × input_price + output × output_price + cache adjustments. Output is 5× input pricing; cached prefix is 10% of normal input. Model tiers span 15× from cheap to premium. Log per call; aggregate per chain; optimize the top.

**Key points:**

- **Per-call cost logging** is the foundation. Without it, optimization is guesswork.
- **Output is 5× input pricing.** Output trimming has higher per-token leverage.
- **Cached prefix is 10% of normal.** Caching saves more than shrinking.
- **Model tier spread is 15×.** Routing per task is the biggest cost lever.
- **For contrl: trivial cost at solo scale.** Discipline is study material.

---

## Interview defense

**[mid] What's the cost formula?**

input_tokens × input_price + output_tokens × output_price, with cache adjustments. Output is typically 5× input pricing.

**[senior] What's the biggest cost lever?**

Model routing — Sonnet vs Haiku is a 15× spread on input tokens. If a smaller model passes your eval set, switching saves more than any single-prompt optimization.

---

## One-line anchors

- "Cost = input × input_price + output × output_price + cache adjustments."
- "Output is 5× input pricing."
- "Cached prefix is 10% of normal."
- "Model tier spread is 15× from Haiku to Opus."
- "Log per call; optimize the top chain."

---

## Validate

**Level 1:** Draw cost formula breakdown.
**Level 2:** "How do you attribute LLM cost?" Under 30 seconds.
**Level 3:** A teammate's bill is $1500. They have 4 chains, all Sonnet. Walk through the diagnosis path. (Log per-chain cost. Rank. Optimize top.)
**Level 4:** Defend per-call logging at solo scale. (Cost is essentially zero; foundation for if/when volume grows.)

**Quick check:**
- Output vs input pricing ratio? (5×)
- Cache hit pricing? (10% of normal)
- contrl's estimated monthly LLM cost? (Pennies — solo scale.)
