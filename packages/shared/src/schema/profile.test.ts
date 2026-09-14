import { describe, it, expect } from 'vitest'
import { ProfileSchema, emptyProfile } from './profile.js'

describe('ProfileSchema', () => {
  it('fills every section with defaults from an empty object', () => {
    const p = ProfileSchema.parse({})
    expect(p.applicant_profile.personal_information.first_name).toBe('')
    expect(p.applicant_profile.personal_information.address.city).toBe('')
    expect(p.applicant_profile.work_experience).toEqual([])
    expect(p.applicant_profile.work_authorization.authorized_to_work_in_country).toBe(true)
    expect(p.applicant_profile.consents.opt_in_sms_notifications).toBe(false)
  })

  it('defaults demographics opt-in to false because the data is sensitive', () => {
    const p = ProfileSchema.parse({})
    expect(p.applicant_profile.voluntary_demographics.opt_in).toBe(false)
  })

  it('accepts a valid email and rejects a malformed one', () => {
    const ok = ProfileSchema.safeParse({
      applicant_profile: { personal_information: { email: 'a@b.com' } },
    })
    expect(ok.success).toBe(true)

    const bad = ProfileSchema.safeParse({
      applicant_profile: { personal_information: { email: 'not-an-email' } },
    })
    expect(bad.success).toBe(false)
  })

  it('allows an empty email so a half-filled profile still saves', () => {
    const r = ProfileSchema.safeParse({
      applicant_profile: { personal_information: { email: '' } },
    })
    expect(r.success).toBe(true)
  })

  it('round-trips a work experience entry', () => {
    const p = ProfileSchema.parse({
      applicant_profile: {
        work_experience: [
          { job_title: 'Engineer', company_name: 'Acme', start_date: '2023-01', is_current_role: true },
        ],
      },
    })
    expect(p.applicant_profile.work_experience[0].job_title).toBe('Engineer')
    expect(p.applicant_profile.work_experience[0].end_date).toBe('')
  })

  it('emptyProfile() produces a value that parses cleanly', () => {
    expect(ProfileSchema.safeParse(emptyProfile()).success).toBe(true)
  })
})
