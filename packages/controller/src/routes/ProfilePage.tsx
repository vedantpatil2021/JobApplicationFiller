import { useEffect, useState } from 'react'
import type { Profile } from '@jaf/shared'
import { getProfile, putProfile } from '../lib/api.js'
import { PersonalInformation } from '../components/profile/PersonalInformation.js'
import { WorkExperienceList } from '../components/profile/WorkExperienceList.js'
import { WorkAuthorization } from '../components/profile/WorkAuthorization.js'
import { GovernmentCompliance } from '../components/profile/GovernmentCompliance.js'
import { ESignature } from '../components/profile/ESignature.js'
import { Consents } from '../components/profile/Consents.js'
import { SourceAttribution } from '../components/profile/SourceAttribution.js'
import { VoluntaryDemographics } from '../components/profile/VoluntaryDemographics.js'

export function ProfilePage({ onChange }: { onChange?: () => void } = {}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    getProfile()
      .then(p => { setProfile(p); onChange?.() })
      .catch(e => setStatus(e.message))
  }, [])
  if (!profile) return <p className="p-8 text-sm">{status || 'Loading…'}</p>

  const ap = profile.applicant_profile
  const set = <K extends keyof typeof ap>(k: K, v: (typeof ap)[K]) =>
    setProfile({ ...profile, applicant_profile: { ...ap, [k]: v } })

  const save = async () => {
    setStatus('Saving…')
    try { await putProfile(profile); setStatus('Saved'); onChange?.() }
    catch (e) { setStatus((e as Error).message) }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">{status}</span>
          <button onClick={save} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">Save</button>
        </div>
      </header>

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
