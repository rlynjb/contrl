# Sampling parameters

**Industry name(s):** Sampling parameters, temperature, top-p (nucleus), top-k, max_tokens
**Type:** Industry standard

> Three knobs control how the next token gets picked from the model's probability distribution: temperature (flatten or sharpen the distribution), top-p (only consider the top cumulative-probability bucket), and top-k (only consider the top K tokens). Plus `max_tokens` to cap response length. For most production work: temperature 0-0.3 for classifiers/structured outputs; 0.5-1.0 for creative generation; `max_tokens` set on every call.

**See also:** → [01-what-an-llm-is](./01-what-an-llm-is.md) · → [04-structured-outputs](./04-structured-outputs.md) · → prompt-engineering [13-forbidden-patterns](../../study-prompt-engineering/13-forbidden-patterns.md)

---

## Why care

**Move 1.** Your classifier returns inconsistent labels across runs on the same input. You suspect a prompt bug. The prompt is identical. Investigation: temperature was left at the default 0.7 — appropriate for creative writing, wrong for classification. Setting temperature=0 makes the classifier nearly deterministic. Bug fixed in one line.

**Move 2.** That "why isn't this deterministic / how do I control variance" question is what sampling parameters answer. Not what the model says. Just how the next token gets picked from the distribution. The defaults across providers are tuned for general use; production work needs explicit values.

**Why you need to answer that question at all:** Two failures hide in default parameters. First, **classifiers with default temperature** produce inconsistent labels because the default temperature is too high for the task. Second, **unbounded generation** when `max_tokens` is unset — the model can ramble for thousands of tokens, costing money and latency. Setting parameters explicitly per chain is hygiene.

**Move 5.** Sampling parameters are what database query parameters are for query plans — they shape behavior independently of the data itself. Setting them right is one-line discipline.

---

## How it works

### Move 1 — The mental model

The model outputs logits → softmax → probability distribution over the vocab. Sampling parameters shape that distribution before picking one token:

```
  Model produces:        P(!) = 0.62, P(.) = 0.18, P(?) = 0.07, ...
  
  Temperature scales:    higher T flattens; lower T sharpens
  
  Top-p truncates:       keep tokens whose cumulative P ≥ 0.9, discard tail
  Top-k truncates:       keep top K tokens, discard rest
  
  Sample from result.
```

Strategy in plain English: **temperature for variance; top-p/top-k for cutting the long tail; `max_tokens` to bound output length.**

---

### Move 2 — The layered walkthrough

#### Temperature

Temperature divides the logits before softmax. Lower temperature → sharper distribution (more deterministic). Higher temperature → flatter distribution (more variation).

```
  Temperature effect on distribution
  
  Original logits:      [3.0, 2.0, 1.0, 0.0]
  
  T = 0 (argmax):       pick highest; ignore distribution
  T = 0.3 (sharp):      P(top) ≈ 0.85   ← classifiers; structured outputs
  T = 1.0 (default):    P(top) ≈ 0.62   ← creative writing
  T = 1.5 (flat):       P(top) ≈ 0.45   ← maximum variation
```

**Guidance:**
- **Temperature 0** for classifiers, extractors, structured outputs with one right answer.
- **Temperature 0.3-0.5** for generative tasks where you want consistency-with-some-variation (caption generation, summary).
- **Temperature 0.7-1.0** for creative writing where variation is desirable.
- **Temperature > 1.0** rarely useful; produces incoherent output past 1.5.

```
  Per-task temperature guide
  
  ┌──────────────────────────────────┬─────────────────┐
  │ Task                             │ Temperature      │
  ├──────────────────────────────────┼─────────────────┤
  │ Classifier (3-5 classes)         │ 0                │
  │ Structured extraction            │ 0                │
  │ Yes/no decisions                  │ 0                │
  │ Caption / summary                 │ 0.3-0.5          │
  │ Coaching message (subjective)    │ 0.5-0.7          │
  │ Creative writing                  │ 0.7-1.0          │
  │ Brainstorming                     │ 1.0+             │
  └──────────────────────────────────┴─────────────────┘
```

---

#### Top-p (nucleus sampling)

Top-p keeps the smallest set of tokens whose cumulative probability is ≥ p, then samples from that set. Cuts the long tail of unlikely tokens without hard-thresholding the count.

```
  Top-p effect (P = 0.9)
  
  Original:           P(!) = 0.62, P(.) = 0.18, P(?) = 0.07, P(',') = 0.04, ...
  Cumulative:         0.62 → 0.80 → 0.87 → 0.91 → ...
  Top-p kept:         {!, ., ?, ,} — cumulative ≥ 0.9, stop
  Remaining tokens excluded from sampling.
```

Typical values: 0.9-0.95. Lower (0.5-0.7) makes output more conservative; higher (0.99) means little effective filtering.

---

#### Top-k

Top-k keeps the K most-likely tokens, discards the rest. Simpler than top-p but less adaptive (always exactly K tokens regardless of how peaky the distribution is).

```
  Top-k effect (k = 40)
  
  Distribution:        P sorted descending
  Top-k kept:          top 40 tokens
  Sample from top 40 (with temperature applied).
```

Usually used alongside top-p; in practice, top-p has largely replaced top-k as the primary tail-cut.

---

#### max_tokens

Caps the maximum tokens in the response. Always set this — the default is often "unlimited" or very high, which means runaway generation is possible.

```
  max_tokens caps
  
  Short generation (label):         50
  Caption / summary:                500
  Coaching message:                 500-800
  Long-form essay:                  2000-4000
  Reasoning with extended thinking: higher cap; provider-specific
```

The cap is a defensive measure — even if the model decides to keep generating, the API stops at `max_tokens`. Combined with stop sequences (provider-specific), it prevents cost and latency surprises.

---

#### Combining parameters

In practice you set multiple parameters per call:

```ts
// Classifier — deterministic, short response
{
  model: 'claude-haiku-4-5',
  system: '...',
  messages: [...],
  temperature: 0,
  max_tokens: 50,
}

// Coaching agent — slight variation, bounded length
{
  model: 'claude-sonnet-4-6',
  system: '...',
  messages: [...],
  temperature: 0.5,
  max_tokens: 500,
  // top_p: 0.95 (Anthropic uses defaults; explicit only if tuning)
}

// Creative writing — high variation, long response
{
  model: 'claude-sonnet-4-6',
  system: '...',
  messages: [...],
  temperature: 0.9,
  max_tokens: 4000,
}
```

The combination is the chain's "personality" — set them at chain init based on the task.

---

### Move 3 — The principle

Sampling parameters shape variance independently of the prompt. Setting them deliberately per chain is hygiene; relying on defaults produces inconsistent classifiers and runaway generation. Temperature controls variance; top-p/top-k cut the tail; `max_tokens` bounds output. For most production work, two settings matter most: temperature (0 for structure, ~0.5 for generation) and max_tokens (always cap).

---

## Sampling parameters — diagram

```
┌─ Model output ───────────────────────────────────────────────────────────────┐
│                                                                              │
│   logits over vocab (real-valued)                                            │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Temperature scale ──────────────────────────────────────────────────────────┐
│                                                                              │
│   logits / T → softmax → probability distribution                            │
│   T = 0: distribution collapses to argmax                                    │
│   T high: distribution flattens                                              │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Top-p / top-k truncation ───────────────────────────────────────────────────┐
│                                                                              │
│   Keep top tokens by cumulative probability (top-p) or rank (top-k)          │
│   Discard the rest                                                           │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Sample one token ───────────────────────────────────────────────────────────┐
│                                                                              │
│   Sample from the truncated distribution                                     │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
                          Continue generation until
                          stop token OR max_tokens cap
```

---

## In this codebase

**Case B with partial Case A — contrl's planned coaching agent has specific parameter needs.**

Per the planned coaching agent design:
- **Temperature: 0.5** — coaching messages want some stylistic variation between sessions but not wild creativity. A user receiving the same coaching every day with identical wording is bad UX; high-temperature random output is also bad.
- **max_tokens: 800** — bounds coaching messages to a reasonable length.
- **Top-p / top-k: leave at provider defaults** — no specific reason to override.

For any future contrl LLM uses (in-app chat, summarization), parameters set per chain based on task.

**Planned implementation paths:**
- `src/lib/agent/runner.ts` — sets `{temperature: 0.5, max_tokens: 800}` in the Anthropic SDK call.

---

## Elaborate

**Where this pattern comes from.** Temperature comes from statistical mechanics (Boltzmann distribution); applied to neural network sampling since the 1990s. Top-p (nucleus sampling) is Holtzman et al. (2019) "The Curious Case of Neural Text Degeneration." Top-k is older but used less now that top-p exists.

**The deeper principle.** The model produces a distribution; sampling shapes which token gets picked. Different shapes serve different tasks. The defaults provided by APIs are compromises across many use cases; production work calibrates per task.

**Where this breaks down.** Two places.

1. **Reproducibility under temperature 0.** Even at temperature 0, batched inference can produce different argmax tokens due to floating-point details. Treat T=0 as "near-deterministic" not "perfectly deterministic" if reproducibility is critical.
2. **Extended-thinking modes.** Some 2026 models (Claude with extended thinking, OpenAI o-series) have internal sampling that doesn't expose temperature in the same way. Read provider docs; defaults may differ.

**What to explore next.**
- [01-what-an-llm-is](./01-what-an-llm-is.md) — why these knobs exist (it's a sampler).
- [04-structured-outputs](./04-structured-outputs.md) — the provider-side constraint on top of sampling.
- prompt-engineering [13-forbidden-patterns](../../study-prompt-engineering/13-forbidden-patterns.md) — when sampling variance hides convergence.

---

## Tradeoffs

| Cost dimension | Explicit parameters per chain | Provider defaults |
|---|---|---|
| Setup cost | One config field per chain | Zero |
| Predictability of output | High | Low (default tuning varies) |
| Cost containment | Yes (`max_tokens` cap) | Sometimes (no cap → runaway) |
| Task fit | Tuned per task | Generic compromise |

### Sub-block 1 — what we gave up

Almost nothing. Setting `{temperature, max_tokens}` per chain is two extra fields in the API call. The discipline is documenting why each value is set the way it is — a comment near the call helps.

### Sub-block 2 — what default-everywhere would cost

Documented patterns: classifiers with default temperature (~0.7-1.0) produce inconsistent labels. Generative chains without `max_tokens` cap can produce 4000-token responses when 400 was expected, blowing cost budgets. Default-everywhere is fine for prototypes; production needs explicit settings.

### Sub-block 3 — the breakpoint

Explicit parameters are the right call once you're past the prototype phase. Each chain in production should declare its values; one-off scripts can use defaults.

---

## Tech reference (industry pairing)

### Anthropic Messages API parameters

- **Codebase uses:** Planned for `src/lib/agent/runner.ts`.
- **Why it's here:** the API surface for sampling control.
- **Leading today:** Anthropic SDK — `adoption-leading` for Anthropic-target apps, 2026.
- **Why it leads:** clean parameter shape; defaults documented; extended-thinking support.
- **Runner-up:** OpenAI Chat Completions — same parameters with slightly different names.

---

## Project exercises

### [B4C.params] Set explicit parameters for the coaching agent

- **Exercise ID:** `[B4C.params]` (hypothetical, post-Phase 4)
- **What to build:** In `src/lib/agent/runner.ts`, set `{temperature: 0.5, max_tokens: 800}` on the Anthropic call. Document why in a comment.
- **Why it earns its place:** baseline hygiene; one-line change.
- **Files to touch:** `src/lib/agent/runner.ts`.
- **Done when:** parameters are set; coaching outputs vary appropriately within a session.
- **Estimated effort:** `<1hr`

---

## Summary

Sampling parameters shape variance independently of the prompt. Temperature controls distribution sharpness (0 for classifiers, 0.5 for generation, 1.0+ for creative). Top-p cuts the long tail. `max_tokens` bounds output length. Set explicitly per chain; defaults are compromises tuned for general use. For contrl's coaching agent: `{temperature: 0.5, max_tokens: 800}`.

**Key points:**

- **Temperature 0** for classifiers, structured outputs, deterministic-ish behavior.
- **Temperature 0.3-0.7** for generative tasks with stylistic variation.
- **Top-p > top-k** in modern practice; both cut the long tail.
- **`max_tokens` always set** — caps runaway generation.
- **Set parameters per chain;** defaults are compromises.

---

## Interview defense

### What an interviewer is really asking

When asked "how do you control LLM output consistency?", they want to hear temperature + `max_tokens`. The shipped answer names both with task-appropriate values.

### Likely questions

**[mid] What does temperature 0 do?**

Approximately picks the highest-probability token every time. Near-deterministic. Used for classifiers and structured outputs where consistency matters. Temperature > 0 introduces variance.

---

**[senior] Why is the default temperature usually not what you want?**

Provider defaults (often 0.7-1.0) are tuned for general creative use. For classifiers, this produces inconsistent labels across runs. Setting temperature 0 fixes it. The bigger principle: defaults are compromises; set parameters per task.

---

### One-line anchors

- "Temperature 0 for structure; 0.3-0.5 for generation; 0.7+ for creative."
- "max_tokens always set. Caps runaway generation."
- "Top-p cuts the long tail. Top-p > top-k in modern practice."
- "Defaults are compromises. Set explicitly per chain."
- "Temperature 0 is near-deterministic, not perfectly deterministic."

---

## Validate your understanding

**Level 1 — Reconstruct.** Draw the sampling pipeline: logits → temperature → top-p/k → sample.

**Level 2 — Explain.** "What does temperature do?" Under 30 seconds.

**Level 3 — Apply.** A teammate's classifier returns different labels on same input across runs. Diagnose. (Likely temperature too high; set to 0.)

**Level 4 — Defend.** "Just use defaults — they're tuned." Defend setting explicit parameters per chain.

**Quick check.**
- Temperature for classifiers? (0)
- Coaching agent settings? (T=0.5, max_tokens=800)
- What does max_tokens prevent? (Runaway generation.)
