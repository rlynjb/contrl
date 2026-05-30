# Chapter 7 — The counterfactuals

The senior-engineer move is to volunteer what you'd reconsider before being asked. When the interviewer hears "if I started today I'd do X differently," they hear "this candidate doesn't think their work is finished." That's a strong signal — *if* the counterfactual is real. The failure pattern is fabricating regret over decisions that were obviously right. Engineers who pretend to regret things they don't actually regret signal the opposite of seniority.

This chapter is three real counterfactuals for contrl, one anti-counterfactual (a thing you would NOT change despite the interviewer probing), and the framework for distinguishing the two.

```
┌─ contrl's counterfactuals matrix ───────────────────────────────────────────────────────────┐
│                                                                                             │
│                                                                                             │
│   Decision                          │ Would you change it?  │ What would change with it    │
│   ──────────────────────────────────┼──────────────────────┼─────────────────────────────  │
│                                                                                             │
│   USER_ID source: hardcoded const   │ YES                  │ → expo-secure-store, gen UUID │
│   in src/services/sync/config.ts    │ (the one real regret)│   on first run                │
│                                     │                      │                               │
│   ──────────────────────────────────┼──────────────────────┼─────────────────────────────  │
│                                                                                             │
│   Sync coupling: writers call       │ YES                  │ → event-queue between writers │
│   pushChanges() fire-and-forget     │ (the scar-tissue     │   and sync; pause-on-restore  │
│                                     │ refactor)            │   instead of flag             │
│                                     │                      │                               │
│   ──────────────────────────────────┼──────────────────────┼─────────────────────────────  │
│                                                                                             │
│   Missing observability: no metrics │ YES                  │ → metrics/ module logging to  │
│   for replay time, JS heap,         │ (the gap to close    │   a local table; never to     │
│   missed-transitions, push lag      │ first)               │   network                     │
│                                     │                      │                               │
│   ──────────────────────────────────┼──────────────────────┼─────────────────────────────  │
│                                                                                             │
│   Local-first architecture          │ NO                   │ — (and here's why probing it  │
│   (SQLite source of truth)          │ (the obvious-right   │   doesn't find regret)        │
│                                     │ call, anti-pattern   │                               │
│                                     │ to "regret")         │                               │
│                                     │                      │                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

Three real regrets, one anti-regret. The discipline is being able to tell which is which without flinching.

---

## 7.1 — The hardcoded USER_ID

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "If you were starting today, what would you do differently?"                  │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you have a real reconsideration ready? Is it at the right altitude — not   │
│   trivial (file naming), not too sweeping (rewrite in Rust)? The strong         │
│   answer is one specific decision, what you'd change about it, and why the     │
│   smaller version of the choice would have paid back.                           │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "The USER_ID source. Today it's a literal constant in `src/services/sync/config.ts`:
>
>     const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
>
> "That decision was 'Phase A is single-user, hardcode it for now.' The lack of auth was right — it was the deliberate scope. But the *source* of the constant is what I'd change. The cleaner shape, from day one, would have been:
>
> "On first app open, generate a UUID and stash it in `expo-secure-store`. Read from secure-store thereafter. Same single-tenant behavior, same single user, but the value lives in device-local secure storage instead of in source code.
>
> "Why it matters: Phase B is auth + RLS. Today, the Phase B migration has to also build the secure-storage seeding flow — read USER_ID from secure-store, fall back to the constant if absent for backward compatibility, eventually retire the constant. If I'd put USER_ID in secure-store from day one, Phase B is just 'enable RLS, add policies' — the storage path was already correct.
>
> "Half a day of Phase A work would have saved a sprint of Phase B work. I didn't make the call because the constant was simpler and the Phase B work felt far away. That's the call I'd undo."

```
"What would you change?"
        │
        ▼
The USER_ID source. Constant → expo-secure-store from day one. Half a day saves a sprint.
        │
        ├─► IF THEY ASK "WHY DIDN'T YOU?"
        │     "Phase B felt far away when I was shipping Phase A. The
        │      hardcoded constant was simpler and was good enough for
        │      the test user. I traded the future cost for present
        │      simplicity, and I'd make a different call now that I
        │      can see Phase B clearly."
        │
        ├─► IF THEY ASK ABOUT MIGRATING NOW
        │     "Bounded migration. On next app start, read USER_ID from
        │      secure-store; if absent, write the current constant
        │      there as the seed, then read from secure-store going
        │      forward. The constant stays in config.ts as a fallback
        │      for one release cycle, then retires."
        │
        └─► IF THEY ASK ABOUT BACKUP / SECURE-STORE LOSS
              "Real concern. If the user wipes secure-store (factory
               reset, app uninstall + reinstall), the UUID is lost
               and Phase B auth has to recover. The Phase B answer is
               account-level auth (email + password or magic link)
               with the UUID derived from auth.uid(). The Phase A
               migration is bridging that — secure-store as a
               stopgap until real auth ships."
```

▸ The counterfactual that pays off is the one where a half-day of Phase A work would have saved a sprint of Phase B work.

---

## 7.2 — The sync coupling

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Anything else you'd reconsider?"                                             │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Will you offer a second real one, or did you have one rehearsed and now      │
│   you're empty? The strong answer is a different *kind* of decision than the    │
│   first — not the same flavor twice. First was a configuration call; this      │
│   one is an architectural coupling.                                              │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "The coupling between the database writers and the sync engine. Today, every writer in `database.ts` — `insertSession`, `updateGateProgress`, `deleteSession`, and so on — ends with `pushChanges().catch(() => {})`. Fire-and-forget. The intent is right: every write triggers a sync attempt.
>
> "The problem is that this coupling is what made the pull-restore race possible. During restore, `pullRestoreIfFresh` calls the writers to populate SQLite — each one fires a `pushChanges` — and the watermark hasn't been advanced yet, so each `pushChanges` runs with `since = null`. I fixed it with a module-scope `restoreInProgress` flag, which works, but the flag is a symptom of the wrong shape.
>
> "The shape I'd build instead: writers emit events to an in-process queue. The sync engine subscribes to the queue and drains it. Pausing sync during restore is the same primitive as pausing the queue — no flag needed. The writers don't know about the sync engine; they just emit. That decoupling makes the rest of the sync story cleaner too: backpressure, batching, retry policies all become queue-level concerns instead of per-writer concerns.
>
> "I didn't build it that way originally because the fire-and-forget pattern was the smallest amount of code that worked. The race wasn't visible until I shipped pull-restore. The lesson is that fire-and-forget across module boundaries is the kind of thing that doesn't show its cost until much later — and 'much later' is exactly when refactoring is most expensive. I'd take the up-front cost of the queue if I were doing it again."

▸ Some couplings don't show their cost until the third feature you add. Take the up-front cost of the right shape.

---

## 7.3 — Missing observability

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What's the gap you'd close first?"                                           │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Are you maintaining the system or just shipping it? An engineer who can       │
│   name the next observability gap as "the first thing I'd close" shows         │
│   maintenance instincts, not just feature-shipping instincts.                   │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Observability. Today I have almost no metrics in the codebase. I can't tell you:
>
> "- How long `reconstructFromSessions` takes on the actual user's data.
> "- How much JS heap `getSessions` allocates at install time.
> "- The frame-arrival rate to the JS-side callback from MediaPipe.
> "- How often the FSM misses a bottom-transition during a workout.
> "- The p99 latency of `pullRestoreIfFresh` on fresh install.
> "- Sync lag — how much time passes between a local write and a successful push.
>
> "Every scale answer in the previous chapter was reasoned from first principles, not measured. That's a gap. The fix is a small `metrics/` module that writes to a local `metrics_events` SQLite table — never to the network — and a Settings screen that surfaces the rolling distributions. The metrics stay local because they're not anonymized telemetry; they're for development.
>
> "Why I'd close this first, before any new feature: every other future change is harder to evaluate without it. 'Is the new feature making the app slower?' — I can't answer today. 'Did the new sync code increase push lag?' — I can't answer. The lack of observability compounds. Closing the gap before the next sprint costs maybe two days; not closing it costs every future change."

```
"What's the gap you'd close first?"
        │
        ▼
Observability. Two days to build; compounds across every future change.
        │
        ├─► IF THEY ASK ABOUT TRADITIONAL APM
        │     "Sentry is on the roadmap for crash reporting, but APM
        │      tools assume a server. For an on-device-only app the
        │      shape is different — local metrics_events table,
        │      surfaced in Settings for me, never sent to a backend
        │      because there's no backend. Privacy-preserving by
        │      construction."
        │
        ├─► IF THEY ASK ABOUT THE 80/20
        │     "Three metrics first: reconstruction time, getSessions
        │      JS heap, FSM phase-transition rate. Each is one log
        │      line at the right boundary, written to the table with
        │      a timestamp. The query for the Settings view is a
        │      simple SELECT. Day-one effort, day-two polish."
        │
        └─► IF THEY ASK ABOUT PII RISK
              "No PII concern because the metrics never leave the
               device. The table holds latency numbers, heap sizes,
               counts — nothing identifying. It's developer-mode
               instrumentation, not telemetry."
```

▸ The next gap to close isn't a feature. It's the instrumentation that makes future features evaluable.

---

## 7.4 — The thing you wouldn't change

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Would you reconsider the local-first architecture if you started today?"     │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Can you defend an architectural choice without flinching when pressed?        │
│   Are you confident enough to say "no, that one was right" without sounding    │
│   defensive? The senior signal is that you can name *why* the obvious-right     │
│   choice was right, without conceding when probed.                              │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "No. Local-first was the right call. I'd build it the same way.
>
> "The constraints that drove it haven't changed. The latency budget for a checkbox tap is still ~50ms; that's still incompatible with cloud-first writes. The use case is still 'workout in a basement gym with two bars of signal'; that's still incompatible with cloud-first reads. The user is still single — there's no multi-user collaboration story that would force server-as-truth.
>
> "If anything, I'm more confident now than I was at the start. The reinstall recovery story — `pullRestoreIfFresh` plus `reconstructFromSessions` — is real engineering, but it's bounded and it's solved. The cost is one engineering quarter of sync work; the benefit is sub-millisecond reads forever, full offline capability, zero backend infrastructure to operate.
>
> "What would change my mind: if contrl ever became a multi-user collaboration app — partner workouts, trainer + client, anything where two humans need to see the same data in real-time — then last-writer-wins via watermark stops being enough, and the design pressure flips toward server-as-truth with CRDTs as the conflict layer. That's a different product. For the product I built — single-user workout tracking with on-device CV — local-first is the right shape and the right cost."

┌─────────────────────────┬─────────────────────────────────┐
│ WEAK ANSWER             │ STRONG ANSWER                   │
├─────────────────────────┼─────────────────────────────────┤
│ "Hmm, well, I mean, I   │ "No. Local-first was right.     │
│ guess maybe I'd think   │ The latency budget, the offline │
│ about whether server-   │ use case, and the single-user   │
│ first would have been   │ scope all still drive the same  │
│ easier? There are       │ choice. What would change my    │
│ tradeoffs either way..."│ mind is multi-user real-time    │
│                         │ collaboration — different       │
│                         │ product, different choice. For  │
│                         │ this product, same call."       │
├─────────────────────────┼─────────────────────────────────┤
│ Why it's weak:          │ Why it works:                   │
│ "Hmm, well, I mean, I   │ "No" without hedging. Three     │
│ guess maybe" — the      │ named constraints that still    │
│ classic interview tell  │ apply. Explicit boundary on     │
│ for "I'm trying to give │ what would change the answer    │
│ you the answer I think  │ (different product = different  │
│ you want." Hedging      │ call). No false regret.         │
│ tradeoffs without       │                                 │
│ committing. Failure.    │                                 │
└─────────────────────────┴─────────────────────────────────┘

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHEN THEY KEEP PRESSING                                                       ║
║                                                                               ║
║   "Are you sure? A lot of apps go server-first."                              ║
║                                                                               ║
║   They're testing whether you'll fold under social pressure. Hold.            ║
║                                                                               ║
║   Say:                                                                        ║
║   "I'm sure. A lot of apps that go server-first have different use            ║
║    cases — they're collaborative, they're multi-device by design, or          ║
║    the data is fundamentally shared. contrl's use case is single user,        ║
║    single device, offline-first by design. The shape that fits that is        ║
║    local-first. I'd be wrong to pick server-first just because it's            ║
║    more common."                                                              ║
║                                                                               ║
║   What this signals:                                                          ║
║   - confidence in a deliberate choice,                                        ║
║   - explicit about why the *common* choice would be wrong for *your*          ║
║     specific use case,                                                        ║
║   - not arguing the other side is bad — arguing your side fits better.        ║
║                                                                               ║
║   Do NOT say:                                                                 ║
║   "Well, yeah, I guess maybe server-first has some advantages..."             ║
║   Folding under social pressure on a defensible choice is one of the          ║
║   strongest negative signals in a senior interview. Hold the position.        ║
╚═══════════════════════════════════════════════════════════════════════════════╝

▸ The anti-counterfactual is the choice you defend when they push. Folding here is the failure pattern.

---

## What you'd change

If you were re-doing the counterfactuals chapter from scratch today, the change is small: **lead with the observability gap** (section 7.3) instead of the USER_ID (section 7.1). The observability gap is a more interesting answer because it's about ongoing maintenance, not about a one-time decision. The USER_ID is a tighter answer; the observability gap is a more senior answer.

In the interview, save the strongest answer for last. If you only have time for one, give the USER_ID — it's compact. If you have time for two, give the USER_ID first (warm-up) and the observability gap second (the senior tell). Don't give all three unprompted — that's a monologue. Let the interviewer ask for the second.

▸ The order of counterfactuals matters. Save the strongest for when the interviewer asks for it.

---

## One-page summary

**Core claim:** Three real counterfactuals + one anti-counterfactual. The real ones are: USER_ID source (config → secure-store), sync coupling (writer-callback → event queue), observability (none → local metrics table). The anti-counterfactual is the local-first architecture — you defend it when pressed, no fold.

**Questions covered:**
- "What would you do differently?" → USER_ID source. Half-day Phase A work saves a sprint of Phase B work.
- "Anything else?" → The sync coupling. Writers should emit to a queue; sync subscribes; restore pauses the queue instead of using a flag.
- "What's the gap you'd close first?" → Observability. Two days to build a local `metrics_events` table; compounds across every future change.
- "Would you reconsider local-first?" → No. Same latency budget, same offline use case, same single user. Multi-user real-time collaboration would change the answer.
- "Are you sure?" (social pressure) → Yes. Different use cases pick different shapes; local-first fits this one.

**Pull quotes:**
- "The counterfactual that pays off is the one where a half-day of Phase A work would have saved a sprint of Phase B work."
- "Some couplings don't show their cost until the third feature you add."
- "The next gap to close isn't a feature. It's the instrumentation that makes future features evaluable."
- "The anti-counterfactual is the choice you defend when they push. Folding here is the failure pattern."

**What you'd change:** The order of presentation. Lead the chapter with observability (the senior tell); save the USER_ID counterfactual as the compact opening answer in the interview. Don't volunteer all three at once.
