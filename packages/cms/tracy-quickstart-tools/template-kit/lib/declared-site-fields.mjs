// The `site` fields of a kit a person declares by hand when packaging, one list for the declare commands of cli.mjs and for
// the merge that writes the site part again (kit-site.mjs mergeSite). `assemble` and `build` read the site part fresh from
// site.json; every field named here is carried over from the kit already in the folder, as written, never recomputed. A new
// declare command is added here, so the merge cannot forget it. `noneWhy` (none-why.mjs) holds the reason of an explicit
// `--none` for a list field, and is carried for the list fields named here.
import { declareLegalLayout } from './legal-layout.mjs'
import {
  declareCreatedPageHide,
  declareHiddenPageLinks,
  declareSelfLinkButtons
} from './self-link-buttons.mjs'
import { declareStockScreen } from './stock-screens.mjs'
import { declareVideoButtons } from './video-buttons.mjs'

/**
 * field: the path under `site` (a dot names a key inside an object field); command: the cli.mjs command writing it;
 * flag: the command's flag naming one entry, also the entry's key in a list field; list: a list field (with `--none`);
 * words: what the command prints it names.
 */
export const DECLARED_SITE_FIELDS = Object.freeze([
  {
    field: 'emptyVideoButtons',
    command: 'video-buttons',
    flag: 'selector',
    list: true,
    declare: declareVideoButtons,
    words: 'empty video buttons'
  },
  {
    field: 'selfLinkButtons',
    command: 'self-link-buttons',
    flag: 'container',
    list: true,
    declare: declareSelfLinkButtons,
    words: 'self link containers'
  },
  {
    field: 'hiddenPageLinks',
    command: 'hidden-page-links',
    flag: 'container',
    list: true,
    declare: declareHiddenPageLinks,
    words: 'hidden page link containers'
  },
  {
    field: 'createdPageHide',
    command: 'created-page-hide',
    flag: 'selector',
    list: true,
    declare: declareCreatedPageHide,
    words: 'created page hide selectors'
  },
  {
    field: 'stockScreens',
    command: 'stock-screens',
    flag: 'path',
    list: true,
    declare: declareStockScreen,
    words: 'stock screens'
  },
  {
    field: 'createdPageLayouts.legal',
    command: 'legal-layout',
    flag: 'layout',
    list: false,
    declare: declareLegalLayout,
    words: 'legal page layout'
  }
])

const LIST_FIELDS = new Set(DECLARED_SITE_FIELDS.filter((d) => d.list).map((d) => d.field))

const valueAt = (site, path) =>
  path.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), site)

function setAt(site, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  let at = site
  for (const k of keys) {
    if (!at[k] || typeof at[k] !== 'object') at[k] = {}
    at = at[k]
  }
  at[last] = value
}

/**
 * The declared fields a kit holds, as a part of its `site` (nested the way the kit nests them); `{}` when none.
 * @param {any} kit
 * @returns {Record<string, unknown>}
 */
export function declaredOf(kit) {
  const site = kit?.site
  /** @type {Record<string, unknown>} */
  const out = {}
  if (!site || typeof site !== 'object') return out
  for (const { field } of DECLARED_SITE_FIELDS) {
    const v = valueAt(site, field)
    if (v !== undefined) setAt(out, field, structuredClone(v))
  }
  const why = Object.entries(site.noneWhy ?? {}).filter(([f]) => LIST_FIELDS.has(f))
  if (why.length) out.noneWhy = Object.fromEntries(why)
  return out
}

/**
 * Carries the declared fields of `previous` (the kit already in the folder) into `kit`, changed in place. Returns the
 * fields carried. A kit with no site part (no site.json) keeps nothing: its site part is an error already.
 * @param {any} kit
 * @param {any} previous
 * @returns {string[]}
 */
export function keepDeclaredSiteFields(kit, previous) {
  if (!kit?.site || typeof kit.site !== 'object') return []
  const held = declaredOf(previous)
  const kept = []
  for (const { field } of DECLARED_SITE_FIELDS) {
    const v = valueAt(held, field)
    if (v === undefined) continue
    setAt(kit.site, field, v)
    kept.push(field)
  }
  if (held.noneWhy) {
    kit.site.noneWhy = { ...kit.site.noneWhy, ...held.noneWhy }
    kept.push('noneWhy')
  }
  return kept
}
