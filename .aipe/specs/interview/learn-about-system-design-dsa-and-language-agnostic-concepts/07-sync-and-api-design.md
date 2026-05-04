# 7. Local-first sync and "API design"

I don't have an HTTP API I designed. What I have is a *sync protocol* I designed, on top of Notion's API as a substrate. The substrate isn't mine and isn't a great fit (Notion is a documents API, not a database API), so the design work was in deciding which Notion features to abuse for which purposes:

- Notion *databases* become tables (one per entity).
- Notion *pages* become rows. The page ID is the foreign key.
- Notion *properties* become columns. Type coercion happens in `mapper.ts`.
- *Archived* pages are tombstones (Notion has no real delete).

```
Sync protocol (one full cycle)

   t=0     pull exercises (paginated, batched)
            │  upsert into local exercises by notionPageId
            ▼
   t=1     prune local exercises whose notionPageId is no longer present remotely
            │
            ▼
   t=2     pull sessions (paginated)
            │  for each remote session:
            │     local = find by notionPageId
            │     if !local         → insert
            │     elif remote.updatedAt > local.updatedAt + 2min → overwrite local
            │     elif local.updatedAt > remote.updatedAt + 2min → keep local (will push)
            │     else → keep newer; the 2-min bias breaks ties toward remote
            ▼
   t=3     push local unsynced sessions (notionPageId == null, or updatedAt > lastPushedAt)
            │  Notion returns the new page ID; bind it locally
            ▼
   t=4     process sync_deletions:
            │  for each tombstone: archive in Notion, then delete the tombstone row
            ▼
   t=5     update lastSyncedAt; bump syncVersion
```

The 2-minute remote bias deserves the most attention. Why 2 minutes? Because clock skew between two devices is realistically up to a minute, and edits made within 2 minutes of each other on different devices are *probably* both legitimate user intent and the user wants the more recent one to win. Below that window, "more recent" is unreliable due to skew, so I default to remote — which is the canonical replica visible to the user as the Notion database, the one place they can manually intervene. That's the recovery escape hatch: if the bias picks wrong, the user can fix it in Notion and the next sync respects that edit.

## Interview questions

**[mid] Why pull before push?**

> Two reasons. First, pulling first means a push never overwrites a remote edit the user made on another device — last-edit-wins is computed against the freshest remote state. Second, the prune step on exercises has to happen before any push, because exercises don't push at all (they're one-directional) and the prune is part of normalising local state to the remote source of truth. If push went first I'd be racing the user's intent: their phone's local edit could be uploaded before their iPad's edit was pulled down, and the iPad edit would lose despite being newer.

**[senior] Walk me through how a session created on device A reaches device B.**

> Device A logs the session, `insertSession()` writes it locally with `notionPageId = null`. Next sync on A: pull (no-op for this session, it doesn't exist remotely yet), push — Notion creates a page, returns the ID, A binds it locally. Now device B opens. B's sync pulls; the session is new (B has no local row with that notionPageId), it gets inserted. Both devices now hold the same row with the same notionPageId and updatedAt within ~ms. If B then edits the session, B's `updatedAt` becomes greater; on B's next push the remote is updated. When A next pulls, A sees `remote.updatedAt > local.updatedAt + 2min` (assuming enough time has passed), and overwrites. If A and B edit concurrently, the winner is determined by remote `updatedAt` once both have pushed, and one client will overwrite its own state on the next pull. That's last-edit-wins. The data isn't merged at the field level — the whole session row replaces.

**[arch] Last-edit-wins is famously bad. Defend it or replace it.**

> It's bad in the general case and adequate for this domain. The general case is "two users editing the same document" — there, last-edit-wins silently destroys work. This domain is "one user, occasionally on two devices, editing append-only workout history" — there, the conflict surface is tiny: the user almost never edits the same session on two devices in the same minute. When they do, the lost field is recoverable (they can re-enter it). What I gave up by not using CRDTs or operational transforms: per-field merge. The session as a whole is the unit of conflict, not the individual reps in a set. That trade is fine because sessions are written atomically by the form (one save, all entries together) and editing them after the fact is rare. If this were a collaborative real-time tool — a shared workout plan with two people editing it live — last-edit-wins would be wrong and I'd reach for Yjs or Automerge. For one-user-with-two-devices, it's the right level of complexity.

## The hard question

**"Why isn't there a `version` field for proper optimistic concurrency?"**

> Because Notion doesn't expose one I can trust. Notion gives me `last_edited_time` which I read into `updatedAt`, but I can't write to it; Notion sets it when *I* push, which means my local `updatedAt` (set at the moment of save) drifts from Notion's `updatedAt` (set at the moment Notion processes the push) by the network round-trip. A 2-minute bias is the substitute for a vector clock — coarse but operational on a substrate that doesn't give me primitives. If I owned the backend, I'd add a monotonic version per row and do compare-and-swap on push. On Notion, I can't, so the design is "trust the timestamps with a fudge factor large enough to swallow normal skew." Owning the trade openly is the answer; pretending I'd built something tighter than I had would be dishonest.
