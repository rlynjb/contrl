# Output mode mismatch

**Industry name(s):** Output mode mismatch, output-shape contract violation, chain interface bug
**Type:** Industry standard

> Every chain has exactly one output mode (JSON, plain text, markdown, structured tool call). When chain A produces what chain B doesn't expect, the parser breaks — in production, after passing in dev. The bug is preventable in code review if you know what to look for.

**See also:** → [02-structured-outputs](./02-structured-outputs.md) · → [06-single-purpose-chains](./06-single-purpose-chains.md) · → [09-chain-of-thought](./09-chain-of-thought.md)

---

## Why care

**Move 1.** Chain A is your intent classifier. It returns `{ label: "search", confidence: 0.95 }`. Chain B is your search-query rewriter. It takes that result and rewrites the query. In dev, you wire them up by hand. Works. You ship. Two weeks later you add a new feature: chain B should *also* be callable from a different upstream chain that emits a similar-but-not-identical shape — `{ classification: "search", score: 0.95 }`. You "fix" chain B to accept either shape. Three months later, you read a chain B failure and realize you don't know which upstream produced the input. Worse, you discover chain A has drifted — it now sometimes returns the confidence as a string, "0.95", because someone tweaked the system prompt. The chain B parser was tolerant enough to mask this; the bug propagated downstream until a third chain choked on the string-confidence.

**Move 2.** That "what shape does this chain produce, exactly, and what shape does the next chain expect" question is what output-mode-mismatch addresses. Not the chain's quality. Not the prompt's content. Just the interface contract between chains: every chain has exactly ONE declared output mode (JSON shape via Zod, plain text, markdown, structured tool call), and every consumer expects that exact mode. When the producer drifts or the consumer is too lenient, the contract breaks.

**Why you need to answer that question at all:** Two failure modes hide here. First, **silent shape drift** — a chain's output evolves over time as the prompt is iterated; a tolerant downstream parser masks the drift; the bug propagates until something less tolerant breaks far from the source. Second, **interface entropy** — chains accumulate "I'll also accept X" tolerance for the upstreams they were never designed to handle, becoming generic and untestable. The fix is structural — each chain declares one input shape and one output shape, both validated at the boundary.

**Before / after.**

Without declared output-mode contracts:
- Chain B accepts "either shape." It worked at Day 1. Two months in, it accepts five shapes. Tests cover three. The other two have silent bugs nobody catches until a user reports something weird.
- Chain A's `confidence` field starts coming back as a string after a prompt tweak. The lenient consumer chain stores `"0.95"` instead of `0.95`. The downstream chain that does math on it returns NaN. Three days of debugging.
- A new contributor adds a chain that calls chain B. They don't know which of the five shapes to send. They look at the most recent caller. They send that shape. Tests pass.

With declared output-mode contracts:
- Chain B accepts exactly one input shape — `IntentResult` (Zod-validated at the boundary). An upstream sending the wrong shape gets rejected at the boundary, not silently masked.
- Chain A's output is validated at every consumer. The string-confidence drift gets caught on the first call: schema-fail metric increments, log captures the raw output, retry triggers with a stricter prompt.
- A new chain calling chain B types the call against `IntentResult`. The type system enforces the contract at write-time.

**Move 5.** Output-mode mismatch is what wrong function-argument-type errors are for typed languages — they exist at the boundary, they're catchable at compile/runtime, and they're invisible without the type discipline. The chain's output schema IS the function signature.

---

## How it works

### Move 1 — The mental model

Picture a TypeScript function whose return type you're confident about: `function classifyIntent(input: string): IntentResult`. Every caller is typed against `IntentResult`. If `classifyIntent` evolves to return a slightly different shape, the type system catches it everywhere `classifyIntent` is called. Chain interface contracts work the same way — the chain's declared output schema is its return type, every consumer types against that schema, and drift surfaces at the boundary instead of three layers downstream.

The strategy in plain English: **every chain declares one input schema and one output schema, both validated at the boundary, both typed end-to-end.**

```
  Chain interface contract (the typed-function-call analogy)

  ┌───────────────────────────────────────────────────────┐
  │ Chain function signature (the contract)               │
  │                                                       │
  │   classifyIntent: (input: string) → IntentResult      │
  │                                                       │
  │   IntentResult = { label: enum, confidence: number }  │
  └────────────────────────────────────────────────────────┘
        │
        ▼ every caller types against IntentResult
  ┌─────────────────────────────────────────────────────────┐
  │ const intent: IntentResult = await classifyIntent(...)   │
  │                                                          │
  │ // type system rejects:                                  │
  │ //   intent.classification     (no such field)          │
  │ //   intent.confidence + "x"   (number, not string)     │
  └─────────────────────────────────────────────────────────┘
```

The bug doesn't exist in the typed-function world because the boundary catches it. The chain-interface contract makes the same property hold across LLM-call boundaries.

---

### Move 2 — The layered walkthrough

#### The four output modes

Every chain produces exactly one of:

1. **Structured tool-call output** — schema-enforced by the provider (see [02-structured-outputs](./02-structured-outputs.md)). The strongest contract; the chain's output IS a typed object.
2. **JSON-mode plain text** — the model returns a string that happens to be valid JSON. Less constrained than tool-call; relies on boundary `JSON.parse` + Zod validation. Still typed at the boundary.
3. **Plain text (string)** — the chain produces a free-form string. Typically a generative chain: caption, summary, search-query rewrite. No structure to parse.
4. **Markdown** — a string with markdown formatting. Same as plain text but with display intent. Important: the downstream consumer treats it as a string, not as parsed markdown structure.

```
  Four output modes, four contracts

  ┌──────────────────────┬─────────────────────────┬─────────────────────┐
  │ Mode                 │ Returns                  │ Typed at boundary?  │
  ├──────────────────────┼─────────────────────────┼─────────────────────┤
  │ Structured tool call │ Typed object             │ Yes (provider+Zod)  │
  │ JSON-mode text       │ string → JSON.parse → Zod│ Yes (Zod)            │
  │ Plain text           │ string                   │ No (just a string)   │
  │ Markdown             │ string                   │ No (string with fmt) │
  └──────────────────────┴─────────────────────────┴─────────────────────┘
```

Boundary condition: only the first two modes give you compile-time type safety. The last two are strings; the consumer treats them as opaque. That's fine for terminal outputs (the user sees a caption, the search engine receives a query string) — but if a downstream chain consumes the output, the upstream needs to be structured, not free-form.

---

#### The bug shape: producer drift

The most common failure: a chain's output drifts from what it was when it was wired up. A prompt tweak changes the format slightly. The model upgrades and the output shape shifts. A few specific bugs I've seen ship:

- **Confidence field flips from number to string** after someone adds "be precise" to the system prompt and the model interprets that as "format numbers with quotes."
- **Optional field becomes mandatory** after a prompt change adds a new sentence and the model starts including a `notes` field that consumers don't expect.
- **Enum value changes from kebab-case to snake_case** after the few-shot examples got rewritten in a different style.
- **Markdown code fence appears around JSON output** after a model upgrade that's "more helpful."

```
  Producer-drift bugs (real examples)

  Day 1 output:                       After prompt tweak / model upgrade:
  { "label": "search",                 { "label": "search",
    "confidence": 0.95 }                 "confidence": "0.95" }   ◄─ string!

  { "tags": ["work"] }                 { "tags": ["work"], "notes": "..." }  ◄─ extra field

  { "category": "support" }            { "category": "Support" }  ◄─ casing changed

  { "answer": "42" }                   ```json
                                        { "answer": "42" }
                                        ```                       ◄─ wrapped in fence
```

Boundary condition: producer drift is undetectable in dev because dev tests pass the same prompt against the same model and don't catch the drift between versions. The only way to detect it is at the consumer's boundary with strict schema validation.

---

#### The bug shape: consumer leniency

The complementary failure: a consumer chain that accepts "either shape" or coerces unexpected types into something usable. Lenient parsing is generosity that masks bugs.

```ts
// BAD: tolerant consumer
function processClassification(raw: any) {
  const label = raw.label || raw.classification || raw.category;  // accept any
  const confidence = typeof raw.confidence === 'string' ? parseFloat(raw.confidence) : raw.confidence;  // coerce
  // ...
}

// GOOD: strict consumer
function processClassification(input: IntentResult) {
  // type system + Zod parse at the boundary already enforced shape
  // any drift in the producer surfaces here as a parse failure
}
```

If you're coming from frontend, this is the equivalent of accepting `props: any` instead of `props: ButtonProps` — your component "works" with anything, including bugs.

```
  Lenient vs strict consumer

  Lenient consumer                    Strict consumer
  ─────────────────────────────       ─────────────────────────────
  accept either shape                  type against ONE shape
  coerce string→number                 reject string in number field
  silently mask producer drift         surface producer drift as parse fail
  hide bugs until downstream chokes    catch bugs at the boundary
```

Boundary condition: there ARE legitimate cases for lenient parsing — at the very outer edge of the system, where untrusted external input arrives. That's not a chain-to-chain boundary; that's a user-input or external-API boundary. Inside the chain pipeline, strict types everywhere.

---

#### How to spot output-mode mismatch in code review

Three review heuristics that catch most cases:

1. **Look for `any` or untyped destructuring on chain outputs.** `const { label, confidence } = result;` without a type assertion or schema parse is a red flag. Either type or schema-parse, never neither.
2. **Look for `||` fallbacks across field names.** `result.label || result.classification` says the reviewer didn't trust the producer's shape, which means the producer's contract is unclear.
3. **Look for `parseFloat`, `Number()`, or string→number coercion on chain outputs.** Either the schema says number (and the producer is broken) or the schema says string (and the consumer should accept string). Coercion is the bug-masking pattern.

```
  Code-review red flags

  ┌──────────────────────────────────────────────────────────────────┐
  │ const result = await chain(input);                                 │
  │ const label = result.label || result.classification;  ◄─ red flag │
  └──────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────┐
  │ const conf = typeof result.confidence === 'string'                 │
  │   ? parseFloat(result.confidence)  ◄─ red flag                    │
  │   : result.confidence;                                            │
  └──────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────┐
  │ const data = JSON.parse(rawOutput);  ◄─ if no Zod after, red flag │
  └──────────────────────────────────────────────────────────────────┘
```

Boundary condition: red flags need their corresponding fixes. The fix for tolerant destructuring is to add a Zod parse. The fix for `||` field-name fallbacks is to align the producer's shape OR introduce an explicit adapter that names the conversion. The fix for unneeded coercion is to fix the producer.

---

### Move 3 — The principle

Output-mode mismatch is the LLM equivalent of "schema drift between microservices" — a contract that exists implicitly between two units of code, evolves over time, and produces bugs that surface far from the change site. The fix is the same as in microservices: make the contract explicit (a schema), validate at every boundary, and treat schema failures as first-class events worth metrics and alerts. Lenient consumers mask the contract; strict consumers enforce it. The discipline isn't about prompt quality; it's about treating chain outputs as typed function returns.

The full picture is below.

---

## Output mode mismatch — diagram

The bug surface and the prevention mechanism, drawn at the chain-to-chain boundary.

```
┌─ Producer chain (chain A) ───────────────────────────────────────────────────┐
│                                                                              │
│   Chain output schema (declared):                                            │
│     IntentResult = { label: "chat" | "search" | "command",                    │
│                      confidence: number }                                    │
│                                                                              │
│   LLM call → response → boundary Zod.parse                                   │
│   → typed IntentResult passed downstream                                     │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ TYPED handoff
                                      ▼
┌─ Consumer chain (chain B) ───────────────────────────────────────────────────┐
│                                                                              │
│   Chain input schema (declared):                                             │
│     processSearch: (intent: IntentResult, query: string) → SearchResult      │
│                                                                              │
│   Receives IntentResult — typed, validated, contract enforced.               │
│   Cannot accidentally receive { classification: ..., score: ... }.            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

The bug surface (what the diagram prevents):

  Producer drift:
    Chain A's output evolves: `confidence: number` → `confidence: string`.
    Without boundary validation: lenient consumer coerces, masks the bug.
    With boundary validation: Zod.parse fails, schema-fail metric increments,
    alert fires, drift caught at hour zero.

  Consumer leniency:
    Chain B accepts "either shape" via `||` fallback.
    Without boundary validation: hides Chain A drift indefinitely.
    With boundary validation: type system rejects untyped destructuring at
    write-time; lenient parsing requires explicit `any` cast that fails review.
```

The contract IS the schema. The schema is in code. Boundary validation is the safety net. Strict typing is the editor-level catch.

---

## In this codebase

**Case B planned — coaching agent output + tool output contracts.**

contrl's single-LLM-surface shape (the coaching agent) doesn't have a chain-to-chain handoff. But it does have output-mode contracts in three places, each load-bearing:

1. **Agent output → display layer.** The coaching agent emits a structured tool call (e.g., `{ message: string, priority_cue: enum, confidence: number }`). The UI consumes this — if the agent drifts and starts emitting `{ msg: ..., cue: ... }` instead, the display breaks. Mitigation: `src/lib/agent/schemas.ts` Zod-validates output before returning.
2. **Tool input → tool implementation.** Each of the 5 read-only tools (`get_classifier_output`, etc.) declares an input schema (e.g., `{ exercise_id: string, set_index: number }`). The agent calls the tool with arguments matching the schema; if the agent passes `{ exerciseId, setIdx }` instead, the tool implementation breaks. Mitigation: tool input schemas declared in Zod, JSON-Schema converted, sent to the agent so the constrained sampler can't emit wrong field names.
3. **Tool output → agent context.** Each tool returns data the agent reasons over. If `get_form_history` starts returning `{ records: [...] }` instead of `{ history: [...] }`, the agent's reasoning about the field name silently drifts. Mitigation: tool implementations return statically-typed structs (TypeScript ensures the shape).

The three contracts together are why "single agent + read-only tools" is a tractable shape — every boundary is typed, every drift is caught at one of the three Zod gates.

**ML side — analog discipline.**

contrl's planned Phase 2C form classifier returns `{ label: enum, confidence: number }`. The consumer (the workout UI, and later the coaching agent's `get_classifier_output` tool) depends on this shape. If the classifier's preprocessing changes the label vocabulary, every consumer breaks. Mitigation: the label enum lives in code, imported by both the classifier output and every consumer.

---

## Elaborate

**Where this pattern comes from.** Chain-to-chain contracts emerged from microservices schema drift (Avro, Protobuf, GraphQL Federation) applied at the LLM-pipeline level. The 2023–2024 wave of LLM frameworks (LangChain, AI SDK) all converged on typed inputs/outputs at the chain boundary as the way to scale multi-step pipelines. By 2026, "every chain has a Zod schema" is consensus in TypeScript codebases.

**The deeper principle.** Implicit contracts decay; explicit contracts evolve. The same logic that drove microservices toward Protobuf and away from JSON+conventions applies to chain pipelines — once you have more than 2 chains and more than 1 person, the implicit contract becomes unmanageable. The fix is structural: every chain has a typed input and output, validated at the boundary. Lenient parsing isn't generosity; it's deferred debugging cost.

**Where this breaks down.** Two cases.

1. **Terminal-output chains.** The last chain in a pipeline that produces a caption for display, a search query for an engine, a summary for the user — these chains have no downstream chain, so the "consumer contract" is whatever the display layer or external API expects. The discipline still applies (the chain has one output shape) but the typed-handoff aspect doesn't.
2. **Heterogeneous-input chains.** A chain genuinely meant to accept multiple input shapes (e.g., a normalizer that takes one of three formats and emits a canonical one) is the rare exception. For these, declare the input as a typed union and validate explicitly — `IntentResult | LegacyIntent | RawIntent` parsed via Zod's discriminated union. The discipline survives; the shape is just more elaborate.

**What to explore next.**
- [02-structured-outputs](./02-structured-outputs.md) → the schema-enforcement mechanism that prevents producer drift.
- [06-single-purpose-chains](./06-single-purpose-chains.md) → the architecture that makes output-mode contracts tractable.
- [09-chain-of-thought](./09-chain-of-thought.md) → the interaction: reasoning lives IN the structured output, not as free-form prose around it.

---

## Tradeoffs

| Cost dimension | Strict chain contracts | Lenient / implicit contracts |
|---|---|---|
| Setup cost | Zod schema per chain | Zero |
| Drift detection | Immediate, at boundary | Delayed, far downstream |
| Reviewability | Type system + diff per schema | Hand-inspected per change |
| Onboarding | Type-driven IDE autocomplete | "Read the chain, hope" |
| Migration cost | Schema-aware refactors | "Touch everything, hope" |
| Vendor portability | Schema is provider-neutral | "It works with the current provider" |
| New-chain-addition cost | New typed contract | Inherit existing implicit shape |

### Sub-block 1 — what we gave up

The setup cost — one Zod schema file per chain. For contrl's coaching agent (1 LLM surface + 5 tools = 6 contracts), that's 6 small schemas in `src/lib/agent/schemas.ts`. Maybe two hours of work; then ~10 min per future tool added.

The other cost is the *strictness pressure*. Strict schemas catch real drift, but they also reject "almost right" outputs that a lenient parser would have accepted. Each schema-fail at the boundary requires investigation — is it a drift bug, or a too-tight schema? Wrong-direction tightness is real and gets debugged like any other false positive.

### Sub-block 2 — what lenient contracts would have cost

I have shipped both. The lenient version's specific failures:

- **Month 2:** chain A's output drifts — a confidence field starts coming back as string. Lenient consumer coerces. Bug propagates to chain C, where math returns NaN. Three days of debugging across three chains.
- **Month 4:** a new chain D is added that calls chain A. Author looks at the most recent caller (which was lenient). Copies that lenient pattern. Now both consumers paper over chain A's drift.
- **Month 6:** chain A is refactored. Output schema changes intentionally. Three consumers need updates. Nobody knows which consumers care about which fields because everyone's lenient parsing accepts everything. Touch-everything refactor.

Strict contracts from Day 1: each of these is caught at the boundary in seconds.

### Sub-block 3 — the breakpoint

Strict chain contracts are the right call until: (a) the pipeline has exactly one chain (no chain-to-chain boundary exists); (b) the chain's output is a free-form string consumed only by a display layer (no parsing happens; lenient or strict doesn't apply); (c) you're in a multi-day prototype phase where contracts are premature (you're still figuring out what the chains should look like). contrl's coaching-agent shape hits (a) for chain-to-chain — but the agent's output-to-display contract and the agent's tool input/output contracts make strict typing earn its place anyway.

### Sub-block 4 — what wasn't actually a tradeoff

"Schemas are over-engineering for small chains." The concern is that a 200-token classifier chain doesn't deserve a Zod schema file. But Zod schemas for trivial shapes are themselves trivial — `z.object({ label: z.enum(['chat', 'search', 'command']), confidence: z.number().min(0).max(1) })` is one line. The "over-engineering" reflex is calibrated to old-style class hierarchies, not Zod. The cost is sub-overhead.

---

## Tech reference (industry pairing)

### Zod discriminated unions for multi-shape chains

- **Codebase uses:** Not yet — not currently needed for contrl's coaching agent (one input shape per tool). Reserved for if future tool shapes diverge.
- **Why it's here:** the type-system primitive that handles "this chain takes one of three input shapes" cleanly.
- **Leading today:** Zod discriminated unions — `adoption-leading` for typed multi-shape inputs in TypeScript LLM code, 2026.
- **Why it leads:** `z.discriminatedUnion('kind', [schemaA, schemaB])` produces an exhaustive type with exhaustive Zod parsing.
- **Runner-up:** Hand-rolled type guards (`'kind' in input ? ...`) — work but lose the parse-side enforcement.

### TypeScript strict mode + `noUncheckedIndexedAccess`

- **Codebase uses:** contrl is TypeScript with strict mode enabled. `noUncheckedIndexedAccess` catches a class of "the field might not be there" bugs that lenient parsing would hide.
- **Why it's here:** the editor-time catch for unchecked field access on chain outputs.
- **Leading today:** TypeScript strict mode — `adoption-leading` for type-safe TypeScript code, 2026.
- **Why it leads:** universal in modern TS codebases; catches output-mode-mismatch bugs at write-time via type errors.
- **Runner-up:** Flow — declining adoption; TypeScript dominates.

### Schema-fail metric + alerting

- **Codebase uses:** Not yet — planned for contrl's coaching agent (`agent.schema_fail` counter in `runner.ts`).
- **Why it's here:** the production-side detection mechanism. Without metrics, schema fails are invisible until they cause a user-visible incident.
- **Leading today:** custom counters via Sentry / Prometheus / Datadog — `adoption-leading` for prompt-side observability, 2026.
- **Why it leads:** the cheap end of LLM observability; a counter per chain per failure mode, queried via the team's existing dashboard.
- **Runner-up:** LangSmith / Humanloop / PromptLayer — turnkey solutions that include this plus more; pay-as-you-go for teams that need the hosted UI.

---

## Project exercises

### [B4C.contracts] Declare Zod schemas for the agent's 6 contracts

- **Exercise ID:** `[B4C.contracts]`
- **What to build:** In `src/lib/agent/schemas.ts`, declare 6 Zod schemas: 1 for the coaching agent's output, 5 for the read-only tools' inputs. Plus typed tool-implementation return types (TypeScript, not Zod, since the tools are local). Update `runner.ts` to `safeParse` the agent's output at the boundary; the tool runner already type-checks inputs via the JSON Schema passed to the model.
- **Why it earns its place:** the contracts that make output-mode mismatch impossible. Once typed, drift surfaces immediately.
- **Files to touch:** `src/lib/agent/schemas.ts`, `src/lib/agent/runner.ts`, each tool file under `src/lib/agent/tools/`.
- **Done when:** the coaching agent's output is `safeParse`d on every call; tools' inputs are validated by the JSON Schema the model sees; an intentionally-corrupted agent response fires `agent.schema_fail`.
- **Estimated effort:** `1–2 days`

### [B4C.review-checklist] Add code-review checklist for chain contracts

- **Exercise ID:** `[B4C.review-checklist]`
- **What to build:** A short markdown checklist in `docs/llm-code-review.md` listing the three red flags (untyped destructuring, `||` field-name fallbacks, unneeded coercion). Link from any PR template that touches `src/lib/agent/`.
- **Why it earns its place:** the human-side discipline that catches bugs the type system might not (e.g., when a teammate explicitly casts to `any` to silence an error).
- **Files to touch:** `docs/llm-code-review.md`; PR template (`.github/pull_request_template.md` if it exists).
- **Done when:** the checklist exists; it explicitly names the three red flags with code examples.
- **Estimated effort:** `<1hr`

---

## Summary

Output-mode mismatch is the bug where chain A produces output of one shape and chain B expects another, and the parser breaks — in production, after passing in dev. Prevention is structural: each chain declares one input schema and one output schema, both Zod-validated at the boundary, both typed end-to-end. Lenient parsing (`||` fallbacks, coercion, untyped destructuring) masks drift and is the anti-pattern to catch in review. The contract IS the schema; the schema is in code; boundary validation is the safety net.

**Key points:**

- **Every chain has exactly one output mode** — structured tool call, JSON-text, plain text, or markdown.
- **The chain's output schema IS its function signature.** Type consumers against the schema; reject mismatched shapes at the boundary.
- **Producer drift is invisible without strict consumers.** A lenient parser hides drift until something downstream chokes.
- **Three review red flags:** untyped destructuring on chain outputs, `||` fallbacks across field names, unneeded type coercion.
- **Schema fails are first-class events.** Counter + alert; drift caught at hour zero, not day three.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "what's the most common bug you've shipped in a multi-step LLM pipeline?", they're listening for whether you've debugged a chain-to-chain interface bug. The shipped answer names producer drift, consumer leniency, and the schema-as-contract fix. The unshipped answer is "I haven't really hit issues like that yet."

### Likely questions

**[mid] What is output mode mismatch and how do you prevent it?**

It's when chain A produces output of one shape and chain B doesn't expect that shape — the parser breaks. Prevention is one Zod schema per chain (input and output), validated at the boundary, typed all the way through. Producer drift surfaces at the consumer's boundary, not three layers downstream.

```
  Without contracts                  With contracts
  ─────────────────────────────      ──────────────────────────────────
  Chain A drifts silently            Boundary Zod.parse fails at the
                                     producer's consumer
  Bug propagates to downstream       Schema-fail metric increments
   chains until parse choke          Alert fires
  Hours/days of debugging            Hour-zero detection
```

---

**[senior] Walk me through a real chain-to-chain bug you'd debug.**

Chain A returns `{ label, confidence }`. Confidence used to be a number; now it's coming back as a string after a prompt tweak. Chain B's lenient consumer was doing `parseFloat(result.confidence)` "just to be safe." That worked. Chain C reads chain B's output and does math on confidence — `confidence * 100` to produce a percentage. Math on a string returns NaN. User sees "NaN%" in the UI. Investigation: trace back through chain B's logs, find that confidence was being coerced, trace back through chain A's logs, find the producer drift. Fix: make chain A's schema strict — reject string-confidence at the boundary; force the model to produce a number via tool call. Three layers of debugging, one fix at the source.

```
  Trace
  ┌──────────────────────────────────────────────────────────┐
  │ User sees "NaN%"                                          │
  │   ▼                                                       │
  │ Chain C: confidence * 100 = NaN                          │
  │   ▼ (look at chain B's output to chain C)                │
  │ Chain B's stored confidence: parseFloat applied silently  │
  │   ▼ (look at chain A's output to chain B)                │
  │ Chain A's recent outputs: "0.95" (string)                │
  │   ▼ (root cause)                                          │
  │ Chain A's prompt tweak made the model emit string         │
  │   confidence                                              │
  │                                                           │
  │ Fix: enforce schema at chain A's boundary                │
  └──────────────────────────────────────────────────────────┘
```

---

**[arch] How does this discipline change at multi-team scale?**

At one-team scale, the schemas are coordination shorthand. At multi-team scale (team A owns chain A, team B owns chain B), schemas become the API contract between teams — the same role Protobuf plays for microservices. Changes to chain A's output schema require a coordinated rollout: team A ships the new schema in a backward-compatible form (additive field or new optional field) first, team B updates their consumer to handle both, team A removes the old shape after all consumers migrate. Without schemas, the same coordination has to happen but informally — through Slack threads and dropped messages.

```
  Multi-team chain-contract evolution
  ┌──────────────────────────────────────────────────────────┐
  │ Phase 1: team A adds new optional field                   │
  │   schema v1: { label, confidence }                        │
  │   schema v2: { label, confidence, reasoning?: string }    │  ◄─ additive
  │                                                           │
  │ Phase 2: team B updates consumer to handle both           │
  │                                                           │
  │ Phase 3: all consumers migrated → team A removes v1       │
  │   schema v3: { label, confidence, reasoning: string }     │  ◄─ now required
  └──────────────────────────────────────────────────────────┘
```

---

### The question candidates always dodge

**"Internet advice says LLM outputs are non-deterministic so strict schemas are too rigid. What do you think?"**

Strict schemas don't prevent non-determinism. They constrain *the shape* of the non-determinism. The model can still return any value within `confidence ∈ [0, 1]`; the schema rejects values outside that range. Non-determinism in *content* is expected and useful; non-determinism in *shape* is a bug. Conflating the two is the mistake the advice makes. The correct framing: schemas constrain shape, not content; non-deterministic LLMs and strict schemas are complements, not opposites.

```
  Two different things people call "non-determinism"

  ┌──────────────────────────────────────┬─────────────────────────────────┐
  │ Shape                                │ Content                          │
  ├──────────────────────────────────────┼─────────────────────────────────┤
  │ Fields present, types correct        │ Specific values within the shape │
  │ Should be deterministic — schema     │ Genuinely non-deterministic —    │
  │   enforces                            │ that's the whole point of an LLM │
  └──────────────────────────────────────┴─────────────────────────────────┘
```

---

### One-line anchors

- "Every chain has exactly one output mode. The schema IS the function signature."
- "Strict consumers catch producer drift; lenient consumers hide it."
- "Red flags in review: untyped destructuring, `||` field-name fallbacks, unneeded coercion."
- "Boundary Zod.parse + schema-fail metric. Drift caught at hour zero."
- "Non-determinism in content is fine; non-determinism in shape is a bug."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the chain-to-chain boundary with: producer chain, output schema, boundary validation, typed handoff, consumer chain, input schema. Label one place where drift would surface.

Pass: you got both schemas (input and output sides) and the boundary validation step.

**Level 2 — Explain it out loud.**
Without notes, in under 60 seconds: "What's output-mode mismatch and how do you prevent it?" Checkpoints:
- Did you name producer drift?
- Did you name consumer leniency?
- Did you mention boundary Zod validation?

If you skipped any: you described "make sure shapes match," not the discipline.

**Level 3 — Apply to a new scenario.**
A teammate has chain A returning `{ result: "yes" | "no" }` and chain B expecting `{ verdict: boolean }`. They wrote a translator function between them. Walk through how you'd refactor to avoid the translator.

Expected: choose one shape and align both chains. If `boolean` is the right semantic (it usually is for yes/no), update chain A's schema to return `{ verdict: z.boolean() }` and update the prompt to emit `{ "verdict": true }`. If string-enum is the right semantic, update chain B. The translator function is a smell — it indicates an unresolved shape disagreement.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is "set-up time for schemas on small chains." If you were starting a new chain that you knew would be the only chain in its pipeline forever (one chain, one job, one consumer = the UI), would you still write a Zod schema for the output?

There's no right answer. Defend with reference to: type-system benefits even without chain-to-chain handoffs, the cost of skipping (refactor when a second consumer arrives), the audience for the chain's output.

**Quick check — code reference test.**
Without opening files, answer:
- What are the three code-review red flags?
- What's the difference between non-determinism in shape vs content?
- Where will contrl's coaching-agent output schema live?

Pass: untyped destructuring + `||` fallbacks + unneeded coercion; shape should be deterministic, content shouldn't; `src/lib/agent/schemas.ts`.

---
Updated: 2026-05-24 — Reframed per v1.38.0 per-repo scope. In this codebase: collapsed dual Case B (loopd) + Case A (aipe) into single Case B planned for contrl's coaching agent + 5 tools (6 contracts total) + ML-side analog (label-enum shared between classifier and consumers). Tradeoffs Sub-block 1 + Sub-block 3 breakpoint reframed. Tech reference codebase-uses lines retargeted. Project exercises B1.20/B1.21 → B4C.contracts + B4C.review-checklist. Validate Quick check updated.
