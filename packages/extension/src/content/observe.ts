import { detectAts } from './detect/registry.js'

/** SPA wizards change step without a navigation, so watch both the URL and the DOM. */
export function watchForChanges(onChange: () => void): void {
  let lastUrl = location.href
  let timer: number | undefined

  const fire = () => {
    clearTimeout(timer)
    timer = window.setTimeout(onChange, 300)   // let lazy fields render first
  }

  new MutationObserver(() => {
    const href = location.href
    const urlChanged = href !== lastUrl
    if (urlChanged) lastUrl = href
    // Lazy forms render after document_idle; retry once the page looks like an application.
    const needsMount = !document.getElementById('jaf-root') && detectAts(href, document) !== null
    if (urlChanged || needsMount) fire()
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
