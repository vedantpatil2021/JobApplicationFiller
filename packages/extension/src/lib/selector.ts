/**
 * Escape a value for use inside a *quoted* attribute selector — `[name="…"]`.
 * jsdom does not implement `CSS.escape`, so the harvest and fill code cannot
 * rely on it, and a quoted attribute value only needs these two characters.
 * Quoted selectors are used everywhere in preference to `#id`, which would
 * additionally need a leading digit escaped.
 */
export function escapeAttrValue(value: string): string {
  return value.replace(/["\\]/g, ch => `\\${ch}`)
}
