import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Job Application Filler',
  version: '0.1.0',
  permissions: ['storage', 'activeTab', 'scripting', 'alarms'],
  host_permissions: ['http://127.0.0.1:4321/*'],
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  options_page: 'src/options/index.html',
  action: { default_title: 'Job Application Filler' },
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['src/content/index.ts'],
    // Greenhouse and iCIMS render their forms inside iframes.
    all_frames: true,
    run_at: 'document_idle',
  }],
})
