# ATS findings

What the M3 fill engine actually managed on real job applications. **This file
is the input to the M4 and M5 plans** — per `PLAN.md`, those plans are not
written from guesses about ATS markup, they are written from this record.

## Status: awaiting the first live pass

The engine is implemented and green in jsdom (90 tests in `@jaf/extension`),
but **no live posting has been filled yet**. Nothing below the "Verified in
jsdom" section is confirmed against a real page, because the session that
built M2 and M3 had no browser.

**M4 is blocked on this file having real content.** Do not write the M4 plan
from the jsdom results alone; the whole reason this file exists is that jsdom
markup is a fixture the implementer wrote, not the markup Greenhouse ships.

### How to do the live pass

1. `npm run build -w @jaf/extension`, then load `packages/extension/dist`
   unpacked at `chrome://extensions`.
2. `npm run dev`, open the **Setup** tab, copy the token into the extension's
   Options page and confirm it says `Paired.`
3. Open a live Greenhouse posting (`job-boards.greenhouse.io/…`) and a live
   Lever posting (`jobs.lever.co/…/apply`). For each, click **Fill
   application** and record the result in the table below.

For anything that did not fill, capture the field's real markup — open
DevTools, select the control, and copy the outer HTML including its label
wrapper. A label string alone is not enough to write an adapter from.

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

These are deferred in the M2+M3 plan ("Edge cases deliberately deferred past
M3") and are expected to appear in the live pass as `needs-user`:

| Gap | Closed by |
|---|---|
| Resume and cover-letter upload — `virtual` in the registry, no value to write | M5 |
| Comboboxes (address, school autocomplete) — classified, then reported `needs-user` | M5 |
| Phone split across a country-code select and a number input | M5 |
| Repeated work-experience blocks — `sectionIndex` is recorded but unused | M5 |
| Open-ended questions — `resolveAll` returns them as `unresolved` | M4 |
| Workday account-creation gate | M4 |
