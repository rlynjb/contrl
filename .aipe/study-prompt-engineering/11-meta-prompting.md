# Meta-prompting

**Industry name(s):** Meta-prompting, prompt generation, LLM-authored prompts, prompt-of-prompts
**Type:** Industry standard

> Using an LLM to write or improve prompts for another LLM call. Saves time on initial drafting of complex prompts; backfires when used for small tweaks or under high iteration pressure. The cleanest worked example is meta-tooling like aipe — slash-command specs that ARE prompts that produce other prompts. contrl is a *consumer* of meta-prompting (this study guide was generated via `/aipe:study-prompt-engineering`), not a producer; contrl ships no meta-prompting code of its own.

**See also:** → [03-prompts-as-code](./03-prompts-as-code.md) · → [01-anatomy](./01-anatomy.md) · → [05-eval-driven-iteration](./05-eval-driven-iteration.md)

---

## Why care

**Move 1.** You're starting a new LLM feature. The chain has 8 categorical labels, a confidence score, and a "reasoning" field. The system prompt needs to cover the categories, the schema, edge cases, what to do when input is ambiguous. You stare at a blank file. Two hours later you have a draft that's probably mostly right but missing a few cases you forgot about. You ship it. Three weeks later the eval suite says you missed two edge cases and one category label phrasing was wrong.

**Move 2.** That "give me a first draft of a complex prompt I can edit, instead of starting blank" question is what meta-prompting answers. Not prompt quality. Not eval-driven iteration. Just the bootstrapping step: you describe the task to an LLM, the LLM drafts the prompt, you review and edit, the edited prompt enters the codebase. The LLM is faster at writing the boilerplate sections (schema definitions, category descriptions, fallback instructions) that you'd write the same way regardless; you're faster at the bespoke parts (the specific business logic, the edge cases your product cares about).

**Why you need to answer that question at all:** Two patterns benefit from meta-prompting and two don't. The benefit shows up in **initial drafting** — going from blank file to "first draft I can iterate on" — and in **boilerplate scaffolding** — schema descriptions, formatting instructions, standard rubric sections. The backfire shows up in **small tweaks** — asking an LLM to "make this prompt better" produces vague restructuring that's slower than just editing the specific thing; and in **high-iteration tasks** — when you're going to iterate the prompt 20 times against an eval suite, the LLM's draft is overhead you pay once that doesn't compound.

**Before / after.**

Without meta-prompting (starting blank):
- 2 hours to first draft of a complex prompt. Half the time is mechanical (writing the schema description), half is bespoke (the business logic).
- Three iterations on the prompt over the next week as you discover missed cases.

With meta-prompting (LLM drafts first):
- 20 minutes to first draft. You describe the task; the LLM produces the boilerplate; you edit in the bespoke parts.
- Three iterations on the prompt over the next week (same — meta-prompting saves drafting time, not iteration time).
- Net savings: ~90 minutes on the first prompt; smaller savings on subsequent ones (you have a template now).

Where it backfires:
- "Improve this prompt" requests. The LLM rewrites the whole thing structurally; you have to translate the rewrite back into your specific changes. Net negative.
- High-iteration prompts where you're tuning specific phrasing against an eval set. The LLM's general-purpose advice doesn't move your eval needle.

**Move 5.** Meta-prompting is what a code-generation tool is for application code — fast for scaffolding, useless for surgical edits. Use it where the boilerplate dominates; skip it where the bespoke dominates.

---

## How it works

### Move 1 — The mental model

Think of using ChatGPT to draft a `package.json` for a new project. You describe what you want ("Next.js app, TypeScript, ESLint, Vitest, Tailwind"), get a draft, edit the parts that matter for your specific stack, commit. You wouldn't ask ChatGPT to write a one-line fix to an existing package.json — that's surgical, you'd just edit. The first task is scaffolding; the second is editing.

Meta-prompting is the same. Use an LLM to scaffold a new prompt; edit existing prompts by hand.

The strategy in plain English: **describe the task to a prompt-drafting LLM, get a draft, edit, commit. Use the LLM for scaffolding, not for surgical edits.**

```
  Meta-prompting workflow (the scaffolding analogy)

  ┌──────────────────────────────────────────────────────────┐
  │ Human writes goal (the task description)                  │
  │   "I need a system prompt for an intent classifier        │
  │    with 3 labels: chat, search, command. The output       │
  │    must be JSON with label and confidence. Edge case:      │
  │    if input is empty, return chat with low confidence."    │
  └────────────────────────────┬─────────────────────────────┘
                               │ goal
                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │ LLM drafts the prompt                                     │
  │   Produces a complete system prompt:                       │
  │   - role definition                                        │
  │   - 3-label description                                    │
  │   - schema declaration                                     │
  │   - edge-case instructions                                 │
  │   - format examples                                        │
  └────────────────────────────┬─────────────────────────────┘
                               │ draft
                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │ Human reviews and edits                                   │
  │   - Catches subtle issues                                 │
  │   - Tightens specific phrasings                           │
  │   - Adds business-specific edge cases                     │
  │   - Removes generic boilerplate the LLM added             │
  └────────────────────────────┬─────────────────────────────┘
                               │ edited draft
                               ▼
  ┌──────────────────────────────────────────────────────────┐
  │ Commit to version control                                 │
  │   Now the prompt is source code under the                  │
  │   prompts-as-code discipline (see file 03).                │
  └──────────────────────────────────────────────────────────┘
```

The LLM does the mechanical drafting; the human does the bespoke editing. Both contribute; neither replaces the other.

---

### Move 2 — The layered walkthrough

#### When meta-prompting earns its keep

Two patterns benefit clearly:

1. **New complex prompts.** A system prompt with 8 categories, a schema, multiple edge cases. The LLM drafts the structural boilerplate (schema description, category list, format examples) quickly; you edit the bespoke parts. Net time saved: 60–90 minutes per complex prompt.

2. **Boilerplate sections of existing prompts.** Adding a new field to a schema; expanding category lists; writing format-example sections. The LLM produces consistent boilerplate fast.

Two patterns where it backfires:

1. **"Improve this prompt" requests.** "Make this prompt better" produces vague restructuring. The LLM rewrites sentences, reorders sections, adds caveats — none of which targets the actual issue. If you have a specific failure to fix, edit the specific lines yourself.

2. **High-iteration prompts under eval pressure.** When you're iterating against an eval suite, the eval results tell you what to change; the LLM's general advice doesn't. Meta-prompting at this stage is overhead.

```
  Meta-prompting cost/benefit

  ┌─────────────────────────────────────────┬──────────────────────────┐
  │ Task                                    │ Meta-prompting?           │
  ├─────────────────────────────────────────┼──────────────────────────┤
  │ Initial draft of a complex prompt       │ Yes — large time saving   │
  │ Adding boilerplate (schema, examples)   │ Yes — modest saving       │
  │ "Make this prompt better"               │ No — produces vague rewrite │
  │ Tuning a specific phrasing              │ No — surgical edit yourself │
  │ Iterating against an eval suite         │ No — eval tells you what  │
  │                                         │      to change            │
  └─────────────────────────────────────────┴──────────────────────────┘
```

Boundary condition: the larger the prompt and the more standard the structure, the more value meta-prompting offers. A 500-token complex system prompt benefits; a 50-token simple classifier prompt doesn't.

---

#### The drafting prompt

The prompt you give the meta-LLM matters. Vague request → vague draft.

```
  Vague meta-prompt (produces vague draft)
  ──────────────────────────────────────────────────────────
  "Write a system prompt for an intent classifier."

  Produces:
    "You are an intent classifier. Classify the user's input
     into the appropriate category and return your response."

  → Useless. No schema, no categories, no edge cases.
```

```
  Specific meta-prompt (produces useful draft)
  ──────────────────────────────────────────────────────────
  "Write a system prompt for an intent classifier that:
   - Takes journal-style text as input
   - Returns one of 3 labels: chat, search, command
   - Returns a confidence 0.0–1.0
   - Returns JSON matching the schema:
       { label: 'chat' | 'search' | 'command', confidence: number }
   - For empty input, returns { label: 'chat', confidence: 0.3 }
   - For ambiguous input, prefers chat with lower confidence
   - Never wraps the JSON in markdown code fences
   - Follows the format example:
       Input: 'What did I write Tuesday?'
       Output: { 'label': 'search', 'confidence': 0.95 }"

  Produces:
    A draft that addresses each constraint with appropriate
    structure. ~80% usable; you edit the rest.
```

If you're coming from frontend, this is the same shape as a well-specified ticket vs an ambiguous one — the LLM is your scaffolder, and a clear spec produces a clear draft.

Boundary condition: the more you constrain the meta-prompt, the closer the draft is to what you'll ship. Over-constraining (>500 tokens of specs) defeats the time saving; under-constraining (<50 tokens) produces useless output. Sweet spot: 100–300 tokens of clear constraints.

---

#### Iteration pattern: human drafts the SHAPE, LLM fills in BODY

A useful refinement: rather than have the LLM draft the whole prompt from scratch, have the human draft the SHAPE (section headers, schema, key constraints) and the LLM fill in the body of each section.

```
  Human writes the shape:

  # System prompt for intent classifier

  ## Role
  [LLM: write 1-2 sentence role description]

  ## Categories
  - chat: [LLM: 1-2 sentence description with example]
  - search: [LLM: 1-2 sentence description with example]
  - command: [LLM: 1-2 sentence description with example]

  ## Edge cases
  - Empty input: return { label: 'chat', confidence: 0.3 }
  - Ambiguous: [LLM: write 1-2 sentence instruction]

  ## Output format
  [LLM: format declaration with one example]
```

The LLM fills in each `[LLM: ...]` placeholder. The human owns the structure; the LLM owns the prose. Net: you get the time savings on prose drafting while keeping full control over structure.

Boundary condition: this pattern works best when you've already standardized prompt structure across your chains (which is what [03-prompts-as-code](./03-prompts-as-code.md) drives toward). Without standardized structure, the human still has to think about structure, defeating the savings.

---

#### Meta-prompting and aipe

aipe is the worked example. The slash-command specs in `/Users/rein/Public/aipe/specs/` are prompts that produce other prompts (or prompt-shaped outputs).

- **`/aipe:refactor <intent>`** — the user types an intent; the spec instructs Claude Code to produce a refactor spec file (which is itself a prompt for the next agent action).
- **`/aipe:study`** — the spec instructs Claude Code to produce a study guide (concept files), where the concept files are content but written in a prompt-engineering-aware style.
- **`/aipe:study-prompt-engineering`** (the spec generating THIS file) — the canonical meta-prompt: a spec that generates 14 prompt-engineering study files.

The recursive shape is what makes aipe meta-prompting. The specs aren't generic "help me write a prompt" — they're tightly constrained scaffolds that produce specific structured outputs, which themselves are prompts or prompt-shaped artifacts.

```
  Meta-prompting hierarchy in aipe

  ┌──────────────────────────────────────────────────────────┐
  │ Layer 1: human writes a slash-command spec               │
  │   /Users/rein/Public/aipe/specs/study.md                  │
  │   (the spec is the meta-prompt)                           │
  └──────────────────────────────────────────────────────────┘
                              │
                              ▼ user invokes /aipe:study
  ┌──────────────────────────────────────────────────────────┐
  │ Layer 2: Claude Code follows the spec                    │
  │   produces study-guide files matching the spec's          │
  │   per-concept template                                   │
  └──────────────────────────────────────────────────────────┘
                              │
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │ Layer 3: the study-guide files are themselves            │
  │   prompt-engineering reference material                  │
  │   (used by humans to write better prompts in their own    │
  │    codebases)                                            │
  └──────────────────────────────────────────────────────────┘
```

This is meta-prompting taken seriously: a structured prompt produces structured prompts (or prompt-aware content). The discipline that makes it work is the rigid spec format — without the per-concept template enforcement (Subtitle, Why care, How it works, etc.), the output would drift into generic content.

Boundary condition: meta-prompting only works at this depth when the meta-prompt is well-structured. aipe's specs are 100–2000 lines each because the structure is load-bearing. A casual "write me a prompt that writes prompts" doesn't produce useful output.

---

### Move 2.5 — Current state vs future state

aipe today is meta-prompting at the slash-command level. The future could push it deeper.

```
              Phase A (now)                        Phase B (could exist)
              aipe at slash-command depth          aipe at prompt-evolution depth
  ───────────────────────────────────         ───────────────────────────────────
  ┌──────────────────────────────┐            ┌──────────────────────────────────┐
  │ Slash commands generate       │            │ Slash commands also iterate      │
  │ specs and study guides.        │            │ on existing prompts:              │
  │                                │            │   /aipe:tune <prompt>             │
  │ Human writes the spec.         │            │   reads the prompt + eval set;    │
  │ Human reviews output.          │            │   proposes targeted edits;         │
  │                                │            │   human approves each edit.       │
  │                                │            │                                  │
  │ No automated prompt-iteration. │            │ Human still owns the structure;   │
  │                                │            │ LLM does targeted edits.           │
  └──────────────────────────────┘            └──────────────────────────────────┘
                                                                                   
  Today: meta-prompting at template depth.    Could-be: meta-prompting at edit depth.
                                              Requires eval suite to verify changes.
```

The lesson: meta-prompting depth tracks the maturity of the surrounding discipline. Without eval suites, an "auto-tune" meta-prompt produces unverified changes that look fine and may regress. With eval suites, the same meta-prompt becomes a real productivity tool.

---

### Move 3 — The principle

Meta-prompting is the LLM equivalent of code generation — useful for scaffolding new artifacts, useless for surgical edits to existing ones. The discipline that distinguishes useful meta-prompting from useless: clear constraints in the drafting prompt, human ownership of structure, LLM ownership of boilerplate prose, and review-then-commit before the draft becomes the prompt. Used right, it saves real time on initial drafts; used wrong (vague "make this better" requests), it produces vague restructuring that's slower than just editing.

The full picture is below.

---

## Meta-prompting — diagram

The drafting workflow, the boundary between human and LLM responsibilities, and the maturity ladder.

```
┌─ Human-owned (always) ───────────────────────────────────────────────────────┐
│                                                                              │
│   Goal description                                                           │
│     - What the prompt does                                                   │
│     - What input it takes                                                    │
│     - What output it produces                                                │
│     - What edge cases matter                                                 │
│     - What format constraints apply                                          │
│                                                                              │
│   Structure                                                                  │
│     - Section headers                                                        │
│     - Schema declaration                                                     │
│     - Mandatory constraints                                                  │
│                                                                              │
│   Final review and edit                                                      │
│     - Tighten phrasings                                                      │
│     - Remove LLM boilerplate                                                 │
│     - Add bespoke business logic                                             │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ drafting prompt
                                      ▼
┌─ LLM-owned (drafting only) ──────────────────────────────────────────────────┐
│                                                                              │
│   Prose body of each section                                                 │
│     - Role description                                                       │
│     - Category descriptions                                                  │
│     - Format examples                                                        │
│     - Default fallback instructions                                          │
│                                                                              │
│   Boilerplate sections                                                       │
│     - Schema descriptions                                                    │
│     - Standard rubric language                                               │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ draft
                                      ▼
                            human reviews and edits
                                      │
                                      ▼
                            commit to version control
                                      │
                                      ▼
                  enters prompts-as-code discipline
                       (file 03 takes over)
```

The boundary between human and LLM ownership is the discipline. Humans own structure and review; LLMs own boilerplate prose generation. Crossing the boundary (LLM owns structure; humans don't review) is where meta-prompting backfires.

---

## In this codebase

**Case B — contrl consumes meta-prompting; contrl does not produce it.**

This study guide itself is a meta-prompting artifact: `/aipe:study-prompt-engineering` is a spec (a prompt) that produces the 14 files in `.aipe/study-prompt-engineering/` (which are content but written in a prompt-engineering-aware style — themselves prompt-shaped). The same is true of `.aipe/study-ai-engineering/`, `.aipe/study-system-design-dsa/`, and `.aipe/audit-refactor-ml-workout/`. All four were generated against aipe specs.

But these are **artifacts in the repo**, not **code that contrl ships**. The runtime code in `src/` (pose detection, rep counter, eventually the coaching agent) doesn't use meta-prompting at all. The distinction matters because the concept is often confused with "any LLM-assisted authoring":

- **Meta-prompting (what aipe does):** a structured spec that, when executed by an LLM agent, produces specific prompt-shaped artifacts. Rigid template, named constraints, worked examples. Reproducible.
- **LLM-assisted authoring (what every codebase does):** a developer using an LLM in their IDE to draft code/prose. Ad-hoc, conversational, not reproducible.

contrl uses the second one daily (any TypeScript developer in 2026 does). contrl does not use the first one for shipping code — there's no `/contrl:tune` slash command, no spec that generates the coaching agent's system prompt programmatically.

**Where meta-prompting would earn its place in contrl (deferred):**

1. **First-draft of the coaching agent's system.md.** When Phase 4 begins, write a one-off drafting prompt naming the agent's role, the 5 tools, the output schema, the behavioral rules. Get a draft from Claude. Edit for contrl-specific exercise terminology. Commit. This is a one-time use of meta-prompting; not codified into a tool.
2. **First-draft of agent eval-set rubric.** When writing `tests/agent/rubric.md`, ask Claude to draft the structure first. Same one-time pattern.

Neither use case justifies building a meta-tool inside contrl. They're use-once activities; the savings don't compound.

---

## Elaborate

**Where this pattern comes from.** Meta-prompting as a named practice emerged 2023–2024 as the LLM ecosystem matured. The "use an LLM to write prompts" idea predates that (OpenAI's playground demonstrations from 2022), but it became a real discipline only when production teams started shipping LLM features at scale and noticing that prompt drafting was eating real time. The aipe project itself is a 2025–2026 instantiation of the pattern as developer tooling.

**The deeper principle.** Code generation works on bounded, structured artifacts (JSON Schema, OpenAPI, route handlers). The same shape applies to prompts — when the structure is fixed (the four-section anatomy from [01-anatomy](./01-anatomy.md)) and the variations are bespoke, an LLM can fill in the bespoke parts faster than a human can. The pattern fails when the structure is unconstrained — then the LLM has too much freedom and produces drift instead of utility.

**Where this breaks down.** Three cases.

1. **High-volume small edits.** Asking an LLM "make this prompt better" without specific guidance produces vague restructuring. The cost of writing the meta-prompt + reviewing the draft exceeds the cost of just editing the original.
2. **Prompts under heavy eval-driven iteration.** When you're iterating against measurable eval scores, the eval results tell you what to change. Asking an LLM "improve this" produces general advice that doesn't move the needle.
3. **Domain-specific or proprietary terminology.** An LLM doesn't know your product's specific terms for things. Drafts will use generic equivalents. The bespoke editing rate goes up; the time savings go down.

**What to explore next.**
- [03-prompts-as-code](./03-prompts-as-code.md) → meta-prompting outputs feed into the prompts-as-code lifecycle.
- [01-anatomy](./01-anatomy.md) → the four-section structure that makes meta-prompting tractable.
- [05-eval-driven-iteration](./05-eval-driven-iteration.md) → the discipline that takes over once the meta-prompted draft is committed.

---

## Tradeoffs

| Cost dimension | Meta-prompting (first draft) | Hand-writing first draft |
|---|---|---|
| Time to first draft | ~20 min | ~2 hours for complex prompts |
| Quality of first draft | 60–80% usable | 70–90% usable (your edits land first time) |
| LLM tokens consumed | One call for drafting | Zero |
| Bespoke-content accuracy | Lower — LLM uses generic phrasings | Higher — you know your domain |
| Boilerplate-section accuracy | Higher — LLM produces consistent shape | Variable — your boilerplate may inconsistent |
| Worth on small prompts | No — overhead exceeds savings | Yes — just write it |
| Worth on complex new prompts | Yes — large savings | No — slow |

### Sub-block 1 — what we gave up

Two costs. First, **bespoke content can be wrong**. The LLM draft uses generic phrasings ("the user's message"); your codebase uses specific terms ("journal entry," "captured moment," whatever your product's vocabulary is). You edit these out. The edit rate is real — for the first draft of the intent classifier I'm imagining, you'd probably touch 30–40% of the LLM's lines.

Second, **structural laziness**. If you let the LLM own structure, you lose the four-section anatomy enforcement, the schema discipline, the consistent shape across chains. The mitigation is keeping structure in your control — give the LLM placeholders to fill, not blank-slate instructions.

### Sub-block 2 — what hand-writing every first draft would cost

I have done this. For 5 chains of similar complexity to a typical app, hand-drafting all first drafts is about a day's work. With meta-prompting it's about 2 hours of drafting + reviewing + editing across 5 chains, plus 30 minutes building the standardized template once. Net savings ~5 hours on the first batch. Subsequent chains: with templates established, hand-writing is about as fast. The savings concentrate on the initial batch.

### Sub-block 3 — the breakpoint

Meta-prompting is the right call until: (a) you're editing existing prompts surgically (just edit them); (b) the prompt is small and the structure is trivial (write it); (c) you're iterating under eval pressure (the eval tells you what to change, not the meta-LLM); (d) the domain terminology is so bespoke that the LLM's generic draft is mostly wrong. For initial drafts of complex new prompts, meta-prompting is right.

### Sub-block 4 — what wasn't actually a tradeoff

"Meta-prompting produces lower-quality prompts than hand-writing." The concern is that LLM-drafted prompts have a recognizable "AI-written" quality — bland, over-qualified, full of "ensure that..." language. This is true of unedited drafts and false of edited drafts. The discipline is meta-prompting + human review-and-edit. Stopping at the draft is the failure mode; treating the draft as draft is the discipline.

---

## Tech reference (industry pairing)

### aipe (the meta-tooling project)

- **Codebase uses:** `/Users/rein/Public/aipe/specs/*.md`. The slash-command spec files ARE the meta-prompts.
- **Why it's here:** the worked example of meta-prompting as developer tooling. Spec-driven generation of structured outputs.
- **Leading today:** Project-specific. aipe is a single-author meta-tool, not the industry leader in any category.
- **Why it's referenced:** demonstrates the rigid-template + worked-example + constraint-heavy pattern that makes meta-prompting reliable.
- **Runner-up:** Cursor's prompt rules, Claude Code's project memory + slash commands, Aider's `--system-prompt` patterns — all related but at different layers.

### Claude Code (the agent that consumes meta-prompts)

- **Codebase uses:** Claude Code is the runtime for aipe specs. The user types `/aipe:study`, Claude Code loads the spec into context and executes it.
- **Why it's here:** the agent layer that turns markdown specs into LLM behavior. Without an agent that reads the spec and acts on it, the spec is dead content.
- **Leading today:** Claude Code — `innovation-leading` for spec-driven agentic execution, 2026.
- **Why it leads:** strong tool-use support, file-system access, slash-command + skill abstractions, Anthropic-native (matches the spec's intended runtime).
- **Runner-up:** Codex CLI and Cursor's agent mode — comparable capabilities with different agent designs.

### Anthropic prompt engineering guide (the canonical reference)

- **Codebase uses:** N/A — documentation reference.
- **Why it's here:** the canonical guide on prompt structure and design that informs both hand-written and meta-prompted prompts.
- **Leading today:** Anthropic's "Prompt engineering" docs — `adoption-leading` for prompt-design reference material, 2026.
- **Why it leads:** vendor-shipped (matches the model's actual behavior), maintained, covers tool use / XML tags / structured output.
- **Runner-up:** OpenAI cookbook — comparable for OpenAI-target prompts.

---

## Project exercises

### [B4C.draft-agent] Use meta-prompting once to draft the coaching agent's system.md

- **Exercise ID:** `[B4C.draft-agent]`
- **What to build:** Write a one-off ~200-token drafting prompt naming: the agent's role (coaching messages after a set), the 5 read-only tools, the output schema (`{ message, priority_cue, confidence }`), the behavioral rules (one cue at a time, avoid recent rotation), the kind of tone (terse, direct, no emojis). Paste into Claude Code or a playground. Get a draft of `src/lib/agent/system.md`. Edit for contrl-specific exercise terminology. Commit.
- **Why it earns its place:** materializes the once-per-feature meta-prompting workflow. Time-saving vs hand-drafting becomes the data point.
- **Files to touch:** the drafting prompt itself (saved as `docs/agent-drafting-prompt.md` for reproducibility) plus the resulting `src/lib/agent/system.md`.
- **Done when:** system.md exists, time-to-first-draft is documented, editing pass is committed.
- **Estimated effort:** `1–4hr`

### [defer] Build a /contrl:tune slash command

- **Exercise ID:** `[defer]` — not in current scope
- **What to build:** If contrl scales past one LLM surface, an `aipe` spec or in-repo tooling that takes a system.md + eval results and proposes edits. Human approves each edit before commit. Requires the eval suite to verify no regressions.
- **Why it earns its place:** pushes meta-prompting from "scaffold new" to "improve existing." Earns its place at 3+ surfaces under iteration.
- **Files to touch:** TBD when scope justifies.
- **Done when:** TBD.
- **Estimated effort:** `1 week`

---

## Summary

Meta-prompting is using an LLM to draft prompts for other LLM calls. Saves real time on initial drafts of complex prompts; backfires on small tweaks and high-iteration prompts. The discipline: human owns structure and review; LLM owns boilerplate drafting; commit only after human editing. The cleanest worked example is meta-tooling like aipe — slash-command specs that ARE meta-prompts producing structured outputs (this study guide was generated that way). For contrl, the pattern earns its place once-per-feature as a drafting accelerator (e.g., first draft of the coaching agent's system.md); it doesn't earn its place as in-repo tooling at solo scale.

**Key points:**

- **Use it for initial drafts of complex new prompts.** Skip for small edits and high-iteration tuning.
- **Constrain the drafting prompt.** 100–300 tokens of clear constraints; less is vague, more is over-engineered.
- **Human owns structure; LLM owns body prose.** Crossing this boundary is where it backfires.
- **Always review and edit before commit.** Unedited drafts have recognizable "AI-written" texture.
- **For contrl: a one-off accelerator, not in-repo tooling.** Use once when drafting `src/lib/agent/system.md`; don't build a /tune slash command at solo scale.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "do you use AI to write your prompts?", they want to hear whether you've used meta-prompting with discipline or have been pasting outputs blindly. The shipped answer names where it earns its keep (initial drafts) and where it backfires (surgical edits, eval-driven tuning).

### Likely questions

**[mid] When do you use an LLM to draft a prompt?**

For initial drafts of complex new prompts — ones with multiple sections, schemas, edge cases. I describe the task with clear constraints (categories, schema, edge cases), get a draft, review it, edit the bespoke parts, commit. Saves about 60–90 minutes per complex prompt. I don't use it for small edits to existing prompts — those are faster done by hand than by writing a meta-prompt.

```
  Where meta-prompting earns its time

  ┌─────────────────────────────────────┬──────────────────────────┐
  │ Initial draft, complex prompt        │ Yes — 60–90 min saved    │
  │ Adding a new section to existing    │ Yes — modest saving      │
  │ Small edit to existing prompt        │ No — just edit           │
  │ Tuning under eval pressure           │ No — eval tells you      │
  └─────────────────────────────────────┴──────────────────────────┘
```

---

**[senior] Walk me through your meta-prompting workflow.**

Three steps. First, I write the drafting prompt — usually 100–300 tokens of clear constraints: what the prompt does, what input it takes, what output it produces, what edge cases matter, what format constraints. Second, I get a draft from Claude (or whichever LLM). Third, I review and edit — I check that the bespoke domain terminology is right, that the structure matches our codebase's conventions, that the LLM hasn't added generic "please be helpful" boilerplate. Then I commit. The discipline is: human owns the constraints and the review; LLM owns the prose body. Stopping at the draft is the failure mode.

```
  Three-step workflow

  ┌─────────────────────────────────────────┐
  │ 1. Human writes drafting constraints     │
  │    (100–300 tokens, clear, structured)    │
  └─────────────────────┬───────────────────┘
                        │
                        ▼
  ┌─────────────────────────────────────────┐
  │ 2. LLM produces a draft                  │
  │    (~80% usable, generic boilerplate     │
  │     interspersed)                        │
  └─────────────────────┬───────────────────┘
                        │
                        ▼
  ┌─────────────────────────────────────────┐
  │ 3. Human reviews, edits, commits         │
  │    (bespoke domain content + structure   │
  │     enforcement)                         │
  └─────────────────────────────────────────┘
```

---

**[arch] How does this scale to a 50-prompt codebase?**

At 50 prompts, the savings on first drafts compound. But the bigger win is *templates*: once you've used meta-prompting to draft 5 prompts in the same shape, you have a template; new prompts get drafted against the template; the LLM mostly fills in the template's blanks. At that point, meta-prompting is more "template instantiation" than "draft from scratch." The aipe pattern (rigid template + worked examples + specific constraints) is what makes the template stable — without rigid templates, each new prompt drifts in shape.

```
  Maturity at scale

  ┌─────────────────────────┬──────────────────────────────────┐
  │ Chains in codebase      │ Meta-prompting role               │
  ├─────────────────────────┼──────────────────────────────────┤
  │ 1–3 chains              │ Bootstrap; each draft from scratch │
  │ 5–10 chains             │ Template-based drafts; LLM fills   │
  │                         │ template blanks                    │
  │ 20+ chains              │ Drafting is mostly mechanical;     │
  │                         │ meta-prompting may earn less.       │
  │                         │ Templates carry the work.          │
  └─────────────────────────┴──────────────────────────────────┘
```

---

### The question candidates always dodge

**"Internet advice says you can ask an LLM to 'improve' any prompt. Why don't you do that?"**

Because "improve this prompt" doesn't have a target. The LLM produces vague restructuring — moves clauses around, adds caveats, changes "the user" to "the user's input." None of this targets the specific issue your eval suite is flagging. If you have a specific failure (case-013 misclassifies), the fix is editing the specific section of the prompt that handles that case. Asking the LLM "make this better" is a substitute for not having an eval suite — the LLM has nothing to optimize against, so it optimizes against generic notions of "better." Production teams that ship eval-driven get more value from targeted edits than from open-ended LLM rewriting.

```
  Where the "improve this" advice fails

  Internet advice                       Production reality
  ─────────────────────────────         ─────────────────────────────────
  "Ask LLM to improve the prompt"       Eval suite says case-013 fails
  LLM rewrites everything               You edit the system section that
  Some rewrites may help                 handles case-013
  No way to verify the rewrite           Eval re-run confirms case-013
   improves anything in particular        passes and others don't regress
                                                                              
  Vague restructuring                   Targeted, verified improvement
```

---

### One-line anchors

- "Meta-prompt for initial drafts of complex prompts. Edit by hand for small changes."
- "Constrain the drafting prompt: 100–300 tokens, clear structure, named edge cases."
- "Human owns structure and review; LLM owns boilerplate body prose."
- "aipe specs are the worked example — rigid template + worked examples + constraints."
- "Eval-driven iteration takes over after the first draft."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the human/LLM ownership boundary in the meta-prompting workflow. Label what each side owns and where the boundary is enforced.

Pass: you got structure + review on the human side; body prose drafting on the LLM side; commit only after human edit as the boundary enforcement.

**Level 2 — Explain it out loud.**
Without notes, under 60 seconds: "When do you use meta-prompting?" Checkpoints:
- Did you name initial drafts vs surgical edits?
- Did you mention the constrain-the-drafting-prompt discipline?
- Did you mention review-then-commit?

If you skipped any: you described meta-prompting, not the discipline.

**Level 3 — Apply to a new scenario.**
A teammate wants to add a new "tag-extract" chain. They ask you whether they should use meta-prompting to draft the system prompt. Walk through your recommendation.

Expected: yes, with the constrained-drafting-prompt approach. Write a 200-token drafting prompt naming the input shape (journal entry), output shape (`{ tags: string[] }`), max tag count (5), forbidden tags (PII, profanity), and one worked example. Get a draft. Edit for project-specific terminology and any business-specific rules. Commit. Then iteration via the eval suite.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is "20 min meta-prompted draft + edit vs 2 hours hand-drafted." If you were starting a project with extremely bespoke domain terminology, would you still meta-prompt the first drafts?

There's no right answer. Defend with reference to: the edit rate (high-bespoke-terminology projects have higher edit rates, eroding the savings), the LLM's familiarity with similar domains, the value of building a template first.

**Quick check — code reference test.**
Without opening files, answer:
- Where is the canonical worked example of meta-prompting?
- What's the rule about the drafting-prompt length?
- What's the human/LLM ownership split?

Pass: meta-tooling like aipe specs (a slash-command framework where each spec is a meta-prompt that generates structured artifacts); 100–300 tokens; human owns structure + review, LLM owns body prose.

---
