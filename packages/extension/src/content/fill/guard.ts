const SUBMIT_TEXT = /\b(submit|apply now|send application|finish|complete application)\b/i

/**
 * The single chokepoint for "never auto-submit". Nothing in the fill layer may
 * click an element this returns true for — adapters do not get a say.
 */
export function isSubmitControl(el: Element): boolean {
  const tag = el.tagName
  const type = (el.getAttribute('type') ?? '').toLowerCase()

  if (tag === 'INPUT' && (type === 'submit' || type === 'image')) return true
  // A <button> with no type submits its form by default.
  if (tag === 'BUTTON' && (type === 'submit' || type === '')) return true

  return SUBMIT_TEXT.test(el.textContent ?? '')
}
