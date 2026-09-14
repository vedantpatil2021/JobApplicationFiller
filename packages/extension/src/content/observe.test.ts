import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { watchForChanges } from './observe.js'

describe('watchForChanges', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    document.getElementById('jaf-root')?.remove()
  })

  it('re-runs when a lazy application form appears without a URL change', async () => {
    const onChange = vi.fn()
    watchForChanges(onChange)
    expect(onChange).not.toHaveBeenCalled()

    document.body.insertAdjacentHTML('beforeend', `
      <form>
        <input name="first_name"><input name="email">
        <input type="file" name="resume"><button>Apply</button>
      </form>`)
    await Promise.resolve()   // MutationObserver callback

    vi.advanceTimersByTime(300)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('stops re-running after the widget host is mounted', () => {
    const onChange = vi.fn()
    watchForChanges(onChange)

    const host = document.createElement('div')
    host.id = 'jaf-root'
    document.body.appendChild(host)

    document.body.insertAdjacentHTML('beforeend', '<p>more content</p>')
    vi.advanceTimersByTime(300)
    expect(onChange).not.toHaveBeenCalled()
  })
})
