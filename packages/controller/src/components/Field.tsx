import { useId } from 'react'

interface TextFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  disabled?: boolean
  placeholder?: string
}

export function TextField({ label, value, onChange, type = 'text', disabled, placeholder }: TextFieldProps) {
  // Label-derived ids collide once there are two work-experience rows.
  const id = useId()
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <input
        id={id} type={type} value={value} disabled={disabled} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
      />
    </label>
  )
}

export function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
      <span className="font-medium text-neutral-700">{label}</span>
    </label>
  )
}
