# Forbidden patterns and rotating formulas

**Industry name(s):** Forbidden patterns, anti-patterns, rotation list, output-style constraints, anti-formulaic prompting
**Type:** Industry standard

> LLMs converge on phrasings. Every output from the same generative chain sounds the same — same openers, same transitions, same closing flourishes. The mechanism: list forbidden phrasings explicitly; enumerate rotating formulas; periodically rotate which formulas are "allowed this week." Matters for repeated generative chains run for the same user.

**See also:** → [05-eval-driven-iteration](./05-eval-driven-iteration.md) · → [10-self-critique](./10-self-critique.md) · → [08-few-shot](./08-few-shot.md)

---

## Why care

**Move 1.** You ship a chain that writes captions for the user's journal entries. The user logs three entries on Day 1; reads three captions. Day 2: three more entries; three more captions. Day 7: the user notices that every caption starts with "In a moment of reflection..." or "Looking back at this entry...". By Day 14, the user mentally skips the captions — they all blur. The chain is technically working — captions are grammatical, on-topic, contextually relevant — but the LLM has converged on a small set of phrasings that feel canned. The user's engagement drops.

**Move 2.** That "every output sounds the same" question is what forbidden-patterns answers. Not whether the output is correct. Not whether it's grammatical. Just: does the output have variety? LLMs trained on diverse text still converge on a small set of preferred phrasings when run repeatedly on similar inputs. The fix: explicitly list forbidden openers, enumerate rotating formulas, periodically rotate which formulas are "allowed this week," and verify variety with a check on the most-recent-N outputs.

**Why you need to answer that question at all:** Two failure modes hide in generative chains run repeatedly for the same user. First, **user fatigue** — the user stops engaging with output that all sounds the same. Captions that begin with the same five openers in rotation become invisible after a week. Second, **homogenization across users** — multiple users get the same output style, which means there's no personalization happening even when there ought to be. The chain produces functionally identical text for everyone. The fix is structural — forbid specific patterns, enumerate alternatives, rotate the alternatives, monitor.

**Before / after.**

Without forbidden patterns:
- Caption chain runs daily. Every caption starts with one of ~5 phrasings the model defaults to: "In a moment of...", "Looking back at...", "This entry captures...", "Reflecting on...", "A glimpse into..."
- Day 14: user notices. Day 21: user disengages from the captions. Chain works mechanically; product value is degrading.
- No metric catches this — output is "correct" by every individual measure.

With forbidden patterns:
- System prompt lists the 5 default openers as forbidden ("Do not begin with: 'In a moment...', 'Looking back...', 'This entry captures...', 'Reflecting on...', 'A glimpse into...'").
- System prompt enumerates 12 alternative opener formulas with examples ("Use one of: simple statement + question, direct address, surprising observation, time-anchored detail, ...").
- The chain produces varied openers; the user doesn't notice repetition for weeks.
- Periodic rotation: every 30 days, the team reviews the most-used openers from production logs and adds the most-overused ones to the forbidden list, swapping in new ones.

**Move 5.** Forbidden patterns are what `eslint --no-restricted-syntax` is for application code — explicit bans of patterns that work but produce bad UX. The discipline is the same: enumerate what you don't want, enforce at the boundary.

---

## How it works

### Move 1 — The mental model

Picture a copy editor reviewing a writer who has a tic — every paragraph starts with "Interestingly..." The editor doesn't tell the writer "be more varied." That's vague. The editor says "ban 'interestingly' as an opener. Here are six alternatives. Use them." The writer's outputs vary in concrete ways the editor can verify.

LLMs are the writer with tics. Vague "be varied" doesn't work; specific "ban these openers; use these alternatives" does.

The strategy in plain English: **enumerate forbidden phrasings; enumerate rotating alternatives; rotate the alternatives over time; verify variety with a recent-outputs check.**

```
  Forbidden patterns + rotating formulas (the copy-editor analogy)

  ┌──────────────────────────────────────────────────────────────────┐
  │ System prompt:                                                    │
  │                                                                   │
  │   FORBIDDEN OPENERS (do not use any of these):                    │
  │   - "In a moment of reflection..."                                │
  │   - "Looking back at this..."                                     │
  │   - "This entry captures..."                                      │
  │                                                                   │
  │   ROTATING FORMULAS (use one, varying across outputs):            │
  │   1. Simple statement followed by a question                      │
  │   2. Direct second-person address                                 │
  │   3. Time-anchored sensory detail                                 │
  │   4. Surprising observation                                       │
  │   ...                                                             │
  │                                                                   │
  │   RECENT USES (do not repeat):                                    │
  │   - Last 3 captions used: formula 2, formula 4, formula 1.        │
  │   - Use formula 3, 5, 6, or 7 this time.                          │
  └──────────────────────────────────────────────────────────────────┘
```

The model has a list of bans, a list of alternatives, and (optionally) a list of recent uses to avoid. The output varies in concrete ways.

---

### Move 2 — The layered walkthrough

#### Layer 1: forbidden phrasings

The first layer is naming specific phrasings the chain produces too often. Find them by running the chain N times on diverse inputs and reading the outputs — the model's defaults will be obvious.

```ts
// Illustrative — forbidden phrasings declared in a generative chain's system.md

FORBIDDEN OPENERS (the model defaults to these; avoid):
  - "In a moment of reflection..."
  - "Looking back at this entry..."
  - "This entry captures..."
  - "Reflecting on your day..."
  - "A glimpse into..."

FORBIDDEN TRANSITIONS:
  - "Interestingly..."
  - "It's worth noting that..."

FORBIDDEN CLOSINGS:
  - "...a reminder that..."
  - "...something to carry forward."
```

These are concrete, testable bans. Not "avoid clichés" (vague) but specific phrases that appear in the model's outputs.

```
  Discovering the model's defaults

  Run the chain 50 times on diverse inputs.
  Read all 50 outputs.
  Tally opener phrasings:
    "In a moment of reflection..."   17 (34%)
    "Looking back at..."             11 (22%)
    "This entry captures..."          8 (16%)
    other openers                    14 (28%)

  Top 3 → forbidden list.
```

Boundary condition: forbidden lists drift. The model that converged on "In a moment of reflection..." last quarter may converge on a new phrasing this quarter after a model upgrade. Re-run the survey every 2–3 months; update the forbidden list.

---

#### Layer 2: rotating formulas

Banning isn't enough. The model needs alternatives. List them explicitly with worked examples.

```
  ROTATING OPENER FORMULAS (pick one per output, varying across outputs):

  1. Simple statement + question
     Example: "The conversation was hard. But did you say what you needed?"

  2. Direct second-person address
     Example: "You wrote about your brother today."

  3. Time-anchored sensory detail
     Example: "Tuesday afternoon — the design review still in your head."

  4. Surprising observation
     Example: "There's a contradiction in this entry."

  5. Pattern recognition across entries
     Example: "Three entries this week mention sleep."

  6. Sparse, direct fragment
     Example: "Late. Tired. Honest."

  ...up to 10–15 formulas
```

The examples are the load-bearing part. Without them, the model interprets "simple statement + question" creatively in ways you don't want.

Boundary condition: formulas should be genuinely varied, not slight reformulations of each other. "Direct second-person" and "Direct first-person" both produce similar texture; consider one or the other. The goal is variety the user can perceive.

---

#### Layer 3: recent-uses awareness

For chains running repeatedly for the same user, pass in a list of "what we used recently" so the model can avoid immediate repetition.

```ts
// Illustrative — runtime that queries recent outputs and injects them into the per-call prompt
const recentCaptions = await db.getRecentCaptionsForUser(userId, { limit: 5 });
const recentFormulas = recentCaptions.map(c => c.formula_used);

const systemPrompt = `
  ... (forbidden + formulas) ...

  RECENTLY USED (the last 5 captions for this user used):
  - Formula 2 (direct address)
  - Formula 4 (surprising observation)
  - Formula 1 (statement + question)
  - Formula 2 (direct address)  ◄─ used twice in last 5
  - Formula 6 (sparse fragment)

  For this caption, use a formula NOT in this recent list. Prefer
  formulas 3, 5, or 7.
`;
```

This requires the chain to *track* which formula it used per output — which means the output schema includes a `formula_used` field. The schema becomes both the variety enforcement AND the audit trail.

```ts
const CaptionResult = z.object({
  caption: z.string(),
  formula_used: z.number().int().min(1).max(15).describe(
    "Which of the rotating formulas (1-15) was used for this caption."
  ),
});
```

```
  Schema-tracked formula usage

  ┌────────────────────────────────────────────────────────────────┐
  │ Output: {                                                       │
  │   caption: "Late. Tired. Honest.",                              │
  │   formula_used: 6                                                │
  │ }                                                               │
  └────────────────────────────────────────────────────────────────┘
                          │
                          ▼ logged + queried for next call
  ┌────────────────────────────────────────────────────────────────┐
  │ Recent captions table                                           │
  │   (user_id, caption, formula_used, created_at)                   │
  └────────────────────────────────────────────────────────────────┘
                          │
                          ▼ feeds next call's RECENTLY USED list
```

Boundary condition: tracking formula usage is overhead worth paying when the chain runs repeatedly for the same user. For chains that run once-per-input for diverse users, recent-uses awareness adds value only at the per-user level. If the chain doesn't have a user concept, skip this layer.

---

#### Layer 4: periodic rotation

Even with rotating formulas, the model favors a subset. Maybe formulas 1 and 4 are easier to apply and get used 40% of the time despite the rotation. Periodically (monthly?) review production logs and rotate which formulas are "allowed this week."

```
  Periodic rotation audit (monthly)

  Production log review:
    Last 30 days, formula_used distribution:
      Formula 1: 28%
      Formula 4: 23%
      Formula 2: 19%
      Formula 6: 12%
      Formula 3: 7%
      Formula 5: 6%
      Formula 7: 5%

  Action: temporarily remove formulas 1 and 4 from the active set
  for the next month. Verify formulas 3, 5, 7 get used more.

  Or: ADD formulas 1 and 4 to the FORBIDDEN list for the next month.
```

This is the periodic-rotation discipline. The chain itself rotates within a session; the human rotates the rotation across months.

```
  Rotation cycles

  ┌──────────────────────────────────────────────────────────────┐
  │ Per-call rotation: chain picks formula not in recent_used    │
  ├──────────────────────────────────────────────────────────────┤
  │ Per-user rotation: chain avoids that user's recent formulas  │
  ├──────────────────────────────────────────────────────────────┤
  │ Per-month rotation: team rotates which formulas are active   │
  └──────────────────────────────────────────────────────────────┘
```

Boundary condition: periodic rotation is real maintenance work — someone has to review the logs monthly and update the system prompt. For low-volume chains, the cost may exceed the benefit. For high-volume user-visible chains (a daily caption that thousands of users see), the maintenance is justified.

---

#### Layer 5: variety checks in self-critique

If the chain has self-critique (see [10-self-critique](./10-self-critique.md)), one of the critique dimensions can be variety — does this output's formula match the user's recent outputs?

```ts
const CaptionCritique = z.object({
  formula_unique_vs_recent: z.boolean().describe(
    "Does this caption use a formula different from the user's last 3 captions?"
  ),
  forbidden_phrasing_absent: z.boolean().describe(
    "Does this caption avoid all phrasings in the FORBIDDEN list?"
  ),
});
```

The critic flags variety violations; the revision pass produces a varied output. Adds 2× cost; useful for high-stakes generative chains.

---

### Move 2.5 — Current state vs future state (contrl coaching agent)

The coaching agent is the planned contrl surface where this matters most — the agent fires once or twice per workout, so the same user reads similar coaching outputs daily. Convergence is the failure mode the discipline prevents:

```
              Phase A (initial ship)               Phase B (mature)
              Static forbidden list                Dynamic rotation
  ─────────────────────────────────────         ─────────────────────────────────────
  ┌──────────────────────────────────┐          ┌──────────────────────────────────┐
  │ system.md lists:                  │          │ system.md lists:                  │
  │   - 5 forbidden openers (hand-curated)│      │   - 5 forbidden openers (rotated  │
  │   - 8 rotating formulas with examples │      │     monthly based on prod logs)   │
  │   - Per-call: include recent_formulas │      │   - 8 formulas, monthly active set │
  │     in the prompt                     │      │   - Self-critique includes        │
  │                                       │      │     variety check                  │
  │ Audit: weekly read 20 outputs;        │      │ Audit: automated dashboard         │
  │   spot trend; manually update         │      │   on formula distribution          │
  │   forbidden list                       │      │                                   │
  └──────────────────────────────────┘          └──────────────────────────────────┘
                                                                                       
  Manageable for solo-dev scale.                  Worth automating at multi-user scale.
  Maintenance is real but tractable.              Audit dashboard catches regressions.
```

The lesson: the discipline doesn't fundamentally change between phases. The automation does. Phase A is hand-curated lists; Phase B is the same lists with monitoring on top.

---

### Move 3 — The principle

LLMs converge on phrasings. The convergence isn't a bug — it's a statistical property of the training distribution. The defense is structural: enumerate the convergence points; ban them; provide alternatives; rotate periodically. Without this discipline, every generative chain in production produces output that all sounds the same within weeks. With the discipline, variety becomes a tracked metric — formula distribution per user, per month, per chain — and the convergence is visible and counterable.

The full picture is below.

---

## Forbidden patterns — diagram

The five-layer enforcement pipeline.

```
┌─ System-prompt layer ────────────────────────────────────────────────────────┐
│                                                                              │
│   FORBIDDEN PHRASINGS:                                                       │
│     - opener 1                                                               │
│     - opener 2                                                               │
│     - transition 1                                                           │
│     - closing 1                                                              │
│                                                                              │
│   ROTATING FORMULAS (with worked examples):                                  │
│     1. ...                                                                   │
│     2. ...                                                                   │
│     ...                                                                      │
│     15. ...                                                                  │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ per-call assembly
                                      ▼
┌─ Per-call recent-uses layer ─────────────────────────────────────────────────┐
│                                                                              │
│   RECENTLY USED (for this user):                                             │
│     - formula 2 (last)                                                       │
│     - formula 4                                                              │
│     - formula 1                                                              │
│   → use a formula NOT in this list                                           │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ LLM call
                                      ▼
┌─ Output schema layer ────────────────────────────────────────────────────────┐
│                                                                              │
│   { caption: string, formula_used: int }                                     │
│   → formula_used is tracked, logged, queried next time                       │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Self-critique layer (optional) ─────────────────────────────────────────────┐
│                                                                              │
│   Critic checks:                                                             │
│     - formula_unique_vs_recent: bool                                         │
│     - forbidden_phrasing_absent: bool                                        │
│   → revision pass if any fail                                                │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ Periodic-rotation layer (monthly) ──────────────────────────────────────────┐
│                                                                              │
│   Team reviews formula_used distribution.                                    │
│   Rotates: forbids the over-used; promotes the under-used.                   │
│   Updates system.md; ships through prompts-as-code pipeline.                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

The five layers operate at different cadences: per-call (recent-uses + schema), per-call optionally (critic), per-month (human rotation). Together they prevent the convergence-on-phrasings failure mode.

---

## In this codebase

**Case B planned — coaching agent rotation discipline.**

contrl's coaching agent is the canonical Case B for this concept. The agent runs every workout for the same user (~1-2 calls/day, ~10/week, ~500/year). Without rotation discipline, every coaching message will start with "Great work on that set!" or open the same three openers indefinitely. Within two weeks the user notices; within a month they ignore the message entirely.

Planned shape:

- **`src/lib/agent/system.md`** declares forbidden openers (`"Great work"`, `"Nice job"`, `"You're crushing it"`, `"Solid effort"`, `"Way to push"`) and lists 8-12 rotating "coaching formulas" with worked examples (e.g., "Cite a specific cue and the rep number where you saw it", "Reference progress against the user's last session on this exercise", "Suggest a specific rep target for next set", etc.).
- **`src/lib/agent/runner.ts`** queries the last 7 days of coaching messages for the user (via `get_recent_coaching` tool) and injects "RECENTLY USED FORMULAS: [3, 7, 2]" into the per-call assembly. The agent picks a formula NOT in the recent list.
- **`src/lib/agent/schemas.ts`** output includes `formula_used: number` (the formula index) for the audit trail. Tracked over time; the formula_used distribution per user becomes a quality metric.
- **Monthly maintenance:** review the per-user formula_used distribution. If any single formula exceeds 25% usage for any user, rotate it out of the active set in `system.md` and promote a replacement.

The discipline is named explicitly in the planned curriculum considerations for the coaching agent (Phase 4 Path C).

**ML side — not applicable.**

The form classifier produces an enum class; there's no "phrasing convergence" failure mode. The discipline applies only to generative LLM outputs.

---

## Elaborate

**Where this pattern comes from.** Forbidden-patterns prompting crystallized 2023–2025 as production LLM-powered content tools (newsletter generators, caption tools, email assistants) ran into the same convergence problem. The solution converged on "explicit bans + explicit alternatives" — the parallel to anti-spam techniques in earlier content systems. Hamel Husain's writing on production prompt engineering mentions this discipline; it appears in OpenAI cookbook entries for content-generation tasks.

**The deeper principle.** Generative LLMs have a "voice" — a statistical center of their training distribution. When run repeatedly, the voice dominates. Explicit constraints push the output away from the center. The discipline parallels how human writers' editors fight tics — name the tic, demand alternatives, audit periodically. The LLM equivalent isn't an editor; it's structural constraints in the system prompt with audit on the output side.

**Where this breaks down.** Three cases.

1. **Chains that run rarely per user.** A summary chain that runs once a year per user has no convergence problem because the user doesn't see enough outputs to notice. Forbidden-patterns is overhead.
2. **Chains where variety isn't a goal.** A classifier that returns enum labels has no phrasing to vary. The discipline doesn't apply.
3. **Truly creative open-ended generation.** A chain producing genuinely creative output (poetry, fiction) where each output is creative-by-design — forbidden lists may stifle the variety they're meant to encourage if applied bluntly. Use forbidden lists for *known bad* phrasings only; let the model find its own variety in the rest.

**What to explore next.**
- [05-eval-driven-iteration](./05-eval-driven-iteration.md) → variety becomes one of the eval rubric dimensions.
- [10-self-critique](./10-self-critique.md) → the critic checks for forbidden phrasings; another layer of enforcement.
- [03-prompts-as-code](./03-prompts-as-code.md) → the forbidden list lives in source control; monthly rotation is a PR.

---

## Tradeoffs

| Cost dimension | Forbidden patterns + rotation | No discipline |
|---|---|---|
| System-prompt tokens | +300–800 for forbidden + formulas | Baseline |
| Maintenance | Monthly rotation review | None |
| Output variety after 30 days | High — diverse phrasings | Low — converged on 3–5 defaults |
| User engagement (recurring chain) | Sustained | Degrades over weeks |
| Setup cost | 2–4 hours per chain | Zero |
| Per-call latency | Negligible | Baseline |
| Schema overhead | One field (formula_used) | None |

### Sub-block 1 — what we gave up

Two costs. First, **prompt tokens** — the forbidden list + rotating formulas with examples is 300–800 tokens of system prompt. Cached, so per-call cost is low, but it does inflate the prefix. Second, **maintenance** — monthly rotation review means someone reviewing logs, identifying the over-used formulas, and updating the system prompt. For a chain running thousands of times per day, the maintenance is justified by the user-engagement preservation. For a low-volume chain, the maintenance overhead may exceed the benefit.

### Sub-block 2 — what no discipline would have cost

I have shipped this without the discipline. The cost showed up at Day 14 with a user complaint: "Every entry caption sounds the same. Why?" Investigation: the model had converged on 4 openers covering 78% of outputs. Adding the forbidden list + 8 rotating formulas took an afternoon. Within a week, the formula distribution flattened. The user complaint stopped. Lost: the user's trust in the caption feature; some users had already stopped reading the captions and didn't come back even after the fix.

Doing it upfront prevents the user-trust event. The work is the same hours either way.

### Sub-block 3 — the breakpoint

Forbidden patterns + rotation is the right call until: (a) the chain runs rarely per user (annual summary, one-time greeting) — no convergence pressure; (b) variety isn't a goal (classifier, structured extractor) — nothing to vary; (c) the chain is genuinely creative and the model's defaults are what you want (rare; usually they're not). For most generative chains run repeatedly for the same user, the discipline is right.

### Sub-block 4 — what wasn't actually a tradeoff

"Rotating formulas degrade output quality." Sometimes raised — won't the model produce worse output if constrained? Empirically no, when the formulas are well-chosen and the examples are good. The constraint pushes the model away from its laziest defaults toward more thoughtful phrasings. Quality goes UP, not down, in my testing.

---

## Tech reference (industry pairing)

### Anthropic system-prompt formatting for constraints

- **Codebase uses:** Not yet — planned for contrl's coaching agent system prompt.
- **Why it's here:** the system-prompt structure for listing forbidden + rotating items. Anthropic models respond well to explicit ALL-CAPS section headers ("FORBIDDEN:", "ROTATING FORMULAS:") inside the system prompt.
- **Leading today:** Plain-text structured system prompts — `adoption-leading` for explicit-constraint prompts, 2026.
- **Why it leads:** Anthropic and OpenAI both train against this format; ALL-CAPS section markers parse as boundaries; works across providers.
- **Runner-up:** XML-tag delimited constraints (`<forbidden>...</forbidden>`) — Anthropic-leaning; also works.

### Audit dashboards for formula distribution

- **Codebase uses:** Not yet — planned for contrl's coaching agent. At solo scale, a monthly read of the `coaching_logs` table suffices; the dashboard is study material until volume grows.
- **Why it's here:** the dashboard that surfaces formula distribution over time. Sustained over-use triggers a rotation decision.
- **Leading today:** Custom queries against production logs — `adoption-leading` for low-tooling teams; LangSmith / Humanloop offer hosted dashboards.
- **Why it leads:** the data is already there in production logs (formula_used field); dashboards are just SELECT queries. Hosted tools add UI and aggregation.
- **Runner-up:** Manual monthly review of the database — works at low scale; becomes overhead at large scale.

### Periodic prompt-version bumps as the rotation mechanism

- **Codebase uses:** Not yet — planned for contrl's coaching agent monthly rotation.
- **Why it's here:** the deployment story for rotation. Updating the forbidden + active formula list ships as a normal prompt PR through the prompts-as-code pipeline.
- **Leading today:** prompts-as-code pipeline (see file 03) — `adoption-leading` for shipping prompt changes safely, 2026.
- **Why it leads:** rotation IS a prompt change; goes through normal review + eval-suite checks; auditable in git history.
- **Runner-up:** Hot-loaded prompts from a CMS — faster updates; loses the review safety.

---

## Project exercises

### [B4C.survey-defaults] Discover the coaching agent's default openers

- **Exercise ID:** `[B4C.survey-defaults]`
- **What to build:** Run the (planned) coaching agent 50 times against diverse synthetic workout scenarios. Tally the opener phrasings. Identify the top 3–5 phrasings the model defaults to (likely candidates: "Great work", "Nice job", "Solid set", "You're crushing it").
- **Why it earns its place:** the discovery step. Without knowing the model's defaults, the forbidden list is hand-wavy. With them, it's concrete.
- **Files to touch:** a script under `scripts/survey-coaching-defaults.ts`.
- **Done when:** 50 outputs are tallied; top phrasings are documented in `docs/coaching-defaults-survey.md`; the data informs the system.md forbidden list.
- **Estimated effort:** `1–4hr`

### [B4C.formulas] Write forbidden + rotating formulas into system.md

- **Exercise ID:** `[B4C.formulas]`
- **What to build:** Add to `src/lib/agent/system.md`: explicit forbidden phrasings (from B4C.survey-defaults), 8-12 rotating coaching formulas with worked examples, and a placeholder for `RECENTLY USED FORMULAS: [...]` to be filled per-call by the runner.
- **Why it earns its place:** the canonical forbidden-patterns discipline applied to the coaching agent.
- **Files to touch:** `src/lib/agent/system.md`; update `runner.ts` to inject `recent_formulas` (queried via the `get_recent_coaching` tool).
- **Done when:** outputs don't begin with any forbidden opener; outputs visibly vary across calls.
- **Estimated effort:** `1–4hr`

### [B4C.formula-track] Add formula_used tracking

- **Exercise ID:** `[B4C.formula-track]`
- **What to build:** Add `formula_used: number` to the coaching agent's output schema. Persist in the `coaching_logs` table. Query the user's last 5 `formula_used` values via `get_recent_coaching`; inject as `RECENTLY USED` in the per-call assembly.
- **Why it earns its place:** the schema + tracking layer that makes rotation possible. Without it, "rotate" is guesswork.
- **Files to touch:** `src/lib/agent/schemas.ts`; coaching_logs table migration; `runner.ts`; `get_recent_coaching` tool.
- **Done when:** outputs tracked; `RECENTLY USED` lists are accurate; outputs don't repeat a formula used in the user's last 3 coaching messages.
- **Estimated effort:** `1–4hr`

---

## Summary

LLMs converge on phrasings. The defense is forbidden patterns + rotating formulas + recent-uses awareness + periodic human rotation. The discipline prevents the user-fatigue failure mode in generative chains run repeatedly for the same user. The cost is 300–800 prompt tokens + a `formula_used` schema field + monthly maintenance review. The benefit is sustained engagement on output that would otherwise feel canned within two weeks. contrl's planned coaching agent is the canonical instance — same user gets coaching every workout for years, and "Great work!" wears out fast.

**Key points:**

- **LLMs converge on a small set of phrasings.** Specifically generative chains run repeatedly. Discover the defaults by surveying outputs.
- **Forbid specific phrasings + enumerate alternatives.** Vague "be varied" doesn't work.
- **Track which formula was used per output.** `formula_used` in the schema; the audit trail.
- **Inject recent formulas into the per-call assembly.** "Don't repeat the user's last 3" beats prompting "be varied."
- **Periodic human rotation (monthly).** Review distribution; rotate forbidden + active formulas.

---

## Interview defense

### What an interviewer is really asking

When an interviewer asks "how do you keep generative outputs varied?", they want to hear whether you know LLMs converge and have a structural defense. The shipped answer names forbidden lists, rotating formulas, recent-uses tracking, and periodic rotation. The unshipped answer is "I add 'be creative' to the prompt."

### Likely questions

**[mid] Why do LLM outputs sound repetitive across many calls?**

Because LLMs have a statistical center — a small region of the training distribution they default to when generating. When you run the same chain repeatedly on similar inputs, the outputs converge on that center. The model isn't random; it has preferences. Without explicit constraints, the preferences dominate and outputs blur. The fix is structural: forbid the preferred phrasings explicitly, give the model a list of alternatives with examples, and track which alternatives have been used recently.

```
  LLM convergence
  ┌────────────────────────────────────────────────┐
  │ Training distribution → statistical center      │
  │                            ▼                    │
  │                       preferred phrasings        │
  │                            ▼                    │
  │ Repeated calls → outputs cluster around center  │
  │                                                 │
  │ Defense: forbid the center, enumerate alternatives│
  └────────────────────────────────────────────────┘
```

---

**[senior] Walk me through the rotation mechanism.**

Three cycles. First, per-call rotation: the chain queries the user's recent formulas (last 3–5) and includes them in the system prompt as "do not repeat." The model picks a different formula this call. Second, per-user tracking: each output records which formula was used; the database stores formula_used per output. Third, per-month rotation: the team reviews production logs, identifies formulas exceeding usage thresholds, and updates the system prompt to forbid the over-used or promote the under-used. Each cycle operates at a different cadence; together they prevent both per-user repetition and global convergence.

```
  Three rotation cycles

  ┌────────────────────────────────────────────────────────────┐
  │ Per-call: avoid recent formulas (last 3–5 for this user)    │
  ├────────────────────────────────────────────────────────────┤
  │ Per-user: track which formulas they've seen                 │
  ├────────────────────────────────────────────────────────────┤
  │ Per-month: human review of distribution → update system     │
  └────────────────────────────────────────────────────────────┘
```

---

**[arch] How does this discipline scale to multiple chains and many users?**

Two things matter at scale. First, the formula_used tracking becomes table-level — each chain writes to a different table or a shared table with chain_name. Per-user queries get harder (more joins) but still tractable. Second, the periodic rotation gets harder to do by hand — a monthly review of 5 chains takes hours. At scale, this becomes a half-automated workflow: a job runs nightly, computes formula distribution per chain, flags any formula exceeding the threshold, opens an automated PR draft with a proposed system-prompt update. A human still reviews and merges, but the discovery is automated.

```
  Scale-related infrastructure

  ┌─────────────────────────┬─────────────────┬─────────────────────────┐
  │                         │ 1 chain, 1 user │ 5 chains, thousands     │
  ├─────────────────────────┼─────────────────┼─────────────────────────┤
  │ Tracking                │ Single column   │ Per-chain or shared      │
  │                         │                 │   table with chain_name  │
  │ Discovery               │ Read 50 outputs │ Nightly job over logs    │
  │                         │ by hand         │                          │
  │ Rotation cadence        │ Monthly review  │ Monthly review +         │
  │                         │                 │   automated PR drafts    │
  │ Maintenance overhead    │ 2hr/month       │ 2–4hr/month with        │
  │                         │                 │   automation             │
  └─────────────────────────┴─────────────────┴─────────────────────────┘
```

---

### The question candidates always dodge

**"Internet advice says 'increase temperature for variety.' Why isn't that enough?"**

Because temperature doesn't shift the model away from its statistical center — it just adds noise around the center. At temperature 1.5, the model still defaults to "In a moment of reflection..." in many of its outputs, with slightly more variation in what follows. The center stays the same; the variance increases. Forbidden-patterns moves the center — it tells the model "the phrasings you'd default to are off-limits," which forces actual structural variety. Temperature is a quality knob; forbidden patterns are a content-direction knob. Different controls, different effects.

```
  Temperature vs forbidden patterns

  Temperature 0.7 (default)         Temperature 1.5            Forbidden patterns
  ─────────────────────────         ───────────────────────    ──────────────────────
  Outputs cluster around            Outputs cluster around     Outputs avoid the
   the default center               the SAME default center,    default center entirely
                                    with more noise around it   (forced alternatives)
                                                                                       
  Variety: low                      Variety: low + noise        Variety: real, structural
```

---

### One-line anchors

- "LLMs converge on phrasings. Defense is structural, not random."
- "Forbid specific phrasings; enumerate alternatives with examples."
- "Track formula_used in the schema; inject recent uses into the per-call assembly."
- "Periodic monthly rotation: review distribution; update the active formula set."
- "Temperature adds noise; forbidden patterns move the center."

---

## Validate your understanding

**Level 1 — Reconstruct the diagram.**
Close this file. Draw the five enforcement layers (system prompt forbidden + formulas; recent-uses; schema tracking; self-critique; periodic rotation). Label which layer operates at which cadence.

Pass: you got all five layers in order with cadences (per-call, per-call, per-call, per-call, per-month).

**Level 2 — Explain it out loud.**
Without notes, under 90 seconds: "How do you keep LLM-generated outputs varied?" Checkpoints:
- Did you mention forbidden phrasings (explicit list)?
- Did you mention rotating formulas with examples?
- Did you mention periodic human rotation?

If you skipped any: you described "make it varied," not the discipline.

**Level 3 — Apply to a new scenario.**
A teammate's email-summary chain produces summaries that all start with "Here are the key points:" — about 70% of the time. Walk through the fix.

Expected: survey 50 outputs to confirm the convergence pattern (might also use "The main points are:" or "Key takeaways:" frequently). Forbid those openers explicitly. Add 6–8 rotating opener formulas with worked examples (e.g., "Start with a question," "Open with the most surprising point," "Use a sparse fragment"). Add `formula_used` to the output schema. Query the user's recent summaries; inject into per-call assembly. Set up a monthly review.

**Level 4 — Defend the decision you'd change.**
The biggest tradeoff is "monthly maintenance overhead." If you were shipping a chain for a side project with no maintenance bandwidth, would you still add forbidden patterns?

There's no right answer. Defend with reference to: the volume of the chain (high-volume → user notices repetition), the user's interaction pattern (sees outputs daily vs occasionally), and the option of doing only Layers 1–2 (static forbidden + static formulas) without the per-user tracking or monthly rotation.

**Quick check — code reference test.**
Without opening files, answer:
- How many forbidden phrasings should you typically list?
- How many rotating formulas?
- What field name in the output schema enables per-user rotation tracking?

Pass: top 3–5 (the model's actual defaults from a survey); 6–10 formulas with examples; `formula_used`.

---
