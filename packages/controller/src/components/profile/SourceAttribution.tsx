import {
  SOURCE_ATTRIBUTION_DEFAULT,
  SOURCE_ATTRIBUTION_PRESETS,
  type Profile,
} from '@jaf/shared'
import { Section } from '../Section.js'
import { SelectField, TextField } from '../Field.js'

type SA = Profile['applicant_profile']['source_attribution']

const OTHER = 'Other'
const SELECT_OPTIONS = [...SOURCE_ATTRIBUTION_PRESETS, OTHER] as const

function isPreset(value: string): value is (typeof SOURCE_ATTRIBUTION_PRESETS)[number] {
  return (SOURCE_ATTRIBUTION_PRESETS as readonly string[]).includes(value)
}

export function SourceAttribution({ value, onChange }: { value: SA; onChange: (v: SA) => void }) {
  const stored = value.how_did_you_hear_about_us
  const selectValue = isPreset(stored) ? stored : OTHER
  const showCustom = selectValue === OTHER

  const setStored = (next: string) => onChange({ ...value, how_did_you_hear_about_us: next })

  return (
    <Section title="Source Attribution">
      <SelectField
        label="How did you hear about us"
        value={selectValue}
        options={SELECT_OPTIONS}
        onChange={v => {
          if (v === OTHER) {
            setStored(isPreset(stored) ? '' : stored)
          } else {
            setStored(v)
          }
        }}
      />
      {showCustom && (
        <TextField
          label="Other (please specify)"
          value={isPreset(stored) ? '' : stored}
          placeholder={SOURCE_ATTRIBUTION_DEFAULT}
          onChange={setStored}
        />
      )}
    </Section>
  )
}
