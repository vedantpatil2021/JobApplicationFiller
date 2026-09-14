import type { Profile } from '@jaf/shared'
import { Section } from '../Section.js'
import { TextField, BoolField } from '../Field.js'

type WA = Profile['applicant_profile']['work_authorization']

export function WorkAuthorization({ value, onChange }: { value: WA; onChange: (v: WA) => void }) {
  const set = <K extends keyof WA>(k: K, v: WA[K]) => onChange({ ...value, [k]: v })

  return (
    <Section title="Work Authorization">
      <BoolField label="Authorized to work in country" value={value.authorized_to_work_in_country} onChange={v => set('authorized_to_work_in_country', v)} />
      <BoolField label="Requires sponsorship now or in future" value={value.requires_sponsorship_now_or_future} onChange={v => set('requires_sponsorship_now_or_future', v)} />
      <TextField label="Visa status" value={value.visa_status} onChange={v => set('visa_status', v)} />
    </Section>
  )
}
