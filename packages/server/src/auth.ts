import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import { tokenPath } from './storage/paths.js'

export async function ensureToken(dir: string): Promise<string> {
  try {
    const existing = (await readFile(tokenPath(dir), 'utf8')).trim()
    if (/^[0-9a-f]{64}$/.test(existing)) return existing
  } catch { /* fall through and mint a new one */ }

  const token = randomBytes(32).toString('hex')
  await mkdir(dir, { recursive: true })
  await writeFile(tokenPath(dir), token, { encoding: 'utf8', mode: 0o600 })
  return token
}

/**
 * Any website you visit can reach 127.0.0.1. A custom header forces a CORS
 * preflight, and our CORS allowlist rejects unknown origins — so a hostile
 * page cannot even send this request.
 */
export function requireToken(expected: string): RequestHandler {
  const want = Buffer.from(expected)
  return (req, res, next) => {
    const got = Buffer.from(String(req.header('X-JAF-Token') ?? ''))
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      res.status(401).json({ error: 'bad or missing X-JAF-Token' })
      return
    }
    next()
  }
}
