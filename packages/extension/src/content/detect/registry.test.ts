import { describe, it, expect } from 'vitest'
import { detectAts } from './registry.js'

const doc = (html = '') => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

describe('detectAts by URL', () => {
  const cases: [string, string][] = [
    ['https://boards.greenhouse.io/acme/jobs/123', 'greenhouse'],
    ['https://job-boards.greenhouse.io/acme/jobs/123', 'greenhouse'],
    ['https://jobs.lever.co/acme/2f8c-uuid/apply', 'lever'],
    ['https://jobs.eu.lever.co/acme/2f8c-uuid', 'lever'],
    ['https://jobs.ashbyhq.com/acme/uuid/application', 'ashby'],
    ['https://jobs.gem.com/acme/job/abc', 'gem'],
    ['https://acme.wd1.myworkdayjobs.com/en-US/careers/job/x', 'workday'],
    ['https://careers-acme.icims.com/jobs/1234/login', 'icims'],
    ['https://jobs.smartrecruiters.com/Acme/744000', 'smartrecruiters'],
    ['https://acme.taleo.net/careersection/ex/jobdetail.ftl', 'taleo'],
    ['https://acme.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/1', 'oracle-fusion'],
  ]

  for (const [url, id] of cases) {
    it(`identifies ${id} from ${new URL(url).host}`, () => {
      expect(detectAts(url, doc())?.id).toBe(id)
    })
  }
})

describe('detectAts by DOM fingerprint', () => {
  it('finds an embedded Greenhouse board on a company domain', () => {
    expect(detectAts('https://acme.com/careers', doc('<div id="grnhse_app"></div>'))?.id).toBe('greenhouse')
  })

  it('finds an embedded Ashby board on a company domain', () => {
    expect(detectAts('https://acme.com/careers', doc('<div id="ashby_embed"></div>'))?.id).toBe('ashby')
  })

  it('finds Workday by its automation attributes', () => {
    expect(detectAts('https://acme.com/apply', doc('<div data-automation-id="legalNameSection"></div>'))?.id).toBe('workday')
  })
})

describe('detectAts fallback', () => {
  it('returns generic for an unknown page that looks like an application', () => {
    const html = `<form><input name="first_name"><input name="email">
                  <input type="file" name="resume"><button>Apply</button></form>`
    expect(detectAts('https://acme.com/join-us', doc(html))?.id).toBe('generic')
  })

  it('returns null for an ordinary page with no application form', () => {
    expect(detectAts('https://news.example.com/article', doc('<p>hello</p>'))).toBeNull()
  })

  it('returns null for a login form, which is not an application', () => {
    const html = `<form><input name="username"><input type="password" name="password"></form>`
    expect(detectAts('https://acme.com/login', doc(html))).toBeNull()
  })

  it('stays off our own controller page, whose editor is not an application', () => {
    // The page is literally titled "Job Application Filler" and is full of
    // inputs, so the generic fallback would otherwise offer to fill it.
    const html = `<h1>Job Application Filler</h1><input><input><input>`
    expect(detectAts('http://localhost:5173/', doc(html))).toBeNull()
    expect(detectAts('http://127.0.0.1:5173/', doc(html))).toBeNull()
    expect(detectAts('http://127.0.0.1:4321/api/profile', doc(html))).toBeNull()
  })
})
