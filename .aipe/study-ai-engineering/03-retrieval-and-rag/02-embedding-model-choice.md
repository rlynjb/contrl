# Embedding model choice

**Industry name(s):** Embedding model selection, embedding benchmark, MTEB, model dimensionality
**Type:** Industry standard

> Embedding models vary by dimension count (384-3072), quality (per MTEB benchmark), language coverage, and pricing. The decision is task-specific: general English prose → OpenAI text-embedding-3 or Voyage; multilingual → models trained with that distribution; code → code-specific embeddings (Voyage code, OpenAI). The discipline: pick once, embed corpus, change requires re-embedding everything.

**See also:** → [01-embeddings](./01-embeddings.md) · → [09-stale-embeddings](./09-stale-embeddings.md) · → [04-vector-databases](./04-vector-databases.md)

---

## Why care

**Move 1.** You pick an embedding model and embed 1M documents. Six months in, a new model launches with substantially better benchmarks. You'd like to switch. But: switching means re-embedding everything (the new model's vectors are incompatible with the old). At 1M documents and $0.13/1M tokens cost, re-embedding costs ~$65 plus the engineering work to rebuild the vector store. The switch is expensive even at modest scale.

**Move 2.** That "which embedding model and what does switching cost" question is what embedding model choice answers. Pick once with intent; the corpus locks to that choice; switching is a planned migration.

**Why you need to answer that question at all:** Embedding model choice is sticky. Unlike LLM provider choice (where each call is independent), embeddings live in your corpus storage and are incompatible across models. The wrong initial choice creates technical debt.

**Move 5.** Embedding model choice is what database choice is for stored data — easy at green-field, painful to migrate later.

---

## How it works

### Move 1 — The mental model

Each embedding model produces vectors in its own coordinate system. Vectors from different models can't be compared meaningfully — text-embedding-3 vectors and BGE vectors live in different spaces. The corpus is locked to whatever model embedded it.

Strategy in plain English: **pick by task fit, language, dimension constraints, cost. Switching = re-embed corpus + rebuild vector store.**

---

### Move 2 — The layered walkthrough

#### Selection criteria

```
  Decision matrix for embedding model
  
  ┌──────────────────────┬──────────────────────────────────────────────┐
  │ Criterion            │ Implications                                  │
  ├──────────────────────┼──────────────────────────────────────────────┤
  │ Quality (MTEB rank)  │ Higher = better retrieval; biggest cost driver│
  │ Dimension count      │ Larger = more storage, slower search          │
  │ Language coverage    │ Multilingual models for non-English corpora   │
  │ Domain specialization│ Code embeddings, medical, legal as separate   │
  │ Pricing per 1M tokens│ Matters at scale; usually small relative to   │
  │                      │ LLM costs                                     │
  │ Hostability          │ Managed API vs self-hosted open-source        │
  └──────────────────────┴──────────────────────────────────────────────┘
```

---

#### Quality benchmarks

MTEB (Massive Text Embedding Benchmark) is the canonical reference. Scores correlate with real-world retrieval quality. Refresh rankings annually — landscape shifts.

Common 2026 leaders for general English:
- OpenAI text-embedding-3-large (3072 dims default, configurable down to 256)
- Voyage AI voyage-3 (Anthropic's recommended)
- Cohere embed-multilingual-v3
- Open-source: BGE-M3, gte-modernbert-base

For specialized domains, domain-specific models often beat general:
- Code: Voyage code-3, OpenAI code-embedding
- Medical, legal: domain-tuned variants

---

#### Dimension count tradeoff

Higher dimensions usually mean better quality but more storage and slower nearest-neighbor search.

```
  Dimension impact at 1M document scale
  
  ┌─────────────┬──────────────────────┬──────────────────┐
  │ Dimension   │ Storage per vector   │ Total at 1M docs  │
  ├─────────────┼──────────────────────┼──────────────────┤
  │ 384         │ 1.5 KB (float32)     │ 1.5 GB            │
  │ 768         │ 3 KB                 │ 3 GB              │
  │ 1024        │ 4 KB                 │ 4 GB              │
  │ 3072        │ 12 KB                │ 12 GB             │
  └─────────────┴──────────────────────┴──────────────────┘
```

OpenAI's text-embedding-3 supports MRL (Matryoshka Representation Learning) — you can truncate vectors to lower dimensions with graceful quality degradation. Useful for storage-constrained applications.

---

#### Language coverage

For non-English or multilingual corpora, pick a model trained with that coverage:
- Cohere embed-multilingual-v3 (100+ languages)
- BGE-M3 (multilingual)
- OpenAI text-embedding-3 (multilingual but English-leaning)

For English-only corpora, English-specific models can outperform multilingual ones on the same dimension budget.

---

#### Domain considerations

General embedding models work well for prose, but specialized domains often have specialized models:

- **Code**: Voyage code-3, OpenAI code-embedding-3. Different from text models — trained on code repositories.
- **Medical/clinical**: BioBERT-derived, PubMedBERT, Voyage life-sciences.
- **Legal**: SBERT-based legal models.

Domain-specific models can outperform general ones by 10-20% on domain-specific retrieval tasks.

---

#### Pricing landscape (2026)

```
  Sample embedding pricing
  
  ┌──────────────────────────────┬─────────────────────────┐
  │ Model                        │ Cost / 1M tokens         │
  ├──────────────────────────────┼─────────────────────────┤
  │ OpenAI text-embedding-3-small│ $0.02                    │
  │ OpenAI text-embedding-3-large│ $0.13                    │
  │ Voyage voyage-3              │ $0.06                    │
  │ Cohere embed-multilingual-v3 │ $0.10                    │
  │ Self-hosted (BGE, gte)       │ Compute + storage costs  │
  └──────────────────────────────┴─────────────────────────┘
```

Embedding cost is usually small relative to LLM cost. Don't optimize for embedding pricing unless at very high volume.

---

### Move 3 — The principle

Embedding model choice locks the corpus. Pick deliberately, then commit. Re-embedding is a planned migration, not a quick switch. The criteria: task fit (general/domain), language coverage, dimension constraints, quality (MTEB), and total cost. Quality usually dominates unless storage or latency constrains.

---

## Embedding model choice — diagram

```
┌─ Selection process ──────────────────────────────────────────────────────────┐
│                                                                              │
│   1. Task: general / code / medical / multilingual?                          │
│   2. Quality: MTEB top of category                                           │
│   3. Dimensions: storage budget; speed needs                                 │
│   4. Hostability: managed vs self-hosted                                     │
│   5. Pricing: probably not binding                                           │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
                            Lock the choice
                            Embed corpus
                            Build vector store
                                      │
                                      ▼
                            Re-embed = planned migration:
                              cost = corpus_size × new_model_price
                              + engineering work
                              + downtime/parallel-run window
```

---

## In this codebase

**Case B — contrl has no corpus to embed.**

contrl doesn't have a retrieval surface. No embedding model choice to make. Study material.

---

## Elaborate

**Where this pattern comes from.** Embedding-model selection became a discipline in 2023+ as MTEB and similar benchmarks standardized comparison. Before that, the choice was vendor-shaped (OpenAI ada-002 dominated). 2026 has multiple competitive options.

**The deeper principle.** Sticky technical choices need deliberate selection. Database engine, programming language, embedding model — once committed at scale, switching is expensive. The discipline: spend more time on selection than on switching.

**Where this breaks down.** Two places.

1. **Truly small corpora.** A few thousand documents can be re-embedded in minutes; switching is trivial. The locking concern only matters at scale.
2. **Multi-modal corpora.** Documents + images + tables. Embedding model choice doesn't cover everything; you need separate models per modality.

**What to explore next.**
- [09-stale-embeddings](./09-stale-embeddings.md) — what happens when the model upgrades and you don't re-embed.
- [04-vector-databases](./04-vector-databases.md) — how the choice affects vector storage.

---

## Tradeoffs

| Cost dimension | Premium embedding (text-embedding-3-large) | Cheap embedding (text-embedding-3-small) |
|---|---|---|
| Quality (MTEB) | Higher | Lower |
| Dimension | Up to 3072 | 1536 |
| Cost per 1M tokens | $0.13 | $0.02 |
| Best for | Production retrieval where quality matters | Prototypes, low-stakes search |

### Sub-block 1 — what we gave up

Quality if going cheaper; cost if going premium. Usually quality matters more than embedding cost (which is small relative to LLM cost).

### Sub-block 2 — what wrong choice would cost

Documented: starting with text-embedding-3-small, scaling to 1M docs, then needing higher quality. Re-embedding = $65 + engineering. Plus the parallel-run window while migrating queries.

### Sub-block 3 — the breakpoint

The choice is the right one until: (a) your corpus grows past the dimension-storage budget; (b) a substantially-better model launches and quality matters; (c) you need multilingual coverage you didn't plan for. For contrl: not applicable.

---

## Tech reference (industry pairing)

### OpenAI text-embedding-3

- **Codebase uses:** Not in contrl.
- **Leading today:** `adoption-leading` for general-purpose English embedding, 2026.
- **Why it leads:** strong MTEB score, MRL support (configurable dimensions), reasonable pricing.
- **Runner-up:** Voyage voyage-3 (Anthropic-recommended); Cohere embed-multilingual.

### MTEB benchmark

- **Codebase uses:** N/A — selection reference.
- **Leading today:** `adoption-leading` benchmark for embedding model comparison, 2026.
- **Why it leads:** broad task coverage, regularly updated.

---

## Project exercises

(Not applicable for contrl.)

---

## Summary

Embedding model choice locks the corpus to that model's vector space. Select by task fit (general/code/medical), language coverage, dimension budget, MTEB quality, and pricing. Re-embedding is a planned migration. Quality usually dominates; embedding cost is small relative to LLM costs.

**Key points:**

- **Locks the corpus.** Switching requires re-embedding everything.
- **MTEB is the canonical benchmark** for comparison.
- **Dimensions trade quality vs storage.** Most production uses 768-1536.
- **Language and domain matter.** Pick specialized models when applicable.
- **For contrl: Case B.** No corpus today.

---

## Interview defense

**[mid] How do you pick an embedding model?**

Task fit (general vs domain), language coverage, dimension budget, MTEB quality, pricing. For most English-prose work, OpenAI text-embedding-3 or Voyage voyage-3.

**[senior] Why is the choice sticky?**

Embeddings from different models live in different vector spaces. Switching requires re-embedding the entire corpus. At scale, this is expensive and disruptive. Make the choice deliberately.

---

## One-line anchors

- "Embedding choice locks the corpus."
- "MTEB benchmark for comparison."
- "Dimension count trades quality for storage."
- "Domain-specific models beat general ones on specialized retrieval."
- "Re-embedding is a planned migration, not a quick switch."

---

## Validate

**Level 1:** Draw the selection criteria stack.
**Level 2:** "What's the cost of switching embedding models?" Under 30 seconds.
**Level 3:** A teammate picked an embedding model casually. Now scaling to 10M documents. Walk through the consequences. (Switch is a $1300 re-embed + engineering.)
**Level 4:** Defend choosing OpenAI text-embedding-3-large over text-embedding-3-small for a new project.

**Quick check:**
- The canonical benchmark? (MTEB)
- Why is switching expensive? (Vectors from different models are incompatible.)
- Does contrl have this choice? (No — no corpus.)
