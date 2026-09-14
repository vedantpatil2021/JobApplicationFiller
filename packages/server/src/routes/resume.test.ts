import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { createApp } from '../app.js'

let dir: string
let app: ReturnType<typeof createApp>
const TOKEN = 'secret'
const auth = (r: request.Test) => r.set('X-JAF-Token', TOKEN)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'jaf-'))
  app = createApp({ dataDir: dir, token: TOKEN })
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('resumes', () => {
  it('starts empty', async () => {
    const res = await auth(request(app).get('/api/resumes')).expect(200)
    expect(res.body.resumes).toEqual([])
  })

  it('uploads a file and then lists it', async () => {
    await auth(request(app).post('/api/resumes'))
      .attach('file', Buffer.from('%PDF-1.4 fake'), 'ada.pdf')
      .expect(200)

    const res = await auth(request(app).get('/api/resumes')).expect(200)
    expect(res.body.resumes.map((r: { name: string }) => r.name)).toContain('ada.pdf')
  })

  it('serves the uploaded bytes back', async () => {
    await auth(request(app).post('/api/resumes'))
      .attach('file', Buffer.from('hello-resume'), 'ada.pdf')
      .expect(200)

    const res = await auth(request(app).get('/api/resumes/ada.pdf')).expect(200)
    expect(res.body.toString()).toContain('hello-resume')
  })

  it('refuses a path-traversal filename', async () => {
    await auth(request(app).get('/api/resumes/..%2F..%2Fprofile.yaml')).expect(400)
  })

  it('refuses a path-traversal original filename on upload', async () => {
    await auth(request(app).post('/api/resumes'))
      .attach('file', Buffer.from('x'), '../../profile.yaml')
      .expect(400)
  })

  it('refuses a disallowed extension', async () => {
    await auth(request(app).post('/api/resumes'))
      .attach('file', Buffer.from('#!/bin/sh'), 'evil.sh')
      .expect(400)
  })

  it('deletes a resume', async () => {
    await auth(request(app).post('/api/resumes'))
      .attach('file', Buffer.from('x'), 'ada.pdf').expect(200)
    await auth(request(app).delete('/api/resumes/ada.pdf')).expect(200)
    const res = await auth(request(app).get('/api/resumes')).expect(200)
    expect(res.body.resumes).toEqual([])
  })
})
