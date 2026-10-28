/**
 * The one reader of a quickstart contract's slot roles (ADR 0038). Every caller that needs to know which slot holds
 * which fact (the Road to live, Website Opportunities demos, the Joomla, WordPress and EmDash brief engines) reads here,
 * in this order:
 *
 *   1. the content map: roles and groups on its slots (`content-map-roles.mjs` in the WO domain documents the fields);
 *      for an EmDash theme, the roles its `seed/field-map.json` declares per field (`emdash-field-map-roles.js`);
 *   2. the `slot-roles.json` sidecar beside the contract (ADR 0037 decision 5; three released contracts have one);
 *   3. the hand-written Website Opportunities map of the template (`domain/slot-roles/<cms>.json`).
 *
 * The answer keeps the shape the sidecar reader (`slotRolesOf`) gives, so the fill planner (`planSlotFill`) takes `doc`
 * unchanged whatever the source:
 *
 *   source   'content-map' | 'field-map' | 'sidecar' | 'hand-map' | 'none'
 *   state    'ready' | 'invalid' | 'stale' | 'missing': only a `ready` doc is filled from
 *   doc      `{groups, bindings, status, contract, ...}` (content map or sidecar)
 *   errors   why it is invalid
 *   gaps     `requiresEvidence` slots no fact role is bound to
 *   handMap  the template's hand-written map, or null; returned with every source, since the Joomla and WordPress pins
 *            and the EmDash copy start from it and lay a ready doc over it
 *
 * Every answer also carries `fit`, the content map's Slot fit (ADR 0039, `slotFitOfContentMap` in the WO domain):
 * `{state: 'ready' | 'invalid' | 'missing', version, slots: {<key>: fit}, groups, missing}`, read from the same content
 * map, so a caller that plans pictures or words gets each slot's shape from the one door it already reads roles from.
 *
 * A content map that declares roles is the whole answer: when its roles are broken it is `invalid` and the sidecar is
 * not read, so a broken declaration is never hidden behind an older one.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  checkContentMapRoles,
  contentMapDeclaresRoles,
  handMapApplies,
  isFactRole,
  slotFitOfContentMap,
  slotRolesFor,
  slotRolesOfContentMap
} from 'website-opportunities/domain'
import { WO_DOMAIN_DIR } from 'website-opportunities/src/domain-loader.js'
import { fieldMapRolesOf } from './emdash-field-map-roles.js'
import { contractSlotInventory, slotRolesOf } from './slot-roles.js'

/** @type {any} */
let emdashMaps = null

/**
 * The hand-written Website Opportunities map of one template, or null when it has none.
 * @param {string | null | undefined} cms - 'joomla' | 'wordpress' | 'emdash'
 * @param {string | null | undefined} template - the release's product (`tracy-base`), or an EmDash tool's template id
 */
export function handMapOf(cms, template) {
  if (!template) return null
  if (cms !== 'emdash') return slotRolesFor(cms, template)
  try {
    emdashMaps ??= JSON.parse(readFileSync(path.join(WO_DOMAIN_DIR, 'slot-roles', 'emdash.json'), 'utf8'))
  } catch {
    return null
  }
  return emdashMaps?.themes?.[template] ?? null
}

function contentMapOf(contractDir) {
  const file = path.join(contractDir, 'content-map.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function contractIdOf(contractDir) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(contractDir, 'manifest.json'), 'utf8'))
    const q = manifest?.quickstart
    if (q?.slug && q?.cms && q?.version) return `${q.slug}/${q.cms}/${q.version}`
  } catch {}
  return null
}

/**
 * @param {string | null | undefined} contractDir - the folder of one contract version
 * @param {{template?: string | null, cms?: string | null}} [options] - which hand-written map to fall back to; `cms`
 *   defaults to what the contract itself says
 * @returns {{source: 'content-map' | 'field-map' | 'sidecar' | 'hand-map' | 'none',
 *   state: 'missing' | 'stale' | 'invalid' | 'ready', doc?: any, errors?: string[], gaps: string[], handMap: any}}
 */
function readRoles(contractDir, { template = null, cms = null } = {}) {
  if (!contractDir) {
    const handMap = handMapOf(cms, template)
    return { source: handMap ? 'hand-map' : 'none', state: 'missing', gaps: [], handMap }
  }
  const inventory = contractSlotInventory(contractDir)
  const contentMap = contentMapOf(contractDir)
  // A template whose contract has content-map roles no longer has a hand-written map (`handMapApplies`).
  const handMap = handMapApplies(contentMap) ? handMapOf(cms ?? inventory.cms, template) : null

  if (contentMap && contentMapDeclaresRoles(contentMap)) {
    const factSlots = new Set(
      contentMap.slots.filter((s) => isFactRole(s?.role) && s?.group).map((s) => String(s.key))
    )
    const gaps = inventory.requiresEvidenceSlots.filter((key) => !factSlots.has(key))
    const doc = slotRolesOfContentMap(contentMap, {
      contract: contractIdOf(contractDir),
      cms: inventory.cms
    })
    const check = checkContentMapRoles(contentMap)
    return check.ok
      ? { source: 'content-map', state: 'ready', doc, gaps, handMap }
      : { source: 'content-map', state: 'invalid', doc, errors: check.errors, gaps, handMap }
  }

  // An EmDash theme declares roles per field in its field map: they come before any sidecar, and, like a content map's,
  // are the whole answer once declared.
  const fieldMap = inventory.cms === 'emdash' ? fieldMapRolesOf(inventory.seedDir) : null
  if (fieldMap) {
    const factSlots = new Set(
      fieldMap.contentMap.slots.filter((s) => isFactRole(s?.role) && s?.group).map((s) => String(s.key))
    )
    const gaps = inventory.requiresEvidenceSlots.filter((key) => !factSlots.has(key))
    return fieldMap.ok
      ? { source: 'field-map', state: 'ready', doc: fieldMap.doc, gaps, handMap }
      : { source: 'field-map', state: 'invalid', doc: fieldMap.doc, errors: fieldMap.errors, gaps, handMap }
  }

  const sidecar = slotRolesOf(contractDir)
  if (sidecar.state !== 'missing') return { source: 'sidecar', ...sidecar, handMap }
  return { source: handMap ? 'hand-map' : 'none', ...sidecar, handMap }
}

/**
 * @param {string | null | undefined} contractDir - the folder of one contract version
 * @param {{template?: string | null, cms?: string | null}} [options] - which hand-written map to fall back to
 */
export function readSlotRoles(contractDir, options = {}) {
  const roles = readRoles(contractDir, options)
  const contentMap = contractDir ? contentMapOf(contractDir) : null
  return { ...roles, fit: slotFitOfContentMap(contentMap ?? { slots: [] }) }
}

/**
 * The one door to a fill plan (`planSlotFill`) for every Website Opportunities path: the Road to live group plan, the
 * Joomla and WordPress pins, the EmDash writes and the agent demo. The roles come from `readSlotRoles` (content map,
 * sidecar), the profile from `placeProfileOfRevision`; a read that is not `ready` has no plan.
 * @param {any} domain - the Website Opportunities domain
 * @param {ReturnType<typeof readSlotRoles> | any} slotRoles - a read of `readSlotRoles`, or its `doc`
 * @param {{placeProfile: {profile: any, assessment: any}, locale?: string}} input
 * @returns {any | null} the plan, or null when the roles are not ready
 */
export function planFillOf(domain, slotRoles, { placeProfile, locale = 'en' }) {
  const isRead = slotRoles && typeof slotRoles === 'object' && 'source' in slotRoles && 'state' in slotRoles
  const doc = isRead ? (slotRoles.state === 'ready' ? slotRoles.doc : null) : slotRoles
  if (!doc) return null
  return domain.planSlotFill({
    slotRoles: doc,
    profile: placeProfile.profile,
    assessment: placeProfile.assessment,
    locale,
    neutralFor: domain.neutralFor
  })
}
