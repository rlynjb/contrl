# Context window management

**Industry name(s):** Context window, prompt size budget, model context length
**Type:** Industry standard · Language-agnostic

> Every LLM has a maximum number of tokens it can process in a single call. The discipline is treating that limit as RAM — measure usage, allocate per section, leave headroom, fail loudly when it overflows. contrl's coaching agent has trivial usage today (well under 1% of Sonnet 4's 200K window); the concept matters as study material for when LLM features grow.

**See also:** → [02-lost-in-the-middle](./02-lost-in-the-middle.md) · → prompt-engineering [04-token-budgeting](../../study-prompt-engineering/04-token-budgeting.md) · → [04-agents-and-tool-use/05-agent-memory](../04-agents-and-tool-use/05-agent-memory.md)

---

## Why care

**Move 1.** You have a chain (or agent) that works on small inputs in dev. The prompts are 1500 tokens. Returns clean answers. Two weeks in, a user feeds a longer input — a journal entry with attached context, or a session with 20 logged exercises. The assembled prompt jumps to 18,000 tokens. The model truncates silently (or returns "I cannot help with that"), and the failure mode is invisible because nobody counted.

**Move 2.** That "how big is this prompt before we send it" question is what context-window discipline answers. Not what's in the prompt. Not how good it is. Just the size and the allocation. Tokens are a finite resource per call; treat them as RAM.

**Why you need to answer that question at all:** Three failures hide in not counting. First, **silent truncation** — when the prompt exceeds the window, providers trim (usually the middle or the start, varying by provider); the model produces confident wrong answers because critical context was dropped. Second, **lost-in-the-middle** (the partner concept in `02-lost-in-the-middle.md`) — even when content fits, content in the middle of a long prompt is poorly attended. Third, **cost scales with tokens** — at $3/1M input tokens for Sonnet 4, 18K-token prompts cost 12× more than 1.5K-token prompts. Same task, 12× bill.

**Before / after.**

Without context-window discipline:
- Prompts assembled by concat. Initial dev tests fit. Ship.
- Edge case in production overflows the window. Silent truncation. Bad output.
- Half a day to diagnose. Quick fix: cap retrievals. Catches 95%; the other 5% still fails.

With context-window discipline:
- Each chain has a documented per-section budget (`{ system: 600, examples: 800, context: 6000, history: 2000 }`).
- Constant sections measured at chain init; throws if they grow past budget.
- Variable sections (retrieved chunks, conversation history) get section-level truncation.
- Pre-send token count; over-budget triggers warning log.

**Move 5.** The context window is what RAM was for backend engineers in 2005: a finite resource you measure first, allocate second, monitor third.

---

## How it works

### Move 1 — The mental model

Think of allocating memory in a fixed-size buffer. The buffer is the context window. Each section of the prompt is a named region with a declared size. You don't `memcpy` blindly; you sum the regions and verify they fit. If they don't, compress (summarize earlier turns, retrieve fewer chunks, drop low-relevance content).

```
  Context window as a fixed-size buffer

  ┌──────────────────────────────────────────────────────────────────┐
  │                  Context window (e.g., 200,000 tokens)            │
  ├──────────────────────────────────────────────────────────────────┤
  │ system │ examples │ context │ user │ history (if multi-turn)      │
  ├────────┴──────────┴─────────┴──────┴──────────────────────────────┤
  │ response (reserved): N tokens                                     │
  ├──────────────────────────────────────────────────────────────────┤
  │ safety headroom: M tokens   ◄─ the 80% rule lives here            │
  └──────────────────────────────────────────────────────────────────┘
```

The 80% rule: don't use more than 80% of the window. The headroom absorbs edge-case input growth and small model upgrades.

---

### Move 2 — The layered walkthrough

#### Counting tokens

Use the provider SDK's `countTokens` call. Don't trust character-count heuristics across providers (Anthropic and OpenAI tokenize differently). For Anthropic:

```ts
const { input_tokens } = await client.messages.countTokens({
  model: 'claude-sonnet-4-6',
  system: systemPrompt,
  messages: [{ role: 'user', content: input }],
});
```

This is the ground truth — it's what the provider will charge for.

```
  Token-count flow
  ┌──────────────────────────┐
  │ Assemble prompt           │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │ countTokens(prompt)       │
  │ → input_tokens: 1240       │
  └────────────┬─────────────┘
               │
               ▼
  if input_tokens > 80% of window:
    log warning, optionally fall back
```

Rule of thumb for English: ~1 token per 4 characters. Code is denser (~30 tokens / 100 chars). Non-Latin scripts can be 2–3× denser.

---

#### Per-section budget

Each chain or agent in your codebase declares a per-section budget:

```json
{
  "model": "claude-sonnet-4-6",
  "window": 200000,
  "sections": {
    "system": 600,
    "examples": 800,
    "context": 6000,
    "user_message": 1000
  },
  "response_reserved": 1500,
  "safety_headroom": 3000,
  "total_target": 12900,
  "utilization": 0.064
}
```

The constant sections (system, examples) are measured at chain init and fail loudly if they exceed budget. Variable sections (retrieved chunks, conversation history) get section-level truncation at assembly time.

```
  Three enforcement points

  ┌─ Chain init ─────────────────────────────┐
  │ constants must fit declared budget;       │
  │ throw if they don't                       │
  └──────────────────────────────────────────┘
  ┌─ Per-call assembly ──────────────────────┐
  │ variable sections truncated to caps       │
  │ (relevance-ranked for chunks, recency for │
  │  history)                                 │
  └──────────────────────────────────────────┘
  ┌─ Pre-send ───────────────────────────────┐
  │ countTokens(assembled); warn if > target  │
  └──────────────────────────────────────────┘
```

---

#### When per-section truncation is necessary

For chains/agents with variable context size, declare a relevance-ranking and a cap per section. For the coaching agent's planned tool outputs:

```
  Coaching agent tool outputs (planned)

  get_form_history(exercise, days_back=30)
    → returns up to N=20 most recent form-classifier outputs
    → if more than 20 exist, sort by recency, keep top 20
    → estimated max tokens: ~600
```

The truncation logic lives in the tool implementation (not in the LLM). The LLM sees only the budgeted output.

---

### Move 3 — The principle

Context windows are large in 2026 (200K for Sonnet 4, 1M+ for some Gemini variants), but "large" doesn't mean "free." The discipline is the same as managing any finite resource — declare a budget, enforce it at the boundary, monitor utilization in production. Skipping the budget makes the prompt's size invisible until production traffic finds the edge case.

---

## Context window — diagram

```
┌─ Chain config (declared at build time) ──────────────────────────────────────┐
│                                                                              │
│   budget.json:                                                               │
│     model: claude-sonnet-4-6                                                 │
│     window: 200000                                                           │
│     sections: { system: 600, examples: 800, ... }                            │
│     response_reserved: 1500                                                  │
│     safety_headroom: 3000                                                    │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ loaded at chain init
                                      ▼
┌─ Per-call assembly ──────────────────────────────────────────────────────────┐
│                                                                              │
│   Constants (system, examples): pre-measured, must fit                       │
│   Variables (context, history): section-level truncation                     │
│   Pre-send: countTokens(); warn if > target                                  │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
                              send to provider
                                      │
                                      ▼
┌─ Production observability ───────────────────────────────────────────────────┐
│                                                                              │
│   log: { chain, tokens_in, tokens_out, budget_used_pct }                     │
│   alert: any call exceeding 80% utilization                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — not yet exercised at scale.**

contrl's planned Phase 4 coaching agent uses a small prompt envelope:
- System prompt: ~500 tokens (role, schema, behavioral rules)
- Tool definitions: ~600 tokens (5 read-only tools with arg schemas)
- User context: ~100 tokens (workout ID, exercise category)
- Tool outputs (after agent loop): up to ~2000 tokens (worst case: form history of 30 days returned)
- Response: ~300 tokens (coaching message)

Total worst case: ~3500 tokens. Sonnet 4's window is 200K. Utilization: < 2%.

contrl will not hit context-window pressure under current scope. The concept is study material for:
1. When the coaching agent grows beyond single-session use (e.g., multi-turn chat with full session history).
2. When tool outputs grow (e.g., 90-day form history instead of 30-day).
3. When a future feature adds RAG-style retrieval (currently absent in contrl).

**Planned implementation paths (if needed):**
- `src/lib/agent/budget.json` — per-agent budget declaration
- `src/lib/agent/token-counter.ts` — wrapper around Anthropic's `countTokens`
- Per-tool output caps inside `src/lib/agent/tools/*.ts`

---

## Elaborate

**Where this pattern comes from.** Token-aware prompt engineering crystallized through 2023–2024 as production LLM cost became visible. Anthropic's prompt-caching launch (mid-2024) made prefix design load-bearing. Liu et al. (2023) "Lost in the Middle" added the quality angle. By 2026, measure-your-tokens is consensus.

**The deeper principle.** Finite resources need declared budgets. The naive failure mode for any finite resource is "treat as infinite, debug after the incident." The professional version is "measure, allocate, leave headroom, monitor."

**Where this breaks down.** Two cases.

1. **Genuinely short, fixed prompts.** A 200-token classifier prompt that never grows doesn't need a budget file — it has 99% headroom no matter what model. Don't ceremoniously budget what doesn't vary.
2. **Truly massive context that's required.** Document summarization, long transcripts. The task IS the long context. Use a model with a window that fits, or split into chunks.

**What to explore next.**
- [02-lost-in-the-middle](./02-lost-in-the-middle.md) — even when content fits, position matters.
- prompt-engineering [04-token-budgeting](../../study-prompt-engineering/04-token-budgeting.md) — the prompt-craft angle on the same discipline.
- Liu et al. (2023) "Lost in the Middle" — canonical paper.

---

## Tradeoffs

| Cost dimension | Explicit budget per chain | "Whatever fits" |
|---|---|---|
| Setup cost | budget.json + section caps | Zero |
| Edge-case overflow handling | Deliberate truncation + logging | Silent provider trim |
| Cost predictability | High | Low |
| Model-upgrade safety | High (80% headroom absorbs shifts) | Low |
| Engineer overhead | 30 min/chain | Zero |

### Sub-block 1 — what we gave up

30 minutes per chain for the budget file + section-level truncation. Real but tractable. For contrl's planned single coaching agent, that's 30 minutes once.

### Sub-block 2 — what no budget would have cost

I have shipped without budgets. The cost pattern: works for 2 months, edge case overflows the window, silent truncation, half a day to diagnose, quick fix, the underlying gap stays until someone repeats the lesson. Doing it upfront prevents the lesson; doing it under pressure means the lesson costs.

### Sub-block 3 — the breakpoint

Explicit budgeting is the right call until: (a) all chains have <500-token prompts and constant inputs; (b) you're in prototype phase where every chain is going to be rewritten; (c) using a single small model with a fixed window. None of these apply to contrl's planned coaching agent.

### Sub-block 4 — what wasn't actually a tradeoff

"The budget file becomes out of date." Doesn't happen if you wire up a chain-init check that throws when measured constants exceed declared budget. Runtime contract; doesn't drift.

---

## Tech reference (industry pairing)

### Anthropic `countTokens` API

- **Codebase uses:** Not yet — planned for `src/lib/agent/token-counter.ts`.
- **Why it's here:** the provider-canonical way to count tokens for Claude calls. Ground truth.
- **Leading today:** `anthropic.messages.countTokens` — `adoption-leading` for Anthropic-target token counting, 2026.
- **Why it leads:** matches the tokenizer used in production calls; the provider's count is the actual charge.
- **Runner-up:** local Anthropic tokenizer via `@anthropic-ai/tokenizer` package — slightly faster for batch estimation.

### Anthropic prompt caching

- **Codebase uses:** Not yet — applicable when the coaching agent prompt prefix stabilizes.
- **Why it's here:** the cache discount (10% of normal pricing) makes the constants-up-front structure cost-saving, not just clarity-saving.
- **Leading today:** Anthropic explicit prompt cache — `adoption-leading`, 2026.
- **Why it leads:** explicit API surface, documented thresholds (1024 tokens minimum prefix), observable hit/miss in response headers.
- **Runner-up:** OpenAI implicit caching — enabled by default; less observable.

---

## Project exercises

### [B4C.1] Declare the coaching agent's budget.json

- **Exercise ID:** `[B4C.1]`
- **What to build:** Create `src/lib/agent/budget.json` declaring the per-section budget for the coaching agent. Measure constant sections (system prompt + tool definitions) using `countTokens` at chain init.
- **Why it earns its place:** materializes the discipline on contrl's single LLM surface. One file, ~30 minutes.
- **Files to touch:** `src/lib/agent/budget.json` (new); `src/lib/agent/runner.ts` (new) to load and enforce.
- **Done when:** the file exists; chain initialization throws when constants exceed declared section budgets.
- **Estimated effort:** `<1hr`

### [B4C.2] Cap tool output sizes

- **Exercise ID:** `[B4C.2]`
- **What to build:** Each of the 5 read-only tools caps its output (rows returned, tokens estimated). For `get_form_history`, cap at 20 most-recent entries; for `get_recent_coaching`, cap at 10 entries; etc.
- **Why it earns its place:** prevents one user's long history from blowing the agent's context.
- **Files to touch:** `src/lib/agent/tools/*.ts` (planned).
- **Done when:** synthetic test feeding 100 entries into a tool returns at most the cap.
- **Estimated effort:** `1–4hr`

---

## Summary

Context window management is treating the prompt size as a finite resource with named regions and declared budgets. Per-section caps + boot-time verification + per-call truncation + pre-send token count. The 80% rule: don't use more than 80% of the window. For contrl's planned coaching agent, utilization is well under 2% — the concept is study material, not load-bearing today.

**Key points:**

- **Count tokens with the provider SDK.** Don't trust char-count heuristics across providers.
- **Per-section budget, declared in a file.** Constants measured at boot; variables truncated at assembly.
- **80% utilization rule.** Above that, one model change away from breaking.
- **contrl's coaching agent: ~2% utilization.** Concept is preparation, not current concern.

---

## Interview defense

### What an interviewer is really asking

When asked "how do you manage the context window?", they want to hear whether you treat tokens as a finite resource. The shipped answer names per-section budgets, assembly-time truncation, and headroom. The unshipped answer says "we just send everything and hope."

### Likely questions

**[mid] What happens if you exceed the context window?**

Provider trims silently — usually the middle or the start of the prompt, varying by provider. The model produces a confident answer based on the truncated context. The failure is invisible unless you count tokens before sending. Defense: measure at assembly, alert on overage.

```
  Without measurement              With measurement
  ─────────────────────────        ─────────────────────────
  Prompt exceeds window             countTokens() before send
  Provider trims silently           overage triggers warning
  Model returns wrong answer        chain can fall back / retry
   "confidently"                    with truncated input
```

---

**[senior] How do you size the budget for a multi-turn agent?**

For the coaching agent: identify constant sections (system prompt + tool definitions) and measure them at init. Each tool's output gets a per-tool cap based on relevance ranking. Conversation history (if multi-turn) is the most variable section — cap by token count, summarize older turns when over budget. Pre-send total stays under 80% of the window.

```
  Budget allocation for agent
  ┌─────────────────────────────────────┐
  │ system + tool defs: ~1.1K tokens     │ ◄─ constants (cached)
  │ user query: ~100 tokens              │
  │ tool call cycle: ~2K tokens          │ ◄─ multi-iteration
  │ response budget: 1.5K reserved        │
  │ headroom: 30% of window                │
  └─────────────────────────────────────┘
```

---

**[arch] How does this change at 100× LLM call volume?**

Three things shift. First, per-call token overhead becomes real money — at 100K calls/day, 1K extra tokens × $3/1M = $300/day extra. Worth optimizing. Second, prompt caching becomes load-bearing (10% pricing on cached prefix saves substantial cost at scale). Third, observability becomes essential — utilization dashboards per chain, alerting on drift past 80%.

```
  Scale effects

  ┌──────────────────────┬──────────────────┬──────────────────────┐
  │                      │ 100 calls/day    │ 100,000 calls/day    │
  ├──────────────────────┼──────────────────┼──────────────────────┤
  │ Cost of 1K extra tok │ ~$0.30/mo        │ ~$300/day            │
  │ Cache discount value │ Low              │ High (load-bearing)  │
  │ Observability        │ Spot checks      │ Per-chain dashboards │
  └──────────────────────┴──────────────────┴──────────────────────┘
```

---

### The question candidates always dodge

**"Internet advice says context windows are huge now (200K+); why budget?"**

Because the window being large doesn't mean using all of it is free or accurate. Cost: at $3/1M input tokens for Sonnet 4, a 100K-token call costs $0.30 each; a 5K-token call costs $0.015 each. Quality: even when content fits, lost-in-the-middle means content in the prompt's center is poorly attended. Latency: provider processing time scales with input tokens. "Use it all" is the same as "disk is 2TB so don't clean files" — true but not useful.

```
  Three reasons "use it all" is wrong
  ┌──────────────┬──────────────────────────┐
  │ Dimension    │ Effect of 20× longer prompt │
  ├──────────────┼──────────────────────────┤
  │ Cost         │ 20× input cost per call   │
  │ Quality      │ Lost-in-the-middle drop   │
  │ Latency      │ ~2–3× processing time     │
  └──────────────┴──────────────────────────┘
```

---

### One-line anchors

- "Tokens are RAM. Measure, allocate, leave headroom, monitor."
- "80% utilization rule."
- "Provider's countTokens is ground truth. Char-count heuristics drift across providers."
- "Constant prefix cached (10% pricing); variable suffix priced normally."
- "contrl's coaching agent uses <2% of the window. Discipline is preparation, not current concern."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the context window as a buffer with named regions: system, examples, context, user, response (reserved), safety headroom. Mark the 80% line.

Pass: you got all six regions and the 80% line.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "How do you manage the LLM context window?" Checkpoints:
- Did you name per-section budgets?
- Did you mention the 80% rule?
- Did you name the provider's `countTokens` (or equivalent)?

**Level 3 — Apply to a new scenario.**
A teammate's chain returns "I cannot help with that" on long inputs. Walk through the diagnosis. Reference contrl's planned `src/lib/agent/token-counter.ts` and the per-tool output cap pattern.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is 30 minutes per chain for the budget file. If you were starting a project with one chain that you knew would be small and fixed, would you still write the budget file?

There's no right answer. Defend with reference to the breakpoint in Sub-block 3.

**Quick check — code reference test.**
Without opening files, answer:
- What's the rule of thumb for English tokens per character?
- What's Anthropic's prompt cache threshold?
- What's contrl's coaching agent utilization estimate?

Pass: ~1 token per 4 chars; 1024 tokens minimum prefix; <2% of Sonnet 4's 200K window.
