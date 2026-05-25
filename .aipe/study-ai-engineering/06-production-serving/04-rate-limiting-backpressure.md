# Rate limiting and backpressure

**Industry name(s):** Rate limiting, backpressure, queue management, request throttling
**Type:** Industry standard

> Provider APIs enforce request-per-minute and token-per-minute quotas. When client demand exceeds quota, the choices are: queue (delay requests until headroom), shed (drop requests), or throttle upstream (slow request acceptance). Each choice has different user-visible consequences. The discipline is naming which one you've picked and signaling appropriately.

**See also:** → [05-retry-circuit-breaker](./05-retry-circuit-breaker.md) · → [02-llm-cost-optimization](./02-llm-cost-optimization.md) · → [05-evals-and-observability/04-llm-observability](../05-evals-and-observability/04-llm-observability.md)

---

## Why care

**Move 1.** Your app's load spikes — a feature ships, a user goes viral, batch processing fires. Calls to the LLM API queue up. Anthropic's rate limit kicks in (1000 requests/minute for Sonnet 4 at your tier). Requests beyond that get HTTP 429. Without backpressure handling, your app shows users error messages OR queues requests indefinitely OR retries-storm and makes the situation worse. Each pattern is a different bug.

**Move 2.** That "what do we do when demand exceeds capacity" question is what rate limiting and backpressure answer. Not the rate limit itself (that's the provider's gating). Just the client-side response: queue with bounded wait, shed with user-friendly error, throttle ingest at the edge so the rate limit is rarely hit. The decision shapes user experience; the discipline is making it deliberate.

**Why you need to answer that question at all:** Three failures hide in naive rate-limit handling. First, **silent retry storms** — exponential backoff on every 429 still hits the API; combined with thousands of concurrent retries, you make the rate-limit problem worse. Second, **unbounded queues** — queueing every overflowed request creates a backlog that grows during incidents; old requests linger past their relevance. Third, **inconsistent user experience** — some requests get processed, others get error messages, users don't know what to expect.

**Before / after.**

Without backpressure:
- Demand spike. Requests fire concurrently. 200 hit the rate limit. Retries kick in. Total request volume against the limit increases. Cascade.
- User experience: some users see results, others see errors, others see hangs. Indeterminate.

With backpressure:
- Demand spike. Request queue has bounded size (e.g., 50 in-flight max). Incoming requests beyond that get rejected at the edge with a clear "try again in 30s" message. Retries observe `Retry-After` headers and backoff appropriately. Total request volume against the limit stays under the cap.
- User experience: deterministic. Either your request is processed, or you get a clear "we're busy" signal with a retry hint.

**Move 5.** Rate limiting + backpressure is what TCP flow control is for network connections — the receiver tells the sender how much it can accept; the sender slows when the receiver is full. The discipline applies at the LLM-client layer.

---

## How it works

### Move 1 — The mental model

Think of a busy restaurant with a fixed kitchen capacity. Choices when demand exceeds capacity:
- **Queue (with bounded wait):** seat customers, tell them the wait time, refuse new arrivals when the queue is full.
- **Shed:** turn away customers above capacity with "we're full."
- **Throttle ingest:** stop seating once the kitchen has N orders in flight.

Each maps to a different user experience. Restaurants pick based on customer expectations and operational tolerance.

LLM clients pick similarly:

```
  Choices when client demand exceeds LLM provider quota
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ Strategy           │ User experience                              │
  ├──────────────────────────────────────────────────────────────────┤
  │ Queue (bounded)    │ Higher latency; bounded wait; clear status   │
  │ Shed (reject early)│ "We're busy, try later" — explicit refusal   │
  │ Throttle ingest    │ Edge-level slowdown; some users see waits    │
  └──────────────────────────────────────────────────────────────────┘
```

Strategy in plain English: **pick one strategy; signal it clearly; respect `Retry-After` headers; bound the queue.**

---

### Move 2 — The layered walkthrough

#### Reading provider rate-limit headers

Both Anthropic and OpenAI return rate-limit info in response headers:

```
  anthropic-ratelimit-requests-limit:     1000      # per minute
  anthropic-ratelimit-requests-remaining: 847       # current bucket
  anthropic-ratelimit-tokens-limit:       80000     # per minute
  anthropic-ratelimit-tokens-remaining:   62000
  retry-after:                            30        # seconds (only on 429)
```

The client tracks these headers and either:
1. **Approaching limit (e.g., <10% remaining)**: slow down ingest, queue new requests.
2. **At limit (HTTP 429)**: respect `Retry-After`; back off; don't fire concurrent retries.

```
  Reading rate-limit state from headers
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ requests_remaining / requests_limit                                │
  │                                                                    │
  │   > 50%   → normal; full throughput                                │
  │   50-10%  → approaching; consider slowing                          │
  │   < 10%   → throttle ingest at edge                                │
  │   0       → 429; respect Retry-After                              │
  └──────────────────────────────────────────────────────────────────┘
```

---

#### Bounded in-flight queue

Maintain a counter of in-flight LLM calls. Reject new requests at the edge when the counter is at cap.

```ts
// Sketch
const MAX_IN_FLIGHT = 50;  // tuned to stay within rate limit headroom
let inFlight = 0;

async function callLLM(req: Request): Promise<Response> {
  if (inFlight >= MAX_IN_FLIGHT) {
    return { ok: false, status: 503, retry_after: 5 };
  }
  inFlight++;
  try {
    return await actuallyCallLLM(req);
  } finally {
    inFlight--;
  }
}
```

The cap is set below the provider's rate limit with headroom for retries. At 1000 requests/minute provider limit, cap in-flight at ~50 to allow for ~16 RPS with 3-second average latency.

---

#### Respecting Retry-After

When the provider returns 429, the `Retry-After` header specifies the cooldown. Respect it.

```ts
async function callWithBackoff(req: Request): Promise<Response> {
  const result = await actuallyCallLLM(req);
  if (result.status === 429) {
    const wait = parseInt(result.headers['retry-after']) * 1000;
    await sleep(wait);
    return callWithBackoff(req);  // retry once
  }
  return result;
}
```

The discipline: ONE retry with Retry-After wait. Don't retry multiple times — if one retry doesn't succeed, the underlying problem (sustained overload) isn't going to resolve by retrying again immediately.

For sustained demand-vs-capacity mismatches, the answer is at the architecture level (queue, shed, upgrade tier), not at the retry level.

```
  Retry-After discipline
  
  ┌──────────────────────────────────────────────────────────────────┐
  │ Receive 429                                                        │
  │   → wait for Retry-After header value                              │
  │   → retry ONCE                                                     │
  │   → if still 429: surface to caller (don't infinite-retry)         │
  └──────────────────────────────────────────────────────────────────┘
```

---

#### Token-per-minute vs request-per-minute

Both providers enforce two limits: requests per minute AND tokens per minute. A chain with high-token calls (long prompts, long responses) hits the token limit before the request limit.

Track both:
- `tokens_in + tokens_out` consumed per minute.
- `requests` per minute.

The binding constraint is whichever you hit first. For chains with long prompts, monitor `tokens-remaining` more closely than `requests-remaining`.

---

### Move 3 — The principle

Rate limiting + backpressure is flow control applied to LLM clients. The discipline: pick a strategy (queue / shed / throttle ingest), bound the queue, respect provider signals (Retry-After), and signal user experience clearly. Naive retry storms make rate-limit problems worse; bounded queues + edge-level throttling keep total request volume under the cap.

---

## Rate limiting — diagram

```
┌─ Client request volume ──────────────────────────────────────────────────────┐
│                                                                              │
│   Incoming requests / second                                                 │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Edge-level rate gate ───────────────────────────────────────────────────────┐
│                                                                              │
│   in_flight_count >= MAX_IN_FLIGHT?                                          │
│     YES → reject with 503 + retry-after hint                                 │
│     NO  → admit, increment counter                                           │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ admitted requests
                                      ▼
┌─ LLM call ───────────────────────────────────────────────────────────────────┐
│                                                                              │
│   Send to provider                                                           │
│   Read response headers (requests-remaining, tokens-remaining)               │
│   Adjust MAX_IN_FLIGHT based on remaining-percentage                         │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                       200 OK                  429 Too Many
                          │                       │
                          ▼                       ▼
                  decrement counter       respect Retry-After
                                           retry ONCE
                                           on second 429 → surface error
```

---

## In this codebase

**Case B — contrl operates at solo scale.**

contrl's planned coaching agent runs at ~1-2 calls per user per day. Total volume is way below any rate limit. Backpressure is study material — concept becomes relevant if/when contrl adds in-app chat with the agent (multi-turn conversations could push volume), or scales beyond solo use.

**Planned implementation paths (if needed):**
- `src/lib/agent/runner.ts` — basic 429 handling with Retry-After respect
- `src/lib/agent/rate-limiter.ts` (planned only if volume grows) — bounded in-flight queue

For now: a simple try/catch on the LLM call with one retry on 429 is sufficient.

---

## Elaborate

**Where this pattern comes from.** Rate limiting is decades old in web infrastructure. Backpressure is a network-protocol concept (TCP flow control, reactive streams). The LLM-client application crystallized 2023-2025 as production LLM systems hit provider rate limits at scale.

**The deeper principle.** Demand exceeding capacity always requires a choice: queue, shed, or throttle. The principle generalizes — anywhere consumers and producers have different speeds, this question applies. The LLM-specific twist: per-provider limits are tuned (you can request higher tiers); the architectural choice is which strategy fits your user experience.

**Where this breaks down.** Two places.

1. **Truly batch workloads.** A nightly job processing 100K documents doesn't need real-time backpressure — it needs a queue with worker count tuned to the rate limit. Different shape from interactive requests.
2. **Multi-tenant systems with per-user limits.** Per-user rate limiting (e.g., "User X can make 100 calls/day") layers on top of provider limits. Different policy decisions; usually implemented at the edge before provider rate limits matter.

**What to explore next.**
- [05-retry-circuit-breaker](./05-retry-circuit-breaker.md) — when retries are appropriate vs harmful.
- [05-evals-and-observability/04-llm-observability](../05-evals-and-observability/04-llm-observability.md) — observability for tracking rate-limit-related issues.

---

## Tradeoffs

| Cost dimension | Backpressure handling | Naive retry |
|---|---|---|
| Setup cost | Real (queue, counter, header parsing) | Zero |
| User experience under load | Deterministic (queue OR explicit error) | Chaotic |
| Rate-limit thrashing | Avoided | Common |
| Engineering complexity | Higher | Lower |
| Cost in incident-recovery | Low (system self-stabilizes) | High (retries amplify) |

### Sub-block 1 — what we gave up

The work to implement bounded queues, header tracking, and Retry-After respect. For systems that never hit rate limits, this is paid-but-unused infrastructure. For systems that do, it's the difference between graceful degradation and cascade failure.

### Sub-block 2 — what naive retry would cost

Documented pattern: high concurrency + naive exponential backoff on 429 = retry storm. Every retry adds to the rate-limit pressure. The system "settles" only when load drops below the limit organically — could be minutes or hours. Lost user trust during the incident.

### Sub-block 3 — the breakpoint

Backpressure handling is the right call until: (a) you operate well below provider rate limits with bounded peak (<10% of limit during spikes); (b) the system is batch-only with worker count tuned to the limit (different shape, doesn't need real-time backpressure). For contrl at solo scale, simple 429 retry with Retry-After respect is sufficient; full backpressure is study material.

### Sub-block 4 — what wasn't actually a tradeoff

"Bounded queues drop legitimate requests." They do — but the alternative (unbounded queue) accumulates requests past their relevance window. A 30-second-old coaching request that the user already abandoned isn't worth serving. Bounded queues + clear "try again" signals beat unbounded queues with stale responses.

---

## Tech reference (industry pairing)

### Anthropic rate-limit headers

- **Codebase uses:** Planned — `src/lib/agent/runner.ts` will parse these.
- **Why it's here:** the signal source for client-side backpressure decisions.
- **Leading today:** Anthropic + OpenAI standard rate-limit headers — `adoption-leading`, 2026.
- **Why it leads:** standard format across major providers; client libraries handle parsing.
- **Runner-up:** custom queue infrastructure (BullMQ, Sidekiq) for batch workloads.

### `p-queue` / `bottleneck` (client-side rate limiters)

- **Codebase uses:** Not yet.
- **Why it's here:** TypeScript libraries that implement concurrency-bounded queues for outbound calls.
- **Leading today:** `p-queue` — `adoption-leading` for in-process bounded concurrency, 2026.
- **Why it leads:** small, well-tested; supports priority, concurrency caps, rate limits per second.
- **Runner-up:** `bottleneck` — similar features, slightly different API.

---

## Project exercises

### [B4C.rate-limit] Basic 429 handling for the coaching agent

- **Exercise ID:** `[B4C.rate-limit]` (hypothetical, post-Phase 4)
- **What to build:** Wrap the LLM call in retry-on-429 with Retry-After respect. Retry once; surface error to caller on second 429.
- **Why it earns its place:** the minimum sufficient handling for solo-scale operation.
- **Files to touch:** `src/lib/agent/runner.ts`.
- **Done when:** synthetic 429 response triggers one retry with the right wait; second 429 surfaces error.
- **Estimated effort:** `<1hr`

---

## Summary

Rate limiting + backpressure is flow control for LLM clients. Provider rate limits gate per-minute requests and tokens; client-side responses include bounded queues, edge-level throttling, and Retry-After respect. Naive retry storms make rate-limit problems worse. For contrl at solo scale: simple 429 retry is sufficient. Concept becomes load-bearing at higher volume.

**Key points:**

- **Provider rate limits**: requests-per-minute AND tokens-per-minute. Bind on whichever is tighter.
- **Bounded queue or shed.** Don't queue unboundedly — old requests outlive their relevance.
- **Respect Retry-After.** Wait the specified time; retry ONCE; surface error on second 429.
- **Read rate-limit headers proactively.** Slow ingest when approaching limit, not just when hitting it.
- **For contrl: minimal handling sufficient.** Volume is well below limits.

---

## Interview defense

### What an interviewer is really asking

When asked "what do you do when the LLM API rate-limits you?", they want to hear bounded queues + Retry-After + reading rate-limit headers proactively. The unshipped answer is "we retry."

### Likely questions

**[mid] What happens when you hit a rate limit?**

Provider returns 429 with a `Retry-After` header. Wait the specified time, retry once. If still 429, surface error to caller — don't retry forever. Proactively, read `requests-remaining` and `tokens-remaining` headers on every response; when approaching the limit, slow ingest or queue requests at the edge.

```
  429 handling
  ┌──────────────────────────────────────────────────┐
  │ 429 → wait Retry-After seconds → retry once       │
  │ Still 429? → surface error, don't infinite-retry  │
  │ Proactively: track *-remaining headers            │
  └──────────────────────────────────────────────────┘
```

---

**[senior] How do you avoid retry storms?**

Bounded in-flight queue + Retry-After respect + single-retry policy. The bounded queue means concurrent requests don't all hit the API simultaneously. The Retry-After respect means retries observe the cooldown. The single-retry means a stuck-at-429 scenario surfaces to the caller fast rather than amplifying. Plus: edge-level throttling so requests get queued at the edge rather than fired and 429'd.

---

**[arch] How does this change at high volume?**

Provider limit becomes the binding constraint. At 1000 req/min, you operate at ~16 RPS. If demand sustained above that, options: request a higher tier from provider, distribute across multiple keys/orgs, batch where possible, queue with longer waits (and signal them to users), or reduce per-call work (better caching, smaller models for cheap steps). The architectural choice depends on user-experience tolerance for wait vs. error.

---

### One-line anchors

- "Provider limits: requests/min AND tokens/min. Bind on tighter."
- "Bounded queue or shed. Unbounded queue serves stale requests."
- "Retry-After + single retry. No retry storms."
- "Read *-remaining headers proactively. Slow before hitting limit."
- "For solo scale: simple 429 retry is sufficient."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the flow: incoming requests → edge rate gate (in-flight count) → LLM call → response → rate-limit header read → adjust.

Pass: 4-5 steps with the in-flight gate and header-read marked.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "How do you handle LLM rate limits?" Checkpoints:
- Did you mention bounded queue OR explicit shed?
- Did you mention Retry-After respect?
- Did you mention reading headers proactively?

**Level 3 — Apply to a new scenario.**
A teammate's chain hits 429 at peak load. They wrap calls in exponential backoff (1s, 2s, 4s, 8s). Walk through the diagnosis.

Expected: exponential backoff without rate-respect ignores Retry-After; can fire concurrent retries; amplifies the rate-limit pressure. Fix: bounded in-flight queue + single-retry-with-Retry-After + edge-level throttling.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is dropping legitimate requests at the queue cap. If you were running a system where every request was high-value (medical, financial), would you still bound the queue?

Defend with reference to: even high-value requests have a relevance window; stale processing is worse than explicit "we couldn't help"; the architectural alternative is provider tier upgrade.

**Quick check — code reference test.**
Without opening files, answer:
- What's the recommended retry policy on 429?
- What two limits do providers enforce?
- Does contrl need a bounded queue today?

Pass: respect Retry-After, retry ONCE, surface error on second 429; requests-per-minute AND tokens-per-minute; no — operates well below limits at solo scale.
