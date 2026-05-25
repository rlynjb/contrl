# Retry and circuit breaker

**Industry name(s):** Retry policy, exponential backoff with jitter, circuit breaker, half-open state
**Type:** Industry standard

> Three failure types need three responses. Transient errors (network blip, brief 5xx, single 429) get retried with backoff. Sustained errors (consistent 5xx, provider outage) get a circuit breaker that fails fast for a window and probes for recovery. Permanent errors (auth fail, schema fail) get surfaced immediately. The discipline is classifying the error correctly; the bug is treating sustained errors as transient and retrying indefinitely.

**See also:** → [04-rate-limiting-backpressure](./04-rate-limiting-backpressure.md) · → [04-agents-and-tool-use/06-error-recovery](../04-agents-and-tool-use/06-error-recovery.md) · → [05-evals-and-observability/04-llm-observability](../05-evals-and-observability/04-llm-observability.md)

---

## Why care

**Move 1.** Your LLM call returns 500. You retry. Returns 500 again. Retry again. Returns 500. The provider is down — has been for 10 minutes. Your code is hammering the broken endpoint, each retry adding load to the provider's recovery effort while your user waits indefinitely on the spinner. Then the provider comes back; your queued-up retries hit it; your latency stays bad even though the API is healthy because you're now processing a backlog.

**Move 2.** That "what kind of failure is this and what's the right response" question is what retry policies and circuit breakers answer. Not whether to retry. Just: classify the error, pick the response that matches. Transient → retry with backoff. Sustained → circuit-breaker opens; fail fast for a window; periodically probe. Permanent → surface immediately.

**Why you need to answer that question at all:** Three failures hide in retry-everything-equally. First, **retry storms during outages** — when the provider is down, retries don't help and amplify the load on recovery. Second, **wasted time on permanent errors** — auth failures, schema failures, bad-input errors don't get better with retries; retrying delays the error message that would have told you to fix the input. Third, **user-perceived latency** — sustained failures cause users to wait through multiple retry attempts when they should see "service is down, try again later" immediately.

**Before / after.**

Without classification:
- Every error retried 3 times with exponential backoff.
- During provider outage: 30+ seconds of waiting per request before surfacing the error.
- During permanent error (bad API key): same 30 seconds wasted on retries that won't help.

With classification:
- Transient (network blip, single 429): retry once with backoff, succeed.
- Sustained (5 consecutive 5xx, breaker opens): fail fast for 60s, periodic probe.
- Permanent (401 auth, 400 schema): surface immediately, no retry.
- User experience: deterministic. Either quick success, quick retry success, or quick "service unavailable" — never the slow-spinning-then-failing path.

**Move 5.** Retry + circuit breaker is what TCP retransmission with congestion control is for network packets — retry when it makes sense, back off when the path is congested, give up when the destination is unreachable.

---

## How it works

### Move 1 — The mental model

Three error classes; three responses:

```
  Error classification → response

  ┌──────────────────────────────────────────────────────────────────┐
  │ Class       │ Examples                  │ Response                 │
  ├──────────────────────────────────────────────────────────────────┤
  │ Transient   │ Network timeout, 503,     │ Retry with backoff       │
  │             │ single 429                │ (max ~3 attempts)         │
  │ Sustained   │ 5+ consecutive 5xx,       │ Circuit breaker opens;    │
  │             │ provider outage            │ fail fast 30-60s          │
  │ Permanent   │ 401, 403, 400 schema      │ Surface immediately,      │
  │             │ fail, invalid model       │ no retry                  │
  └──────────────────────────────────────────────────────────────────┘
```

Strategy in plain English: **classify before retrying. Transient → backoff retry. Sustained → circuit breaker (fail fast). Permanent → surface error immediately.**

---

### Move 2 — The layered walkthrough

#### Retry with exponential backoff + jitter

For transient errors, retry with increasing delay and randomization (jitter prevents synchronized retry storms across clients).

```ts
async function callWithRetry(req: Request, maxAttempts = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await actuallyCallLLM(req);
      if (result.status >= 200 && result.status < 300) return result;
      
      if (isPermanent(result)) {
        throw new PermanentError(result.status);
      }
      
      if (attempt === maxAttempts) {
        throw new TransientError(result.status);
      }
      
      // exponential backoff with jitter
      const baseDelay = 1000 * Math.pow(2, attempt - 1);  // 1s, 2s, 4s
      const jitter = Math.random() * 500;
      await sleep(baseDelay + jitter);
    } catch (err) {
      if (err instanceof PermanentError) throw err;
      if (attempt === maxAttempts) throw err;
    }
  }
}

function isPermanent(result: Response): boolean {
  return [400, 401, 403].includes(result.status);
}
```

The constants:
- **Max attempts: 3.** More than 3 wastes time on sustained failures (which the circuit breaker should catch).
- **Base delay: 1s, doubling.** Cap at 8s for any single backoff.
- **Jitter: ±500ms random.** Prevents synchronized retries across N clients hitting the same endpoint.

```
  Exponential backoff + jitter
  
  Attempt 1: 1000ms ± 500ms
  Attempt 2: 2000ms ± 500ms
  Attempt 3: 4000ms ± 500ms
  
  Total worst-case wait before surfacing: ~7s
```

---

#### Circuit breaker

For sustained errors (rolling failure rate above threshold), open the circuit: subsequent calls fail fast without hitting the API. Periodically probe with a single call to detect recovery; close the circuit when probes succeed.

```
  Circuit breaker states
  
  ┌───────────────────────────────────────────────────────────────────┐
  │   CLOSED (normal)                                                  │
  │     ↓ failure rate exceeds threshold (e.g., 5 errors in 30s)      │
  │   OPEN                                                             │
  │     ↓ wait 60s                                                     │
  │   HALF-OPEN (probe)                                                │
  │     ↓ probe succeeds → CLOSED                                      │
  │     ↓ probe fails → OPEN (reset timer)                             │
  └───────────────────────────────────────────────────────────────────┘
```

Sketch:

```ts
class CircuitBreaker {
  private failureCount = 0;
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private openedAt = 0;
  
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt > 60_000) {
        this.state = 'half_open';
      } else {
        throw new CircuitOpenError();  // fail fast
      }
    }
    
    try {
      const result = await fn();
      if (this.state === 'half_open') {
        this.state = 'closed';
        this.failureCount = 0;
      }
      return result;
    } catch (err) {
      this.failureCount++;
      if (this.failureCount >= 5) {
        this.state = 'open';
        this.openedAt = Date.now();
      }
      throw err;
    }
  }
}
```

The constants are tuneable. Common defaults:
- **Failure threshold**: 5 errors in a 30-second window.
- **Open duration**: 60 seconds before half-open probe.
- **Half-open success**: 1 successful probe closes; 1 failure re-opens.

---

#### Permanent error detection

Some HTTP status codes are permanent — retrying won't fix them. Surface immediately.

```
  Permanent (no retry):
    400 Bad Request          — schema fail or invalid input
    401 Unauthorized         — bad API key
    403 Forbidden            — auth scope issue
    404 Not Found            — wrong endpoint
    422 Unprocessable        — request validation failed

  Retry-eligible:
    408 Request Timeout      — transient network
    429 Too Many Requests    — rate limit; respect Retry-After
    500 Internal Server      — possibly transient
    502 Bad Gateway          — transient
    503 Service Unavailable  — transient
    504 Gateway Timeout      — transient

  Provider-specific:
    OpenAI: 503 often = capacity; retry with backoff.
    Anthropic: 529 (overloaded) → retry with backoff.
```

The discipline: when you see a permanent error, log it with context and surface to the caller. Don't waste 7+ seconds on retries that can't help.

---

#### Idempotency and retries

Retries assume the call is safe to repeat. For pure-read LLM calls (no side effects), this is true. For LLM-driven actions (tool calls that write data, send emails), retries can produce duplicate side effects.

If your agent calls a `send_email` tool that's retryable, you need idempotency keys at the tool layer — the second send detects the first and is a no-op.

For contrl's coaching agent: all tools are read-only, so retry is always safe.

---

### Move 3 — The principle

Retry + circuit breaker is failure-mode-aware error handling. The discipline: classify the error, respond accordingly. Transient → backoff retry. Sustained → fail fast via circuit breaker. Permanent → surface immediately. Naive retry-everything wastes time on permanent failures and amplifies sustained failures. Failure classification is the load-bearing decision.

---

## Retry + circuit breaker — diagram

```
┌─ Request ────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   LLM call                                                                   │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Circuit breaker check ──────────────────────────────────────────────────────┐
│                                                                              │
│   state == 'open' && open_duration < 60s ?                                   │
│     YES → fail fast (circuit open)                                           │
│     NO  → proceed                                                            │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Call provider ──────────────────────────────────────────────────────────────┐
│                                                                              │
│   try {                                                                      │
│     result = await call(...)                                                 │
│   } catch (err) {                                                            │
│     classify(err) → permanent | transient                                    │
│   }                                                                          │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                       ▼                       ▼
        200 success            transient error          permanent error
              │                       │                       │
              ▼                       ▼                       ▼
        return result          retry with backoff       surface immediately
        reset circuit breaker  (max 3 attempts)         circuit breaker
                                       │                untouched
                                       ▼
                              still failing after 3?
                                       │
                                       ▼
                              circuit breaker counter++
                                       │
                                       ▼
                              counter >= 5? → open circuit
```

---

## In this codebase

**Case B — contrl's coaching agent will need basic retry handling.**

Minimal viable for contrl at solo scale:
- Retry once on 5xx with 1-second backoff.
- Surface 4xx errors immediately (likely auth/schema bugs, not provider issues).
- No circuit breaker needed at solo scale — provider outages are rare and one-user impact is bounded.

**Planned implementation paths:**
- `src/lib/agent/runner.ts` — basic retry-once-with-classification wrapper around the Anthropic SDK call
- Circuit breaker: deferred until volume justifies it (multi-user scale)

The Anthropic SDK has some built-in retry handling; verify default behavior matches the discipline (typically does — retries on 5xx, respects Retry-After).

---

## Elaborate

**Where this pattern comes from.** Retry + circuit breaker patterns are decades old in distributed systems (Hystrix, Polly, resilience4j). The LLM-client application is a straightforward port — same shape, same failure modes.

**The deeper principle.** Failure classification + appropriate response is general distributed-systems wisdom. The principle: not all failures are the same; not all warrant the same response. Treating every failure as "retry it" is the symmetric error to "never retry" — both ignore the structure of the failure.

**Where this breaks down.** Two places.

1. **Non-idempotent operations.** Retries can cause duplicate side effects. Need idempotency keys at the operation layer.
2. **Long-tail latency vs hard failures.** Sometimes the provider is slow but eventually returns success. Retries with backoff can compound the latency. Use total-deadline tracking — if the operation has been outstanding > N seconds (including retries), give up regardless of class.

**What to explore next.**
- [04-rate-limiting-backpressure](./04-rate-limiting-backpressure.md) — 429 handling specifically.
- [04-agents-and-tool-use/06-error-recovery](../04-agents-and-tool-use/06-error-recovery.md) — agent-loop-internal error recovery (one of the tool calls failed).
- Hystrix / Polly / resilience4j docs — the established distributed-systems references.

---

## Tradeoffs

| Cost dimension | Classified retry + breaker | Retry everything |
|---|---|---|
| Setup cost | Real (classifier + breaker state) | Lower (just retry) |
| Time wasted on permanent errors | None (surface immediately) | High (7+ seconds retrying 401) |
| Behavior during provider outage | Fail fast after threshold | Hammer the recovering provider |
| User-perceived latency under failure | Deterministic | Variable (spinner-then-error) |
| Code complexity | Higher | Lower |

### Sub-block 1 — what we gave up

Setup work. Error classifier (which status codes are permanent vs transient), circuit-breaker state machine, retry-with-jitter implementation. For a single chain, that's a day's work; reused across chains, the cost amortizes.

### Sub-block 2 — what naive retry would cost

Documented: 401 with 3 retries = 7s of wasted time per request when the API key is wrong. Provider outage with naive retry = retry storm against the recovering API. Sustained 5xx with no circuit breaker = users see slow loading throughout the outage rather than quick "service unavailable" + retry hint.

### Sub-block 3 — the breakpoint

Classified retry + circuit breaker is the right call until: (a) you operate at solo scale with low volume and outages are rare AND tolerable (a side project where occasional spinner-then-fail is acceptable); (b) you're using a managed LLM SDK that handles this internally (verify it does what you'd want). For contrl at solo scale, the Anthropic SDK's default behavior is sufficient.

### Sub-block 4 — what wasn't actually a tradeoff

"Retries hide bugs." They don't if you log every retry. The audit trail tells you when retries are masking sustained issues; circuit-breaker opens make outages visible. Retry visibility is the discipline; retry silence is the bug.

---

## Tech reference (industry pairing)

### Anthropic SDK retry handling (built-in)

- **Codebase uses:** Planned — leverage SDK defaults.
- **Why it's here:** the official client library has retry-on-5xx + Retry-After respect built in.
- **Leading today:** `@anthropic-ai/sdk` defaults — `adoption-leading` for Anthropic-target apps, 2026.
- **Why it leads:** maintained by Anthropic; defaults match their recommendations; configurable.
- **Runner-up:** Manual implementation if SDK defaults don't fit; or framework-level retry (Vercel AI SDK).

### `opossum` / `cockatiel` (circuit-breaker libraries)

- **Codebase uses:** Not yet — over-engineered for contrl's solo scale.
- **Why it's here:** TypeScript circuit-breaker implementations for Node.
- **Leading today:** `opossum` — `adoption-leading` for Node.js circuit breakers, 2026.
- **Why it leads:** mature, well-tested, similar API to Java Hystrix; supports half-open state.
- **Runner-up:** `cockatiel` (Microsoft) — modern TypeScript-first; also good.

---

## Project exercises

### [B4C.retry] Basic retry classification for the coaching agent

- **Exercise ID:** `[B4C.retry]` (hypothetical, post-Phase 4)
- **What to build:** Wrap the Anthropic SDK call (which has retry-on-5xx built in) with explicit handling for: 401/403 → surface immediately, 400 → log with context and surface, network errors → respect SDK's default retry, schema-fail → no retry, surface with the parse error.
- **Why it earns its place:** the minimum sufficient handling for solo-scale operation.
- **Files to touch:** `src/lib/agent/runner.ts`.
- **Done when:** synthetic 401 surfaces immediately; synthetic 503 retries via SDK default; synthetic schema-fail surfaces with parse error.
- **Estimated effort:** `<1hr`

---

## Summary

Retry + circuit breaker is failure-mode-aware error handling. Three classes (transient / sustained / permanent), three responses (backoff retry / fail-fast / surface immediately). Retry storms during sustained failures are the main bug; classification + circuit breaker prevent them. For contrl at solo scale: SDK defaults + explicit permanent-error handling is sufficient. Circuit breaker is study material for higher volume.

**Key points:**

- **Three failure classes:** transient (retry), sustained (circuit breaker), permanent (surface).
- **Exponential backoff + jitter** for transient retries. Cap at 3 attempts.
- **Circuit breaker** for sustained failures: fail fast for 30-60s, then probe.
- **Permanent errors (4xx)** surface immediately — no retry.
- **Idempotency matters** when retries can produce duplicate side effects.

---

## Interview defense

### What an interviewer is really asking

When asked "how do you handle LLM API failures?", they want to hear classification — different errors warrant different responses. The shipped answer names all three classes. The unshipped answer says "we retry."

### Likely questions

**[mid] What's the difference between transient, sustained, and permanent errors?**

Transient: network blip, single 5xx, one-off 429. Retry with backoff (max ~3 attempts). Sustained: consistent 5xx across many calls — provider outage. Circuit breaker opens, fail fast for 30-60s, then probe. Permanent: 401 auth fail, 400 schema fail — retrying won't help. Surface immediately. The discipline is classifying before retrying.

```
  Classification → response
  
  ┌─────────────┬──────────────────────────┐
  │ Transient   │ Backoff retry (3 max)     │
  │ Sustained   │ Circuit breaker (fail fast)│
  │ Permanent   │ Surface immediately       │
  └─────────────┴──────────────────────────┘
```

---

**[senior] Why include a circuit breaker if you already have retry?**

Retry handles transient failures. Circuit breaker handles sustained failures. Without it, during a provider outage, your retries hammer the recovering API and your users wait through long retry-then-fail sequences. The circuit breaker says "we've seen 5+ failures in 30s — fail fast for the next 60s, then probe once." Faster user feedback during outages; less load on a recovering provider.

```
  Without breaker (provider outage)
  every request: retry x3 = 7s wait, then fail
  Total user-visible latency: 7s per request
  Total load on provider: full retry stream
  
  With breaker (provider outage)
  first 5 requests: retry x3, fail
  Breaker opens.
  Next 60s: all requests fail-fast (instant)
  After 60s: probe; if still failing, stay open
```

---

**[arch] How do you balance retry duration vs user-perceived latency?**

Total deadline. Each operation has a max time it can spend (including all retries). Common pattern: 30-second deadline for an interactive call, 5-minute for a batch operation. If the deadline is approaching with no success, give up regardless of class. Plus jitter — random delay added to backoff prevents synchronized retries across clients amplifying provider load.

---

### One-line anchors

- "Three classes: transient, sustained, permanent. Three responses."
- "Exponential backoff + jitter. Cap at 3 retries."
- "Circuit breaker: 5+ failures in 30s → open for 60s → probe."
- "Permanent errors (4xx) surface immediately. No retry."
- "Idempotency for tools with side effects. Retries can duplicate."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the request flow: incoming → circuit breaker check → call → classify error → response (retry / fail-fast / surface).

Pass: 5 steps in order; classifier branch labeled.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "How do you handle LLM API failures?" Checkpoints:
- Did you name three classes?
- Did you mention exponential backoff + jitter?
- Did you mention circuit breaker for sustained failures?

**Level 3 — Apply to a new scenario.**
A teammate's chain hits 401 in production. Their wrapper retries 3 times with backoff. Each retry takes ~2s. Users see 7s of spinning before "error." Walk through the fix.

Expected: classify 401 as permanent (auth/permissions issue, not transient). Surface immediately with "auth error — check API key." 7s → ~50ms. Plus alert ops because 401 indicates a configuration bug, not a flaky network.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is engineering effort. If you were starting a small project with 100 LLM calls per day, would you still implement circuit breaker?

Defend with reference to: at low volume, the SDK's built-in retry plus permanent-error handling is sufficient; circuit breaker earns its place at higher volume where outages would otherwise affect many users.

**Quick check — code reference test.**
Without opening files, answer:
- Which 4xx codes are permanent?
- What's the typical circuit-breaker open duration?
- Does contrl need a full circuit breaker today?

Pass: 400, 401, 403, 404, 422; 30-60 seconds; no — SDK defaults + permanent-error handling sufficient at solo scale.
