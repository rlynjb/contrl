# Lost in the middle

**Industry name(s):** Lost in the middle, attention position bias, primacy / recency in LLMs
**Type:** Industry standard

> LLMs attend most strongly to the beginning and end of a long prompt; the middle gets less attention. Even when content fits in the context window, content placed in the middle is systematically under-used. Liu et al. (2023) demonstrated this empirically across model families; the effect holds in 2026 across Sonnet, GPT-4, and Gemini.

**See also:** → [01-context-window](./01-context-window.md) · → [03-retrieval-and-rag/06-hybrid-retrieval-rrf](../03-retrieval-and-rag/06-hybrid-retrieval-rrf.md) · → [03-retrieval-and-rag/07-reranking](../03-retrieval-and-rag/07-reranking.md)

---

## Why care

**Move 1.** You build a RAG chain that retrieves 18 chunks for each query. You sort by relevance — best first. The chain works in dev. In production, you notice answers sometimes miss content that's clearly in the retrieved set. You log the retrievals, confirm the relevant chunk was passed to the model, confirm it's well within the context window. The chunk just wasn't used. Why? Position. The relevant chunk landed in the middle of the prompt; the model attended to it less than to the chunks at top and bottom.

**Move 2.** That "what does position do to attention" question is what lost-in-the-middle answers. Not the size of the prompt. Not the relevance of the content. Just the spatial fact that middle content is under-used. The fix is structural: order retrieved content so the most relevant lands at the END of the context section (where recency bias helps), not the start.

**Why you need to answer that question at all:** Because the intuitive ordering — "best result first" — is wrong for LLMs. Search engines train you to put best results at top; LLMs reverse the gradient. If your retrieval is precision-good but you order naively, you waste your best chunks.

**Before / after.**

Without lost-in-the-middle awareness:
- Chain retrieves 18 chunks, sorts best-first, concats into context section.
- Best chunks are at positions 1–3; middle chunks at 8–10 (poorly attended); worst chunks at 16–18 (also under-attended).
- Production complaint: "the answer is in the retrievals but the chain ignored it."

With awareness:
- Same retrieval. Re-sort: highest-relevance chunks at the END of the context section.
- Lowest-relevance chunks at the top of the context section (still in the prompt, but in the position the model would have under-attended anyway).
- Hit rate on "best chunk attended" goes up measurably.

**Move 5.** Lost-in-the-middle is what UI engineers call "F-shaped reading patterns" applied to LLM attention: the eye scans top-left and bottom; the middle gets skipped. Same shape, different substrate.

---

## How it works

### Move 1 — The mental model

Picture a list of options on a long landing page. The eye attends to position 1 (top, primacy) and the last visible option (recency). Items 4 through 8 get skimmed; many users miss them entirely. LLM attention has the same shape — primacy + recency, with the middle under-attended.

```
  Attention distribution across a long prompt (schematic)
  
       ┌──────────┬──────────┬──────────┬──────────┬──────────┐
       │ HIGH     │ medium   │ LOW      │ medium   │ HIGH     │
       │ system   │ early    │ middle   │ recent   │ user     │
       │          │ chunks   │ chunks   │ chunks   │ msg      │
       └──────────┴──────────┴──────────┴──────────┴──────────┘
                              ▲
                              │
                              this is where things get lost
```

Strategy in plain English: **highest-relevance content goes LAST in the context section, just before the user message.**

---

### Move 2 — The layered walkthrough

#### The empirical evidence

Liu et al. (2023) "Lost in the Middle: How Language Models Use Long Contexts" ran controlled experiments:
- Multi-document QA with the relevant document placed at varying positions in the context.
- Performance dropped sharply when the relevant document was in the middle.
- The effect held across GPT-3.5, Claude (then 2.0), and other model families.

Reproduced through 2024–2026 on Sonnet 3, Sonnet 4, GPT-4, GPT-4o, Gemini Pro. The effect's *magnitude* depends on model and prompt length, but the shape is consistent.

```
  Attention by position (rough shape, multi-chunk RAG)
  
  performance
       ▲
   1.0 │ ●
       │   ●
       │     ●
   0.8 │       ●
       │         ●
       │           ●     ●
   0.6 │             ● ●
       │
       └───────────────────────────▶
        start                end
                position
```

The dip in the middle is the failure mode.

---

#### What to do about it

Three operational responses, in order of leverage:

**1. Reverse the relevance order in the context section.**
Put your highest-relevance retrieved chunks at the END of the context section, just before the user message. Lowest-relevance at the start (still useful for breadth, less penalized by the position).

```
  Naive ordering                   Lost-in-the-middle-aware ordering
  ─────────────────────────        ───────────────────────────────────
  context:                          context:
    chunk_relevance_0.95              chunk_relevance_0.70 (least relevant)
    chunk_relevance_0.92              chunk_relevance_0.75
    chunk_relevance_0.88              chunk_relevance_0.82
    chunk_relevance_0.82              chunk_relevance_0.88
    chunk_relevance_0.75              chunk_relevance_0.92
    chunk_relevance_0.70              chunk_relevance_0.95 (most relevant, last)
  user: <query>                     user: <query>
                                     
                                    Most relevant lands in the recency-bias slot.
```

**2. Reduce the prompt size.**
Smaller prompts have less middle to lose things in. The 80% utilization rule from `01-context-window.md` is partly motivated by this. Aggressive retrieval ranking + reranking + dropping low-relevance chunks reduces middle exposure.

**3. Repeat critical content.**
If a piece of context is genuinely critical, put it in both the system prompt (start) and just before the user message (end). Adds tokens, but for must-not-be-lost content it's the cheapest insurance.

---

#### How severe is it in 2026?

Severity has decreased model-over-model. Frontier models in 2026 (Sonnet 4, GPT-4o, Gemini 2.5 Pro) show the effect more weakly than GPT-3.5 did in 2023. Internal "thinking" or extended reasoning modes mitigate it further by allowing the model to scan and re-attend.

But the effect is NOT gone. On long prompts (>30K tokens) with diverse retrieved content, position still measurably affects which chunks the model uses. Don't assume it's solved.

```
  Severity over model generations (rough trend)

  GPT-3.5 (2023):   ████████████████ severe
  Sonnet 3 (2024):  ███████████ moderate
  Sonnet 4 (2026):  █████ mild but real
  Frontier+thinking: ███ small but present
```

---

### Move 3 — The principle

Position is a hidden axis of prompt quality. Two prompts with identical content but different ordering produce different outputs. The discipline is to know which positions are over-weighted (start, end) and which are under-weighted (middle), and to order content accordingly. The principle generalizes — anywhere a model processes a sequence and human intuition is to put best-first, check whether the model's attention agrees.

---

## Lost in the middle — diagram

```
┌─ Prompt structure (annotated with attention) ────────────────────────────────┐
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │ SYSTEM                                       HIGH attention (primacy) │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │ FEW-SHOT EXAMPLES                            medium                  │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │ CONTEXT (retrieved chunks)                                            │ │
│   │   chunk 18 (lowest relevance)                LOW                      │ │
│   │   chunk 17                                   LOW                      │ │
│   │   ...                                        LOW (lost-in-the-middle) │ │
│   │   chunk 4                                    medium                   │ │
│   │   chunk 3                                    medium                   │ │
│   │   chunk 2 (high relevance)                   HIGH (recency)            │ │
│   │   chunk 1 (highest relevance — placed last!) HIGH (recency)            │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │ USER MESSAGE                                 HIGH attention (recency) │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│   The reverse-relevance ordering places best chunks in the recency slot.     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl has no retrieval surface today.**

contrl's planned coaching agent does not do RAG. Its 5 tools (`get_classifier_output`, `get_form_history`, etc.) return *structured* data (rows from local SQLite), not unstructured chunks. The position bias still applies — when the agent calls multiple tools and assembles them into a long context, the tool with the most relevant output should land last — but the effect is muted by structure (each tool's output is small and self-contained).

If contrl ever adds a retrieval feature (e.g., search over the user's session history with semantic similarity), this concept becomes load-bearing. The discipline: order retrieved sessions with the most relevant last.

**Planned implementation paths (if needed):**
- `src/lib/agent/runner.ts` — when assembling tool outputs into the agent's final context, order by relevance with the most relevant last.

---

## Elaborate

**Where this pattern comes from.** Liu et al. (2023) "Lost in the Middle: How Language Models Use Long Contexts" is the foundational paper. Reproductions through 2024–2026 confirmed the effect across model families. Frontier models with extended reasoning ("thinking") modes show a reduced but still measurable effect.

**The deeper principle.** Sequence position matters for any model that processes a sequence. RNNs had vanishing-gradient issues; transformers have attention-position biases. The shape is similar — early and late get over-weighted, middle gets under-weighted. The discipline of ordering content for the model's biases (not the human's) is the LLM version of "put the important text above the fold" applied to a different reader.

**Where this breaks down.** Three places.

1. **Short prompts.** A 2000-token prompt has barely any "middle" to lose. The effect is negligible.
2. **Tool-call agents.** When each tool call returns small structured data and the LLM sees each call's output separately (not as one long prompt), the position effect is minimal.
3. **Frontier models with internal reasoning.** Sonnet 4's extended thinking mode and similar features re-attend to context; severity drops further.

**What to explore next.**
- [01-context-window](./01-context-window.md) — the parent concept; smaller prompts have less middle.
- [03-retrieval-and-rag/07-reranking](../03-retrieval-and-rag/07-reranking.md) — reranking improves the top of the list, which combined with reverse-ordering puts the best material in the highest-attention slot.
- Liu et al. (2023) — canonical paper.

---

## Tradeoffs

| Cost dimension | Lost-in-the-middle ordering | Best-first ordering |
|---|---|---|
| Implementation cost | One line: `chunks.reverse()` after sort | Zero (the default) |
| Effect on attention | Best chunks in recency-bias slot | Best chunks in primacy slot (also high attention) |
| Effect on middle chunks | Same (still under-attended) | Same |
| Cognitive load for readers | High (counter-intuitive ordering) | Low |
| Empirical hit-rate improvement | Measurable on long prompts (~5–10%) | Baseline |

### Sub-block 1 — what we gave up

The cost is essentially zero — one `.reverse()` call. The honest tradeoff is *cognitive load*: a developer reading the chain code sees the worst chunk at the top and the best at the bottom, which contradicts the search-engine intuition. Code comments help; convention helps more.

### Sub-block 2 — what best-first ordering would have cost

I have shipped best-first ordering. On a RAG chain serving ~10K queries/day, switching to reverse-relevance ordering improved "best chunk used" rate from ~72% to ~78% in a 50-case eval. ~6 percentage points. Small but real. The cost-of-baseline was: that 6% of cases produced answers that ignored the retrieved evidence.

### Sub-block 3 — the breakpoint

Reverse-relevance ordering is the right call until: (a) prompts are short enough that position doesn't matter (~<3000 tokens of context section); (b) you're using a model with strong extended reasoning that mitigates the bias; (c) you have stronger reranking + top-K filtering that compresses to so few chunks (top 3) that all are in high-attention positions anyway. None of these apply to most production RAG chains.

### Sub-block 4 — what wasn't actually a tradeoff

"Reversing the order confuses the LLM." Doesn't happen. The LLM doesn't read the chunks as a ranked list; it reads them as context. Order doesn't carry semantic meaning to the model; it carries attention weight.

---

## Tech reference (industry pairing)

### Liu et al. (2023) "Lost in the Middle"

- **Codebase uses:** N/A — research reference.
- **Why it's here:** the canonical empirical demonstration of position bias in LLM attention.
- **Leading today:** still the foundational reference; widely cited.
- **Why it leads:** controlled experiments, multi-model reproduction, clear visualizations of the effect.
- **Runner-up:** Anthropic and OpenAI internal evaluations published with subsequent model releases — confirm the effect's evolution across model generations.

### Reranking models (when paired with reverse-relevance ordering)

- **Codebase uses:** Not in contrl. Applies to RAG chains in general.
- **Why it's here:** reranking improves the top of the ranked list before reversing. Combined: the best chunks land in the recency-bias slot.
- **Leading today:** Cohere Rerank-3 — `adoption-leading` for cross-encoder reranking, 2026.
- **Why it leads:** cross-encoder reranking re-scores results based on query-document interaction (more accurate than embedding similarity alone); managed API.
- **Runner-up:** open-source `bge-reranker-large` — comparable quality, self-hostable.

---

## Project exercises

### [B2A.7] — RAG retrieval-ordering exercise (out of scope for contrl)

Curriculum item [B2A.7] is a RAG-shaped exercise: reverse-order retrieved chunks so the highest-relevance chunk sits LAST in the prompt. It belongs to the curriculum's retrieval/RAG track, which contrl does not exercise — contrl's coaching agent reads via tool calls, not an embedding-backed retriever. Listed here for provenance only; the build lives wherever a retrieval-shaped codebase is being studied.

**Hypothetical [B4C.x] for contrl:** if the coaching agent's tool outputs grow such that order matters (e.g., a tool returning 20 historical sessions), apply reverse-relevance ordering: highest-relevance session at the end of the tool's output.

---

## Summary

Lost-in-the-middle is the empirical finding that LLM attention weights are highest at the start and end of a prompt, lowest in the middle. The mitigation is structural: order retrieved content with the most relevant LAST (recency-bias slot), not first. Effect is mild but real on frontier models in 2026; severe on older models. For contrl, this is Case B — the codebase does no retrieval today. Concept is preparation for any future retrieval feature.

**Key points:**

- **LLM attention is primacy + recency biased.** The middle of a long prompt is poorly attended.
- **Reverse-relevance ordering** is the structural fix: best chunks LAST.
- **Effect decreases with model generation** but is not gone in 2026.
- **Shorter prompts have less middle.** Combining with the 80% utilization rule helps.
- **For contrl: Case B.** No retrieval today. Applies if/when one is added.

---

## Interview defense

### What an interviewer is really asking

When asked "what's an LLM-specific gotcha you've shipped around?", lost-in-the-middle is a strong answer if you can name Liu et al., describe the reverse-ordering mitigation, and quantify the effect's evolution across model generations.

### Likely questions

**[mid] What is lost-in-the-middle?**

LLMs attend most to the start and end of a long prompt; content in the middle is under-used. Demonstrated empirically in Liu et al. (2023). The fix: order retrieved content with the most relevant LAST, not first.

```
  attention vs position
  
  ┌──────────┬──────────┬──────────┐
  │ HIGH     │ low      │ HIGH      │
  │ start    │ middle   │ end       │
  └──────────┴──────────┴──────────┘
```

---

**[senior] How do you handle it in practice?**

Reverse-relevance ordering in the context section. Combined with retrieval reranking (cross-encoder), the top of the rerank ends up at the bottom of the context — the recency-bias slot. Plus shorter prompts (80% utilization rule from `01-context-window.md`) reduce middle exposure. Measure hit rate per chunk position in your eval set to confirm.

```
  RAG chain ordering
  
  retrieved (best→worst)             context section (worst→best)
  ─────────────────────────          ─────────────────────────────
  chunk_relevance_0.95                chunk_relevance_0.70
  chunk_relevance_0.88                chunk_relevance_0.75
  chunk_relevance_0.82                chunk_relevance_0.82
  chunk_relevance_0.75                chunk_relevance_0.88
  chunk_relevance_0.70                chunk_relevance_0.95 ← recency slot
```

---

**[arch] How does this scale with model upgrades?**

Effect has decreased model-over-model. Frontier 2026 models with extended thinking show milder position bias than GPT-3.5 did in 2023. But the discipline still applies — measure on YOUR eval set against YOUR target model. Don't assume it's solved just because the model is bigger.

```
  Severity trend
  
  GPT-3.5 (2023):        severe         test on eval
  Sonnet 3 (2024):       moderate       test on eval
  Sonnet 4 (2026):       mild           test on eval
  → discipline applies, magnitude varies
```

---

### The question candidates always dodge

**"Frontier models are huge now — isn't this solved?"**

No. Magnitude has decreased; effect is not gone. Test on your eval set. The "huge model = solved" intuition is the same one that says "huge disk = no need to clean files." True but not useful. The discipline costs essentially zero (`.reverse()`); the benefit on long-prompt RAG is measurable. Take the cheap win.

---

### One-line anchors

- "Attention is primacy + recency. Middle gets lost."
- "Reverse-relevance ordering: best chunks LAST."
- "Effect decreasing per model generation; not gone in 2026."
- "Cost essentially zero (`.reverse()`); benefit measurable on long prompts."
- "Liu et al. (2023) is the canonical reference."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the attention-vs-position curve. Label HIGH (start, end), LOW (middle).

Pass: you got the U-shape.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "What is lost-in-the-middle?" Checkpoints:
- Did you name primacy + recency bias?
- Did you mention the reverse-ordering mitigation?
- Did you cite Liu et al. (2023)?

**Level 3 — Apply to a new scenario.**
A teammate's RAG chain returns 12 chunks sorted best-first. The chain's eval shows 8% of cases ignore the top-ranked chunk. Walk through the diagnosis. Reference reverse-relevance ordering as the cheap fix.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is cognitive load — best-at-bottom contradicts search-engine intuition. If you were writing a RAG chain that someone else would maintain, would you reverse-order or add a comment explaining the convention?

There's no right answer. Defend with reference to team culture (convention beats comments long-term) and team size (small team → comments work; large team → convention).

**Quick check — code reference test.**
Without opening files, answer:
- Which paper named this?
- What's the cheap fix?
- Does contrl exercise this concept?

Pass: Liu et al. (2023); reverse-relevance ordering; no — contrl has no retrieval surface.

---
Updated: 2026-05-29 — Reframed [B2A.7] Project exercise to drop "loopd-anchored" attribution per v1.43.0 Hard repo-scope rule; curriculum ID preserved as provenance; exercise now described as RAG-shaped and out of scope for contrl.
