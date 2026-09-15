import type { HarvestedField } from './collect.js'

const DEFAULT_TIMEOUT_MS = 800

function optionTexts(nodes: Element[]): string[] {
  const out: string[] = []
  for (const n of nodes) {
    const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (t) out.push(t)
  }
  return out
}

/** Resolve with any `[role="option"]` node not already in `before`, or [] after the timeout. */
function waitForNewOptions(doc: Document, before: Set<Element>, timeoutMs: number): Promise<Element[]> {
  return new Promise(resolve => {
    const fresh = () => Array.from(doc.querySelectorAll('[role="option"]')).filter(n => !before.has(n))

    const immediate = fresh()
    if (immediate.length > 0) { resolve(immediate); return }

    const timer = setTimeout(() => { observer.disconnect(); resolve([]) }, timeoutMs)
    const observer = new MutationObserver(() => {
      const found = fresh()
      if (found.length > 0) {
        clearTimeout(timer)
        observer.disconnect()
        resolve(found)
      }
    })
    observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true })
  })
}

/**
 * Greenhouse/Lever/Ashby often render a combobox's option list only once the
 * control is focused, so harvestOptions() sees an empty list at page-load
 * time. Filling that blind means typing free text into a control that only
 * accepts a fixed set of choices (M4.6 finding — docs/ats/findings.md).
 *
 * For each such field, focus and click it (never type — this is a read-only
 * probe, not the real fill) and wait briefly for real `[role="option"]`
 * nodes to appear anywhere in the document. A field that reveals options
 * gets them recorded on its descriptor, in place, before resolve/AI ever
 * see it. A field that reveals nothing keeps its empty option list and
 * falls back to the pre-M4.6 text-fill behaviour — never worse than before.
 *
 * Runs one field at a time (not in parallel) so at most one listbox is open
 * at once; on a form with several such fields this adds up to `timeoutMs`
 * per field in the worst case, which is an accepted trade-off for
 * correctness over speed on what is normally 0-2 fields per form.
 */
export async function expandComboboxes(
  fields: HarvestedField[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  for (const field of fields) {
    if (field.descriptor.kind !== 'combobox' || field.descriptor.options.length > 0) continue

    const el = field.el
    const doc = el.ownerDocument
    const before = new Set(doc.querySelectorAll('[role="option"]'))

    el.dispatchEvent(new Event('focus', { bubbles: true }))
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const fresh = await waitForNewOptions(doc, before, timeoutMs)
    if (fresh.length > 0) field.descriptor.options = optionTexts(fresh)

    el.dispatchEvent(new Event('blur', { bubbles: true }))
  }
}
