import { createHash } from 'node:crypto'
import type { FieldDescriptor } from '@jaf/shared'
import { answersPath } from '../storage/paths.js'
import { readJsonFile, writeJsonFile } from '../storage/json-store.js'

export interface CachedAnswer {
  value: string
  confidence: number
  updatedAt: number
}

export type AnswerCache = Record<string, CachedAnswer>

/** Spec §3.4: sha256(question + sorted(options)). */
export function cacheKey(label: string, options: string[]): string {
  const question = label.toLowerCase().trim()
  const opts = [...options].sort().join('|')
  return createHash('sha256').update(`${question}\0${opts}`).digest('hex')
}

export function cacheKeyForField(d: FieldDescriptor): string {
  return cacheKey(d.label || d.name || d.ref, d.options)
}

export async function readAnswerCache(dataDir: string): Promise<AnswerCache> {
  return readJsonFile<AnswerCache>(answersPath(dataDir), {})
}

export async function writeAnswerCache(dataDir: string, cache: AnswerCache): Promise<void> {
  await writeJsonFile(answersPath(dataDir), cache)
}

export async function putCachedAnswer(
  dataDir: string,
  key: string,
  value: string,
  confidence: number,
): Promise<void> {
  const cache = await readAnswerCache(dataDir)
  cache[key] = { value, confidence, updatedAt: Date.now() }
  await writeAnswerCache(dataDir, cache)
}
