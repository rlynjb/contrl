# Study — Security (trust axis, applied)

A security audit of contrl through one question: **what can an attacker reach, and what happens when they do?** Eight concept files trace the trust axis across every boundary in the system and ask whether each one enforces a trust decision or leaks one.

## The through-line

```
  one axis. every boundary.

  where does untrusted input enter?      → attack surface
  who's allowed past this boundary?      → authn / authz
  what's hidden, what's exposed?         → secrets / data
  what do my dependencies let in?        → supply chain
```

Every finding ties to this: which boundary, which trust assumption, what breaks if it's wrong.

## Where contrl sits today (Phase 2A, mid-2026)

A local-first fitness app:

- **Single user.** Hardcoded `USER_ID`. No auth, no login, no sessions.
- **Two stores.** SQLite (on-device, source of truth) ↔ Supabase (cloud mirror).
- **One model.** MediaPipe pose detection runs entirely on-device. No frames upload.
- **No LLM yet.** Phase 4 plans a single ReAct coaching agent with five read-only tools. `src/lib/agent/` does not exist on disk yet.

That shape constrains the audit. Most findings are "**too small to bite today; here's the buildable target when it grows**" — and that's the honest answer. Where something IS biting today (the SQL string interpolation in `updateUserLevel`, the silent error path through fire-and-forget sync), it's named explicitly.

## Map

```
  01-trust-boundaries-and-attack-surface.md   the zoom-out — every boundary
  02-authentication-and-authorization.md      who-you-are vs what-you-can-do
  03-input-validation-and-injection.md        SQL · JSON · prompt · path
  04-secrets-and-configuration.md             keys, env, what's in the bundle
  05-data-exposure-and-privacy.md             over-fetching, logs, errors
  06-dependencies-and-supply-chain.md         lockfile + transitive risk
  07-llm-and-agent-security.md                planned Phase 4 defenses
  08-security-red-flags-audit.md              the capstone checklist
```

Reading order: 01 first (sets the surface), then 08 last (the ranked fix list). 02–07 in any order — each concept stands alone.

## House rules for this audit

- **Defensive only.** No exploit code. Findings name the weakness, the trust assumption it breaks, the fix.
- **Per-repo.** Every finding cites a real path in contrl. The codebase being studied is the one this command was run in.
- **Honest "not exercised."** A small or young codebase won't exercise every primitive. Auth doesn't bite at Phase 2A. RLS doesn't bite without auth. LLM/agent security doesn't bite without an agent. Each concept names this explicitly and gives the buildable target.

## What this isn't

- Not a penetration test. The audit is design-level — boundaries, contracts, trust assumptions. Behavioural testing belongs in `.aipe/study-testing/`.
- Not a substitute for shipping with RLS, auth, and adversarial eval testing once Phase 4 lands. The audit names what to plan for; the implementation is yours.
