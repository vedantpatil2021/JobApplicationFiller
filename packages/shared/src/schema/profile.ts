import { z } from 'zod'

const str = () => z.string().default('')
const bool = (d: boolean) => z.boolean().default(d)

/** Empty string is allowed so a half-filled profile still persists. */
const emailish = z.union([z.string().email(), z.literal('')]).default('')

export const AddressSchema = z.object({
  street: str(), city: str(), state: str(),
  postal_code: str(), country: str(),
}).default({})

export const PersonalInformationSchema = z.object({
  first_name: str(), last_name: str(),
  email: emailish, phone_number: str(),
  address: AddressSchema,
  linkedin_url: str(), portfolio_url: str(),
}).default({})

export const WorkExperienceSchema = z.object({
  job_title: str(), company_name: str(), location: str(),
  start_date: str(),          // YYYY-MM
  end_date: str(),            // YYYY-MM or "Present"
  is_current_role: bool(false),
  description: str(),
})

export const WorkAuthorizationSchema = z.object({
  authorized_to_work_in_country: bool(true),
  requires_sponsorship_now_or_future: bool(false),
  visa_status: str(),
}).default({})

export const GovernmentComplianceSchema = z.object({
  not_applicable: bool(false),
  is_former_government_employee: bool(false),
  clearance_level: str(),
  export_control_status: str(),
}).default({})

export const ESignatureSchema = z.object({
  full_name: str(),
  date: str(),                // YYYY-MM-DD
  attestation_agreed: bool(true),
}).default({})

export const ConsentsSchema = z.object({
  agree_to_privacy_policy: bool(true),
  agree_to_terms_and_conditions: bool(true),
  opt_in_talent_community: bool(false),
  opt_in_sms_notifications: bool(false),
}).default({})

/** Preset values for "How did you hear about us?" — first entry is the fill default. */
export const SOURCE_ATTRIBUTION_PRESETS = [
  'Company career page',
  'LinkedIn',
  'Indeed',
  'Referral',
  'Job board',
] as const

export const SOURCE_ATTRIBUTION_DEFAULT = SOURCE_ATTRIBUTION_PRESETS[0]

export const SourceAttributionSchema = z.object({
  // Empty strings in saved YAML backfill to the default on read.
  how_did_you_hear_about_us: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().default(SOURCE_ATTRIBUTION_DEFAULT),
  ),
}).default({})

/** Preset values for voluntary EEO demographics — aligned with common Greenhouse/Lever forms. */
export const GENDER_IDENTITY_PRESETS = [
  'Woman',
  'Man',
  'Non-binary',
  'Prefer not to say',
] as const

export const TRANSGENDER_STATUS_PRESETS = [
  'Yes',
  'No',
  'Prefer not to say',
] as const

export const RACE_ETHNICITY_PRESETS = [
  'American Indian or Alaska Native',
  'Asian',
  'Black or African American',
  'Hispanic or Latino',
  'Native Hawaiian or Other Pacific Islander',
  'White',
  'Two or more races',
  'Prefer not to say',
] as const

export const SEXUAL_ORIENTATION_PRESETS = [
  'Heterosexual / Straight',
  'Gay or Lesbian',
  'Bisexual',
  'Asexual',
  'Another orientation',
  'Prefer not to say',
] as const

export const VETERAN_STATUS_PRESETS = [
  'I am a protected veteran',
  'I am not a protected veteran',
  'Prefer not to say',
] as const

export const DISABILITY_STATUS_PRESETS = [
  'Yes, I have a disability (or had one in the past)',
  'No, I do not have a disability',
  'Prefer not to say',
] as const

/** Shown in the controller when a stored value is not a known preset. */
export const VOLUNTARY_DEMOGRAPHICS_OTHER = 'Other'

/**
 * Sensitive. `opt_in` gates whether the extension is allowed to fill any of
 * these fields — see spec §4 edge case 3. Defaults to false deliberately.
 */
export const VoluntaryDemographicsSchema = z.object({
  opt_in: bool(false),
  gender_identity: str(),
  transgender_status: str(),
  race_ethnicity: str(),
  sexual_orientation: str(),
  veteran_status: str(),
  disability_status: str(),
}).default({})

export const ApplicantProfileSchema = z.object({
  personal_information: PersonalInformationSchema,
  work_experience: z.array(WorkExperienceSchema).default([]),
  work_authorization: WorkAuthorizationSchema,
  government_compliance: GovernmentComplianceSchema,
  e_signature: ESignatureSchema,
  consents: ConsentsSchema,
  source_attribution: SourceAttributionSchema,
  voluntary_demographics: VoluntaryDemographicsSchema,
}).default({})

export const ProfileSchema = z.object({
  version: z.literal(1).default(1),
  applicant_profile: ApplicantProfileSchema,
})

export type Profile = z.infer<typeof ProfileSchema>
export type WorkExperience = z.infer<typeof WorkExperienceSchema>

export function emptyProfile(): Profile {
  return ProfileSchema.parse({})
}
