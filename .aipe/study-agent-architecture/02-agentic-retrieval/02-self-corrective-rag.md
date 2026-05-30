# Self-corrective RAG

**Industry name(s):** Self-corrective RAG · Self-RAG · CRAG · Relevance grader
**Type:** Industry standard

> Add a relevance grader between retrieval and generation, with a fallback path when retrieval misses. Retrieval success (a chunk came back) isn't answer success (the chunk is relevant and the answer is grounded). The grader closes the gap. **Case B for contrl** — no retrieval surface, so no grader needed.

**See also:** → [01-agentic-rag.md](./01-agentic-rag.md) · → grader bias: [`.aipe/study-ai-engineering/05-evals-and-observability/03-llm-as-judge-bias.md`](../../study-ai-engineering/05-evals-and-observability/03-llm-as-judge-bias.md)

---

## Why care

**Move 1.** RAG retrieves top-k chunks. The chunks come back. The LLM generates an answer grounded in them. The answer cites a chunk. The chunk is irrelevant. The answer is wrong.

**Move 2.** That "did the retrieval actually work" question is what self-corrective RAG answers. Not whether retrieval ran. Just: does the retrieved content actually answer the query.

**Why it matters: production RAG fails most often on relevance, not on retrieval. The top-k chunks come back; they're tangentially related; the model confidently builds a wrong answer on them.** The grader catches this before generation.

**Move 5.** Self-corrective RAG is to RAG what `Zod.safeParse` is to an API response: don't trust what you got back until you've graded it.

---

## How it works

### Move 1 — The mental model

```
retrieve(query) → chunks
       │
       ▼
┌──────────────────────────────────────────┐
│ Relevance grader (LLM or scorer)         │
│   for each chunk:                        │
│     - relevant to query? bool             │
│     - grounded for the claim type? bool  │
└────────────────┬─────────────────────────┘
       ┌─────────┴─────────┐
       ▼ all relevant      ▼ some/all irrelevant
   generate              fallback path:
                         - rewrite query, re-retrieve
                         - widen search (more sources)
                         - escalate to a different tool
                         - return "I don't know"
```

**Strategy in plain English:** assume retrieval got something wrong. Build the grader. Wire the fallback path. Don't ship a RAG system that trusts top-k blindly.

### Move 2 — The grader's job in two parts

#### Relevance

"Does this chunk pertain to the query?" Binary. A chunk about user authentication isn't relevant to a query about session timeouts even though both mention "session." Vector similarity got it close; the grader catches the gap.

#### Groundedness

"For the claim this chunk supports, is the chunk's content load-bearing?" Different question. A chunk can be relevant (about the right topic) but not grounded (doesn't actually contain the fact you need). The grader catches both.

```
relevance only:     "the chunk is about the right thing"
groundedness only:  "the chunk states the specific fact"
self-corrective:    both must be true to use the chunk
```

### Move 3 — The principle

Trust retrieval less than the LLM does. The model treats top-k chunks as authoritative; the grader breaks that assumption. Same instinct as boundary-validating API responses with a schema — the API got back a 200; that doesn't mean the body matches your expected shape.

---

## Self-corrective RAG — diagram

```
        QUERY
           │
           ▼
   ┌───────────────────┐
   │ Retrieve top-k    │   ← embedding or hybrid
   └────────┬──────────┘
            │   k chunks
            ▼
   ┌───────────────────┐
   │ Relevance grader  │   ← per-chunk LLM call (or fast classifier)
   │                   │
   │  for each chunk:  │
   │   relevant? bool  │
   │   grounded? bool  │
   └─────┬─────────┬───┘
         │         │
   ┌─────┘         └─────┐
   ▼                     ▼
 all pass            some fail
   │                     │
   ▼                     ▼
 generate           ┌──────────────────────┐
                    │ Fallback ladder:     │
                    │  1. rewrite query    │
                    │  2. widen search     │
                    │  3. route to other   │
                    │     source           │
                    │  4. give up cleanly  │
                    │     ("I don't know") │
                    └──────────────────────┘
```

---

## In this codebase

**Case B — no retrieval surface.**

contrl plans no embedding retrieval, so the grader has nothing to gate. The planned coaching agent's tools return structured data (typed schemas) where "relevance" is determined by the tool's input parameters — `get_form_history(exercise='pushup', window=5)` returns exactly the rows that match; there's no top-k approximation to grade.

When this would land: if contrl's agent surface ever grew to include retrieval over unstructured coaching notes or training-philosophy documents, the grader would gate the retrieval. Until that, Case B.

---

## Elaborate

**Where this pattern comes from.** Self-RAG (Asai et al., 2023) and CRAG (Yan et al., 2024) are the canonical references. Both showed that adding a grader step between retrieval and generation reliably catches the "irrelevant top-k" failure mode that plain RAG ignores.

**The deeper principle.** Don't conflate retrieval success (a chunk came back) with answer success (the chunk is relevant and grounded). The grader exists to insert a boundary check at the moment those two things diverge.

**Where this breaks down.** The grader is another LLM call. If the grader is cheap and the producer is expensive, you save tokens by not generating on bad chunks; if the grader is roughly the same cost as the producer, the math gets thinner. Use a cheaper-tier model as the grader when possible.

**What to explore next.** [`.aipe/study-ai-engineering/05-evals-and-observability/03-llm-as-judge-bias.md`](../../study-ai-engineering/05-evals-and-observability/03-llm-as-judge-bias.md) — the grader has bias too; size and family choice matter.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Self-corrective RAG               │ Plain RAG                        │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Per-chunk cost     │ +1 grader call per chunk          │ baseline                         │
│ Caught failures    │ irrelevant top-k                  │ none                             │
│ Eval surface       │ relevance, groundedness, answer   │ answer only                      │
│ Fallback complexity│ ladder of rewrite/widen/escalate  │ none                             │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what the grader costs

Per-chunk LLM call (or fast classifier). At top-k=5, that's 5 extra calls before generation. If the grader is a small fast model (Haiku-tier) it's affordable; if it's the same tier as the producer, the math is thin.

### Sub-block 2 — what skipping the grader costs

The "model confidently generates a wrong answer on irrelevant top-k" failure. Hard to detect in eval if the eval set doesn't include adversarial near-misses. Easy to miss in development.

### Sub-block 3 — the breakpoint

Add the grader when eval shows the model generating answers grounded in irrelevant chunks. The forcing function is the failure mode, not architectural taste.

---

## Tech reference (industry pairing)

### Cheap-tier grader

- **Codebase uses:** not applicable.
- **Why it's here:** the grader's cost should be a fraction of the producer's.
- **Leading today:** Haiku, GPT-4o-mini, Gemini Flash — adoption-leading for grader-tier work, 2026.

---

## Summary

### Concept recap

Self-corrective RAG inserts a relevance and groundedness grader between retrieval and generation, with a fallback ladder (rewrite query, widen search, escalate, give up cleanly). The grader closes the gap between "a chunk came back" and "the chunk is relevant." contrl: Case B — no retrieval surface, no grader needed.

### Key points

- Retrieval success is not answer success.
- The grader runs per chunk; use a cheaper-tier model.
- Fallback ladder is the senior touch — give up cleanly on no path.
- contrl: Case B.

---

## Interview defense

### Likely questions

**[mid] What's self-corrective RAG?**

A relevance grader between retrieval and generation. The grader rates each top-k chunk for relevance and groundedness; the generator only runs on chunks that pass; the fallback ladder handles the case where nothing passes.

**[senior] Why does contrl not need this?**

No retrieval surface. The coaching agent's tools return typed structured data — `get_form_history(exercise='pushup', window=5)` is deterministic, not top-k approximate. There's no relevance gap to grade.

### One-line anchors

- "Retrieval success is not answer success."
- "Don't trust top-k blindly. Grade it."

---

## Validate

**Level 1 — Reconstruct the diagram.** Retrieve → grader → generate or fallback.

**Level 2 — Explain in 60s.** Why does plain RAG fail without a grader?

**Level 3 — Apply.** A teammate's RAG system "works in dev." What do you ask to check whether they need the grader?

**Quick check.**
- What two things does the grader check? — Relevance and groundedness.
- Does contrl need it? — No; no retrieval surface.
