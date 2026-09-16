import { describe, it, expect } from 'vitest'
import { emptyProfile, type FieldDescriptor } from '@jaf/shared'
import { resolveField, resolveAll, matchVirtualField, HIGH, LOW } from './score.js'

const field = (p: Partial<FieldDescriptor>): FieldDescriptor => ({
  ref: 'r0', kind: 'text', label: '', name: null, id: null, placeholder: null,
  ariaLabel: null, autocomplete: null, options: [], required: false,
  maxLength: null, sectionIndex: 0, nearbyText: '', ...p,
})

const profile = () => {
  const p = emptyProfile()
  p.applicant_profile.personal_information.first_name = 'Ada'
  p.applicant_profile.personal_information.email = 'ada@example.com'
  p.applicant_profile.work_authorization.authorized_to_work_in_country = true
  p.applicant_profile.work_authorization.requires_sponsorship_now_or_future = false
  return p
}

describe('resolveField', () => {
  it('matches an exact label with high confidence', () => {
    const d = resolveField(field({ label: 'First Name' }), profile())
    expect(d?.value).toBe('Ada')
    expect(d!.confidence).toBeGreaterThanOrEqual(HIGH)
  })

  it('matches on the autocomplete attribute even with a useless label', () => {
    const d = resolveField(field({ label: 'fn', autocomplete: 'given-name' }), profile())
    expect(d?.value).toBe('Ada')
    expect(d!.confidence).toBeGreaterThanOrEqual(HIGH)
  })

  it('matches on the name attribute when there is no label', () => {
    expect(resolveField(field({ name: 'email' }), profile())?.value).toBe('ada@example.com')
  })

  it('matches a long natural-language question by substring', () => {
    const d = resolveField(field({
      label: 'Will you now or in the future require sponsorship for employment visa status?',
      kind: 'select', options: ['Yes', 'No'],
    }), profile())
    expect(d?.canonicalKey).toBe('requires_sponsorship')
    expect(d?.value).toBe('No')
  })

  it('picks the option that actually exists in the select', () => {
    const d = resolveField(field({
      label: 'Are you legally authorized to work?', kind: 'select',
      options: ['Yes, I am authorized', 'No, I am not'],
    }), profile())
    expect(d?.value).toBe('Yes, I am authorized')
  })

  it('returns null when nothing scores above the floor', () => {
    expect(resolveField(field({ label: 'Favourite dinosaur' }), profile())).toBeNull()
  })

  it('refuses to fill demographics while opt_in is false', () => {
    const p = profile()
    p.applicant_profile.voluntary_demographics.gender_identity = 'Female'
    expect(resolveField(field({ label: 'Gender', kind: 'select', options: ['Female', 'Male'] }), p)).toBeNull()
  })

  it('fills demographics once opt_in is true', () => {
    const p = profile()
    p.applicant_profile.voluntary_demographics.opt_in = true
    p.applicant_profile.voluntary_demographics.gender_identity = 'Female'
    expect(resolveField(field({ label: 'Gender', kind: 'select', options: ['Female', 'Male'] }), p)?.value).toBe('Female')
  })

  it('matches a short, unambiguous word embedded in a full demographic question — M4.8 regression', () => {
    // A live-test regression: M4.7 correctly stopped the generic word "name"
    // from matching a long, unrelated sentence, but the same rule wrongly
    // demoted words like "transgender"/"veteran"/"disability" that are
    // specific enough to be strong evidence even as a single word.
    const p = profile()
    p.applicant_profile.voluntary_demographics.opt_in = true
    p.applicant_profile.voluntary_demographics.transgender_status = 'No'
    p.applicant_profile.voluntary_demographics.veteran_status = 'I am not a protected veteran'
    p.applicant_profile.voluntary_demographics.disability_status = 'No, I do not have a disability'

    expect(resolveField(field({
      label: 'Do you identify as transgender? (select the option that best describes you)',
      kind: 'select', options: ['Yes', 'No', 'Decline to answer'],
    }), p)?.value).toBe('No')

    expect(resolveField(field({
      label: 'Are you a veteran or active member of the armed forces?',
      kind: 'select', options: ['I am not a protected veteran', 'I am a protected veteran'],
    }), p)?.value).toBe('I am not a protected veteran')

    expect(resolveField(field({
      label: 'Do you have a disability or chronic condition that substantially limits a major life activity?',
      kind: 'select', options: ['Yes, I have a disability', 'No, I do not have a disability'],
    }), p)?.value).toBe('No, I do not have a disability')
  })

  it('matches an adjective-phrased racial/ethnic identity question', () => {
    // The registry's synonyms were noun forms ("race", "ethnicity"); a real
    // live posting phrased this with adjectives instead, which shared no
    // substring with either synonym at all.
    const p = profile()
    p.applicant_profile.voluntary_demographics.opt_in = true
    p.applicant_profile.voluntary_demographics.race_ethnicity = 'Asian'
    const d = resolveField(field({
      label: 'How would you describe your racial/ethnic identity?',
      kind: 'select', options: ['Asian', 'White', 'Black or African American'],
    }), p)
    expect(d?.canonicalKey).toBe('race')
    expect(d?.value).toBe('Asian')
  })

  it('matches a talent-community / future-contact consent question', () => {
    const p = profile()
    p.applicant_profile.consents.opt_in_talent_community = true
    const d = resolveField(field({
      label: 'I would like to be contacted about future employment opportunities at this company.',
      kind: 'checkbox',
    }), p)
    expect(d?.canonicalKey).toBe('contact_future_opportunities')
    expect(d?.value).toBe('Yes')
  })

  it('skips a canonical field whose profile value is empty', () => {
    expect(resolveField(field({ label: 'LinkedIn URL' }), profile())).toBeNull()
  })

  it('respects the field kind — a file input is never matched to a text field', () => {
    expect(resolveField(field({ label: 'First Name', kind: 'file' }), profile())).toBeNull()
  })

  it('matches a combobox-classified text input to a text canonical field', () => {
    const d = resolveField(field({ label: 'First Name', kind: 'combobox' }), profile())
    expect(d?.value).toBe('Ada')
    expect(d!.confidence).toBeGreaterThanOrEqual(HIGH)
  })

  it('refuses a combobox with options when the profile value is not listed', () => {
    const p = profile()
    p.applicant_profile.personal_information.address.country = 'Atlantis'
    expect(resolveField(field({
      label: 'Country', kind: 'combobox', options: ['India', 'United States'],
    }), p)).toBeNull()
  })

  it('does not match a choice combobox to a text-only canonical field', () => {
    // "name" token overlap could hit full_name — but this field has options, so only
    // choice kinds apply; first_name is text-only.
    expect(resolveField(field({
      label: 'Your name please', kind: 'combobox', options: ['Mr', 'Ms', 'Dr'],
    }), profile())).toBeNull()
  })

  it('does not fill a conditional referral-name question with the applicant\'s own name', () => {
    // The word "name" alone is too generic to count as strong evidence — it
    // appears in plenty of unrelated questions. This is a live-test finding
    // (M4.7): this exact label filled with the applicant's own full name.
    // e_signature.full_name must be non-empty here, or resolveField would
    // return null anyway just because the value is empty — that would pass
    // even with the bug present and prove nothing.
    const p = profile()
    p.applicant_profile.e_signature.full_name = 'Ada Lovelace'
    expect(resolveField(field({
      kind: 'text',
      label: "If you selected 'Referred by CodePath employee', please list their name.",
    }), p)).toBeNull()
  })

  it('still matches a genuine "your name" e-signature field by the multi-word phrase', () => {
    const p = profile()
    p.applicant_profile.e_signature.full_name = 'Ada Lovelace'
    const d = resolveField(field({ kind: 'text', label: 'Your full name' }), p)
    expect(d?.canonicalKey).toBe('full_name')
    expect(d?.value).toBe('Ada Lovelace')
  })

  it('resolves a combobox country field when the option exists', () => {
    const p = profile()
    p.applicant_profile.personal_information.address.country = 'India'
    const d = resolveField(field({
      label: 'Country', kind: 'combobox', options: ['India', 'United States'],
    }), p)
    expect(d?.value).toBe('India')
    expect(d?.canonicalKey).toBe('country')
  })
})

describe('matchVirtualField', () => {
  it('recognises a resume upload field', () => {
    expect(matchVirtualField(field({ label: 'Resume/CV', kind: 'file' }))).toBe('resume')
  })

  it('ignores unrelated file inputs', () => {
    expect(matchVirtualField(field({ label: 'Portfolio sample', kind: 'file' }))).toBeNull()
  })
})

describe('resolveAll', () => {
  it('separates confident matches from fields needing AI', () => {
    const { decisions, unresolved } = resolveAll([
      field({ ref: 'a', label: 'First Name' }),
      field({ ref: 'b', label: 'Describe a time you disagreed with a manager', kind: 'textarea' }),
    ], profile())

    expect(decisions.map(d => d.ref)).toEqual(['a'])
    expect(unresolved.map(f => f.ref)).toEqual(['b'])
  })

  it('never returns a decision below the low threshold', () => {
    const { decisions } = resolveAll([field({ label: 'First Name' })], profile())
    expect(decisions.every(d => d.confidence >= LOW)).toBe(true)
  })
})
