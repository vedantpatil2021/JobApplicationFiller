# Project state

**The handoff file.** Every tool — Claude Code, Cursor, Codex — reads this
first and updates it last. If it disagrees with `git log`, git is right: fix
this file.

- **Last updated:** 2026-09-14 (M1 hotfixes + M2 + M3 committed)
- **Branch:** `main`
- **Last commit:** see `git log --oneline -5` — M1 hotfixes, M2 and M3 are
  committed in a conventional series. Do not push unless asked.
- **Current milestone:** M2 done. M3 code-complete and green in jsdom, but
  **not yet verified in a real browser**. M4 is blocked on that verification.
- **Remote:** `origin` → github.com/vedantpatil2021/JobApplicationFiller
- **Trunk:** `main`. Milestone work happens on its own branch, then merges to `main`.
- **Plan in force:** `docs/superpowers/plans/2026-09-13-m2-m3-extension-autofill.md`

## Agent preferences

**Use Sonnet 5 (or an equivalent lighter/faster model such as Composer-class)
for routine implementation work** — not Opus. Reserve heavier models for
architecture decisions, hard debugging, or when the user explicitly asks.
Cursor, Claude Code and Codex should read this before picking a model.

## Next up

**Do the live browser pass, then write the M4 plan from what it finds.**

Everything in M2 and M3 is implemented and `npm test` is green (184 tests).
The extension builds to `packages/extension/dist`. What has *not* happened is
the M2+M3 plan's **Task 8, Step 6**: loading the extension in Chrome and
filling a real Greenhouse and a real Lever posting. No browser was available
in this session.

That step is not optional polish — it is the gate on the rest of the project:

1. `npm run build -w @jaf/extension`, load `packages/extension/dist` unpacked
   at `chrome://extensions`.
2. `npm run dev`, copy the token from the **Setup** tab into the extension's
   Options page, confirm `Paired.`
3. Fill a live `job-boards.greenhouse.io/…` and a live
   `jobs.lever.co/…/apply`, and record the outcome in **`docs/ats/findings.md`**
   (created this session, currently a template with the jsdom results only).
4. Only then write the M4 plan, from that file.

`PLAN.md` is explicit that M4–M7 are written from real harvested DOM, not
guesses. `docs/ats/findings.md` has no live content yet, so **writing M4 now
would mean inventing ATS markup**, which is the exact failure the staged
plan-writing exists to prevent. This session deliberately stopped rather than
fake it.

## Milestones

| # | Milestone | Plan | Status |
|---|---|---|---|
| M1 | Foundation — server, storage, controller, self-service UI, README | `plans/2026-09-13-m1-foundation.md` | **done, green, pushed** (`7df17ca`) |
| M2 | Extension skeleton — detection, sticky FAB, sync | `plans/2026-09-13-m2-m3-extension-autofill.md` | **done, green, committed** |
| M3 | Fill engine — harvest, resolve, fill on Greenhouse + Lever | same file | **code complete + green in jsdom; live pass outstanding** |
| M4 | Claude CLI bridge — AI fallback, answer cache | not written yet | **blocked** on `docs/ats/findings.md` |
| M5 | Adapters — Ashby, Gem, SmartRecruiters, Workday, iCIMS, Taleo, Oracle | not written yet | blocked behind M4 |
| M6 | AI features — resume parsing, JD extraction, answer drafting | not written yet | blocked behind M5 |
| M7 | Hardening | not written yet | blocked behind M6 |

M4–M7 plans are written just-in-time, each after its predecessor is green.
The reason is in `PLAN.md`: writing them now would mean inventing selectors for
ATS platforms that generate per-tenant IDs. Do not write them early.

## M2 + M3 tasks

| # | Task | Status |
|---|---|---|
| 1 | Field contract in shared (`schema/field.ts`, `canonical/registry.ts`) | done — 7 tests |
| 2 | Extension scaffold, MV3 manifest, storage, pairing options page | done — 4 tests |
| 3 | Profile sync with offline cache fallback + service worker | done — 4 tests |
| 4 | Career page detection (9 ATS + generic) | done — 18 tests |
| 5 | Harvest — visibility gate, label chain, descriptors, shadow walk | done — 25 tests |
| 6 | Resolver — confidence scoring against the canonical registry | done — 12 tests |
| 7 | Fill strategies, native setters, never-submit guard | done — 28 tests |
| 8 | Widget, shadow-root mount, SPA observer, end-to-end wiring | code done; **Step 6 live pass outstanding** |

## Test and build state

`npm test` at the repo root — **184 passing**:

| Workspace | Tests |
|---|---|
| `@jaf/controller` | 35 |
| `@jaf/extension` | 91 |
| `@jaf/server` | 43 |
| `@jaf/shared` | 16 |

`npm run build` at the root now runs shared → controller → extension and
succeeds. `packages/extension/dist` exists and contains a valid MV3
`manifest.json`, the service-worker loader, the content-script loader and the
options page. Tailwind for the widget is compiled and inlined into the content
script bundle (verified: preflight and `bg-neutral-900` are present in
`dist/assets/index.ts-*.js`).

## Where M3 actually got proven

The plan left `apply.ts` to manual testing, but the M2+M3 Definition of Done
demands proof that honeypots are untouched and that no submit is ever clicked.
`packages/extension/src/content/fill/apply.test.ts` was added for that: it
drives harvest → resolve → fill over a Greenhouse-shaped form in jsdom and
asserts name/email/phone/LinkedIn/city fill, a `<select>` picks a real option,
a radio group answers, the honeypot and CSRF token stay untouched, the submit
button receives zero clicks, an open-ended question comes back unresolved for
M4, and a user's edit survives a second fill.

This is real coverage of the engine, but it is **not** a substitute for the
live pass: the markup in that test is a fixture written by the implementer, not
the markup Greenhouse ships.

## Deviations from the plan (all fixed in the plan file too)

The plan's code had four defects that only appear when you run it. Each is
fixed in both the source and `plans/2026-09-13-m2-m3-extension-autofill.md`,
per the "fix the plan in the same change" rule.

1. **`CSS.escape` does not exist in jsdom.** It was used in `descriptor.ts`,
   `collect.ts` and `setters.ts`, so every selector built from a `name` or `id`
   threw. Replaced with `escapeAttrValue` in
   `packages/extension/src/lib/selector.ts` (new file, no dependency), and
   `aria-labelledby` now uses `[id="…"]` instead of `#id`, which also removes
   the leading-digit escaping problem.
2. **`visibility.ts` could not see `display:none`.** It read computed style via
   `el.ownerDocument.defaultView`, which is `null` for a `DOMParser` document,
   so the check silently never ran. Now checks inline style first, then
   computed style when a view exists.
3. **The `^nickname$` honeypot pattern could never match.** It was tested
   against a space-joined `name id autocomplete` string. Now each attribute is
   tested separately.
4. **`detectAts` offered to fill our own controller page.** `localhost:5173` is
   titled "Job Application Filler" and is nothing but form controls, so the
   generic fallback matched it — clicking the FAB there would have overwritten
   the user's profile editor with their own profile. Now `localhost` and
   `127.0.0.1` on ports 5173 and 4321 return `null`.

Also fixed: the plan's `sync.test.ts` used an untyped `vi.fn`, so
`spy.mock.calls[0][1]` was a zero-length tuple under `tsc`.

## Known gotchas

Carried forward from M1, plus what M2/M3 added.

- **jsdom has no `CSS.escape`.** Use `escapeAttrValue` from
  `packages/extension/src/lib/selector.ts`. Never reintroduce `CSS.escape`.
- **A `DOMParser` document has no `defaultView`**, so `getComputedStyle` is
  unavailable in tests. Anything layout- or style-dependent needs an inline
  fallback, and harvest tests pass `{ checkLayout: false }`.
- **`vite.config.ts` fails `tsc --noEmit`** in both `@jaf/extension` and
  `@jaf/controller`: vitest pulls vite 5 to the root while both packages
  declare vite 6, so two copies of the `Plugin` type exist. This is
  pre-existing (the controller has the same 4 errors), harmless — neither
  `build` nor `test` runs `tsc` on it — and **not** to be fixed by changing
  dependency versions, which `PLAN.md` forbids. `src/**` typechecks clean.
- **Two profile fields fill from an empty profile**, because the schema
  defaults them: `work_authorization.authorized_to_work_in_country` is `true`
  and `source_attribution.how_did_you_hear_about_us` is
  "Company career page". A test asserting "an empty profile fills nothing"
  will fail, and correctly so.
- The content script is `all_frames: true` on `<all_urls>`. Greenhouse embeds
  its form in an iframe, so **watch for two FABs** in the live pass — one in
  the top document and one in the frame. If it happens, that is the first
  thing to record in `docs/ats/findings.md`.
- `window.__jafFill` is set by `content/index.ts` and read by the widget. Both
  live in the same content-script bundle, so they share the isolated world.
  Moving the widget to a separate script would break that link.
- Never gitignore a bare `profile/`. That pattern matches **any** directory
  named `profile`, including `packages/controller/src/components/profile/`.
  Use `/profile/*` and `!/profile/.gitkeep`.
- Never resolve the data dir from `process.cwd()`. `npm run dev -w @jaf/server`
  sets cwd to `packages/server`, so `resolve(cwd, './profile')` writes `.token`
  to `packages/server/profile/` while the Vite proxy reads the repo-root
  `profile/.token`, and Setup then reports the server as down. The default is
  `../../../profile` from `packages/server/src` via `import.meta.url`;
  `JAF_DATA_DIR` overrides.
- `npm run start -w @jaf/server` prints the pairing token to stdout by design.
  Do not paste that output into tickets or chat.
- `vi.spyOn(api, …)` throws on live ESM exports under Vitest. Use
  `vi.mock('../lib/api.js', async importOriginal => { … vi.fn(mod.export) })`
  and `vi.mocked(...)`.
- Call `cleanup()` in `afterEach` for controller component tests, and
  `mockReset()` in `beforeEach` when a test asserts call counts.
- `@testing-library/jest-dom` needs `setupFiles` in
  `packages/controller/vite.config.ts`.
- `--output-format json` on the Claude CLI returns a JSON **array** of stream
  events, not one object. Take the last element with `type === 'result'` and
  prefer `.structured_output`. (Relevant to M4.)
- `.superpowers/` is gitignored and Claude-Code-only. Never rely on it for
  handoff; that is what this file is for.

## Housekeeping done this session

- Deleted the stray `packages/server/profile/.token` left by the pre-hotfix
  run. It was **not** covered by `.gitignore`, so `git add -A` would have
  staged a live pairing token.
- Added `/packages/*/profile/` to `.gitignore` as a safety net so a
  wrong-cwd server can never leak a token into a commit. Verified:
  `git add -A -n` now stages no `.token`, no `profile.yaml` and no resumes.
- Root `package.json` `build` now appends `@jaf/extension` (M2 Task 2).
- `README.md`: removed the "skip this, milestone 2" caveats now that the
  extension exists. Quick setup walks clone → build → load unpacked → pair →
  fill. The Setup tab in the controller already had the right steps.

## M1 hotfixes (committed with M2/M3)

- Server data dir resolved from `import.meta.url`, not `process.cwd()`
  (`packages/server/src/data-dir.ts` + 3 tests).
- Work Experience **Description** is a multiline `TextArea`.
- Government & Compliance **Not applicable** checkbox; the other three fields
  stay visible but disabled when checked.
- E-Signature **Date** defaults to today's local date on ProfilePage load.
- Source Attribution defaults to **Company career page**, dropdown + Other.
- Voluntary Demographics: all six EEO fields are dropdowns (presets + Other),
  disabled until **Opt in** is checked. Presets exported from `@jaf/shared`.
- **Import YAML** on the Profile page: `POST /api/profile/import`, validates
  with `ProfileSchema`, confirm dialog when `first_name` is non-empty.

## M2 + M3 Definition of Done

| Criterion | Status |
|---|---|
| `npm test` green at the repo root | **pass — 184 tests** |
| Extension loads unpacked with no console errors | **not verified — needs a browser** |
| Widget appears on Greenhouse and Lever, stays away on `example.com` | **not verified live**; detection unit-tested for all 9 ATS + generic + null cases |
| Name, email and phone fill on a **real** posting of each | **not verified live**; passes against a Greenhouse-shaped jsdom fixture |
| Review panel shows a badge per field, with counts in its header | implemented; not seen rendered |
| Honeypot and hidden inputs provably untouched | **pass** (`visibility.test.ts` + `apply.test.ts`) |
| No submit button is ever clicked | **pass** (`guard.test.ts` + a click-counter assertion in `apply.test.ts`) |
| `docs/ats/findings.md` records what did not fill | file created with the jsdom results and the live-pass procedure; **live rows empty** |

## Decisions already made — do not relitigate

| Decision | Why |
|---|---|
| No gluestack, no react-native-web | `ABOUT.md` asked for gluestack, but it is a React Native library and wrong inside a Chrome content script. User approved Tailwind + Radix instead. |
| Never `claude --bare` | `--bare` forces `ANTHROPIC_API_KEY`, which breaks the zero-cost requirement. Use `claude -p … --output-format json --json-schema …`. |
| Universal resolver + thin adapters | Per-ATS selector maps cannot survive employer custom questions and per-tenant generated IDs. One scoring engine, adapters supply only hints. |
| Never auto-submit | User's explicit choice: fill and highlight, they click Submit. Enforced centrally in `fill/guard.ts`. |
| Server owns `profile.yaml`, extension caches it | Autofill keeps working when the server is off. |
| Everything is doable from the web page | The user must never read source or edit files to configure or repair anything. |
| M4–M7 plans are written just-in-time | Writing them before real harvested DOM exists means inventing selectors. |

## How to update this file

At the end of every session: move the task rows, rewrite **Next up**, and add
any new gotcha you hit. Commit it with your work, not separately.
