# 8. Developer process

The process is spec-driven and AI-assisted. The repo has three artifacts that describe the system before the code does:

- `SPEC.md` — living product spec; updated every time the system changes shape, not just every release.
- `AUDIT.md` — honest accounting of what's complete, what's incomplete, what's broken. Dated, with file references.
- `.aipe/specs/` — generated specs (interview, audit, refactor, plan) used to drive AI assistance into the right rails.

The reason this works is because the spec exists before the implementation, and gets updated when the implementation diverges. That makes it a tool for *me* (when I come back in three weeks) and a tool for the AI (which gets a coherent context window instead of scraping intent from the diff). Without the spec, both me-in-three-weeks and the AI-in-a-fresh-session would be reverse-engineering intent from code, which is a tax I pay every minute I'm in the repo.

```
Workflow (typical feature)

   1. Open .aipe/specs/, run /aipe:feature with intent
        ▼
   2. Spec is generated against current SPEC.md context
        ▼
   3. I review and edit the spec — this is where my judgment lives
        ▼
   4. Hand spec to Claude Code, supervised implementation
        ▼
   5. Test on device (no automated test suite yet)
        ▼
   6. Update SPEC.md if architecture moved
        ▼
   7. Update AUDIT.md if I introduced a known gap
        ▼
   8. Commit
```

## Interview questions

**[mid] How do you decide what to spec vs what to just write?**

> Anything that touches the data model, the sync flow, or the FSM gets a spec. Anything UI-only — a layout tweak, a copy change, a new modal — usually doesn't. The cutoff is "would I forget why I did this in three weeks?" If yes, spec it; the spec is the artifact I'll re-read, not the diff. Specifically: gate evaluation is specced, the rep counter is specced, the sync protocol is specced. Theme tokens and component layout aren't.

**[senior] What's the cost of this process?**

> Roughly 20–30% time overhead on small changes, because writing the spec is real work even when the change is small. The break-even is around the second time I touch the same area: the spec pays back the second I have to remember what `consecutivePasses == 3` actually means, or why the 2-minute bias exists. Below that — features I'll never touch again — the spec is overhead. I accept the overhead because the *AI-assisted* leg of the workflow only works if there's a coherent spec to feed it; without that, the AI hallucinates a different design every session. Specs are how I make AI assistance reproducible.

**[arch] Where does this fall apart?**

> Two places. One: when the spec drifts from the code and I don't notice. The mitigation is `AUDIT.md`, which forces me to enumerate the gaps explicitly, but it's still a manual process. A real version of this would have a CI check that reads the spec and the code and flags structural drift — I haven't built that. Two: when a feature is genuinely exploratory and I don't yet know what I want. Then the spec is fiction and the AI cheerfully implements the fiction. The only fix there is to do the exploration in throwaway branches, *then* spec the version that survived. I'm inconsistent about this and it's where most of my "I would have done X but the AI did Y" moments come from.

## The hard question

**"Isn't this just over-engineering for a one-person project?"**

> If the goal were the smallest amount of code that made the app work, yes. The goal isn't that. The goal is a codebase I can come back to in six months and ship a feature in a day instead of a week. The spec, the audit, the named decisions — they exist to compress my own onboarding cost on every return. They're also what made it possible to write *this* document: every claim I make here points to a specific file and a specific rationale, because that rationale was written down at the time. A solo project without these artifacts is fine for a weekend prototype. For something I expect to maintain, the overhead is leverage, not bureaucracy. The honest counter is that I overshot on some of the artifacts — a separate `AUDIT.md` is borderline; arguably it should be issues in a tracker. I kept it as a markdown file because it's checkpointable in git and I can grep it.
