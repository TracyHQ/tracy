/**
 * What the brief reads of the saved profile (`saved-profile.mjs`, #537 R18) besides its facts (pure): the team with the
 * owner's names, roles, photos and added people, the social links the owner typed, and Google's facts of the business
 * as the brief's Google section states them. The brief takes these from the saved profile, never from the picks.
 */
import { EMPTY_READING } from './owner-site-picks.mjs'

const list = (v) => (Array.isArray(v) ? v : [])
const ownerOff = (f) => f?.decidedBy === 'owner' && f.onSite === false

/**
 * A reading with the saved profile's team laid on: a person research read takes the owner's name and role
 * (`researchLabel` keeps the label read) and photo; the people the owner added follow, unless switched off, each
 * `{id, label, role?, source: {kind: 'owner'}, owner: true, reviewsOnly: false, photoMediaId?}`. A reading of
 * `method: 'owner'` stands for none when research read no reading but the owner added people.
 */
export function readingWithSavedTeam(reading, saved) {
  const people = list(saved?.people)
  const added = people.filter((f) => f.addedByOwner && typeof f.teamMemberId === 'string' && !ownerOff(f))
  if (!reading && !added.length) return reading ?? null
  const base = reading ?? EMPTY_READING
  const byMember = new Map(
    people
      .filter((f) => !f.addedByOwner && typeof f.teamMemberId === 'string')
      .map((f) => [f.teamMemberId, f])
  )
  const team = list(base.team).map((p) => {
    const f = byMember.get(p?.id)
    const photo = typeof f?.photoMediaId === 'string' ? f.photoMediaId : null
    if (!f || (!f.editedByOwner && !photo)) return p
    const out = { ...p, researchLabel: p.label }
    if (f.editedByOwner && typeof f.value?.name === 'string') {
      out.label = f.value.name
      if (f.value.role) out.role = f.value.role
      else delete out.role
    }
    if (photo) out.photoMediaId = photo
    return out
  })
  for (const f of added)
    team.push({
      id: f.teamMemberId,
      label: f.value.name,
      ...(f.value.role ? { role: f.value.role } : {}),
      source: { kind: 'owner' },
      owner: true,
      reviewsOnly: false,
      ...(typeof f.photoMediaId === 'string' ? { photoMediaId: f.photoMediaId } : {})
    })
  return { ...base, team }
}

/** Every photo id the saved profile gives a person of the team. */
export const savedTeamPhotoIdsOf = (saved) =>
  new Set(
    list(saved?.people)
      .map((f) => f.photoMediaId)
      .filter((id) => typeof id === 'string')
  )

/**
 * The social links the owner typed for the site, on the site (`{[network]: url}`), and the label of an `other` one.
 * A link the owner switched off through the facts door stays off.
 */
export function savedSiteSocialsOf(saved) {
  const links = list(saved?.links).filter(
    (l) => l.siteSocial && !ownerOff(l) && typeof l.value?.url === 'string'
  )
  const other = links.find((l) => l.value.kind === 'other')
  return {
    socials: Object.fromEntries(links.map((l) => [l.value.kind, l.value.url])),
    otherLabel: typeof other?.value?.label === 'string' ? other.value.label : null
  }
}

/**
 * The value of one of Google's facts of the business (`amenities`, `reservable`, `editorialSummary`) as the site may
 * state it: `{value}` when its fact is on the site (the owner's value when edited), `{off: true}` when it is off, null
 * when the profile holds no such fact (a profile made before it was one: the brief reads Google's own field then).
 * @param {any} saved @param {string} key @param {Map<string, {onSite: boolean}>} decisions
 */
export function businessFactOnSite(saved, key, decisions) {
  const fact = saved?.business?.[key]
  if (!fact || !('value' in fact)) return null
  const onSite = ownerOff(fact)
    ? false
    : fact.decidedBy === 'owner'
      ? true
      : (decisions?.get?.(fact.id)?.onSite ?? true)
  return onSite ? { value: fact.value } : { off: true }
}
