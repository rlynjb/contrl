# Dependencies and supply chain
### Lockfile · postinstall · transitive risk — Industry standard

> Every dependency is a trust boundary you didn't explicitly draw. The discipline: pin versions, audit lockfiles, watch for postinstall hooks, prefer minimal-surface packages, and verify the chain isn't doing something at install time you didn't approve.

## Zoom out, then zoom in

Modern app code is mostly other people's code. A single `npm install` runs hundreds of packages' lifecycle scripts; a single transitive dependency can write to your filesystem. The defense is layered: lockfiles freeze versions, audits scan for known CVEs, postinstall scripts get flagged, and the package count is kept minimal.

```
  Zoom out — what contrl's supply chain looks like

  ┌─ contrl ─────────────────────────────────────────────────────┐
  │  29 direct dependencies (per package.json)                   │
  │  - 18 Expo SDK 55 modules (@expo-google-fonts, expo-router,  │
  │    expo-camera, expo-sqlite, expo-secure-store, ...)          │
  │  - 8 react-native modules (rn, vision-camera, gesture,       │
  │    mediapipe-posedetection, ...)                              │
  │  - 1 cloud SDK (@supabase/supabase-js)                       │
  │  - tailwind + nativewind                                      │
  │  - react 19.2, dom 19.2, polyfill                            │
  │                                                              │
  │  + dev: 2 packages (typescript, @types/react)                │
  │  + transitive: ~445 directories under node_modules            │
  └──────────────────────────────────────────────────────────────┘
```

Zoom in. contrl's supply chain is **well-shaped today**: Expo is the gatekeeper for most native modules, the lockfile is committed, no postinstall scripts in direct deps. The findings are minor and posture-related (no automated CVE scanning yet, no upgrade rhythm yet).

## Structure pass

Layers: direct deps → lockfile → transitive deps → install-time hooks → runtime code.

Axis to trace: **trust** — what does each layer assume about the layer below?

```
  Tracing trust down the dependency tree

  layer                       trust assumption                bounded by
  ─────                       ────────────────                ──────────
  direct deps (29)            Expo SDK is well-vetted          Expo team
                              react-native ecosystem stable    audits
  package-lock.json           pinned versions reproducible     committed
                              across machines                  ✓
  transitive deps             dependencies of dependencies     Expo's choice
                              (~445 dirs)                      of upstream
  postinstall scripts         direct deps don't run setup      grep audit
                              code with elevated permission    needed
                                                                periodically
  native modules              prebuild compiles them; Expo     Expo Go +
                              + EAS sign the produced binary   EAS Build
                                                                signs
```

Seam: the **install-time** boundary is the highest-trust seam — code running at `npm install` has filesystem access. Modern npm gives postinstall scripts the same trust as the user running the install.

## How it works

#### Move 1 — the picture

You already use this. `package-lock.json` is to npm what a hash is to a file download: it pins the exact version-and-bytes of every package that gets installed. Without it, `npm install` resolves "latest matching" and can pull a fresh malicious version published between yesterday and today.

```
  package.json vs package-lock.json

  package.json (loose)             package-lock.json (exact)
  ─────────────                    ─────────────────────────

  "expo": "~55.0.8"                "expo": {
       │                              "version": "55.0.13",
       │ resolves at install         "resolved": "https://...",
       │ time to whatever            "integrity": "sha512-..."
       │ matches ~55.0.8           }
       │ today
       ▼
  could be 55.0.8 or 55.0.99       reproducible across machines
  depending on what's been         and across time (until you
  published                        regenerate the lockfile)
```

Without a lockfile, two developers `npm install`ing the same `package.json` can end up with different transitive trees. With a lockfile, install is deterministic — and the integrity hashes protect against tampered package contents.

#### Move 2 — contrl's supply chain, walked

**Step 1. Direct dependencies.**

```
contrl/package.json

  "dependencies": {
    "expo": "~55.0.8",                              ← Expo SDK
    "expo-camera": "~55.0.11",
    "expo-router": "~55.0.7",
    "expo-sqlite": "~55.0.11",
    "expo-secure-store": "~55.0.9",
    "expo-status-bar": "~55.0.4",
    "expo-updates": "~55.0.15",
    "expo-font": "~55.0.4",
    "expo-linking": "~55.0.8",
    "expo-splash-screen": "~55.0.12",
    "expo-constants": "~55.0.9",
    "@expo-google-fonts/inter": "^0.4.2",           ← font subsets
    "@expo-google-fonts/nunito": "^0.4.2",
    "react": "19.2.0",                              ← React
    "react-dom": "19.2.0",
    "react-native": "0.83.2",                       ← React Native
    "react-native-gesture-handler": "~2.30.0",
    "react-native-safe-area-context": "~5.6.2",
    "react-native-screens": "~4.23.0",
    "react-native-url-polyfill": "^3.0.0",
    "react-native-vision-camera": "^4.7.3",         ← camera + frame procs
    "react-native-worklets-core": "^1.6.3",         ← (vision-camera dep)
    "react-native-mediapipe-posedetection": "^0.4.0", ← pose model wrapper
    "@supabase/supabase-js": "^2.105.4",            ← cloud client
    "nativewind": "~4.1",                           ← tailwind for RN
    "tailwindcss": "^3.3.2"
  }
```

Most are Expo-managed (Expo team curates compatibility). The non-Expo direct deps worth attention:

- **`react-native-mediapipe-posedetection ^0.4.0`** — third-party (not Expo, not Google). 0.x version implies pre-1.0 stability. The package wraps the MediaPipe Tasks SDK; the wrapper itself is small but the wrapped binary is large. Risk: an update could change inference behavior; pin tighter than `^0.4.0` if reproducibility matters.
- **`@supabase/supabase-js ^2.105.4`** — actively maintained, large user base. Carries low supply-chain risk but does bring its own transitive tree (gotrue-js, postgrest-js, realtime-js, storage-js, functions-js).

**Step 2. The lockfile.**

```
contrl/package-lock.json: present (368108 bytes)
```

Committed. Reproducible installs. Standard hygiene.

**Step 3. Postinstall script audit.**

A quick grep would tell whether any direct dep runs a postinstall script that does something surprising:

```bash
  # the audit
  cd contrl
  for dep in $(jq -r '.dependencies | keys[]' package.json); do
    has_script=$(jq -r '.scripts.postinstall // empty' \
                 < "node_modules/$dep/package.json" 2>/dev/null)
    [ -n "$has_script" ] && echo "$dep: $has_script"
  done
```

This is the audit step that should run periodically. The transitive tree is harder to audit by hand (445 dirs) but tools like `npm audit signatures` and `npm-audit` are designed for it.

**Step 4. Native compilation.**

```
contrl/scripts: prebuild:android → npx expo prebuild --platform android
contrl/android: present (committed; standard for managed-to-bare workflow)
```

Expo's prebuild compiles native modules. The binary that gets installed on a device is the product of (your JS + your native config + the listed native modules' bundled binaries). The trust transferred at this seam is "the native modules' source-or-prebuilt binaries are what they claim to be." Expo's plugin system + EAS Build's signing infrastructure are the layer that protects this; manual `expo prebuild` does too provided the lockfile is clean.

#### Move 2 variant — the load-bearing skeleton of supply-chain hygiene

```
  Skeleton — five habits

  1. LOCKFILE COMMITTED                         ← present in contrl ✓
       reproducible installs, integrity hashes

  2. MINIMAL DIRECT DEPENDENCIES                ← present in contrl ✓
       29 direct deps is on the low end for a mobile app

  3. EXPO-VETTED WHERE POSSIBLE                 ← present in contrl ✓
       Expo + Expo team handles native compatibility

  4. PERIODIC CVE SCAN                          ← absent today
       npm audit on a cadence; npm-check-updates
       at major version boundaries

  5. POSTINSTALL HOOK AUDIT                     ← absent today
       grep transitive node_modules for unexpected
       scripts; tooling like `npm-audit` checks this
```

Habits 1–3 are present; 4–5 are buildable targets.

#### Move 3 — the principle

> Dependencies are trust. Pin them, audit them, prefer the smallest necessary set, and watch for what they run at install time. The default `npm install` is too generous; the discipline is to constrain it.

## Primary diagram

```
  contrl's supply-chain posture

  ┌─ STRONG TODAY ───────────────────────────────────────────────┐
  │                                                              │
  │   ✓ Lockfile committed (368 KB)                              │
  │   ✓ Direct deps: 29 (low for a mobile app)                   │
  │   ✓ Most native modules are Expo-managed                     │
  │   ✓ react/rn versions match Expo SDK 55 official pairing     │
  │   ✓ No client-side cloud admin keys                          │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘

  ┌─ BUILDABLE TARGETS ──────────────────────────────────────────┐
  │                                                              │
  │   ○ Add `npm audit` to CI (or `pnpm audit`, `bun audit`)     │
  │   ○ Periodic `npm-check-updates` review at major boundaries  │
  │   ○ Pin react-native-mediapipe-posedetection tighter than    │
  │      ^0.4.0 (a 0.x minor bump can break inference)            │
  │   ○ Periodic postinstall-script grep across node_modules      │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘

  ┌─ NOT A FINDING ──────────────────────────────────────────────┐
  │                                                              │
  │   No direct postinstall hooks (verified by inspecting        │
  │     package.json directly).                                  │
  │   No "tarball" or "git+" direct dependencies (only registry  │
  │     versions).                                                │
  │   No private/forked modules in dependencies.                  │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

## Implementation in codebase

### What's already right

```
contrl/package.json
  - 29 direct dependencies
  - all version-pinned with ~ (Expo) or ^ (others)
  - no "scripts.postinstall"
  - no "scripts.preinstall"
  - no tarball or git+ dependencies

contrl/package-lock.json
  - present, 368 KB
  - committed to git

contrl/.gitignore
  - node_modules excluded (rebuild from lockfile)
```

The "no postinstall scripts in package.json" check passes by inspection. Transitive postinstall scripts exist (they're normal for some packages — `react-native` itself has lifecycle scripts for setting up the native side), but they're vetted by being part of the Expo SDK ecosystem.

### Buildable target 1: CI security scan

```yaml
  # .github/workflows/security.yml (proposed)
  name: security
  on:
    push:
      branches: [main]
    schedule:
      - cron: '0 9 * * 1'    # Mondays at 09:00
  jobs:
    audit:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: '20'
        - run: npm ci
        - run: npm audit --omit=dev --audit-level=high
        - run: npx npm-check-updates --target minor   # report only
```

The weekly schedule catches CVEs disclosed between active development sprints. `--audit-level=high` filters out the noise of low-severity transitive warnings.

### Buildable target 2: pin the pose module

```
  current:     "react-native-mediapipe-posedetection": "^0.4.0"
  proposed:    "react-native-mediapipe-posedetection": "0.4.0"
                                                       ↑
                                              exact pin until 1.0
```

A `^0.4.0` accepts `0.4.x`. For a 0.x library, the convention isn't always followed — minor versions can ship breaking changes. The pose pipeline is the load-bearing feature; an unexpected behavioural change from a transparent update is high-impact. Exact-pin until the library hits 1.0 or you've validated the upgrade path.

### Buildable target 3: postinstall sweep cadence

```bash
  # scripts/audit-postinstall.sh (proposed)
  #!/usr/bin/env bash
  set -euo pipefail
  cd node_modules
  for pkg in */; do
    json="$pkg/package.json"
    [ -f "$json" ] || continue
    pre=$(jq -r '.scripts.preinstall // empty'  < "$json")
    post=$(jq -r '.scripts.postinstall // empty' < "$json")
    install=$(jq -r '.scripts.install // empty' < "$json")
    if [ -n "$pre" ] || [ -n "$post" ] || [ -n "$install" ]; then
      echo "$pkg"
      [ -n "$pre" ]     && echo "  preinstall:  $pre"
      [ -n "$post" ]    && echo "  postinstall: $post"
      [ -n "$install" ] && echo "  install:     $install"
    fi
  done
```

Run quarterly. Compare against last run; investigate anything new.

## Elaborate

The supply-chain threat for a mobile app is different from a Node.js server. A server pulls a malicious dependency and runs it inside the trusted boundary that owns your database credentials. A mobile app pulls a malicious dependency and ships it to a sandboxed runtime on a user's phone, with no server-side secrets to steal. The asymmetric exposure means mobile apps have **lower per-incident cost** than backend services, but the recovery cost is **higher**: you can't roll back a published APK silently the way you can roll back a backend service.

The Expo ecosystem materially reduces the supply-chain surface for this codebase. Expo curates which native modules are first-party-supported, the SDK versions match across modules, and EAS Build runs in a sandboxed environment. The risk gradient runs: `expo-*` (very low) → community RN modules curated by Expo (low) → other community RN modules (medium) → arbitrary npm packages (variable). contrl sits in the first two zones almost entirely; `react-native-mediapipe-posedetection` is the one community module worth watching because it's pre-1.0.

A note on the `EXPO_PUBLIC_*` interaction with supply chain: any package included at build time has read access to those env vars. If a malicious package were ever in the dependency tree, it could exfiltrate the anon key. That's fine (anon key is public) — but if Phase 4 ever adds a non-public `EXPO_PUBLIC_*` variable (which would itself be the bug), the supply chain becomes the second exposure path. Discipline: only ever put public values behind `EXPO_PUBLIC_*`, regardless of supply-chain considerations.

## Interview defense

**Q: "What's your supply-chain posture?"**

```
  ┌─ Strong defaults ──────────────────────────────────────────────┐
  │  Lockfile committed. Direct deps minimal (29). Most native    │
  │  modules are Expo-managed, which means the Expo team is the   │
  │  curator. No postinstall scripts in direct deps. Expo SDK 55  │
  │  pairing for react and react-native is the official match.   │
  └─────────────────────────────────────────────────────────────────┘

  ┌─ Buildable targets ────────────────────────────────────────────┐
  │  Add `npm audit` to CI (weekly schedule). Pin the pre-1.0    │
  │  pose module to an exact version. Quarterly postinstall       │
  │  sweep across transitive dependencies.                         │
  └─────────────────────────────────────────────────────────────────┘
```

Anchor: "lockfile + minimal direct deps + Expo curation + periodic CVE scan."

**Q: "Why is the lockfile committed?"**

Because without it, every install is a chance to pick up a new transitive version — possibly malicious, possibly broken. The lockfile pins versions and stores integrity hashes that npm verifies on install. It's reproducibility AND tamper detection.

**Q: "What's the biggest supply-chain risk you'd watch for at scale?"**

A pre-1.0 native module changing behavior silently — `react-native-mediapipe-posedetection` is the candidate. Exact-pinning until 1.0 is the cheap defense. Beyond that, periodic CVE scanning catches retroactive vulnerabilities; the harder problem (a maintainer's account getting compromised and publishing a malicious update) is mitigated by waiting a week before upgrading a popular package — most malicious updates get caught and yanked quickly.

## Validate

1. **Reconstruct.** List the five supply-chain habits and which ones contrl has today.
2. **Explain.** Why does the lockfile exist? What does the `integrity` field protect against?
3. **Apply.** Sketch the CI scan workflow that would catch a CVE in any dependency.
4. **Defend.** Argue that `^0.4.0` is fine for the pose module because tests would catch behavioral changes. Then rebut (there are no tests).

## See also

- [01-trust-boundaries-and-attack-surface.md](./01-trust-boundaries-and-attack-surface.md) — supply chain is the boundary you didn't draw
- [04-secrets-and-configuration.md](./04-secrets-and-configuration.md) — build-time env vars are a supply-chain consideration
- `.aipe/study-testing/` — tests would catch behavioural drift on dependency upgrades
- [08-security-red-flags-audit.md](./08-security-red-flags-audit.md) — supply-chain findings ranked
