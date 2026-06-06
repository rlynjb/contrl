# Study — System design (contrl, applied)

Architectural audit of the contrl repo. Two-pass shape per the AUDIT-STYLE generator discipline:

- **Pass 1 — `audit.md`**: the 8-lens walk (system-map, request-response, state-ownership, caching, storage, failure-handling, scale, red-flags). Every repo gets this same shape; the content is per-repo.
- **Pass 2 — discovered-pattern files**: numbered `01-` through `04-`, one per significant architectural pattern this repo actually exercises. Each must pass the load-bearing test (*"if I stripped this pattern out, what architectural capability would the system lose?"*) and the recognition test (a senior engineer scanning the file list should recognize each name as a real pattern).

## Reading order

1. **[00-overview.md](./00-overview.md)** — one-page architecture map. The reader who skims only this file gets the whole system.
2. **[audit.md](./audit.md)** — Pass 1, the 8 lenses across the repo.
3. **Pattern files** (Pass 2):
   - **[01-local-first-canonical-with-cloud-mirror.md](./01-local-first-canonical-with-cloud-mirror.md)** — SQLite is the source of truth; Supabase is a mirror. Defines offline behavior.
   - **[02-on-device-ml-pipeline.md](./02-on-device-ml-pipeline.md)** — MediaPipe + RepCounter FSM; frames never leave the device.
   - **[03-reconstruct-on-reinstall.md](./03-reconstruct-on-reinstall.md)** — rebuild full game state from session history when local DB is empty.
   - **[04-watermark-based-incremental-sync.md](./04-watermark-based-incremental-sync.md)** — per-table `last_pushed_at` in `sync_meta` drives incremental upserts.

## What this guide is and isn't

- **Is:** architecture, boundaries, flows, state ownership, failure-handling shape, and scale tradeoffs in *this* repo's actual code.
- **Isn't:** a tutorial on local-first architecture or RN/Expo. For curriculum, see the foundation guides (`study-runtime-systems`, `study-networking`, `study-database-systems`, `study-dsa-foundations`).
- **Isn't:** reusable DSA learning. That partition moved to `.aipe/study-dsa-foundations/`.
- **Isn't:** code-level design quality. That partition lives in `.aipe/study-software-design/` (different altitude — module/interface/complexity, not service/architecture).

## Cross-links to neighboring guides

- **`.aipe/study-database-systems/`** — SQLite + Supabase engine internals (storage layout, WAL, indexes, MVCC).
- **`.aipe/study-data-modeling/`** — schema shape, normalization, the 9 SQLite tables.
- **`.aipe/study-distributed-systems/`** — sync coordination semantics, partial-failure, delivery guarantees.
- **`.aipe/study-runtime-systems/`** — JS thread vs UI thread vs worklet (the pose pipeline's threading model).
- **`.aipe/study-software-design/`** — APOSD applied to the same code from a module-design angle.
- **`.aipe/study-security/`** — the trust-axis view of the same boundaries this guide walks architecturally.

## Legacy archive note

An earlier combined guide lives at `.aipe/study-system-design-dsa/`. That layout pre-dates the v1.62.0 split. Architecture now belongs here (`.aipe/study-system-design/`); DSA learning belongs in `.aipe/study-dsa-foundations/`. The legacy folder is **not** silently deleted or overwritten — it remains as a frozen archive of the pre-split scoring. If you reach for it for any reason, prefer the partition above; this guide is current.
