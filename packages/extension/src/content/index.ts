import type { FillResult } from '@jaf/shared'
import { detectAts } from './detect/registry.js'
import { collectFields } from './harvest/collect.js'
import { resolveAll } from './resolve/score.js'
import { applyDecisions } from './fill/apply.js'
import { mountWidget } from './widget/mount.js'
import { watchForChanges } from './observe.js'

declare global {
  interface Window { __jafFill: () => Promise<FillResult[]> }
}

async function fill(): Promise<FillResult[]> {
  const { profile } = await chrome.runtime.sendMessage({ type: 'jaf.sync' })
  if (!profile) return []

  const fields = collectFields(document)
  const { decisions, unresolved } = resolveAll(fields.map(f => f.descriptor), profile)

  const results = applyDecisions(fields, decisions)
  // M4 sends `unresolved` to the Claude CLI; until then they are surfaced as-is.
  for (const d of unresolved) {
    results.push({ ref: d.ref, label: d.label, outcome: 'needs-user', value: '',
                   confidence: 0, source: 'heuristic', note: 'no confident match' })
  }
  return results
}

function boot(): void {
  if (!detectAts(location.href, document)) return
  window.__jafFill = fill
  mountWidget()
}

boot()
watchForChanges(boot)   // multi-step wizards re-render without a page load
