# Chapter 4 — The scale story

Senior interviewers love this question. "What if you had 10,000 users?" "What if the user logged for a decade?" "What if you needed multi-device sync?" The candidates who fold on this question fold the same way every time: they pick something at random — the database, the API, the cache — and start explaining how they'd scale *that*, without first asking which thing breaks. The strong move is to name what breaks first, by how much, what you'd add to fix it, and how you'd measure to know it's actually a problem.

contrl is a local-first single-user app. The scale dimensions for it are not the standard ones — there's no QPS to a backend because the backend is barely used. The three scale dimensions that matter for contrl are: **user count**, **per-user data depth**, and **on-device latency budget**. Each one breaks something different first. This chapter walks all three.

```
┌─ contrl's scale story — three dimensions, three first-bottlenecks ──────────────────────────┐
│                                                                                             │
│                                                                                             │
│   1×                10×                100×              1,000×            10,000×           │
│   user count        ─── 10 users        ─── 100 users    ─── 1K users      ─── 10K users    │
│                                                                                             │
│     │                  │                   │                  │                  │           │
│     │                  │                   │                  │                  │           │
│     ▼                  ▼                   ▼                  ▼                  ▼           │
│   Single-tenant   Multi-tenant         RLS load           Anon-key            Cost: minimal  │
│   anon key OK     auth required        on Supabase        leak = mass         (RLS scales);  │
│   (current)       FIRST BREAK          Postgres           privacy event       Postgres scales│
│                   ⬇                    (manageable)                                          │
│                   add auth +                                                                 │
│                   secure storage                                                             │
│                                                                                             │
│   ─────────────────────────────────────────────────────────────────────────────────────     │
│                                                                                             │
│   1×                10×                100×              1,000×            10,000×           │
│   data depth        ── 10 weeks         ── 100 weeks      ── 1K weeks      ── 10K weeks      │
│   (per user)                            (~2 years)        (~20 years)      (~200 years)      │
│                                                                                             │
│     │                  │                   │                  │                  │           │
│     │                  │                   │                  │                  │           │
│     ▼                  ▼                   ▼                  ▼                  ▼           │
│   Free                Free               getSessions()      reconstruct      FIRST           │
│                                          loads all into     replay starts    UNREACHABLE     │
│                                          JS — ~5MB           taking          (not realistic) │
│                                          (acceptable)        visible time                    │
│                                                              FIRST BREAK                    │
│                                                              ⬇                              │
│                                                              checkpoint snapshots            │
│                                                              + windowed queries              │
│                                                                                             │
│   ─────────────────────────────────────────────────────────────────────────────────────     │
│                                                                                             │
│   1×                10×                100×              1,000×            ???               │
│   on-device fps     ── 30 fps           ── (frame rate is hardware-locked at ~30-60 fps)     │
│                                                                                             │
│     │                  │                                                                    │
│     ▼                  ▼                                                                    │
│   Current            FIRST BREAK = HARDWARE                                                  │
│   (vision-camera     LIVE_STREAM drops frames if inference can't keep up;                    │
│    GPU delegate)     missed bottom-of-rep transitions on fast explosive movement             │
│                      ⬇                                                                       │
│                      add confidence gating on FSM; consider heavier model only if accuracy   │
│                      degrades; or accept the limit (rep counter is robust to dropped frames)│
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

Three dimensions. Three first-bottlenecks. Three different fixes. The point of this chart is that you can pick the dimension the interviewer is asking about and answer specifically — not generically.

---

## 4.1 — Scale by user count

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What if you had 10,000 users?"                                               │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you understand which parts of your stack scale linearly with users         │
│   and which parts don't? Do you know what fails first? The strong answer         │
│   names the *first* bottleneck (not "we'd have to scale everything") and        │
│   names a specific user count at which the next thing breaks.                   │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "The first thing that breaks isn't a performance problem — it's a security problem. The anon key plus RLS-off model is fine at one user. The second user is when it becomes a leak: anyone with the anon key can read or write any row. So the *first* scale work for contrl is auth plus RLS, before performance enters the picture. That's Phase B.
>
> "After auth is in: at 10,000 users on Supabase's managed Postgres, the read and write load is modest because each user is local-first. The hot path doesn't hit Supabase. The only Supabase traffic is `pushChanges` after a write — maybe one write per minute during a workout, then nothing for hours — and `pullRestoreIfFresh` at install time. Even at 10K users that's tens of writes per second peak, which Postgres handles trivially with the right indexes on `(user_id, updated_at)`.
>
> "What might break around 10K users: cold-start performance on `pullRestoreIfFresh`. If a user has a few hundred sessions across a year, the pull pulls ~3000 rows across five tables. That's a few HTTP requests, a few hundred ms. At one user opening the app at a time, fine. If a viral moment puts 1000 new users into onboarding in the same minute, that's 1000 concurrent `pullRestoreIfFresh` calls. Supabase's free tier handles ~60 concurrent connections; we'd hit the pool limit. Mitigation is rate-limiting at the client and a paid tier of Postgres.
>
> "What I'd measure to know: per-user Supabase request rate; concurrent connections; p99 pull-restore latency on first install. None of these are instrumented today because there's one user."

```
"10,000 users — what breaks first?"
        │
        ▼
Auth is the first break (security, not perf). Then pool concurrency at install spikes.
        │
        ├─► IF THEY ASK ABOUT POSTGRES SCALE
        │     "Postgres handles this fine. The schema is already
        │      multi-tenant. The (user_id, updated_at) index is what
        │      pushChanges actually queries. Per-user request rate is
        │      low — local-first means the cloud is barely on the
        │      hot path."
        │
        ├─► IF THEY ASK ABOUT CONCURRENT INSTALLS
        │     "Pool concurrency on pullRestoreIfFresh is the first
        │      perf cliff. Free tier ~60 connections; spikes would
        │      starve it. Mitigation: paid Postgres tier with larger
        │      pool, or PgBouncer for connection multiplexing."
        │
        └─► IF THEY ASK ABOUT MULTI-DEVICE PER USER
              "Multi-device is harder than multi-user. Current sync is
               last-writer-wins via watermark — fine for one user
               on one device in sequence, broken for two devices doing
               concurrent writes. Real multi-device needs CRDTs or per-
               row vector clocks. Whole-different design call;
               Phase C work, scoped not started."
```

▸ The first scale break for a local-first app isn't performance. It's the security boundary that turns on at user count > 1.

---

## 4.2 — Scale by per-user data depth

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What if a user logged daily for 10 years?"                                   │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you know which operations in your code are O(n) over sessions and which    │
│   are O(1)? At what *concrete* row count does the O(n) become visible? The     │
│   strong answer names the specific function and the rough threshold.            │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "Two things are O(n) over the session log: `getSessions()` loads every session into JS, and `reconstructFromSessions` chronologically replays the whole log on the reinstall fingerprint. Both are fine at small N. The threshold where they become visible is around 10,000 sessions.
>
> "At 10 years × 3 categories × ~1.5 sessions per week per category, you'd get around 2,300 sessions. Still trivial — replay completes in ~30ms, `getSessions` loads a few MB into JS. At 50 years of training you'd cross 50,000 sessions, where replay starts taking ~300ms and JS memory pressure becomes real.
>
> "The fix when we get there is checkpoint snapshots. Persist 'state as of week W' in a new `state_checkpoints` table. When reconstruction fires, find the latest checkpoint and replay only sessions after it. Replay stays O(weeks-since-checkpoint), regardless of total session count. The schema change is one new table; the logic change is `reconstructFromSessions` taking an optional `startFromCheckpoint` argument.
>
> "I'd measure: reconstruction time over current session count, JS heap on `getSessions()`, first-render-after-reinstall latency. Today none of those are instrumented because the test user has ~50 sessions and everything is sub-10ms."

┌─────────────────────────┬─────────────────────────────────┐
│ WEAK ANSWER             │ STRONG ANSWER                   │
├─────────────────────────┼─────────────────────────────────┤
│ "I mean, at some point  │ "Two operations are O(n) over   │
│ SQLite would get slow,  │ sessions: getSessions() and     │
│ and we'd have to like   │ reconstructFromSessions. Both   │
│ paginate or use cursors │ fine through ~10K sessions; at  │
│ or something."          │ ~50K (50 years of daily) replay │
│                         │ hits ~300ms. Fix is checkpoint  │
│                         │ snapshots — one new table,      │
│                         │ replay the tail."               │
├─────────────────────────┼─────────────────────────────────┤
│ Why it's weak:          │ Why it works:                   │
│ "Slow at some point" —  │ Two specific functions named.   │
│ at what point? "Cursors │ Concrete thresholds (10K, 50K). │
│ or something" — which   │ Specific fix (checkpoint        │
│ one, in which function? │ table). Asymptotic claim (O(n)) │
│ "Or like" three times.  │ tied to specific code, not a    │
│ Three filler phrases.   │ generic database concept.       │
└─────────────────────────┴─────────────────────────────────┘

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHEN YOU DON'T KNOW                                                           ║
║                                                                               ║
║   They press on SQLite scale limits: "What's SQLite's maximum table           ║
║   size? At what row count does query performance degrade?"                    ║
║                                                                               ║
║   You haven't benchmarked SQLite on this app — your test user has 50          ║
║   sessions and everything is sub-10ms. You know SQLite scales to               ║
║   gigabytes and millions of rows in theory; you haven't tested it.            ║
║                                                                               ║
║   Say:                                                                        ║
║   "I haven't benchmarked SQLite at scale on this app — my real data           ║
║    is around 50 sessions. SQLite's documented limit is something like         ║
║    140 TB and billions of rows, but the relevant number for me would be       ║
║    when a `SELECT * FROM sessions WHERE user_id = ?` starts costing more      ║
║    than I have budget for, and I haven't measured that. If we wanted to       ║
║    push to a billion rows on-device, I'd start with EXPLAIN QUERY PLAN        ║
║    and add covering indexes. Want me to walk through what the indexed          ║
║    queries currently look like?"                                              ║
║                                                                               ║
║   What this signals:                                                          ║
║   - clear about what you haven't measured,                                    ║
║   - aware of the right tool (EXPLAIN QUERY PLAN),                             ║
║   - invites a dig into what you *do* know (your current indexes).             ║
║                                                                               ║
║   Do NOT say:                                                                 ║
║   "SQLite's pretty fast, I think it handles like millions of rows             ║
║    without issue, my queries are all indexed so..."                           ║
║   Marketing-adjacent vibes ("pretty fast") with no measurement is the         ║
║   pattern that loses credibility.                                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝

▸ "I haven't measured X but I know it would matter at Y. Here's the fix I'd reach for." That sentence wins this question every time.

---

## 4.3 — Scale by latency budget

┌─────────────────────────────────────────────────────────────────────────────────┐
│ THEY ASK                                                                        │
│   "What if the camera pipeline needed to be faster?"                            │
│                                                                                 │
│ WHAT THEY'RE TESTING                                                            │
│   Do you understand where the latency budget is and what's actually using it?   │
│   The pose pipeline isn't an HTTP request; the bottleneck isn't bandwidth.      │
│   This question tests whether you can reason about a real-time pipeline,        │
│   not a request-response one.                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

Say:

> "The frame rate is hardware-locked. MediaPipe in `LIVE_STREAM` mode runs as fast as the GPU can do an inference cycle; on a mid-range Android with the GPU delegate that's roughly 30 fps, ~33ms per frame. The bridge cost to JavaScript is ~16 KB/sec, well under what would cause jank.
>
> "What can break: if inference takes longer than the frame interval, `LIVE_STREAM` drops frames — it doesn't queue. A frame dropped right at the bottom of a rep means the FSM might miss the bottom-transition timing. In practice, on visible joints under normal lighting, this is rare. On occluded joints or low confidence, the FSM keeps consuming whatever the model emits — currently it doesn't filter by confidence, which is a known gap.
>
> "If I needed 60 fps, I'd hit hardware limits before software. The bottleneck at 60 fps wouldn't be the bridge — it would be GPU inference cycle time. The fix would be either a lighter model variant or accepting that 30 fps is the working rate. Realistically, rep counting doesn't need 60 fps; the FSM tolerates frame drops because it tracks *direction* through state, not instantaneous angle.
>
> "What I'd measure: frame-arrival rate on the JS side, FSM phase-transition timing, missed-rep rate against a manually-counted ground truth on a fixed test video."

```
"What if the camera pipeline needed to be faster?"
        │
        ▼
Hardware-locked at 30 fps; LIVE_STREAM drops on backpressure; FSM is direction-based.
        │
        ├─► IF THEY ASK ABOUT GPU DELEGATE FALLBACK
        │     "CPU delegate is the fallback if GPU isn't available. Drops
        │      to ~5 fps. FSM still works at 5 fps for slow controlled
        │      reps; fast explosive movement would miss transitions. The
        │      app surfaces this in the debug HUD but doesn't currently
        │      warn the user."
        │
        ├─► IF THEY ASK ABOUT NUMPOSES > 1
        │     "Single pose today. Adding numPoses: 2 scales inference
        │      cost approximately linearly — would cut frame rate in
        │      half on the same hardware. Partner workouts would need
        │      either lighter detection or a frame-rate target cut."
        │
        └─► IF THEY ASK ABOUT CONFIDENCE GATING
              "Known gap. Right now the FSM doesn't read the visibility
               field on landmarks; an occluded joint produces a noisy
               angle that gets smoothed but not filtered. The fix is
               a guard at the FSM input: if average visibility on
               relevant joints is < 0.5, skip the update, keep the last
               smoothed angle. Small change, real safety benefit."
```

▸ A latency-sensitive on-device pipeline doesn't scale by adding more — it scales by what it cuts.

---

## What you'd change

If you were redesigning the scale story from the start, you'd **instrument the things you currently can't measure**. Today there are no metrics for: reconstruction-replay time, `getSessions()` JS heap, frame-arrival rate, FSM missed-transition rate, Supabase pull-restore latency. Every scale answer in this chapter is reasoned from first principles or from a single dev-build measurement. The senior version of contrl would have a `metrics/` module that logs these to a local table (and never to the network), so future scale questions could be answered with real numbers.

You wouldn't change the scaling *plan*. Auth-first for users, checkpoints for data depth, hardware-or-cut for frame rate — those are the right plans. You'd just want the numbers in your hand when an interviewer asks.

▸ The plans are right. The instrumentation isn't there yet.

---

## One-page summary

**Core claim:** contrl has three scale dimensions — user count, per-user data depth, on-device latency. Each breaks something different first: user count breaks the security boundary, data depth breaks the JS-side replay, latency is hardware-locked. The strong move is to know which dimension is being asked about and answer specifically.

**Questions covered:**
- "What if you had 10,000 users?" → Auth first (security, not perf), then pool concurrency on `pullRestoreIfFresh` at install spikes.
- "What if a user logged for 10 years?" → ~10K sessions is fine; ~50K (50 years) is where replay hits ~300ms; fix is checkpoint snapshots in a new `state_checkpoints` table.
- "What's SQLite's row limit?" → "I haven't benchmarked at scale on this app; would reach for EXPLAIN QUERY PLAN and covering indexes if pushed."
- "What if the camera pipeline needed to be faster?" → Hardware-locked at 30 fps; `LIVE_STREAM` drops on backpressure; FSM tolerates drops because state tracks direction, not instantaneous angle.
- "What about CPU delegate fallback?" → ~5 fps; works for slow controlled reps; fast explosive movement would miss transitions.

**Pull quotes:**
- "The first scale break for a local-first app isn't performance. It's the security boundary that turns on at user count > 1."
- "'I haven't measured X but I know it would matter at Y. Here's the fix I'd reach for.' That sentence wins this question every time."
- "A latency-sensitive on-device pipeline doesn't scale by adding more — it scales by what it cuts."

**What you'd change:** Instrument the things you currently can't measure: replay time, JS heap, frame-arrival rate, missed-transition rate. The scaling *plan* is right; the numbers in your hand aren't.
