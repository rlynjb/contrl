# Secrets and configuration
### Public credential · client-side secret · environment hygiene — Industry standard

> Two questions per credential: what does it grant, and where is it allowed to live? contrl's secrets posture is mostly clean — the public anon key correctly lives in the bundle; the private service-role key correctly doesn't exist in the client. The unused expo-secure-store and the lack of log scrubbing are the live findings.

## Zoom out, then zoom in

A credential's job is to identify the bearer. The threat model decides where it can live: a credential that grants administrative power must be server-only; a credential that grants public access can ship in the client bundle. The trap is confusing the two.

```
  Zoom out — credential classification in contrl

  ┌─ ALLOWED IN CLIENT BUNDLE ──────────────────────────────────┐
  │                                                              │
  │   ✓ EXPO_PUBLIC_SUPABASE_URL                                │
  │     public project address                                   │
  │                                                              │
  │   ✓ EXPO_PUBLIC_SUPABASE_ANON_KEY                            │
  │     project identifier; gates against RLS                    │
  │     (RLS is the security; the key is not)                    │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘

  ┌─ MUST NOT BE IN BUNDLE (would be a critical bug) ────────────┐
  │                                                              │
  │   ✗ Supabase service_role key                                │
  │     bypasses RLS entirely; only for server-side use          │
  │                                                              │
  │   ✗ Any third-party API key with billing or write power      │
  │     Anthropic key (Phase 4) — must be server-side proxy       │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

Zoom in. Two live findings in contrl: **unused `expo-secure-store`** (dependency listed in `app.json` plugins; never imported by code) and **no PII scrubbing in logs** (Supabase error objects are stringified into `console.warn` calls; if errors ever contain user data, it'll be in the logs).

## Structure pass

Layers: env (`.env`) → config (`src/services/sync/config.ts`) → bundle (compiled JS shipped to users) → runtime (process.env + Supabase client + SecureStore).

Axis to trace: **trust** — what each credential grants, where it lives, who can read it.

```
  Tracing the trust axis across credentials

  credential                  grants                    where it lives
  ──────────                  ──────                    ──────────────
  SUPABASE_URL                project address           .env → bundle
                              (public)                  ✓ correct
  SUPABASE_ANON_KEY           access to RLS-scoped      .env → bundle
                              rows + auth endpoints     ✓ correct
                              (effectively public)
  USER_ID (hardcoded)         row scoping by column     .env or default
                              value (NOT enforced)      ✓ correct for
                                                         Phase 2A
  service_role key            FULL DB ACCESS, bypasses  ★ Supabase
                              RLS, can read all users   dashboard only
                              ✗ must not be in code     ★ never in repo
  Anthropic API key           billed inference          ★ Phase 4: server
                              (Phase 4)                 ★ never in client
  Auth tokens (Phase 4)       per-user identity         expo-secure-store
                              (must be encrypted at     (planned;
                              rest)                     dependency unused
                                                         today)
```

Seam: at the **build-time → bundle** seam, anything prefixed `EXPO_PUBLIC_*` ends up in the shipped JavaScript. Anything not prefixed is left in the build environment and not exposed. The discipline is to never put a private key behind `EXPO_PUBLIC_*`.

## How it works

#### Move 1 — the picture

You already use this with `localStorage` (publicly readable by JS in the same origin) vs cookies marked `HttpOnly` (only sent to the server, never readable by JS). Same primitive: the storage location encodes the trust level.

```
  Storage location encodes trust

  ┌─ public storage ─────────────────────────────────────────────┐
  │  client bundle (EXPO_PUBLIC_…), localStorage, source files,  │
  │  git history, build logs                                     │
  │                                                              │
  │  → anyone with the binary can read this                       │
  │  → only PUBLIC credentials belong here                       │
  └──────────────────────────────────────────────────────────────┘

  ┌─ encrypted on-device storage ────────────────────────────────┐
  │  expo-secure-store (Keychain on iOS, EncryptedSharedPrefs    │
  │  on Android)                                                 │
  │                                                              │
  │  → user-scoped, encrypted at rest                             │
  │  → auth tokens, refresh tokens, sensitive user state          │
  └──────────────────────────────────────────────────────────────┘

  ┌─ server-side only ───────────────────────────────────────────┐
  │  Supabase dashboard, server env vars, Vercel/Fly secret mgr  │
  │                                                              │
  │  → never in code, never in client, never in git              │
  │  → service_role keys, Anthropic billing keys, anything       │
  │    that bypasses authz or costs money                        │
  └──────────────────────────────────────────────────────────────┘
```

The three tiers map directly to credential classes. Misplacing one tier higher (private → public) is the bug.

#### Move 2 — contrl's secrets, walked

**Step 1. The .env file.**

```
  contrl/.env (gitignored)

  EXPO_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
  EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc…                ← long JWT-ish string
  EXPO_PUBLIC_USER_ID=00000000-0000-0000-0000-000000000001
```

```
  contrl/.gitignore

  expo-env.d.ts
  *.key
  .env*.local
  .env                              ← ✓ .env IS gitignored
  .env.local
```

The `.env` is correctly excluded from git. The `.env.example` (also present, not gitignored) documents the shape without containing real values. Standard hygiene.

**Step 2. Build-time inlining via `EXPO_PUBLIC_*`.**

```ts
src/services/sync/config.ts (~lines 1-7)
  export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  export const USER_ID =
    process.env.EXPO_PUBLIC_USER_ID
    || '00000000-0000-0000-0000-000000000001';
                              │
                              ▼
              Expo's build system replaces process.env.EXPO_PUBLIC_*
              with the literal value at build time. The compiled bundle
              contains the string. There is no "lookup at runtime."
              Anyone who extracts the APK can grep for the value.
```

For the anon key, this is by design — the key is a project identifier. For anything else, this would be a critical bug.

**Step 3. Bundle inspection.**

If you `unzip` an Expo-built APK, the JavaScript bundle is plaintext. Grep finds the URL and anon key. That's expected for these credentials. The discipline is "**before adding a new `EXPO_PUBLIC_*` variable, ask whether you'd be okay with that string written on a billboard**." For Supabase anon URL/key, yes. For anything else, no.

**Step 4. The runtime expectation: RLS is the security.**

```
  Once auth + RLS ship (Phase 4), the model is:

  client has:           anon key + JWT
  Supabase enforces:    RLS scopes every row read/write by JWT.sub
  attacker has:         anon key (extracted from bundle)
  attacker can do:      ★ nothing useful without a valid JWT for a user
```

The anon key in the bundle is *fine* — provided RLS is the gatekeeper, not the anon key. Today RLS is not deployed; today the anon key is the only thing protecting cloud rows. That's the cross-link to [02-authentication-and-authorization.md](./02-authentication-and-authorization.md).

#### Move 2 variant — the load-bearing skeleton of "credential hygiene"

```
  Skeleton — three checks per credential

  1. CLASSIFY
       what does this grant? (public access vs scoped access vs
       admin / billing)

  2. PLACE
       where does it live? (bundle vs encrypted-storage vs
       server-only)

  3. VERIFY THE PLACEMENT MATCHES THE CLASSIFICATION
       admin keys never in bundle. public keys never sweated.
       auth tokens never in plain AsyncStorage.

  4. WATCH THE LOGS
       errors and stack traces leak data. error.message from
       Supabase often contains the offending row's content.
       scrub before logging.
```

The Phase 4 expansion adds two new credentials: per-user JWT (tier 2, needs SecureStore) and the Anthropic API key (tier 3, needs a server-side proxy — never in the client at all).

#### Move 3 — the principle

> Match the storage to the threat. Public credentials in the bundle are fine. Private credentials anywhere a user can read them is a critical bug. Encrypted on-device storage exists for in-between credentials (user-scoped tokens). Get the classification right; placement follows.

## Primary diagram

```
  contrl's secrets surface

  ╔═══════════════════════════════════════════════════════════════╗
  ║  Tier 1 — public credentials (in bundle, OK)                   ║
  ╚═══════════════════════════════════════════════════════════════╝

  EXPO_PUBLIC_SUPABASE_URL          → src/services/sync/config.ts
  EXPO_PUBLIC_SUPABASE_ANON_KEY     → src/services/sync/config.ts
  EXPO_PUBLIC_USER_ID (Phase 2A)    → src/services/sync/config.ts

  ╔═══════════════════════════════════════════════════════════════╗
  ║  Tier 2 — encrypted on-device (planned, not used)              ║
  ╚═══════════════════════════════════════════════════════════════╝

  expo-secure-store: listed in app.json plugins, dependency
  installed, but never imported by code today.

  Phase 4 use cases:
    · Supabase auth tokens (access + refresh JWTs)
    · Per-device installation ID (if needed)

  ╔═══════════════════════════════════════════════════════════════╗
  ║  Tier 3 — server-only (must never be in client)                ║
  ╚═══════════════════════════════════════════════════════════════╝

  Supabase service_role key         → Supabase dashboard only
  Anthropic API key (Phase 4)       → server proxy required
                                      (e.g., Supabase Edge Function)

  ╔═══════════════════════════════════════════════════════════════╗
  ║  Log discipline                                                ║
  ╚═══════════════════════════════════════════════════════════════╝

  Today: console.warn(err) in sync error handlers; Supabase
  error objects can include the offending row's content.
  Today's risk: low (no PII beyond exercise progression);
  Phase 4 risk: increases with email/auth state in errors.
```

## Implementation in codebase

### What's set up correctly

```
contrl/.env  (gitignored)
contrl/.env.example  (committed, no real values)
contrl/.gitignore  (.env is on it)
```

```ts
src/services/sync/config.ts (~lines 1-7)
  // Build-time inlined; bundle contains literal values
  export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  export const USER_ID = process.env.EXPO_PUBLIC_USER_ID
    || '00000000-0000-0000-0000-000000000001';
```

The `!` non-null assertion is fine here because Expo's build will fail loudly if `EXPO_PUBLIC_*` vars aren't set — the bundle would have `undefined` literals and you'd notice at first launch.

### Finding 1 — unused `expo-secure-store`

```
app.json (~line 33)
  "plugins": [
    "expo-router",
    ...
    "expo-secure-store",   ← plugin registered
    ...
  ]
```

```
package.json
  "expo-secure-store": "~55.0.9"   ← dependency installed
```

```
grep -r "expo-secure-store" src/   ← zero matches (today)
```

The dependency is in place but unused. That's not a security bug today (no auth tokens to store), but it's a planning signal: when Phase 4 lands, this is where tokens should live. The plumbing is ready; the writing code isn't.

Phase 4 wiring (planned):

```ts
  // src/services/auth/storage.ts (proposed for Phase 4)
  import * as SecureStore from 'expo-secure-store';
  import type { SupportedStorage } from '@supabase/supabase-js';

  export const secureTokenStorage: SupportedStorage = {
    getItem:    (k) => SecureStore.getItemAsync(k),
    setItem:    (k, v) => SecureStore.setItemAsync(k, v),
    removeItem: (k) => SecureStore.deleteItemAsync(k),
  };

  // src/services/sync/client.ts (update for Phase 4)
  export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage: secureTokenStorage },     // ← Keychain / EncryptedSharedPrefs
  });
```

### Finding 2 — log scrubbing

```ts
src/services/sync/supabase-sync.ts (~line 17-25, abstracted)

  function logErr(label: string, error: unknown) {
    console.warn(`[sync] ${label}`, error);
                                    ▲
                                    │
                          ┌─────────┴───────────────────────┐
                          │ Supabase PostgrestError objects │
                          │ include `details`, `hint`,       │
                          │ `message` — and on certain       │
                          │ failure modes, the offending    │
                          │ row's data appears in the       │
                          │ message string.                  │
                          └─────────────────────────────────┘
  }
```

Today's risk is bounded: the model has no PII fields (no email, no name, no phone) and the only user-controlled string is `session.notes`. If a user types something sensitive in notes and the sync fails on that row, the note text could land in the local console (and, if remote logging is added later, in the remote log too).

The fix is small:

```ts
  function logErr(label: string, error: unknown) {
    const safe = sanitizeError(error);
    console.warn(`[sync] ${label}`, safe);
  }

  function sanitizeError(error: unknown): unknown {
    if (!error || typeof error !== 'object') return error;
    const e = error as { code?: string; message?: string; hint?: string };
    // log error code + message, but truncate any embedded row content
    return {
      code: e.code,
      message: truncate(e.message ?? '', 200),    // ← cap length
      // omit details/hint by default; they often contain row data
    };
  }
```

Truncating and dropping `details`/`hint` doesn't lose debugging value — the `code` and the first 200 chars of `message` identify the failure class — and it caps the worst-case leak.

### What's not in scope today

- **Service role key** — never in the codebase. Verified.
- **Anthropic key** — Phase 4 dependency; planned to live behind a server proxy (Supabase Edge Function or similar). Not in the client.
- **expo-constants for secrets** — `expo-constants` is used in the app, but not for secret storage. The one usage (`PoseCamera.tsx` ~line 19) loads a static model filename, not a secret. Verified.

## Elaborate

The mental model that catches most secret-leakage bugs: **classify before you store**. Many secret-leakage bugs come from a developer reaching for "the obvious place to put this string" without first asking "what does this string grant?" The Expo build system makes the classification easy via the `EXPO_PUBLIC_` prefix — public credentials get the prefix, private ones don't. Pair that with discipline: any new env var that ends up in a `src/services/.../config.ts` file should be reviewed for the public/private question before merge.

The unused `expo-secure-store` deserves a note. Dependencies registered but not used are mildly costly (bundle size, supply chain surface) but mostly harmless. The reason it's worth flagging is *intent signaling*: it's there because the author anticipated needing it for auth tokens. That's correct foresight. The follow-through is in Phase 4.

Log discipline is the bit nearly every codebase gets wrong eventually. The pattern is innocent — `console.warn(error)` — and the leak surface grows as the model grows. contrl is well-positioned to fix this *before* the leak surface grows. Add the wrapper now; everywhere using `console.warn(err)` becomes `logErr('context', err)`; the sanitization layer is one place to maintain.

A note on rotation: the anon key can be rotated in the Supabase dashboard. The client picks up the new key on next deploy (rebuild + ship). For the service-role key (which doesn't appear here): same rotation flow, but with zero client deploy required since the client never had it.

## Interview defense

**Q: "How do you handle secrets in this app?"**

```
  ┌─ Three tiers ──────────────────────────────────────────────────┐
  │                                                                 │
  │  Public (in the bundle, by design):                            │
  │    Supabase URL, anon key, hardcoded USER_ID (Phase 2A only).  │
  │    EXPO_PUBLIC_* prefix makes this explicit at build time.     │
  │                                                                 │
  │  Encrypted on-device (planned, not yet used):                  │
  │    expo-secure-store is wired in app.json plugins; Phase 4    │
  │    will store Supabase auth tokens here (Keychain / EncSP).   │
  │                                                                 │
  │  Server-only (never touches the client):                       │
  │    Supabase service_role key. Phase 4 Anthropic API key —      │
  │    must go through a server proxy (Edge Function), never       │
  │    direct from the app.                                        │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "anon key in bundle is correct because RLS is the security, not the key — but RLS has to ship with auth."

**Q: "Why is `expo-secure-store` in the dependencies if you don't use it?"**

It's planning ahead. The Phase 4 auth flow needs encrypted on-device storage for refresh tokens. The plugin is registered in `app.json` (which affects the native build); the dependency is installed; the code that uses it lands when auth lands. Today: no security cost, slight supply-chain cost. Acceptable tradeoff.

**Q: "If the anon key is in the bundle, why isn't that an exposure?"**

Because the anon key identifies the project, not a user. It's the same as the publishable key in a Stripe integration or the API key in a Mapbox SDK — meant to be in clients. What protects per-user data is RLS, which runs in the database and scopes against the JWT's `sub` claim. Without a valid JWT, the anon key gets nothing on a properly-configured Supabase project.

## Validate

1. **Reconstruct.** Draw the three-tier credential map and place each contrl credential.
2. **Explain.** Why is `EXPO_PUBLIC_*` a build-time concept and not a runtime one? What's the implication?
3. **Apply.** Phase 4 adds a Stripe integration for a one-time purchase. Which credential goes where?
4. **Defend.** Argue that putting the Anthropic key behind `EXPO_PUBLIC_*` is fine. Then rebut.

## See also

- [02-authentication-and-authorization.md](./02-authentication-and-authorization.md) — RLS is what makes the anon-key-in-bundle safe
- [05-data-exposure-and-privacy.md](./05-data-exposure-and-privacy.md) — log scrubbing is a privacy concern as well as a secrets one
- [07-llm-and-agent-security.md](./07-llm-and-agent-security.md) — Phase 4 Anthropic key handling
- [08-security-red-flags-audit.md](./08-security-red-flags-audit.md) — log-scrubbing and unused-SecureStore findings ranked
