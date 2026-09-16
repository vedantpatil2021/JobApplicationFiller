/**
 * Open/close a custom dropdown control the way a real user would — used both
 * to discover a combobox's real options (harvest/expand-combobox.ts) and to
 * actually select one at fill time (fill/setters.ts). Two real-platform
 * facts made the M4.6 version of this pass every jsdom test and still fail
 * on the real page (live-test finding, M4.9):
 *
 * 1. Real browsers never bubble the plain `focus` event — only `focusin`
 *    does. React (and most component frameworks) delegate their onFocus
 *    handling to a `focusin` listener on a root ancestor, not a `focus`
 *    listener on the element itself. A manually dispatched
 *    `new Event('focus')` is a different event type entirely and will
 *    never reach that listener, no matter what `bubbles` is set to.
 * 2. react-select — the most common multi-select widget on ATS demographic
 *    "mark all that apply" questions — opens its menu on `mousedown` of
 *    the control, not on `click` or `focus`.
 *
 * Dispatching a real `.focus()` call plus an explicit `focus`/`focusin` and
 * a full `mousedown`/`mouseup`/`click` sequence covers all three patterns
 * without needing to know which one a given widget uses. `composed: true`
 * lets the event cross into a shadow root if the widget uses one.
 */
export function openControl(el: HTMLElement): void {
  el.focus()   // real focus call — best-effort; harmless where it's a no-op
  el.dispatchEvent(new Event('focus', { bubbles: true }))
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }))
  for (const type of ['mousedown', 'mouseup', 'click'] as const) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true }))
  }
  el.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ArrowDown', bubbles: true, cancelable: true, composed: true,
  }))
}

/** Closing is best-effort tidiness — a stray open menu affects nothing downstream but looks wrong. */
export function closeControl(el: HTMLElement): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  el.blur()
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }))
}
