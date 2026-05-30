# LLM observability

**Industry name(s):** LLM observability, AI observability, prompt observability, LLMOps monitoring
**Type:** Industry standard

> Production LLM systems need observability beyond classical app monitoring: per-call traces (prompt + response + tokens + latency + model version), per-chain rates (success / schema-fail / cost), drift detection on quality metrics, and the ability to reproduce any production output deterministically. Without it, every LLM bug becomes a research project.

**See also:** → [02-eval-methods](./02-eval-methods.md) · → [03-llm-as-judge-bias](./03-llm-as-judge-bias.md) · → prompt-engineering [03-prompts-as-code](../../study-prompt-engineering/03-prompts-as-code.md) · → [08-machine-learning/17-drift-detection](../08-machine-learning/17-drift-detection.md)

---

## Why care

**Move 1.** A user reports the coaching agent produced a strange message at 3:47 PM yesterday. You open Sentry — there's no error. You check the access log — yes, the call happened. You look at the response cached in your DB — it's the output the user saw. Now what? You don't have the prompt that produced it. You don't have the model version that was in production then. You don't have the tool outputs that fed into the prompt. You don't have anything that lets you reproduce the call deterministically. The debugging path is "guess and reproduce."

**Move 2.** That "can I reproduce a production LLM call deterministically" question is what LLM observability answers. Not the classical app metrics (CPU, memory, request rate — those still matter). Just the LLM-specific surface: per-call trace with full prompt, response, model version, token counts, latency, schema-fail status, and any tool calls in the loop. With this trace, debugging is `git checkout <prompt_version>` + replay; without it, debugging is interpretive.

**Why you need to answer that question at all:** Three failures hide in classical-only monitoring. First, **bug attribution is impossible** — when the LLM produces bad output, you need the exact prompt + model version to reproduce. Without observability, you guess. Second, **quality drift is invisible** — model upgrades, prompt changes, or shifted production distributions degrade quality silently. Without per-chain metrics, you find out from user complaints. Third, **cost overruns are silent** — runaway token usage on a single chain doesn't show in classical bills until the invoice arrives.

**Before / after.**

Without LLM observability:
- User reports bad output. You can't reproduce. You guess. Half a day investigating.
- Model upgrade lands. Quality drops 8%. Nobody knows until complaints arrive at week 2.
- One chain's prompt grew to 4K tokens unintentionally. Bill rises 30%. Discovered at month-end.

With LLM observability:
- User reports bad output. Query logs by `chain_version` + timestamp. Reproduce locally with the same model version + prompt + tool outputs.
- Per-chain quality metric on a dashboard. Model upgrade-related drop visible within hours.
- Per-chain token usage tracked. Anomaly detection on token count flags the 4K-token prompt the day it ships.

**Move 5.** LLM observability is what request tracing (OpenTelemetry, X-Request-ID) is for backend services — the runtime artifact that turns "we have a problem" into "here's the specific call to reproduce."

---

## How it works

### Move 1 — The mental model

Think of a backend service's request log: each request gets a trace_id, the inbound payload is captured, the response is captured, latency is recorded, downstream calls are linked. When a bug arrives, you have everything to reproduce. LLM observability is the same shape: per-call trace, but the "request" is the assembled prompt and the "response" is the model output.

Strategy in plain English: **per-call log with `{chain_version, model, prompt, response, tokens_in, tokens_out, schema_pass, latency_ms}`. Aggregated dashboards per chain. Drift detection on quality metrics. Sampling for cost.**

```
  LLM observability stack (the request-tracing analogy)
  
  ┌─────────────────────────────────────────────────────────────────┐
  │ Per-call trace                                                  │
  │   chain_name, chain_version (commit SHA), model, prompt,         │
  │   response, tokens_in, tokens_out, schema_pass, latency_ms       │
  └─────────────────┬───────────────────────────────────────────────┘
                    │ logged to durable store
                    ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Aggregated dashboards                                            │
  │   per-chain: call rate, schema-fail rate, p99 latency, cost/day  │
  │   per-model: success rate, latency distribution                  │
  └─────────────────┬───────────────────────────────────────────────┘
                    │ thresholds + diff detection
                    ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Drift detection                                                  │
  │   quality metric over rolling window (judge scores, schema pass)  │
  │   alert on > N standard deviations from baseline                  │
  └─────────────────────────────────────────────────────────────────┘
```

---

### Move 2 — The layered walkthrough

#### Per-call trace structure

Log every LLM call with enough metadata to reproduce it:

```ts
// Planned shape for a contrl LLM call wrapper
log.info({
  event: 'llm_call',
  chain_name: 'coaching-agent',
  chain_version: PROMPT_VERSIONS['coaching-agent'],  // commit SHA baked at build
  model: 'claude-sonnet-4-6',
  prompt: {
    system: systemPrompt,
    messages: messages,
    tools: tools,
  },
  response: {
    content: response.content,
    stop_reason: response.stop_reason,
  },
  tokens: { in: response.usage.input_tokens, out: response.usage.output_tokens },
  schema_pass: zodResult.success,
  latency_ms: Date.now() - startTime,
  // For agents: tool calls in the loop
  tool_calls: [
    { name: 'get_classifier_output', input: {...}, output_size_tokens: 240 },
    { name: 'get_form_history', input: {...}, output_size_tokens: 180 },
  ],
});
```

Privacy note: for sensitive content (user journal entries), hash or truncate the prompt body. Keep structural fields verbatim.

```
  Trace fields and their job
  
  ┌────────────────────┬─────────────────────────────────────────┐
  │ Field              │ Used for                                 │
  ├────────────────────┼─────────────────────────────────────────┤
  │ chain_name         │ filter logs by chain                     │
  │ chain_version      │ reproduce the exact prompt               │
  │ model              │ detect drift across model upgrades       │
  │ prompt + response  │ replay the call deterministically        │
  │ tokens_in/out      │ cost attribution; budget enforcement     │
  │ schema_pass        │ catches structural failures              │
  │ latency_ms         │ p99 monitoring; user-experience tracking │
  │ tool_calls         │ agent-specific; debug per-tool failures  │
  └────────────────────┴─────────────────────────────────────────┘
```

---

#### Aggregated dashboards

Per chain, track:

- **Call rate** (calls/sec, calls/day) — usage signal.
- **Schema-fail rate** — should be <1% on a frontier model with forced tool calls. Increases mean either prompt drift or a model upgrade.
- **p50 / p99 latency** — user-experience signal.
- **Tokens in / out (median, p99)** — cost driver and prompt-growth detector.
- **Cost / day** — derived from token counts × model pricing.
- **Quality metric** (if LLM-as-judge is wired up): rolling judge score.

```
  Per-chain dashboard mock
  
  Chain: coaching-agent (last 7 days)
  ┌───────────────────────────────────────────────────────────────────┐
  │ Calls / day:       avg 850, peak 1340                             │
  │ Schema pass rate:  98.7% (target ≥99%, slight warning)           │
  │ p50 latency:       1.2s                                            │
  │ p99 latency:       3.8s                                            │
  │ Tokens in (median): 2400  (within budget 3500)                    │
  │ Tokens in (p99):    5200  (over budget — investigate)             │
  │ Cost / day:        $4.20                                           │
  │ Judge score (rolling avg): 4.1 / 5.0 (baseline 4.2; -0.1 drift)    │
  └───────────────────────────────────────────────────────────────────┘
```

The p99 token count exceeding budget is the kind of signal that's invisible without per-chain dashboards.

---

#### Drift detection

For the quality metric (LLM-as-judge or proxy metrics like schema-pass rate), track rolling-window statistics and alert on drift.

**Simple version:** compute the 7-day rolling mean and standard deviation; alert when today's mean is >2σ from the baseline.

**Better version (PSI — Population Stability Index):** compute the distribution of judge scores in a baseline window and the current window; alert when PSI exceeds a threshold (0.1 = mild drift, 0.25 = significant drift, similar thresholds to ML drift detection).

```
  Drift detection loop
  
  ┌────────────────────────────────────────────────┐
  │ Baseline: judge scores from week W-4 to W-1     │
  └────────────────────┬───────────────────────────┘
                       │
                       ▼
  ┌────────────────────────────────────────────────┐
  │ Current: judge scores from week W                │
  └────────────────────┬───────────────────────────┘
                       │
                       ▼
  ┌────────────────────────────────────────────────┐
  │ Compute: mean_diff, std_diff, PSI                │
  │ Alert if: mean_diff > 2σ OR PSI > 0.1            │
  └────────────────────┬───────────────────────────┘
                       │
                       ▼
  Investigate: prompt change? model upgrade?
                production distribution shift?
```

The same drift-detection pattern from ML (covered in `08-machine-learning/17-drift-detection.md`) applies to LLM judge scores. The underlying math is identical; the metric is just different.

---

#### Sampling for cost

At high call volume, logging every call's full prompt + response can be expensive (storage + downstream tools like LangSmith priced per event). Sample.

**Strategies:**
- **Head sampling**: log full trace for 1% of calls; log only summary (counts, latencies) for the rest.
- **Tail sampling**: log full trace if `schema_pass=false`, latency > p99 threshold, or judge score below floor. Drop verbose detail for happy-path calls.
- **Per-chain rates**: high-volume chains get aggressive sampling; low-volume chains keep full traces.

```
  Sampling strategies at 100K calls/day
  
  ┌────────────────────────────────┬────────────────────────────────┐
  │ Strategy                       │ Storage / day                  │
  ├────────────────────────────────┼────────────────────────────────┤
  │ Full trace, no sampling        │ ~100K × 5KB = 500MB             │
  │ 1% head sample + counters      │ ~1K × 5KB + 100K × 100B = 15MB │
  │ Tail sample (fail + p99)       │ ~2K × 5KB + 100K × 100B = 20MB │
  │ Tail + 1% head (recommended)   │ ~3K × 5KB + 100K × 100B = 25MB │
  └────────────────────────────────┴────────────────────────────────┘
```

The recommended pattern: tail sample for problems + 1% head sample for distribution awareness.

---

### Move 3 — The principle

Observability turns "we have a problem" into "here's the call to reproduce." For LLM systems, the per-call trace must include enough to deterministically replay the call — prompt, model version, tool outputs, parameters. Aggregated dashboards detect drift before users do. Sampling controls cost at scale. The discipline is the runtime artifact that makes every other discipline (evals, prompts-as-code, structured outputs) operationally useful in production.

---

## LLM observability — diagram

```
┌─ Application layer ──────────────────────────────────────────────────────────┐
│                                                                              │
│   LLM call:                                                                  │
│     1. assemble prompt (system + tools + messages)                           │
│     2. call provider                                                         │
│     3. parse response                                                        │
│     4. emit trace log entry  ◄─ THE LOAD-BEARING STEP                         │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ structured log
                                      ▼
┌─ Logging infrastructure ─────────────────────────────────────────────────────┐
│                                                                              │
│   Durable store (Datadog / CloudWatch / S3 / LangSmith)                      │
│     keep N days of full traces                                               │
│     index by chain_name, chain_version, model, timestamp                     │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Analytics layer ────────────────────────────────────────────────────────────┐
│                                                                              │
│   Dashboards (per chain + per model):                                        │
│     - call rate, schema-fail rate                                            │
│     - latency distribution (p50, p99)                                        │
│     - token usage (median, p99)                                              │
│     - cost / day                                                             │
│     - quality metric (judge score rolling avg)                               │
│                                                                              │
│   Drift detection:                                                           │
│     - rolling-window stats vs baseline                                       │
│     - alerts on mean shift OR distribution shift (PSI)                       │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Debugging surface ──────────────────────────────────────────────────────────┐
│                                                                              │
│   Query: chain_name = 'coaching-agent' AND user_id = '123' AND               │
│          timestamp = '2026-05-23 15:47:00'                                   │
│   Returns: full trace                                                        │
│   Reproduce: git checkout <chain_version>; replay with same model + prompt   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

The diagram crosses four layers. Skipping any of them leaves a class of bug undebuggable.

---

## In this codebase

**Case B — planned for the coaching agent.**

contrl's planned Phase 4 Path C coaching agent will emit per-call traces with the structure described above. The minimal viable observability surface for contrl's solo-user scale:

- **Sentry breadcrumbs** for the per-call trace (already configured for general app observability).
- **Local SQLite table `llm_calls`** storing the structured fields for offline analysis.
- **Simple JS dashboard** (or just queries) reading the SQLite table.

Hosted LLMOps platforms (LangSmith, Humanloop, PromptLayer) are over-engineered for solo use. The build-your-own approach with structured logging + the existing Sentry setup is sufficient.

**Planned implementation paths:**
- `src/lib/agent/runner.ts` — emits trace via `log.info`
- `src/services/database.ts` — `llm_calls` table migration
- `src/lib/agent/observability.ts` — query helpers for "show recent calls" / "find call by timestamp"

**ML-side observability (already partially planned):** the audit-trail `classifier_outputs` table (B2C.4) is the ML equivalent of per-call traces. Every classifier inference gets a row with `{rep_id, features_json, predicted_label, confidence, model_version, created_at}`. The pattern is identical; the metric is just "model_version + features → label" instead of "chain_version + prompt → response."

---

## Elaborate

**Where this pattern comes from.** Observability for distributed systems is a decade-old discipline (OpenTelemetry, distributed tracing). The LLM-specific adaptation crystallized through 2023–2025 as LLMOps platforms emerged. By 2026, per-call traces with chain_version + model are consensus among production teams.

**The deeper principle.** Observability is the runtime artifact that makes every other discipline operational. Prompts-as-code without observability is half a discipline — you have versioned prompts but no way to map production outputs back to versions. Evals without observability run in dev but can't detect drift in prod. Structured outputs without schema-pass logging tell you nothing about real-world conformance.

**Where this breaks down.** Two places.

1. **Privacy-sensitive content.** Storing full prompt + response for chains handling sensitive user data raises real privacy concerns. Mitigation: hash content, truncate, or store only structural fields. Always make the chain_version + model + schema_pass + latency available; the full content is optional.
2. **Tiny projects.** A side project with one chain that runs 50 times/day doesn't need a full observability stack. Console.log + occasional inspection is fine. The discipline scales with the cost-of-bugs.

**What to explore next.**
- [02-eval-methods](./02-eval-methods.md) — observability + evals together make drift detection meaningful.
- [03-llm-as-judge-bias](./03-llm-as-judge-bias.md) — drift on judge scores requires calibration to be trustworthy.
- prompt-engineering [03-prompts-as-code](../../study-prompt-engineering/03-prompts-as-code.md) — chain_version comes from the prompts-as-code discipline.
- [08-machine-learning/17-drift-detection](../08-machine-learning/17-drift-detection.md) — the ML-side parent concept; same math, different metric.

---

## Tradeoffs

| Cost dimension | Full observability | Classical app monitoring only |
|---|---|---|
| Setup cost | Per-call logger + dashboard | Existing setup |
| Per-call storage | ~5KB/call (sampled: ~100B/call) | Negligible |
| Per-day storage | 25MB at 100K calls/day (sampled) | Negligible |
| Debugging time per bug | minutes (reproduce from trace) | hours (guess + reproduce) |
| Drift detection | Yes | No (until user complaints) |
| Cost overrun detection | Yes (per-chain token tracking) | No (until invoice) |

### Sub-block 1 — what we gave up

The setup work: per-call logger, dashboard, sampling logic, optionally an LLMOps platform integration. For a solo-dev project (contrl), this is a few hours of careful logging plus a SQLite table. For team-scale, it's a few days plus possibly an LLMOps subscription.

The other cost is storage at scale. Full traces at high call volume add up; sampling mitigates but never eliminates. At 100K calls/day with sampling, ~25MB/day = ~10GB/year — tractable on any modern storage.

### Sub-block 2 — what no LLM observability would have cost

Documented bug-investigation pattern without LLM observability:
- User reports bad output. Half a day to find the call. Half a day to guess what the prompt was. Half a day reproducing locally with what you guessed. Hand-comparing the guessed prompt to the production output to confirm.
- Total: ~1.5 days per significant LLM bug.

With observability: query logs → checkout chain_version → reproduce. ~30 minutes.

The cost asymmetry is steep. For a team shipping LLM features regularly, observability pays back in the first non-trivial bug.

### Sub-block 3 — the breakpoint

Observability is the right call until: (a) the LLM surface is genuinely tiny (one chain, used by 10 users); (b) the project is pre-prototype (you're still trying to figure out if the LLM can do the task at all); (c) bugs are tolerable (a fun side project where wrong output is funny, not consequential). For most production LLM work, observability is non-optional.

### Sub-block 4 — what wasn't actually a tradeoff

"Observability is expensive at scale." It's bounded. Sampling (tail + 1% head) brings storage and platform costs to a small fraction of inference cost. The expensive thing is paying nothing for observability and then debugging blind for hours; the cheap thing is paying for observability up front.

---

## Tech reference (industry pairing)

### Datadog / CloudWatch / Sentry (general observability platforms)

- **Codebase uses:** Sentry is already wired into contrl. The plan is to extend it with structured LLM-call traces.
- **Why it's here:** existing monitoring infrastructure; reuse rather than add another tool.
- **Leading today:** Sentry for app-level observability — `adoption-leading` for solo-to-startup projects, 2026.
- **Why it leads:** easy setup, good free tier, breadcrumbs and structured events for ad-hoc traces.
- **Runner-up:** Datadog — feature-richer but heavier; CloudWatch — AWS-tied; OpenTelemetry — standards-based.

### LangSmith / Humanloop / PromptLayer (LLM-specific observability)

- **Codebase uses:** Not yet — over-engineered for contrl's solo scale.
- **Why it's here:** hosted LLMOps platforms with prompt versioning, trace UI, eval integration, A/B testing primitives.
- **Leading today:** LangSmith — `innovation-leading` for LangChain-leaning teams, 2026.
- **Why it leads:** integrates with LangChain (LLM orchestration leader); traces for multi-step chains; A/B test primitives; eval integration.
- **Runner-up:** Humanloop, PromptLayer — comparable features; choose by team preference for UX and pricing.

### Per-call trace schema (industry pattern)

- **Codebase uses:** Planned shape documented above.
- **Why it's here:** the de facto convention across LLMOps platforms — chain_name, chain_version (commit SHA), model, prompt, response, tokens_in/out, schema_pass, latency_ms, tool_calls.
- **Leading today:** the LangSmith trace shape — `adoption-leading` because of LangChain's reach, 2026.
- **Why it leads:** widely-recognized; compatible with multiple downstream tools.
- **Runner-up:** OpenTelemetry's nascent LLM spans (under development) — standards-track but less mature.

---

## Project exercises

### [B4C.observability] Add per-call trace logging to the coaching agent

- **Exercise ID:** `[B4C.observability]` (hypothetical, post-Phase 4)
- **What to build:** A `src/lib/agent/runner.ts` wrapper that emits a structured trace per LLM call to Sentry (breadcrumb) + SQLite (`llm_calls` table). Include chain_version (commit SHA baked at build), model, prompt, response, tokens, schema_pass, latency_ms, and any tool_calls in the loop.
- **Why it earns its place:** the runtime artifact that makes every other discipline (prompts-as-code, evals, structured outputs) operationally useful in production.
- **Files to touch:** `src/lib/agent/runner.ts` (new), `src/services/database.ts` (add `llm_calls` table migration), `src/lib/build/bake-prompt-versions.ts` (already planned for prompts-as-code).
- **Done when:** running the coaching agent emits a trace; SQLite contains the row; a "show recent calls" query returns the trace.
- **Estimated effort:** `1–2 days`

### [B4C.drift] Add quality drift detection

- **Exercise ID:** `[B4C.drift]` (hypothetical, post-Phase 4)
- **What to build:** Rolling-window judge-score tracking. Compute weekly mean of judge scores; alert when current week diverges from baseline by >2σ.
- **Why it earns its place:** the metric that catches model-upgrade-related quality drops at hour zero instead of day three.
- **Files to touch:** `src/lib/agent/observability.ts` (drift computation), dashboard / report file.
- **Done when:** synthetic test injecting a quality drop produces an alert; baseline computation persists.
- **Estimated effort:** `1–4hr`

---

## Summary

LLM observability is the runtime artifact that turns "we have a problem" into "here's the call to reproduce." Per-call traces include chain_version (commit SHA), model, prompt, response, token counts, schema_pass, latency. Aggregated dashboards detect drift before users do. Sampling controls cost at scale (tail + 1% head). Without it, every LLM bug is a research project. For contrl: Case B for the planned coaching agent; the ML-side audit trail (`classifier_outputs` table) is the parallel ML observability surface.

**Key points:**

- **Per-call trace with chain_version, model, full prompt + response.** Enables deterministic reproduction.
- **Aggregated dashboards: rate, schema-fail, latency, tokens, cost, quality.**
- **Drift detection on quality metrics** (judge scores, schema-pass rate) catches model-upgrade regressions early.
- **Sampling strategies at scale:** tail (failures + p99) + 1% head sample.
- **For contrl: planned via Sentry + local SQLite; LLMOps platforms over-engineered for solo use.**

---

## Interview defense

### What an interviewer is really asking

When asked "how do you observe LLM systems in production?", they want to hear the trace shape + the reproduce-deterministically discipline + drift detection. The shipped answer names chain_version + model + full prompt + the dashboard surface. The unshipped answer is "we use Sentry" without explaining what's logged.

### Likely questions

**[mid] What do you log per LLM call?**

Chain name, chain version (commit SHA of the prompt files), model name, the assembled prompt, the response, tokens in and out, schema-pass status, latency, and any tool calls in the loop. With these, you can reproduce the call deterministically — git checkout the chain_version, hit the same model, replay the prompt. Without them, debugging is interpretive.

```
  Trace fields → debugging operations
  
  chain_version → git checkout (reproduce prompt)
  model         → use the right model (drift detection)
  prompt        → replay the exact input
  response      → confirm match
  schema_pass   → catch structural bugs
  latency       → user-experience tracking
```

---

**[senior] How do you detect quality drift?**

LLM-as-judge scores collected on a rolling window — say weekly mean of judge scores on a sample of production traffic. Alert when the current window's mean diverges from baseline by >2σ. For distribution-shape changes (not just mean), use PSI from the ML drift-detection toolkit. The trigger is typically: model upgrade, prompt change, or production distribution shift. Drift detection turns "users complained" into "alert fired at hour zero."

```
  Drift detection on judge scores
  
  baseline window (weeks W-4 to W-1): mean = 4.2, σ = 0.15
  current window (week W):              mean = 3.9, σ = 0.21
  
  Δ = -0.3 = -2σ  → alert
  
  Investigate: did the model swap? did the prompt change?
```

---

**[arch] How do you handle observability at high LLM call volume?**

Sampling. At 100K calls/day, full traces for every call cost storage and platform fees. Tail sample (always log on `schema_pass=false`, latency above p99, or judge score below floor) + 1% head sample for distribution awareness. This keeps storage at ~25MB/day instead of 500MB while preserving the failure traces that actually need investigation. For chains with high cost per call (large models, long prompts), increase the sample rate.

```
  Sampling at scale
  
  ┌─────────────────────────────────┬──────────────────────────┐
  │ Sampling strategy               │ Storage at 100K calls/day │
  ├─────────────────────────────────┼──────────────────────────┤
  │ No sampling (full traces)        │ ~500MB                    │
  │ 1% head + tail (recommended)    │ ~25MB                     │
  │ Tail only (failures + p99)      │ ~10MB                     │
  └─────────────────────────────────┴──────────────────────────┘
```

---

### The question candidates always dodge

**"Just use LangSmith and you're done."**

LangSmith (or any LLMOps platform) is one piece of the stack. The platform handles trace storage, UI, and some dashboards. But: the trace shape, what to log, sampling decisions, drift detection thresholds, alerting integration — all of those are codebase decisions you make regardless of platform. "Just use LangSmith" without thinking about *what* to log produces traces that don't help debugging because critical context (chain_version, tool outputs) isn't captured. Platform is a fraction; discipline is the rest.

```
  Platform vs discipline split
  
  Platform handles               You decide
  ─────────────────────────      ───────────────────────────────────
  Trace storage                  What fields to log
  Trace UI                       Sampling strategy
  Some dashboards                 What metrics to track
  Eval runners                   Drift thresholds + alerts
  A/B test primitives             Privacy / PII handling
```

---

### One-line anchors

- "Per-call trace: chain_version + model + prompt + response + tokens + schema_pass."
- "Aggregated dashboards: rate, fail-rate, latency, cost, quality."
- "Drift detection on judge scores — model upgrade canary."
- "Sampling at scale: tail (failures + p99) + 1% head."
- "Reproduce deterministically — git checkout + replay."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the four-layer pipeline: application → logging → analytics → debugging.

Pass: all four layers in order with one example per layer.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "How do you observe LLM systems in production?" Checkpoints:
- Did you name the trace fields (chain_version + model at minimum)?
- Did you mention drift detection?
- Did you mention sampling at scale?

**Level 3 — Apply to a new scenario.**
A user reports a bad coaching message at a specific timestamp. Walk through the reproduce steps. Reference contrl's planned `llm_calls` SQLite table.

Expected: query `llm_calls` WHERE user_id = X AND created_at = T. Extract chain_version + model + prompt + tool_calls. `git checkout chain_version`. Replay with same model + same prompt + same tool outputs. Compare to logged response — they should match (within sampling noise from temperature). Now debug locally.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is storage at scale. If you were a startup at 100K calls/day, would you use 1% head sampling or sample only failures?

There's no right answer. Defend with reference to debugging needs (failures + p99 + 1% baseline gives distribution awareness; failures only loses the baseline).

**Quick check — code reference test.**
Without opening files, answer:
- What's the minimum trace field set?
- What's the storage cost at 100K calls/day with recommended sampling?
- Does contrl plan to use LangSmith?

Pass: chain_version + model + prompt + response + schema_pass + latency; ~25MB/day; no — too over-engineered for solo use; will use Sentry + local SQLite.

---
Updated: 2026-05-29 — Dropped "loopd /" prefix from the call-wrapper code comment per v1.43.0 Hard repo-scope rule; comment now contrl-only.
