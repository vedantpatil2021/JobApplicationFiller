import type { FieldDescriptor, FieldKind } from '@jaf/shared'
import { escapeAttrValue } from '../../lib/selector.js'

const clean = (s: string | null | undefined) =>
  (s ?? '').replace(/[*•]/g, ' ').replace(/\s+/g, ' ').trim()

export function resolveLabel(el: HTMLElement): string {
  const root = el.getRootNode() as Document | ShadowRoot

  if (el.id) {
    const explicit = root.querySelector(`label[for="${escapeAttrValue(el.id)}"]`)
    if (explicit?.textContent) return clean(explicit.textContent)
  }

  const wrapping = el.closest('label')
  if (wrapping?.textContent) return clean(wrapping.textContent)

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy.split(/\s+/)
      .map(id => root.querySelector(`[id="${escapeAttrValue(id)}"]`)?.textContent ?? '')
      .join(' ')
    if (clean(text)) return clean(text)
  }

  const aria = clean(el.getAttribute('aria-label'))
  if (aria) return aria

  const legend = el.closest('fieldset')?.querySelector('legend')
  if (legend?.textContent) return clean(legend.textContent)

  const prev = el.previousElementSibling
  if (prev && !prev.matches('input, select, textarea') && prev.textContent) {
    const t = clean(prev.textContent)
    if (t.length > 0 && t.length < 120) return t
  }

  return clean(el.getAttribute('placeholder'))
}

export function classify(el: HTMLElement): FieldKind {
  if (el.tagName === 'TEXTAREA') return 'textarea'
  if (el.tagName === 'SELECT') return 'select'

  const input = el as HTMLInputElement
  const type = (input.type ?? 'text').toLowerCase()
  if (type === 'file') return 'file'
  if (type === 'checkbox') return 'checkbox'
  if (type === 'radio') return 'radio'
  if (type === 'date' || type === 'month') return 'date'

  const role = el.getAttribute('role')
  if (role === 'combobox' || el.hasAttribute('aria-autocomplete')
      || el.hasAttribute('aria-controls') || el.hasAttribute('list')) {
    return 'combobox'
  }
  return 'text'
}

function harvestListboxOptions(root: Document | ShadowRoot, ids: string): string[] {
  const out: string[] = []
  for (const id of ids.split(/\s+/)) {
    const lb = root.querySelector(`[id="${escapeAttrValue(id)}"]`)
    if (!lb) continue
    for (const opt of lb.querySelectorAll('[role="option"]')) {
      const t = clean(opt.textContent)
      if (t) out.push(t)
    }
  }
  return out
}

function harvestOptions(el: HTMLElement, kind: FieldKind): string[] {
  const root = el.getRootNode() as Document | ShadowRoot

  if (kind === 'select') {
    return Array.from((el as HTMLSelectElement).options)
      .map(o => clean(o.textContent))
      .filter(o => o.length > 0)
  }

  if (kind !== 'combobox') return []

  const options: string[] = []

  const listId = el.getAttribute('list')
  if (listId) {
    const dl = root.querySelector(`datalist[id="${escapeAttrValue(listId)}"]`)
    if (dl) {
      for (const opt of dl.querySelectorAll('option')) {
        const t = clean(opt.textContent || opt.getAttribute('value'))
        if (t) options.push(t)
      }
    }
  }

  for (const attr of ['aria-controls', 'aria-owns'] as const) {
    const ids = el.getAttribute(attr)
    if (ids) options.push(...harvestListboxOptions(root, ids))
  }

  return [...new Set(options)]
}

export function describeField(el: HTMLElement, ref: string, sectionIndex = 0): FieldDescriptor {
  const input = el as HTMLInputElement & HTMLSelectElement
  const kind = classify(el)
  const maxLength = input.maxLength && input.maxLength > 0 ? input.maxLength : null

  return {
    ref,
    kind,
    label: resolveLabel(el),
    name: input.name || null,
    id: el.id || null,
    placeholder: el.getAttribute('placeholder'),
    ariaLabel: el.getAttribute('aria-label'),
    autocomplete: el.getAttribute('autocomplete'),
    options: harvestOptions(el, kind),
    required: input.required || el.getAttribute('aria-required') === 'true',
    maxLength,
    sectionIndex,
    nearbyText: clean(el.closest('fieldset, .field, [class*="field"]')?.textContent).slice(0, 200),
  }
}
