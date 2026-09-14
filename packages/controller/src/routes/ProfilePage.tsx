import { useEffect, useRef, useState } from 'react'
import { SOURCE_ATTRIBUTION_DEFAULT, type Profile } from '@jaf/shared'
import { getProfile, importProfileYaml, putProfile } from '../lib/api.js'
import { PersonalInformation } from '../components/profile/PersonalInformation.js'
import { WorkExperienceList } from '../components/profile/WorkExperienceList.js'
import { WorkAuthorization } from '../components/profile/WorkAuthorization.js'
import { GovernmentCompliance } from '../components/profile/GovernmentCompliance.js'
import { ESignature } from '../components/profile/ESignature.js'
import { Consents } from '../components/profile/Consents.js'
import { SourceAttribution } from '../components/profile/SourceAttribution.js'
import { VoluntaryDemographics } from '../components/profile/VoluntaryDemographics.js'

/** Local calendar date as YYYY-MM-DD (matches e_signature.date schema). */
function localDateToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function profileWithLoadDefaults(profile: Profile): Profile {
  const today = localDateToday()
  const source = profile.applicant_profile.source_attribution
  const hearAbout = source.how_did_you_hear_about_us.trim() === ''
    ? SOURCE_ATTRIBUTION_DEFAULT
    : source.how_did_you_hear_about_us
  return {
    ...profile,
    applicant_profile: {
      ...profile.applicant_profile,
      e_signature: { ...profile.applicant_profile.e_signature, date: today },
      source_attribution: { ...source, how_did_you_hear_about_us: hearAbout },
    },
  }
}

export function ProfilePage({ onChange }: { onChange?: () => void } = {}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState('')
  const [importError, setImportError] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getProfile()
      .then(p => { setProfile(profileWithLoadDefaults(p)); onChange?.() })
      .catch(e => setStatus(e.message))
  }, [])
  if (!profile) return <p className="p-8 text-sm">{status || 'Loading…'}</p>

  const ap = profile.applicant_profile
  const set = <K extends keyof typeof ap>(k: K, v: (typeof ap)[K]) =>
    setProfile({ ...profile, applicant_profile: { ...ap, [k]: v } })

  const save = async () => {
    setStatus('Saving…')
    setImportError('')
    try { await putProfile(profile); setStatus('Saved'); onChange?.() }
    catch (e) { setStatus((e as Error).message) }
  }

  const onImportPick = async (file: File | undefined) => {
    if (!file) return
    setImportError('')

    const hasData = profile.applicant_profile.personal_information.first_name.trim() !== ''
    if (hasData && !window.confirm('Importing will replace your current profile. Continue?')) return

    setImportBusy(true)
    setStatus('Importing…')
    try {
      const imported = await importProfileYaml(file)
      setProfile(profileWithLoadDefaults(imported))
      setStatus('Imported')
      onChange?.()
    } catch (e) {
      setStatus('')
      setImportError((e as Error).message)
    } finally {
      setImportBusy(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">{status}</span>
          <input
            ref={importInputRef}
            type="file"
            accept=".yaml,.yml"
            className="hidden"
            disabled={importBusy}
            onChange={e => void onImportPick(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={importBusy}
            onClick={() => importInputRef.current?.click()}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-900 disabled:opacity-50"
          >
            Import YAML
          </button>
          <button onClick={save} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">Save</button>
        </div>
      </header>

      {importError && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{importError}</p>
      )}

      <PersonalInformation   value={ap.personal_information}   onChange={v => set('personal_information', v)} />
      <WorkExperienceList    value={ap.work_experience}        onChange={v => set('work_experience', v)} />
      <WorkAuthorization     value={ap.work_authorization}     onChange={v => set('work_authorization', v)} />
      <GovernmentCompliance  value={ap.government_compliance}  onChange={v => set('government_compliance', v)} />
      <ESignature            value={ap.e_signature}            onChange={v => set('e_signature', v)} />
      <Consents              value={ap.consents}               onChange={v => set('consents', v)} />
      <SourceAttribution     value={ap.source_attribution}     onChange={v => set('source_attribution', v)} />
      <VoluntaryDemographics value={ap.voluntary_demographics} onChange={v => set('voluntary_demographics', v)} />
    </div>
  )
}
