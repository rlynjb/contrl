# Authentication and authorization
### Authn vs authz · row-level security (RLS) — Industry standard

> Two questions, often confused. Authn: who are you? Authz: what are you allowed to do? contrl answers neither today — single hardcoded `USER_ID`, no JWT, no RLS. That's correct for Phase 2A; it becomes a critical risk the day a second user joins.

## Zoom out, then zoom in

Authn proves identity (login, JWT, session). Authz scopes action (this user, on this row, with this verb). The classic security gap is "authn present, authz assumed" — you logged in, therefore the system assumes you can do whatever. RLS is the row-scoped form of authz: the database itself enforces "user A cannot see user B's rows."

```
  Zoom out — where authn and authz live in contrl

  ┌─ UI layer ────────────────────────────────────┐
  │  no login screen, no session token            │
  │  USER_ID is a hardcoded UUID                  │
  └────────────────────┬──────────────────────────┘
                       │
  ┌─ Service / Sync ───▼──────────────────────────┐
  │  Supabase REST calls use anon key             │ ★ THIS CONCEPT ★
  │  every mutation injects USER_ID as a column   │
  └────────────────────┬──────────────────────────┘
                       │
  ┌─ Storage (Supabase) ▼─────────────────────────┐
  │  RLS policies: ABSENT TODAY                   │
  │  → anon key has full access to all tables     │
  │  → no JWT user_id claim to scope against      │
  └───────────────────────────────────────────────┘
```

Zoom in. contrl ships Phase 2A as a single-user local-first app. The hardcoded `USER_ID` is deliberate: it's the placeholder until auth lands. The risk isn't "they forgot auth." It's "auth must ship together with RLS — never one without the other."

## Structure pass

Layers: UI / Hooks / Sync / Storage (Supabase).

Axis to trace: **trust** — what does each layer assume about who's calling?

```
  Tracing the trust axis up the stack

  layer            assumption about caller        defense
  ─────            ───────────────────────        ───────
  UI               there's one user, always       (none needed yet)
  Hooks            same                            same
  Sync             USER_ID = the hardcoded UUID    hardcoded constant
  Supabase REST    valid anon key = full access   ★ NO RLS
                                                     (load-bearing gap
                                                      once multi-user)
```

Seam: at the **client ↔ Supabase REST** seam today, there's no trust check. Whoever holds the anon key (which is bundled in the APK, visible by extraction) can talk to every row of every table. The defense should be on the server side (RLS); it's not deployed.

## How it works

#### Move 1 — the picture

Authn and authz are two locks. Most apps confuse them: they put a strong lock on the door (authn — you need to be logged in) and assume any locked-in person can open every drawer (authz — no row-level scoping). The classic IDOR (Insecure Direct Object Reference) bug is exactly this confusion.

```
  Two locks, two failure modes

  authn         authz
  ─────         ─────
  ┌──────┐      ┌──────┐
  │ door │      │ each │
  │      │      │ row  │
  └──┬───┘      └──┬───┘
     │             │
     ▼             ▼
  failure:       failure:
  anyone can     logged-in user
  walk in        sees everyone's
  (no login)     data
                 (no row scoping)
```

contrl today has *neither* lock. That's fine because there's only one user; nobody can confuse one for another. The discipline question: when the lock arrives, which one ships first?

Answer: **both, together.** Shipping authn without authz creates a brief window where every logged-in user can read every other user's data. Shipping authz without authn means there's no `user_id` claim to scope against.

#### Move 2 — the path each request takes today

**Today: every Supabase call uses the anon key.**

```
  src/services/sync/client.ts (~13 LOC)

  import { createClient } from '@supabase/supabase-js';
  import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
  export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                                                      ▲
                                                      │
                                          ┌───────────┴──────────────┐
                                          │ anon key — same for all │
                                          │ clients; bundled in app  │
                                          │ as EXPO_PUBLIC_…         │
                                          └──────────────────────────┘
```

```
  src/services/sync/mapper.ts (every *ToRemote function)

  export function sessionToRemote(s: WorkoutSession) {
    return {
      id: s.id,
      user_id: USER_ID,                  ← hardcoded UUID injected
      date: s.date,
      ...
    };
  }
```

Every row is tagged with the same `USER_ID`. From Supabase's perspective, every row "belongs to" that one UUID. Reads aren't filtered server-side; they're returned in full, and the client doesn't ask for filtering either (every `select('*')` would return everything in the table if there were more rows).

**Phase 4 plan: Supabase Auth + JWT + RLS.**

```
  Planned auth flow (Phase 4)

  ┌─ login screen (planned) ──────────────────────────────────┐
  │  supabase.auth.signInWithPassword({ email, password })    │
  │       OR signInWithOtp({ email })                          │
  │       OR signInWithIdToken({ provider: 'apple' })          │
  └────────────────────────┬───────────────────────────────────┘
                           │ returns JWT
  ┌────────────────────────▼───────────────────────────────────┐
  │  supabase client now attaches the JWT to every request    │
  │  JWT contains: { sub: "<user uuid>", ... }                 │
  └────────────────────────┬───────────────────────────────────┘
                           │
  ┌────────────────────────▼───────────────────────────────────┐
  │  Supabase server applies RLS policies                      │
  │  policy: USING (user_id = auth.uid())                      │
  │  → row visible only if user_id matches the JWT sub          │
  │  → write only allowed if user_id matches the JWT sub        │
  └────────────────────────────────────────────────────────────┘
```

The JWT is the **proof of identity** (authn). The RLS policy is the **scoping** (authz). They have to ship together.

#### Move 2 variant — the load-bearing skeleton of "authz-by-RLS"

```
  Skeleton — RLS-enforced authz, three parts

  1. JWT WITH user_id CLAIM
       client authenticates; server issues JWT; client attaches
       JWT to every subsequent request

  2. RLS POLICY ON EVERY TABLE
       USING (user_id = auth.uid())           — read scoping
       WITH CHECK (user_id = auth.uid())      — write scoping
       both required: USING gates SELECT/UPDATE/DELETE row
       visibility; WITH CHECK gates INSERT/UPDATE row creation

  3. CLIENT WRITES NEVER ASSUME SCOPING
       the mapper still injects user_id on writes (defense in
       depth), but RLS is what enforces it server-side
```

Drop #1: there's no `auth.uid()` to scope against; RLS rejects everything.
Drop #2: RLS isn't enforced — anyone with the anon key sees everyone's data. This is contrl's state today.
Drop #3: a bug in the client (forgetting to set `user_id`) silently succeeds in writing to RLS-protected tables, because Supabase fills `user_id` from the JWT if you don't — and that's *fine*, but defense in depth is cheaper than the bug.

The kernel of "RLS-secured authz" is JWT + policies. Skip either and the lock doesn't lock.

#### Move 3 — the principle

> Authn proves identity; authz scopes action. They are independent locks on the same door. Ship them together: a system with authn alone is multi-tenant by default; a system with authz alone has no identity to scope.

The contrl-specific principle: **the day before auth ships, RLS must be deployed.** Not the day after. Not "in the same sprint." Same release — with RLS deployed first so it's in place when the first authenticated request lands.

## Primary diagram

```
  contrl's auth journey: Phase 2A → Phase 4

  ╔══════════════════════════════════════════════════════════════╗
  ║  Phase 2A (today)                                            ║
  ╚══════════════════════════════════════════════════════════════╝

  ┌─ client ─────────────────────────────────────────────────────┐
  │  USER_ID = hardcoded UUID                                    │
  │  anon key in bundle                                          │
  │  every write: { user_id: USER_ID, ... }                      │
  └───────────────────────┬──────────────────────────────────────┘
                          │
                          ▼   no JWT, no scoping
  ┌─ Supabase ───────────────────────────────────────────────────┐
  │  RLS: not deployed                                           │
  │  → anon key has unrestricted access to all rows in all tables│
  │  → bounded by: single user; no PII beyond exercise log       │
  └──────────────────────────────────────────────────────────────┘

  ╔══════════════════════════════════════════════════════════════╗
  ║  Phase 4 (planned)                                           ║
  ╚══════════════════════════════════════════════════════════════╝

  ┌─ client ─────────────────────────────────────────────────────┐
  │  supabase.auth.signIn{...}() → JWT                            │
  │  every request now carries the JWT in Authorization header   │
  │  USER_ID replaced by `(await supabase.auth.getUser()).id`    │
  └───────────────────────┬──────────────────────────────────────┘
                          │ JWT { sub: user.id }
                          ▼
  ┌─ Supabase ───────────────────────────────────────────────────┐
  │  RLS deployed on every table:                                │
  │    USING (user_id = auth.uid())     for SELECT/UPDATE/DELETE │
  │    WITH CHECK (user_id = auth.uid()) for INSERT/UPDATE       │
  │                                                              │
  │  defense in depth: client still injects user_id; RLS is the  │
  │  enforcement                                                  │
  └──────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

### Today (Phase 2A) — single hardcoded user

```ts
src/services/sync/config.ts (~lines 1-7)
  export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  export const USER_ID =
    process.env.EXPO_PUBLIC_USER_ID
    || '00000000-0000-0000-0000-000000000001';
                                              ▲
                                              │
                                  fixed UUID, every table's
                                  user_id column gets this
```

```ts
src/services/sync/mapper.ts (every toRemote function)
  export function userProfileToRemote(u: User) {
    return {
      user_id: USER_ID,                       ← hardcoded
      push_level: u.pushLevel,
      ...
    };
  }
```

What's safe today: the data is one user's, the developer owns the cloud, no PII beyond exercise progression. The "attack" of someone extracting the anon key from the APK and reading all data is bounded by what's in the data — one user's reps, sets, hold times.

What becomes unsafe: any feature that adds a second user (sharing, social, multi-device with multiple users on one device).

### Buildable target: Phase 4 auth + RLS

The shape of the change has four parts, each small:

**1. The auth flow** — single screen, three providers ranked by friction:

```
  Phase 4 — login screen (recommend in order)

  ┌─ first choice: Sign in with Apple / Google ──────────────────┐
  │  supabase.auth.signInWithIdToken({ provider: 'apple', ... }) │
  │  → no password to remember; native iOS / Android pickers     │
  └──────────────────────────────────────────────────────────────┘
  ┌─ second choice: email magic-link (OTP) ──────────────────────┐
  │  supabase.auth.signInWithOtp({ email })                      │
  │  → no password; email-based; some friction                   │
  └──────────────────────────────────────────────────────────────┘
  ┌─ third choice: email + password ─────────────────────────────┐
  │  most friction; password reset surface needed                │
  └──────────────────────────────────────────────────────────────┘
```

**2. The token store** — `expo-secure-store` is already a dependency:

```ts
  // src/services/auth/storage.ts (planned)
  import * as SecureStore from 'expo-secure-store';
  // Supabase JS client supports a custom storage adapter — wire
  // SecureStore so tokens are encrypted at rest (Keychain on iOS,
  // EncryptedSharedPreferences on Android)
```

**3. The `USER_ID` replacement** — pulled from the auth session:

```ts
  // src/services/sync/session.ts (planned)
  export async function currentUserId(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new NotAuthenticatedError();
    return user.id;
  }
```

Every `USER_ID` reference becomes an async call to `currentUserId()` — or, better, the user_id is injected once at sync engine setup and held in memory for the session.

**4. The RLS policies** — one per table, deployed via Supabase migrations:

```sql
  -- per table: enable RLS and define policies
  ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "sessions_user_isolation"
    ON sessions
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

  -- repeat for: user_profile, exercises, gate_progress,
  -- week_progress, drafts, sync_deletions, sync_state, sync_meta
```

This is the load-bearing change. Without it, auth shipping creates a window where every authenticated user can read everyone else's data.

### A second target: exercises as shared catalog (if needed)

Today `exercises` is per-user (each row has a `user_id`). If the catalog is meant to be shared (one list of exercises across all users), the RLS policy is different — a `USING (true)` SELECT policy and a privileged-role-only INSERT/UPDATE/DELETE. Decide before deploying.

## Elaborate

The "authn present, authz assumed" gap is the most common security bug in web/mobile apps that scale to multi-user. The pattern: a developer ships auth, every authenticated request now has a `user_id` claim available, and they assume that knowing who is calling implies the data is scoped to them. It isn't — scoping is a separate layer of work.

Supabase's RLS is the cheapest authz layer that's also robust: it lives in the database, it can't be bypassed by client bugs, and the policy declarations are colocated with the schema. Other systems (a custom REST API, GraphQL with field-level resolvers) require the developer to remember the scoping check on every endpoint. RLS removes that responsibility.

The friction of Supabase auth is real: setting up providers, OTP flows, deep-linking magic-links back into the app, handling token refresh on background-to-foreground transitions. None of that is contrl's problem at Phase 2A — but the planning is. The implementation cost of "auth + RLS" is dominated by the auth UX work, not the RLS work. Plan accordingly: the RLS policies are ~30 lines of SQL; the auth UX is a week.

A note on the JWT-in-bundle question: the anon key is intentionally public. It's not an authn token. It identifies the project, not the user. Once a user logs in, Supabase's client library appends the user's JWT to every request — and that JWT is what RLS scopes against, not the anon key. The anon key without a JWT gets you only the policies that *explicitly* allow anonymous access (which should be zero for a multi-user app).

## Interview defense

**Q: "How does your app handle auth and authorization?"**

```
  ┌─ Today (Phase 2A) ─────────────────────────────────────────────┐
  │  Single user. Hardcoded UUID. No auth layer in the app, no    │
  │  RLS on Supabase. Acceptable because: one user, my cloud, no  │
  │  PII beyond exercise progression.                              │
  └─────────────────────────────────────────────────────────────────┘

  ┌─ Phase 4 plan ─────────────────────────────────────────────────┐
  │  Supabase Auth (Apple/Google sign-in first). Tokens stored in │
  │  expo-secure-store. Every Supabase call carries the JWT.      │
  │                                                                │
  │  RLS policies on every table:                                  │
  │    USING (user_id = auth.uid())                                │
  │    WITH CHECK (user_id = auth.uid())                           │
  │                                                                │
  │  The discipline: RLS deploys BEFORE auth ships, so the day    │
  │  the first user logs in, scoping is enforced.                  │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "authn proves identity; authz scopes action; ship them together with RLS deployed first."

**Q: "What if RLS isn't deployed and you ship auth?"**

Every authenticated user sees every other authenticated user's data. The window between "first multi-user release" and "RLS deployed" is the window where the breach is possible. The discipline is to never have that window — RLS deploys to production *before* the auth-enabled client is released.

**Q: "Why is the anon key acceptable in the bundle?"**

Because it's a project credential, not a user credential. It says "this app can talk to this Supabase project." The user credential is the JWT, obtained after login. RLS scopes against the JWT, not the anon key. The anon key in the bundle is the same as the API key for any public-facing API — it identifies the caller (the app), not the user.

## Validate

1. **Reconstruct.** Draw today's auth-and-authz state and Phase 4's, side by side.
2. **Explain.** What's the difference between authn and authz? Why is "authn present, authz assumed" a common bug?
3. **Apply.** Write the RLS policy for the `sessions` table. What's the difference between `USING` and `WITH CHECK`?
4. **Defend.** Argue that auth could ship before RLS (it's only a brief window). Then rebut.

## See also

- [01-trust-boundaries-and-attack-surface.md](./01-trust-boundaries-and-attack-surface.md) — the cloud boundary that authn/authz defends
- [04-secrets-and-configuration.md](./04-secrets-and-configuration.md) — anon key vs JWT; what's safe to bundle
- [05-data-exposure-and-privacy.md](./05-data-exposure-and-privacy.md) — what data RLS protects (once it's deployed)
- [08-security-red-flags-audit.md](./08-security-red-flags-audit.md) — the RLS gap is the top-ranked finding
