import { z } from 'zod'
import { ProfileSchema } from './profile.js'

export const FieldDescriptorSchema = z.object({
  ref: z.string(),
  kind: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox', 'file', 'date', 'combobox']),
  label: z.string(),
  name: z.string().nullable(),
  id: z.string().nullable(),
  placeholder: z.string().nullable(),
  ariaLabel: z.string().nullable(),
  autocomplete: z.string().nullable(),
  options: z.array(z.string()),
  required: z.boolean(),
  maxLength: z.number().nullable(),
  sectionIndex: z.number(),
  nearbyText: z.string(),
})

export const MapFieldsRequestSchema = z.object({
  fields: z.array(FieldDescriptorSchema),
  profile: ProfileSchema,
  jobDescription: z.string().max(16_000).default(''),
})

export const FieldAnswerSchema = z.object({
  ref: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['ai', 'cache']),
})

export const MapFieldsResponseSchema = z.object({
  answers: z.array(FieldAnswerSchema),
  error: z.string().optional(),
})

export type MapFieldsRequest = z.infer<typeof MapFieldsRequestSchema>
export type FieldAnswer = z.infer<typeof FieldAnswerSchema>
export type MapFieldsResponse = z.infer<typeof MapFieldsResponseSchema>

/** Spec §3.3: below this, leave the field blank for manual review. */
export const AI_FILL_THRESHOLD = 0.6
