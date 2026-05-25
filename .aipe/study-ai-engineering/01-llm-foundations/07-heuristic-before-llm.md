# Heuristic before LLM

**Industry name(s):** Heuristic-before-LLM, deterministic-first, LLM-as-fallback, rule-then-AI
**Type:** Industry standard

> Try the deterministic answer first; fall back to the LLM only when the heuristic doesn't apply. Saves cost, latency, and reduces the LLM's surface area for bugs. The 80/20 pattern: if a simple rule handles 80% of inputs correctly, the LLM only needs to handle the 20% that genuinely require it. contrl's rep counter (deterministic FSM, no ML) is the canonical example of this discipline applied to its limit.

**See also:** → [01-what-an-llm-is](./01-what-an-llm-is.md) · → [06-token-economics](./06-token-economics.md) · → [06-production-serving/02-llm-cost-optimization](../06-production-serving/02-llm-cost-optimization.md)

---

## Why care

**Move 1.** Your feature classifies user input into a small set of categories. You build an LLM-based classifier. ~$0.001/call. Works fine. Six months in, you notice 70% of inputs match a simple regex pattern — the LLM is doing what a 3-line if/else could handle. You add the heuristic short-circuit: regex check first, LLM fallback for the other 30%. Cost drops 70%. Latency drops 70% (no LLM call when the heuristic hits). Bug surface area drops too — the regex code is testable in isolation.

**Move 2.** That "do I really need an LLM for this" question is what the heuristic-before-LLM pattern answers. Not when to use LLMs. Just: for any LLM-fronted feature, is there a cheap deterministic answer for some fraction of inputs? If yes, route that fraction away from the LLM.

**Why you need to answer that question at all:** Three failures hide in LLM-everywhere designs. First, **paying for what you could compute** — every LLM call for an input a regex would have handled is wasted cost + latency. Second, **bug surface area** — LLMs are non-deterministic; the 80% of cases handled by rules become testable, predictable, debuggable. Third, **incident response** — when the LLM is misbehaving, the heuristic still works; partial functionality during outages.

**Move 5.** Heuristic-before-LLM is what cache-aside is for database access — try the cheap deterministic store first, fall back to the expensive computation only when needed.

---

## How it works

### Move 1 — The mental model

Picture a pipeline:

```
  Input arrives
       │
       ▼
  Heuristic check (deterministic, fast, free)
       │
   ┌───┴───┐
   ▼       ▼
  match    no match
   │       │
   ▼       ▼
  return   call LLM
  result   (slow, costs money)
```

The heuristic is the cheap first-pass; the LLM is the slow expensive fallback. Most inputs hit the heuristic; only the residual reaches the LLM.

Strategy in plain English: **deterministic first, LLM second. Measure heuristic hit rate; if high, expand heuristics; if low, the LLM is genuinely needed.**

---

### Move 2 — The layered walkthrough

#### When heuristics suffice

Patterns where heuristics handle most of the surface:

**1. Simple categorical classification.** "Is this a question, a command, or a statement?" can often be detected by punctuation + keyword prefixes. The LLM is only needed for ambiguous cases.

**2. Structured extraction with regular patterns.** "Extract the date from this text" — if the format is consistent, a regex/parser handles 95%; LLM fallback for the natural-language cases ("next Tuesday", "in a fortnight").

**3. Lookups in fixed sets.** "What category is this exercise?" — if the codebase has a known list, dictionary lookup handles 100%; no LLM needed.

**4. State-machine logic.** Anything with discrete states + transitions: deterministic FSM beats LLM every time on speed, cost, and reliability.

**5. Boolean checks.** "Is this safe content?" — a content-moderation classifier (smaller model or rule set) handles the obvious cases; LLM only for borderline.

---

#### When heuristics don't suffice

Patterns where the LLM is genuinely needed:

**1. Open-ended understanding.** "What does the user actually want?" with novel phrasings.

**2. Subjective quality assessment.** "Is this coaching message helpful?" requires LLM-as-judge or human eval.

**3. Generation from context.** "Write a coaching message tuned to the user's recent form." No heuristic produces personalized prose.

**4. Multi-factor reasoning.** "Should we escalate this entry to a human reviewer?" with many weighted considerations.

For the LLM cases, the discipline still applies inside the LLM call (structured outputs, eval discipline) but the LLM is the right primary tool, not a heuristic.

---

#### The hit-rate metric

For chains with heuristic short-circuit, the load-bearing observability metric is hit rate:

```
  Heuristic hit rate dashboard
  
  ┌─────────────────────────────────────────────────────────────────┐
  │ Chain: intent-classifier                                          │
  │   Heuristic hit:    1247/2000 = 62%                                │
  │   LLM fallback:      753/2000 = 38%                                │
  │   Cost saved:        $1.25 vs all-LLM ($2.00)                      │
  │   Latency saved:    median wait 50ms vs 800ms                     │
  └─────────────────────────────────────────────────────────────────┘
```

A hit rate above 80% suggests the LLM might be removable entirely (the heuristic does most of the work; maybe the residual cases are also solvable without an LLM). A hit rate below 20% suggests the heuristic isn't earning its place (too few inputs benefit).

---

#### Discovery process

How do you find heuristics worth adding?

1. **Read recent LLM outputs.** Look for patterns in what the LLM says — if 60% of outputs are "this is category X," the heuristic for category X exists.
2. **Sample inputs.** Hand-categorize 50 production inputs. Look for cheap-to-detect patterns.
3. **Talk to product / domain experts.** They often know what categories exist before the engineer does.

The heuristic doesn't have to be perfect — it has to be cheaper than the LLM and high-precision (better to be conservative — miss some heuristic-eligible inputs than to claim heuristic for inputs the LLM would have handled differently).

---

### Move 3 — The principle

LLMs are general-purpose tools; heuristics are specialized tools. For any LLM-fronted feature, there's usually a fraction of inputs that doesn't need a general-purpose tool. The discipline: identify that fraction, route around the LLM, fall back to LLM for the residual. Cost, latency, bug surface area all drop. The principle generalizes — anywhere a specialized cheap tool exists, use it before the expensive general-purpose one.

---

## Heuristic-before-LLM — diagram

```
┌─ Input arrives ──────────────────────────────────────────────────────────────┐
│                                                                              │
│   {user_input}                                                               │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Heuristic layer (deterministic, fast, free) ────────────────────────────────┐
│                                                                              │
│   Check 1: empty input?     → return default                                 │
│   Check 2: exact match?     → return cached answer                            │
│   Check 3: regex pattern?   → apply rule                                     │
│   Check 4: fixed enum?      → lookup                                         │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                     heuristic hit          no heuristic match
                          │                       │
                          ▼                       ▼
                   return result            call LLM with full context
                   (0 cost, 0 latency)            │
                                                  ▼
                                            LLM response
                                            (full cost + latency)
                                            
                                            
  Hit rate observability:
    heuristic_hits / total_inputs
    cost_saved vs all-LLM
    latency_saved vs all-LLM
```

---

## In this codebase

**Case A — contrl's rep counter is the canonical instance.**

The rep counter (`src/lib/pose/rep-counter.ts`) is a deterministic FSM consuming joint-angle data from MediaPipe pose. It counts reps without any LLM or trained model. Why this is the right call:

- **The task is well-defined** — count transitions through a small set of states (idle → ready → down → bottom → up).
- **Inputs are structured** — joint angles, not natural language.
- **A deterministic algorithm produces 100% accurate output** — no need for statistical estimation.
- **Latency is critical** — per-frame, ~30 fps. Even a small LLM call would be 100s of ms per frame.

The contrl pre-trained MediaPipe model handles the pose-detection step (which is genuinely ML-shaped because joint detection from pixels is hard). The rep-counting step (which is deterministic) uses heuristics. Two-layer composition: ML for what needs it; deterministic for what doesn't.

**Planned applications of the same discipline:**
- **Coaching agent short-circuit** (B4C.short-circuit, see [06-production-serving/02-llm-cost-optimization](../06-production-serving/02-llm-cost-optimization.md)): if a workout has no form issues and progression is on track, skip the LLM and return a simple default message. Saves cost AND avoids generic "great job!" output when there's nothing specific to coach about.
- **Recommender v1**: rule-based first (B2C.14), trained model only at v2 (B2C.15). The team validates that rules can't handle the task before reaching for a trained model.

**Files exercising the discipline:**
- `src/lib/pose/rep-counter.ts` — pure FSM, no ML
- `src/lib/pose/exercises/pushup.ts`, `squat.ts`, etc. — per-exercise FSM configurations
- `src/lib/recommender/v1.ts` (planned) — rule-based recommender
- `src/lib/agent/should-coach.ts` (planned) — heuristic short-circuit before the coaching agent

---

## Elaborate

**Where this pattern comes from.** Heuristic-first is older than ML — it's the same logic as "try the index before the table scan" in databases or "check the cache before computing." Applied to LLM-fronted features, it crystallized 2023+ as production teams shipped LLM features and noticed the easy cases didn't need them.

**The deeper principle.** Tool fit. LLMs are powerful and expensive; specialized tools are narrow and cheap. Route work to the cheapest tool that does it correctly. The principle scales — same idea behind CDN caching (cheap regional cache before expensive origin), database indexes (cheap index scan before expensive table scan), and even compiler optimization (constant folding before runtime computation).

**Where this breaks down.** Two places.

1. **High-precision requirement on residual.** If the LLM-only 20% of inputs are catastrophic to get wrong, you need the LLM there. The heuristic short-circuits the easy 80%; the LLM still owns the hard 20%.
2. **Heuristic maintenance cost.** Rules drift over time; production inputs change shape; rules that worked yesterday miss tomorrow's variants. The discipline includes periodic review of hit rate and rule adjustment.

**What to explore next.**
- [06-production-serving/02-llm-cost-optimization](../06-production-serving/02-llm-cost-optimization.md) — heuristic is listed as the highest-leverage cost lever.
- contrl's `src/lib/pose/rep-counter.ts` — the canonical implementation.

---

## Tradeoffs

| Cost dimension | Heuristic-before-LLM | LLM-everywhere |
|---|---|---|
| Setup cost | Real (rule design + tests) | Zero |
| Per-call cost | 0 on heuristic hits | Full LLM cost on every call |
| Latency | <10ms on heuristic hits | Hundreds of ms |
| Hit rate maintenance | Real (rules drift) | None |
| Bug surface area | Lower (rules testable in isolation) | Higher (LLM non-determinism on every input) |
| Degraded mode | Works without LLM (rules still fire) | Total failure when LLM is down |

### Sub-block 1 — what we gave up

Engineering effort to design and maintain rules. For complex domains, rule maintenance is real ongoing cost. The eval-set discipline ([05-evals-and-observability/01-eval-set-types](../05-evals-and-observability/01-eval-set-types.md)) helps detect rule drift.

### Sub-block 2 — what LLM-everywhere costs

Documented at scale: every cheap-detectable case paid full LLM cost + latency. At 100K calls/day with 60% of calls heuristic-eligible: $300/day savings ≈ $9000/month. Plus latency benefits, plus bug-surface reduction.

### Sub-block 3 — the breakpoint

Heuristic-first is the right call until: (a) no fraction of inputs is heuristic-eligible (every input genuinely needs the LLM); (b) heuristic maintenance cost exceeds the savings (rare; usually heuristics amortize); (c) the LLM call is so cheap and fast that the heuristic adds friction without benefit (cheap models on simple tasks). For most LLM-fronted features, heuristics earn their place.

### Sub-block 4 — what wasn't actually a tradeoff

"Heuristics can't handle edge cases." Correct, but they're not supposed to — the LLM fallback handles edge cases. The heuristic covers the common, predictable inputs; the LLM covers the rest. Each tool to its strength.

---

## Tech reference (industry pairing)

### contrl's rep counter (the working example)

- **Codebase uses:** `src/lib/pose/rep-counter.ts` — finite state machine, no ML.
- **Why it's here:** the canonical heuristic-before-LLM (or more precisely, heuristic-instead-of-ML) example in this codebase.
- **Leading today:** N/A — project-specific.
- **Why it leads:** at 30 fps, even fast ML is too slow; deterministic FSM is the right tool.
- **Runner-up:** ML-based action recognition for cases where the FSM's assumptions break (extreme angles, occlusion).

### Content moderation classifiers (where applicable)

- **Codebase uses:** Not in contrl.
- **Why it's here:** common heuristic-before-LLM pattern — a small fast classifier filters obviously-safe content, an LLM (or human) handles the gray area.
- **Leading today:** Provider-side safety classifiers (Anthropic, OpenAI built-in) — `adoption-leading` for first-line content filters, 2026.
- **Why it leads:** millisecond latency, zero per-call cost (built into the model call), high precision on obvious cases.

---

## Project exercises

### [B4C.short-circuit] Add heuristic short-circuit before the coaching agent

- **Exercise ID:** `[B4C.short-circuit]` (planned, post-Phase 4)
- **What to build:** `src/lib/agent/should-coach.ts` — a pure function that takes a session's classifier outputs + recommender state + recent coaching and decides whether to call the LLM. Skips the call when all reps were clean, exercises hit target, recommender went as expected, AND recent coaching exists.
- **Why it earns its place:** the highest-leverage cost lever for contrl's coaching agent. Plus the product benefit: avoids generic "great job!" output when there's nothing specific to say.
- **Files to touch:** `src/lib/agent/should-coach.ts` (new); `src/lib/agent/runner.ts` (gated by should-coach).
- **Done when:** synthetic clean session → no LLM call; synthetic flagged session → LLM call.
- **Estimated effort:** `1–4hr`

---

## Summary

Heuristic-before-LLM is the discipline of routing easy inputs around the LLM via deterministic rules. The 80/20 pattern: 80% of inputs often match a cheap pattern; the LLM only handles the residual 20%. Saves cost (full LLM bill on heuristic hits), latency (no API round-trip), and bug surface area (rules are testable in isolation). For contrl: the rep counter is the canonical instance — a deterministic FSM doing work that some teams would (wrongly) reach for ML for.

**Key points:**

- **Deterministic first, LLM second.** Try the cheap path; fall back to the expensive one.
- **80/20 pattern is typical.** Most inputs are easier than the hardest case.
- **Track hit rate.** Above 80% suggests removing the LLM; below 20% suggests the heuristic isn't earning its place.
- **contrl's rep counter** is the prime working example.
- **Planned: `should-coach.ts`** for the coaching agent — skips the LLM when nothing needs coaching.

---

## Interview defense

**[mid] What's heuristic-before-LLM?**

For any LLM-fronted feature, identify the fraction of inputs that doesn't need a general-purpose LLM and route them through cheap deterministic rules. The LLM only handles the residual. Saves cost, latency, and bug surface.

**[senior] How do you decide what's heuristic-eligible?**

Read recent LLM outputs and inputs. Look for patterns. If 60% of outputs are "this is category X" and the input pattern for category X is detectable cheaply, write the rule. Track hit rate; tune over time. Conservative bias — better to miss heuristic-eligible inputs than to claim heuristic for inputs the LLM would have handled differently.

**[arch] How does this scale?**

Heuristic-first scales linearly with input volume; LLM-everywhere scales linearly with volume × per-call cost. At meaningful volumes (>1K calls/day), heuristics save substantial money. Maintenance cost is real but bounded.

---

## One-line anchors

- "Deterministic first; LLM second."
- "80/20 pattern: heuristic for the easy 80%, LLM for the residual 20%."
- "Track hit rate. Above 80% → consider removing the LLM."
- "contrl's rep counter is the canonical heuristic-instead-of-ML example."
- "Bug surface area drops — rules are testable in isolation."

---

## Validate

**Level 1:** Draw the heuristic-then-LLM pipeline.
**Level 2:** "When does heuristic-before-LLM apply?" Under 30 seconds.
**Level 3:** A teammate's LLM-based classifier hits 60% on inputs matching a regex. Walk through the fix. (Add the heuristic; track hit rate.)
**Level 4:** "Why not just always use the LLM?" Defend with cost + latency + bug surface arguments.

**Quick check:**
- contrl's canonical example? (rep counter)
- The cost lever ranking? (heuristic > routing > caching > trim)
- contrl's planned heuristic-before-LLM gate? (`src/lib/agent/should-coach.ts`)
