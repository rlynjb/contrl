# Chapter 3 — The choices

After the pitch and the architecture walk, the interviewer drills into the tech stack. "Why this database?" "Why React Native?" "Why no auth?" Each is a probe for the same thing: did you choose, or did you default. Defending a default is fine — engineers default to things all the time — but you have to know *that* you defaulted, *what* you defaulted to, and *what the cost is*.

This chapter is one section per load-bearing choice. It does not cover trivial choices (NativeWind vs. StyleSheet, Jest vs. anything — these don't separate candidates). It does cover the six choices that an interviewer will press on. Each section names the alternatives you actually considered, the decision criterion, and the cost you're paying.

```
┌─ contrl's load-bearing choices, with the picked option highlighted ──────────────────────────┐
│                                                                                              │
│                                                                                              │
│   Mobile platform                                                                            │
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐               │
│   │ ►► React Native +    │  │ Native Android +     │  │ Flutter              │               │
│   │    Expo (SDK 55)     │  │ native iOS (separate)│  │                      │               │
│   │ cross-platform; one  │  │ best perf; ~2× build  │  │ cross-platform; less │               │
│   │ codebase; prebuild   │  │ effort; team-of-1    │  │ mature CV ecosystem  │               │
│   │ when needed          │  │ won't ship two       │  │                      │               │
│   └──────────────────────┘  └──────────────────────┘  └──────────────────────┘               │
│                                                                                              │
│   Data persistence                                                                           │
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐               │
│   │ ►► SQLite as the     │  │ AsyncStorage / MMKV  │  │ Realm / WatermelonDB │               │
│   │    source of truth   │  │                      │  │                      │               │
│   │ ACID + queries +     │  │ KV only; no indexes;  │  │ ORM-y; Expo eject;   │               │
│   │ WAL; one file        │  │ no transactions       │  │ another mental model │               │
│   └──────────────────────┘  └──────────────────────┘  └──────────────────────┘               │
│                                                                                              │
│   Cloud mirror                                                                               │
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐               │
│   │ ►► Supabase          │  │ Firebase / Firestore │  │ Self-hosted backend  │               │
│   │    (Postgres +       │  │                      │  │ (Express + Postgres) │               │
│   │     anon key)        │  │ cloud-first cache;   │  │ ops cost; auth +     │               │
│   │ Postgres + PostgREST │  │ vendor model conflicts│  │ schema + migrations  │               │
│   │ + RLS-ready          │  │ with local-first     │  │ to build from zero   │               │
│   └──────────────────────┘  └──────────────────────┘  └──────────────────────┘               │
│                                                                                              │
│   Pose detection                                                                             │
│   ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐               │
│   │ ►► MediaPipe via     │  │ Apple Vision (iOS)   │  │ Cloud Vision API     │               │
│   │    vision-camera     │  │ + ML Kit (Android)   │  │                      │               │
│   │ cross-platform; one  │  │ best-tuned per OS;   │  │ network latency = 200│               │
│   │ model file; GPU      │  │ two integrations to  │  │ ms+, privacy-hostile,│               │
│   │ delegate at 30 fps   │  │ maintain             │  │ paid per frame       │               │
│   └──────────────────────┘  └──────────────────────┘  └──────────────────────┘               │
│                                                                                              │
│   Inference location                                                                         │
│   ┌──────────────────────┐  ┌──────────────────────┐                                          │
│   │ ►► On-device,        │  │ Cloud inference      │                                          │
│   │    GPU-delegated     │  │                      │                                          │
│   │ no network in hot    │  │ blocked by privacy + │                                          │
│   │ path; privacy free   │  │ latency; rejected    │                                          │
│   └──────────────────────┘  └──────────────────────┘                                          │
│                                                                                              │
│   Auth model (Phase A)                                                                       │
│   ┌──────────────────────┐  ┌──────────────────────┐                                          │
│   │ ►► Hardcoded USER_ID │  │ Real auth + RLS      │                                          │
│   │    + anon key,       │  │                      │                                          │
│   │    RLS off           │  │ Phase B work; schema │                                          │
│   │ single-tenant MVP;   │  │ is already multi-    │                                          │
│   │ Phase B-ready schema │  │ tenant-ready         │                                          │
│   └──────────────────────┘  └──────────────────────┘                                          │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Six choices. Each one defensible. The rest of this chapter is one section per choice — the question they ask, the answer you give, the side-by-side that separates strong from weak, and the follow-up tree.

---

## 3.1 — Why React Native + Expo, not native?

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Why React Native and not native iOS / Android?"                              │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you understand the actual cost of cross-platform tradeoffs at this scale?  │
│   Or did you reach for what you already knew? "I'm a frontend engineer" is      │
│   not a sufficient defense alone — but combined with a real understanding of    │
│   what you gave up, it's the right defense.                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Three reasons. First, one codebase. I'm a team of one — shipping native Android and native iOS separately would have doubled the build effort, and I would have shipped one platform a quarter behind the other forever. Second, my entire frontend background is JavaScript and TypeScript — React, Vue, seven years. The TypeScript layer is where I can move fast and ship clean; Kotlin or Swift would have meant relearning the language alongside the architecture, which costs me months. Third, Expo's prebuild flow gives me native-module access when I need it. I needed `react-native-vision-camera` and `react-native-mediapipe-posedetection` — both have Expo config plugins, prebuild generates the native scaffolding, and I get them without ejecting.
>
> "The cost I'm paying: I take a perf hit on the GPU bridge for the camera frames — about 528 bytes per frame across the React Native bridge. At 30 fps that's 16 KB/sec, well under what would cause jank, but on a fully native build I wouldn't pay it at all. I'd revisit this only if the bridge cost became a measured bottleneck."

┌─────────────────────────┬─────────────────────────────────┐
│ WEAK ANSWER             │ STRONG ANSWER                   │
├─────────────────────────┼─────────────────────────────────┤
│ "Because I'm a React    │ "Three reasons: one codebase    │
│ developer, basically.   │ for a team of one, my TS        │
│ React Native made it    │ background lets me move fast,   │
│ easier to ship without  │ Expo's prebuild gives me native │
│ learning Swift."        │ modules without ejecting. The   │
│                         │ cost is the JS-bridge perf hit  │
│                         │ on camera frames — measured at  │
│                         │ ~16 KB/sec, well under jank."   │
├─────────────────────────┼─────────────────────────────────┤
│ Why it's weak:          │ Why it works:                   │
│ "I'm a React developer" │ Three named reasons, each       │
│ alone is "I defaulted." │ specific. Explicit named cost.  │
│ "Made it easier" is     │ Measured number for the cost.   │
│ filler — easier than    │ "I'd revisit if measured"       │
│ what, by how much? No   │ shows you'd act on signal, not  │
│ named cost.             │ guess.                          │
└─────────────────────────┴─────────────────────────────────┘

```
"Why RN?"
        │
        ▼
You give the three-reasons answer.
        │
        ├─► IF THEY ASK ABOUT EXPO VS BARE
        │     "Expo managed for most things, but I'm on the prebuild flow
        │     so I can add the camera + MediaPipe native modules. It's
        │     not bare — I keep the Expo SDK and OTA-update path."
        │
        ├─► IF THEY ASK "WOULD YOU PICK RN AGAIN"
        │     "Yes for this app — single dev, cross-platform priority,
        │     CV pipeline is the hot path. For a high-FPS game or
        │     anything bridge-bound, I'd consider native."
        │
        └─► IF THEY ASK ABOUT HERMES vs JSC
              "Default Hermes on Expo SDK 55. I haven't profiled the
              startup-time delta on this app; both are reasonable defaults.
              If startup became a constraint I'd benchmark." (← honest;
              don't bluff.)
```

▸ "I'm a React developer" alone is "I defaulted." Add the named cost and it becomes a senior answer.

---

## 3.2 — Why SQLite as the source of truth?

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Why SQLite as the source of truth? Why not just sync to Supabase?"           │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you understand latency budgets? Do you understand offline modes as a       │
│   first-class architecture, not a special case? This question separates         │
│   candidates who picked local-first deliberately from candidates who got        │
│   local-first as a side effect of "I used SQLite."                              │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "The latency budget for a 'tap a set checkbox' interaction is about 50 milliseconds — anything slower feels laggy. A cloud-first write to Supabase is a 200ms HTTPS round-trip on a good network and a few seconds in a basement gym. SQLite writes are sub-millisecond. So if I make Supabase authoritative, every tap shows a spinner and most workouts happen with intermittent connectivity. Local-first inverts that: writes commit to SQLite first, the UI updates from the local write, Supabase reconciles in the background.
>
> "The other reason is offline-as-first-class. With Supabase as the source of truth I'd need a queue, optimistic UI, conflict resolution per record, retry policies — I'd end up rebuilding most of a local-first stack as a cache layer. With SQLite as truth, offline isn't a special case; it's the default mode. Sync is the extension.
>
> "The cost I'm paying is the reinstall recovery story. When the local DB is empty, I have to pull all five tables from Supabase before the first render. I built that — `pullRestoreIfFresh` selects from sessions, exercises, gate_progress, week_progress, user_profile, in that order, and writes them into SQLite. There's also a fallback reconstruction path — `reconstructFromSessions` chronologically replays the session log to rebuild derived state if the Supabase pull fails. That fallback is in the code today even though it's rarely the primary path."

```
"Why SQLite as truth?"
        │
        ▼
Latency budget + offline first-class answer.
        │
        ├─► IF THEY ASK ABOUT MULTI-DEVICE CONFLICTS
        │     "Phase A is single-user, one device. No conflict surface.
        │      Schema is multi-tenant-ready (composite user_id, id keys
        │      everywhere) but the conflict story for two devices doing
        │      concurrent writes would need CRDTs or vector clocks —
        │      that's Phase B work, not in scope yet."
        │
        ├─► IF THEY ASK ABOUT REINSTALL RECOVERY
        │     "Two paths. Primary: pullRestoreIfFresh pulls all five
        │      tables from Supabase. Fallback: reconstructFromSessions
        │      replays session history. The reconstruction function is
        │      pure and idempotent — same input always gives the same
        │      output. Walk me through the fingerprint check?"
        │
        └─► IF THEY ASK "WHY NOT REALM"
              "Realm requires ejecting from Expo's managed flow and gives
              me an ORM I didn't need. With 9 tables and ~20 queries, raw
              SQL is straightforward. I write `rowToX` mappers by hand;
              the SQL is right there in the code."
```

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHEN YOU DON'T KNOW                                                           ║
║                                                                               ║
║   They ask about SQLite WAL internals: "Walk me through how WAL               ║
║   works under the hood — what's in the WAL file, how does checkpointing       ║
║   work?"                                                                      ║
║                                                                               ║
║   You set `PRAGMA journal_mode = WAL` and it solved the problem               ║
║   you knew it would solve (writers don't block readers). You haven't          ║
║   read the SQLite WAL paper.                                                  ║
║                                                                               ║
║   Say:                                                                        ║
║   "I haven't read the WAL implementation in detail. I picked WAL              ║
║    because in rollback-journal mode, a writer blocks readers, and the         ║
║    UI thread on this app constantly reads the database while writes           ║
║    are in flight — that would stutter. WAL fixed that empirically. The        ║
║    checkpoint mechanism I know exists; I haven't tuned it. Defaults           ║
║    have held. If you want to dig into checkpoint frequency, can you           ║
║    start me off?"                                                             ║
║                                                                               ║
║   What this signals:                                                          ║
║   - clear about the *problem* WAL solved for you                              ║
║   - explicit that you didn't go to the implementation                         ║
║   - invitation to learn in real time                                          ║
║                                                                               ║
║   Do NOT say:                                                                 ║
║   "There's like a log file that has the writes and then they get              ║
║    moved to the main file later, kind of like..."                             ║
║   Half-remembered mechanism on someone else's territory is the                ║
║   fastest way to lose the room.                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

▸ Latency budget is the language a senior engineer hears. "Offline mode" is the language a junior gives.

---

## 3.3 — Why Supabase as the cloud mirror?

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Why Supabase and not Firebase, or your own backend?"                         │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you understand the difference between a cloud-first cache and a            │
│   write-mostly mirror? Did you compare on more than one axis? "I picked         │
│   Supabase because it's good" is the failure pattern; "I picked Supabase       │
│   because it's Postgres + PostgREST + RLS-ready + free tier, and the cost      │
│   I'm watching is single-vendor lock-in on auth" is the senior pattern.        │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Supabase gives me managed Postgres plus PostgREST plus an anon-key client, free at this scale. Three things drove the choice. First, it's Postgres — not a proprietary document store — so I keep relational schema, indexes, foreign keys, and I can dump the database if I need to leave. Second, the JS client maps cleanly onto write-mostly mirror sync — `supabase.from(table).upsert(rows, { onConflict: 'user_id,id' })` is one call, and that's most of `pushChanges`. Third, it's RLS-ready: my composite primary keys are already `(user_id, id)`, so when Phase B adds auth, I add RLS policies and the schema doesn't change.
>
> "I rejected Firebase because it's cloud-first by default — the SDK assumes server-as-truth and caches locally. That's the inverse of what I built. I'd have spent the whole project fighting the framework. I rejected self-hosted because I don't want to run my own backend for a Phase A app; that's ops work that doesn't move the product.
>
> "The cost I'm paying: single-vendor lock-in on the auth surface. When Phase B comes, the auth choice is constrained by what Supabase offers — anonymous auth, magic link, OAuth — rather than designed independently. The Postgres layer is portable; the auth layer is sticky. I'm fine with that for now, and the schema work to migrate is bounded."

┌─────────────────────────┬─────────────────────────────────┐
│ WEAK ANSWER             │ STRONG ANSWER                   │
├─────────────────────────┼─────────────────────────────────┤
│ "I picked Supabase      │ "Three reasons: managed Postgres │
│ because it's like       │ (portable, dump-able, FK-aware), │
│ Firebase but Postgres,  │ JS client maps cleanly onto      │
│ and I didn't want to    │ write-mostly upserts,             │
│ build a backend. It's   │ RLS-ready for Phase B. Cost I'm  │
│ free for what I'm       │ paying: vendor lock-in on auth   │
│ using."                 │ surface, not on the data."       │
├─────────────────────────┼─────────────────────────────────┤
│ Why it's weak:          │ Why it works:                    │
│ "Like Firebase but      │ Three orthogonal criteria. The   │
│ Postgres" — you picked  │ "vendor lock-in is on auth, not  │
│ one feature. "Didn't    │ data" line is the senior tell —  │
│ want to build a         │ you understand which parts of    │
│ backend" is honest but  │ Supabase are easy to leave and   │
│ not architectural.      │ which are sticky.                │
│ No named cost.          │                                  │
└─────────────────────────┴─────────────────────────────────┘

▸ The portable layer is the data. The sticky layer is the auth. Know which is which.

---

## 3.4 — Why MediaPipe via vision-camera?

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Why MediaPipe? Why not Apple Vision on iOS and ML Kit on Android, or         │
│    something like YOLOv8-Pose?"                                                  │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Did you compare the actual choices, or pick the first thing you found?        │
│   Do you understand the cross-platform-vs-best-of-breed tradeoff for CV         │
│   pipelines?                                                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Two real alternatives, one rejected. The two alternatives were native — Apple Vision on iOS, ML Kit pose on Android — and YOLO-Pose. I picked MediaPipe for cross-platform parity. One model file, `pose_landmarker_lite.task`, runs on both platforms via `react-native-mediapipe-posedetection`, with the GPU delegate giving me ~30 fps on a mid-range Android. If I'd gone native, I'd have two integrations to maintain, two debugging paths, two sets of edge cases on confidence thresholds.
>
> "I rejected YOLO-Pose because it's a heavier model — better for multi-person scenes, which I don't need, and bigger to bundle. MediaPipe Lite is about 5 MB; YOLO would have been more.
>
> "Cost I'm paying: single-pose only. `numPoses: 1` in the MediaPipe config. If I ever add a partner-workout feature where two people are in frame, that's a config change plus a re-tune of the FSM logic — not free but bounded.
>
> "The pipeline itself is camera → MediaPipe (GPU) → JS callback with 33 landmarks → per-exercise processor that averages symmetric joints, exponentially smooths the angle with α=0.4, and runs through a 5-state FSM with 10° hysteresis. The hysteresis is what makes the rep count actually robust — without it the FSM flickers at threshold boundaries and counts noise."

```
"Why MediaPipe?"
        │
        ▼
Cross-platform + GPU delegate + bundled model answer.
        │
        ├─► IF THEY ASK ABOUT THE LITE VARIANT
        │     "BlazePose lite. ~5 MB, GPU-friendly, 30 fps. The full
        │      variant is more accurate at the cost of size and speed —
        │      not worth it for rep counting from straightforward
        │      compound lifts."
        │
        ├─► IF THEY ASK ABOUT FRAME RATE
        │     "30 fps on a mid-range Android with GPU delegate. The
        │      bridge cost is ~528 bytes per frame, ~16 KB/sec to JS.
        │      LIVE_STREAM mode drops frames if inference is slower
        │      than capture — no queueing."
        │
        └─► IF THEY ASK WHY NOT NATIVE PER PLATFORM
              "Two integrations to maintain, two debugging surfaces.
               Team of one — that math doesn't work. If the app grew
               to where per-platform tuning mattered, I'd revisit."
```

▸ Cross-platform parity is the answer when you're a team of one. It's the wrong answer when you're a team of fifty.

---

## 3.5 — Why on-device inference, not cloud?

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "Why not send frames to a cloud vision API?"                                  │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you understand the latency budget at the camera layer? Do you understand   │
│   privacy as an engineering constraint, not just a value statement?              │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Three reasons, all hard constraints. First, latency. The FSM needs to see the bottom of every rep — that's a frame-rate-sensitive decision at 30 fps, around 33ms per frame. A cloud round-trip is 200ms minimum, more on cellular, sometimes seconds. The FSM would miss bottoms; the rep count would be wrong. Cloud inference is structurally incompatible with the latency budget. Second, privacy. The camera is pointed at the user mid-workout. Streaming that to a third-party API is a different product than what I'm shipping. Third, cost. At 30 fps × 60-second sets × ~5 sets × ~5 sessions a week per user, a per-frame inference cost adds up fast even at fractions-of-a-cent pricing. On-device, the marginal cost of a frame is zero.
>
> "Cost I'm paying: model size in the binary. `pose_landmarker_lite.task` is ~5 MB bundled in the app. Every download carries it. Updating the model means shipping a new app version — I can't A/B test models without a release cycle."

┌─────────────────────────┬─────────────────────────────────┐
│ WEAK ANSWER             │ STRONG ANSWER                   │
├─────────────────────────┼─────────────────────────────────┤
│ "Because privacy. Also  │ "Three hard constraints:        │
│ it's faster on-device   │ latency (200ms cloud vs 33ms    │
│ and there's no API cost │ frame budget — structurally     │
│ since it's not a cloud  │ incompatible), privacy (camera  │
│ call."                  │ pointed at the user is a        │
│                         │ different product), per-frame   │
│                         │ inference cost compounds.       │
│                         │ Cost I'm paying: 5 MB model     │
│                         │ in the binary, can't A/B test   │
│                         │ models without a release."      │
├─────────────────────────┼─────────────────────────────────┤
│ Why it's weak:          │ Why it works:                   │
│ "Privacy" alone is a    │ Three orthogonal constraints,   │
│ value statement, not a  │ each named with a number. The   │
│ constraint. "Faster" —  │ 200ms-vs-33ms framing makes the │
│ how much faster, why    │ choice structural, not          │
│ does that matter? "No   │ preferential. Bundle cost is    │
│ API cost" — at what     │ named honestly.                 │
│ usage rate?             │                                 │
└─────────────────────────┴─────────────────────────────────┘

▸ "Privacy" alone is a value statement. "Privacy plus a 200ms-vs-33ms latency budget plus per-frame inference cost compounding" is an engineering constraint.

---

## 3.6 — Why no auth in Phase A?

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "There's no auth? Just a hardcoded user ID?"                                  │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Can you defend a deliberate MVP scope without sounding defensive or           │
│   apologetic? Did you make the schema future-friendly even though you           │
│   skipped the implementation? The skip is fine. The signal is whether you      │
│   know what's skipped and what's set up.                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Phase A is a single-user MVP — me. The USER_ID is a hardcoded UUID constant in `src/services/sync/config.ts`. RLS is off on Supabase. The anon key is the only auth on the network.
>
> "The choice was deliberate: spending Phase A on auth instead of on the CV pipeline and the local-first stack would have meant shipping no actual product. Auth is a known piece of work — Supabase has anonymous auth, magic link, OAuth providers — that I can drop in when there's a second user.
>
> "What I did do is make the schema multi-tenant-ready from day one. Every table's primary key is composite — `(user_id, id)` — and every row stamps the current USER_ID at write time via the mapper. So when Phase B starts, the schema doesn't change. I add RLS policies that gate by `auth.uid() = user_id`, I move the USER_ID source from a constant to `expo-secure-store`, and the app works for multiple users. The data-layer migration is bounded; the auth-layer work is real but isolated.
>
> "The cost I'm paying right now: anyone with the anon key and the URL can read or write any contrl row in Supabase. The data isn't sensitive at this scale — single test user, my own workout history — but I treat the anon key as semi-public, not secret, and the security boundary is 'don't ship this binary publicly until RLS is on.'"

```
"Why no auth?"
        │
        ▼
Single-user MVP + multi-tenant-ready-schema + Phase B is the auth work.
        │
        ├─► IF THEY PRESS ON SECURITY
        │     "The threat model is 'someone reverse-engineers the anon key
        │      from the app binary and writes to my Supabase tables.' At
        │      this user count (n=1, me) that's not a real attacker.
        │      Once there's a second user, RLS is mandatory before I ship."
        │
        ├─► IF THEY ASK ABOUT THE MIGRATION COST
        │     "Schema doesn't change — composite PKs are already in place.
        │      The work is: enable RLS, add per-table policies (one query
        │      pattern), move USER_ID to secure storage, build the
        │      sign-in/sign-up flow. Bounded; a sprint or so."
        │
        └─► IF THEY ASK "WOULD YOU SHIP TO USERS LIKE THIS"
              "No. Phase A is a single-user MVP I'm dogfooding. Public
               ship requires Phase B at minimum. I'm explicit about that
               in the README."
```

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHEN YOU DON'T KNOW                                                           ║
║                                                                               ║
║   They probe deep into Supabase RLS specifics: "How exactly do you            ║
║   structure RLS policies for a composite key?"                                ║
║                                                                               ║
║   You've designed Phase B at a high level but haven't written the              ║
║   policies yet.                                                                ║
║                                                                               ║
║   Say:                                                                        ║
║   "I haven't written the policies yet — Phase B work. The shape I'd          ║
║    reach for is `auth.uid() = user_id` on SELECT and UPDATE for each          ║
║    of the five entity tables, and an INSERT policy that gates `user_id`       ║
║    on the authenticated user. I'm aware Supabase has a `with check`           ║
║    clause for the insert side. If you want to dig into the policy             ║
║    structure, can you start me off — I've designed the boundary but           ║
║    not written the SQL."                                                       ║
║                                                                               ║
║   What this signals:                                                          ║
║   - you've thought about the future surface,                                  ║
║   - you can name the high-level shape,                                        ║
║   - you're honest about not having written the code yet,                      ║
║   - you invite collaboration.                                                 ║
║                                                                               ║
║   Do NOT say:                                                                 ║
║   "Uh, you'd write a policy like `WHERE user_id = current_user`               ║
║    or something? I'd have to look up the syntax."                             ║
║   Half-remembered SQL on a known-future surface signals "I'm guessing."       ║
╚═══════════════════════════════════════════════════════════════════════════════╝

▸ "Phase A is a deliberate MVP" is the answer. "We just haven't gotten to it yet" is the apology. Don't apologize.

---

## What you'd change

If you were re-doing the choices from scratch today, the one decision you'd re-make is **the hardcoded USER_ID as a constant**. Not the lack of auth — that's a deliberate Phase A scope. The thing you'd change is that the USER_ID lives in `src/services/sync/config.ts` as a literal `const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'`. The cleaner shape would be to source it from `expo-secure-store` from day one with a generated UUID on first run. The schema and sync code wouldn't change — just the source of the constant. That's a half-day of work that would make the Phase B migration nearly trivial: enable RLS, add policies, done. As-is, Phase B has to also build the secure-storage seeding flow.

You wouldn't re-make any of the other five choices. React Native, SQLite-as-truth, Supabase mirror, MediaPipe, on-device inference — all still right for this project at this scale.

▸ The thing you'd re-do isn't a tech choice. It's where one configuration value lives.

---

## One-page summary

**Core claim:** Six load-bearing choices, each defensible at the architectural level. You did not default — you compared. The cost of each choice is named explicitly.

**Questions covered:**
- "Why React Native + Expo?" → One codebase + my TS background + Expo prebuild for native modules. Cost: JS bridge overhead, measured well under jank.
- "Why SQLite as the source of truth?" → 50ms latency budget + offline-as-first-class. Cost: reinstall recovery (built; pull + fallback replay).
- "Why Supabase?" → Postgres + PostgREST + RLS-ready, free. Cost: vendor lock-in on auth surface, not on data.
- "Why MediaPipe via vision-camera?" → Cross-platform parity, GPU delegate, 30 fps. Cost: single-pose only.
- "Why on-device inference?" → 200ms cloud vs 33ms frame budget is structurally incompatible; plus privacy; plus per-frame cost. Cost: 5 MB model in the binary, can't A/B test models without release.
- "Why no auth?" → Phase A is a deliberate single-user MVP; schema is multi-tenant-ready. Cost: anon key is semi-public; don't ship to users until Phase B.

**Pull quotes:**
- "'I'm a React developer' alone is 'I defaulted.' Add the named cost and it becomes a senior answer."
- "Latency budget is the language a senior engineer hears."
- "The portable layer is the data. The sticky layer is the auth."
- "'Phase A is a deliberate MVP' is the answer. 'We just haven't gotten to it yet' is the apology. Don't apologize."

**What you'd change:** Source USER_ID from `expo-secure-store` with a generated UUID on first run, instead of a hardcoded constant. Half-day of work; makes the Phase B auth migration nearly trivial.
