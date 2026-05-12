# Rate limiting and backoff

**Industry name(s):** Client-side rate limiting, exponential backoff, retry with jitter, Retry-After honoring
**Type:** Industry standard

> Every Notion HTTP call passes through `notionFetch`. A module-level `rateLimit()` enforces 350ms minimum between requests. 429 responses honor `Retry-After` and re-fetch. 5xx responses retry up to 3 times with `(n+1)*2000ms` backoff. Other 4xx errors throw.

**See also:** → [03-bidirectional-sync](./03-bidirectional-sync.md) · → [01-local-first-architecture](./01-local-first-architecture.md)

---

## Why care

You hit a third-party API in a tight loop and you get a `429 Too Many Requests`. The polite version of your code waits, retries, eventually succeeds. The rude version retries instantly, gets `429` again, escalates to a temporary IP ban, and your app stops working for everyone. The difference is one function: a thing that enforces "slow down" before each request and a thing that listens to the server's "wait this long" header on every failure.

The pattern is **client-side rate limiting + bounded retry**. It's the same shape used by every Stripe SDK, every Postgres driver pool, every Cloudflare Workers integration. The hard part isn't writing it — it's making sure *every* outgoing call goes through it, with no escape hatch. Here's how that's enforced in this codebase.

---

## How it works

Picture a turnstile in front of an API. Nobody gets through faster than the turnstile allows, and if the API on the other side says "go away for 30 seconds", everyone in line waits 30 seconds. The turnstile is one function; the queue is implicit (just the order of `await` calls).

The strategy: **one shared throttle, one shared retry policy, one fetch wrapper that everything goes through**.

### The throttle

```typescript
const RATE_LIMIT_DELAY = 350;
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY - elapsed));
  }
  lastRequestTime = Date.now();
}
```

`src/services/notion/api.ts` L7–L16. Two module-level variables: a constant (`RATE_LIMIT_DELAY = 350`) and a mutable timestamp (`lastRequestTime`). Every call to `rateLimit()`:
1. Measures how long since the last request.
2. If under 350ms, sleeps for the remainder.
3. Updates `lastRequestTime` to "now" — *not* "now + 350ms".

If you're coming from frontend, this is like a debounce except for the trailing side: instead of dropping calls that come too fast, we delay them. The shape is "throttle with serialization" — every caller awaits the same shared clock.

The practical consequence: three rapid `await notionFetch(...)` calls produce three requests spaced 350ms apart, not three simultaneous requests. The throttling is *sequential*, not bucketed — there's no token bucket, just a minimum spacing.

### Why 350ms specifically?

Notion's published rate limit is 3 requests per second (333ms per request). We use 350ms as a safety margin — high enough to leave headroom for clock drift and request latency, low enough that a sync of 100 sessions still completes in ~35 seconds rather than minutes.

### The retry policy

```typescript
if (res.status === 429) {
  const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10);
  await new Promise(r => setTimeout(r, retryAfter * 1000));
  return notionFetch(token, endpoint, { ...options, _retries: retries + 1 });
}

if (res.status >= 500 && retries < 3) {
  const delay = (retries + 1) * 2000;
  console.warn(`[contrl] Notion ${res.status}, retrying in ${delay}ms (attempt ${retries + 1}/3)`);
  await new Promise(r => setTimeout(r, delay));
  return notionFetch(token, endpoint, { ...options, _retries: retries + 1 });
}
```

`api.ts` L36–L50. Two distinct retry paths:

**429 — Rate limited.** The server explicitly tells us how long to wait via the `Retry-After` header (defaults to 1 second if missing). Recursive call to `notionFetch` with `_retries + 1`. No upper bound on 429 retries — we keep going until we get a non-429 response. This is correct: if the server keeps saying "wait", we keep waiting.

**5xx — Server error.** Bounded retry: 3 attempts max, with linear backoff (2s, 4s, 6s). On the 4th 5xx in a row, we let the error throw up to `syncAll`'s outer try/catch, which logs and moves to the next sync step.

**Other 4xx (400, 401, 403, 404).** No retry — these are client errors that won't be fixed by waiting. Throw immediately with the response text.

The bridge from frontend: this is the same shape as React Query's `retry: 3` + `retryDelay: attempt => 1000 * 2 ** attempt`, but inline and Notion-specific.

### One narrow door for every request

```typescript
export async function queryDatabase(...)   { return notionFetch(...) }
export async function createPage(...)      { return notionFetch(...) }
export async function updatePage(...)      { return notionFetch(...) }
export async function archivePage(...)     { await notionFetch(...)  }
```

Every public function in `api.ts` calls `notionFetch`. Every call to `notionFetch` calls `rateLimit()` first. There is no escape hatch. The architectural rule: if you want to talk to Notion, you go through this file. The file is small (128 lines) so the rule is easy to enforce by reading the diff.

If you're coming from frontend, this is like enforcing that all API calls go through a single `apiClient` instead of letting each component call `fetch` directly — same pattern, different layer.

### Move 2.5 — Phase A vs Phase B

**Phase A (current):** module-level `lastRequestTime` is shared across the entire app instance. Only one sync runs at a time (guarded by `inFlightRef` in `NotionSyncContext`). Single in-flight + module-level state means the 350ms spacing is correctly enforced.

**Phase B (planned):** if background sync ever runs in a separate JS context (e.g., a widget refresh), the module-level state would be per-context and the 350ms spacing would not be globally enforced. The fix would be to add persistent state — write `lastRequestTime` to MMKV or to expo-secure-store. Not built yet; not needed yet.

### Move 3 — The principle

Rate limiting is a contract with the world. Every API has a budget for how often you can ask it for things. The polite way to honor that budget is to enforce it client-side *before* the server has to push back. The server's 429 is the safety net, not the primary mechanism. Any time you find yourself building rate-limiting *after* the server starts complaining, you've already gone too far.

The full picture is below.

---

## Rate limiting and backoff — diagram

```
┌─ Application call site ──────────────────────────────────────────────────────────────┐
│                                                                                      │
│   await queryDatabase(token, sessionsDbId)                                           │
│         │  await createPage(token, dbId, props)                                      │
│         │       │  await updatePage(token, pageId, props)                            │
│         │       │       │  await archivePage(token, pageId)                          │
│         ▼       ▼       ▼       ▼                                                    │
└──────────────────┬───────────────────────────────────────────────────────────────────┘
                   │
                   ▼  every call funnels through notionFetch
┌─ src/services/notion/api.ts ─────────────────────────────────────────────────────────┐
│                                                                                      │
│   notionFetch(token, endpoint, options)                                              │
│      │                                                                               │
│      ▼                                                                               │
│   rateLimit()                                                                        │
│      ┌───────────────────────────────────────────────────────────────┐               │
│      │  elapsed = now - lastRequestTime                              │               │
│      │  if elapsed < 350: sleep(350 - elapsed)                       │               │
│      │  lastRequestTime = now                                        │               │
│      └───────────────────────────────────────────────────────────────┘               │
│      │                                                                               │
│      ▼                                                                               │
│   fetch(notion API endpoint, { Bearer token, Notion-Version, ... })                  │
│      │                                                                               │
│      ▼                                                                               │
│   inspect response                                                                   │
│      ├── status === 429                                                              │
│      │     ▼                                                                         │
│      │   sleep(Retry-After × 1000)                                                   │
│      │   recurse: notionFetch(..., _retries + 1)                                     │
│      │                                                                               │
│      ├── status >= 500 && retries < 3                                                │
│      │     ▼                                                                         │
│      │   sleep((retries + 1) × 2000)                                                 │
│      │   recurse: notionFetch(..., _retries + 1)                                     │
│      │                                                                               │
│      ├── !response.ok                                                                │
│      │     ▼  throw (caught upstream in syncAll's try/catch)                         │
│      │                                                                               │
│      └── response.ok                                                                 │
│             ▼  return res.json()                                                     │
│                                                                                      │
└─ Network boundary ───────────────────────────────────────────────────────────────────┘
                   │
                   ▼
                Notion API
```

---

## In this codebase

**File:** `src/services/notion/api.ts`
**Function / class:** `notionFetch()` (L18), `rateLimit()` (L9)
**Line range:** L1–L57 (the throttle + retry); L60–L128 (the four public methods that go through it)

Module-level state:
- `RATE_LIMIT_DELAY = 350` (L5)
- `NOTION_VERSION = '2022-06-28'` (L4)
- `lastRequestTime = 0` (L7) — mutable, shared across all in-flight calls

In-flight protection: `inFlightRef.current` in `NotionSyncContext.tsx` L44 — guarantees only one `syncAll` at a time.

---

## Elaborate

### Where this pattern comes from

`Retry-After` is in RFC 7231. Exponential backoff with bounded retries was popularized by the AWS SDK guidelines. Client-side throttling existed in HTTP clients before either — every database driver has had connection-spacing logic since the 1990s. The new-ish wrinkle here is doing it in idiomatic async JS with a module-level mutable variable rather than an explicit queue object.

### The deeper principle

Backpressure has to be honored by the side that can slow down — and that's almost always the client. The server's job is to defend itself (429); the client's job is to make 429 unnecessary by self-regulating. A polite client never needs the server's defense; an impolite one triggers it constantly and becomes one of the "noisy neighbor" workloads the server logs.

### Where this breaks down

Concurrent invocations of the JS context (multi-process apps, web workers, background tasks). The module-level `lastRequestTime` isn't shared across contexts, so each context independently thinks it's the only caller. The current `inFlightRef` guard prevents this scenario from arising — only one sync runs at a time — but if we ever needed parallel pulls of independent databases, we'd need a shared backing store.

The other breakpoint: the 350ms throttle is a *minimum* spacing, not a token bucket. If we want to send a burst of 5 quick requests and then idle for a minute, the throttle won't let us — it forces spacing. A token bucket would allow the burst. We chose the simpler model because Notion's rate limit is sustained-rate (3 RPS), not burst-allowing.

### What to explore next

- [03-bidirectional-sync](./03-bidirectional-sync.md) → where this gets applied
- [05-derived-state](./05-derived-state.md) → why sync latency matters at scale

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬───────────────────────────────────┐
│ Cost dimension     │ Inline throttle + retry (taken)  │ p-queue / library (alternative)   │
├────────────────────┼──────────────────────────────────┼───────────────────────────────────┤
│ Code volume        │ ~50 LOC inline                   │ Library + config + ~20 LOC glue   │
│ Bundle size        │ Zero added                       │ ~5–15KB minified                  │
│ Tunability         │ Two constants, easy to read      │ Library options, easier to mis-use│
│ Concurrency model  │ Sequential by await ordering     │ Configurable concurrency          │
│ Jitter             │ None (deterministic)             │ Often supported                   │
│ Persistence        │ In-memory only                   │ Same (in-memory only)             │
│ Multi-context      │ Breaks (per-context state)       │ Same — per-context state          │
│ Onboarding         │ Read 50 lines                    │ Read API docs + 50 lines of glue  │
└────────────────────┴──────────────────────────────────┴───────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The biggest cost is *no jitter*. Three calls in a tight loop produce three requests at exactly 0ms, 350ms, 700ms relative to the first. If many clients did the same thing at the same wall-clock time, they'd all hit Notion's rate-limiter in lockstep. For a single-user app this doesn't matter; for a fleet of clients it would, and we'd add `±50ms` random jitter to spread the load.

The second cost is *no concurrency at all*. The throttle forces sequential calls even when independent ones could run in parallel (e.g., pulling exercises and pulling sessions could overlap if they hit different rate-limit buckets). The 350ms-per-call shape assumes all calls share one bucket. For Notion that's correct; for an API with per-database buckets it would leave throughput on the table.

A third cost: the throttle is *not visible* to the application. Two `await notionFetch` calls take 350ms total even if both responses arrive in 1ms each. The UI has no way to tell "we're throttled" vs "the network is slow" — both show up as latency.

### Sub-block 2 — what a library would have cost

Using `p-queue` or `bottleneck` would have given us configurable concurrency, jitter, and explicit queue visibility. The cost: 5–15 KB of bundle (mobile-sensitive), an API to learn, configuration that drifts from defaults silently over time. For 50 lines of inline code that does the job, it's not worth the dependency.

### Sub-block 3 — the breakpoint

Fine until **the app needs to integrate with a second API** that has its own rate limit. At that point the module-level shared `lastRequestTime` becomes the wrong abstraction — we'd want one throttle per API. The fix is to convert from module-level state to a class instance per API. Not built yet because Notion is the only network dependency.

The other breakpoint: **background sync** (widget refresh, scheduled task) running in a separate JS context. Module-level state isn't shared across contexts; both could fire simultaneously and trigger 429s. The fix is to persist `lastRequestTime` to a shared store (MMKV, secure-store), tolerating the extra read-write cost per request.

### Sub-block 4 — what wasn't actually a tradeoff

A token bucket would have been more sophisticated but inappropriate for Notion. Notion's rate limit is a sustained-rate, not a burstable bucket — exceeding 3 RPS even briefly produces 429. The simpler "minimum spacing" model is correct for this shape.

---

## Tech reference (industry pairing)

### Hand-rolled throttle + retry

- **Codebase uses:** Inline `rateLimit()` + retry branches in `notionFetch` (`src/services/notion/api.ts`).
- **Why it's here:** simple enough that a library would add more weight than it saves.
- **Leading today:** Hand-rolled throttle — `adoption-leading` for single-API integrations with bounded surface, 2026.
- **Why it leads:** zero dependencies, readable in one screen, easy to reason about.
- **Runner-up:** `p-queue` / `bottleneck` — `innovation-leading` for multi-API or burstable workloads needing token buckets, jitter, or named queues.

### Notion API rate-limit conformance (Retry-After + 429)

- **Codebase uses:** `Retry-After` header parsing at L38 of `api.ts`.
- **Why it's here:** the only correct way to recover from a 429 is to honor the server's wait directive.
- **Leading today:** RFC 7231 `Retry-After` honoring — `adoption-leading`, 2026.
- **Why it leads:** every well-behaved API server uses it; ignoring it is the surest way to escalate.
- **Runner-up:** Custom backoff (e.g., exponential without Retry-After) — `adoption-leading` for APIs that don't expose Retry-After; worse than honoring the explicit signal when available.

---

## Summary

### Concept recap

Every Notion HTTP call goes through `notionFetch` in `src/services/notion/api.ts`. Before each request, `rateLimit()` sleeps to enforce 350ms minimum spacing (3 RPS, just under Notion's published limit). After each response: 429 honors `Retry-After` and retries unboundedly; 5xx retries up to 3 times with linear backoff (2s, 4s, 6s); 4xx throws. The four public methods (`queryDatabase`, `createPage`, `updatePage`, `archivePage`) all funnel through this wrapper — no escape hatch. The constraint forcing this design was Notion's published rate limit and the need for fault-tolerant sync. The cost is sequential-only throughput and a per-context state model that wouldn't survive parallel JS contexts.

### Key points

- Lives in step 5 (Failure handling) and step 6 (Scale concerns) of the system-design checklist.
- One `rateLimit()` shared across the whole module; `lastRequestTime` is mutable state.
- 429 retries unboundedly with `Retry-After` honoring; 5xx retries 3× with `(n+1)*2s` backoff; 4xx throws.
- Every outgoing request goes through `notionFetch`. No exceptions.
- The sync orchestrator's `inFlightRef` guarantees only one in-flight `syncAll` at a time, which is what makes the module-level state correct.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you handle rate limits" is "do you understand the difference between client-side spacing and server-side rejection?" The signal is whether you can name *both* and explain why client-side is the primary mechanism.

### Likely questions

**Q: Why is the throttle 350ms?  [mid]**
A: Notion's published rate limit is 3 requests per second, or 333ms minimum per request. 350ms is just above that to leave a safety margin for clock jitter and network latency. It costs ~5% on throughput vs. running at the published limit, and in exchange we get effectively zero 429s on the sustained path. The 429 retry path still exists for when Notion temporarily tightens (which happens), but it should be the exception, not the rule.

```
   Notion limit       3 RPS = 333ms/request
   Our throttle       350ms                       ←─ 5% headroom
   429 path           Retry-After + unbounded retry
   5xx path           Linear backoff, 3 attempts
```

**Q: Why is the 5xx retry capped at 3 but the 429 retry unbounded?  [senior]**
A: A 5xx means *something is broken* on Notion's side — possibly transient, possibly persistent. 3 retries with backoff gives enough recovery for transient issues; beyond that, retrying more aggressively just wastes the user's network and battery. The error bubbles up to `syncAll`'s outer try/catch, which logs and moves to the next sync step. A 429 means *we asked too fast* — the server is fine, we just need to slow down. Retrying indefinitely is correct because the rate-limit clears predictably and the response tells us exactly how long to wait.

```
   5xx (server broken)              │   429 (we're too fast)
   ────────────────────────────────│──────────────────────────────────
   limited recovery surface         │   guaranteed recovery (wait works)
   3 retries × 2s/4s/6s             │   unbounded retries
   then throw → next sync step      │   honor Retry-After
   right because retries can't fix  │   right because waiting solves it
   a fundamentally broken server    │
```

**Q: What happens when 100k users sync at once?  [arch]**
A: Each client throttles independently, so the global request rate scales linearly with users. At 100k users × 3 RPS sustained sync = 300k RPS to Notion, which Notion can't serve. The whole fleet would get 429s, all clients would honor Retry-After, but the recovery would be coordinated only by Notion's `Retry-After` value. If many clients got the same `Retry-After: 30` from a coordinated rate limit, they'd all retry at the same instant — a thundering herd. The fix is per-client jitter (`±10s` random padding on `Retry-After`) and probably a backend-of-our-own to fan out at controllable rates rather than every client hitting Notion directly. For a single-user app this is fine.

```
┌─ at 100k concurrent users ────────────────────────────────────┐
│  per-client throttle still ~3 RPS                             │
│  aggregate Notion-side  ~300k RPS ←─ Notion 429s everywhere   │
│  thundering herd       all clients retry at same wall clock   │
│  fix: jitter on Retry-After + middle-tier server              │
└───────────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: What stops two parts of the app from calling `notionFetch` in parallel and racing on `lastRequestTime`?**
A: The `inFlightRef.current` guard in `NotionSyncContext` ensures only one `syncAll` is in flight at a time. Inside `syncAll`, the four sync steps are sequential awaits — so even though `rateLimit()` doesn't protect against parallel callers, *no parallel callers exist* in practice. If we ever broke this rule (e.g., started a parallel background pull), the module-level `lastRequestTime` would race and we'd lose the 350ms guarantee. The mitigation would be to wrap `lastRequestTime` updates in a promise queue, but that's complexity we don't need today.

```
   Picked (single in-flight)        │   Parallel-safe (alternative)
   ────────────────────────────────│──────────────────────────────────
   inFlightRef guards syncAll       │   queue-based rateLimit
   module-level state is correct    │   atomic on lastRequestTime
   simple to reason about           │   handles parallel callers
   no parallel pulls today          │   safe if we add background sync
   reorganize if we add parallelism │   built-in concurrency
```

### One-line anchors

- One door, one throttle, one retry policy.
- 429 means "we're too fast"; 5xx means "they're broken".
- Honor `Retry-After`; never guess at it.
- The throttle is the primary mechanism; the retry is the safety net.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw `notionFetch`'s decision tree: rateLimit → fetch → switch on status. Mark the 429 branch and the 5xx branch.

### Level 2 — Explain it out loud
Explain to a teammate why we have client-side rate limiting *and* server-side 429 handling. Under 90 seconds.

### Level 3 — Apply it to a new scenario
"You're asked to integrate a new service (e.g., a workout-plan API) with its own 10 RPS limit. How does this code change?"

Reference `src/services/notion/api.ts` L7–L57. Would you copy the file or refactor?

### Level 4 — Defend the decision you'd change
"Would you swap the hand-rolled throttle for `p-queue`?" Walk through bundle cost, tunability, and onboarding.

### Quick check — code reference test
- What's the rate-limit constant value?
- What file does the throttle live in?
- What status range triggers the bounded retry?

Then verify.
