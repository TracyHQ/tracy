// The write step's brand stage (ADR 0044, decision 4): what it needs from the brand file before anything is written (the
// orders, the pictures, the claims on slots, the slot values for the one contract call) and the stage itself. Without a
// brand file it is a stage with nothing to do, so a copy-only run takes the same path.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ACCENT_SLOT_PREFIX, accentModule } from '../brand-step/accent-module.js'
import { exportBrandOrders } from '../brand-step/brand-write-orders.js'
import { dsSlotModule } from '../lib/ds-slot.js'
import { brandAsker, picturePath, writeBrand } from './brand-writes.js'
import { refusalWords } from './contract-write.js'
import { accentRoutesOf } from './look-guard-css.js'
import { kitSlotIds } from './kit-slot-ids.js'
import { lineId } from './last-report.js'
import { NO_LAST } from './no-last-report.js'

export const BRAND_OWNER = 'brand'
const MODULE_MARK = '<style id="tracy-ds-slot"'
const ENDED = 'the run ended before this item was written'

/** The ways an order reaches the site apart from a word in the one contract call, which the contract call compares itself. */
const OWN_WRITE = new Set(['identity', 'profile', 'small-logo', 'head', 'module'])

const PARTS = { name: 'brand-name', logo: 'brand-logo', favicon: 'brand-favicon', accent: 'brand-accent' }

/**
 * Where the slot contract places its Design system module and how it marks a template's dark side, or null when this
 * server does not have that contract.
 */
async function placeFromLibrary(contract) {
  try {
    const found = (await dsSlotModule('library')).loadContract(contract)
    return found?.module ? { ...found.module, darkHook: found.modeHook ?? null } : null
  } catch {
    return null
  }
}

/** The module this site wears: only its template's accent changes, read from the stylesheets the template serves (#378). */
async function builtAccent({ templateSheets, brand, place }) {
  let sheets
  try {
    sheets = await templateSheets()
  } catch (error) {
    const reason = `brand: the template's stylesheets could not be read (${error?.message ?? error})`
    return { stop: { code: 'TEMPLATE_CSS_UNREADABLE', reason } }
  }
  const built = accentModule({ sheets, colours: brand.colours, darkHook: place.darkHook ?? null })
  if (built.problem) return { stop: { code: 'BAD_ACCENT', reason: `brand: ${built.problem}` } }
  return { ...built, routes: accentRoutesOf(sheets, brand.colours.replaces) }
}

/** Every file the orders name, read and hashed; a stop names the first that cannot be used. */
async function readPictures(orders, folder, inputs) {
  const pictures = new Map()
  const assets = {}
  for (const { file } of orders.filter((o) => o.file)) {
    if (pictures.has(file)) continue
    const where = path.resolve(folder, file)
    if (path.relative(folder, where).startsWith('..'))
      return {
        stop: { code: 'BAD_FILE', reason: `brand: the file ${file} is outside the brand file's folder` }
      }
    try {
      pictures.set(file, await readFile(where))
    } catch (error) {
      const reason = `The brand file names ${file}, which cannot be read (${error.code ?? 'error'}).`
      return { stop: { code: 'MISSING_FILE', reason } }
    }
    assets[file] = createHash('sha256').update(pictures.get(file)).digest('hex')
  }
  inputs.assets = assets
  return { pictures }
}

const idle = {
  active: false,
  claims: [],
  changes: {},
  evidence: {},
  lines: () => []
}
const stoppedBy = (stop) => ({ ...idle, stop })

/**
 * @param {{ brand?: object, brandPath?: string, inputs?: { file: string }, kit: object,
 *   accentPlace?: (contract: string) => Promise<object | null>, last?: object,
 *   templateSheets?: () => Promise<string[]> }} input `templateSheets`: the stylesheets the site's template serves. Without
 *   it the brand file's own module must already be accent-only, since a whole design-system style is never written
 * @returns {Promise<object>} the stage; `stop` says why it cannot run
 */
export async function prepareBrandStage({
  brand,
  brandPath,
  inputs,
  kit,
  accentPlace = placeFromLibrary,
  last = NO_LAST,
  templateSheets
}) {
  if (brand === undefined) return idle
  const plan = exportBrandOrders({ brand, kit })
  if (plan.problems.length)
    return stoppedBy({
      code: 'BAD_FILE',
      reason: `The files cannot be written: brand: ${plan.problems.join('; ')}`
    })
  const { orders } = plan
  const known = kitSlotIds(kit)
  const inContract = orders.filter((o) => o.via === 'contract')
  const unknown = inContract.filter((o) => !known.has(o.slot)).map((o) => o.slot)
  if (unknown.length)
    return stoppedBy({ code: 'UNKNOWN_SLOT', reason: `Slots the kit does not have: ${unknown.join(', ')}.` })
  const read = await readPictures(orders, path.dirname(brandPath), inputs)
  if (read.stop) return stoppedBy(read.stop)
  const { pictures } = read
  const accentOrder = orders.find((o) => o.via === 'module')
  let accent = null
  let routes = null
  if (accentOrder) {
    const held = pictures.get(accentOrder.file).toString('utf8')
    if (!held.includes(MODULE_MARK))
      return stoppedBy({ code: 'BAD_FILE', reason: `brand: ${accentOrder.file} has no tracy-ds-slot mark` })
    accent = await accentPlace(accentOrder.contract)
    if (!accent)
      return stoppedBy({
        code: 'BAD_FILE',
        reason: `brand: this server has no slot contract ${accentOrder.contract}`
      })
    if (templateSheets) {
      const built = await builtAccent({ templateSheets, brand, place: accent })
      if (built.stop) return stoppedBy(built.stop)
      pictures.set(accentOrder.file, Buffer.from(built.html))
      routes = built.routes
    } else if (!held.includes(`tracy-ds-slot: ${ACCENT_SLOT_PREFIX}`))
      return stoppedBy({
        code: 'BAD_FILE',
        reason: `brand: ${accentOrder.file} is a whole design-system style and no stylesheets were given to build the accent from`
      })
  }
  const valueOf = (o) => (o.file ? picturePath(o, pictures.get(o.file)) : o.value)
  const changes = Object.fromEntries(inContract.map((o) => [o.key, valueOf(o)]))
  const evidence = Object.fromEntries(
    inContract.filter((o) => !o.file).map((o) => [o.key, "The customer's name, from the brand file"])
  )
  const claims = orders
    .filter((o) => ['contract', 'profile', 'small-logo', 'identity'].includes(o.via))
    .map((o) => ({
      slot: o.slot,
      owner: BRAND_OWNER,
      file: inputs.file,
      kind: o.file ? 'image' : 'text',
      content: o.file ? `picture ${o.file}` : JSON.stringify([o.value])
    }))
  const results = new Map()
  const writesItself = (o) => OWN_WRITE.has(o.via) || (o.via === 'contract' && o.file)
  const orderedOf = (o) => {
    if (o.via === 'module') return pictures.get(o.file).toString('utf8')
    return valueOf(o)
  }
  // What the site holds already, by order: a picture's path names its bytes, so this compares the picture.
  const kept = new Map(
    orders
      .filter((o) => writesItself(o) && last.same(lineId(o), orderedOf(o)))
      .map((o) => [o, last.line(lineId(o))])
  )

  /** @returns {Promise<{ stop?: object, reading?: object, dropped?: string[] }>} `reading`: the site after the brand */
  const write = async ({ apply, siteKey, sleep, reading: current }) => {
    const ask = brandAsker({ apply, siteKey, applyId: `brand-${inputs.sha256.slice(0, 32)}`, sleep })
    try {
      await writeBrand({ orders, plan, pictures, accent, ask, results, kept })
      if (!orders.some((o) => writesItself(o) && !kept.has(o))) return { reading: current, dropped: [] }
      // The head block and the accent moved the site's revision, and the contract call must name the current one.
      const reading = await apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
      if (!reading?.ok)
        return {
          stop: { code: 'INSPECT_REFUSED', reason: reading?.message ?? reading?.error ?? 'no answer' }
        }
      const dropped = inContract.filter((o) => results.get(o)?.status === 'failed').map((o) => o.key)
      return { reading, dropped }
    } catch (error) {
      return { stop: { code: 'BRAND_WRITE_FAILED', reason: String(error?.message ?? error) } }
    }
  }

  /** One report line per brand item, from what the stage and the contract call did. */
  const lines = ({ written, refused }) => {
    const wrote = new Set(written)
    const nameResult = results.get(orders.find((o) => o.via === 'identity'))
    return orders.map((o) => {
      const line = (status, reason, more = {}) => ({
        slot: o.slot,
        key: o.via === 'contract' ? o.key : null,
        owner: BRAND_OWNER,
        status,
        reason,
        readBack: null,
        part: PARTS[o.item],
        ...(o.spot ? { spot: o.spot } : {}),
        ...more
      })
      const order = (result) => ({ ordered: result.ordered, readFrom: result.readFrom })
      if (o.via === 'none') return line('skipped', o.reason)
      if (o.via === 'follows') {
        if (!nameResult) return line('skipped', ENDED)
        // Nothing of its own was written: what can be read back is the site name it is printed from.
        return nameResult.status === 'written'
          ? line('written', o.reason, order(nameResult))
          : line('failed', nameResult.reason)
      }
      const result = results.get(o)
      if (result?.status === 'failed') return line('failed', result.reason)
      if (o.via !== 'contract')
        return result ? line('written', result.reason, order(result)) : line('skipped', ENDED)
      const sent = { ordered: changes[o.key] }
      if (refused.has(o.key)) {
        const entry = refused.get(o.key)
        return line('failed', refusalWords(entry), { refusal: entry, ...sent })
      }
      return wrote.has(o.key) ? line('written', null, sent) : line('skipped', ENDED)
    })
  }

  // What the look guard judges before the first write: the accent module, known whole from here.
  const planned = accentOrder
    ? [
        {
          action: 'content.update',
          params: { kind: 'module', fields: { content: pictures.get(accentOrder.file).toString('utf8') } }
        }
      ]
    : []
  return { active: true, claims, changes, evidence, write, lines, routes, planned }
}
