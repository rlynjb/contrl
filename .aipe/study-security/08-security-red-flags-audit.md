# Security red flags audit
### The capstone checklist — Industry standard

> The other seven files isolated findings. This file is the ranked index: every red flag, marked against contrl, severity rated for *today* and *post-Phase-4*. The honest assessment: contrl is defensible at MVP scale; the planning work for Phase 4 is the load-bearing security work.

## Zoom out, then zoom in

contrl today is a single-user local-first app. The cloud is the developer's. The data is one user's exercise log. The attack surface is small; the defenses are mostly correct; the gaps are mostly planning-shaped.

```
  Zoom out — severity, today vs Phase 4

  ┌─ Tier 1 today (FIX NOW, even at MVP) ────────────────────────┐
  │   ─ none. nothing biting hard today.                         │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Tier 2 today (fix soon; cheap) ─────────────────────────────┐
  │   ─ SQL column-name interpolation in updateUserLevel         │
  │     (file 03 — runtime whitelist)                            │
  │   ─ no Zod schema on Supabase responses                      │
  │     (file 03 — defense in depth)                             │
  └──────────────────────────────────────────────────────────────┘

  ┌─ Tier 3 today (note + plan; minor) ──────────────────────────┐
  │   ─ no log scrubbing (file 04, 05)                           │
  │   ─ select('*') on every Supabase pull (file 05)             │
  │   ─ pose module pinned with ^ instead of exact (file 06)     │
  │   ─ no `npm audit` in CI (file 06)                           │
  │   ─ unused expo-secure-store dependency (file 04)            │
  │     (intent-signaling for Phase 4 — not a bug)               │
  └──────────────────────────────────────────────────────────────┘

  ┌─ CRITICAL post-Phase-4 (must ship in lockstep) ──────────────┐
  │   ★ RLS not deployed (file 02 — load-bearing the day auth    │
  │     ships)                                                   │
  │   ★ LLM/agent defenses are spec, not code (file 07)          │
  └──────────────────────────────────────────────────────────────┘
```

Zoom in. Nothing is bleeding today. The two tier-2 SQL/schema findings are cheap to fix and worth fixing soon. The two CRITICAL findings are about **discipline at Phase 4 release time** — both already designed, both must be implemented in the same release as the feature they protect.

## Structure pass

Layers: client / sync / Supabase / planned LLM.

Axis traced across all eight files: **trust** — what does each layer assume about who's calling, what's flowing in, and what's leaving.

```
  The map, viewed across the audit

  layer            findings firing today                  buildable targets
  ─────            ────────────────────                   ─────────────────
  client           ─                                       ─
  sync             updateUserLevel column interpolation   Zod schemas on
                                                          responses,
                                                          explicit selects
  Supabase         no RLS yet (bounded by single user)    deploy RLS
                                                          BEFORE auth ships
  LLM (planned)    no agent today                          four-layer
                                                          envelope must
                                                          land in first
                                                          agent PR
  ops              no log scrubbing                       redact wrapper
                  no CI audit                              add npm audit
                                                          to CI
```

Seam: every finding is either at the **client ↔ Supabase REST seam** (the load-bearing security boundary) or at the **planned client ↔ Anthropic seam** (when Phase 4 ships).

## How it works

#### Move 1 — the picture of "today vs Phase 4"

Most audit reports are static — they grade the codebase as it is. A more useful report grades *as it is* AND *as it will be*, because security work scales with what's coming, not with what's there. contrl's findings split cleanly:

```
  Severity over time

  TODAY                          PHASE 4 (planned)
  ─────                          ─────────────────

  ▲ severity
  │
  │            ★ CRITICAL  ── RLS deployment
  │            ★ CRITICAL  ── LLM envelope shipped
  │
  │   T2 ──── T2 ── SQL whitelist (still cheap)
  │   T2 ──── T2 ── Zod schemas (now load-bearing)
  │
  │   T3 ──── T3 ── log scrubbing
  │   T3 ──── T3 ── npm audit in CI
  │
  └──────────────────────────────────► time
```

The middle ranks rise as Phase 4 lands. The bottom ranks stay roughly where they are. The top ranks emerge only at Phase 4 release time, and only if the planning didn't follow through.

#### Move 2 — the ranked findings

Each finding has the same shape: red flag → location → severity today → severity post-Phase-4 → fix → file in this guide.

```
  ════════════════════════════════════════════════════════════════
   CRITICAL (must ship in lockstep with the triggering feature)
  ════════════════════════════════════════════════════════════════

  FINDING C1. RLS not deployed on Supabase
              Location:  Supabase project policies (not in this repo)
              Today:     bounded by single hardcoded USER_ID; data is
                         one user's exercise log
              Phase 4:   CRITICAL — auth shipping without RLS exposes
                         every authenticated user to every other
                         user's data
              Fix:       deploy USING (user_id = auth.uid()) +
                         WITH CHECK (user_id = auth.uid()) on every
                         table BEFORE the auth-enabled client ships
              Cost:      SMALL (~30 lines of SQL)
              See:       02-authentication-and-authorization.md

  FINDING C2. LLM/agent defense envelope is spec, not code
              Location:  src/lib/agent/ (does not exist today)
              Today:     no concern — no agent surface
              Phase 4:   CRITICAL — must land in the same PR as
                         the agent runtime, all four layers together
              Fix:       implement
                          - src/lib/agent/sanitize.ts (input wrap)
                          - src/lib/agent/runner.ts (cap, budget,
                            circuit breakers)
                          - src/lib/agent/tools/ (allowlist, all
                            read-only)
                          - src/lib/agent/schemas.ts (output Zod)
              Cost:      MEDIUM (designed; implementing is mechanical)
              See:       07-llm-and-agent-security.md

  ════════════════════════════════════════════════════════════════
   TIER 2 (fix soon; cheap)
  ════════════════════════════════════════════════════════════════

  FINDING T2.1. SQL column-name interpolation in updateUserLevel
                Location:  src/services/database.ts (~line 265)
                Today:     Tier 2 — runtime gate missing; TS gates at
                           compile only
                Phase 4:   Tier 2 — same; not made worse by auth
                Fix:       ALLOWED_CATEGORY_LEVEL_COLUMNS lookup +
                           throw on miss
                Cost:      TINY (one helper, one line in update fn)
                See:       03-input-validation-and-injection.md

  FINDING T2.2. No Zod schema on Supabase responses
                Location:  src/services/sync/mapper.ts (all from*
                           functions)
                Today:     Tier 2 — bounded by "you control the cloud"
                Phase 4:   Tier 1 — multi-user + RLS makes Supabase
                           responses semi-trusted; schema validation
                           becomes load-bearing
                Fix:       Zod row schemas; safeParse with log-and-drop;
                           OR generate types via supabase CLI + add a
                           thin Zod schema on top
                Cost:      MEDIUM (10 schemas, but mechanical)
                See:       03-input-validation-and-injection.md

  ════════════════════════════════════════════════════════════════
   TIER 3 (note; fix when convenient)
  ════════════════════════════════════════════════════════════════

  FINDING T3.1. No log scrubbing (Supabase errors pass through)
                Location:  src/services/sync/supabase-sync.ts (~line 17)
                Today:     Tier 3 — no PII in the model
                Phase 4:   Tier 2 — emails + notes in errors leak
                Fix:       redact() wrapper around Supabase errors
                           before logging; truncate; drop details/hint
                Cost:      TINY (one helper)
                See:       04-secrets-and-configuration.md, 05-data-
                           exposure-and-privacy.md

  FINDING T3.2. select('*') on every Supabase pull
                Location:  src/services/sync/supabase-sync.ts
                           (~lines 140-145)
                Today:     Tier 3 — no PII to over-fetch
                Phase 4:   Tier 2 — explicit column lists become
                           mandatory once PII enters the schema
                Fix:       PULL_COLUMNS dictionary per table;
                           explicit list in each .select(...)
                Cost:      TINY (5-10 lines)
                See:       05-data-exposure-and-privacy.md

  FINDING T3.3. Pose module pinned with ^ instead of exact
                Location:  package.json
                           "react-native-mediapipe-posedetection":
                              "^0.4.0"
                Severity:  Tier 3 — pre-1.0 minor bumps can change
                           inference behaviour
                Fix:       pin exact: "0.4.0" (or whatever current);
                           bump intentionally after validation
                Cost:      TINY (one character change)
                See:       06-dependencies-and-supply-chain.md

  FINDING T3.4. No `npm audit` in CI
                Location:  no CI config in repo today
                Severity:  Tier 3 — manual audits are easy to forget
                Fix:       weekly CI job runs `npm audit --omit=dev
                           --audit-level=high`
                Cost:      SMALL (one workflow file)
                See:       06-dependencies-and-supply-chain.md

  FINDING T3.5. Unused expo-secure-store
                Location:  app.json + package.json (registered, never
                           imported)
                Severity:  Tier 3 — intent signal, not a bug
                Phase 4:   resolves naturally when auth ships
                Fix:       no action needed today; in Phase 4, wire
                           into Supabase auth as the token storage
                           adapter
                See:       04-secrets-and-configuration.md
```

#### Move 2 variant — the four buckets of work

The findings cluster into four discrete pieces of work:

```
  Buckets — what to do, in what order

  BUCKET A. The two tier-2 SQL/schema fixes  (do this week)
            - updateUserLevel whitelist
            - Zod schemas on Supabase responses
            cost: half a day combined

  BUCKET B. Tier-3 hygiene                   (do when convenient)
            - log redact wrapper
            - explicit Supabase columns
            - pose module exact pin
            - npm audit in CI
            cost: another half day, can do incrementally

  BUCKET C. Phase 4 critical: RLS            (DO BEFORE AUTH SHIPS)
            - design and test RLS policies on every table
            - deploy to Supabase
            - verify with anon-key + JWT requests that scoping
              works as expected
            cost: 1-2 days including testing

  BUCKET D. Phase 4 critical: LLM envelope   (LANDS WITH AGENT)
            - input wrap, bounded loop, read-only tools,
              output schema — all in first agent PR
            - adversarial eval fixtures in tests/agent/
            cost: part of agent build
```

Buckets A and B are cheap maintenance; do them now. Buckets C and D are Phase 4 release-gating. Plan them into the same release as their triggering feature.

#### Move 3 — the principle

> Audit honestly. Don't fabricate severity to seem thorough; don't downplay real exposure to seem reassuring. contrl is small, the data is bounded, the design is mostly right. The work to do is mostly about planning Phase 4's transitions carefully, not about emergency patching.

## Primary diagram

```
  contrl's security dashboard

  ┌────────────────────────────────────────────────────────────────────────┐
  │  WHAT'S DEFENDED TODAY                                                 │
  │                                                                        │
  │  ✓ Parameterized SQL VALUES everywhere except one update path          │
  │  ✓ Anon key correctly in bundle (it's the public credential)            │
  │  ✓ Service role key absent from code (correct)                          │
  │  ✓ .env gitignored                                                     │
  │  ✓ package-lock committed; deps mostly Expo-vetted                      │
  │  ✓ Pose pipeline is on-device; no remote model, no frame upload         │
  │  ✓ No XSS / SSRF / shell / path-traversal surface                       │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │  THIS WEEK — Bucket A                                                  │
  │                                                                        │
  │   ▸ updateUserLevel whitelist                                          │
  │   ▸ Zod schemas on Supabase from* mappers                              │
  │                                                                        │
  │   cost: ~half day                                                       │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │  WHEN CONVENIENT — Bucket B                                            │
  │                                                                        │
  │   ▸ log redact wrapper                                                 │
  │   ▸ explicit Supabase column selects                                   │
  │   ▸ pose module exact pin                                               │
  │   ▸ npm audit in CI                                                     │
  │                                                                        │
  │   cost: ~half day, incremental                                          │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │  ★ BEFORE PHASE 4 AUTH SHIPS — Bucket C                                │
  │                                                                        │
  │   ▸ RLS on every table (USING + WITH CHECK by auth.uid())              │
  │   ▸ Test with anon key + JWT to verify scoping works                   │
  │                                                                        │
  │   cost: 1-2 days. NON-NEGOTIABLE; ships with auth.                     │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │  ★ IN THE FIRST AGENT PR — Bucket D                                    │
  │                                                                        │
  │   ▸ src/lib/agent/sanitize.ts (input wrap)                             │
  │   ▸ src/lib/agent/runner.ts (cap + budget + circuit breakers)          │
  │   ▸ src/lib/agent/tools/ (read-only allowlist)                          │
  │   ▸ src/lib/agent/schemas.ts (Zod output)                              │
  │   ▸ tests/agent/adversarial.json (eval fixtures)                       │
  │                                                                        │
  │   cost: part of the agent build. ALL FOUR LAYERS IN ONE PR.            │
  └────────────────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

This file is the index. Each finding above points to the concept file that walks the diagnostic and the fix.

- **Start here** for the surface map → file 01
- **For each finding** open the linked concept file → files 02–07
- **The two Phase 4 critical items** demand release-discipline, not just code: deploy RLS before the auth client; ship the four-layer envelope in the agent's first PR.

## Elaborate

The honest grade for contrl's security posture today is **B+**: small, defensible, with a few cheap fixes worth doing this week and a couple of CRITICAL planning items for Phase 4. Nothing is broken; nothing is leaking; nothing demands emergency response. That's the right grade for an early-stage local-first single-user app.

The trap to avoid is letting "we're small, security is overkill" become "we shipped multi-user without RLS" or "we shipped the agent with a bounded loop but no Zod schema." Both transitions are foreseeable. Both deserve calendar entries on the Phase 4 release plan, not just notes in a backlog.

The strongest piece of contrl's current posture: **no write surface** anywhere that matters. The agent will be read-only by construction. The cloud is one user's. There's no admin panel, no third-party API key in client code, no upload endpoint. The attack-payoff is bounded by what an attacker can read (one person's exercise log) — and reading that requires either physical device access OR a Supabase anon-key compromise that yields one person's data anyway. Even a successful attack today costs the user roughly nothing.

The Phase 4 transitions change that. Multi-user means an attacker compromising one credential yields N users' data. An LLM agent means a write-tool addition later yields side effects that a prompt-injection attack can drive. Plan for both transitions; don't be surprised by either.

## Interview defense

**Q: "Give me the security verdict on your codebase."**

```
  ┌─ Today: defensible (B+) ───────────────────────────────────────┐
  │  Small surface. Single user. Parameterized SQL (one exception). │
  │  Anon key in bundle is correct because it IS the public         │
  │  credential. No write surface that matters. No PII beyond       │
  │  exercise progression.                                          │
  └────────────────────────────────────────────────────────────────┘

  ┌─ Two cheap fixes this week ────────────────────────────────────┐
  │  1. updateUserLevel column-name whitelist (runtime check on top │
  │     of the TS Category type).                                   │
  │  2. Zod schemas on Supabase response mappers — defense in depth │
  │     today, load-bearing once multi-user lands.                  │
  └────────────────────────────────────────────────────────────────┘

  ┌─ Two Phase 4 critical items ───────────────────────────────────┐
  │  C1. RLS on every Supabase table — MUST deploy BEFORE auth     │
  │      ships. The bug to avoid is "auth in production, RLS not   │
  │      yet on" — that's the window where every authenticated     │
  │      user can read every other authenticated user's data.      │
  │                                                                 │
  │  C2. LLM defense envelope — all four layers (input wrap,       │
  │      bounded loop, read-only tools, Zod output) must land in   │
  │      the FIRST agent PR. Shipping the runner without one of   │
  │      the layers is the failure mode.                            │
  └────────────────────────────────────────────────────────────────┘
```

Anchor: "small surface today, two cheap fixes this week, two critical items lockstepped to Phase 4 features."

**Q: "What's the single biggest risk you're carrying?"**

The RLS deployment timing. Today it doesn't matter (single user). The day auth ships, it becomes critical instantly. The discipline is to deploy RLS first, then ship the auth-enabled client — never the other way around, never in the same commit without verifying.

**Q: "Why isn't the lack of tests a security finding?"**

It is, in a sense — see `study-testing/`. From the security view: the absence of adversarial eval fixtures (the Phase 4 `tests/agent/adversarial.json`) means the LLM envelope's defenses are unproven. That gap moves from "planning concern" to "blocker" the moment Phase 4 development starts. The discipline is to write the adversarial fixtures alongside the agent runtime, not after.

## Validate

1. **Reconstruct.** From memory, list the two CRITICAL Phase 4 items and what triggers each one.
2. **Explain.** Why is the anon key in the bundle acceptable but a Supabase service-role key not?
3. **Apply.** Sketch the RLS policy for `gate_progress`. What's the difference between USING and WITH CHECK?
4. **Defend.** Argue that contrl's MVP is safer than a comparable web app at the same scale. Then rebut.

## See also

- [01-trust-boundaries-and-attack-surface.md](./01-trust-boundaries-and-attack-surface.md)
- [02-authentication-and-authorization.md](./02-authentication-and-authorization.md)
- [03-input-validation-and-injection.md](./03-input-validation-and-injection.md)
- [04-secrets-and-configuration.md](./04-secrets-and-configuration.md)
- [05-data-exposure-and-privacy.md](./05-data-exposure-and-privacy.md)
- [06-dependencies-and-supply-chain.md](./06-dependencies-and-supply-chain.md)
- [07-llm-and-agent-security.md](./07-llm-and-agent-security.md)
- `.aipe/study-system-design-dsa/` — the architecture that grounds these findings
- `.aipe/study-testing/` — the adversarial-eval gap from a testing angle
