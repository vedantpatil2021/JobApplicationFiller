import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FieldDescriptor } from '@jaf/shared'
import {
  cacheKey, cacheKeyForField, readAnswerCache, putCachedAnswer,
} from './cache.js'

let dir: string

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'jaf-cache-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const field = (label: string, options: string[] = []): FieldDescriptor => ({
  ref: 'f1', kind: 'text', label, name: null, id: null, placeholder: null,
  ariaLabel: null, autocomplete: null, options, required: false, maxLength: null,
  sectionIndex: 0, nearbyText: '',
})

describe('answer cache', () => {
  it('keys on the label and sorted options', () => {
    expect(cacheKey('Why us?', ['B', 'A'])).toBe(cacheKey('Why us?', ['A', 'B']))
    expect(cacheKey('Why us?', [])).not.toBe(cacheKey('Why now?', []))
  })

  it('uses cacheKeyForField with label fallback', () => {
    expect(cacheKeyForField(field('Sponsorship?'))).toBe(cacheKey('Sponsorship?', []))
  })

  it('persists answers to answers.json under the data dir', async () => {
    const key = cacheKey('Are you authorized?', ['Yes', 'No'])
    await putCachedAnswer(dir, key, 'Yes', 1)
    const cache = await readAnswerCache(dir)
    expect(cache[key]).toEqual(expect.objectContaining({ value: 'Yes', confidence: 1 }))
  })
})
