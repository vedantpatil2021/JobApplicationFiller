import { defineManifest } from '@crxjs/vite-plugin'

const ICONS = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' }

export default defineManifest({
  manifest_version: 3,
  name: 'Job Application Filler',
  version: '0.1.0',
  icons: ICONS,
  permissions: ['storage', 'activeTab', 'scripting', 'alarms'],
  host_permissions: ['http://127.0.0.1:4321/*'],
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  options_page: 'src/options/index.html',
  action: { default_title: 'Job Application Filler', default_icon: ICONS },
  // The Fill button's icon renders inside the content-script widget, which
  // lives in the host page's own document — Chrome blocks a page from
  // loading chrome-extension:// resources unless explicitly allowed here.
  web_accessible_resources: [{ resources: ['icons/*.png'], matches: ['<all_urls>'] }],
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['src/content/index.ts'],
    // Greenhouse and iCIMS render their forms inside iframes.
    all_frames: true,
    run_at: 'document_idle',
  }],
})
