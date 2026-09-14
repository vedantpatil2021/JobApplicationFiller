import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { emptyProfile } from '@jaf/shared'
import { ProfilePage } from './ProfilePage.js'
import * as api from '../lib/api.js'

// `vi.spyOn(api, …)` cannot redefine a live ESM export — it throws.
vi.mock('../lib/api.js', async importOriginal => {
  const mod = await importOriginal<typeof import('../lib/api.js')>()
  return {
    ...mod,
    getProfile: vi.fn(mod.getProfile),
    putProfile: vi.fn(mod.putProfile),
  }
})

afterEach(() => cleanup())

beforeEach(() => {
  vi.mocked(api.getProfile).mockResolvedValue(emptyProfile())
  vi.mocked(api.putProfile).mockResolvedValue(undefined)
})

describe('ProfilePage', () => {
  it('renders every profile section', async () => {
    render(<ProfilePage />)
    await screen.findByText('Personal Information')
    for (const s of ['Work Experience', 'Work Authorization', 'Government & Compliance',
                     'E-Signature', 'Consents', 'Source Attribution', 'Voluntary Demographics']) {
      expect(screen.getByText(s)).toBeTruthy()
    }
  })

  it('saves an edited first name', async () => {
    render(<ProfilePage />)
    const input = await screen.findByLabelText('First name')
    await userEvent.type(input, 'Ada')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(api.putProfile).toHaveBeenCalled())
    const sent = vi.mocked(api.putProfile).mock.calls[0][0]
    expect(sent.applicant_profile.personal_information.first_name).toBe('Ada')
  })

  it('adds a work experience row', async () => {
    render(<ProfilePage />)
    await screen.findByText('Work Experience')
    await userEvent.click(screen.getByRole('button', { name: /add role/i }))
    expect(screen.getByLabelText('Job title')).toBeTruthy()
  })

  it('adds and removes a work experience row without colliding field ids', async () => {
    render(<ProfilePage />)
    await screen.findByText('Work Experience')
    await userEvent.click(screen.getByRole('button', { name: /add role/i }))
    await userEvent.click(screen.getByRole('button', { name: /add role/i }))

    const titles = screen.getAllByLabelText('Job title')
    expect(titles).toHaveLength(2)
    expect(titles[0].id).not.toBe(titles[1].id)

    await userEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[0])
    expect(screen.getAllByLabelText('Job title')).toHaveLength(1)
  })

  it('keeps demographics inputs disabled until the user opts in', async () => {
    render(<ProfilePage />)
    await screen.findByText('Voluntary Demographics')
    expect(screen.getByLabelText('Gender identity')).toHaveProperty('disabled', true)
  })
})
