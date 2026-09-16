import { escapeAttrValue } from '../../lib/selector.js'
import { openControl, closeControl } from '../dom-interact.js'

const AFFIRMATIVE = /^(yes|true|i agree|agree|accept|1)$/i

export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Prefix match only at a word boundary — "yes" must not match "yesterday". */
function prefixMatch(value: string, option: string): boolean {
  if (value.length < 2) return false
  if (option.startsWith(value)) {
    const rest = option.slice(value.length)
    return rest.length === 0 || !/^[a-z]/i.test(rest)
  }
  if (value.startsWith(option) && option.length >= 2) {
    const rest = value.slice(option.length)
    return rest.length === 0 || !/^[a-z]/i.test(rest)
  }
  return false
}

/**
 * Pick the option that best matches a profile/AI value. Returns null rather
 * than guessing — loose substring matches like "yes" inside "yesterday" caused
 * validation errors on real ATS forms.
 */
export function matchOption(value: string, options: string[]): string | null {
  if (options.length === 0) return value
  const v = norm(value)
  if (!v) return null

  const exact = options.find(o => norm(o) === v || norm(o.replace(/[^a-z0-9 ]+/gi, '')) === v)
  if (exact) return exact

  const starts = options.find(o => prefixMatch(v, norm(o)))
  if (starts) return starts

  // Word-boundary match for longer values (e.g. "authorized" in "Yes, I am authorized").
  if (v.length >= 3) {
    const re = new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    const word = options.find(o => re.test(norm(o)))
    if (word) return word
  }

  return null
}

/**
 * React, Vue and Angular install their own `value` setter on the element
 * instance and ignore writes that skip it. Going through the prototype setter
 * and then dispatching bubbling events is the only reliable way in.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value

  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Cut at a word boundary so a truncated answer still reads as a sentence. */
function truncate(value: string, max: number | null): string {
  if (!max || value.length <= max) return value
  const cut = value.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space >= max * 0.5 ? cut.slice(0, space) : cut).trim()
}

export function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  const max = el.maxLength && el.maxLength > 0 ? el.maxLength : null
  setNativeValue(el, truncate(value, max))
  return true
}

export function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const picked = matchOption(value, Array.from(el.options).map(o => o.textContent ?? o.value))
  if (!picked) return false

  const hit = Array.from(el.options).find(o =>
    norm(o.textContent ?? '') === norm(picked) || norm(o.value) === norm(picked),
  )
  if (!hit) return false

  el.value = hit.value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

/** Click a listbox option when the combobox is wired to one via ARIA. */
function clickListboxOption(el: HTMLInputElement, text: string): void {
  const root = el.getRootNode() as Document | ShadowRoot
  const target = norm(text)

  for (const attr of ['aria-controls', 'aria-owns'] as const) {
    const ids = el.getAttribute(attr)?.split(/\s+/) ?? []
    for (const id of ids) {
      const lb = root.querySelector(`[id="${escapeAttrValue(id)}"]`)
      if (!lb) continue
      for (const opt of lb.querySelectorAll('[role="option"]')) {
        if (norm(opt.textContent ?? '') === target) {
          (opt as HTMLElement).click()
          return
        }
      }
    }
  }
}

/**
 * Combobox with known options: pick from the list, never type free text.
 * Plain comboboxes (name/email with ARIA but no options) fall back to fillText.
 *
 * The listbox discovered earlier (harvest/expand-combobox.ts) may since have
 * closed — this reopens the control before searching for the option, rather
 * than assuming it is still in the DOM (M4.9 finding: without this, only the
 * typed text landed on the page, never a real selection).
 */
export function fillCombobox(el: HTMLInputElement, value: string, options: string[]): boolean {
  if (options.length === 0) return fillText(el, value)

  const picked = matchOption(value, options)
  if (!picked) return false

  openControl(el)
  setNativeValue(el, picked)
  clickListboxOption(el, picked)
  closeControl(el)
  return true
}

export function fillRadio(el: HTMLInputElement, value: string): boolean {
  const root = el.getRootNode() as Document | ShadowRoot
  const peers = el.name
    ? Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${escapeAttrValue(el.name)}"]`))
    : [el]

  const picked = matchOption(value, peers.map(p => p.closest('label')?.textContent ?? p.value ?? ''))
  if (!picked) return false

  const hit = peers.find(p => norm(p.closest('label')?.textContent ?? p.value ?? '') === norm(picked))
    ?? peers.find(p => norm(p.closest('label')?.textContent ?? '').startsWith(norm(picked)))
  if (!hit) return false

  hit.click()                 // click, so framework handlers run
  if (!hit.checked) {
    hit.checked = true
    hit.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return true
}

export function fillCheckbox(el: HTMLInputElement, value: string): boolean {
  const want = AFFIRMATIVE.test(value.trim())
  if (el.checked !== want) {
    el.click()
    if (el.checked !== want) {
      el.checked = want
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }
  return true
}
