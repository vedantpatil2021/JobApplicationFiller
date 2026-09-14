# Project state

**The handoff file.** Every tool — Claude Code, Cursor, Codex — reads this
first and updates it last. If it disagrees with `git log`, git is right: fix
this file.

- **Last updated:** 2026-09-14
- **Branch:** `m1-foundation`
- **Last commit:** `7df17ca` (M1 committed and pushed to origin)
- **Current milestone:** M1 complete. M2 is next.
- **Remote:** `origin` → github.com/vedantpatil2021/JobApplicationFiller
- **Trunk:** `main`. Milestone work happens on its own branch, then merges to `main`.
- **Plan in force:** `docs/superpowers/plans/2026-09-13-m1-foundation.md`

## Next up

**Start M2 Task 1.**

M1 is implemented, reviewed, green (69 tests) and pushed. Open
`docs/superpowers/plans/2026-09-13-m2-m3-extension-autofill.md` at **Task 1:
Field contract in shared** (not the extension scaffold — that is Task 2).
Task 2 must also append `@jaf/extension` to the root `build` script; M1 left
it off because the package does not exist yet.

Branch from `main` for M2. The user rule still stands: do not commit unless
asked, and never push without being asked.

## Milestones

| # | Milestone | Plan | Status |
|---|---|---|---|
| M1 | Foundation — server, storage, controller, self-service UI, README | `plans/2026-09-13-m1-foundation.md` | **done, green, pushed** (`7df17ca`) |
| M2 | Extension skeleton — detection, sticky button, sync | `plans/2026-09-13-m2-m3-extension-autofill.md` | planned |
| M3 | Fill engine — harvest, resolve, fill on Greenhouse + Lever | same file | planned |
| M4 | Claude CLI bridge — AI fallback, answer cache | not written yet | — |
| M5 | Adapters — Ashby, Gem, SmartRecruiters, Workday, iCIMS, Taleo, Oracle | not written yet | — |
| M6 | AI features — resume parsing, JD extraction, answer drafting | not written yet | — |
| M7 | Hardening | not written yet | — |

M4–M7 plans are written just-in-time, each after its predecessor is green.
The reason is in `PLAN.md`: writing them now would mean inventing selectors for
ATS platforms that generate per-tenant IDs. Do not write them early.

## M1 tasks

| # | Task | Status |
|---|---|---|
| 1 | Workspace scaffold and profile schema | done (`4b7f6cc`) |
| 2 | Atomic YAML store | done, uncommitted |
| 3 | Express app, pairing token, CORS lock, health | done, uncommitted |
| 4 | Profile routes | done, uncommitted |
| 5 | Resume upload and download | done, uncommitted |
| 6 | Controller scaffold with token-injecting proxy | done, uncommitted |
| 7 | Profile editor UI | done, uncommitted |
| 8 | Status and pairing endpoints | done, uncommitted |
| 9 | App shell with navigation | done, uncommitted |
| 10 | Resume manager page | done, uncommitted |
| 11 | Setup page | done, uncommitted |
| 12 | README and one-command start | done, uncommitted |
| — | M1 review / bugfix pass | done, uncommitted (this session) |

## Review findings (2026-09-14)

**Correct as implemented**

- Layout matches AGENTS.md: `packages/shared`, `server`, `controller`; no
  extension package yet.
- Loopback bind `127.0.0.1`, `requireToken` on every `/api` route, argv
  `execFile` (no `shell: true`), TypeScript `strict`, ESM `.js` imports,
  Vitest not Jest.
- Vite proxy injects `X-JAF-Token`; the browser API client does not send it.
- Atomic YAML store, CORS allowlist, health/profile/resume/status/pairing.
- Controller tabs Profile / Resumes / Setup. Pairing token is fetched for
  display/copy (by design) after the proxy authenticates.

**Fixed this session**

- `.gitignore` used a bare `profile/`, which also ignored
  `packages/controller/src/components/profile/` — the entire profile editor
  would have been omitted from git. Now `/profile/*` + `!/profile/.gitkeep`.
- Duplicate input ids when two work-experience rows existed (`useId()`).
- Status `resumeCount` counted junk files (e.g. `.DS_Store`).
- Multer errors (file too large) were not returned as JSON.
- `sendFile` now uses `{ root, dotfiles: 'deny' }`; download links set
  `download`.
- CORS allow/deny and OPTIONS-without-token tests added.
- Root `build` no longer references `@jaf/extension` (M2). Shared gained
  `tsc --noEmit`. README Quick setup no longer requires the extension build.
- Removed `as any` from the invalid-email profile test.

**Still remaining / not started**

- M1 is uncommitted. `git log` HEAD is still `ebefbbd`.
- No live browser pass this session (no browser tools). UI covered by tests.
- `npm run start -w @jaf/server` was not used: it prints the pairing token.
  Loopback listen was verified separately: bound `127.0.0.1`, health/pairing
  without a token return 401, health with a token returns 200.
- Radix packages are installed but unused (native inputs). Left as the plan
  specified; do not rip them out.
- `@types/express` v5 with Express 4 is what the plan installed; `skipLibCheck`
  and tests keep it from biting. Do not change unless tsc fails.
- Clean-clone README walkthrough cannot pass until M1 is committed.

## M1 Definition of Done

| Criterion | Status |
|---|---|
| `npm test` at repo root | **pass — 69 tests** (28 controller, 35 server, 6 shared) |
| Server binds loopback; health without token is 401 | **pass** (listen check + tests) |
| Edit/save all eight profile sections | **pass** (ProfilePage tests + components) |
| Add/remove work experience | **pass** |
| Upload/download/delete resumes | **pass** |
| Setup tab token + Copy, Claude CLI status | **pass** |
| README Quick setup → saved profile, no YAML editing | **pass on paper** (extension step removed; needs a commit + clone to walk) |
| `profile.yaml` human-readable | **pass** (yaml-store tests) |
| `git status` shows no profile data staged | **pass** (`git add -A -n` adds only `profile/.gitkeep`) |

## Decisions already made — do not relitigate

| Decision | Why |
|---|---|
| No gluestack, no react-native-web | `ABOUT.md` asked for gluestack, but it is a React Native library and wrong inside a Chrome content script. User approved Tailwind + Radix instead. |
| Never `claude --bare` | `--bare` forces `ANTHROPIC_API_KEY`, which breaks the zero-cost requirement. Verified against the CLI. Use `claude -p … --output-format json --json-schema …`. |
| Universal resolver + thin adapters | Per-ATS selector maps cannot survive employer custom questions and per-tenant generated IDs. One scoring engine, adapters supply only hints. |
| Never auto-submit | User's explicit choice: fill and highlight, they click Submit. |
| Server owns `profile.yaml`, extension caches it | Autofill keeps working when the server is off. |
| Everything is doable from the web page | The user must never read source or edit files to configure or repair anything. |

## Known gotchas

- `vi.spyOn(api, …)` throws on live ESM exports under Vitest. Use
  `vi.mock('../lib/api.js', async importOriginal => { … vi.fn(mod.export) })`
  and `vi.mocked(...)`. `{ spy: true }` alone did not create mock functions in
  Vitest 2.1.9 — use `importOriginal` instead.
- Call `cleanup()` in `afterEach` for controller component tests — without it,
  DOM nodes accumulate and queries like `getByRole('button', { name: /save/i })`
  match duplicates.
- Reset API mocks with `mockReset()` in `beforeEach` when tests assert call
  counts — otherwise calls leak across tests in the same file.
- For file-upload tests with disallowed extensions, pass
  `{ applyAccept: false }` to `userEvent.upload` — jsdom honours the input's
  `accept` attribute otherwise.
- `@testing-library/jest-dom` needs `setupFiles` in
  `packages/controller/vite.config.ts` or every `toBeInTheDocument` throws.
- `--output-format json` on the Claude CLI returns a JSON **array** of stream
  events, not one object. Take the last element with `type === 'result'` and
  prefer `.structured_output`.
- `.superpowers/` is gitignored and Claude-Code-only. Never rely on it for
  handoff; that is what this file is for.
- Never gitignore a bare `profile/`. That pattern matches **any** directory
  named `profile`, including `packages/controller/src/components/profile/`.
  Use `/profile/*` and `!/profile/.gitkeep`.
- Root `npm run build` is shared + controller only. M2 Task 2 adds
  `@jaf/extension`.
- `npm run start -w @jaf/server` prints the pairing token to stdout by design.
  Do not paste that output into tickets or chat.

## How to update this file

At the end of every session: move the task rows, rewrite **Next up**, and add
any new gotcha you hit. Commit it with your work, not separately.
