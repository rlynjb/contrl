# Multi-agent research assistant

**The prompt:** "Design a system that answers a complex research question by gathering from multiple sources and synthesizing."

**Standard architecture:**

```
                 USER QUESTION
                      │
                      ▼
            ┌────────────────────┐
            │ Supervisor agent    │   decomposes question
            │ (expensive model)   │   into sub-questions
            └─┬────────┬────────┬─┘
              │        │        │
         ┌────┘        │        └────┐
         ▼             ▼             ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ worker  │   │ worker  │   │ worker  │   each retrieves from
   │ (vector)│   │ (SQL)   │   │ (web)   │   a different source
   └────┬────┘   └────┬────┘   └────┬────┘   (agentic RAG per worker)
        │             │             │
        └──────┬──────┴──────┬──────┘
               ▼             ▼
        ┌────────────────────────┐
        │ Synthesis (supervisor) │  merges findings + citations
        └───────────┬────────────┘
                    ▼
              FINAL ANSWER
```

**Data model:**
- Source registry (which sources exist, their access methods)
- Per-source retrieval indices (vector store for documents, SQL for entities, web cache)
- Shared findings store (keyed by sub-question, holds retrieved chunks + provenance)
- Citation provenance (each claim links to a source chunk)
- Run state (sub-questions completed, in-progress, pending)

**Key components:**
- Decomposition (in supervisor): turn user question into N sub-questions with dependencies
- Parallel retrieval (workers, fan-out): one worker per sub-question, retrieving from the assigned source
- Synthesis (supervisor): merge worker outputs into a coherent answer with citations
- Citation tracking: every claim cites a chunk; chunks cite their source
- Decision: tools-style delegation (supervisor stays in control) vs handoff-style (workers transfer control)

**Scale concerns:**
- **At many sources (10+)**, the supervisor's decomposition becomes the bottleneck — it has to pick the right source per sub-question and the routing decision gets harder. Fix: source taxonomy + heuristic routing first.
- **At deep questions (5+ sub-questions)**, fan-out cost compounds — 5 workers × 3-5 turns each = 15-25 LLM calls per question. Fix: cap workers; consider sequential pipeline for low-priority sub-questions.
- **At high volume (100+ questions/day)**, the supervisor becomes the bottleneck. Fix: cheap workers, expensive supervisor only; or cache the supervisor's decomposition for similar questions.

**Eval framing:**
- Trajectory eval: did each worker hit the right source for its sub-question?
- Answer groundedness: every claim in the final answer cites a retrieved chunk; can be verified programmatically
- Cost/latency per question (p50 / p99)
- Source coverage (did we miss a relevant source the user expected?)

**Common failure modes:**
- Synthesis of contradictory sources — two workers return conflicting facts; the supervisor averages or picks one without flagging. Mitigation: surface conflicts in the output; don't silently resolve.
- Citation hallucination — the final answer cites a chunk that doesn't support the claim. Mitigation: ground-check every citation programmatically.
- Cost blowup from deep loops — sub-questions trigger more sub-questions. Mitigation: cap recursion depth.
- Lost-in-the-middle across many worker results — the supervisor's synthesis context bloats. Mitigation: summarize worker outputs before passing to synthesis.

**Applies to this codebase:** `no`.

contrl is a fitness-progression app, not a research assistant. There's no multi-source retrieval problem, no synthesis-from-evidence task, no information-gathering loop. The planned coaching agent answers from one source (local SQLite + classifier output) for one job (produce a coaching message). The research-assistant template is the canonical multi-agent fan-out shape — useful to know in interview but structurally unrelated to contrl.

**How to make it apply:**

It would require building a different product. The closest contrl-shaped feature that resembles this template would be a "weekly training review" agent that pulls in user sessions, training-philosophy documents (if any existed), and a comparison against general programming knowledge — and synthesizes a recommendation. That hypothetical feature isn't planned. The template stays purely instructional for contrl.

For an interview, this template is useful when the question is "design a system to answer 'summarize the trends in the user's training over the last 90 days and recommend changes.'" That'd be a multi-source synthesis task — a real fit for the research-assistant template, but a future contrl feature, not a current one.
