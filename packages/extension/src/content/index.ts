import type { FillResult } from '@jaf/shared'
import { detectAts } from './detect/registry.js'
import { isWorkdaySignInGate } from './detect/signin-gate.js'
import { collectFields } from './harvest/collect.js'
import { resolveAll } from './resolve/score.js'
import { applyDecisions } from './fill/apply.js'
import { fillWithAi } from './ai-fill.js'
import { mountWidget } from './widget/mount.js'
import { watchForChanges } from './observe.js'

declare global {
  interface Window { __jafFill: () => Promise<FillResult[]> }
}

async function fill(): Promise<FillResult[]> {
  const sync = await chrome.runtime.sendMessage({ type: 'jaf.sync' })
  const profile = sync?.profile
  const online = sync?.online ?? false
  if (!profile) return []

  if (isWorkdaySignInGate(location.href, document)) {
    return [{
      ref: '__workday_gate', label: 'Workday sign-in', outcome: 'needs-user', value: '',
      confidence: 0, source: 'heuristic',
      note: 'Sign in to Workday first, then run Fill again.',
    }]
  }

  const fields = collectFields(document)
  const { decisions, unresolved } = resolveAll(fields.map(f => f.descriptor), profile)

  const results = applyDecisions(fields, decisions)
  if (unresolved.length > 0) {
    results.push(...await fillWithAi(fields, unresolved, profile, document, online))
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
