# Tokenization

**Industry name(s):** Tokenization, BPE (Byte-Pair Encoding), SentencePiece, sub-word tokenization
**Type:** Industry standard

> Tokenizers split text into sub-word units (tokens) that the model sees. English averages ~1 token per 4 characters; code and non-Latin scripts are denser. Tokenization is provider-specific — Anthropic and OpenAI use different tokenizers; the same string produces different token counts. Practical implications: cost estimates require the provider's own tokenizer, and "token budget" varies by language and content type.

**See also:** → [01-what-an-llm-is](./01-what-an-llm-is.md) · → [06-token-economics](./06-token-economics.md) · → [02-context-and-prompts/01-context-window](../02-context-and-prompts/01-context-window.md)

---

## Why care

**Move 1.** You're estimating LLM cost for a feature. You count characters in your prompts: ~5000 characters per call. Using "1 token ≈ 4 characters" rule of thumb: ~1250 tokens per call. At 1000 calls/day on Sonnet 4 ($3/1M input tokens), monthly cost: ~$112. You budget accordingly. Two weeks in production, the bill is $180 — 60% higher than estimated. Investigation: a portion of your prompts contain code snippets, which tokenize ~30% denser than prose. Your rough estimate undershot.

**Move 2.** That "how does the model count" question is what tokenization answers. Not how the model interprets text; just how it counts. The model operates on token IDs, not characters. Cost, context-window limits, and rate limits are all measured in tokens. The 4-chars-per-token rule of thumb is for English prose; code, JSON, and non-Latin scripts deviate.

**Why you need to answer that question at all:** Three failures hide in char-based estimation. First, **cost surprises** when content is denser than estimated (code, JSON, special characters). Second, **silent truncation** when token count exceeds the provider's context window. Third, **budget mismatches** when shared prefixes assumed identical bytes differ in tokenization (rare, but happens with Unicode normalization differences).

**Move 5.** Tokenization is what UTF-8 byte length is for HTTP payloads — the actual unit the wire and the provider measure in.

---

## How it works

### Move 1 — The mental model

A tokenizer maps a string to a sequence of integer token IDs from a fixed vocabulary (~100K-200K tokens). The mapping prefers common substrings: "the" is one token; "antidisestablishmentarianism" is multiple tokens.

```
  "Hello, world!" → [Hello] [,] [ world] [!] → [5618, 11, 1917, 0]
                     ↑       ↑    ↑       ↑
                     1 tok   1    1       1   = 4 tokens total
  
  "Internationalization" → [International] [ization] → [10243, 8081] = 2 tokens
  
  "function foo() { return 42; }" → [function] [ foo] [(] [)] [ {] [ return] [ 42] [;] [ }]
                                                                                    = 9 tokens
                                                                                    (denser than prose)
```

Strategy in plain English: **count tokens with the provider's tokenizer when accuracy matters; use rules of thumb for back-of-envelope.**

---

### Move 2 — The layered walkthrough

#### Counting tokens

The accurate way: use the provider's SDK to count.

```ts
// Anthropic
const { input_tokens } = await client.messages.countTokens({
  model: 'claude-sonnet-4-6',
  system: systemPrompt,
  messages: [{ role: 'user', content: input }],
});

// OpenAI (via tiktoken)
import { encoding_for_model } from 'tiktoken';
const enc = encoding_for_model('gpt-4o');
const tokens = enc.encode(systemPrompt).length;
```

The rule-of-thumb way:

```
  Rough token estimates (English; deviate for code/non-Latin)
  
  ┌──────────────────────────┬────────────────────────────────┐
  │ Content type             │ Approx tokens per 100 chars     │
  ├──────────────────────────┼────────────────────────────────┤
  │ English prose            │ ~22                             │
  │ Code (JavaScript)        │ ~30                             │
  │ Code (Python)            │ ~28                             │
  │ JSON (dense keys)        │ ~35                             │
  │ Numbers / IDs / hashes   │ ~50                             │
  │ Chinese / Japanese       │ ~150-200 (much denser)          │
  │ Emoji-heavy text         │ ~50-100                         │
  └──────────────────────────┴────────────────────────────────┘
```

Rough rules:
- English prose: 1 token ≈ 4 characters
- Code: 1 token ≈ 3 characters
- Non-Latin: 1 token ≈ 0.5-2 characters

For cost estimation: use rules of thumb. For budget enforcement: use the provider's tokenizer.

---

#### Tokenizers differ across providers

Anthropic and OpenAI use different tokenizers. Same string → different token counts.

```
  "The quick brown fox jumps over the lazy dog."
  
  Anthropic (Claude):  ~12 tokens
  OpenAI (GPT-4):      ~10 tokens
```

The differences are typically small (~10-20% variation) but enough to matter when budgeting across providers. Don't mix tokenizers across providers — count with the provider you're calling.

---

#### Why tokenization affects observable behavior

Beyond counting, tokenization affects:

**1. What the model "sees" as a unit.** "12345" might be one token or five depending on the tokenizer. A model that sees "12345" as one token has different number-handling behavior than a model that sees it as digits-and-position. Math performance varies with how the tokenizer handles numbers.

**2. Spaces matter.** " world" (with leading space) and "world" (without) are different tokens. Common bug: stripping leading spaces in user input breaks expected tokenization patterns.

**3. Unicode normalization.** Two visually-identical strings can tokenize differently if they use different Unicode encodings (composed vs decomposed forms). Normalize input consistently.

```
  Tokenization gotchas
  
  " hello" vs "hello"  → different tokens (one is "_hello", the other "hello")
  "café" (composed) vs "café" (decomposed) → different bytes, different tokens
  "1234" vs "1,234"    → different token counts (commas tokenize separately)
```

---

#### Practical impacts on prompt design

- **Cost estimation in non-English**: a 1000-character Japanese prompt is ~1500-2000 tokens, not ~250. Plan accordingly.
- **Code-heavy prompts**: budget 30% more tokens than the char-based estimate suggests.
- **JSON in prompts**: heavy in keys and structural tokens; trim verbose JSON when possible.
- **Repeated content**: tokenizes the same way every time → caching works well.
- **Unicode edge cases**: normalize before sending (use NFC) to keep tokenization consistent.

---

### Move 3 — The principle

Tokenization is the unit of measure between you and the provider. Cost, context window, and rate limits are all in tokens. Character-based intuitions are approximations; the provider's tokenizer is ground truth. For most production work, use SDK counting at chain init + rough rules of thumb during development.

---

## Tokenization — diagram

```
┌─ Text → tokens ──────────────────────────────────────────────────────────────┐
│                                                                              │
│   "Hello, world!"                                                            │
│         │                                                                    │
│         ▼ tokenizer (BPE / SentencePiece)                                    │
│   [5618, 11, 1917, 0]                                                        │
│         │                                                                    │
│         ▼ ↑ model only sees IDs                                              │
│   transformer forward pass                                                   │
│         │                                                                    │
│         ▼ outputs logits over vocab                                          │
│   distribution → sample → next token ID                                      │
│         │                                                                    │
│         ▼ tokenizer decoder                                                  │
│   next token as string ("!" or similar)                                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

  Token budget = function of (content length, content type, tokenizer)
  Per-provider tokenizer; counts vary across providers for the same string.
```

---

## In this codebase

**Case B — contrl doesn't directly invoke a tokenizer.**

contrl's planned coaching agent calls Anthropic via the SDK. Token counts come from response headers and the `countTokens` API; no manual tokenization in the codebase.

Practical implications for contrl:
- Cost estimation: SDK provides exact token counts after each call.
- Budget enforcement: `countTokens` call before sending if needed.
- User-supplied content (journal notes) is English prose at modest length; rule-of-thumb estimates suffice.

---

## Elaborate

**Where this pattern comes from.** Sub-word tokenization (BPE) was developed in the 1990s for machine translation, popularized for LLMs by GPT-2 (2019). SentencePiece (Google) is an alternative scheme used by some models. By 2026, every major LLM uses some sub-word tokenizer.

**The deeper principle.** Discrete token vocabularies trade off between coverage (vocabulary size) and granularity (token length). Larger vocabulary = fewer tokens per text = shorter contexts = lower cost. Smaller vocabulary = more tokens per text = better coverage of rare patterns. Modern LLMs lean toward larger vocabularies (100K-200K) optimized for English + code.

**Where this breaks down.** Two cases.

1. **Tokenizer mismatch in pipelines.** If you tokenize text with one model's tokenizer and pass it to another, counts and behavior diverge. Always use the provider's tokenizer.
2. **Heavy non-English content.** Some tokenizers are heavily skewed toward English; non-Latin scripts can tokenize 5-10× denser. Costs compound at scale. Some providers offer tokenizers tuned for specific languages.

**What to explore next.**
- [06-token-economics](./06-token-economics.md) — the cost framing built on token counts.
- [02-context-and-prompts/01-context-window](../02-context-and-prompts/01-context-window.md) — context budgets in tokens.

---

## Tradeoffs

| Cost dimension | Provider tokenizer | Char-based estimate |
|---|---|---|
| Accuracy | Exact | ±20-30% |
| Setup cost | SDK install | Zero |
| Use case fit | Budget enforcement, billing | Quick estimates, dev planning |

(One-block tradeoff — too small for a full table; the decision is "use SDK at production boundary, rule-of-thumb elsewhere.")

### Sub-block 1 — what we gave up

Almost nothing. Calling `countTokens` is a fast API call (sometimes free, sometimes a tiny billed event). Worth doing at chain initialization to verify the constant prefix fits the budget.

### Sub-block 2 — what char-based estimation costs

Token under-estimates by 20-30% on code/non-English content lead to: cost surprises (bill higher than budget), context overflows (didn't expect this much, prompt truncates), rate-limit hits at lower call volumes than planned.

### Sub-block 3 — the breakpoint

Use the provider tokenizer whenever the count matters operationally (cost budgets, context limits, rate limits). Use rules of thumb for back-of-envelope planning where 20-30% error doesn't change the decision.

---

## Tech reference (industry pairing)

### Anthropic `countTokens` API

- **Codebase uses:** Planned for `src/lib/agent/token-counter.ts` at chain init.
- **Why it's here:** ground truth for Anthropic billing.
- **Leading today:** Anthropic SDK — `adoption-leading` for Anthropic-target token counting, 2026.
- **Why it leads:** provider-canonical; matches billing.
- **Runner-up:** `@anthropic-ai/tokenizer` (local package) for batch estimation without API calls.

### `tiktoken` (OpenAI tokenizer)

- **Codebase uses:** Not in contrl.
- **Why it's here:** the canonical OpenAI tokenizer.
- **Leading today:** `tiktoken` — `adoption-leading` for OpenAI token counting, 2026.
- **Why it leads:** provider-shipped; matches API billing exactly.
- **Runner-up:** `gpt-tokenizer` (TypeScript port) for browser environments.

---

## Project exercises

(None directly; tokenization is foundational. Application appears in `04-token-budgeting` from the prompt-engineering guide and in `02-context-and-prompts/01-context-window.md`.)

---

## Summary

Tokenization splits text into sub-word units the model sees. The provider's tokenizer is ground truth for cost, context, and rate limits. English prose tokenizes at ~1 token per 4 characters; code is ~30% denser; non-Latin scripts can be 5-10× denser. Use the SDK's `countTokens` at chain init and at production boundaries; use rules of thumb for development planning.

**Key points:**

- **Token, not character, is the unit of measure** for cost, context, rate limits.
- **English prose: ~1 token per 4 characters.** Code, JSON, non-Latin scripts deviate.
- **Provider tokenizers differ.** Anthropic and OpenAI count the same string differently.
- **Use SDK at production boundary;** rules of thumb in development.
- **Spaces and Unicode normalization matter.** Normalize input for consistent tokenization.

---

## Interview defense

### What an interviewer is really asking

When asked "how do you estimate LLM cost?", they want to hear tokenization-awareness — not character counts. The shipped answer mentions tokenizer-per-provider and the deviation for code/non-English content.

### Likely questions

**[mid] What's the rule of thumb for English token count?**

~1 token per 4 characters. Code is denser (~3 chars/token). Non-Latin scripts can be much denser (Japanese ~1 char/token). For accuracy at the production boundary, use the provider's `countTokens` SDK call.

---

**[senior] Why do tokenizers differ across providers?**

Each provider trains its tokenizer on its training corpus to maximize vocabulary coverage. Different training data → different optimal vocabularies. Anthropic and OpenAI both use BPE-family tokenizers but with different vocab sizes (100K vs 100K+, varying by model) and different merges. Practical impact: never assume token counts transfer between providers; recount with each provider's tokenizer.

---

### One-line anchors

- "Tokens, not characters. English: ~1 token per 4 chars."
- "Provider tokenizers differ. Always use the provider's own count."
- "Code and JSON tokenize denser than prose."
- "Non-Latin scripts can be 5-10× denser than English."
- "SDK countTokens at production boundaries; rules of thumb in dev."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Draw the text → tokens → model → distribution flow.

**Level 2 — Explain it out loud.**
"What's a token?" Under 30 seconds.

**Level 3 — Apply.**
A teammate estimates 5000 chars / 4 = 1250 tokens for an English prompt. Their actual: 1100. What explains the discrepancy? (English averages closer to 4.5 chars/token; the heuristic over-estimates.)

**Level 4 — Defend.**
The biggest tradeoff is dev-time effort. For a prototype with 10 LLM calls/day, would you bother with `countTokens`? (No — char heuristic is sufficient at this scale.)

**Quick check.**
- Tokens per 100 chars of English prose? (~22)
- Provider that uses `tiktoken`? (OpenAI)
- Does contrl tokenize manually? (No — SDK handles it.)
