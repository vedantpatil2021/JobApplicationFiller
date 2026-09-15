import { ProfileSchema, type Profile } from '@jaf/shared'
import { getSettings, setCachedProfile, getCachedProfile, setSettings } from './storage.js'

export type SyncFailureReason = 'unreachable' | 'unauthorized' | 'invalid-profile'

export interface SyncResult {
  profile: Profile | null
  online: boolean
  reason?: SyncFailureReason
}

/**
 * Server is source of truth; the cache is what keeps autofill working when
 * the server is not running. Never throws. Distinguishes *why* a sync
 * failed — M4.6 finding: a blanket `online: false` made every failure read
 * as "server offline" even when the real cause was a stale pairing token or
 * a profile.yaml that failed schema validation, which AI-fallback callers
 * need to tell the user the actual fix.
 */
export async function syncProfile(): Promise<SyncResult> {
  const { serverUrl, token } = await getSettings()
  try {
    const res = await fetch(`${serverUrl}/api/profile`, { headers: { 'X-JAF-Token': token } })

    if (res.status === 401) {
      return { profile: await getCachedProfile(), online: false, reason: 'unauthorized' }
    }
    if (!res.ok) throw new Error(String(res.status))

    const parsed = ProfileSchema.safeParse(await res.json())
    if (!parsed.success) {
      return { profile: await getCachedProfile(), online: false, reason: 'invalid-profile' }
    }

    await setCachedProfile(parsed.data)
    await setSettings({ lastSyncedAt: Date.now() })
    return { profile: parsed.data, online: true }
  } catch {
    return { profile: await getCachedProfile(), online: false, reason: 'unreachable' }
  }
}

/** One actionable sentence per failure reason, shown in the review panel. */
export function describeSyncFailure(reason?: SyncFailureReason): string {
  switch (reason) {
    case 'unauthorized':
      return 'Extension not paired — copy the token from the Setup tab and Save in Options.'
    case 'invalid-profile':
      return 'Server returned a profile that failed validation — check profile.yaml for a typo.'
    default:
      return 'Could not reach the server — is `npm run dev` running?'
  }
}
