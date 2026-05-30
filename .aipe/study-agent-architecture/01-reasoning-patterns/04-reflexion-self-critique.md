# Reflexion / self-critique

**Industry name(s):** Reflexion · Self-critique · Critic-revise loop · LLM-as-judge in-loop
**Type:** Industry standard

> Produce a draft, then run a critic step that grades it, then revise if the critic finds issues. The cost is 2-5× tokens for one extra reliability pass; the failure mode is shared blind spots (the critic model has the same gaps as the producer). **Not planned for contrl** at solo scale — the coaching task's cost-of-bad is medium and doesn't justify a critic pass. The pattern earns its place when stakes go up.

**See also:** → prompt-side mechanics: [`.aipe/study-prompt-engineering/10-self-critique.md`](../../study-prompt-engineering/10-self-critique.md) · → [02-react.md](./02-react.md) (the base pattern this layers on)

---

## Why care

**Move 1.** Your agent emits an output. Sometimes it's right; sometimes it's subtly wrong. You want a second pass — a sanity check before you ship the output to the user.

**Move 2.** That "should I add a second pass" question is what reflexion answers. Not whether to run an agent. Just: do you trust one pass or do you spend tokens on a critic.

**Why it matters: most agents that fail in production fail on edge cases that a critic step would catch if the rubric is right.** The pattern's success is determined by the rubric — "is this good?" doesn't work; "does this cite the right form cue?" does.

**Move 5.** Reflexion is to agent loops what code review is to a PR: a second reader checks the work before it ships.

---

## How it works

### Move 1 — The mental model

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   Base agent (ReAct) produces a DRAFT                                │
│         │                                                            │
│         ▼                                                            │
│   ┌──────────────────────────────────────────┐                       │
│   │ Critic step (separate model call)        │                       │
│   │  rubric: was the form cue accurate?      │                       │
│   │          was the progression suggestion  │                       │
│   │          consistent with history?        │                       │
│   │          was the tone appropriate?       │                       │
│   └────────────────────┬─────────────────────┘                       │
│              ┌───────────┴───────────┐                                │
│              ▼ pass                  ▼ flagged                        │
│         emit output             revise + loop                         │
│                                 (cap retries — 2-3)                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Strategy in plain English:** one extra model call (the critic) buys one extra layer of reliability. Cap retries — 2-3 attempts max. Cap because if the critic keeps flagging, your problem isn't the critic catching new issues; it's the producer and critic agreeing on a wrong rubric.

### Move 2 — The two failure modes

```
FAILURE MODE 1: shared blind spots
─────────────────────────────────
producer and critic from the same model family share training gaps.
the critic confidently approves outputs that have the same subtle
errors it would have produced itself.

mitigation: use a different model family for the critic. anthropic
producer + openai critic, or vice versa. or use a larger/stronger
model as critic.


FAILURE MODE 2: vague rubric
─────────────────────────────
"is this good?" as the critic prompt produces vague approvals.
"is this output a 7+ on the rubric?" produces meaningless scores.

mitigation: specific named-dimension rubric. boolean checks per
dimension beat vague 1-5 scales. e.g., for coaching messages:
  - cites_form_cue: bool
  - consistent_with_history: bool
  - tone_matches_user_persona: bool
  - under_80_words: bool
```

### Move 3 — The principle

Reflexion buys reliability at a 2-5× token cost. The math: it's worth it when the cost-of-bad-output exceeds the cost of the critic pass. For high-stakes generative outputs (code being committed, user content being edited, content moderation decisions), reflexion pays back. For low-to-medium stakes (a coaching message, a search query rewrite), the critic pass is overhead.

---

## Reflexion — diagram

```
Run k = 1
       │
       ▼
┌──────────────────────────────────────┐
│ Base agent (ReAct) → draft           │
└────────────────┬─────────────────────┘
                 ▼
┌──────────────────────────────────────┐
│ Critic                                │
│   rubric: specific named dimensions  │
│   (NOT "is it good?")                │
└────────────────┬─────────────────────┘
        ┌─────────┴─────────┐
       PASS               FLAGGED
        │                   │
        ▼                   ▼
   ship output         k += 1
                       k < cap (2-3)?
                           │
                       ┌───┴───┐
                       │       │
                       Y       N
                       │       │
                       │       └─► ship the latest draft anyway
                       │           (log the cap was hit)
                       ▼
                   revise + critic again
```

---

## In this codebase

**Case B — not planned for contrl.**

The coaching agent's cost-of-bad is medium. A wrong coaching message is annoying (the user reads it, ignores it, moves on) but not destructive. The 2-5× token cost of a critic pass doesn't pay back at solo scale (1-2 coaching events per day) and there's no obvious eval-set failure ReAct produces that a critic would catch.

When reflexion would earn its place: if the coaching agent ever gained write authority — automatically modifying the user's progression state, generating workout plans the app then enforces, anything where a bad output has downstream consequences — the critic pass becomes non-negotiable. The pattern stays scoped, not started, until that line is crossed.

Planned path if needed: a separate critic chain in `src/lib/agent/critic.ts`.

---

## Elaborate

**Where this pattern comes from.** Madaan et al., "Self-Refine: Iterative Refinement with Self-Feedback" (2023); Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning" (2023). Production adoption picked up through 2024 as critic-then-revise patterns became standard for high-stakes generative agents.

**The deeper principle.** A second pass with different perspective catches what the first pass missed. The catch: the perspective has to be genuinely different. Same-model self-critique with a vague rubric is theater — it adds cost without adding reliability. The discipline that makes the pattern work is the rubric (specific, named dimensions) and the critic model choice (different family or tier).

**Where this breaks down.** Three places. First, low-stakes outputs where the cost-of-bad is already acceptable. Second, subjective domains where there's no rubric (e.g., creative writing where there's no objective "right"). Third, cost-constrained chains where doubling token count breaks the budget — the right move there is a better eval set, not a critic loop.

**What to explore next.** [`.aipe/study-prompt-engineering/10-self-critique.md`](../../study-prompt-engineering/10-self-critique.md) for the prompt-level mechanics.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────┬──────────────────────────────────────┐
│ Dimension          │ Reflexion                     │ Skip the critic (single-pass)        │
├────────────────────┼───────────────────────────────┼──────────────────────────────────────┤
│ Cost per output    │ 2-5× tokens                   │ baseline                             │
│ Reliability on edge cases │ higher (with right rubric) │ lower                          │
│ Failure mode       │ shared blind spots, vague rub.│ subtle errors slip through           │
│ Latency            │ +~600ms per pass               │ baseline                             │
│ Audit trail        │ critic flags logged for review│ no second perspective                │
└────────────────────┴───────────────────────────────┴──────────────────────────────────────┘
```

### Sub-block 1 — what reflexion costs

Two-to-five times the token budget per task, plus extra latency for the critic pass (and any revisions). For high-volume agents this is real money. The breakpoint: cost-of-bad-output × failure-rate vs critic-cost-per-output. For high-stakes outputs (code, edits, gated actions) the math works; for low-stakes outputs it doesn't.

### Sub-block 2 — what skipping the critic costs

The subtle-error class of failures. ReAct alone catches structural failures (wrong tool, wrong output schema) but not "the output looks right and is subtly wrong" — those slip through. If your eval set shows that failure class, reflexion is the answer. If your eval shows mostly structural failures, fix the prompt and tool definitions instead.

### Sub-block 3 — the breakpoint

Add reflexion when one of: (a) the output has downstream consequences (write actions, code committed, content moderation), (b) the eval shows a subtle-error failure class, (c) the audit trail of critic flags is itself valuable for product feedback. contrl's coaching agent hits none of these at planned scope.

### Sub-block 4 — what isn't a tradeoff

"Self-critique always improves quality." Not when the critic shares the producer's blind spots. Self-critique with the same model and a vague rubric is theater — costs tokens without improving anything. The discipline (different family + specific rubric) is the whole pattern.

---

## Tech reference (industry pairing)

### Cross-family critic model

- **Codebase uses:** not used. If reflexion lands in contrl, the producer would be Anthropic Sonnet 4 and the critic would be a different family (OpenAI, or larger Anthropic tier).
- **Why it's here:** the shared-blind-spot failure is the most common reason critic loops fail to improve quality. Cross-family is the cheap defense.
- **Leading today:** cross-family critic — adoption-leading for high-stakes generative agents, 2026.
- **Why it leads:** training-data divergence between families is the cheapest source of independent perspective.
- **Runner-up:** larger-tier same-family critic (Opus critiquing Sonnet) — works for some tasks, fails on others.

### Specific named-dimension rubric

- **Codebase uses:** not yet. The rubric design would be `tests/agent/critic-rubric.json` — boolean per dimension.
- **Why it's here:** the rubric is what makes reflexion work or fail. Boolean per dimension beats 1-5 scales.
- **Leading today:** boolean-per-dimension — adoption-leading for production critics, 2026.
- **Why it leads:** specific, eval-able, hard to game with vague approval.

---

## Summary

### Concept recap

Produce → critic → revise (cap retries 2-3). Two failure modes: shared blind spots (mitigated with a cross-family critic) and vague rubrics (mitigated with specific boolean dimensions). The cost is 2-5× tokens; pay when cost-of-bad-output justifies it. contrl's coaching agent is medium-stakes — reflexion is Case B, planned only if the agent gains write authority.

### Key points

- Reflexion's success is determined by the rubric, not the model.
- Use a different model family for the critic to avoid shared blind spots.
- Cap retries (2-3); if the loop doesn't converge, the rubric is wrong, not the producer.
- contrl: Case B. Earns its place when stakes go up.

---

## Interview defense

### Likely questions

**[mid] What's reflexion?**

Produce a draft with a base agent. Run a critic step against a specific rubric. Revise if flagged; cap retries at 2-3. The cost is roughly 2-5× tokens for one extra reliability pass. The catch is the rubric — vague rubrics produce vague approvals.

**[senior] When would you add it to contrl's coaching agent?**

If the agent gained write authority. Today the coaching message is read-only — the user reads it, ignores it if wrong, moves on. If the agent ever automatically modified progression state or generated workout plans the app then enforced, the critic pass becomes non-negotiable. At current scope the 2-5× token cost doesn't pay back.

**[arch] The senior production move on reflexion?**

Cross-family critic. Anthropic produces, OpenAI critiques (or vice versa). Shared blind spots between same-family models is the most common reason critic loops fail to improve quality. The discipline is independent perspective; the cheap source of that is different training distribution.

### One-line anchors

- "Reflexion is to agent loops what code review is to a PR."
- "The rubric is the pattern. Same-model self-critique with a vague rubric is theater."
- "Earn its place when cost-of-bad-output exceeds critic-cost-per-output."

---

## Validate

**Level 1 — Reconstruct the diagram.** Draft → critic → revise loop, with the cap.

**Level 2 — Explain in 60s.** Two failure modes of reflexion; their mitigations.

**Level 3 — Apply.** A PM asks for reflexion on the coaching agent for "quality." What's the question you ask back?

**Level 4 — Defend.** Defend the choice to NOT use reflexion on contrl's coaching agent.

**Quick check.**
- What's the cap on retries? — 2-3.
- What kind of rubric works? — Specific named-dimension booleans.
- Does contrl use reflexion? — No; Case B, gated on write authority.
