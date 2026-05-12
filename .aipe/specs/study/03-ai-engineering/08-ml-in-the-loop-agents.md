# ML-in-the-loop agents

**Industry name(s):** ML-in-the-loop agents, classifier-feeding-LLM, model-tool agents
**Type:** Industry standard · Project-specific composition

> Most agents have only LLM-shaped tools (call an API, query a DB, run a search). contrl-mo's planned coaching agent has a *trained model* as one of its tools — the form classifier emits per-rep labels that the LLM reasons over. This is the curriculum's interview-defining pattern.

**See also:** → [01-tool-and-function-calling](./01-tool-and-function-calling.md) · → [04-machine-learning/01-supervised-pipeline](../04-machine-learning/01-supervised-pipeline.md)

---

## Why care

Most candidates' AI portfolios show LLM agents calling APIs. The agent you ship in contrl-mo will show an LLM agent reading the output of a *model you trained* on labeled data. That contrast — generative + discriminative working together — is rare and interview-defining. It's the curriculum's three-shapes story made concrete.

The pattern is **ML-in-the-loop agent** — orchestrating a trained classifier (or recommender, or detector) alongside an LLM. Same shape as systems like content-moderation agents (classifier flags → LLM writes the explanation), medical-triage chatbots (model rates risk → LLM communicates with patient). The combination is what gives the system both fast/deterministic *measurement* and flexible *communication*.

---

## How it works

The trained model handles the discriminative work (labeling each rep's form). The LLM handles the generative work (writing coaching text). The orchestrator gives the LLM access to model outputs via tools.

### The trained model surface

```
Per-rep pose landmarks  →  form classifier  →  { label: 'elbow_flare', confidence: 0.82 }
                                              { label: 'good',         confidence: 0.91 }
                                              { label: 'incomplete_depth', confidence: 0.74 }
```

The classifier (Phase 2C — see [04-machine-learning/01-supervised-pipeline](../04-machine-learning/01-supervised-pipeline.md)) emits a label + confidence per rep. The classifier is deterministic given its inputs (no randomness); same input always produces the same output. It's fast (~10ms on-device).

### The agent's tools include model outputs

```typescript
{
  name: 'get_classifier_output',
  description: 'Returns the form classifier labels and confidences for the last N sets in the current category.',
  input_schema: { type: 'object', properties: { category: ..., limit: ... } },
}
```

The LLM calls this tool, gets back a list of `{ label, confidence }` per rep. The model reads the list and reasons about it: "I see 3 reps labeled `elbow_flare` with confidence > 0.8 — that's a consistent pattern, worth coaching".

### Why this is interview-defining

Most candidates' agents have only LLM-shaped tools. The agent equivalent of a SQL `SELECT` — fetching raw data, running an API call. An agent with a *trained model* as a tool has more shape: deterministic feature extraction feeding a generative-text decision. The combination demonstrates:

- You can train a discriminative model.
- You can orchestrate a generative model.
- You understand which one to use for which job.

That triple is uncommon. It maps to the curriculum's "three shapes" interview story explicitly.

### Move 2.5 — Where it differs from "agent + API tool"

A classifier-tool is different from an API-tool in three ways:

1. **Deterministic output.** Same input → same output. Easier to reason about and test.
2. **Compute-bound, not network-bound.** Latency is your model's inference time (~10ms), not a network round-trip (~100–500ms).
3. **Schema is tight.** The output space is enumerated (label union type, confidence in [0, 1]), so the LLM's reasoning is constrained.

The orchestration is *easier* than with API tools — fewer error modes, faster, cleaner schemas. The training pipeline (Phase 2C) is harder than calling an API. The total cost is roughly the same; the cost shifts upstream.

### Move 3 — The principle

Discriminative and generative models solve different problems. Discriminative: "given X, what is it?" (classifier, ranker, detector). Generative: "given X, what comes next?" (LLM, image generator). Most interesting systems use both — discriminative for measurement, generative for communication. Combining them is the modern AI-engineering shape that distinguishes "I used an API" from "I shipped a system".

The full picture is below.

---

## ML-in-the-loop — diagram

```
┌─ Per-rep pose data (during workout) ─────────────────────────────────────────┐
│                                                                              │
│   pose landmarks (33 × {x,y,z,visibility})                                   │
│       │                                                                      │
│       ▼                                                                      │
│   feature extraction (joint angles, ROM, asymmetry, ...)                     │
│       │                                                                      │
│       ▼                                                                      │
│   classifier inference  ──►  { label, confidence }                           │
│       │                                                                      │
│       ▼                                                                      │
│   per-rep log row (SQLite)                                                   │
│                                                                              │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  │  session ends, shouldCoach() gates
                                  ▼
┌─ Agent loop ─────────────────────────────────────────────────────────────────┐
│                                                                              │
│   LLM (Claude) ──► tool_use { name: 'get_classifier_output', ... }           │
│         │                                                                    │
│         ▼  orchestrator dispatches                                           │
│                                                                              │
│   classifier_outputs from SQLite  ──►  tool_result                           │
│         │                                                                    │
│         ▼                                                                    │
│   LLM reasons over the labels                                                │
│         │                                                                    │
│         ▼                                                                    │
│   final coaching string                                                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

                discriminative                       generative
              ────────────────                      ────────────────
              fast, deterministic                   slower, stochastic
              per-rep labels                         per-session text
              bounded output space                  unbounded output space
              measurement                            communication
```

---

## In this codebase

**Not yet implemented.** Phase 4 Path C of the curriculum, depends on Phase 2C work.

Expected paths:
- Classifier outputs → `classifier_outputs` table (Phase 2C dependency)
- Tool surface → `src/services/ai/tools.ts` (new) — `get_classifier_output(category, limit)`
- Agent → `src/services/ai/agent.ts` (new) — reads classifier output, generates coaching

The agent's full power emerges only after the classifier is trained and shipping reliable labels.

---

## Elaborate

### Where this pattern comes from

Discriminative-fed-into-generative is older than LLM agents — recommender systems with explanation generation, fraud detection with risk-message templates. LLMs made the generative half easier to ship at scale. The agent loop is the modern way to compose them: classifier as a tool, LLM as the orchestrator. It's the pattern Andrej Karpathy described as "Software 1.0 + Software 2.0 collaborating".

### The deeper principle

Pick the model for the job. Discriminative models are right for "label, score, rank". Generative models are right for "explain, communicate, plan". Trying to make either do the other's job is wasteful — discriminative models can't write English explanations gracefully; generative models can't reliably produce calibrated confidence scores. Use both; let each do what it's best at.

### Where this breaks down

When the classifier's confidence is unreliable. If the classifier outputs `confidence: 0.6` on most reps regardless of actual form quality, the LLM has noise to reason over. Calibration ([04-machine-learning/08-calibration](../04-machine-learning/08-calibration.md)) is the upstream fix.

The other breakpoint: when the LLM hallucinates patterns the classifier didn't report. "I see elbow_flare on 3 reps" when actually the classifier reported 0 — the LLM might invent because the prompt context made it seem likely. Mitigation: prompt explicitly with "only describe what the classifier reported".

### What to explore next

- [04-machine-learning/01-supervised-pipeline](../04-machine-learning/01-supervised-pipeline.md) → the classifier this depends on
- [04-machine-learning/08-calibration](../04-machine-learning/08-calibration.md) → why confidence matters
- [01-tool-and-function-calling](./01-tool-and-function-calling.md) → how the classifier becomes a tool

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
│ Cost dimension     │ Classifier + LLM agent (planned) │ LLM-only on raw landmarks (alt)  │
├────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
│ Inference cost     │ Cheap (10ms classifier)          │ Expensive (LLM tokens on raw)    │
│ Reliability        │ Calibrated labels                │ LLM may hallucinate              │
│ Training surface   │ Real ML pipeline                 │ Just prompt engineering           │
│ Interview signal   │ Three shapes (discrim + gen + ML)│ Just LLM                          │
│ Maintenance        │ Two models to keep aligned        │ One                               │
│ Confidence handling│ Native                            │ LLM has to estimate confidence    │
└────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what we give up (planned)

Maintaining two models. The classifier needs retraining as the user's data accumulates ([04-machine-learning/19-retraining-pipelines](../04-machine-learning/19-retraining-pipelines.md)); the LLM prompt needs updating as the classifier's output space evolves. Coordinating both is more work than maintaining only an LLM.

### Sub-block 2 — what LLM-only would cost

Sending raw landmark series to an LLM and asking it to "tell me if the form was good" is theoretically possible. In practice: huge prompts (tens of thousands of floats per set), high cost per call, unreliable output (LLMs don't have a strong prior on "elbow angles indicating flare"). The discriminative classifier does the data-to-label translation cheaply and reliably; the LLM does the label-to-coaching translation cheaply and well. Each on its strength.

### Sub-block 3 — the breakpoint

Fine until *real-time* coaching becomes a feature. The classifier can run per-frame (~30fps); the LLM cannot. For end-of-set coaching the latency is fine. For per-rep coaching during the set, the LLM step is too slow — would need pre-computed coaching templates dispatched by classifier output.

### Sub-block 4 — what isn't a tradeoff

A fine-tuned LLM that "understands pose" without a classifier was not a real option — there's no LLM trained on pose landmarks; training one would be a multi-million-dollar project and would still be worse at the narrow task than a dedicated classifier.

---

## Tech reference (industry pairing)

### Trained classifier as agent tool

- **Codebase uses:** Not yet implemented. Planned classifier in Phase 2C with `classifier_outputs` table, surfaced via `get_classifier_output` tool.
- **Why it's here:** the canonical "Software 1.0 + 2.0 collaboration" shape.
- **Leading today:** ML-in-the-loop agents — `innovation-leading` for production AI systems, 2026.
- **Why it leads:** the discriminative-generative split is the most reliable way to get both speed and flexibility.
- **Runner-up:** Multi-modal LLMs reading raw sensor data — `innovation-leading` long-term; not yet cheap or reliable enough for this scope.

### LightGBM or scikit-learn (planned)

- **Codebase uses:** Not yet. Planned for Phase 2C classifier training.
- **Why it's here:** the model that produces the labels the agent reads.
- **Leading today:** XGBoost / LightGBM — `adoption-leading` for tabular classification, 2026.
- **Why it leads:** best per-tree split discovery, fastest inference, well-supported on-device.
- **Runner-up:** Logistic regression baseline — `adoption-leading` for the first-pass baseline before reaching for trees.

---

## Project exercises

### [B4C.1] + [B2C.6] together: classifier feeds agent

- **Exercise ID:** `[B4C.1]` plus `[B2C.6]` and `[B2C.7]`
- **What to build:** End-to-end demo: a workout ends, classifier outputs per-rep labels, `shouldCoach` returns true, agent fetches `get_classifier_output`, generates a coaching message, displays in UI.
- **Why it earns its place:** the demo that proves you can ship the integrated system. Three shapes (CV + ML + LLM) in one path.
- **Files to touch:** `src/services/ml/classifier.ts` (new — wrapper around the trained model), `src/services/ai/tools.ts`, `src/services/ai/agent.ts`, UI surface in `app/log/[category]/result.tsx`.
- **Done when:** integration test runs a fixed pose sequence through the full pipeline and the coaching string contains a reference to the predicted failure mode.
- **Estimated effort:** ≥1 week (depends on Phase 2C completion)

---

## Summary

### Concept recap

The planned coaching agent treats a trained form classifier as one of its tools. The classifier (Phase 2C) emits per-rep `{label, confidence}` outputs deterministically and cheaply. The LLM agent (Phase 4 Path C) calls `get_classifier_output` as part of its reasoning, then generates coaching grounded in the labels. The combination is what makes the agent both *measurable* (classifier outputs are calibrated and bounded) and *communicative* (LLM produces fluent natural language). The constraint forcing this design was: LLMs are bad at "is this elbow flare?"; trained classifiers are great at it and bad at "how do I phrase the advice?". Each does what it's best at.

### Key points

- Discriminative model: per-rep labels with confidence.
- Generative model: per-session coaching text.
- Classifier output becomes an agent tool.
- This is the curriculum's interview-defining "three shapes" payoff.

---

## Interview defense

### What an interviewer is really asking

Behind "what's special about your agent" is "do you understand that a generative LLM and a discriminative classifier are different tools for different jobs, and have you put them together correctly?" The signal is whether you can name *both* models' roles cleanly and justify the orchestration choice.

### Likely questions

**Q: How does the LLM know the user's form was bad?  [mid]**
A: The form classifier — a trained model that takes pose landmarks and emits per-rep labels like `elbow_flare` with a confidence score — produces a per-rep log row. The LLM agent calls `get_classifier_output(category)` as a tool; the orchestrator returns the recent labels; the LLM reasons over them and generates coaching. The classifier does the seeing; the LLM does the explaining.

**Q: Why not let the LLM look at raw pose data?  [senior]**
A: Two reasons. Cost: raw landmark series is tens of thousands of floats per set; sending that to an LLM is expensive and slow. Reliability: LLMs don't have strong priors on biomechanics; they'd hallucinate failure modes that aren't there. The classifier is trained on labeled examples, so it's both cheap (~10ms inference) and calibrated. The LLM gets a low-dimensional, semantically-meaningful representation of what happened.

**Q: How does training the classifier change the agent's behavior over time?  [arch]**
A: Each retraining round shifts the label distribution slightly. If we retrain the classifier monthly with new self-labeled data, its outputs may become more confident on common patterns and detect new failure modes that didn't exist in the initial label set. The agent doesn't need to change — same tool, evolving output. The risk is a new label the prompt doesn't know about; mitigation is keeping the label union in sync with the prompt's instructions on what to coach for.

```
   classifier v1                  classifier v2
   ─────────────────              ─────────────────
   labels: {good, elbow_flare,    labels: + {head_drop, ...}
            incomplete_depth,
            back_arch, hip_sag}
                                  agent prompt must know about new labels
                                  or it'll see them and not act
```

### The question candidates always dodge

**Q: What if the classifier's confidence is poorly calibrated — say it reports 0.8 confidence on actually-wrong labels?**
A: The LLM has no way to know. It treats `confidence: 0.8` as "high confidence". The fix is calibration ([04-machine-learning/08-calibration](../04-machine-learning/08-calibration.md)): use Platt scaling or isotonic regression on a held-out set to align predicted probability with actual frequency. After calibration, "0.8 confidence" actually means ~80% of those predictions are right. Without calibration, the agent's coaching is built on garbage confidence numbers, and the user sees confident-sounding but wrong advice.

```
   Uncalibrated                    Calibrated (planned)
   ───────────────────────        ───────────────────────
   conf 0.8 = "high"              conf 0.8 = ~80% accurate
   could be 50% accurate          known reliability
   LLM treats as certain          LLM has real signal
```

### One-line anchors

- Discriminative for measurement; generative for communication.
- The classifier sees; the LLM explains.
- Three shapes in one path: CV → ML → LLM.
- Calibration is the bridge between model confidence and agent reasoning.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the data flow from pose landmarks to coaching text.

### Level 2 — Explain it out loud
Why use a trained classifier instead of asking the LLM to read pose data? Under 90 seconds.

### Level 3 — Apply it to a new scenario
"Add a tool that surfaces nutrition logs (from a user-typed text). What kind of model fits there?"

### Level 4 — Defend the decision you'd change
"Would you ever skip the classifier and just use a multi-modal LLM on pose data?" When?

### Quick check — code reference test
- What's the planned classifier-output table?
- What tool surfaces it to the agent?
- Which curriculum phase trains the classifier?

Then verify.
