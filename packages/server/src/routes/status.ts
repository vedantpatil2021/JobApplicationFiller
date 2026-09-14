import { Router } from 'express'
import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { promisify } from 'node:util'
import { profilePath, resumesDir } from '../storage/paths.js'
import { RESUME_EXTENSIONS } from './resume.js'

const run = promisify(execFile)

export type ToolProbe = (bin: string) => Promise<{ installed: boolean; version: string }>

/**
 * argv array, never a shell string — see PLAN.md hard rules. A missing binary
 * rejects, which the caller turns into `installed: false`.
 */
export const probeTool: ToolProbe = async bin => {
  const { stdout } = await run(bin, ['--version'], { timeout: 5_000 })
  return { installed: true, version: stdout.trim().split('\n')[0] }
}

const ABSENT = { installed: false, version: '' }

async function safeProbe(probe: ToolProbe, bin: string) {
  try { return await probe(bin) } catch { return ABSENT }
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

export function statusRouter(dataDir: string, token: string, probe: ToolProbe = probeTool): Router {
  const r = Router()

  r.get('/status', async (_req, res) => {
    let resumeCount = 0
    try {
      resumeCount = (await readdir(resumesDir(dataDir)))
        .filter(n => RESUME_EXTENSIONS.has(extname(n).toLowerCase())).length
    } catch { /* no folder yet */ }

    const [claude, codex] = await Promise.all([
      safeProbe(probe, 'claude'),
      safeProbe(probe, 'codex'),
    ])

    res.json({
      ok: true,
      dataDir,
      profileExists: await exists(profilePath(dataDir)),
      resumeCount,
      tools: { claude, codex },
    })
  })

  // Already behind requireToken: only a caller who has the token can read it.
  r.get('/pairing', (_req, res) => {
    res.json({ token, serverUrl: 'http://127.0.0.1:4321' })
  })

  return r
}
