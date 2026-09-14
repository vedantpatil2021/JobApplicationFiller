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
