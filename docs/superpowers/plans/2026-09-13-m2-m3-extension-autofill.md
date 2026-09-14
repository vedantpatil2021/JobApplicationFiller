# M2 + M3: Extension and Fill Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that detects a career page, shows a sticky button, and fills a real Greenhouse or Lever application from your profile — with every filled field reviewable and nothing ever submitted.

**Architecture:** One universal engine, thin adapters. `harvest` walks the DOM into `FieldDescriptor`s, `resolve` scores each one against a canonical field registry, `fill` writes values through native prototype setters. Adapters contribute only URL patterns, root hints and quirks. Everything in `harvest`, `resolve` and `fill` is a pure function over a DOM, so all of it is unit-testable in jsdom without a browser.

**Tech Stack:** Chrome MV3, `@crxjs/vite-plugin`, React 18 in an open shadow root, Tailwind, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-09-13-job-application-filler-design.md`

**Prerequisite:** M1 complete and green.

## Global Constraints

See `PLAN.md` → Global Constraints. The ones that bite here:

- **Never auto-submit.** Enforced centrally in `fill/guard.ts`, never per-adapter.
- Never write with `el.value = x`. Always the native prototype setter plus bubbling events.
- Never fill honeypots, password, credit-card, SSN or date-of-birth fields.
- Never fill demographics unless `voluntary_demographics.opt_in` is `true`.
- Manifest uses `all_frames: true` — Greenhouse and iCIMS forms live in iframes.

---

### Task 1: Field contract in shared

**Files:**
- Create: `packages/shared/src/schema/field.ts`
- Create: `packages/shared/src/canonical/registry.ts`
- Modify: `packages/shared/src/index.ts` — re-export both
- Test: `packages/shared/src/canonical/registry.test.ts`

**Interfaces:**
- Consumes: `Profile` from `./schema/profile.js`.
- Produces: `type FieldKind`, `type FieldDescriptor`, `type FillDecision`, `type FillSource`, `type FillOutcome`, `type FillResult`, `interface CanonicalField`, `CANONICAL_FIELDS: CanonicalField[]`, `valueAtPath(profile: Profile, path: string): string`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/canonical/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CANONICAL_FIELDS, valueAtPath } from './registry.js'
import { emptyProfile } from '../schema/profile.js'

describe('canonical registry', () => {
  it('gives every entry a unique key', () => {
    const keys = CANONICAL_FIELDS.map(f => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('points every entry at a path that resolves in a real profile', () => {
    const p = emptyProfile()
    for (const f of CANONICAL_FIELDS.filter(f => !f.virtual)) {
      expect(() => valueAtPath(p, f.path), `path broken: ${f.key}`).not.toThrow()
    }
  })

  it('reads a nested value by path', () => {
    const p = emptyProfile()
    p.applicant_profile.personal_information.address.city = 'Pune'
    expect(valueAtPath(p, 'personal_information.address.city')).toBe('Pune')
  })

  it('renders booleans as Yes/No because forms ask them as questions', () => {
    const p = emptyProfile()
    p.applicant_profile.work_authorization.requires_sponsorship_now_or_future = false
    expect(valueAtPath(p, 'work_authorization.requires_sponsorship_now_or_future')).toBe('No')
  })

  it('marks every demographics entry sensitive so the opt-in gate can find them', () => {
    const demo = CANONICAL_FIELDS.filter(f => f.path.startsWith('voluntary_demographics.'))
    expect(demo.length).toBeGreaterThan(0)
    expect(demo.every(f => f.sensitive)).toBe(true)
  })

  it('marks fields with no profile value as virtual', () => {
    for (const f of CANONICAL_FIELDS) {
      expect(f.path === '', `${f.key}: empty path must be virtual`).toBe(Boolean(f.virtual))
    }
  })

  it('covers the fields every application asks for', () => {
    const keys = CANONICAL_FIELDS.map(f => f.key)
    for (const k of ['first_name', 'last_name', 'email', 'phone', 'linkedin', 'resume',
                     'work_authorized', 'requires_sponsorship']) {
      expect(keys).toContain(k)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/shared -- registry
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write field.ts**

`packages/shared/src/schema/field.ts`:

```ts
export type FieldKind =
  | 'text' | 'textarea' | 'select' | 'radio' | 'checkbox'
  | 'file' | 'date' | 'combobox'

/** Everything the resolver needs about one form control, with no DOM reference. */
export interface FieldDescriptor {
  ref: string                 // opaque handle back to the element
  kind: FieldKind
  label: string
  name: string | null
  id: string | null
  placeholder: string | null
  ariaLabel: string | null
  autocomplete: string | null
  options: string[]           // select / radio / combobox choices
  required: boolean
  maxLength: number | null
  sectionIndex: number        // for repeated blocks, e.g. work_experience[2]
  nearbyText: string
}

export type FillSource = 'profile' | 'heuristic' | 'ai' | 'cache'

export interface FillDecision {
  ref: string
  value: string
  confidence: number          // 0..1
  source: FillSource
  canonicalKey: string | null
  reason: string              // shown in the review panel
}

export type FillOutcome = 'filled' | 'skipped' | 'failed' | 'needs-user'

export interface FillResult {
  ref: string
  label: string
  outcome: FillOutcome
  value: string
  confidence: number
  source: FillSource
  note: string
}
```

- [ ] **Step 4: Write registry.ts**

`packages/shared/src/canonical/registry.ts`:

```ts
import type { Profile } from '../schema/profile.js'
import type { FieldKind } from '../schema/field.js'

export interface CanonicalField {
  key: string
  /** Dot path inside `applicant_profile`. Empty for virtual fields. */
  path: string
  synonyms: string[]
  /** Virtual fields carry no profile value; a strategy handles them (e.g. resume upload). */
  virtual?: boolean
  /** HTML autocomplete tokens that identify this field outright. */
  autocomplete?: string[]
  kinds: FieldKind[]
  /** Sensitive fields are gated behind an explicit opt-in. */
  sensitive?: boolean
}

/** Booleans surface as Yes/No because forms ask them as questions. */
export function valueAtPath(profile: Profile, path: string): string {
  let node: unknown = profile.applicant_profile
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') {
      throw new Error(`path does not resolve: ${path}`)
    }
    node = (node as Record<string, unknown>)[part]
  }
  if (node === undefined) throw new Error(`path does not resolve: ${path}`)
  if (typeof node === 'boolean') return node ? 'Yes' : 'No'
  return String(node ?? '')
}

export const CANONICAL_FIELDS: CanonicalField[] = [
  { key: 'first_name', path: 'personal_information.first_name',
    synonyms: ['first name', 'given name', 'forename', 'fname'],
    autocomplete: ['given-name'], kinds: ['text'] },
  { key: 'last_name', path: 'personal_information.last_name',
    synonyms: ['last name', 'family name', 'surname', 'lname'],
    autocomplete: ['family-name'], kinds: ['text'] },
  { key: 'full_name', path: 'e_signature.full_name',
    synonyms: ['full name', 'your name', 'name', 'legal name'],
    autocomplete: ['name'], kinds: ['text'] },
  { key: 'email', path: 'personal_information.email',
    synonyms: ['email', 'e-mail', 'email address'],
    autocomplete: ['email'], kinds: ['text'] },
  { key: 'phone', path: 'personal_information.phone_number',
    synonyms: ['phone', 'telephone', 'mobile', 'phone number', 'cell'],
    autocomplete: ['tel'], kinds: ['text'] },
  { key: 'street', path: 'personal_information.address.street',
    synonyms: ['street', 'address', 'address line 1', 'street address'],
    autocomplete: ['address-line1', 'street-address'], kinds: ['text'] },
  { key: 'city', path: 'personal_information.address.city',
    synonyms: ['city', 'town', 'locality'],
    autocomplete: ['address-level2'], kinds: ['text', 'combobox'] },
  { key: 'state', path: 'personal_information.address.state',
    synonyms: ['state', 'province', 'region', 'county'],
    autocomplete: ['address-level1'], kinds: ['text', 'select', 'combobox'] },
  { key: 'postal_code', path: 'personal_information.address.postal_code',
    synonyms: ['postal code', 'zip', 'zip code', 'postcode'],
    autocomplete: ['postal-code'], kinds: ['text'] },
  { key: 'country', path: 'personal_information.address.country',
    synonyms: ['country', 'country/region'],
    autocomplete: ['country', 'country-name'], kinds: ['text', 'select', 'combobox'] },
  { key: 'linkedin', path: 'personal_information.linkedin_url',
    synonyms: ['linkedin', 'linkedin url', 'linkedin profile'], kinds: ['text'] },
  { key: 'portfolio', path: 'personal_information.portfolio_url',
    synonyms: ['portfolio', 'website', 'personal site', 'github', 'portfolio url'],
    autocomplete: ['url'], kinds: ['text'] },

  { key: 'work_authorized', path: 'work_authorization.authorized_to_work_in_country',
    synonyms: ['authorized to work', 'legally authorized', 'work authorization',
               'eligible to work', 'right to work'],
    kinds: ['select', 'radio', 'checkbox', 'combobox'] },
  { key: 'requires_sponsorship', path: 'work_authorization.requires_sponsorship_now_or_future',
    synonyms: ['sponsorship', 'require sponsorship', 'visa sponsorship',
               'now or in the future require'],
    kinds: ['select', 'radio', 'checkbox', 'combobox'] },
  { key: 'visa_status', path: 'work_authorization.visa_status',
    synonyms: ['visa status', 'work visa', 'immigration status'],
    kinds: ['text', 'select', 'combobox'] },

  { key: 'former_gov_employee', path: 'government_compliance.is_former_government_employee',
    synonyms: ['former government employee', 'government employee'],
    kinds: ['select', 'radio', 'checkbox'] },
  { key: 'clearance', path: 'government_compliance.clearance_level',
    synonyms: ['security clearance', 'clearance level', 'clearance'],
    kinds: ['text', 'select', 'combobox'] },
  { key: 'export_control', path: 'government_compliance.export_control_status',
    synonyms: ['export control', 'itar', 'ear'], kinds: ['text', 'select'] },

  { key: 'signature', path: 'e_signature.full_name',
    synonyms: ['signature', 'e-signature', 'sign here', 'type your name'], kinds: ['text'] },
  { key: 'signature_date', path: 'e_signature.date',
    synonyms: ['date', "today's date", 'signature date'], kinds: ['text', 'date'] },

  { key: 'source', path: 'source_attribution.how_did_you_hear_about_us',
    synonyms: ['how did you hear', 'referral source', 'where did you hear', 'source'],
    kinds: ['text', 'select', 'combobox'] },

  { key: 'gender', path: 'voluntary_demographics.gender_identity',
    synonyms: ['gender', 'gender identity'], kinds: ['select', 'radio', 'combobox'], sensitive: true },
  { key: 'transgender', path: 'voluntary_demographics.transgender_status',
    synonyms: ['transgender'], kinds: ['select', 'radio', 'combobox'], sensitive: true },
  { key: 'race', path: 'voluntary_demographics.race_ethnicity',
    synonyms: ['race', 'ethnicity', 'race/ethnicity'], kinds: ['select', 'radio', 'combobox'], sensitive: true },
  { key: 'sexual_orientation', path: 'voluntary_demographics.sexual_orientation',
    synonyms: ['sexual orientation'], kinds: ['select', 'radio', 'combobox'], sensitive: true },
  { key: 'veteran', path: 'voluntary_demographics.veteran_status',
    synonyms: ['veteran', 'veteran status', 'protected veteran'],
    kinds: ['select', 'radio', 'combobox'], sensitive: true },
  { key: 'disability', path: 'voluntary_demographics.disability_status',
    synonyms: ['disability', 'disability status'], kinds: ['select', 'radio', 'combobox'], sensitive: true },

  // Virtual: the file strategy handles this, there is no string to write.
  { key: 'resume', path: '', virtual: true,
    synonyms: ['resume', 'cv', 'upload resume', 'attach resume'], kinds: ['file'] },
  { key: 'cover_letter', path: '', virtual: true,
    synonyms: ['cover letter', 'letter of interest'], kinds: ['file'] },
]
```

Add to `packages/shared/src/index.ts`:

```ts
export * from './schema/field.js'
export * from './canonical/registry.js'
```

- [ ] **Step 5: Run tests until green, then commit**

```bash
npm test -w @jaf/shared
git add -A && git commit -m "feat(shared): field descriptor contract and canonical field registry"
```

---

### Task 2: Extension scaffold and token pairing

**Files:**
- Create: `packages/extension/package.json`, `tsconfig.json`, `vite.config.ts`, `manifest.config.ts`
- Create: `packages/extension/src/background/service-worker.ts`
- Create: `packages/extension/src/options/index.html`, `options.tsx`
- Create: `packages/extension/src/lib/storage.ts`
- Test: `packages/extension/src/lib/storage.test.ts`
- Modify: root `package.json` — append `&& npm run build -w @jaf/extension` to `scripts.build`. M1 omitted it because this package did not exist yet.

**Interfaces:**
- Consumes: `Profile` from `@jaf/shared`.
- Produces: `getSettings(): Promise<Settings>`, `setSettings(p: Partial<Settings>): Promise<void>`, `getCachedProfile(): Promise<Profile | null>`, `setCachedProfile(p: Profile): Promise<void>` where `Settings = { serverUrl: string; token: string; lastSyncedAt: number | null }`.

- [ ] **Step 1: Create the package**

`packages/extension/package.json`:

```json
{
  "name": "@jaf/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "test": "vitest run" },
  "dependencies": { "@jaf/shared": "*", "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "@types/chrome": "^0.0.287",
    "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vitest": "^2.1.8"
  }
}
```

`packages/extension/manifest.config.ts`:

```ts
import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Job Application Filler',
  version: '0.1.0',
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['http://127.0.0.1:4321/*'],
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  options_page: 'src/options/index.html',
  action: { default_title: 'Job Application Filler' },
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['src/content/index.ts'],
    // Greenhouse and iCIMS render their forms inside iframes.
    all_frames: true,
    run_at: 'document_idle',
  }],
})
```

`packages/extension/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config.js'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  test: { environment: 'jsdom' },
})
```

`packages/extension/src/vite-env.d.ts` — without this, `import css from './x.css?inline'` fails to typecheck:

```ts
/// <reference types="vite/client" />
declare module '*.css?inline' {
  const css: string
  export default css
}
```

`packages/extension/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["chrome", "vitest/globals"] },
  "include": ["src", "*.ts"]
}
```

```bash
npm install
```

- [ ] **Step 2: Write the failing test**

`packages/extension/src/lib/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emptyProfile } from '@jaf/shared'
import { getSettings, setSettings, getCachedProfile, setCachedProfile } from './storage.js'

beforeEach(() => {
  const store: Record<string, unknown> = {}
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: async (keys: string[]) => Object.fromEntries(keys.map(k => [k, store[k]])),
      set: async (items: Record<string, unknown>) => { Object.assign(store, items) },
    } },
  })
})

describe('extension storage', () => {
  it('returns usable defaults before anything is saved', async () => {
    const s = await getSettings()
    expect(s.serverUrl).toBe('http://127.0.0.1:4321')
    expect(s.token).toBe('')
  })

  it('persists a partial settings update without clobbering the rest', async () => {
    await setSettings({ token: 'abc' })
    await setSettings({ lastSyncedAt: 42 })
    const s = await getSettings()
    expect(s.token).toBe('abc')
    expect(s.lastSyncedAt).toBe(42)
  })

  it('returns null when no profile is cached yet', async () => {
    expect(await getCachedProfile()).toBeNull()
  })

  it('round-trips the cached profile so autofill survives the server going away', async () => {
    const p = emptyProfile()
    p.applicant_profile.personal_information.first_name = 'Ada'
    await setCachedProfile(p)
    expect((await getCachedProfile())!.applicant_profile.personal_information.first_name).toBe('Ada')
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npm test -w @jaf/extension -- storage
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write storage.ts**

`packages/extension/src/lib/storage.ts`:

```ts
import { ProfileSchema, type Profile } from '@jaf/shared'

export interface Settings {
  serverUrl: string
  token: string
  lastSyncedAt: number | null
}

const DEFAULTS: Settings = { serverUrl: 'http://127.0.0.1:4321', token: '', lastSyncedAt: null }
const SETTINGS_KEY = 'jaf.settings'
const PROFILE_KEY = 'jaf.profile'

export async function getSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get([SETTINGS_KEY])
  return { ...DEFAULTS, ...(got[SETTINGS_KEY] as Partial<Settings> | undefined) }
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...(await getSettings()), ...patch } })
}

export async function getCachedProfile(): Promise<Profile | null> {
  const got = await chrome.storage.local.get([PROFILE_KEY])
  const raw = got[PROFILE_KEY]
  if (!raw) return null
  const parsed = ProfileSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function setCachedProfile(profile: Profile): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_KEY]: profile })
}
```

- [ ] **Step 5: Write the options page for pairing**

`packages/extension/src/options/index.html`:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Job Application Filler — Options</title></head>
  <body><div id="root"></div><script type="module" src="./options.tsx"></script></body>
</html>
```

`packages/extension/src/options/options.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getSettings, setSettings } from '../lib/storage.js'

function Options() {
  const [token, setToken] = useState('')
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:4321')
  const [status, setStatus] = useState('')

  useEffect(() => { getSettings().then(s => { setToken(s.token); setServerUrl(s.serverUrl) }) }, [])

  const save = async () => {
    await setSettings({ token: token.trim(), serverUrl: serverUrl.trim() })
    try {
      const res = await fetch(`${serverUrl.trim()}/api/health`, { headers: { 'X-JAF-Token': token.trim() } })
      setStatus(res.ok ? 'Paired.' : `Server said ${res.status}. Check the token.`)
    } catch {
      setStatus('Cannot reach the server. Is it running?')
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 560 }}>
      <h1>Job Application Filler</h1>
      <p>Paste the token printed by <code>npm run start -w @jaf/server</code>.</p>
      <label>Server URL<br /><input value={serverUrl} onChange={e => setServerUrl(e.target.value)} style={{ width: '100%' }} /></label>
      <label>Token<br /><input value={token} onChange={e => setToken(e.target.value)} style={{ width: '100%' }} /></label>
      <button onClick={save} style={{ marginTop: 12 }}>Save and test</button>
      <p>{status}</p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Options />)
```

- [ ] **Step 6: Run tests until green, then commit**

```bash
npm test -w @jaf/extension
git add -A && git commit -m "feat(extension): MV3 scaffold, storage helpers and token pairing page"
```

---

### Task 3: Profile sync with offline fallback

**Files:**
- Create: `packages/extension/src/lib/sync.ts`
- Modify: `packages/extension/src/background/service-worker.ts`
- Test: `packages/extension/src/lib/sync.test.ts`

**Interfaces:**
- Consumes: `getSettings`, `setSettings`, `getCachedProfile`, `setCachedProfile`.
- Produces: `syncProfile(): Promise<{ profile: Profile | null; online: boolean }>`.

- [ ] **Step 1: Write the failing test**

`packages/extension/src/lib/sync.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emptyProfile } from '@jaf/shared'
import { syncProfile } from './sync.js'
import { setCachedProfile, setSettings } from './storage.js'

beforeEach(async () => {
  const store: Record<string, unknown> = {}
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: async (keys: string[]) => Object.fromEntries(keys.map(k => [k, store[k]])),
      set: async (items: Record<string, unknown>) => { Object.assign(store, items) },
    } },
  })
  await setSettings({ token: 'secret' })
})

describe('syncProfile', () => {
  it('fetches from the server and caches the result', async () => {
    const p = emptyProfile()
    p.applicant_profile.personal_information.first_name = 'Ada'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(p), { status: 200 })))

    const r = await syncProfile()
    expect(r.online).toBe(true)
    expect(r.profile!.applicant_profile.personal_information.first_name).toBe('Ada')
  })

  it('sends the pairing token', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(emptyProfile()), { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await syncProfile()
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['X-JAF-Token']).toBe('secret')
  })

  it('falls back to the cached profile when the server is down', async () => {
    const cached = emptyProfile()
    cached.applicant_profile.personal_information.first_name = 'Grace'
    await setCachedProfile(cached)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const r = await syncProfile()
    expect(r.online).toBe(false)
    expect(r.profile!.applicant_profile.personal_information.first_name).toBe('Grace')
  })

  it('reports offline with a null profile when there is no cache either', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    expect(await syncProfile()).toEqual({ profile: null, online: false })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/extension -- sync
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write sync.ts**

`packages/extension/src/lib/sync.ts`:

```ts
import { ProfileSchema, type Profile } from '@jaf/shared'
import { getSettings, setSettings, getCachedProfile, setCachedProfile } from './storage.js'

/**
 * Server is the source of truth; the cache is what keeps autofill working
 * when the server is not running. Never throws.
 */
export async function syncProfile(): Promise<{ profile: Profile | null; online: boolean }> {
  const { serverUrl, token } = await getSettings()
  try {
    const res = await fetch(`${serverUrl}/api/profile`, { headers: { 'X-JAF-Token': token } })
    if (!res.ok) throw new Error(String(res.status))
    const parsed = ProfileSchema.safeParse(await res.json())
    if (!parsed.success) throw new Error('server returned an invalid profile')

    await setCachedProfile(parsed.data)
    await setSettings({ lastSyncedAt: Date.now() })
    return { profile: parsed.data, online: true }
  } catch {
    return { profile: await getCachedProfile(), online: false }
  }
}
```

- [ ] **Step 4: Wire the service worker**

`packages/extension/src/background/service-worker.ts`:

```ts
import { syncProfile } from '../lib/sync.js'

const SYNC_ALARM = 'jaf.sync'

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 })
  void syncProfile()
})
chrome.alarms.onAlarm.addListener(a => { if (a.name === SYNC_ALARM) void syncProfile() })

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'jaf.sync') {
    syncProfile().then(sendResponse)
    return true   // keep the channel open for the async reply
  }
  return false
})
```

Add `"alarms"` to the `permissions` array in `manifest.config.ts`.

- [ ] **Step 5: Run tests until green, then commit**

```bash
npm test -w @jaf/extension
git add -A && git commit -m "feat(extension): profile sync with offline cache fallback"
```

---

### Task 4: Career page detection

**Files:**
- Create: `packages/extension/src/content/detect/registry.ts`
- Test: `packages/extension/src/content/detect/registry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `detectAts(url: string, doc: Document): AtsMatch | null` where `AtsMatch = { id: AtsId; confidence: number }`, and `type AtsId = 'greenhouse' | 'lever' | 'ashby' | 'gem' | 'workday' | 'icims' | 'smartrecruiters' | 'taleo' | 'oracle-fusion' | 'generic'`.

Only Greenhouse and Lever get real adapters in M3. Detection covers all nine
now because it is cheap and it tells you which sites to test against later.

- [ ] **Step 1: Write the failing test**

`packages/extension/src/content/detect/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { detectAts } from './registry.js'

const doc = (html = '') => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

describe('detectAts by URL', () => {
  const cases: [string, string][] = [
    ['https://boards.greenhouse.io/acme/jobs/123', 'greenhouse'],
    ['https://job-boards.greenhouse.io/acme/jobs/123', 'greenhouse'],
    ['https://jobs.lever.co/acme/2f8c-uuid/apply', 'lever'],
    ['https://jobs.eu.lever.co/acme/2f8c-uuid', 'lever'],
    ['https://jobs.ashbyhq.com/acme/uuid/application', 'ashby'],
    ['https://jobs.gem.com/acme/job/abc', 'gem'],
    ['https://acme.wd1.myworkdayjobs.com/en-US/careers/job/x', 'workday'],
    ['https://careers-acme.icims.com/jobs/1234/login', 'icims'],
    ['https://jobs.smartrecruiters.com/Acme/744000', 'smartrecruiters'],
    ['https://acme.taleo.net/careersection/ex/jobdetail.ftl', 'taleo'],
    ['https://acme.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/1', 'oracle-fusion'],
  ]

  for (const [url, id] of cases) {
    it(`identifies ${id} from ${new URL(url).host}`, () => {
      expect(detectAts(url, doc())?.id).toBe(id)
    })
  }
})

describe('detectAts by DOM fingerprint', () => {
  it('finds an embedded Greenhouse board on a company domain', () => {
    expect(detectAts('https://acme.com/careers', doc('<div id="grnhse_app"></div>'))?.id).toBe('greenhouse')
  })

  it('finds an embedded Ashby board on a company domain', () => {
    expect(detectAts('https://acme.com/careers', doc('<div id="ashby_embed"></div>'))?.id).toBe('ashby')
  })

  it('finds Workday by its automation attributes', () => {
    expect(detectAts('https://acme.com/apply', doc('<div data-automation-id="legalNameSection"></div>'))?.id).toBe('workday')
  })
})

describe('detectAts fallback', () => {
  it('returns generic for an unknown page that looks like an application', () => {
    const html = `<form><input name="first_name"><input name="email">
                  <input type="file" name="resume"><button>Apply</button></form>`
    expect(detectAts('https://acme.com/join-us', doc(html))?.id).toBe('generic')
  })

  it('returns null for an ordinary page with no application form', () => {
    expect(detectAts('https://news.example.com/article', doc('<p>hello</p>'))).toBeNull()
  })

  it('returns null for a login form, which is not an application', () => {
    const html = `<form><input name="username"><input type="password" name="password"></form>`
    expect(detectAts('https://acme.com/login', doc(html))).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/extension -- registry
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write registry.ts**

`packages/extension/src/content/detect/registry.ts`:

```ts
export type AtsId =
  | 'greenhouse' | 'lever' | 'ashby' | 'gem' | 'workday'
  | 'icims' | 'smartrecruiters' | 'taleo' | 'oracle-fusion' | 'generic'

export interface AtsMatch { id: AtsId; confidence: number }

interface Rule { id: AtsId; url: RegExp; fingerprint?: string }

const RULES: Rule[] = [
  { id: 'greenhouse',      url: /(^|\.)(job-boards|boards)\.greenhouse\.io$|(^|\.)greenhouse\.io$/, fingerprint: '#grnhse_app, form[action*="greenhouse"]' },
  { id: 'lever',           url: /(^|\.)jobs(\.eu)?\.lever\.co$/,           fingerprint: '.application-form, [data-qa="application-form"]' },
  { id: 'ashby',           url: /(^|\.)ashbyhq\.com$/,                     fingerprint: '#ashby_embed, .ashby-application-form-field-entry' },
  { id: 'gem',             url: /(^|\.)jobs\.gem\.com$|(^|\.)gem\.com$/,   fingerprint: '[data-gem-job-board], script[src*="gem.com"]' },
  { id: 'workday',         url: /\.myworkdayjobs\.com$/,                   fingerprint: '[data-automation-id]' },
  { id: 'icims',           url: /(^|\.)icims\.com$/,                       fingerprint: '[class^="iCIMS_"], [class*=" iCIMS_"]' },
  { id: 'smartrecruiters', url: /(^|\.)smartrecruiters\.com$/,             fingerprint: '[data-test="application-form"], sr-application' },
  { id: 'taleo',           url: /(^|\.)taleo\.net$/,                       fingerprint: '#requisitionDescriptionInterface, form[name="dynamicForm"]' },
  { id: 'oracle-fusion',   url: /(^|\.)oraclecloud\.com$/,                 fingerprint: '[class*="candidate-experience"], .apply-flow' },
]

const APPLY_HINT = /\b(apply|application|resume|cv|cover letter|submit your)\b/i

/** A login form is not an application, no matter how many inputs it has. */
function looksLikeLogin(doc: Document): boolean {
  return doc.querySelector('input[type="password"]') !== null
}

function looksLikeApplication(doc: Document): boolean {
  if (looksLikeLogin(doc)) return false
  const controls = doc.querySelectorAll('input:not([type="hidden"]), textarea, select')
  if (controls.length < 3) return false
  const hasFile = doc.querySelector('input[type="file"]') !== null
  return hasFile || APPLY_HINT.test(doc.body?.textContent ?? '')
}

export function detectAts(url: string, doc: Document): AtsMatch | null {
  let host = ''
  let path = ''
  try { const u = new URL(url); host = u.hostname; path = u.pathname } catch { /* treat as no match */ }

  for (const rule of RULES) {
    if (rule.url.test(host)) return { id: rule.id, confidence: 1 }
  }
  // Taleo and Fusion also appear under vanity domains; their paths are distinctive.
  if (/\/careersection\//.test(path)) return { id: 'taleo', confidence: 0.9 }
  if (/\/hcmUI\/CandidateExperience\//.test(path)) return { id: 'oracle-fusion', confidence: 0.9 }

  for (const rule of RULES) {
    if (rule.fingerprint && doc.querySelector(rule.fingerprint)) return { id: rule.id, confidence: 0.8 }
  }

  return looksLikeApplication(doc) ? { id: 'generic', confidence: 0.5 } : null
}
```

- [ ] **Step 4: Run tests until green, then commit**

```bash
npm test -w @jaf/extension
git add -A && git commit -m "feat(extension): ATS detection by URL, fingerprint and generic fallback"
```

---

### Task 5: Harvest — visibility gate and descriptors

**Files:**
- Create: `packages/extension/src/content/harvest/visibility.ts`
- Create: `packages/extension/src/content/harvest/descriptor.ts`
- Create: `packages/extension/src/content/harvest/collect.ts`
- Test: `packages/extension/src/content/harvest/visibility.test.ts`, `descriptor.test.ts`

**Interfaces:**
- Consumes: `FieldDescriptor`, `FieldKind` from `@jaf/shared`.
- Produces:
  - `isFillable(el: Element, opts?: { checkLayout?: boolean }): boolean`
  - `describeField(el: HTMLElement, ref: string, sectionIndex?: number): FieldDescriptor`
  - `collectFields(root: Document | ShadowRoot, opts?: { checkLayout?: boolean }): HarvestedField[]`
  - `interface HarvestedField { el: HTMLElement; descriptor: FieldDescriptor }`

`checkLayout` defaults to `true` in the browser and is passed `false` in tests,
because jsdom does no layout and every rect would measure zero.

- [ ] **Step 1: Write the failing visibility test**

`packages/extension/src/content/harvest/visibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isFillable } from './visibility.js'

const el = (html: string): Element => {
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return d.body.firstElementChild!
}
const check = (html: string) => isFillable(el(html), { checkLayout: false })

describe('isFillable', () => {
  it('accepts an ordinary text input', () => {
    expect(check('<input type="text" name="first_name">')).toBe(true)
  })

  it('rejects a hidden input', () => {
    expect(check('<input type="hidden" name="csrf">')).toBe(false)
  })

  it('rejects display:none', () => {
    expect(check('<input style="display:none" name="a">')).toBe(false)
  })

  it('rejects visibility:hidden', () => {
    expect(check('<input style="visibility:hidden" name="a">')).toBe(false)
  })

  it('rejects the hidden attribute', () => {
    expect(check('<input hidden name="a">')).toBe(false)
  })

  it('rejects aria-hidden', () => {
    expect(check('<input aria-hidden="true" name="a">')).toBe(false)
  })

  it('rejects a honeypot by name — filling one gets the application binned', () => {
    expect(check('<input name="honeypot">')).toBe(false)
    expect(check('<input name="bot-field">')).toBe(false)
    expect(check('<input name="nickname">')).toBe(false)
  })

  it('rejects disabled and readonly controls', () => {
    expect(check('<input name="a" disabled>')).toBe(false)
    expect(check('<input name="a" readonly>')).toBe(false)
  })

  it('rejects credentials and payment fields outright', () => {
    expect(check('<input type="password" name="pw">')).toBe(false)
    expect(check('<input name="credit_card">')).toBe(false)
    expect(check('<input name="ssn">')).toBe(false)
  })

  it('rejects submit and button inputs — they are not fields', () => {
    expect(check('<input type="submit" value="Apply">')).toBe(false)
    expect(check('<input type="button" value="Next">')).toBe(false)
  })

  it('accepts textarea, select and file inputs', () => {
    expect(check('<textarea name="cover"></textarea>')).toBe(true)
    expect(check('<select name="state"><option>CA</option></select>')).toBe(true)
    expect(check('<input type="file" name="resume">')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/extension -- visibility
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write visibility.ts**

`packages/extension/src/content/harvest/visibility.ts`:

```ts
/** Names that mean "trap" or "never autofill this". */
const FORBIDDEN_NAME = /honey ?pot|bot-?field|^nickname$|captcha|csrf|password|passwd|credit|card ?number|cvv|\bssn\b|social ?security|date ?of ?birth|\bdob\b/i
const FORBIDDEN_TYPE = new Set(['hidden', 'password', 'submit', 'button', 'reset', 'image'])
const TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isFillable(el: Element, opts: { checkLayout?: boolean } = {}): boolean {
  const { checkLayout = true } = opts
  if (!TAGS.has(el.tagName)) return false

  const input = el as HTMLInputElement
  if (FORBIDDEN_TYPE.has((input.type ?? '').toLowerCase())) return false
  if (input.disabled || input.readOnly) return false
  if (el.hasAttribute('hidden')) return false
  if (el.getAttribute('aria-hidden') === 'true') return false

  const identity = `${input.name ?? ''} ${el.id ?? ''} ${el.getAttribute('autocomplete') ?? ''}`
  if (FORBIDDEN_NAME.test(identity)) return false

  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
    return false
  }

  // jsdom performs no layout, so tests pass checkLayout: false.
  if (checkLayout) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
  }

  return true
}
```

- [ ] **Step 4: Write the failing descriptor test**

`packages/extension/src/content/harvest/descriptor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { describeField } from './descriptor.js'
import { collectFields } from './collect.js'

const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
const first = (html: string) => {
  const d = parse(html)
  return describeField(d.querySelector('input, select, textarea') as HTMLElement, 'r0')
}

describe('label resolution', () => {
  it('prefers an explicit label[for]', () => {
    expect(first('<label for="x">First Name</label><input id="x">').label).toBe('First Name')
  })

  it('falls back to a wrapping label', () => {
    expect(first('<label>Email Address<input></label>').label).toBe('Email Address')
  })

  it('falls back to aria-labelledby', () => {
    expect(first('<span id="l">Phone</span><input aria-labelledby="l">').label).toBe('Phone')
  })

  it('falls back to aria-label', () => {
    expect(first('<input aria-label="LinkedIn URL">').label).toBe('LinkedIn URL')
  })

  it('falls back to placeholder last', () => {
    expect(first('<input placeholder="City">').label).toBe('City')
  })

  it('strips the required asterisk so matching is not thrown off', () => {
    expect(first('<label for="x">Last Name *</label><input id="x">').label).toBe('Last Name')
  })
})

describe('descriptor shape', () => {
  it('reads select options', () => {
    const d = first('<label for="s">Country</label><select id="s"><option>India</option><option>USA</option></select>')
    expect(d.kind).toBe('select')
    expect(d.options).toEqual(['India', 'USA'])
  })

  it('captures required and maxlength', () => {
    const d = first('<label for="x">Bio</label><textarea id="x" required maxlength="200"></textarea>')
    expect(d.kind).toBe('textarea')
    expect(d.required).toBe(true)
    expect(d.maxLength).toBe(200)
  })

  it('classifies a file input', () => {
    expect(first('<label for="x">Resume</label><input id="x" type="file">').kind).toBe('file')
  })

  it('treats an input with a listbox role as a combobox', () => {
    expect(first('<input role="combobox" aria-label="State">').kind).toBe('combobox')
  })
})

describe('collectFields', () => {
  it('skips honeypots and hidden inputs', () => {
    const d = parse(`<form>
      <label for="a">First Name</label><input id="a" name="first_name">
      <input type="hidden" name="csrf"><input name="honeypot">
    </form>`)
    const got = collectFields(d, { checkLayout: false })
    expect(got.map(f => f.descriptor.label)).toEqual(['First Name'])
  })

  it('groups radios by name into one descriptor with its options', () => {
    const d = parse(`<fieldset><legend>Are you authorized to work?</legend>
      <label><input type="radio" name="auth" value="Yes">Yes</label>
      <label><input type="radio" name="auth" value="No">No</label>
    </fieldset>`)
    const got = collectFields(d, { checkLayout: false })
    expect(got).toHaveLength(1)
    expect(got[0].descriptor.kind).toBe('radio')
    expect(got[0].descriptor.options).toEqual(['Yes', 'No'])
  })

  it('numbers repeated sections so work_experience[1] can be told from [0]', () => {
    const d = parse(`
      <fieldset><label for="a">Job Title</label><input id="a" name="title"></fieldset>
      <fieldset><label for="b">Job Title</label><input id="b" name="title"></fieldset>`)
    const got = collectFields(d, { checkLayout: false })
    expect(got.map(f => f.descriptor.sectionIndex)).toEqual([0, 1])
  })

  it('descends into open shadow roots', () => {
    const d = parse('<div id="host"></div>')
    const shadow = d.getElementById('host')!.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<label for="s">Email</label><input id="s" name="email">'
    expect(collectFields(d, { checkLayout: false }).map(f => f.descriptor.label)).toContain('Email')
  })
})
```

- [ ] **Step 5: Write descriptor.ts**

`packages/extension/src/content/harvest/descriptor.ts`:

```ts
import type { FieldDescriptor, FieldKind } from '@jaf/shared'

const clean = (s: string | null | undefined) =>
  (s ?? '').replace(/[*•]/g, ' ').replace(/\s+/g, ' ').trim()

export function resolveLabel(el: HTMLElement): string {
  const root = el.getRootNode() as Document | ShadowRoot

  if (el.id) {
    const explicit = root.querySelector(`label[for="${CSS.escape(el.id)}"]`)
    if (explicit?.textContent) return clean(explicit.textContent)
  }

  const wrapping = el.closest('label')
  if (wrapping?.textContent) return clean(wrapping.textContent)

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy.split(/\s+/)
      .map(id => root.querySelector(`#${CSS.escape(id)}`)?.textContent ?? '')
      .join(' ')
    if (clean(text)) return clean(text)
  }

  const aria = clean(el.getAttribute('aria-label'))
  if (aria) return aria

  const legend = el.closest('fieldset')?.querySelector('legend')
  if (legend?.textContent) return clean(legend.textContent)

  const prev = el.previousElementSibling
  if (prev && !prev.matches('input, select, textarea') && prev.textContent) {
    const t = clean(prev.textContent)
    if (t.length > 0 && t.length < 120) return t
  }

  return clean(el.getAttribute('placeholder'))
}

export function classify(el: HTMLElement): FieldKind {
  if (el.tagName === 'TEXTAREA') return 'textarea'
  if (el.tagName === 'SELECT') return 'select'

  const input = el as HTMLInputElement
  const type = (input.type ?? 'text').toLowerCase()
  if (type === 'file') return 'file'
  if (type === 'checkbox') return 'checkbox'
  if (type === 'radio') return 'radio'
  if (type === 'date' || type === 'month') return 'date'

  const role = el.getAttribute('role')
  if (role === 'combobox' || el.hasAttribute('aria-autocomplete') || el.hasAttribute('aria-controls')) {
    return 'combobox'
  }
  return 'text'
}

export function describeField(el: HTMLElement, ref: string, sectionIndex = 0): FieldDescriptor {
  const input = el as HTMLInputElement & HTMLSelectElement
  const kind = classify(el)

  let options: string[] = []
  if (kind === 'select') {
    options = Array.from((el as HTMLSelectElement).options)
      .map(o => clean(o.textContent))
      .filter(o => o.length > 0)
  }

  const maxLength = input.maxLength && input.maxLength > 0 ? input.maxLength : null

  return {
    ref,
    kind,
    label: resolveLabel(el),
    name: input.name || null,
    id: el.id || null,
    placeholder: el.getAttribute('placeholder'),
    ariaLabel: el.getAttribute('aria-label'),
    autocomplete: el.getAttribute('autocomplete'),
    options,
    required: input.required || el.getAttribute('aria-required') === 'true',
    maxLength,
    sectionIndex,
    nearbyText: clean(el.closest('fieldset, .field, [class*="field"]')?.textContent).slice(0, 200),
  }
}
```

- [ ] **Step 6: Write collect.ts**

`packages/extension/src/content/harvest/collect.ts`:

```ts
import type { FieldDescriptor } from '@jaf/shared'
import { isFillable } from './visibility.js'
import { describeField, resolveLabel } from './descriptor.js'

export interface HarvestedField { el: HTMLElement; descriptor: FieldDescriptor }

/** Walk the tree, descending into open shadow roots. Closed roots are unreachable. */
function walk(root: Document | ShadowRoot | Element, out: HTMLElement[]): void {
  const scope = root as ParentNode
  for (const el of Array.from(scope.querySelectorAll('input, textarea, select'))) {
    out.push(el as HTMLElement)
  }
  for (const el of Array.from(scope.querySelectorAll('*'))) {
    const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (shadow) walk(shadow, out)
  }
}

/** Repeated blocks (multiple work-experience rows) get an increasing index. */
function sectionIndexer() {
  const seen = new Map<string, number>()
  return (label: string): number => {
    const key = label.toLowerCase()
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return n
  }
}

export function collectFields(
  root: Document | ShadowRoot,
  opts: { checkLayout?: boolean } = {},
): HarvestedField[] {
  const elements: HTMLElement[] = []
  walk(root, elements)

  const out: HarvestedField[] = []
  const seenRadioGroups = new Set<string>()
  const nextIndex = sectionIndexer()
  let n = 0

  for (const el of elements) {
    if (!isFillable(el, opts)) continue

    const input = el as HTMLInputElement
    const type = (input.type ?? '').toLowerCase()

    // One descriptor per radio group, carrying every option.
    if (type === 'radio') {
      const group = input.name || resolveLabel(el)
      if (seenRadioGroups.has(group)) continue
      seenRadioGroups.add(group)

      const peers = Array.from(root.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(input.name)}"]`,
      ))
      const label = resolveLabel(el.closest('fieldset') ?? el)
      const descriptor = describeField(el, `r${n++}`, nextIndex(label))
      descriptor.label = label
      descriptor.options = peers.map(p => resolveLabel(p) || p.value).filter(Boolean)
      out.push({ el, descriptor })
      continue
    }

    const label = resolveLabel(el)
    out.push({ el, descriptor: describeField(el, `r${n++}`, nextIndex(label)) })
  }

  return out
}
```

- [ ] **Step 7: Run tests until green, then commit**

```bash
npm test -w @jaf/extension
git add -A && git commit -m "feat(extension): harvest with honeypot gate, label chain and shadow-root walk"
```

---

### Task 6: Resolver

**Files:**
- Create: `packages/extension/src/content/resolve/score.ts`
- Test: `packages/extension/src/content/resolve/score.test.ts`

**Interfaces:**
- Consumes: `CANONICAL_FIELDS`, `valueAtPath`, `FieldDescriptor`, `FillDecision`, `Profile`.
- Produces: `resolveField(d: FieldDescriptor, profile: Profile): FillDecision | null`, `resolveAll(ds: FieldDescriptor[], profile: Profile): { decisions: FillDecision[]; unresolved: FieldDescriptor[] }`, and the exported constants `HIGH = 0.85`, `LOW = 0.5`.

- [ ] **Step 1: Write the failing test**

`packages/extension/src/content/resolve/score.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { emptyProfile, type FieldDescriptor } from '@jaf/shared'
import { resolveField, resolveAll, HIGH, LOW } from './score.js'

const field = (p: Partial<FieldDescriptor>): FieldDescriptor => ({
  ref: 'r0', kind: 'text', label: '', name: null, id: null, placeholder: null,
  ariaLabel: null, autocomplete: null, options: [], required: false,
  maxLength: null, sectionIndex: 0, nearbyText: '', ...p,
})

const profile = () => {
  const p = emptyProfile()
  p.applicant_profile.personal_information.first_name = 'Ada'
  p.applicant_profile.personal_information.email = 'ada@example.com'
  p.applicant_profile.work_authorization.authorized_to_work_in_country = true
  p.applicant_profile.work_authorization.requires_sponsorship_now_or_future = false
  return p
}

describe('resolveField', () => {
  it('matches an exact label with high confidence', () => {
    const d = resolveField(field({ label: 'First Name' }), profile())
    expect(d?.value).toBe('Ada')
    expect(d!.confidence).toBeGreaterThanOrEqual(HIGH)
  })

  it('matches on the autocomplete attribute even with a useless label', () => {
    const d = resolveField(field({ label: 'fn', autocomplete: 'given-name' }), profile())
    expect(d?.value).toBe('Ada')
    expect(d!.confidence).toBeGreaterThanOrEqual(HIGH)
  })

  it('matches on the name attribute when there is no label', () => {
    expect(resolveField(field({ name: 'email' }), profile())?.value).toBe('ada@example.com')
  })

  it('matches a long natural-language question by substring', () => {
    const d = resolveField(field({
      label: 'Will you now or in the future require sponsorship for employment visa status?',
      kind: 'select', options: ['Yes', 'No'],
    }), profile())
    expect(d?.canonicalKey).toBe('requires_sponsorship')
    expect(d?.value).toBe('No')
  })

  it('picks the option that actually exists in the select', () => {
    const d = resolveField(field({
      label: 'Are you legally authorized to work?', kind: 'select',
      options: ['Yes, I am authorized', 'No, I am not'],
    }), profile())
    expect(d?.value).toBe('Yes, I am authorized')
  })

  it('returns null when nothing scores above the floor', () => {
    expect(resolveField(field({ label: 'Favourite dinosaur' }), profile())).toBeNull()
  })

  it('refuses to fill demographics while opt_in is false', () => {
    const p = profile()
    p.applicant_profile.voluntary_demographics.gender_identity = 'Female'
    expect(resolveField(field({ label: 'Gender', kind: 'select', options: ['Female', 'Male'] }), p)).toBeNull()
  })

  it('fills demographics once opt_in is true', () => {
    const p = profile()
    p.applicant_profile.voluntary_demographics.opt_in = true
    p.applicant_profile.voluntary_demographics.gender_identity = 'Female'
    expect(resolveField(field({ label: 'Gender', kind: 'select', options: ['Female', 'Male'] }), p)?.value).toBe('Female')
  })

  it('skips a canonical field whose profile value is empty', () => {
    expect(resolveField(field({ label: 'LinkedIn URL' }), profile())).toBeNull()
  })

  it('respects the field kind — a file input is never matched to a text field', () => {
    expect(resolveField(field({ label: 'First Name', kind: 'file' }), profile())).toBeNull()
  })
})

describe('resolveAll', () => {
  it('separates confident matches from fields needing AI', () => {
    const { decisions, unresolved } = resolveAll([
      field({ ref: 'a', label: 'First Name' }),
      field({ ref: 'b', label: 'Describe a time you disagreed with a manager', kind: 'textarea' }),
    ], profile())

    expect(decisions.map(d => d.ref)).toEqual(['a'])
    expect(unresolved.map(f => f.ref)).toEqual(['b'])
  })

  it('never returns a decision below the low threshold', () => {
    const { decisions } = resolveAll([field({ label: 'First Name' })], profile())
    expect(decisions.every(d => d.confidence >= LOW)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/extension -- score
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write score.ts**

`packages/extension/src/content/resolve/score.ts`:

```ts
import {
  CANONICAL_FIELDS, valueAtPath,
  type CanonicalField, type FieldDescriptor, type FillDecision, type Profile,
} from '@jaf/shared'

export const HIGH = 0.85
export const LOW = 0.5

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean))

function scoreAgainst(d: FieldDescriptor, f: CanonicalField): number {
  if (!f.kinds.includes(d.kind)) return 0

  const label = norm(d.label)
  const identity = norm(`${d.name ?? ''} ${d.id ?? ''}`)
  let best = 0

  if (d.autocomplete && f.autocomplete?.includes(d.autocomplete.trim().toLowerCase())) {
    best = Math.max(best, 0.98)
  }

  for (const syn of f.synonyms) {
    const s = norm(syn)
    if (label === s) { best = Math.max(best, 0.95); continue }
    if (label.includes(s)) {
      // A long synonym covering most of the label is stronger evidence than a
      // short one buried in a long question. Weight by coverage so the best
      // synonym wins on merit rather than on registry order.
      best = Math.max(best, Math.min(0.94, 0.8 + 0.15 * (s.length / label.length)))
      continue
    }
    if (identity.includes(s.replace(/ /g, '')) || identity.includes(s)) {
      best = Math.max(best, 0.88)
    }
  }

  // Token overlap catches wording the synonym list did not anticipate.
  if (best === 0 && label) {
    const lt = tokens(label)
    for (const syn of f.synonyms) {
      const st = tokens(syn)
      const hits = [...st].filter(t => lt.has(t)).length
      if (hits > 0) best = Math.max(best, 0.4 + 0.3 * (hits / st.size))
    }
  }

  return best
}

/** For selects and radios, only an option that really exists can be used. */
function matchOption(value: string, options: string[]): string | null {
  if (options.length === 0) return value
  const v = norm(value)
  return (
    options.find(o => norm(o) === v) ??
    options.find(o => norm(o).startsWith(v)) ??
    options.find(o => norm(o).includes(v)) ??
    null
  )
}

export function resolveField(d: FieldDescriptor, profile: Profile): FillDecision | null {
  let best: CanonicalField | null = null
  let bestScore = 0

  for (const f of CANONICAL_FIELDS) {
    const s = scoreAgainst(d, f)
    if (s > bestScore) { bestScore = s; best = f }
  }
  if (!best || bestScore < LOW) return null

  // Virtual fields (resume, cover letter) have no string value — M4 uploads them.
  if (best.virtual) return null

  // Sensitive data stays untouched until the user opts in.
  if (best.sensitive && !profile.applicant_profile.voluntary_demographics.opt_in) return null

  let value: string
  try { value = valueAtPath(profile, best.path) } catch { return null }
  if (!value) return null

  if (d.kind === 'select' || d.kind === 'radio') {
    const picked = matchOption(value, d.options)
    if (!picked) return null
    value = picked
  }

  return {
    ref: d.ref,
    value,
    confidence: bestScore,
    source: 'heuristic',
    canonicalKey: best.key,
    reason: `matched "${d.label || d.name || d.ref}" to ${best.key}`,
  }
}

export function resolveAll(descriptors: FieldDescriptor[], profile: Profile) {
  const decisions: FillDecision[] = []
  const unresolved: FieldDescriptor[] = []

  for (const d of descriptors) {
    const decision = resolveField(d, profile)
    if (decision) decisions.push(decision)
    else unresolved.push(d)     // M4 hands these to the Claude CLI
  }
  return { decisions, unresolved }
}
```

- [ ] **Step 4: Run tests until green, then commit**

```bash
npm test -w @jaf/extension
git add -A && git commit -m "feat(extension): heuristic field resolver with confidence tiers"
```

---

### Task 7: Fill strategies and the no-submit guard

**Files:**
- Create: `packages/extension/src/content/fill/guard.ts`, `setters.ts`, `apply.ts`
- Test: `packages/extension/src/content/fill/guard.test.ts`, `setters.test.ts`

**Interfaces:**
- Consumes: `FillDecision`, `FillResult`; `HarvestedField` from `../harvest/collect.js`.
- Produces:
  - `isSubmitControl(el: Element): boolean`
  - `setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void`
  - `fillText`, `fillSelect`, `fillRadio`, `fillCheckbox` — each `(el, value) => boolean`
  - `applyDecisions(fields: HarvestedField[], decisions: FillDecision[]): FillResult[]`

- [ ] **Step 1: Write the failing guard test**

`packages/extension/src/content/fill/guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isSubmitControl } from './guard.js'

const el = (html: string) => {
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return d.body.firstElementChild!
}

describe('isSubmitControl — the never-submit guard', () => {
  it('catches input[type=submit]', () => { expect(isSubmitControl(el('<input type="submit">'))).toBe(true) })
  it('catches button[type=submit]', () => { expect(isSubmitControl(el('<button type="submit">Go</button>'))).toBe(true) })
  it('catches a bare button, which submits by default inside a form', () => {
    expect(isSubmitControl(el('<button>Send</button>'))).toBe(true)
  })
  it('catches submit-like text on a link', () => {
    expect(isSubmitControl(el('<a href="#">Submit Application</a>'))).toBe(true)
    expect(isSubmitControl(el('<a href="#">Apply Now</a>'))).toBe(true)
  })
  it('leaves an ordinary text input alone', () => {
    expect(isSubmitControl(el('<input type="text">'))).toBe(false)
  })
  it('leaves a type=button control alone', () => {
    expect(isSubmitControl(el('<button type="button">Add another</button>'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/extension -- guard
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write guard.ts**

`packages/extension/src/content/fill/guard.ts`:

```ts
const SUBMIT_TEXT = /\b(submit|apply now|send application|finish|complete application)\b/i

/**
 * The single chokepoint for "never auto-submit". Nothing in the fill layer may
 * click an element this returns true for — adapters do not get a say.
 */
export function isSubmitControl(el: Element): boolean {
  const tag = el.tagName
  const type = (el.getAttribute('type') ?? '').toLowerCase()

  if (tag === 'INPUT' && (type === 'submit' || type === 'image')) return true
  // A <button> with no type submits its form by default.
  if (tag === 'BUTTON' && (type === 'submit' || type === '')) return true

  return SUBMIT_TEXT.test(el.textContent ?? '')
}
```

- [ ] **Step 4: Write the failing setters test**

`packages/extension/src/content/fill/setters.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { setNativeValue, fillText, fillSelect, fillRadio, fillCheckbox } from './setters.js'

const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

describe('setNativeValue', () => {
  it('writes the value', () => {
    const input = parse('<input>').querySelector('input')!
    setNativeValue(input, 'Ada')
    expect(input.value).toBe('Ada')
  })

  it('dispatches bubbling input and change so React notices', () => {
    const input = parse('<input>').querySelector('input')!
    const seen: string[] = []
    input.addEventListener('input', e => seen.push(`input:${e.bubbles}`))
    input.addEventListener('change', e => seen.push(`change:${e.bubbles}`))
    setNativeValue(input, 'Ada')
    expect(seen).toEqual(['input:true', 'change:true'])
  })

  it('uses the prototype setter, not the instance property', () => {
    const input = parse('<input>').querySelector('input')!
    // A React-controlled input shadows `value` with its own instance setter.
    const shadowed = vi.fn()
    Object.defineProperty(input, 'value', { set: shadowed, get: () => '', configurable: true })
    setNativeValue(input, 'Ada')
    expect(shadowed).not.toHaveBeenCalled()
  })

  it('works on a textarea too', () => {
    const ta = parse('<textarea></textarea>').querySelector('textarea')!
    setNativeValue(ta, 'cover letter')
    expect(ta.value).toBe('cover letter')
  })
})

describe('fillSelect', () => {
  const sel = () => parse('<select><option value="">Pick</option><option>India</option><option>United States</option></select>')
    .querySelector('select')!

  it('selects an exact option', () => {
    const s = sel(); expect(fillSelect(s, 'India')).toBe(true); expect(s.value).toBe('India')
  })
  it('selects case-insensitively', () => {
    const s = sel(); expect(fillSelect(s, 'india')).toBe(true); expect(s.value).toBe('India')
  })
  it('falls back to a substring match', () => {
    const s = sel(); expect(fillSelect(s, 'United')).toBe(true); expect(s.value).toBe('United States')
  })
  it('refuses rather than picking the wrong option', () => {
    const s = sel(); expect(fillSelect(s, 'Atlantis')).toBe(false); expect(s.value).toBe('')
  })
})

describe('fillRadio and fillCheckbox', () => {
  it('checks the radio whose label matches', () => {
    const d = parse(`<label><input type="radio" name="a" value="Yes">Yes</label>
                     <label><input type="radio" name="a" value="No">No</label>`)
    const first = d.querySelector('input')!
    expect(fillRadio(first, 'No')).toBe(true)
    expect(d.querySelectorAll<HTMLInputElement>('input')[1].checked).toBe(true)
  })

  it('refuses when no radio option matches', () => {
    const d = parse('<label><input type="radio" name="a" value="Yes">Yes</label>')
    expect(fillRadio(d.querySelector('input')!, 'Maybe')).toBe(false)
  })

  it('checks a checkbox for an affirmative value', () => {
    const cb = parse('<input type="checkbox">').querySelector('input')!
    expect(fillCheckbox(cb, 'Yes')).toBe(true)
    expect(cb.checked).toBe(true)
  })

  it('leaves a checkbox unchecked for a negative value', () => {
    const cb = parse('<input type="checkbox">').querySelector('input')!
    fillCheckbox(cb, 'No')
    expect(cb.checked).toBe(false)
  })
})

describe('fillText truncation', () => {
  it('truncates to maxlength at a word boundary', () => {
    const input = parse('<input maxlength="10">').querySelector('input')!
    fillText(input, 'hello wonderful world')
    expect(input.value.length).toBeLessThanOrEqual(10)
    expect(input.value).toBe('hello')
  })
})
```

- [ ] **Step 5: Write setters.ts**

`packages/extension/src/content/fill/setters.ts`:

```ts
const AFFIRMATIVE = /^(yes|true|i agree|agree|accept|1)$/i

/**
 * React, Vue and Angular install their own `value` setter on the element
 * instance and ignore writes that skip it. Going through the prototype setter
 * and then dispatching bubbling events is the only reliable way in.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value

  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Cut at a word boundary so a truncated answer still reads as a sentence. */
function truncate(value: string, max: number | null): string {
  if (!max || value.length <= max) return value
  const cut = value.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space >= max * 0.5 ? cut.slice(0, space) : cut).trim()
}

export function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  const max = el.maxLength && el.maxLength > 0 ? el.maxLength : null
  setNativeValue(el, truncate(value, max))
  return true
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const v = norm(value)
  const options = Array.from(el.options)
  const hit =
    options.find(o => norm(o.textContent ?? '') === v || norm(o.value) === v) ??
    options.find(o => norm(o.textContent ?? '').startsWith(v)) ??
    options.find(o => norm(o.textContent ?? '').includes(v))

  if (!hit) return false
  el.value = hit.value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export function fillRadio(el: HTMLInputElement, value: string): boolean {
  const root = el.getRootNode() as Document | ShadowRoot
  const peers = el.name
    ? Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]`))
    : [el]

  const v = norm(value)
  const text = (p: HTMLInputElement) => norm(p.closest('label')?.textContent ?? p.value ?? '')
  const hit = peers.find(p => text(p) === v) ?? peers.find(p => text(p).includes(v))
  if (!hit) return false

  hit.click()                 // click, so framework handlers run
  if (!hit.checked) {
    hit.checked = true
    hit.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return true
}

export function fillCheckbox(el: HTMLInputElement, value: string): boolean {
  const want = AFFIRMATIVE.test(value.trim())
  if (el.checked !== want) {
    el.click()
    if (el.checked !== want) {
      el.checked = want
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }
  return true
}
```

- [ ] **Step 6: Write apply.ts**

`packages/extension/src/content/fill/apply.ts`:

```ts
import type { FillDecision, FillResult } from '@jaf/shared'
import type { HarvestedField } from '../harvest/collect.js'
import { isSubmitControl } from './guard.js'
import { fillText, fillSelect, fillRadio, fillCheckbox } from './setters.js'

/** What we wrote, so a re-fill can tell our value from the user's edit. */
const written = new WeakMap<HTMLElement, string>()

export function applyDecisions(fields: HarvestedField[], decisions: FillDecision[]): FillResult[] {
  const byRef = new Map(fields.map(f => [f.descriptor.ref, f]))

  return decisions.map<FillResult>(d => {
    const field = byRef.get(d.ref)
    if (!field) {
      return { ref: d.ref, label: '', outcome: 'failed', value: d.value,
               confidence: d.confidence, source: d.source, note: 'element went away' }
    }

    const { el, descriptor } = field
    const base = { ref: d.ref, label: descriptor.label, value: d.value,
                   confidence: d.confidence, source: d.source }

    if (isSubmitControl(el)) {
      return { ...base, outcome: 'skipped', note: 'refused: submit control' }
    }

    // The user edited this since we wrote it — leave their value alone.
    const prior = written.get(el)
    const current = (el as HTMLInputElement).value
    if (prior !== undefined && current !== prior) {
      return { ...base, outcome: 'skipped', note: 'you edited this' }
    }

    let ok = false
    switch (descriptor.kind) {
      case 'text': case 'textarea': case 'date':
        ok = fillText(el as HTMLInputElement, d.value); break
      case 'select':
        ok = fillSelect(el as HTMLSelectElement, d.value); break
      case 'radio':
        ok = fillRadio(el as HTMLInputElement, d.value); break
      case 'checkbox':
        ok = fillCheckbox(el as HTMLInputElement, d.value); break
      case 'combobox': case 'file':
        return { ...base, outcome: 'needs-user', note: `${descriptor.kind} handled in a later milestone` }
    }

    if (!ok) return { ...base, outcome: 'failed', note: 'no matching option' }

    const finalValue = (el as HTMLInputElement).value
    written.set(el, finalValue)

    // Spec §4.6: a value we had to cut short must be reviewed, never filled silently.
    const truncated = finalValue.length < d.value.length
    const note = truncated ? 'shortened to fit — please check'
               : d.confidence >= 0.85 ? ''
               : 'please verify'

    return { ...base, value: finalValue, outcome: 'filled', note }
  })
}
```

- [ ] **Step 7: Run tests until green, then commit**

```bash
npm test -w @jaf/extension
git add -A && git commit -m "feat(extension): fill strategies, native setters and never-submit guard"
```

---

### Task 8: Widget and end-to-end wiring

**Files:**
- Create: `packages/extension/src/content/index.ts`
- Create: `packages/extension/src/content/widget/mount.ts`, `Widget.tsx`, `widget.css`
- Create: `packages/extension/src/content/observe.ts`
- Test: manual, against real postings (below)

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces: the running extension.

- [ ] **Step 1: Write the shadow-root mount**

`packages/extension/src/content/widget/mount.ts`:

```ts
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import css from './widget.css?inline'
import { Widget } from './Widget.js'

let root: Root | null = null

/**
 * Open shadow root with adopted styles: host CSS cannot reach in, and our
 * Tailwind cannot leak out onto the page.
 */
export function mountWidget(): void {
  if (document.getElementById('jaf-root')) return

  const host = document.createElement('div')
  host.id = 'jaf-root'
  host.style.cssText = 'position:fixed;z-index:2147483647;bottom:0;right:0;'
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  shadow.adoptedStyleSheets = [sheet]

  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)
  root = createRoot(mountPoint)
  root.render(createElement(Widget))
}
```

- [ ] **Step 2: Write the widget**

`packages/extension/src/content/widget/Widget.tsx` renders the sticky FAB and,
when open, the review list. It holds `FillResult[]` in state and calls back
into the content script to run a fill.

```tsx
import { useState } from 'react'
import type { FillResult } from '@jaf/shared'

const BADGE: Record<FillResult['outcome'], string> = {
  filled: 'bg-green-100 text-green-800',
  skipped: 'bg-neutral-100 text-neutral-700',
  failed: 'bg-red-100 text-red-800',
  'needs-user': 'bg-amber-100 text-amber-900',
}

export function Widget() {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<FillResult[]>([])
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    const r = await window.__jafFill()      // installed by content/index.ts
    setResults(r)
    setBusy(false)
    setOpen(true)
  }

  const counts = {
    filled: results.filter(r => r.outcome === 'filled').length,
    attention: results.filter(r => r.outcome !== 'filled').length,
  }

  return (
    <div className="fixed bottom-4 right-4 font-sans text-sm">
      {open && (
        <div className="mb-3 max-h-[60vh] w-96 overflow-auto rounded-xl border border-neutral-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b p-3">
            <strong>{counts.filled} filled · {counts.attention} to check</strong>
            <button onClick={() => setOpen(false)} className="text-neutral-500">Close</button>
          </div>
          <ul className="divide-y">
            {results.map(r => (
              <li key={r.ref} className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.label || r.ref}</div>
                  <div className="truncate text-neutral-500">{r.value || r.note}</div>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${BADGE[r.outcome]}`}>{r.outcome}</span>
              </li>
            ))}
          </ul>
          <p className="border-t p-3 text-xs text-neutral-500">
            Nothing is ever submitted for you. Review, then click Submit yourself.
          </p>
        </div>
      )}

      <button onClick={run} disabled={busy}
              className="rounded-full bg-neutral-900 px-5 py-3 font-medium text-white shadow-xl disabled:opacity-60">
        {busy ? 'Filling…' : 'Fill application'}
      </button>
    </div>
  )
}
```

`widget.css` holds the compiled Tailwind for the widget. Add a second Tailwind
entry whose `content` globs only `src/content/widget/**`.

- [ ] **Step 3: Write the content entry point**

`packages/extension/src/content/index.ts`:

```ts
import type { FillResult } from '@jaf/shared'
import { detectAts } from './detect/registry.js'
import { collectFields } from './harvest/collect.js'
import { resolveAll } from './resolve/score.js'
import { applyDecisions } from './fill/apply.js'
import { mountWidget } from './widget/mount.js'
import { watchForChanges } from './observe.js'

declare global {
  interface Window { __jafFill: () => Promise<FillResult[]> }
}

async function fill(): Promise<FillResult[]> {
  const { profile } = await chrome.runtime.sendMessage({ type: 'jaf.sync' })
  if (!profile) return []

  const fields = collectFields(document)
  const { decisions, unresolved } = resolveAll(fields.map(f => f.descriptor), profile)

  const results = applyDecisions(fields, decisions)
  // M4 sends `unresolved` to the Claude CLI; until then they are surfaced as-is.
  for (const d of unresolved) {
    results.push({ ref: d.ref, label: d.label, outcome: 'needs-user', value: '',
                   confidence: 0, source: 'heuristic', note: 'no confident match' })
  }
  return results
}

function boot(): void {
  if (!detectAts(location.href, document)) return
  window.__jafFill = fill
  mountWidget()
}

boot()
watchForChanges(boot)   // multi-step wizards re-render without a page load
```

- [ ] **Step 4: Write observe.ts**

`packages/extension/src/content/observe.ts`:

```ts
/** SPA wizards change step without a navigation, so watch both the URL and the DOM. */
export function watchForChanges(onChange: () => void): void {
  let lastUrl = location.href
  let timer: number | undefined

  const fire = () => {
    clearTimeout(timer)
    timer = window.setTimeout(onChange, 300)   // let lazy fields render first
  }

  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; fire() }
  }).observe(document, { subtree: true, childList: true })

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = original.apply(this, args)
      fire()
      return r
    }
  }
  window.addEventListener('popstate', fire)
}
```

- [ ] **Step 5: Build and load the extension**

```bash
npm run build -w @jaf/extension
```

In Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** →
select `packages/extension/dist`. Open the extension's options page and paste
the token from `npm run start -w @jaf/server`.

- [ ] **Step 6: Verify against real postings**

Open a live Greenhouse posting (`job-boards.greenhouse.io/…`) and a live Lever
posting (`jobs.lever.co/…/apply`). For each, confirm:

- The **Fill application** button appears.
- Clicking it fills first name, last name, email and phone.
- The review panel lists every field with a badge.
- **Nothing is submitted.** The page stays on the form.
- Editing a filled field then re-running leaves your edit intact.

Record anything that failed to fill in `docs/ats/findings.md` — that file is the
input to the M4 and M5 plans.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(extension): shadow-DOM widget, review panel and end-to-end fill"
```

---

## Edge cases deliberately deferred past M3

These are in spec §4 and are **not** bugs in this plan. Each is listed with the
milestone that closes it, so a reviewer can tell a gap from a decision.

| Spec § | Edge case | Handled here | Closed by |
|---|---|---|---|
| 4.5 | Repeated blocks map to `work_experience[N]` | Harvest records `sectionIndex`; the registry has no per-index entries yet | M5 |
| 4.7 | Phone split across a country-code select and a number input | Not attempted — the number field fills, the code select is left alone | M5 |
| 4.8 | Address and school autocomplete comboboxes | Classified as `combobox`, reported `needs-user` | M5 |
| 4.12 | Workday account-creation gate | Detection only | M4 |
| 4.15 | Prompt injection from job descriptions | No AI call exists yet | M4 |
| 4.17 | Command injection in the CLI bridge | No CLI call exists yet | M4 |
| 4.19–21 | CLI unauthenticated / rate limited / hung | No CLI call exists yet | M4 |

Resume and cover-letter upload (both `virtual` in the registry) land in M5 with
the other fill strategies. M4 adds the AI fallback that consumes `resolveAll`'s
`unresolved` list.

## M2 + M3 Definition of Done

- [ ] `npm test` green at the repo root
- [ ] Extension loads unpacked with no console errors
- [ ] Widget appears on Greenhouse and Lever, and stays away on `example.com`
- [ ] Name, email and phone fill correctly on a **real** posting of each
- [ ] Review panel shows a badge per field, with counts in its header
- [ ] Honeypot and hidden inputs are provably untouched
- [ ] No submit button is ever clicked
- [ ] `docs/ats/findings.md` records what did not fill, for M4 and M5
