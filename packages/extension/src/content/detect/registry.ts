export type AtsId =
  | 'greenhouse' | 'lever' | 'ashby' | 'gem' | 'workday'
  | 'icims' | 'smartrecruiters' | 'taleo' | 'oracle-fusion' | 'generic'

export interface AtsMatch { id: AtsId; confidence: number }

interface Rule { id: AtsId; url: RegExp; fingerprint?: string }

const RULES: Rule[] = [
  { id: 'greenhouse',      url: /(^|\.)(job-boards|boards)\.greenhouse\.io$|(^|\.)greenhouse\.io$/, fingerprint: '#grnhse_app, form[action*="greenhouse"]' },
  { id: 'lever',           url: /(^|\.)jobs(\.eu)?\.lever\.co$/,           fingerprint: '.application-form, [data-qa="application-form"]' },
  { id: 'ashby',           url: /(^|\.)ashbyhq\.com$/,                     fingerprint: '#ashby_embed, .ashby-application-form-field-entry' },
  { id: 'gem',             url: /(^|\.)jobs\.gem\.com$|(^|\.)gem\.com$/,   fingerprint: '[data-gem-job-board], script[src*="gem.com"]' },
  { id: 'workday',         url: /\.myworkdayjobs\.com$/,                   fingerprint: '[data-automation-id]' },
  { id: 'icims',           url: /(^|\.)icims\.com$/,                       fingerprint: '[class^="iCIMS_"], [class*=" iCIMS_"]' },
  { id: 'smartrecruiters', url: /(^|\.)smartrecruiters\.com$/,             fingerprint: '[data-test="application-form"], sr-application' },
  { id: 'taleo',           url: /(^|\.)taleo\.net$/,                       fingerprint: '#requisitionDescriptionInterface, form[name="dynamicForm"]' },
  { id: 'oracle-fusion',   url: /(^|\.)oraclecloud\.com$/,                 fingerprint: '[class*="candidate-experience"], .apply-flow' },
]

const APPLY_HINT = /\b(apply|application|resume|cv|cover letter|submit your)\b/i

/**
 * Our own controller and server. The controller is titled "Job Application
 * Filler" and is nothing but form controls, so the generic fallback would
 * happily offer to fill the user's profile editor with their own profile.
 */
const OWN_PORTS = new Set(['5173', '4321'])
const OWN_HOSTS = new Set(['localhost', '127.0.0.1'])

/** A login form is not an application, no matter how many inputs it has. */
function looksLikeLogin(doc: Document): boolean {
  return doc.querySelector('input[type="password"]') !== null
}

function looksLikeApplication(doc: Document): boolean {
  if (looksLikeLogin(doc)) return false
  const controls = doc.querySelectorAll('input:not([type="hidden"]), textarea, select')
  if (controls.length < 3) return false
  const hasFile = doc.querySelector('input[type="file"]') !== null
  return hasFile || APPLY_HINT.test(doc.body?.textContent ?? '')
}

export function detectAts(url: string, doc: Document): AtsMatch | null {
  let host = ''
  let path = ''
  let port = ''
  try {
    const u = new URL(url)
    host = u.hostname
    path = u.pathname
    port = u.port
  } catch { /* treat as no match */ }

  if (OWN_HOSTS.has(host) && OWN_PORTS.has(port)) return null

  for (const rule of RULES) {
    if (rule.url.test(host)) return { id: rule.id, confidence: 1 }
  }
  // Taleo and Fusion also appear under vanity domains; their paths are distinctive.
  if (/\/careersection\//.test(path)) return { id: 'taleo', confidence: 0.9 }
  if (/\/hcmUI\/CandidateExperience\//.test(path)) return { id: 'oracle-fusion', confidence: 0.9 }

  for (const rule of RULES) {
    if (rule.fingerprint && doc.querySelector(rule.fingerprint)) return { id: rule.id, confidence: 0.8 }
  }

  return looksLikeApplication(doc) ? { id: 'generic', confidence: 0.5 } : null
}
