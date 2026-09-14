import { describe, it, expect } from 'vitest'
import { isSubmitControl } from './guard.js'

const el = (html: string) => {
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return d.body.firstElementChild!
}

describe('isSubmitControl — the never-submit guard', () => {
  it('catches input[type=submit]', () => { expect(isSubmitControl(el('<input type="submit">'))).toBe(true) })
  it('catches button[type=submit]', () => { expect(isSubmitControl(el('<button type="submit">Go</button>'))).toBe(true) })
  it('catches a bare button, which submits by default inside a form', () => {
    expect(isSubmitControl(el('<button>Send</button>'))).toBe(true)
  })
  it('catches submit-like text on a link', () => {
    expect(isSubmitControl(el('<a href="#">Submit Application</a>'))).toBe(true)
    expect(isSubmitControl(el('<a href="#">Apply Now</a>'))).toBe(true)
  })
  it('leaves an ordinary text input alone', () => {
    expect(isSubmitControl(el('<input type="text">'))).toBe(false)
  })
  it('leaves a type=button control alone', () => {
    expect(isSubmitControl(el('<button type="button">Add another</button>'))).toBe(false)
  })
})
