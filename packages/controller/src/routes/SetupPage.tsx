import { useEffect, useState } from 'react'
import { getPairing, type Status, type ToolInfo } from '../lib/api.js'

function ToolRow({ name, info, fix }: { name: string; info: ToolInfo; fix: string }) {
  return (
    <li className="flex items-start justify-between gap-4 p-3 text-sm">
      <div>
        <div className="font-medium">{name}</div>
        {info.installed
          ? <div className="text-neutral-500">{info.version}</div>
          : <div className="text-neutral-700">Not found. {fix}</div>}
      </div>
      <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${
        info.installed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
      }`}>
        {info.installed ? 'ready' : 'missing'}
      </span>
    </li>
  )
}

export function SetupPage({
  status, checking = false, onRetry,
}: { status: Status | null; checking?: boolean; onRetry: () => void }) {
  const [token, setToken] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getPairing()
      .then(p => setToken(p.token))
      .catch(() => setTokenError("Couldn't read the token. Restart the server and reload this page."))
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setTokenError('Copying failed — select the token above and copy it by hand.')
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-neutral-200 p-5">
        <h2 className="mb-3 text-lg font-semibold">Connect the extension</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-700">
          <li>Run <code>npm run build -w @jaf/extension</code> once.</li>
          <li>Open <code>chrome://extensions</code> and turn on Developer mode.</li>
          <li>Click <strong>Load unpacked</strong> and choose <code>packages/extension/dist</code>.</li>
          <li>Open the extension&apos;s Options page.</li>
          <li>Paste the token below, then click <strong>Save and test</strong>.</li>
        </ol>

        <div className="mt-4 flex items-center gap-3">
          <code className="flex-1 truncate rounded bg-neutral-100 px-3 py-2 text-sm">{token || '…'}</code>
          <button onClick={() => void copy()} disabled={!token}
                  className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50">
            Copy token
          </button>
        </div>
        {copied && <p className="mt-2 text-sm text-green-700">Copied.</p>}
        {tokenError && <p className="mt-2 text-sm text-red-700">{tokenError}</p>}
      </section>

      <section className="rounded-lg border border-neutral-200 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Local AI</h2>
          <button onClick={onRetry} disabled={checking}
                  className="rounded-md border px-3 py-1 text-sm disabled:opacity-50">
            {checking ? 'Checking…' : 'Re-check'}
          </button>
        </div>

        {(!status || checking) ? (
          <p className="text-sm text-neutral-500">Checking…</p>
        ) : (
          <>
            <ul className="divide-y rounded-md border border-neutral-200">
              <ToolRow name="Claude CLI" info={status.tools.claude}
                       fix="Install it, then run `claude login` in a terminal." />
              <ToolRow name="Codex CLI" info={status.tools.codex}
                       fix="Optional — Claude alone is enough." />
            </ul>
            <p className="mt-3 text-xs text-neutral-500">
              AI runs on your existing subscription through these CLIs. No API key, no charges.
            </p>
          </>
        )}
      </section>

      {status && (
        <section className="rounded-lg border border-neutral-200 p-5 text-sm">
          <h2 className="mb-3 text-lg font-semibold">Your data</h2>
          <p>Folder: <code>{status.dataDir}</code></p>
          <p>Profile saved: {status.profileExists ? 'yes' : 'not yet'}</p>
          <p>Resumes: {status.resumeCount}</p>
          <p className="mt-2 text-neutral-500">
            Nothing leaves this machine, and this folder is never committed to git.
          </p>
        </section>
      )}
    </div>
  )
}
