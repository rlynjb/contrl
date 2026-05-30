# Chapter 8 — The AI question

The 2026 baseline is that you used AI to build this. Every senior interviewer assumes it. The question they're really asking when they say "did you use AI?" is not whether you did — it's whether you can own what you shipped. Senior signals: matter-of-fact about the AI's role, matter-of-fact about your role, thoughtful about what you'd evaluate harder next time. Failure signals: defensive, evasive, or pretending you wrote everything from scratch.

This chapter is the meta-question, dedicated. The AI-honest posture has run through every other chapter — Chapter 3 named decisions you defaulted to versus decisions you evaluated; Chapter 6 named where your hands-on depth thins. Here it gets named explicitly. The goal is the calibrated-honest answer: confident about what you understand, explicit about what you don't, never apologetic.

```
┌─ The three modes of decision-making — what to own, how to own each ──────────────────────────┐
│                                                                                              │
│                                                                                              │
│   1. DELIBERATE                                                                              │
│   ──────────────                                                                             │
│   You chose. You compared alternatives. You can defend the choice on its merits.             │
│                                                                                              │
│   Example: "I picked SQLite as the source of truth because the latency budget is 50ms        │
│             and a cloud round-trip is 200ms+. I considered Realm and rejected it             │
│             because it requires ejecting from Expo. I considered AsyncStorage and             │
│             rejected it because I needed indexed queries."                                    │
│                                                                                              │
│   Senior posture: confident, specific, can extend on follow-up.                              │
│                                                                                              │
│                                                                                              │
│   2. EVALUATED-AND-ACCEPTED                                                                  │
│   ──────────────────────────                                                                 │
│   The AI suggested something. You evaluated it against the alternatives you knew about.      │
│   You accepted it because the comparison checked out. You can defend the comparison.         │
│                                                                                              │
│   Example: "Claude suggested using NativeWind for styling. I evaluated it against            │
│             StyleSheet — I would have defaulted to StyleSheet because it's the RN            │
│             default. NativeWind gives me Tailwind-class syntax which I already know          │
│             from web work, so the mental-model cost was lower for me. I accepted             │
│             the suggestion. The cost I'm watching is compile-time class generation —          │
│             not a problem at this scale, would be a problem at a million distinct classes."  │
│                                                                                              │
│   Senior posture: confident about the *evaluation*, transparent about the suggestion's       │
│   origin, names the cost you're watching.                                                    │
│                                                                                              │
│                                                                                              │
│   3. DEFAULTED-TO                                                                            │
│   ──────────────────                                                                         │
│   The AI suggested something and you went with it without deeply evaluating. You didn't      │
│   compare alternatives. You accepted on operational defaults — "it works, ship it."          │
│                                                                                              │
│   This is the riskiest one to own. It's also the most senior-signal-positive when owned     │
│   well — most candidates pretend everything was mode 1 or mode 2. Owning mode 3 honestly     │
│   means you know exactly which decisions deserve a re-look later.                            │
│                                                                                              │
│   Example: "I used `react-native-mediapipe-posedetection` to wrap MediaPipe. Claude          │
│             suggested it as the standard option. I didn't deeply evaluate the wrapper        │
│             quality versus building my own native module. I accepted because it had a        │
│             working Expo config plugin and the demo hit 30 fps. If the wrapper had a         │
│             bug I'd need to dig into the native code, which I'd treat as a real cost          │
│             when it happens."                                                                 │
│                                                                                              │
│   Senior posture: name the suggestion's origin, name what you *didn't* evaluate, name        │
│   the cost you'd own if it bites.                                                            │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Owning all three modes — including mode 3 — is the signal. Pretending everything was mode 1 or 2 is what registers as inauthentic. Senior interviewers in 2026 have heard a thousand candidates over-claim deliberateness; the candidate who says "I defaulted to it; here's what I didn't evaluate" earns trust.

---

## 8.1 — "Did you use AI to build this?"

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Did you use AI to build this?"                                               │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   The surface question is rhetorical. They know you did. The real probe is      │
│   whether you can talk about it matter-of-factly, without defensiveness or      │
│   bragging. The strong answer is short and direct.                              │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Yes — heavily. Claude was in the loop for most of the codebase. I drove the architectural decisions and the harder debugging; the AI accelerated boilerplate and helped me find patterns I didn't know existed. What I shipped is what I understand — happy to walk through any of it line by line."

That's it. Three sentences, about 12 seconds. You stop. You wait.

What you've done:
- **Confirmed** the obvious — no theater about it.
- **Calibrated** the division of labor — architectural decisions yours; boilerplate accelerated.
- **Offered** the follow-up they were going to ask anyway ("walk me through it").

┌─────────────────────────┬─────────────────────────────────┐
│ WEAK ANSWER             │ STRONG ANSWER                   │
├─────────────────────────┼─────────────────────────────────┤
│ "I used AI for some     │ "Yes, heavily. Claude was in    │
│ parts but I wrote the   │ the loop for most of the        │
│ hard logic myself.      │ codebase. I drove the           │
│ Mostly I used it for    │ architectural decisions and     │
│ like, boilerplate and   │ the harder debugging; the AI    │
│ stuff."                 │ accelerated boilerplate and     │
│                         │ helped me find patterns I       │
│                         │ didn't know existed. What I     │
│                         │ shipped is what I understand —  │
│                         │ happy to walk through any of    │
│                         │ it line by line."               │
├─────────────────────────┼─────────────────────────────────┤
│ Why it's weak:          │ Why it works:                   │
│ "Some parts" / "the     │ "Yes, heavily" — no defensive   │
│ hard logic myself" —    │ qualifier on the front. Names   │
│ defensive, vague,       │ the division of labor concretely│
│ minimizing. "Like" and  │ ("architectural decisions,"     │
│ "stuff" — filler.       │ "harder debugging"). Ends with  │
│ Trying to claim more    │ the offer to validate ("walk    │
│ ownership than is true  │ through any of it") — invites    │
│ signals insecurity.     │ the dig, doesn't dodge it.      │
└─────────────────────────┴─────────────────────────────────┘

```
"Did you use AI to build this?"
        │
        ▼
"Yes, heavily" + division-of-labor + offer to walk through.
        │
        ├─► IF THEY ASK "FOR WHAT, SPECIFICALLY"
        │     Use the three-modes framing. "Architectural decisions
        │      were deliberate — local-first, SQLite as truth, sync
        │      design. Boilerplate was AI-accelerated — Zod schemas,
        │      database migration scaffolding, mapper functions. There
        │      are also a few places where I defaulted to AI suggestions
        │      without deep evaluation — happy to name those too."
        │
        ├─► IF THEY ASK "WHAT % OF THE CODE DID YOU WRITE"
        │     Don't take the bait on a number. "Hard to put a number
        │     on. The way I'd frame it: every line is one I'd accept
        │     responsibility for. Some I wrote, some I edited, some I
        │     reviewed and accepted. The question I find more useful
        │     is 'which decisions did I make,' and I'd own all of those."
        │
        └─► IF THEY ASK "CAN YOU EXPLAIN THIS FILE LINE BY LINE"
              "Yes. Which file?" — and mean it. The next section covers
              this directly.
```

▸ "Yes, heavily" is a stronger opening than any qualifier you can put in front of it.

---

## 8.2 — "Can you explain this function line by line?"

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Pull up [some specific file]. Walk me through it line by line."              │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   This is the real probe. They picked a file that looks AI-generated and they   │
│   want to see whether you actually understand it. The failure pattern is        │
│   panicking and either (a) reading the code aloud without explaining or         │
│   (b) admitting you don't know without offering anything useful.                │
└─────────────────────────────────────────────────────────────────────────────────┘

The right response depends on which file they pick. Three categories:

```
┌─ Files you understand deeply (lead them here when possible) ────────────────────────────────┐
│                                                                                             │
│   src/lib/game/reconstruct.ts             — pure function, you tuned the algorithm          │
│   src/lib/pose/rep-counter.ts             — FSM with hysteresis values you measured         │
│   src/lib/pose/angles.ts                  — smoothing factor α=0.4 you picked empirically   │
│   src/services/sync/supabase-sync.ts      — the restoreInProgress flag, your bug fix        │
│   src/hooks/useGameState.ts               — the orchestration logic, the reinstall          │
│                                              fingerprint you designed                       │
│                                                                                             │
│   Posture: confident, walking the *why* at each step, not just the *what*.                 │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─ Files you understand at the architectural level (defend the shape, name the details) ─────┐
│                                                                                             │
│   src/services/database.ts (migrate)      — you know the additive-only discipline; you may  │
│                                              not remember every PRAGMA table_info check     │
│   src/services/sync/mapper.ts             — straightforward row ↔ domain shape; one         │
│                                              function per entity                            │
│   src/components/camera/PoseCamera.tsx    — you know the config (Delegate.GPU, numPoses:1); │
│                                              you may not have written every prop binding    │
│                                                                                             │
│   Posture: walk the structure, name the decisions, be honest if asked about a specific      │
│   line you didn't write or don't remember.                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─ Files where you accepted AI defaults more than you evaluated (own that explicitly) ────────┐
│                                                                                             │
│   styling boilerplate in app/(tabs)/index.tsx etc. — NativeWind class combinations          │
│   the prebuild plugin configuration in app.json                                              │
│   most types in src/types/*.ts             — Claude generated these from your domain        │
│                                              descriptions; you reviewed but didn't author    │
│                                                                                             │
│   Posture: "this is the section where I accepted Claude's suggestion and reviewed rather    │
│   than authored line-by-line. The decisions in this file are about [the surface             │
│   they're testing] which I can defend; the specific syntax is reviewed-not-written."        │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

When they pick a category-1 file, you're at your best. Walk through it confidently — the *why* at each step.

When they pick a category-2 file, walk the structure first, then the details. If they probe a specific line you don't remember, say so honestly: "this `getAllAsync` call returns the row set; I don't remember every column in the SELECT — let me check." Looking at the code is allowed; pretending you remember is not.

When they pick a category-3 file, lead with the honesty:

> "This file is one where I leaned harder on Claude. The decisions I can defend are [the surface], and I reviewed each line — but if you want to know why I wrote `flex-1 items-center justify-center` versus some other class combination, the truth is I evaluated whether the result looked right and accepted the suggestion. The structural decisions in this file — what's a card, what's a tab, what's the navigation shape — those were mine."

That answer is *strong*. You've named the boundary. The interviewer now knows where to dig for substance and where to skip past.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHEN YOU GENUINELY DON'T REMEMBER                                             ║
║                                                                               ║
║   They point at line 247 of `database.ts`: "What's this for?"                 ║
║                                                                               ║
║   You haven't looked at this line in two weeks. You don't remember.           ║
║                                                                               ║
║   Say:                                                                        ║
║   "Let me look. [pause, read the line] This is `setLastPushedAt` —            ║
║    it updates the watermark after a successful push. I haven't                ║
║    touched this in a while; the function is one line that runs a              ║
║    parameterized UPDATE on the `sync_state` table. Want me to walk            ║
║    the broader flow it's part of, or stay on this line?"                      ║
║                                                                               ║
║   What this signals:                                                          ║
║   - reading code in real time is normal,                                      ║
║   - you can re-acquire context fast,                                          ║
║   - you offer two paths back to substance,                                    ║
║   - no panic, no pretending to remember.                                      ║
║                                                                               ║
║   Do NOT say:                                                                 ║
║   "Oh, that's, uh, that's the function that... sets the timestamp             ║
║    for, uh, when the last push was, I think?"                                 ║
║   Hedging while reading the code that's right in front of you is the         ║
║   pattern that signals "this candidate is performing, not understanding."     ║
╚═══════════════════════════════════════════════════════════════════════════════╝

▸ Reading the code in real time and re-acquiring context is normal engineering. Pretending you have the line memorized is the failure pattern.

---

## 8.3 — "What did the AI get wrong?"

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What did the AI get wrong? Where did you have to override it?"               │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   This is one of the strongest probes in 2026 interviews. They want to know     │
│   whether you have the judgment to overrule a suggestion when it's wrong.      │
│   The answer is real if you have a real example; it's catastrophic if you      │
│   manufacture one.                                                              │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Two real examples I can name.
>
> "First, the sync engine's pull-restore race. Claude's initial sketch for `pullRestoreIfFresh` called the same database writers I was using for normal writes — `db.upsertExercise`, `db.insertSession`, and so on. That seemed clean. But each writer fires `pushChanges` at the end, and during restore the watermark hadn't been advanced, so each push ran with `since = null`. Concurrent pushes wrote everything under whatever USER_ID was current — duplication bug. I had to add the `restoreInProgress` flag and the watermark-inside-try pattern. Claude didn't catch that until I described the symptom; it had given me a structurally-clean design that didn't account for the interaction with fire-and-forget pushChanges.
>
> "Second, smaller but real: when I asked for the rep counter FSM, the initial suggestion didn't include hysteresis. It was a clean 4-state machine with hard thresholds. I knew from doing some pose-tracking experiments earlier that hard-threshold counters flicker at boundary angles. I added 10° hysteresis at every transition and tuned the value by watching the FSM behavior on real workout video. Claude's suggestion was technically correct for a noise-free angle stream; I knew the input was noisy.
>
> "In both cases the AI's output was reasonable in isolation but missed a property of the surrounding system. The fix wasn't 'reject the AI's work'; it was 'integrate it into the larger picture and patch the gap.'"

```
"What did the AI get wrong?"
        │
        ▼
Two real examples + the meta-lesson: AI is good at local correctness, weak on system interactions.
        │
        ├─► IF THEY ASK FOR MORE EXAMPLES
        │     "A few smaller ones — Claude has been wrong about Expo SDK
        │      version syntax a couple of times when the SDK had recently
        │      changed and the training data hadn't caught up. The fix is
        │      reading the actual SDK docs. Less interesting because the
        │      fix is mechanical."
        │
        ├─► IF THEY ASK "HOW DO YOU CATCH IT"
        │     "Symptom-driven debugging, mostly. The pull-restore race
        │      showed up as duplicate rows in Supabase tagged with stale
        │      USER_IDs. The hysteresis gap showed up as the rep counter
        │      flickering at the bottom of a slow pushup. The AI doesn't
        │      flag these because they're emergent — they only appear in
        │      the running system, not in the source you generate."
        │
        └─► IF THEY ASK "WOULD AI HAVE CAUGHT YOUR FIX"
              "Sometimes. If I'd described the race symptom to Claude
               in detail, it would have suggested something like the
               flag. The point is I had to *notice* the race first,
               which required running the system and reading the
               Supabase tables. The noticing is mine; the fix
               implementation could have been AI-assisted."
```

▸ The strongest "what did AI get wrong" answer is a real bug the AI's initial design caused, plus the lesson that AI is good at local correctness and weak on system interactions.

---

## 8.4 — "How do you know what you don't know?"

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "How do you know what you don't know? If Claude wrote it, how do you know     │
│    you'd recognize a bug?"                                                       │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   The deepest probe in the chapter. They want to know whether you have a        │
│   meta-cognitive process for evaluating AI work, or whether you're flying       │
│   blind. The strong answer names a specific test you apply.                     │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Three practices, in increasing depth.
>
> "**The first** is the read-and-trace test. Before I commit code I didn't write line by line, I trace through what it does on a specific input I care about. For example, when Claude generated `reconstructFromSessions`, I walked it through a specific sequence — five sessions where session three was dirty — by hand, predicting the output. If my prediction matches the function's actual output, I trust the function. If it doesn't, I know the function is doing something I don't understand and I have to dig.
>
> "**The second** is the boundary test. I write tests at the boundary of every AI-generated function — not unit tests on the internals, but tests that pin the contract. For the sync engine, that's an integration test that does a restore and asserts no concurrent pushes fire. For `reconstructFromSessions`, that's a property test: random valid session sequences should produce the same output as a hand-built reference implementation. The boundary tests are what catch the AI's blind spots without me needing to understand the internals myself.
>
> "**The third** is the dogfood test. The hardest bugs — the pull-restore race, the hysteresis flicker — were both surfaced by me actually using the app on my own workouts. I noticed the duplicates in Supabase; I noticed the rep counter flickering on a slow squat. The AI doesn't dogfood. I do. That's where a lot of the system-interaction bugs surface.
>
> "What I don't have, and would build at a senior team: a structured eval set for the FSM that runs against fixed video clips with ground-truth rep counts. Right now I'm the eval. That's the gap."

▸ The senior answer to "how do you know what you don't know" is a process, not a personality trait.

---

## 8.5 — The closing posture

After the AI question, the interviewer is reading you for two things: confidence and accuracy. Confidence without accuracy looks like overclaiming; accuracy without confidence looks like undermining yourself. The closing posture for this whole chapter — and arguably the whole interview — is **calibrated confidence**: confident about what's true, explicit about what isn't, willing to walk into the gaps without flinching.

A senior interviewer in 2026 has heard hundreds of candidates over-claim or under-claim on AI work. The candidate who reads as senior is the one who treats AI use the same way they'd treat any other tool: it accelerated some of the work, it didn't replace the work, the decisions are mine, the artifacts are reviewable, and I'll walk through any of them.

▸ The 2026 reality is that everyone uses AI. The senior interview question is whether you can own what you shipped.

---

## What you'd change

If you were re-doing the AI-honesty story from scratch today, the change is **commit-message hygiene**. The current commit messages on contrl are descriptive but they don't note where Claude was particularly load-bearing versus where it wasn't. A senior version would have commit-message conventions like "AI-assisted: scaffolding" versus "AI-assisted: full author" versus "human-only: critical-path fix." That artifact would do two things: it would force you to think about each commit's AI provenance at write time (the self-awareness that survives interviews), and it would give an interviewer who looked at the commit history a clear picture without having to ask.

This is also the kind of change that helps you in two years when you're trying to remember what you understood deeply versus what you accepted on defaults. AI provenance ages fast; the commit-message annotation is durable.

▸ Annotate AI provenance in commits. It's the cheapest auditable form of intellectual honesty.

---

## One-page summary

**Core claim:** Three modes of decision-making — deliberate, evaluated-and-accepted, defaulted-to — and the senior signal is owning all three honestly, including the third. The 2026 interviewer assumes you used AI; the question is whether you can own what you shipped.

**Questions covered:**
- "Did you use AI to build this?" → "Yes, heavily. I drove the architectural decisions and the harder debugging; AI accelerated boilerplate. Happy to walk through any of it."
- "Can you explain this file line by line?" → Three categories of files; lead them to category 1 when possible, walk structure-then-detail for category 2, name the boundary explicitly for category 3.
- "What did the AI get wrong?" → Two real examples: the pull-restore race (AI missed the writer-callback interaction) and the FSM hysteresis (AI gave a noise-free design for noisy input). Meta-lesson: AI is good at local correctness, weak on system interactions.
- "How do you know what you don't know?" → Three practices: read-and-trace test, boundary tests at the contract, dogfood the running system.
- "What % did you write?" → Don't take the bait on a number. "Every line is one I'd accept responsibility for. The question I find more useful is 'which decisions did I make?'"

**Pull quotes:**
- "'Yes, heavily' is a stronger opening than any qualifier you can put in front of it."
- "Reading the code in real time and re-acquiring context is normal engineering. Pretending you have the line memorized is the failure pattern."
- "AI is good at local correctness and weak on system interactions."
- "The senior answer to 'how do you know what you don't know' is a process, not a personality trait."
- "The 2026 reality is that everyone uses AI. The senior interview question is whether you can own what you shipped."

**What you'd change:** Adopt commit-message conventions that annotate AI provenance (`AI-assisted: scaffolding`, `AI-assisted: full author`, `human-only: critical-path fix`). Forces self-awareness at commit time; auditable forever.
