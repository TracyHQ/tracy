/**
 * The fill plan on the agent demo path (spec TracyHQ/tracy#132, #141): for a release whose content map says each slot's
 * v3 role (ADR 0040) and a brief that links its photos, `planFill` decides which photo each contract picture slot takes,
 * once, when the agent first saves its plan; the agent only places what it decided.
 *
 *   photo       `plan.save` accepts only that photo in a row aimed at the slot, `media.import` cuts it around its subject
 *   substitute  the row names no photo; `media.import` with the row draws the substitute (`substitute-picture.js`)
 *   keep, skip  the template's picture stays: a row may only retain it
 *
 * The same decider names each card's offering or person for the QA (`slot-photo-evidence.js`), and the fill plan's text
 * substitutes (a claim heading without its demo number, a signer's name) reach the agent with the group plan.
 * 🔒 A CARD'S PHOTO AND ITS NAME COME FROM ONE DECIDER: the card names are the group plan's sourced names (ADR 0037).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { FILL_REASONS, cardNamesOf, planFill, shownWidthOf } from 'website-opportunities/domain/fill-plan.mjs'
import { textSubstitutesOf } from 'website-opportunities/domain/fill-text.mjs'
import { roleDecidesKeep } from 'website-opportunities/domain/content-map-keep-decision.mjs'
import { fileOf } from 'website-opportunities/domain/pictures/slot-map.mjs'
import { contractFor, defaultContracts } from '../lib/contracts.js'
import { customizableSlots } from '../lib/contract-customize.js'
import { planFillOf } from '../lib/contract-slot-roles.js'
import { sidecarForTemplate } from '../lib/slot-roles-for.js'
import { placeProfileOfRevision } from './place-profile-of-revision.js'

const NAME_ROLES = new Set(['offering.name', 'person.name'])

/** The release's content map (customizable slots only), or null when the release has none. */
export function releaseContentMap(template) {
  try {
    const dir = contractFor(defaultContracts(), template?.quickstart, template?.version)?.dir
    if (!dir) return null
    const map = JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8'))
    return { ...map, slots: customizableSlots(map.slots ?? []) }
  } catch {
    return null
  }
}

/** The accepted facts of a place profile list. */
function accepted(placeProfile, list) {
  const ok = new Set(
    (placeProfile?.assessment ?? []).filter((a) => a?.status === 'accepted').map((a) => a.factId)
  )
  return (Array.isArray(list) ? list : []).filter(
    (f) => f?.id && ok.has(f.id) && !(f.value?.restrictions ?? []).includes('not-on-demo')
  )
}

/**
 * The fill plan of an agent demo, or null when its release or brief does not fill by it.
 * @param {object} input
 * @param {any} input.revision - the build's revision (`withBuildChoice`): `brief`, `template`, `cms`
 * @param {Map<string, {width: number, height: number}>} input.sizes - each collected photo's size (`mediaSizes`)
 * @param {(template: any) => any} [input.contentMapFor]
 * @param {typeof sidecarForTemplate} [input.sidecarFor]
 * @param {Record<string, string> | null} [input.cardNames] - card names given by the caller instead of the group plan's
 * @returns {Promise<null | {version: string, offerings: any[], people: any[], slots: any[], texts: any[]}>}
 */
export async function agentFillPlan({
  revision,
  sizes,
  contentMapFor = releaseContentMap,
  sidecarFor = sidecarForTemplate,
  cardNames = null
}) {
  const brief = revision?.brief
  if (!brief || !Array.isArray(brief.assets)) return null
  const contentMap = contentMapFor(revision.template)
  if (!roleDecidesKeep(contentMap)) return null
  const domain = await websiteOpportunitiesDomain()
  const placeProfile = placeProfileOfRevision(domain, revision)
  // The group plan's sourced card names: what the agent writes on each card (ADR 0037).
  const pins = {}
  const sources = {}
  try {
    const sidecar = sidecarFor({
      cms: revision.cms,
      quickstart: revision.template?.quickstart,
      version: revision.template?.version
    })
    const plan =
      placeProfile && sidecar.state === 'ready' ? planFillOf(domain, sidecar, { placeProfile }) : null
    for (const w of plan?.writes ?? [])
      if (NAME_ROLES.has(w.role) && w.state === 'sourced' && typeof w.value === 'string') {
        pins[w.slotKey] = w.value
        sources[w.slotKey] = 'sourced'
      }
  } catch {
    // No group plan: no card is locked to an offering or a person, so no card takes a linked photo.
  }
  const assets = brief.assets.filter((a) => sizes.has(a?.id)).map((a) => ({ ...a, ...sizes.get(a.id) }))
  const fill = planFill({
    contentMap,
    brief: { ...brief, assets },
    cardNames: cardNames ?? cardNamesOf(contentMap, { pins, sources })
  })
  const fit = new Map(contentMap.slots.map((s) => [s.key, s]))
  // The width a slot's photo is shown at on the desktop (ADR 0039, 29/10/2026): the widest among the slots that share
  // its demo file, the bar `media.import` cuts the planned photo against.
  const shownOf = (key) => {
    const file = fileOf(fit.get(key)?.sample)
    const widths = contentMap.slots
      .filter((s) => s.type === 'image' && fileOf(s.sample) === file)
      .map(shownWidthOf)
      .filter((n) => n > 0)
    return widths.length ? Math.max(...widths) : null
  }
  return {
    version: fill.version,
    offerings: fill.offerings,
    people: fill.people,
    slots: fill.slots
      .filter((d) => d.type === 'image')
      .map((d) => ({
        key: d.key,
        role: d.role,
        groupId: d.groupId,
        groupKind: fit.get(d.key)?.group?.kind ?? null,
        action: d.action,
        reason: d.reason,
        file: d.file ?? fileOf(fit.get(d.key)?.sample),
        ...(d.action === 'photo' && shownOf(d.key) ? { minWidth: shownOf(d.key) } : {}),
        ...(d.mediaId ? { mediaId: d.mediaId } : {}),
        ...(d.crop ? { crop: d.crop } : {}),
        ...(d.substitute ? { substitute: d.substitute } : {})
      })),
    texts: textSubstitutesOf({
      contentMap,
      facts: accepted(placeProfile, placeProfile?.profile?.claims?.statistics),
      people: accepted(placeProfile, placeProfile?.profile?.people),
      pinned: pins
    })
  }
}

/**
 * The fill plan's decision for a contract slot it owns, or null: a slot it only skips (no role, the logo's own door, a
 * demo-only entity) is left to the rules it had before, as on the quickstart-first path.
 */
export function fillDecisionOf(fill, slotKey) {
  const decision = fill?.slots?.find((d) => d.key === slotKey) ?? null
  return decision && decision.action !== 'skip' ? decision : null
}

/**
 * What is wrong with a row aimed at a slot the fill plan decided, as messages for the plan's issues (empty: none).
 * A logo the business's own door writes is left to the logo rules.
 * @param {any} row @param {any} decision
 */
export function fillRowIssues(row, decision) {
  if (!decision || row?.operation !== 'replace-image') return []
  const ids = Array.isArray(row.assetIds) ? row.assetIds : []
  const why = FILL_REASONS[decision.reason] ?? decision.reason
  if (decision.action === 'photo')
    return ids.length === 1 && ids[0] === decision.mediaId
      ? []
      : [
          `The fill plan puts photo ${decision.mediaId} in this slot (${why}): use assetIds ["${decision.mediaId}"] and no other photo.`
        ]
  if (decision.action === 'substitute')
    return ids.length === 0
      ? []
      : [
          `No brief photo goes in this slot (${why}): use assetIds [] and import the row with media.import {rowIndex}; Tracy draws its neutral substitute.`
        ]
  return [`The template keeps this picture (${why}): keep it with operation retain.`]
}

/** The fill plan as the agent reads it (`plan.read`): one line per picture slot, and the words it decides. */
export function fillPlanForAgent(fill) {
  if (!fill) return null
  return {
    version: fill.version,
    slots: fill.slots
      .filter((d) => d.action === 'photo' || d.action === 'substitute' || d.action === 'keep')
      .map((d) => ({
        slot: d.key,
        action: d.action,
        ...(d.mediaId ? { photo: d.mediaId } : {}),
        ...(d.substitute ? { substitute: d.substitute.kind } : {}),
        reason: FILL_REASONS[d.reason] ?? d.reason
      })),
    texts: fill.texts.map((t) => ({ slot: t.key, write: t.text, why: t.kind })),
    instructions:
      'The fill plan decides every picture slot listed here: a photo slot takes exactly that photo (replace-image with that one assetId), a substitute slot takes no brief photo (replace-image with assetIds [], then media.import {rowIndex} draws it), a keep slot is retained. Write each text slot listed under texts with exactly its words.'
  }
}
