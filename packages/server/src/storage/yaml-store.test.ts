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
