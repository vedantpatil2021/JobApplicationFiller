import { z } from 'zod'
import type { FieldDescriptor, FieldAnswer, Profile } from '@jaf/shared'
import {
  cacheKeyForField, readAnswerCache, putCachedAnswer,
} from './cache.js'
import {
  buildMapFieldsPrompt, MAP_FIELDS_SCHEMA, MAP_FIELDS_SYSTEM,
} from './prompts/map-fields.js'
import { claudeMapFields, CliError } from './claude-cli.js'
import { codexMapFields } from './codex-cli.js'

const AiPayloadSchema = z.object({
  answers: z.array(z.object({
    ref: z.string(),
    value: z.string(),
    confidence: z.number().min(0).max(1),
  })),
})

export interface MapFieldsInput {
  fields: FieldDescriptor[]
  profile: Profile
  jobDescription: string
}

export interface MapFieldsResult {
  answers: FieldAnswer[]
  error?: string
}

async function callCli(
  fields: FieldDescriptor[],
  profile: Profile,
  jobDescription: string,
): Promise<{ ref: string; value: string; confidence: number }[]> {
  const prompt = buildMapFieldsPrompt(profile, fields, jobDescription)
  let raw: unknown
  try {
    raw = await claudeMapFields({ prompt, systemPrompt: MAP_FIELDS_SYSTEM, schema: MAP_FIELDS_SCHEMA })
  } catch (e) {
    if (e instanceof CliError && (e.code === 'auth' || e.code === 'rate_limit')) {
      raw = await codexMapFields(prompt, MAP_FIELDS_SCHEMA)
    } else {
      throw e
    }
  }
  return AiPayloadSchema.parse(raw).answers
}

/**
 * One CLI call per form (spec §3.4). Cache hits skip the model entirely.
 */
export async function mapFields(dataDir: string, input: MapFieldsInput): Promise<MapFieldsResult> {
  const { fields, profile, jobDescription } = input
  if (fields.length === 0) return { answers: [] }

  const cache = await readAnswerCache(dataDir)
  const answers: FieldAnswer[] = []
  const needAi: FieldDescriptor[] = []

  for (const d of fields) {
    const key = cacheKeyForField(d)
    const hit = cache[key]
    if (hit) {
      answers.push({ ref: d.ref, value: hit.value, confidence: hit.confidence, source: 'cache' })
    } else {
      needAi.push(d)
    }
  }

  if (needAi.length === 0) return { answers }

  try {
    const fresh = await callCli(needAi, profile, jobDescription)
    const byRef = new Map(needAi.map(d => [d.ref, d]))

    for (const a of fresh) {
      const d = byRef.get(a.ref)
      if (!d) continue
      answers.push({ ref: a.ref, value: a.value, confidence: a.confidence, source: 'ai' })
      await putCachedAnswer(dataDir, cacheKeyForField(d), a.value, a.confidence)
    }
    return { answers }
  } catch (e) {
    const msg = e instanceof CliError
      ? e.code === 'auth'
        ? 'Claude is not logged in — run `claude login` in a terminal.'
        : e.code === 'rate_limit'
          ? 'AI rate limited — try again later.'
          : e.code === 'timeout'
            ? 'AI call timed out after 60 seconds.'
            : e.message
      : (e as Error).message

    return { answers, error: msg }
  }
}
