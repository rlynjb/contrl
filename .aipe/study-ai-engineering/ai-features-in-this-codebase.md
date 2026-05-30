# AI features in this codebase

> Reference card for every AI/LLM feature contrl plans to ship. The codebase has **one LLM-driven feature**: the Phase 4 Path C coaching agent that consumes the ML classifier's outputs. Everything else AI-related in this guide is study material — concepts contrl doesn't currently exercise but might under future phases.

**See also:** Companion: → [ml-features-in-this-codebase.md](./ml-features-in-this-codebase.md) for the ML side (form classifier, recommender, audit trail). Concept anchors: → [04-agents-and-tool-use/](./04-agents-and-tool-use/) for the agent's mechanics · → [01-llm-foundations/](./01-llm-foundations/) for LLM background.

## The one feature

### Coaching agent (Phase 4 Path C)

- **Feature:** at the end of a workout session, the user sees a coaching message. The agent reads the ML classifier's per-rep form labels, the user's recent form history, the current progression state, recent coaching to avoid repetition, and the exercise's known cues. It generates a one-paragraph coaching message tuned to what the user actually did.
- **Status:** Planned. Curriculum builds B4C.1–B4C.5. Prerequisite: Phase 2C audit-trail (B2C.4) must ship first because the agent's tools read from the `audit_inferences` table.
- **Patterns used:**
  - → [04-agents-and-tool-use/01-agents-vs-chains.md](./04-agents-and-tool-use/01-agents-vs-chains.md) — agent vs chain choice; this is genuinely agentic (loops, tool decisions)
  - → [04-agents-and-tool-use/02-tool-calling.md](./04-agents-and-tool-use/02-tool-calling.md) — 5 read-only tools
  - → [04-agents-and-tool-use/03-react-pattern.md](./04-agents-and-tool-use/03-react-pattern.md) — observe-think-act loop
  - → [04-agents-and-tool-use/04-tool-routing.md](./04-agents-and-tool-use/04-tool-routing.md) — agent decides which tools to call based on context
  - → [04-agents-and-tool-use/05-agent-memory.md](./04-agents-and-tool-use/05-agent-memory.md) — `get_recent_coaching` is the memory boundary
  - → [04-agents-and-tool-use/06-error-recovery.md](./04-agents-and-tool-use/06-error-recovery.md) — when a tool returns no data (e.g., no recent coaching for new users)
  - → [04-agents-and-tool-use/08-ml-in-the-loop.md](./04-agents-and-tool-use/08-ml-in-the-loop.md) — the ML-classifier-output-feeds-LLM pattern; the defining feature
  - → [01-llm-foundations/04-structured-outputs.md](./01-llm-foundations/04-structured-outputs.md) — coaching output is structured (the message + optional metadata like "next session difficulty bump")
  - → [01-llm-foundations/08-provider-abstraction.md](./01-llm-foundations/08-provider-abstraction.md) — Anthropic Sonnet today; abstraction allows swap if needed
  - → [05-evals-and-observability/02-eval-methods.md](./05-evals-and-observability/02-eval-methods.md) — Phase 3 evals for the agent (human + LLM-as-judge)
  - → [06-production-serving/03-prompt-injection.md](./06-production-serving/03-prompt-injection.md) — user journal content (notes field) reaches the agent through tool outputs; defense matters
- **Why these patterns:** the feature is genuinely agentic — the LLM decides which tools to call based on what the classifier output reveals. If a particular set's form looked bad, the agent calls `get_exercise_cues` to retrieve teaching points; if form was good, it might call `get_progression_state` to talk about the next step. The tool set is deliberately small (5 read-only) and the prompt-injection surface is the user's freeform `notes` field on each session, which becomes part of the data the agent reads.
- **Model:** Anthropic Sonnet 4. Cloud-only — the only contrl surface that crosses the network for inference (everything else is on-device).

## What contrl does NOT have

Honest about scope. The LLM-side concepts in this guide cover:

- **Single-purpose chains.** contrl has no chains — just the one agent. Background reading; not applicable to contrl's current scope.
- **Retrieval / RAG.** contrl does no retrieval. The coaching agent uses *tool calls* against local data, not embeddings + vector search. All 12 files under `03-retrieval-and-rag/` are Case B for contrl.
- **Streaming responses, token economics at scale, LLM caching, rate-limiting / backpressure.** Applicable to LLM-heavy apps; contrl runs the coaching agent once per session, so per-call cost is low and at low volume. These concepts are study material for now; they become relevant if/when contrl's LLM surface grows.
- **Few-shot prompting, chain-of-thought, self-critique.** Prompt-engineering techniques; covered in the companion prompt-engineering guide. The coaching agent's prompt will use them but they're not concepts unique to AI engineering as a discipline.

## What might come next

If contrl's AI surface grows past the single coaching agent, the next likely additions:

- **Form-coaching agent variants per exercise category** (push vs pull vs squat). Today one prompt + 5 tools handles all; per-category prompts might earn their place.
- **Progression-decision agent.** The recommender is currently planned as rule-based v1 then ML v2. A future v3 could be an LLM-driven recommender that consults form history + user goals + recent compliance. Not on the curriculum.
- **In-app coach Q&A.** A user-initiated chat with the same coaching agent, scoped to their recent workout data. Would push the agent's surface from one-paragraph-end-of-session to multi-turn. Not on the curriculum.

For each of those, the relevant concepts from this guide apply directly. The current scope is deliberately narrow because the audit-trail prerequisite (B2C.4) and the Phase 2C ML work have to land first.

---

## Cross-references

- **Agent's mechanics:** [04-agents-and-tool-use/](./04-agents-and-tool-use/) (8 files; the deepest AI-side coverage in this guide)
- **ML this agent consumes:** [08-machine-learning/](./08-machine-learning/) (the upstream)
- **Eval discipline:** [05-evals-and-observability/](./05-evals-and-observability/) (applies to both the ML and the agent)
- **System-design framing:** [07-system-design-templates/02-tech-support-chatbot.md](./07-system-design-templates/02-tech-support-chatbot.md) (the agent is structurally similar; differences spelled out there)

The agent is the entire AI surface of this codebase. Every other LLM-side file in this guide is preparation for either growing past it or for interview scenarios where this work has to be defended in a conversation.

---
Updated: 2026-05-29 — Removed "(the loopd shape)" and "(the loopd Phase 2A shape, or aipe's Phase 2B)" shape-label parentheticals per v1.43.0 Hard repo-scope rule; the contrast still reads cleanly without them.
