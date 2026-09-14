import type { Profile } from '@jaf/shared'

/** One uploaded resume. Task 9 reuses this type; do not redeclare it there. */
export interface Resume { name: string; size: number }

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
export const listResumes  = () => call<{ resumes: Resume[] }>('/api/resumes').then(r => r.resumes)

export interface Status {
  ok: boolean
  dataDir: string
  profileExists: boolean
  resumeCount: number
  tools: { claude: ToolInfo; codex: ToolInfo }
}
export interface ToolInfo { installed: boolean; version: string }

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
