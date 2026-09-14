import { join } from 'node:path'

export const profilePath = (dir: string) => join(dir, 'profile.yaml')
export const resumesDir  = (dir: string) => join(dir, 'resumes')
export const tokenPath   = (dir: string) => join(dir, '.token')
export const answersPath = (dir: string) => join(dir, 'answers.json')
export const appsPath    = (dir: string) => join(dir, 'applications.json')
