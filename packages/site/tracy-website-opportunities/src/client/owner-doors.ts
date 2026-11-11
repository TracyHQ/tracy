/**
 * The doors of the owner's choices on the Business facts page (#537, R14 to R16), built from the Details answer and
 * the API: each call settles, then the page reads the answer again (`refresh`) so every band shows what was saved.
 * A band switch goes through the facts door as `band_<band>` (`setFact`, the page's own call).
 */
import type { Api } from './api.ts'
import {
  type OwnerDoors,
  ownerBandsOf,
  siteSocialsOf,
  socialNetworksOf,
  uploadedMediaId
} from './owner-edits-model.ts'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})

export function ownerDoorsOf({
  api,
  id,
  body,
  setFact,
  refresh
}: {
  api: Api
  id: string
  /** The Details answer (`GET …/:id`). */
  body: unknown
  setFact: (factId: string, onSite: boolean) => Promise<boolean>
  refresh: () => Promise<void>
}): OwnerDoors {
  const settled = async (answer: { ok: boolean; code?: string }): Promise<string | null> => {
    if (!answer.ok) return answer.code ?? 'HTTP'
    await refresh()
    return null
  }
  const answer = rec(body)
  const networks = socialNetworksOf(answer.socialNetworks)
  return {
    bands: ownerBandsOf(answer.bands),
    setBand: (band, on) => setFact(`band_${band}`, on),
    setMediaHidden: async (mediaId, hidden) =>
      (await settled(await api.setMediaHidden(id, mediaId, hidden))) === null,
    setReviewHidden: async (key, hidden) =>
      (await settled(await api.setReviewHidden(id, key, hidden))) === null,
    team: async (edit) => settled(await api.setTeam(id, edit)),
    uploadTeamPhoto: async (file) => uploadedMediaId(await api.uploadMedia(id, file, 'team')),
    networks,
    socials: siteSocialsOf(rec(answer.opportunity).candidate, networks),
    setSocial: async (b) => settled(await api.setSocial(id, b))
  }
}
