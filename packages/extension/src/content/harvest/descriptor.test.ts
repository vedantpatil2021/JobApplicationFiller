import { describe, it, expect } from 'vitest'
import { describeField } from './descriptor.js'
import { collectFields } from './collect.js'

const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
const first = (html: string) => {
  const d = parse(html)
  return describeField(d.querySelector('input, select, textarea') as HTMLElement, 'r0')
}

describe('label resolution', () => {
  it('prefers an explicit label[for]', () => {
    expect(first('<label for="x">First Name</label><input id="x">').label).toBe('First Name')
  })

  it('falls back to a wrapping label', () => {
    expect(first('<label>Email Address<input></label>').label).toBe('Email Address')
  })

  it('falls back to aria-labelledby', () => {
    expect(first('<span id="l">Phone</span><input aria-labelledby="l">').label).toBe('Phone')
  })

  it('falls back to aria-label', () => {
    expect(first('<input aria-label="LinkedIn URL">').label).toBe('LinkedIn URL')
  })

  it('falls back to placeholder last', () => {
    expect(first('<input placeholder="City">').label).toBe('City')
  })

  it('strips the required asterisk so matching is not thrown off', () => {
    expect(first('<label for="x">Last Name *</label><input id="x">').label).toBe('Last Name')
  })
})

describe('descriptor shape', () => {
  it('reads select options', () => {
    const d = first('<label for="s">Country</label><select id="s"><option>India</option><option>USA</option></select>')
    expect(d.kind).toBe('select')
    expect(d.options).toEqual(['India', 'USA'])
  })

  it('captures required and maxlength', () => {
    const d = first('<label for="x">Bio</label><textarea id="x" required maxlength="200"></textarea>')
    expect(d.kind).toBe('textarea')
    expect(d.required).toBe(true)
    expect(d.maxLength).toBe(200)
  })

  it('classifies a file input', () => {
    expect(first('<label for="x">Resume</label><input id="x" type="file">').kind).toBe('file')
  })

  it('treats an input with a listbox role as a combobox', () => {
    expect(first('<input role="combobox" aria-label="State">').kind).toBe('combobox')
  })

  it('harvests listbox options from aria-controls', () => {
    const html = `<input id="c" role="combobox" aria-controls="list">
      <ul id="list" role="listbox"><li role="option">India</li><li role="option">USA</li></ul>`
    const d = first(html)
    expect(d.options).toEqual(['India', 'USA'])
  })

  it('harvests datalist options', () => {
    const html = `<input list="states"><datalist id="states"><option>CA</option><option>NY</option></datalist>`
    expect(first(html).options).toEqual(['CA', 'NY'])
  })
})

describe('collectFields', () => {
  it('skips honeypots and hidden inputs', () => {
    const d = parse(`<form>
      <label for="a">First Name</label><input id="a" name="first_name">
      <input type="hidden" name="csrf"><input name="honeypot">
    </form>`)
    const got = collectFields(d, { checkLayout: false })
    expect(got.map(f => f.descriptor.label)).toEqual(['First Name'])
  })

  it('groups radios by name into one descriptor with its options', () => {
    const d = parse(`<fieldset><legend>Are you authorized to work?</legend>
      <label><input type="radio" name="auth" value="Yes">Yes</label>
      <label><input type="radio" name="auth" value="No">No</label>
    </fieldset>`)
    const got = collectFields(d, { checkLayout: false })
    expect(got).toHaveLength(1)
    expect(got[0].descriptor.kind).toBe('radio')
    expect(got[0].descriptor.options).toEqual(['Yes', 'No'])
  })

  it('numbers repeated sections so work_experience[1] can be told from [0]', () => {
    const d = parse(`
      <fieldset><label for="a">Job Title</label><input id="a" name="title"></fieldset>
      <fieldset><label for="b">Job Title</label><input id="b" name="title"></fieldset>`)
    const got = collectFields(d, { checkLayout: false })
    expect(got.map(f => f.descriptor.sectionIndex)).toEqual([0, 1])
  })

  it('descends into open shadow roots', () => {
    const d = parse('<div id="host"></div>')
    const shadow = d.getElementById('host')!.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<label for="s">Email</label><input id="s" name="email">'
    expect(collectFields(d, { checkLayout: false }).map(f => f.descriptor.label)).toContain('Email')
  })
})
