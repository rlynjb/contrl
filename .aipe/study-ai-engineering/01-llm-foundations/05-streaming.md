# Streaming

**Industry name(s):** Streaming, server-sent events (SSE), token streaming, incremental response
**Type:** Industry standard

> The provider returns tokens as they're generated (via SSE or chunked HTTP) rather than waiting for the full response. The user sees the first token in ~200ms instead of the full response in ~2s. Plus structural benefits: cancellable mid-generation, progressive UI updates, lower perceived latency. Cost is the same; UX is dramatically different.

**See also:** → [01-what-an-llm-is](./01-what-an-llm-is.md) · → [04-structured-outputs](./04-structured-outputs.md) · → [04-agents-and-tool-use/03-react-pattern](../04-agents-and-tool-use/03-react-pattern.md)

---

## Why care

**Move 1.** Your coaching message takes 2.3 seconds to generate. Users wait through a spinning loader. Half the users assume it's broken and back out. Switch to streaming: first token at 200ms, message complete at 2.3s. Same total latency, but the user sees text appearing and stays engaged. Bounce rate drops.

**Move 2.** That "show progress incrementally" question is what streaming answers. Not how fast the LLM generates. Just whether you wait for the whole response or display it as it comes.

**Why you need to answer that question at all:** Perceived latency dominates real latency for user-visible UI. A 2-second blank spinner feels longer than a 2-second flow of text appearing. For any user-facing LLM feature, streaming is table stakes.

**Move 5.** Streaming is what HTTP chunked transfer encoding is for large file downloads — show progress, don't make the user wait for the whole thing.

---

## How it works

### Move 1 — The mental model

The model generates tokens one at a time. Without streaming, the provider waits until all tokens are generated, then returns the full response. With streaming, each token (or small batch) is sent as soon as it's produced over a persistent connection.

```
  Non-streaming (default request shape)
  
  client → POST /messages → ... (model generates N tokens) ... → response (full text)
                              ▲
                              wait for all N tokens
  
  Streaming
  
  client → POST /messages?stream=true → SSE event stream
                                            ├─ event: token "Hello"
                                            ├─ event: token ","
                                            ├─ event: token " world"
                                            └─ event: done
```

Strategy in plain English: **enable streaming for user-visible chains. Show tokens as they arrive. Cancel mid-stream when the user navigates away.**

---

### Move 2 — The layered walkthrough

#### How to enable streaming (Anthropic SDK)

```ts
const stream = await client.messages.stream({
  model: 'claude-sonnet-4-6',
  system: systemPrompt,
  messages: [...],
});

for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    process.stdout.write(event.delta.text);
  }
}

const finalMessage = await stream.finalMessage();
```

The SDK handles the SSE parsing; you iterate over events.

---

#### Event shapes

```
  Anthropic streaming events
  
  event: message_start          { message: { id, model, ... } }
  event: content_block_start    { content_block: { type: 'text' | 'tool_use' } }
  event: content_block_delta    { delta: { text: "Hello" } }   ◄─ tokens stream here
  event: content_block_delta    { delta: { text: "," } }
  event: content_block_delta    { delta: { text: " world" } }
  event: content_block_stop
  event: message_delta          { delta: { stop_reason: 'end_turn' } }
  event: message_stop
```

For structured outputs (tool_use), the `content_block_delta` events stream JSON fragments as they're generated.

---

#### Cancellable mid-stream

A real UX benefit: if the user navigates away or cancels, you can abort the stream and stop paying for further tokens.

```ts
const controller = new AbortController();
const stream = await client.messages.stream({
  // ...
  signal: controller.signal,
});

// In response to user action:
controller.abort();
```

Provider stops generating; you stop paying for tokens past the abort point. For UI-driven workflows, this is essential.

---

#### Structured outputs + streaming

Tool calls can be streamed too. The JSON arguments arrive in fragments; once complete, parse with Zod. Streaming partial JSON is tricky (parser sees incomplete objects); usually the pattern is:
- Stream raw deltas for UI display.
- Buffer the complete tool-use block before parsing.
- For "show progress" UI: render placeholder while streaming; parse + display when complete.

```
  Streaming + structured output pattern
  
  delta deltas arrive  →  buffer JSON fragments
                            │
                            ▼
                          parse on content_block_stop
                            │
                            ▼
                          render structured result
```

For pure-text generation (coaching message), no buffering — render directly.

---

#### Latency benefits (perceived vs actual)

```
  Actual vs perceived latency

  Non-streaming:    [█████████████████ 2.3s wait █████████████████] result
  Streaming:        first token at 200ms, then continuous text appearing
                    Total: 2.3s, but the user sees motion from 200ms
  
  Perceived "wait" time: ~200ms (until first token) vs 2.3s (whole response)
  
  User retention impact:
    >2s blank wait: significant drop-off on web/mobile
    Streaming: minimal drop-off; perceived as "fast enough"
```

---

#### When NOT to stream

- **Batch/background workloads.** Nothing visible to the user; latency doesn't compound to retention. Non-streaming is simpler.
- **Structured outputs consumed only by code.** If the response is parsed and never displayed mid-generation, streaming adds parsing complexity without UX benefit.
- **Very short responses.** A 50-token classifier response completes in ~200ms; streaming adds connection overhead without meaningful UX win.

---

### Move 3 — The principle

Streaming is the difference between "the system is doing something" and "the system is hung." Perceived latency dominates real latency for user-facing UI. The cost is small (slightly more complex client code); the UX benefit is dramatic for any response taking more than ~500ms. For backend chains with no user display, non-streaming is fine.

---

## Streaming — diagram

```
┌─ Without streaming ──────────────────────────────────────────────────────────┐
│                                                                              │
│   Client sends request                                                       │
│         │                                                                    │
│         ▼ (~2s wait)                                                          │
│   Provider generates all tokens                                              │
│         │                                                                    │
│         ▼                                                                    │
│   Client receives full response                                              │
│                                                                              │
│   User experience: blank spinner for 2s                                       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─ With streaming ─────────────────────────────────────────────────────────────┐
│                                                                              │
│   Client sends request (stream=true)                                         │
│         │                                                                    │
│         ▼ (~200ms)                                                            │
│   First token: streamed event                                                │
│         ▼                                                                    │
│   Next tokens stream as they're generated                                    │
│         ▼ (~2s total)                                                         │
│   Stream complete                                                            │
│                                                                              │
│   User experience: text appearing from 200ms; total feels "fast enough"      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B planned — contrl's coaching agent should stream.**

The agent's output (a 500-800 token coaching message) takes ~1-2 seconds to generate. Without streaming, the user sees a spinner for 1-2 seconds. With streaming, they see text appearing from ~200ms — substantially better UX.

**Planned implementation paths:**
- `src/lib/agent/runner.ts` — uses `client.messages.stream()` instead of `client.messages.create()`.
- UI layer — displays incremental text as it arrives.
- Cancel-on-back-button — `AbortController` wired to the stream.

---

## Elaborate

**Where this pattern comes from.** Server-sent events (SSE) was standardized in 2009 as an HTML5 alternative to long-polling. LLM streaming adopted SSE for the same reason — long-running server-side compute with incremental output. By 2026, every major LLM provider exposes a streaming API.

**The deeper principle.** Perceived latency dominates real latency for user UI. The same principle drives skeleton screens, optimistic updates, and incremental loading patterns elsewhere in frontend.

**Where this breaks down.** Two places.

1. **Stateful client buffering.** A client that needs to validate the full response before displaying anything (strict schema, content classifier) can't stream — buffer the full response, then act.
2. **High-frequency batch APIs.** A backend service calling LLMs in a tight loop doesn't benefit from streaming and pays the connection overhead.

**What to explore next.**
- [04-structured-outputs](./04-structured-outputs.md) — streaming structured outputs requires buffering.
- [04-agents-and-tool-use/03-react-pattern](../04-agents-and-tool-use/03-react-pattern.md) — agent loops can stream intermediate steps.

---

## Tradeoffs

| Cost dimension | Streaming | Non-streaming |
|---|---|---|
| Client code complexity | Slightly higher (event handling) | Lower (one response) |
| Perceived latency | Low (~200ms to first token) | High (~2s for full) |
| Cancellable | Yes | No (full call must complete) |
| Total cost | Same | Same |
| Use case fit | User-visible chains | Backend / batch |

### Sub-block 1 — what we gave up

Slightly more complex client code — event iteration vs single response object. For TypeScript SDKs, the abstraction is clean; the cost is small.

### Sub-block 2 — non-streaming cost

For user-visible chains: significant UX cost. Bounce rate increases on any wait > 1-2s. Streaming converts "wait" into "watching."

### Sub-block 3 — the breakpoint

Stream for user-facing UI; don't stream for backend/batch. The decision is binary per chain.

---

## Tech reference (industry pairing)

### Anthropic streaming API

- **Codebase uses:** Planned for the coaching agent.
- **Why it's here:** the native streaming surface.
- **Leading today:** Anthropic Messages stream — `adoption-leading` for streaming LLM responses, 2026.
- **Why it leads:** SSE-based; SDK provides typed events; AbortController support for cancellation.
- **Runner-up:** OpenAI streaming (equivalent shape).

### Vercel AI SDK

- **Codebase uses:** Not yet.
- **Why it's here:** the TypeScript-native helper that wraps streaming + UI integration patterns.
- **Leading today:** Vercel AI SDK — `innovation-leading` for streaming React/Next.js UIs, 2026.
- **Why it leads:** typed end-to-end; React hooks for streaming display; provider-agnostic.
- **Runner-up:** Hand-rolled with Anthropic's SDK + your own React state.

---

## Project exercises

### [B4C.stream] Enable streaming for the coaching agent

- **Exercise ID:** `[B4C.stream]` (hypothetical, post-Phase 4)
- **What to build:** Switch `src/lib/agent/runner.ts` from `client.messages.create()` to `client.messages.stream()`. UI iterates the event stream and displays incremental text. Wire `AbortController` to back-button + navigation events.
- **Why it earns its place:** the difference between "feels fast" and "feels broken." Critical for user-visible LLM features.
- **Files to touch:** `src/lib/agent/runner.ts`, the UI component that displays coaching messages.
- **Done when:** first token appears in ~200ms; cancel-mid-stream works.
- **Estimated effort:** `1–4hr`

---

## Summary

Streaming returns tokens as they're generated rather than waiting for the full response. First token in ~200ms instead of full response in ~2s. Same total cost; dramatically better UX. Cancellable mid-stream via AbortController. For contrl's coaching agent: planned. For backend/batch chains: not needed.

**Key points:**

- **First token in ~200ms** vs full response in ~2s.
- **Cancellable mid-stream** via AbortController.
- **Same cost** as non-streaming.
- **Use for user-facing UI;** skip for backend/batch.
- **Structured outputs + streaming** requires buffering before parse.

---

## Interview defense

**[mid] Why use streaming?**

Perceived latency. The user sees text appearing from ~200ms instead of a blank spinner for 2s. Same total time; dramatically better UX. Cancellable too — if the user navigates away mid-generation, abort the stream and stop paying for further tokens.

**[senior] When NOT to stream?**

Backend chains where no user sees the response in progress. Batch workloads. Very short responses where streaming adds connection overhead without UX benefit. Structured outputs consumed only by code (full response is needed for parsing).

---

## One-line anchors

- "First token in ~200ms instead of full response in ~2s."
- "Same cost; cancellable mid-stream."
- "User-facing chains stream; backend chains don't."
- "Structured outputs + streaming = buffer before parse."
- "AbortController wires cancel-on-navigation."

---

## Validate

**Level 1:** Draw streaming vs non-streaming flow.
**Level 2:** "Why stream?" Under 30 seconds.
**Level 3:** A teammate's chain takes 2s and shows a blank spinner. Recommend streaming. Reference UX impact.
**Level 4:** "Why not always stream?" Defend backend non-streaming.

**Quick check:**
- Time to first token? (~200ms)
- Cost difference vs non-streaming? (None)
- Does contrl plan to stream coaching? (Yes)
