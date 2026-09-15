import type { FieldDescriptor, FillResult } from '@jaf/shared'
import type { HarvestedField } from './harvest/collect.js'
import { matchVirtualField } from './resolve/score.js'
import { attachFile } from './fill/file.js'
import type { FetchedResume } from '../lib/resume.js'

function decodeResume(raw: FetchedResume): File {
  const bytes = Uint8Array.from(atob(raw.data), c => c.charCodeAt(0))
  return new File([bytes], raw.name, { type: raw.mime })
}

async function fetchResumeFromBackground(): Promise<FetchedResume | null> {
  try {
    return (await chrome.runtime.sendMessage({ type: 'jaf.fetch-resume' })) as FetchedResume | null
  } catch {
    return null
  }
}

/**
 * Attach resume/cover-letter files from profile/resumes/ before AI runs.
 * Returns results plus any unresolved fields still needing AI or manual input.
 */
export async function fillVirtualFiles(
  fields: HarvestedField[],
  unresolved: FieldDescriptor[],
  online: boolean,
): Promise<{ results: FillResult[]; remaining: FieldDescriptor[] }> {
  const results: FillResult[] = []
  const remaining: FieldDescriptor[] = []
  let resumeCache: FetchedResume | null | undefined

  for (const d of unresolved) {
    const virtualKey = matchVirtualField(d)
    if (!virtualKey) {
      remaining.push(d)
      continue
    }

    const field = fields.find(f => f.descriptor.ref === d.ref)
    const base = { ref: d.ref, label: d.label, confidence: 0.95, source: 'profile' as const }

    if (!field) {
      results.push({ ...base, outcome: 'failed', value: '', note: 'element went away' })
      continue
    }

    if (!online) {
      results.push({
        ...base, outcome: 'needs-user', value: '',
        note: 'server offline — cannot attach resume from profile',
      })
      continue
    }

    if (virtualKey === 'cover_letter') {
      results.push({
        ...base, outcome: 'needs-user', value: '',
        note: 'Cover letter upload not supported yet — attach manually',
      })
      continue
    }

    if (resumeCache === undefined) resumeCache = await fetchResumeFromBackground()
    if (!resumeCache) {
      results.push({
        ...base, outcome: 'needs-user', value: '',
        note: 'No resume on server — add one in the Resumes tab',
      })
      continue
    }

    const file = decodeResume(resumeCache)
    const ok = attachFile(field.el as HTMLInputElement, file)
    results.push({
      ...base,
      outcome: ok ? 'filled' : 'failed',
      value: resumeCache.name,
      note: ok ? 'attached from your profile' : 'could not attach — upload manually',
    })
  }

  return { results, remaining }
}
