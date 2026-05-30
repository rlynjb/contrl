# Tree of Thoughts

**Industry name(s):** Tree of Thoughts · ToT · Branch-score-prune reasoning
**Type:** Industry standard (academically; rarely in production)

> Explore multiple reasoning branches in parallel, score each, prune the worst, expand the best. The branch factor multiplies token cost; the scoring is hard outside academic benchmarks. **Cover so you can name why you didn't use it** — that's the most common interview answer for ToT.

**See also:** → [02-react.md](./02-react.md) (what to use instead in production)

---

## Why care

**Move 1.** A blog post or paper hands you Tree of Thoughts as a way to "improve agent reasoning." On paper, it looks like a win: explore many paths, pick the best. In production, almost no team ships it.

**Move 2.** That "should I use Tree of Thoughts" question is what this file answers — almost always with "no, and here's why." The reason is structural: ToT's benefit depends on a scoring function, and most production agent tasks don't have one.

**Why it matters: senior interviewers ask about ToT to test whether you know to reject it.** A candidate who reaches for ToT signals "I learned the pattern from a paper and haven't shipped it." A candidate who can name "I considered ToT and rejected it because [no scoring function / branch cost too high / well-prompted ReAct wins]" signals production experience.

**Move 5.** Tree of Thoughts is to reasoning patterns what bogosort is to sorting: educational, rarely the right answer.

---

## How it works

### Move 1 — The mental model

```
                  root: "what should I do next?"
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
     path A    path B    path C       (branch factor B; here B=3)
        │         │         │
     score:    score:    score:
       6/10     8/10     4/10
        │         │         │
        prune    keep     prune
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
     path B1   path B2   path B3      (next-level expansion)
        ...

Best path wins after K levels of expansion.
```

**Strategy:** branch the reasoning, score each branch, prune low scores, expand high scores. Repeat to depth K.

### Move 2 — Why it rarely ships

```
Constraint 1: branch factor multiplies tokens.
─────────────────────────────────────────────
B = 3 branches × K = 3 levels = 27 leaf paths to evaluate.
Each path is an LLM call. 27× tokens for one task is a hard sell.


Constraint 2: scoring function is the load-bearing problem.
──────────────────────────────────────────────────────────────
ToT works in academic settings (24-game, Game of 24, BlocksWorld)
because those have a programmable scoring function — does this path
lead to a solution? In production agent tasks (customer support,
coding, research), "is this reasoning path good?" is itself an LLM
call. So you've turned one task into (B^K + 1) tasks.


Constraint 3: well-prompted ReAct usually wins.
───────────────────────────────────────────────
The empirical finding most teams report: a well-prompted ReAct loop
with the right tool registry beats ToT on real tasks. The branching
adds variance more than insight.
```

### Move 3 — The principle

Cover ToT so you can name why you didn't use it. The pattern teaches a real concept — exploring multiple reasoning paths can outperform single-pass — but the production version of that concept is reflexion (one revision) or multi-agent debate (two perspectives), not tree expansion. Tree of Thoughts is the academic version; it rarely justifies the cost in production.

---

## Tree of Thoughts — diagram

```
                         root task
                            │
                ┌───────────┼───────────┐
                ▼           ▼           ▼
              path A       path B      path C
                │            │            │
            score(A)     score(B)     score(C)    ← B LLM calls
                │            │            │
              prune         keep        prune
                             │
                ┌────────────┼─────────────┐
                ▼            ▼             ▼
              B1            B2            B3      ← B more LLM calls
                ...

  Total LLM calls per task: O(B^K) where B = branch factor, K = depth.
  At B=3, K=3 → 27 reasoning calls + scoring calls.

  Production reality:
    - branch cost: huge
    - scoring cost: usually another LLM call per branch (no
      programmable scorer for most domains)
    - quality win over well-prompted ReAct: small to negative
    - production sightings: rare
```

---

## In this codebase

**Case B — not planned.**

Tree of Thoughts is not used in contrl, won't be used in the planned coaching agent, and isn't on any future roadmap. The coaching task has no scoring function for branches; the action space is small (5 tools); and well-prompted ReAct is the right baseline. Listed in this guide for completeness so an interview answer can name "I considered ToT and didn't use it because there's no scoring function for branches of coaching reasoning."

---

## Elaborate

**Where this pattern comes from.** Yao et al., "Tree of Thoughts: Deliberate Problem Solving with Large Language Models" (2023). Demonstrated state-of-the-art on the 24-game, BlocksWorld, and a few other puzzle domains where a programmable scorer exists. Has been re-applied to general reasoning tasks with much weaker results.

**The deeper principle.** Branching search outperforms single-path search *when you have a cheap scorer*. The whole technique reduces to "how good is your scorer?" In academic puzzle domains the scorer is the puzzle's validity rule (free, deterministic). In production agent domains the scorer is an LLM call — and that flips the cost equation.

**Where this breaks down.** Most production agent domains. The exceptions are narrow: code-generation with a test-suite scorer, math problems with a verifier, game-playing with a value function. None apply to contrl.

**What to explore next.** [04-reflexion-self-critique.md](./04-reflexion-self-critique.md) — the production-friendly version of "explore alternative outputs and pick the best."

---

## Tradeoffs

```
┌────────────────────┬───────────────────────────────────┬──────────────────────────────────┐
│ Dimension          │ Tree of Thoughts                  │ ReAct (well-prompted)            │
├────────────────────┼───────────────────────────────────┼──────────────────────────────────┤
│ Cost per task      │ O(B^K) LLM calls                  │ O(turn count) LLM calls          │
│ Scoring            │ requires a scorer (programmable    │ no scorer needed                 │
│                    │  or LLM-based)                    │                                  │
│ Quality on puzzles │ strong (with deterministic scorer)│ weaker                           │
│ Quality on prod    │ small win, sometimes negative     │ baseline                         │
│ Eval surface       │ trajectory + scoring quality      │ trajectory only                  │
└────────────────────┴───────────────────────────────────┴──────────────────────────────────┘
```

### Sub-block 1 — what ToT gives up

Cost predictability. Branch factor multiplies tokens. Even at modest B and K, the per-task cost is 10-30× a single ReAct trajectory. Few production budgets accommodate that for marginal quality.

### Sub-block 2 — what skipping ToT costs

In puzzle-shaped domains with programmable scorers, you miss a real win. In general agent domains, you miss nothing — well-prompted ReAct meets or beats ToT.

### Sub-block 3 — the breakpoint

ToT earns its place when you have a deterministic, cheap scorer. If you don't, it doesn't. The breakpoint is binary.

### Sub-block 4 — what isn't a tradeoff

"More exploration is always better." Not when each exploration step is an LLM call. The number of branches at fixed quality is bounded by your token budget, not by what's theoretically possible.

---

## Tech reference (industry pairing)

### Programmable scorer (when ToT works)

- **Codebase uses:** not applicable to contrl.
- **Why it's here:** the whole pattern's viability rests on having one.
- **Examples:** test-suite pass/fail (code), puzzle validity (24-game), value function (game-playing).

---

## Summary

### Concept recap

Tree of Thoughts branches reasoning, scores branches, prunes and expands. Production sightings are rare because most domains lack a programmable scorer and well-prompted ReAct beats ToT on real tasks. Cover so you can name why you didn't use it — that's the strongest interview signal.

### Key points

- ToT needs a cheap scorer. Without one, the cost equation flips.
- Branch factor multiplies tokens; even modest depth balloons cost.
- Well-prompted ReAct beats ToT on most production tasks.
- contrl: Case B. Named so the interview answer can name the rejection.

---

## Interview defense

### Likely questions

**[mid] What's Tree of Thoughts?**

Explore multiple reasoning branches, score each, prune, expand the best. Academic origin (Yao et al., 2023), rarely shipped in production. Cost: O(B^K) LLM calls; scoring is the bottleneck.

**[senior] Why didn't you use ToT in contrl?**

Two reasons. The coaching task has no scoring function — "is this reasoning branch about which tool to call next good?" is itself an LLM call, so you've turned one ReAct loop into 27 ReAct loops plus scoring calls. The cost is huge for a marginal quality win. Second, well-prompted ReAct is empirically strong on small action spaces like contrl's five-tool registry. The branching adds variance more than insight.

**[arch] When would ToT earn its place?**

Domains with a cheap, deterministic scorer. Code generation with a test suite. Math with a verifier. Game-playing with a value function. None of those describe a coaching agent — or, frankly, most production agents.

### One-line anchors

- "ToT needs a scorer. Without one, the cost equation flips."
- "Cover it so you can name why you didn't use it."
- "Well-prompted ReAct beats ToT on most production tasks."

---

## Validate

**Level 1 — Reconstruct the diagram.** Branch-score-prune tree at B=3, K=2.

**Level 2 — Explain in 60s.** Why is ToT rarely shipped in production?

**Level 3 — Apply.** A teammate wants to add ToT to the coaching agent "for better reasoning." Argue against in 3 sentences.

**Level 4 — Defend.** Name one production scenario where ToT would earn its place. Why doesn't contrl match it?

**Quick check.**
- What's the scaling of LLM calls in ToT? — O(B^K).
- What's the load-bearing requirement? — A cheap scorer.
- Does contrl use ToT? — No.
