import type { FieldDescriptor, MapFieldsResponse, Profile } from '@jaf/shared'
import { getSettings } from './storage.js'

function serverError(status: number, body: { error?: string }): string {
  if (status === 401) {
    return 'Extension not paired — copy token from Setup tab and Save in Options'
  }
  return body.error ?? `Server returned ${status}`
}

/** Direct fetch — used by the background service worker (chrome-extension origin). */
export async function mapFieldsViaServer(
  fields: FieldDescriptor[],
  profile: Profile,
  jobDescription: string,
): Promise<MapFieldsResponse> {
  const { serverUrl, token } = await getSettings()
  try {
    const res = await fetch(`${serverUrl}/api/ai/map-fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-JAF-Token': token,
      },
      body: JSON.stringify({ fields, profile, jobDescription }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { answers: [], error: serverError(res.status, body) }
    }
    return (await res.json()) as MapFieldsResponse
  } catch {
    return { answers: [], error: 'Could not reach the server — is npm run dev running?' }
  }
}

/**
 * Content scripts run on the ATS page origin, so fetch would fail CORS.
 * Route through the background worker, which has a chrome-extension origin.
 */
export async function requestMapFields(
  fields: FieldDescriptor[],
  profile: Profile,
  jobDescription: string,
): Promise<MapFieldsResponse> {
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'jaf.map-fields',
      fields,
      profile,
      jobDescription,
    })
    return (res as MapFieldsResponse | undefined) ?? {
      answers: [],
      error: 'Extension background did not respond',
    }
  } catch {
    return { answers: [], error: 'Could not reach the extension background' }
  }
}
