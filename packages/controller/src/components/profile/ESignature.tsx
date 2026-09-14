import type { Profile } from '@jaf/shared'
import { Section } from '../Section.js'
import { TextField, BoolField } from '../Field.js'

type ES = Profile['applicant_profile']['e_signature']

export function ESignature({ value, onChange }: { value: ES; onChange: (v: ES) => void }) {
  const set = <K extends keyof ES>(k: K, v: ES[K]) => onChange({ ...value, [k]: v })

  return (
    <Section title="E-Signature">
      <TextField label="Full name" value={value.full_name} onChange={v => set('full_name', v)} />
      <TextField label="Date" type="date" value={value.date} onChange={v => set('date', v)} />
      <BoolField label="Attestation agreed" value={value.attestation_agreed} onChange={v => set('attestation_agreed', v)} />
    </Section>
  )
}
