import { syncProfile } from '../lib/sync.js'

const SYNC_ALARM = 'jaf.sync'

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 })
  void syncProfile()
})
chrome.alarms.onAlarm.addListener(a => { if (a.name === SYNC_ALARM) void syncProfile() })

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'jaf.sync') {
    syncProfile().then(sendResponse)
    return true   // keep the channel open for the async reply
  }
  return false
})
