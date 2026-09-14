import { escapeAttrValue } from '../../lib/selector.js'

const AFFIRMATIVE = /^(yes|true|i agree|agree|accept|1)$/i

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

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const v = norm(value)
  const options = Array.from(el.options)
  const hit =
    options.find(o => norm(o.textContent ?? '') === v || norm(o.value) === v) ??
    options.find(o => norm(o.textContent ?? '').startsWith(v)) ??
    options.find(o => norm(o.textContent ?? '').includes(v))

  if (!hit) return false
  el.value = hit.value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export function fillRadio(el: HTMLInputElement, value: string): boolean {
  const root = el.getRootNode() as Document | ShadowRoot
  const peers = el.name
    ? Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${escapeAttrValue(el.name)}"]`))
    : [el]

  const v = norm(value)
  const text = (p: HTMLInputElement) => norm(p.closest('label')?.textContent ?? p.value ?? '')
  const hit = peers.find(p => text(p) === v) ?? peers.find(p => text(p).includes(v))
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
