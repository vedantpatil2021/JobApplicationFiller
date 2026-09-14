/** Names that mean "trap" or "never autofill this". */
const FORBIDDEN_NAME = /honey ?pot|bot-?field|^nickname$|captcha|csrf|password|passwd|credit|card ?number|cvv|\bssn\b|social ?security|date ?of ?birth|\bdob\b/i
const FORBIDDEN_TYPE = new Set(['hidden', 'password', 'submit', 'button', 'reset', 'image'])
const TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function isFillable(el: Element, opts: { checkLayout?: boolean } = {}): boolean {
  const { checkLayout = true } = opts
  if (!TAGS.has(el.tagName)) return false

  const input = el as HTMLInputElement
  if (FORBIDDEN_TYPE.has((input.type ?? '').toLowerCase())) return false
  if (input.disabled || input.readOnly) return false
  if (el.hasAttribute('hidden')) return false
  if (el.getAttribute('aria-hidden') === 'true') return false

  // Tested per attribute, not on a joined string: FORBIDDEN_NAME anchors some
  // patterns to the whole value (^nickname$), which a joined string never matches.
  const identity = [input.name ?? '', el.id ?? '', el.getAttribute('autocomplete') ?? '']
  if (identity.some(part => FORBIDDEN_NAME.test(part.trim()))) return false

  const inline = (el as HTMLElement).style
  if (inline.display === 'none' || inline.visibility === 'hidden' || inline.opacity === '0') {
    return false
  }

  // Class-based hiding needs computed style. A document built by DOMParser has
  // no defaultView, so this is unavailable in tests and inline style is all we get.
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
    return false
  }

  // jsdom performs no layout, so tests pass checkLayout: false.
  if (checkLayout) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
  }

  return true
}
