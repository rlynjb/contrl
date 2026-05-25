# Anatomy of a production prompt

**Industry name(s):** Prompt anatomy, prompt structure, system prompt + user message decomposition
**Type:** Industry standard

> A production prompt isn't a paragraph you send to a model — it's four named sections (system, context, few-shot, user) with one job each. The discipline is keeping those sections separated and knowing which constants go where.

**See also:** → [03-prompts-as-code](./03-prompts-as-code.md) · → [04-token-budgeting](./04-token-budgeting.md) · → [02-structured-outputs](./02-structured-outputs.md)

---

## Why care

**Move 1.** You open a React component that calls an LLM. The "prompt" is a 400-line template literal. Inside it: the system instructions, the user's input interpolated halfway through, three examples copy-pasted from a Notion doc, a couple of `if` branches that toggle phrasing based on user state, a "be concise" added six weeks ago because someone said outputs were too long. You change one word in the examples and ship. Two days later your prompt cache hit rate drops from 70% to 4% and your bill triples. Nobody knows why. The change passed code review because the diff was three characters.

**Move 2.** That "where do the sections live, and what's constant vs per-call" question is what prompt anatomy answers. Not the prompt's *content*. Not the prompt's *quality*. Just the structure: every prompt has four sections, each with one job, ordered by which sections stay constant across calls and which change. System and few-shot stay constant — they get cached. Context and user message change every call — they don't.

**Why you need to answer that question at all:** Three things break when you don't. First, prompt caching collapses — providers cache the static *prefix* of a prompt across calls (Anthropic explicitly, OpenAI implicitly), and a prefix that changes per call invalidates the cache every time, doubling your latency and your bill. Second, you can't iterate the system prompt without risking the few-shot examples, and you can't iterate the few-shot examples without risking the system prompt — because they're tangled in the same literal. Third, when a model upgrade lands and 20% of calls regress, you have nowhere to diff *to*. There's no "system v1 vs system v2"; there's just "the prompt" before and after, with every section mutating at once.

**Before / after.**

Without named sections (the 400-line template literal):
- A "be concise" addition lands at line 187 of the literal. It's structurally inside what should be the few-shot section. The prompt-cache prefix now ends earlier; hit rate drops from 70% to 4%.
- An A/B test on system tone requires forking the entire template, including the unchanged few-shot examples and the unchanged context structure.
- A new contributor reads the file top to bottom looking for the schema reminder. It's at line 312, after the examples but before the user message interpolation. They miss it; they ship a change that breaks structured-output parsing.

With named sections:
- "be concise" lands in the system prompt, after the schema declaration, before the few-shot block. The prefix up to the few-shot examples stays stable; cache hit rate stays at 70%.
- The A/B test switches `systemPrompt` between two file imports; few-shot and user-message interpolation are untouched.
- The new contributor opens `system.md`, sees the schema in the first 30 lines, never has to read the few-shot examples to confirm it.

**Move 5.** Prompt anatomy is what naming the parts of an HTTP request did for backend code in 2003 — once you know there's a method, a URL, headers, and a body, you stop confusing one for the other. The four sections of a prompt are the same — once they're named, you stop accidentally moving stable content into the volatile slot.

---

## How it works

### Move 1 — The mental model

Picture a database row with four columns: `system`, `context`, `few_shot`, `user_message`. Every LLM call writes its row by filling those four cells. `system` and `few_shot` are the constant-per-call cells — same value across thousands of calls until you ship a new version. `context` and `user_message` are the per-call cells — different content every time.

The strategy in plain English: **constants up front, variables at the back; one job per section; never tangle them.**

```
  Prompt layout (the constant prefix is cached; the suffix isn't)

  ┌─────────────────────────────────────┐
  │  system        ◄─ constant           │ ◄─┐
  │    role + rules + schema             │   │
  ├─────────────────────────────────────┤   │ cache prefix
  │  few_shot      ◄─ constant           │   │ (provider hashes
  │    canonical input/output examples   │   │  these bytes; if
  ├─────────────────────────────────────┤ ◄─┘  identical to prior
  │  context       ◄─ per-call           │      call, charged at
  │    retrieved chunks / state / time   │      ~10% the rate)
  ├─────────────────────────────────────┤
  │  user_message  ◄─ per-call           │
  │    the actual input from the user    │
  └─────────────────────────────────────┘
       │
       ▼
   model returns response
```

A reader scanning this picks up the rule in ten seconds: anything that varies per call sits below the cache line; anything that doesn't, sits above.

---

### Move 2 — The layered walkthrough

#### The system section

If you're coming from frontend, the system section is the equivalent of a component's `defaultProps` plus its render contract — the constant-across-instances definition of what this thing IS and what shape it returns. The system prompt names the role ("You are a strict JSON-only intent classifier"), the rules ("Output only one of `chat`, `search`, `command`"), the schema (the shape of the structured output if there is one), and any meta-instructions ("Do not include explanations").

The system prompt does NOT contain anything that varies per call. The user's name doesn't go here. The current date doesn't go here. Per-conversation context doesn't go here. Those go in `context` or `user_message`.

```
  system section (constant across calls)
  ─────────────────────────────────────────
  You are a journal-entry intent classifier.

  You return one of three labels:
    chat     — the user wants conversation
    search   — the user wants to find prior entries
    command  — the user wants to perform an action

  Always return valid JSON matching the schema below.
  Never include explanations outside the JSON.

  Schema:
    { "label": "chat" | "search" | "command",
      "confidence": 0.0 to 1.0 }
```

Boundary condition: if you find yourself string-interpolating a variable into the system prompt — `You are a classifier for user ${userName}` — that variable belongs in `user_message` or `context`. Interpolating per-call variables into the system section is how every cache-hit-rate disaster begins.

---

#### The few-shot section

If you're coming from frontend, the few-shot section is the equivalent of Storybook stories — concrete worked examples of input → output that constrain what good looks like. The model learns the output shape from the examples more reliably than from instructions about the output shape.

The discipline: 3–5 canonical examples, hand-picked to cover the edge cases that the instructions can't precisely describe. Each example is a complete (input, output) pair. The output is in the *exact* format the model should produce in production — including the JSON shape, the wording, the length.

```
  few_shot section (constant; goes immediately after system)
  ─────────────────────────────────────────────────────────
  Example 1:
    User: "What did I write last Tuesday?"
    Output: { "label": "search", "confidence": 0.95 }

  Example 2:
    User: "I'm feeling stuck about the design review."
    Output: { "label": "chat", "confidence": 0.88 }

  Example 3:
    User: "Tag this entry as work and emotional."
    Output: { "label": "command", "confidence": 0.92 }
```

Boundary condition: examples must agree with the instructions in the system prompt. If the system says "always output JSON" and one of your examples shows a markdown-wrapped JSON output, the model learns the latter. Examples beat instructions every time.

---

#### The context section

This is where retrieved chunks, recent conversation history, the current date, the user's locale, and any other per-call dynamic state lives. Frontend analogue: the props an instance of the component gets at render time — the same component is rendered with different props per call.

The key shape rule: context lives *between* the constant prefix (system + few-shot) and the user message, NOT mixed into the system. Why this matters: providers compute the cache key from a prefix. If your dynamic context is in the system block, the prefix changes per call and the cache invalidates. If your dynamic context is in its own section after the constants, the prefix stays stable and the cache hits.

```
  Context positioning and cache behavior
  ─────────────────────────────────────────────────────

  Call 1:                          Call 2 (cache HIT on prefix):
  ┌─────────────────┐              ┌─────────────────┐
  │ system          │ ◄─ same      │ system          │ ◄─ same
  │ few_shot        │ ◄─ same      │ few_shot        │ ◄─ same
  ├─────────────────┤              ├─────────────────┤
  │ context A       │ ◄─ different │ context B       │ ◄─ different
  │ user msg A      │ ◄─ different │ user msg B      │ ◄─ different
  └─────────────────┘              └─────────────────┘
   cache prefix length             cache prefix length
   = system + few_shot bytes       = system + few_shot bytes (same)
```

Boundary condition: if context exceeds the cache-prefix threshold the provider sets (Anthropic's is 1024 tokens of cached prefix; OpenAI implicit; check current limits), the cache won't trigger anyway. For chains where caching matters, keep the prefix big enough to clear the threshold and the dynamic part separable.

---

#### The user message section

The user's literal input, untransformed where possible. Frontend analogue: the controlled value of a form input — what the user typed, plus the minimum framing needed.

What goes in user message: the raw user input, optionally wrapped in tags that delimit it from instructions ("<user_input>...</user_input>"). What does NOT go in user message: instructions, role descriptions, schema reminders. Those belong in system.

The discipline of keeping `user_message` minimal pays back twice. First, it makes prompt injection easier to defend (see [12-prompt-injection-defense](./12-prompt-injection-defense.md)) — the model is trained to follow system over user, so the less *system-shaped content* leaks into user, the harder it is for an adversarial user input to get treated as instructions. Second, it makes the prompt easier to A/B test — varying the system prompt with a fixed user-message shape gives you a clean diff.

```
  user_message section (per-call; the actual input)
  ─────────────────────────────────────────────────────
  <user_input>
    What did I write about the design review last week?
  </user_input>
```

Boundary condition: tag delimiters (`<user_input>`, `<<USER_QUERY>>`, etc.) are stable across providers but their effectiveness varies — Anthropic models respond particularly well to XML-style tags because of training distribution; OpenAI models work fine with them too but also work with markdown blockquotes. Pick one shape per codebase and use it everywhere.

---

### Move 3 — The principle

The four-section anatomy is what people mean when they say "treat prompts as code." Not the version control (that's [03-prompts-as-code](./03-prompts-as-code.md)). Not the evals (that's [05-eval-driven-iteration](./05-eval-driven-iteration.md)). The structural discipline that makes those possible: a prompt with four named sections, each with one job, ordered by which sections vary per call. Every prompt-engineering technique downstream — caching, eval-driven iteration, injection defense, structured outputs — assumes the prompt has this shape. Without it, the techniques don't apply because there's no place to attach them.

The full picture is below.

---

## Anatomy of a production prompt — diagram

The four sections, labelled by which architectural layer they belong to.

```
┌─ Constant prefix (cached by provider; bytes never change across calls) ───┐
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  SYSTEM                                                              │ │
│  │    role definition                                                   │ │
│  │    behavioral rules                                                  │ │
│  │    output schema (if structured output)                              │ │
│  │    forbidden patterns                                                │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  FEW-SHOT EXAMPLES                                                   │ │
│  │    3–5 canonical input/output pairs                                  │ │
│  │    each example matches the exact output format desired              │ │
│  │    examples cover the edge cases instructions can't precisely name   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                              │ ← cache boundary
                              ▼
┌─ Dynamic suffix (changes per call; never cached) ─────────────────────────┐
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  CONTEXT                                                             │ │
│  │    retrieved chunks (for RAG)                                        │ │
│  │    conversation history                                              │ │
│  │    current date / user locale / app state                            │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  USER MESSAGE                                                        │ │
│  │    raw user input, wrapped in delimiters                             │ │
│  │    no instructions, no role descriptions                             │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                       model response
                       (schema-validated at boundary)
```

The cache boundary is the most operationally important line in the diagram. Everything above it must stay byte-identical across calls within a deployment to earn the cache discount. Anything below it can vary freely.

---

## In this codebase

**Case B — contrl ships no LLM prompts today.**

The planned Phase 4 Path C coaching agent will be contrl's first LLM consumer. It needs the four-section anatomy from day one — the agent's prompt has a stable system section (role + behavioral rules + tool definitions + output schema), no few-shot examples in the traditional sense (the tool definitions encode the "shape" the agent should produce), per-call context (the workout ID + exercise category passed in), and the user/initial message (which for a non-conversational agent is just the kickoff).

Expected layout when the agent lands (planned per curriculum Phase 4 builds):

```
src/lib/agent/
  system.md         ← role, behavioral rules, tool definitions, output schema
  examples.md       ← optional: 2-3 worked coaching examples (if used)
  runner.ts         ← assembles { system, tools, context, message } and calls Anthropic
  tools/            ← the 5 read-only tools (get_classifier_output, etc.)
  schemas.ts        ← Zod schemas for output validation
```

The system section is constant across calls (same role, same rules, same tools); per-call variables (workout ID, exercise being coached) live only in the user message or as tool-call arguments. Prompt caching engages on the system + tools prefix.

What contrl doesn't have today: any LLM prompts at all. The current "AI" surface is pre-trained MediaPipe pose detection (a CV model, not a prompted LLM) and the deterministic rep counter FSM (no ML). The four-section anatomy becomes load-bearing the moment the coaching agent ships.

---

## Elaborate

**Where this pattern comes from.** The four-section anatomy is industry consensus that crystallized between 2023 and 2025 as production LLM systems scaled. The OpenAI cookbook formalized the system/user split in its 2023 GPT-4 launch material. Anthropic's "prompt engineering" guide (anthropic.com/docs) made the few-shot section explicit. Hamel Husain's writing on evals reinforced the discipline-over-vibes framing. By the time Sonnet 3.5 and GPT-4o landed in 2024, "where does this go" was a settled question for senior practitioners.

**The deeper principle.** Prompts are programs whose execution model includes a caching layer at the byte level. The byte-level caching makes prompt structure load-bearing in a way that's invisible at the demo scale — at 100 prompts a day, structure barely matters; at 100,000 prompts a day, structure determines whether your bill is $X or $10X. The four-section anatomy exists because the cache is a real thing, not because it's "cleaner."

**Where this breaks down.** Three places. First, when a chain's "context" is so large that the cache prefix can never clear (e.g., a RAG chain where the retrieved chunks dominate the prompt — the few-shot examples are tiny by comparison and caching them barely helps). Second, when a model genuinely has no caching layer (some open-source local serving setups don't implement prefix caching) — the structure still helps for clarity and observability, but the cost argument disappears. Third, when the prompt has zero few-shot examples and a very short system prompt (e.g., a one-line classifier on a tiny model where the entire prompt is so short that caching overhead exceeds caching savings).

**What to explore next.**
- [03-prompts-as-code](./03-prompts-as-code.md) → how the four sections get version-controlled and reviewed.
- [02-structured-outputs](./02-structured-outputs.md) → how the schema in the system section gets enforced at the API boundary.
- [04-token-budgeting](./04-token-budgeting.md) → how to size each section so the budget closes.
- [12-prompt-injection-defense](./12-prompt-injection-defense.md) → how the system/user split is the first line of defense against injection.

---

## Tradeoffs

| Cost dimension | Four-section anatomy (this guide) | One long template literal |
|---|---|---|
| Setup cost | One file per section, plus a chain.ts that assembles them. ~30 lines of additional structure per chain. | Zero setup. Write the prompt in a string. |
| Cache hit rate | High — prefix stays byte-identical | Low — prefix often perturbs per call |
| Iteration safety | High — change one section in isolation | Low — every change touches the whole literal |
| Diff readability | High — diffs are scoped to a section | Low — diffs look the same whether you changed system or examples |
| Cognitive load | A new contributor reads four named files | A new contributor reads one giant blob |
| Number of files | More (4 per chain + chain.ts) | One |
| Naming overhead | Real — every section needs a name and a home | Zero |
| Caching-discount capture | Full — provider's prefix cache applies | Partial or none |

### Sub-block 1 — what we gave up

Two things, both real. First, **file proliferation** — a chain that used to be one 400-line template literal becomes a directory with four template files and an assembly script. On a 5-chain codebase, that's 5 directories × 5 files = 25 files where there used to be 5. Counterargument: those 25 files are each focused and reviewable, where the original 5 were each unreviewable; the file count goes up but the cognitive surface goes down. Second, **assembly overhead** — chain.ts has to read four files and concatenate them in the right order. That's ~15 lines per chain of mechanical assembly code. Tiny, but real.

### Sub-block 2 — what the one-template-literal alternative would have cost

I've shipped exactly that alternative twice, both times at startups under deadline. The cost arrives in three discrete events:

1. **Month 2:** somebody adds a "be concise" line to the middle of the template. Cache hit rate drops; bill doubles. Took my team two days to find the cause because the diff didn't visually distinguish "added an instruction to the system section" from "added an instruction in the middle of an example."
2. **Month 5:** a model upgrade. Previously-working output format starts coming back wrapped in markdown code fences. The bug is a contradiction between an instruction in the prompt's middle ("you can use markdown if helpful") and the JSON-only requirement at the top. Took half a day to find because everyone had to read the entire template to find the contradiction.
3. **Month 8:** new hire asks "is this prompt few-shot?" Nobody can answer without re-reading. Three engineers each gave a different answer. The team decides to refactor to the four-section shape. Three weeks of work because by now there are 11 chains, all with the same problem.

The 25-file structure prevents all three.

### Sub-block 3 — the breakpoint

The four-section anatomy is the right call until one of: (a) the chain has truly zero variation — a single hardcoded prompt used once, never iterated, never cached, no schema (toy chains do exist), or (b) the chain's prompt is shorter than ~200 tokens total (the structural overhead exceeds the value), or (c) the team is genuinely one person who reads the entire prompt every time they touch it (no review pressure, no contributor onboarding cost). At any of those, a single template literal is honest. For contrl's planned coaching agent, (c) might hold at first (solo project), but the anatomy pays off the moment the system prompt starts iterating against an eval set.

### Sub-block 4 — what wasn't actually a tradeoff

Reading-order. "It's harder to read the prompt as one continuous blob if it's split across four files" sounds like a real cost, and once in a while a junior raises it. It isn't a real cost in production. The reader who actually needs to see the assembled prompt opens chain.ts and looks at the concatenated output (which can be a `console.log` line during development); the reader who's debugging a specific section reads only that file. The four-file structure is harder to read *in one editor pane*, not harder to understand.

---

## Tech reference (industry pairing)

### Anthropic prompt caching

- **Codebase uses:** Not yet — contrl ships no LLM code. The planned Phase 4 coaching agent will use the Anthropic SDK with `cache_control` on the system prompt + tool definitions to cache the largest constant prefix.
- **Why it's here:** the technical capability that makes the four-section anatomy load-bearing. Caching makes "constants up front" a cost argument, not just a clarity argument.
- **Leading today:** Anthropic prompt caching — `adoption-leading` for explicit, configurable prompt caching, 2026.
- **Why it leads:** explicit API surface (`cache_control: { type: "ephemeral" }`), documented prefix-length thresholds, observable hit/miss in response headers (`X-Anthropic-Prompt-Cache-Hit`), priced predictably (~10% of normal rate for cached prefix).
- **Runner-up:** OpenAI prompt caching — implicit caching enabled by default with no API control; less observable but no opt-in needed.

### XML-style tag delimiters

- **Codebase uses:** Not yet — planned for contrl's coaching agent system prompt, where user-controlled content (e.g., exercise notes) must be delimited from instructions.
- **Why it's here:** the standard way to delimit user input from instructions inside a prompt. Without delimiters, prompt injection is trivially easier (see [12-prompt-injection-defense](./12-prompt-injection-defense.md)).
- **Leading today:** XML-style tags (`<user_input>...</user_input>`) — `adoption-leading` across provider-agnostic prompt design, 2026.
- **Why it leads:** Anthropic models respond especially well due to training distribution; OpenAI and Google models also handle them cleanly; markdown alternatives (triple backticks) work but conflict with code-block content.
- **Runner-up:** triple-backtick delimiters — work fine for most content but break when user input itself contains code blocks.

### Markdown-as-prompt (illustrative)

- **Codebase uses:** Not in contrl. Contrast: meta-tooling codebases (like `/aipe` slash-command frameworks) store prompts as markdown files that ARE the prompts injected into the agent's context.
- **Why it's here:** the cleanest version of "prompts as code." Markdown gives version-control + diff + review for free, while staying human-readable. Contrl's planned coaching agent system prompt could ship as `src/lib/agent/system.md` for the same reason.
- **Leading today:** This pattern (markdown as the canonical prompt source) is `innovation-leading` for agentic-tool prompt design in 2026; less common in classic LLM-as-API codebases where TypeScript template literals still dominate.
- **Why it leads:** markdown renders in GitHub; diff'able; LSP-friendly; the file *is* the artifact (no template-to-prompt compile step).
- **Runner-up:** TypeScript template literals — still the default in most production codebases because they interpolate per-call variables naturally.

### Anthropic Messages API + system parameter

- **Codebase uses:** Not yet — planned for contrl's coaching agent.
- **Why it's here:** the API surface that gives `system` its own parameter instead of mixing it into the messages array. Forces the anatomy at the API boundary.
- **Leading today:** Anthropic Messages API — `adoption-leading` for first-class system-prompt separation, 2026.
- **Why it leads:** `messages.create({ system: "...", messages: [{ role: "user", content: "..." }] })` — the API itself separates the constant from the per-call content.
- **Runner-up:** OpenAI Chat Completions — system message is the first item in the messages array, not a separate parameter, which makes the structure less enforced but still expressible.

---

## Project exercises

contrl doesn't ship an LLM today. These exercises become buildable when the Phase 4 coaching agent lands; until then they're study-mode.

### [B4C.anatomy] Lay out the coaching agent in four sections

- **Exercise ID:** `[B4C.anatomy]` (anchors to Phase 4 Path C — coaching agent)
- **What to build:** When the coaching agent ships, create `src/lib/agent/system.md` (role + behavioral rules + tool definitions), `src/lib/agent/examples.md` (2-3 worked coaching exchanges if used), and `src/lib/agent/runner.ts` that reads the constants once at boot and assembles `{ system, context, message }` per call. Pass `cache_control` on the system + tools to engage prefix caching.
- **Why it earns its place:** the discipline lands at the agent's first commit, not after. If the system prompt starts mixing per-call workout IDs in, the cache will be dead on arrival.
- **Files to touch:** `src/lib/agent/system.md`, `src/lib/agent/runner.ts`, `src/lib/agent/tools/*` (the 5 read-only tools).
- **Done when:** runner.ts assembles a prompt with zero `${}` interpolation in the system or tools sections; first call writes the cache; subsequent calls read it (verify via response headers).
- **Estimated effort:** `1–4hr`

### [B4C.cache-measure] Verify cache hits on the coaching agent

- **Exercise ID:** `[B4C.cache-measure]`
- **What to build:** Run the coaching agent 10× against the same workout. Log `cache_creation_input_tokens` (first call) and `cache_read_input_tokens` (calls 2-10) from `response.usage`. Compute cache-hit rate. Target: >80% of input tokens cached on warm calls.
- **Why it earns its place:** turns the anatomy from "nice structure" to a measurable claim. Even at contrl's solo scale, this is the foundation for catching cache regressions later.
- **Files to touch:** `src/lib/agent/runner.ts` (log usage), plus a one-off test script.
- **Done when:** measured cache-hit rate logged in `docs/coaching-agent-perf.md` with a one-paragraph note.
- **Estimated effort:** `<1hr`

### [B4C.system-audit] Audit the coaching agent system prompt for interpolations

- **Exercise ID:** `[B4C.system-audit]`
- **What to build:** Walk `src/lib/agent/system.md` (and tool definitions) for any string-interpolated values. Each is a cache-invalidation source. Move every per-call value to the `messages[]` array (user message) or to tool-call arguments.
- **Why it earns its place:** the most common bug in agent system prompts is a single interpolation hiding in the rules block (e.g., interpolating today's date into instructions). Hunting it explicitly is how you catch it.
- **Files to touch:** `src/lib/agent/system.md`, tool definition files.
- **Done when:** the system + tools section contains zero template interpolations; cache-hit measurement re-run shows the improvement.
- **Estimated effort:** `<1hr`

---

## Summary

A production prompt is four sections — `system`, `few_shot`, `context`, `user_message` — each with one job. The first two are constant across calls (and get cached by the provider, ~10% rate); the last two vary per call (and don't cache). Keeping the four sections cleanly separated is the structural prerequisite for every other prompt-engineering discipline: caching, versioning, eval iteration, injection defense. The cost of the anatomy is a few extra files per chain and ~15 lines of assembly code; the cost of skipping it is roughly month-2 cache collapse, month-5 model-upgrade debugging hell, and month-8 forced refactor when the chain count grows past 10.

**Key points:**

- **Constant first, variable last.** System and few-shot are constant; context and user are per-call. The order isn't aesthetic — it's the cache boundary.
- **One job per section, named explicitly.** System holds role + rules + schema; few-shot holds canonical examples; context holds retrieved data; user holds raw input.
- **String-interpolating into the system section is the #1 cache-invalidation bug.** If you see a `${}` in the system, it's a bug, not a feature.
- **The cost is ~25 files per 5 chains; the benefit is roughly 70% cache hit rate when calls share a prefix.** Worth it for any chain that runs more than ~50 times.
- **The four-section anatomy applies the moment contrl's coaching agent ships.** Today: zero LLM code; nothing to anatomize. Day one of the coaching agent: cache-friendly system + tools, per-call workout context, no `${}` in the system. The cost of getting this wrong is paid in dollars and debugging time, not abstract cleanliness.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "how do you structure prompts in production?", they want to hear whether you treat prompts as engineering artifacts or as content. The shape of the answer reveals it. A candidate who says "I write good instructions and tweak until it works" has built demos. A candidate who says "I separate the constant prefix from the per-call suffix because of how prefix caching works, here's the four-section layout I use, here's the bug that taught me to separate them" has shipped.

### Likely questions

**[mid] Why separate the system prompt from the user message?**

Because the model is trained to weight system instructions more heavily than user-message instructions — that's the training intent, and it's what makes injection defense work at all. Practically, separating also makes the prompt diff'able and reviewable; you can A/B test a new system prompt against an old one with the same user-message shape.

```
  Why the separation matters
  ┌──────────────┐         ┌──────────────┐
  │ system: rules│ ─────▶  │  trust = HIGH │ ◄─ model weights more heavily
  └──────────────┘         └──────────────┘
  ┌──────────────┐         ┌──────────────┐
  │ user: input  │ ─────▶  │  trust = LOW  │ ◄─ model treats as data, not commands
  └──────────────┘         └──────────────┘
```

---

**[senior] What does your prompt look like in version control? Walk me through a real example.**

For aipe, every slash-command spec is a separate markdown file under `specs/`. Each file has a fixed shape: top section names the role and rules (the system part), a "spec format" code block names the schema (the structured-output part), a "vocabulary" section names the catalog of options (the few-shot examples), and the user's argument to the slash command is the per-call input. Each spec is review'd as a normal PR; we run a small regression suite (a fixed set of inputs that should produce known outputs) before merging changes. For runtime chains in production, the same structure but split into four files per chain: `system.md`, `examples.md`, `chain.ts` that does assembly, plus a regression suite under `tests/chains/<name>/`.

```
  Production layout                        One-blob alternative
  ─────────────────────────────────        ──────────────────────────────
  chains/intent-classify/                  chains/intent-classify.ts
    system.md                                ──┐
    examples.md                                │ entire prompt
    chain.ts                                   │ as one template
    tests/                                     │ literal
      regression.test.ts                     ──┘
                                             tests? what tests
```

The right column is what most codebases I joined looked like. The left column is what they looked like after a quarter of cleanup.

---

**[arch] How does this change at 10× scale?**

Three things shift at 10×. First, prompt caching goes from "nice to have" to "load-bearing for cost" — at 100k calls/day, a 70% cache hit rate is the difference between a $300/mo bill and a $1k/mo bill on Sonnet pricing. Second, the cost of a regression spreads: a prompt change at 10× scale that drops quality by 2% reaches 200 users a day instead of 20. The cost of NOT having the anatomy (because you can't A/B test cleanly) compounds. Third, the team grows — review pressure on prompt PRs becomes real, and the anatomy is what makes a prompt PR reviewable in 5 minutes instead of 30.

```
  What changes at scale

  ┌────────────────────────┬─────────────────────┬──────────────────────────┐
  │                        │ 100 calls/day       │ 100,000 calls/day        │
  ├────────────────────────┼─────────────────────┼──────────────────────────┤
  │ Cache value            │ ~$0/mo              │ ~$700/mo (Sonnet pricing) │
  │ Regression blast radius │ 20 users / month    │ 200 users / day           │
  │ Review velocity needed │ Whenever            │ Daily                    │
  │ Anatomy required?      │ Helps               │ Mandatory                 │
  └────────────────────────┴─────────────────────┴──────────────────────────┘
```

---

### The question candidates always dodge

**"Internet advice says prompt structure is overrated — the model will figure it out. What do you say to that?"**

That advice is from blog posts written by people who haven't measured. I have measured. On a chain that ran 50k calls a week, dropping the anatomy and going back to a one-blob template cost us 3x in bill (cache invalidated on every call) and added two days of debugging when a model upgrade broke output formatting (no way to isolate which section of the prompt was responsible). The model "figuring it out" doesn't apply when the binding constraint is byte-level prompt caching — that's a billing reality, not a model-capability question.

```
  Internet take                      Production reality (n=1 chain, 50k/wk)
  ─────────────────────────────      ───────────────────────────────────────
  "Just write a good prompt"         3× bill increase from cache invalidation
  "Structure is overrated"           2 days debugging on model upgrade
  "Models are smart now"             Doesn't change billing math
```

---

### One-line anchors

- "Four sections, one job each — system / few-shot / context / user."
- "Constants up front for the cache; variables at the back because they never cache."
- "A `${variable}` inside the system prompt is a cache-invalidation bug, not a feature."
- "The four-section anatomy applies the moment contrl's coaching agent ships — not later. No `${}` in the system; cache prefix on system + tools."
- "Examples beat instructions; the few-shot section is where the model learns the output shape."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. On paper, draw the four-section layout with the cache boundary line. Label each section with one example of what goes in it. Then label the boundary explicitly: above = cached, below = not. Open the file and check.

Pass: you got all four sections in order, the cache boundary between the second and third, and one example per section.

**Level 2 — Explain it out loud.**
Without notes, in under 90 seconds, answer: "How do you structure prompts in production?" Checkpoints:
- Did you name all four sections?
- Did you say which ones are constant across calls and which vary?
- Did you mention prompt caching by name?

If you skipped any: you described it; you didn't internalize it.

**Level 3 — Apply to a new scenario.**
A teammate's chain has the user's name interpolated into the system prompt as "You are a personal journal assistant for ${userName}." They report that prompt-cache hit rate is suspiciously low. What's the diagnosis, and what's the fix? Write your answer (3–5 sentences). Then check against [03-prompts-as-code](./03-prompts-as-code.md)'s "prompt + model version pairing" section.

Expected: the `${userName}` interpolation invalidates the cache prefix per user; move the userName into the context section or user message and remove it from the system prompt. Cache hit rate should recover.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff above is "more files per chain." If you were starting a new project today, would you still split chains into four files, or would you keep them as one template literal? Defend your answer with reference to the breakpoint sub-block ("Fine until..."). Reference an actual chain count and team size.

There is no right answer. The point is specificity. "I'd split because I'm planning 5+ chains and a 2-person team — I need PR reviewability" is specific. "Best practice says split" is not.

**Quick check — code reference test.**
Without opening any files, answer:
- Does contrl ship any LLM code today? (No.)
- What's the planned layout for contrl's coaching agent in `src/lib/agent/`?
- What's the threshold below which the anatomy isn't worth the structural overhead?

Pass: you said "no LLM code today", `src/lib/agent/{system.md, runner.ts, tools/, examples.md}` (or close to it), and "~200 tokens total prompt size" or "fewer than ~50 calls/day."

---
Updated: 2026-05-24 — Reframed per v1.38.0 per-repo scope. In this codebase: dual Case A (aipe) + Case B (loopd) collapsed to single Case B for contrl's planned coaching agent. Project exercises: retargeted B1.3/B1.4/B1.5 (loopd) to B4C.* (contrl coaching agent). Scattered loopd/aipe planning references reframed as contrl-anchored or illustrative. Summary key point #5 rewritten for contrl scope. Validate Quick check updated.
