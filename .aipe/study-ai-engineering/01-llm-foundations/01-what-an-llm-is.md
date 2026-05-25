# What an LLM is

**Industry name(s):** Large Language Model, autoregressive transformer, next-token predictor
**Type:** Industry standard · Language-agnostic

> An LLM is an autoregressive next-token predictor — a function that takes a sequence of tokens and produces a probability distribution over the next token. Sampling from that distribution and feeding the result back produces generation. Everything else (instruction-following, reasoning, tool use) is emergent behavior from training on the right data with the right scale, not a separate mechanism. Understanding the predictor shape clarifies why prompts work, why temperature matters, and why structured outputs need provider enforcement.

**See also:** → [02-tokenization](./02-tokenization.md) · → [03-sampling-parameters](./03-sampling-parameters.md) · → [04-structured-outputs](./04-structured-outputs.md)

---

## Why care

**Move 1.** You debug an LLM call that produces inconsistent output across runs with the same input. You suspect a bug in your prompt assembly. You verify the prompt is byte-identical across the calls. The output is still different. Confused, you read about `temperature` and `top_p` — turns out the model wasn't deterministic, period. The "bug" was you treating the LLM as a function (same input → same output) when it's a *sampler* (same input → distribution → sample).

**Move 2.** That "what is the LLM actually doing under the hood" question is what understanding the predictor shape answers. Not how to prompt it. Not which model to pick. Just: it's a probabilistic next-token predictor, and every observable behavior (creativity, determinism, format-following) follows from that fact + the sampling parameters you set.

**Why you need to answer that question at all:** The mental model determines how you debug, how you set parameters, and what you trust the model to do. Engineers who treat LLMs as opaque "AI that does NLP" guess. Engineers who internalize the predictor shape can predict: temperature 0 → near-deterministic; temperature 1.0+ → high variation; structured outputs → constrained sampling; lost-in-the-middle → attention is non-uniform across positions; tokenization → exactly how the model sees text.

**Move 5.** An LLM is a `function(tokens) → distribution(tokens)` plus a sampling step that picks from the distribution. Generation is repeated sampling with the new token appended each iteration. That's it. Everything else is emergent.

---

## How it works

### Move 1 — The mental model

Think of a markov chain on a vocabulary of ~100K tokens. Given the last N tokens (the context), produce a probability distribution over which token comes next. Sample one. Append. Repeat. That's autoregressive generation in plain language.

What makes LLMs different from naive markov chains: the function from context → distribution is computed by a deep transformer with hundreds of billions of parameters trained on trillions of tokens. The transformer learns rich representations that capture syntax, semantics, factual content, and reasoning patterns. But the I/O contract is the same: tokens in, distribution out, sample, repeat.

Strategy in plain English: **LLM = autoregressive sampler. context → distribution → sampled token → append → repeat.**

```
  The generation loop
  
  context = [tokens of system prompt + user message]
  
  while not stop_condition:
    distribution = model(context)
    token = sample(distribution, temperature=T, top_p=P)
    context.append(token)
    yield token
  
  stop_condition: stop token sampled OR max_tokens reached
```

---

### Move 2 — The layered walkthrough

#### Step 1: tokens, not characters

The model operates on tokens (sub-word units), not characters. Common English words are usually one token; rare words and code split into multiple tokens. "Hello world" is 2 tokens; "Internationalization" is 4 tokens. See [02-tokenization](./02-tokenization.md).

The vocabulary is fixed at training time — typically 100K-200K tokens. Every input string is split (or "encoded") into tokens before the model sees it; every output is a sequence of tokens that gets "decoded" back into a string.

```
  Tokenization step
  
  "Hello, world!" → [Hello] [,] [ world] [!] → [5618, 11, 1917, 0]  (token IDs)
                                                       ↑
                                                   the model only sees IDs
```

---

#### Step 2: the model produces a probability distribution

Given a sequence of input tokens, the transformer produces logits — a real-valued vector of size = vocabulary. Softmax converts logits to probabilities summing to 1. This is the distribution over the next token.

```
  Distribution shape (schematic)
  
  Input tokens:    [Hello] [,] [ world]
  Model output:    logits[vocab_size]
  After softmax:   probabilities — sum to 1.0
  
  P("!"):     0.62  ← most likely next token
  P("."):     0.18
  P("?"):     0.07
  P(" how"):  0.05
  P(" today"):0.02
  P(other):   0.06 (spread across 99,995 other tokens)
```

The model is "telling" you: given "Hello, world", the next token is most likely "!" but other tokens are possible.

---

#### Step 3: sampling picks one token

Sampling parameters control how the next token is picked from the distribution. The key knobs:

- **Temperature** (0.0 to ~2.0): how to scale the distribution before sampling. Temperature 0 means "pick the most-likely token" (deterministic-ish). Temperature 1 means "sample from the distribution as-is." Temperature > 1 flattens the distribution (more variation).
- **Top-p** (nucleus sampling, 0.0 to 1.0): only consider the smallest set of tokens whose cumulative probability is at least P. Cuts the long tail.
- **Top-k**: only consider the K most-likely tokens.

See [03-sampling-parameters](./03-sampling-parameters.md).

```
  Temperature effect (schematic)
  
  Original distribution:    P(!) = 0.62, P(.) = 0.18, P(other) = ...
  
  Temperature 0:            P(!) = 1.0  (always pick most likely)
  Temperature 1:            P(!) = 0.62 (sample as-is)
  Temperature 2:            P(!) = 0.35, P(.) = 0.22, ... (flatter)
```

---

#### Step 4: append and repeat

The sampled token is appended to the input sequence. The model is called again with the longer sequence. New distribution; sample again. Generation continues until a stop token is sampled OR a max-token limit is reached.

```
  Iteration trace
  
  Iter 1: context = [Hello] [,] [ world]
          → sample → !
          → context = [Hello] [,] [ world] [!]
  
  Iter 2: context = [Hello] [,] [ world] [!]
          → sample → <end_of_text>
          → stop condition met
  
  Output: "Hello, world!"
```

For longer outputs, this loop runs hundreds or thousands of times. Each iteration is one model invocation. Latency: O(N) iterations × O(model size) per iteration.

---

#### Step 5: emergent behavior

Everything observable about LLMs — instruction following, reasoning, conversational ability, code generation — emerges from:
1. The training data (web text, code, books, conversations).
2. The training objective (predict next token).
3. Fine-tuning (instruction-following examples, RLHF for safety/helpfulness).
4. Scale (parameter count, training compute).

There's no separate "reasoning module" or "instruction-following circuit." The model learned that completing certain sequences requires reasoning-shaped output because that's what the training data showed. The implications:

- **Capabilities are statistical.** What the model can do depends on what its training distribution covers. Rare or novel patterns underperform.
- **Failures are statistical too.** "Hallucinations" are the model sampling a token that's plausible-given-context but not factually grounded. Not a bug; a property of how it generates.
- **Bigger usually beats smaller** on most tasks, because larger models can capture more patterns from training data.

---

### Move 3 — The principle

An LLM is a sampler, not a function. Every observable behavior is emergent from training + scale + sampling parameters. The mental model determines what you trust, what you debug, and what you predict about behavior. Engineers who internalize the sampler shape can predict why temperature 0 reduces variance, why structured outputs need provider-side constraint, and why retrieval (not training) is the way to ground answers in current facts.

---

## What an LLM is — diagram

```
┌─ Input layer ────────────────────────────────────────────────────────────────┐
│                                                                              │
│   Text string → tokenizer → [token IDs]                                      │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Model (transformer, hundreds of billions of params) ────────────────────────┐
│                                                                              │
│   [token IDs] → transformer forward pass → logits[vocab_size]                │
│                                                                              │
│   logits → softmax → probabilities[vocab_size]                               │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Sampling layer ─────────────────────────────────────────────────────────────┐
│                                                                              │
│   probabilities → sampling (temperature, top_p, top_k) → next token ID       │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                  append to context        stop token sampled?
                          │                       │
                          ▼                       ▼
                  next iteration            decode all tokens to string
                  (back to Input layer)            │
                                                   ▼
                                              Output text
```

---

## In this codebase

**Case B — contrl uses LLMs only through the planned Phase 4 coaching agent.**

contrl doesn't currently ship any LLM-driven code. The pre-trained MediaPipe pose detector (`src/components/camera/PoseCamera.tsx`) is a CNN trained for pose estimation, not an LLM. The rep counter (`src/lib/pose/rep-counter.ts`) is a deterministic FSM.

The planned coaching agent (Phase 4 Path C) will be the first LLM consumer in the codebase. It will call Anthropic Sonnet 4 via the Messages API.

**Planned implementation paths:**
- `src/lib/agent/runner.ts` (planned) — wraps the Anthropic SDK call
- `src/lib/agent/system.md` (planned) — system prompt
- `src/lib/agent/tools/*.ts` (planned) — 5 read-only tools

For understanding the predictor shape: study material here, because contrl's actual LLM usage will be one chain at modest volume.

---

## Elaborate

**Where this pattern comes from.** Autoregressive language modeling was named in the 1950s (Shannon's information theory). Modern transformer LLMs date to Vaswani et al. (2017) "Attention Is All You Need." Instruction-tuned LLMs (RLHF / Constitutional AI) emerged 2020-2023. By 2026, the predictor + sampler mental model is consensus.

**The deeper principle.** Emergent behavior from training + scale is the load-bearing fact about LLMs. Engineers used to symbolic AI (rules, knowledge bases, explicit reasoning) sometimes mis-model LLMs as having a "reasoning engine." There's no engine — there's a model that's seen enough reasoning-shaped text that producing reasoning-shaped output became part of its distribution. The same is true of code generation, math, dialog, summarization.

**Where this breaks down.** Two places.

1. **Tasks outside training distribution.** LLMs perform poorly on truly novel patterns — domains they weren't trained on, formats unlike anything in the data. Symbolic systems (or fine-tuned smaller models) can outperform.
2. **Tasks needing exact computation.** Math beyond simple arithmetic, formal logic, deterministic transformations. LLMs simulate; tools (calculators, formal-solvers) compute. The retrieval-and-tool-use patterns (Sections 03 and 04) exist because of this gap.

**What to explore next.**
- [02-tokenization](./02-tokenization.md) — how the model sees text.
- [03-sampling-parameters](./03-sampling-parameters.md) — controlling the sampling.
- [04-structured-outputs](./04-structured-outputs.md) — constraining the sampler at the provider layer.
- Vaswani et al. (2017) "Attention Is All You Need" — foundational paper.

---

## Tradeoffs

| Cost dimension | Modern LLM (transformer) | Classical NLP (rules, parsers) |
|---|---|---|
| Setup cost | Low — API call | High — rules, parsers, lexicons |
| Flexibility | High — handles novel patterns | Low — only handles encoded patterns |
| Determinism | Probabilistic | Deterministic |
| Latency | 100s-1000s of ms | μs to ms |
| Cost per call | $0.001-0.1 | ~0 |
| Failure mode | Plausible-sounding wrong outputs | Explicit "I don't know" |
| Explainability | Opaque (attention heads + parameters) | Inspectable (rule firings) |

### Sub-block 1 — what we gave up

Determinism, low latency, low cost, explainability. Classical NLP excels in narrow domains where the rules can be written. LLMs excel where the domain is too varied for rules.

### Sub-block 2 — what the alternative would cost

For coaching agent: building a rule-based coaching engine would require hand-encoding all the form-feedback patterns, exercise-progression rules, voice-tone choices. Hundreds of rules. Maintenance forever. LLM call: one Sonnet call per session. The setup cost saved is huge; the per-call cost added is tractable.

### Sub-block 3 — the breakpoint

LLMs are the right call until: (a) the domain is narrow enough to hand-encode (e.g., rep counting → FSM is cheaper and more reliable); (b) latency is so tight that 500ms-2000ms is unacceptable (e.g., real-time per-frame inference → use a specialized model); (c) determinism is required for correctness (e.g., legal or financial calculations).

### Sub-block 4 — what wasn't actually a tradeoff

"LLMs hallucinate; classical NLP doesn't." Classical NLP fails differently — it gives wrong answers when input doesn't match its rules, just without confidence. The discipline (eval sets, structured outputs, audit logging) is what makes either category usable in production.

---

## Tech reference (industry pairing)

### Anthropic Claude Sonnet 4

- **Codebase uses:** Planned for the coaching agent.
- **Why it's here:** the LLM contrl will call.
- **Leading today:** Claude Sonnet 4.6 — `adoption-leading` for production generative quality, 2026.
- **Why it leads:** balanced cost/capability tier; strong instruction-following; large context window; prompt caching support.
- **Runner-up:** GPT-4o (similar tier on OpenAI); Gemini 2.5 Pro (Google).

### Transformer architecture

- **Codebase uses:** indirectly via Anthropic's hosted model.
- **Why it's here:** the foundational architecture for modern LLMs.
- **Leading today:** decoder-only transformers (GPT/Claude family) — `adoption-leading` for autoregressive generation, 2026.
- **Why it leads:** scaling laws favor decoder-only; ecosystem of training infrastructure; battle-tested at hundreds-of-billions of parameters.
- **Runner-up:** encoder-decoder transformers (T5, BART) for specific tasks like translation; mixture-of-experts variants for cost-efficiency.

---

## Project exercises

(None directly — this is foundational concept material. Application exercises live in downstream concept files where the predictor shape implies specific design decisions.)

---

## Summary

An LLM is an autoregressive next-token predictor: text → tokens → transformer → distribution → sampling → next token → append → repeat. Everything observable (instruction following, reasoning, dialog) is emergent from training + scale + sampling parameters. Internalizing this shape clarifies why temperature controls variance, why structured outputs need provider enforcement, and why retrieval (not training) grounds factual claims.

**Key points:**

- **LLM = sampler, not function.** Same input can produce different outputs at temperature > 0.
- **Tokens, not characters.** The model operates on sub-word units.
- **Distribution over next token** is the model's output; sampling picks one.
- **Sampling parameters control variance** (temperature, top_p, top_k).
- **All behavior is emergent** from training + scale + sampling. No separate reasoning module.

---

## Interview defense

### What an interviewer is really asking

When asked "how does an LLM work?", they want to hear the predictor shape — tokens → distribution → sampling — not vague claims about "neural networks." The shipped answer mentions autoregressive generation, the sampling step, and emergent capabilities.

### Likely questions

**[mid] What is an LLM, fundamentally?**

A next-token predictor. Given a sequence of tokens, it produces a probability distribution over what the next token should be. Sampling from that distribution and feeding the result back produces generation. Everything else — instructions, reasoning, code — is emergent behavior from training on the right data with the right scale.

```
  context → model → distribution → sample → next token → append → repeat
```

---

**[senior] Why is temperature 0 not actually deterministic?**

Temperature 0 sets the sampling to always pick the highest-probability token (argmax). It's near-deterministic in practice but two things can introduce variance: (1) floating-point ties in the logits (rare), and (2) batched inference where slight numerical differences from batching produce different argmax tokens. For practical purposes treat temperature 0 as deterministic, but don't be surprised if you see 0.1% variation at scale.

---

**[arch] What does "emergent behavior" mean here?**

It means capabilities that weren't explicitly designed into the architecture but arise from training. The architecture is just a stack of transformer blocks doing next-token prediction. The model learns reasoning, code generation, dialog from the training data — there's no "reasoning module" in the architecture. Implication: capabilities are bounded by what training distributions cover, and failures (hallucinations, bias) are statistical properties of the training distribution, not bugs in a logic layer.

---

### One-line anchors

- "LLM = autoregressive next-token predictor + sampling."
- "Tokens, not characters. Distribution over vocab, then sample one."
- "Emergent behavior from training + scale. No separate reasoning module."
- "Temperature controls sampling variance. 0 ≈ deterministic."
- "Hallucinations are statistical, not bugs."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the loop: text → tokens → model → distribution → sample → next token → append → check stop → loop.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "How does an LLM generate text?"

**Level 3 — Apply to a new scenario.**
A teammate says "the model decided to add the word X" — explain why this framing is slightly misleading. (The model didn't "decide" — it produced a distribution; sampling picked the token; the framing matters for debugging because temperature/top_p settings shape what got picked.)

**Level 4 — Defend the decision.**
"Just use a smaller model — it'll be cheaper." Defend the choice of larger models for generative quality with reference to scaling laws and the eval-driven discipline.

**Quick check — code reference test.**
- What's the LLM's output shape per call? (Distribution over the vocab; sampling produces one token.)
- What parameter controls variance? (Temperature, plus top_p and top_k.)
- Does contrl ship LLM code today? (No — Phase 4 planned.)
