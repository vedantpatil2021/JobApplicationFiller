export type FieldKind =
  | 'text' | 'textarea' | 'select' | 'radio' | 'checkbox'
  | 'file' | 'date' | 'combobox'

/** Everything the resolver needs about one form control, with no DOM reference. */
export interface FieldDescriptor {
  ref: string                 // opaque handle back to the element
  kind: FieldKind
  label: string
  name: string | null
  id: string | null
  placeholder: string | null
  ariaLabel: string | null
  autocomplete: string | null
  options: string[]           // select / radio / combobox choices
  required: boolean
  maxLength: number | null
  sectionIndex: number        // for repeated blocks, e.g. work_experience[2]
  nearbyText: string
}

export type FillSource = 'profile' | 'heuristic' | 'ai' | 'cache'

export interface FillDecision {
  ref: string
  value: string
  confidence: number          // 0..1
  source: FillSource
  canonicalKey: string | null
  reason: string              // shown in the review panel
}

export type FillOutcome = 'filled' | 'skipped' | 'failed' | 'needs-user'

export interface FillResult {
  ref: string
  label: string
  outcome: FillOutcome
  value: string
  confidence: number
  source: FillSource
  note: string
}
