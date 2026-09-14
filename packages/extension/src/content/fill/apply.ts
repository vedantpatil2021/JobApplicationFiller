import type { FillDecision, FillResult } from '@jaf/shared'
import type { HarvestedField } from '../harvest/collect.js'
import { isSubmitControl } from './guard.js'
import { fillText, fillSelect, fillRadio, fillCheckbox } from './setters.js'

/** What we wrote, so a re-fill can tell our value from the user's edit. */
const written = new WeakMap<HTMLElement, string>()

export function applyDecisions(fields: HarvestedField[], decisions: FillDecision[]): FillResult[] {
  const byRef = new Map(fields.map(f => [f.descriptor.ref, f]))

  return decisions.map<FillResult>(d => {
    const field = byRef.get(d.ref)
    if (!field) {
      return { ref: d.ref, label: '', outcome: 'failed', value: d.value,
               confidence: d.confidence, source: d.source, note: 'element went away' }
    }

    const { el, descriptor } = field
    const base = { ref: d.ref, label: descriptor.label, value: d.value,
                   confidence: d.confidence, source: d.source }

    if (isSubmitControl(el)) {
      return { ...base, outcome: 'skipped', note: 'refused: submit control' }
    }

    // The user edited this since we wrote it — leave their value alone.
    const prior = written.get(el)
    const current = (el as HTMLInputElement).value
    if (prior !== undefined && current !== prior) {
      return { ...base, outcome: 'skipped', note: 'you edited this' }
    }

    let ok = false
    switch (descriptor.kind) {
      case 'text': case 'textarea': case 'date':
        ok = fillText(el as HTMLInputElement, d.value); break
      case 'select':
        ok = fillSelect(el as HTMLSelectElement, d.value); break
      case 'radio':
        ok = fillRadio(el as HTMLInputElement, d.value); break
      case 'checkbox':
        ok = fillCheckbox(el as HTMLInputElement, d.value); break
      case 'combobox':
        // Many ATS widgets mark plain text inputs as comboboxes via ARIA. Try a
        // normal text write first; only fall back when there is nothing to write.
        if (!d.value.trim()) {
          return { ...base, outcome: 'needs-user', note: 'no value in profile' }
        }
        ok = fillText(el as HTMLInputElement, d.value)
        break
      case 'file':
        // Virtual resume/cover-letter fields have no string to attach.
        return { ...base, outcome: 'needs-user', note: 'upload your file manually' }
    }

    if (!ok) return { ...base, outcome: 'failed', note: 'no matching option' }

    const finalValue = (el as HTMLInputElement).value
    written.set(el, finalValue)

    // Spec §4.6: a value we had to cut short must be reviewed, never filled silently.
    const truncated = finalValue.length < d.value.length
    const note = truncated ? 'shortened to fit — please check'
               : d.confidence >= 0.85 ? ''
               : 'please verify'

    return { ...base, value: finalValue, outcome: 'filled', note }
  })
}
