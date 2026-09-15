import { describe, it, expect } from 'vitest'
import { isImplausibleYesNoAnswer } from './plausibility.js'

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
