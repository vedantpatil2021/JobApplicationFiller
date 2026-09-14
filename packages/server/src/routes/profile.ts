import { Router } from 'express'
import { ProfileSchema } from '@jaf/shared'
import { readProfile, writeProfile } from '../storage/yaml-store.js'

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

  return r
}
