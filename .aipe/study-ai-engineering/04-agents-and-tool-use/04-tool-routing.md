# Tool routing

**Industry name(s):** Tool routing, dispatcher routing, heuristic vs LLM routing, gating
**Type:** Industry standard

> Not every event needs an LLM. A heuristic gate decides whether to invoke the agent at all; once invoked, the LLM picks tools within the agent. Two routing layers: outer (rule-based, do we even talk to the model?) and inner (model-driven, which tool first?).

**See also:** → [01-tool-and-function-calling](./01-tool-and-function-calling.md) · → [06-when-not-to-use-an-agent](./06-when-not-to-use-an-agent.md)

---

## Why care

Every LLM call costs money and time. If you can decide *without* the LLM that no action is needed, you should. The cheapest LLM call is the one you don't make. Routing is the discipline of saying "this event is ML's job, this event is heuristics' job, this event is the LLM's job" before paying for the model.

The pattern is **two-layer routing** — heuristic outer gate + LLM inner dispatch. Same shape as middleware chains (check auth before routing to handler), feature flags (skip experimental path on a config check), and the curriculum's "heuristic before LLM" principle.

---

## How it works

A coaching event is triggered by a session end. Should the agent run? Two layers decide.

### Layer 1 — Outer heuristic gate

The rule from curriculum B4C.4: "rule-based gate — form classifier output triggers the agent" — specifically "≥ 2 instances of same failure in session".

```typescript
function shouldCoach(sessionResult: ClassifierOutput[]): boolean {
  const failuresByType = new Map<string, number>();
  for (const rep of sessionResult) {
    if (rep.label !== 'good') {
      failuresByType.set(rep.label, (failuresByType.get(rep.label) ?? 0) + 1);
    }
  }
  for (const count of failuresByType.values()) {
    if (count >= 2) return true;
  }
  return false;
}
```

A clean session (every rep labeled `good`) returns false, the agent never runs, the user sees no coaching message — the right outcome and ~zero cost.

The rule's *threshold* (2 same-type failures) is product policy. Higher threshold = coaching is rare; lower threshold = coaching is noisy. Curriculum specifies 2.

### Layer 2 — Inner LLM-driven dispatch

Once the agent fires, the LLM decides which tool to call first. Given the system prompt that lists 4 tools, the model usually goes:
1. `get_form_history(category)` — see if this failure pattern has happened before.
2. `get_recent_coaching()` — check what was already said.
3. `get_exercise_cues(exerciseId)` — pull canonical cues.

The order isn't fixed; the model picks based on its understanding of the task. The prompt can suggest an order ("typically check history first") but doesn't enforce it.

### Why two layers

If we let the LLM decide whether to coach at all (one-layer LLM routing), every session end triggers an LLM call — even clean sessions where the agent would correctly say "no coaching needed". That's ~$0.02 wasted per session. The heuristic gate cuts the wasted calls to zero.

If we used heuristics for *which tool* (one-layer heuristic), the dispatch logic would be hand-coded for every situation — "if elbow flare, get cues; if depth miss, get progression state". Brittle and unmaintainable as the rule set grows. The LLM handles the open-ended decision; heuristics handle the closed-form decision.

### Move 2.5 — Phase A vs Phase B for routing

**Phase A (planned):** rule-based outer gate from B4C.4. Threshold = 2 same-type failures.

**Phase B (curriculum extension, not Path C):** a confidence-based inner routing — if the form classifier output is low-confidence, the agent fetches *more* data; if high-confidence, it goes direct to coaching. This is curriculum item C4.6 ("heuristic vs LLM-routed") applied at finer granularity.

### Move 3 — The principle

The cheapest LLM call is the one you don't make. Routing decisions belong at the layer cheapest to evaluate. Pure rules at the outer layer; the model only fires when its strengths (open-ended decision) actually earn the cost.

The full picture is below.

---

## Routing — diagram

```
┌─ Session ends ─────────────────────────────────────────────────────────────┐
│  classifier_outputs = [ {rep1: good}, {rep2: elbow_flare}, ... ]           │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              ▼  Layer 1 — heuristic gate
                  ┌────────────────────────────────────────┐
                  │  shouldCoach(classifier_outputs)        │
                  │   count same-type failures              │
                  │   any failure ≥ 2 ?                     │
                  │     no  → return (no coaching)          │
                  │     yes → continue                      │
                  └─────────────────┬──────────────────────┘
                                    │ yes
                                    ▼
                  ┌────────────────────────────────────────┐
                  │  agent.run({                            │
                  │    classifier_outputs,                  │
                  │    triggering_failure_type              │
                  │  })                                     │
                  └─────────────────┬──────────────────────┘
                                    │
                                    ▼  Layer 2 — LLM inner dispatch
                  ┌────────────────────────────────────────┐
                  │  LLM picks which tool first             │
                  │   → get_form_history                    │
                  │   → get_recent_coaching                 │
                  │   → get_exercise_cues                   │
                  │   → get_progression_state               │
                  │  (order is model-decided)               │
                  └─────────────────┬──────────────────────┘
                                    │
                                    ▼
                            final coaching message
```

---

## In this codebase

**Not yet implemented.** Phase 4 Path C of the curriculum.

Expected paths:
- `src/services/ai/router.ts` (new) — `shouldCoach(classifierOutputs)` heuristic gate.
- `src/services/ai/agent.ts` (new) — the LLM-driven inner dispatch.

The outer gate depends on classifier outputs from Phase 2C; without form classification there's no signal to route on.

---

## Elaborate

### Where this pattern comes from

"Heuristic before LLM" is a curriculum principle, applied as an architectural rule. The same pattern shows up everywhere LLMs meet production: chatbots that detect "this is a refund request" with a regex first before invoking the model, content moderation that catches the obvious cases with rules and escalates the ambiguous to a model.

### The deeper principle

Layered routing is risk-management. The outer layer (cheap, deterministic) is high-recall on "obvious" cases. The inner layer (expensive, stochastic) handles the ambiguous middle. Trying to use one layer for both makes you choose between "fast but rigid" and "smart but expensive". Two layers gets you both.

### Where this breaks down

When the heuristic gate is wrong frequently — either gates closed when it should have opened (false negative) or opened when it should have closed (false positive). Two failure modes:
- False positive: agent runs unnecessarily, user sees noise coaching.
- False negative: real failure goes uncoached, user is confused why the app didn't say anything.

Threshold tuning helps; the deeper fix is adding an "override" path (user explicitly asks for coaching) that bypasses the heuristic.

### What to explore next

- [06-when-not-to-use-an-agent](./06-when-not-to-use-an-agent.md) → cases where the outer gate should always be closed
- [05-error-recovery-in-agents](./05-error-recovery-in-agents.md) → what the inner dispatch does when a tool fails

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Two-layer routing (planned)      │ LLM-only routing (alt)           │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Cost per session   │ ~$0 on clean sessions            │ ~$0.02 on every session          │
│ Latency on no-coach│ Instant                          │ ~1.5s per session                │
│ Maintenance        │ One heuristic + one prompt       │ Just a prompt (simpler)          │
│ Threshold tuning   │ Hard-coded value, brittle        │ Model-decided, drifts             │
│ Override path      │ Bypass via dedicated UI          │ Bypass via prompt                │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up (planned)

The heuristic is hard-coded. A user with an unusual failure pattern (e.g., "many different small failures" rather than "two of the same") won't trigger the gate. The threshold of 2 is product policy; tuning requires releasing a new app version.

### Sub-block 2 — what LLM-only routing would cost

Every session-end fires the LLM. At ~$0.02 per call × ~5 sessions/week × 52 weeks = ~$5/user/year just for the "should we coach?" decision. Across many users it adds up; for a single user it's not catastrophic but it's wasteful.

### Sub-block 3 — the breakpoint

Fine until the heuristic produces too many false negatives. If users start asking "why didn't I get coaching?" the threshold is too high; if "stop coaching me on every set", too low. Plan to tune after first 100 real sessions.

### Sub-block 4 — what isn't a tradeoff

A trained classifier that decides "should coach?" was not picked — it would be over-engineering for a binary decision on a small input. A two-line heuristic is the right size.

---

## Tech reference (industry pairing)

### Heuristic-before-LLM gating

- **Codebase uses:** Not yet implemented. Same pattern as the curriculum's classifier-before-LLM principle.
- **Why it's here:** the cheapest way to cut LLM cost on cases the LLM wouldn't add value to.
- **Leading today:** Heuristic-first routing — `adoption-leading` for cost-aware production agents, 2026.
- **Why it leads:** zero infrastructure, debuggable, controllable.
- **Runner-up:** Confidence-thresholded classifier routing — `innovation-leading` when the heuristic gets too brittle.

---

## Project exercises

### [B4C.4] Rule-based gate for coaching

- **Exercise ID:** `[B4C.4]`
- **What to build:** `shouldCoach(classifierOutputs): boolean` in `src/services/ai/router.ts`. Logic: count failures by type, return true if any type ≥ 2.
- **Why it earns its place:** demonstrates "heuristic before LLM" applied in a real agent flow; the easiest cost-cutting decision to defend in interviews.
- **Files to touch:** `src/services/ai/router.ts` (new), called from the session-end flow in `useGameState.ts`.
- **Done when:** unit test covers the three cases (clean session, single failure, ≥ 2 same-type failure).
- **Estimated effort:** <1hr

---

## Summary

### Concept recap

Routing happens at two layers in contrl's planned coaching agent. Outer layer is a heuristic gate (`shouldCoach`) that returns false for clean sessions and short-circuits the agent before any LLM call. Inner layer is the LLM's own tool-selection within the agent loop. The constraint forcing this design is cost — the outer gate keeps clean sessions free of LLM cost. The trade is one hard-coded threshold and a maintenance burden on the heuristic.

### Key points

- Two layers: heuristic outer, LLM inner.
- Clean sessions never reach the LLM.
- The threshold (≥ 2 same-type failures) is product policy.
- The model handles open-ended decisions; rules handle closed-form ones.

---

## Interview defense

### Likely questions

**Q: Why two routing layers?  [mid]**
A: Cost. A clean session doesn't need an LLM — the heuristic gate decides "no coaching needed" deterministically and skips the model entirely. The LLM only runs when coaching is needed, where its strength (open-ended decision over multiple tool options) actually earns the cost.

**Q: What if the heuristic gate is too aggressive (false positives)?  [senior]**
A: The user sees noise coaching after every minor stumble. Two paths to fix: raise the threshold (less coaching), or refine the rule (only same-type failures within consecutive reps). Both are config changes. The deeper fix is to A/B test threshold values once we have enough sessions.

**Q: At scale, when does this approach break?  [arch]**
A: When the heuristic's accuracy is wrong by a margin that costs more in coaching errors than the LLM gate would have. At ~1M coaching events the wasted-LLM cost of pure-LLM routing is significant, but the false-positive cost of a bad heuristic might be worse (users churn over noise). The breakpoint is product-driven, not technical.

### One-line anchors

- Outer layer cheap; inner layer expensive.
- The cheapest LLM call is the one you don't make.
- Two layers buy you both fast and smart.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the two-layer flow.

### Level 2 — Explain it out loud
Why not LLM-only routing? Under 60 seconds.

### Level 3 — Apply it to a new scenario
"Add a 'celebrate milestone' agent path. What's the heuristic gate?"

### Level 4 — Defend the decision you'd change
"Would you ever switch to LLM-only routing?" When?

### Quick check — code reference test
- Where will the heuristic live?
- What's the threshold?
- Which tool decides "should coach"?

Then verify.

---
Updated: 2026-05-29 — Replaced three "loopd's principle #9" attributions with curriculum-anchored phrasing per v1.43.0 Hard repo-scope rule (the heuristic-before-LLM principle is a curriculum item, not a loopd codebase claim).
