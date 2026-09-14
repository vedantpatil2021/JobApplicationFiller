import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readJsonFile, writeJsonFile } from './json-store.js'

let dir: string

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'jaf-json-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('json-store', () => {
  it('returns the fallback when the file does not exist yet', async () => {
    expect(await readJsonFile(join(dir, 'missing.json'), { x: 1 })).toEqual({ x: 1 })
  })

  it('round-trips JSON atomically', async () => {
    const path = join(dir, 'answers.json')
    await writeJsonFile(path, { abc: { value: 'Yes', confidence: 1 } })
    expect(await readJsonFile(path, {})).toEqual({ abc: { value: 'Yes', confidence: 1 } })
    const raw = await readFile(path, 'utf8')
    expect(raw).toContain('"abc"')
  })
})
