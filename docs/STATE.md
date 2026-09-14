# Project state

**The handoff file.** Every tool — Claude Code, Cursor, Codex — reads this
first and updates it last. If it disagrees with `git log`, git is right: fix
this file.

- **Last updated:** 2026-09-13
- **Branch:** `m1-foundation`
- **Last commit:** see `git log --oneline -1`
- **Current milestone:** M1 — Foundation
- **Plan in force:** `docs/superpowers/plans/2026-09-13-m1-foundation.md`

## Next up

**Review Task 1, then implement Task 2.**

Task 1 was implemented and committed but never reviewed — the session was
stopped mid-run. Before starting Task 2, read the Task 1 diff
(`git show 4b7f6cc`) against Task 1 of the plan and confirm it matches. Then
continue with Task 2 as written.

## Milestones

| # | Milestone | Plan | Status |
|---|---|---|---|
| M1 | Foundation — server, storage, controller, self-service UI, README | `plans/2026-09-13-m1-foundation.md` | in progress |
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
| 1 | Workspace scaffold and profile schema | done, **unreviewed** (`4b7f6cc`) |
| 2 | Atomic YAML store | not started |
| 3 | Express app, pairing token, CORS lock, health | not started |
| 4 | Profile routes | not started |
| 5 | Resume upload and download | not started |
| 6 | Controller scaffold with token-injecting proxy | not started |
| 7 | Profile editor UI | not started |
| 8 | Status and pairing endpoints | not started |
| 9 | App shell with navigation | not started |
| 10 | Resume manager page | not started |
| 11 | Setup page | not started |
| 12 | README and one-command start | not started |

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
  `vi.mock('../lib/api.js', { spy: true })` and `vi.mocked(...)`. The plans
  already do this.
- `@testing-library/jest-dom` needs `setupFiles` in
  `packages/controller/vite.config.ts` or every `toBeInTheDocument` throws.
  Task 7 sets this up.
- `--output-format json` on the Claude CLI returns a JSON **array** of stream
  events, not one object. Take the last element with `type === 'result'` and
  prefer `.structured_output`.
- `.superpowers/` is gitignored and Claude-Code-only. Never rely on it for
  handoff; that is what this file is for.

## How to update this file

At the end of every session: move the task rows, rewrite **Next up**, and add
any new gotcha you hit. Commit it with your work, not separately.
