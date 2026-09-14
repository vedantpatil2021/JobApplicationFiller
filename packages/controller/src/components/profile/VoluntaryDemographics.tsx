import type { Profile } from '@jaf/shared'
import { Section } from '../Section.js'
import { TextField, BoolField } from '../Field.js'

type VD = Profile['applicant_profile']['voluntary_demographics']

export function VoluntaryDemographics({ value, onChange }: { value: VD; onChange: (v: VD) => void }) {
  const set = <K extends keyof VD>(k: K, v: VD[K]) => onChange({ ...value, [k]: v })

  return (
    <Section title="Voluntary Demographics">
      <BoolField label="Opt in to sharing demographics" value={value.opt_in} onChange={v => set('opt_in', v)} />
      <TextField label="Gender identity" value={value.gender_identity} onChange={v => set('gender_identity', v)} disabled={!value.opt_in} />
      <TextField label="Transgender status" value={value.transgender_status} onChange={v => set('transgender_status', v)} disabled={!value.opt_in} />
      <TextField label="Race / ethnicity" value={value.race_ethnicity} onChange={v => set('race_ethnicity', v)} disabled={!value.opt_in} />
      <TextField label="Sexual orientation" value={value.sexual_orientation} onChange={v => set('sexual_orientation', v)} disabled={!value.opt_in} />
      <TextField label="Veteran status" value={value.veteran_status} onChange={v => set('veteran_status', v)} disabled={!value.opt_in} />
      <TextField label="Disability status" value={value.disability_status} onChange={v => set('disability_status', v)} disabled={!value.opt_in} />
    </Section>
  )
}
