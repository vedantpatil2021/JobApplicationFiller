import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyProfile } from '@jaf/shared'
import App from './App.js'

afterEach(() => cleanup())

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body =
      url.includes('/api/profile') ? emptyProfile() :
      url.includes('/api/resumes') ? { resumes: [] } :
      url.includes('/api/pairing') ? { token: 'tok', serverUrl: 'http://127.0.0.1:4321' } :
      { ok: true, dataDir: '/tmp/profile', profileExists: true, resumeCount: 0,
        tools: { claude: { installed: true, version: '2.1' }, codex: { installed: false, version: '' } } }
    return new Response(JSON.stringify(body), { status: 200 })
  }))
})

describe('App shell', () => {
  it('opens on the profile tab', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: /personal information/i })).toBeInTheDocument()
  })

  it('switches to resumes and back', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /personal information/i })

    await userEvent.click(screen.getByRole('tab', { name: /resumes/i }))
    expect(await screen.findByRole('heading', { name: /resumes/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /profile/i }))
    expect(await screen.findByRole('heading', { name: /personal information/i })).toBeInTheDocument()
  })

  it('marks the current tab selected for screen readers', async () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: /profile/i })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: /setup/i }))
    expect(screen.getByRole('tab', { name: /setup/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows a plain-language banner when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/npm run dev/i)).toBeInTheDocument()
  })

  it('shows a checking state on the setup tab while a re-check is in flight', async () => {
    let resolveStatus: (r: Response) => void = () => {}
    const statusBody = {
      ok: true, dataDir: '/tmp/profile', profileExists: true, resumeCount: 0,
      tools: { claude: { installed: true, version: '2.1' }, codex: { installed: false, version: '' } },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/status')) {
        return new Promise<Response>(resolve => { resolveStatus = resolve })
      }
      const body =
        url.includes('/api/profile') ? emptyProfile() :
        url.includes('/api/resumes') ? { resumes: [] } :
        { token: 'tok', serverUrl: 'http://127.0.0.1:4321' }
      return new Response(JSON.stringify(body), { status: 200 })
    }))

    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: /setup/i }))
    await screen.findAllByText(/checking/i)       // first load, status still null

    resolveStatus(new Response(JSON.stringify(statusBody), { status: 200 }))
    await screen.findByText(/claude cli/i)

    await userEvent.click(screen.getByRole('button', { name: /re-check/i }))
    expect(screen.getByRole('button', { name: /checking/i })).toBeInTheDocument()
  })
})
