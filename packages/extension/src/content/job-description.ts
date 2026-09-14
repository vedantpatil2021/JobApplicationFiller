const SELECTORS = [
  '[data-qa="job-description"]',
  '.job-description',
  '#job-description',
  '[class*="job-description"]',
  '[class*="JobDescription"]',
  'article',
  'main',
]

const MAX = 8_000

/** Best-effort scrape — wrapped in delimiters server-side before reaching the CLI. */
export function scrapeJobDescription(doc: Document): string {
  for (const sel of SELECTORS) {
    const el = doc.querySelector(sel)
    const text = el?.textContent?.replace(/\s+/g, ' ').trim()
    if (text && text.length > 80) return text.slice(0, MAX)
  }
  const title = doc.querySelector('h1')?.textContent?.trim() ?? ''
  const body = doc.body?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  return `${title}\n${body}`.trim().slice(0, MAX)
}
