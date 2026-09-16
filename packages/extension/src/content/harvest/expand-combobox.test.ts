import { describe, it, expect } from 'vitest'
import { collectFields } from './collect.js'
import { expandComboboxes } from './expand-combobox.js'

describe('expandComboboxes', () => {
  it('discovers options that only render after the control is focused', async () => {
    const doc = new DOMParser().parseFromString(`<body>
      <label for="src">How did you hear about us?</label>
      <input id="src" role="combobox" aria-controls="src-list" aria-expanded="false">
    </body>`, 'text/html')

    doc.getElementById('src')!.addEventListener('focus', () => {
      const list = doc.createElement('ul')
      list.id = 'src-list'
      list.setAttribute('role', 'listbox')
      list.innerHTML = '<li role="option">LinkedIn</li><li role="option">Company website</li>'
      doc.body.appendChild(list)
    })

    const fields = collectFields(doc, { checkLayout: false })
    expect(fields[0].descriptor.options).toEqual([])   // nothing rendered yet at harvest time

    await expandComboboxes(fields, 100)

    expect(fields[0].descriptor.options).toEqual(['LinkedIn', 'Company website'])
  })

  it('leaves options empty when nothing renders before the timeout', async () => {
    const doc = new DOMParser().parseFromString(`<body>
      <label for="q">Anything else?</label>
      <input id="q" role="combobox" aria-controls="never-appears">
    </body>`, 'text/html')

    const fields = collectFields(doc, { checkLayout: false })
    await expandComboboxes(fields, 50)

    expect(fields[0].descriptor.options).toEqual([])
  })

  it('never probes a combobox that already has options from a datalist', async () => {
    const doc = new DOMParser().parseFromString(`<body>
      <label for="c">Country</label>
      <input id="c" list="countries">
      <datalist id="countries"><option>India</option><option>USA</option></datalist>
    </body>`, 'text/html')

    let focused = false
    doc.getElementById('c')!.addEventListener('focus', () => { focused = true })

    const fields = collectFields(doc, { checkLayout: false })
    expect(fields[0].descriptor.options).toEqual(['India', 'USA'])

    await expandComboboxes(fields, 50)
    expect(focused).toBe(false)
  })

  it('restores focus state, leaving nothing typed for a probe that finds no listbox', async () => {
    const doc = new DOMParser().parseFromString(`<body>
      <label for="q">Anything else?</label>
      <input id="q" role="combobox" aria-controls="never-appears">
    </body>`, 'text/html')
    const input = doc.getElementById('q') as HTMLInputElement

    const fields = collectFields(doc, { checkLayout: false })
    await expandComboboxes(fields, 50)

    expect(input.value).toBe('')   // never typed into — only focus/click were dispatched
  })

  it('opens a menu wired to a delegated focusin listener — the React pattern', () => {
    // React never listens for the plain "focus" event, because real browsers
    // never bubble it — it listens for the bubbling "focusin" event at a
    // delegated root instead. A manually dispatched `new Event('focus')`
    // is a different event type entirely and will never satisfy a
    // `focusin` listener, no matter what `bubbles` is set to. This is the
    // live-test finding (M4.9): the multi-select "mark all that apply"
    // question's menu never opened, so options stayed empty and the real
    // answer got typed as loose text instead of a real selection.
    const doc = new DOMParser().parseFromString(`<body>
      <div id="wrapper">
        <label for="src">How did you hear about CodePath?</label>
        <input id="src" role="combobox" aria-controls="src-list">
      </div>
    </body>`, 'text/html')

    let opened = false
    doc.getElementById('wrapper')!.addEventListener('focusin', () => {
      opened = true
      const list = doc.createElement('ul')
      list.id = 'src-list'
      list.setAttribute('role', 'listbox')
      list.innerHTML = '<li role="option">Company career page</li>'
      doc.body.appendChild(list)
    })

    const fields = collectFields(doc, { checkLayout: false })
    void expandComboboxes(fields, 100)

    expect(opened).toBe(true)
  })

  it('opens a menu wired to a delegated mousedown listener — the react-select pattern', () => {
    // react-select's Control toggles its menu open on mousedown of the
    // control, not on click or focus — a common pattern this codebase
    // never simulated in a test before landing the M4.6 combobox fix, which
    // is exactly why it passed jsdom tests but failed on the real page.
    const doc = new DOMParser().parseFromString(`<body>
      <div id="control" class="select__control">
        <label for="src">How did you hear about CodePath?</label>
        <input id="src" role="combobox" aria-controls="src-list">
      </div>
    </body>`, 'text/html')

    let opened = false
    doc.getElementById('control')!.addEventListener('mousedown', () => {
      opened = true
      const list = doc.createElement('ul')
      list.id = 'src-list'
      list.setAttribute('role', 'listbox')
      list.innerHTML = '<li role="option">Company career page</li>'
      doc.body.appendChild(list)
    })

    const fields = collectFields(doc, { checkLayout: false })
    void expandComboboxes(fields, 100)

    expect(opened).toBe(true)
  })

  it('opens a menu from ArrowDown when pointer events are rejected', () => {
    const doc = new DOMParser().parseFromString(`<body>
      <label for="src">How did you hear about CodePath?</label>
      <input id="src" role="combobox">
    </body>`, 'text/html')

    let opened = false
    doc.getElementById('src')!.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') opened = true
    })

    const fields = collectFields(doc, { checkLayout: false })
    void expandComboboxes(fields, 100)

    expect(opened).toBe(true)
  })
})
