# Provider abstraction

**Industry name(s):** Provider abstraction, LLM portability layer, multi-provider strategy
**Type:** Industry standard

> A thin abstraction between your application code and the LLM provider's SDK lets you swap providers without rewriting chain code. The discipline: hide provider-specific shapes (Anthropic's `tool_use` vs OpenAI's `tools` + `tool_choice`; different streaming events; different rate-limit headers) behind a common interface. Cost: real engineering effort. Benefit: provider-switch as a config change, not a rewrite.

**See also:** → [01-what-an-llm-is](./01-what-an-llm-is.md) · → [04-structured-outputs](./04-structured-outputs.md) · → [04-agents-and-tool-use/02-tool-calling](../04-agents-and-tool-use/02-tool-calling.md)

---

## Why care

**Move 1.** Your app uses Anthropic via `@anthropic-ai/sdk` directly throughout the codebase. The provider raises prices 30%. You evaluate OpenAI; their model passes your eval set. You decide to switch. Then you find: every chain file imports the Anthropic SDK directly. Every chain uses Anthropic's `tool_use` shape. Streaming events are Anthropic-specific. Rate-limit headers are Anthropic-specific. Switching means rewriting every chain. Time estimate: weeks.

**Move 2.** That "can I swap providers without a rewrite" question is what provider abstraction answers. Not which provider to use today. Just whether the architecture allows swap as a config change vs an engineering project. The abstraction is a thin wrapper around provider-specific APIs that exposes a common shape: `chat(messages, schema?)` → `{response, tokens_in, tokens_out, schema_pass}`.

**Why you need to answer that question at all:** Two patterns drive provider switches. First, **price changes** — vendor pricing fluctuates; if Anthropic raises Sonnet pricing, you might want to switch. Second, **capability changes** — new models from a competitor pass your evals better. Without abstraction, each switch is a rewrite; with abstraction, it's a config field.

**Before / after.**

Without abstraction:
- Provider switch = rewrite every chain. Weeks of work.
- Multi-provider routing (different providers per chain) = impossible without rewriting.

With abstraction:
- Provider switch = update provider config; re-run evals; ship.
- Multi-provider routing = per-chain provider field.

**Move 5.** Provider abstraction is what database abstraction layers do for backend code — swap Postgres for MySQL with a config change (mostly), not a rewrite. The cost is the abstraction itself; the benefit is portability when constraints change.

---

## How it works

### Move 1 — The mental model

Think of a `Logger` interface in a backend. `Logger.info(message)` works whether the backend is console, Sentry, Datadog, or local file. The interface hides the backend specifics. Your application code calls `Logger.info()`; the backend implementation lives behind the interface.

LLM provider abstraction is the same. `LLMClient.chat(messages, schema?)` works whether the provider is Anthropic, OpenAI, or Google. The implementation lives behind the interface.

Strategy in plain English: **define a common interface (`LLMClient`). Implement per provider. Application code only uses the interface. Provider becomes a config choice.**

```
  Application code         Abstraction         Provider SDKs
  ───────────────────      ────────────        ─────────────────────
  src/lib/agent/runner.ts → LLMClient    →    @anthropic-ai/sdk
                                              openai
                                              @google/generative-ai
                          
                          Config:
                            provider: 'anthropic'
                            model: 'claude-sonnet-4-6'
```

---

### Move 2 — The layered walkthrough

#### The common interface

A minimal cross-provider interface:

```ts
interface LLMClient {
  chat(opts: ChatOpts): Promise<ChatResult>;
  stream(opts: ChatOpts): AsyncIterable<ChatChunk>;
  countTokens(opts: CountOpts): Promise<number>;
}

interface ChatOpts {
  model: string;
  system?: string;
  messages: Message[];
  tools?: ToolDefinition[];
  toolChoice?: { type: 'auto' | 'required'; name?: string };
  schema?: JSONSchema;
  temperature?: number;
  maxTokens: number;
}

interface ChatResult {
  content: ContentBlock[];   // text or tool_use
  usage: { inputTokens: number; outputTokens: number; cacheHit?: number };
  stopReason: string;
}
```

The interface is the contract; the implementation per provider does the translation.

---

#### Per-provider implementation

```ts
class AnthropicClient implements LLMClient {
  constructor(private client: Anthropic) {}
  
  async chat(opts: ChatOpts): Promise<ChatResult> {
    const response = await this.client.messages.create({
      model: opts.model,
      system: opts.system,
      messages: opts.messages,
      tools: opts.tools?.map(toAnthropicTool),
      tool_choice: mapToolChoice(opts.toolChoice),
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    });
    
    return {
      content: response.content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheHit: response.usage.cache_read_input_tokens,
      },
      stopReason: response.stop_reason,
    };
  }
  
  // similar for stream, countTokens
}

class OpenAIClient implements LLMClient {
  // ... maps OpenAI's response_format + tools to the common shape
}
```

The translation layer handles:
- API parameter name differences (max_tokens vs maxTokens).
- Tool-use vs response_format mechanism differences.
- Streaming event shape differences (SSE event names differ).
- Token-count field naming differences.
- Rate-limit header format differences.

---

#### Factory pattern + config

```ts
function createLLMClient(provider: string): LLMClient {
  switch (provider) {
    case 'anthropic': return new AnthropicClient(new Anthropic({...}));
    case 'openai':    return new OpenAIClient(new OpenAI({...}));
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

// Application code
const llm = createLLMClient(config.provider);
const result = await llm.chat({
  model: config.model,
  ...
});
```

Provider becomes a config field. Switching providers = updating config + re-running evals.

---

#### What can't be abstracted cleanly

Some provider-specific features don't translate:

**1. Anthropic's `cache_control`** vs OpenAI's implicit caching. The mechanism differs; the abstraction has to either default to one approach or expose both as optional fields.

**2. Extended thinking (Claude 4)** vs OpenAI o-series reasoning. Different APIs, different output shapes. The abstraction can expose a `reasoning?: boolean` field; the implementations interpret differently.

**3. Provider-specific tool features** (Anthropic's structured input_schema with descriptions vs OpenAI's slightly different schema format). The abstraction either uses the common subset or has provider-specific extension points.

Pragmatic discipline: abstract the 90% that's similar; allow provider-specific options through an escape hatch (e.g., `providerSpecific?: any` field).

---

#### Eval-driven validation on swap

Provider switch is a high-risk change. The abstraction enables the switch; eval validation prevents the regression.

```
  Provider-switch workflow
  
  ┌─────────────────────────────────────────────────────────────────┐
  │ 1. Implement OpenAIClient                                         │
  │ 2. Run eval suite against current (Anthropic) — baseline          │
  │ 3. Run same eval suite against OpenAI                              │
  │ 4. Compare per-case scores                                         │
  │ 5. If no significant regressions → ship                           │
  │ 6. If regressions on critical cases → adjust prompts per provider │
  └─────────────────────────────────────────────────────────────────┘
```

Cross-provider prompts often need tuning — Anthropic-tuned prompts may underperform on OpenAI without adjustments. The abstraction doesn't remove this; the eval suite catches it.

---

### Move 3 — The principle

Provider abstraction trades up-front engineering effort for portability. The cost: a wrapper layer per provider, kept in sync with provider SDKs. The benefit: provider-swap is a config change with eval validation, not a code rewrite. The discipline scales with how seriously you take provider lock-in as a strategic risk.

---

## Provider abstraction — diagram

```
┌─ Application code ───────────────────────────────────────────────────────────┐
│                                                                              │
│   src/lib/agent/runner.ts                                                    │
│     llm.chat({ model, system, messages, tools, schema, ... })                │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Abstraction layer ──────────────────────────────────────────────────────────┐
│                                                                              │
│   interface LLMClient                                                        │
│     chat(opts: ChatOpts): Promise<ChatResult>                                │
│     stream(opts: ChatOpts): AsyncIterable<ChatChunk>                         │
│     countTokens(opts: CountOpts): Promise<number>                            │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                          ┌───────────┴───────────────────┐
                          ▼                               ▼
                  AnthropicClient                  OpenAIClient
                          │                               │
                          ▼                               ▼
                  @anthropic-ai/sdk                openai SDK
```

---

## In this codebase

**Case B — contrl's planned coaching agent uses Anthropic directly.**

contrl's planned approach: use `@anthropic-ai/sdk` directly in `src/lib/agent/runner.ts`. No abstraction layer.

Why: the project is solo-scale with one LLM chain. The cost of abstraction (an extra layer, ongoing maintenance, mapping Anthropic-specific features to a generic interface) exceeds the benefit (provider switch unlikely to happen, and easy enough to handle as a rewrite if it does).

The discipline becomes load-bearing if/when:
- contrl grows beyond one chain.
- Switching providers becomes likely (price change, eval-set divergence, capability gap).
- Multiple providers are used simultaneously (different models for different chains).

**Planned implementation paths:**
- `src/lib/agent/runner.ts` — Anthropic SDK direct usage.
- If portability matters later: introduce `src/lib/agent/llm-client.ts` with the abstraction.

---

## Elaborate

**Where this pattern comes from.** Provider abstraction (interface + per-vendor implementations) is decades old in backend (database drivers, ORM, logging backends). Applied to LLMs in 2023+ as production teams running multi-provider strategies emerged.

**The deeper principle.** Hiding vendor specifics behind interfaces is the same shape as classical "depend on abstractions, not concretions." The cost: keeping the abstraction in sync with vendor changes. The benefit: portability.

**Where this breaks down.** Two places.

1. **Solo-scale projects with one chain.** The abstraction cost exceeds the benefit. Direct SDK usage is fine.
2. **Provider-specific features.** If you depend on Anthropic's extended thinking or OpenAI's structured outputs strict mode, the abstraction has to expose them — either compromising portability or compromising feature use.

**What to explore next.**
- [04-structured-outputs](./04-structured-outputs.md) — the structured-output mechanism differs across providers.
- [04-agents-and-tool-use/02-tool-calling](../04-agents-and-tool-use/02-tool-calling.md) — tool calling differs across providers.

---

## Tradeoffs

| Cost dimension | With abstraction | Without abstraction |
|---|---|---|
| Initial engineering effort | Higher (interface + 1+ implementations) | Lower (use SDK directly) |
| Provider switch cost | Low (config + eval) | High (rewrite) |
| Feature availability | Limited to common subset (or escape hatch) | Full vendor API |
| Maintenance | Kept in sync with vendor SDKs | None (just track SDK updates) |
| Multi-provider routing | Easy | Hard |

### Sub-block 1 — what we gave up

Engineering time to build and maintain the abstraction. For each provider supported, a wrapper class. Each provider SDK update may require adjustments. Real ongoing cost.

### Sub-block 2 — what no abstraction would cost

Already shipped without it: provider switch as a multi-week rewrite project. Not affordable in fast-moving teams. The abstraction pays back the first time a switch is needed.

### Sub-block 3 — the breakpoint

Abstraction is the right call until: (a) one chain, one provider, no portability concern; (b) extreme dependence on provider-specific features that don't abstract cleanly; (c) prototype phase where the chain may not survive. For contrl at solo scale: direct SDK is fine.

### Sub-block 4 — what wasn't actually a tradeoff

"Abstraction adds latency." It doesn't — the wrapper is a thin function call, microseconds. The latency is in the LLM call itself, identical across abstracted and direct paths.

---

## Tech reference (industry pairing)

### Vercel AI SDK (cross-provider abstraction)

- **Codebase uses:** Not yet.
- **Why it's here:** the most-adopted cross-provider abstraction for TypeScript LLM apps.
- **Leading today:** Vercel AI SDK — `innovation-leading` for cross-provider TypeScript apps, 2026.
- **Why it leads:** typed end-to-end; supports Anthropic, OpenAI, Google, others; streaming-native.
- **Runner-up:** LangChain JS — broader scope (chains + agents), more complex; OpenRouter as a routing layer.

### Direct SDK usage

- **Codebase uses:** Planned for contrl's coaching agent.
- **Why it's here:** the simple path at solo scale.
- **Leading today:** `@anthropic-ai/sdk` — `adoption-leading` for Anthropic-target apps without portability concerns, 2026.
- **Why it leads:** clean ergonomics; full feature surface; minimal cognitive overhead.

---

## Project exercises

(For contrl: not yet applicable; direct SDK usage is the right choice at current scale. If/when portability becomes a concern:)

### [B5.x] Introduce LLMClient abstraction

- **Exercise ID:** hypothetical post-Phase 5.
- **What to build:** `src/lib/agent/llm-client.ts` with `LLMClient` interface + `AnthropicClient` implementation. Refactor `src/lib/agent/runner.ts` to use the interface. (Optionally add `OpenAIClient` if a switch becomes likely.)
- **Why it earns its place:** if contrl ever needs to switch providers, the cost of NOT having the abstraction becomes a multi-week rewrite.
- **Files to touch:** `src/lib/agent/llm-client.ts` (new), `src/lib/agent/runner.ts` (refactor).
- **Done when:** runner uses the interface; eval suite passes on the current provider through the interface.
- **Estimated effort:** `1–2 days`

---

## Summary

Provider abstraction trades engineering effort for portability. A common interface + per-provider implementations let you swap providers as a config change rather than a rewrite. Cost: real ongoing maintenance. Benefit: provider-switch becomes feasible. For contrl at solo scale: direct SDK is fine; abstraction is study material. The discipline matters when multi-provider routing or provider switches become likely.

**Key points:**

- **Common interface (`LLMClient`)** hides per-provider API differences.
- **Implementations per provider** translate to the provider's SDK.
- **Provider becomes a config field.** Switch = config update + eval validation.
- **Some features don't abstract cleanly** (extended thinking, prompt caching specifics) — escape-hatch or compromise.
- **For contrl: direct SDK is right.** Solo scale, one chain, low portability concern.

---

## Interview defense

**[mid] Why use a provider abstraction?**

Portability. Without it, provider switch is a rewrite of every chain file. With it, it's a config change + eval validation. Costs engineering effort up front; pays back the first time you need to switch.

**[senior] When NOT to abstract?**

Solo-scale projects with one chain. Prototype phase. Extreme dependence on provider-specific features (extended thinking, advanced caching). The abstraction has a cost that exceeds its benefit at small scale.

**[arch] What can't be abstracted cleanly?**

Provider-specific features: Anthropic's `cache_control`, OpenAI's `response_format: { strict: true }`, extended thinking modes, model-specific tool call syntaxes. Pragmatic discipline: abstract the 90% that's similar; allow provider-specific extension points for the 10%.

---

## One-line anchors

- "Common interface; per-provider implementations; provider as config."
- "Cost: engineering effort up front. Benefit: provider-switch becomes feasible."
- "Eval suite catches regressions on provider swap. Cross-provider prompts often need tuning."
- "Provider-specific features need escape hatch or compromise."
- "For contrl: direct SDK is right at solo scale."

---

## Validate

**Level 1:** Draw the abstraction layer between app code and provider SDKs.
**Level 2:** "Why use provider abstraction?" Under 30 seconds.
**Level 3:** A teammate's app uses 3 Anthropic chains. They want to add a 4th on OpenAI. Walk through the design decision. (Either abstract now, or accept direct-SDK and isolate the OpenAI chain to its own module.)
**Level 4:** Defend skipping abstraction at solo scale.

**Quick check:**
- What's the core interface method? (`chat(opts)`)
- Does contrl use abstraction? (No — direct Anthropic SDK)
- When does the abstraction earn its place? (Multi-provider routing OR likely provider switches.)
