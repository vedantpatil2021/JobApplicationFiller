import {
  CANONICAL_FIELDS, valueAtPath,
  type CanonicalField, type FieldDescriptor, type FieldKind, type FillDecision, type Profile,
} from '@jaf/shared'

export const HIGH = 0.85
export const LOW = 0.5

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean))

/** ATS widgets often slap combobox ARIA on plain text inputs — still match text fields. */
function kindMatches(descriptorKind: FieldDescriptor['kind'], allowed: FieldKind[]): boolean {
  if (allowed.includes(descriptorKind)) return true
  return descriptorKind === 'combobox' && allowed.includes('text')
}

function scoreAgainst(d: FieldDescriptor, f: CanonicalField): number {
  if (!kindMatches(d.kind, f.kinds)) return 0

  const label = norm(d.label)
  const identity = norm(`${d.name ?? ''} ${d.id ?? ''}`)
  let best = 0

  if (d.autocomplete && f.autocomplete?.includes(d.autocomplete.trim().toLowerCase())) {
    best = Math.max(best, 0.98)
  }

  for (const syn of f.synonyms) {
    const s = norm(syn)
    if (label === s) { best = Math.max(best, 0.95); continue }
    if (label.includes(s)) {
      // A long synonym covering most of the label is stronger evidence than a
      // short one buried in a long question. Weight by coverage so the best
      // synonym wins on merit rather than on registry order.
      best = Math.max(best, Math.min(0.94, 0.8 + 0.15 * (s.length / label.length)))
      continue
    }
    if (identity.includes(s.replace(/ /g, '')) || identity.includes(s)) {
      best = Math.max(best, 0.88)
    }
  }

  // Token overlap catches wording the synonym list did not anticipate.
  if (best === 0 && label) {
    const lt = tokens(label)
    for (const syn of f.synonyms) {
      const st = tokens(syn)
      const hits = [...st].filter(t => lt.has(t)).length
      if (hits > 0) best = Math.max(best, 0.4 + 0.3 * (hits / st.size))
    }
  }

  return best
}

/** For selects and radios, only an option that really exists can be used. */
function matchOption(value: string, options: string[]): string | null {
  if (options.length === 0) return value
  const v = norm(value)
  return (
    options.find(o => norm(o) === v) ??
    options.find(o => norm(o).startsWith(v)) ??
    options.find(o => norm(o).includes(v)) ??
    null
  )
}

export function resolveField(d: FieldDescriptor, profile: Profile): FillDecision | null {
  let best: CanonicalField | null = null
  let bestScore = 0

  for (const f of CANONICAL_FIELDS) {
    const s = scoreAgainst(d, f)
    if (s > bestScore) { bestScore = s; best = f }
  }
  if (!best || bestScore < LOW) return null

  // Virtual fields (resume, cover letter) have no string value — M4 uploads them.
  if (best.virtual) return null

  // Sensitive data stays untouched until the user opts in.
  if (best.sensitive && !profile.applicant_profile.voluntary_demographics.opt_in) return null

  let value: string
  try { value = valueAtPath(profile, best.path) } catch { return null }
  if (!value) return null

  if (d.kind === 'select' || d.kind === 'radio') {
    const picked = matchOption(value, d.options)
    if (!picked) return null
    value = picked
  }

  return {
    ref: d.ref,
    value,
    confidence: bestScore,
    source: 'heuristic',
    canonicalKey: best.key,
    reason: `matched "${d.label || d.name || d.ref}" to ${best.key}`,
  }
}

export function resolveAll(descriptors: FieldDescriptor[], profile: Profile) {
  const decisions: FillDecision[] = []
  const unresolved: FieldDescriptor[] = []

  for (const d of descriptors) {
    const decision = resolveField(d, profile)
    if (decision) decisions.push(decision)
    else unresolved.push(d)     // M4 hands these to the Claude CLI
  }
  return { decisions, unresolved }
}
