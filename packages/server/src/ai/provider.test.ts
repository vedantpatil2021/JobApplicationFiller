import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyProfile, type FieldDescriptor } from '@jaf/shared'
import { putCachedAnswer, cacheKeyForField } from './cache.js'
import * as claude from './claude-cli.js'
import { mapFields } from './provider.js'

let dir: string

const field: FieldDescriptor = {
  ref: 'q1', kind: 'textarea', label: 'Why us?', name: 'why',
  id: null, placeholder: null, ariaLabel: null, autocomplete: null, options: [],
  required: true, maxLength: null, sectionIndex: 0, nearbyText: '',
}

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'jaf-prov-')) })
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

describe('mapFields provider', () => {
  it('returns cached answers without calling the CLI', async () => {
    await putCachedAnswer(dir, cacheKeyForField(field), 'Cached reply', 0.95)
    const spy = vi.spyOn(claude, 'claudeMapFields')

    const r = await mapFields(dir, { fields: [field], profile: emptyProfile(), jobDescription: '' })
    expect(r.answers).toEqual([{ ref: 'q1', value: 'Cached reply', confidence: 0.95, source: 'cache' }])
    expect(spy).not.toHaveBeenCalled()
  })

  it('calls Claude once for all uncached fields and stores new answers', async () => {
    vi.spyOn(claude, 'claudeMapFields').mockResolvedValue({
      answers: [{ ref: 'q1', value: 'Fresh reply', confidence: 0.8 }],
    })

    const r = await mapFields(dir, { fields: [field], profile: emptyProfile(), jobDescription: 'JD' })
    expect(r.answers[0]).toEqual(expect.objectContaining({ value: 'Fresh reply', source: 'ai' }))

    const again = await mapFields(dir, { fields: [field], profile: emptyProfile(), jobDescription: '' })
    expect(again.answers[0].source).toBe('cache')
  })
})
