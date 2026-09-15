/** Minimal path helpers — no node:path in the extension bundle. */
export function extname(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i) : ''
}
