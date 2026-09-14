export type Tab = 'profile' | 'resumes' | 'setup'

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'resumes', label: 'Resumes' },
  { id: 'setup', label: 'Setup' },
]

export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Sections" className="flex gap-1 border-b border-neutral-200">
      {TABS.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            tab === t.id
              ? 'border-neutral-900 text-neutral-900'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
