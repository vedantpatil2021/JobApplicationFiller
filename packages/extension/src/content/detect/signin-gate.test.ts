import { describe, it, expect } from 'vitest'
import { isWorkdaySignInGate } from './signin-gate.js'

describe('isWorkdaySignInGate', () => {
  it('detects a Workday sign-in page', () => {
    const doc = new DOMParser().parseFromString(`<body>
      <h1>Sign In</h1>
      <input type="email"><input type="password">
      <button>Create Account</button>
    </body>`, 'text/html')
    expect(isWorkdaySignInGate('https://acme.wd5.myworkdayjobs.com/en-US/job', doc)).toBe(true)
  })

  it('does not block a Workday page that looks like an application', () => {
    const doc = new DOMParser().parseFromString(`<body>
      <input name="first_name"><input name="last_name"><input name="email">
      <input name="phone"><textarea name="why"></textarea>
    </body>`, 'text/html')
    expect(isWorkdaySignInGate('https://acme.wd5.myworkdayjobs.com/en-US/apply', doc)).toBe(false)
  })

  it('ignores non-Workday hosts', () => {
    const doc = new DOMParser().parseFromString('<body><input type="password"></body>', 'text/html')
    expect(isWorkdaySignInGate('https://boards.greenhouse.io/acme/jobs/1', doc)).toBe(false)
  })
})
