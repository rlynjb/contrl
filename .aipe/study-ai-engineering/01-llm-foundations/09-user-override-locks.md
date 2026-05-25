# User override locks

**Industry name(s):** User override locks, sticky user choices, AI-suggestion override, user-vs-AI conflict resolution
**Type:** Project-specific

> When an LLM-suggested value can be overridden by the user, the override should be sticky — the LLM shouldn't second-guess it on the next call. Without explicit locks, the LLM keeps re-suggesting; users get whiplash from values that "snap back." The mechanism is metadata: alongside each suggestable value, store who last set it (LLM or user). The LLM respects user-set values; the UI surfaces them differently.

**See also:** → [04-agents-and-tool-use/05-agent-memory](../04-agents-and-tool-use/05-agent-memory.md) · → [04-structured-outputs](./04-structured-outputs.md)

---

## Why care

**Move 1.** Your app has an LLM-suggested field — say, exercise name auto-classified from camera input. User taps the suggestion to edit it: "this isn't a push-up, it's a tricep dip." User saves. Next session, same exercise, the LLM classifies it the same way and overrides the user's edit. User gets frustrated. The classifier doesn't know the user already taught it the answer.

**Move 2.** That "the user already corrected this — don't second-guess them" question is what override locks answer. Not whether the LLM should suggest; just: once the user has overridden, does the LLM respect that override on subsequent inferences? Without a locking mechanism, no. With one: yes, the user's correction is sticky until they explicitly want LLM suggestions again.

**Why you need to answer that question at all:** Two failures hide in unlocked LLM suggestions. First, **user trust erosion** — users learn that their corrections don't stick; they stop correcting; they tolerate wrong outputs because the alternative is fighting the LLM every interaction. Second, **invisible training data loss** — corrections from users are signal; if you ignore them on subsequent inferences, you also don't capture them for future model improvement.

**Move 5.** User override locks are what "user-edited" flags are for collaborative editing software — once a user has touched a thing, the system marks it as user-edited and respects the boundary on automated suggestions.

---

## How it works

### Move 1 — The mental model

Picture a database row with one extra column: `set_by`. Each suggestable field has an associated `set_by_<field>` enum: `'llm' | 'user'`. The LLM only writes a field when `set_by_<field>` is `'llm'` (or null). The user can write any field — and doing so updates `set_by_<field>` to `'user'`.

```
  Row before user correction
  
  ┌──────────────────────┬──────────┬───────────────┐
  │ field                │ value    │ set_by         │
  ├──────────────────────┼──────────┼───────────────┤
  │ exercise_name        │ "pushup" │ llm            │
  │ category             │ "push"   │ llm            │
  │ confidence_threshold │ 0.8      │ llm            │
  └──────────────────────┴──────────┴───────────────┘
  
  User corrects exercise_name to "tricep dip":
  
  ┌──────────────────────┬──────────────┬───────────────┐
  │ exercise_name        │ "tricep dip" │ user          │ ◄─ now locked
  │ category             │ "push"       │ llm           │
  │ confidence_threshold │ 0.8          │ llm           │
  └──────────────────────┴──────────────┴───────────────┘
  
  Next LLM inference: skips exercise_name (set_by=user), still suggests category/threshold.
```

Strategy in plain English: **store who set each field; LLM only writes LLM-set or empty fields; user actions promote fields to user-set; user can explicitly unlock.**

---

### Move 2 — The layered walkthrough

#### Schema with override locks

```ts
type ExerciseLog = {
  exercise_name: string;
  exercise_name_set_by: 'llm' | 'user';
  category: 'push' | 'pull' | 'squat' | 'other';
  category_set_by: 'llm' | 'user';
  reps: number;
  reps_set_by: 'llm' | 'user';
  // ...
};
```

Pattern: every LLM-suggestable field has a parallel `_set_by` field tracking who last touched it.

For sparse data (most fields rarely overridden), an alternative shape: a single `user_overrides: string[]` field listing which fields were overridden. Same logic, less SQL noise.

---

#### LLM-write discipline

When the LLM runs on a record:

```ts
function applyLLMSuggestions(record: Record, suggestions: Suggestions) {
  for (const field in suggestions) {
    if (record[`${field}_set_by`] === 'user') continue;  // respect lock
    record[field] = suggestions[field];
    record[`${field}_set_by`] = 'llm';
  }
}
```

The LLM never overwrites user-set fields. Always.

---

#### User-write discipline

When the user edits a field:

```ts
function applyUserEdit(record: Record, field: string, value: any) {
  record[field] = value;
  record[`${field}_set_by`] = 'user';
}
```

User edits promote `set_by` to `'user'`, locking the field from future LLM writes.

---

#### Unlocking (user-initiated)

Sometimes the user wants the LLM to suggest again — maybe they changed their mind, or they want to see what the current LLM thinks. The UI surfaces an "ask LLM" or "unlock" affordance:

```ts
function unlockField(record: Record, field: string) {
  record[`${field}_set_by`] = null;  // or 'llm', depending on convention
  // Next LLM run will populate this field again.
}
```

Important: unlocking should be deliberate, not accidental. UI patterns: an explicit "let LLM suggest again" button per field; or a "reset all to AI suggestions" action that asks for confirmation.

---

#### UI signaling

Different visual treatment for LLM-set vs user-set fields:

- **LLM-set**: subtle visual indicator (small icon, faded background) — communicates "this was AI-suggested, you can change it."
- **User-set**: full opacity, no indicator — communicates "you set this, it's your value."

The visual distinction matters for trust. Users learn to spot "AI suggested this; I can edit" vs "I already set this."

---

#### Bulk patterns

For workflows with many fields per record: the `user_overrides` array pattern is cleaner than dozens of `_set_by` columns.

```ts
type Record = {
  // ... actual fields ...
  user_overrides: string[];  // field names that user has set
};

function hasUserOverride(record: Record, field: string): boolean {
  return record.user_overrides.includes(field);
}
```

Same logic; less schema noise; easier to query "which records have any user override."

---

### Move 3 — The principle

LLM suggestions are valuable when they reduce user effort; harmful when they override user effort. The discipline is making the boundary explicit in data: who set each value, the LLM or the user. The LLM respects user-set boundaries; the UI surfaces them differently. Without this, user corrections feel ephemeral and trust erodes.

---

## User override locks — diagram

```
┌─ Record schema with set_by tracking ─────────────────────────────────────────┐
│                                                                              │
│   field           value          set_by                                      │
│   ─────────────   ──────────     ─────────                                   │
│   exercise_name   "tricep dip"   user      ◄─ locked from LLM writes         │
│   category        "push"         llm       ◄─ LLM can update                 │
│   reps            10             user      ◄─ locked from LLM writes         │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │ LLM runs inference
                                      ▼
┌─ LLM-write discipline ───────────────────────────────────────────────────────┐
│                                                                              │
│   For each suggested field:                                                  │
│     if set_by == 'user':  skip                                              │
│     else:                  write value, set set_by = 'llm'                   │
│                                                                              │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─ User edits ─────────────────────────────────────────────────────────────────┐
│                                                                              │
│   User taps to edit a field:                                                 │
│     write value, set set_by = 'user'                                         │
│                                                                              │
│   User can explicitly "unlock" via UI affordance:                            │
│     set_by = null                                                            │
│     LLM will suggest again on next run                                       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## In this codebase

**Case B — contrl doesn't currently have LLM-suggested fields.**

contrl's user-facing fields (exercise category, level, sets/reps) are user-entered or system-computed (from the pose camera). The coaching agent (Phase 4 Path C, planned) produces a coaching message — a one-shot output, not a persistent field the user might override.

The discipline could apply if contrl adds:
- **LLM-suggested exercise names** (auto-classified from camera or from the user's natural-language description).
- **LLM-suggested progression decisions** (instead of the rule-based recommender).
- **LLM-suggested coaching that becomes editable** (user can rewrite the coaching; LLM doesn't re-suggest on subsequent sessions).

For now: study material.

**If/when added, planned implementation paths:**
- Schema: `_set_by` columns or `user_overrides: string[]` array.
- UI: visual differentiation between LLM-suggested and user-set fields.
- LLM write path: respects locks at the data layer, not in the prompt.

---

## Elaborate

**Where this pattern comes from.** Collaborative editing software (Google Docs, Notion) has long had "user-touched" markers to prevent automatic updates from overwriting user edits. The pattern crystallized for LLM-suggested fields 2023+ as products with AI-suggested values shipped and users complained about whiplash.

**The deeper principle.** Trust requires respect for user actions. Any system that has both automatic suggestions AND user editing needs explicit boundary tracking. The LLM/AI specific case is more visible because AI suggestions feel more agentic — but the principle generalizes to any auto-fill, smart-default, or recommendation system.

**Where this breaks down.** Two places.

1. **Pure suggestion UIs (no persistence).** A search-autocomplete suggestion doesn't need a lock because there's no "user override" — the user types what they want; suggestions are ephemeral.
2. **Fields where stale corrections are problematic.** Sometimes the user corrected last month based on outdated context; today's LLM would be right. The pattern: provide an explicit "refresh from AI" affordance per field, so corrections aren't infinitely sticky.

**What to explore next.**
- [04-agents-and-tool-use/05-agent-memory](../04-agents-and-tool-use/05-agent-memory.md) — user-locked values become part of the agent's persistent context.
- [04-structured-outputs](./04-structured-outputs.md) — the structured-output schema can include `set_by` fields directly.

---

## Tradeoffs

| Cost dimension | Override locks | No locks |
|---|---|---|
| Schema complexity | Higher (extra fields per suggestable column) | Lower |
| User trust | High (corrections stick) | Low (corrections vanish) |
| Engineering effort | Real (LLM-write path respects locks; UI differentiates) | Zero |
| User-initiated unlock | Required UI affordance | N/A |
| Edge cases | Stale corrections (user changed mind months ago) | None of this kind |

### Sub-block 1 — what we gave up

Schema complexity (`_set_by` columns or override arrays) and engineering effort to respect locks in the LLM-write path. Plus UI work to visually differentiate LLM-set vs user-set fields. For a system with many suggestable fields, this is real ongoing cost.

### Sub-block 2 — what no locks would cost

Documented: user corrects an LLM suggestion; the LLM overrides on the next inference; user notices; user stops trusting the AI suggestions; conversion or retention drops. The cost of unlocked AI suggestions is user trust, which is hard to recover.

### Sub-block 3 — the breakpoint

Override locks are the right call until: (a) suggestions are ephemeral (no persistence, no override possible); (b) users don't expect to edit (read-only UI); (c) the system is so small that corrections can be handled manually. For any LLM-fronted UI with editable persistent fields, locks matter.

### Sub-block 4 — what wasn't actually a tradeoff

"Users won't notice if we override their edits." They will. Even non-power-users notice "I changed this and it snapped back."

---

## Tech reference (industry pairing)

### Schema patterns (`_set_by` columns)

- **Codebase uses:** Not yet — contrl doesn't currently have suggestable fields.
- **Why it's here:** the schema pattern for tracking authorship.
- **Leading today:** application-specific; no canonical library.

### UI affordances (Notion-style edit indicators)

- **Codebase uses:** Not yet.
- **Why it's here:** the user-facing pattern that surfaces LLM-vs-user provenance.
- **Leading today:** Notion's "AI-generated content" markers — `innovation-leading` for content-provenance UIs, 2026.

---

## Project exercises

(For contrl: not applicable currently. If contrl adds LLM-suggested editable fields later, the exercise becomes:)

### [hypothetical] Add override-lock discipline to LLM-suggested fields

- **What to build:** For any LLM-suggested editable field, add `_set_by` tracking. Update LLM write path to respect user-set locks. Add UI affordance to distinguish provenance.
- **Done when:** synthetic user edit + subsequent LLM run leaves the field untouched; user can explicitly "let LLM re-suggest" via UI.
- **Estimated effort:** depends on field count; ~1-2 days for moderate complexity.

---

## Summary

User override locks are the discipline of respecting user corrections in the data model. Each LLM-suggestable field stores who last set it (`'llm' | 'user'`). The LLM only writes LLM-set or null fields; user actions promote fields to user-set; the UI surfaces provenance. Without locks, user corrections feel ephemeral and trust erodes. For contrl: not currently applicable; study material for future LLM-suggested editable fields.

**Key points:**

- **Each suggestable field has a `_set_by` tracker** (or use a single `user_overrides: string[]` array).
- **LLM-write path respects locks.** Never overwrites user-set values.
- **User edits promote to user-set.** Locks the field automatically.
- **Explicit unlock UI** when the user wants AI suggestions again.
- **UI differentiates provenance** — LLM-set vs user-set fields look different.

---

## Interview defense

**[mid] Why need user override locks?**

Because if the LLM keeps suggesting the same value the user just corrected, users feel like their edits don't matter. They stop correcting; trust erodes. The fix: track who set each field; LLM respects user-set fields.

**[senior] How would you design the schema?**

Per-field `_set_by` column (`'llm' | 'user' | null`), OR a single `user_overrides: string[]` array. The first is heavier in schema but cleaner per-field; the second is lighter but requires array membership checks. Choose based on field count and query patterns.

---

## One-line anchors

- "Track who set each field. LLM respects user-set values."
- "User edits auto-lock the field."
- "Explicit unlock UI for when user wants AI to re-suggest."
- "Without locks, user corrections feel ephemeral. Trust erodes."
- "For contrl: not applicable today; study material for future."

---

## Validate

**Level 1:** Draw the LLM-write decision tree.
**Level 2:** "Why use override locks?" Under 30 seconds.
**Level 3:** A teammate's AI-suggestion feature has users complaining that "my edits don't stick." Walk through the fix.
**Level 4:** Defend the schema overhead at moderate feature complexity (10+ suggestable fields).

**Quick check:**
- What's the core schema addition? (`_set_by` field per suggestable column, or `user_overrides` array.)
- Does the LLM ever overwrite a user-set field? (No.)
- Does contrl need this today? (No.)
