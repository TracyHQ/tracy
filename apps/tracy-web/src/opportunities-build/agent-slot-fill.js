/**
 * The group plan an agent demo fills its template by (ADR 0037, 0038): when the release has `ready` slot roles (its
 * content map or `slot-roles.json`, read by `contract-slot-roles.js`), the
 * accepted place profile and, group by group, the one entity each card is locked to and what each of its slots holds.
 * Read through `demo.research` `read`: the catalogue says whether a plan exists, part `profile` carries it. Computed from
 * the frozen research on every read (deterministic), so the frozen bundle and its hash stay as they are.
 */
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { planFillOf } from '../lib/contract-slot-roles.js'
import { sidecarForTemplate } from '../lib/slot-roles-for.js'
import { placeProfileOfRevision } from './place-profile-of-revision.js'

const RULES = [
  'Each group is one card of the template (a dish, a person, a tier, a step): every slot of a group comes from its one `entityId`, never a name from one entity with a price or photo from another.',
  '`sourced`: write `value` as given (a price exactly as written). `neutral` / `empty`: write `value` (an empty slot stays empty); never replace it with words of your own, and never remove or hide the card.',
  "`neutral` words come in the plan's `locale` with their `neutralKey`: on a site in another language, write that same plain word in it, nothing more.",
  '`composed`: write it yourself from the facts in `factRefs` only (ids in `placeProfile`); a fact you cannot find there is not on the page.',
  'Only facts in `placeProfile.assessment` with status `accepted` may reach the page.'
]

/** A plan's writes as groups, each with its entity and its slots. */
function groupsOf(plan) {
  const groups = new Map()
  for (const w of plan.writes) {
    if (!groups.has(w.groupId))
      groups.set(w.groupId, { groupId: w.groupId, entityId: w.entityId ?? null, slots: [] })
    groups.get(w.groupId).slots.push({
      slotKey: w.slotKey,
      role: w.role,
      state: w.state,
      ...(w.state === 'composed' ? {} : { value: w.value }),
      ...(w.neutralKey ? { neutralKey: w.neutralKey } : {}),
      ...(w.factRefs.length ? { factRefs: w.factRefs } : {})
    })
  }
  return [...groups.values()]
}

/**
 * What a `read` of `part` adds for this revision: nothing for most parts, a summary for the catalogue, the profile and
 * the group plan for part `profile`. Never fails the read: a template without a ready sidecar answers how it stands.
 * @param {any} revision - the build's revision (`withBuildChoice`): `brief`, `cms`, `template`
 * @param {string} part
 * @param {{locale?: string, sidecarFor?: typeof sidecarForTemplate}} [options]
 * @returns {Promise<Record<string, any>>}
 */
export async function agentSlotFillOf(revision, part, { locale, sidecarFor = sidecarForTemplate } = {}) {
  if (part !== 'catalogue' && part !== 'profile') return {}
  try {
    const sidecar = sidecarFor({
      cms: revision?.cms,
      quickstart: revision?.template?.quickstart,
      version: revision?.template?.version
    })
    if (sidecar.state !== 'ready')
      return {
        slotFill: { state: `sidecar-${sidecar.state}`, note: 'No group plan: fill from the research parts.' }
      }
    const domain = await websiteOpportunitiesDomain()
    const placeProfile = placeProfileOfRevision(domain, revision)
    if (!placeProfile)
      return { slotFill: { state: 'no-profile', note: 'No group plan: fill from the research parts.' } }
    // A brief names no site language: neutral words come in English with their key unless the caller names one.
    const site = String(locale ?? 'en')
      .slice(0, 2)
      .toLowerCase()
    const plan = planFillOf(domain, sidecar, { placeProfile, locale: site })
    const groups = groupsOf(plan)
    const counts = Object.fromEntries(
      ['sourced', 'composed', 'neutral', 'empty'].map((s) => [
        s,
        plan.writes.filter((w) => w.state === s).length
      ])
    )
    const summary = {
      state: 'ready',
      version: plan.version,
      contract: sidecar.doc.contract ?? null,
      locale: site,
      provisional: placeProfile.provisional === true,
      ...(placeProfile.note ? { profileNote: placeProfile.note } : {}),
      groups: groups.length,
      counts,
      rules: RULES
    }
    if (part === 'catalogue')
      return { slotFill: { ...summary, read: 'Part "profile" carries placeProfile and the groups.' } }
    return { placeProfile, slotFill: { ...summary, groups } }
  } catch (error) {
    return { slotFill: { state: 'unreadable', note: error instanceof Error ? error.message : String(error) } }
  }
}
