import { describe, it, expect, vi } from 'vitest'
import { setNativeValue, fillText, fillSelect, fillRadio, fillCheckbox } from './setters.js'

const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

describe('setNativeValue', () => {
  it('writes the value', () => {
    const input = parse('<input>').querySelector('input')!
    setNativeValue(input, 'Ada')
    expect(input.value).toBe('Ada')
  })

  it('dispatches bubbling input and change so React notices', () => {
    const input = parse('<input>').querySelector('input')!
    const seen: string[] = []
    input.addEventListener('input', e => seen.push(`input:${e.bubbles}`))
    input.addEventListener('change', e => seen.push(`change:${e.bubbles}`))
    setNativeValue(input, 'Ada')
    expect(seen).toEqual(['input:true', 'change:true'])
  })

  it('uses the prototype setter, not the instance property', () => {
    const input = parse('<input>').querySelector('input')!
    // A React-controlled input shadows `value` with its own instance setter.
    const shadowed = vi.fn()
    Object.defineProperty(input, 'value', { set: shadowed, get: () => '', configurable: true })
    setNativeValue(input, 'Ada')
    expect(shadowed).not.toHaveBeenCalled()
  })

  it('works on a textarea too', () => {
    const ta = parse('<textarea></textarea>').querySelector('textarea')!
    setNativeValue(ta, 'cover letter')
    expect(ta.value).toBe('cover letter')
  })
})

describe('fillSelect', () => {
  const sel = () => parse('<select><option value="">Pick</option><option>India</option><option>United States</option></select>')
    .querySelector('select')!

  it('selects an exact option', () => {
    const s = sel(); expect(fillSelect(s, 'India')).toBe(true); expect(s.value).toBe('India')
  })
  it('selects case-insensitively', () => {
    const s = sel(); expect(fillSelect(s, 'india')).toBe(true); expect(s.value).toBe('India')
  })
  it('falls back to a substring match', () => {
    const s = sel(); expect(fillSelect(s, 'United')).toBe(true); expect(s.value).toBe('United States')
  })
  it('refuses rather than picking the wrong option', () => {
    const s = sel(); expect(fillSelect(s, 'Atlantis')).toBe(false); expect(s.value).toBe('')
  })
})

describe('fillRadio and fillCheckbox', () => {
  it('checks the radio whose label matches', () => {
    const d = parse(`<label><input type="radio" name="a" value="Yes">Yes</label>
                     <label><input type="radio" name="a" value="No">No</label>`)
    const first = d.querySelector('input')!
    expect(fillRadio(first, 'No')).toBe(true)
    expect(d.querySelectorAll<HTMLInputElement>('input')[1].checked).toBe(true)
  })

  it('refuses when no radio option matches', () => {
    const d = parse('<label><input type="radio" name="a" value="Yes">Yes</label>')
    expect(fillRadio(d.querySelector('input')!, 'Maybe')).toBe(false)
  })

  it('checks a checkbox for an affirmative value', () => {
    const cb = parse('<input type="checkbox">').querySelector('input')!
    expect(fillCheckbox(cb, 'Yes')).toBe(true)
    expect(cb.checked).toBe(true)
  })

  it('leaves a checkbox unchecked for a negative value', () => {
    const cb = parse('<input type="checkbox">').querySelector('input')!
    fillCheckbox(cb, 'No')
    expect(cb.checked).toBe(false)
  })
})

describe('fillText truncation', () => {
  it('truncates to maxlength at a word boundary', () => {
    const input = parse('<input maxlength="10">').querySelector('input')!
    fillText(input, 'hello wonderful world')
    expect(input.value.length).toBeLessThanOrEqual(10)
    expect(input.value).toBe('hello')
  })
})
