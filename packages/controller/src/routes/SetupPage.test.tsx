import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetupPage } from './SetupPage.js'
import * as api from '../lib/api.js'
import type { Status } from '../lib/api.js'

const status = (over: Partial<Status> = {}): Status => ({
  ok: true,
  dataDir: '/Users/x/project/profile',
  profileExists: true,
  resumeCount: 1,
  tools: { claude: { installed: true, version: '2.1.270' }, codex: { installed: false, version: '' } },
  ...over,
})

vi.mock('../lib/api.js', async importOriginal => {
  const mod = await importOriginal<typeof import('../lib/api.js')>()
  return {
    ...mod,
    getPairing: vi.fn(mod.getPairing),
  }
})

afterEach(() => cleanup())

beforeEach(() => {
  vi.mocked(api.getPairing).mockResolvedValue({ token: 'abc123', serverUrl: 'http://127.0.0.1:4321' })
})

describe('SetupPage', () => {
  it('shows the pairing token so the user never opens the token file', async () => {
    render(<SetupPage status={status()} onRetry={() => {}} />)
    expect(await screen.findByText('abc123')).toBeInTheDocument()
  })

  it('copies the token to the clipboard and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

    render(<SetupPage status={status()} onRetry={() => {}} />)
    await screen.findByText('abc123')
    await userEvent.click(screen.getByRole('button', { name: /copy token/i }))

    expect(writeText).toHaveBeenCalledWith('abc123')
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })

  it('lists the extension install steps in the page itself', async () => {
    render(<SetupPage status={status()} onRetry={() => {}} />)
    expect(screen.getByText(/chrome:\/\/extensions/i)).toBeInTheDocument()
    expect(screen.getByText(/load unpacked/i)).toBeInTheDocument()
    expect(screen.getByText(/packages\/extension\/dist/i)).toBeInTheDocument()
  })

  it('reports a working Claude CLI with its version', async () => {
    render(<SetupPage status={status()} onRetry={() => {}} />)
    expect(screen.getByText(/claude cli/i)).toBeInTheDocument()
    expect(screen.getByText(/2\.1\.270/)).toBeInTheDocument()
  })

  it('tells the user exactly how to fix a missing Claude CLI', async () => {
    render(<SetupPage status={status({
      tools: { claude: { installed: false, version: '' }, codex: { installed: false, version: '' } },
    })} onRetry={() => {}} />)
    expect(screen.getByText(/claude login/i)).toBeInTheDocument()
  })

  it('does not claim anything is wrong while the status is still loading', () => {
    render(<SetupPage status={null} onRetry={() => {}} />)
    expect(screen.getByText(/checking/i)).toBeInTheDocument()
  })

  it('re-checks on demand', async () => {
    const onRetry = vi.fn()
    render(<SetupPage status={status()} onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: /re-check/i }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows a checking state and disables the button while a re-check runs', async () => {
    render(<SetupPage status={status()} checking onRetry={() => {}} />)
    const button = screen.getByRole('button', { name: /checking/i })
    expect(button).toBeDisabled()
    expect(screen.getAllByText(/checking/i).length).toBeGreaterThan(0)
  })

  it('surfaces a pairing fetch failure instead of showing a blank box', async () => {
    vi.mocked(api.getPairing).mockRejectedValue(new Error('401'))
    render(<SetupPage status={status()} onRetry={() => {}} />)
    await waitFor(() => expect(screen.getByText(/couldn.t read the token/i)).toBeInTheDocument())
  })
})
