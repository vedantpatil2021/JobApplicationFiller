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
