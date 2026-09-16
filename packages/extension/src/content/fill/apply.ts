import type { FieldDescriptor, FillDecision, FillResult } from '@jaf/shared'
import type { HarvestedField } from '../harvest/collect.js'
import { escapeAttrValue } from '../../lib/selector.js'
import { isFillable } from '../harvest/visibility.js'
import { isSubmitControl } from './guard.js'
import { fillText, fillSelect, fillRadio, fillCheckbox, fillCombobox } from './setters.js'
import { isImplausibleYesNoAnswer, isImplausibleDateAnswer } from './plausibility.js'

/** What we wrote, so a re-fill can tell our value from the user's edit. */
const written = new WeakMap<HTMLElement, string>()

function readValue(el: HTMLElement, kind: FieldDescriptor['kind']): string {
  const input = el as HTMLInputElement
  if (kind === 'radio') {
    const root = el.getRootNode() as Document | ShadowRoot
    const checked = root.querySelector<HTMLInputElement>(
      `input[type="radio"][name="${escapeAttrValue(input.name)}"]:checked`,
    )
    return checked?.value ?? ''
  }
  if (kind === 'checkbox') return input.checked ? 'checked' : ''
  return input.value ?? ''
}

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

    if (!isFillable(el, { checkLayout: false })) {
      return { ...base, outcome: 'skipped', note: 'hidden or disabled' }
    }

    if (isSubmitControl(el)) {
      return { ...base, outcome: 'skipped', note: 'refused: submit control' }
    }

    const current = readValue(el, descriptor.kind)
    const prior = written.get(el)

    // The user edited this since we wrote it — leave their value alone.
    if (prior !== undefined && current !== prior) {
      return { ...base, outcome: 'skipped', note: 'you edited this' }
    }

    // Respect a value the user already entered before our first fill.
    if (prior === undefined && current.trim() !== '') {
      return { ...base, outcome: 'skipped', note: 'already has a value' }
    }

    // A yes/no-phrased label about to get a non-yes/no value, or a date value
    // about to land in a label that isn't about dates, is very likely a
    // mismatch, wherever it came from — defer to the user rather than write
    // something that reads as nonsense on the real page (M4.7/M4.8 findings).
    if (descriptor.kind === 'text' || descriptor.kind === 'textarea' || descriptor.kind === 'combobox') {
      if (isImplausibleYesNoAnswer(descriptor.label, d.value)) {
        return { ...base, outcome: 'needs-user', note: 'this looks like a yes/no question — please answer it yourself' }
      }
      if (isImplausibleDateAnswer(descriptor.label, d.value)) {
        return { ...base, outcome: 'needs-user', note: 'this does not look like a date question — please check and answer it yourself' }
      }
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
        if (!d.value.trim()) {
          return { ...base, outcome: 'needs-user', note: 'no value in profile' }
        }
        ok = fillCombobox(el as HTMLInputElement, d.value, descriptor.options)
        break
      case 'file':
        return { ...base, outcome: 'needs-user', note: 'File upload — attach manually or re-run Fill' }
    }

    if (!ok) return { ...base, outcome: 'failed', note: 'no matching option' }

    const finalValue = readValue(el, descriptor.kind) || (el as HTMLInputElement).value
    written.set(el, finalValue)

    // Spec §4.6: a value we had to cut short must be reviewed, never filled silently.
    const truncated = finalValue.length < d.value.length
    const note = truncated ? 'shortened to fit — please check'
               : d.confidence >= 0.85 ? ''
               : 'please verify'

    return { ...base, value: finalValue, outcome: 'filled', note }
  })
}
