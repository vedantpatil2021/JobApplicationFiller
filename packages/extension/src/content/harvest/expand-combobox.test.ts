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
})
