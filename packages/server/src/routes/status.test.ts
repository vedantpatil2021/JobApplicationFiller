import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.js'

let dir: string
const TOKEN = 'test-token'
const app = () => createApp({ dataDir: dir, token: TOKEN })
const auth = (r: request.Test) => r.set('X-JAF-Token', TOKEN)

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'jaf-status-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('GET /api/status', () => {
  it('reports no profile and no resumes on a fresh install', async () => {
    const res = await auth(request(app()).get('/api/status'))
    expect(res.status).toBe(200)
    expect(res.body.profileExists).toBe(false)
    expect(res.body.resumeCount).toBe(0)
  })

  it('reports the profile once it exists and counts resumes', async () => {
    await writeFile(join(dir, 'profile.yaml'), 'version: 1\n')
    await mkdir(join(dir, 'resumes'), { recursive: true })
    await writeFile(join(dir, 'resumes', 'cv.pdf'), 'x')
    await writeFile(join(dir, 'resumes', 'notes.txt'), 'x')

    const res = await auth(request(app()).get('/api/status'))
    expect(res.body.profileExists).toBe(true)
    expect(res.body.resumeCount).toBe(2)
  })

  it('does not count junk files in the resumes folder', async () => {
    await mkdir(join(dir, 'resumes'), { recursive: true })
    await writeFile(join(dir, 'resumes', '.DS_Store'), 'x')
    await writeFile(join(dir, 'resumes', 'cv.pdf'), 'x')

    const res = await auth(request(app()).get('/api/status'))
    expect(res.body.resumeCount).toBe(1)
  })

  it('tells the page where its data lives so the user never has to guess', async () => {
    const res = await auth(request(app()).get('/api/status'))
    expect(res.body.dataDir).toBe(dir)
  })

  it('reports which AI CLIs are installed', async () => {
    const { statusRouter } = await import('./status.js')
    const express = (await import('express')).default
    const fake = express()
    fake.use('/api', statusRouter(dir, TOKEN, async bin => ({
      installed: bin === 'claude',
      version: bin === 'claude' ? '2.1.270' : '',
    })))

    const res = await request(fake).get('/api/status')
    expect(res.body.tools.claude).toEqual({ installed: true, version: '2.1.270' })
    expect(res.body.tools.codex.installed).toBe(false)
  })

  it('still answers when a CLI probe throws, rather than 500ing the page', async () => {
    const { statusRouter } = await import('./status.js')
    const express = (await import('express')).default
    const fake = express()
    fake.use('/api', statusRouter(dir, TOKEN, async () => { throw new Error('boom') }))

    const res = await request(fake).get('/api/status')
    expect(res.status).toBe(200)
    expect(res.body.tools.claude.installed).toBe(false)
  })
})

describe('GET /api/pairing', () => {
  it('hands the page the token so the user can copy it into the extension', async () => {
    const res = await auth(request(app()).get('/api/pairing'))
    expect(res.status).toBe(200)
    expect(res.body.token).toBe(TOKEN)
    expect(res.body.serverUrl).toBe('http://127.0.0.1:4321')
  })

  it('refuses without the token — knowing it is the price of reading it', async () => {
    const res = await request(app()).get('/api/pairing')
    expect(res.status).toBe(401)
  })
})
