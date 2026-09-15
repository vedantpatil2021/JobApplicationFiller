/** Attach a File to an input[type=file] — the only way browsers allow programmatic upload. */
export function attachFile(input: HTMLInputElement, file: File): boolean {
  try {
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return input.files.length > 0
  } catch {
    return false
  }
}
