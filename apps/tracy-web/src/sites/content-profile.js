/**
 * The files the content relay reads about a site's quickstart: the contract profile beside its
 * manifest (Joomla, WordPress) or the EmDash template's site model. Read once per profile and kept:
 * a profile is shipped bytes that change only with a new image, so re-reading it on every request
 * would buy nothing.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { emdashTemplateIdOf } from '../lib/local-releases.js'
import { emdashTemplateDir } from '../lib/quickstart-capabilities.js'
import { slotConstraints } from './content-extend.js'

/** contract id → what the relay needs from that profile. */
const PROFILES = new Map()
/** EmDash template id → its site model and content-API map. */
const TEMPLATES = new Map()

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function parsed(text) {
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * @param {{id: string, dir: string} | null} contract - a `contractFor` answer.
 * @returns {{contentMap: any, contentMapHash: string|null, designBaseline: boolean, slots: Map<string, object>,
 *   slotTypes: Map<string, Set<string>>} | null}
 */
export function contractProfile(contract) {
  if (!contract?.dir) return null
  const known = PROFILES.get(contract.id)
  if (known) return known
  const mapText = readText(path.join(contract.dir, 'content-map.json'))
  const contentMap = parsed(mapText)
  const profile = {
    contentMap,
    slots: slotConstraints(contentMap),
    slotTypes: slotTypesOf(contentMap),
    contentMapHash: mapText === null ? null : createHash('sha256').update(mapText).digest('hex'),
    // `presentation-lock.json` is the quickstart's design BASELINE a change is compared against — a
    // content recommendation (ADR 0022), not a lock that refuses the change.
    designBaseline: existsSync(path.join(contract.dir, 'presentation-lock.json'))
  }
  PROFILES.set(contract.id, profile)
  return profile
}

/**
 * The EmDash template a site was built from, by the first segment of its quickstart tag
 * (`tracy-business/emdash-0.x` → `tracy-business`, the template's own `artifact.json` id).
 * @param {string | null | undefined} quickstartTag
 * @returns {{siteModel: any, contentApiMap: any} | null}
 */
export function emdashTemplate(quickstartTag) {
  if (typeof quickstartTag !== 'string' || quickstartTag === '') return null
  const templateId = emdashTemplateIdOf(quickstartTag)
  if (TEMPLATES.has(templateId)) return TEMPLATES.get(templateId)
  const found = emdashTemplateDir(templateId)
  const template = found
    ? {
        siteModel: parsed(readText(path.join(found.dir, 'seed', 'site-model.json'))),
        contentApiMap: parsed(readText(path.join(found.dir, 'seed', 'content-api-map.json')))
      }
    : null
  TEMPLATES.set(templateId, template)
  return template
}

/**
 * The value types a contract slot may hold that change words, not layout: text, a picture, a link.
 * A seat holding only the `content` toolset (an editor) may write exactly these through
 * `content.contract apply` — the content-only rule: the words of a quickstart change, its layout does
 * not. Every other write the contract offers (a language plan applied, demo rows trimmed, a slot of
 * any other type) stays with the `code` toolset.
 */
export const CONTENT_SLOT_TYPES = new Set(['text', 'image', 'url'])

/**
 * slotKey → every `type` its listings name (the WordPress map lists some keys once per occurrence).
 * @param {{slots?: Array<Record<string, unknown>>} | null} contentMap
 * @returns {Map<string, Set<string>>}
 */
function slotTypesOf(contentMap) {
  /** @type {Map<string, Set<string>>} */
  const types = new Map()
  for (const slot of Array.isArray(contentMap?.slots) ? contentMap.slots : []) {
    if (typeof slot?.key !== 'string') continue
    const seen = types.get(slot.key) ?? new Set()
    seen.add(typeof slot.type === 'string' ? slot.type : '')
    types.set(slot.key, seen)
  }
  return types
}

/**
 * The toolset writing one contract slot needs: `content` when the profile names the key and every
 * listing of it is a text, image or link slot; `code` otherwise — an unknown key or a type outside
 * `CONTENT_SLOT_TYPES` is never guessed into the lower toolset.
 * @param {{slotTypes?: Map<string, Set<string>>} | null} profile - a `contractProfile` answer.
 * @param {string} key
 * @returns {'content' | 'code'}
 */
export function slotToolset(profile, key) {
  // A derived contract has no file to read its types from, and needs none: the plugin makes only
  // text, image and link slots (`DerivedMap::build`) and refuses a key it did not make.
  if (profile?.derived === true) return 'content'
  const types = profile?.slotTypes?.get(key)
  if (!types || types.size === 0) return 'code'
  return [...types].every((type) => CONTENT_SLOT_TYPES.has(type)) ? 'content' : 'code'
}

/**
 * The profile of an IMPORTED site (29/09/2026, `tasks/todo-import-site-contract.md`): no quickstart
 * sealed it, so no shipped file describes it; the Claude Cowork plugin derives its contract from the
 * site's own database at import provisioning (`content.contract {operation:'derive'}`) and makes only
 * text, image and link slots, so every slot key it names is `content` (`slotToolset`). No `contentMap`
 * and no constraints: those live in the plugin, which checks each write itself.
 */
export const DERIVED_PROFILE = Object.freeze({ id: 'derived', derived: true, slotTypes: null })

/**
 * What a seat may write through the contract on a site, and the profile that says where:
 * - a sealed quickstart (Joomla, WordPress): its shipped contract profile;
 * - an imported Joomla or WordPress site (`origin = 'migrated'`, no quickstart contract): the
 *   plugin's derived contract, `DERIVED_PROFILE`;
 * - anything else (EmDash, a fleet-born site with no quickstart): no contract, nothing to apply.
 * `apply` needs the `content` or `code` toolset; `slotOpen` says it per slot key (`slotToolset`,
 * `code` opens every slot).
 * @param {any} site - the `site` row.
 * @param {{id: string, dir: string} | null} contract - `contractFor` of its quickstart, or null.
 * @param {Record<string, boolean> | null} perms - null when only the profile is wanted.
 */
export function siteAuthority(site, contract, perms) {
  const derived =
    contract === null &&
    site?.origin === 'migrated' &&
    (site?.platform === 'wordpress' || site?.platform === 'joomla')
  const profile = derived ? DERIVED_PROFILE : contractProfile(contract)
  const apply = Boolean(perms?.code || perms?.content) && (contract !== null || derived)
  /** @param {string} key */
  const slotOpen = (key) => apply && Boolean(perms?.[slotToolset(profile, key)] || perms?.code)
  return { profile, derived, apply, slotOpen }
}

/**
 * The toolset one `content.contract` call needs.
 * - a read (`writes` false: inspect, `*.plan`, `*.verify`) → `content`, as every other content read;
 * - a WordPress string override (`string`) → `content`: it changes words, never layout;
 * - `apply` whose `changes` name only text/image/link slots of the profile → `content`;
 * - any other write (another operation, an empty or non-object `changes`, a key that is not such a
 *   slot) → `code`, with `outside` naming the keys that are not, so the refusal can say which.
 * @param {Record<string, unknown>} params
 * @param {{slotTypes?: Map<string, Set<string>>} | null} profile - null when the site has no contract.
 * @param {boolean} writes - `contractOperationWrites(params.operation)`.
 * @returns {{ toolset: 'content' | 'code', outside: string[] }}
 */
export function contractToolset(params, profile, writes) {
  if (!writes) return { toolset: 'content', outside: [] }
  // A WordPress string override (`operation: 'string'`, a gettext msgid of a domain in one locale)
  // changes words a visitor reads and nothing else, on any site: the content-only rule.
  if (params?.operation === 'string') return { toolset: 'content', outside: [] }
  if (params?.operation !== 'apply') return { toolset: 'code', outside: [] }
  const changes = params.changes
  const keys =
    changes !== null && typeof changes === 'object' && !Array.isArray(changes) ? Object.keys(changes) : []
  const outside = keys.filter((key) => slotToolset(profile, key) !== 'content')
  return { toolset: keys.length > 0 && outside.length === 0 ? 'content' : 'code', outside }
}
