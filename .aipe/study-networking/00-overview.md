# 00 — Overview

The one-page map of contrl's network surface, the ranked findings, and the
reading order. If you only read one file in this guide, read this one.

## Zoom out — the whole app, one frame

contrl is a React Native + Expo app where almost everything is local. The
network is a thin tail glued to a local-first core: SQLite is the source of
truth, Supabase is a write-mostly mirror, and the camera pipeline never
touches the wire at all.

```
  contrl, end-to-end, network highlighted

  ┌─ UI layer (React Native screens) ──────────────────────────────┐
  │  app/(tabs)/home   app/log/[category]   app/settings           │
  └─────────────────────────────┬──────────────────────────────────┘
                                │ React hooks call db helpers
  ┌─ Local data layer ──────────▼──────────────────────────────────┐
  │  src/services/database.ts   ←── SOURCE OF TRUTH                │
  │  expo-sqlite (on-device)                                       │
  └─────────────────────────────┬──────────────────────────────────┘
                  fire-and-forget │ pushChanges().catch(() => {})
                                  │ (after every writer)
  ┌─ Sync boundary ───────────────▼────────────────────────────────┐
  │  src/services/sync/supabase-sync.ts                            │
  │  ★ THIS IS THE ONLY PLACE THE APP HITS THE NETWORK ★           │
  └─────────────────────────────┬──────────────────────────────────┘
                                │ HTTPS to one host
  ┌─ Network ────────────────────▼─────────────────────────────────┐
  │  @supabase/supabase-js (REST) → <project>.supabase.co          │
  │  PostgREST → Postgres in the `contrl` schema                   │
  └────────────────────────────────────────────────────────────────┘

  outside this frame:
   ─ camera → pose detection → rep counter:   on-device, never on the wire
   ─ MediaPipe pose_landmarker_lite.task:     bundled in the APK, not fetched
```

The seam that matters is the one between `database.ts` and `sync/`. Every
local writer fires `pushChanges()` as a side effect (`database.ts:268, 319,
329, 343, 366, 388, 487, 551`). That's the entire trigger. There is no
queue, no batch, no retry — the network call just goes.

## Zoom in — what's actually on the wire

The full wire surface, ranked by frequency:

```
  endpoint                                   verb     when
  ──────────────────────────────────         ────     ───────────────────
  /rest/v1/user_profile                      POST     after level change
  /rest/v1/exercises                         POST     after upsertExercise
  /rest/v1/sessions                          POST     after every session save
  /rest/v1/gate_progress                     POST     after gate state change
  /rest/v1/week_progress                     POST     after week roll-up
  /rest/v1/{entity}?user_id=...&id=...       DELETE   after tombstone push
  /rest/v1/user_profile?select=*             GET      first launch only
  /rest/v1/exercises?select=*                GET      first launch only
  /rest/v1/sessions?select=*                 GET      first launch only
  /rest/v1/gate_progress?select=*            GET      first launch only
  /rest/v1/week_progress?select=*            GET      first launch only
```

The five GETs run in parallel via `Promise.all([...])` exactly once per
device — only if `last_pulled_at IS NULL` and sessions is empty
(`supabase-sync.ts:130-146`). The POSTs are upserts (`onConflict: 'user_id,id'`).
The DELETEs come from the tombstone table.

All of it goes to one host. All of it is HTTPS. All of it uses one anon key
in the `apikey` header (handled by `supabase-js`, not visible in our code).

## The structure pass — three axes across one seam

We have exactly one network seam: `pushChanges()` and `pullRestoreIfFresh()`
in `supabase-sync.ts`. Three axes worth tracing across it:

```
  axis              local side (SQLite)             wire side (Supabase)
  ──────            ──────────────────              ────────────────────
  control       →   app decides when to push        server accepts or rejects
  state         →   authoritative                   mirror (write-mostly)
  failure       →   crash = data loss only if       network fail = log + drop;
                    the device is wiped             local write still committed
  trust         →   trusted (own SQLite file)       trusted-with-anon-key;
                                                    RLS is off, key is in env
  cost          →   ~0 ms per write                 100-800 ms RTT per push,
                                                    5 GETs in parallel on cold
                                                    install
```

The seam is load-bearing for **failure** and **trust**. Local commits
succeed even when the network fails; the wire failure is logged
(`supabase-sync.ts:17-27`) and otherwise swallowed. Trust changes too — the
anon key is the credential, and (per project context) RLS is currently off.
The other axes are continuous across the seam (the app keeps deciding what
to do; cost just adds a tail).

## Ranked findings — the verdict-first list

Five findings, ordered by consequence. The full evidence and "why it
matters" lives in `08-networking-red-flags-audit.md`; here you get the
headline and the one-line cause.

```
  rank    finding                                     evidence
  ────    ───────                                     ────────
  1       no retry / backoff on push failure          supabase-sync.ts:47, 60,
                                                      73, 86, 101 — first error
                                                      logs + returns

  2       fire-and-forget pushes can stack            database.ts:268, 319,
          (every writer fires its own; nothing        329, 343, 366, 388,
          coalesces)                                  487, 551

  3       no client-owned timeout                     supabase-sync.ts has no
          (whatever fetch's default is, that's it)   AbortController; relies
                                                      on supabase-js defaults

  4       cold-install pull is "all rows or nothing"  supabase-sync.ts:140-146
          (one GET fails → whole restore aborts)     — any r.error short-circuits

  5       RLS is off, single anon key in env          config.ts:1-2 +
          (study-security owns the deeper            project context note
          treatment; the wire-side impact is
          "any anon-key holder reads the table")
```

None of these are critical for a single-user MVP. Three of them (1, 2, 3)
become real the day contrl runs on flaky cellular. Two of them (4, 5) get
ugly the day you have more than one user.

## Reading order — by file

```
  ┌─ 01 network-map ─────────────────────────────────────────────┐
  │  the whole wire surface drawn in detail                       │
  └─────────────────────────────┬─────────────────────────────────┘
                                │ "okay, but how does the name resolve?"
  ┌─ 02 DNS, routing, addressing ▼─────────────────────────────────┐
  │  RN delegates to the OS resolver; one host                    │
  └─────────────────────────────┬─────────────────────────────────┘
                                │ "and underneath the name?"
  ┌─ 03 TCP/UDP, connections, sockets ─────────────────────────────┐
  │  TCP only, one connection pool, no UDP                        │
  └─────────────────────────────┬─────────────────────────────────┘
                                │ "encrypted how?"
  ┌─ 04 TLS and trust establishment ───────────────────────────────┐
  │  system trust roots, Supabase's edge cert                     │
  └─────────────────────────────┬─────────────────────────────────┘
                                │ "what HTTP is going across?"
  ┌─ 05 HTTP semantics ────────────────────────────────────────────┐
  │  verbs, status codes, headers, why CORS doesn't apply         │
  └─────────────────────────────┬─────────────────────────────────┘
                                │ "what about realtime?"
  ┌─ 06 WebSockets, SSE, streaming, realtime ──────────────────────┐
  │  NOT YET EXERCISED — when it becomes relevant                 │
  └─────────────────────────────┬─────────────────────────────────┘
                                │ "what happens when it breaks?"
  ┌─ 07 timeouts, retries, pooling, backpressure ──────────────────┐
  │  the failure-handling layer, mostly missing today             │
  └─────────────────────────────┬─────────────────────────────────┘
                                │ "rank everything by risk"
  ┌─ 08 networking red flags ──────────────────────────────────────┐
  │  five findings, evidence, severity, the move                  │
  └────────────────────────────────────────────────────────────────┘
```

## Not yet exercised — explicit list

For the topics in the spec that contrl genuinely does not touch:

```
  topic                              status               file that covers it
  ─────                              ──────               ───────────────────
  WebSockets                         not yet exercised    06
  Server-Sent Events                 not yet exercised    06
  Supabase Realtime                  available, unused    06
  UDP/QUIC at app level              never                03
  Service workers                    N/A (RN)             05
  CORS                               N/A (RN is native)   05
  Cookies                            never                05
  HTTP caching headers honored       no                   05
  Client-owned retry/backoff         no                   07
  Backpressure queue                 no                   07
  Anthropic API (Phase 4)            planned, not built   06, 07
  Remote model fetch                 never (bundled)      01
  Camera frame upload                never                01
```

This list is the honest version of "what contrl does on the wire." Every
file below pins its claims to the same evidence.

## Where to start

  → If you're auditing for risk: jump to `08-networking-red-flags-audit.md`.
  → If you're learning the wire: read `01-network-map.md` next.
  → If you're a sibling guide that needs to cross-link: every file is
    self-contained; cite the file path, not this overview.

## See also

  → `01-network-map.md` — the wire surface drawn in detail
  → `08-networking-red-flags-audit.md` — the ranked risks
  → `.aipe/study-security/` — trust boundaries, anon key threat model
  → `.aipe/study-system-design-dsa/` — where the sync seam belongs in architecture
