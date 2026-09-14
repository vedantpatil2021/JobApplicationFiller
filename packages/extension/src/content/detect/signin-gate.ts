/** Spec §4.12: Workday often demands sign-in before the application form appears. */
const WORKDAY = /\.myworkdayjobs\.com$/

const SIGNIN_HINT = /\b(sign in|log in|create account|register|join our talent community)\b/i

export function isWorkdaySignInGate(url: string, doc: Document): boolean {
  let host = ''
  try { host = new URL(url).hostname } catch { return false }
  if (!WORKDAY.test(host)) return false

  const text = doc.body?.textContent ?? ''
  if (!SIGNIN_HINT.test(text)) return false

  const fillable = doc.querySelectorAll(
    'input:not([type="hidden"]):not([type="password"]), textarea, select',
  ).length
  const hasPassword = doc.querySelector('input[type="password"]') !== null
  return hasPassword && fillable < 4
}
