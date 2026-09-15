import {
  AI_FILL_THRESHOLD, type FieldDescriptor, type FillDecision,
  type FillResult, type Profile,
} from '@jaf/shared'
import type { HarvestedField } from './harvest/collect.js'
import { applyDecisions } from './fill/apply.js'
import { requestMapFields } from '../lib/ai.js'
import { scrapeJobDescription } from './job-description.js'

const AI_KINDS = new Set<FieldDescriptor['kind']>([
  'text', 'textarea', 'select', 'radio', 'checkbox', 'date', 'combobox',
])

export function isAiEligible(d: FieldDescriptor): boolean {
  return AI_KINDS.has(d.kind)
}

function toDecision(
  ref: string,
  value: string,
  confidence: number,
  source: 'ai' | 'cache',
): FillDecision {
  return {
    ref,
    value,
    confidence,
    source,
    canonicalKey: null,
    reason: source === 'cache' ? 'cached answer' : 'AI suggested',
  }
}

/** Run the M4 AI fallback for heuristic misses; never throws. */
export async function fillWithAi(
  fields: HarvestedField[],
  unresolved: FieldDescriptor[],
  profile: Profile,
  doc: Document,
  online: boolean,
): Promise<FillResult[]> {
  const eligible = unresolved.filter(isAiEligible)
  const deferred = unresolved.filter(d => !isAiEligible(d))
  const results: FillResult[] = []

  for (const d of deferred) {
    const note = d.kind === 'file'
      ? 'Unsupported file field — attach manually'
      : 'no confident match'
    results.push({
      ref: d.ref, label: d.label, outcome: 'needs-user', value: '',
      confidence: 0, source: 'heuristic', note,
    })
  }

  if (eligible.length === 0) return results

  if (!online) {
    for (const d of eligible) {
      results.push({
        ref: d.ref, label: d.label, outcome: 'needs-user', value: '',
        confidence: 0, source: 'heuristic', note: 'server offline — AI unavailable',
      })
    }
    return results
  }

  const { answers, error } = await requestMapFields(
    eligible, profile, scrapeJobDescription(doc),
  )

  const answered = new Set<string>()
  const confident = answers.filter(a => a.confidence >= AI_FILL_THRESHOLD)
  const low = answers.filter(a => a.confidence < AI_FILL_THRESHOLD)

  if (confident.length > 0) {
    const decisions = confident.map(a => toDecision(a.ref, a.value, a.confidence, a.source))
    results.push(...applyDecisions(fields, decisions))
    for (const a of confident) answered.add(a.ref)
  }

  for (const a of low) {
    answered.add(a.ref)
    results.push({
      ref: a.ref,
      label: eligible.find(d => d.ref === a.ref)?.label ?? a.ref,
      outcome: 'needs-user', value: '', confidence: a.confidence, source: a.source,
      note: 'AI was not confident enough — please answer',
    })
  }

  for (const d of eligible) {
    if (answered.has(d.ref)) continue
    const note = error ?? 'no answer from profile or AI'
    results.push({
      ref: d.ref, label: d.label, outcome: 'needs-user', value: '',
      confidence: 0, source: 'heuristic', note,
    })
  }

  return results
}
