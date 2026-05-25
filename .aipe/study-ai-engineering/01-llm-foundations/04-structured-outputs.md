# Structured outputs (AI-engineering angle)

**Industry name(s):** Structured outputs, tool calling, function calling, JSON mode, schema-constrained generation
**Type:** Industry standard

> The provider's API constrains the sampler to produce only outputs matching a declared schema. Forced tool_use (Anthropic) or `response_format: { type: 'json_schema', strict: true }` (OpenAI) is the 2026 way; prompt-text "respond only in JSON" is 2022. The prompt-engineering angle (when and how to use it) lives in the prompt-engineering guide; this file covers the AI-engineering angle — how the constraint works at the provider/sampler level, and how it affects model selection and observability.

**See also:** → prompt-engineering [02-structured-outputs](../../study-prompt-engineering/02-structured-outputs.md) · → [03-sampling-parameters](./03-sampling-parameters.md) · → [04-agents-and-tool-use/02-tool-calling](../04-agents-and-tool-use/02-tool-calling.md) · → [05-evals-and-observability/04-llm-observability](../05-evals-and-observability/04-llm-observability.md)

---

## Why care

**Move 1.** Your classifier returns a JSON object via prompt-text request. 5% of calls return JSON wrapped in a markdown code fence after a model upgrade — your parser breaks. Investigation: prompt-text JSON request relies on the model "deciding" to comply; structured outputs would have removed the option.

**Move 2.** That "how does the provider constrain the sampler" question is what structured outputs answer at the AI-engineering layer. Not when to use them (prompt-engineering question). Just: what mechanism enforces the schema at the sampler level, and what that implies for model selection, parameter tuning, and observability.

**Why you need to answer that question at all:** Two failures hide in not knowing the constraint mechanism. First, **picking wrong models** — older or smaller models don't support sampler-level schema constraints reliably; you fall back to prompt-text + boundary validation + retries. Second, **schema-fail rate is meaningless** if you don't measure it — the "did the model produce conforming output" signal is the simplest LLM quality metric available.

**Move 5.** Structured outputs are what TypeScript at the function boundary did for backend code in the 2010s — runtime-enforced types instead of polite documentation. The mechanism is sampler-level token masking; the user-visible effect is "the output always matches the schema."

---

## How it works

### Move 1 — The mental model

Think of an HTML form with strict client-side validation: `<input type="number" min="0" max="100">`. The browser refuses to submit non-conforming input. Sampler-level schema constraints work similarly — the model's token sampler at each step is restricted to tokens that complete a valid output.

Strategy in plain English: **the schema is in code (Zod / Pydantic / JSON Schema). The provider receives it via `tool_use` or `response_format`. At each sampling step, only tokens that complete a valid output are eligible. The model literally cannot emit non-conforming output.**

```
  Sampler-level constraint (the form-validation analogy)
  
  At each sampling step:
    1. Model produces logits over vocab
    2. Constraint engine identifies tokens that would lead to valid output
    3. Mask invalid tokens (set their probability to 0)
    4. Sample from the valid set
  
  Repeat until output is complete and matches schema.
```

The constraint is enforced by the provider's serving infrastructure, not by post-hoc validation.

---

### Move 2 — The layered walkthrough

#### The schema layer

The schema is declared in code, typed:

```ts
import { z } from 'zod';

const CoachingOutput = z.object({
  coaching: z.string().min(20).max(500),
  cites_classifier: z.boolean(),
  next_focus: z.enum(['form', 'volume', 'consistency', 'rest']).optional(),
});
```

Then converted to JSON Schema for the API:

```ts
import { zodToJsonSchema } from 'zod-to-json-schema';
const jsonSchema = zodToJsonSchema(CoachingOutput);
```

One Zod schema produces: TypeScript types + JSON Schema for the API + runtime validator at the boundary. Three uses, one declaration.

---

#### The API layer: tool_use (Anthropic)

The schema is passed to the API as a tool definition. The model is instructed (via `tool_choice`) to call the tool — meaning the model's output is constrained to a valid tool call with arguments matching the schema.

```ts
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  system: systemPrompt,
  messages: [...],
  tools: [{
    name: 'emit_coaching',
    description: 'Emit the coaching message.',
    input_schema: jsonSchema,
  }],
  tool_choice: { type: 'tool', name: 'emit_coaching' },  // FORCE the call
});

// response.content[0] is { type: 'tool_use', name: 'emit_coaching', input: {coaching, cites_classifier, ...} }
```

The `tool_choice` parameter is the lever. Without it, the model can ignore the tool and respond in free text. With it, the model MUST call the named tool with valid arguments.

---

#### The API layer: response_format (OpenAI)

OpenAI's equivalent is `response_format` with `strict: true`:

```ts
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'CoachingOutput',
      strict: true,
      schema: jsonSchema,
    },
  },
});
// response.choices[0].message.content is a JSON string matching the schema
```

The `strict: true` flag enables sampler-level constraint. Without it, the model is asked nicely to comply (similar to old "JSON mode") but constraint isn't enforced at sampling time.

---

#### Model support

Sampler-level structured outputs require model support. Not every model has it.

```
  Model support matrix (rough, 2026)
  
  ┌────────────────────────────────┬──────────────────────────────┐
  │ Model                          │ Sampler-level schema constraint │
  ├────────────────────────────────┼──────────────────────────────┤
  │ Anthropic Sonnet 3.5+, Haiku 4+│ Yes (tool_use)                  │
  │ OpenAI GPT-4o, GPT-4o-mini     │ Yes (response_format strict)    │
  │ Google Gemini 2+               │ Yes (function calling)          │
  │ Anthropic Sonnet 3, Haiku 3    │ Partial (tool_use without strict)│
  │ Older models (GPT-3.5, etc.)   │ Not reliably                    │
  │ Open-source <70B               │ Often not                       │
  └────────────────────────────────┴──────────────────────────────┘
```

Frontier and current-tier models support it; older or smaller models often don't. For chains routing to small open-source models, fall back to prompt-text + boundary validation + retries.

---

#### Schema-fail rate as a metric

Even with sampler-level constraints, a tiny fraction of outputs can fail Zod validation at the boundary (rare model-side bugs, edge cases in the constraint engine). Track schema-fail rate as a chain health metric:

```ts
const result = await callLLM(...);
const toolUse = result.content.find(c => c.type === 'tool_use');
const parsed = CoachingOutput.safeParse(toolUse.input);

if (!parsed.success) {
  metrics.increment('coaching_agent.schema_fail');
  log.warn({ event: 'schema_fail', raw: toolUse.input, error: parsed.error });
  // Optionally retry with stricter system-prompt addendum
  return retryWithStricter(...);
}
```

**Target schema-fail rate on a frontier model with forced tool_use: < 1%.** Higher rates indicate:
- Wrong-model (using one without strong support)
- Schema-prompt contradictions (system prompt asks for fields not in schema, or vice versa)
- Schema too complex for the model

The metric is the simplest LLM-quality signal you can put on a dashboard.

---

#### Reasoning + structured output

When you want both reasoning AND structured output, put the reasoning IN the schema, not as free prose around it:

```ts
const CoachingWithReasoning = z.object({
  reasoning: z.string().describe('Consider: form quality, consistency, what to emphasize'),
  coaching: z.string(),
  cites_classifier: z.boolean(),
});
```

Field order matters — `reasoning` BEFORE `coaching` so the model reasons before answering. (Covered in detail in prompt-engineering [09-chain-of-thought](../../study-prompt-engineering/09-chain-of-thought.md).)

---

### Move 3 — The principle

Structured outputs move the format contract from polite prose ("please respond in JSON") to sampler-level constraint (the model literally cannot emit non-conforming output). The mechanism is provider-side token masking. The user-visible effect is reliability: outputs always match the schema. The discipline: declare schemas in code (Zod), pass them via the provider's tool_use or response_format API, validate at the boundary, track schema-fail rate as a chain metric.

---

## Structured outputs (AI-engineering angle) — diagram

```
┌─ Code layer ─────────────────────────────────────────────────────────────────┐
│                                                                              │
│   Zod schema (source of truth)                                               │
│     ┌────────────────────────────────┐                                       │
│     │ ├─→ TypeScript types            │                                       │
│     │ ├─→ JSON Schema (for API)       │                                       │
│     │ └─→ Runtime validator (boundary)│                                       │
│     └────────────────────────────────┘                                       │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ JSON Schema → API
                                      ▼
┌─ Provider sampler ───────────────────────────────────────────────────────────┐
│                                                                              │
│   At each sampling step:                                                     │
│     - compute next-token logits                                              │
│     - mask tokens that would violate schema                                  │
│     - sample from valid tokens                                               │
│                                                                              │
│   The model literally cannot emit non-conforming tokens.                     │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ tool_use response
                                      ▼
┌─ Boundary validation ────────────────────────────────────────────────────────┐
│                                                                              │
│   Zod.safeParse(toolUse.input)                                               │
│     ✓ success → typed data → downstream                                       │
│     ✗ fail    → metrics.increment + log + retry                              │
│                                                                              │
│   Schema-fail rate: < 1% on frontier models with forced tool_use             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case A (planned) — contrl's coaching agent uses structured outputs.**

The agent's output schema is structured:

```ts
const CoachingOutput = z.object({
  coaching: z.string().min(20).max(500),
  cites_classifier: z.boolean(),
  next_focus: z.enum(['form', 'volume', 'consistency', 'rest']).optional(),
});
```

Via Anthropic's `tool_use` with `tool_choice: { type: 'tool', name: 'emit_coaching' }`. Sonnet 4 supports sampler-level constraints; schema-fail rate target: < 1%.

The agent's **tools** also have structured input schemas (each of the 5 read-only tools has typed parameters). Anthropic's API handles this via the same `tool_use` mechanism.

**Planned implementation paths:**
- `src/lib/agent/schemas.ts` (planned) — Zod schemas
- `src/lib/agent/runner.ts` (planned) — wires schemas into `tools` array, sets `tool_choice`, validates at boundary

---

## Elaborate

**Where this pattern comes from.** Function calling as a first-class API surface emerged with GPT-4 (mid-2023). OpenAI's Structured Outputs mode (mid-2024) introduced sampler-level constraints. Anthropic followed with `tool_use` and forced `tool_choice`. By 2026, sampler-level constraints are standard on frontier models.

**The deeper principle.** Moving contracts from runtime polite-prose to provider-side machine-checked is the same shift TypeScript made for JavaScript function calls in the late 2010s. Once the contract is enforced at the boundary, downstream code stops debugging shape bugs and starts debugging content bugs — a strictly better debugging target.

**Where this breaks down.** Three places.

1. **Open-ended generation.** Schema doesn't help when output is genuinely free-form (a poem, a story). The model needs latitude.
2. **Older or smaller models.** GPT-3.5, Llama-2, smaller open-source models — schema support is partial or absent. Fall back to prompt-text + heavy boundary validation.
3. **Provider-specific schema features.** Some Zod features (refinements, recursive types) don't translate to JSON Schema cleanly. Test your schemas with the provider's API before depending on advanced features.

**What to explore next.**
- prompt-engineering [02-structured-outputs](../../study-prompt-engineering/02-structured-outputs.md) — when and how to use, in detail.
- [03-sampling-parameters](./03-sampling-parameters.md) — temperature interacts with schema constraint (T=0 makes the constraint cleaner).
- [04-agents-and-tool-use/02-tool-calling](../04-agents-and-tool-use/02-tool-calling.md) — the broader tool-calling pattern.

---

## Tradeoffs

(Covered in detail in the prompt-engineering [02-structured-outputs](../../study-prompt-engineering/02-structured-outputs.md) tradeoffs section. Summary here: structured outputs add a Zod schema and one tool/response_format field; eliminate parser bugs; require frontier-model support; constrain creative output.)

### Sub-block 1 — what's specific to the AI-engineering angle

- **Model selection.** Sampler-level constraints require frontier/current models. Older/smaller models force fallback to prompt-text + heavy validation. This is a routing decision.
- **Observability.** Schema-fail rate is the simplest chain-health metric. Track per chain, alert on drift.
- **Latency.** Sampler-level constraints add minimal latency on frontier models (~50ms on Sonnet 4). Older models may add more.

---

## Tech reference (industry pairing)

### Anthropic `tool_use` + forced `tool_choice`

- **Codebase uses:** Planned for the coaching agent.
- **Why it's here:** the Anthropic API surface for sampler-level schema constraint.
- **Leading today:** Anthropic `tool_use` — `adoption-leading` for Anthropic-target structured outputs, 2026.
- **Why it leads:** sampler-level constraint, broad model support across Anthropic's tiers, clean SDK ergonomics.
- **Runner-up:** OpenAI Structured Outputs with `response_format: { strict: true }`.

### Zod + `zod-to-json-schema`

- **Codebase uses:** Planned — Zod for schemas; `zod-to-json-schema` to feed the API.
- **Why it's here:** the bridge from in-code schema to API JSON Schema.
- **Leading today:** Zod — `adoption-leading` for TypeScript schema, 2026.
- **Why it leads:** type inference; ecosystem; clear error messages; mature JSON Schema converters.
- **Runner-up:** Valibot for smaller bundle.

---

## Project exercises

(See prompt-engineering [02-structured-outputs](../../study-prompt-engineering/02-structured-outputs.md) for application exercises. AI-engineering-specific exercise:)

### [B4C.schema-fail-metric] Track schema-fail rate as a chain metric

- **Exercise ID:** `[B4C.schema-fail-metric]` (hypothetical, post-Phase 4)
- **What to build:** Per-chain counter `${chain_name}.schema_fail` incremented on Zod validation failure. Surface on a dashboard. Alert when rate exceeds 1% over a rolling window.
- **Why it earns its place:** the simplest chain-health metric; catches model-upgrade or prompt-drift regressions early.
- **Files to touch:** `src/lib/agent/runner.ts` + observability dashboard.
- **Done when:** synthetic schema-fail produces a metric increment; dashboard shows the metric over time.
- **Estimated effort:** `1–4hr`

---

## Summary

Structured outputs constrain the LLM's sampler to produce only outputs matching a declared schema. Anthropic enforces via `tool_use` with forced `tool_choice`; OpenAI via `response_format: { strict: true }`. Schema is in code (Zod), passed via the API, validated at the boundary. Schema-fail rate is the simplest chain-health metric (target < 1% on a frontier model with forced tool_use). For contrl's coaching agent: Case A planned with Anthropic tool_use.

**Key points:**

- **Sampler-level constraint, not polite-prose request.** The model literally cannot emit non-conforming output.
- **Schema in code (Zod)** → JSON Schema for API → runtime validator. One source of truth.
- **Forced `tool_choice`** is the lever; without it, model can ignore the tool.
- **Model support varies.** Frontier models support reliably; older/smaller may not.
- **Schema-fail rate** is the simplest chain metric. Track per chain.

---

## Interview defense

(See prompt-engineering [02-structured-outputs](../../study-prompt-engineering/02-structured-outputs.md) for general defense. AI-engineering-specific addition:)

### One additional question

**[arch] How does the schema constraint work at the model level?**

At each sampling step, the model's logits over vocab are computed. Before sampling, the constraint engine identifies which tokens would lead to a valid output that matches the schema; invalid tokens are masked (set to 0 probability). The sampler picks from the valid set. The mechanism is provider-side and engine-specific — Anthropic, OpenAI, and Google have different implementations but the same effect: the model cannot emit non-conforming tokens.

---

## Validate your understanding

**Level 1 — Reconstruct.** Draw the pipeline: schema → JSON Schema → API → sampler constraint → response → boundary validation.

**Level 2 — Explain.** "What enforces the schema at the sampler level?" Under 30 seconds.

**Level 3 — Apply.** A teammate uses prompt-text "respond only in JSON" with a smaller model. Schema-fail rate is 8%. Walk through the fix.

Expected: move to a model with sampler-level constraint support (Sonnet 4 / GPT-4o); use tool_use or response_format; track schema-fail rate. Or if stuck with the small model, keep prompt-text + heavier boundary validation + retries.

**Level 4 — Defend.** "Sonnet 4 is overkill for a classifier — use Haiku." Defend with reference to: Haiku also supports tool_use; route to Haiku if its eval-set performance passes; don't pay Sonnet pricing for a classifier task.

**Quick check.**
- Anthropic's API surface for structured outputs? (`tool_use` with `tool_choice`)
- Target schema-fail rate? (< 1% on frontier models with forced tool_use)
- Does contrl's coaching agent use sampler-level constraints? (Yes, planned via Anthropic tool_use)
