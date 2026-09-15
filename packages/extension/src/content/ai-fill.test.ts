import { describe, it, expect, vi, beforeEach } from 'vitest'
import { emptyProfile } from '@jaf/shared'
import { collectFields } from './harvest/collect.js'
import { fillWithAi } from './ai-fill.js'
import * as ai from '../lib/ai.js'

const FORM = `<label for="why">Why do you want this job?</label><textarea id="why" name="why"></textarea>`

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('fillWithAi', () => {
  it('fills a textarea when the server returns a confident AI answer', async () => {
    const doc = new DOMParser().parseFromString(`<body>${FORM}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const unresolved = fields.map(f => f.descriptor)

    vi.spyOn(ai, 'requestMapFields').mockResolvedValue({
      answers: [{ ref: unresolved[0].ref, value: 'Because widgets.', confidence: 0.9, source: 'ai' }],
    })

    const results = await fillWithAi(fields, unresolved, emptyProfile(), doc, true)
    expect(doc.querySelector<HTMLTextAreaElement>('#why')!.value).toBe('Because widgets.')
    expect(results.some(r => r.outcome === 'filled')).toBe(true)
  })

  it('sends combobox-classified custom questions to AI', async () => {
    const html = `<label for="ai">What AI tool do you use?</label>
      <input id="ai" name="ai_tool" aria-autocomplete="list">`
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const unresolved = fields.map(f => f.descriptor)
    expect(unresolved[0].kind).toBe('combobox')

    vi.spyOn(ai, 'requestMapFields').mockResolvedValue({
      answers: [{ ref: unresolved[0].ref, value: 'Claude for coding.', confidence: 0.85, source: 'ai' }],
    })

    const results = await fillWithAi(fields, unresolved, emptyProfile(), doc, true)
    expect(ai.requestMapFields).toHaveBeenCalled()
    expect(results.some(r => r.outcome === 'filled')).toBe(true)
  })

  it('reports needs-user when offline', async () => {
    const doc = new DOMParser().parseFromString(`<body>${FORM}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const unresolved = fields.map(f => f.descriptor)

    const results = await fillWithAi(fields, unresolved, emptyProfile(), doc, false)
    expect(results[0].outcome).toBe('needs-user')
    expect(results[0].note).toMatch(/offline/i)
  })

  it('reports needs-user only when profile and AI cannot supply an answer', async () => {
    const doc = new DOMParser().parseFromString(`<body>${FORM}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const unresolved = fields.map(f => f.descriptor)

    vi.spyOn(ai, 'requestMapFields').mockResolvedValue({
      answers: [{ ref: unresolved[0].ref, value: 'Maybe?', confidence: 0.3, source: 'ai' }],
    })

    const results = await fillWithAi(fields, unresolved, emptyProfile(), doc, true)
    expect(results[0].outcome).toBe('needs-user')
    expect(results[0].note).toMatch(/not confident/i)
  })

  it('surfaces server errors in the review note', async () => {
    const doc = new DOMParser().parseFromString(`<body>${FORM}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const unresolved = fields.map(f => f.descriptor)

    vi.spyOn(ai, 'requestMapFields').mockResolvedValue({
      answers: [],
      error: 'Claude is not logged in — run `claude login` in a terminal.',
    })

    const results = await fillWithAi(fields, unresolved, emptyProfile(), doc, true)
    expect(results[0].note).toMatch(/claude login/i)
  })
})
