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

/**
 * Where a kit assembled with no site part (no site.json yet) keeps the declared fields of the kit it replaces, until an
 * assemble with a site part puts them back under `site`. Every `build` assembles once before its site part runs (the
 * read pass groups the pages through the kit), so without it a build into a folder holding only the committed kit wrote
 * that kit over with `site: null` and every later assemble had nothing to keep (JA Diner 1.0.8 rebuild, 16/11/2026:
 * stock screens, hidden page links, the self link container and both reasons of an explicit none were lost).
 */
export const DECLARED_WAITING = 'declaredSite'

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
  // A kit assembled with no site part may still get a `site` of its own later in the assemble (the content pages),
  // so the fields waiting beside it are read too; one under `site` wins.
  const places = [kit?.site, kit?.[DECLARED_WAITING]].filter((s) => s && typeof s === 'object')
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const { field } of DECLARED_SITE_FIELDS) {
    const v = places.map((site) => valueAt(site, field)).find((x) => x !== undefined)
    if (v !== undefined) setAt(out, field, structuredClone(v))
  }
  const why = places
    .flatMap((site) => Object.entries(site.noneWhy ?? {}))
    .filter(([f]) => LIST_FIELDS.has(f))
    .reverse()
  if (why.length) out.noneWhy = Object.fromEntries(why)
  return out
}

/**
 * Carries the declared fields of `previous` (the kit already in the folder) into `kit`, changed in place. Returns the
 * fields carried. A kit with no site part (no site.json) keeps them aside, under `DECLARED_WAITING`, for the next
 * assemble that has one; its site part is an error already.
 * @param {any} kit
 * @param {any} previous
 * @returns {string[]}
 */
export function keepDeclaredSiteFields(kit, previous) {
  const held = declaredOf(previous)
  if (!kit?.site || typeof kit.site !== 'object') {
    if (!Object.keys(held).length) return []
    kit[DECLARED_WAITING] = held
    return [DECLARED_WAITING]
  }
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
