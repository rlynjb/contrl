# Fan-out backpressure

**Industry name(s):** Fan-out backpressure · Concurrency control · Sub-agent semaphore · Supervisor backpressure
**Type:** Industry standard

> A single call has one outbound request to rate-limit. A multi-agent supervisor spawning workers can fire many concurrent calls — and a runaway supervisor can fan out faster than the provider's rate limit allows. The fix is a concurrency limiter at the supervisor plus backpressure upward (stop decomposing further when the worker queue grows). **Case B for contrl** — single-agent, no fan-out, no backpressure needed.

**See also:** → multi-agent topologies (Case B for contrl): [03-multi-agent-orchestration/README.md](../03-multi-agent-orchestration/README.md) · → single-call rate limiting: [`.aipe/study-ai-engineering/06-production-serving/04-rate-limiting-backpressure.md`](../../study-ai-engineering/06-production-serving/04-rate-limiting-backpressure.md)

---

## Why care

**Move 1.** Your multi-agent supervisor decomposes a task into 12 worker calls. It fires all 12 at the same instant. The provider rate-limits you; 8 calls succeed, 4 get 429s. The supervisor retries; now it's 16 calls in flight. The system enters a retry spiral.

**Move 2.** That "how do I cap concurrent agent spawns" question is what fan-out backpressure answers. Not how to coordinate workers. Just: how to keep the supervisor from over-spawning.

**Why it matters: multi-agent systems make rate-limit problems N× harder than single-agent.** Without a concurrency limiter at the supervisor and backpressure on decomposition, runaway spawning is a known failure mode.

**Move 5.** Fan-out backpressure is to multi-agent what `Promise.all` with a concurrency cap is to bulk HTTP requests: same instinct, applied to a different unit.

---

## How it works

### Move 1 — The mental model

```
Without backpressure:
─────────────────────
Supervisor decomposes → 12 worker calls fired at once
                     │
                     ▼
              Provider rate limit (8/sec)
                     │
              ┌──────┴──────┐
              ▼             ▼
        8 succeed       4 fail (429)
                            │
                            ▼
                     supervisor retries the 4
                            │
                            ▼
                       16 in flight now
                            │
                            ▼
                       cascade failure


With backpressure:
──────────────────
Supervisor decomposes → 12 worker calls queued
                     │
                     ▼
              Concurrency semaphore (cap N=4)
                     │
              pop up to N concurrent; queue the rest
                     │
                     ▼
              workers run; complete; next pop
                     │
                     ▼
              all 12 eventually complete; no 429s
```

**Strategy in plain English:** the supervisor doesn't get to fire workers as fast as it can decompose. There's a semaphore between them.

### Move 2 — Upward backpressure

A semaphore on outbound calls is one half. The other half is **backpressure UP the spawning chain** — when the worker queue grows past a threshold, the supervisor stops decomposing further.

```
worker queue depth
       │
       ▼
   over threshold?
       │
   ┌───┴───┐
   no      yes
   │       │
   │       ▼
   │   supervisor pauses decomposition;
   │   alternative: emit "task too large; escalate to human"
   │
   ▼
keep decomposing
```

Without upward backpressure, a runaway supervisor keeps spawning workers regardless of queue depth — the queue grows unbounded, memory blows up, the eventual cap-hit produces a worse outcome than not starting.

### Move 3 — The principle

Fan-out without backpressure is the multi-agent version of an unbounded queue. The cap on outbound concurrency protects the provider; the cap on the worker queue protects your own system. Both are required for any non-trivial multi-agent topology.

---

## Fan-out backpressure — diagram

```
┌─ Supervisor-worker with backpressure ────────────────────────────────────────────────┐
│                                                                                      │
│   USER TASK                                                                          │
│         │                                                                            │
│         ▼                                                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐           │
│   │ Supervisor                                                           │           │
│   │  - decomposes task into sub-tasks                                    │           │
│   │  - check: worker queue depth > threshold?                            │           │
│   │       yes → pause decomposition; surface "task too large"            │           │
│   │       no  → continue                                                 │           │
│   └────────────────────┬────────────────────────────────────────────────┘           │
│                        │ sub-tasks enqueued                                          │
│                        ▼                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐           │
│   │ Worker queue                                                         │           │
│   │  - holds pending sub-tasks                                           │           │
│   │  - has a max length (e.g., 50)                                       │           │
│   └────────────────────┬────────────────────────────────────────────────┘           │
│                        │                                                             │
│                        ▼                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐           │
│   │ Concurrency semaphore (cap = 4)                                      │           │
│   │  - pop up to N at a time                                             │           │
│   │  - queue the rest                                                    │           │
│   └────────────────────┬────────────────────────────────────────────────┘           │
│                        │                                                             │
│                        ▼                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐           │
│   │ Worker pool (up to N concurrent)                                     │           │
│   │  - each calls provider                                               │           │
│   │  - completes, returns to queue for next pop                          │           │
│   └────────────────────┬────────────────────────────────────────────────┘           │
│                        │                                                             │
│                        ▼                                                             │
│                  Provider                                                            │
│                  (sees at most N concurrent)                                         │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — not applicable to contrl.**

contrl is single-agent. The planned coaching agent fires sequential tool calls within one loop; no fan-out, no parallel sub-agent spawning. Fan-out backpressure has nothing to bound.

When this would land: only if contrl ever crossed into multi-agent (see `03-multi-agent-orchestration/01-when-not-to-go-multi-agent.md` — unlikely for contrl's coaching task). The first multi-agent topology contrl would adopt (if ever) is supervisor-worker, at which point fan-out backpressure becomes mandatory.

---

## Elaborate

**Where this pattern comes from.** Backpressure is a load-management technique from streaming systems and message queues. The agent version maps the same idea onto sub-agent spawning: don't let the upstream producer (supervisor) overwhelm the downstream consumer (provider rate limit + worker capacity).

**The deeper principle.** Unbounded queues are always wrong in production. The semaphore is the bound on what's in flight; the queue depth check is the bound on what's pending. Both are required.

**Where this breaks down.** The concurrency cap protects the provider but serializes the fan-out — you lose the parallel-latency win that made fan-out worth it. The breakpoint is the provider's rate limit divided by per-call duration: cap just under that. If your task needs more throughput than the limit allows, request a higher limit or batch — don't raise the local cap and trade queueing for 429s.

**What to explore next.** [`.aipe/study-ai-engineering/06-production-serving/04-rate-limiting-backpressure.md`](../../study-ai-engineering/06-production-serving/04-rate-limiting-backpressure.md) for the single-call rate-limit primitives.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Fan-out with backpressure         │ Unbounded fan-out                │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Provider rate-limit│ never hit                         │ frequent 429s                    │
│ Latency on success │ slightly higher (queueing)        │ parallel speed                   │
│ Cascade failure    │ none                              │ retry spiral common              │
│ Memory growth      │ bounded by queue cap              │ unbounded                        │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 3 — the breakpoint

Required for any multi-agent topology that spawns workers. Skipping it means the first big task triggers a retry spiral. There is no version of "we'll add it later" that's safe — the first incident is the moment you wish it was already there.

---

## Tech reference (industry pairing)

### `p-limit` / `Promise.all` with concurrency cap

- **Codebase uses:** not used. If multi-agent landed, `p-limit` is the standard TypeScript primitive.
- **Why it's here:** the concurrency semaphore in 5 lines.
- **Leading today:** `p-limit` — adoption-leading for concurrent-request limiting in Node/TS, 2026.

### LangGraph queue + retry policies

- **Codebase uses:** not used.
- **Why it's here:** framework-level queue management for multi-agent orchestration.

---

## Summary

### Concept recap

Multi-agent supervisors that spawn workers need two backpressure mechanisms: a concurrency semaphore on outbound calls (protects the provider) and a worker-queue-depth check on decomposition (protects your system). Without both, runaway spawning produces retry spirals and unbounded memory growth. contrl: Case B — single-agent, no fan-out, no backpressure needed.

### Key points

- Fan-out without backpressure is the multi-agent version of an unbounded queue.
- Concurrency cap = provider rate limit / per-call duration.
- Upward backpressure on decomposition prevents the worker-queue from growing unbounded.
- contrl: Case B; no fan-out planned.

---

## Interview defense

### Likely questions

**[mid] What's fan-out backpressure?**

A concurrency cap on outbound sub-agent calls (semaphore) plus a queue-depth check that pauses further decomposition when the worker queue is full. Both bound the runaway-supervisor failure mode.

**[senior] Why doesn't contrl need this?**

Single-agent. The planned coaching loop fires sequential tool calls within one agent — no parallel sub-agent spawning. Fan-out backpressure has nothing to bound.

### One-line anchors

- "Fan-out without backpressure is the multi-agent version of an unbounded queue."
- "Cap concurrency at provider rate limit / per-call duration."
- "Required for any multi-agent topology; not applicable to single-agent."

---

## Validate

**Level 1 — Reconstruct the diagram.** Supervisor → queue → semaphore → worker pool → provider.

**Level 2 — Explain in 60s.** Two backpressure mechanisms; what each protects against.

**Quick check.**
- Does contrl need this? — No; single-agent.
- What's the concurrency cap formula? — Provider rate limit / per-call duration.
