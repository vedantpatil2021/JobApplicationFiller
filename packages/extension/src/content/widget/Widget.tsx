import { useState } from 'react'
import type { FillResult } from '@jaf/shared'

const BADGE: Record<FillResult['outcome'], string> = {
  filled: 'bg-green-100 text-green-800',
  skipped: 'bg-neutral-100 text-neutral-700',
  failed: 'bg-red-100 text-red-800',
  'needs-user': 'bg-amber-100 text-amber-900',
}

// Content scripts run on the page's own origin, so a plain path resolves
// against that page, not the extension — chrome.runtime.getURL is required.
const logoUrl = chrome.runtime.getURL('icons/icon-48.png')

export function Widget() {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<FillResult[]>([])
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    const r = await window.__jafFill()      // installed by content/index.ts
    setResults(r)
    setBusy(false)
    setOpen(true)
  }

  const counts = {
    filled: results.filter(r => r.outcome === 'filled').length,
    attention: results.filter(r => r.outcome !== 'filled').length,
  }

  return (
    <div className="fixed bottom-4 right-4 font-sans text-sm">
      {open && (
        <div className="mb-3 max-h-[60vh] w-96 overflow-auto rounded-xl border border-neutral-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b p-3">
            <strong>{counts.filled} filled · {counts.attention} to check</strong>
            <button onClick={() => setOpen(false)} className="text-neutral-500">Close</button>
          </div>
          <ul className="divide-y">
            {results.map(r => (
              <li key={r.ref} className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.label || r.ref}</div>
                  <div className="truncate text-neutral-500">
                    {r.outcome === 'filled'
                      ? (r.note ? `${r.value || '—'} · ${r.note}` : (r.value || '—'))
                      : (r.note || r.value || '—')}
                  </div>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${BADGE[r.outcome]}`}>{r.outcome}</span>
              </li>
            ))}
          </ul>
          <p className="border-t p-3 text-xs text-neutral-500">
            Nothing is ever submitted for you. Review, then click Submit yourself.
          </p>
        </div>
      )}

      <button onClick={run} disabled={busy}
              aria-label={busy ? 'Filling application…' : 'Fill application'}
              title={busy ? 'Filling…' : 'Fill application'}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 shadow-xl disabled:opacity-60">
        <img src={logoUrl} alt="" className={`h-8 w-8 rounded ${busy ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}
