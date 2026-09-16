import { describe, it, expect } from 'vitest'
import { emptyProfile } from '@jaf/shared'
import { collectFields } from '../harvest/collect.js'
import { resolveAll } from '../resolve/score.js'
import { applyDecisions } from './apply.js'

/** A Greenhouse-shaped form: real labels, a honeypot, a hidden token, a submit. */
const FORM = `<form>
  <label for="fn">First Name *</label><input id="fn" name="first_name">
  <label for="ln">Last Name *</label><input id="ln" name="last_name">
  <label for="em">Email *</label><input id="em" name="email" type="email">
  <label for="ph">Phone</label><input id="ph" name="phone">
  <label for="li">LinkedIn Profile</label><input id="li" name="linkedin">
  <label for="cty">City</label><input id="cty" name="city">
  <label for="src">How did you hear about us?</label>
  <select id="src" name="source"><option value="">Select…</option><option>Company career page</option><option>LinkedIn</option></select>
  <fieldset><legend>Are you legally authorized to work?</legend>
    <label><input type="radio" name="auth" value="Yes">Yes</label>
    <label><input type="radio" name="auth" value="No">No</label>
  </fieldset>
  <label for="why">Why do you want this job?</label><textarea id="why" name="why"></textarea>
  <input type="hidden" name="csrf" value="tok">
  <input name="honeypot">
  <button type="submit">Submit Application</button>
</form>`

const profile = () => {
  const p = emptyProfile()
  const pi = p.applicant_profile.personal_information
  pi.first_name = 'Ada'
  pi.last_name = 'Lovelace'
  pi.email = 'ada@example.com'
  pi.phone_number = '+1 555 0100'
  pi.linkedin_url = 'https://linkedin.com/in/ada'
  pi.address.city = 'Pune'
  return p
}

const run = (html: string, p = profile()) => {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const fields = collectFields(doc, { checkLayout: false })
  const { decisions, unresolved } = resolveAll(fields.map(f => f.descriptor), p)
  return { doc, fields, unresolved, results: applyDecisions(fields, decisions) }
}

const valueOf = (doc: Document, selector: string) =>
  doc.querySelector<HTMLInputElement>(selector)!.value

describe('end-to-end fill', () => {
  it('fills the identity fields a real application asks for', () => {
    const { doc } = run(FORM)
    expect(valueOf(doc, '#fn')).toBe('Ada')
    expect(valueOf(doc, '#ln')).toBe('Lovelace')
    expect(valueOf(doc, '#em')).toBe('ada@example.com')
    expect(valueOf(doc, '#ph')).toBe('+1 555 0100')
    expect(valueOf(doc, '#li')).toBe('https://linkedin.com/in/ada')
    expect(valueOf(doc, '#cty')).toBe('Pune')
  })

  it('picks an option that exists in a select', () => {
    const { doc } = run(FORM)
    expect(valueOf(doc, '#src')).toBe('Company career page')
  })

  it('answers a work-authorization radio group', () => {
    const { doc } = run(FORM)
    const yes = doc.querySelectorAll<HTMLInputElement>('input[name="auth"]')[0]
    expect(yes.checked).toBe(true)
  })

  it('never touches the honeypot or the hidden token', () => {
    const { doc } = run(FORM)
    expect(valueOf(doc, 'input[name="honeypot"]')).toBe('')
    expect(valueOf(doc, 'input[name="csrf"]')).toBe('tok')
  })

  it('never clicks the submit button', () => {
    const doc = new DOMParser().parseFromString(`<body>${FORM}</body>`, 'text/html')
    let clicks = 0
    doc.querySelector('button')!.addEventListener('click', () => { clicks++ })

    const fields = collectFields(doc, { checkLayout: false })
    const { decisions } = resolveAll(fields.map(f => f.descriptor), profile())
    applyDecisions(fields, decisions)

    expect(clicks).toBe(0)
  })

  it('reports an open-ended question as unresolved for the AI fallback', () => {
    const { unresolved } = run(FORM)
    expect(unresolved.map(f => f.label)).toContain('Why do you want this job?')
  })

  it('leaves an edit the user made after a fill alone on the second run', () => {
    const doc = new DOMParser().parseFromString(`<body>${FORM}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const { decisions } = resolveAll(fields.map(f => f.descriptor), profile())

    applyDecisions(fields, decisions)
    doc.querySelector<HTMLInputElement>('#ph')!.value = '+91 98000 00000'
    const second = applyDecisions(fields, decisions)

    expect(valueOf(doc, '#ph')).toBe('+91 98000 00000')
    const phone = second.find(r => r.label === 'Phone')
    expect(phone?.outcome).toBe('skipped')
    expect(phone?.note).toBe('you edited this')
  })

  it('reports a file input as needing the user, since upload lands in a later milestone', () => {
    const doc = new DOMParser().parseFromString(
      '<body><label for="cv">Resume</label><input id="cv" type="file" name="resume"></body>',
      'text/html',
    )
    const fields = collectFields(doc, { checkLayout: false })
    const results = applyDecisions(fields, [{
      ref: fields[0].descriptor.ref,
      value: 'resume.pdf',
      confidence: 0.9,
      source: 'heuristic',
      canonicalKey: 'resume',
      reason: 'test',
    }])
    expect(results[0]?.outcome).toBe('needs-user')
    expect(results[0]?.note).toMatch(/upload/i)
  })

  it('fills a combobox-classified text input when the profile has a value', () => {
    const html = '<label for="fn">First Name</label><input id="fn" aria-autocomplete="list" aria-controls="opts">'
    const { doc, results } = run(html)
    expect(valueOf(doc, '#fn')).toBe('Ada')
    expect(results[0]?.outcome).toBe('filled')
  })

  it('reports needs-user when a combobox has no profile value to write', () => {
    const doc = new DOMParser().parseFromString(
      '<body><label for="li">LinkedIn</label><input id="li" aria-autocomplete="list"></body>',
      'text/html',
    )
    const fields = collectFields(doc, { checkLayout: false })
    const results = applyDecisions(fields, [{
      ref: fields[0].descriptor.ref,
      value: '',
      confidence: 0.9,
      source: 'heuristic',
      canonicalKey: 'linkedin',
      reason: 'test',
    }])
    expect(results[0]?.outcome).toBe('needs-user')
    expect(results[0]?.note).toMatch(/no value in profile/i)
  })

  it('fills only the schema defaults from an otherwise empty profile', () => {
    const { results } = run(FORM, emptyProfile())
    // Everything else is an empty string, and an empty value is never written.
    expect(results.filter(r => r.outcome === 'filled').map(r => r.label).sort())
      .toEqual(['Are you legally authorized to work?', 'How did you hear about us?'])
  })

  it('skips a field the user already filled before the first run', () => {
    const doc = new DOMParser().parseFromString(`<body>${FORM}</body>`, 'text/html')
    doc.querySelector<HTMLInputElement>('#fn')!.value = 'Charles'
    const fields = collectFields(doc, { checkLayout: false })
    const { decisions } = resolveAll(fields.map(f => f.descriptor), profile())
    const results = applyDecisions(fields, decisions)

    expect(valueOf(doc, '#fn')).toBe('Charles')
    const first = results.find(r => r.label === 'First Name')
    expect(first?.outcome).toBe('skipped')
    expect(first?.note).toBe('already has a value')
  })

  it('reports failed when a select value does not match any option', () => {
    const html = `<label for="c">Country</label>
      <select id="c"><option value="">Pick</option><option>India</option></select>`
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const results = applyDecisions(fields, [{
      ref: fields[0].descriptor.ref,
      value: 'Atlantis',
      confidence: 0.9,
      source: 'heuristic',
      canonicalKey: 'country',
      reason: 'test',
    }])
    expect(results[0]?.outcome).toBe('failed')
    expect(results[0]?.note).toMatch(/no matching option/i)
  })

  it('picks a combobox listbox option instead of typing garbage', () => {
    const html = `<label for="c">Country</label>
      <input id="c" role="combobox" aria-controls="list">
      <ul id="list" role="listbox"><li role="option">India</li><li role="option">USA</li></ul>`
    const p = profile()
    p.applicant_profile.personal_information.address.country = 'India'
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    doc.querySelector('[role="option"]')!.addEventListener('click', () => {
      doc.querySelector<HTMLInputElement>('#c')!.value = 'India'
    })
    const fields = collectFields(doc, { checkLayout: false })
    const { decisions } = resolveAll(fields.map(f => f.descriptor), p)
    applyDecisions(fields, decisions)
    expect(doc.querySelector<HTMLInputElement>('#c')!.value).toBe('India')
  })

  it('refuses to write a non-yes/no value into a yes/no-phrased question — live-test finding', () => {
    const html = '<label for="eeo">Are you Hispanic or Latino?</label><input id="eeo">'
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const results = applyDecisions(fields, [{
      ref: fields[0].descriptor.ref,
      value: 'Columbus',       // an AI/resolver mismatch, not a real yes/no answer
      confidence: 0.9,
      source: 'ai',
      canonicalKey: null,
      reason: 'test',
    }])
    expect(results[0]?.outcome).toBe('needs-user')
    expect(doc.querySelector<HTMLInputElement>('#eeo')!.value).toBe('')
    expect(results[0]?.note).toMatch(/yes\/no/i)
  })

  it('still fills a yes/no-phrased question when the value actually is yes/no', () => {
    const html = '<label for="eeo">Are you Hispanic or Latino?</label><input id="eeo">'
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const results = applyDecisions(fields, [{
      ref: fields[0].descriptor.ref,
      value: 'No', confidence: 0.9, source: 'ai', canonicalKey: null, reason: 'test',
    }])
    expect(results[0]?.outcome).toBe('filled')
    expect(doc.querySelector<HTMLInputElement>('#eeo')!.value).toBe('No')
  })

  it('refuses to write a date value into a field whose label is not about dates — live-test finding', () => {
    const html = '<label for="city">Location (City)</label><input id="city">'
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const results = applyDecisions(fields, [{
      ref: fields[0].descriptor.ref,
      value: '2026-09-14', confidence: 0.9, source: 'heuristic', canonicalKey: 'signature_date', reason: 'test',
    }])
    expect(results[0]?.outcome).toBe('needs-user')
    expect(doc.querySelector<HTMLInputElement>('#city')!.value).toBe('')
    expect(results[0]?.note).toMatch(/date/i)
  })

  it('still fills a genuine date question with a date value', () => {
    const html = '<label for="start">Earliest available start date</label><input id="start">'
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const fields = collectFields(doc, { checkLayout: false })
    const results = applyDecisions(fields, [{
      ref: fields[0].descriptor.ref,
      value: '2026-09-14', confidence: 0.9, source: 'heuristic', canonicalKey: 'signature_date', reason: 'test',
    }])
    expect(results[0]?.outcome).toBe('filled')
    expect(doc.querySelector<HTMLInputElement>('#start')!.value).toBe('2026-09-14')
  })
})
