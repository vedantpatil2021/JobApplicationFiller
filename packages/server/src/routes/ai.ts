import { Router } from 'express'
import { MapFieldsRequestSchema } from '@jaf/shared'
import { mapFields } from '../ai/provider.js'

export function aiRouter(dataDir: string): Router {
  const r = Router()

  r.post('/ai/map-fields', async (req, res) => {
    const parsed = MapFieldsRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request', issues: parsed.error.issues })
      return
    }

    const result = await mapFields(dataDir, parsed.data)
    res.json(result)
  })

  return r
}
