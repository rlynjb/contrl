# Agentic coding / build system

**The prompt:** "Design an agent that completes a coding task across a repo — read, plan, edit, verify."

**Standard architecture:**

```
                 CODING TASK
                      │
                      ▼
            ┌────────────────────────────┐
            │ Retrieval over the codebase │  find relevant files
            │ (file tree + content search)│
            └────────────┬───────────────┘
                         ▼
            ┌────────────────────────────┐
            │ Plan (expensive model)      │  what to change, in what order
            │                             │
            │   plan = [                  │
            │     edit file A             │
            │     edit file B             │
            │     run tests               │
            │   ]                          │
            └────────────┬───────────────┘
                         ▼
            ┌────────────────────────────┐
            │ Execute (cheaper model)     │  one edit per step
            └────────────┬───────────────┘
                         ▼
            ┌────────────────────────────┐
            │ Verify (run tests + review) │  did the change work?
            └────────┬───────────────────┘
                     │
            ┌────────┴────────┐
           pass             fail
            │                │
            ▼                ▼
          DONE          re-plan from current state
                            │
                            └────► back to Plan
```

This is plan-and-execute (SECTION A) plus a verifier-critic loop (SECTION C) plus guardrails.

**Data model:**
- Repo context (file tree, retrieved files relevant to the task)
- The plan (list of steps with dependencies)
- The diff (proposed changes, file by file)
- Test results (per test run)
- Iteration counter (how many re-plans / verify-fail loops)

**Key components:**
- Retrieval over the codebase (find which files matter to the task — could be embedding-based or grep-based or both)
- Planning (decompose the task into an ordered list of changes)
- Execution (make the edits, one at a time)
- Verification (run tests, review the diff for safety)
- Re-plan trigger (verify failure → re-plan with the failure as input)
- Decision: pure plan-and-execute (commit to plan, re-plan only on failure) vs pure ReAct (decide each edit on its own) — plan-and-execute is the default for tasks with stable structure.

**Scale concerns:**
- **Large repos blow the context budget** — can't fit a whole codebase in the window. Fix: retrieval routing over the codebase (vector store on code, AST search, grep — multi-source).
- **Long tasks blow the iteration cap** — complex changes take many edits. Fix: tier sub-tasks; cap per sub-task, not overall.
- **Cost per task** — coding agents are expensive (long context, many tool calls). Fix: cheaper executor model; aggressive prefix caching on the system prompt and the file tree.

**Eval framing:**
- Task success rate (do the tests pass after the change?)
- Trajectory efficiency (edits and re-plans to completion)
- Regression rate (did it break something else? — run the whole test suite, not just the new tests)
- Scope adherence (did it edit files outside the allowed scope?)

**Common failure modes:**
- Editing files outside scope. Mitigation: writable-file allowlist; reject edits to files not in the scope.
- Plan assumptions breaking mid-execution. Mitigation: re-plan trigger that surfaces the divergence (not silent retry).
- Verifier sharing the producer's blind spots. Mitigation: tests as the verifier (deterministic, not LLM-graded) when possible.
- Context loss across long tasks. Mitigation: per-step context engineering — prune completed-step outputs, summarize prior plan-steps.

**Applies to this codebase:** `no`.

contrl is a fitness app, not an agentic coding system. The planned coaching agent doesn't read its own codebase, doesn't make code changes, doesn't run tests. There's no coding-task surface.

**How to make it apply:**

Doesn't apply meaningfully. The closest tangential connection is: contrl's *development* uses agentic coding (the user is building contrl with Claude as a coding assistant). That's a meta-question covered in `.aipe/study-interview-defense/08-the-ai-question.md`, not a feature of contrl itself.

For an interview, this template is useful when the question is about IDE-integrated agents, autonomous coding tools, or CI/CD agents — common interview topics in 2026. The strong answer walks through plan-execute + verify, names the scope-adherence problem as the load-bearing safety issue, and explains why pure ReAct rarely wins for coding tasks (the planner round-trip pays back at coding's task length).
