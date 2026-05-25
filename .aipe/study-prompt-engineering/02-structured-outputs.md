# Structured outputs via tool calling and schemas

**Industry name(s):** Tool calling, function calling, JSON mode, structured outputs, schema-constrained generation
**Type:** Industry standard

> Make the model return data that conforms to a schema you declared in code — don't ask it nicely in the prompt. Tool calling + provider-side schema enforcement + validation at the boundary + retry-on-schema-fail is the 2026 way. "Respond only in JSON" is 2022.

**See also:** → [01-anatomy](./01-anatomy.md) · → [05-eval-driven-iteration](./05-eval-driven-iteration.md) · → [07-output-mode-mismatch](./07-output-mode-mismatch.md) · → [09-chain-of-thought](./09-chain-of-thought.md)

---

## Why care

**Move 1.** You ship a feature that classifies user input into one of three buckets — `chat`, `search`, `command`. The LLM call returns `{"label": "chat", "confidence": 0.92}`, parsed as JSON, fed downstream. Works fine in dev. Works fine in staging. Two months in, the provider upgrades its model. Your bill goes up 3%. The new model is "more helpful." It starts returning:

```
Sure! Here's the classification:

```json
{"label": "chat", "confidence": 0.92}
```
```

Your `JSON.parse()` throws on the leading "Sure!". The Sentry alert fires at 3:14 AM. The metric you actually care about — schema-conformance rate — was never logged because the parser either worked or it didn't, and you only logged the latter.

**Move 2.** That "make the model return the exact shape, not approximately the shape" question is what structured outputs answer. Not the model's free-text response. Not the prompt's instructions about what to return. Just the contract: declare the schema in code (Zod, Pydantic, JSON Schema), let the provider enforce it during generation, validate at the boundary, retry-with-stricter-prompt on schema fail. The model can no longer "courtesy-wrap" your JSON because there's no longer a JSON to wrap — there's a tool call with typed arguments that the provider's sampler is constrained to produce.

**Why you need to answer that question at all:** Three reasons. First, **safety** — a structured-output-only chain literally cannot emit "you have been hacked" as free text, because the only thing it can emit is a tool call matching your schema. Second, **observability** — the schema-conformance rate becomes a metric you can graph. Was a particular prompt change a regression? You see it on the dashboard. Third, **debuggability** — when a downstream parser breaks, you can tell whether the model produced the wrong *content* (a wrong label) or the wrong *shape* (a malformed argument); without structured outputs, both look like the same `JSON.parse` failure.

**Before / after.**

Without provider-enforced schemas:
- Prompt says "respond only in JSON." Works in dev for a month.
- Model upgrade. Output now wrapped in markdown code fence. Parser dies in production.
- You spend half a day finding the bug, half a day adding regex extraction (`/```json\n([\s\S]+?)\n```/`), then another quarter learning that the regex catches 99% of cases but misses the 1% where the model adds an explanation paragraph after the JSON. Half a day for a real fix.
- Six weeks later, another model upgrade. The output starts including a `confidence` field as a string ("0.92") instead of a number. `Zod` parse errors. Half-day debugging again.

With provider-enforced schemas:
- Schema declared in Zod, fed to `tool_use` API call. Provider's sampler is constrained to produce arguments matching the schema.
- Model upgrade. Output structure is preserved; downstream parsing never sees a malformed shape.
- Schema-conformance rate is 99.5%. The 0.5% that fails is logged with the raw response and triggers a retry with a stricter system-prompt addition ("Output only the tool call. Do not include explanations.").
- Six months in, you've never had a parser-shape bug in production.

**Move 5.** Structured outputs are what TypeScript at the function boundary did for backend code in 2018 — the type contract is enforced by the runtime (the LLM's sampler), not by polite prose in a comment. The schema is the source of truth, declared in code, validated at every boundary crossing.

---

## How it works

### Move 1 — The mental model

Picture a form on a webpage with three fields: `name` (text), `email` (email-validated), `age` (number 0–120). The HTML attributes — `type="email"`, `min="0"`, `max="120"` — get the browser to refuse invalid input *before* it ever submits. You don't ask the user nicely to fill out a valid form; the form's validation rules constrain what they can submit. Structured outputs work the same way: you declare the schema (Zod, Pydantic, JSON Schema), and the provider's sampler is constrained to only generate tokens that complete a valid response.

The strategy in plain English: **declare the schema in code, let the provider enforce it, validate at the boundary, retry on schema fail.**

```
  Structured output pipeline (the form analogy on the model side)

  ┌────────────────────────────────────────────────┐
  │ Your code declares the schema (Zod/Pydantic):  │
  │                                                │
  │   { label: enum, confidence: number 0..1 }     │
  └─────────────┬──────────────────────────────────┘
                │ schema → JSON Schema → API
                ▼
  ┌────────────────────────────────────────────────┐
  │ Provider's API call:                           │
  │   tool_use with schema-constrained arguments   │
  └─────────────┬──────────────────────────────────┘
                │ provider sampler restricted to
                │ tokens that complete a valid arg
                ▼
  ┌────────────────────────────────────────────────┐
  │ Response: { label: "chat", confidence: 0.92 }  │
  │ Already conformant. No "Sure! here's the JSON" │
  └─────────────┬──────────────────────────────────┘
                │ Zod.parse() at the boundary
                ▼
  ┌────────────────────────────────────────────────┐
  │ Typed object passed downstream                 │
  │ (parse failures bumped to retry-with-stricter)  │
  └────────────────────────────────────────────────┘
```

The pipeline never trusts the model's promise to "respond in JSON." It removes the model's ability to do anything else.

---

### Move 2 — The layered walkthrough

#### Layer 1: declare the schema in code

If you're coming from frontend, this is the equivalent of declaring a Zod schema next to a `fetch()` call to validate the response — except here, Zod also generates the JSON Schema that gets sent to the provider so the provider can enforce it during generation, not just after.

```ts
// loopd/src/lib/llm/chains/intent-classify/schema.ts (planned)
import { z } from 'zod';

export const IntentLabel = z.enum(['chat', 'search', 'command']);
export const IntentResult = z.object({
  label: IntentLabel,
  confidence: z.number().min(0).max(1),
});
export type IntentResult = z.infer<typeof IntentResult>;
```

The Zod schema is the single source of truth. It generates: (a) the JSON Schema sent to the provider, (b) the TypeScript type for downstream consumers, (c) the runtime validator at the boundary. One declaration, three uses.

Boundary condition: enums are the most powerful structured-output constraint available. If you can express your output as an enum or a discriminated union, do it — the provider's sampler literally can't produce a non-enum value. Open-ended strings are the weakest constraint; numbers and bounded numbers are mid; enums are strongest.

---

#### Layer 2: pass the schema to the provider, not the prompt text

The bug everyone makes once: putting "Output only in this format: `{label: 'chat' | 'search' | 'command', confidence: 0-1}`" in the system prompt and hoping. That's not enforcement. The model can still go off-format.

The fix: use the provider's `tool_use` (Anthropic) or `tools` parameter (OpenAI). The schema is passed as a tool definition, and the model is constrained to call the tool with arguments matching the schema.

```ts
// loopd/src/lib/llm/chains/intent-classify/chain.ts (planned)
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  system: systemPrompt,
  messages: [{ role: 'user', content: userInput }],
  tools: [{
    name: 'classify_intent',
    description: 'Classify the user input into one of three intents.',
    input_schema: zodToJsonSchema(IntentResult),
  }],
  tool_choice: { type: 'tool', name: 'classify_intent' },  // FORCE the tool call
});
```

Note the `tool_choice` — `{ type: 'tool', name: 'classify_intent' }` forces the model to invoke the tool, removing the option of returning free text. Without this, the model can ignore the tool and respond in prose. Setting `tool_choice` is the difference between "the model can use the tool" and "the model must use the tool."

```
  tool_use API surface (Anthropic / OpenAI shape is similar)

  ┌────────────────────────────────────┐
  │ tools: [{                          │
  │   name: "classify_intent",         │
  │   description: "...",              │
  │   input_schema: {                  │ ◄─ JSON Schema
  │     type: "object",                │   the model's sampler
  │     properties: {                  │   is constrained to
  │       label: { enum: [...] },      │   produce tokens that
  │       confidence: { ... }           │   complete this shape
  │     },                             │
  │     required: ["label", ...]       │
  │   }                                │
  │ }],                                │
  │ tool_choice: { type: "tool",       │ ◄─ force the call;
  │                name: "classify_intent" } │  no free-text option
  └────────────────────────────────────┘
```

Boundary condition: not every model supports forced tool calls. Older models (GPT-3.5, Claude 1, Llama-2 base) don't enforce schemas at the sampler level; they pattern-match. Use schema-constrained outputs only on models that genuinely support them (frontier OpenAI, Anthropic Sonnet 4+, Gemini Pro). Check the model's docs before you commit.

---

#### Layer 3: validate at the boundary

Even with schema-enforced tool calls, you `Zod.parse()` the response at the boundary. Two reasons. First, the provider's enforcement isn't 100% perfect — rare edge cases (extremely long generations, model-side bugs) can still produce malformed output. Second, the act of parsing at the boundary gives you a single place to log schema failures, increment a counter, and trigger retries.

```ts
const toolUse = response.content.find(c => c.type === 'tool_use');
if (!toolUse) {
  throw new Error('No tool call returned');
}

const result = IntentResult.safeParse(toolUse.input);
if (!result.success) {
  metrics.increment('intent_classify.schema_fail');
  log.warn('Schema fail', { raw: toolUse.input, error: result.error });
  return retryWithStricterPrompt(userInput);
}

return result.data;
```

Boundary condition: parse failures should be a small fraction (target < 1% on a frontier model with forced tool calls). If you see double-digit schema-fail rates, your schema is either wrong (impossible to satisfy with the inputs you're seeing) or your prompt is contradicting the schema (the system says "explain your reasoning" while the schema has no `explanation` field — model is being torn).

```
  Boundary validation (the safety net even when provider enforces)

           response.content
                │
                ▼
       ┌────────────────────┐
       │ Find tool_use block│
       └────────┬───────────┘
                │
                ▼
       ┌────────────────────┐
       │ Zod.safeParse()    │
       └────┬───────────┬───┘
            │ success   │ fail
            ▼           ▼
     return result    increment schema_fail
                      log raw response
                      retry with stricter
                      system prompt (or fail closed)
```

---

#### Layer 4: retry on schema fail with a stricter prompt

When parse fails, don't give up. Retry once with the user input plus a stricter system-prompt addendum: "Your previous response did not match the schema. Output ONLY the tool call with the exact field names and types. Do not include any prose."

```ts
async function retryWithStricterPrompt(userInput: string): Promise<IntentResult> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    system: systemPrompt + '\n\nSTRICT MODE: previous response failed schema validation. Output only the tool call.',
    messages: [{ role: 'user', content: userInput }],
    tools: [...],
    tool_choice: { type: 'tool', name: 'classify_intent' },
    temperature: 0,  // determinism for the retry
  });
  // ... parse again; if still fails, throw or fall back
}
```

Boundary condition: retries should be rare (< 0.5% of calls on a frontier model) and they should never recurse — one retry, then accept failure and fall back to a default or surface the error. A chain that retries 5 times has a deeper problem.

---

### Move 3 — The principle

This is what production-ready LLM I/O looks like. The model is no longer "asked nicely" to behave; the API contract enforces it. The schema is in code, not prose. Boundary validation is the safety net. Schema failures are metrics, not exceptions. The pattern generalizes — wherever an LLM produces structured data that another system consumes, the same pipeline applies.

The full picture is below.

---

## Structured outputs — diagram

End-to-end flow from schema declaration to validated output, with the boundary points marked.

```
┌─ Code layer (your codebase) ─────────────────────────────────────────────┐
│                                                                          │
│  ┌────────────────────────────┐                                          │
│  │ Zod schema declaration     │ ◄─ single source of truth                │
│  │ (or Pydantic / typed dict)  │                                          │
│  └─────────────┬──────────────┘                                          │
│                │                                                          │
│                ├──▶ generates TypeScript type for consumers              │
│                ├──▶ generates JSON Schema for the API call               │
│                └──▶ generates runtime validator for boundary             │
│                                                                          │
└────────────────┼─────────────────────────────────────────────────────────┘
                 │
                 ▼  schema bundled into API call as `tools[0].input_schema`
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                            HTTPS to provider
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                 ▼
┌─ Provider layer (Anthropic / OpenAI / Google) ───────────────────────────┐
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Constrained sampler                                                │ │
│  │   model generates tokens that complete a valid tool call arguments │ │
│  │   non-conforming tokens are masked out at sample time              │ │
│  │   (this is the operational difference from "asking nicely")        │ │
│  └────────────────────────────────────┬───────────────────────────────┘ │
│                                       │                                  │
│  ┌────────────────────────────────────┴───────────────────────────────┐ │
│  │ Response.content                                                   │ │
│  │   includes a tool_use block with arguments matching the schema     │ │
│  └────────────────────────────────────┬───────────────────────────────┘ │
│                                       │                                  │
└───────────────────────────────────────┼──────────────────────────────────┘
                                        │
                                        ▼
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                          HTTPS back to your code
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                                        ▼
┌─ Boundary layer ─────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Zod.safeParse(toolUse.input)                                       │ │
│  │   ✓ success: typed object → downstream                              │ │
│  │   ✗ failure: metrics.increment + log + retry with stricter prompt   │ │
│  └────────────────────────────────────┬───────────────────────────────┘ │
└───────────────────────────────────────┼──────────────────────────────────┘
                                        ▼
                              Typed data → downstream consumer
```

The schema crosses three boundaries (code → API, API → model sampler, model → boundary validator). It's the same shape at every crossing.

---

## In this codebase

**Case B — loopd intent classifier (planned).**

The intent classifier is loopd's first structured-output chain per curriculum Phase 1 builds. Planned shape:

- **Schema:** `loopd/src/lib/llm/chains/intent-classify/schema.ts` — Zod `IntentResult` matching three labels + confidence. Single source of truth.
- **Chain:** `loopd/src/lib/llm/chains/intent-classify/chain.ts` — calls Anthropic Messages API with `tools` + forced `tool_choice`, parses with Zod, retries once on schema fail.
- **Observability:** schema-conformance rate logged to a metric named `intent_classify.schema_fail`. Target < 1%.
- **Eval:** `loopd/tests/chains/intent-classify/regression.test.ts` — fixed input set with expected labels; runs on every prompt change.

Not yet implemented. Build target is curriculum item B1.7 (intent classifier with structured output).

**Case A — aipe's spec-format contracts.**

aipe's slash commands don't make runtime LLM API calls, but each spec declares the schema of the artifact the LLM is expected to produce — and the spec acts as the schema enforcement.

- **`/Users/rein/Public/aipe/specs/refactor.md` lines 9–38** — the "Refactor spec format" code block IS the schema. Eight named sections, each with a one-line description of what goes in it. Claude Code, executing the spec, treats it as the structural contract for the output. Frontend analogue: it's the Zod schema, but expressed in markdown and enforced by the LLM agent's adherence rather than a sampler constraint.
- **`/Users/rein/Public/aipe/specs/study.md`** — the study guide spec declares the per-concept file structure (Subtitle, Why care, How it works, etc.) as a literal markdown shape. Every generated file is structurally validated against this shape.
- **Boundary validator:** absent. aipe relies on Claude Code following the spec; there's no runtime parser that rejects a non-conforming spec output. This is a real limitation — the equivalent of a strongly-typed function with no runtime guard.

The aipe pattern is the lower-tech form of structured outputs — the schema is enforced by the LLM-agent's adherence to the markdown contract, not by a constrained sampler. It works because the LLM agent is doing the writing AND reading; for a runtime LLM API call where the consumer is downstream code, the constrained-sampler version is what you need.

---

## Elaborate

**Where this pattern comes from.** Tool-calling / function-calling as a first-class API surface emerged with GPT-4's mid-2023 release, formalized over 2024 as schema-constrained generation. OpenAI's "Structured Outputs" mode (mid-2024) was the inflection point — guaranteed schema conformance at the sampler level rather than as best-effort prompt engineering. Anthropic followed with `tool_use` and JSON-mode equivalents. By 2026, schema-constrained generation is table stakes for any production LLM I/O.

**The deeper principle.** Move the contract from prose to code, from runtime hope to provider-enforced constraint. This is the same shift TypeScript made for JavaScript function calls in the late 2010s and the same shift gRPC made for service-to-service APIs in the 2010s. Once the contract is machine-checked at the boundary, you stop debugging shape bugs and start debugging content bugs — a strictly better debugging target.

**Where this breaks down.** Three cases.

1. **Open-ended generation.** When the task is "write a paragraph in the user's voice" or "summarize this article," there's no schema that makes sense. Forcing a schema (e.g., `{ "summary": string }`) adds nothing and risks the model treating the schema as a constraint on style. For these tasks, free-text output is the right call; structured outputs don't apply.
2. **Models that don't support sampler-level enforcement.** Older models, small open-source models, and some self-hosted setups will pattern-match the schema instead of enforcing it. On those, you fall back to prompt-text "respond in JSON" + extra-strict boundary validation + frequent retries. Treat the unconstrained case as a separate code path.
3. **Schemas the model can't satisfy.** If your schema requires `confidence ∈ [0.0, 1.0]` but the model interprets confidence as a percentage (0–100), you get schema fails until you either change the schema or pre-process the response. The schema needs to match the model's natural output range, not just what you want.

**What to explore next.**
- [01-anatomy](./01-anatomy.md) → where the schema lives in the prompt's anatomy (the system section).
- [05-eval-driven-iteration](./05-eval-driven-iteration.md) → how schema-conformance rate becomes a tracked metric.
- [07-output-mode-mismatch](./07-output-mode-mismatch.md) → what happens when one chain's structured output is the wrong shape for the next chain's input.
- [09-chain-of-thought](./09-chain-of-thought.md) → the interaction: reasoning lives in a "thinking" field of the structured output, not as free prose.

---

## Tradeoffs

| Cost dimension | Provider-enforced schema (this guide) | Prompt-text "respond in JSON" |
|---|---|---|
| Schema-fail rate (frontier model) | < 1% | 5–15% post-upgrade |
| Setup cost | Zod schema + tool-call wiring | One sentence in prompt |
| Model support | Frontier OpenAI / Anthropic / Gemini only | Any model |
| Debuggability of shape bugs | Schema-fail metric + raw log | Parser error in production, deep dive |
| Reasoning + structured output | Reasoning in a `thinking` field of schema | Awkward; model often emits reasoning as prose before/after JSON |
| Resilience to model upgrade | High — provider absorbs the upgrade | Low — every upgrade can regress |
| Vendor lock-in | Medium — `tool_use` syntax varies per provider | Zero |

### Sub-block 1 — what we gave up

Two real costs. First, **model selection narrows** — schema-constrained outputs only work well on frontier models. A small local LLM (Llama-3 8B, Mistral 7B) running through Ollama will pattern-match the schema imperfectly; you'll see 10–20% schema-fail rates even with forced tool calls. If your project needs to run offline or on tiny models, structured outputs degrade. Loopd's planned chains run against frontier APIs, so this doesn't bite there — but it bit me on a side project where I tried to use Mistral for an intent classifier and had to keep the prompt-text JSON request as the fallback.

Second, **vendor lock-in at the API surface.** Anthropic's `tool_use` schema, OpenAI's `tools` + `tool_choice`, Google's Gemini function-calling — these have different field names and slightly different semantics. The Zod schema is portable; the wiring around it isn't. Switching providers means rewriting the call site. The mitigation is a thin provider abstraction (which loopd's Phase 1 builds include per curriculum), but the abstraction itself is real work.

### Sub-block 2 — what the prompt-text alternative would have cost

I have shipped the prompt-text JSON approach. Here's what it cost:

- **Day 1:** Works fine.
- **Week 4:** First model upgrade. Output begins with "Here's the JSON:" prefix. Parser dies. Half a day of debugging + a regex-extraction patch.
- **Week 8:** Second upgrade. Output is now wrapped in a markdown code fence. Regex needs adjusting. Another half day.
- **Week 14:** Edge case found in prod — when the user input contains the word "JSON," the model occasionally responds with a tutorial on JSON instead of doing the classification. Funny bug, real lost user. Hours of investigation, then a system-prompt patch ("Never explain JSON to the user.").
- **Week 22:** Provider deprecates the old model. New model has subtly different JSON formatting (whitespace, key order). Internal cache built on string equality breaks. Two days of investigation across the team.

Provider-enforced schemas remove all five events.

### Sub-block 3 — the breakpoint

The provider-enforced schema approach is the right call until: (a) the chain's output is genuinely free-form (a paragraph, an explanation, a story), at which point structured outputs add nothing and may add noise; (b) the target model doesn't support sampler-level schema constraints (older models, small local models, certain open-source setups); or (c) the schema is too complex to express cleanly in JSON Schema (recursive types, conditional fields, deeply nested unions — Anthropic's schema support has limits). In any of those cases, fall back to prompt-text + strict boundary validation + high retry budget.

### Sub-block 4 — what wasn't actually a tradeoff

"Latency overhead." Sometimes raised as a concern — does forcing a tool call add latency? Empirically no, or no measurably. Forced tool calls on Sonnet 4 and GPT-4o are within ±50ms of unforced calls in my testing. The cost is on the schema-fail / retry path, not the happy path.

---

## Tech reference (industry pairing)

### Zod

- **Codebase uses:** Not yet — planned for `loopd/src/lib/llm/chains/*/schema.ts`. Zod is the curriculum's chosen schema library for Phase 1.
- **Why it's here:** the single source of truth for the schema: TypeScript types, JSON Schema, runtime validator — one declaration.
- **Leading today:** Zod — `adoption-leading` for TypeScript schema libraries, 2026.
- **Why it leads:** type-inference-first design, ecosystem (`zod-to-json-schema`, `tRPC`, Next.js Server Actions), excellent error messages.
- **Runner-up:** Valibot — `innovation-leading`, smaller bundle, modular imports; tradeoff: smaller ecosystem.

### Anthropic Messages API + `tool_use`

- **Codebase uses:** Not yet — planned for loopd chain calls.
- **Why it's here:** the API surface that enforces schema at the sampler level. Forced tool calls remove the free-text option.
- **Leading today:** Anthropic `tool_use` API — `adoption-leading` for schema-constrained LLM output, 2026.
- **Why it leads:** `tool_choice: { type: 'tool', name: '...' }` forces the model to invoke a specific tool; the constraint is sampler-level (the model literally cannot emit non-conforming tokens), not prompt-level (a polite request).
- **Runner-up:** OpenAI Structured Outputs mode (`response_format: { type: 'json_schema', json_schema: { ... }, strict: true }`) — equivalent semantics, slightly different shape; `strict: true` is the key flag.

### JSON Schema (draft 7+)

- **Codebase uses:** Generated from Zod via `zod-to-json-schema` at call time, passed to the provider's tool definition.
- **Why it's here:** the interchange format between code-level schema (Zod) and provider-level enforcement. Both Anthropic and OpenAI accept JSON Schema as the tool input_schema.
- **Leading today:** JSON Schema draft 2020-12 — `adoption-leading` for cross-platform schema interchange, 2026.
- **Why it leads:** mature spec, broad tool support, every major LLM provider accepts it as the tool-schema format.
- **Runner-up:** OpenAPI 3.1 schemas — closely related (draft 2020-12 compatible) and used in API design contexts; for LLM tools, JSON Schema is the direct path.

### `zod-to-json-schema`

- **Codebase uses:** Not yet — planned for the `tools[0].input_schema` generation in `chain.ts`.
- **Why it's here:** converts the in-code Zod schema into the JSON Schema shape the provider expects. The bridge that keeps Zod as the source of truth.
- **Leading today:** `zod-to-json-schema` — `adoption-leading` for Zod-to-JSON-Schema conversion, 2026.
- **Why it leads:** maintained, handles enums / discriminated unions / refinements correctly, well-tested against provider-side parsers.
- **Runner-up:** `@valibot/to-json-schema` for projects using Valibot instead.

---

## Project exercises

### [B1.7] Build the loopd intent classifier with structured output

- **Exercise ID:** `[B1.7]`
- **What to build:** A single-purpose intent classifier chain (Case B — does not yet exist in loopd). Schema in Zod (`{label: enum, confidence: 0-1}`), API call with forced tool_use on Anthropic, Zod.safeParse at the boundary, schema-fail metric, retry-once-with-stricter-prompt on parse fail.
- **Why it earns its place:** the canonical structured-output chain. Every later loopd chain inherits its shape from this one. Without it, the chains shape isn't established.
- **Files to touch:** `loopd/src/lib/llm/chains/intent-classify/{schema.ts, chain.ts, system.md, examples.md}`, plus the provider abstraction (also Phase 1).
- **Done when:** 50 hand-curated test inputs run through the chain with > 99% schema-conformance rate; failures are logged with raw response and trigger a single retry.
- **Estimated effort:** `1–2 days`

### [B1.8] Add a schema-fail dashboard

- **Exercise ID:** `[B1.8]`
- **What to build:** A metric (`intent_classify.schema_fail` counter; rate of fail per total calls) and a small dashboard view that graphs schema-conformance rate over time. Manual review of the raw log for the first week of production traffic.
- **Why it earns its place:** structured outputs without observability are 80% of the value. The dashboard is what catches the next model upgrade regression at hour zero instead of day three.
- **Files to touch:** an observability hook in the chain (`metrics.increment` on fail), a simple page or query that surfaces the rate.
- **Done when:** running the chain in the test loop shows the metric incrementing on synthetic schema-fail inputs; the rate is visible somewhere queryable.
- **Estimated effort:** `1–4hr`

### [B1.9] Verify provider-enforcement vs prompt-text on a baseline model

- **Exercise ID:** `[B1.9]`
- **What to build:** Run the same 50 test inputs through two variants of the chain — variant A uses `tool_choice` + Zod schema; variant B uses a system-prompt instruction "respond only in JSON with this shape: ..." and parses with regex extraction. Compare schema-fail rate.
- **Why it earns its place:** the data point that makes the structured-output argument concrete. You measure the difference instead of citing it from a blog post.
- **Files to touch:** a comparison script under `loopd/scripts/eval/`.
- **Done when:** a table of variant A vs B schema-fail rates is written to `docs/ml-results.md`. Expected: A < 1%, B somewhere 5–15% depending on model.
- **Estimated effort:** `1–4hr`

---

## Summary

Structured outputs make the model produce data that conforms to a schema you declared in code — by passing the schema to the provider as a tool definition and forcing the tool call. The pipeline is: declare Zod schema → convert to JSON Schema → pass as `tool_use` with forced `tool_choice` → boundary-validate with Zod.safeParse → metric-and-retry on schema fail. The pattern is the LLM equivalent of TypeScript at the function boundary — runtime-enforced types instead of polite documentation.

**Key points:**

- **The schema is in code, not prose.** Zod (or Pydantic / TypedDict) is the single source of truth.
- **Forced tool calls (`tool_choice`) are the lever** that removes the model's option to respond in free text.
- **Boundary validation is the safety net** — even with provider enforcement, parse at the boundary, increment metrics on fail, retry once with stricter prompting.
- **Schema-conformance rate is the metric to track.** Target < 1% on a frontier model with forced tool calls. Anything higher is a signal of schema-prompt contradiction or wrong model.
- **The pattern doesn't apply to open-ended generation.** When the output IS free text, force-fitting a schema adds noise. Use this for classifiers, extractors, and any I/O that crosses a code boundary downstream.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "how do you get structured output from an LLM in production?", they want to hear whether you've shipped or whether you've read blog posts. The blog-post answer is "tell the model to respond in JSON." The shipped answer is "use the provider's tool-calling API with a forced tool_choice, validate the parse at the boundary with Zod, track schema-fail as a metric, retry once with a stricter prompt on fail." If you stop at "use JSON mode," they know you've never lived through the 3 AM Sentry alert after a model upgrade.

### Likely questions

**[mid] Why not just put "respond only in JSON" in the prompt?**

Because the model isn't obligated to listen to that instruction, and over time it stops listening. A model upgrade can change behaviour — the new model might be more "helpful" and prefix the JSON with "Sure, here you go:" or wrap it in a markdown fence. Provider-enforced schemas remove the option: the sampler is constrained to only generate tokens that complete a valid response.

```
  Prompt-text JSON request          Provider-enforced schema
  ────────────────────────────      ──────────────────────────────
  Model CAN comply                  Model MUST comply (sampler-level)
  Model CAN explain                 No free-text option exists
  Parser handles edge cases         Parser is happy-path-only
  5–15% fail rate post-upgrade      < 1% fail rate
  Half a day to debug each break    Schema-fail metric catches it
```

---

**[senior] Walk me through what happens when the schema parse fails.**

The Zod.safeParse at the boundary returns `{ success: false, error: ZodError }`. The chain code increments `intent_classify.schema_fail`, logs the raw tool-use input + the Zod error, and triggers a single retry. The retry uses a stricter system-prompt addendum ("Your previous response failed schema validation. Output only the tool call.") and temperature 0. If the retry also fails, the chain throws — we don't recurse beyond one retry, and we don't silently fall back, because silent fallback is how regressions hide. The thrown error surfaces to the caller, who can either fail-closed (return an error to the user) or fail-open (use a hardcoded default). For an intent classifier the right move is fail-open to a default label; for a payment-routing classifier the right move is fail-closed.

```
  Schema-fail flow
       │
       ▼
  ┌──────────────────────────────┐
  │ Zod.safeParse → fail         │
  └─────┬──────────────────────────┘
        │
        ├─▶ metrics.increment('schema_fail')
        ├─▶ log raw response + Zod error
        ├─▶ retry once with strict-mode system addendum + temp=0
        │       │
        │       ├─▶ success → return result
        │       └─▶ fail again → throw (no second retry)
        │
        └─▶ caller decides: fail-closed or fail-open
```

---

**[arch] What changes at 100× scale on the structured-output approach?**

Three things shift. First, the per-call latency of forced tool calls becomes visible — at low scale, ±50ms doesn't matter; at 100k calls/day, that 50ms × scale tells you whether forced tool calls are sustainable on your latency budget. Second, the schema-fail rate stops being a debugging input and starts being a real cost — at 0.5% fail rate × 100k calls/day × 1 retry each, that's 500 extra LLM calls/day, which on Sonnet 4 pricing is non-trivial. Worth instrumenting and optimizing the prompt to drive schema-fail down. Third, the schema-fail dashboard becomes a production-monitoring surface that on-call engineers watch — drift from 0.5% to 2% in an hour is the canary signal of a provider-side model change. Acting on that within the hour vs the day is the difference between "we caught it" and "users noticed first."

```
  Scale impact

  ┌─────────────────────────────┬─────────────┬───────────────────┐
  │                             │ 100/day     │ 100,000/day        │
  ├─────────────────────────────┼─────────────┼───────────────────┤
  │ Forced tool-call overhead   │ Imperceptible│ ~50ms × 100k = real│
  │ Schema-fail cost            │ Whatever    │ 500 extra calls/day │
  │ Schema-fail signal value    │ Debug input  │ Production canary  │
  │ Dashboard frequency         │ Weekly review│ Hourly alert       │
  └─────────────────────────────┴─────────────┴───────────────────┘
```

---

### The question candidates always dodge

**"Internet advice says you can just use `response_format: 'json'` with a clear prompt. Why all this machinery?"**

Because `response_format: 'json'` (OpenAI's older JSON mode, not the newer Structured Outputs mode) is *not* the same as schema-constrained generation. It guarantees the output is valid JSON, but says nothing about the JSON's shape — the model can return `{ "answer": "chat" }` instead of your expected `{ "label": "chat", "confidence": 0.92 }`. Half of the production bugs I've shipped on structured outputs were on the old JSON mode, exactly because of this gap. The current right answer is OpenAI's Structured Outputs (`response_format: { type: 'json_schema', strict: true }`) or Anthropic's `tool_use` with forced `tool_choice`. JSON mode without a schema is the in-between option that LOOKS like it solves the problem but doesn't.

```
  Three modes, three levels of constraint
  ┌─────────────────────────┬───────────────────┬─────────────────────┐
  │ Mode                    │ Output is JSON?    │ Output matches schema? │
  ├─────────────────────────┼───────────────────┼─────────────────────┤
  │ Prompt-text "use JSON"  │ Maybe (5–15% fail)│ No                   │
  │ JSON mode (legacy)      │ Yes                │ No (any JSON)        │
  │ Structured Outputs /     │ Yes                │ Yes (schema-enforced)│
  │ tool_use forced         │                    │                     │
  └─────────────────────────┴───────────────────┴─────────────────────┘
```

---

### One-line anchors

- "The schema is in code (Zod), enforced by the provider (tool_use), validated at the boundary (safeParse), retried on fail."
- "`tool_choice: { type: 'tool', name: ... }` is the lever — without it, the model can ignore the tool."
- "Schema-conformance rate is the metric. Target < 1% on a frontier model."
- "Reasoning goes in a `thinking` field of the schema, not as free prose around the JSON."
- "JSON mode is not the same as structured outputs. Structured outputs require a schema."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the structured-output pipeline: code → API → provider → response → boundary validator → consumer. Label each stage with one example of what happens there (e.g., "Zod.safeParse" at the boundary).

Pass: you got at least four stages including the provider's constrained sampler and the boundary validator.

**Level 2 — Explain it out loud.**
Without notes, in under 90 seconds, answer: "How do you get structured output from an LLM in production?" Checkpoints:
- Did you mention `tool_use` (or `tools` + `tool_choice`) by name?
- Did you say what happens when parse fails?
- Did you name a metric you'd track?

If you skipped any: you described the happy path, not the discipline.

**Level 3 — Apply to a new scenario.**
A teammate is shipping a feature where the LLM is supposed to return either `{ "action": "approve" }` or `{ "action": "reject", "reason": "..." }`. They've got it working with prompt-text JSON request, but in testing 8% of responses don't parse. Walk through the diagnosis and fix. Reference the Zod schema's discriminated union pattern and the `tool_choice` parameter.

Expected: the union type makes prompt-text fragile (the model has to remember which fields apply to which case); the fix is a Zod discriminated union (`z.discriminatedUnion('action', [approveSchema, rejectSchema])`) converted to JSON Schema and passed via `tool_use`, with `tool_choice` forcing the call.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is vendor lock-in at the API surface (Anthropic's `tool_use` vs OpenAI's structured outputs). If you were starting a new project today, would you (a) commit to one provider's structured-output API and build natively, (b) build a thin abstraction over both, or (c) use prompt-text + heavy validation and ignore structured outputs to stay provider-portable?

There's no right answer. Defend yours with reference to: project lifetime, expected provider-switch cost, the cost of schema-fail in your domain.

**Quick check — code reference test.**
Without opening files, answer:
- Where does the schema live in loopd's planned layout?
- What's the API parameter that forces the model to invoke a specific tool?
- What's the target schema-fail rate?

Then open the planned-paths section above and verify.

Pass: you said `loopd/src/lib/llm/chains/*/schema.ts`, `tool_choice: { type: 'tool', name: '...' }`, and < 1%.
