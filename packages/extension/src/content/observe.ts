/** SPA wizards change step without a navigation, so watch both the URL and the DOM. */
export function watchForChanges(onChange: () => void): void {
  let lastUrl = location.href
  let timer: number | undefined

  const fire = () => {
    clearTimeout(timer)
    timer = window.setTimeout(onChange, 300)   // let lazy fields render first
  }

  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; fire() }
  }).observe(document, { subtree: true, childList: true })

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = original.apply(this, args)
      fire()
      return r
    }
  }
  window.addEventListener('popstate', fire)
}
