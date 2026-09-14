import { describe, it, expect } from 'vitest'
import { isFillable } from './visibility.js'

const el = (html: string): Element => {
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return d.body.firstElementChild!
}
const check = (html: string) => isFillable(el(html), { checkLayout: false })

describe('isFillable', () => {
  it('accepts an ordinary text input', () => {
    expect(check('<input type="text" name="first_name">')).toBe(true)
  })

  it('rejects a hidden input', () => {
    expect(check('<input type="hidden" name="csrf">')).toBe(false)
  })

  it('rejects display:none', () => {
    expect(check('<input style="display:none" name="a">')).toBe(false)
  })

  it('rejects visibility:hidden', () => {
    expect(check('<input style="visibility:hidden" name="a">')).toBe(false)
  })

  it('rejects the hidden attribute', () => {
    expect(check('<input hidden name="a">')).toBe(false)
  })

  it('rejects aria-hidden', () => {
    expect(check('<input aria-hidden="true" name="a">')).toBe(false)
  })

  it('rejects a honeypot by name — filling one gets the application binned', () => {
    expect(check('<input name="honeypot">')).toBe(false)
    expect(check('<input name="bot-field">')).toBe(false)
    expect(check('<input name="nickname">')).toBe(false)
  })

  it('rejects disabled and readonly controls', () => {
    expect(check('<input name="a" disabled>')).toBe(false)
    expect(check('<input name="a" readonly>')).toBe(false)
  })

  it('rejects credentials and payment fields outright', () => {
    expect(check('<input type="password" name="pw">')).toBe(false)
    expect(check('<input name="credit_card">')).toBe(false)
    expect(check('<input name="ssn">')).toBe(false)
  })

  it('rejects submit and button inputs — they are not fields', () => {
    expect(check('<input type="submit" value="Apply">')).toBe(false)
    expect(check('<input type="button" value="Next">')).toBe(false)
  })

  it('accepts textarea, select and file inputs', () => {
    expect(check('<textarea name="cover"></textarea>')).toBe(true)
    expect(check('<select name="state"><option>CA</option></select>')).toBe(true)
    expect(check('<input type="file" name="resume">')).toBe(true)
  })
})
