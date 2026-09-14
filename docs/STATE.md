# Project state

**The handoff file.** Every tool — Claude Code, Cursor, Codex — reads this
first and updates it last. If it disagrees with `git log`, git is right: fix
this file.

- **Last updated:** 2026-09-14 (M4 committed, combobox/observer fix committed)
- **Branch:** `main`
- **Last commit:** see `git log --oneline -5` — M4 series on `main`. Do not push unless asked.
- **Current milestone:** M4 **code complete and green in tests**. M3 live browser
  pass still outstanding. M5 blocked on live DOM in `docs/ats/findings.md`.
- **Remote:** `origin` → github.com/vedantpatil2021/JobApplicationFiller
- **Trunk:** `main`. Milestone work happens on its own branch, then merges to `main`.
- **Plan in force:** `docs/superpowers/plans/2026-09-14-m4-ai-bridge.md`

## Agent preferences

**Use Sonnet 5 (or an equivalent lighter/faster model such as Composer-class)
for routine implementation work** — not Opus. Reserve heavier models for
architecture decisions, hard debugging, or when the user explicitly asks.

## Next up

**Live browser pass (M3 Task 8 Step 6), then write the M5 plan from findings.**

1. Follow the checklist in **`docs/ats/findings.md`** — Greenhouse + Lever live fill.
2. Record real markup for anything that failed in the live results tables.
3. Only then write `docs/superpowers/plans/2026-09-14-m5-adapters.md` from those rows.

To verify M4 locally without a live posting:

```bash
npm run dev
claude login   # once, if not already
npm run build -w @jaf/extension
# load unpacked, pair, open any form with a custom question, click Fill
```

## Milestones

| # | Milestone | Plan | Status |
|---|---|---|---|
| M1 | Foundation — server, storage, controller, self-service UI, README | `plans/2026-09-13-m1-foundation.md` | **done, green, pushed** (`7df17ca`) |
| M2 | Extension skeleton — detection, sticky FAB, sync | `plans/2026-09-13-m2-m3-extension-autofill.md` | **done, green, committed** |
| M3 | Fill engine — harvest, resolve, fill on Greenhouse + Lever | same file | **code complete + green in jsdom; live pass outstanding** |
| M4 | Claude CLI bridge — AI fallback, answer cache | `plans/2026-09-14-m4-ai-bridge.md` | **done, green, committed** |
| M5 | Adapters — Ashby, Gem, SmartRecruiters, Workday, iCIMS, Taleo, Oracle | not written yet | **blocked** on live rows in `docs/ats/findings.md` |
| M6 | AI features — resume parsing, JD extraction, answer drafting | not written yet | blocked behind M5 |
| M7 | Hardening | not written yet | blocked behind M6 |

## M4 tasks

| # | Task | Status |
|---|---|---|
| 1 | Shared AI contract (`schema/ai.ts`) | done |
| 2 | Answer cache (`ai/cache.ts`, `storage/json-store.ts`) | done — 5 tests |
| 3 | Claude CLI bridge + map-fields prompt | done — 6 tests |
| 4 | Provider + `POST /api/ai/map-fields` | done — 6 tests |
| 5 | Extension AI wiring + Workday sign-in gate | done — 7 tests |
| 6 | Full test suite green | done — **215 tests** |

## Test and build state

`npm test` at the repo root — **215 passing**:

| Workspace | Tests |
|---|---|
| `@jaf/controller` | 35 |
| `@jaf/extension` | 104 |
| `@jaf/server` | 60 |
| `@jaf/shared` | 16 |

Run `npm run build -w @jaf/extension` before loading in Chrome.

## What M4 added

- **`POST /api/ai/map-fields`** — batches unresolved fields, checks
  `profile/answers.json` cache, one Claude call per form, Codex fallback on
  auth/rate-limit errors.
- **Extension** — after heuristics, eligible unresolved fields go to the server;
  confidence ≥ 0.6 fills with `source: 'ai'` or `'cache'`; offline shows plain error.
- **Workday sign-in gate** — `isWorkdaySignInGate()` returns a single review row
  instead of filling a login page.
- **Prompt injection guard** — job description wrapped in `<job_description>` tags.

## Known gotchas

Carried forward from prior sessions, plus M4:

- **Combobox ARIA on plain text inputs** — Greenhouse/Lever often set
  `aria-autocomplete` / `aria-controls` on name, email, etc. The harvester
  classifies those as `combobox`. Fixed 2026-09-14: resolver treats combobox
  as compatible with text canonical fields; fill writes via `fillText` instead
  of blanket `needs-user`.
- **`needs-user` vs `failed`** — `needs-user` only when profile/resolver/AI
  cannot supply a value (empty profile field, file upload, Workday sign-in,
  AI miss/offline). `failed` when a value exists but cannot be applied (select
  option mismatch). Combobox-with-value now fills as text where possible.
- **jsdom has no `CSS.escape`.** Use `escapeAttrValue` from
  `packages/extension/src/lib/selector.ts`.
- **`--output-format json` on Claude CLI returns a JSON array**, not one object.
  Parser lives in `packages/server/src/ai/claude-cli.ts`.
- **AI needs the server running and `claude login`.** Offline autofill still works
  for heuristic matches; AI rows show `server offline — AI unavailable`.
- **M5 cannot start** until `docs/ats/findings.md` has live Greenhouse/Lever rows
  with real markup for failures. Do not invent Workday/iCIMS selectors.
- Never gitignore bare `profile/` — use `/profile/*`.
- Never resolve data dir from `process.cwd()`.

## M3 live pass (still outstanding)

| Criterion | Status |
|---|---|
| Extension loads unpacked with no console errors | **not verified — needs a browser** |
| Widget on Greenhouse and Lever | **not verified live** |
| Name, email, phone on real postings | **not verified live** |
| `docs/ats/findings.md` live rows filled | **empty — manual checklist added** |

## Decisions already made — do not relitigate

| Decision | Why |
|---|---|
| M4 plan written from spec §1.1/§3.4, not live DOM | AI handles unresolved custom questions; it does not need ATS selectors |
| M5 plan waits for live findings | Adapter selectors must come from real harvested DOM |
| Never `claude --bare` | Forces API key; breaks zero-cost requirement |
| Never auto-submit | User clicks Submit themselves |
| Sonnet-class models for implementation | User preference; Opus reserved for hard problems |

## How to update this file

At the end of every session: move the task rows, rewrite **Next up**, and add
any new gotcha you hit. Commit it with your work, not separately.
