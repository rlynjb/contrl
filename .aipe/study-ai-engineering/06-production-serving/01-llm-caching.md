# LLM caching

**Industry name(s):** Prompt caching, prefix caching, semantic caching, response caching
**Type:** Industry standard

> Provider-side caching of the constant prefix of a prompt across calls saves 90% of input-token cost on repeated prefixes. Plus client-side semantic caching for repeated *queries* (different prompts, same intent). Two distinct mechanisms, different jobs. For contrl's low LLM volume, prefix caching helps modestly; semantic caching doesn't apply. Concept becomes load-bearing as LLM volume scales.

**See also:** → [02-llm-cost-optimization](./02-llm-cost-optimization.md) · → prompt-engineering [01-anatomy](../../study-prompt-engineering/01-anatomy.md) · → [01-llm-foundations/06-token-economics](../01-llm-foundations/06-token-economics.md)

---

## Why care

**Move 1.** Your coaching agent's system prompt is 600 tokens. Five tool definitions add another 800 tokens. Per call, the agent processes ~1400 tokens of prefix that is *identical* across calls. The model's API treats every call's input from scratch — full input-token cost on every byte. At 1000 calls/day on Sonnet 4, you're paying $1.40/day = $42/month just for prefix tokens that haven't changed.

**Move 2.** That "the prefix doesn't change between calls — does the provider know that?" question is what prompt caching answers. Not the prompt's content. Not the model's response. Just: can the provider recognize identical prefixes and price them differently? With Anthropic's prompt caching, yes — explicitly, with `cache_control: { type: 'ephemeral' }`. Cached prefixes price at ~10% of normal rate. At 1000 calls/day with 1400 cached prefix tokens, monthly cost drops from $42 to $4.20.

**Why you need to answer that question at all:** Two failures hide in caching-unaware prompt design. First, **invisible cost** — providers DO charge for the prefix on every call by default; the cache isn't automatic, it requires opt-in (Anthropic) or specific prompt design (OpenAI's implicit caching). Second, **cache-busting interpolation** — if any per-call variable (timestamp, user ID, request ID) sneaks into the prefix, the cache invalidates on every call, even with caching enabled.

**Before / after.**

Without caching awareness:
- Prefix has a `${userId}` interpolation. Cache never hits (key changes per call).
- Bill: 1.4K tokens × $3/1M × 1000 calls = $4.20/day = $126/month on prefix alone.

With caching + clean prefix:
- Prefix has no per-call variables. Cache hits after the first call within the 5-min window.
- Bill: ~$13/month on prefix (90% cache discount on most calls).

**Move 5.** Prompt caching is what HTTP `Cache-Control: max-age` headers are for static asset CDNs — the constant part is served from cache; the variable part is computed fresh.

---

## How it works

### Move 1 — The mental model

Think of an HTTP response with `Cache-Control: max-age=300, public`. The CDN serves the cached version to subsequent requests for the same URL until the cache expires. Anthropic's prompt cache works similarly: the constant *prefix* of a prompt is hashed and stored; subsequent calls with the same prefix bytes hit the cache and price at ~10% of normal rate. The cache TTL is ~5 minutes from last hit on Anthropic.

Strategy in plain English: **keep the prefix byte-identical across calls. Mark it as cacheable with `cache_control`. Don't interpolate per-call variables into the prefix.**

```
  Prompt caching (the HTTP cache analogy)
  
  ┌─────────────────────────────────────────────────────────────────┐
  │ system + tool definitions  ← marked cacheable                   │
  │   (cached: bytes identical across calls)                         │
  ├─────────────────────────────────────────────────────────────────┤
  │ user message + per-call data ← NOT cached, priced normally       │
  └─────────────────────────────────────────────────────────────────┘
  
  First call:    full price on entire prompt
  Calls 2-N (within 5 min): cache hit on prefix → ~10% of normal rate
```

---

### Move 2 — The layered walkthrough

#### Anthropic prompt caching (explicit)

Anthropic's API supports explicit cache control:

```ts
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  system: [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' }  // ← mark cacheable
    }
  ],
  tools: tools,  // tools can also be cached
  messages: [{ role: 'user', content: userInput }],
});
```

Cache requires:
- **Minimum prefix size**: 1024 tokens. Shorter prefixes don't engage caching.
- **Identical bytes**: any byte difference between calls invalidates the cache.
- **TTL**: 5 minutes from last hit. Idle past 5 min → next call is a miss.

Response headers include cache hit/miss info:
```
x-anthropic-prompt-cache-creation-input-tokens: 1400   ← first call (creating)
x-anthropic-prompt-cache-read-input-tokens: 1400        ← subsequent (hitting)
```

```
  Pricing comparison (Sonnet 4, mid-2026)
  
  ┌──────────────────────┬──────────────────┬────────────────────┐
  │ Token type           │ Price (per 1M)   │ Relative           │
  ├──────────────────────┼──────────────────┼────────────────────┤
  │ Input (uncached)     │ $3.00            │ 1.0×               │
  │ Input (cache write)  │ $3.75            │ 1.25× (one-time)    │
  │ Input (cache hit)    │ $0.30            │ 0.10× (savings)     │
  │ Output               │ $15.00           │ unchanged           │
  └──────────────────────┴──────────────────┴────────────────────┘
  
  Net savings on cached prefix at high hit rate: ~90% of input cost.
```

---

#### OpenAI prompt caching (implicit)

OpenAI caches prefixes automatically — no explicit API control. The cache is triggered when consecutive calls share an identical prefix above a threshold (~1024 tokens, similar to Anthropic). Pricing: discount on the cached portion, no explicit visibility in response headers (though the cost reduction is real).

Tradeoff: OpenAI's implicit approach has no developer control (can't force caching or tune TTL). Anthropic's explicit approach trades a tiny bit of code complexity (one extra field) for clarity and control.

---

#### Cache-busting bugs

Most common bugs that invalidate prefix caching:

**1. Per-call timestamps in the prefix.**
```ts
// BAD: cache-busting
const systemPrompt = `Today is ${new Date().toISOString()}. You are a coaching assistant...`;

// GOOD: timestamp goes in the user message or as a tool output
const systemPrompt = `You are a coaching assistant...`;
const userMessage = `${user_input}\n[context: workout completed at ${timestamp}]`;
```

**2. User ID / session ID in the system prompt.**
```ts
// BAD
const systemPrompt = `You are coaching for user ${userId}...`;

// GOOD
const systemPrompt = `You are a coaching assistant. The user's identifier is provided in the message.`;
```

**3. Whitespace differences.**
A `\n` vs `\r\n` line ending, an extra trailing space — any byte difference busts the cache. Normalize prompt assembly.

**4. Tool definitions changing per call.**
If you build tool defs dynamically (different tools per user), the tool array changes between calls and caching breaks. Either use a fixed tool set across users, or accept the cache loss for the variable-tools chain.

```
  Cache-bust diagnostic
  
  ┌─────────────────────────────────────────────────────────────────┐
  │ If cache hit rate is < 50% on a chain with stable structure:    │
  │   1. Check for per-call interpolations in system prompt          │
  │   2. Check for per-call interpolations in tool definitions      │
  │   3. Check for whitespace/encoding differences across calls     │
  │   4. Verify prefix is > 1024 tokens (below threshold = no cache)│
  └─────────────────────────────────────────────────────────────────┘
```

---

#### Semantic caching (different mechanism)

Distinct from prefix caching: semantic caching caches *responses* keyed by query similarity. Two different prompts that mean the same thing hit the same cached response.

```
  Prefix cache vs semantic cache
  
  ┌──────────────────────────────────┬──────────────────────────────┐
  │ Prefix cache                     │ Semantic cache               │
  ├──────────────────────────────────┼──────────────────────────────┤
  │ Same byte-identical prefix       │ Similar query (embedding)    │
  │ Provider-side (Anthropic/OpenAI) │ Client-side (your code)      │
  │ Saves input tokens               │ Skips the call entirely      │
  │ Works on any call                │ Only for cacheable answers   │
  │ Tiny code change                 │ Embedding store + lookup     │
  └──────────────────────────────────┴──────────────────────────────┘
```

Semantic caching applies when:
- Queries repeat with paraphrase variation ("what's pushup form?" / "tell me about pushup form" / "pushup tips").
- The cached answer is generic enough to apply across similar queries.
- Latency or cost makes skipping the call worthwhile.

For contrl's coaching agent, semantic caching doesn't apply — each coaching message is unique to the session's data, even when phrased similarly. Per-call output is required.

---

### Move 3 — The principle

Caching turns repeated work into one-time work. The LLM-specific application: the constant prefix of a prompt processes the same bytes every call; the provider can hash + skip. The discipline is keeping the prefix byte-identical (no per-call interpolations) and marking it cacheable. Semantic caching is the next layer up — caching *responses* by query similarity — useful for some use cases, not others.

---

## LLM caching — diagram

```
┌─ Anthropic prompt cache (server-side, opt-in) ───────────────────────────────┐
│                                                                              │
│   Call 1:                                                                    │
│     ┌────────────────────────────────────────┐                               │
│     │ system + tools (cacheable, ~1400 tokens)│  ← cache-write priced 1.25×  │
│     ├────────────────────────────────────────┤                               │
│     │ user message + per-call data            │  ← normal price              │
│     └────────────────────────────────────────┘                               │
│                                                                              │
│   Calls 2-N (within 5 min, byte-identical prefix):                           │
│     ┌────────────────────────────────────────┐                               │
│     │ system + tools  ← cache hit (0.10× price)│                              │
│     ├────────────────────────────────────────┤                               │
│     │ user message + per-call data            │  ← normal price              │
│     └────────────────────────────────────────┘                               │
│                                                                              │
│   Cost shape: first call ~1.25× normal; calls 2-N ~10% on prefix tokens      │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ Semantic cache (client-side, optional second layer) ────────────────────────┐
│                                                                              │
│   Query embedding ──→ vector store lookup                                    │
│        │                       │                                             │
│        │                       ▼                                             │
│        │              cache hit (similarity > 0.95)?                         │
│        │                       │                                             │
│        │           ┌───────────┴───────────┐                                 │
│        │           ▼                       ▼                                 │
│        │      return cached         skip cache → make LLM call               │
│        ▼                                   │                                 │
│   (only used for paraphrase                │                                 │
│    queries with cacheable answers)         ▼                                 │
│                                      store new (query, response) pair        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl's planned coaching agent will benefit modestly.**

contrl runs the coaching agent at ~1-2 calls per user per day. Cache TTL is 5 minutes — most calls won't be within the TTL window of a prior call (a single user logs one workout per day; multiple users have different prompts).

Realistic prefix-cache hit rate for contrl: low (~10-20%, mostly from rapid-fire testing or quick-succession workouts).

That said, marking the prefix cacheable costs nothing — one extra field in the API call. The marginal cost when the cache misses is the 1.25× cache-write premium on the first call; subsequent calls within 5 min get the 90% discount. At low volume, this matters less; at higher LLM volume (if contrl adds in-app chat with the agent), it would become a primary cost lever.

Semantic caching doesn't apply — coaching is per-session-unique.

**Planned implementation paths:**
- `src/lib/agent/runner.ts` — set `cache_control: { type: 'ephemeral' }` on the system + tools array. Trivial change. No reason not to.

---

## Elaborate

**Where this pattern comes from.** HTTP caching has been around since the 1990s. Prefix caching for LLMs emerged with OpenAI's implicit caching (early 2024) and Anthropic's explicit `cache_control` (mid 2024). By 2026, prefix caching is standard practice for any production LLM system with stable prompts. Semantic caching is older (vector search applied to query results) and applies to a narrower set of use cases.

**The deeper principle.** Don't recompute what doesn't change. The structural constant prefix of a prompt is a known-immutable chunk; provider-side caching exploits that. The discipline is keeping the chunk genuinely immutable (no per-call interpolations) and signaling to the provider that it can be cached.

**Where this breaks down.** Three places.

1. **Prefix doesn't reach 1024 tokens.** Below the threshold, caching doesn't engage. Either grow the prefix (more few-shot examples, fuller system prompt) until it crosses the threshold, or accept the lost optimization.
2. **Calls are sparse.** If consecutive calls are >5 minutes apart, the cache expires between them. Mostly a problem for low-volume per-user chains.
3. **Variable tools or variable system prompts per user.** If you customize per user, caching breaks. Either consolidate (one prompt for everyone) or accept the loss.

**What to explore next.**
- [02-llm-cost-optimization](./02-llm-cost-optimization.md) — caching is one of several cost levers.
- prompt-engineering [01-anatomy](../../study-prompt-engineering/01-anatomy.md) — the four-section structure is designed to maximize cacheable prefix.
- [01-llm-foundations/06-token-economics](../01-llm-foundations/06-token-economics.md) — broader cost framing.

---

## Tradeoffs

| Cost dimension | Prompt caching ON | No caching |
|---|---|---|
| Setup cost | One `cache_control` field | Zero |
| First-call cost | 1.25× normal | 1.0× normal |
| Subsequent-call prefix cost | 0.10× normal | 1.0× normal |
| Net savings at high hit rate | ~90% on prefix tokens | None |
| Engineering complexity | Trivial | Trivial |
| Cache-bust risk | Real (if prefix has per-call variables) | N/A |

### Sub-block 1 — what we gave up

Almost nothing. The cost is one extra field in the API call (`cache_control: { type: 'ephemeral' }` on the system + tools). The risk: subtle cache-busting bugs from per-call interpolations. Mitigation: code review for any `${}` in system prompts or tool definitions; observability on cache-hit headers.

### Sub-block 2 — what no caching would have cost

I've shipped chains without prompt caching. At 100K calls/day with a 1400-token cached-eligible prefix: $300+/month in unnecessary prefix cost. The fix is one line; the cost of not fixing it is real money over time. For low-volume chains, it's measured in tens of dollars per month; for high-volume it's hundreds.

### Sub-block 3 — the breakpoint

Caching is the right call until: (a) the prefix is below the 1024-token threshold (caching won't engage); (b) calls are so infrequent that the 5-min TTL is always expired between them; (c) the prefix genuinely needs per-call variables (rare; usually fixable by moving the variable to the user message). For contrl's coaching agent, the cost is one field; do it regardless of expected hit rate.

### Sub-block 4 — what wasn't actually a tradeoff

"Caching is complex to implement." It isn't — for Anthropic it's one field. The complexity is keeping the prefix byte-identical, which is a discipline rather than a one-time implementation.

---

## Tech reference (industry pairing)

### Anthropic prompt caching (explicit)

- **Codebase uses:** Not yet — planned for `src/lib/agent/runner.ts`.
- **Why it's here:** the canonical 2026 prompt-caching mechanism with explicit developer control.
- **Leading today:** Anthropic `cache_control: { type: 'ephemeral' }` — `adoption-leading` for prompt-cache-aware design, 2026.
- **Why it leads:** explicit, observable (response headers), tunable, documented thresholds.
- **Runner-up:** OpenAI implicit caching — automatic but less visible.

### Semantic caching libraries (where applicable)

- **Codebase uses:** Not in contrl — coaching agent has unique outputs per call.
- **Why it's here:** the client-side cache layer for repeated paraphrase queries.
- **Leading today:** GPTCache (open source) and managed offerings — `innovation-leading` for client-side semantic caching, 2026.
- **Why it leads:** integrates with multiple providers; embedding-based similarity; configurable thresholds.
- **Runner-up:** hand-rolled with any vector store (Chroma, Pinecone) + threshold check.

---

## Project exercises

### [B4C.cache] Enable prompt caching for the coaching agent

- **Exercise ID:** `[B4C.cache]` (hypothetical, post-Phase 4)
- **What to build:** In `src/lib/agent/runner.ts`, set `cache_control: { type: 'ephemeral' }` on the system + tools array. Verify cache-hit rate by reading response headers.
- **Why it earns its place:** trivial change, no downside. Saves ~90% of prefix cost when calls cluster within the 5-min TTL.
- **Files to touch:** `src/lib/agent/runner.ts`.
- **Done when:** running the agent twice within 5 min shows cache-hit info in the second response's headers.
- **Estimated effort:** `<1hr`

---

## Summary

LLM caching has two distinct layers. Prefix caching (provider-side) saves ~90% on the input cost of bytes that repeat across calls — engaged via `cache_control: { type: 'ephemeral' }` on Anthropic, implicitly on OpenAI. Requires byte-identical prefix (no per-call interpolations) and minimum prefix size (1024 tokens). Semantic caching (client-side) skips the call entirely for paraphrase-similar queries with cacheable answers. For contrl's coaching agent: enable prefix caching (one-field change); semantic caching doesn't apply.

**Key points:**

- **Prefix caching saves ~90% on input cost** for the constant portion of prompts.
- **Byte-identical requirement.** Per-call interpolations in the prefix bust the cache.
- **Minimum prefix size 1024 tokens** on Anthropic; below that, no caching.
- **5-minute TTL** from last hit on Anthropic.
- **Semantic caching is different.** Caches responses by query similarity; applies to paraphrase queries, not unique outputs.

---

## Interview defense

### What an interviewer is really asking

When asked "how do you optimize LLM cost?", caching is one of the first answers. The shipped answer names prefix caching, the 1024-token threshold, the byte-identical requirement, and the cache-busting bugs to avoid. The unshipped answer says "we use OpenAI's caching" without explaining what triggers it.

### Likely questions

**[mid] What is prompt caching?**

Provider-side caching of the constant prefix of a prompt across calls. Bytes that repeat get hashed and stored; subsequent calls with the same prefix price at ~10% of normal input-token rate. Anthropic exposes it via `cache_control: { type: 'ephemeral' }`; OpenAI does it implicitly. Requires the prefix to be byte-identical and above ~1024 tokens.

---

**[senior] What invalidates the cache?**

Any byte difference. Common bugs: interpolating a timestamp or user ID into the system prompt; whitespace differences in prompt assembly (`\n` vs `\r\n`, trailing spaces); changing tool definitions per call. Mitigation: keep all per-call variables in the user message, not the prefix. Code-review pattern: grep for `${` in prompt-assembly code.

```
  Cache bust diagnostic
  ┌──────────────────────────────────────────────────┐
  │ Symptom: cache-hit rate < 50% on stable chain     │
  │   1. grep prefix for ${} interpolations           │
  │   2. check tool definitions are static            │
  │   3. normalize whitespace in prompt assembly      │
  │   4. verify prefix > 1024 tokens                  │
  └──────────────────────────────────────────────────┘
```

---

**[arch] How does this change at scale?**

Caching becomes load-bearing for cost at high volume. At 100K calls/day with a 1400-token prefix, no caching = $4.20/day on prefix; full caching = $0.42/day. ~$1.1K/month savings. Plus latency: cached calls have lower TTFT (time-to-first-token). At sufficient scale, dedicated prompt-cache architecture (pre-warming caches, tuning prompt structure to maximize prefix length up to model limits) becomes a real optimization domain. For contrl at solo scale, the saving is tiny but the cost of enabling caching is zero.

---

### One-line anchors

- "Prefix caching saves ~90% on input tokens for bytes that repeat."
- "Byte-identical prefix or no cache hit. Watch for `${}` interpolations."
- "1024-token minimum prefix on Anthropic. Below that, no engagement."
- "5-minute TTL on Anthropic cache. Sparse-call chains don't benefit much."
- "Semantic caching is different — caches responses by query similarity."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw a prompt structure showing: cacheable prefix (system + tools), uncacheable suffix (user + per-call data). Label the cache hit/write pricing.

Pass: prefix vs suffix marked; pricing 1.25× write / 0.10× hit / 1.0× normal noted.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "How does prompt caching work?" Checkpoints:
- Did you mention byte-identical requirement?
- Did you mention the 1024-token threshold?
- Did you mention the TTL?

**Level 3 — Apply to a new scenario.**
A teammate's chain has cache-hit rate of 5% despite stable structure. Walk through the diagnosis.

Expected: read response headers to confirm cache-write happening at all. Then grep prompt assembly code for `${}` interpolations in the prefix. Then check tool defs are static. Then verify prefix > 1024 tokens.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is the byte-identical discipline. If you had to ship per-user system prompts (genuinely different content per user), would you give up caching, or restructure to share a prefix?

Defend with reference to call volume per user (low-volume per user = caching wouldn't help anyway).

**Quick check — code reference test.**
Without opening files, answer:
- Where in contrl's planned code would the cache control go?
- What's the minimum prefix size for Anthropic caching?
- What's the cache-hit pricing multiplier?

Pass: `src/lib/agent/runner.ts`; 1024 tokens; 0.10× (10% of normal rate).
