# Reversed skill tree and simplified daily habits - design

**Date:** 2026-09-15
**Status:** Approved design mockup, pending implementation plan
**Mock reference:** `/Users/rein/.codex/visualizations/2026/09/15/01a0a2bc-6e92-7af0-9089-f7d7d470f4d8/reversed-calisthenics-skill-tree.html`

## Goal

Make the Home screen easier to act on at a glance:

- Show the current beginner skill-tree work first by reversing the calisthenics tree order.
- Keep daily steps and daily plank simple, without progress bars, preset chips, or extra modals.
- Keep the existing Home structure: `THIS WEEK`, `TODAY`, then the skill tree.

This spec updates the earlier daily-habits design. Where this document conflicts with `2026-09-15-daily-habits-design.md`, this document wins.

## Non-goals

- Do not add a separate "Current Work" section above the tree.
- Do not redesign the full Home screen shell.
- Do not add automatic pedometer integration.
- Do not add custom plank duration entry.
- Do not use daily plank to advance push/pull/squat gates.
- Do not change workout session pass/fail logic.

## Home layout

The Home screen order remains:

```text
THIS WEEK
TODAY
  Steps
  Plank
Skill Tree
```

`THIS WEEK` continues to show workout completion plus the small daily habit completion marks.

`TODAY` contains one compact daily habit card with two rows:

```text
Steps   [Goal 8 K] [Log]
Plank   [3] [+]    of 4 sets · 60s    [Log]
```

The daily habit card should match the current app style:

- Dark surface
- Thin borders
- Square-ish corners
- Compact typography
- Existing success color for steps
- Existing primary/accent color for plank

## Steps row

### Display

The steps row contains:

- Steps icon
- `Steps` label
- Inline numeric field labeled `Goal`
- `K` suffix inside or attached to the field
- `Log` button immediately after the field

Example:

```text
[ST] Steps       [Goal 8 K] [Log]
```

### Removed UI

Remove these from the Home steps row:

- Progress bar
- `6.2K / 8K` style progress text
- Preset goal chips such as `1K`, `2K`, `3K`, through `10K`
- Modal opened by the old `Edit` button

### Behavior

The inline field accepts a number in thousands. For example:

- `8` means `8000` steps
- `10` means `10000` steps

Pressing `Log` saves today's steps using the inline value.

Implementation should preserve compatibility with the existing daily habits table by saving:

- `steps_count = inputValue * 1000`
- `steps_goal = inputValue * 1000`

That makes a logged steps row count as complete for `THIS WEEK` and History without needing a separate progress comparison on Home.

If today's steps are already logged, the field should show the saved value divided by 1000.

## Plank row

### Display

The plank row uses a fixed daily target:

- 4 sets
- 60 seconds per set

Example:

```text
[PL] Plank  [3] [+]    of 4 sets · 60s    [Log]
```

The completed set count and plus button sit directly after the `Plank` label. The fixed target text follows them.

### Removed UI

Remove these from the Home plank row:

- Progress bar
- Timer-first `Start` button
- Manual custom seconds entry
- Goal chips such as `30s`, `45s`, `60s`, `90s`
- `Custom`
- Separate `Log` chip row

### Behavior

The plank row is a gated set counter:

1. The user taps `+` after completing a 60-second set.
2. The visible completed set count increases by one.
3. The count cannot exceed `4`.
4. `Log` is disabled until the count reaches `4`.
5. Once the count reaches `4`, `Log` becomes enabled.
6. Pressing `Log` records today's plank as complete.

Implementation should preserve compatibility with the existing daily habits table by saving:

- `plank_seconds = 240`
- `plank_goal_seconds = 240`

This represents `4 sets * 60 seconds`.

If today's plank is already logged, the row should show completion state rather than letting the user keep increasing the count. Recommended display:

```text
Plank  4    of 4 sets · 60s    Done
```

## Skill tree

Reverse the visual level order only.

Current order:

```text
Level 5
Level 4
Level 3
Level 2
Level 1
```

New order:

```text
Level 1
Level 2
Level 3
Level 4
Level 5
```

Do not otherwise redesign the tree. Keep:

- Existing Push / Pull / Squat columns
- Existing category headers
- Existing active workout cards
- Existing locked and passed node styling
- Existing tap behavior for active cards and inactive nodes
- Existing modal for non-active node details

In code terms, this should be a display-order change, not a progression logic change.

## This Week

The `THIS WEEK` strip keeps the existing small habit marks:

- Steps mark is complete when steps are logged for that date.
- Plank mark is complete when the fixed plank target is logged for that date.

Because the simplified Home UI no longer shows progress ratios, the week strip should remain completion-only.

## History

History should continue to record both habits.

Recommended display adjustments:

- Steps can show the logged value, such as `Steps 8K`.
- Plank can show `Plank 4 x 60s` or `Plank complete`.
- Avoid progress-ratio copy such as `45s / 60s`, because the new plank design is set-based and fixed.

Old daily entries should remain readable. If an old entry has non-240 plank seconds, History can still display the actual stored duration.

## Settings

The Home screen no longer needs step preset chips or plank duration presets.

Recommended Settings behavior:

- Keep a default step goal setting if useful; it can prefill the Home inline `Goal` field.
- Remove or ignore the daily plank goal selector for Home, because plank is now fixed at `4 x 60s`.
- Keep `Show daily habits on Home` if already present.

## Error handling

- If daily habit data fails to load, Home should still render `THIS WEEK` and the skill tree.
- Invalid or blank step input should not save. Keep the field visible and show a compact error state.
- Step input should clamp to a reasonable non-negative integer.
- The plank `+` button should never move the count above `4`.
- The plank `Log` button should remain disabled until the count is exactly `4`.

## Accessibility

- The steps input should have an accessible label such as `Daily step goal in thousands`.
- The steps `Log` button should announce the value being logged when possible.
- The plank plus button should have an accessible label such as `Add completed plank set`.
- The plank `Log` button should communicate when it is disabled and why.
- Habit week marks should keep accessible labels for steps and plank completion.

## Acceptance criteria

- Home shows `THIS WEEK`, then simplified `TODAY`, then the reversed skill tree.
- Steps row has no progress bar, no progress text, no preset chips, and no modal.
- Steps row has an inline `Goal` field with `K` suffix followed by `Log`.
- Plank row has no progress bar, no custom duration UI, and no duration chips.
- Plank row uses a fixed `4 sets · 60s` target.
- Plank count increments with `+`, stops at `4`, and gates `Log` until completion.
- Skill tree renders Level 1 first and Level 5 last.
- Push/pull/squat progression logic remains unchanged.
- This Week and History continue to reflect logged steps and plank completion.
