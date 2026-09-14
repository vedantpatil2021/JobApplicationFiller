import { describe, it, expect } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDataDir } from './data-dir.js'

const repoRootProfile = resolve(dirname(fileURLToPath(import.meta.url)), '../../../profile')

describe('resolveDataDir', () => {
  it('defaults to the repo-root profile folder, not cwd', () => {
    const cwd = resolve('/tmp', 'packages', 'server')
    expect(resolveDataDir({}, cwd)).toBe(repoRootProfile)
    expect(resolveDataDir({}, cwd)).not.toBe(resolve(cwd, './profile'))
  })

  it('resolves JAF_DATA_DIR relative to cwd', () => {
    expect(resolveDataDir({ JAF_DATA_DIR: './custom' }, '/tmp/cwd'))
      .toBe(resolve('/tmp/cwd', './custom'))
  })

  it('keeps an absolute JAF_DATA_DIR', () => {
    expect(resolveDataDir({ JAF_DATA_DIR: '/abs/data' }, '/tmp/cwd'))
      .toBe('/abs/data')
  })
})
