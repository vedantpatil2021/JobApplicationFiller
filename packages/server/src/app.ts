import express from 'express'
import cors from 'cors'
import { requireToken } from './auth.js'
import { healthRouter } from './routes/health.js'
import { profileRouter } from './routes/profile.js'
import { resumeRouter } from './routes/resume.js'
import { statusRouter } from './routes/status.js'
import { aiRouter } from './routes/ai.js'

export interface AppOptions { dataDir: string; token: string }

/** Only these origins may talk to the server. Everything else is refused. */
const ALLOWED_ORIGIN = /^(http:\/\/(localhost|127\.0\.0\.1):5173|chrome-extension:\/\/[a-p]{32})$/

export function createApp(opts: AppOptions): express.Express {
  const app = express()

  app.use(cors({
    origin: (origin, cb) => {
      // No Origin header = same-process tooling such as Supertest or curl.
      if (!origin) return cb(null, true)
      cb(null, ALLOWED_ORIGIN.test(origin))
    },
    allowedHeaders: ['Content-Type', 'X-JAF-Token'],
  }))
  app.use(express.json({ limit: '2mb' }))

  app.use('/api', requireToken(opts.token))
  app.use('/api', healthRouter())
  app.use('/api', profileRouter(opts.dataDir))
  app.use('/api', resumeRouter(opts.dataDir))
  app.use('/api', statusRouter(opts.dataDir, opts.token))
  app.use('/api', aiRouter(opts.dataDir))

  return app
}
