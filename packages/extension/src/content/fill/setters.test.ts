import { describe, it, expect, vi } from 'vitest'
import {
  setNativeValue, fillText, fillSelect, fillRadio, fillCheckbox,
  fillCombobox, matchOption,
} from './setters.js'

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

  it('does not match "Yes" inside "Yesterday"', () => {
    expect(matchOption('Yes', ['Yesterday', 'No'])).toBeNull()
  })

  it('does not match "No" inside unrelated words', () => {
    expect(matchOption('No', ['Know', 'Not applicable'])).toBeNull()
  })
})

describe('fillCombobox', () => {
  it('picks a listbox option instead of typing free text', () => {
    const doc = parse(`<label for="c">Country</label>
      <input id="c" role="combobox" aria-controls="list">
      <ul id="list" role="listbox">
        <li role="option">India</li><li role="option">United States</li>
      </ul>`)
    const input = doc.querySelector('input')!
    doc.querySelector('[role="option"]')!.addEventListener('click', () => { input.value = 'India' })
    expect(fillCombobox(input, 'India', ['India', 'United States'])).toBe(true)
    expect(input.value).toBe('India')
  })

  it('refuses when no option matches', () => {
    const input = parse('<input role="combobox">').querySelector('input')!
    expect(fillCombobox(input, 'Atlantis', ['India', 'United States'])).toBe(false)
    expect(input.value).toBe('')
  })

  it('falls back to fillText when there are no options', () => {
    const input = parse('<input aria-autocomplete="list">').querySelector('input')!
    expect(fillCombobox(input, 'Ada', [])).toBe(true)
    expect(input.value).toBe('Ada')
  })

  it('reopens the control before searching for the option — it may have been closed since discovery', () => {
    // expandComboboxes discovers options and then closes the menu again
    // (M4.9). If fillCombobox assumes the listbox is still in the DOM, it
    // silently finds nothing and only the typed text (not a real
    // selection) ends up on the page — the live-test finding this fixes.
    const doc = parse('<input id="c" role="combobox" aria-controls="list">')
    const input = doc.getElementById('c') as HTMLInputElement
    let clicked = ''

    input.addEventListener('mousedown', () => {
      if (doc.getElementById('list')) return   // already open
      const list = doc.createElement('ul')
      list.id = 'list'
      list.setAttribute('role', 'listbox')
      list.innerHTML = '<li role="option">India</li><li role="option">United States</li>'
      list.addEventListener('click', e => { clicked = (e.target as HTMLElement).textContent ?? '' })
      doc.body.appendChild(list)
    })

    expect(doc.getElementById('list')).toBeNull()   // closed — the menu does not exist yet
    expect(fillCombobox(input, 'India', ['India', 'United States'])).toBe(true)

    expect(clicked).toBe('India')   // the real option was actually clicked, not just typed
  })

  it('does not type into a custom combobox when reopening reveals no real option', () => {
    const doc = parse('<input id="c" role="combobox" aria-controls="list">')
    const input = doc.getElementById('c') as HTMLInputElement

    expect(fillCombobox(input, 'India', ['India', 'United States'])).toBe(false)
    expect(input.value).toBe('')
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
