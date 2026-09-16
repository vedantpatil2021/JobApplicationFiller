# Purpose of study: verify combobox/dropdown handling against a real ATS page

Repo: this repository (JobApplicationFiller). Run from its root.

## Why this file exists

Three rounds of live-test screenshots (see `docs/ats/findings.md` → "M4.7",
"M4.8", "M4.9") all trace back to the same unverified core problem: the
Chrome extension's content script never actually opens a real ATS
dropdown/combobox before deciding what to write into it. Two rounds of
fixes have already shipped (Claude's own session, then a Codex review of
that work) — both grounded in verifiable platform facts, **neither checked
against a real page**, because neither session had live browser or network
access. `npm test` has been green after every round; that has not been
enough evidence, twice.

**This file's only job is to get real evidence and, if the code is wrong,
fix it against that evidence — not to reason about it again in the
abstract.**

## The bug, concretely

On a real Greenhouse-hosted posting ("CodePath", "Engineering Project
Manager" — may or may not still be live; find an equivalent if not, see
below), the extension:

- Filled "How did you hear about CodePath?" with "Company career page" —
  confirmed by the user not to be one of the field's real options.
- Filled "How would you describe your sexual orientation? (mark all that
  apply)" — a multi-select widget — with "Heterosexual / Straight" typed as
  loose text. The real, correct option is "Heterosexual", and it has to be
  actually clicked/selected from an opened menu, not typed.

In both cases the extension treated a custom dropdown as if it were a
plain text input: it wrote a string directly into the visible control
without ever opening the real menu and reading what's actually in it.

## What's already been done (code side, unverified against the real page)

All in `packages/extension/src/content/`:

1. **`dom-interact.ts`** — `openControl(el)` / `closeControl(el)`. Opens a
   control via a real `.focus()` call plus explicit `focus`/`focusin`
   events and a `mousedown`/`mouseup`/`click` sequence, on the theory that:
   - Real browsers never bubble the plain `focus` event — only `focusin`
     does — so a naively dispatched `focus` event never reaches a
     React-style delegated listener.
   - react-select (the most common React multi-select library — a
     plausible match for the "mark all that apply" widget) opens its menu
     on `mousedown` of the control, not `click` or `focus`.
2. **`harvest/expand-combobox.ts`** — `expandComboboxes()` uses
   `openControl` to try to reveal a combobox's real options before
   resolve/AI ever run, waiting up to 800ms via `MutationObserver` for
   `[role="option"]` nodes to appear anywhere in the document.
3. **`fill/setters.ts`** — `fillCombobox()` re-opens the control (it may
   have closed since discovery) before searching for the matching option
   to click, and now **fails cleanly** (returns `false`, writes nothing) if
   no real option is found — it no longer falls back to typing the raw
   value as if that were a success. Native `<input list>` (datalist-bound)
   inputs are exempted, since browser-native datalist suggestions have no
   scriptable, clickable DOM representation at all.

All of this compiles, builds, and passes 273 jsdom tests. **None of it has
been checked against an actual rendered page.**

## What to actually do

1. **Get a real posting.** Try the CodePath Greenhouse posting first (web
   search for "CodePath Engineering Project Manager Greenhouse", or
   `job-boards.greenhouse.io` / `boards.greenhouse.io` URLs under a
   `codepath` company slug). If it's closed or gone, find any other live
   Greenhouse-hosted posting — Greenhouse's own default EEO/demographics
   survey block (race/ethnicity, gender, veteran status, disability,
   sexual orientation) is extremely common, so almost any live Greenhouse
   posting will reproduce the same class of widget. **Verify the URL
   actually loads a real application form before relying on it** — do not
   guess at a URL and assume it works.

2. **Get real interactive access and confirm it's real, not assumed.**
   Whatever browser/computer-use/Playwright capability is available in
   *your* environment — use it, and prove to yourself it actually works
   (load a URL, confirm you can see real rendered content, confirm you can
   dispatch a real click and observe a DOM change) before trusting it for
   anything else. If nothing like that is available, say so plainly and
   do not simulate or infer browser behavior and present it as verified.

3. **Inspect the actual widget**, ideally via real DevTools/JS
   evaluation in the live page, not by reading minified bundle source:
   - What library renders "How did you hear about CodePath?" and the
     "mark all that apply" question? (react-select, a homegrown
     component, a native `<select>` under custom CSS, something else)
   - What event(s) actually open its menu — `mousedown`? `click`? real
     `focus`? something requiring an actual keystroke? Confirm by removing
     one dispatch at a time (or by reading the library's own source/docs
     once you know what it is) rather than guessing.
   - Where does the option list render — inline in the DOM, or portaled
     elsewhere (e.g. appended to `document.body`, or somewhere a
     `document.body`-scoped `MutationObserver` might miss, like inside an
     iframe)? What ARIA roles does it actually use — `role="option"`, or
     something else?
   - For the multi-select specifically: once an option is clicked, does
     the underlying form field end up correctly set (check the real
     network request payload on submit-preview, or the component's
     visible state) — i.e. does a real click via dispatched events produce
     the same effect as a real user's click?

4. **Load the actual built extension if you can.** `npm run build -w
   @jaf/extension` from the repo root, load `packages/extension/dist` as
   an unpacked Chrome extension, pair it with the server started via `npm
   run dev` (`profile/profile.yaml` already has real profile data,
   gitignored, including `voluntary_demographics.opt_in: true`), and click
   "Fill application" on the real posting. This is the strongest possible
   verification — actually seeing the end-to-end result beats inspecting
   the DOM in isolation.

5. **Fix whatever is actually wrong**, matching the existing code's
   patterns and this project's hard rules (`AGENTS.md`, also mirrored in
   `PLAN.md`):
   - TDD: write or adjust the failing jsdom test first, in the existing
     style (`expand-combobox.test.ts`, `setters.test.ts`).
   - Never click Submit or otherwise auto-submit the real form.
   - Small commits, conventional messages (`fix(extension): ...`).
   - `npm test` at the repo root must be green before you're done. If your
     own sandbox can't run the server's tests (e.g. no permission to bind
     a port), say so explicitly rather than reporting a false pass or fail
     for the whole suite.

6. **Update `docs/ats/findings.md` with exactly what you verified**,
   labeled clearly as live-verified (not inferred) — a short new
   `## M4.10` section in the same style as the M4.7–M4.9 entries already
   there is enough. Do not rewrite the rest of the file. Leave
   `docs/STATE.md` alone.

7. **Commit on a new branch** (e.g. `fix/combobox-live-verified`) —
   don't commit to `main` directly. If your environment can't write to
   `.git` at all, say so and leave the changes unstaged/uncommitted for a
   human or another session to commit.

## Non-negotiables from this project's own rules (`AGENTS.md`)

- Never auto-submit a job application — fill and highlight only.
- Never commit anything under `profile/` — it holds real personal data.
- The CLI/tooling this project spawns takes an argv array, never a shell
  string (not directly relevant to this task, but don't introduce a
  `shell: true` anywhere).
- TypeScript `strict: true`. No `any` without a `// why:` comment.

## How to run this

From the repo root, with whatever flags your Codex install needs for
workspace file writes (adjust as needed for your version):

```bash
codex exec -C "$(pwd)" -s workspace-write "$(cat docs/codex-briefs/combobox-live-verification.md)"
```

Or, if your Codex build supports live web search as a plain flag or a
`--enable <feature>`/`-c features.<name>=true` override, add it — finding
the real posting in step 1 depends on it:

```bash
codex exec -C "$(pwd)" -s workspace-write --search "$(cat docs/codex-briefs/combobox-live-verification.md)"
```

Report back in your final message: exactly what you verified live (with
enough detail that it's clearly not inferred), what you changed and why,
and the real `npm test` result.
