import { describe, it, expect } from 'vitest'
import { emptyProfile, type FieldDescriptor } from '@jaf/shared'
import { resolveField, resolveAll, HIGH, LOW } from './score.js'

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

  it('skips a canonical field whose profile value is empty', () => {
    expect(resolveField(field({ label: 'LinkedIn URL' }), profile())).toBeNull()
  })

  it('respects the field kind — a file input is never matched to a text field', () => {
    expect(resolveField(field({ label: 'First Name', kind: 'file' }), profile())).toBeNull()
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
