# 3. Frontend engineering

The frontend is Expo Router (file-based routing) over React 19 and React Native 0.83. State is split into three buckets, on purpose:

1. **Server-of-record state** — what's in SQLite. Read through hooks (`useExercises`, `useGameState`) that wrap a context, never read directly inside screens.
2. **Form state** — `useExerciseForm` owns the in-progress workout. Drafts auto-save every 500ms to the `drafts` table; on unmount the draft survives, on save it's cleared.
3. **Ephemeral UI state** — local `useState` in components. Modals, toggles, the camera HUD's countdown — none of it is persisted, none of it is in context.

I deliberately did *not* add Redux, Zustand, or a query library. With three contexts and well-bounded screens, the cost of a state manager exceeded the benefit. If I added a fourth context I'd revisit.

```
Component tree (workout flow)

app/log/[category].tsx
  └── useExerciseForm        ← owns draft, dirty bit, autosave
      ├── ExerciseBlock (×N)
      │     ├── SetRow (×N)
      │     │     ├── Checkbox
      │     │     ├── NumericInput
      │     │     ├── TimerButton    → HoldTimerModal
      │     │     └── CameraButton   → PoseCamera
      │     └── ProgressionGuide (collapsible)
      ├── NotesField
      └── SaveButton            (disabled until ≥1 set checked)

         on save ─▶ insertSession(db) ─▶ evaluate clean
                                          ↓
                                       update gate
                                          ↓
                                    check level-up
                                          ↓
                                     update week
                                          ↓
                                    show ResultScreen
```

## Interview questions

**[mid] How does the per-exercise progress bar update without re-rendering every other exercise?**

> Each `ExerciseBlock` reads its own slice of form state by ID — `form.exercises[exerciseId]` — and the block itself is memoised. When the user checks a set, only that exercise's slice mutates, so React's reconciler only re-renders the affected block. The naive version would have lifted the whole form to a single object and re-rendered every block on every keystroke. I caught that during build because the camera HUD got janky when typing a rep count — that was the symptom. The fix was the per-exercise selector pattern, which is the reason `useExerciseForm` returns `getExercise(id)` rather than spreading the whole form.

**[senior] Why no global state library?**

> I have three pieces of shared state — game state, sync state, exercises — and they have different lifecycles. Game state changes on save and on sync; sync state changes during a sync; exercises change only when Notion pushes new ones. Wrapping them in three contexts is *less* code than wiring them into a store, and the boundaries match the actual data ownership. The cost of Zustand or Redux here is the indirection: every read goes through a selector, every write goes through an action, and the team gets bigger but I'm one person. The benefit only kicks in when the number of cross-cutting concerns exceeds what three contexts can hold cleanly. I'm not there.

**[arch] At 10x the screens, what changes?**

> Two things. First, I'd extract the `useGameState` reducer into a state machine library (xstate or a hand-rolled equivalent) because the current shape — a hook that mutates context — doesn't scale past about 8 transitions before the testing story falls apart. Second, I'd introduce a query layer (React Query or TanStack Query) for the Notion side specifically, because the manual `syncVersion` bump pattern is a poor man's cache invalidation and at 10x screens I'd be reinventing it badly. The local SQLite layer stays as-is — it's a thin enough surface that wrapping it in a query library buys nothing.

## The hard question

**"Why are derived values like `consecutivePasses` stored in a table at all? You said they're computed."**

> Because computing them on every render would re-walk the full session history, and on a phone with two years of data that's a 20ms hit on every screen mount. The table is a *cache* of derived state, not a source of truth. The contract is: any time `sessions` changes, the cache is invalidated and recomputed. The reinstall path proves the cache is disposable — wipe the gates table, replay sessions, get the same answer. If I hadn't been disciplined about the contract, the gates table would have drifted from sessions over time and become its own source of truth by accident. That's the failure mode — it's exactly what `gates.json` was before I deleted it (see `AUDIT.md`'s "RESOLVED" note). The lesson: a derived-state cache is only safe if you have a deterministic, idempotent reconstructor. If you don't have one, you don't have a cache, you have a second database that drifts.
