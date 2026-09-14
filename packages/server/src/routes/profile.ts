import express, { Router } from 'express'
import multer from 'multer'
import { load } from 'js-yaml'
import { ProfileSchema, type Profile } from '@jaf/shared'
import { readProfile, writeProfile } from '../storage/yaml-store.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } })

function parseProfileYaml(raw: string): { ok: true; profile: Profile } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = load(raw)
  } catch (e) {
    return { ok: false, error: `not valid YAML: ${(e as Error).message}` }
  }

  const result = ProfileSchema.safeParse(parsed ?? {})
  if (!result.success) {
    return { ok: false, error: 'validation failed — check that all fields match the profile schema' }
  }
  return { ok: true, profile: result.data }
}

export function profileRouter(dataDir: string): Router {
  const r = Router()

  r.get('/profile', async (_req, res) => {
    try {
      res.json(await readProfile(dataDir))
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  r.put('/profile', async (req, res) => {
    const parsed = ProfileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'validation failed', issues: parsed.error.issues })
      return
    }
    try {
      await writeProfile(dataDir, parsed.data)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  r.post('/profile/import', (req, res, next) => {
    const ct = req.headers['content-type'] ?? ''
    if (ct.includes('multipart/form-data')) {
      upload.single('file')(req, res, (err: unknown) => {
        if (err) {
          const tooBig = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          res.status(400).json({ error: tooBig ? 'file too large (max 2 MB)' : 'invalid upload' })
          return
        }
        next()
      })
      return
    }
    express.text({
      type: ['text/yaml', 'application/x-yaml', 'text/plain', 'application/octet-stream'],
      limit: '2mb',
    })(req, res, next)
  }, async (req, res) => {
    let raw: string | undefined
    if (req.file) {
      raw = req.file.buffer.toString('utf8')
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      raw = req.body
    }

    if (!raw) {
      res.status(400).json({ error: 'no YAML provided — upload a .yaml file or send YAML as the request body' })
      return
    }

    const parsed = parseProfileYaml(raw)
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error })
      return
    }

    try {
      await writeProfile(dataDir, parsed.profile)
      res.json(parsed.profile)
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  return r
}
