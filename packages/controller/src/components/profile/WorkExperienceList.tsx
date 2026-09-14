import type { Profile, WorkExperience } from '@jaf/shared'
import { Section } from '../Section.js'
import { TextField, TextArea, BoolField } from '../Field.js'

type WE = Profile['applicant_profile']['work_experience']

const blank: WorkExperience = {
  job_title: '', company_name: '', location: '',
  start_date: '', end_date: '', is_current_role: false, description: '',
}

export function WorkExperienceList({ value, onChange }: { value: WE; onChange: (v: WE) => void }) {
  const patch = (i: number, p: Partial<WorkExperience>) =>
    onChange(value.map((row, j) => (j === i ? { ...row, ...p } : row)))

  return (
    <Section title="Work Experience">
      <div className="sm:col-span-2 grid gap-6">
        {value.map((row, i) => (
          <div key={i} className="grid gap-4 rounded-md bg-neutral-50 p-4 sm:grid-cols-2">
            <TextField label="Job title"    value={row.job_title}    onChange={v => patch(i, { job_title: v })} />
            <TextField label="Company name" value={row.company_name} onChange={v => patch(i, { company_name: v })} />
            <TextField label="Location"     value={row.location}     onChange={v => patch(i, { location: v })} />
            <TextField label="Start date"   value={row.start_date}   onChange={v => patch(i, { start_date: v })} placeholder="YYYY-MM" />
            <TextField label="End date"     value={row.end_date}     onChange={v => patch(i, { end_date: v })} placeholder="YYYY-MM or Present" />
            <BoolField  label="Current role" value={row.is_current_role} onChange={v => patch(i, { is_current_role: v })} />
            <TextArea label="Description" value={row.description} onChange={v => patch(i, { description: v })} />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}
                    className="justify-self-start text-sm text-red-600">Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...value, { ...blank }])}
                className="justify-self-start rounded-md border px-3 py-2 text-sm">Add role</button>
      </div>
    </Section>
  )
}
