# Chapter 1 — The pitch

In the first sixty seconds of every senior interview, someone is going to ask you to talk about a project. The default failure is to ramble. You start with too much context, you bury the lede, you over-qualify, and by the time you reach what's interesting the interviewer has already mentally rated this as the kind of candidate who can't compress. This chapter is about not doing that.

You will pitch contrl three times — at three lengths — and the three versions are not "the short version, the medium version, and the long version." They are three different tools. The 10-second pitch is a label. The 30-second pitch is a hook. The 90-second pitch is the real answer. Pick the right tool for the room.

```
┌─ Three pitches, three jobs ──────────────────────────────────────────────────────────┐
│                                                                                      │
│   10 seconds (the label)                                                             │
│   ────────────────────────                                                           │
│   one sentence. categorically identifies the project.                                │
│   used: "what have you been working on lately?" — small talk.                        │
│                                                                                      │
│                                                                                      │
│   30 seconds (the hook)                                                              │
│   ────────────────────────                                                           │
│   ~3-4 sentences. adds the one interesting thing.                                    │
│   used: "tell me a bit about it" — they want to decide whether to dig in.            │
│                                                                                      │
│                                                                                      │
│   90 seconds (the real answer)                                                       │
│   ────────────────────────                                                           │
│   the structured walk. problem → approach → key choice → what's interesting.         │
│   used: "tell me about a project you built" — this is the senior-interview opener.   │
│                                                                                      │
│                                                                                      │
│      ┌──────────────┬──────────────┬──────────────────────────────────────────┐      │
│      │ length       │ ends with    │ what it sets up                          │      │
│      ├──────────────┼──────────────┼──────────────────────────────────────────┤      │
│      │ 10s          │ a noun       │ "okay, tell me more"                     │      │
│      │ 30s          │ a hook       │ "where do you want to start?"            │      │
│      │ 90s          │ a question   │ "let's dig into [whatever you pointed   │      │
│      │              │   landed     │  the interviewer at]"                    │      │
│      └──────────────┴──────────────┴──────────────────────────────────────────┘      │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Three pitches, three tools. The discipline is knowing which one you're being asked for.

---

## The 10-second pitch

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What have you been working on?"                                              │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Can you compress? Do you know what your own project IS, in one sentence,      │
│   without hedging? A candidate who needs three minutes to identify their        │
│   project signals "I don't know what I built" — even if you do.                 │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "I built **contrl** — a local-first bodyweight-progression app that counts reps from the phone's camera using on-device pose detection."

That's it. Nineteen words. One sentence. One project, one mechanism, one differentiator (*on-device*). You stop. You wait for the follow-up. The interviewer now has a noun — "a local-first fitness app with on-device CV" — and they decide what to ask next.

┌─────────────────────────┬─────────────────────────────────┐
│ WEAK ANSWER             │ STRONG ANSWER                   │
├─────────────────────────┼─────────────────────────────────┤
│ "So I've been working   │ "I built contrl — a local-first │
│ on this fitness app,    │ bodyweight-progression app that │
│ it's like a workout     │ counts reps from the phone's    │
│ tracker but with some   │ camera using on-device pose     │
│ AI stuff and like a     │ detection."                     │
│ skill tree thing where  │                                 │
│ you level up, and it    │                                 │
│ works offline too..."   │                                 │
├─────────────────────────┼─────────────────────────────────┤
│ Why it's weak:          │ Why it works:                   │
│ Three filler words      │ A category ("bodyweight-        │
│ before the project name.│ progression app"), an           │
│ "Some AI stuff" signals │ architectural property          │
│ you don't remember      │ ("local-first"), and the        │
│ which AI you used.      │ one technically interesting     │
│ Five clauses, no end.   │ thing ("on-device pose          │
│ Trails off — they have  │ detection"). One breath.        │
│ to interrupt to start   │                                 │
│ a question.             │                                 │
└─────────────────────────┴─────────────────────────────────┘

Two things make the strong version work. First, **the project has a name and you say it first** — `contrl`. Names land. Second, **the differentiator is technical, not aspirational** — "on-device pose detection" is something the interviewer can immediately ask about. "An AI fitness app" is something they have to dig past.

┃ "The 10-second pitch ends with a noun. The 90-second pitch ends with a question landed."

---

## The 30-second pitch

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Tell me a bit about it."                                                     │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Now they want enough to ask one real question. You earn 30 seconds; the       │
│   right answer ends with the interviewer knowing exactly where to dig.          │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "I built **contrl** — a local-first bodyweight-progression app that counts reps from the phone's camera. The user picks a level (push, pull, or squat), the camera runs MediaPipe pose detection on-device, and a per-exercise state machine in TypeScript counts reps from the joint angles. SQLite is the source of truth on the phone — the whole app works offline. Supabase is a write-mostly cloud mirror, just for restoring on a fresh install. There's no auth yet; it's single-user by design at this phase."

That's around 70 words, about 25 seconds spoken. You've added:

- **The flow** — "user picks a level → camera → MediaPipe → state machine counts reps."
- **The data layering** — "SQLite source of truth, Supabase mirror, works offline."
- **One honest scope-tell** — "no auth yet, single-user by design."

The last sentence is doing real work. A senior interviewer's ear perks up when you volunteer scope honestly. It signals you know what's *not* there, which is the prerequisite to defending what *is* there.

```
"Tell me a bit about it"
        │
        ▼
You give the 30-second pitch.
        │
        ├─► IF THEY ASK ABOUT THE CV PIPELINE
        │     Go to Chapter 2 (the architecture) — walk camera through FSM.
        │
        ├─► IF THEY ASK ABOUT THE DATA LAYER
        │     Go to Chapter 2 + Chapter 3 — SQLite-as-source-of-truth defense.
        │
        ├─► IF THEY ASK ABOUT THE LACK OF AUTH
        │     Go to Chapter 3 — hardcoded-USER_ID-as-MVP defense. Own it cleanly.
        │
        └─► IF THEY ASK "WHY THIS PROJECT?"
              30 seconds on your motivation; don't get sentimental.
              "I wanted to ship a real local-first stack and learn on-device CV."
```

Each branch is the start of a different chapter. The pitch is the funnel that points the conversation; the chapters are where you have material.

---

## The 90-second pitch

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Tell me about a project you've built."                                       │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   This is the senior interview's standard opener. They want a structured walk  │
│   that demonstrates judgment, not a feature list. They are listening for:       │
│   what problem, what approach, what choices, what's interesting about the       │
│   approach, where you'd take it next. The shape signals seniority before any    │
│   technical content does.                                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

This is the one to memorize. Practice it out loud until it lands in 90 seconds without you watching the clock.

Say:

> "I built **contrl** — a local-first bodyweight-progression app, written in React Native with Expo, that uses the phone's camera and MediaPipe pose detection to count reps for push-ups, squats, and pull-ups.
>
> "The problem I was solving for myself was that calisthenics progression is hard to track. You're not adding weight, you're adding clean reps, and the moment is whether a set was clean — not whether you did it. So the app has a five-level skill tree per category, and you advance a level only when three consecutive sessions hit their rep targets cleanly.
>
> "The architecture choice I'm proudest of is making SQLite the source of truth on the phone. Every read hits a local SQLite file. Writes commit locally first; Supabase is a write-mostly mirror that only pulls down on a fresh install. The app is fully usable offline, which matters because most workouts happen in basement gyms with two bars of signal.
>
> "On the camera side, the pipeline is: vision-camera captures frames, MediaPipe runs `pose_landmarker_lite` on the GPU at about 30 fps, and a per-exercise state machine in TypeScript consumes the joint angles. The state machine has ten-degree hysteresis at every transition, which is what makes the rep count actually robust — without it, you count noise at the threshold.
>
> "What I'd take next: I have a Phase 2C planned where I train a small LightGBM form classifier on the pose features, and a Phase 4 where I add an LLM coaching agent that reads from five read-only tools over the local data. Both are scoped, neither shipped yet — happy to dig into the design."

Roughly 250 words, about 90 seconds spoken. The shape is doing the work:

```
┌─ The 90-second shape ──────────────────────────────────────────────────────────┐
│                                                                                │
│   1. The label.       what is it. one breath. "I built contrl — ..."            │
│   2. The problem.     why does it exist. for whom. one short paragraph.        │
│   3. The choice.      the architectural decision you're proudest of.           │
│   4. The pipeline.    the technically interesting part, ~3 sentences.          │
│   5. The handoff.     what you'd take next; an explicit invitation to dig.      │
│                                                                                │
│   ──────────────────────────────────────────────────────────────────────────   │
│                                                                                │
│   The handoff is critical. It ends the monologue with a question landed —     │
│   you've told them where the interesting work is, and they get to pick.        │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

The handoff at the end is the line most candidates leave off. Without it, you finish your monologue and there's a silence and the interviewer has to invent the next question on their own. With it, you've handed them three options — Phase 2C, Phase 4, or back to anything else — and they pick. You stay on your foot. You're not waiting to be drilled.

▸ The 90-second pitch ends with a handoff, not a period.

---

## What if they interrupt?

They will. The 90-second pitch is the structure you'd deliver if uninterrupted. About half the time you'll get to clause four; about a third of the time you'll get interrupted at clause three with "wait, tell me more about the camera thing." That is a *good* outcome — they're already engaged. Don't fight to finish the pitch.

```
You're at clause 3 (the SQLite choice).
        │
        ▼
They interrupt: "Wait — local-first? You don't sync at all?"
        │
        ├─► THE WRONG MOVE
        │     Try to finish your pitch. "Yes, well, let me come back to that..."
        │     Interviewer reads this as: candidate has a script, not a model.
        │
        └─► THE RIGHT MOVE
              Pivot to their question. "We sync — write-mostly. SQLite is the
              source of truth on device; Supabase is the cloud mirror. Pull
              only fires on a fresh install — we pull all five tables from
              Supabase before the first render so the home screen isn't empty.
              Push fires on every write, watermark-based, fire-and-forget."
              Then: "Want me to walk through the sync engine, or come back
              to the camera pipeline?"
```

The pivot is the senior move. You answer their question fully, then offer two paths forward. Now you're in conversation, not monologue, and the interviewer is engaged.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHEN YOU DON'T KNOW                                                           ║
║                                                                               ║
║   They ask, mid-pitch, about something tangential you genuinely               ║
║   haven't thought through. Example: "What's the React Native bundle           ║
║   size, ballpark?"                                                            ║
║                                                                               ║
║   You haven't measured. You have no number to give.                           ║
║                                                                               ║
║   Say:                                                                        ║
║   "I haven't measured bundle size — it hasn't been a constraint at            ║
║    this scale. If I were optimizing for app-store install size or             ║
║    cold-start time on low-end Android, that's where I'd start. Is             ║
║    bundle size something you'd want to dig into, or is this a check          ║
║    on whether I think about it?"                                              ║
║                                                                               ║
║   What this signals:                                                          ║
║   - confidence about what you *did* think about,                              ║
║   - no fake confidence about what you didn't,                                 ║
║   - meta-awareness of why they might be asking.                               ║
║                                                                               ║
║   Do NOT say:                                                                 ║
║   "Uh, I think it's like... maybe 20 MB? Could be smaller? I haven't         ║
║    really checked but I think Hermes helps with that."                        ║
║   This is the worst pattern in senior interviews: hedging into                ║
║   territory you don't know with a half-remembered factoid. The                ║
║   interviewer hears "candidate guesses when pressed" and stops               ║
║   trusting other numbers you give.                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

The "I haven't measured because it hasn't been a constraint" answer is *strong*. Engineers who only measure what matters are valuable engineers. The trap is feeling like every question needs a confident-sounding number.

---

## What you'd change

If you were re-pitching contrl from scratch today, the one thing you'd change is to **lead with the technical differentiator earlier**. The current 90-second pitch front-loads the problem (calisthenics progression is hard to track), which is correct for *most* audiences but slightly under-tuned for senior engineers. A senior interviewer is more interested in "on-device CV pipeline at 30 fps with hysteresis-tuned state machines" than in "I wanted to track my pull-ups." Reorder: keep clause one (the label), invert clauses two and three so the architectural choice lands before the user-story setup.

You wouldn't go further than that. The handoff structure stays. The five-clause shape stays. The honesty about scope stays. The fix is one paragraph swap.

▸ Pitch the problem, but for a senior interviewer, lead with the interesting machine.

---

## One-page summary

**Core claim:** Three pitch lengths are three different tools, not three lengths of the same answer. The 10-second pitch is a label that ends with a noun. The 30-second pitch is a hook that points the interviewer at where to dig. The 90-second pitch is the structured walk that ends with a handoff.

**Questions covered:**
- "What have you been working on?" → the 10-second label, ends with a noun, stop.
- "Tell me a bit about it." → 30 seconds, four clauses, end with one honest scope-tell.
- "Tell me about a project you've built." → the 90-second pitch in five clauses: label, problem, choice, pipeline, handoff.
- "Wait — \[interruption\]?" → pivot fully, then offer two paths back.
- "What's the bundle size?" (or any tangential measurement) → "I haven't measured because it hasn't been a constraint. Want me to dig in?"

**Pull quotes:**
- "The 10-second pitch ends with a noun. The 90-second pitch ends with a question landed."
- "The 90-second pitch ends with a handoff, not a period."
- "Pitch the problem, but for a senior interviewer, lead with the interesting machine."

**What you'd change:** Reorder clauses two and three in the 90-second pitch — for a senior interviewer, lead with the architecture choice and the pipeline before the user-story setup.
