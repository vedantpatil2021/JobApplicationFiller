import { ensureToken } from './auth.js'
import { createApp } from './app.js'
import { resolveDataDir } from './data-dir.js'

const PORT = 4321
const HOST = '127.0.0.1'   // loopback only — never 0.0.0.0

const dataDir = resolveDataDir()
const token = await ensureToken(dataDir)

createApp({ dataDir, token }).listen(PORT, HOST, () => {
  console.log(`jaf-server  http://${HOST}:${PORT}`)
  console.log(`data dir    ${dataDir}`)
  console.log(`token       ${token}`)
  console.log(`\nPaste the token into the extension options page to pair it.`)
})
