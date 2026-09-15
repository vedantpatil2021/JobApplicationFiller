import { useEffect, useState } from 'react'
import { Nav, type Tab } from './components/Nav.js'
import { ProfilePage } from './routes/ProfilePage.js'
import { ResumesPage } from './routes/ResumesPage.js'
import { SetupPage } from './routes/SetupPage.js'
import { getStatus, type Status } from './lib/api.js'

export default function App() {
  const [tab, setTab] = useState<Tab>('profile')
  const [status, setStatus] = useState<Status | null>(null)
  const [offline, setOffline] = useState(false)
  const [checking, setChecking] = useState(false)

  const refresh = () => {
    setChecking(true)
    getStatus()
      .then(s => { setStatus(s); setOffline(false) })
      .catch(() => setOffline(true))
      .finally(() => setChecking(false))
  }
  useEffect(refresh, [])

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Job Application Filler</h1>
        {status && (
          <p className="mt-1 text-sm text-neutral-500">
            Your data is in <code>{status.dataDir}</code>
          </p>
        )}
      </header>

      {offline && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <strong className="block">Can&apos;t reach the server.</strong>
          Start it with <code>npm run dev</code> in the project folder, then reload this page.
        </div>
      )}

      <Nav tab={tab} onChange={setTab} />

      <div className="mt-6">
        {tab === 'profile' && <ProfilePage onChange={refresh} />}
        {tab === 'resumes' && <ResumesPage onChange={refresh} />}
        {tab === 'setup' && <SetupPage status={status} checking={checking} onRetry={refresh} />}
      </div>
    </main>
  )
}
