# Sync Rules

Rules for syncing a local database with a remote data store.

## Rule 1: Single Source of Truth for Reference Data

Reference data has ONE source of truth — the remote store.
Every sync replaces all local reference data with the remote copy.

- Delete local → re-insert from remote (full replace, not merge)
- Local never pushes reference data upstream
- Local may cache for offline use but never modifies

## Rule 2: Bidirectional Sync for User-Generated Data

User-generated data syncs both ways.
Conflict resolution: last-edit-wins with a remote bias window.

- Local creates → push to remote on next sync
- Remote creates → pull to local on next sync
- Both edited → remote wins if edits are within the bias window, otherwise latest timestamp wins
- Deletions sync both ways: remote deletion removes local; local deletion archives remote

## Rule 3: Derived State is Computed, Not Synced

State that can be derived from synced data is never synced directly.
It is recomputed from source data on load.

- On reinstall: pull source data from remote, then reconstruct derived state
- Derived state lives only in local storage as a cache
- If derived state is missing or corrupt, recompute — never prompt the user

## Rule 4: IDs Must Be Globally Unique

Use the remote system's native ID as the primary key for remote-sourced records.
Never generate IDs from mutable fields — they cause collisions on rename or duplication.

- Remote-sourced records: use the remote ID directly
- Locally-created records: generate a unique ID, then associate with a remote ID after first push

## Rule 5: Sync Order

1. Pull reference data (full replace)
2. Pull user-generated data (merge with conflict resolution)
3. Push local user-generated data
4. Process deletions
5. Update sync timestamp
