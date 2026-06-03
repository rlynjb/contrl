# study-networking — contrl

The networking study guide for the contrl repo. Curriculum-style: nine files,
fixed concept inventory, each grounded in the real code or honestly marked
`not yet exercised`.

## What this guide answers

```
  the question: what actually happens on the wire when contrl runs,
                where can it fail, and which protocol semantics does
                the code rely on?
```

Where this sits in the study family:

```
  study-networking        WHAT happens on the wire and why          ← this guide
  study-security          WHETHER each trust boundary is safe
  study-system-design     WHERE network boundaries belong in the architecture
```

A finding belongs to the generator that owns the mechanism. This file teaches
the wire; the sibling guides cross-link rather than repeat.

## The headline

contrl is a **mostly-offline** app. The hot path — camera frames, pose
detection, rep counting, SQLite reads/writes — never touches the network.
The only network surface is `@supabase/supabase-js` doing REST upserts and
deletes against one Supabase host, fired opportunistically after every
local write.

```
  contrl's network surface, one diagram

  ┌─ device (the whole app, mostly) ─────────────────────────────────┐
  │  camera → pose → rep counter → SQLite        ← never crosses ─── │
  │                       ↓                          the boundary    │
  │                 sessions, gates                                  │
  │                       ↓                                          │
  │                 pushChanges()  ───── HTTPS ──────►  Supabase     │
  └──────────────────────────────────────────────────────────────────┘
                                       ↑
                          one host: <project>.supabase.co
                          one transport: TCP + TLS 1.3
                          one protocol: HTTP/2 (PostgREST)
                          one auth: anon key in header
```

That is the entire wire surface. No realtime, no SSE, no WebSocket, no
LLM calls (yet), no model fetch, no analytics, no crash reporting.

## Reading order

```
  1. 00-overview.md                                   the map + ranked findings
  2. 01-network-map.md                                every wire path in detail
  3. 02-dns-routing-and-addressing.md                 how the name resolves
  4. 03-tcp-udp-connections-and-sockets.md            the transport layer
  5. 04-tls-and-trust-establishment.md                trust + encryption
  6. 05-http-semantics-caching-and-cors.md            REST verbs, headers, status
  7. 06-websockets-sse-streaming-and-realtime.md      long-lived (not yet exercised)
  8. 07-timeouts-retries-pooling-and-backpressure.md  failure handling
  9. 08-networking-red-flags-audit.md                 ranked risks, evidence
```

Start at `00-overview.md` if you have ten minutes. Read the rest in order if
you want the full picture; each file leans on the one before it.

## Honest "not yet exercised" list

The repo is small on purpose. These topics are part of every networking
curriculum but contrl does not currently touch them:

```
  not exercised today              becomes relevant when
  ───────────────────              ──────────────────────
  WebSockets / Realtime            Supabase Realtime is turned on
  Server-Sent Events               Anthropic streaming arrives (Phase 4)
  UDP / QUIC at app level          never (HTTP-only client)
  Client-side caching headers      ETag / Cache-Control on PostgREST
  Connection pool tuning           multi-host fan-out
  Backoff + jitter on retries      first sustained network failure
  CORS                             never (RN is native, not a browser)
  Service workers                  never (RN has no service-worker concept)
  Multi-region / edge routing      project moves off shared Supabase
  HTTP/3 + QUIC                    Supabase enables it transparently
```

If you see something in the cookbook that isn't covered, check this table
first — it's probably here because contrl doesn't do it.

## Cross-links

  → trust boundary + anon-key threat model: `.aipe/study-security/`
  → where the sync boundary belongs in the architecture: `.aipe/study-system-design-dsa/`
  → SQLite write-then-push pattern, fire-and-forget: `.aipe/study-system-design-dsa/`
  → Realtime as a future-state design choice: this guide, file 06

## How to use this with the codebase open

Every file pins its claims to `file:line` ranges in the actual repo. The
intended workflow is two-pane: this guide on one side, the source file open
on the other. Don't read it as prose — read it with `src/services/sync/`
visible.
