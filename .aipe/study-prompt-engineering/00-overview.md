# Prompt engineering — overview

> The discipline of treating prompts as production engineering artifacts: structured, versioned, observed, evaluated, and constrained. Not "ten prompts that changed my life" — the working practice that produces LLM systems that survive a model upgrade.

```
┌─ Operational discipline (the boring half) ─────────────────────────────────┐
│                                                                            │
│  01 anatomy           ──▶  every prompt has named sections; mixing them is │
│                            how prompts drift                                │
│  02 structured-outputs ──▶  tool calling + schema validation + retry on   │
│                            schema fail; "respond only in JSON" is 2022    │
│  03 prompts-as-code    ──▶  prompts live in version control; diff'd,      │
│                            reviewed, and paired to a model version        │
│  04 token-budgeting    ──▶  count tokens before you ship; the 80% rule;   │
│                            lost-in-the-middle is real                     │
│  05 eval-driven-iteration ──▶ a junior iterates by vibes; a senior iterates │
│                            against a fixed eval set with regression tests  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼  (techniques layer on top of discipline)
┌─ Specific techniques (when each one earns its place) ──────────────────────┐
│                                                                            │
│  06 single-purpose-chains  ──▶  one chain one job; debugging localises;   │
│                                model routing becomes possible             │
│  07 output-mode-mismatch    ──▶  every chain has one declared output mode; │
│                                violating it is the bug                    │
│  08 few-shot                 ──▶  3–5 good examples beats 20 mediocre;   │
│                                examples constrain more than instructions  │
│  09 chain-of-thought         ──▶  reasoning in the output, not free-form  │
│                                prose; less needed on frontier models      │
│  10 self-critique            ──▶  2–5x token cost for one extra step of   │
│                                reliability; diminishing returns are real  │
│  11 meta-prompting           ──▶  LLMs drafting prompts for other LLM     │
│                                calls; meta-tooling pattern                 │
│  12 prompt-injection-defense ──▶  hierarchies + delimiters + structured   │
│                                output; not solved, layered                │
│  13 forbidden-patterns       ──▶  generative chains converge on phrasings; │
│                                rotation is the lever                      │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## What each concept gets wrong if you skip it

The one-line production failure each concept exists to prevent.

- **01 anatomy** — mixing per-call content into the system prompt; the cache invalidates and your latency doubles.
- **02 structured-outputs** — relying on "respond only in JSON" in the prompt text and watching the model courteously wrap the JSON in a markdown code fence after a model upgrade.
- **03 prompts-as-code** — the prompt that worked in Sonnet 3 stops working in Sonnet 4 and you have no record of what changed when.
- **04 token-budgeting** — a chain that works on small inputs starts truncating at scale because nobody counted tokens.
- **05 eval-driven-iteration** — six months of "the response feels better now" iteration with no measurable progress; a regression that ships because the eval set didn't cover it.
- **06 single-purpose-chains** — a chain that does three things failing in production with no signal about which thing failed.
- **07 output-mode-mismatch** — chain A returns JSON, chain B expects markdown; parser breaks in prod after passing in dev.
- **08 few-shot** — 20 mediocre examples that conflict with each other and ship instead of 3 good ones; the model hedges.
- **09 chain-of-thought** — CoT bolted onto a structured-output chain; reasoning leaks into the JSON and breaks the parser.
- **10 self-critique** — burning 3x token budget on critique that catches none of the actual failure modes (because the critique has the same blind spots as the generator).
- **11 meta-prompting** — production prompts that read like LLM output instead of engineering specs; nobody can debug them.
- **12 prompt-injection-defense** — user input containing "ignore previous instructions and..." reaches a tool-calling LLM that has real side effects.
- **13 forbidden-patterns** — every generated caption in your app opens with "In a fast-paced world where..." and your users notice within a week.

## Reading order

1. **Read 01–05 first, in order.** The operational discipline. None of the techniques in 06–13 work without this foundation. A senior who hasn't internalized 03 (prompts-as-code) and 05 (eval-driven iteration) is going to ship the same bugs no matter how many techniques they know.
2. **Then 06–13, in any order you like.** They're techniques. Read what matches a problem you're solving now. They cross-reference each other where the interaction matters.

## What's deliberately out of scope

- **Vendor-specific syntax quirks** (XML tags being Anthropic-leaning, specific JSON-mode syntax for OpenAI). These appear *inside* concept files under Tech reference, not as their own concepts.
- **Tree of Thoughts** and academic prompt research. Not yet production practice.
- **Constitutional AI** / alignment-style prompting. Different discipline.
- **Vision / multi-modal prompting.** Not in scope for this version.
- **Jailbreak research from the attacker side.** The defender side is in 12.
- **History of the field.** This is a working reference, not a textbook.

## How this guide is anchored to contrl

contrl ships no LLM code today. The planned Phase 4 Path C coaching agent will be the first LLM consumer. Most concepts in this guide are **Case B for contrl** — concepts described, with planned applicability noted under "In this codebase" sections.

The exceptions where contrl has Case A or substantial Case A planning:
- **02 structured-outputs** — the coaching agent's tool_use schema (planned).
- **05 eval-driven-iteration** — Case A for the planned Phase 2C/3 ML evals (B3.8, B3.9 explicitly).
- **12 prompt-injection-defense** — the coaching agent's read-only tool allowlist is a Case A design decision (the tools are scoped read-only specifically to bound damage scope from any injection that gets through).

Other concepts (single-purpose chains, output-mode-mismatch, self-critique, meta-prompting, forbidden patterns) are study material — they teach the discipline; contrl's current scope doesn't exercise them.

→ Index: [README.md](./README.md)

---
Updated: 2026-05-24 — Reframed overview per v1.38.0 per-repo scope. Added codebase-anchoring section; removed aipe-as-worked-example claim.
