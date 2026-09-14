import { useEffect, useState } from 'react'
import { listResumes, uploadResume, deleteResume, type Resume } from '../lib/api.js'

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ResumesPage({ onChange }: { onChange: () => void }) {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  const refresh = () => { listResumes().then(setResumes).catch(e => setError(e.message)) }
  useEffect(refresh, [])

  const onPick = async (file: File | undefined) => {
    if (!file) return
    setError(''); setBusy(true)
    try { await uploadResume(file); refresh(); onChange() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const remove = async (name: string) => {
    setConfirming(null); setError('')
    try { await deleteResume(name); refresh(); onChange() }
    catch (e) { setError((e as Error).message) }
  }

  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold">Resumes</h2>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">Add a resume</span>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md"
          disabled={busy}
          onChange={e => void onPick(e.target.files?.[0])}
          className="block w-full text-sm"
        />
        <span className="mt-1 block text-xs text-neutral-500">
          PDF, DOC, DOCX, TXT or MD. Up to 10 MB.
        </span>
      </label>

      {error && <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {resumes.length === 0 ? (
        <p className="text-sm text-neutral-500">No resumes yet — add one above.</p>
      ) : (
        <ul className="divide-y rounded-lg border border-neutral-200">
          {resumes.map(r => (
            <li key={r.name} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-neutral-500">{humanSize(r.size)}</div>
              </div>

              {confirming === r.name ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-neutral-700">Delete {r.name}?</span>
                  <button onClick={() => void remove(r.name)}
                          className="rounded bg-red-600 px-2 py-1 text-white">Yes, delete</button>
                  <button onClick={() => setConfirming(null)}
                          className="rounded border px-2 py-1">Keep it</button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-3">
                  <a href={`/api/resumes/${encodeURIComponent(r.name)}`}
                     download={r.name}
                     aria-label={`Download ${r.name}`} className="text-neutral-700 underline">Download</a>
                  <button onClick={() => setConfirming(r.name)}
                          aria-label={`Delete ${r.name}`} className="text-red-700">Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
