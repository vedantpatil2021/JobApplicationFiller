import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResumesPage } from './ResumesPage.js'
import * as api from '../lib/api.js'

vi.mock('../lib/api.js', async importOriginal => {
  const mod = await importOriginal<typeof import('../lib/api.js')>()
  return {
    ...mod,
    listResumes: vi.fn(mod.listResumes),
    uploadResume: vi.fn(mod.uploadResume),
    deleteResume: vi.fn(mod.deleteResume),
  }
})

afterEach(() => cleanup())

beforeEach(() => {
  vi.mocked(api.listResumes).mockReset()
  vi.mocked(api.uploadResume).mockReset()
  vi.mocked(api.deleteResume).mockReset()
  vi.mocked(api.listResumes).mockResolvedValue([{ name: 'cv.pdf', size: 2048 }])
  vi.mocked(api.uploadResume).mockResolvedValue(undefined)
  vi.mocked(api.deleteResume).mockResolvedValue(undefined)
})

describe('ResumesPage', () => {
  it('lists the resumes already on disk with a human-readable size', async () => {
    render(<ResumesPage onChange={() => {}} />)
    expect(await screen.findByText('cv.pdf')).toBeInTheDocument()
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
  })

  it('tells the user what to do when there are none yet', async () => {
    vi.mocked(api.listResumes).mockResolvedValue([])
    render(<ResumesPage onChange={() => {}} />)
    expect(await screen.findByText(/no resumes yet/i)).toBeInTheDocument()
  })

  it('uploads a chosen file and refreshes the list', async () => {
    render(<ResumesPage onChange={() => {}} />)
    await screen.findByText('cv.pdf')

    const file = new File(['hello'], 'resume.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText(/add a resume/i), file)

    await waitFor(() => expect(api.uploadResume).toHaveBeenCalledWith(file))
    expect(api.listResumes).toHaveBeenCalledTimes(2)
  })

  it('shows the server error when an upload is refused, in plain language', async () => {
    vi.mocked(api.uploadResume).mockRejectedValue(new Error('bad filename or unsupported type'))
    render(<ResumesPage onChange={() => {}} />)
    await screen.findByText('cv.pdf')

    await userEvent.upload(
      screen.getByLabelText(/add a resume/i),
      new File(['x'], 'virus.exe', { type: 'application/octet-stream' }),
      { applyAccept: false },
    )
    expect(await screen.findByText(/unsupported type/i)).toBeInTheDocument()
  })

  it('asks for confirmation before deleting', async () => {
    render(<ResumesPage onChange={() => {}} />)
    await screen.findByText('cv.pdf')

    await userEvent.click(screen.getByRole('button', { name: /delete cv\.pdf/i }))
    expect(api.deleteResume).not.toHaveBeenCalled()
    expect(screen.getByText(/delete cv\.pdf\?/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^yes, delete$/i }))
    await waitFor(() => expect(api.deleteResume).toHaveBeenCalledWith('cv.pdf'))
  })

  it('lets the user back out of a delete', async () => {
    render(<ResumesPage onChange={() => {}} />)
    await screen.findByText('cv.pdf')

    await userEvent.click(screen.getByRole('button', { name: /delete cv\.pdf/i }))
    await userEvent.click(screen.getByRole('button', { name: /keep it/i }))
    expect(api.deleteResume).not.toHaveBeenCalled()
    expect(screen.getByText('cv.pdf')).toBeInTheDocument()
  })

  it('offers a download link pointing at the server', async () => {
    render(<ResumesPage onChange={() => {}} />)
    const link = await screen.findByRole('link', { name: /download cv\.pdf/i })
    expect(link).toHaveAttribute('href', '/api/resumes/cv.pdf')
    expect(link).toHaveAttribute('download', 'cv.pdf')
  })
})
