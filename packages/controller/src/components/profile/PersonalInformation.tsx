import type { Profile } from '@jaf/shared'
import { Section } from '../Section.js'
import { TextField } from '../Field.js'

type PI = Profile['applicant_profile']['personal_information']

export function PersonalInformation({ value, onChange }: { value: PI; onChange: (v: PI) => void }) {
  const set = <K extends keyof PI>(k: K, v: PI[K]) => onChange({ ...value, [k]: v })
  const setAddr = (k: keyof PI['address'], v: string) =>
    onChange({ ...value, address: { ...value.address, [k]: v } })

  return (
    <Section title="Personal Information">
      <TextField label="First name" value={value.first_name} onChange={v => set('first_name', v)} />
      <TextField label="Last name"  value={value.last_name}  onChange={v => set('last_name', v)} />
      <TextField label="Email" type="email" value={value.email} onChange={v => set('email', v)} />
      <TextField label="Phone number" value={value.phone_number} onChange={v => set('phone_number', v)} />
      <TextField label="Street" value={value.address.street} onChange={v => setAddr('street', v)} />
      <TextField label="City"   value={value.address.city}   onChange={v => setAddr('city', v)} />
      <TextField label="State"  value={value.address.state}  onChange={v => setAddr('state', v)} />
      <TextField label="Postal code" value={value.address.postal_code} onChange={v => setAddr('postal_code', v)} />
      <TextField label="Country" value={value.address.country} onChange={v => setAddr('country', v)} />
      <TextField label="LinkedIn URL"  value={value.linkedin_url}  onChange={v => set('linkedin_url', v)} />
      <TextField label="Portfolio URL" value={value.portfolio_url} onChange={v => set('portfolio_url', v)} />
    </Section>
  )
}
