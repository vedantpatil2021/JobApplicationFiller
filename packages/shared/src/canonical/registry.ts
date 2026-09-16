import type { Profile } from '../schema/profile.js'
import type { FieldKind } from '../schema/field.js'

export interface CanonicalField {
  key: string
  /** Dot path inside `applicant_profile`. Empty for virtual fields. */
  path: string
  synonyms: string[]
  /** Virtual fields carry no profile value; a strategy handles them (e.g. resume upload). */
  virtual?: boolean
  /** HTML autocomplete tokens that identify this field outright. */
  autocomplete?: string[]
  kinds: FieldKind[]
  /** Sensitive fields are gated behind an explicit opt-in. */
  sensitive?: boolean
}

/** Booleans surface as Yes/No because forms ask them as questions. */
export function valueAtPath(profile: Profile, path: string): string {
  let node: unknown = profile.applicant_profile
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') {
      throw new Error(`path does not resolve: ${path}`)
    }
    node = (node as Record<string, unknown>)[part]
  }
  if (node === undefined) throw new Error(`path does not resolve: ${path}`)
  if (typeof node === 'boolean') return node ? 'Yes' : 'No'
  return String(node ?? '')
}

export const CANONICAL_FIELDS: CanonicalField[] = [
  { key: 'first_name', path: 'personal_information.first_name',
    synonyms: ['first name', 'given name', 'forename', 'fname'],
    autocomplete: ['given-name'], kinds: ['text'] },
  { key: 'last_name', path: 'personal_information.last_name',
    synonyms: ['last name', 'family name', 'surname', 'lname'],
    autocomplete: ['family-name'], kinds: ['text'] },
  { key: 'full_name', path: 'e_signature.full_name',
    synonyms: ['full name', 'your name', 'name', 'legal name'],
    autocomplete: ['name'], kinds: ['text'] },
  { key: 'email', path: 'personal_information.email',
    synonyms: ['email', 'e-mail', 'email address'],
    autocomplete: ['email'], kinds: ['text'] },
  { key: 'phone', path: 'personal_information.phone_number',
    synonyms: ['phone', 'telephone', 'mobile', 'phone number', 'cell'],
    autocomplete: ['tel'], kinds: ['text'] },
  { key: 'street', path: 'personal_information.address.street',
    synonyms: ['street', 'address', 'address line 1', 'street address'],
    autocomplete: ['address-line1', 'street-address'], kinds: ['text'] },
  { key: 'city', path: 'personal_information.address.city',
    synonyms: ['city', 'town', 'locality'],
    autocomplete: ['address-level2'], kinds: ['text', 'combobox'] },
  { key: 'state', path: 'personal_information.address.state',
    synonyms: ['state', 'province', 'region', 'county'],
    autocomplete: ['address-level1'], kinds: ['text', 'select', 'combobox'] },
  { key: 'postal_code', path: 'personal_information.address.postal_code',
    synonyms: ['postal code', 'zip', 'zip code', 'postcode'],
    autocomplete: ['postal-code'], kinds: ['text'] },
  { key: 'country', path: 'personal_information.address.country',
    synonyms: ['country', 'country/region'],
    autocomplete: ['country', 'country-name'], kinds: ['text', 'select', 'combobox'] },
  { key: 'linkedin', path: 'personal_information.linkedin_url',
    synonyms: ['linkedin', 'linkedin url', 'linkedin profile'], kinds: ['text'] },
  { key: 'portfolio', path: 'personal_information.portfolio_url',
    synonyms: ['portfolio', 'website', 'personal site', 'github', 'portfolio url'],
    autocomplete: ['url'], kinds: ['text'] },

  { key: 'work_authorized', path: 'work_authorization.authorized_to_work_in_country',
    synonyms: ['authorized to work', 'legally authorized', 'work authorization',
               'eligible to work', 'right to work'],
    kinds: ['select', 'radio', 'checkbox', 'combobox'] },
  { key: 'requires_sponsorship', path: 'work_authorization.requires_sponsorship_now_or_future',
    synonyms: ['sponsorship', 'require sponsorship', 'visa sponsorship',
               'now or in the future require'],
    kinds: ['select', 'radio', 'checkbox', 'combobox'] },
  { key: 'visa_status', path: 'work_authorization.visa_status',
    synonyms: ['visa status', 'work visa', 'immigration status'],
    kinds: ['text', 'select', 'combobox'] },

  { key: 'former_gov_employee', path: 'government_compliance.is_former_government_employee',
    synonyms: ['former government employee', 'government employee'],
    kinds: ['select', 'radio', 'checkbox'] },
  { key: 'clearance', path: 'government_compliance.clearance_level',
    synonyms: ['security clearance', 'clearance level', 'clearance'],
    kinds: ['text', 'select', 'combobox'] },
  { key: 'export_control', path: 'government_compliance.export_control_status',
    synonyms: ['export control', 'itar', 'ear'], kinds: ['text', 'select'] },

  { key: 'signature', path: 'e_signature.full_name',
    synonyms: ['signature', 'e-signature', 'sign here', 'type your name'], kinds: ['text'] },
  { key: 'signature_date', path: 'e_signature.date',
    synonyms: ['date', "today's date", 'signature date'], kinds: ['text', 'date'] },

  { key: 'source', path: 'source_attribution.how_did_you_hear_about_us',
    synonyms: ['how did you hear', 'referral source', 'where did you hear', 'source'],
    kinds: ['text', 'select', 'combobox'] },

  { key: 'gender', path: 'voluntary_demographics.gender_identity',
    synonyms: ['gender', 'gender identity'], kinds: ['select', 'radio', 'combobox'], sensitive: true },
  { key: 'transgender', path: 'voluntary_demographics.transgender_status',
    synonyms: ['transgender'], kinds: ['select', 'radio', 'combobox'], sensitive: true },
  { key: 'race', path: 'voluntary_demographics.race_ethnicity',
    // Real ATS wording varies between noun and adjective forms — "race/
    // ethnicity" shares no substring with "racial/ethnic identity" at all.
    synonyms: ['race', 'ethnicity', 'race/ethnicity', 'racial', 'ethnic',
               'racial/ethnic', 'racial or ethnic', 'racial and/or ethnic'],
    kinds: ['select', 'radio', 'combobox'], sensitive: true },
  { key: 'sexual_orientation', path: 'voluntary_demographics.sexual_orientation',
    synonyms: ['sexual orientation'], kinds: ['select', 'radio', 'combobox'], sensitive: true },
  { key: 'veteran', path: 'voluntary_demographics.veteran_status',
    synonyms: ['veteran', 'veteran status', 'protected veteran'],
    kinds: ['select', 'radio', 'combobox'], sensitive: true },
  { key: 'disability', path: 'voluntary_demographics.disability_status',
    synonyms: ['disability', 'disability status'], kinds: ['select', 'radio', 'combobox'], sensitive: true },

  { key: 'contact_future_opportunities', path: 'consents.opt_in_talent_community',
    synonyms: ['contacted about future', 'future opportunities', 'talent community',
               'stay in touch', 'future roles'],
    kinds: ['select', 'radio', 'checkbox', 'combobox'] },

  // Virtual: the file strategy handles this, there is no string to write.
  { key: 'resume', path: '', virtual: true,
    synonyms: ['resume', 'cv', 'upload resume', 'attach resume'], kinds: ['file'] },
  { key: 'cover_letter', path: '', virtual: true,
    synonyms: ['cover letter', 'letter of interest'], kinds: ['file'] },
]
