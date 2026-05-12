# React Context and sync versioning

**Industry name(s):** Bump-and-reload, change counter, version-as-dependency
**Type:** Industry standard

> A monotonically-increasing `syncVersion` counter in `NotionSyncContext` increments after every successful sync. `useGameState` watches it via `useEffect` and re-runs `load()` whenever it changes. The signal that says "data on disk changed under you" doesn't have to carry any payload — just the version.

**See also:** → [06-reconstruction-on-reinstall](./06-reconstruction-on-reinstall.md) · → [05-derived-state](./05-derived-state.md) · → [03-bidirectional-sync](./03-bidirectional-sync.md)

---

## Why care

You hit refresh in a tab and the UI repaints with new data. The server didn't push; the client polled. The mechanism is mundane: a counter that says "something changed, re-fetch". Now imagine the same problem on a mobile app where the "server" is a background sync function and the "tab" is a React tree. The pattern is identical — a counter that screams change, a listener that re-fetches.

The pattern is **bump-and-reload**, sometimes called **change counter** or **revalidation tokens**. Same shape as SWR's `mutate()`, React Query's `queryClient.invalidateQueries()`, and the `Last-Modified` headers in HTTP caching. The hard part isn't bumping the counter — it's deciding which subscribers should re-fetch and making sure none of them get stuck in a loop. Here's how this codebase wires it up.

---

## How it works

Two boxes talk to each other indirectly. One box says "I just changed something" by incrementing a number. The other box notices the number changed and re-reads from disk. They never call each other directly.

The strategy: **a counter as the only contract between syncer and consumer**.

### The counter producer

```typescript
const [syncVersion, setSyncVersion] = useState(0);
const inFlightRef = useRef(false);

const syncNow = useCallback(async (): Promise<SyncResult | null> => {
  if (inFlightRef.current) return null;
  inFlightRef.current = true;
  setStatus('syncing');
  try {
    const res = await syncAll();
    setStatus(res.errors.length > 0 ? 'error' : 'success');
    setSyncVersion(v => v + 1);     // ← the bump
    return res;
  } finally {
    inFlightRef.current = false;
  }
}, []);
```

`src/hooks/NotionSyncContext.tsx` L43–L63. `syncVersion` is a `useState(0)` value in the context provider. After a successful (or even error-but-completed) `syncAll`, the counter increments. The bump happens *after* the sync has finished writing to disk, so any consumer that re-reads after seeing the bump is guaranteed to see the new data.

The `inFlightRef` is a separate concern but related — it prevents two `syncNow()` calls from running concurrently. The bump only happens once per completed sync.

If you're coming from frontend, this is exactly the SWR / React Query pattern of "invalidate by key" — except instead of keying on URL, we're keying on "the whole local DB has been updated".

### The counter consumer

```typescript
// Reload all game state after a Notion sync
const prevSyncVersion = useRef(syncVersion);
useEffect(() => {
  if (syncVersion > prevSyncVersion.current) {
    prevSyncVersion.current = syncVersion;
    load().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to refresh workout data';
      setError(message);
      setStatus('error');
    });
  }
}, [syncVersion, load]);
```

`src/hooks/useGameState.ts` L171–L182. A second `useEffect` watches `syncVersion`. On mount, it sees the current value; on subsequent renders where `syncVersion` has incremented, it fires `load()`.

The `prevSyncVersion` ref is the guard against re-entrancy. Without it, the effect would fire on every render where `syncVersion` is non-zero (because `useEffect` doesn't compare against "the previous run's deps", it compares against the previous render's deps — and React doesn't always rerun deps comparison the same way). With it, we only fire when the value has actually *increased*.

The bridge from frontend: this is the same pattern as `usePrevious` for detecting changes — you can't always trust React's `useEffect` deps to give you "fire once on change"; sometimes you need an explicit ref to compare against.

The practical consequence: every time a sync completes, `load()` runs in `useGameState`, which means session data is re-fetched from SQLite, and if the reinstall fingerprint matches, `reconstructFromSessions` fires.

### Why not push events directly?

An alternative would have been: `NotionSyncContext` exposes `onSyncComplete` callbacks, `useGameState` registers a callback, and the context fires the callback when sync finishes. That would have worked but with downsides:
1. Callback registration timing matters — a `useEffect` that registers on mount and unregisters on unmount could miss events.
2. Multiple subscribers need a list, with iteration and cleanup.
3. The mental model is mutable: "Who fires what when".

A counter is *declarative*: subscribers express "I need to react when version increases" and React's `useEffect` handles the wiring. There's no list to maintain.

### One-way information flow

```
┌─ NotionSyncContext ─┐                ┌─ useGameStateInternal ─┐
│  syncVersion: N     │ ─── observed ──▶│  prevSyncVersion: N   │
└─────────────────────┘                └────────────────────────┘
        │                                          │
        │  syncAll() completes                     │  load()
        ▼                                          ▼
┌─ NotionSyncContext ─┐                ┌─ useGameStateInternal ─┐
│  syncVersion: N+1   │ ─── triggers ──▶│  load() fires         │
└─────────────────────┘                │  prevSyncVersion ← N+1│
                                        └────────────────────────┘
```

`useGameState` never calls into `NotionSyncContext`. It only *reads* the counter. The reverse direction (game state telling sync to fire) goes through `useNotionSync().syncNow()` from the call site (e.g., the settings screen or auto-sync in `_layout.tsx`).

### Move 2.5 — Phase A vs Phase B

**Phase A (current):** one counter, one subscriber (`useGameState`). The counter could grow more subscribers without changes to the producer — just add more `useEffect`s watching `syncVersion`.

**Phase B (planned, not built):** if multiple subscribers ever need *different* invalidation granularity (e.g., "only refresh weekly stats, not gates"), one counter becomes too coarse. The fix would be multiple counters (`sessionsVersion`, `exercisesVersion`) or a typed event bus. Today the granularity is "everything", which is correct because every sync potentially touches everything.

### Move 3 — The principle

A monotonic counter is the simplest viable signal for "something downstream needs to reconsider". It's cheaper than events (no list, no cleanup), more declarative than callbacks (no registration), and exactly what React's `useEffect` deps system was designed to consume. The pattern shows up everywhere you have a "data may have changed" producer talking to "I read from that data" consumers — HTTP `ETag`, SQL row versions, git commit hashes — all the same shape at different scales.

The full picture is below.

---

## Sync versioning — diagram

```
┌─ Context tree ────────────────────────────────────────────────────────────────────────┐
│                                                                                       │
│   <NotionSyncProvider>             <─── owns syncVersion: number                      │
│      │                                                                                │
│      │                                                                                │
│      └─ <AppContent>                                                                  │
│            │                                                                          │
│            │ useDatabase()                                                            │
│            │ useGameStateInternal(ready)  <─── reads syncVersion, watches it          │
│            │ useNotionSync()              <─── calls syncNow() (auto-sync on open)    │
│            │                                                                          │
│            └─ <GameStateContext.Provider value={gameState}>                           │
│                  │                                                                    │
│                  └─ <Stack> (every screen)                                            │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘


┌─ Sync completes ─────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│   1. syncAll()  →  writes to SQLite                                                  │
│                                                                                      │
│   2. setSyncVersion(v => v + 1)                                                      │
│         │                                                                            │
│         │  React schedules re-render                                                 │
│         ▼                                                                            │
│   3. NotionSyncContext re-renders with syncVersion = N+1                             │
│         │                                                                            │
│         │  consumers re-render (cheap — they just see the new value)                 │
│         ▼                                                                            │
│   4. useGameStateInternal effect: syncVersion > prevSyncVersion → fire               │
│         │                                                                            │
│         ▼                                                                            │
│   5. load()                                                                          │
│         ├── db.getSessions(), db.getAllGateProgress(), etc.                          │
│         ├── reinstall-fingerprint check                                              │
│         │     └── reconstructFromSessions if matched                                 │
│         └── setSessions/setGateProgress/setUser (React state)                        │
│                                                                                      │
│   6. UI repaints with the post-sync state                                            │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Producer:** `src/hooks/NotionSyncContext.tsx`
- `syncVersion` state: L32
- Bump: L53 (`setSyncVersion(v => v + 1)` inside `syncNow`)

**Consumer:** `src/hooks/useGameState.ts`
- `useNotionSync()` call: L77
- `prevSyncVersion` ref: L172
- The reload effect: L173–L182

**Call site (auto-sync on app open):** `app/_layout.tsx` L34–L47

---

## Elaborate

### Where this pattern comes from

The "version counter as invalidation signal" is the same shape as HTTP's `ETag`, SQL row versions for optimistic locking, and the `dirty` flags in many caching libraries. SWR popularized it in JS frontend land (`mutate(key)` ≈ "bump the key's version"). Before that, Backbone's `Collection.fetch()` and Redux's reducers using "increment a counter" patterns were the same intuition.

### The deeper principle

When a producer and consumer are temporally decoupled (producer's action vs consumer's effect happen at different times), the cleanest connection is a stateless one: just a number that changes monotonically. The number carries no payload; the consumer pulls fresh data when it notices the number is bigger than what it last saw. This avoids the entire class of "event was fired but no listener was registered" bugs that direct callbacks have.

### Where this breaks down

Multiple kinds of changes that should invalidate different subscribers differently. If session writes and exercise reference-data pulls both bump the same counter, every consumer re-fetches everything — wasteful if only a subset actually changed. The fix is finer-grained counters or a typed event system; we don't need it yet because every sync touches everything anyway.

The other breakpoint: a sync that fails partway. We bump `syncVersion` regardless of `errors.length > 0`, on the theory that "something *probably* changed". A consumer that re-fetches and finds nothing new just paid for an unnecessary round-trip to SQLite. The alternative would be to bump only on full success, but then a partial-success sync would leave consumers with stale data.

### What to explore next

- [06-reconstruction-on-reinstall](./06-reconstruction-on-reinstall.md) → what `load()` does when it fires
- [03-bidirectional-sync](./03-bidirectional-sync.md) → what writes the data the bump signals about

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬───────────────────────────────────┐
│ Cost dimension     │ Monotonic counter (taken)        │ Event emitter (alternative)       │
├────────────────────┼──────────────────────────────────┼───────────────────────────────────┤
│ Code volume        │ ~10 LOC                          │ ~50 LOC (subscribe/unsubscribe)   │
│ Subscriber overhead│ Re-renders the consumer hooks    │ Direct callback invocation         │
│ Race conditions    │ React handles via deps           │ Subscribe-order bugs possible      │
│ Granularity        │ Coarse (everything)              │ Fine (per event type)             │
│ Mental model       │ Declarative — version triggers   │ Imperative — events fire callbacks│
│ Cleanup            │ Free (React unmount handles it)  │ Must unregister                   │
│ Debuggability      │ Log syncVersion changes          │ Log event names + payloads        │
└────────────────────┴──────────────────────────────────┴───────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The biggest cost is *coarse granularity*. Every sync bumps the same counter, so every consumer of `useGameState` re-runs `load()` even if the sync only changed (say) one exercise. `load()` itself is fast (~10ms typical) so this is acceptable, but at higher session counts it becomes noticeable. The fix would be typed counters — `sessionsVersion` and `exercisesVersion` separately — but we'd need to thread both into every consumer.

The second cost is the `prevSyncVersion` ref. It's a footgun: a developer adding another effect that watches `syncVersion` might forget the ref-comparison pattern and accidentally re-fire on every render. There's no enforcement.

### Sub-block 2 — what an event emitter would have cost

A typed event emitter (`emitter.on('sessions:synced', callback)`) would have been more precise — consumers could subscribe to exactly the events they care about. The cost: every consumer needs subscribe-on-mount + unsubscribe-on-unmount boilerplate. Subscribe-after-event bugs are common (e.g., if a sync completes between mount and the subscribe effect firing, the consumer misses the first event). React's `useEffect` doesn't natively support events; you build the bridge by hand.

For two consumers, the boilerplate cost > the precision benefit. At 10+ consumers with distinct invalidation needs, an event system pays off.

### Sub-block 3 — the breakpoint

Fine until **multiple consumers need different invalidation granularity**. Today there's one consumer (`useGameState`) and one event (sync completion). If we added (e.g.) a "recent activity" hook that should only re-fetch when sessions change, or a "exercise catalog" hook that should only re-fetch when exercises change, one counter is too coarse. The fix is to split into typed counters, then to swap to an emitter if the typed counters proliferate.

### Sub-block 4 — what wasn't actually a tradeoff

Polling (re-fetch on a timer regardless of changes) was not a real option. It would re-render every N seconds even when nothing changed — wasteful battery, unnecessary SQLite reads. The counter pattern only triggers re-fetch on actual change.

---

## Tech reference (industry pairing)

### React Context with counter state

- **Codebase uses:** `NotionSyncContext` in `src/hooks/NotionSyncContext.tsx`. `useState(0)` for the counter; `setSyncVersion(v => v + 1)` to bump.
- **Why it's here:** the simplest mechanism for cross-context invalidation in a React tree.
- **Leading today:** React Context with derived state — `adoption-leading`, 2026.
- **Why it leads:** native to React; no library; works with the framework's mental model.
- **Runner-up:** Zustand selectors — `innovation-leading` for ergonomic state mgmt with built-in reactivity; the right choice if context coordination grows.

### Bump-and-reload pattern

- **Codebase uses:** Monotonic `syncVersion` increment + `useEffect` deps watching.
- **Why it's here:** the connective tissue between the sync engine and the UI without coupling them.
- **Leading today:** SWR's `mutate` / React Query's `invalidateQueries` — `adoption-leading` shape for declarative refetch, 2026.
- **Why it leads:** declarative, framework-friendly, debuggable (you can log "version went from X to Y").
- **Runner-up:** RxJS Subjects / event emitters — `innovation-leading` for complex multi-consumer scenarios; powerful but heavier to learn.

---

## Summary

### Concept recap

`NotionSyncContext` owns a `syncVersion: number` that increments after every successful `syncAll()`. `useGameStateInternal` watches it with a `useEffect` and re-runs `load()` whenever the value increases (guarded by a `prevSyncVersion` ref to avoid re-render storms). This is how a background sync that writes to disk notifies React components to re-read. The constraint forcing this design was keeping the sync engine and the React tree decoupled — neither knows about the other directly. The cost is coarse granularity (every sync triggers every consumer to re-fetch).

### Key points

- Lives in step 2 (Request flow) and step 4 (State ownership) of the system-design checklist.
- One counter, no payload — the consumer pulls fresh data when it sees the counter increase.
- `prevSyncVersion` ref prevents re-render-without-change loops.
- The sync engine has no reference to `useGameState`; the only coupling is the counter.
- Adding a new consumer is free: add another `useEffect(..., [syncVersion])`.

---

## Interview defense

### What an interviewer is really asking

Behind "how do you trigger re-fetches" is "do you know the difference between data-flow patterns, and did you pick the lightest one that works?" The signal is whether you can name event-emitter, polling, and counter, and explain why counter won here.

### Likely questions

**Q: What's `syncVersion` and why does it exist?  [mid]**
A: It's a `useState` number in `NotionSyncContext` that increments after every successful sync. The point is to give `useGameState` a signal to re-run `load()` — it watches `syncVersion` via `useEffect` and reloads whenever the value increases. Without it, the React tree wouldn't know that a background sync changed SQLite contents, and the UI would show stale data until the user manually refreshed.

```
   syncVersion: 0  ──► load() fires on mount
              │
   syncAll completes
              │
              ▼
   syncVersion: 1  ──► useEffect detects change, load() fires again
                       UI repaints with new data
```

**Q: Why use a counter instead of an event emitter?  [senior]**
A: Two reasons. First, React's `useEffect` deps system natively consumes "value changed" but doesn't natively consume "event fired" — events need a bridge layer with subscribe-on-mount + unsubscribe-on-unmount, which adds boilerplate and subscribe-timing bugs. Second, there's only one consumer today (`useGameState`); the precision benefit of typed events doesn't outweigh the boilerplate cost. If we had 10+ consumers with different invalidation needs, I'd switch to an event system or typed counters.

```
   Counter (taken)                       │   Event emitter (alternative)
   ──────────────────────────────────── │ ─────────────────────────────────────
   ~10 LOC                              │   ~50 LOC (subscribe/unsubscribe)
   declarative (useEffect deps)         │   imperative (callbacks)
   coarse (all consumers re-fetch)      │   fine (subscribe to specific events)
   no cleanup needed                    │   must unregister
   right for 1–2 consumers              │   right for 10+ consumers
```

**Q: What happens at scale — many syncs per minute?  [arch]**
A: Each bump causes every `syncVersion` consumer to re-run its load function. Today there's one consumer and the load is ~10ms, so the cost is trivial. At higher frequencies (e.g., a "live sync" mode at one sync per second), the consumer's load becomes the bottleneck — not the bump itself. The fix is debouncing the load function (only fire if at least N ms have elapsed since the last fire) or batching multiple syncs into one bump. We don't have this problem today because syncs are user-initiated or auto-on-open.

```
┌─ at 1 sync/sec ────────────────────────────────────────────┐
│  bump cost            ~0 (just setState)                   │
│  consumer cost        ~10ms per load                       │
│  bottleneck           load() throughput, not bump          │
│  fix: debounce load() to e.g. min 500ms between calls      │
└────────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: What if two sync calls race and `setSyncVersion(v => v + 1)` both run?**
A: The `inFlightRef.current` guard in `syncNow` prevents two `syncAll` calls from running concurrently — the second one returns null immediately. So in practice, only one bump per completed sync ever happens. If we ever bypassed that guard (e.g., called `syncAll` directly without going through `syncNow`), two parallel bumps would both fire and the consumer would see `syncVersion` increment twice — running `load()` twice. The load function is idempotent (it reads and re-reads from SQLite, no side effects beyond setting React state), so the double-fire is wasteful but not incorrect.

```
   Picked (single in-flight guard)       │   Parallel-safe (alternative)
   ──────────────────────────────────── │ ─────────────────────────────────────
   inFlightRef prevents concurrent sync  │   atomic counter, idempotent loads
   bump always fires once per sync       │   bump can fire multiple times
   load() runs once                      │   load() runs N times (cost: minor)
   simple                                │   safer against future changes
```

### One-line anchors

- A number is the cheapest invalidation signal.
- The consumer pulls; the producer doesn't push.
- Coarse granularity is fine when load() is cheap.
- `prevSyncVersion` is the ref that prevents loops.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Draw the producer (`NotionSyncContext`) and consumer (`useGameState`) with the counter between them. Mark which direction the data flows.

### Level 2 — Explain it out loud
Explain how `syncVersion` ties the sync engine to the UI. Under 90 seconds.

### Level 3 — Apply it to a new scenario
"You're asked to add a 'Recent Activity' screen that should refresh whenever sessions change but not when exercises change. How would the counter pattern adapt?"

Reference `NotionSyncContext.tsx` L32, L53.

### Level 4 — Defend the decision you'd change
"Would you switch to an event emitter pattern if a fifth consumer was added?" Walk through the cost-benefit table.

### Quick check — code reference test
- What file owns `syncVersion`?
- What hook watches it?
- What line is the bump on?

Then verify.
