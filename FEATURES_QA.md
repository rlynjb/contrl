# CalisthenIQ (Contrl) — QA Feature List

**Application:** CalisthenIQ (branded "contrl")
**Type:** Mobile-first web app
**Description:** Calisthenics workout tracker with progressive skill tree, exercise logging, and weekly progress visualization.
**Tech Stack:** Next.js 14 (React/TypeScript), Netlify Functions (serverless backend), Netlify Blobs (storage), MSW (dev mocking)
**User Roles:** Single user type (no authentication)

---

## Testable Features

| # | Module | Feature | Description | User Role | Priority | Category |
|---|--------|---------|-------------|-----------|----------|----------|
| **Navigation & Routing** | | | | | | |
| 1 | Routing | Single page load | App loads dashboard at `/` with Weekly Tracker + Skill Tree | All | Critical | Functional |
| 2 | Routing | 404 handling | Non-existent routes display Next.js default 404 | All | Low | Functional |
| 3 | Routing | Deep link to `/` | Direct URL access loads full app state | All | Medium | Functional |
| **Loading & Error States** | | | | | | |
| 4 | Dashboard | Loading state | "Loading..." shown while fetching user data and exercise levels | All | Critical | UI/UX |
| 5 | Dashboard | Error state | Error message with "Retry" button when data fetch fails | All | Critical | Functional |
| 6 | Dashboard | Retry action | Clicking retry re-fetches all data and clears error | All | High | Functional |
| 7 | Dashboard | Silent workoutLevels failure | If `/exercises/levels` fails, SkillTree renders empty with no error message | All | High | Functional |
| **Weekly Tracker** | | | | | | |
| 8 | Weekly Tracker | Week display | Shows 7-day grid (Sun–Sat) with day abbreviations | All | High | UI/UX |
| 9 | Weekly Tracker | Date numbers | Displays calendar date number below each day label | All | Medium | UI/UX |
| 10 | Weekly Tracker | Today highlight | Today's column has brighter label color and distinct background | All | Medium | UI/UX |
| 11 | Weekly Tracker | Workout day count | Header shows "X/7 days" with workout count for the week | All | Medium | Functional |
| 12 | Weekly Tracker | Category dots | Colored dots appear on days with workouts (Push: orange, Pull: cyan, Squat: purple) | All | High | UI/UX |
| 13 | Weekly Tracker | Multi-category dots | Days with multiple categories show multiple colored dots | All | Medium | Functional |
| 14 | Weekly Tracker | Rest day indicator | Past days without workouts show solid gray dot | All | Low | UI/UX |
| 15 | Weekly Tracker | Future day indicator | Future days show dashed outline dot | All | Low | UI/UX |
| 16 | Weekly Tracker | Week boundary | Week resets Sun–Sat; workouts from previous weeks not shown in tracker | All | Medium | Functional |
| **Skill Tree — Tabs & Header** | | | | | | |
| 17 | Skill Tree | Category tabs | Three tabs (Push/Pull/Squat) switch exercise view | All | Critical | Functional |
| 18 | Skill Tree | Active tab styling | Selected tab shows category color border, background, and text | All | Medium | UI/UX |
| 19 | Skill Tree | Tab level display | Each tab shows "lvl N" with user's current level for that category | All | Medium | UI/UX |
| 20 | Skill Tree | Level badges | Header shows PUSH/PULL/SQUAT badges with current level numbers | All | Medium | UI/UX |
| 21 | Skill Tree | Progress ring | Circular SVG indicator showing overall completion percentage | All | Medium | UI/UX |
| 22 | Skill Tree | Category progress bar | "[CATEGORY] PROGRESS X/Y" with visual fill bar | All | Medium | UI/UX |
| 23 | Skill Tree | Tab switching clears open card | Switching tabs closes any expanded skill card | All | Medium | UI/UX |
| **Skill Tree — Level Groups** | | | | | | |
| 24 | Skill Tree | Level timeline | 5 levels displayed vertically (Beginner → Expert) with connecting line | All | High | UI/UX |
| 25 | Skill Tree | Level markers | Numbered circles on timeline; filled with color when exercises done at that level | All | Medium | UI/UX |
| 26 | Skill Tree | Level headers | Show "LEVEL N — Name" with exercise count (X/Y) | All | High | UI/UX |
| 27 | Skill Tree | Collapse/expand levels | Click level header to toggle visibility of exercises | All | High | Functional |
| 28 | Skill Tree | Level clear badge | "✓ CLEAR" shown when all exercises at a level are completed | All | Medium | UI/UX |
| 29 | Skill Tree | Progression notes | Coach notes displayed below level header when available | All | Low | UI/UX |
| 30 | Skill Tree | Mastery marker | Star icon at bottom of timeline with "MASTERY" label | All | Low | UI/UX |
| **Skill Card — Collapsed State** | | | | | | |
| 31 | Skill Card | Exercise display | Shows exercise name, set summary (e.g. "3×8"), status dot | All | Critical | UI/UX |
| 32 | Skill Card | Locked state | Dimmed card with lock icon for levels not yet reached; not tappable | All | High | Functional |
| 33 | Skill Card | Completed indicator | Colored checkmark circle on fully completed exercises | All | Medium | UI/UX |
| 34 | Skill Card | Chevron indicator | Down arrow shown on expandable, incomplete exercises | All | Low | UI/UX |
| **Skill Card — Expanded State** | | | | | | |
| 35 | Skill Card | Expand/collapse | Tap unlocked card to toggle detailed editor | All | Critical | Functional |
| 36 | Skill Card | Set checkboxes | Check/uncheck individual sets to mark complete | All | Critical | Functional |
| 37 | Skill Card | Set count display | Shows "X/Y Sets" updating as sets are checked | All | High | UI/UX |
| 38 | Skill Card | Set value inputs | Editable text inputs for reps or duration per set | All | Critical | Functional |
| 39 | Skill Card | Set target labels | "Goal: N" displayed below each set input | All | Medium | UI/UX |
| 40 | Skill Card | Pre-fill from history | Set inputs pre-filled from latest previous workout when not tracked today | All | High | Functional |
| 41 | Skill Card | Pre-fill from today | Set inputs show today's saved values when exercise is already tracked | All | High | Functional |
| 42 | Skill Card | Tempo input | Free-text input for tempo (e.g. "2-0-1-0") | All | Medium | Functional |
| 43 | Skill Card | Rest input | Free-text input for rest period (e.g. "60s") | All | Medium | Functional |
| 44 | Skill Card | Completed badge | "◇ COMPLETED ◇" label in category color on finished exercises | All | Low | UI/UX |
| **Exercise History** | | | | | | |
| 45 | History | Previous section | "PREVIOUS" section showing last 3 attempts (excluding today) | All | High | Functional |
| 46 | History | History dates | Formatted date (e.g. "Feb 20") for each past attempt | All | Medium | UI/UX |
| 47 | History | History sets | Sets summary (e.g. "3×8,8,6") for each attempt | All | Medium | UI/UX |
| 48 | History | History completion | Checkmark or dash indicating whether exercise was completed | All | Medium | UI/UX |
| 49 | History | No history state | History section hidden when exercise has no previous attempts | All | Medium | UI/UX |
| 50 | History | Date sorting | Entries sorted by date descending (most recent first) | All | Medium | Functional |
| **Data Persistence & Save** | | | | | | |
| 51 | Save | Auto-save on blur | Changes save automatically 600ms after leaving an input field | All | Critical | Functional |
| 52 | Save | Debounced batching | Rapid edits within 600ms are batched into single API call | All | High | Performance |
| 53 | Save | Optimistic UI | UI updates instantly before server confirms | All | High | UI/UX |
| 54 | Save | Save status: saving | "Saving..." indicator in blue during API request | All | Medium | UI/UX |
| 55 | Save | Save status: saved | "Saved" indicator in green, auto-hides after 2 seconds | All | Medium | UI/UX |
| 56 | Save | Save status: error | "Failed to save" in red; triggers full data re-sync | All | High | Functional |
| 57 | Save | Write queue serialization | Concurrent mutations are serialized (promise-based mutex) | All | High | Performance |
| 58 | Save | Insert new exercise | Checking a set on untracked exercise creates new session entry | All | High | Functional |
| 59 | Save | Insert with category | New session entry includes exercise category in session categories | All | Medium | Functional |
| 60 | Save | Create new session | If no session exists for today, one is created on first exercise save | All | High | Functional |
| **Forms & Input Validation** | | | | | | |
| 61 | Validation | Numeric set input | Set inputs accept any string; parsed via `parseInt` (no validation) | All | High | Functional |
| 62 | Validation | Negative number in sets | Input "-5" parsed as `{ reps: -5 }` — no rejection | All | Medium | Functional |
| 63 | Validation | NaN in sets | Input "abc" parsed as `{ reps: 0 }` — silent coercion | All | Medium | Functional |
| 64 | Validation | Duration suffix | Input ending in "s" parsed as duration (e.g. "60s" → `{ duration: 60 }`) | All | Medium | Functional |
| 65 | Validation | Empty set value | Empty string parsed as `{ reps: 0 }` | All | Low | Functional |
| 66 | Validation | Rest value parsing | Rest input parsed with `parseInt`; "120x" → 120, "abc" → NaN → undefined | All | Medium | Functional |
| 67 | Validation | Tempo format | No format validation on tempo (any string accepted) | All | Low | Functional |
| 68 | Validation | Exercise name length | No max length validation on exercise names (API accepts any length) | All | Low | Functional |
| **API Endpoints — User Data** | | | | | | |
| 69 | API | GET /user/data | Returns user data with weekly progress, filtered to current week | All | Critical | Integration |
| 70 | API | PUT /user/data | Accepts full user data object; no schema validation on body | All | Critical | Integration |
| 71 | API | GET /user/levels | Returns current levels per category | All | High | Integration |
| 72 | API | PUT /user/levels | Updates single category level; validates category exists and level is number | All | High | Integration |
| 73 | API | Level value range | No validation that level is 1–5; accepts 0, -1, 999, etc. | All | Medium | Integration |
| 74 | API | Invalid category in level update | Accepts arbitrary category strings (e.g. "InvalidCat") | All | Medium | Integration |
| **API Endpoints — Exercises** | | | | | | |
| 75 | API | GET /exercises/levels | Returns all exercises organized by difficulty level | All | Critical | Integration |
| 76 | API | GET /exercises | Filtered by optional level/category query params | All | Medium | Integration |
| 77 | API | GET /exercises/search | Search by name or tags via `q` param; empty query returns [] | All | Low | Integration |
| 78 | API | GET /exercises/level | Lookup exercise level by name; returns 404 if not found | All | Low | Integration |
| 79 | API | POST /exercises | Creates exercise; only validates name exists | All | Low | Integration |
| **API Endpoints — Utility** | | | | | | |
| 80 | API | GET /health | Returns `{ status: 'ok' }` | All | Low | Integration |
| 81 | API | POST /seed | Initializes blob storage with exercise data; no auth required | All | Medium | Security |
| 82 | API | GET /export | Exports all data as JSON; no auth required | All | Medium | Security |
| 83 | API | POST /import | Imports JSON data; validates `{ data }` structure; no auth | All | Medium | Security |
| 84 | API | Method validation | All endpoints return 405 for unsupported HTTP methods | All | Medium | Integration |
| 85 | API | Error responses | All endpoints return structured error JSON with 400/404/500 codes | All | Medium | Integration |
| **Security** | | | | | | |
| 86 | Security | No authentication | All endpoints are publicly accessible (no auth layer) | All | High | Security |
| 87 | Security | No CSRF protection | State-changing endpoints accept any origin | All | Medium | Security |
| 88 | Security | No rate limiting | All endpoints can be called unlimited times | All | Medium | Security |
| 89 | Security | XSS in exercise names | Exercise names rendered in DOM without sanitization (React auto-escapes JSX) | All | Low | Security |
| 90 | Security | Seed endpoint exposure | POST /seed can reset all data; no auth protection | All | High | Security |
| 91 | Security | Export endpoint exposure | GET /export exposes all user data without auth | All | High | Security |
| 92 | Security | Import endpoint exposure | POST /import can overwrite all data without auth | All | High | Security |
| 93 | Security | Blob storage limits | No size validation on data written to Netlify Blobs | All | Low | Security |
| **Performance** | | | | | | |
| 94 | Performance | Initial load time | Full page load including user data + exercise levels fetch | All | High | Performance |
| 95 | Performance | Debounce efficiency | 600ms debounce prevents excessive API calls during rapid editing | All | Medium | Performance |
| 96 | Performance | Optimistic update speed | UI updates before API round-trip completes | All | Medium | Performance |
| 97 | Performance | Large weeklyProgress | App handles many weeks of history data without degradation | All | Medium | Performance |
| 98 | Performance | Exercise list rendering | ~15 exercises per category rendered without jank | All | Medium | Performance |
| 99 | Performance | API timeout | Client-side 10s timeout on all fetch requests (AbortController) | All | Medium | Performance |
| 100 | Performance | No pagination | All exercises and history loaded at once (no lazy loading) | All | Low | Performance |
| **Accessibility** | | | | | | |
| 101 | A11y | ARIA labels on set inputs | Set inputs have aria-label "Set N reps" | All | Medium | Accessibility |
| 102 | A11y | ARIA labels on checkboxes | Set checkboxes have aria-label describing action | All | Medium | Accessibility |
| 103 | A11y | Save status live region | Save indicator has `role="status"` and `aria-live="polite"` | All | Medium | Accessibility |
| 104 | A11y | Keyboard navigation | Tab through interactive elements (tabs, cards, inputs, checkboxes) | All | High | Accessibility |
| 105 | A11y | Focus indicators | No visible `:focus-visible` styles on buttons and tabs | All | High | Accessibility |
| 106 | A11y | Color-only indicators | Weekly tracker dots rely solely on color (no patterns for colorblind users) | All | Medium | Accessibility |
| 107 | A11y | Text contrast (labels) | `#4a4a5a` on `#08080f` = ~3.5:1 ratio (fails WCAG AA 4.5:1 for small text) | All | Medium | Accessibility |
| 108 | A11y | Text contrast (active) | Category colors on dark bg meet contrast requirements | All | Low | Accessibility |
| 109 | A11y | Screen reader: exercise status | Locked/completed/open states communicated via text, not just visual | All | Medium | Accessibility |
| 110 | A11y | Touch targets | Small dot areas (36×36px) meet minimum touch target (44×44 recommended) | All | Low | Accessibility |
| **Responsiveness & Cross-Browser** | | | | | | |
| 111 | Responsive | Mobile layout (320–480px) | App constrained to max-width 480px, centered on larger screens | All | High | UI/UX |
| 112 | Responsive | No media queries | Layout is fixed mobile-only; no tablet/desktop adaptations | All | Low | UI/UX |
| 113 | Responsive | Weekly tracker grid | 7-column grid fits on 320px screens (each column ~40px) | All | Medium | UI/UX |
| 114 | Responsive | Long exercise names | Names wrap to multiple lines within card (no overflow) | All | Medium | UI/UX |
| 115 | Responsive | iOS scroll behavior | `overflow-x: hidden` prevents rubber-band horizontal scroll | All | Medium | UI/UX |
| 116 | Cross-browser | Chrome/Safari/Firefox | Custom CSS (no vendor-specific features except `-webkit-tap-highlight-color`) | All | Medium | UI/UX |
| 117 | Cross-browser | Scrollbar hiding | `::-webkit-scrollbar { width: 0 }` — WebKit only, Firefox shows scrollbar | All | Low | UI/UX |
| **State Management Edge Cases** | | | | | | |
| 118 | State | Rapid multi-exercise edits | Only last exercise edit persists if 2+ exercises edited within 600ms (single pendingRef) | All | High | Functional |
| 119 | State | Midnight rollover | If app open past midnight, "today" references stale date until refresh | All | Medium | Functional |
| 120 | State | Concurrent tab edits | Two browser tabs editing same data — last write wins, no merge | All | Medium | Functional |
| 121 | State | refreshAll during save | If refreshAll called while save pending, save may be overwritten by stale server data | All | Low | Functional |
| 122 | State | Empty exercises array | Day with empty exercises array: `isWorkoutDay` becomes false, dots disappear | All | Low | Functional |
| **MSW / Dev Mode** | | | | | | |
| 123 | MSW | Mock enablement | MSW only active when `NEXT_PUBLIC_MSW_ENABLED=true` and `NODE_ENV=development` | Dev | Medium | Integration |
| 124 | MSW | Handler coverage | All GET/PUT endpoints mocked; POST /exercises doesn't persist | Dev | Medium | Integration |
| 125 | MSW | No error simulation | MSW handlers always succeed; cannot test error paths in dev mode | Dev | Medium | Integration |
| 126 | MSW | No latency simulation | All mock responses instant; real API has 100–500ms latency | Dev | Low | Integration |
| 127 | MSW | Provider blank screen | MSWProvider renders `null` while initializing (brief blank flash) | Dev | Low | UI/UX |
| **Data Edge Cases** | | | | | | |
| 128 | Data | Duplicate exercise names | Multiple exercises can have the same name across levels | All | Medium | Functional |
| 129 | Data | Zero rest value | `rest: 0` is valid and accepted (circuit training) | All | Low | Functional |
| 130 | Data | Empty tempo string | `tempo: ""` stored instead of `undefined` | All | Low | Functional |
| 131 | Data | Date format consistency | `WorkoutSession.date` accepts both Date objects and ISO strings | All | Medium | Functional |
| 132 | Data | Future date filtering | Sessions dated after current week's Saturday are filtered out on load | All | Medium | Functional |
| 133 | Data | Very large dataset | 1000+ exercises or sessions: no pagination, potential rendering slowdown | All | Low | Performance |
| 134 | Data | Missing fields in session | Partial WorkoutSession objects accepted by PUT API | All | Medium | Functional |
| 135 | Data | Malformed weeklyProgress | Non-array value in weeklyProgress field accepted by API, may crash client | All | High | Functional |

---

## Summary by Priority

| Priority | Count |
|----------|-------|
| Critical | 11 |
| High | 30 |
| Medium | 62 |
| Low | 32 |
| **Total** | **135** |

## Summary by Category

| Category | Count |
|----------|-------|
| Functional | 59 |
| UI/UX | 33 |
| Integration | 16 |
| Security | 8 |
| Performance | 8 |
| Accessibility | 10 |
| **Total** | **135** (1 feature may span categories; counted by primary) |

---

## Blind Spots

Areas that cannot be fully assessed without additional information or runtime testing:

| Area | Question |
|------|----------|
| **Level advancement** | How does a user's level (1→2→3 etc.) actually increase? Is it automatic when all exercises at a level are completed, or does it require a manual API call? No code path found that auto-increments levels. |
| **Production data shape** | Does production seed data match mock data exactly? Are there exercises or fields in production not present in mocks? |
| **Netlify Blob limits** | What are the actual storage limits? Is there quota enforcement? What happens when storage is full? |
| **Netlify Function cold starts** | How long are cold start times? Does this affect the 10s client timeout? |
| **Real network conditions** | How does the 600ms debounce behave on 3G/slow networks where API calls take 2–5s? |
| **Service Worker caching** | Is there a service worker beyond MSW? Any offline caching strategy? |
| **Analytics/monitoring** | Is there error tracking (Sentry, etc.)? How are production errors surfaced? |
| **Browser support targets** | What browsers/versions must be supported? (affects CSS feature choices) |
| **Multi-device usage** | Can the same user access from phone and desktop simultaneously? How is this handled? |
| **Data migration** | When exercise data changes (new exercises added, exercises renamed), how is existing user progress affected? |
| **Session timeout** | Is there any session management? Does the app handle long idle periods gracefully? |
| **Deployment pipeline** | Are there staging/preview environments? How is MSW disabled in production? |

---

## Assumptions

1. **Single user:** No authentication exists; all data belongs to one implicit user per deployment.
2. **Mobile-only target:** The 480px max-width constraint suggests phone-only use; no tablet/desktop layouts expected.
3. **Dev/prod parity:** Netlify Functions and MSW handlers are assumed to behave identically (same validation, same responses).
4. **Exercise library is static:** Exercises are seeded once; users don't create/modify the exercise library through the UI.
5. **Level advancement is manual:** No automatic level-up code was found; levels must be updated via API.
6. **No offline support:** App requires network connectivity; no service worker caching for offline use.
7. **Single timezone:** All date logic uses the browser's local timezone; no UTC normalization for cross-timezone users.
8. **React XSS safety:** JSX auto-escapes strings, so exercise names with `<script>` tags are safe in rendering (but may be stored unsanitized).
9. **No concurrent users:** Single-user app; concurrent tab usage is an edge case, not a primary flow.
10. **MSW is dev-only:** Mock Service Worker is never active in production builds.
