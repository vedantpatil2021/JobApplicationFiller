import { describe, it, expect } from 'vitest'
import { isImplausibleYesNoAnswer, isImplausibleDateAnswer } from './plausibility.js'

describe('isImplausibleYesNoAnswer', () => {
  it('flags a yes/no-phrased label that got a place name — the live-test finding', () => {
    expect(isImplausibleYesNoAnswer('Are you Hispanic or Latino?', 'Columbus')).toBe(true)
  })

  it('does not flag a yes/no-phrased label that got a real yes/no answer', () => {
    expect(isImplausibleYesNoAnswer('Are you Hispanic or Latino?', 'No')).toBe(false)
    expect(isImplausibleYesNoAnswer('Do you require sponsorship?', 'Yes')).toBe(false)
    expect(isImplausibleYesNoAnswer('Have you worked here before?', 'Decline to answer')).toBe(false)
  })

  it('does not flag a label that is not phrased as yes/no', () => {
    expect(isImplausibleYesNoAnswer('Why do you want to work here?', 'Because widgets.')).toBe(false)
    expect(isImplausibleYesNoAnswer('City', 'Columbus')).toBe(false)
  })

  it('does not flag an empty value — that is a separate "no value" outcome', () => {
    expect(isImplausibleYesNoAnswer('Are you Hispanic or Latino?', '')).toBe(false)
  })
})

describe('isImplausibleDateAnswer', () => {
  it('flags an ISO date value going into a field whose label has nothing to do with dates', () => {
    // Live-test finding (M4.8): "Location (City)" got e_signature.date's
    // value ("2026-09-14") — the exact profile value confirmed the source.
    expect(isImplausibleDateAnswer('Location (City)', '2026-09-14')).toBe(true)
  })

  it('does not flag an ISO date going into a field that is genuinely about a date', () => {
    expect(isImplausibleDateAnswer('Earliest available start date', '2026-09-14')).toBe(false)
    expect(isImplausibleDateAnswer('When can you start?', '2026-09-14')).toBe(false)
    expect(isImplausibleDateAnswer('Signature date', '2026-09-14')).toBe(false)
  })

  it('does not flag a value that is not date-shaped', () => {
    expect(isImplausibleDateAnswer('Location (City)', 'Columbus')).toBe(false)
  })

  it('does not flag an empty value', () => {
    expect(isImplausibleDateAnswer('Location (City)', '')).toBe(false)
  })
})
