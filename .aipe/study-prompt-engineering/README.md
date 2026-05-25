# Prompt engineering — index

The discipline of treating prompts as production engineering artifacts. Thirteen concepts; reading order is operational discipline first (01–05), then specific techniques (06–13).

## The operational discipline

The boring half. If you don't internalize these, the techniques don't help.

- **[01-anatomy](./01-anatomy.md)** — Every production prompt has named sections (system, context, few-shot, user). Mixing them is how prompts drift.
- **[02-structured-outputs](./02-structured-outputs.md)** — Tool calling + schema validation + retry on schema fail. "Respond only in JSON" is 2022.
- **[03-prompts-as-code](./03-prompts-as-code.md)** — Prompts live in version control. Diff'd, reviewed, paired to a model version.
- **[04-token-budgeting](./04-token-budgeting.md)** — Count tokens before you ship. The 80% rule. Lost-in-the-middle is real.
- **[05-eval-driven-iteration](./05-eval-driven-iteration.md)** — Juniors iterate by vibes; seniors iterate against a fixed eval set with regression tests. Hamel Husain's writing is the canonical reference.

## The techniques

Specific patterns that apply when their problem applies. Read what matches what you're shipping.

- **[06-single-purpose-chains](./06-single-purpose-chains.md)** — One chain, one job. Composes into longer flows; debugging localizes; model routing becomes possible.
- **[07-output-mode-mismatch](./07-output-mode-mismatch.md)** — Every chain declares its output mode. The bug is when chain A produces what chain B doesn't expect.
- **[08-few-shot](./08-few-shot.md)** — 3–5 good examples beats 20 mediocre ones. Examples constrain more than instructions.
- **[09-chain-of-thought](./09-chain-of-thought.md)** — Reasoning lives in a structured field, not in free prose. Less needed on frontier models than two years ago.
- **[10-self-critique](./10-self-critique.md)** — 2–5x token cost for one extra step of reliability. Diminishing returns are real; the critic shares blind spots with the generator.
- **[11-meta-prompting](./11-meta-prompting.md)** — LLMs that draft prompts for other LLM calls. (Pattern is widely exercised in meta-tooling codebases; not directly used in contrl.)
- **[12-prompt-injection-defense](./12-prompt-injection-defense.md)** — Hierarchies + delimiters + structured output. Layered, not solved.
- **[13-forbidden-patterns](./13-forbidden-patterns.md)** — Generative chains converge on phrasings. Rotation is the lever.

## How this guide is anchored

This guide is scoped to **contrl** (this codebase). Most concepts are **Case B** — contrl doesn't ship LLM code today; the planned Phase 4 Path C coaching agent will be the first LLM consumer in the codebase. Where applicable, files describe how the concept applies to the planned coaching agent or to contrl's ML eval discipline (Phase 2C/3 builds).

Examples from other shaped codebases (markdown-spec meta-tooling, single-purpose chain apps) appear as illustrative anchors in the "How it works" sections — they show what each pattern looks like in well-shaped codebases. They're not required references; the contrl-specific framing is in each file's "In this codebase" and "Project exercises" sections.

→ Overview: [00-overview.md](./00-overview.md)

---
Updated: 2026-05-24 — Reframed README per v1.38.0 per-repo scope. Removed loopd/aipe Case A claims; codebase-scoped intro added.
