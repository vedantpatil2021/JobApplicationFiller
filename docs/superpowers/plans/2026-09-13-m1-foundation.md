# M1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running local server that owns `profile.yaml`, and a React page where you edit every field of it and see it persist.

**Architecture:** npm workspaces monorepo. `@jaf/shared` holds a zod profile schema imported by both other packages so they can never drift. `@jaf/server` is a small Express app bound to loopback that reads and writes a single YAML file atomically. `@jaf/controller` is a Vite React app whose dev server proxies `/api` and injects the pairing token, so the browser never holds the token.

**Tech Stack:** Node 22, TypeScript strict, zod, Express 4, js-yaml, Vitest, Supertest, React 18, Vite, Tailwind, Radix.

**Spec:** `docs/superpowers/specs/2026-09-13-job-application-filler-design.md`

## Global Constraints

See `PLAN.md` → Global Constraints. Every task inherits them. The ones that bite in M1:

- Server binds `127.0.0.1` only, never `0.0.0.0`.
- All `/api` routes require the `X-JAF-Token` header.
- `profile/` is gitignored. Never commit a real profile.
- TypeScript `strict: true`. Vitest, not Jest.
- No gluestack, no react-native-web.

---

### Task 1: Workspace scaffold and profile schema

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/schema/profile.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/schema/profile.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ProfileSchema` (zod), `type Profile`, `emptyProfile(): Profile`. Every later task imports these from `@jaf/shared`.

- [ ] **Step 1: Initialise the workspace**

```bash
cd /Users/vedant/Documents/Claude/Projects/JobApplicationFiller
git init
mkdir -p packages/shared/src/schema profile/resumes
```

Root `package.json`:

```json
{
  "name": "job-application-filler",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "verbatimModuleSyntax": true
  }
}
```

`.gitignore`:

```
node_modules/
dist/
profile/
!profile/.gitkeep
.env
*.log
```

- [ ] **Step 2: Create the shared package**

`packages/shared/package.json`:

```json
{
  "name": "@jaf/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "dependencies": { "zod": "^3.23.8" },
  "devDependencies": { "vitest": "^2.1.8", "typescript": "^5.7.2" }
}
```

`packages/shared/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

Then install:

```bash
npm install
```

- [ ] **Step 3: Write the failing test**

`packages/shared/src/schema/profile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ProfileSchema, emptyProfile } from './profile.js'

describe('ProfileSchema', () => {
  it('fills every section with defaults from an empty object', () => {
    const p = ProfileSchema.parse({})
    expect(p.applicant_profile.personal_information.first_name).toBe('')
    expect(p.applicant_profile.personal_information.address.city).toBe('')
    expect(p.applicant_profile.work_experience).toEqual([])
    expect(p.applicant_profile.work_authorization.authorized_to_work_in_country).toBe(true)
    expect(p.applicant_profile.consents.opt_in_sms_notifications).toBe(false)
  })

  it('defaults demographics opt-in to false because the data is sensitive', () => {
    const p = ProfileSchema.parse({})
    expect(p.applicant_profile.voluntary_demographics.opt_in).toBe(false)
  })

  it('accepts a valid email and rejects a malformed one', () => {
    const ok = ProfileSchema.safeParse({
      applicant_profile: { personal_information: { email: 'a@b.com' } },
    })
    expect(ok.success).toBe(true)

    const bad = ProfileSchema.safeParse({
      applicant_profile: { personal_information: { email: 'not-an-email' } },
    })
    expect(bad.success).toBe(false)
  })

  it('allows an empty email so a half-filled profile still saves', () => {
    const r = ProfileSchema.safeParse({
      applicant_profile: { personal_information: { email: '' } },
    })
    expect(r.success).toBe(true)
  })

  it('round-trips a work experience entry', () => {
    const p = ProfileSchema.parse({
      applicant_profile: {
        work_experience: [
          { job_title: 'Engineer', company_name: 'Acme', start_date: '2023-01', is_current_role: true },
        ],
      },
    })
    expect(p.applicant_profile.work_experience[0].job_title).toBe('Engineer')
    expect(p.applicant_profile.work_experience[0].end_date).toBe('')
  })

  it('emptyProfile() produces a value that parses cleanly', () => {
    expect(ProfileSchema.safeParse(emptyProfile()).success).toBe(true)
  })
})
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npm test -w @jaf/shared
```

Expected: FAIL — `Cannot find module './profile.js'`.

- [ ] **Step 5: Write the schema**

`packages/shared/src/schema/profile.ts`. Mirrors the YAML in `ABOUT.md` section by section. Every string defaults to `''` so a partially filled profile always saves.

```ts
import { z } from 'zod'

const str = () => z.string().default('')
const bool = (d: boolean) => z.boolean().default(d)

/** Empty string is allowed so a half-filled profile still persists. */
const emailish = z.union([z.string().email(), z.literal('')]).default('')

export const AddressSchema = z.object({
  street: str(), city: str(), state: str(),
  postal_code: str(), country: str(),
}).default({})

export const PersonalInformationSchema = z.object({
  first_name: str(), last_name: str(),
  email: emailish, phone_number: str(),
  address: AddressSchema,
  linkedin_url: str(), portfolio_url: str(),
}).default({})

export const WorkExperienceSchema = z.object({
  job_title: str(), company_name: str(), location: str(),
  start_date: str(),          // YYYY-MM
  end_date: str(),            // YYYY-MM or "Present"
  is_current_role: bool(false),
  description: str(),
})

export const WorkAuthorizationSchema = z.object({
  authorized_to_work_in_country: bool(true),
  requires_sponsorship_now_or_future: bool(false),
  visa_status: str(),
}).default({})

export const GovernmentComplianceSchema = z.object({
  is_former_government_employee: bool(false),
  clearance_level: str(),
  export_control_status: str(),
}).default({})

export const ESignatureSchema = z.object({
  full_name: str(),
  date: str(),                // YYYY-MM-DD
  attestation_agreed: bool(true),
}).default({})

export const ConsentsSchema = z.object({
  agree_to_privacy_policy: bool(true),
  agree_to_terms_and_conditions: bool(true),
  opt_in_talent_community: bool(false),
  opt_in_sms_notifications: bool(false),
}).default({})

export const SourceAttributionSchema = z.object({
  how_did_you_hear_about_us: str(),
}).default({})

/**
 * Sensitive. `opt_in` gates whether the extension is allowed to fill any of
 * these fields — see spec §4 edge case 3. Defaults to false deliberately.
 */
export const VoluntaryDemographicsSchema = z.object({
  opt_in: bool(false),
  gender_identity: str(),
  transgender_status: str(),
  race_ethnicity: str(),
  sexual_orientation: str(),
  veteran_status: str(),
  disability_status: str(),
}).default({})

export const ApplicantProfileSchema = z.object({
  personal_information: PersonalInformationSchema,
  work_experience: z.array(WorkExperienceSchema).default([]),
  work_authorization: WorkAuthorizationSchema,
  government_compliance: GovernmentComplianceSchema,
  e_signature: ESignatureSchema,
  consents: ConsentsSchema,
  source_attribution: SourceAttributionSchema,
  voluntary_demographics: VoluntaryDemographicsSchema,
}).default({})

export const ProfileSchema = z.object({
  version: z.literal(1).default(1),
  applicant_profile: ApplicantProfileSchema,
})

export type Profile = z.infer<typeof ProfileSchema>
export type WorkExperience = z.infer<typeof WorkExperienceSchema>

export function emptyProfile(): Profile {
  return ProfileSchema.parse({})
}
```

`packages/shared/src/index.ts`:

```ts
export * from './schema/profile.js'
```

- [ ] **Step 6: Run tests until green**

```bash
npm test -w @jaf/shared
```

Expected: 6 passing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shared): workspace scaffold and zod profile schema"
```

---

### Task 2: Atomic YAML store

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `packages/server/vitest.config.ts`
- Create: `packages/server/src/storage/paths.ts`, `packages/server/src/storage/yaml-store.ts`
- Test: `packages/server/src/storage/yaml-store.test.ts`

**Interfaces:**
- Consumes: `ProfileSchema`, `Profile`, `emptyProfile` from `@jaf/shared`.
- Produces: `readProfile(dir: string): Promise<Profile>`, `writeProfile(dir: string, p: Profile): Promise<void>`, `profilePath(dir: string): string`, `resumesDir(dir: string): string`, `tokenPath(dir: string): string`.

Every function takes the data directory as its first argument. No module-level
state — that is what makes these testable against a temp directory.

- [ ] **Step 1: Create the server package**

`packages/server/package.json`:

```json
{
  "name": "@jaf/server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@jaf/shared": "*",
    "express": "^4.21.2",
    "cors": "^2.8.5",
    "js-yaml": "^4.1.0",
    "multer": "^1.4.5-lts.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.17",
    "@types/js-yaml": "^4.0.9",
    "@types/multer": "^1.4.12",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`packages/server/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

```bash
npm install
```

- [ ] **Step 2: Write the failing test**

`packages/server/src/storage/yaml-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readProfile, writeProfile, profilePath } from './yaml-store.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'jaf-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('yaml-store', () => {
  it('returns a default profile when the file does not exist', async () => {
    const p = await readProfile(dir)
    expect(p.applicant_profile.personal_information.first_name).toBe('')
  })

  it('creates the file on first read so the user has something to edit', async () => {
    await readProfile(dir)
    const raw = await readFile(profilePath(dir), 'utf8')
    expect(raw).toContain('applicant_profile')
  })

  it('round-trips a written profile', async () => {
    const p = await readProfile(dir)
    p.applicant_profile.personal_information.first_name = 'Ada'
    await writeProfile(dir, p)
    expect((await readProfile(dir)).applicant_profile.personal_information.first_name).toBe('Ada')
  })

  it('writes human-readable YAML, not JSON', async () => {
    const p = await readProfile(dir)
    p.applicant_profile.personal_information.last_name = 'Lovelace'
    await writeProfile(dir, p)
    const raw = await readFile(profilePath(dir), 'utf8')
    expect(raw).toContain('last_name: Lovelace')
  })

  it('leaves no temp file behind after a write', async () => {
    const { readdir } = await import('node:fs/promises')
    await writeProfile(dir, await readProfile(dir))
    const files = await readdir(dir)
    expect(files.filter(f => f.includes('.tmp'))).toEqual([])
  })

  it('throws a clear error on malformed YAML rather than returning junk', async () => {
    await writeFile(profilePath(dir), 'applicant_profile: [this is not an object')
    await expect(readProfile(dir)).rejects.toThrow(/profile\.yaml/)
  })

  it('backfills sections missing from a hand-edited file', async () => {
    await writeFile(profilePath(dir), 'version: 1\napplicant_profile:\n  personal_information:\n    first_name: Grace\n')
    const p = await readProfile(dir)
    expect(p.applicant_profile.personal_information.first_name).toBe('Grace')
    expect(p.applicant_profile.consents.agree_to_privacy_policy).toBe(true)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npm test -w @jaf/server
```

Expected: FAIL — `Cannot find module './yaml-store.js'`.

- [ ] **Step 4: Write paths.ts**

`packages/server/src/storage/paths.ts`:

```ts
import { join } from 'node:path'

export const profilePath = (dir: string) => join(dir, 'profile.yaml')
export const resumesDir  = (dir: string) => join(dir, 'resumes')
export const tokenPath   = (dir: string) => join(dir, '.token')
export const answersPath = (dir: string) => join(dir, 'answers.json')
export const appsPath    = (dir: string) => join(dir, 'applications.json')
```

- [ ] **Step 5: Write yaml-store.ts**

`packages/server/src/storage/yaml-store.ts`:

```ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dump, load } from 'js-yaml'
import { ProfileSchema, emptyProfile, type Profile } from '@jaf/shared'
import { profilePath } from './paths.js'

export { profilePath }

export async function readProfile(dir: string): Promise<Profile> {
  let raw: string
  try {
    raw = await readFile(profilePath(dir), 'utf8')
  } catch {
    // First run: create the file so the user has something to hand-edit.
    const fresh = emptyProfile()
    await writeProfile(dir, fresh)
    return fresh
  }

  let parsed: unknown
  try {
    parsed = load(raw)
  } catch (e) {
    throw new Error(`profile.yaml is not valid YAML: ${(e as Error).message}`)
  }

  const result = ProfileSchema.safeParse(parsed ?? {})
  if (!result.success) {
    throw new Error(`profile.yaml failed validation: ${result.error.message}`)
  }
  return result.data
}

/** Write to a temp file then rename, so a crash mid-write cannot truncate the profile. */
export async function writeProfile(dir: string, profile: Profile): Promise<void> {
  await mkdir(dir, { recursive: true })
  const target = profilePath(dir)
  const tmp = `${target}.${process.pid}.tmp`
  await writeFile(tmp, dump(profile, { indent: 2, lineWidth: 100, noRefs: true }), 'utf8')
  await rename(tmp, target)
}
```

- [ ] **Step 6: Run tests until green**

```bash
npm test -w @jaf/server
```

Expected: 7 passing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(server): atomic YAML profile store"
```

---

### Task 3: Express app, pairing token, CORS lock, health

**Files:**
- Create: `packages/server/src/auth.ts`, `packages/server/src/app.ts`, `packages/server/src/index.ts`
- Create: `packages/server/src/routes/health.ts`
- Test: `packages/server/src/auth.test.ts`

**Interfaces:**
- Consumes: `tokenPath` from `./storage/paths.js`.
- Produces: `ensureToken(dir: string): Promise<string>`, `createApp(opts: { dataDir: string; token: string }): express.Express`. Later tasks add routers to `createApp`.

`createApp` is separated from `index.ts` so Supertest can drive the app without
binding a port.

- [ ] **Step 1: Write the failing test**

`packages/server/src/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { ensureToken } from './auth.js'
import { createApp } from './app.js'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'jaf-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('pairing token', () => {
  it('generates a 64-char hex token on first run', async () => {
    expect(await ensureToken(dir)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns the same token on subsequent runs', async () => {
    expect(await ensureToken(dir)).toBe(await ensureToken(dir))
  })
})

describe('auth middleware', () => {
  it('rejects an /api request with no token', async () => {
    const app = createApp({ dataDir: dir, token: 'secret' })
    await request(app).get('/api/health').expect(401)
  })

  it('rejects an /api request with the wrong token', async () => {
    const app = createApp({ dataDir: dir, token: 'secret' })
    await request(app).get('/api/health').set('X-JAF-Token', 'nope').expect(401)
  })

  it('accepts an /api request with the right token', async () => {
    const app = createApp({ dataDir: dir, token: 'secret' })
    const res = await request(app).get('/api/health').set('X-JAF-Token', 'secret').expect(200)
    expect(res.body.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/server -- auth
```

Expected: FAIL — `Cannot find module './auth.js'`.

- [ ] **Step 3: Write auth.ts**

`packages/server/src/auth.ts`:

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { tokenPath } from './storage/paths.js'

export async function ensureToken(dir: string): Promise<string> {
  try {
    const existing = (await readFile(tokenPath(dir), 'utf8')).trim()
    if (/^[0-9a-f]{64}$/.test(existing)) return existing
  } catch { /* fall through and mint a new one */ }

  const token = randomBytes(32).toString('hex')
  await mkdir(dir, { recursive: true })
  await writeFile(tokenPath(dir), token, { encoding: 'utf8', mode: 0o600 })
  return token
}

/**
 * Any website you visit can reach 127.0.0.1. A custom header forces a CORS
 * preflight, and our CORS allowlist rejects unknown origins — so a hostile
 * page cannot even send this request.
 */
export function requireToken(expected: string): RequestHandler {
  const want = Buffer.from(expected)
  return (req, res, next) => {
    const got = Buffer.from(String(req.header('X-JAF-Token') ?? ''))
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      res.status(401).json({ error: 'bad or missing X-JAF-Token' })
      return
    }
    next()
  }
}
```

- [ ] **Step 4: Write health.ts and app.ts**

`packages/server/src/routes/health.ts`:

```ts
import { Router } from 'express'

export function healthRouter(): Router {
  const r = Router()
  r.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'jaf-server', version: 1 })
  })
  return r
}
```

`packages/server/src/app.ts`:

```ts
import express from 'express'
import cors from 'cors'
import { requireToken } from './auth.js'
import { healthRouter } from './routes/health.js'

export interface AppOptions { dataDir: string; token: string }

/** Only these origins may talk to the server. Everything else is refused. */
const ALLOWED_ORIGIN = /^(http:\/\/(localhost|127\.0\.0\.1):5173|chrome-extension:\/\/[a-p]{32})$/

export function createApp(opts: AppOptions): express.Express {
  const app = express()

  app.use(cors({
    origin: (origin, cb) => {
      // No Origin header = same-process tooling such as Supertest or curl.
      if (!origin) return cb(null, true)
      cb(null, ALLOWED_ORIGIN.test(origin))
    },
    allowedHeaders: ['Content-Type', 'X-JAF-Token'],
  }))
  app.use(express.json({ limit: '2mb' }))

  app.use('/api', requireToken(opts.token))
  app.use('/api', healthRouter())

  return app
}
```

- [ ] **Step 5: Write index.ts**

`packages/server/src/index.ts`:

```ts
import { resolve } from 'node:path'
import { ensureToken } from './auth.js'
import { createApp } from './app.js'

const PORT = 4321
const HOST = '127.0.0.1'   // loopback only — never 0.0.0.0

const dataDir = resolve(process.cwd(), process.env.JAF_DATA_DIR ?? './profile')
const token = await ensureToken(dataDir)

createApp({ dataDir, token }).listen(PORT, HOST, () => {
  console.log(`jaf-server  http://${HOST}:${PORT}`)
  console.log(`data dir    ${dataDir}`)
  console.log(`token       ${token}`)
  console.log(`\nPaste the token into the extension options page to pair it.`)
})
```

- [ ] **Step 6: Run tests until green**

```bash
npm test -w @jaf/server
```

Expected: 12 passing (7 store + 5 auth).

- [ ] **Step 7: Verify it actually boots**

```bash
npm run start -w @jaf/server
```

Expected: prints the URL, data dir and token. Confirm the token is refused when absent:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/api/health
```

Expected: `401`. Stop the server with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(server): express app with loopback bind, pairing token and CORS lock"
```

---

### Task 4: Profile routes

**Files:**
- Create: `packages/server/src/routes/profile.ts`
- Modify: `packages/server/src/app.ts` — register the router
- Test: `packages/server/src/routes/profile.test.ts`

**Interfaces:**
- Consumes: `readProfile`, `writeProfile`, `ProfileSchema`.
- Produces: `profileRouter(dataDir: string): Router` serving `GET /api/profile` and `PUT /api/profile`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/routes/profile.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { createApp } from '../app.js'
import { emptyProfile } from '@jaf/shared'

let dir: string
let app: ReturnType<typeof createApp>
const TOKEN = 'secret'
const auth = (r: request.Test) => r.set('X-JAF-Token', TOKEN)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'jaf-'))
  app = createApp({ dataDir: dir, token: TOKEN })
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('GET /api/profile', () => {
  it('returns a default profile on a fresh data dir', async () => {
    const res = await auth(request(app).get('/api/profile')).expect(200)
    expect(res.body.applicant_profile.personal_information.first_name).toBe('')
  })
})

describe('PUT /api/profile', () => {
  it('persists a valid profile and reads it back', async () => {
    const p = emptyProfile()
    p.applicant_profile.personal_information.first_name = 'Ada'
    await auth(request(app).put('/api/profile')).send(p).expect(200)

    const res = await auth(request(app).get('/api/profile')).expect(200)
    expect(res.body.applicant_profile.personal_information.first_name).toBe('Ada')
  })

  it('rejects an invalid profile with 400 and does not write it', async () => {
    const bad = emptyProfile() as any
    bad.applicant_profile.personal_information.email = 'not-an-email'
    const res = await auth(request(app).put('/api/profile')).send(bad).expect(400)
    expect(res.body.error).toBe('validation failed')

    const after = await auth(request(app).get('/api/profile')).expect(200)
    expect(after.body.applicant_profile.personal_information.email).toBe('')
  })

  it('requires the token', async () => {
    await request(app).put('/api/profile').send(emptyProfile()).expect(401)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/server -- profile
```

Expected: FAIL — 404, because the router does not exist yet.

- [ ] **Step 3: Write the router**

`packages/server/src/routes/profile.ts`:

```ts
import { Router } from 'express'
import { ProfileSchema } from '@jaf/shared'
import { readProfile, writeProfile } from '../storage/yaml-store.js'

export function profileRouter(dataDir: string): Router {
  const r = Router()

  r.get('/profile', async (_req, res) => {
    try {
      res.json(await readProfile(dataDir))
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  r.put('/profile', async (req, res) => {
    const parsed = ProfileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'validation failed', issues: parsed.error.issues })
      return
    }
    try {
      await writeProfile(dataDir, parsed.data)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  return r
}
```

- [ ] **Step 4: Register it in app.ts**

In `packages/server/src/app.ts`, add the import and mount it directly after the health router:

```ts
import { profileRouter } from './routes/profile.js'
// ...
  app.use('/api', healthRouter())
  app.use('/api', profileRouter(opts.dataDir))
```

- [ ] **Step 5: Run tests until green**

```bash
npm test -w @jaf/server
```

Expected: 16 passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): profile GET and PUT routes with validation"
```

---

### Task 5: Resume upload and download

**Files:**
- Create: `packages/server/src/routes/resume.ts`
- Modify: `packages/server/src/app.ts` — register the router
- Test: `packages/server/src/routes/resume.test.ts`

**Interfaces:**
- Consumes: `resumesDir` from `../storage/paths.js`.
- Produces: `resumeRouter(dataDir: string): Router` serving `GET /api/resumes`, `POST /api/resumes`, `GET /api/resumes/:name`, `DELETE /api/resumes/:name`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/routes/resume.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { createApp } from '../app.js'

let dir: string
let app: ReturnType<typeof createApp>
const TOKEN = 'secret'
const auth = (r: request.Test) => r.set('X-JAF-Token', TOKEN)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'jaf-'))
  app = createApp({ dataDir: dir, token: TOKEN })
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('resumes', () => {
  it('starts empty', async () => {
    const res = await auth(request(app).get('/api/resumes')).expect(200)
    expect(res.body.resumes).toEqual([])
  })

  it('uploads a file and then lists it', async () => {
    await auth(request(app).post('/api/resumes'))
      .attach('file', Buffer.from('%PDF-1.4 fake'), 'ada.pdf')
      .expect(200)

    const res = await auth(request(app).get('/api/resumes')).expect(200)
    expect(res.body.resumes.map((r: { name: string }) => r.name)).toContain('ada.pdf')
  })

  it('serves the uploaded bytes back', async () => {
    await auth(request(app).post('/api/resumes'))
      .attach('file', Buffer.from('hello-resume'), 'ada.pdf')
      .expect(200)

    const res = await auth(request(app).get('/api/resumes/ada.pdf')).expect(200)
    expect(res.body.toString()).toContain('hello-resume')
  })

  it('refuses a path-traversal filename', async () => {
    await auth(request(app).get('/api/resumes/..%2F..%2Fprofile.yaml')).expect(400)
  })

  it('refuses a disallowed extension', async () => {
    await auth(request(app).post('/api/resumes'))
      .attach('file', Buffer.from('#!/bin/sh'), 'evil.sh')
      .expect(400)
  })

  it('deletes a resume', async () => {
    await auth(request(app).post('/api/resumes'))
      .attach('file', Buffer.from('x'), 'ada.pdf').expect(200)
    await auth(request(app).delete('/api/resumes/ada.pdf')).expect(200)
    const res = await auth(request(app).get('/api/resumes')).expect(200)
    expect(res.body.resumes).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/server -- resume
```

Expected: FAIL — 404.

- [ ] **Step 3: Write the router**

`packages/server/src/routes/resume.ts`:

```ts
import { Router } from 'express'
import multer from 'multer'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { resumesDir } from '../storage/paths.js'

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.txt', '.md'])

/** Strip any directory component so `../../profile.yaml` cannot escape the folder. */
function safeName(raw: string): string | null {
  const name = basename(raw)
  if (!name || name.startsWith('.') || name !== raw) return null
  if (!ALLOWED.has(extname(name).toLowerCase())) return null
  return name
}

export function resumeRouter(dataDir: string): Router {
  const r = Router()
  const dir = resumesDir(dataDir)
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

  r.get('/resumes', async (_req, res) => {
    await mkdir(dir, { recursive: true })
    const names = (await readdir(dir)).filter(n => ALLOWED.has(extname(n).toLowerCase()))
    const resumes = await Promise.all(names.map(async name => ({
      name, size: (await stat(join(dir, name))).size,
    })))
    res.json({ resumes })
  })

  r.post('/resumes', upload.single('file'), async (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'no file' }); return }
    const name = safeName(req.file.originalname)
    if (!name) { res.status(400).json({ error: 'bad filename or unsupported type' }); return }

    await mkdir(dir, { recursive: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(dir, name), req.file.buffer)
    res.json({ ok: true, name })
  })

  r.get('/resumes/:name', (req, res) => {
    const name = safeName(req.params.name)
    if (!name) { res.status(400).json({ error: 'bad filename' }); return }
    res.sendFile(join(dir, name), err => { if (err) res.status(404).end() })
  })

  r.delete('/resumes/:name', async (req, res) => {
    const name = safeName(req.params.name)
    if (!name) { res.status(400).json({ error: 'bad filename' }); return }
    try { await unlink(join(dir, name)); res.json({ ok: true }) }
    catch { res.status(404).json({ error: 'not found' }) }
  })

  return r
}
```

- [ ] **Step 4: Register it in app.ts**

```ts
import { resumeRouter } from './routes/resume.js'
// ...
  app.use('/api', resumeRouter(opts.dataDir))
```

- [ ] **Step 5: Run tests until green**

```bash
npm test -w @jaf/server
```

Expected: 22 passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): resume upload, list, download and delete"
```

---

### Task 6: Controller scaffold with token-injecting proxy

**Files:**
- Create: `packages/controller/package.json`, `packages/controller/tsconfig.json`, `packages/controller/vite.config.ts`
- Create: `packages/controller/index.html`, `packages/controller/tailwind.config.js`, `packages/controller/postcss.config.js`
- Create: `packages/controller/src/main.tsx`, `packages/controller/src/App.tsx`, `packages/controller/src/index.css`
- Create: `packages/controller/src/lib/api.ts`
- Test: `packages/controller/src/lib/api.test.ts`

**Interfaces:**
- Consumes: `Profile` from `@jaf/shared`.
- Produces: `getProfile(): Promise<Profile>`, `putProfile(p: Profile): Promise<void>`, `getHealth(): Promise<{ ok: boolean }>`, `listResumes(): Promise<{ name: string; size: number }[]>`.

The browser never sees the token. The Vite dev server reads `profile/.token`
and injects the header when proxying `/api`.

- [ ] **Step 1: Create the package**

`packages/controller/package.json`:

```json
{
  "name": "@jaf/controller",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@jaf/shared": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@radix-ui/react-accordion": "^1.2.2",
    "@radix-ui/react-switch": "^1.1.2",
    "@radix-ui/react-select": "^2.1.4"
  },
  "devDependencies": {
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

```bash
npm install
```

- [ ] **Step 2: Configure Vite with the token-injecting proxy**

`packages/controller/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readToken(): string {
  const p = resolve(__dirname, '../../profile/.token')
  try { return readFileSync(p, 'utf8').trim() }
  catch { console.warn(`[jaf] no token at ${p} — start @jaf/server first`); return '' }
}

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom' },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4321',
        changeOrigin: false,
        configure(proxy) {
          // The browser never holds the token; the dev server adds it here.
          proxy.on('proxyReq', req => req.setHeader('X-JAF-Token', readToken()))
        },
      },
    },
  },
})
```

`packages/controller/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "vite.config.ts"]
}
```

`packages/controller/tailwind.config.js`:

```js
export default { content: ['./index.html', './src/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] }
```

`packages/controller/postcss.config.js`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

`packages/controller/index.html`:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Job Application Filler</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

`packages/controller/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Write the failing test**

`packages/controller/src/lib/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getProfile, putProfile } from './api.js'
import { emptyProfile } from '@jaf/shared'

beforeEach(() => { vi.restoreAllMocks() })

describe('api client', () => {
  it('GETs /api/profile and returns the parsed body', async () => {
    const p = emptyProfile()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(p), { status: 200 })))
    expect((await getProfile()).applicant_profile).toBeDefined()
  })

  it('PUTs the profile as JSON', async () => {
    const spy = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    await putProfile(emptyProfile())
    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/profile')
    expect(init.method).toBe('PUT')
  })

  it('throws a readable error when the server returns 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('{"error":"validation failed"}', { status: 400 })))
    await expect(putProfile(emptyProfile())).rejects.toThrow(/validation failed/)
  })
})
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npm test -w @jaf/controller
```

Expected: FAIL — `Cannot find module './api.js'`.

- [ ] **Step 5: Write the api client**

`packages/controller/src/lib/api.ts`:

```ts
import type { Profile } from '@jaf/shared'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let detail = res.statusText
    try { detail = ((await res.json()) as { error?: string }).error ?? detail } catch { /* keep statusText */ }
    throw new Error(`${path} failed (${res.status}): ${detail}`)
  }
  return res.json() as Promise<T>
}

export const getProfile   = () => call<Profile>('/api/profile')
export const putProfile   = (p: Profile) => call<{ ok: true }>('/api/profile', { method: 'PUT', body: JSON.stringify(p) }).then(() => undefined)
export const getHealth    = () => call<{ ok: boolean }>('/api/health')
export const listResumes  = () => call<{ resumes: { name: string; size: number }[] }>('/api/resumes').then(r => r.resumes)
```

- [ ] **Step 6: Write a minimal App so the page renders**

`packages/controller/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { getHealth } from './lib/api.js'

export default function App() {
  const [status, setStatus] = useState('checking…')
  useEffect(() => {
    getHealth().then(() => setStatus('connected')).catch(e => setStatus(String(e.message)))
  }, [])
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Job Application Filler</h1>
      <p className="mt-2 text-sm text-neutral-600">Server: {status}</p>
    </main>
  )
}
```

`packages/controller/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.js'
import './index.css'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
```

- [ ] **Step 7: Run tests until green, then verify in a browser**

```bash
npm test -w @jaf/controller
```

Expected: 3 passing.

In one terminal `npm run start -w @jaf/server`, in another `npm run dev -w @jaf/controller`, then open `http://localhost:5173`.
Expected: the page shows **Server: connected**.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(controller): vite scaffold, token-injecting proxy and api client"
```

---

### Task 7: Profile editor UI

**Files:**
- Create: `packages/controller/src/components/Field.tsx`, `Section.tsx`
- Create: `packages/controller/src/components/profile/PersonalInformation.tsx`, `WorkExperienceList.tsx`, `WorkAuthorization.tsx`, `GovernmentCompliance.tsx`, `ESignature.tsx`, `Consents.tsx`, `SourceAttribution.tsx`, `VoluntaryDemographics.tsx`
- Create: `packages/controller/src/routes/ProfilePage.tsx`
- Modify: `packages/controller/src/App.tsx` — render `ProfilePage`
- Test: `packages/controller/src/routes/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: `getProfile`, `putProfile`, `Profile`, `WorkExperience`.
- Produces: `<ProfilePage />`. Each section component takes
  `{ value: T; onChange: (next: T) => void }` — a controlled component, no
  internal state, no context.

One file per YAML section keeps each under ~80 lines and each independently
reviewable.

- [ ] **Step 1: Add the testing library**

```bash
npm i -D -w @jaf/controller @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Write the failing test**

`packages/controller/src/routes/ProfilePage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyProfile } from '@jaf/shared'
import ProfilePage from './ProfilePage.js'
import * as api from '../lib/api.js'

beforeEach(() => {
  vi.spyOn(api, 'getProfile').mockResolvedValue(emptyProfile())
  vi.spyOn(api, 'putProfile').mockResolvedValue(undefined)
})

describe('ProfilePage', () => {
  it('renders every profile section', async () => {
    render(<ProfilePage />)
    await screen.findByText('Personal Information')
    for (const s of ['Work Experience', 'Work Authorization', 'Government & Compliance',
                     'E-Signature', 'Consents', 'Source Attribution', 'Voluntary Demographics']) {
      expect(screen.getByText(s)).toBeTruthy()
    }
  })

  it('saves an edited first name', async () => {
    render(<ProfilePage />)
    const input = await screen.findByLabelText('First name')
    await userEvent.type(input, 'Ada')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(api.putProfile).toHaveBeenCalled())
    const sent = vi.mocked(api.putProfile).mock.calls[0][0]
    expect(sent.applicant_profile.personal_information.first_name).toBe('Ada')
  })

  it('adds a work experience row', async () => {
    render(<ProfilePage />)
    await screen.findByText('Work Experience')
    await userEvent.click(screen.getByRole('button', { name: /add role/i }))
    expect(screen.getByLabelText('Job title')).toBeTruthy()
  })

  it('keeps demographics inputs disabled until the user opts in', async () => {
    render(<ProfilePage />)
    await screen.findByText('Voluntary Demographics')
    expect(screen.getByLabelText('Gender identity')).toHaveProperty('disabled', true)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npm test -w @jaf/controller -- ProfilePage
```

Expected: FAIL — `Cannot find module './ProfilePage.js'`.

- [ ] **Step 4: Write the two shared primitives**

`packages/controller/src/components/Field.tsx`:

```tsx
interface TextFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  disabled?: boolean
  placeholder?: string
}

export function TextField({ label, value, onChange, type = 'text', disabled, placeholder }: TextFieldProps) {
  const id = `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <input
        id={id} type={type} value={value} disabled={disabled} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
      />
    </label>
  )
}

export function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const id = `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
      <span className="font-medium text-neutral-700">{label}</span>
    </label>
  )
}
```

`packages/controller/src/components/Section.tsx`:

```tsx
import type { ReactNode } from 'react'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}
```

- [ ] **Step 5: Write the section components**

Each is a controlled component over its slice of the profile. `PersonalInformation.tsx`:

```tsx
import type { Profile } from '@jaf/shared'
import { Section } from '../Section.js'
import { TextField } from '../Field.js'

type PI = Profile['applicant_profile']['personal_information']

export function PersonalInformation({ value, onChange }: { value: PI; onChange: (v: PI) => void }) {
  const set = <K extends keyof PI>(k: K, v: PI[K]) => onChange({ ...value, [k]: v })
  const setAddr = (k: keyof PI['address'], v: string) =>
    onChange({ ...value, address: { ...value.address, [k]: v } })

  return (
    <Section title="Personal Information">
      <TextField label="First name" value={value.first_name} onChange={v => set('first_name', v)} />
      <TextField label="Last name"  value={value.last_name}  onChange={v => set('last_name', v)} />
      <TextField label="Email" type="email" value={value.email} onChange={v => set('email', v)} />
      <TextField label="Phone number" value={value.phone_number} onChange={v => set('phone_number', v)} />
      <TextField label="Street" value={value.address.street} onChange={v => setAddr('street', v)} />
      <TextField label="City"   value={value.address.city}   onChange={v => setAddr('city', v)} />
      <TextField label="State"  value={value.address.state}  onChange={v => setAddr('state', v)} />
      <TextField label="Postal code" value={value.address.postal_code} onChange={v => setAddr('postal_code', v)} />
      <TextField label="Country" value={value.address.country} onChange={v => setAddr('country', v)} />
      <TextField label="LinkedIn URL"  value={value.linkedin_url}  onChange={v => set('linkedin_url', v)} />
      <TextField label="Portfolio URL" value={value.portfolio_url} onChange={v => set('portfolio_url', v)} />
    </Section>
  )
}
```

Build the remaining seven the same way, one file each, using the exact labels
the test asserts on:

- `WorkAuthorization.tsx` — `BoolField` "Authorized to work in country", `BoolField` "Requires sponsorship now or in future", `TextField` "Visa status".
- `GovernmentCompliance.tsx` — `BoolField` "Former government employee", `TextField` "Clearance level", `TextField` "Export control status".
- `ESignature.tsx` — `TextField` "Full name", `TextField` "Date" (`type="date"`), `BoolField` "Attestation agreed".
- `Consents.tsx` — four `BoolField`s: "Agree to privacy policy", "Agree to terms and conditions", "Opt in to talent community", "Opt in to SMS notifications".
- `SourceAttribution.tsx` — `TextField` "How did you hear about us".
- `VoluntaryDemographics.tsx` — a leading `BoolField` "Opt in to sharing demographics", then six `TextField`s ("Gender identity", "Transgender status", "Race / ethnicity", "Sexual orientation", "Veteran status", "Disability status") each passed `disabled={!value.opt_in}`.
- `WorkExperienceList.tsx` — maps over the array rendering "Job title", "Company name", "Location", "Start date", "End date", "Description" plus `BoolField` "Current role", with an **Add role** button appending a blank entry and a **Remove** button per row:

```tsx
import type { Profile, WorkExperience } from '@jaf/shared'
import { Section } from '../Section.js'
import { TextField, BoolField } from '../Field.js'

type WE = Profile['applicant_profile']['work_experience']

const blank: WorkExperience = {
  job_title: '', company_name: '', location: '',
  start_date: '', end_date: '', is_current_role: false, description: '',
}

export function WorkExperienceList({ value, onChange }: { value: WE; onChange: (v: WE) => void }) {
  const patch = (i: number, p: Partial<WorkExperience>) =>
    onChange(value.map((row, j) => (j === i ? { ...row, ...p } : row)))

  return (
    <Section title="Work Experience">
      <div className="sm:col-span-2 grid gap-6">
        {value.map((row, i) => (
          <div key={i} className="grid gap-4 rounded-md bg-neutral-50 p-4 sm:grid-cols-2">
            <TextField label="Job title"    value={row.job_title}    onChange={v => patch(i, { job_title: v })} />
            <TextField label="Company name" value={row.company_name} onChange={v => patch(i, { company_name: v })} />
            <TextField label="Location"     value={row.location}     onChange={v => patch(i, { location: v })} />
            <TextField label="Start date"   value={row.start_date}   onChange={v => patch(i, { start_date: v })} placeholder="YYYY-MM" />
            <TextField label="End date"     value={row.end_date}     onChange={v => patch(i, { end_date: v })} placeholder="YYYY-MM or Present" />
            <BoolField  label="Current role" value={row.is_current_role} onChange={v => patch(i, { is_current_role: v })} />
            <TextField label="Description"  value={row.description}  onChange={v => patch(i, { description: v })} />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}
                    className="justify-self-start text-sm text-red-600">Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...value, { ...blank }])}
                className="justify-self-start rounded-md border px-3 py-2 text-sm">Add role</button>
      </div>
    </Section>
  )
}
```

- [ ] **Step 6: Write ProfilePage**

`packages/controller/src/routes/ProfilePage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Profile } from '@jaf/shared'
import { getProfile, putProfile } from '../lib/api.js'
import { PersonalInformation } from '../components/profile/PersonalInformation.js'
import { WorkExperienceList } from '../components/profile/WorkExperienceList.js'
import { WorkAuthorization } from '../components/profile/WorkAuthorization.js'
import { GovernmentCompliance } from '../components/profile/GovernmentCompliance.js'
import { ESignature } from '../components/profile/ESignature.js'
import { Consents } from '../components/profile/Consents.js'
import { SourceAttribution } from '../components/profile/SourceAttribution.js'
import { VoluntaryDemographics } from '../components/profile/VoluntaryDemographics.js'

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => { getProfile().then(setProfile).catch(e => setStatus(e.message)) }, [])
  if (!profile) return <p className="p-8 text-sm">{status || 'Loading…'}</p>

  const ap = profile.applicant_profile
  const set = <K extends keyof typeof ap>(k: K, v: (typeof ap)[K]) =>
    setProfile({ ...profile, applicant_profile: { ...ap, [k]: v } })

  const save = async () => {
    setStatus('Saving…')
    try { await putProfile(profile); setStatus('Saved') }
    catch (e) { setStatus((e as Error).message) }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">{status}</span>
          <button onClick={save} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">Save</button>
        </div>
      </header>

      <PersonalInformation   value={ap.personal_information}   onChange={v => set('personal_information', v)} />
      <WorkExperienceList    value={ap.work_experience}        onChange={v => set('work_experience', v)} />
      <WorkAuthorization     value={ap.work_authorization}     onChange={v => set('work_authorization', v)} />
      <GovernmentCompliance  value={ap.government_compliance}  onChange={v => set('government_compliance', v)} />
      <ESignature            value={ap.e_signature}            onChange={v => set('e_signature', v)} />
      <Consents              value={ap.consents}               onChange={v => set('consents', v)} />
      <SourceAttribution     value={ap.source_attribution}     onChange={v => set('source_attribution', v)} />
      <VoluntaryDemographics value={ap.voluntary_demographics} onChange={v => set('voluntary_demographics', v)} />
    </div>
  )
}
```

Then in `App.tsx`, replace the body with `<ProfilePage />`.

- [ ] **Step 7: Run tests until green**

```bash
npm test -w @jaf/controller
```

Expected: 7 passing.

- [ ] **Step 8: Verify end to end by hand**

Start both processes, open `http://localhost:5173`, type a first name, click **Save**, then:

```bash
grep first_name profile/profile.yaml
```

Expected: the name you typed appears in the file.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(controller): full profile editor for all eight sections"
```

---

### Task 8: Status and pairing endpoints

Everything the user needs must be reachable from the controller page. That
includes the pairing token — making them open `profile/.token` in an editor is
exactly the "go read the files yourself" failure this task removes.

**Files:**
- Create: `packages/server/src/routes/status.ts`
- Modify: `packages/server/src/app.ts` — register the router
- Test: `packages/server/src/routes/status.test.ts`

**Interfaces:**
- Consumes: `profilePath`, `resumesDir` from `../storage/paths.js`.
- Produces:
  - `type ToolProbe = (bin: string) => Promise<{ installed: boolean; version: string }>`
  - `probeTool: ToolProbe` — the real implementation, runs `<bin> --version`
  - `statusRouter(dataDir: string, token: string, probe?: ToolProbe): Router` serving `GET /api/status` and `GET /api/pairing`

`probe` is injectable so the tests never shell out.

- [ ] **Step 1: Write the failing test**

`packages/server/src/routes/status.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.js'

let dir: string
const TOKEN = 'test-token'
const app = () => createApp({ dataDir: dir, token: TOKEN })
const auth = (r: request.Test) => r.set('X-JAF-Token', TOKEN)

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'jaf-status-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('GET /api/status', () => {
  it('reports no profile and no resumes on a fresh install', async () => {
    const res = await auth(request(app()).get('/api/status'))
    expect(res.status).toBe(200)
    expect(res.body.profileExists).toBe(false)
    expect(res.body.resumeCount).toBe(0)
  })

  it('reports the profile once it exists and counts resumes', async () => {
    await writeFile(join(dir, 'profile.yaml'), 'version: 1\n')
    await mkdir(join(dir, 'resumes'), { recursive: true })
    await writeFile(join(dir, 'resumes', 'cv.pdf'), 'x')
    await writeFile(join(dir, 'resumes', 'notes.txt'), 'x')

    const res = await auth(request(app()).get('/api/status'))
    expect(res.body.profileExists).toBe(true)
    expect(res.body.resumeCount).toBe(2)
  })

  it('tells the page where its data lives so the user never has to guess', async () => {
    const res = await auth(request(app()).get('/api/status'))
    expect(res.body.dataDir).toBe(dir)
  })

  it('reports which AI CLIs are installed', async () => {
    const { statusRouter } = await import('./status.js')
    const express = (await import('express')).default
    const fake = express()
    fake.use('/api', statusRouter(dir, TOKEN, async bin => ({
      installed: bin === 'claude',
      version: bin === 'claude' ? '2.1.270' : '',
    })))

    const res = await request(fake).get('/api/status')
    expect(res.body.tools.claude).toEqual({ installed: true, version: '2.1.270' })
    expect(res.body.tools.codex.installed).toBe(false)
  })

  it('still answers when a CLI probe throws, rather than 500ing the page', async () => {
    const { statusRouter } = await import('./status.js')
    const express = (await import('express')).default
    const fake = express()
    fake.use('/api', statusRouter(dir, TOKEN, async () => { throw new Error('boom') }))

    const res = await request(fake).get('/api/status')
    expect(res.status).toBe(200)
    expect(res.body.tools.claude.installed).toBe(false)
  })
})

describe('GET /api/pairing', () => {
  it('hands the page the token so the user can copy it into the extension', async () => {
    const res = await auth(request(app()).get('/api/pairing'))
    expect(res.status).toBe(200)
    expect(res.body.token).toBe(TOKEN)
    expect(res.body.serverUrl).toBe('http://127.0.0.1:4321')
  })

  it('refuses without the token — knowing it is the price of reading it', async () => {
    const res = await request(app()).get('/api/pairing')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/server -- status
```

Expected: FAIL — `status.js` not found.

- [ ] **Step 3: Write status.ts**

`packages/server/src/routes/status.ts`:

```ts
import { Router } from 'express'
import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import { profilePath, resumesDir } from '../storage/paths.js'

const run = promisify(execFile)

export type ToolProbe = (bin: string) => Promise<{ installed: boolean; version: string }>

/**
 * argv array, never a shell string — see PLAN.md hard rules. A missing binary
 * rejects, which the caller turns into `installed: false`.
 */
export const probeTool: ToolProbe = async bin => {
  const { stdout } = await run(bin, ['--version'], { timeout: 5_000 })
  return { installed: true, version: stdout.trim().split('\n')[0] }
}

const ABSENT = { installed: false, version: '' }

async function safeProbe(probe: ToolProbe, bin: string) {
  try { return await probe(bin) } catch { return ABSENT }
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

export function statusRouter(dataDir: string, token: string, probe: ToolProbe = probeTool): Router {
  const r = Router()

  r.get('/status', async (_req, res) => {
    let resumeCount = 0
    try { resumeCount = (await readdir(resumesDir(dataDir))).length } catch { /* no folder yet */ }

    const [claude, codex] = await Promise.all([
      safeProbe(probe, 'claude'),
      safeProbe(probe, 'codex'),
    ])

    res.json({
      ok: true,
      dataDir,
      profileExists: await exists(profilePath(dataDir)),
      resumeCount,
      tools: { claude, codex },
    })
  })

  // Already behind requireToken: only a caller who has the token can read it.
  r.get('/pairing', (_req, res) => {
    res.json({ token, serverUrl: 'http://127.0.0.1:4321' })
  })

  return r
}
```

- [ ] **Step 4: Register it in app.ts**

In `packages/server/src/app.ts`, add the import and mount it with the other routers:

```ts
import { statusRouter } from './routes/status.js'
// ...
  app.use('/api', statusRouter(opts.dataDir, opts.token))
```

- [ ] **Step 5: Run tests until green, then commit**

```bash
npm test -w @jaf/server
git add -A && git commit -m "feat(server): status and pairing endpoints for a self-service controller"
```

---

### Task 9: App shell with navigation

**Files:**
- Create: `packages/controller/src/components/Nav.tsx`
- Modify: `packages/controller/src/App.tsx` — replace the placeholder from Task 6
- Modify: `packages/controller/src/lib/api.ts` — add the new calls
- Test: `packages/controller/src/App.test.tsx`

**Interfaces:**
- Consumes: `ProfilePage` from `./routes/ProfilePage.js` (Task 7).
- Produces:
  - `type Tab = 'profile' | 'resumes' | 'setup'`
  - `Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void })`
  - api additions: `getStatus()`, `getPairing()`, `uploadResume(file: File)`, `deleteResume(name: string)`
  - `ResumesPage` and `SetupPage` are created in Tasks 10 and 11; this task
    renders placeholders for them so the shell is testable on its own.

No router library. Three tabs in local state is the whole requirement, and a
dependency for that would fail the YAGNI rule in `PLAN.md`.

- [ ] **Step 1: Write the failing test**

`packages/controller/src/App.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyProfile } from '@jaf/shared'
import App from './App.js'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body =
      url.includes('/api/profile') ? emptyProfile() :
      url.includes('/api/resumes') ? { resumes: [] } :
      url.includes('/api/pairing') ? { token: 'tok', serverUrl: 'http://127.0.0.1:4321' } :
      { ok: true, dataDir: '/tmp/profile', profileExists: true, resumeCount: 0,
        tools: { claude: { installed: true, version: '2.1' }, codex: { installed: false, version: '' } } }
    return new Response(JSON.stringify(body), { status: 200 })
  }))
})

describe('App shell', () => {
  it('opens on the profile tab', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: /personal information/i })).toBeInTheDocument()
  })

  it('switches to resumes and back', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /personal information/i })

    await userEvent.click(screen.getByRole('tab', { name: /resumes/i }))
    expect(await screen.findByRole('heading', { name: /resumes/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /profile/i }))
    expect(await screen.findByRole('heading', { name: /personal information/i })).toBeInTheDocument()
  })

  it('marks the current tab selected for screen readers', async () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: /profile/i })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: /setup/i }))
    expect(screen.getByRole('tab', { name: /setup/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows a plain-language banner when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/npm run dev/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/controller -- App
```

Expected: FAIL — no tabs rendered.

- [ ] **Step 3: Extend the api client**

Append to `packages/controller/src/lib/api.ts`:

```ts
export interface Status {
  ok: boolean
  dataDir: string
  profileExists: boolean
  resumeCount: number
  tools: { claude: ToolInfo; codex: ToolInfo }
}
export interface ToolInfo { installed: boolean; version: string }
export interface Resume { name: string; size: number }

export const getStatus  = () => call<Status>('/api/status')
export const getPairing = () => call<{ token: string; serverUrl: string }>('/api/pairing')

/** Multipart, so this one bypasses `call` and its JSON content type. */
export async function uploadResume(file: File): Promise<void> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/resumes', { method: 'POST', body })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((detail as { error?: string }).error ?? res.statusText)
  }
}

export const deleteResume = (name: string) =>
  call<{ ok: true }>(`/api/resumes/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(() => undefined)
```

- [ ] **Step 4: Write Nav.tsx**

`packages/controller/src/components/Nav.tsx`:

```tsx
export type Tab = 'profile' | 'resumes' | 'setup'

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'resumes', label: 'Resumes' },
  { id: 'setup', label: 'Setup' },
]

export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Sections" className="flex gap-1 border-b border-neutral-200">
      {TABS.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            tab === t.id
              ? 'border-neutral-900 text-neutral-900'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Rewrite App.tsx**

Replace the whole of `packages/controller/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Nav, type Tab } from './components/Nav.js'
import { ProfilePage } from './routes/ProfilePage.js'
import { ResumesPage } from './routes/ResumesPage.js'
import { SetupPage } from './routes/SetupPage.js'
import { getStatus, type Status } from './lib/api.js'

export default function App() {
  const [tab, setTab] = useState<Tab>('profile')
  const [status, setStatus] = useState<Status | null>(null)
  const [offline, setOffline] = useState(false)

  const refresh = () => {
    getStatus().then(s => { setStatus(s); setOffline(false) }).catch(() => setOffline(true))
  }
  useEffect(refresh, [])

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Job Application Filler</h1>
        {status && (
          <p className="mt-1 text-sm text-neutral-500">
            Your data is in <code>{status.dataDir}</code>
          </p>
        )}
      </header>

      {offline && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <strong className="block">Can&apos;t reach the server.</strong>
          Start it with <code>npm run dev</code> in the project folder, then reload this page.
        </div>
      )}

      <Nav tab={tab} onChange={setTab} />

      <div className="mt-6">
        {tab === 'profile' && <ProfilePage />}
        {tab === 'resumes' && <ResumesPage onChange={refresh} />}
        {tab === 'setup' && <SetupPage status={status} onRetry={refresh} />}
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Stub the two pages so this task compiles**

Tasks 10 and 11 replace these bodies entirely. Create them now with the exact
signatures `App.tsx` imports, so this task is independently green:

`packages/controller/src/routes/ResumesPage.tsx`:

```tsx
export function ResumesPage(_props: { onChange: () => void }) {
  return <h2 className="text-lg font-semibold">Resumes</h2>
}
```

`packages/controller/src/routes/SetupPage.tsx`:

```tsx
import type { Status } from '../lib/api.js'

export function SetupPage(_props: { status: Status | null; onRetry: () => void }) {
  return <h2 className="text-lg font-semibold">Setup</h2>
}
```

Task 7 exported `ProfilePage` as a named export; keep that spelling.

- [ ] **Step 7: Run tests until green, then commit**

```bash
npm test -w @jaf/controller
git add -A && git commit -m "feat(controller): tabbed app shell with offline banner"
```

---

### Task 10: Resume manager page

Upload, download and delete, all from the page. No file paths, no terminal.

**Files:**
- Modify: `packages/controller/src/routes/ResumesPage.tsx` — replace the Task 9 stub
- Test: `packages/controller/src/routes/ResumesPage.test.tsx`

**Interfaces:**
- Consumes: `listResumes`, `uploadResume`, `deleteResume`, `type Resume` from `../lib/api.js`.
- Produces: `ResumesPage({ onChange }: { onChange: () => void })`.

- [ ] **Step 1: Write the failing test**

`packages/controller/src/routes/ResumesPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResumesPage } from './ResumesPage.js'
import * as api from '../lib/api.js'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(api, 'listResumes').mockResolvedValue([{ name: 'cv.pdf', size: 2048 }])
  vi.spyOn(api, 'uploadResume').mockResolvedValue(undefined)
  vi.spyOn(api, 'deleteResume').mockResolvedValue(undefined)
})

describe('ResumesPage', () => {
  it('lists the resumes already on disk with a human-readable size', async () => {
    render(<ResumesPage onChange={() => {}} />)
    expect(await screen.findByText('cv.pdf')).toBeInTheDocument()
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
  })

  it('tells the user what to do when there are none yet', async () => {
    vi.spyOn(api, 'listResumes').mockResolvedValue([])
    render(<ResumesPage onChange={() => {}} />)
    expect(await screen.findByText(/no resumes yet/i)).toBeInTheDocument()
  })

  it('uploads a chosen file and refreshes the list', async () => {
    render(<ResumesPage onChange={() => {}} />)
    await screen.findByText('cv.pdf')

    const file = new File(['hello'], 'resume.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText(/add a resume/i), file)

    await waitFor(() => expect(api.uploadResume).toHaveBeenCalledWith(file))
    expect(api.listResumes).toHaveBeenCalledTimes(2)
  })

  it('shows the server error when an upload is refused, in plain language', async () => {
    vi.spyOn(api, 'uploadResume').mockRejectedValue(new Error('bad filename or unsupported type'))
    render(<ResumesPage onChange={() => {}} />)
    await screen.findByText('cv.pdf')

    await userEvent.upload(
      screen.getByLabelText(/add a resume/i),
      new File(['x'], 'virus.exe', { type: 'application/octet-stream' }),
    )
    expect(await screen.findByText(/unsupported type/i)).toBeInTheDocument()
  })

  it('asks for confirmation before deleting', async () => {
    render(<ResumesPage onChange={() => {}} />)
    await screen.findByText('cv.pdf')

    await userEvent.click(screen.getByRole('button', { name: /delete cv\.pdf/i }))
    expect(api.deleteResume).not.toHaveBeenCalled()
    expect(screen.getByText(/delete cv\.pdf\?/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^yes, delete$/i }))
    await waitFor(() => expect(api.deleteResume).toHaveBeenCalledWith('cv.pdf'))
  })

  it('lets the user back out of a delete', async () => {
    render(<ResumesPage onChange={() => {}} />)
    await screen.findByText('cv.pdf')

    await userEvent.click(screen.getByRole('button', { name: /delete cv\.pdf/i }))
    await userEvent.click(screen.getByRole('button', { name: /keep it/i }))
    expect(api.deleteResume).not.toHaveBeenCalled()
    expect(screen.getByText('cv.pdf')).toBeInTheDocument()
  })

  it('offers a download link pointing at the server', async () => {
    render(<ResumesPage onChange={() => {}} />)
    const link = await screen.findByRole('link', { name: /download cv\.pdf/i })
    expect(link).toHaveAttribute('href', '/api/resumes/cv.pdf')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/controller -- ResumesPage
```

Expected: FAIL — the stub renders only a heading.

- [ ] **Step 3: Write ResumesPage.tsx**

Replace `packages/controller/src/routes/ResumesPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { listResumes, uploadResume, deleteResume, type Resume } from '../lib/api.js'

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ResumesPage({ onChange }: { onChange: () => void }) {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  const refresh = () => { listResumes().then(setResumes).catch(e => setError(e.message)) }
  useEffect(refresh, [])

  const onPick = async (file: File | undefined) => {
    if (!file) return
    setError(''); setBusy(true)
    try { await uploadResume(file); refresh(); onChange() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const remove = async (name: string) => {
    setConfirming(null); setError('')
    try { await deleteResume(name); refresh(); onChange() }
    catch (e) { setError((e as Error).message) }
  }

  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold">Resumes</h2>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">Add a resume</span>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md"
          disabled={busy}
          onChange={e => void onPick(e.target.files?.[0])}
          className="block w-full text-sm"
        />
        <span className="mt-1 block text-xs text-neutral-500">
          PDF, DOC, DOCX, TXT or MD. Up to 10 MB.
        </span>
      </label>

      {error && <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {resumes.length === 0 ? (
        <p className="text-sm text-neutral-500">No resumes yet — add one above.</p>
      ) : (
        <ul className="divide-y rounded-lg border border-neutral-200">
          {resumes.map(r => (
            <li key={r.name} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-neutral-500">{humanSize(r.size)}</div>
              </div>

              {confirming === r.name ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-neutral-700">Delete {r.name}?</span>
                  <button onClick={() => void remove(r.name)}
                          className="rounded bg-red-600 px-2 py-1 text-white">Yes, delete</button>
                  <button onClick={() => setConfirming(null)}
                          className="rounded border px-2 py-1">Keep it</button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-3">
                  <a href={`/api/resumes/${encodeURIComponent(r.name)}`}
                     aria-label={`Download ${r.name}`} className="text-neutral-700 underline">Download</a>
                  <button onClick={() => setConfirming(r.name)}
                          aria-label={`Delete ${r.name}`} className="text-red-700">Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run tests until green, then commit**

```bash
npm test -w @jaf/controller
git add -A && git commit -m "feat(controller): resume manager with upload, download and guarded delete"
```

---

### Task 11: Setup page

The page that makes the README optional. It shows the pairing token with a copy
button, the numbered steps to install the extension, and whether the local AI
CLIs are present — so a user never opens a terminal to diagnose anything.

**Files:**
- Modify: `packages/controller/src/routes/SetupPage.tsx` — replace the Task 9 stub
- Test: `packages/controller/src/routes/SetupPage.test.tsx`

**Interfaces:**
- Consumes: `getPairing`, `type Status`, `type ToolInfo` from `../lib/api.js`.
- Produces: `SetupPage({ status, onRetry }: { status: Status | null; onRetry: () => void })`.

- [ ] **Step 1: Write the failing test**

`packages/controller/src/routes/SetupPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetupPage } from './SetupPage.js'
import * as api from '../lib/api.js'
import type { Status } from '../lib/api.js'

const status = (over: Partial<Status> = {}): Status => ({
  ok: true,
  dataDir: '/Users/x/project/profile',
  profileExists: true,
  resumeCount: 1,
  tools: { claude: { installed: true, version: '2.1.270' }, codex: { installed: false, version: '' } },
  ...over,
})

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(api, 'getPairing').mockResolvedValue({ token: 'abc123', serverUrl: 'http://127.0.0.1:4321' })
})

describe('SetupPage', () => {
  it('shows the pairing token so the user never opens the token file', async () => {
    render(<SetupPage status={status()} onRetry={() => {}} />)
    expect(await screen.findByText('abc123')).toBeInTheDocument()
  })

  it('copies the token to the clipboard and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

    render(<SetupPage status={status()} onRetry={() => {}} />)
    await screen.findByText('abc123')
    await userEvent.click(screen.getByRole('button', { name: /copy token/i }))

    expect(writeText).toHaveBeenCalledWith('abc123')
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })

  it('lists the extension install steps in the page itself', async () => {
    render(<SetupPage status={status()} onRetry={() => {}} />)
    expect(screen.getByText(/chrome:\/\/extensions/i)).toBeInTheDocument()
    expect(screen.getByText(/load unpacked/i)).toBeInTheDocument()
    expect(screen.getByText(/packages\/extension\/dist/i)).toBeInTheDocument()
  })

  it('reports a working Claude CLI with its version', async () => {
    render(<SetupPage status={status()} onRetry={() => {}} />)
    expect(screen.getByText(/claude cli/i)).toBeInTheDocument()
    expect(screen.getByText(/2\.1\.270/)).toBeInTheDocument()
  })

  it('tells the user exactly how to fix a missing Claude CLI', async () => {
    render(<SetupPage status={status({
      tools: { claude: { installed: false, version: '' }, codex: { installed: false, version: '' } },
    })} onRetry={() => {}} />)
    expect(screen.getByText(/claude login/i)).toBeInTheDocument()
  })

  it('does not claim anything is wrong while the status is still loading', () => {
    render(<SetupPage status={null} onRetry={() => {}} />)
    expect(screen.getByText(/checking/i)).toBeInTheDocument()
  })

  it('re-checks on demand', async () => {
    const onRetry = vi.fn()
    render(<SetupPage status={status()} onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: /re-check/i }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('surfaces a pairing fetch failure instead of showing a blank box', async () => {
    vi.spyOn(api, 'getPairing').mockRejectedValue(new Error('401'))
    render(<SetupPage status={status()} onRetry={() => {}} />)
    await waitFor(() => expect(screen.getByText(/couldn.t read the token/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -w @jaf/controller -- SetupPage
```

Expected: FAIL — the stub renders only a heading.

- [ ] **Step 3: Write SetupPage.tsx**

Replace `packages/controller/src/routes/SetupPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { getPairing, type Status, type ToolInfo } from '../lib/api.js'

function ToolRow({ name, info, fix }: { name: string; info: ToolInfo; fix: string }) {
  return (
    <li className="flex items-start justify-between gap-4 p-3 text-sm">
      <div>
        <div className="font-medium">{name}</div>
        {info.installed
          ? <div className="text-neutral-500">{info.version}</div>
          : <div className="text-neutral-700">Not found. {fix}</div>}
      </div>
      <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${
        info.installed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
      }`}>
        {info.installed ? 'ready' : 'missing'}
      </span>
    </li>
  )
}

export function SetupPage({ status, onRetry }: { status: Status | null; onRetry: () => void }) {
  const [token, setToken] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getPairing()
      .then(p => setToken(p.token))
      .catch(() => setTokenError("Couldn't read the token. Restart the server and reload this page."))
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setTokenError('Copying failed — select the token above and copy it by hand.')
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-neutral-200 p-5">
        <h2 className="mb-3 text-lg font-semibold">Connect the extension</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700">
          <li>Run <code>npm run build -w @jaf/extension</code> once.</li>
          <li>Open <code>chrome://extensions</code> and turn on Developer mode.</li>
          <li>Click <strong>Load unpacked</strong> and choose <code>packages/extension/dist</code>.</li>
          <li>Open the extension&apos;s Options page.</li>
          <li>Paste the token below, then click <strong>Save and test</strong>.</li>
        </ol>

        <div className="mt-4 flex items-center gap-3">
          <code className="flex-1 truncate rounded bg-neutral-100 px-3 py-2 text-sm">{token || '…'}</code>
          <button onClick={() => void copy()} disabled={!token}
                  className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50">
            Copy token
          </button>
        </div>
        {copied && <p className="mt-2 text-sm text-green-700">Copied.</p>}
        {tokenError && <p className="mt-2 text-sm text-red-700">{tokenError}</p>}
      </section>

      <section className="rounded-lg border border-neutral-200 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Local AI</h2>
          <button onClick={onRetry} className="rounded-md border px-3 py-1 text-sm">Re-check</button>
        </div>

        {!status ? (
          <p className="text-sm text-neutral-500">Checking…</p>
        ) : (
          <>
            <ul className="divide-y rounded-md border border-neutral-200">
              <ToolRow name="Claude CLI" info={status.tools.claude}
                       fix="Install it, then run `claude login` in a terminal." />
              <ToolRow name="Codex CLI" info={status.tools.codex}
                       fix="Optional — Claude alone is enough." />
            </ul>
            <p className="mt-3 text-xs text-neutral-500">
              AI runs on your existing subscription through these CLIs. No API key, no charges.
            </p>
          </>
        )}
      </section>

      {status && (
        <section className="rounded-lg border border-neutral-200 p-5 text-sm">
          <h2 className="mb-3 text-lg font-semibold">Your data</h2>
          <p>Folder: <code>{status.dataDir}</code></p>
          <p>Profile saved: {status.profileExists ? 'yes' : 'not yet'}</p>
          <p>Resumes: {status.resumeCount}</p>
          <p className="mt-2 text-neutral-500">
            Nothing leaves this machine, and this folder is never committed to git.
          </p>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests until green, then commit**

```bash
npm test -w @jaf/controller
git add -A && git commit -m "feat(controller): setup page with pairing token, install steps and AI status"
```

---

### Task 12: README and one-command start

**Files:**
- Create: `README.md`
- Modify: root `package.json` — add the `dev` script
- Create: `packages/server/package.json` script check (verify `dev` exists)

**Interfaces:**
- Consumes: the workspace scripts from Tasks 1, 2 and 6.
- Produces: `npm run dev` at the repo root, starting server and controller together.

- [ ] **Step 1: Add concurrently and the root dev script**

```bash
npm install -D -w . concurrently@^9.1.0
```

Add to the root `package.json` `scripts`:

```json
{
  "scripts": {
    "dev": "concurrently -n server,web -c blue,green \"npm run dev -w @jaf/server\" \"npm run dev -w @jaf/controller\"",
    "build": "npm run build -w @jaf/shared && npm run build -w @jaf/controller && npm run build -w @jaf/extension",
    "test": "npm test --workspaces --if-present"
  }
}
```

- [ ] **Step 2: Verify it starts both**

```bash
npm run dev
```

Expected: the server logs its port and token, Vite logs `http://localhost:5173`.
Open that URL, confirm the three tabs render, then stop with Ctrl-C.

- [ ] **Step 3: Write README.md**

````markdown
# Job Application Filler

Fills job applications from one profile you keep on your own machine. A local
web page holds your details and resumes; a Chrome extension fills the forms.

- **Nothing leaves your machine.** The server listens on `127.0.0.1` only.
- **No API key, no AI bill.** AI runs through your existing Claude subscription
  via the local `claude` CLI.
- **It never submits anything.** It fills and highlights; you review and click
  Submit yourself.

## Quick setup

You need [Node 22+](https://nodejs.org) and Chrome.

```bash
git clone <your-repo-url> job-application-filler
cd job-application-filler
npm install
npm run build -w @jaf/extension
npm run dev
```

Then:

1. Open <http://localhost:5173>.
2. Fill in the **Profile** tab and click **Save**.
3. Add your CV in the **Resumes** tab.
4. Go to the **Setup** tab and follow the five steps there to load the
   extension and paste the pairing token.

Open any Greenhouse or Lever job application and click **Fill application**.

Everything after this point is detail you only need if something goes wrong.

## Detailed setup

### 1. Prerequisites

| Requirement | Check | Notes |
|---|---|---|
| Node 22 or newer | `node -v` | Older versions will not run the server |
| npm 10 or newer | `npm -v` | Ships with Node 22 |
| Google Chrome | — | The extension is Chrome MV3 |
| Claude CLI (optional) | `claude --version` | Only needed for AI-assisted answers |

The Claude CLI is optional. Without it, every field that heuristics can match
still fills; only AI-drafted answers for unusual questions are unavailable.
If you have it, authenticate once:

```bash
claude login
```

### 2. Install and start

```bash
npm install          # installs all four workspaces
npm run dev          # starts the server and the web page together
```

`npm run dev` runs two processes:

| Process | URL | Purpose |
|---|---|---|
| `@jaf/server` | http://127.0.0.1:4321 | Owns `profile.yaml` and your resumes |
| `@jaf/controller` | http://localhost:5173 | The web page you use |

Leave both running while you apply for jobs. The extension keeps a cached copy
of your profile, so autofill still works if you stop them — it just will not
see edits you make after that.

### 3. Build and load the extension

```bash
npm run build -w @jaf/extension
```

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `packages/extension/dist` folder in this project.

### 4. Pair the extension

The server generates a random pairing token on first start. It stops other
websites from reading your profile out of the local server.

1. In the web page, open the **Setup** tab.
2. Click **Copy token**.
3. On `chrome://extensions`, click **Details** on Job Application Filler, then
   **Extension options**.
4. Paste the token and click **Save and test**. It should say `Paired.`

### 5. Use it

Open a job application. The **Fill application** button appears bottom-right.
Click it. The panel lists every field with a badge:

| Badge | Meaning |
|---|---|
| `filled` | Written from your profile |
| `needs-user` | Found, but you have to answer it |
| `skipped` | Deliberately left alone — a submit button, or a field you edited |
| `failed` | No option on the form matched your value |

Read the form, fix anything marked for attention, then submit it yourself.

## Where your data lives

Everything is in the `profile/` folder of this project:

```
profile/
├── profile.yaml     your details
├── resumes/         the files you uploaded
└── .token           the extension pairing token
```

`profile/` is in `.gitignore`. It is never committed. To move to a new machine,
copy that folder across. To delete everything, delete the folder.

You can edit `profile.yaml` by hand if you like, but you never have to — the
web page can add, change and delete everything in it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Web page says "Can't reach the server" | Run `npm run dev`, then reload the page |
| Extension options says `Server said 401` | Token is wrong — copy it again from the Setup tab |
| Extension options can't reach the server | The server is not running, or a firewall is blocking `127.0.0.1:4321` |
| No **Fill application** button on a job page | That page was not recognised as an application. Open the extension's Options page to confirm pairing, then reload the job page |
| Setup tab says the Claude CLI is missing | Install the CLI and run `claude login`. Heuristic filling works without it |
| Nothing fills, but the button appears | Check the Profile tab is saved — the Setup tab shows `Profile saved: yes` |
| Demographics fields stay empty | By design. Turn on the opt-in at the top of that profile section |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the server and web page |
| `npm test` | Run every test in the project |
| `npm run build` | Build the web page and the extension |
| `npm run build -w @jaf/extension` | Rebuild just the extension after changing it |

## Layout

```
packages/
├── shared/      profile schema and field types, used by everything
├── server/      Express server, owns your data on disk
├── controller/  the React web page
└── extension/   the Chrome extension
```

## What it will not do

It never submits an application, never clicks Next in a multi-step form, never
fills a password, payment or Social Security field, and never fills the
voluntary EEO questions unless you explicitly opt in.
````

- [ ] **Step 4: Check the README against reality**

Walk the Quick setup on a clean clone in a temp folder. Every command must run
as written and every URL must load. Fix the README, not your memory of it.

```bash
git clone . /tmp/jaf-readme-check && cd /tmp/jaf-readme-check && npm install && npm test
```

- [ ] **Step 5: Commit**

```bash
cd -
git add -A && git commit -m "docs: README with quick and detailed setup, plus one-command dev script"
```

---

## M1 Definition of Done

- [ ] `npm test` passes at the repo root (all workspaces green)
- [ ] `npm run start -w @jaf/server` boots and prints its token
- [ ] `curl http://127.0.0.1:4321/api/health` without a token returns **401**
- [ ] The controller loads, edits and saves every one of the eight sections
- [ ] Work experience entries can be added and removed from the page
- [ ] Resumes can be uploaded, downloaded and deleted from the page
- [ ] The Setup tab shows the pairing token with a working Copy button
- [ ] The Setup tab reports whether the Claude CLI is installed, and how to fix it
- [ ] **A new user can go from `git clone` to a saved profile using only the
      README's Quick setup and the web page** — no file paths, no editing YAML,
      no reading source
- [ ] `profile/profile.yaml` is human-readable and hand-editable
- [ ] `git status` shows no `profile/` contents staged
