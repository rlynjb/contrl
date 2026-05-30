# Agent evaluation

**Industry name(s):** Agent eval · Trajectory eval · Tool-call accuracy · Topology eval
**Type:** Industry standard

> Evaluating an agent is harder than evaluating one LLM call, because the unit of evaluation is the *trajectory*, not just the final output. The metrics that matter: task success rate, tool-call accuracy, trajectory efficiency (steps and cost), recovery rate (did it handle a failed tool call). **For contrl, agent eval is Phase 3 work** — the planned coaching agent will be evaluated on golden trajectories + adversarial cases before any user release.

**See also:** → output-quality eval methods: [`.aipe/study-ai-engineering/05-evals-and-observability/02-eval-methods.md`](../../study-ai-engineering/05-evals-and-observability/02-eval-methods.md) · → LLM-as-judge bias: [`.aipe/study-ai-engineering/05-evals-and-observability/03-llm-as-judge-bias.md`](../../study-ai-engineering/05-evals-and-observability/03-llm-as-judge-bias.md)

---

## Why care

**Move 1.** Your single-LLM-call eval scored your prompts well. You wrap them in an agent loop. You ship. The agent picks the wrong tool in 15% of cases, gets stuck in mini-loops, or produces fine answers via a six-turn trajectory that should have taken two. None of these show up in single-call eval.

**Move 2.** That "did the *agent* do its job well" question is what trajectory eval answers. Not whether the final output was good. Just: did the agent reason well, call the right tools, recover from errors, stay in budget.

**Why it matters: most agents fail at trajectory issues that single-call eval can't see.** A good final answer can hide a wasteful trajectory. A bad final answer can be one fixable tool-call mistake away from a good one.

**Move 5.** Agent eval is to LLM eval what integration tests are to unit tests: same discipline, different unit of analysis.

---

## How it works

### Move 1 — The mental model

```
┌─ LLM eval (one call) ────────────────────────────────────────────────────┐
│                                                                          │
│   input → model → output → score                                         │
│                                                                          │
│   metric: output quality                                                 │
└──────────────────────────────────────────────────────────────────────────┘


┌─ Agent eval (a trajectory) ──────────────────────────────────────────────┐
│                                                                          │
│   input                                                                  │
│     ↓                                                                    │
│   tool_call_1  ← was the right tool called?                              │
│     ↓                                                                    │
│   observation                                                            │
│     ↓                                                                    │
│   tool_call_2  ← in the right order?                                     │
│     ↓                                                                    │
│   ...                                                                    │
│     ↓                                                                    │
│   tool_call_N                                                            │
│     ↓                                                                    │
│   final answer ← was the final output good?                              │
│                                                                          │
│   metrics:                                                                │
│     - task success rate (final answer correct?)                          │
│     - tool-call accuracy (per-step: right tool, right args?)             │
│     - trajectory efficiency (steps / cost to completion)                 │
│     - recovery rate (did it handle a failed tool call?)                  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Strategy in plain English:** the agent's trajectory is the unit of evaluation. Score each step plus the final answer.

### Move 2 — The four agent metrics

```
1. TASK SUCCESS RATE
   ─────────────────
   Did the agent achieve the goal?
   - golden test set with known-correct outcomes
   - measured on each release
   - this is the metric users care about


2. TOOL-CALL ACCURACY
   ──────────────────
   Per step: did the agent call the right tool with the right arguments?
   - LLM-as-judge against ground-truth tool calls in the golden set
   - or programmatic comparison if tool args are typed
   - finds prompt-design issues that hide behind a "good" final answer


3. TRAJECTORY EFFICIENCY
   ────────────────────
   How many steps and how much $ to completion?
   - p50 and p99 trajectory length
   - cost per task
   - reveals cost regressions when prompts or tools change


4. RECOVERY RATE
   ─────────────
   When a tool call fails (tool returns error / unexpected output / etc),
   does the agent recover gracefully?
   - inject failures into golden tests
   - measure: did the agent route around, retry, escalate, or hang?
```

### Move 3 — The evaluator paradox and its mitigation

Using an LLM to grade an LLM's trajectory is the standard approach, and it has the same bias problem as LLM-as-judge generally. Mitigations:

```
- frozen golden trajectories: known-correct outcomes pinned in code
- iteration caps on the eval LLM (don't let the judge ramble)
- human spot-checks on a sample of eval runs
- different model family for judge vs producer
- programmatic grading where possible (e.g., did the agent call
  tool X with arg Y?) — beats LLM grading on structural metrics
```

---

## Agent eval — diagram

```
┌─ The eval pipeline for an agent ──────────────────────────────────────────────────┐
│                                                                                   │
│   Golden test set: [                                                              │
│     { input, expected_trajectory, expected_output },                              │
│     { input, expected_trajectory, expected_output, fail_at_step_3: 'tool_x' },    │
│     ...                                                                            │
│   ]                                                                                │
│                                                                                   │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │ For each test case:                                                       │   │
│   │   1. Run the agent (with iteration cap, budget, mocked tools as needed)  │   │
│   │   2. Compare trajectory vs expected:                                      │   │
│   │      - tool calls: programmatic match                                     │   │
│   │      - trajectory length: count                                           │   │
│   │      - final output: LLM-as-judge or programmatic                         │   │
│   │   3. Score on the four metrics                                            │   │
│   └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   Aggregate: p50 / p99 per metric, regression vs last version.                    │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B planned — Phase 3 builds the eval surface.**

contrl's planned coaching agent eval lives in `tests/agent/`:

- `tests/agent/golden.json` — 20-50 coaching scenarios (workout state, classifier output) with expected trajectory and expected coaching message
- `tests/agent/adversarial.json` — prompt-injection cases (workout notes that try to subvert the agent), tool-failure cases (classifier output missing, expected recovery)
- `tests/agent/run.ts` — harness that runs each case through the agent with mocked tools where needed, scores on the four metrics, writes a report

The metrics for the coaching agent:

1. **Task success rate** — does the coaching message cite the right cue, match user state, avoid recent repetition? LLM-as-judge with a specific rubric.
2. **Tool-call accuracy** — did the agent call `get_classifier_output` first (it should always)? Did it call `get_recent_coaching` before generating a message (always)? Programmatic.
3. **Trajectory efficiency** — average steps per coaching event; target p99 ≤ 6 (cap is 8).
4. **Recovery rate** — when injected tool failures fire, does the agent emit a graceful degraded coaching message or fail catastrophically?

Phase 3 of the curriculum builds this eval before any release.

---

## Elaborate

**Where this pattern comes from.** The agent-eval framing crystallized in 2023-2024 as production teams realized output-only eval missed half the failures. The trajectory-level framing borrowed from RL eval (which also tracks reward trajectories) and integration testing.

**The deeper principle.** The unit of evaluation has to match the unit of execution. For an LLM call, evaluate the output. For an agent loop, evaluate the trajectory. Eval at the wrong scope hides the failures.

**Where this breaks down.** When the golden set drifts from production reality. Mitigation: cycle a fraction of production traces back into the golden set periodically; rebalance the test cases to match the input distribution that actually shows up.

**What to explore next.** [`.aipe/study-ai-engineering/05-evals-and-observability/02-eval-methods.md`](../../study-ai-engineering/05-evals-and-observability/02-eval-methods.md) for the output-quality methods this layers on.

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Trajectory eval                   │ Output-only eval                 │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Failures caught    │ trajectory bugs + output bugs     │ output bugs only                 │
│ Setup cost         │ golden trajectories + harness     │ golden inputs + outputs          │
│ Run cost           │ higher (full agent run per case)  │ lower (single call per case)     │
│ Drift detection    │ cost, latency, step count visible │ output only                      │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 3 — the breakpoint

Trajectory eval is non-negotiable for any agent. Output-only eval is what unit tests look like for an agent — useful but insufficient.

---

## Tech reference (industry pairing)

### LLM-as-judge with cross-family critic

- **Codebase uses:** planned. Anthropic produces; OpenAI judges (or vice versa).
- **Why it's here:** the standard pattern for output-quality scoring with reduced shared-bias risk.
- **Leading today:** cross-family judging — adoption-leading for serious agent eval, 2026.

### Programmatic tool-call grading

- **Codebase uses:** planned. Each tool's typed schema enables programmatic comparison against expected calls.
- **Why it's here:** for structural metrics (tool-call accuracy), programmatic beats LLM judging.

---

## Summary

### Concept recap

Agent eval works at the trajectory level — task success, tool-call accuracy, trajectory efficiency, recovery rate. Output-only eval misses the failures that emerge from the loop. contrl's planned coaching agent eval lives in `tests/agent/` (Phase 3 work): golden scenarios, adversarial cases, four-metric scoring before any release.

### Key points

- The unit of evaluation has to match the unit of execution.
- Four metrics: task success, tool-call accuracy, trajectory efficiency, recovery rate.
- LLM-as-judge with a cross-family judge mitigates shared bias.
- contrl: Phase 3 builds the eval surface; no release before it's in place.

---

## Interview defense

### Likely questions

**[mid] How is agent eval different from LLM eval?**

The unit changes. LLM eval scores one input/output pair; agent eval scores a trajectory — the sequence of tool calls, the observations, the final output. Four metrics: task success rate, tool-call accuracy, trajectory efficiency, recovery rate. Output-only eval misses trajectory bugs.

**[senior] What's contrl's planned agent eval?**

20-50 golden scenarios in `tests/agent/golden.json` — each with a workout state, classifier output, expected trajectory, expected coaching message. Adversarial set with injection cases and tool failures in `tests/agent/adversarial.json`. The harness in `tests/agent/run.ts` runs each case, mocks tool failures where needed, and scores on the four metrics. Phase 3 of the curriculum builds this before any user release.

**[arch] What's the senior signal on agent eval?**

Knowing which metrics belong at the trajectory layer vs the output layer, and using programmatic grading where possible (tool-call accuracy) instead of LLM-as-judge for everything. LLM-as-judge with a cross-family judge is fine for output quality; programmatic comparison is better for structural metrics.

### One-line anchors

- "The unit of evaluation has to match the unit of execution."
- "Output-only eval misses trajectory bugs."
- "Four metrics: task success, tool-call accuracy, trajectory efficiency, recovery."

---

## Validate

**Level 1 — Reconstruct the diagram.** LLM eval (single call) vs agent eval (trajectory).

**Level 2 — Explain in 60s.** What four metrics matter at the trajectory level?

**Level 3 — Apply.** A teammate's agent passes output-quality eval but spends 12 turns per task on average. Walk through which metric catches this and how.

**Quick check.**
- What are the four metrics? — Task success, tool-call accuracy, trajectory efficiency, recovery rate.
- Where does contrl's eval live? — Planned: `tests/agent/`.
- What's the mitigation for the evaluator paradox? — Cross-family judge, programmatic grading where possible, frozen golden trajectories.
