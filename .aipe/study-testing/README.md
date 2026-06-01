# Study — Testing & correctness (applied)

A test-surface audit of contrl. Seven concept files walk what's tested, what's testable, where untestable code signals a design problem, how to handle inherently non-deterministic behaviour, and where the deterministic-test boundary meets AI evals.

## The starting point

**The repo has zero tests today.** No `tests/` directory, no `__tests__/`, no `*.test.*` or `*.spec.*` files, no jest/vitest/etc. in devDependencies. So this guide isn't auditing a test suite — it's auditing the **test surface**: which paths are testable, which are inherently flaky, where the design pushes back, and what to build first.

```
  Honest framing — this is a "what to test" guide,
  not a "what we tested" report

  ┌─ if tests existed ───┐    ┌─ buildable target ─┐
  │  audit them          │ →  │  what to write     │
  │  ─ coverage gaps     │    │  ─ in what order   │
  │  ─ flaky ones        │    │  ─ at what level   │
  │  ─ smells            │    │  ─ to catch what   │
  └──────────────────────┘    └────────────────────┘
```

## The seam that matters: determinism

```
  the deterministic / probabilistic boundary

  ┌─ deterministic — testable here ─────────────────────────────┐
  │  unit/integration/E2E with fixture inputs                    │
  │  assertion: "equals the expected value"                      │
  │                                                              │
  │  examples in contrl:                                         │
  │    · rep-counter FSM, angle math, gate-check, progression    │
  │    · SQLite CRUD round-trips against real DB                 │
  │    · prompt assembly (planned Phase 4)                        │
  │    · tool dispatch + output parsing (planned Phase 4)         │
  └──────────────────────────────────────────────────────────────┘

  ┌─ probabilistic — evals (lives in study-ai-engineering) ──────┐
  │  assertion: "is good enough / didn't regress"                 │
  │                                                              │
  │  examples in contrl:                                         │
  │    · pose detection accuracy against ground truth            │
  │    · form classifier label quality (Phase 2C planned)         │
  │    · coaching message quality (Phase 4 planned)              │
  └──────────────────────────────────────────────────────────────┘
```

Tests are this guide; evals are `.aipe/study-ai-engineering/05-evals-and-observability/`. When you test an AI feature, you wrap the probabilistic core (eval-tested) in deterministic harness code (test-tested). Both halves matter.

## Map

```
  01-what-is-tested-and-what-isnt.md          coverage as RISK map, not %
  02-test-design-and-levels.md                pyramid as-built (vs as-planned)
  03-tests-as-design-pressure.md              untestable code = design smell
  04-determinism-isolation-and-flakiness.md   time, network, ordering
  05-edge-cases-and-error-paths.md            boundaries, nulls, errors
  06-testing-ai-features.md                   the deterministic / eval seam
  07-testing-red-flags-audit.md               the ranked buildable target list
```

Reading order: 01 first (sets the risk map). Then 07 last (the ranked TODO). 02–06 in any order — each stands alone.

## Through-line

How do you KNOW the code works — and will keep working after the next change? Tests answer the "unknown unknowns" symptom of complexity (`.aipe/study-software-design/01-complexity-in-this-codebase.md`): a good suite tells you what a change broke before your users do. A suite that doesn't is decoration.

contrl currently has no suite. The risk that lurks: a sync refactor that silently breaks the watermark advance; a migration step that drops a column on devices but not the cloud; a rep-counter FSM that miscounts after a hysteresis dead-zone edit. All three are testable. None are tested.

## What this guide is and isn't

- **Is:** an audit of the test SURFACE. Where to test, at what level, with what fixtures, to catch which regressions.
- **Isn't:** a tutorial on Jest/Vitest/Detox. The frameworks matter less than the design pressure.
- **Isn't:** a coverage report. Coverage % is the wrong metric for an early-stage codebase. Risk-weighted "what would hurt if this broke" is the right one.
