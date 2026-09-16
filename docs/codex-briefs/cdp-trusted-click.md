# Purpose of study: implement CDP-based trusted clicks for custom dropdowns

Repo: this repository (JobApplicationFiller). Run from its root.

## Why this exists

Five rounds of fixes (`docs/ats/findings.md` → M4.6–M4.10) tried to open and
select options in Greenhouse's react-select-style comboboxes by dispatching
synthetic DOM events (`focus`, `focusin`, `mousedown`, `mouseup`, `click`,
`ArrowDown`) from the content script. Live testing confirmed this still
fails: the real menu does not open. Research into why (see the "Root cause"
section below) confirms this is not fixable by assembling a better event
sequence — the underlying mechanism is fundamentally different from what a
content script's `element.dispatchEvent()` can produce. This brief
implements the one real, well-documented fix.

## Root cause, confirmed against primary sources

`element.dispatchEvent()` — no matter what's dispatched, in what order —
produces an event with `isTrusted: false`. Real browser input from an
actual mouse/keyboard always has `isTrusted: true`. Some component
libraries' internal handling (and, more importantly here, react-select's
own well-documented lack of "fill without a real click" support — see the
open GitHub discussion at
[JedWatson/react-select#4425](https://github.com/JedWatson/react-select/discussions/4425)
and attempted fix at
[PR #2395](https://github.com/JedWatson/react-select/pull/2395), where
react-select's own maintainers acknowledge this gap even for the browser's
*native* autofill) means a synthetic event sequence cannot reliably open or
select in these components, regardless of how it's assembled.

Browser automation tools that *do* reliably drive react-select (Cypress's
`cy.realClick()`, Playwright's coordinate-based `page.mouse.click()`) work
by routing input through the **Chrome DevTools Protocol's `Input` domain**
(`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`), which drives the
browser's real input pipeline — these events are indistinguishable from
real hardware input and carry `isTrusted: true`. This is a fundamentally
different mechanism than `dispatchEvent()`, not a better version of the
same one.

A Chrome extension can reach this same mechanism via the `chrome.debugger`
permission, which lets it attach the DevTools protocol to a tab and issue
`Input.dispatchMouseEvent`/`Input.dispatchKeyEvent` commands directly.

**The real, unavoidable cost:** while `chrome.debugger` is attached to a
tab, Chrome shows a persistent, extension-uncontrollable banner reading
something like `"<Extension name>" started debugging this browser` at the
top of the page, with a Cancel button, for as long as the attachment
lasts. There is no way to suppress or skip this. This is Chrome's own
anti-stealth-automation measure. Comparable competitor extensions
(Simplify, JobRight) show no evidence of using this — the pattern in
comparable open-source projects is instead to *skip* automated selection
of these fields entirely (see `docs/ats/findings.md` for the research
write-up). This project already does that safely (`needs-user` outcome,
never a wrong value). This brief adds CDP-based real clicking as an
**explicit, disclosed, opt-in enhancement on top of that existing safe
default** — never a silent behavior change.

## Design

### 1. Opt-in setting, off by default

Add `preciseDropdownFill: boolean` (default `false`) to the `Settings`
interface in `packages/extension/src/lib/storage.ts`, alongside the
existing `serverUrl`/`token`/`lastSyncedAt` fields — same
`getSettings`/`setSettings` pattern already there.

Add a toggle for it on the Options page
(`packages/extension/src/options/options.tsx`) with copy that states the
trade-off plainly, in the project's existing plain-language style, e.g.:

> **Precise dropdown filling** — when a dropdown can't be filled the normal
> way, use Chrome's debugger connection to click it for real. Chrome will
> show a "being debugged" banner on the page while this runs. Off by
> default.

### 2. Manifest

Add `"debugger"` to `permissions` in `packages/extension/manifest.config.ts`.
Note in your final report that this is a "powerful permission" — Chrome
will show a stronger install-time warning for it, and a previously loaded
unpacked extension needs to be reloaded and the new permission
re-approved.

### 3. Background-only primitive

`chrome.debugger` is **only available to the background service worker**,
never to a content script. Add a new module,
`packages/extension/src/background/cdp-click.ts`, exporting something like:

```ts
export async function cdpClickSequence(
  tabId: number,
  points: { x: number; y: number }[],
): Promise<{ ok: true } | { ok: false; error: string }>
```

It should, for the given `tabId`:
1. `chrome.debugger.attach({ tabId }, '1.3')`
2. For each `{x, y}` in `points`, in order: dispatch a `mousePressed` then a
   `mouseReleased` (`Input.dispatchMouseEvent` via
   `chrome.debugger.sendCommand`) at that point, with a short delay between
   press and release (a handful of milliseconds — a real click is never
   instantaneous, and some libraries key off that).
3. `chrome.debugger.detach({ tabId })` in a `finally` block — **always**
   detach, even on error, so the banner never lingers longer than
   necessary.
4. Never throw past this function's boundary — catch attach/sendCommand
   errors and return `{ ok: false, error: ... }` instead, since a content
   script awaiting a message reply needs a value, not an exception.

Wire it into `service-worker.ts`'s existing `chrome.runtime.onMessage`
handler as a new message type (e.g. `jaf.cdp-click`), following the exact
pattern already there for `jaf.sync`/`jaf.map-fields`/`jaf.fetch-resume`:
read `points` off the message, get the tab id from `sender.tab?.id` (the
content script does not need to know its own tab id — Chrome supplies it),
call `cdpClickSequence`, `sendResponse` the result, `return true` to keep
the channel open for the async reply.

### 4. Content-script side: escalate, don't replace

In `packages/extension/src/content/fill/setters.ts`'s `fillCombobox()`,
**only escalate to a CDP click as a fallback after the existing
`openControl()`/`clickListboxOption()` DOM-event path fails** (i.e. when
`clickListboxOption` would otherwise return `false`), and only when the
user has `preciseDropdownFill` enabled. Concretely:

1. Try the existing DOM-event sequence first, unchanged. If it finds and
   clicks a real option, done — no debugger involved, no banner.
2. If it can't find a real option and the setting is on, request a CDP
   click sequence via the message added in step 3, computing viewport
   coordinates via `el.getBoundingClientRect()` for the control, and (once
   the menu is confirmed open — reuse the existing `MutationObserver`
   pattern from `harvest/expand-combobox.ts`'s `waitForNewOptions` rather
   than duplicating it) for the matched `[role="option"]` element. That's
   two CDP clicks in sequence: one to open the control, one to select the
   option — pass both points to `cdpClickSequence` in one call so the
   debugger attaches once and detaches once, not twice.
3. If the setting is off, or the CDP attempt itself fails, fall through to
   the existing safe behavior: report failure, never fall back to typing
   raw text (do not reintroduce the bug this project has already fixed
   twice).

`fillCombobox` currently takes `(el, value, options)` and is called
synchronously from `applyDecisions` in `apply.ts`. Making it call out to
the background worker means it becomes `async`. That ripples into
`applyDecisions` needing to become `async` too, and every call site in
`apply.test.ts`/`ai-fill.ts`/`content/index.ts` needs updating to
`await` it. This is a real, structural change — budget time for it, and
do it as its own commit before wiring in the CDP escalation, so a failed
attempt at the CDP part doesn't also break the (larger, unrelated) sync-
to-async migration.

### 5. Safety — this is now issuing *real* clicks, be stricter, not looser

A CDP click at a coordinate clicks whatever is actually rendered there —
it does not know or care what element you intended. Before ever issuing
one:
- Re-verify the target point's element (via
  `document.elementFromPoint(x, y)` at click time) is the specific
  `[role="option"]` element with the matching text you resolved earlier —
  never click a computed coordinate blind, in case the page scrolled or
  re-rendered between resolving the coordinate and the message round-trip
  completing.
- Run the existing `isSubmitControl` guard (`content/fill/guard.ts`)
  against anything you're about to click. This matters more here than for
  synthetic events, precisely because a CDP click is real and will
  actually trigger real page behavior (including, worst case, a real
  navigation or submission) if pointed at the wrong thing.
- Never use this path for anything other than opening a combobox control
  and selecting one already-matched option. Do not build a generic
  "click anything via CDP" primitive that other code could misuse for
  something broader like a submit button.

## Testing

`chrome.debugger` does not exist in jsdom or in a real page context (only
in the extension's background/service-worker context) — it cannot be
exercised by simply visiting a page in a test. Structure the code so it's
testable anyway:

- `cdp-click.ts`'s logic should be unit-testable by mocking `chrome.debugger`
  the same way existing tests mock `chrome.storage`/`chrome.runtime` (see
  `beforeEach` blocks in `lib/sync.test.ts`, `lib/ai.test.ts`) —
  `vi.stubGlobal('chrome', { debugger: { attach: vi.fn(), sendCommand:
  vi.fn(), detach: vi.fn() } })` — and assert the exact sequence and
  arguments of calls (attach once, mousePressed/mouseReleased pairs at the
  right coordinates in the right order, detach exactly once including on a
  simulated `sendCommand` rejection).
- The `applyDecisions`/`fillCombobox` async migration needs the existing
  test suite (`apply.test.ts`, `setters.test.ts`, `ai-fill.test.ts`,
  `content/index.ts`) updated to `await` it — this is mechanical but
  touches many call sites; do it carefully, one file at a time, running
  `npm test` after each.
- **None of this proves the CDP click actually opens react-select's menu
  on a real page.** That needs an actual browser with the `debugger`
  permission granted, on a real ATS posting — the same kind of live check
  every prior round of this bug needed and mostly skipped. Do this before
  declaring the feature done. If you don't have real interactive
  browser/computer-use capability in your environment, say so plainly in
  your final report rather than presenting jsdom-mocked coverage as proof
  it works live — that mistake is exactly what produced M4.6 through
  M4.9's rounds of unverified "fixes."

## Non-negotiables from this project's own rules (`AGENTS.md`)

- Never auto-submit a job application — fill and highlight only. This
  applies with extra force here: a real CDP click can trigger real page
  behavior a synthetic event cannot.
- Never commit anything under `profile/` — it holds real personal data.
- TypeScript `strict: true`. No `any` without a `// why:` comment.
- Small commits, conventional messages (`feat(extension): ...`,
  `fix(extension): ...`). Don't combine the async-migration commit with
  the CDP-feature commit — they're independently reviewable.
- `npm test` at the repo root must be green before you're done. If your
  sandbox can't run part of the suite (e.g. no permission to bind a port
  for the server tests), say so explicitly rather than reporting a false
  pass or fail for the whole suite.

## Commit target

New branch, e.g. `feat/cdp-trusted-click` — don't commit to `main`
directly. If your environment can't write to `.git`, say so and leave the
changes unstaged for a human or another session to commit.

## How to run this

```bash
codex exec -C "$(pwd)" -s workspace-write "$(cat docs/codex-briefs/cdp-trusted-click.md)"
```

Report back: what you built, whether you got real live verification (and
on what URL, with what specific observed result) or explicitly could not,
and the real `npm test` result.
