# Job Application Filler — Design Spec

**Date:** 2026-09-13
**Status:** Approved for planning

A local-only job application autofill system: a Node server that owns your
profile data and brokers AI calls, a React controller page where you edit that
profile, and a Chrome extension that detects career pages and fills them.

Guiding constraint: **keep it simple**. One engine, thin adapters, no
frameworks beyond what earns its place.

---

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Source of truth | `profile.yaml` on disk, owned by the server | Human-readable, git-trackable, editable outside the app |
| Offline behavior | Extension mirrors profile into `chrome.storage.local` | Autofill works when the server is off; AI does not |
| Submission | **Never auto-submit** | A wrong answer becomes a permanent application |
| AI provider | Local `claude` CLI, `codex` as fallback | No API key, no cost, uses existing subscription |
| Fill strategy | Universal resolver + thin per-ATS adapters | Static selector maps cannot survive employer custom questions |
| UI | React + TypeScript + Tailwind + Radix | gluestack is React Native; wrong fit for a content script |

### 1.1 Rejected: `--bare`

`ABOUT.md` proposed `claude -p "<prompt>" --bare`. Verified against
`claude --help` (v2.1.270), `--bare` states:

> Anthropic auth is strictly `ANTHROPIC_API_KEY` or `apiKeyHelper` via
> `--settings` (OAuth keychain are never read).

This **requires a paid API key** and defeats the core requirement. The
verified-working invocation instead is documented in §5.

---

## 2. Architecture

```
                    profile.yaml + resumes/  (disk, gitignored)
                              |
                    +---------v----------+        spawn argv
   Controller  <--->|   Node server      |------> claude -p  (OAuth, no key)
   React :5173  REST|   127.0.0.1:4321   |------> codex exec (fallback)
                    +---------+----------+
                              | sync push (token-authed)
                              v
                    chrome.storage.local
                              |
                    +---------v----------+
                    | Extension          |
                    | background worker  |
                    +---------+----------+
                              | messages
                    +---------v----------+
                    | Content script     |  detect -> harvest -> resolve
                    | (all_frames: true) |  -> fill -> review widget
                    +--------------------+
```

Three packages plus a shared contract, as npm workspaces. `shared` is imported
by all three so the profile schema and message types can never drift.

---

## 3. Fill pipeline

```
detect -> harvest -> resolve -> [AI fallback] -> fill -> review
```

### 3.1 Detect

URL registry matched first, DOM fingerprint second (for embedded boards on
company domains).

| ATS | URL patterns | DOM fingerprint |
|---|---|---|
| Greenhouse | `boards.greenhouse.io`, `job-boards.greenhouse.io`, `*.greenhouse.io` | `#grnhse_app`, `form[action*="greenhouse"]` |
| Lever | `jobs.lever.co`, `jobs.eu.lever.co` | `.application-form`, `[data-qa="application-form"]` |
| Ashby | `jobs.ashbyhq.com`, `*.ashbyhq.com` | `#ashby_embed`, `.ashby-application-form-field-entry` |
| Gem | `jobs.gem.com`, `*.gem.com/careers`, vanity paths | Gem embed script tag |
| Workday | `*.myworkdayjobs.com`, `*.wd{N}.myworkdayjobs.com` | `[data-automation-id]` present |
| iCIMS | `*.icims.com`, `careers-*.icims.com` | `.iCIMS_` class prefix, `in_iframe=1` |
| SmartRecruiters | `jobs.smartrecruiters.com`, `careers.smartrecruiters.com` | SmartRecruiters shadow host |
| Taleo | `*.taleo.net/careersection/*` | `#requisitionDescriptionInterface` |
| Oracle Fusion | `*/hcmUI/CandidateExperience/*`, `*.oraclecloud.com` | CX app root |
| Generic | anything else | a form with >=3 fillable controls and apply/resume keywords |

Adapters supply **only**: URL patterns, fingerprint, root/frame hints, a small
map of known-stable anchors, and quirk flags. Nothing else. A new ATS is
roughly 50 lines.

### 3.2 Harvest

Walk the document, same-origin iframes, and open shadow roots. For every
fillable control build a `FieldDescriptor`:

```ts
{
  ref: string            // stable path to the element
  kind: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox'
      | 'file' | 'date' | 'combobox'
  label: string          // resolved via chain below
  name, id, placeholder, ariaLabel, autocomplete: string | null
  options: string[]      // for select / radio / combobox
  required: boolean
  maxLength: number | null
  nearbyText: string     // trimmed, for context
}
```

Label resolution chain, first hit wins: `<label for>` → wrapping `<label>` →
`aria-labelledby` → `aria-label` → preceding sibling text → closest
`legend`/heading → `placeholder`.

### 3.3 Resolve

Score each descriptor against a canonical field registry. The registry maps a
canonical key to a profile path plus synonyms:

```ts
{ key: 'personal.first_name',
  path: 'personal_information.first_name',
  synonyms: ['first name', 'given name', 'forename', 'fname'],
  autocomplete: ['given-name'],
  kinds: ['text'] }
```

Score = weighted sum of exact-synonym match on label, `autocomplete` attribute
match, `name`/`id` token match, and fuzzy label distance. Tiers:

| Confidence | Action | Badge |
|---|---|---|
| >= 0.85 | fill | green |
| 0.5 – 0.85 | fill, ask user to verify | amber |
| < 0.5 | send to AI fallback | — |
| AI < 0.6 | leave blank | red |

### 3.4 AI fallback

**One call per form, never one per field.** All unresolved descriptors are
batched into a single request with the profile summary and the scraped job
description. Response validated by `--json-schema`.

Answers cached server-side in `answers.json`, keyed on
`sha256(question + sorted(options))`, so repeat questions — EEO, sponsorship,
"why this company" — return instantly and stay consistent across applications.

### 3.5 Fill

Every write goes through the native prototype setter, then dispatches bubbling
events. This is non-negotiable — plain `el.value = x` is silently discarded by
Greenhouse, Lever, Ashby, Workday and SmartRecruiters:

```ts
const proto = el instanceof HTMLTextAreaElement
  ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
el.dispatchEvent(new Event('input',  { bubbles: true }))
el.dispatchEvent(new Event('change', { bubbles: true }))
el.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
```

Per-kind strategies:

- **select** — match option by exact → case-insensitive → trimmed → fuzzy. No
  match, no fill.
- **radio / checkbox** — match by label text, click rather than set `checked`.
- **combobox** (Workday `promptOption`, Ashby, SmartRecruiters) — focus, type,
  wait for the listbox via MutationObserver (800ms cap), click best text match.
  If no listbox appears, abandon and mark for manual review.
- **file** — build a `DataTransfer`, assign `input.files`, dispatch `change`.
  For drop-zone-only widgets, dispatch a synthetic `drop` event carrying the
  same `DataTransfer`.
- **date** — normalize from the profile's `YYYY-MM` to the field's apparent
  format, inferred from `placeholder` or `pattern`.

### 3.6 Review

Sticky FAB, bottom-right, in an **open shadow root** with its own Tailwind
build so host CSS cannot leak either direction. Clicking it opens a panel
listing every field with its badge, the value written, and the source
(heuristic / AI / cached / profile). Amber and red rows scroll the page to the
field on click.

---

## 4. Edge cases

These are the failure modes that decide whether this works on real postings.

**Fill correctness**

1. **Honeypots** — hidden inputs exist to catch bots. Never fill a control that
   is `display:none`, `visibility:hidden`, zero-area, `aria-hidden`, offscreen,
   or whose name matches `/honeypot|bot-?field|nickname/i`. Filling one gets
   the application silently discarded.
2. **Never fill** password, credit card, SSN, or date-of-birth fields, even
   when a match scores high.
3. **EEO / demographics** — voluntary and sensitive. Filled only when the user
   explicitly opts in per-section in the controller. Default off.
4. **User edits win** — record the value written per field. On re-fill, if the
   current value differs from what we wrote, the user edited it. Leave it.
5. **Repeated sections** — multiple work-experience blocks produce duplicate
   labels. Descriptors carry a section index; the resolver maps index N to
   `work_experience[N]`.
6. **Character limits** — truncate drafted answers to `maxLength` at a word
   boundary; flag amber when truncation occurs.
7. **Phone numbers** — detect a separate country-code select and split the
   profile value accordingly.
8. **Address autocomplete** (Google Places on Workday) — treat as a combobox,
   not a text field.

**Structural**

9. **Cross-origin iframes** — unreachable from the parent DOM. `all_frames:
   true` runs the content script inside each frame; frames report descriptors
   up to the background worker, which aggregates one review panel.
10. **Closed shadow roots** — genuinely unreachable. Detect, and tell the user
    plainly rather than failing silently.
11. **Multi-step wizards** (Workday, Taleo, iCIMS) — MutationObserver plus
    patched `history.pushState`/`replaceState` re-runs detection on step
    change. Fill the current page only; never click Next.
12. **Account-creation gates** — Workday demands an account before the form.
    Detect the sign-in/register page and show "sign in first" rather than
    trying to fill it.
13. **Lazy-rendered fields** — debounce harvest 300ms after the last mutation.

**Safety**

14. **Never auto-submit** — the fill layer hard-refuses to click any element
    matching `[type=submit]`, or text matching `/submit|apply now|send
    application/i`. Enforced in the fill layer, not left to adapters.
15. **Prompt injection** — job descriptions are untrusted input. Wrap page text
    in explicit delimiters and instruct the model to treat it as data, never as
    instructions. Never let scraped text reach the CLI unwrapped.
16. **Localhost is not private** — any site you visit can
    `fetch('http://127.0.0.1:4321/profile')`. Server binds loopback only,
    requires a pairing token generated on first run and stored in
    `chrome.storage.local`, and locks CORS to the extension and controller
    origins.
17. **Command injection** — the CLI is spawned with an **argv array**, never a
    shell string, and never with `shell: true`.

**Degradation**

18. **Server offline** — extension falls back to the cached profile; heuristic
    fill still works; AI-dependent rows show "server offline".
19. **CLI not authenticated** — `/health` runs a cheap probe and surfaces
    "run `claude login`" in the controller.
20. **Rate limited** — the CLI emits a `rate_limit_event` with `resetsAt`.
    Surface it in the controller and skip AI calls until it passes.
21. **CLI hangs** — kill the child after 60s, mark those fields red.

---

## 5. Claude CLI bridge

Verified working on 2026-09-13 with claude 2.1.270. The smoke test returned
`"apiKeySource":"none"`, confirming OAuth subscription auth with no API key.

```ts
spawn('claude', [
  '-p', prompt,
  '--system-prompt', systemPrompt,   // replaces default; keeps overhead small
  '--json-schema', JSON.stringify(schema),
  '--tools', '',                     // no tool access
  '--no-session-persistence',
  '--output-format', 'json',
  '--model', 'sonnet',
])
```

`--output-format json` emits a JSON **array** of stream events, not a single
object. Parse it, take the last element with `type === 'result'`, and prefer
`.structured_output` over `.result`. A verified response:

```json
{ "type": "result", "subtype": "success",
  "result": "{\"value\":\"Yes\",\"confidence\":1}",
  "structured_output": { "value": "Yes", "confidence": 1 } }
```

Four tasks, one prompt module each: `map-fields`, `parse-resume`,
`draft-answer`, `extract-job`.

`codex-cli.ts` implements the same interface via `codex exec` and is used only
when Claude is rate-limited or unauthenticated. Provider choice is a single
setting.

---

## 6. File structure

```
JobApplicationFiller/
├─ package.json                    npm workspaces root
├─ PLAN.md                         implementation plan
├─ docs/superpowers/specs/         this document
├─ profile/                        gitignored user data
│  ├─ profile.yaml
│  ├─ answers.json                 AI answer cache
│  ├─ applications.json            application log
│  └─ resumes/
└─ packages/
   ├─ shared/src/
   │  ├─ schema/profile.ts         zod schema, 8 sections from ABOUT.md
   │  ├─ schema/field.ts           FieldDescriptor, FillPlan, FillResult
   │  ├─ schema/messages.ts        content <-> background <-> server types
   │  └─ canonical/registry.ts     canonical key -> profile path + synonyms
   ├─ server/src/
   │  ├─ index.ts                  express, binds 127.0.0.1:4321
   │  ├─ auth.ts                   pairing token, CORS lock
   │  ├─ routes/{profile,ai,resume,applications,health}.ts
   │  ├─ ai/{provider,claude-cli,codex-cli,cache}.ts
   │  ├─ ai/prompts/{map-fields,parse-resume,draft-answer,extract-job}.ts
   │  └─ storage/{yaml-store,json-store,paths}.ts
   ├─ controller/src/
   │  ├─ routes/{Profile,Resumes,Applications,Settings}.tsx
   │  ├─ components/profile/       one editor per YAML section
   │  └─ lib/api.ts
   └─ extension/
      ├─ manifest.json             MV3, all_frames: true
      └─ src/
         ├─ background/service-worker.ts   sync, routing, badge
         ├─ content/index.ts               bootstrap
         ├─ content/detect/{registry,signals}.ts
         ├─ content/harvest/{collect,descriptor,visibility}.ts
         ├─ content/resolve/{score,rules,threshold}.ts
         ├─ content/fill/{setters,select,choice,combobox,file,date,guard}.ts
         ├─ content/adapters/     base + 9 adapters + generic
         ├─ content/observe.ts    mutation + SPA route watch
         └─ content/widget/       shadow-DOM React FAB + review panel
```

---

## 7. Milestones

| # | Deliverable | Demoable? |
|---|---|---|
| M1 | Server + `profile.yaml` + controller editor | Yes — edit and persist a profile |
| M2 | Extension skeleton, detection, sticky FAB, sync | Yes — widget appears on career pages |
| M3 | Harvest + resolve + fill on Greenhouse and Lever | **Yes — first real autofill** |
| M4 | Claude CLI bridge, AI fallback, answer cache | Yes — handles custom questions |
| M5 | Ashby, Gem, SmartRecruiters, Workday, iCIMS, Taleo, Oracle Fusion | Yes — full coverage |
| M6 | Resume parsing, JD extraction, answer drafting, application log | Yes — feature complete |
| M7 | Shadow DOM, wizard re-detection, edge-case hardening | Ship |

---

## 8. Out of scope

Auto-submit. Job search and aggregation. Multi-user accounts. Cloud hosting.
Firefox and Safari. Paid API keys.
