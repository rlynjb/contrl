# Token budgeting and context window management

**Industry name(s):** Token budgeting, context window management, prompt sizing
**Type:** Industry standard · Language-agnostic

> Count your tokens before you ship. Allocate a budget per section. The 80% rule: if you're using more than 80% of the context window, you're one model change away from breaking. Lost-in-the-middle is real.

**See also:** → [01-anatomy](./01-anatomy.md) · → [02-structured-outputs](./02-structured-outputs.md) · → [06-single-purpose-chains](./06-single-purpose-chains.md)

---

## Why care

**Move 1.** You build a RAG chain. It works fine on your test queries — they retrieve 3 chunks each, the prompt is 1200 tokens, the model returns a clean answer in 200 tokens. Ship it. Two weeks later a user pastes a long document with 47 paragraphs into the search box. Your retrieval returns 18 chunks. The assembled prompt is 22,000 tokens. The model's response is "I cannot help with that" and a truncation marker. You spend half a day adding `console.log(prompt.length)` to find out you're hitting a context-window limit you never measured because nobody counted tokens.

**Move 2.** That "how big is this prompt, and where does the budget go" question is what token budgeting answers. Not what's in the prompt. Not how good the prompt is. Just the size and the allocation: how many tokens for system, how many for retrieved context, how many for conversation history, how many reserved for the response. Tokens are a finite resource per call; the discipline is treating them like RAM.

**Why you need to answer that question at all:** Three failures live in the gap. First, **silent truncation** — when the prompt exceeds the context window, the provider trims it (usually from the middle or the start, varying by provider); the model produces a confident-sounding wrong answer because critical context was dropped without warning. Second, **lost-in-the-middle** (Liu et al., 2023) — even when context fits, content placed in the middle of a long prompt is poorly attended; position-1 and position-last get attention, position-middle gets ignored. Third, **cost scales with tokens** — at $3/1M input tokens for Sonnet 4 (and rising for larger models), a chain that uses 22K tokens per call on a 1M-call/week scale is $200/week. A chain that uses 4K tokens is $36/week. Same chain, same task, 5.5x cost difference.

**Before / after.**

Without budgeting:
- Prompt assembly is "concat everything we might need." Initial test cases happen to fit; you ship.
- Edge-case input arrives in production. Prompt blows past the window. Silent truncation. Model returns nonsense.
- Half a day finding the cause. Then a quick fix: cap retrieved chunks at 5. Catches 95% of cases. The other 5% still fails silently.
- Provider releases a model with a smaller window. Your prompts now break on cases that worked yesterday. Another half-day.

With budgeting:
- Each chain has a documented budget: `{ system: 600, examples: 800, context: 6000, history: 2000, response: 1500, safety: 3000 }`. Sums to 14K — well within Sonnet 4's 200K window, 80% headroom.
- The retrieval layer caps at 6000 tokens of chunks regardless of how many were returned — relevance-ranked truncation.
- A token-counting helper runs every assembled prompt before sending; logs a warning if any section exceeds its budget.
- Edge cases that would have overflowed get truncated *deliberately* (most relevant chunks first, least relevant dropped) and logged. Model gets a smaller, focused context. Quality is higher, not lower.

**Move 5.** Token budgeting is what knowing your RAM footprint was for backend engineers in 2005 — basic professional hygiene. The detail under the discipline is the same: measure first, allocate explicitly, leave headroom, monitor in production.

---

## How it works

### Move 1 — The mental model

Think of allocating memory in a fixed-size buffer. The buffer is the context window. Each section of the prompt is a region with a declared size. You don't `memcpy` blindly — you sum the regions and verify they fit. If they don't, you compress (summarize earlier turns, retrieve fewer chunks, drop low-relevance content).

The strategy in plain English: **declare a budget per section, sum it, leave headroom, measure in production.**

```
  Token budget as a fixed-size buffer

  ┌──────────────────────────────────────────────────────────────────┐
  │                  Context window (e.g., 200,000 tokens)            │
  ├──────────────────────────────────────────────────────────────────┤
  │ system: 600     │  examples: 800  │   context: 6000   │  user: ...│
  ├─────────────────┴─────────────────┴───────────────────┴───────────┤
  │   response (reserved): 1500                                       │
  ├──────────────────────────────────────────────────────────────────┤
  │   safety headroom: 3000   ◄─ the 80% rule lives here              │
  └──────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼  unused if budget closes
                              cheap and predictable
                              calls that survive model swaps
```

A reader picks up the rule in five seconds: each section has a size; the total is less than 80% of the window.

---

### Move 2 — The layered walkthrough

#### Counting tokens

If you're coming from frontend, this is the equivalent of knowing the byte size of a JSON payload before you POST it. You use a counter library; you measure at the relevant boundary. For tokens:

```ts
// Anthropic SDK has a counter
import { Anthropic } from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey });
const tokens = await client.messages.countTokens({
  model: 'claude-sonnet-4-6',
  system: systemPrompt,
  messages: [{ role: 'user', content: userInput }],
});
// → { input_tokens: 1240 }

// OpenAI: use tiktoken (the encoder used by all GPT-4 models)
import { encoding_for_model } from 'tiktoken';
const enc = encoding_for_model('gpt-4o');
const tokens = enc.encode(systemPrompt).length;
```

Boundary condition: counting is provider-specific. Anthropic's tokenizer differs from OpenAI's; counting a prompt against `tiktoken` and sending to Claude gives an approximation, not the truth. Use the provider's own counter for the model you're calling. For rough estimation across languages, the cheat sheet: English ≈ 1 token per 4 characters; non-Latin languages can run 1.5–3x denser.

```
  Tokenizer differences (approximate, English)
  ┌─────────────────────────┬──────────────────────────┐
  │  100 characters of text │  Anthropic    OpenAI     │
  ├─────────────────────────┼──────────────────────────┤
  │  English prose          │  ~22 tokens   ~25 tokens │
  │  Code (JavaScript)      │  ~30 tokens   ~35 tokens │
  │  JSON (dense keys)      │  ~35 tokens   ~40 tokens │
  └─────────────────────────┴──────────────────────────┘
```

---

#### Allocating the budget

Each chain in your codebase gets an explicit token budget per section. Write it down. Loopd's planned shape:

```json
// Illustrative — budget.json for a hypothetical search-rewrite chain
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

The `utilization` is the load-bearing number — it tells you what fraction of the window you're using at the budget. Anything above 80% is a warning sign.

If you're coming from frontend, this is the equivalent of a CSS layout grid with declared row/column sizes. You don't say "things flow"; you say "this row is 200px, that row is 1fr." Same discipline for prompts.

Boundary condition: the budget is the *target*, not a hard cap on the assembled prompt. The assembly layer (next sub-section) is where the cap gets enforced. The budget documents intent; the assembly enforces it.

---

#### Enforcing the budget at assembly

The chain's assembly code measures each section's size before concatenating and applies compression or truncation when a section exceeds its budget. Most often this matters for the retrieved-context section (variable size) and the conversation-history section (also variable).

```ts
// Sketch — typical chain shape
async function assemblePrompt(input: SearchInput, retrievedChunks: Chunk[]): Promise<Prompt> {
  // Cap context section: most relevant chunks first; stop at budget.
  let usedTokens = 0;
  const chosen: Chunk[] = [];
  for (const chunk of retrievedChunks) {  // pre-sorted by relevance
    if (usedTokens + chunk.tokens > BUDGET.context) break;
    chosen.push(chunk);
    usedTokens += chunk.tokens;
  }

  // Cap history section: most recent turns kept; older summarized.
  const history = await compressHistoryToFit(input.history, BUDGET.history);

  const prompt = {
    system: SYSTEM_PROMPT,           // pre-measured at 600
    examples: EXAMPLES,              // pre-measured at 800
    context: chosen.map(formatChunk),
    history,
    user_message: input.query,
  };

  const totalTokens = await countTokens(prompt);
  if (totalTokens > BUDGET.total_target * 1.2) {
    log.warn({ event: 'budget_exceeded', chain: 'search-rewrite', actual: totalTokens, target: BUDGET.total_target });
  }
  return prompt;
}
```

The key pattern: the budget is enforced section by section, not globally. Each section has its own truncation logic appropriate to what's in it (relevance-ranked for retrieved chunks; recency-ranked for history; etc.).

```
  Budget enforcement at assembly time

  Pre-measure constants
  ┌───────────────────────────────────┐
  │ system: 600 tokens (measured at   │
  │   chain init; cached as constant) │
  │ examples: 800 tokens (same)       │
  └─────────────┬─────────────────────┘
                │
                ▼  + variable sections
  Truncate per section
  ┌───────────────────────────────────┐
  │ context: 6000-token cap on chunks │
  │   sort by relevance; stop at cap   │
  │                                   │
  │ history: 2000-token cap            │
  │   keep recent N turns verbatim     │
  │   summarize older turns to fit     │
  └─────────────┬─────────────────────┘
                │
                ▼  assemble + measure
  Final check
  ┌───────────────────────────────────┐
  │ countTokens(assembled) > budget?  │
  │   log warning, send anyway        │
  │   (the section caps should have    │
  │   prevented this; the global       │
  │   check is the safety net)         │
  └───────────────────────────────────┘
```

Boundary condition: when truncation removes a fraction of context, log what was dropped. "Truncated 4 of 18 chunks (least relevant first)" is the audit trail you need when debugging a retrieval-quality complaint later.

---

#### Lost-in-the-middle

Once the prompt fits, position matters. Liu et al. (2023) "Lost in the Middle: How Language Models Use Long Contexts" demonstrated that retrieval-augmented LLMs preferentially attend to content at the start and the end of the prompt. Middle content is systematically under-used. This holds across Sonnet, GPT-4, and Gemini in independent reproductions.

The practical implication: when assembling retrieved chunks, put the most relevant chunk at the END of the context section (where attention is highest), not the start. Counter-intuitive — many naive implementations put the "best" result first. Reverse that.

```
  Attention distribution across a long prompt (schematic)

       ┌────────┬────────┬────────┬────────┬────────┐
       │ high   │ medium │ low    │ medium │ high   │
       │ system │ early  │ middle │ recent │ user   │
       │        │ chunks │ chunks │ chunks │ msg    │
       └────────┴────────┴────────┴────────┴────────┘

  Where the model attends most:
    1. system (at the top — primacy bias)
    2. user_message (at the bottom — recency bias)
    3. chunks immediately above the user_message

  Where the model attends least:
    chunks in the middle of the context section
```

The discipline: put the highest-relevance retrieved chunks immediately above the user_message. Lower-relevance chunks higher up in the context section. This contradicts the "show the best first" instinct.

Boundary condition: lost-in-the-middle's severity decreases as the prompt gets shorter. On a 3000-token prompt, the effect is small; on a 50,000-token prompt, it's large. The under-80%-utilization rule is partly motivated by this — short prompts have less middle to lose things in.

---

#### Prefix caching and budget

Providers cache the static prefix of a prompt across calls (Anthropic explicitly with `cache_control`; OpenAI implicitly). The implication for budgeting: the constant sections (system + examples) should be kept relatively large and stable, because their cost is paid once per cache window (typically 5 minutes after last hit) rather than once per call.

```
  Cost shape with prefix caching

  Call 1 (cache miss):
  ┌─────────────────────────────────────────────┐
  │ system + examples (1400 tokens) @ normal $   │ ◄─ priced normally
  │ user + context (5000 tokens) @ normal $      │
  └─────────────────────────────────────────────┘

  Call 2 (cache hit, < 5 min later):
  ┌─────────────────────────────────────────────┐
  │ system + examples (1400 tokens) @ ~10% $    │ ◄─ cache hit ≈ 90% off
  │ user + context (5000 tokens) @ normal $     │
  └─────────────────────────────────────────────┘
```

The discipline: don't trim the system prompt or examples to save tokens at the cost of cache effectiveness. A 600-token system prompt that earns the cache discount is cheaper across many calls than a 300-token system prompt that doesn't pass the cache threshold.

Boundary condition: cache thresholds matter. Anthropic's prompt cache requires at least 1024 tokens of static prefix to engage. A 400-token system prompt won't trigger the cache; a 1024-token system prompt will. Engineering around this is real.

---

### Move 3 — The principle

Token budgeting is the operational discipline that makes the rest of prompt engineering survive scale. Counting tokens is hygiene. Allocating per-section is engineering. Leaving headroom is preparing for model changes. Logging utilization is observability. None of this is exotic — all of it is what backend engineers do for any finite resource (RAM, file descriptors, connections). The reason it shows up as a separate concept here is that "context window" doesn't feel like RAM until you've shipped a chain that breaks because nobody counted.

The full picture is below.

---

## Token budgeting — diagram

The full assembly pipeline with budget enforcement marked at each stage.

```
┌─ Chain configuration (declared at build) ────────────────────────────────────┐
│                                                                              │
│   budget.json:                                                               │
│     model: claude-sonnet-4-6                                                 │
│     window: 200000                                                           │
│     sections: { system: 600, examples: 800, context: 6000, history: 2000 }   │
│     response_reserved: 1500                                                  │
│     safety_headroom: 3000                                                    │
│                                                                              │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ loaded at chain init
                                       ▼
┌─ Assembly time (per call) ───────────────────────────────────────────────────┐
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Constant sections (pre-measured at chain init)                       │  │
│  │   system.md: 600 tokens ✓                                            │  │
│  │   examples.md: 800 tokens ✓                                          │  │
│  │   (if either exceeds budget → fail loud at chain init)               │  │
│  └─────────────────────────────────┬────────────────────────────────────┘  │
│                                    │                                        │
│  ┌─────────────────────────────────┴────────────────────────────────────┐  │
│  │ Variable sections (truncated per-call)                               │  │
│  │   retrieved chunks                                                   │  │
│  │     → sort by relevance                                              │  │
│  │     → fill until 6000-token budget cap                               │  │
│  │     → most-relevant LAST (lost-in-the-middle mitigation)             │  │
│  │   conversation history                                               │  │
│  │     → keep recent turns verbatim                                     │  │
│  │     → summarize older turns to fit 2000-token cap                    │  │
│  └─────────────────────────────────┬────────────────────────────────────┘  │
│                                    │                                        │
│  ┌─────────────────────────────────┴────────────────────────────────────┐  │
│  │ Final assembly + global budget check                                 │  │
│  │   countTokens(assembled)                                             │  │
│  │   if > target * 1.2 → log warning (section caps failed)              │  │
│  │   if > window - response_reserved → throw or fall back               │  │
│  └─────────────────────────────────┬────────────────────────────────────┘  │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │ send to provider
                                     ▼
┌─ Production observability ───────────────────────────────────────────────────┐
│                                                                              │
│   log per call: { chain, tokens_in, tokens_out, budget_used_pct }            │
│   dashboard: p50/p99 token usage per chain                                   │
│   alert: any call exceeding 80% utilization                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

The budget is enforced at three points: at chain init (constants must fit), at assembly time (variables get truncated), and at runtime (overage triggers logging or fallback).

---

## In this codebase

**Case B planned — coaching agent budget.**

contrl ships no LLM code today. The planned Phase 4 coaching agent will have one prompt and one budget to track. Estimated shape:

```
src/lib/agent/budget.json (planned)

{
  "model": "claude-sonnet-4-6",
  "window": 200000,
  "sections": {
    "system": 1500,         // role + behavioral rules + 5 tool definitions
    "examples": 800,        // 2-3 worked coaching exchanges (if used)
    "context": 2000,        // tool-call return data injected per call
    "user": 200,            // workout ID + exercise being coached
    "response": 800         // expected coaching message length
  },
  "total_target": 5300,
  "utilization": 0.027      // 2.7% of window
}
```

contrl's coaching agent runs nowhere near 80% utilization at solo scale — the system + examples + per-call context together fit in a few thousand tokens. The discipline still earns its place: it caps edge cases (a workout with 50 logged sets producing a 30K-token context) and it gives a baseline to detect drift when prompts are tuned.

**Plus the per-call tool-output budget.**

The 5 read-only tools (`get_classifier_output`, `get_form_history`, `get_progression_state`, `get_recent_coaching`, `get_exercise_cues`) each return data of bounded but variable size. `get_form_history` for a user with 500 sessions is the worst case. The budget needs to cap each tool's return size (or paginate) so a single tool call can't blow past the window.

**ML side — not a token budget concern.**

contrl's Phase 2C form classifier (LightGBM via ONNX) takes a fixed-size feature vector. There's no "budget" question — the input shape is the input shape. Listed for completeness; the discipline doesn't apply.

---

## Elaborate

**Where this pattern comes from.** Token-aware prompt engineering crystallized through 2023–2024 as the cost-per-call delta between short and long prompts became impossible to ignore. Anthropic's prompt-caching launch (mid-2024) made the cost case stark: cache hits priced at 10% of normal rates meant *prefix* design became a load-bearing engineering decision, not just an aesthetic one. Liu et al.'s "Lost in the Middle" paper (2023) added the quality angle — even within budget, position matters. By 2026, "measure your tokens" is consensus; the only debate is the budget-allocation specifics.

**The deeper principle.** Tokens are a finite resource with both cost and quality implications. Treating them as a finite resource (budgeted, measured, monitored) is the same discipline as treating RAM, file descriptors, or database connections as finite. The naive failure mode for any of those is "treat as infinite, debug after the incident." The professional version is "measure, allocate, leave headroom, monitor."

**Where this breaks down.** Two cases.

1. **Genuinely short, fixed prompts.** A 200-token classifier prompt that never grows doesn't need a budget file — it has 99% headroom no matter what model it runs on. Don't ceremoniously budget what doesn't vary.
2. **Truly massive context that's required for the task.** Document-level summarization, long-form code review, large transcripts — the task IS the long context. You can't budget the document down to 6000 tokens if the document is 50,000 tokens and the task is summarize-the-whole-thing. For these, the discipline shifts from "stay under 80%" to "use a model with a window that fits the task" or "split the task into chunks that do fit."

**What to explore next.**
- [01-anatomy](./01-anatomy.md) → the four-section structure that gives the budget its categories.
- [06-single-purpose-chains](./06-single-purpose-chains.md) → why splitting a chain into smaller chains often solves a token-budget problem.
- Liu et al. (2023) "Lost in the Middle" — the canonical reference for position effects.
- Hamel Husain's eval-first framing — measuring quality at different budget allocations is how you tune.

---

## Tradeoffs

| Cost dimension | Explicit budget per chain | "Whatever fits" |
|---|---|---|
| Setup cost | budget.json per chain + assembly logic | Concat everything, hope |
| Edge-case overflow handling | Deliberate truncation with logging | Silent provider-side trim |
| Lost-in-the-middle mitigation | Most-relevant chunk last | Naive ordering, attention loss |
| Cost predictability | High — utilization tracked | Low — bill spikes on edge cases |
| Cache hit rate | Tuned to pass threshold | Accidental |
| Model-upgrade safety | High — 80% headroom absorbs small shifts | Low — small window changes break chains |
| Engineer overhead | Real — 30 min to write the budget file | Zero |

### Sub-block 1 — what we gave up

The 30-minute-per-chain overhead of writing a budget file, measuring constant sections at init, and adding assembly-layer truncation. That's real time, real code. For contrl's single coaching agent, that's ~30 minutes of work plus a token-counting helper.

The other cost is the *quality of the truncation logic*. Truncating retrieved chunks by relevance assumes you have relevance scores — which assumes you've done the retrieval-ranking layer right (see RAG concepts in the broader study guide). Truncating history requires deciding what's "summarized" and what's "verbatim" — a real product/UX decision that has to be made per chain. The budget file enforces the discipline but doesn't tell you what the right answers are for these.

### Sub-block 2 — what "whatever fits" would have cost

I've shipped the no-budget version twice, both at startups where the LLM features were second-priority. Costs:

- Month 1: chains fit. Everything works. The budget discipline feels like overkill.
- Month 3: an edge-case user input (a long pasted document) blows the window. Silent truncation. User reports a nonsense response. Half a day to debug, including the embarrassing realization that nobody had run `tokens.length` on the assembled prompt.
- Month 5: provider releases a new "smaller and cheaper" model with a 32K context window. Migration considered. The team realizes nobody knows which chains fit in 32K and which don't, because no chain has a documented size. Migration is shelved for two more months until someone has time to measure all chains.
- Month 8: bill increases unexpectedly. Investigation: a recent prompt change added 2000 tokens to the system section, missing the prompt cache threshold and pricing every call at full rate. The discipline ("the system prompt should be at least 1024 tokens to pass the cache threshold") was in someone's head but not in the codebase, so it didn't survive the change.

The 2.5 hours of budget files at Day 1 would have prevented all of this.

### Sub-block 3 — the breakpoint

Explicit budgeting is the right call until: (a) all of your chains have <500-token prompts and constant-size inputs (the budget file is paperwork with no payoff); (b) you're in a prototype-only phase where every chain is going to be rewritten anyway (budget files become noise); (c) you're using a single small model with a fixed window and zero scaling concerns (still useful, but the cost case weakens). For contrl's planned coaching agent, the variable tool-output sizes (especially `get_form_history`) push past (a), so the budget earns its place.

### Sub-block 4 — what wasn't actually a tradeoff

"The budget file becomes out of date." Sounds reasonable; doesn't happen if you wire one thing up: the chain's load-time check that verifies measured constant sections still fit the declared budget. If `system.md` grew by 200 tokens and the budget says 600, the chain throws at boot. The budget file isn't documentation that drifts; it's a runtime contract.

---

## Tech reference (industry pairing)

### Anthropic `countTokens` API

- **Codebase uses:** Not yet — planned for contrl's coaching-agent token-counting helper.
- **Why it's here:** the provider-canonical way to count tokens for Claude calls. Counts the exact tokens the provider will charge for.
- **Leading today:** `anthropic.messages.countTokens` — `adoption-leading` for Anthropic-target token counting, 2026.
- **Why it leads:** matches the tokenizer used in production calls; the provider's own count is the ground truth; no risk of tokenizer drift between client and server.
- **Runner-up:** local Anthropic tokenizer via `@anthropic-ai/tokenizer` package — slightly faster for high-volume estimation, but check the README for which model versions are supported.

### `tiktoken` (OpenAI tokenizer)

- **Codebase uses:** Not in this codebase — included for reference because cross-provider comparison work uses it.
- **Why it's here:** the canonical OpenAI tokenizer; precise counts for any OpenAI model.
- **Leading today:** `tiktoken` (Python) and `tiktoken-node` (JS) — `adoption-leading` for OpenAI token counting, 2026.
- **Why it leads:** provider-shipped; matches what the API charges for.
- **Runner-up:** `gpt-tokenizer` (a JS port) — convenient for client-side counting in browser environments.

### Prompt cache thresholds (provider-specific)

- **Codebase uses:** Anthropic's `cache_control: { type: "ephemeral" }` is the lever planned for contrl's coaching agent.
- **Why it's here:** the operational fact that caching only engages above a minimum prefix size (Anthropic: 1024 tokens for Claude 3+). Drives the budget allocation rule: don't trim system+examples below the threshold.
- **Leading today:** Anthropic explicit prompt cache — `adoption-leading` for predictable caching control, 2026.
- **Why it leads:** the threshold and discount are documented and observable (response headers); engineering around the threshold is deterministic.
- **Runner-up:** OpenAI implicit caching — engages automatically without an API control; less observable, less tunable.

---

## Project exercises

contrl ships no LLM code today. These exercises become buildable when the Phase 4 coaching agent lands.

### [B4C.budget] Write the coaching agent's budget.json

- **Exercise ID:** `[B4C.budget]`
- **What to build:** Add `src/lib/agent/budget.json`. Measure the constant sections (`system.md`, `examples.md`) with `countTokens`. Document `{model, window, sections, response_reserved, safety_headroom, total_target, utilization}`.
- **Why it earns its place:** materializes the discipline. Without it, future prompt edits drift the budget silently.
- **Files to touch:** `src/lib/agent/budget.json`.
- **Done when:** the file exists, numbers match `countTokens` output for the current `system.md` + `examples.md`, utilization is below 0.8.
- **Estimated effort:** `<1hr`

### [B4C.budget-check] Add the agent-init budget check

- **Exercise ID:** `[B4C.budget-check]`
- **What to build:** At agent load time, recount the constant sections and verify they're within the declared budget. Throw a clear error if not.
- **Why it earns its place:** prevents budget-file drift. The runtime contract that keeps the file honest.
- **Files to touch:** `src/lib/agent/runner.ts` boot path.
- **Done when:** editing `system.md` to grow past `budget.sections.system` causes runner initialization to throw with a "system prompt exceeds budget: 1500 declared, 1720 actual" message.
- **Estimated effort:** `1–4hr`

### [B4C.tool-cap] Cap variable tool returns

- **Exercise ID:** `[B4C.tool-cap]`
- **What to build:** For `get_form_history` and `get_recent_coaching` (the two tools with unbounded return size), implement a recency-ranked truncation that caps each tool's return at the declared budget slice. Log what was dropped.
- **Why it earns its place:** prevents a user with 1000 logged sessions from blowing the window. Without it, edge-case inputs cause silent provider-side truncation or hard errors.
- **Files to touch:** the two tool implementations + a shared `truncateByRecency` helper.
- **Done when:** a synthetic test that feeds 500 sessions to `get_form_history` returns at most the declared `context_per_tool` token cap, with a log entry listing dropped sessions.
- **Estimated effort:** `1–4hr`

---

## Summary

Token budgeting is treating the context window as a fixed-size buffer with named regions, declared sizes, and assembly-time enforcement. Each chain gets a `budget.json` documenting per-section size, response reservation, and safety headroom (target 80% utilization or less). Constant sections (system, examples) are measured at chain init and bound at boot; variable sections (retrieved chunks, history) get section-level truncation at assembly time. The discipline is hygiene — it prevents silent truncation, manages cost predictably, and keeps quality high by mitigating lost-in-the-middle effects.

**Key points:**

- **Count tokens before you ship.** `countTokens` from the provider SDK is the floor.
- **Allocate per section, in a checked-in file.** Budget.json per chain.
- **80% utilization rule.** Above 80%, you're one model change from breaking.
- **Lost-in-the-middle is real.** Highest-relevance retrieved chunks go LAST in the context section, not first.
- **Prompt cache thresholds matter.** Don't trim the system prompt below the threshold to save tokens — caching savings dominate.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "how do you manage the context window in production?", they want to hear whether you treat tokens as a finite resource or as something the provider deals with. The shipped answer mentions budgeting per section, assembly-time truncation, and 80% headroom. The unshipped answer says "we just send everything and hope."

### Likely questions

**[mid] How do you avoid blowing the context window in production?**

Each chain has a `budget.json` with per-section sizes. Constant sections (system, examples) are measured at chain init and bound at boot — if they grow past the budget, the chain throws. Variable sections (retrieved chunks, conversation history) get truncated at assembly time using section-appropriate logic (relevance-ranked for chunks, recency-ranked for history). Final assembled prompt is token-counted before sending; over-budget triggers a warning log.

```
  Three enforcement points

  ┌─ Init time ─────────────────────┐
  │ constants must fit declared     │
  │ budget; throw if not             │
  └────────────────────────────────┘
  ┌─ Assembly time ────────────────┐
  │ variables get section-level     │
  │ truncation                      │
  └────────────────────────────────┘
  ┌─ Pre-send ─────────────────────┐
  │ total token check; warning log  │
  │ if over target                  │
  └────────────────────────────────┘
```

---

**[senior] What's the practical impact of lost-in-the-middle on prompt design?**

Two things change in production. First, retrieved chunks get ordered with highest-relevance LAST in the context section, not first. The model attends most strongly to the start (primacy) and the end (recency) of the prompt; the middle is where attention drops. Putting your best chunk in position-last hits the recency bias. Second, prompt sections get sized smaller wherever possible — a shorter prompt has less middle to lose things in. The 80% utilization rule is partly motivated by this; the more headroom, the less middle.

```
  Where attention concentrates

  ┌──────────┬──────────┬──────────┬──────────┬──────────┐
  │ system   │ examples │ middle   │ best     │ user     │
  │ ← HIGH   │  medium  │ ← LOW    │ ← HIGH   │ ← HIGH   │
  └──────────┴──────────┴──────────┴──────────┴──────────┘

  Counter-intuitive: put the BEST retrieved chunk just before user.
  Naive: put it first. That's where lost-in-the-middle hurts most.
```

---

**[arch] How does budgeting change with prompt caching?**

The caching window changes the cost calculus on the system+examples section. Without caching, every token in every section costs the same; you minimize the prefix to save money. With caching (Anthropic 10% pricing on cached prefix, OpenAI implicit savings), the system+examples gets cheaper *per cached call* — so you keep it large and stable. The new rule: the system+examples should be at least the cache threshold (1024 tokens on Anthropic) to engage the cache, and should not vary per call. Cost optimization shifts from "shrink the prefix" to "make the prefix cache-eligible."

```
  Pre-caching cost shape           Post-caching cost shape
  ─────────────────────────────    ─────────────────────────────
  minimize ALL sections             minimize VARIABLE sections
  every token costs equally         constant sections cost 10% if cached
                                    keep constant sections above
                                    cache threshold (1024 tokens)
```

---

### The question candidates always dodge

**"Internet advice says context windows are huge now (200K+); why are you still budgeting?"**

Because the window being large doesn't mean using all of it is free or accurate. Three reasons. First, cost — at $3/1M input tokens for Sonnet 4, a 100K-token call costs $0.30 each; a 5K-token call costs $0.015 each. Same task, 20x cost difference. Second, lost-in-the-middle — even when the content fits, attention is non-uniform; a 100K-token prompt loses information in the middle that the model never uses. Third, latency — provider-side processing scales with input tokens; a 100K prompt takes ~3x longer to process than a 5K one (varies by provider and model). The "we have a 200K window" argument is the same as "the disk is 2TB so we don't need to clean up files" — true but not useful.

```
  Three reasons "use it all" is wrong

  ┌──────────────┬──────────────────────────────────────┐
  │ Dimension    │ Effect of 20× longer prompt          │
  ├──────────────┼──────────────────────────────────────┤
  │ Cost         │ 20× input cost per call              │
  │ Quality      │ Lost-in-the-middle attention drop    │
  │ Latency      │ ~2–3× provider processing time       │
  └──────────────┴──────────────────────────────────────┘
```

---

### One-line anchors

- "Each chain has a budget.json. Sections, response reservation, safety headroom."
- "80% utilization. Above that, one model change away from breaking."
- "Lost-in-the-middle is real. Highest-relevance retrieved chunks go LAST."
- "Prompt cache threshold is 1024 tokens on Anthropic — keep the prefix above it."
- "Count tokens with the provider SDK, not approximations."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the buffer with section regions. Label: system, examples, context, user, response (reserved), safety headroom. Mark the 80% line.

Pass: you got all six regions and the 80% line.

**Level 2 — Explain it out loud.**
Without notes, under 90 seconds: "How do you manage the context window in production?" Checkpoints:
- Did you mention `budget.json` (or equivalent)?
- Did you name the 80% rule?
- Did you mention lost-in-the-middle?

If you skipped any: you described "count tokens," not the discipline.

**Level 3 — Apply to a new scenario.**
A teammate's RAG chain returns 18 chunks from retrieval. They concat all 18 into the context section. Test calls fit; production calls sometimes overflow. Walk through the diagnosis and fix.

Expected: the chain has no per-section cap on chunks. Fix: sort by relevance, fill into a 6000-token cap (or whatever the chain's budget allows), and place highest-relevance LAST for lost-in-the-middle mitigation. Reference: this file's Move 2 "Enforcing the budget at assembly."

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is "30-minute setup per chain for the budget file." If you were starting a new project today with one chain (a simple classifier with 300-token total), would you still write a budget file?

There's no right answer. Defend with reference to the breakpoint in Sub-block 3 — under what conditions is the file paperwork with no payoff?

**Quick check — code reference test.**
Without opening files, answer:
- What's Anthropic's cache threshold?
- What's the rule of thumb for English text tokens per character?
- Where does lost-in-the-middle hit hardest?

Pass: 1024 tokens; ~1 token per 4 characters; the middle of a long prompt.

---
