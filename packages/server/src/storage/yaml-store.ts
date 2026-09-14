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
