// Exports a brand file (kind `brand-file`, version 10) as the write orders of the write step (ADR 0044, decision 4). Pure:
// no I/O, no bytes, no site. It reads where each item goes from the template kit, so no template is named here.
//
// Each order says what one brand item is and how it travels:
//   identity    a Global Configuration key, through `site.identity`
//   profile     a key of the template's site profile, through `template.siteSettings`
//   small-logo  the phone menu's own picture: a small-logo key of the profile, or CSS when the profile has none
//   contract    a content slot, in the one contract call
//   head        a tab icon, as a link tag in the kit's head injection block
//   module      the accent-only Design system module, on every page
//   follows     nothing to write: the page prints it from the site name
//   none        nothing to write, with the reason
import { contentMapKey } from '../site-writer/contract-mapping.js'
// The major in the release name does not change the folder, so any stands in for it.
import { templateFolderOf } from '../sites/brief-engines/brand-joomla-places.js'

const BRAND_VERSION = 10
const SMALL_KEY = { site_logo: 'site_logo_small', site_logo_dark: 'site_logo_dark_small' }
const each = (value) => (Array.isArray(value) ? value : [])

function nameOrder(s) {
  const base = { item: 'name', slot: String(s?.id), value: s?.value ?? null }
  const none = (reason) => ({ ...base, via: 'none', reason })
  if (s?.status === 'handed-off') return none(`handed to the ${s.handOff ?? 'writing'} step`)
  if (s?.status !== 'written') return none(`the brand file does not write this (${s?.status})`)
  if (s.kind === 'slot') return { ...base, via: 'contract', slot: s.where, key: contentMapKey(s.where) }
  if (s.kind === 'printed') return { ...base, via: 'follows', reason: 'printed from the site name' }
  const setting = /^setting:(global configuration|template site setting) (\w+)/.exec(String(s.id))
  if (!setting) return none('the write step has no writer for this name slot')
  return { ...base, via: setting[1] === 'global configuration' ? 'identity' : 'profile', key: setting[2] }
}

function logoOrder(k, s) {
  const base = { item: 'logo', slot: k.id, spot: k.id }
  if (!s?.file) return { ...base, via: 'none', reason: 'the brand file has no picture for this spot' }
  const order = { ...base, file: s.file }
  if (k.setting === null || k.setting === undefined) {
    if (!k.frameId) return { ...base, via: 'none', reason: 'the kit names no frame for this spot' }
    return { ...order, via: 'contract', slot: k.frameId, key: contentMapKey(k.frameId) }
  }
  if (k.where === 'offcanvas') {
    if (!SMALL_KEY[k.setting]) return { ...base, via: 'none', reason: `no small logo for ${k.setting}` }
    return { ...order, via: 'small-logo', key: SMALL_KEY[k.setting], side: k.ground?.side ?? 'light' }
  }
  return { ...order, via: 'profile', slot: k.frameId ?? k.id, key: k.setting }
}

function faviconOrders(favicon, kit, headModule) {
  const setting = /site setting (\w+)/.exec(String(kit?.site?.favicon?.mechanism?.setting ?? ''))?.[1]
  const none = (slot, reason) => ({ item: 'favicon', slot, via: 'none', reason })
  const icon = (slot, file, order) =>
    file ? { item: 'favicon', slot, file, ...order } : none(slot, 'the brand file has no such icon')
  const head = (slot, file, link) =>
    headModule === null ? none(slot, 'the kit names no head block') : icon(slot, file, { via: 'head', link })
  return [
    setting
      ? icon('favicon-ico', favicon?.ico, { via: 'profile', key: setting, link: 'ico' })
      : none('favicon-ico', 'the kit names no favicon setting'),
    head('favicon-32', favicon?.png32, 'png32'),
    head('favicon-512', favicon?.png512, 'png512'),
    head('favicon-phone-180', favicon?.phone180, 'phone180')
  ]
}

function accentOrder(colours) {
  const module = colours?.module
  if (!module?.file)
    return { item: 'accent', slot: 'accent', via: 'none', reason: 'the brand file keeps the template accent' }
  return {
    item: 'accent',
    slot: 'accent',
    via: 'module',
    file: module.file,
    contract: String(module.slot ?? '').split('@')[0]
  }
}

/** The module id of the kit's head injection block ("block-170" is 170), or null. */
const headModuleOf = (kit) => {
  const found = /^block-(\d+)$/.exec(String(kit?.site?.head?.injection?.position?.block ?? ''))
  return found ? Number(found[1]) : null
}

/**
 * @param {{ brand: object, kit: object }} input
 * @returns {{ orders: object[], problems: string[], templateFolder: string | null, headModule: number | null,
 *   headMaxBytes: number | null }} `problems`: what keeps this file off this kit, each as a sentence
 */
export function exportBrandOrders({ brand, kit }) {
  const problems = []
  if (brand?.kind !== 'brand-file')
    problems.push(`kind must be "brand-file", found ${JSON.stringify(brand?.kind)}`)
  if (brand?.version !== BRAND_VERSION)
    problems.push(`version must be ${BRAND_VERSION}, found ${JSON.stringify(brand?.version)}`)
  const { product, version } = kit?.quickstart ?? {}
  const kitName = `${product}@${version}`
  if (product && brand?.kit !== kitName)
    problems.push(`it was made on the kit "${brand?.kit}", not ${kitName}`)
  const kitSpots = each(kit?.site?.logoSpots)
  const known = new Set(kitSpots.map((k) => k?.id))
  for (const s of each(brand?.logo?.spots))
    if (!known.has(s?.spot)) problems.push(`the logo spot ${s?.spot} is not in the kit`)
  const headModule = headModuleOf(kit)
  const bySpot = new Map(each(brand?.logo?.spots).map((s) => [s?.spot, s]))
  const orders = [
    ...each(brand?.name?.slots).map(nameOrder),
    ...kitSpots.map((k) => logoOrder(k, bySpot.get(k.id))),
    ...faviconOrders(brand?.favicon, kit, headModule),
    accentOrder(brand?.colours)
  ]
  return {
    orders,
    problems,
    templateFolder: templateFolderOf(`${product}/j0`),
    headModule,
    headMaxBytes: Number(kit?.site?.head?.injection?.maxBytes) || null
  }
}
