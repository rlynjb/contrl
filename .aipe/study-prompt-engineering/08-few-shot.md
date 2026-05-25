# Few-shot prompting

**Industry name(s):** Few-shot prompting, in-context learning, example-based prompting, k-shot prompting
**Type:** Industry standard

> 3–5 good examples beats 20 mediocre ones. Examples constrain output more than instructions do. When the few-shot examples and the instructions disagree, the examples win. Pick a few canonical examples that cover the cases instructions can't precisely describe.

**See also:** → [01-anatomy](./01-anatomy.md) · → [02-structured-outputs](./02-structured-outputs.md) · → [04-token-budgeting](./04-token-budgeting.md)

---

## Why care

**Move 1.** Your intent classifier's system prompt is six paragraphs of careful instructions: "When the user asks about something they've written, label it 'search.' When they want to chat, label it 'chat.' When they want the app to do something, label it 'command.' Be careful about edge cases…" The chain works in dev. Production produces a 12% misclassification rate. You add more instructions. Then more. Then more. The prompt is now 1200 tokens of rules. Accuracy drifts up to 91%. You're tweaking around inputs you can't precisely describe in words. Adding "be careful about ambiguous phrasings" doesn't help because the model doesn't know what *ambiguous phrasing* looks like — you haven't shown it.

**Move 2.** That "what does good output actually look like, including the cases I can't describe" question is what few-shot prompting answers. Not the rules. Not the schema. Just a small number of worked input/output pairs that demonstrate the cases — including the cases your instructions struggle to specify. The model learns the output shape from the examples more reliably than from descriptions of the output shape. Three to five good examples solve what twelve paragraphs of instructions can't.

**Why you need to answer that question at all:** Three failure modes hide in instruction-only prompts. First, **underspecified edge cases** — the natural-language rules don't fully constrain the model's output for inputs you didn't anticipate. The model fills in gaps with its training distribution, which may not match your product. Second, **format drift** — without examples in the exact output format you want, the model often produces *similar but slightly wrong* output (markdown when you wanted plain text; an explanation paragraph before the JSON; the wrong field order). Third, **prompt fragility under model upgrades** — instruction-only prompts shift meaning across model versions; few-shot examples shift much less because the examples literally show the target. The few-shot section is the most upgrade-resilient part of a prompt.

**Before / after.**

Without few-shot (12 paragraphs of instructions):
- Accuracy in dev: 94%. In prod with diverse inputs: 88%. Edge cases miss.
- A model upgrade lands. Accuracy drops to 81%. Investigation: the new model interprets some of your instructions slightly differently. You spend two days re-tuning the prompt language.

With 4 well-chosen few-shot examples covering edge cases (plus a shorter instruction block):
- Accuracy in dev: 96%. In prod: 94%. Edge cases covered by the examples that explicitly show them.
- Model upgrade. Accuracy drops to 92% — small drift. The examples carry most of the constraint; the upgrade affects them less than it would affect instructions.

**Move 5.** Few-shot examples are what unit tests are for application code — they pin behavior concretely in a way that "the function should be careful" can't. Instructions tell the model what you want; examples show it.

---

## How it works

### Move 1 — The mental model

Think of teaching someone a new file format. Two ways to do it:

1. **Describe the format:** "It's a JSON object with a `name` field (string), an `age` field (number 0-120), and an optional `notes` field…" — paragraphs of rules.
2. **Show an example:** `{ "name": "Alice", "age": 32, "notes": "Lives in Lisbon" }` — one canonical instance.

The example is faster, less ambiguous, and harder to misinterpret. The same logic applies to LLM prompts. Three to five canonical examples teach the model the format more reliably than twelve paragraphs of rules.

The strategy in plain English: **3–5 examples covering the categories instructions can't precisely describe. Examples match the exact output format desired, including casing, field order, and length. Examples beat instructions when they conflict.**

```
  Few-shot prompting (the format-by-example analogy)

  ┌─────────────────────────────────────────────────────────────────────┐
  │  system: rules + schema (concise; the examples carry most of it)    │
  │                                                                     │
  │  few-shot:                                                          │
  │    Example 1: user="What did I write Tuesday?"                       │
  │               → { "label": "search", "confidence": 0.95 }            │
  │                                                                     │
  │    Example 2: user="I'm feeling stuck."                              │
  │               → { "label": "chat", "confidence": 0.88 }              │
  │                                                                     │
  │    Example 3: user="Tag this as work."                              │
  │               → { "label": "command", "confidence": 0.92 }           │
  │                                                                     │
  │    Example 4 (edge case): user="Stuff"                              │
  │               → { "label": "chat", "confidence": 0.55 }              │
  │                                                                     │
  │  user: <actual user input>                                          │
  └─────────────────────────────────────────────────────────────────────┘
```

The model attends to the examples as the source of truth for output format. Instructions provide context; examples provide the shape.

---

### Move 2 — The layered walkthrough

#### Picking the examples

The discipline that distinguishes good few-shot from bad: which examples you pick.

**Cover three categories minimum:**

1. **Canonical happy-path examples.** One or two examples of the most common, most obvious cases. The model needs the "obvious" case to anchor what normal looks like.
2. **Edge cases instructions can't describe.** Examples that show the *boundary* of each category — the ambiguous phrasing the model needs to learn to handle. These are where examples vastly outperform instructions.
3. **Counter-examples for the most common mistake.** If you've shipped this chain and seen the model confuse two labels, include an example that disambiguates them.

```
  Example selection for a 3-way intent classifier (4 examples)

  ┌─────────────────────────────┬──────────────────────────────────────┐
  │ Example                     │ Purpose                              │
  ├─────────────────────────────┼──────────────────────────────────────┤
  │ "What did I write Tuesday?" │ Canonical 'search' — anchor          │
  │ "I'm feeling stuck."        │ Canonical 'chat' — anchor            │
  │ "Tag this as work."         │ Canonical 'command' — anchor         │
  │ "Stuff"                     │ Low-info edge case → 'chat' low conf │
  │                             │ (the failure mode caught in prod)    │
  └─────────────────────────────┴──────────────────────────────────────┘
```

If you're coming from frontend, this is like picking Storybook stories — you don't show every possible state, you show the ones that anchor the design (default), the ones that reveal edge cases (long text, empty state), and the ones that have historically broken (the one with the special character that broke layout last quarter).

Boundary condition: don't include examples where you're uncertain about the right answer. An ambiguous example teaches the model ambiguous behavior. If you can't confidently label an input, that input isn't a good few-shot — but it might be a good eval case (where the rubric tolerates either answer).

---

#### Format-matching: examples become the contract

Examples literally show the output format. The model copies. If your examples show JSON with double quotes and a specific field order, that's what you'll get. If they show explanations before the JSON, that's what you'll get. If they show inconsistent casing on labels (`"search"` in one example, `"Search"` in another), you'll get inconsistent casing in production.

```
  Example consistency matters

  Inconsistent few-shot (will produce inconsistent output)
  ─────────────────────────────────────────────────────────
  Example 1: { "label": "search", "confidence": 0.95 }
  Example 2: { "label": "Chat", "confidence": 0.88 }   ◄─ capital C
  Example 3: { "label": "command", "confidence": "0.92" }  ◄─ string!

  Consistent few-shot (will produce consistent output)
  ─────────────────────────────────────────────────────────
  Example 1: { "label": "search", "confidence": 0.95 }
  Example 2: { "label": "chat", "confidence": 0.88 }
  Example 3: { "label": "command", "confidence": 0.92 }
```

The model picks up on subtle pattern variation. The few-shot section is one of the highest-attention regions of the prompt; mistakes here propagate to every output.

Boundary condition: when using structured outputs (tool calling, JSON mode with schema), some of this is enforced by the provider's sampler. The schema bounds the shape; the examples shape the *content style* (tone, length, wording). Use both — schemas don't fully replace examples.

---

#### 3–5 examples sweet spot

Why 3–5 and not more?

- **Below 3** doesn't cover the categories. A single example anchors one case but doesn't generalize.
- **Above 5** runs into diminishing returns *and* contradicts itself more easily. With 12 examples, you almost certainly have two that subtly disagree on edge cases. The model averages, and you get mush.

Independent practitioner reports (Anthropic's prompting guide, OpenAI cookbook, Hamel Husain's writeups) all converge on 3–5 as the sweet spot for classification and extraction tasks. For more complex generative tasks, 5–7 sometimes earn their place — but past 7, you're paying tokens without quality return.

```
  Few-shot quality vs example count (rough shape, classification task)

  quality
   ▲
   │           ╭─────────────────────────────╮
   │          ╱                                 ╲
   │         ╱                                   ╲     ◄─ contradictions creep in
   │        ╱                                     ╲
   │       ╱
   │      ╱
   │     ╱
   │    ╱
   │   ╱
   │  ╱
   │ ╱
   │╱
   └───────────────────────────────────────────────▶
     0    1   2   3   4   5   6   7   8   9  10
                       example count
                       sweet spot ↑
```

Boundary condition: complex generative tasks (caption writing, summarization, structured-extraction with many fields) can warrant 5–7 examples. Three is the floor; seven is the ceiling absent strong evidence.

---

#### Cost: examples consume context tokens

Each example costs tokens in the prompt — and those tokens are *constant per call* (the examples don't change). So they get cached by the provider's prefix cache, which softens the cost dramatically.

```
  Cost of 4 few-shot examples on a per-call basis

  Sonnet 4 pricing (2026):
    $3 / 1M input tokens (uncached)
    $0.30 / 1M input tokens (cached, ~90% discount)

  4 examples ≈ 800 tokens of prompt.

  Uncached: 800 × $0.000003 = $0.0024 per call
  Cached:   800 × $0.0000003 = $0.00024 per call

  At 100k calls/day:
    Uncached: $240/day extra → $7200/month
    Cached:   $24/day extra → $720/month
```

Boundary condition: cached pricing only applies if the few-shot section is in the cached prefix (the constant portion at the top of the prompt). If you accidentally interpolate a per-call value into the examples section, the cache invalidates and you pay uncached rates on every call. The discipline is: examples are constant; they never reference per-call variables.

---

#### Few-shot with structured outputs

When using structured outputs (tool calling), the few-shot examples can be the tool calls themselves. This is the cleanest pattern.

```
  Few-shot with tool calling (Anthropic shape)

  messages: [
    // Example 1
    { role: "user", content: "What did I write Tuesday?" },
    { role: "assistant", content: [{
      type: "tool_use",
      name: "classify_intent",
      input: { label: "search", confidence: 0.95 }
    }]},

    // Example 2
    { role: "user", content: "I'm feeling stuck." },
    { role: "assistant", content: [{
      type: "tool_use",
      name: "classify_intent",
      input: { label: "chat", confidence: 0.88 }
    }]},

    // Actual user input
    { role: "user", content: <actual input> }
  ]
```

The model sees the assistant invoking the tool in the examples. This is the highest-fidelity few-shot pattern available — the example IS the production output format, byte-for-byte.

Boundary condition: this pattern is supported by Anthropic and OpenAI tool-calling APIs but not by all providers. For providers that don't support tool-use in the conversation history, examples go in the system prompt as text and the model learns the format from that.

---

### Move 3 — The principle

Few-shot prompting is in-context learning — the model adapts to the task at inference time by observing examples in the prompt, without weight updates. It's the cheapest way to constrain an LLM's behavior with high precision; instructions are general, examples are specific, and specificity wins. The 3–5 sweet spot reflects the underlying tradeoff: enough variety to cover categories, few enough to stay coherent. Picking the right 3–5 examples is the engineering work; the rest is mechanical.

The full picture is below.

---

## Few-shot prompting — diagram

The few-shot section's position in the prompt anatomy and the role each example plays.

```
┌─ Cached prefix (constant across calls; provider prefix-caches these bytes) ──┐
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ system: role + concise rules + schema reference                       │  │
│  │   ~300–600 tokens                                                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ few-shot section (3–5 examples, ~600–1500 tokens)                     │  │
│  │                                                                       │  │
│  │   Example 1: canonical case A                                         │  │
│  │   Example 2: canonical case B                                         │  │
│  │   Example 3: canonical case C                                         │  │
│  │   Example 4: edge case (the one that previously failed in prod)       │  │
│  │   [Example 5: counter-example for most common mistake]                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└────────────────────────────────────────┬─────────────────────────────────────┘
                                         │ cache boundary
                                         ▼
┌─ Dynamic suffix (per-call; not cached) ──────────────────────────────────────┐
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ user_message: actual input                                            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Examples literally show the output format. The model copies. Subtle inconsistencies
in the examples (casing, field order, number-vs-string) propagate to outputs.
```

The few-shot section is the highest-attention region of the prompt because it sits at the boundary between the constant rules and the per-call input — the model treats it as the most relevant "what does good look like" signal.

---

## In this codebase

**Case B planned — coaching agent few-shot examples.**

contrl's planned Phase 4 coaching agent will likely benefit from 2-4 few-shot examples — workout scenarios paired with ideal coaching outputs. Sketch:

- **Example 1 (good rep, encourage continuation):** input shows a clean 3x10 squat at 80% 1RM, classifier confidence high, no form issues → coaching message congratulates, suggests progression for next session.
- **Example 2 (form drift, single cue):** input shows knee valgus on rep 8 detected by classifier → coaching message cites the single highest-priority cue, no other commentary.
- **Example 3 (deload signal, restraint):** input shows reduced bar speed across multiple sets → coaching message suggests resting rather than coaching technique.
- **Example 4 (edge case — first session of new exercise):** sparse history, classifier low confidence → coaching message defers to exercise cues from `get_exercise_cues` rather than progression suggestions.

The confidence dimension here isn't a numeric output (the coaching message is free text); the discipline is that the examples cover the *behavioral surface* — when to coach form, when to suggest progression, when to back off, when to defer to exercise cues. Edge cases get explicit examples so the model doesn't overgeneralize from the happy path.

**Not currently planned: tool-use few-shot.**

Anthropic's API supports few-shot examples as `messages: [{ role: 'user', ... }, { role: 'assistant', content: [{ type: 'tool_use', ... }] }, ...]`. For the coaching agent's single-tool output, text-block examples are simpler. If the coaching task evolved to call multiple tools in sequence, tool-use few-shot would become the cleaner pattern.

---

## Elaborate

**Where this pattern comes from.** Few-shot prompting is the original "in-context learning" capability discovered with GPT-2 and named in the GPT-3 paper (Brown et al., 2020, "Language Models are Few-Shot Learners"). The 3–5 sweet spot crystallized through practitioner experience 2022–2024. Hamel Husain, Eugene Yan, and the Anthropic and OpenAI prompting guides all converged on the same range for classification/extraction tasks.

**The deeper principle.** Examples beat instructions because examples are specific and instructions are general. The model's training data is full of examples of "how to do task X" expressed both as instructions and as worked examples; the worked examples reliably win on inference-time conformance. This is one of the cleanest illustrations of why "telling" is weaker than "showing" for any kind of pattern-learning system — including humans.

**Where this breaks down.** Three cases.

1. **Genuinely open-ended generation.** A chain that produces a paragraph of unique prose for each input doesn't have "the right output" to show as an example. Few-shot examples here can over-constrain — the model copies the examples' style too closely. For these tasks, examples become style guides (one or two) rather than format anchors.
2. **Highly variable input formats.** When inputs vary so widely that 4 examples can't cover the surface, you're either trying to do too much in one chain (split it — see [06-single-purpose-chains](./06-single-purpose-chains.md)) or you need many more examples (which contradicts the sweet spot and risks self-contradiction).
3. **When the model already knows the task.** For very common tasks (translate to French, summarize this article), few-shot adds little. The model's training already shows it what good looks like. Few-shot is worth more on novel tasks (your-product-specific intent labels, your-domain-specific extraction).

**What to explore next.**
- [01-anatomy](./01-anatomy.md) → where the few-shot section sits in the four-section prompt structure.
- [02-structured-outputs](./02-structured-outputs.md) → how examples and schemas complement each other.
- [04-token-budgeting](./04-token-budgeting.md) → the budget for the few-shot section.
- Brown et al. (2020) "Language Models are Few-Shot Learners" — the canonical reference.

---

## Tradeoffs

| Cost dimension | Few-shot (3–5 examples) | Instruction-only |
|---|---|---|
| Token cost per call | 600–1500 tokens | ~50 tokens for an instruction line |
| Cost at scale (cached) | $0.000018/call cached | ~$0.000003/call |
| Accuracy on edge cases | Higher (examples cover them) | Lower (instructions can't describe them) |
| Upgrade resilience | Higher (examples carry the format) | Lower (instructions shift in meaning) |
| Author cost | Real — picking the right examples takes thought | Low — write a sentence |
| Maintenance | Examples need updating when categories evolve | Same |

### Sub-block 1 — what we gave up

The cost of the few-shot section is real: 600–1500 tokens of prompt, dedicated to examples. Even cached, at high scale, that's measurable money. And the *engineering cost* of picking the right examples is non-trivial — you spend an hour or two thoughtfully selecting and tuning examples that cover the right categories, which is more effort than writing one more sentence of instructions.

### Sub-block 2 — what instruction-only would have cost

I have shipped instruction-only versions. The costs:

- **Month 1:** instruction prompt works in dev. 94% accuracy on test inputs.
- **Month 2:** production has 12% lower accuracy. Edge cases the dev tests didn't cover.
- **Month 3:** add more instructions. Accuracy creeps up to 89%. Prompt is now 1500 tokens of rules. Cache hit rate still high (instructions are constant), but accuracy plateaus.
- **Month 5:** model upgrade. The new model interprets two of your instruction paragraphs subtly differently. Accuracy drops 8%. Two days of re-tuning.
- **Month 6:** add 4 few-shot examples covering the categories. Drop most of the instruction redundancy. Accuracy jumps to 95%. Net token count similar.

Few-shot from Day 1 would have skipped months 2-5.

### Sub-block 3 — the breakpoint

Few-shot is the right call until: (a) the task is genuinely open-ended generation where examples over-constrain (use 0–2 style-guide examples instead); (b) the task is one the model already knows from training — translation, summarization, common-task classification (instructions suffice); (c) you're truly token-constrained and can't fit examples (rare; the budget usually allows). For most production classification, extraction, and structured generation tasks, few-shot is the right call from Day 1.

### Sub-block 4 — what wasn't actually a tradeoff

"Few-shot examples become stale and need maintenance." The concern is that examples drift from production reality. In practice they don't — examples are *canonical*; the canonical case "user asks for past entries" is the same in month 1 and month 24. The exceptions are when the category definitions themselves change (you split "command" into "command-immediate" and "command-deferred"), and that's a real product change requiring a real eval-suite update, not example staleness.

---

## Tech reference (industry pairing)

### Anthropic Messages API few-shot pattern

- **Codebase uses:** Not yet — planned for contrl's coaching agent (text-block examples sufficient for the single-tool shape; conversation-turn examples reserved for multi-tool flows).
- **Why it's here:** the API surface that lets few-shot examples appear as conversation history with `user`/`assistant` turns. Higher fidelity than text-block examples.
- **Leading today:** Anthropic Messages — `adoption-leading` for high-fidelity few-shot, 2026.
- **Why it leads:** the `messages` array natively supports user+assistant alternation; few-shot examples literally are conversation turns; tool-use few-shot is supported.
- **Runner-up:** OpenAI Chat Completions — same pattern; messages array supports user+assistant turns.

### Tool-use few-shot (structured-output examples)

- **Codebase uses:** Not yet — not currently needed for contrl's single-tool coaching agent; would apply if the agent grew multi-step tool sequences.
- **Why it's here:** the highest-fidelity few-shot pattern; the example IS a structured tool call, byte-identical to the production output format.
- **Leading today:** Anthropic + OpenAI tool-use in conversation history — `adoption-leading` for typed few-shot, 2026.
- **Why it leads:** removes any ambiguity about output format; the model literally sees previous assistant tool calls and copies the pattern.
- **Runner-up:** text-block JSON examples — work, but require the model to "know" to emit a tool call instead of free text.

### Brown et al. (2020) "Language Models are Few-Shot Learners"

- **Codebase uses:** N/A — methodology reference.
- **Why it's here:** the canonical academic reference establishing in-context learning as a core LLM capability.
- **Leading today:** still the reference paper; cited universally.
- **Why it leads:** introduced the term, demonstrated the capability across many tasks, established the few-shot sweet spot empirically.
- **Runner-up:** Anthropic and OpenAI prompting guides — distill the practical lessons for application engineers.

---

## Project exercises

### [B1.22] Add 4 few-shot examples to the intent classifier

### [B4C.few-shot] Add 4 few-shot examples to the coaching agent

- **Exercise ID:** `[B4C.few-shot]`
- **What to build:** Hand-curate 4 coaching examples covering: clean-execution + progression suggestion, form drift + single cue, deload signal + restraint, sparse-history + defer-to-exercise-cues. Write them as text-block examples in `src/lib/agent/examples.md` (or as Anthropic message turns inside `runner.ts`). Re-run the agent eval suite to compare quality with and without examples.
- **Why it earns its place:** materializes the 3–5 sweet spot for the coaching agent. The behavior surface (when to coach what) is what the examples encode.
- **Files to touch:** `src/lib/agent/examples.md` (new); `src/lib/agent/runner.ts` (assemble examples into the request).
- **Done when:** the agent eval suite reports measurable improvement on edge cases (restraint cases benefit most); cached cost stays the same.
- **Estimated effort:** `1–4hr`

### [B4C.tool-use-fs] Convert examples to assistant tool-use turns (if scope grows)

- **Exercise ID:** `[B4C.tool-use-fs]` (defer)
- **What to build:** If/when the coaching agent calls multiple tools in sequence, convert the text-block examples to assistant-role tool-use messages showing the exact tool sequence. Verify schema-fail stays low.
- **Why it earns its place:** highest-fidelity few-shot for multi-step tool flows. Not worth the conversion cost while the agent emits one tool call per turn.
- **Files to touch:** the message-assembly code in `runner.ts`.
- **Done when:** examples appear as assistant tool_use messages in the API call; eval suite shows no regression.
- **Estimated effort:** `1–4hr`

---

## Summary

Few-shot prompting provides 3–5 canonical input/output examples that the model uses as concrete anchors for output shape and style. Examples beat instructions because examples are specific where instructions are general — and when examples and instructions conflict, examples win. The sweet spot is 3–5 examples covering canonical cases plus one edge case; above 5, examples self-contradict and quality plateaus. Cost is ~600–1500 tokens of prompt, mostly cached, paid for many times over by accuracy improvement on edge cases.

**Key points:**

- **3–5 examples sweet spot.** Below 3 misses categories; above 5 creates contradictions.
- **Cover three categories minimum.** Canonical happy path + edge cases + counter-examples for common mistakes.
- **Examples are the format contract.** Casing, field order, length, structure — the model copies what it sees.
- **Tool-use few-shot is the highest fidelity.** Assistant-role tool calls in conversation history teach the exact production format.
- **Examples are constant across calls.** They're in the cached prefix; cost is amortized.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "how do you give the model examples?", they want to hear whether you've internalized the 3–5 sweet spot and the example-selection discipline. The shipped answer names the count, the category coverage rule, and the cache-friendly placement. The unshipped answer is "I add examples until it works."

### Likely questions

**[mid] How many examples do you typically use?**

3–5 for classification, extraction, and most structured outputs. Below 3 misses categories — the model has only one or two anchors to extrapolate from. Above 5 creates contradictions — with 12 examples it's nearly certain that two of them subtly disagree on edge cases, and the model averages, which produces mush. The exception is highly complex generative tasks where 5–7 occasionally earn their place.

```
  Count guidance by task

  ┌─────────────────────────────┬──────────────────┐
  │ Task                        │ Sweet spot       │
  ├─────────────────────────────┼──────────────────┤
  │ Classification (3-way+)     │ 3–5              │
  │ Extraction (fields)         │ 3–5              │
  │ Structured generation       │ 4–6              │
  │ Open-ended generation       │ 0–2 (style only) │
  │ Common task (translate)     │ 0                │
  └─────────────────────────────┴──────────────────┘
```

---

**[senior] How do you pick which examples to include?**

Cover three categories. First, the canonical happy-path examples — one per label/category — that anchor what normal looks like. Second, an edge case the model would otherwise get wrong; this is where examples vastly outperform instructions because the edge case is hard to specify in words. Third, when applicable, a counter-example that disambiguates the most common production mistake — if you've shipped this chain and seen the model confuse "command" with "chat" on imperative-but-polite phrasing, include an example that pins it down. The fourth and fifth slots fill in remaining edge cases if needed.

```
  Example selection
  ┌──────────────────────────────────────────────────┐
  │ Slots 1–N (N = number of labels): one canonical  │
  │   example per label                              │
  │ Slot N+1: edge case the instructions can't       │
  │   precisely describe                             │
  │ Slot N+2 (optional): counter-example for the     │
  │   most common production mistake                 │
  └──────────────────────────────────────────────────┘
```

---

**[arch] How does few-shot interact with the cache layer in production?**

The examples sit in the prompt's constant prefix, which means they're cached by the provider's prefix cache. At scale this matters: a 1000-token few-shot section costs $0.003 per call uncached and $0.0003 cached. At 100k calls/day, that's $300 vs $30. The discipline that protects the cache: examples are constant, examples are at the front (after system, before user message), examples never interpolate per-call variables. Violating any of these breaks the cache for the examples and costs uncached pricing on every call.

```
  Cache-protected few-shot placement

  ┌─────────────────────────────────────────────────┐
  │ system            ◄─ in cached prefix            │
  │ few-shot examples ◄─ in cached prefix            │
  │ ───────────────────────── cache boundary ───────│
  │ user input        ◄─ per-call, not cached       │
  └─────────────────────────────────────────────────┘
```

---

### The question candidates always dodge

**"Internet advice says 'more examples is better.' Why is the sweet spot only 3–5?"**

Because above 5, contradictions creep in. With 12 examples covering subtle variations of three labels, it's nearly certain that two examples make slightly different calls on edge cases — one labels an ambiguous "Stuff" as 'chat' with confidence 0.55, another labels a similar "Random" as 'chat' with confidence 0.7, a third labels "Hmm" as 'command' with confidence 0.4. The model averages across these conflicting signals and produces low-confidence muddy outputs. The 3–5 sweet spot reflects the underlying tradeoff between coverage and coherence; below 3 misses cases, above 5 contradicts itself. The empirical recommendation is from practitioner experience (Hamel Husain, Eugene Yan, OpenAI cookbook) converging on this range independently — the internet advice "more is better" comes from people who haven't measured.

```
  What more examples actually do

  ┌─────────────────────────────────────────────────┐
  │ 3–5 examples: each anchors a category cleanly    │
  │ 6–8 examples: marginal coverage gains            │
  │ 9+ examples: contradictions creep in              │
  │   ┌────────────────────────────────────────┐     │
  │   │ "Stuff" → chat conf 0.55               │     │
  │   │ "Random" → chat conf 0.70              │ ◄─  │
  │   │ "Hmm" → command conf 0.40              │     │
  │   │ Model: averages signals, produces       │     │
  │   │   low-conf mush                         │     │
  │   └────────────────────────────────────────┘     │
  └─────────────────────────────────────────────────┘
```

---

### One-line anchors

- "3–5 examples. Below 3 misses categories; above 5 contradicts."
- "Cover canonical happy path + edge cases + counter-examples for production mistakes."
- "Examples are the format contract. Casing, field order, length — the model copies."
- "Tool-use few-shot (assistant-role tool calls in messages) is the highest fidelity."
- "Examples sit in the cached prefix. Never interpolate per-call variables into them."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw a prompt with the system section, the few-shot section (showing 4 examples), and the user message. Mark the cache boundary.

Pass: you got all three sections in order and the cache boundary between examples and user message.

**Level 2 — Explain it out loud.**
Without notes, in under 60 seconds: "How do you use few-shot examples in production?" Checkpoints:
- Did you name the 3–5 sweet spot?
- Did you mention example consistency (casing, format)?
- Did you mention cache placement?

If you skipped any: you described "I add some examples," not the discipline.

**Level 3 — Apply to a new scenario.**
A teammate has a 4-way classifier with 8 few-shot examples and 91% accuracy. Walk through how you'd diagnose whether the issue is too many examples or wrong examples.

Expected: read the 8 examples for contradictions across edge cases. If two examples disagree on similar inputs, that's the bug — cut down to 4–5 examples that align. If they're all consistent, the issue is example *selection* — check which production errors aren't covered by any example and add one targeted example. Re-run the eval suite to verify.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is "tokens for examples vs accuracy for free." If you had a token-tight context and one chain that's currently using a 1500-token few-shot block, would you cut to 2 examples to save tokens?

There's no right answer. Defend with reference to: cache behavior (cutting examples saves only uncached portion), the eval suite measurement of accuracy delta, the specific kind of chain (classifier vs generator).

**Quick check — code reference test.**
Without opening files, answer:
- What's the few-shot sweet spot?
- Where in the prompt anatomy do examples sit?
- What's the highest-fidelity few-shot format?

Pass: 3–5; after system, before user message (in cached prefix); assistant-role tool-use messages.

---
Updated: 2026-05-24 — Reframed per v1.38.0 per-repo scope. In this codebase: collapsed dual Case B (loopd intent classifier) + Case A (aipe vocabulary sections) into single Case B planned for contrl's coaching agent (4 examples covering coaching behavioral surface: clean execution, form drift, deload signal, sparse history). Tech reference codebase-uses retargeted. Project exercises B1.22/B1.23 → B4C.few-shot + B4C.tool-use-fs (deferred).
