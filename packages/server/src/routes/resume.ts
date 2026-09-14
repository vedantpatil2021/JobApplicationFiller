import { Router } from 'express'
import multer from 'multer'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { resumesDir } from '../storage/paths.js'

export const RESUME_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md'])

/** Strip any directory component so `../../profile.yaml` cannot escape the folder. */
function safeName(raw: string): string | null {
  const name = basename(raw)
  if (!name || name.startsWith('.') || name !== raw) return null
  if (!RESUME_EXTENSIONS.has(extname(name).toLowerCase())) return null
  return name
}

export function resumeRouter(dataDir: string): Router {
  const r = Router()
  const dir = resumesDir(dataDir)
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

  r.get('/resumes', async (_req, res) => {
    await mkdir(dir, { recursive: true })
    const names = (await readdir(dir)).filter(n => RESUME_EXTENSIONS.has(extname(n).toLowerCase()))
    const resumes = await Promise.all(names.map(async name => ({
      name, size: (await stat(join(dir, name))).size,
    })))
    res.json({ resumes })
  })

  r.post('/resumes', (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const tooBig = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        res.status(400).json({ error: tooBig ? 'file too large (max 10 MB)' : 'invalid upload' })
        return
      }
      next()
    })
  }, async (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'no file' }); return }
    const name = safeName(req.file.originalname)
    if (!name) { res.status(400).json({ error: 'bad filename or unsupported type' }); return }

    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, name), req.file.buffer)
    res.json({ ok: true, name })
  })

  r.get('/resumes/:name', (req, res) => {
    const name = safeName(req.params.name)
    if (!name) { res.status(400).json({ error: 'bad filename' }); return }
    // `root` + basename is the Express-safe way to refuse traversal even if
    // a future change loosens `safeName`.
    res.sendFile(name, { root: dir, dotfiles: 'deny' }, err => {
      if (err && !res.headersSent) res.status(404).end()
    })
  })

  r.delete('/resumes/:name', async (req, res) => {
    const name = safeName(req.params.name)
    if (!name) { res.status(400).json({ error: 'bad filename' }); return }
    try { await unlink(join(dir, name)); res.json({ ok: true }) }
    catch { res.status(404).json({ error: 'not found' }) }
  })

  return r
}
