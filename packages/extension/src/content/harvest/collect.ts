import type { FieldDescriptor } from '@jaf/shared'
import { isFillable } from './visibility.js'
import { describeField, resolveLabel } from './descriptor.js'
import { escapeAttrValue } from '../../lib/selector.js'

export interface HarvestedField { el: HTMLElement; descriptor: FieldDescriptor }

/** Walk the tree, descending into open shadow roots. Closed roots are unreachable. */
function walk(root: Document | ShadowRoot | Element, out: HTMLElement[]): void {
  const scope = root as ParentNode
  for (const el of Array.from(scope.querySelectorAll('input, textarea, select'))) {
    out.push(el as HTMLElement)
  }
  for (const el of Array.from(scope.querySelectorAll('*'))) {
    const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot
    if (shadow) walk(shadow, out)
  }
}

/** Repeated blocks (multiple work-experience rows) get an increasing index. */
function sectionIndexer() {
  const seen = new Map<string, number>()
  return (label: string): number => {
    const key = label.toLowerCase()
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    return n
  }
}

export function collectFields(
  root: Document | ShadowRoot,
  opts: { checkLayout?: boolean } = {},
): HarvestedField[] {
  const elements: HTMLElement[] = []
  walk(root, elements)

  const out: HarvestedField[] = []
  const seenRadioGroups = new Set<string>()
  const nextIndex = sectionIndexer()
  let n = 0

  for (const el of elements) {
    if (!isFillable(el, opts)) continue

    const input = el as HTMLInputElement
    const type = (input.type ?? '').toLowerCase()

    // One descriptor per radio group, carrying every option.
    if (type === 'radio') {
      const group = input.name || resolveLabel(el)
      if (seenRadioGroups.has(group)) continue
      seenRadioGroups.add(group)

      const peers = Array.from(root.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${escapeAttrValue(input.name)}"]`,
      ))
      const label = resolveLabel(el.closest('fieldset') ?? el)
      const descriptor = describeField(el, `r${n++}`, nextIndex(label))
      descriptor.label = label
      descriptor.options = peers.map(p => resolveLabel(p) || p.value).filter(Boolean)
      out.push({ el, descriptor })
      continue
    }

    const label = resolveLabel(el)
    out.push({ el, descriptor: describeField(el, `r${n++}`, nextIndex(label)) })
  }

  return out
}
