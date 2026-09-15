# Project state

**The handoff file.** Every tool — Claude Code, Cursor, Codex — reads this
first and updates it last. If it disagrees with `git log`, git is right: fix
this file.

- **Last updated:** 2026-09-15 (M4.6 repair complete, green, on `fix/m4.6-repair`)
- **Branch:** `fix/m4.6-repair` (not yet merged to `main` — see "Next up")
- **Last commit:** see `git log --oneline -5` — M4.6 repair
  (`b48be41`, `599d0cb`, `ccefde0`, `e54a2d5`). Do not push unless asked.
- **Current milestone:** M4.6 **done, green, committed**. M4.5 (live recon)
  written but not yet run. M5 still blocked on live DOM in
  `docs/ats/findings.md`.
- **Remote:** `origin` → github.com/vedantpatil2021/JobApplicationFiller
- **Trunk:** `main`. Milestone work happens on its own branch, then merges to `main`.
- **Plan in force:** `docs/superpowers/plans/2026-09-15-m4.5-live-recon.md`

## Agent preferences

**Use Sonnet 5 (or an equivalent lighter/faster model such as Composer-class)
for routine implementation work** — not Opus. Reserve heavier models for
architecture decisions, hard debugging, or when the user explicitly asks.

## Next up

**Merge `fix/m4.6-repair` to `main` (via `superpowers:finishing-a-development-branch`),
then run `docs/superpowers/plans/2026-09-15-m4.5-live-recon.md`.**

1. Finish and merge the `fix/m4.6-repair` branch — four bug fixes, all
   jsdom-green, not yet on `main`.
2. Follow `docs/superpowers/plans/2026-09-15-m4.5-live-recon.md`: Task 2 uses
   Codex (`gpt-5.6-tera`, `--search`) to find real, verifiable Greenhouse and
   Lever postings; Task 4 drives an actual browser against the repaired
   extension and records results.
3. Only after that pass has real rows, write
   `docs/superpowers/plans/<date>-m5-adapters.md` from them — do not invent
   Workday/iCIMS/etc. selectors.

To verify locally without a live posting:

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
| M4.5 | Live recon — real postings, real fill, real findings | `plans/2026-09-15-m4.5-live-recon.md` | **written, not yet run** |
| M4.6 | Repair — AI diagnosability, combobox correctness, CLI isolation | `plans/2026-09-15-m4.6-repair.md` | **done, green, on `fix/m4.6-repair`** |
| M5 | Adapters — Ashby, Gem, SmartRecruiters, Workday, iCIMS, Taleo, Oracle | not written yet | **blocked** on live rows in `docs/ats/findings.md`, from M4.5 |
| M6 | AI features — resume parsing, JD extraction, answer drafting | not written yet | blocked behind M5 |
| M7 | Hardening | not written yet | blocked behind M6 |

## M4.6 tasks

Root-caused from a live test on a real Greenhouse posting this session (see
`docs/ats/findings.md` → "M4.6 repair"):

| # | Task | Status |
|---|---|---|
| 1 | Setup page checking state during AI re-check | done — `e54a2d5`, 2 tests |
| 2 | Sync failure diagnostics (`SyncFailureReason`, `describeSyncFailure`) | done — `ccefde0`, 5 tests |
| 3 | Claude CLI isolation (`--strict-mcp-config`) + spec §5 correction | done — `599d0cb`, 1 test |
| 4 | Combobox lazy-listbox expansion (`expandComboboxes`) | done — `b48be41`, 4 tests |

## Test and build state

`npm test` at the repo root — **249 passing** (was 238 before M4.6):

| Workspace | Tests |
|---|---|
| `@jaf/controller` | 37 |
| `@jaf/extension` | 135 |
| `@jaf/server` | 61 |
| `@jaf/shared` | 16 |

Run `npm run build -w @jaf/extension` before loading in Chrome.

## What M4 added

- **`POST /api/ai/map-fields`** — batches unresolved fields, checks
  `profile/answers.json` cache, one Claude call per form, Codex fallback on
  auth/rate-limit errors.
- **Extension** — after heuristics, eligible unresolved fields go to the server
  **via the background worker** (`requestMapFields` → `jaf.map-fields` message);
  confidence ≥ 0.6 fills with `source: 'ai'` or `'cache'`; offline shows plain error.
- **Resume attach** — file inputs matched to the virtual `resume` canonical field
  fetch the first file from `profile/resumes/` and attach via `DataTransfer`.
- **Workday sign-in gate** — `isWorkdaySignInGate()` returns a single review row
  instead of filling a login page.
- **Prompt injection guard** — job description wrapped in `<job_description>` tags.

## Known gotchas

Carried forward from prior sessions, plus M4.6:

- **`--tools ''` alone does not isolate the Claude CLI.** Verified live: it
  still loads every globally-installed MCP server (including `pending`/
  `failed` ones) and the full slash-command list. Always pair it with
  `--strict-mcp-config` (no `--mcp-config` file) — see
  `packages/server/src/ai/claude-cli.ts` `buildClaudeArgs`.
- **A combobox with an empty `options` array at harvest time is not
  necessarily a plain text field.** Many ATS widgets render their listbox
  only on focus. `expandComboboxes()` (`content/harvest/expand-combobox.ts`)
  runs once, right after `collectFields()`, and must keep running there —
  moving it after `resolveAll()` would defeat the point, since the resolver
  needs the real options too.
- **`SyncResult` now carries an optional `reason`.** Anything that reads
  `syncProfile()`'s return value and forwards a "why is AI unavailable"
  message to the user must use `describeSyncFailure(reason)`, not a
  hardcoded string — a hardcoded fallback string re-introduces the exact bug
  M4.6 Task 2 fixed.
- **`fillWithAi`'s signature grew a 6th, optional parameter** (`syncReason?:
  SyncFailureReason`). Existing 5-argument call sites still compile; new
  callers should pass it through from `sync.ts`'s result.

Carried forward from prior sessions, plus M4:

- **Combobox ARIA on plain text inputs** — Greenhouse/Lever often set
  `aria-autocomplete` / `aria-controls` on name, email, etc. The harvester
  classifies those as `combobox`. Plain comboboxes (no harvested options) still
  fill via `fillText`. Comboboxes **with** listbox/datalist options pick from
  the list via `fillCombobox` — never type free text that fails ATS validation.
- **`needs-user` vs `failed`** — `needs-user` only when profile/resolver/AI
  cannot supply a value (empty profile field, file upload, Workday sign-in,
  AI miss/offline). `failed` when a value exists but cannot be applied (select
  / combobox / radio option mismatch). Resolver returns null (→ AI or skip)
  when profile value does not match any harvested option.
- **Resolver confidence floor raised to 0.65** (was 0.5) — weak token-overlap
  matches were pairing wrong canonical fields to unrelated DOM inputs. Choice
  comboboxes (with options) no longer match text-only canonical fields.
- **Apply-time guards** — skip hidden/disabled fields; skip fields that already
  have a user-entered value before the first fill. `matchOption` uses word-
  boundary prefix matching so "Yes" does not match "Yesterday".
- **jsdom has no `CSS.escape`.** Use `escapeAttrValue` from
  `packages/extension/src/lib/selector.ts`.
- **`--output-format json` on Claude CLI returns a JSON array**, not one object.
  Parser lives in `packages/server/src/ai/claude-cli.ts`.
- **AI needs the server running and `claude login`.** Offline autofill still works
  for heuristic matches; AI rows show `server offline — AI unavailable`.
- **AI must route through the background worker.** Content scripts run on the ATS
  page origin; direct `fetch` to `/api/ai/map-fields` fails CORS. Fixed 2026-09-14:
  `requestMapFields` sends `jaf.map-fields` to the service worker (same pattern as
  `jaf.sync`).
- **Combobox-classified custom questions now go to AI.** Greenhouse/Lever often mark
  plain text inputs with `aria-autocomplete`; those were excluded from AI in M4.
  AI answers are written via `fillText` (same as profile combobox fix).
- **Review panel shows `note` for needs-user rows**, not an empty value — e.g.
  `Claude is not logged in`, `Extension not paired`, `AI was not confident enough`.
- **Resume upload:** first resume in `profile/resumes/` auto-attaches when the field
  label matches resume/CV synonyms. Cover letter still manual. Rebuild extension
  after pulling: `npm run build -w @jaf/extension`.
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
| M4.6 fixes bugs, does not add ATS coverage | Diagnosed from a live Greenhouse test, not from `findings.md` rows — M4.5 (recon) still has to run to unblock M5 |
| `--strict-mcp-config` required alongside `--tools ''` | Verified live 2026-09-15; `--tools ''` alone still loads the user's global MCP/plugin config |

## How to update this file

At the end of every session: move the task rows, rewrite **Next up**, and add
any new gotcha you hit. Commit it with your work, not separately.
