import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getSettings, setSettings } from '../lib/storage.js'

function Options() {
  const [token, setToken] = useState('')
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:4321')
  const [status, setStatus] = useState('')

  useEffect(() => { getSettings().then(s => { setToken(s.token); setServerUrl(s.serverUrl) }) }, [])

  const save = async () => {
    await setSettings({ token: token.trim(), serverUrl: serverUrl.trim() })
    try {
      const res = await fetch(`${serverUrl.trim()}/api/health`, { headers: { 'X-JAF-Token': token.trim() } })
      setStatus(res.ok ? 'Paired.' : `Server said ${res.status}. Check the token.`)
    } catch {
      setStatus('Cannot reach the server. Is it running?')
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 560 }}>
      <h1>Job Application Filler</h1>
      <p>Paste the token printed by <code>npm run start -w @jaf/server</code>.</p>
      <label>Server URL<br /><input value={serverUrl} onChange={e => setServerUrl(e.target.value)} style={{ width: '100%' }} /></label>
      <label>Token<br /><input value={token} onChange={e => setToken(e.target.value)} style={{ width: '100%' }} /></label>
      <button onClick={save} style={{ marginTop: 12 }}>Save and test</button>
      <p>{status}</p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Options />)
