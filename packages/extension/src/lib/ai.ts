import type { FieldDescriptor, FieldAnswer, MapFieldsResponse, Profile } from '@jaf/shared'
import { getSettings } from './storage.js'

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
      return { answers: [], error: `Server returned ${res.status}` }
    }
    return (await res.json()) as MapFieldsResponse
  } catch {
    return { answers: [], error: 'Could not reach the server' }
  }
}
