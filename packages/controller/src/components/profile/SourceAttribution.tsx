import type { Profile } from '@jaf/shared'
import { Section } from '../Section.js'
import { TextField } from '../Field.js'

type SA = Profile['applicant_profile']['source_attribution']

export function SourceAttribution({ value, onChange }: { value: SA; onChange: (v: SA) => void }) {
  return (
    <Section title="Source Attribution">
      <TextField label="How did you hear about us" value={value.how_did_you_hear_about_us} onChange={v => onChange({ ...value, how_did_you_hear_about_us: v })} />
    </Section>
  )
}
