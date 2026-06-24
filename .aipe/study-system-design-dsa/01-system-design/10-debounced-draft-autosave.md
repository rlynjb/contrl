# Debounced draft autosave

**Industry name(s):** Trailing debounce, autosave-on-idle, deferred write
**Type:** Industry standard

> Every change to the log-screen form fields schedules a `setTimeout(save, 500)`. The previous timer is cleared on each new change, so only the *last* keystroke in any 500ms window actually writes to SQLite. The user gets autosave; the disk gets one write per pause.

**See also:** → [05-derived-state](./05-derived-state.md) · → [02-sqlite-as-source-of-truth](./02-sqlite-as-source-of-truth.md)

---

## Why care

A user is mid-pushup-set, tapping checkboxes and editing rep counts. Each tap is a state change. Naive autosave would write to disk on every tap — hundreds of writes per set, battery-hostile and disk-wear-inducing. The polite version writes *after* the user stops fidgeting for a moment. That moment is the debounce window.

The pattern is **trailing debounce** — defer the side effect, restart the timer on each event, only fire when events stop arriving. Same shape as a search input that waits before hitting the API, scroll handlers that wait before recalculating layout, and every "draft saved" feature in Google Docs / Notion / Linear. The trick isn't the timer; it's making sure unmount and dependency changes properly clean up so you don't fire on a stale field. Here's how that works in this codebase.

---

## How it works

Imagine you're writing a long email and after every keystroke a "saved" toast appears. You'd hate it — too noisy. Now imagine it appears only when you pause for half a second. That's debounce: defer until activity stops.

The strategy: **schedule a save, clear it on next change, only the last scheduled save survives**.

### The autosave effect

```typescript
const isFirstRender = useRef(true);
const saveDraftRef = useRef(onSaveDraft);
saveDraftRef.current = onSaveDraft;

useEffect(() => {
  if (isFirstRender.current) {
    isFirstRender.current = false;
    return;
  }
  const timer = setTimeout(() => {
    saveDraftRef.current({
      category,
      level,
      exercises: exerciseState,
      notes,
      savedAt: new Date().toISOString(),
    });
  }, 500);
  return () => clearTimeout(timer);
}, [exerciseState, notes, category, level]);
```

`src/hooks/useExerciseForm.ts` L88–L107. Three independent pieces, each load-bearing:

1. **The `setTimeout` itself.** Every render schedules a save 500ms in the future.
2. **The cleanup function (`return () => clearTimeout(timer)`).** React calls this *before* the next effect fires. So when `exerciseState` changes a moment later (e.g., user taps another checkbox), the *previous* timer is cleared before the new one is set. Only the timer scheduled by the *most recent* render survives.
3. **The `isFirstRender` guard.** Without it, the autosave would fire on mount, writing an unchanged draft to SQLite. Wasteful and confusing in logs.

If you're coming from frontend, this is the canonical "useEffect-as-debounce" pattern — every effect-cleanup-effect-cleanup cycle is exactly one debounce period. The first effect schedules; the cleanup cancels; the next effect re-schedules.

### Why the ref indirection (`saveDraftRef`)

```typescript
const saveDraftRef = useRef(onSaveDraft);
saveDraftRef.current = onSaveDraft;
```

`onSaveDraft` is a prop from the parent (`useGameState`'s `saveDraft`). React functions can change reference between renders. If we used `onSaveDraft` directly inside `setTimeout`, the timer would capture *the function from when it was scheduled* — and if the parent re-rendered with a new function, the captured one might be stale.

The ref pattern is the standard solution: keep a mutable handle that always points at the latest version. The timer reads from `saveDraftRef.current` at fire time, getting the freshest function.

This is the same pattern as `useEventCallback` proposals in React's RFCs — capture the call site but defer the function lookup.

### Why 500ms specifically?

It's the inflection point between "user feels responsive" and "we're not writing too often". Faster (200ms) and a moderately fast typist could trigger 5 writes per second. Slower (1500ms) and a user who taps a checkbox and immediately closes the app loses the draft entirely.

500ms is the same value most autosave systems converge on for similar reasons — it's near the threshold where attention shifts in human-computer interaction, so a user who's "done with this field" has paused at least that long.

### The write

```typescript
export async function saveDraft(category: Category, level: number, draft: DraftSession): Promise<void> {
  const d = await getDatabase();
  const id = `draft:${category}:${level}`;
  await d.runAsync(
    `INSERT OR REPLACE INTO drafts (id, category, level, exercises_json, notes, saved_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, category, level, JSON.stringify(draft.exercises), draft.notes, draft.savedAt]
  );
}
```

`src/services/database.ts` L556–L564. `INSERT OR REPLACE` means the write is idempotent — multiple saves on the same `(category, level)` key just overwrite. The composite key `draft:${category}:${level}` allows one in-progress draft per category-level pair. If the user starts a push L3 workout, switches to squat L2, switches back to push L3, the push L3 draft is still there.

### Cleared on save

```typescript
// In logSession, after successful save:
await db.deleteDraft(session.category, session.level);
```

`useGameState.ts` L266. After a session is fully logged (the user hits "Save"), the corresponding draft is deleted. The draft is for "work in progress"; once the work is committed, the draft has no purpose.

### Move 2.5 — Phase A vs Phase B

**Phase A (current):** debounce per active form. One log screen at a time means one debounce timer in flight at a time. The cleanup-on-unmount path handles "user navigates away mid-edit" — the timer is cleared, the last typed change is *not* saved (but the previous 500ms-ago save survives).

**Phase B (planned):** if multiple drafts could be edited simultaneously (rare on mobile but possible with a tablet-split-view feature), the debounce would need per-draft state. Currently the timer is local to the hook instance, so each form-mount has its own — this would still work, but coordinating overlapping unmounts would get subtle.

### Move 3 — The principle

Debounce trades write frequency for latency. In return for one disk write every N milliseconds instead of one per keystroke, the user accepts up to N milliseconds of "unsaved" risk. The right N depends on how bad it is to lose N ms of work — for a draft of a workout it's nothing; for a draft of an email it might be slightly worse but still acceptable. Anything where losing the last typed letter would be a disaster needs a different strategy (synchronous writes, optimistic UI, or both).

The full picture is below.

---

## Debounced draft autosave — diagram

```
                    ┌─ user interaction ─────────────────────┐
                    │  tap checkbox / edit reps / type notes │
                    └──────────────────┬─────────────────────┘
                                       │
                                       ▼
                  ┌─ React renders useExerciseForm with new state ─┐
                  └────────────────────────┬────────────────────────┘
                                           │
                                           ▼
            ┌─ useEffect deps include exerciseState/notes ──────────────┐
            │  Cleanup runs first:    clearTimeout(prev timer)          │
            │  Then effect runs:      const timer = setTimeout(...) 500ms │
            └────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
                  ┌─ 500ms wall-clock pause ────────────────────┐
                  │                                             │
                  │   if another keystroke happens:             │
                  │      cleanup clears this timer              │
                  │      new timer scheduled                    │
                  │                                             │
                  │   if no keystroke:                          │
                  │      timer fires                            │
                  └────────────────────────┬────────────────────┘
                                           │
                                           ▼
                          saveDraftRef.current({...})
                                           │
                                           ▼
                ┌─ saveDraft → INSERT OR REPLACE INTO drafts ───┐
                │  key: `draft:${category}:${level}`            │
                └──────────────────────────────────────────────┘


   keystroke A  ─┐
   keystroke B  ─┤
   keystroke C  ─┤   ←─── all clustered in ~100ms
   (pause)       │
   500ms idle    │
                 ▼
              ONE save  (only the state after C, A and B are subsumed)
```

---

## In this codebase

**File:** `src/hooks/useExerciseForm.ts`
**Function / class:** `useExerciseForm()` autosave effect
**Line range:** L88–L107

**Persistence layer:**
- `src/services/database.ts` L556 `saveDraft`
- `src/services/database.ts` L566 `getDraft`
- `src/services/database.ts` L584 `deleteDraft`

**Initial state hydration from draft:** `useExerciseForm.ts` L44–L62 (`buildInitialState`)

---

## Elaborate

### Where this pattern comes from

Debounce as a UX pattern was named in the early 2000s but originated in switch electronics, where mechanical contacts "bounce" between open and closed for a few milliseconds after a press. Software debounce treats events the same way — wait for the bouncing to stop before reacting. JavaScript's `setTimeout` + `clearTimeout` pair has been used for it forever; React's `useEffect` cleanup made it idiomatic.

### The deeper principle

A side effect can be expensive (disk write, network call, repaint) or cheap (state update). Debouncing is the pattern for expensive side effects on frequent events. The shape is universal: events → schedule → cancel-on-next-event → fire-on-idle. It's the same idea as `requestAnimationFrame` for paint, `requestIdleCallback` for background work, and HTTP `Cache-Control` for revalidation.

### Where this breaks down

When the user kills the app within the debounce window. The cleanup function runs (clearing the timer), but the *last* changes were never persisted. They're lost. Acceptable for a workout draft (the user can re-enter the values from memory); unacceptable for, say, a long-form note editor. The fix is a synchronous write on `appStateChange === 'background'` — we don't have it, but it's a small addition.

The other breakpoint: if the save is slow (e.g., disk write takes longer than the debounce period). At 500ms debounce and a 600ms slow disk, you'd have overlapping in-flight saves. The current code doesn't guard against this — `saveDraft` is fire-and-forget. SQLite writes are fast enough that this isn't a real concern, but it's a smell.

### What to explore next

- [05-derived-state](./05-derived-state.md) → why drafts aren't synced
- [02-sqlite-as-source-of-truth](./02-sqlite-as-source-of-truth.md) → where the draft lands

---

## Tradeoffs

```
┌────────────────────┬──────────────────────────────────┬───────────────────────────────────┐
│ Cost dimension     │ Trailing debounce 500ms (taken)  │ Throttle leading edge (alt)       │
├────────────────────┼──────────────────────────────────┼───────────────────────────────────┤
│ Disk writes        │ ~1 per pause                     │ ~1 per 500ms regardless           │
│ Latency to save    │ 500ms after last keystroke       │ Up to 499ms (synchronous fire)    │
│ Lost-data risk     │ Last ≤500ms of edits             │ None (saves immediately)          │
│ Battery cost       │ Low                              │ Higher (saves during active edit) │
│ User perception    │ "saved when I stop"              │ "saved instantly"                  │
│ Code complexity    │ One useEffect + ref              │ Same                              │
│ Tab close midedit  │ Last edits lost                  │ Same                              │
└────────────────────┴──────────────────────────────────┴───────────────────────────────────┘
```

### Sub-block 1 — what we gave up

The cost is ≤500ms of lost data on a hard close. If the user types "5" in a rep field and immediately swipes the app away, the "5" might not have been saved. For a workout the cost is "user types 5 again next time" — tolerable. For a value where every character matters (e.g., a medical note), it would be unacceptable.

The second cost is *no feedback*. The user doesn't see "draft saved" — they just trust that it's happening. We could add a transient toast, but it would have to fire on every debounce, which competes with the "do less, write less" goal.

### Sub-block 2 — what leading-edge throttle would have cost

A leading-edge throttle (save immediately on first event, then ignore for 500ms) would protect against the "swipe app away" case but at the cost of more writes during active editing — every active typing session writes every 500ms whether the user has paused or not. For a 30-second logging interaction that's 60 writes vs. trailing debounce's ~5–10 writes. The disk cost is small but the principle (write less, write later) is worth more.

### Sub-block 3 — the breakpoint

Fine until the **app background-without-warning** scenario becomes a frequent failure mode. If users routinely lose work because the OS killed the app under memory pressure mid-edit, the trailing debounce becomes the wrong call. The fix is to add a `AppState` listener and force-save on background transition.

### Sub-block 4 — what wasn't actually a tradeoff

Saving on every keystroke (no debounce) was never an option. The disk-write rate would be 5–10 per second during active typing, draining battery and stressing the SQLite WAL. The latency would also be felt: every keystroke would await a disk write.

---

## Tech reference (industry pairing)

### useEffect-as-debounce

- **Codebase uses:** Idiomatic `useEffect` with `setTimeout` + cleanup. `src/hooks/useExerciseForm.ts` L92–L107.
- **Why it's here:** the framework-native way to express "fire after deps stop changing for N ms".
- **Leading today:** `useEffect` + `setTimeout` — `adoption-leading`, 2026.
- **Why it leads:** no library, no extra mental model, integrates with React's lifecycle.
- **Runner-up:** Custom `useDebounce` hook — `innovation-leading` for readability; the abstraction earns its place if debounce shows up in 3+ places.

### Ref-as-stable-callback

- **Codebase uses:** `saveDraftRef.current = onSaveDraft` updated on every render; the `setTimeout` reads from the ref to avoid stale captures. L89–L90.
- **Why it's here:** the standard workaround for "I want a stable closure that always points at the latest function".
- **Leading today:** ref-as-event-callback — `adoption-leading` in React app code, 2026.
- **Why it leads:** every React project that uses callbacks-in-effects converges to this pattern.
- **Runner-up:** `useEventCallback` (proposed RFC) — `innovation-leading`; not yet stable but coming.

---

## Summary

### Concept recap

When any form field changes, `useExerciseForm`'s autosave effect schedules a 500ms-delayed call to `saveDraft`. React's `useEffect` cleanup clears the previous timer before the new effect schedules — so successive keystrokes always cancel the prior timer, and only the last scheduled save actually fires. The save itself is `INSERT OR REPLACE` on the `drafts` table keyed by `draft:${category}:${level}`. On successful session log, the draft row is deleted. The constraint forcing this design was the latency budget (no synchronous writes on the UI thread) and the disk-wear budget (no per-keystroke writes). The cost is up to 500ms of work lost on a hard close.

### Key points

- Lives in step 3 (Caching) and step 5 (Failure handling) of the system-design checklist.
- The 500ms is a balance between perceived responsiveness and disk-write frequency.
- The cleanup function (`clearTimeout`) is what makes this a debounce — without it, every keystroke would save.
- The ref indirection avoids stale function captures across renders.
- `INSERT OR REPLACE` makes the save idempotent — overlapping saves are safe.
- The `isFirstRender` guard avoids writing an unchanged draft on mount.

---

## Interview defense

### What an interviewer is really asking

Behind "how does autosave work" is "do you understand the difference between debounce and throttle, and why one is right here?" The signal is whether you can describe the cleanup function's role and the failure mode of skipping it.

### Likely questions

**Q: Walk me through the debounce.  [mid]**
A: `useEffect` watches the form state. Every time state changes, the effect runs — but first React calls the *previous* effect's cleanup, which is `clearTimeout(timer)`. So the previous save-in-500ms timer gets cancelled, and a new one is scheduled. Only the timer scheduled by the most recent render survives, and only if no other change happens in the next 500ms. When it fires, it calls `saveDraft` via a ref to avoid stale captures.

```
   keystroke 1 → schedule timer A (500ms)
   keystroke 2 → clearTimeout(A), schedule timer B (500ms)
   keystroke 3 → clearTimeout(B), schedule timer C (500ms)
   pause 500ms → timer C fires → saveDraft
```

**Q: Why a ref for `saveDraftRef`?  [senior]**
A: `onSaveDraft` is a prop and its function identity changes on parent re-renders. If we captured it directly inside `setTimeout`, the callback would close over *the version at scheduling time* — which might be stale if the parent re-rendered with a new function before the timer fired. The ref keeps a mutable handle, updated on every render to point at the latest `onSaveDraft`. At fire time, we dereference and call. It's the same pattern as `useEventCallback`.

```
   Direct capture (bug-prone)              │   Ref indirection (taken)
   ──────────────────────────────────────  │   ────────────────────────────────
   setTimeout(() => onSaveDraft(...), ms)  │   saveDraftRef.current = onSaveDraft
   captures function from this render      │   setTimeout(() => saveDraftRef
   parent re-render → function changes      │     .current(...), ms)
   timer fires with stale function          │   timer fires with latest function
```

**Q: What happens at 100 fields changing per second?  [arch]**
A: Each change schedules a new timer and cancels the previous. The clearTimeout/setTimeout pair is cheap — microseconds. So 100 events per second is fine — only one save fires after the storm subsides. The bottleneck would be the *render* cost of updating React state 100 times per second (each one re-renders the form), but that's an upstream concern from the debounce. The debounce itself scales freely.

```
┌─ at 100 events/sec ───────────────────────────────────────┐
│  setTimeout/clearTimeout per event   ~0.001ms × 100 = ok  │
│  React state update per event        more expensive       │
│  bottleneck                         React render, not save │
└───────────────────────────────────────────────────────────┘
```

### The question candidates always dodge

**Q: What happens if the user types `5`, swipes the app away within 200ms, the OS kills the process, the user reopens — is `5` there?**
A: No. The 200ms timer was cleared during unmount cleanup; the value never made it to disk. The user re-types `5` next time. We treat this as an acceptable trade because: (a) workout values are short and re-typable, (b) the alternative (synchronous write on every keystroke) is much worse for battery/disk. If the cost of lost data were higher we'd add an `AppState` background listener that force-fires the timer on `'background'` transition. We haven't added it because nobody's reported the bug; if they did, it'd be a 10-line addition.

```
   Picked (trailing debounce, no save-on-bg)  │   Belt+suspenders (alternative)
   ────────────────────────────────────────── │ ─────────────────────────────────
   ≤500ms data risk on hard close             │   no data risk on background
   simpler                                    │   AppState listener + force-fire
   right for low-cost lost-data scenarios     │   right when even 1 character matters
```

### One-line anchors

- Cleanup is the whole debounce.
- 500ms is the balance between snappy and quiet.
- Refs avoid stale captures inside `setTimeout`.
- The risk is bounded by N — pick N to match the data's value.

---

## Validate your understanding

### Level 1 — Reconstruct the diagram
Sketch the schedule/cleanup/fire cycle. Mark which step makes this a debounce vs. a regular `setTimeout`.

### Level 2 — Explain it out loud
Explain to a frontend engineer who knows debounce but hasn't used `useEffect` for it. Under 90 seconds.

### Level 3 — Apply it to a new scenario
"You're asked to add an 'auto-share progress' feature that sends a snapshot to a friend's app whenever the user updates their stats. Should it use the same debounce pattern? What changes?"

Reference `useExerciseForm.ts` L88.

### Level 4 — Defend the decision you'd change
"Would you ever swap trailing debounce for leading-edge?" Walk through when each is right.

### Quick check — code reference test
- What's the debounce period?
- What file does it live in?
- What ref pattern avoids stale captures?

Then verify.

---
