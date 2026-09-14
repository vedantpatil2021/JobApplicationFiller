import { describe, it, expect } from 'vitest'
import { CANONICAL_FIELDS, valueAtPath } from './registry.js'
import { emptyProfile } from '../schema/profile.js'

describe('canonical registry', () => {
  it('gives every entry a unique key', () => {
    const keys = CANONICAL_FIELDS.map(f => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('points every entry at a path that resolves in a real profile', () => {
    const p = emptyProfile()
    for (const f of CANONICAL_FIELDS.filter(f => !f.virtual)) {
      expect(() => valueAtPath(p, f.path), `path broken: ${f.key}`).not.toThrow()
    }
  })

  it('reads a nested value by path', () => {
    const p = emptyProfile()
    p.applicant_profile.personal_information.address.city = 'Pune'
    expect(valueAtPath(p, 'personal_information.address.city')).toBe('Pune')
  })

  it('renders booleans as Yes/No because forms ask them as questions', () => {
    const p = emptyProfile()
    p.applicant_profile.work_authorization.requires_sponsorship_now_or_future = false
    expect(valueAtPath(p, 'work_authorization.requires_sponsorship_now_or_future')).toBe('No')
  })

  it('marks every demographics entry sensitive so the opt-in gate can find them', () => {
    const demo = CANONICAL_FIELDS.filter(f => f.path.startsWith('voluntary_demographics.'))
    expect(demo.length).toBeGreaterThan(0)
    expect(demo.every(f => f.sensitive)).toBe(true)
  })

  it('marks fields with no profile value as virtual', () => {
    for (const f of CANONICAL_FIELDS) {
      expect(f.path === '', `${f.key}: empty path must be virtual`).toBe(Boolean(f.virtual))
    }
  })

  it('covers the fields every application asks for', () => {
    const keys = CANONICAL_FIELDS.map(f => f.key)
    for (const k of ['first_name', 'last_name', 'email', 'phone', 'linkedin', 'resume',
                     'work_authorized', 'requires_sponsorship']) {
      expect(keys).toContain(k)
    }
  })
})
