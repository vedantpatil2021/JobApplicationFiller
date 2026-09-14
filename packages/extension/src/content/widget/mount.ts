import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import css from './widget.css?inline'
import { Widget } from './Widget.js'

let root: Root | null = null

/**
 * Open shadow root with adopted styles: host CSS cannot reach in, and our
 * Tailwind cannot leak out onto the page.
 */
export function mountWidget(): void {
  if (document.getElementById('jaf-root')) return

  const host = document.createElement('div')
  host.id = 'jaf-root'
  host.style.cssText = 'position:fixed;z-index:2147483647;bottom:0;right:0;'
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  shadow.adoptedStyleSheets = [sheet]

  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)
  root = createRoot(mountPoint)
  root.render(createElement(Widget))
}
