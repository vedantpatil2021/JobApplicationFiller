import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collectFields } from './harvest/collect.js'
import { fillVirtualFiles } from './resume-fill.js'
import * as file from './fill/file.js'

const RESUME_FORM = `<label for="cv">Resume</label><input id="cv" type="file" name="resume">`

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('fillVirtualFiles', () => {
  it('attaches the primary resume from the server when online', async () => {
    const doc = new DOMParser().parseFromString(`<body>${RESUME_FORM}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const unresolved = fields.map(f => f.descriptor)

    const payload = { name: 'cv.pdf', mime: 'application/pdf', data: btoa('hello') }
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn(async () => payload) },
    })
    const attach = vi.spyOn(file, 'attachFile').mockReturnValue(true)

    const { results, remaining } = await fillVirtualFiles(fields, unresolved, true)
    expect(remaining).toHaveLength(0)
    expect(results[0]?.outcome).toBe('filled')
    expect(results[0]?.value).toBe('cv.pdf')
    expect(attach).toHaveBeenCalledWith(
      doc.querySelector<HTMLInputElement>('#cv'),
      expect.objectContaining({ name: 'cv.pdf', type: 'application/pdf' }),
    )
  })

  it('reports needs-user when the server has no resume', async () => {
    const doc = new DOMParser().parseFromString(`<body>${RESUME_FORM}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const unresolved = fields.map(f => f.descriptor)

    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn(async () => null) },
    })

    const { results } = await fillVirtualFiles(fields, unresolved, true)
    expect(results[0]?.outcome).toBe('needs-user')
    expect(results[0]?.note).toMatch(/no resume on server/i)
  })

  it('reports needs-user when offline', async () => {
    const doc = new DOMParser().parseFromString(`<body>${RESUME_FORM}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const unresolved = fields.map(f => f.descriptor)

    const { results } = await fillVirtualFiles(fields, unresolved, false)
    expect(results[0]?.note).toMatch(/offline/i)
  })
})
