import { describe, it, expect } from 'vitest'
import { attachFile } from './file.js'

describe('attachFile', () => {
  it('sets files on a file input when DataTransfer is available', () => {
    if (typeof DataTransfer === 'undefined') return

    const doc = new DOMParser().parseFromString(
      '<body><input id="cv" type="file"></body>',
      'text/html',
    )
    const input = doc.querySelector<HTMLInputElement>('#cv')!
    const file = new File(['hello'], 'cv.pdf', { type: 'application/pdf' })

    expect(attachFile(input, file)).toBe(true)
    expect(input.files?.[0]?.name).toBe('cv.pdf')
  })
})
