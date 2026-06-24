# Prompts as code: versioning and observability

**Industry name(s):** Prompts as code, prompt versioning, prompt observability, LLM ops
**Type:** Industry standard · Language-agnostic

> Prompts are source code. They live in version control, get diff'd, get reviewed, get tagged to a model version, and emit a record of which version produced which output in production. Markdown-as-prompt meta-tooling (slash-command frameworks like aipe) is the cleanest worked example; for contrl the discipline applies the moment `src/lib/agent/system.md` lands.

**See also:** → [01-anatomy](./01-anatomy.md) · → [05-eval-driven-iteration](./05-eval-driven-iteration.md) · → [11-meta-prompting](./11-meta-prompting.md)

---

## Why care

**Move 1.** A teammate ships a tiny prompt change — adds the word "concisely" to the system instructions. Tests pass. PR merges. Two weeks later, a different teammate notices the chain's outputs feel different. Worse, maybe? Hard to tell. They check the git log on the chain file. The literal `prompt = ...\n...\n...` template is 400 lines; the change is one word buried at line 187; the diff is `+        "concisely"`. They can't tell from the diff whether `concisely` is in the system section, in an example, or in instructions about an example. They check the eval set — there is no eval set. The "feels different" stays a hunch for six more weeks until a regression report from a user gives them the answer.

**Move 2.** That "what changed, when, why, and against which model" question is what prompts-as-code answers. Not what the prompt says. Not how good the prompt is. Just the operational discipline of treating prompts the same way you treat any other source file: one file per prompt, atomic diffs, code review, paired to the model version it was tested against, observability that connects each production output back to the prompt version that produced it. The discipline is invisible until something breaks; then it's the only thing keeping you from a multi-day investigation.

**Why you need to answer that question at all:** Three production failures live or die by this discipline. First, **model upgrades break things silently** — a prompt that worked perfectly on Sonnet 3 can drop 30% on Sonnet 4 with no code change; without prompt-version pairing, you don't know your last-known-good combination. Second, **A/B tests are impossible** without atomic prompt versions — you need to ship version A to 50% and version B to 50%, then compare; without versioning, both halves are the same prompt. Third, **debugging production outputs requires the ability to reproduce the call** — and reproducing means knowing the exact prompt text, model version, and parameters that produced the bad output. Without observability, every prod incident is a research project.

**Before / after.**

Without prompts-as-code:
- Prompt lives as a template literal in `chain.ts`. A PR adds "concisely" buried in the middle. Reviewer doesn't catch the placement issue.
- Two weeks later, "quality feels off." Six weeks until anyone connects the dots.
- A new contributor asks "what model was this prompt tested on?" Nobody knows. The codebase doesn't say.
- A production incident — bad output reaches a user. Investigator can't reproduce because they don't know which prompt version was deployed at the time.

With prompts-as-code:
- Prompt lives in `chains/intent-classify/system.md`. The "concisely" change is a one-file PR with a 3-line diff. Reviewer sees it's in the system section. CI runs the regression suite against it; one test regresses. PR blocks until fixed.
- Each chain has a `meta.json` with `{ model: "claude-sonnet-4-6", tested_at: "2026-05-15", eval_score: 0.94 }`. Model upgrades are PRs with new meta + re-run evals.
- Production outputs log `prompt_version: "intent-classify@abc123def"`. Investigating any output traces back to the exact commit.

**Move 5.** Prompts-as-code is what version-controlled SQL migrations did for database schemas in 2010 — once the prompt is a tracked file, you stop asking "what's running in prod?" and start reading the commit hash.

---

## How it works

### Move 1 — The mental model

Think of a JSON config file your app reads at startup. You version-control it, diff PRs change it, code review catches placement bugs, the CI runs against it before merge, and the deployed version is identifiable by a commit hash. A prompt is exactly that — a config-shaped artifact your app loads — except the consumer is an LLM API call instead of a `JSON.parse`. The discipline is identical.

The strategy in plain English: **one prompt = one file, with a commit hash, a model-version pairing, and an observability footprint that connects production calls back to the file.**

```
  Prompts-as-code mental model

  source code                          prompts
  ─────────────────────────────        ─────────────────────────────
  src/auth/login.ts                    chains/intent-classify/system.md
    diff'd in PRs                       diff'd in PRs
    reviewed                            reviewed
    tested in CI                        regression-tested in CI
    deployed with a commit hash         deployed with a commit hash
    logged in production observability  logged in production observability

                       same lifecycle, different consumer
```

The mental shift: a prompt isn't content. It's source. Treat it accordingly.

---

### Move 2 — The layered walkthrough

#### Layer 1: one prompt = one file

If you're coming from frontend, this is the discipline of one React component per file — not technically required but unanimously practiced because it makes diffs, reviews, and Storybook stories sane. The same applies to prompts. One chain's system prompt is one file. One chain's examples are one file. One chain's chain.ts assembles them.

```
chains/intent-classify/
  system.md              ← role + rules + schema
  examples.md            ← few-shot
  chain.ts               ← assembly + provider call
  meta.json              ← model version, eval score, last test date
  tests/
    regression.test.ts   ← fixed inputs → expected outputs
```

The `chain.ts` reads `system.md` and `examples.md` at module-load time, assembles them, and makes the API call. The split lets you change one file at a time, with reviewers seeing exactly what changed.

Boundary condition: don't go further than necessary. A "system.md plus rules.md plus role.md plus schema.md plus more.md" decomposition turns into navigation hell. Four files per chain (system, examples, chain.ts, tests) is the right floor. Going beyond requires real justification.

---

#### Layer 2: model-version pairing

A prompt that works perfectly on Sonnet 3 may regress on Sonnet 4. This isn't theoretical — every quarterly model upgrade I've shipped through has produced at least one chain regression that took a day to debug. The fix is to pair the prompt to the model in a way that's visible and trackable.

```
  meta.json for one chain

  {
    "chain_name": "intent-classify",
    "version": "abc123def",            // git short SHA of last touch
    "model": "claude-sonnet-4-6",
    "tested_at": "2026-05-15",
    "eval_score": 0.94,
    "regression_run": "2026-05-15-01"
  }
```

The model-version pairing has two practical effects. First, you can't accidentally deploy a prompt to a model it wasn't tested on — the chain's loader checks `meta.json.model` against the configured runtime model and throws on mismatch. Second, when a model upgrade is in flight, the PR that changes `meta.model` is the same PR that re-runs the eval suite — the diff explicitly shows "tested on the new model, eval score went from 0.94 to 0.91" and the team can decide whether 0.91 is acceptable.

Boundary condition: this only works if the eval suite is real (see [05-eval-driven-iteration](./05-eval-driven-iteration.md)). Without evals, the `eval_score` field is theater.

---

#### Layer 3: production observability — which prompt produced which output?

For every production LLM call, log the prompt version (commit hash + chain name), the model, the input, the output, and any boundary-validation failures. This is the runtime artifact that turns "the chain produced a weird output" into a debuggable event.

```ts
// Illustrative — production log shape for a chain or agent call
const response = await callChain('intent-classify', { input: userInput });

log.info({
  event: 'llm_call',
  chain_name: 'intent-classify',
  chain_version: PROMPT_VERSIONS['intent-classify'],  // baked at build time
  model: 'claude-sonnet-4-6',
  input: userInput,
  output: response,
  schema_pass: true,
  latency_ms: 412,
  tokens: { in: 320, out: 18 },
});
```

The `chain_version` is the commit short SHA of the last touch to the chain's files. When a production output is reported as bad, you grep the log for the chain_version, check out that commit, reproduce the call, and you have a deterministic starting point.

```
  Production log entry

  {
    "event": "llm_call",
    "chain_name": "intent-classify",
    "chain_version": "abc123def",  ◄─ commit SHA
    "model": "claude-sonnet-4-6",
    "input": "What did I write last Tuesday?",
    "output": { "label": "search", "confidence": 0.95 },
    "schema_pass": true
  }
                  │
                  │ user reports: this output should have been "chat"
                  ▼
  git checkout abc123def
  open chains/intent-classify/{system.md, examples.md}
  → reproduce locally → debug deterministically
```

Boundary condition: input + output logging at production scale has privacy implications. For sensitive content, hash or truncate inputs and only log structurally relevant features (length, language, presence of certain keywords). The chain_version + model + schema_pass + latency_ms is the irreducible minimum.

---

#### Layer 4: deployment story — safe prompt rollouts

A prompt change is a code change. It should deploy the same way: through a PR, with CI, optionally behind a feature flag for rollout. The riskiest pattern is treating prompts as "content" that can hot-update without going through deployment — that's how a typo in a regex equivalent reaches 100% of users in 60 seconds.

Two safe patterns:

1. **Bundled prompts.** Prompts are bundled into the app binary at build time. Changing a prompt requires a deploy. Slow but safe; the deploy gates the change.
2. **Pre-deployed prompts behind a flag.** Prompts are deployed via a config service but gated behind a feature flag (1% → 10% → 50% → 100%). New prompt is in production but only routed to a fraction of traffic.

The pattern to avoid: hot-loadable prompts from a CMS or a Notion doc that any non-engineer can edit. I have seen this pattern in two startups; both times it caused at least one production incident where a "minor copy edit" landed in front of users and broke a downstream parser.

Boundary condition: meta-tooling like aipe genuinely is meant to let non-engineers edit prompts — but the mechanism is "edit the markdown file, open a PR, get reviewed, merge, deploy." The PR is the safety. Hot-loading from a CMS bypasses it.

---

### Move 2.5 — Current state vs future state

For contrl today: no LLM code, no prompts, no discipline to apply yet. The current state is "nothing to version, nothing to observe." The future state begins with the first commit to `src/lib/agent/system.md`.

```
              Phase A (now)                       Phase B (Phase 4 coaching agent)
              No LLM code in contrl              src/lib/agent/ on disk
  ─────────────────────────────────         ─────────────────────────────────
  ┌────────────────────────────┐            ┌──────────────────────────────┐
  │ (nothing here)              │            │ src/lib/agent/               │
  │                            │            │   system.md                  │
  │ Pose detection +           │            │   examples.md                │
  │ rep counter FSM are        │            │   runner.ts                  │
  │ deterministic code,        │            │   meta.json   (model + eval)  │
  │ not LLM-shaped             │            │   tools/*.ts                 │
  │                            │            │   tests/regression.test.ts   │
  │                            │            │                              │
  │ Nothing to log per-call    │            │ runtime API call to Anthropic │
  │ (no LLM provider)          │            │ logged with chain_version    │
  │                            │            │ + model + schema_pass        │
  └────────────────────────────┘            └──────────────────────────────┘

  The discipline applies the moment the first prompt file lands.
  Adopting it after the fact is materially harder.
```

The lesson: the structural discipline (file-per-prompt, version-controlled, reviewed, model-pinned, observable) should be there at commit one of the coaching agent — not added later as a refactor.

---

### Move 3 — The principle

Prompts are programs. The programs run on a non-deterministic interpreter (the LLM) and produce outputs that other code consumes. Every property a serious engineering team would want for a program — version control, code review, CI, deployment story, observability — applies. Prompts-as-code is the discipline of carrying those properties over. The reason it's worth naming as a discipline (instead of just doing it by default) is that the LLM API surface makes it look like prompts are "content" or "config" rather than "code," and teams that start by treating them as content struggle to upgrade later.

The full picture is below.

---

## Prompts-as-code — diagram

The full prompt lifecycle, from authoring to production observability, with every gate marked.

```
┌─ Authoring layer ────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌──────────────────────┐    ┌──────────────────────┐                        │
│  │  system.md           │    │  examples.md         │                        │
│  │  examples.md         │    │  ...                 │                        │
│  │  chain.ts            │    │                      │                        │
│  │  meta.json           │    │  (one chain per dir) │                        │
│  └──────────┬───────────┘    └──────────────────────┘                        │
└─────────────┼────────────────────────────────────────────────────────────────┘
              │
              ▼  git add + commit
┌─ Review layer ───────────────────────────────────────────────────────────────┐
│                                                                              │
│   PR opened with prompt change                                               │
│        │                                                                      │
│        ├──▶ Reviewer sees scoped diff (which section changed)                │
│        ├──▶ CI runs regression eval suite                                    │
│        │     → passes / blocks PR on regression                              │
│        └──▶ meta.json model version matches deployed runtime?                │
│                                                                              │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ merge to main
                                       ▼
┌─ Deployment layer ───────────────────────────────────────────────────────────┐
│                                                                              │
│   Prompts bundled into app at build time                                     │
│   PROMPT_VERSIONS[chain_name] = commit_sha     ◄─ baked at build              │
│                                                                              │
│   (Or: deployed to a config service behind a feature flag for gradual rollout) │
│                                                                              │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌─ Production runtime layer ───────────────────────────────────────────────────┐
│                                                                              │
│   chain.ts runs                                                              │
│        │                                                                      │
│        ├──▶ load system.md + examples.md (bundled)                           │
│        ├──▶ call Anthropic API                                               │
│        ├──▶ Zod.safeParse at boundary                                        │
│        └──▶ emit log entry:                                                  │
│              { chain_name, chain_version, model, input, output,              │
│                schema_pass, latency_ms, tokens }                             │
│                                                                              │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌─ Observability layer ────────────────────────────────────────────────────────┐
│                                                                              │
│   Logs queryable by chain_version, model, schema_pass, latency               │
│   Dashboards: schema-fail rate per chain, latency p99, tokens/call           │
│   Alerting: schema-fail rate exceeds 1% sustained                            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

The diagram crosses five layers. The cost of skipping any of them is a class of bug you can't debug — authoring layer skip means tangled diffs; review skip means caching/regression bugs land; deployment skip means hot-update incidents; observability skip means production incidents become research projects.

---

## In this codebase

**Case B planned — discipline lands with the Phase 4 coaching agent.**

contrl ships zero LLM code today. There are no prompts to version, no model pairings to track, no LLM calls to observe. The pose detection (MediaPipe) and rep counter (FSM) are deterministic code, not LLM-shaped — they live under normal source control without prompts-as-code being load-bearing.

When the Phase 4 Path C coaching agent lands, the planned shape carries the discipline from commit one:

- **File-per-prompt:** `src/lib/agent/system.md` (role + rules + tool definitions), `src/lib/agent/examples.md` (if used). Markdown so a PR diff highlights the section that changed.
- **`src/lib/agent/meta.json`** carries the model + tested-against eval set. The runner refuses to start if the configured model doesn't match `meta.model`.
- **Regression tests:** `tests/agent/regression.test.ts` runs the agent against 20–50 hand-curated workout scenarios. Required to pass before merge for any change to `system.md` or `meta.json`.
- **Production logging:** `runner.ts` logs `{ chain_version: GIT_SHA, model, input, output, schema_pass, latency_ms, tokens }` per call. `chain_version` is baked at build time from `git rev-parse HEAD`.

**ML side — analogous but distinct discipline.**

contrl's planned Phase 2C form classifier (LightGBM via ONNX) needs the same model-pinning discipline (which checkpoint, which preprocessing, which eval score) but expressed differently: the model itself is the versioned artifact, not a prompt file. The shared lesson: "what produced this output" must be reconstructable from a commit SHA, whether the producer is a markdown prompt or a `.onnx` model file. See [05-eval-driven-iteration](./05-eval-driven-iteration.md) for the ML-side variant.

---

## Elaborate

**Where this pattern comes from.** Prompts-as-code crystallized between 2023 and 2025 as production LLM systems matured. Simon Willison was an early proponent in his blog. Hamel Husain's eval-driven framing assumed it implicitly. By 2024, "LLMOps" emerged as a category (Weights & Biases, Humanloop, LangSmith, PromptLayer) all centered on this discipline. By 2026, it's industry consensus — the only debate is which specific tooling.

**The deeper principle.** The shift from "prompts as content" to "prompts as code" mirrors every transition where a previously-flexible artifact gets formalized into engineering practice. Migrations went the same way (handwritten SQL in chat logs → versioned migration files). Configuration went the same way (env vars in deploy scripts → IaC with state files). Each transition feels like overkill until you have one incident the new discipline would have prevented; then you can't go back.

**Where this breaks down.** Two places. First, **for genuinely prototype work**, full prompts-as-code is overkill. If you're three days into validating whether an LLM can do a task at all, putting prompts in version-controlled files with model-version meta and regression suites is busywork. Develop in a notebook, iterate against a small sample by hand, and only formalize once you've decided to ship. Second, **for one-shot prompts**, the discipline doesn't apply — a one-off prompt run once in a script doesn't need versioning, because there's nothing to version. The discipline kicks in once a prompt is going to be run twice or by anyone other than the author.

**What to explore next.**
- [01-anatomy](./01-anatomy.md) → the four-section structure that lives inside each prompt file.
- [05-eval-driven-iteration](./05-eval-driven-iteration.md) → the eval suite that makes prompt PRs reviewable.
- [11-meta-prompting](./11-meta-prompting.md) → aipe specifically as a meta-prompting tool.
- Hamel Husain's blog (eugeneyan.com is the broader hub) for evals-first framing.

---

## Tradeoffs

| Cost dimension | Prompts as code (this guide) | Prompts in template literals |
|---|---|---|
| File count | 4 per chain + tests | 1 per chain |
| PR diff readability | High — scoped to a section | Low — buried in a literal |
| Model-upgrade survivability | High — pairing makes it explicit | Low — no record of what was tested |
| A/B test feasibility | High — versions atomic | Low — both halves are the same string |
| Production debuggability | High — chain_version in logs | Low — no version trail |
| Author cost (first chain) | ~1 day to set up | ~1 hour |
| Author cost (next chain) | ~1 hour | ~1 hour |
| Onboarding cost | Read one chain folder, you know the pattern | Read the giant template, hope you got it |

### Sub-block 1 — what we gave up

Two real costs. First, **set-up overhead for the first chain** — building the scaffolding (chain.ts assembly, meta.json loading, observability hooks, the regression test harness) is a real day of work. The next four chains inherit it for free, but the first one isn't free. If you've never built the scaffolding before, plan that day.

Second, **navigation surface** — a chain that used to be one file is now a folder with four files. A reader looking for "the prompt" has to know which file has which section. This is mostly a Day-1 problem; once a reader has read one chain folder, they know the pattern. But the Day-1 cost is real.

### Sub-block 2 — what the template-literal alternative would have cost

I have shipped both. The template-literal alternative looks cheaper for ~3 weeks. Then:

- Week 4: First model upgrade. Need to test the new model. There's no eval suite, so you eyeball it. You miss the regression on a less-common input type.
- Week 6: A teammate edits the prompt. PR review is hard — the diff is hidden in a literal. The "concisely" addition lands in the wrong section.
- Week 8: A production incident — a bad output reached a user. Investigation: which prompt version produced it? Nobody knows. The chain has been touched 11 times by 3 people. Hours lost trying to reconstruct.
- Week 12: Team grows. Onboarding a new engineer requires explaining the whole template. They build a chain in a new pattern (because the existing pattern is hard to understand). Now you have two patterns.
- Week 16: Some PM wants A/B test on tone. You realize the template doesn't have version-atomic IDs and you can't actually run the test cleanly. Refactor.

The template-literal alternative costs 8 hours of refactor + 8 hours of incident investigation by week 16. Prompts-as-code from Day 1 costs 8 hours of scaffolding + 1 hour per subsequent chain. The crossover is around chain #3 or month #2, whichever comes first.

### Sub-block 3 — the breakpoint

Prompts-as-code is the right call until: (a) the project is genuinely a prototype where you're not sure if the LLM can do the task at all (iterate in a notebook; formalize later); (b) the project has exactly one prompt that runs once and is never touched again (formalization is overhead with no payoff); (c) you're working solo on a private project with no review, no team, and no production users (some of the discipline still helps — version control, model-version stamping — but the full pipeline is over-engineered). contrl's coaching agent will fit (c) at first (solo dev), but the model-pinning and per-call logging halves of the discipline still earn their place; the regression-CI half can wait until contrl has a second user.

### Sub-block 4 — what wasn't actually a tradeoff

"Loading prompts from files at runtime is slower than embedding them in code." This sounds reasonable and is wrong. Reading 4 small markdown files at module load is microseconds. The prompts are read once per process boot, cached in memory, and reused. There is no measurable runtime penalty.

---

## Tech reference (industry pairing)

### Git + GitHub PR review

- **Codebase uses:** Standard. contrl already ships through normal git/PR workflow; the coaching agent's prompts will inherit it by default.
- **Why it's here:** the canonical way to version-control, review, and audit any text-based artifact. Prompts are text; this is the natural home.
- **Leading today:** Git + GitHub PRs — `adoption-leading` for version control of text artifacts, 2026.
- **Why it leads:** universal tool literacy on engineering teams; PR-level diff display works on markdown; review tooling integrates with CI.
- **Runner-up:** GitLab MRs, identical pattern with a different platform.

### Markdown for prompt content

- **Codebase uses:** Planned — `src/lib/agent/system.md` and `src/lib/agent/examples.md` as markdown when the coaching agent lands.
- **Why it's here:** human-readable, renders in PR diffs, no compile step, LSP-friendly.
- **Leading today:** Markdown — `adoption-leading` for prompt content storage in 2026.
- **Why it leads:** the format is universal; the file IS the artifact; no template-to-prompt compile step required.
- **Runner-up:** YAML — used by some teams to bundle prompt + metadata in one file; tradeoff is harder readability and indentation footguns.

### Humanloop / LangSmith / PromptLayer (prompt observability platforms)

- **Codebase uses:** Not yet — contrl's planned observability uses native logging to the app's existing log pipeline (console for solo dev). Hosted platforms are study material; at solo scale the cost isn't justified.
- **Why it's here:** the LLMOps category — hosted services that record LLM calls with prompt version, input, output, latency, cost. Make the observability layer turnkey.
- **Leading today:** LangSmith — `innovation-leading` for prompt observability and tracing in 2026.
- **Why it leads:** integrates with LangChain (the LLM-orchestration leader), provides traces for multi-step chains, supports A/B testing primitives.
- **Runner-up:** Humanloop and PromptLayer — comparable feature set; choice depends on team preferences for UX and pricing model.

### Vercel AI SDK / LangChain (prompt assembly libraries)

- **Codebase uses:** Not yet. The curriculum prefers building the assembly manually to internalize what's happening; production work would adopt one of these.
- **Why it's here:** the libraries that handle prompt assembly, provider abstraction, streaming, and tool-calling boilerplate.
- **Leading today:** Vercel AI SDK — `innovation-leading` for TypeScript-native prompt orchestration in 2026.
- **Why it leads:** typed end-to-end, streaming-native, framework-agnostic (works in Next.js, Remix, plain Node), small surface.
- **Runner-up:** LangChain JS — `adoption-leading` for prompt orchestration in production codebases; broader feature set, larger surface, can be over-engineered for simple chains.

---

## Project exercises

contrl ships no LLM code today. These become buildable when the Phase 4 coaching agent lands.

### [B4C.scaffold] Set up the coaching agent folder

- **Exercise ID:** `[B4C.scaffold]`
- **What to build:** Create `src/lib/agent/` with `system.md`, `examples.md` (if used), `runner.ts`, `meta.json`, `tools/*.ts` (5 read-only tools), `tests/agent/regression.test.ts`. The folder shape is the structural artifact — every later prompt edit edits one file in this folder.
- **Why it earns its place:** the structure-defining build. The discipline locks in from commit one.
- **Files to touch:** the directory listed above.
- **Done when:** runner.ts loads `system.md` at boot, makes an API call against a sample workout, and logs `{chain_version, model, schema_pass}`. Regression test runs against a 20-case fixture and prints pass/fail counts.
- **Estimated effort:** `1–2 days`

### [B4C.version-log] Bake the chain_version into logs

- **Exercise ID:** `[B4C.version-log]`
- **What to build:** A build-time step that reads `git rev-parse HEAD` and bakes it into `PROMPT_VERSION` the runner imports. Every log entry includes this version.
- **Why it earns its place:** the observability primitive that turns production debugging from "research project" to "git checkout." Without this, reproducing a bad output isn't deterministic.
- **Files to touch:** `scripts/bake-prompt-version.ts`, generated `src/lib/agent/prompt-version.ts`, consumed in `runner.ts`.
- **Done when:** changing any file in `src/lib/agent/`, rebuilding, and running the agent logs a different `chain_version` than before.
- **Estimated effort:** `<1hr`

### [B4C.meta-model] Pair the agent to a model version

- **Exercise ID:** `[B4C.meta-model]`
- **What to build:** Add `src/lib/agent/meta.json` with `{ model: "claude-sonnet-4-6", tested_at, eval_score, regression_run }`. The runner reads `meta.model` at boot and throws if the configured runtime model doesn't match.
- **Why it earns its place:** the safety rail against "tested on Sonnet 4-6, accidentally deployed against the next model release." Every model change is a PR with re-run evals in the same diff.
- **Files to touch:** `src/lib/agent/meta.json`, the model-check at the top of `runner.ts`.
- **Done when:** setting `model` in `meta.json` to a value other than the configured runtime model causes a clear boot-time error.
- **Estimated effort:** `<1hr`

---

## Summary

Prompts are source code: one file per prompt, version-controlled, diff'd in PRs, paired to a model version, observable in production. The pattern shifts prompts from "content" (a string in a template literal, mutable, untracked) to "code" (a versioned artifact with a commit hash that traces back from every production call). The cost is one day of scaffolding for the first chain and one hour per subsequent chain; the value is the ability to debug, A/B test, and survive model upgrades. Meta-tooling codebases (slash-command frameworks like aipe) demonstrate the discipline in its cleanest form — every spec is a versioned markdown file under PR review.

**Key points:**

- **One prompt = one file.** The system prompt, the few-shot examples, the chain assembly, the tests — separate files in a chain folder.
- **`meta.json` pairs each prompt to a model version + eval score.** Changing the model is a PR that re-runs evals.
- **Production logs carry `chain_version` (a commit SHA).** Every production output traces back to the exact files that produced it.
- **The pattern crosses five layers: authoring → review → deployment → runtime → observability.** Skip any of them and a class of bug becomes undebuggable.
- **For contrl, the discipline lands with commit one of the coaching agent.** Adopting it later — once 50 chain edits exist — is materially harder than carrying it from the start.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "how do you version prompts in production?", they want to hear whether you've shipped through a model upgrade and survived. The signal is in whether you mention `meta.json` (or its equivalent), production logging with commit SHAs, and the discipline of paired-eval-on-upgrade. A candidate who says "we keep them in source control" has the floor right but not the discipline — git is necessary but not sufficient.

### Likely questions

**[mid] Where do your prompts live in the codebase?**

Each chain has its own folder. Inside: `system.md` (system prompt), `examples.md` (few-shot examples), `chain.ts` (assembly + API call), `meta.json` (paired model version + eval score), and `tests/regression.test.ts` (the regression suite). The folder structure is the prompt's first-class API.

```
  chains/intent-classify/
    system.md       ◄─ the prompt's system section
    examples.md     ◄─ few-shot
    chain.ts        ◄─ assembles them + calls the LLM
    meta.json       ◄─ model version pairing
    tests/
      regression.test.ts
```

---

**[senior] What's the actual mechanism that prevents a model upgrade from breaking a chain silently?**

Three things stacked. First, `meta.json` lists the tested model. The chain loader throws at boot if `meta.model` doesn't match the configured runtime model — so the runtime literally won't accept a mismatch. Second, the PR that upgrades the model also re-runs the regression suite; the diff includes the new eval score, so the team explicitly sees what changed. Third, production observability logs `chain_version` and `model` with every call — if a regression slips through despite the first two, the logs let you correlate quality drops with model changes within hours.

```
  Three gates against silent model-upgrade regression

  Gate 1: chain loader vs runtime
  ┌──────────────────────────────┐
  │ meta.model: "sonnet-4-6"     │
  │ runtime: "sonnet-4-6"        │  ✓ pass
  └──────────────────────────────┘
  ┌──────────────────────────────┐
  │ meta.model: "sonnet-3"       │
  │ runtime: "sonnet-4-6"        │  ✗ throw at boot
  └──────────────────────────────┘

  Gate 2: PR re-runs evals on model change
  ┌──────────────────────────────────────────────┐
  │ diff: meta.model: 3 → 4                       │
  │ diff: meta.eval_score: 0.94 → 0.91            │  ◄─ visible to reviewer
  └──────────────────────────────────────────────┘

  Gate 3: production observability
  ┌────────────────────────────────────────────────┐
  │ logs: { chain_version, model, latency, ... }   │
  │ dashboard: schema-fail rate per model           │  ◄─ catches drift
  └────────────────────────────────────────────────┘
```

---

**[arch] How does this scale as the prompt count grows from 5 to 50?**

The 5-chain version is hand-organized — one folder per chain, hand-written meta, manual regression scripts. At 50, three things shift. First, you need a chain registry — a manifest of which chains exist, what models they target, when they were last evaluated. Hand-written `meta.json` per folder doesn't scale to 50 audits per quarter. Second, the regression suite becomes a parallelizable pipeline — you can't run 50 evals serially before each PR. Third, the deployment story matters more — you can't redeploy the whole app every time a prompt changes; you adopt a config-service pattern with feature flags. None of these break the architecture; they just promote in-house tooling that was implicit at 5 chains.

```
  Scale-related infrastructure

  ┌─────────────────────────┬────────────────┬──────────────────────────┐
  │                         │ 5 chains       │ 50 chains                 │
  ├─────────────────────────┼────────────────┼──────────────────────────┤
  │ Chain registry          │ Implicit (read │ Explicit (manifest        │
  │                         │ the folder)    │ file + audit pipeline)    │
  │ Regression suite        │ Serial, fast   │ Parallel, hours sometimes │
  │ Deployment              │ Bundle + deploy│ Config service + flags    │
  │ Observability           │ Logs + grep    │ Dashboard per chain       │
  │ Author count            │ 1–2             │ 5–10+                    │
  └─────────────────────────┴────────────────┴──────────────────────────┘
```

---

### The question candidates always dodge

**"Internet advice says 'just keep prompts in code.' What's wrong with that?"**

Nothing's wrong with it as a starting point — that's literally the floor of prompts-as-code. What's wrong is treating it as the ceiling. "In code" without the rest of the discipline — model-version pairing, eval suite, production observability — gives you version control but doesn't give you the debugging and safety properties. The shipped version of prompts-as-code is "in code" PLUS those four other things. Saying "we keep prompts in code" is the same as saying "we use git for source code" — true but incomplete. The interview signal is whether the candidate names the rest of the stack.

```
  The minimum vs the production version

  ┌──────────────────────────┬──────────────────────────────────────┐
  │ Minimum (everyone)       │ Production (the discipline)          │
  ├──────────────────────────┼──────────────────────────────────────┤
  │ In source control        │ + One file per prompt section        │
  │                          │ + meta.json with model pairing       │
  │                          │ + Regression eval suite in CI        │
  │                          │ + chain_version in production logs   │
  │                          │ + Safe deployment story              │
  └──────────────────────────┴──────────────────────────────────────┘
```

---

### One-line anchors

- "One prompt equals one file. Folder-per-chain, four files per folder."
- "meta.json pairs the prompt to a model version + eval score; the loader enforces the pairing."
- "Production logs carry chain_version — a commit SHA — for every LLM call."
- "Prompt changes are PRs that re-run the regression suite. No exceptions for 'small tweaks.'"
- "For contrl, the discipline applies the moment the coaching agent ships. Adopting it later is materially harder."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the five-layer pipeline: authoring → review → deployment → runtime → observability. Under each layer name, one example of what happens (e.g., "regression eval runs" under review).

Pass: you named all five layers and at least one concrete activity per layer.

**Level 2 — Explain it out loud.**
Without notes, in under 90 seconds: "How do you version prompts in production?" Checkpoints:
- Did you mention `meta.json` (or equivalent)?
- Did you name model-version pairing as a safety rail?
- Did you mention production logging with a commit SHA?

If you skipped any: you described git, not the discipline.

**Level 3 — Apply to a new scenario.**
A user reports that a chain's output was wrong on a specific day three weeks ago. Walk through the steps to reproduce the call deterministically. Cite the production log fields you'd look at, the git commands you'd run, and the local steps to reproduce.

Expected: query the production logs for the call with the user's input + timestamp; extract `chain_version`; `git checkout <chain_version>`; open the chain folder; replay the call against the same model with the same parameters. Reference: `/Users/rein/Public/contrl/.aipe/study-prompt-engineering/03-prompts-as-code.md` Move 2 Layer 3.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is "more files per chain." If you were starting a new project today with one or two chains, would you still set up the full folder + meta + regression structure, or would you delay until you had three or four chains?

There's no right answer. Defend with reference to the crossover point in Sub-block 2 (around chain #3 or month #2).

**Quick check — code reference test.**
Without opening files, answer:
- Where will contrl's coaching-agent system prompt live?
- What field in `meta.json` causes the agent loader to throw on mismatch?
- What's the SHA-based identifier production logs carry?

Pass: you said `src/lib/agent/system.md`, `meta.model`, `chain_version`.

---
