# ATS findings

What the M3 fill engine actually managed on real job applications. **This file
is the input to the M5 plan** — per `PLAN.md`, adapter selectors are written
from this record, not guesses.

M4 (AI fallback for custom questions) does **not** need live DOM rows; it handles
`resolveAll` → `unresolved` fields regardless of ATS.

## Status: awaiting the first live pass

The engine is implemented and green in jsdom (135 tests in `@jaf/extension`),
but **no live posting has been filled yet**. Nothing below the "Verified in
jsdom" section is confirmed against a real page.

## M4.6 repair — bugs found on the first live Greenhouse pass

A live test surfaced four defects, all fixed in `docs/superpowers/plans/2026-09-15-m4.6-repair.md`:

| Symptom | Root cause | Fixed by |
|---|---|---|
| AI "Re-check" button gave no feedback | `App.tsx` never showed a loading state after the first load | Task 1 |
| AI fallback said "no service" for every failure | `syncProfile()` collapsed 401 / invalid-profile / network-down into one `online: false` | Task 2 |
| No AI answers came back at all | `claude` CLI loaded the user's global MCP servers (including `pending`/`failed` ones) on every call — missing `--strict-mcp-config` | Task 3 |
| "How did you hear about us?" dropdown filled with a value not in the list | `fillCombobox` typed free text whenever `options` was empty at harvest time, which is true for any listbox that renders on focus | Task 4 |

M4.6 code is jsdom-green. **Still needs a live re-run** (M4.5) to confirm
these fixes hold on the real posting and to capture the DOM rows below.

### Manual live test checklist

Use this when a browser is available. Check each box and fill the tables below.

**Setup (once)**

- [ ] `npm run build -w @jaf/extension`
- [ ] Load `packages/extension/dist` unpacked at `chrome://extensions`
- [ ] `npm run dev` — server on 4321, controller on 5173
- [ ] Copy token from **Setup** tab → extension Options → **Save and test** → `Paired.`
- [ ] Confirm profile has first name, last name, email, phone filled in controller

**Greenhouse** — open `job-boards.greenhouse.io/<company>/jobs/<id>`

- [ ] FAB **Fill application** appears (note if a second FAB appears in an iframe)
- [ ] Click Fill — first name, last name, email, phone populate
- [ ] Review panel opens with badge counts
- [ ] Custom/open-ended question: AI fills or shows `needs-user` (requires server + `claude login`)
- [ ] Honeypot / hidden fields untouched (DevTools → no unexpected values)
- [ ] Submit button never clicked — page stays on form
- [ ] Edit phone manually → re-run Fill → your edit preserved
- [ ] Record failures in the table below with outer HTML from DevTools

**Lever** — open `jobs.lever.co/<company>/<uuid>/apply`

- [ ] Same checklist as Greenhouse
- [ ] Record failures in the table below

**Negative control**

- [ ] `example.com` — no FAB appears

**Workday sign-in gate (M4)**

- [ ] On a Workday URL that demands sign-in before the form, Fill shows
      "Sign in to Workday first" and does not attempt to fill

## Verified in jsdom (not a substitute for the live pass)

`src/content/fill/apply.test.ts` drives harvest → resolve → fill over a
Greenhouse-shaped form and asserts:

| Behaviour | Result |
|---|---|
| First/last name, email, phone, LinkedIn, city fill | pass |
| `<select>` picks an option that really exists | pass |
| Work-authorization radio group answers Yes | pass |
| Honeypot (`name="honeypot"`) left empty | pass |
| Hidden CSRF token untouched | pass |
| Submit button never clicked | pass |
| Open-ended question reported as unresolved, for M4 | pass |
| A user edit survives a second fill | pass |
| File input reported `needs-user`, not filled | pass |

`src/content/ai-fill.test.ts` verifies M4 wiring: confident AI answers fill a
textarea; offline shows `server offline — AI unavailable`.

## Live results

### Greenhouse — `job-boards.greenhouse.io/<company>/jobs/<id>`

| Field | Outcome | Notes / real markup |
|---|---|---|
| _not yet run_ | | |

### Lever — `jobs.lever.co/<company>/<uuid>/apply`

| Field | Outcome | Notes / real markup |
|---|---|---|
| _not yet run_ | | |

## Known gaps by design, not bugs

| Gap | Closed by |
|---|---|
| Cover-letter upload — virtual field, not yet implemented | M5 |
| Resume upload on exotic ATS widgets (shadow DOM, custom dropzones) | M5 |
| Basic resume attach from `profile/resumes/` on standard `<input type="file">` | **done 2026-09-14** |
| Comboboxes (address, school autocomplete) — classified, then reported `needs-user` | M5 |
| Phone split across a country-code select and a number input | M5 |
| Repeated work-experience blocks — `sectionIndex` is recorded but unused | M5 |
| Open-ended questions — AI fallback via `/api/ai/map-fields` | **M4 done** |
| Workday account-creation gate — detect and message | **M4 done** |
