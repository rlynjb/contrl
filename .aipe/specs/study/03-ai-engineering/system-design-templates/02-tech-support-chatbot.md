# Tech support chatbot system design

**Industry name(s):** Tech support chatbot, RAG-grounded LLM chatbot, IK Module 5
**Type:** Industry standard

> A chatbot that answers user questions about a product by retrieving from a knowledge base, generating an answer with an LLM, and escalating to a human when confidence is low.

**See also:** → [../03-agent-memory.md](../03-agent-memory.md) · → [../08-ml-in-the-loop-agents.md](../08-ml-in-the-loop-agents.md)

---

- **The prompt:** Design a tech support chatbot that answers user questions by retrieving relevant docs and using an LLM to generate a grounded response, escalating to a human when confidence is low.

- **Standard architecture:**

  ```
  user message
        │
        ▼
  ┌──────────────────┐
  │ intent classifier│  ── greeting / question / complaint / escalate
  └────────┬─────────┘
           │
           ▼ if "question"
  ┌──────────────────┐    ┌──────────────────┐
  │ query rewrite    │ ─► │ retrieval        │ ── top-k docs
  │ (LLM)            │    │ (vector + BM25)  │
  └──────────────────┘    └──────────────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │ LLM with docs    │ ── grounded answer + confidence
                          │ as context       │
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │ confidence gate  │
                          └────────┬─────────┘
                                   │
                       low ────────┴──────── high
                       │                       │
                       ▼                       ▼
                escalate to human         return to user
  ```

- **Data model:**
  - `kb_docs` — `{id, title, content, embedding, last_updated_at}` knowledge base content
  - `conversations` — `{conversation_id, user_id, messages[], status: ongoing | resolved | escalated}`
  - `messages` — `{message_id, role, content, retrieved_doc_ids[], confidence}`
  - `feedback` — `{message_id, user_rating, escalation_outcome}` (training signal)

- **Key components:**
  - *Intent classifier*: small NLU model or LLM call that routes the input. Fast path for "hi" / "thanks" / "goodbye" doesn't need retrieval or generation.
  - *Retrieval*: hybrid vector + BM25 over knowledge base, top-5 docs.
  - *LLM generator*: takes docs + conversation history, generates grounded answer with citations.
  - *Confidence scorer*: from the LLM's own probability of the answer, or a separate model trained on (answer, was_correct) labels.
  - *Escalation*: writes the conversation to a queue for human review; user sees "let me get someone".
  - *Eval*: rubric-based LLM-as-judge on a held-out set; online resolution rate; escalation precision/recall.

- **Scale concerns:**
  - At ~100 escalations/day: human reviewer queue manageable. Above ~500/day need a triage layer (urgency classifier) to prevent backlog.
  - At ~10K KB docs: retrieval works fine. At ~1M docs (e.g., across many product lines), partition the vector index by product.
  - At ~1M conversations/day: cost of LLM generation dominates. Mitigation: prompt caching for common questions, smaller model for high-confidence intents.

- **Eval framing:**
  - Offline: rubric-based LLM-as-judge on golden Q&A set. Pairwise comparison for prompt variants.
  - Online: resolution rate (user marks resolved), escalation rate, time-to-resolution.
  - "No follow-up is not necessarily success" — user may have given up. Sample escalated conversations for offline review.

- **Common failure modes:**
  - Hallucination (LLM makes up answers when retrieval misses). Mitigation: require citation tokens in the answer; refuse to answer without citations.
  - Stale docs (KB updated but embeddings weren't). Mitigation: re-embed on doc update; embedding_stale_at flag.
  - Confidence miscalibration (LLM confidence doesn't match actual correctness). Mitigation: calibrate against a labeled set; conservative threshold for escalation.
  - Prompt injection (user instructs the LLM to ignore the docs). Mitigation: sanitize inputs, system-prompt locks.

- **Applies to this codebase:** `no`. contrl-mo has no support chatbot. The Phase 4 Path C coaching agent has structural similarities (LLM + tool calls + grounding in user data), but it's coaching, not support. This template is included because IK Module 5 names it as a canonical interview framing.

- **How to make it apply:** Adding an in-app "help" chatbot grounded in the SPEC.md and docs/ would map directly to this template. The retrieval layer would use sqlite-vec over the project docs; the LLM would be the same Claude integration as the coaching agent. Today it's a thought experiment.
