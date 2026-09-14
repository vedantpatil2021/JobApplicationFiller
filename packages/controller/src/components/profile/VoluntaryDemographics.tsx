import {
  DISABILITY_STATUS_PRESETS,
  GENDER_IDENTITY_PRESETS,
  RACE_ETHNICITY_PRESETS,
  SEXUAL_ORIENTATION_PRESETS,
  TRANSGENDER_STATUS_PRESETS,
  VETERAN_STATUS_PRESETS,
  VOLUNTARY_DEMOGRAPHICS_OTHER,
  type Profile,
} from '@jaf/shared'
import { Section } from '../Section.js'
import { SelectField, TextField, BoolField } from '../Field.js'

type VD = Profile['applicant_profile']['voluntary_demographics']
type DemographicKey = Exclude<keyof VD, 'opt_in'>

const OTHER = VOLUNTARY_DEMOGRAPHICS_OTHER

function isPreset(value: string, presets: readonly string[]): boolean {
  return (presets as readonly string[]).includes(value)
}

function DemographicSelect({
  label,
  field,
  presets,
  value,
  onChange,
  disabled,
}: {
  label: string
  field: DemographicKey
  presets: readonly string[]
  value: VD
  onChange: (v: VD) => void
  disabled?: boolean
}) {
  const stored = value[field]
  const selectValue = stored === '' ? '' : isPreset(stored, presets) ? stored : OTHER
  const showCustom = selectValue === OTHER

  const setStored = (next: string) => onChange({ ...value, [field]: next })

  return (
    <>
      <SelectField
        label={label}
        value={selectValue}
        placeholder="Select…"
        options={[...presets, OTHER]}
        disabled={disabled}
        onChange={v => {
          if (v === '') setStored('')
          else if (v === OTHER) setStored(isPreset(stored, presets) ? '' : stored)
          else setStored(v)
        }}
      />
      {showCustom && (
        <TextField
          label="Other (please specify)"
          value={isPreset(stored, presets) ? '' : stored}
          onChange={setStored}
          disabled={disabled}
        />
      )}
    </>
  )
}

export function VoluntaryDemographics({ value, onChange }: { value: VD; onChange: (v: VD) => void }) {
  const set = <K extends keyof VD>(k: K, v: VD[K]) => onChange({ ...value, [k]: v })
  const disabled = !value.opt_in

  return (
    <Section title="Voluntary Demographics">
      <BoolField label="Opt in to sharing demographics" value={value.opt_in} onChange={v => set('opt_in', v)} />
      <DemographicSelect label="Gender identity" field="gender_identity" presets={GENDER_IDENTITY_PRESETS} value={value} onChange={onChange} disabled={disabled} />
      <DemographicSelect label="Transgender status" field="transgender_status" presets={TRANSGENDER_STATUS_PRESETS} value={value} onChange={onChange} disabled={disabled} />
      <DemographicSelect label="Race / ethnicity" field="race_ethnicity" presets={RACE_ETHNICITY_PRESETS} value={value} onChange={onChange} disabled={disabled} />
      <DemographicSelect label="Sexual orientation" field="sexual_orientation" presets={SEXUAL_ORIENTATION_PRESETS} value={value} onChange={onChange} disabled={disabled} />
      <DemographicSelect label="Veteran status" field="veteran_status" presets={VETERAN_STATUS_PRESETS} value={value} onChange={onChange} disabled={disabled} />
      <DemographicSelect label="Disability status" field="disability_status" presets={DISABILITY_STATUS_PRESETS} value={value} onChange={onChange} disabled={disabled} />
    </Section>
  )
}
