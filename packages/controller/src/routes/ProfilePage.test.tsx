import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SOURCE_ATTRIBUTION_DEFAULT, emptyProfile } from '@jaf/shared'
import { ProfilePage } from './ProfilePage.js'
import * as api from '../lib/api.js'

// `vi.spyOn(api, …)` cannot redefine a live ESM export — it throws.
vi.mock('../lib/api.js', async importOriginal => {
  const mod = await importOriginal<typeof import('../lib/api.js')>()
  return {
    ...mod,
    getProfile: vi.fn(mod.getProfile),
    putProfile: vi.fn(mod.putProfile),
    importProfileYaml: vi.fn(mod.importProfileYaml),
  }
})

afterEach(() => cleanup())

beforeEach(() => {
  vi.mocked(api.getProfile).mockResolvedValue(emptyProfile())
  vi.mocked(api.putProfile).mockResolvedValue(undefined)
  vi.mocked(api.importProfileYaml).mockReset()
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

  it('uses a textarea for work experience description', async () => {
    render(<ProfilePage />)
    await screen.findByText('Work Experience')
    await userEvent.click(screen.getByRole('button', { name: /add role/i }))
    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA')
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

  it('keeps demographics dropdowns disabled until the user opts in', async () => {
    render(<ProfilePage />)
    await screen.findByText('Voluntary Demographics')
    const gender = screen.getByLabelText('Gender identity')
    expect(gender.tagName).toBe('SELECT')
    expect(gender).toHaveProperty('disabled', true)
  })

  it('enables demographics dropdowns when the user opts in', async () => {
    render(<ProfilePage />)
    await screen.findByText('Voluntary Demographics')
    await userEvent.click(screen.getByLabelText('Opt in to sharing demographics'))
    const gender = screen.getByRole('combobox', { name: 'Gender identity' })
    expect(gender).toHaveProperty('disabled', false)
    expect(screen.getByRole('combobox', { name: 'Transgender status' })).toHaveProperty('disabled', false)
    expect(screen.getByRole('combobox', { name: 'Race / ethnicity' })).toHaveProperty('disabled', false)
  })

  it('disables government compliance fields when Not applicable is checked', async () => {
    render(<ProfilePage />)
    await screen.findByText('Government & Compliance')
    expect(screen.getByLabelText('Clearance level')).toHaveProperty('disabled', false)
    await userEvent.click(screen.getByLabelText('Not applicable'))
    expect(screen.getByLabelText('Clearance level')).toHaveProperty('disabled', true)
    expect(screen.getByLabelText('Former government employee')).toHaveProperty('disabled', true)
  })

  it('defaults source attribution to Company career page on load', async () => {
    const stale = emptyProfile()
    stale.applicant_profile.source_attribution.how_did_you_hear_about_us = ''
    vi.mocked(api.getProfile).mockResolvedValue(stale)

    render(<ProfilePage />)
    await screen.findByText('Source Attribution')

    expect(screen.getByLabelText('How did you hear about us')).toHaveValue(SOURCE_ATTRIBUTION_DEFAULT)
  })

  it('sets e-signature date to today on load', async () => {
    const stale = emptyProfile()
    stale.applicant_profile.e_signature.date = '2020-01-01'
    vi.mocked(api.getProfile).mockResolvedValue(stale)

    render(<ProfilePage />)
    await screen.findByText('E-Signature')

    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(screen.getByLabelText('Date')).toHaveValue(today)
  })

  it('imports YAML and fills profile fields', async () => {
    const imported = emptyProfile()
    imported.applicant_profile.personal_information.first_name = 'Ada'
    imported.applicant_profile.personal_information.last_name = 'Lovelace'
    vi.mocked(api.importProfileYaml).mockResolvedValue(imported)

    render(<ProfilePage />)
    await screen.findByLabelText('First name')

    const file = new File(['version: 1'], 'profile.yaml', { type: 'application/x-yaml' })
    const input = document.querySelector('input[type="file"][accept=".yaml,.yml"]') as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() => expect(api.importProfileYaml).toHaveBeenCalledWith(file))
    expect(screen.getByLabelText('First name')).toHaveValue('Ada')
    expect(screen.getByLabelText('Last name')).toHaveValue('Lovelace')
    expect(screen.getByText('Imported')).toBeTruthy()
  })

  it('shows an error when YAML import fails', async () => {
    vi.mocked(api.importProfileYaml).mockRejectedValue(new Error('not valid YAML: bad indent'))

    render(<ProfilePage />)
    await screen.findByLabelText('First name')

    const file = new File(['bad: ['], 'bad.yaml', { type: 'application/x-yaml' })
    const input = document.querySelector('input[type="file"][accept=".yaml,.yml"]') as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() => expect(screen.getByText(/not valid yaml/i)).toBeTruthy())
  })
})
