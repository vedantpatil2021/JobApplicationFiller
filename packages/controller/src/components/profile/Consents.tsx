import type { Profile } from '@jaf/shared'
import { Section } from '../Section.js'
import { BoolField } from '../Field.js'

type C = Profile['applicant_profile']['consents']

export function Consents({ value, onChange }: { value: C; onChange: (v: C) => void }) {
  const set = <K extends keyof C>(k: K, v: C[K]) => onChange({ ...value, [k]: v })

  return (
    <Section title="Consents">
      <BoolField label="Agree to privacy policy" value={value.agree_to_privacy_policy} onChange={v => set('agree_to_privacy_policy', v)} />
      <BoolField label="Agree to terms and conditions" value={value.agree_to_terms_and_conditions} onChange={v => set('agree_to_terms_and_conditions', v)} />
      <BoolField label="Opt in to talent community" value={value.opt_in_talent_community} onChange={v => set('opt_in_talent_community', v)} />
      <BoolField label="Opt in to SMS notifications" value={value.opt_in_sms_notifications} onChange={v => set('opt_in_sms_notifications', v)} />
    </Section>
  )
}
