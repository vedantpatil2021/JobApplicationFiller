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

export const SourceAttributionSchema = z.object({
  how_did_you_hear_about_us: str(),
}).default({})

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
