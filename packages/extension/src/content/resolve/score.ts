import {
  CANONICAL_FIELDS, valueAtPath,
  type CanonicalField, type FieldDescriptor, type FieldKind, type FillDecision, type Profile,
} from '@jaf/shared'
import { matchOption } from '../fill/setters.js'

export const HIGH = 0.85
/** Raised from 0.5 — token-overlap weak matches were pairing wrong canonical fields. */
export const LOW = 0.65

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean))

/**
 * Single words too generic to trust as strong evidence on their own — "name"
 * appears in plenty of unrelated questions (a referrer's name, an emergency
 * contact's name), unlike a specific single word like "transgender" or
 * "veteran" that only ever means one thing on a job application. These stay
 * on the weaker, label-coverage fallback below instead of the strong
 * substring-match path (M4.7 finding — "name" filled a conditional referral
 * question with the applicant's own name; M4.8 found the same rule applied
 * to every single-word synonym had wrongly demoted transgender/veteran/
 * disability questions too).
 */
const GENERIC_SYNONYMS = new Set(['name', 'date', 'state', 'address', 'status', 'source'])

const CHOICE_KINDS = new Set<FieldKind>(['select', 'radio', 'combobox'])

function hasChoiceOptions(d: FieldDescriptor): boolean {
  return d.options.length > 0 && CHOICE_KINDS.has(d.kind)
}

/** ATS widgets often slap combobox ARIA on plain text inputs — still match text fields. */
function kindMatches(descriptorKind: FieldDescriptor['kind'], allowed: FieldKind[], withOptions: boolean): boolean {
  if (allowed.includes(descriptorKind)) return true

  if (descriptorKind === 'combobox') {
    if (withOptions) {
      return allowed.some(k => CHOICE_KINDS.has(k))
    }
    return allowed.includes('text')
  }

  return false
}

function scoreAgainst(d: FieldDescriptor, f: CanonicalField): number {
  const withOptions = hasChoiceOptions(d)
  if (!kindMatches(d.kind, f.kinds, withOptions)) return 0

  const label = norm(d.label)
  const identity = norm(`${d.name ?? ''} ${d.id ?? ''}`)
  let best = 0

  if (d.autocomplete && f.autocomplete?.includes(d.autocomplete.trim().toLowerCase())) {
    best = Math.max(best, 0.98)
  }

  for (const syn of f.synonyms) {
    const s = norm(syn)
    if (label === s) { best = Math.max(best, 0.95); continue }
    // A plain substring match is strong evidence UNLESS the synonym is one
    // of the handful of words too generic to trust on their own — those
    // fall through to the weaker, label-coverage fallback below instead.
    if (!GENERIC_SYNONYMS.has(s) && label.includes(s)) {
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

  // Token overlap catches single-word synonyms (skipped above) and wording
  // the synonym list did not anticipate. Score by how much of the LABEL's
  // distinct tokens are explained by ANY synonym of this field, combined —
  // a short label fully covered by its synonyms ("Resume/CV" against
  // resume/cv) is strong evidence; one generic word out of many unrelated
  // ones in a long question ("...please list their name" against "name")
  // is weak evidence, even though it's a perfect match for that one word.
  if (best < LOW && label) {
    const lt = tokens(label)
    const synTokens = new Set<string>()
    for (const syn of f.synonyms) for (const t of tokens(syn)) synTokens.add(t)
    const covered = [...lt].filter(t => synTokens.has(t)).length
    if (covered > 0) best = Math.max(best, 0.4 + 0.5 * (covered / lt.size))
  }

  return best
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

  if (d.kind === 'select' || d.kind === 'radio' || (d.kind === 'combobox' && d.options.length > 0)) {
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

/** Match a file input to a virtual canonical field (resume, cover letter). */
export function matchVirtualField(d: FieldDescriptor): string | null {
  if (d.kind !== 'file') return null

  let best: CanonicalField | null = null
  let bestScore = 0
  for (const f of CANONICAL_FIELDS) {
    if (!f.virtual) continue
    const s = scoreAgainst(d, f)
    if (s > bestScore) { bestScore = s; best = f }
  }
  return best && bestScore >= LOW ? best.key : null
}
