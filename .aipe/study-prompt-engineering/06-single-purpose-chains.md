# Single-purpose chains

**Industry name(s):** Single-purpose chains, single-responsibility chains, chain pipeline, prompt decomposition
**Type:** Industry standard

> One chain, one job. Compose them into longer flows. When something fails, you know which chain failed. When you need a smaller cheaper model for the classifier and a frontier model for the generator, the split is already there.

**See also:** → [01-anatomy](./01-anatomy.md) · → [07-output-mode-mismatch](./07-output-mode-mismatch.md) · → [09-chain-of-thought](./09-chain-of-thought.md) · → [10-self-critique](./10-self-critique.md)

---

## Why care

**Move 1.** You write a chain that takes a journal entry and (a) classifies the entry's intent, (b) extracts tags, (c) writes a caption, and (d) generates a search-query rewrite for the day's other entries. One LLM call, one big prompt, four jobs. It works in dev. Three weeks in, the caption quality drops. You debug. The prompt mixes four jobs; you can't tell whether the caption regressed because the classifier instructions distracted the model, or because the tag examples confused it, or because the search-rewrite section grew. You don't know which knob to turn. You don't know how to A/B test just the caption part without disturbing the others.

**Move 2.** That "which job is failing, and how do I tune just that one" question is what single-purpose chains answer. Not the prompt design. Not the model choice. Just the decomposition: each chain does exactly one thing, returns one shape of output, and gets composed with other chains into longer flows. When something fails, you know which chain it was. When you want a cheap model for one job and an expensive one for another, you can route per chain.

**Why you need to answer that question at all:** Three failure modes hide in the multi-purpose chain. First, **debugging is impossible** — a multi-purpose chain failure surfaces as "the output was wrong" without telling you which job was wrong. Second, **iteration is dangerous** — tweaking one job's instructions risks distorting another's. Third, **cost is fixed at the most expensive job** — a chain that does classification + generation runs the whole prompt on the generation-grade model, even though the classifier could have run on a much cheaper one. At any scale, this is real money. Loopd's planned chain split (intent-classify, tag-extract, caption, search-rewrite, summary) is the canonical instance — five chains because five jobs.

**Before / after.**

Without single-purpose chains (one chain does everything):
- Chain takes 1500 tokens of prompt, runs on Sonnet 4 (because the caption needs it), costs $0.005 per call.
- Caption quality drops. You don't know if it's the classifier instructions, the tag examples, or the caption section itself. Three days of A/B testing variations of the whole prompt.
- A new contributor asks "how do I add a fifth job?" Answer: rewrite the whole prompt.

With single-purpose chains:
- 5 chains. intent-classify (200 tokens, Haiku, $0.0001/call). tag-extract (500 tokens, Haiku). caption (800 tokens, Sonnet 4, $0.003). search-rewrite (300 tokens, Haiku). summary (8000 tokens, Sonnet 4, $0.012).
- Total cost per entry: ~$0.015 (vs $0.005 × 5 if everything ran on Sonnet = $0.025). Cheaper, despite using more API calls.
- Caption quality drops. You diff the caption chain's regression suite. You see the regression case. You tune just the caption prompt.
- New job (entity-extract): new chain folder. No risk to existing 5.

**Move 5.** Single-purpose chains are what single-responsibility functions are for application code — one job each, composed into longer flows, named at the right level of abstraction. The chain is the function; the pipeline is the calling code.

---

## How it works

### Move 1 — The mental model

Picture a backend pipeline: `parseRequest()` → `validateAuth()` → `executeBusinessLogic()` → `serializeResponse()`. Four steps, each a single function, each with a typed input and output, composed into a request handler. If `validateAuth` fails, the failure is local; you know exactly which step misbehaved. If `executeBusinessLogic` needs to call a more expensive service, only that step pays the cost.

A chain pipeline is the same — except each step is an LLM call instead of a function call.

The strategy in plain English: **one chain = one job = one input shape = one output shape; chains compose into pipelines.**

```
  Single-purpose chain pipeline (the function-call analogy)

  user input
       │
       ▼
  ┌────────────────────┐
  │ intent-classify    │ ◄─ Haiku, 200-token prompt, $0.0001
  │ in:  string         │
  │ out: {label, conf} │
  └─────────┬──────────┘
            │ {label, conf}
            ▼
  ┌────────────────────┐
  │ tag-extract        │ ◄─ Haiku, 500 tokens
  │ in:  string         │
  │ out: {tags: [...]} │
  └─────────┬──────────┘
            │ {tags}
            ▼
  ┌────────────────────┐
  │ caption            │ ◄─ Sonnet 4, 800 tokens, $0.003
  │ in:  entry + tags  │
  │ out: {caption}     │
  └─────────┬──────────┘
            │ {caption}
            ▼
  result composed from per-chain outputs
```

A reader sees the pipeline in 10 seconds: five chains, five outputs, composed. The shape is identical to a function-composition pipeline you'd write in any other context.

---

### Move 2 — The layered walkthrough

#### One chain, one job, one shape

If you're coming from frontend, this is the React hooks rule that one hook does one job — `useUser`, `useTodos`, `useTheme`. Mixing three concerns into one hook is what produces "this re-renders too much" bugs. Same for chains. Mixing concerns produces undebugger prompts.

The discipline:

- **One named job per chain.** "Classify intent" is one job. "Classify intent and extract tags" is two.
- **One input type.** A chain takes one shape of input. If multiple shapes apply, you have two chains.
- **One output type.** A chain returns one shape. If you find yourself returning `{ result, alsoReturnedThing }` where `alsoReturnedThing` is unrelated, that's two chains.

```ts
// loopd/src/lib/llm/chains/intent-classify/chain.ts (planned)
export async function classifyIntent(input: string): Promise<IntentResult> {
  // does ONE thing: classify the input
  // returns ONE shape: { label, confidence }
}

// loopd/src/lib/llm/chains/tag-extract/chain.ts (planned)
export async function extractTags(input: string): Promise<TagsResult> {
  // does ONE thing: extract tags
  // returns ONE shape: { tags: string[] }
}
```

Boundary condition: "one job" isn't "one sentence of instructions." The intent classifier's prompt has many sentences of rules; that's still one job. The signal of multi-purpose-ness is the *output shape* — if the output combines two unrelated concerns (a classification AND a generation), it's two chains.

---

#### Composing chains into pipelines

Pipelines are application code, not prompts. A pipeline calls chain A, takes its output, calls chain B with it, takes that output, calls chain C, and so on. The composition lives in TypeScript, not in any single chain's prompt.

```ts
// loopd/src/lib/journal/process-entry.ts (planned)
export async function processEntry(rawEntry: string): Promise<ProcessedEntry> {
  const intent = await classifyIntent(rawEntry);
  const tags = await extractTags(rawEntry);

  // Branch on intent
  if (intent.label === 'chat') {
    const caption = await generateCaption(rawEntry, tags.tags);
    return { intent, tags, caption };
  }
  if (intent.label === 'search') {
    const query = await rewriteSearchQuery(rawEntry);
    return { intent, tags, searchQuery: query };
  }
  // 'command' branch...
}
```

Notice: the pipeline contains the branching logic. The chains don't know about each other. Each chain is callable independently and testable independently. The pipeline is the orchestrator.

```
  Pipeline orchestration (application code, not prompts)

  ┌──────────────────────────────────────┐
  │ processEntry(rawEntry)               │
  │   ▼                                  │
  │   intent = await classifyIntent(rawEntry)  ◄─ chain 1
  │   ▼                                  │
  │   tags = await extractTags(rawEntry)       ◄─ chain 2 (parallel-safe)
  │   ▼                                  │
  │   if (intent.label === 'chat')              │
  │     caption = await generateCaption(...)   ◄─ chain 3
  │   else if (intent.label === 'search')      │
  │     query = await rewriteSearchQuery(...)  ◄─ chain 4
  │   ▼                                  │
  │   return composed result             │
  └──────────────────────────────────────┘
```

Boundary condition: chains 1 and 2 in the above flow can run in parallel — they're independent. The pipeline orchestrator should `Promise.all` them to halve latency. This optimization is invisible if everything is one big chain.

---

#### Per-chain model routing

Each chain declares its target model. The cheap-classifier-expensive-generator pattern emerges from this.

```json
// loopd/src/lib/llm/chains/intent-classify/meta.json (planned)
{ "model": "claude-haiku-4-5-20251001", "tested_at": "2026-05-15", "eval_score": 0.96 }
```

```json
// loopd/src/lib/llm/chains/caption/meta.json (planned)
{ "model": "claude-sonnet-4-6", "tested_at": "2026-05-15", "eval_score": 0.89 }
```

The intent classifier is a 3-way categorical problem with strong examples — Haiku handles it at 96% accuracy. The caption is a generative task with subjective quality requirements — needs Sonnet 4.

```
  Cost comparison: routed vs unrouted

  All-on-Sonnet                      Routed per chain
  ──────────────────────────         ──────────────────────────────
  classify:    Sonnet 4, $0.0015     classify:    Haiku, $0.0001
  tag-extract: Sonnet 4, $0.0025     tag-extract: Haiku, $0.0003
  caption:     Sonnet 4, $0.003      caption:     Sonnet 4, $0.003
  search:      Sonnet 4, $0.0015     search:      Haiku, $0.0002
  summary:     Sonnet 4, $0.012      summary:     Sonnet 4, $0.012
                                                  
  total: $0.0205/entry               total: $0.0156/entry
                                     ~24% cheaper
```

Boundary condition: routing requires per-chain evals to verify the cheap model is actually good enough. If Haiku passes the intent-classifier eval suite at 96% and Sonnet 4 passes at 97%, the 1% delta isn't worth 15x the cost. If Haiku passes at 78% and Sonnet 4 at 96%, the cheap routing is a quality regression. The eval discipline (see [05-eval-driven-iteration](./05-eval-driven-iteration.md)) determines what gets routed where.

---

#### Failure localization

When the user reports "the output was wrong on entry X," the pipeline's logging tells you which chain produced the wrong output. Each chain's call is a separate log entry with `chain_name`, `chain_version`, `input`, `output`, `schema_pass`. Walk the trace, find the chain that produced the bad output, debug that chain in isolation.

```
  Multi-purpose chain failure                 Single-purpose chain failure
  ─────────────────────────────────           ─────────────────────────────────
  "output was wrong"                          "caption was wrong"
  → 1 log entry: "the chain ran"              → 5 log entries
                                                ↓ intent-classify: ok
                                                ↓ tag-extract: ok
                                                ↓ caption: WRONG output ◄─ here
                                                ↓ (skipped)
  → which job failed? unknown                 → caption chain's last 50 calls
  → debugging starts with reading              → which inputs hit this failure?
    the whole prompt                          → what's the pattern?
                                              → fix caption chain in isolation
```

Boundary condition: failure localization only works if each chain emits its own log entry with input + output. A pipeline that logs only the final composed result loses the per-chain visibility. The discipline is per-chain logging, not pipeline logging.

---

### Move 2.5 — Current state vs future state (planned loopd)

Loopd's planned 5-chain split is the canonical example. The shape across phases:

```
                Phase A (planned, B1.x)              Phase B (planned, B2.x)
                Five basic chains                    Five chains + a coaching agent
  ────────────────────────────────────────       ─────────────────────────────────────
  ┌──────────────────────────┐                  ┌─────────────────────────────────────┐
  │ intent-classify (Haiku)  │                  │ intent-classify (Haiku)             │
  │ tag-extract     (Haiku)  │                  │ tag-extract     (Haiku)             │
  │ caption         (Sonnet) │                  │ caption         (Sonnet 4)           │
  │ search-rewrite  (Haiku)  │                  │ search-rewrite  (Haiku)             │
  │ end-of-day-summary (Sonnet) │              │ end-of-day-summary (Sonnet)         │
  │                          │                  │ coaching-agent  (Sonnet, with tools) │
  └──────────────────────────┘                  └─────────────────────────────────────┘

  Each chain in its own folder.                 The coaching agent calls into the
  Pipelines compose them.                       existing chains via tool calling.
                                                The five basic chains stay unchanged.

  The single-purpose discipline is what
  makes the Phase B addition non-disruptive.
```

The lesson: when the discipline holds, adding new capabilities is additive (new chain, new tools, new pipeline). When the discipline breaks (one chain doing everything), adding a capability means rewriting the existing chain.

---

### Move 3 — The principle

Single-purpose chains apply the single-responsibility principle from software design to LLM calls. The job of each chain is named at exactly one level of abstraction; composition lives in application code; routing per chain emerges naturally; debugging localizes. Every prompt-engineering discipline downstream (evals, structured outputs, observability) assumes single-purpose chains — multi-purpose chains break those disciplines because there's no single output to evaluate, no single schema to enforce, no single chain_version that explains a failure.

The full picture is below.

---

## Single-purpose chains — diagram

A typical pipeline showing chain decomposition, per-chain model routing, and pipeline orchestration.

```
┌─ Pipeline orchestrator (application code, TypeScript) ───────────────────────┐
│                                                                              │
│   processJournalEntry(rawEntry):                                             │
│                                                                              │
│     ┌────────────┐  parallel  ┌────────────┐                                 │
│     │ classify   │            │ extract    │                                 │
│     │ intent     │            │ tags       │                                 │
│     │ (Haiku)    │            │ (Haiku)    │                                 │
│     └─────┬──────┘            └─────┬──────┘                                 │
│           │                         │                                        │
│           ▼ {intent}                ▼ {tags}                                 │
│           └──────────┬──────────────┘                                        │
│                      │                                                       │
│                      ▼ (branch on intent.label)                              │
│       ┌──────────────┼──────────────┐                                        │
│       │              │              │                                        │
│       ▼              ▼              ▼                                        │
│  ┌─────────┐  ┌─────────┐    ┌─────────┐                                     │
│  │ caption │  │ search  │    │ command │                                     │
│  │ (Sonnet)│  │ rewrite │    │ handle  │                                     │
│  │         │  │ (Haiku) │    │ (no LLM)│                                     │
│  └────┬────┘  └────┬────┘    └────┬────┘                                     │
│       │            │              │                                          │
│       ▼            ▼              ▼                                          │
│       └──────┬─────┴──────────────┘                                          │
│              │                                                               │
│              ▼ compose result                                                │
│       { intent, tags, caption | searchQuery | commandResult }                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

  Each chain:
    - own folder (chains/<name>/{system.md, examples.md, chain.ts, meta.json, tests/})
    - own model (set per chain via meta.json)
    - own eval suite
    - own production log entry

  Pipeline:
    - lives in application code, not in any prompt
    - branches on chain outputs
    - parallelizes independent chains where possible
    - composes per-chain outputs into the final result
```

The pipeline is application code; the chains are prompts. The separation matters — every other discipline (evals, structured outputs, observability) attaches to the chains; the pipeline is just orchestration.

---

## In this codebase

**Case B — loopd's 5 chains (planned).**

The canonical instance of single-purpose chains in the portfolio. Per `aieng-curriculum.md` Phase 1 / Phase 2A builds:

- **intent-classify** (planned `loopd/src/lib/llm/chains/intent-classify/`) — 3-way categorical (chat/search/command). Haiku-grade. Curriculum item B1.7.
- **tag-extract** (planned `loopd/src/lib/llm/chains/tag-extract/`) — extract 0-5 tags from entry. Haiku-grade. Curriculum item B1.17.
- **caption** (planned `loopd/src/lib/llm/chains/caption/`) — generative short caption. Sonnet-grade. Curriculum item B1.20.
- **search-rewrite** (planned `loopd/src/lib/llm/chains/search-rewrite/`) — reformulate search query with context. Haiku-grade. Curriculum item B2A.5.
- **end-of-day-summary** (planned `loopd/src/lib/llm/chains/end-of-day-summary/`) — synthesize the day's entries. Sonnet-grade. Curriculum item B1.25.

Not yet on disk. Each chain will have its own folder following the prompts-as-code discipline (see [03-prompts-as-code](./03-prompts-as-code.md)).

**Case B — aipe slash commands as quasi-chains.**

aipe's slash commands aren't runtime LLM calls, but the single-purpose discipline still applies — each spec does one thing. `/aipe:refactor` refactors. `/aipe:study` generates study guides. `/aipe:audit-refactor` produces audit notebooks. They don't mix: there's no `/aipe:refactor-and-study` because that would be two jobs.

- **`/Users/rein/Public/aipe/specs/refactor.md`** — one job: take a refactor intent and produce a refactor spec file.
- **`/Users/rein/Public/aipe/specs/study.md`** — one job: generate a study guide for the current codebase.
- **`/Users/rein/Public/aipe/specs/audit-refactor.md`** — one job: produce a 6-chapter opinion book.

When `/aipe:study` needs to "also" look at the curriculum, it does so by reading the curriculum file itself, not by calling another spec. The composition is the agent's file-reading mid-execution, not slash-command-calls-slash-command.

---

## Elaborate

**Where this pattern comes from.** Single-purpose chains emerged from the same lineage as single-responsibility functions in 1990s software engineering. The LLM-specific framing appeared around 2023, formalized through 2024 as multi-step LLM pipelines became common (LangChain, then Vercel AI SDK, then native provider tool-calling). By 2025, "one chain one job" is consensus among practitioners shipping LLM features at scale.

**The deeper principle.** Multi-purpose anything fails for the same reason in any layer of software: the failure modes interact in ways that aren't decomposable. A function that does "validate AND save AND notify" fails in ways that aren't the union of validation failures + save failures + notify failures — they entangle. A chain that does "classify AND extract AND generate" has the same property. The discipline of one-job-per-unit isn't about clean code; it's about the *debuggability* of the resulting system.

**Where this breaks down.** Two cases.

1. **Genuinely composite outputs.** A chain whose output is structurally inseparable — say, a fact-extraction task where each fact must reference its source — can't be split into "extract facts" + "find sources" because the model is producing the linkage in one pass. Forcing the split would require the chain that finds sources to re-read the text, which is expensive and may diverge.
2. **Very tight latency budgets.** Each chain hop adds 100–500ms of latency. A pipeline of 5 sequential chains is 500ms–2.5s minimum. For a streaming UI feature where every 100ms matters, one larger chain may be the right call despite the debugging cost. (Parallel chains don't suffer this; only sequential ones.)

**What to explore next.**
- [01-anatomy](./01-anatomy.md) → the four-section structure that lives inside each chain.
- [07-output-mode-mismatch](./07-output-mode-mismatch.md) → the bug that single-purpose chains expose (and that multi-purpose chains hide).
- [02-structured-outputs](./02-structured-outputs.md) → the schema that makes per-chain outputs typed and validatable.
- LangChain's expression language (LCEL) documentation for the composition shape, even if you're not using LangChain.

---

## Tradeoffs

| Cost dimension | Single-purpose chains | Multi-purpose chain |
|---|---|---|
| Chain count | 5 per pipeline | 1 |
| Per-call latency | Sequential: 500ms–2.5s; parallel: ~500ms | One round-trip: ~500ms |
| Total cost per entry | Routed: $0.015 | Sonnet-grade everything: $0.025 |
| Debuggability | High — per-chain logs localize | Low — one log entry, all-or-nothing |
| Iteration safety | High — tune one chain in isolation | Low — every change touches everything |
| Onboarding | New chain = new folder | New job = rewrite the whole prompt |
| Composition flexibility | High — pipeline branches per chain output | Low — branching inside one prompt is fragile |

### Sub-block 1 — what we gave up

Two costs. First, **sequential latency.** Five sequential chains take 5x the round-trips of one chain. The mitigation is parallelization where chains are independent (intent-classify and tag-extract can run in parallel), but sequential dependencies remain (caption needs the tags). For loopd's planned flow, the pipeline parallelizes the first two chains, then sequentially runs caption. End-to-end latency ~700ms vs ~500ms for one giant chain.

Second, **orchestration overhead.** The pipeline file itself is real code — branching logic, parallelization, error handling. For loopd's 5-chain pipeline, the orchestrator is probably 100–200 lines of TypeScript. Not exotic, but real.

### Sub-block 2 — what the multi-purpose alternative would have cost

I have shipped the multi-purpose alternative. Costs at month-by-month:

- Month 1: chain works. Tests pass. One big prompt, four jobs. Looks fine.
- Month 2: caption quality drops in production. Two days of A/B testing variations of the whole prompt. Finally narrow to "the tag examples are biasing the model toward keyword captions." Tune. Quality recovers.
- Month 3: PM wants to add a "is this entry private" classifier as a fifth job. Tries to add to the existing prompt. Now the model is doing five things. Tag examples drift again. Caption regresses again. Back to A/B testing.
- Month 5: cost spike. Investigation: every call uses Sonnet 4 because the caption job needs it, but the four other jobs could have run on Haiku. Routing impossible because it's all one chain. Refactor to single-purpose chains. Three weeks of work.

Single-purpose from Day 1 prevents all of this.

### Sub-block 3 — the breakpoint

Single-purpose chains are the right call until: (a) the pipeline has only one job (single chain is the entire pipeline; the "single-purpose" discipline is trivially satisfied with no orchestration overhead); (b) latency is so tight that even parallelized 700ms is unacceptable AND the multi-purpose prompt actually works (which is rarer than people think); (c) the jobs are deeply entangled such that splitting them produces worse outputs than keeping them together (rare; usually the entanglement is an illusion of prompt design rather than a real constraint).

### Sub-block 4 — what wasn't actually a tradeoff

"More API calls is more failure surface." Sounds reasonable; isn't true in practice. Each chain call can fail (network error, rate limit, schema fail), and a 5-chain pipeline has 5 failure points to a 1-chain pipeline's 1. But the failure modes are independent and observable — when chain 3 fails, the pipeline knows it was chain 3, can retry just that chain, and can decide whether to abort or fall back. The 1-chain pipeline's "single failure point" is also "single, harder-to-diagnose failure point." More failures of known kind beats fewer failures of unknown kind.

---

## Tech reference (industry pairing)

### Vercel AI SDK (chain orchestration)

- **Codebase uses:** Not yet — planned for loopd's pipeline orchestrator.
- **Why it's here:** the TypeScript-native library for assembling LLM chains and streams in production frontend/full-stack code. Handles streaming, tool calling, and chain composition.
- **Leading today:** Vercel AI SDK — `innovation-leading` for TypeScript LLM orchestration, 2026.
- **Why it leads:** typed end-to-end (chain inputs/outputs are TypeScript types), streaming-native (handles partial outputs naturally), framework-agnostic.
- **Runner-up:** LangChain JS — `adoption-leading` for orchestration in production codebases; larger surface area, often more than the chain actually needs.

### Claude Haiku for classifier-grade chains

- **Codebase uses:** Not yet — planned as the model for intent-classify, tag-extract, search-rewrite.
- **Why it's here:** the cost-grade model for routine classification and extraction. Sonnet-quality on simple tasks at ~15x lower cost.
- **Leading today:** Claude Haiku 4.5 — `adoption-leading` for cheap, fast classification, 2026.
- **Why it leads:** $0.80/1M input, $4/1M output (vs Sonnet 4 $3/1M and $15/1M); latency in the 200-400ms range vs Sonnet's 400-800ms.
- **Runner-up:** GPT-4o mini — comparable price/quality on OpenAI side.

### Claude Sonnet for generative chains

- **Codebase uses:** Not yet — planned as the model for caption, end-of-day-summary, and the coaching agent.
- **Why it's here:** the generation-quality model where Haiku would visibly underperform.
- **Leading today:** Claude Sonnet 4.6 — `adoption-leading` for production generative quality, 2026.
- **Why it leads:** large attention budget, strong instruction-following on subjective tasks, prompt caching support.
- **Runner-up:** GPT-4o — comparable; choice depends on which tokenizer and prompt style the chain was tuned against.

### Promise.all parallelization

- **Codebase uses:** Not yet — planned in the pipeline orchestrator for independent chains.
- **Why it's here:** the language primitive that turns sequential chains into parallel chains where the data dependency permits.
- **Leading today:** Built-in JavaScript `Promise.all` — `adoption-leading`, 2026.
- **Why it leads:** zero-dependency, well-understood, supports per-promise error handling via `Promise.allSettled`.
- **Runner-up:** RxJS/Observables for streaming chains; `p-map` for concurrency-limited parallel calls.

---

## Project exercises

### [B1.17] Decompose the entry-processing flow into 5 chains

- **Exercise ID:** `[B1.17]`
- **What to build:** 5 chain folders (intent-classify, tag-extract, caption, search-rewrite, end-of-day-summary). Each follows the prompts-as-code shape — system.md, examples.md, chain.ts, meta.json. Plus a `processEntry` pipeline function that orchestrates them.
- **Why it earns its place:** the architectural decision that shapes every later loopd LLM build. Single-purpose chains have to be the starting state, not an aspirational refactor.
- **Files to touch:** `loopd/src/lib/llm/chains/<name>/` × 5 plus `loopd/src/lib/journal/process-entry.ts`.
- **Done when:** the pipeline runs end-to-end on a sample input; each chain has its own meta.json; per-chain regression tests exist (even if minimal).
- **Estimated effort:** `1 week`

### [B1.18] Parallelize independent chains

- **Exercise ID:** `[B1.18]`
- **What to build:** Modify the pipeline orchestrator so intent-classify and tag-extract run in parallel (they're independent of each other). Measure latency before/after.
- **Why it earns its place:** the cheap-and-obvious latency optimization that single-purpose chains enable. One change, ~30% latency reduction.
- **Files to touch:** `loopd/src/lib/journal/process-entry.ts`.
- **Done when:** `Promise.all([classifyIntent(input), extractTags(input)])` replaces sequential calls; measured latency improvement documented.
- **Estimated effort:** `<1hr`

### [B1.19] Route chains to per-task models

- **Exercise ID:** `[B1.19]`
- **What to build:** Set each chain's `meta.json.model` to its appropriate target. Verify per-chain evals pass. Measure cost per pipeline call against the all-Sonnet baseline.
- **Why it earns its place:** the cost optimization that proves the architecture pays back. The discipline goes from "nice to have" to "saves measurable money."
- **Files to touch:** `meta.json` per chain; the runner that reads `meta.model` and selects the API model.
- **Done when:** classify/tag/search are on Haiku; caption/summary are on Sonnet; cost-per-entry measurement is documented in `docs/ml-results.md`.
- **Estimated effort:** `1–4hr`

---

## Summary

Single-purpose chains apply single-responsibility to LLM calls — one chain, one job, one input shape, one output shape, composed by application code into pipelines. The benefits are debuggability (failures localize), iteration safety (tune one chain in isolation), and cost (route cheap models to cheap tasks). The cost is more chain files, modest orchestration overhead, and slightly higher latency unless parallelized. The discipline is non-negotiable for production multi-step LLM systems; loopd's planned 5-chain split is the canonical instance.

**Key points:**

- **One chain = one job = one shape.** If the output combines unrelated concerns, it's two chains.
- **Pipelines are application code.** Composition lives in TypeScript, not in any prompt.
- **Model routing per chain.** Haiku for classifiers; Sonnet for generation. The split is invisible if everything is one chain.
- **Parallel-safe independent chains.** Intent-classify and tag-extract can run in parallel; the pipeline should.
- **Per-chain logging.** Each chain emits its own log entry with chain_name, chain_version, input, output, schema_pass.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "how do you structure a multi-step LLM feature?", they want to hear whether you decompose by job or by call. The shipped answer is one chain per job, pipelines compose them, model routing per chain. The unshipped answer is "I write one big prompt and it does everything." The interview signal is whether you mention cost routing and failure localization without being prompted.

### Likely questions

**[mid] Why split a feature into multiple chains?**

Because debugging one big chain is harder than debugging five small ones. When a multi-purpose chain fails, you don't know which job failed; when a five-chain pipeline fails, the per-chain logs tell you exactly where. Plus model routing — a classifier can run on Haiku for cents; a generative caption needs Sonnet. The split is what lets you pay the cheap price for the cheap task.

```
  Single chain                       Pipeline of single-purpose chains
  ─────────────────────              ─────────────────────────────────
  one prompt                         5 prompts in 5 folders
  one model (most expensive needed)  routed model per chain
  one log entry                      5 log entries
  one debugging surface              localized debugging
```

---

**[senior] Walk me through how a pipeline orchestrator looks in practice.**

It's TypeScript. It calls chain 1, awaits the typed result. If chain 2 is independent of chain 1's output, it runs them in parallel with `Promise.all`. It branches on chain outputs to decide which downstream chains to call. It composes per-chain results into the final shape. The orchestrator is just application code — no LLM in the orchestrator itself. The LLM lives only inside each chain. This separation matters because the orchestrator gets tested with deterministic mocks (mock the chain functions, test the branching logic) while the chains get tested with their eval suites against real model calls.

```ts
async function processEntry(rawEntry: string) {
  const [intent, tags] = await Promise.all([
    classifyIntent(rawEntry),
    extractTags(rawEntry),
  ]);
  
  if (intent.label === 'chat') {
    return { intent, tags, caption: await generateCaption(rawEntry, tags.tags) };
  }
  // ... other branches
}
```

```
  Two layers, separately testable
  ┌──────────────────────────────────────────┐
  │ Orchestrator                              │
  │   tested with mocked chain functions      │
  │   branching logic, parallelization        │
  └────────────────┬─────────────────────────┘
                   │
  ┌────────────────┴─────────────────────────┐
  │ Chains                                    │
  │   tested with eval suites against real    │
  │   LLM calls                                │
  └──────────────────────────────────────────┘
```

---

**[arch] How does this scale at 100×?**

Three things matter more at scale. First, **routing cost savings compound** — at 100k calls/day, $0.01 saved per call is $1000/day, $30k/month. Routing pays for itself in a week. Second, **parallelization matters more** — single-user latency improvements multiply by user count. Third, **per-chain observability becomes essential** — at 100k calls/day, "the pipeline returned a bad result" is unactionable without per-chain logs. The architecture that "feels like overkill" at 100 calls/day is "the only sustainable architecture" at 100k.

```
  Per-call savings at scale
  
  ┌─────────────────────────┬────────────┬───────────────┐
  │                         │ 100/day    │ 100,000/day    │
  ├─────────────────────────┼────────────┼───────────────┤
  │ Routing savings/call    │ $0.01      │ $0.01           │
  │ Total monthly savings   │ $30        │ $30,000          │
  │ Pipeline observability  │ Useful     │ Required         │
  │ Parallelization payoff  │ ~200ms      │ Per-user × 100k  │
  └─────────────────────────┴────────────┴───────────────┘
```

---

### The question candidates always dodge

**"Internet advice often shows one prompt doing 4 things at once and getting good results. Why's that bad?"**

It's bad because the demo is one prompt against three sample inputs. Production is one prompt against thousands of varied inputs over months, with team members iterating on it. The demo failure modes don't appear; the production failure modes do. The specific things that break in production: jobs interfering with each other during iteration (changes to instructions for job A degrade job B), cost inefficiency (everything pays the cost of the most expensive job), debugging opacity (can't tell which job failed), and iteration paralysis (you stop changing the prompt because changes are too risky). Demos don't surface these. Production does.

```
  Demo conditions                    Production conditions
  ─────────────────────────────      ───────────────────────────────────
  3 inputs                            thousands of varied inputs
  1 author                            5–10 contributors over months
  1 model version                     2–3 model upgrades a year
  no observability needed             observability is the only debugger
  "looks good" = good                 measurable evals = good
                                                                  
  Multi-purpose chain: fine          Multi-purpose chain: breaks
```

---

### One-line anchors

- "One chain, one job, one shape. Pipelines are application code."
- "Model routing per chain: Haiku for classifiers, Sonnet for generation."
- "Parallelize independent chains. Intent + tags in parallel is the cheap optimization."
- "Per-chain logging. Failure localizes; the pipeline doesn't lose visibility."
- "Loopd's 5 chains (planned): intent-classify, tag-extract, caption, search-rewrite, end-of-day-summary."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw a pipeline with 5 chains. Label which 2 can run in parallel. Label the branching point and where the pipeline composes results.

Pass: you got the parallel block (classify + tag-extract), the branch point (on intent.label), and the composition.

**Level 2 — Explain it out loud.**
Without notes, in under 90 seconds: "How do you structure a multi-step LLM feature?" Checkpoints:
- Did you say one chain = one job = one shape?
- Did you mention model routing?
- Did you mention parallelization where chains are independent?

If you skipped any: you described chains, not the discipline.

**Level 3 — Apply to a new scenario.**
A teammate's chain does "extract events from text AND format them as a calendar entry AND check for conflicts with existing events." Walk through how you'd decompose this into single-purpose chains. Reference the data flow.

Expected: three chains — `extract-events` (in: text, out: events[]), `format-calendar-entry` (in: events[], out: calendarEntry), `check-conflicts` (in: calendarEntry + existing, out: conflicts[]). The pipeline calls them sequentially. `check-conflicts` could be a non-LLM function if conflict detection is deterministic; if it is, even better — only LLM-ify when needed.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is "more chain files." If you were starting a project with one simple chain that takes input and returns a label, would you still set up the full single-purpose-chain infrastructure, or would you treat it as a single-file chain?

There's no right answer. Defend with reference to Sub-block 3 — at what scale or feature count does the discipline start paying back?

**Quick check — code reference test.**
Without opening files, answer:
- How many chains does loopd plan to ship in Phase 1?
- Which loopd chains can run in parallel?
- What's the rule for routing a chain to Haiku vs Sonnet?

Pass: 5 chains; intent-classify and tag-extract; Haiku for classifier/extractor/rewriter tasks where eval suite confirms it passes, Sonnet for generative or subjective-quality tasks.
