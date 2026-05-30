# Agentic support / task system

**The prompt:** "Design an agent that resolves user requests by taking real actions across tools, and escalates when it can't."

**Standard architecture:**

```
                 USER REQUEST
                      │
                      ▼
            ┌────────────────────┐
            │ Intent router       │  heuristic-first, LLM at the back
            │ (decides if agent   │
            │  is needed at all)  │
            └─────────┬──────────┘
                      │ agent needed
                      ▼
            ┌────────────────────────────────────────────┐
            │ Single agent (ReAct) with tools             │
            │                                             │
            │   ┌──────────┐  ┌──────────┐  ┌──────────┐ │
            │   │ Reason   │─►│ Act      │─►│ Observe  │ │
            │   └──────────┘  └──────────┘  └────┬─────┘ │
            │         ▲                          │       │
            │         └──────────────────────────┘       │
            │   (loop, capped: K=8, token budget)         │
            │                                             │
            │   Tools: typed schema, side-effect-bounded  │
            └─────────────┬──────────────────────────────┘
                          ▼
            ┌────────────────────────────────────────────┐
            │ Guardrails:                                 │
            │   Input sanitize → bounded loop → output    │
            │   schema → side effects through your code   │
            │   only                                       │
            └─────────────┬──────────────────────────────┘
                          │ low confidence / gated action?
                  ┌───────┴───────┐
                  ▼               ▼
              ship             escalate
              output            to human
```

**Data model:**
- Conversation / run history (per-turn tool calls + confidence)
- Escalation log (which runs went to human, why, outcome)
- Tool registry (typed schemas, side-effect classification)
- Action audit trail (every executed action, who/what triggered, when, result)
- User profile / state (preferences, current context)

**Key components:**
- Routing (heuristic-first cascade; gates "should agent run at all")
- The agent loop (ReAct, bounded)
- Guardrails (input sanitize, output validate, side effects through your code)
- Escalation gate (human approval on high-stakes or low-confidence actions)
- Audit logging (every action and tool call traceable)
- Decision: which actions auto-execute, which gate to human — risk classification.

**Scale concerns:**
- **Tool-call cascade under load** — many users × N-turn loops = combinatorial provider calls. Fix: per-user rate limits + per-tool circuit breakers.
- **Cost per resolved request** — variable, hard to budget. Fix: per-run token budget; route trivial requests to cheap deterministic handlers before the agent.
- **Human escalation queue** — at scale, humans are the bottleneck. Fix: tier actions by risk; only the high-risk tier gates.
- **Adversarial input** — users probe the agent to take unauthorized actions. Fix: full prompt-injection defense layered (Layers 1-4 from study-ai-engineering's prompt-injection file).

**Eval framing:**
- Resolution rate without escalation
- Tool-call accuracy
- Adversarial set (prompt injection cases, out-of-scope requests)
- Action safety (no unauthorized side effects — audit-log every action; eval against expected actions per case)

**Common failure modes:**
- Prompt injection in user input → agent takes an unsafe action. Mitigation: read-only by default; gate write actions through human approval and through your code (never the agent directly).
- Agent loops on an unsolvable request. Mitigation: iteration cap; surface "I couldn't resolve this" cleanly.
- Hallucinated tool results. Mitigation: schema-validate every tool return; reject malformed.
- Cost blowup. Mitigation: per-run token budget + per-tool circuit breakers.

**Applies to this codebase:** `partially`.

contrl's planned coaching agent is structurally an agentic-support shape — a single agent with five tools, bounded by iteration cap, output through structured schema, guardrails on input. **What's different from a typical support system:** contrl's tools are all read-only (no write tools, no external API tools), so there are no side effects to gate. The whole "human escalation on high-stakes action" half of the template doesn't apply because there are no high-stakes actions to escalate. The output is read-only advice (a coaching message); the user reads it and ignores it if wrong.

**How to make it apply:**

If contrl ever added a write tool — e.g., "automatically adjust the user's progression," "create a new program," "log a coaching milestone to an external service" — the full template applies:

- Add the action audit trail (`audit_log` table in SQLite, with the typed action, args, agent's confidence, timestamp).
- Add the human escalation gate for any irreversible action. Concrete shape: the agent emits a structured "proposed action" tool call; the app surfaces it to the user; the user approves or rejects; the agent observes the decision and continues.
- Layer the full prompt-injection defense (Layers 1-4): input sanitization, hierarchical trust framing in the system prompt, structured output enforcement, runtime gating on every write action.
- Build the adversarial eval set (`tests/agent/adversarial.json`) — currently planned for Phase 3 but lighter at planned scope because there are no write tools to test against.

For an interview, this is the closest template to contrl's planned coaching agent. The strong answer when asked "design an agentic support system" is to walk through the template and then name where contrl's actual design simplifies (read-only tools, no escalation, no external APIs) and where it would need to grow if write tools landed.
