import { extname } from './path.js'
import { getSettings } from './storage.js'

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

export interface FetchedResume {
  name: string
  mime: string
  /** Base64-encoded bytes — safe to pass through chrome.runtime.sendMessage. */
  data: string
}

/** First resume in profile/resumes/, or null when none / server unreachable. */
export async function fetchPrimaryResume(): Promise<FetchedResume | null> {
  const { serverUrl, token } = await getSettings()
  try {
    const listRes = await fetch(`${serverUrl}/api/resumes`, {
      headers: { 'X-JAF-Token': token },
    })
    if (!listRes.ok) return null

    const { resumes } = (await listRes.json()) as { resumes: { name: string }[] }
    const name = resumes[0]?.name
    if (!name) return null

    const fileRes = await fetch(`${serverUrl}/api/resumes/${encodeURIComponent(name)}`, {
      headers: { 'X-JAF-Token': token },
    })
    if (!fileRes.ok) return null

    const bytes = new Uint8Array(await fileRes.arrayBuffer())
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)

    const ext = extname(name).toLowerCase()
    return { name, mime: MIME[ext] ?? 'application/octet-stream', data: btoa(binary) }
  } catch {
    return null
  }
}
