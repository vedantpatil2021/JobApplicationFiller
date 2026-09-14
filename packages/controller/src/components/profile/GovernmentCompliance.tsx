import type { Profile } from '@jaf/shared'
import { Section } from '../Section.js'
import { TextField, BoolField } from '../Field.js'

type GC = Profile['applicant_profile']['government_compliance']

export function GovernmentCompliance({ value, onChange }: { value: GC; onChange: (v: GC) => void }) {
  const set = <K extends keyof GC>(k: K, v: GC[K]) => onChange({ ...value, [k]: v })

  return (
    <Section title="Government & Compliance">
      <BoolField label="Former government employee" value={value.is_former_government_employee} onChange={v => set('is_former_government_employee', v)} />
      <TextField label="Clearance level" value={value.clearance_level} onChange={v => set('clearance_level', v)} />
      <TextField label="Export control status" value={value.export_control_status} onChange={v => set('export_control_status', v)} />
    </Section>
  )
}
