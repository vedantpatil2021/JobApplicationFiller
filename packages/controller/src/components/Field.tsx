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

interface TextAreaProps {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  rows?: number
}

export function TextArea({ label, value, onChange, disabled, placeholder, rows = 4 }: TextAreaProps) {
  const id = useId()
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <textarea
        id={id} value={value} disabled={disabled} placeholder={placeholder} rows={rows}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
      />
    </label>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  disabled?: boolean
  /** When set, renders a first option with `value=""` for unset fields. */
  placeholder?: string
}

export function SelectField({ label, value, onChange, options, disabled, placeholder }: SelectFieldProps) {
  const id = useId()
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <select
        id={id} value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
      >
        {placeholder !== undefined && (
          <option value="">{placeholder}</option>
        )}
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}

export function BoolField({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={value} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="font-medium text-neutral-700">{label}</span>
    </label>
  )
}
