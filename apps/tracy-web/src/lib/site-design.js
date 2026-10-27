/**
 * The design system a site wears — tracy-web's record of it (ADR 0023, "Addendum 29/09").
 *
 * WHY HERE AND NOT ONLY IN THE SITE FOLDER. The build writes `docs/agents/design.json` into the site
 * folder, but tracy-web mounts no site folder, so `/v1` could not read it; and a look changed by a
 * `theme.style` that did not pass through site-tools (`/v1`, ops, a script) left the file wearing the
 * old look while the ruler of `tracy_design_check` measured the wrong palette. The Apply door is the
 * one place every look change passes, so the record lives beside it; the folder keeps a copy.
 *
 * A QUICKSTART'S TOKENS ARE THE BUILD'S, AND THEY ARE THE ORIGINAL. For `catalog` the generated map
 * (`design-tokens.json`) can say the values again on Joomla and WordPress. EmDash provision keeps
 * the catalogue's identity but freezes its own token sources before handover (`tokensFrom` names
 * the site file); its token names differ from the catalogue map. For `quickstart` nothing here can: Tracy
 * Business's values come from its contract profile's `<version>.design.json`, an EmDash site's from
 * its own `src/styles/tokens.css`, read from the container at build time — and neither is in this
 * image. So tracy-web keeps a quickstart record's `tokens` exactly as the build's PUT sent them, and
 * only a later build PUT replaces them. A `theme.style` naming that same quickstart keeps them
 * (`styleRecord`); a `theme.style` to anything else is a new look and replaces the record.
 *
 * THE PUBLIC SHAPE IS A CONTRACT with `/v1` (tasks/todo-api-public.md S8): `{design: {id, name,
 * source, platform, tokens, tokensFrom, updatedAt} | null}` — 200 either way, because "wears none we
 * know of" is an answer. `manifest_design` and `wrote_by` never leave.
 */
import { readFileSync } from 'node:fs'

/** @typedef {{ id: string | null, source: string, name: string | null, platform: string, tokens: Record<string, string> | null, tokensFrom: string | null, manifestDesign?: { id: string, source: string } | null }} DesignRecord */

export const SOURCES = Object.freeze(['catalog', 'brand', 'template', 'quickstart', 'none'])
const CATALOG_ID = /^[a-z0-9][a-z0-9-]{0,60}$/
const BRAND_ID = /^brand:[a-z0-9][a-z0-9.-]{0,120}$/
const TOKEN_NAME = /^--[A-Za-z0-9][\w-]{0,80}$/
const MAX_TOKENS = 120

/** @type {{ names: Record<string, string>, ids: Record<string, Record<string, string>> } | null} */
let map = null
function tokenMap() {
  map ??= JSON.parse(readFileSync(new URL('../design-tokens.json', import.meta.url), 'utf8'))
  return /** @type {NonNullable<typeof map>} */ (map)
}

/**
 * The token values of a catalogue system, from the generated map (`scripts/build-design-tokens.mjs`).
 * @param {unknown} id
 * @returns {Record<string, string> | null}
 */
export function tokensFor(id) {
  if (typeof id !== 'string' || !CATALOG_ID.test(id)) return null
  const tokens = tokenMap().ids[id]
  return tokens ? { ...tokens } : null
}

/**
 * The catalogue's display name of a system, or null.
 * @param {unknown} id
 */
export function nameFor(id) {
  return typeof id === 'string' ? (tokenMap().names[id] ?? null) : null
}

/**
 * Why a record the build sent cannot be stored, or null when it can.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function designRecordProblem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'the record must be an object'
  const r = /** @type {Record<string, unknown>} */ (raw)
  if (typeof r.source !== 'string' || !SOURCES.includes(r.source))
    return `source must be one of ${SOURCES.join(', ')}`
  if (r.id !== null && (typeof r.id !== 'string' || !(CATALOG_ID.test(r.id) || BRAND_ID.test(r.id))))
    return 'id must be a catalogue id, brand:<host> or null'
  if (r.source === 'quickstart' && (typeof r.id !== 'string' || !CATALOG_ID.test(r.id)))
    return 'a quickstart record must name its quickstart (id), never null or brand:<host>'
  if (typeof r.platform !== 'string' || !/^[a-z]{2,20}$/.test(r.platform))
    return 'platform must be a CMS name'
  if (r.name !== undefined && r.name !== null && (typeof r.name !== 'string' || r.name.length > 120))
    return 'name must be a short string or null'
  if (
    r.tokensFrom !== undefined &&
    r.tokensFrom !== null &&
    (typeof r.tokensFrom !== 'string' || r.tokensFrom.length > 400)
  )
    return 'tokensFrom must be a path or null'
  if (r.tokens !== undefined && r.tokens !== null) {
    if (typeof r.tokens !== 'object' || Array.isArray(r.tokens))
      return 'tokens must be an object of --name: value, or null'
    const entries = Object.entries(r.tokens)
    if (entries.length > MAX_TOKENS) return `tokens must hold at most ${String(MAX_TOKENS)} entries`
    for (const [name, value] of entries)
      if (!TOKEN_NAME.test(name) || typeof value !== 'string' || value.length > 400)
        return 'tokens must be an object of --name: value, or null'
  }
  if (r.manifestDesign !== undefined && r.manifestDesign !== null) {
    const m = /** @type {Record<string, unknown>} */ (r.manifestDesign)
    if (typeof m !== 'object' || typeof m.id !== 'string' || typeof m.source !== 'string')
      return 'manifestDesign must be {id, source} or null'
  }
  return null
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @returns {Promise<{ design: { id: string | null, name: string | null, source: string, platform: string, tokens: Record<string, string> | null, tokensFrom: string | null, updatedAt: string } | null }>}
 */
export async function readSiteDesign(pool, siteKey) {
  const { rows } = await pool.query(
    'select id, name, source, platform, tokens, tokens_from, updated_at from site_design where site_key = $1',
    [siteKey]
  )
  const row = rows[0]
  if (!row) return { design: null }
  return {
    design: {
      id: row.id,
      name: row.name,
      source: row.source,
      platform: row.platform,
      tokens: row.tokens,
      tokensFrom: row.tokens_from,
      updatedAt: new Date(row.updated_at).toISOString()
    }
  }
}

/**
 * The record a provision gives a template site, written only while the site has none (plan
 * `tasks/plan-wo-design-follows-template.md`, council 19/10/2026). A provision retried late must never win over
 * what the plugin Build or a Design system press wrote since, so this is an insert that yields, not an upsert.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {DesignRecord} record
 * @param {string} wroteBy the server's word (`provision:<buildId>`)
 * @returns {Promise<{ written: boolean }>}
 */
export async function writeSiteDesignIfAbsent(pool, siteKey, record, wroteBy) {
  const { rowCount } = await pool.query(
    `insert into site_design (site_key, id, source, name, platform, tokens, tokens_from, manifest_design, wrote_by, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, null, $8, now())
     on conflict (site_key) do nothing`,
    [
      siteKey,
      record.id,
      record.source,
      record.name ?? null,
      record.platform,
      record.tokens === null || record.tokens === undefined ? null : JSON.stringify(record.tokens),
      record.tokensFrom ?? null,
      wroteBy
    ]
  )
  return { written: rowCount === 1 }
}

/**
 * Record what a site wears. `wroteBy` is the server's word (`build`, `apply:<applyId>`), never a
 * payload's. A write that carries no `manifestDesign` keeps the one the build recorded.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {DesignRecord} record
 * @param {string} wroteBy
 */
export async function writeSiteDesign(pool, siteKey, record, wroteBy) {
  const manifest = record.manifestDesign === undefined ? undefined : record.manifestDesign
  await pool.query(
    `insert into site_design (site_key, id, source, name, platform, tokens, tokens_from, manifest_design, wrote_by, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (site_key) do update set
       id = excluded.id, source = excluded.source, name = excluded.name, platform = excluded.platform,
       tokens = excluded.tokens, tokens_from = excluded.tokens_from,
       manifest_design = case when $10 then excluded.manifest_design else site_design.manifest_design end,
       wrote_by = excluded.wrote_by, updated_at = now()`,
    [
      siteKey,
      record.id,
      record.source,
      record.name ?? null,
      record.platform,
      record.tokens === null || record.tokens === undefined ? null : JSON.stringify(record.tokens),
      record.tokensFrom ?? null,
      manifest ? JSON.stringify(manifest) : null,
      wroteBy,
      manifest !== undefined
    ]
  )
}

/** WordPress font-size slugs back to the token they came from (`tracy-wordpress-theme/lib/variation.mjs`). */
const SIZE_SLUGS = {
  xs: 'xs',
  sm: 'sm',
  base: 'base',
  lg: 'lg',
  xl: 'xl',
  xxl: '2xl',
  xxxl: '3xl',
  xxxxl: '4xl'
}

/**
 * The token values a theme.json variation carries (a brand, PR 8), read back through the same map
 * `variationOf` wrote them with: palette `slug` → `--<slug>`, font family → `--font-<slug>`, font
 * size → `--text-<size>`, spacing → `--space-<slug>`. Null when it carries none.
 * @param {unknown} variation
 * @returns {Record<string, string> | null}
 */
export function tokensOfVariation(variation) {
  const settings = /** @type {any} */ (variation)?.settings
  if (!settings || typeof settings !== 'object') return null
  /** @type {Record<string, string>} */
  const out = {}
  const put = (/** @type {string} */ name, /** @type {unknown} */ value) => {
    if (typeof value === 'string' && value !== '' && TOKEN_NAME.test(name) && !(name in out))
      out[name] = value
  }
  const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])
  for (const p of list(settings.color?.palette)) put(`--${p?.slug}`, p?.color)
  for (const f of list(settings.typography?.fontFamilies)) put(`--font-${f?.slug}`, f?.fontFamily)
  for (const z of list(settings.typography?.fontSizes)) {
    const size = /** @type {Record<string, string>} */ (SIZE_SLUGS)[z?.slug]
    if (size) put(`--text-${size}`, z?.size)
  }
  for (const sp of list(settings.spacing?.spacingSizes)) put(`--space-${sp?.slug}`, sp?.size)
  return Object.keys(out).length > 0 ? out : null
}

const APPLY_ID = /^\S{1,200}$/
const applyIdIn = (/** @type {unknown} */ v) => (typeof v === 'string' && APPLY_ID.test(v) ? v : null)

/**
 * The WordPress style slug of a `brand:<host>` id — `brandStyleSlug` of the WordPress Build
 * (`tracy-site-build-wordpress/src/host/stages.mjs`), which names the variation it sends — or null.
 * @param {unknown} id
 */
function brandSlugOf(id) {
  if (typeof id !== 'string' || !BRAND_ID.test(id)) return null
  const host = id
    .slice('brand:'.length)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return host === '' ? null : `brand-${host}`
}

/**
 * The record an Apply answer implies, or null: a `theme.style` the site answered ok switches the
 * look, so what the site wears is the style just applied.
 *
 * - The quickstart the site already wears (`before`, source `quickstart`, same id) keeps what the
 *   build recorded: its values exist nowhere else (see the top of this file). Checked first, so a
 *   quickstart that shares an id with a catalogue system is never repainted with the catalogue's.
 * - A catalogue style takes its name and token values from the generated map.
 * - A style that arrived with a `variation` is a brand (PR 8): its values come from that variation;
 *   with none there, re-applying the SAME brand keeps what was recorded for it (`before`). A
 *   brand the record already names as `brand:<host>` (the build's PUT) whose slug is this style
 *   keeps that record whole — id and tokens — as a quickstart does (measured 30/09, `dfbrandwp1`).
 * - Any other style (a template's own, e.g. `tracy-business`) is the template's look — recorded
 *   honestly as `source: 'template'` with no id, never as a catalogue system with no tokens.
 * - `wroteBy` names the apply id the ANSWER carries first (what the site issued), then the one the
 *   caller sent (`/v1` sends `Tracy-Apply-Id` or its own) — the id the audit and revert know.
 * @param {{ action: unknown, params: Record<string, unknown>, answer: unknown, platform: string, before?: { id: string | null, source?: string, name?: string | null, tokens: Record<string, string> | null, tokensFrom: string | null } | null }} call
 * @returns {{ record: DesignRecord, wroteBy: string } | null}
 */
export function styleRecord({ action, params, answer, platform, before = null }) {
  if (action !== 'theme.style') return null
  if (!answer || typeof answer !== 'object' || /** @type {{ ok?: unknown }} */ (answer).ok !== true)
    return null
  const style = params?.style
  if (typeof style !== 'string' || !CATALOG_ID.test(style)) return null
  const a = /** @type {Record<string, unknown>} */ (answer)
  const applyId = applyIdIn(a.applyId) ?? applyIdIn(a.apply_id) ?? applyIdIn(params.apply_id)
  const wroteBy = applyId ? `apply:${applyId}` : 'apply'
  if (params.variation !== undefined && params.variation !== null) {
    const carried = tokensOfVariation(params.variation)
    // The slug is how the theme names a brand, not which brand it is: a `theme.style` wearing the
    // brand the record already names keeps that record — its `brand:<host>` id and the tokens the
    // build read from `Brand/<host>/tokens.css` — like a quickstart re-applied (below).
    if (before && before.source === 'brand' && brandSlugOf(before.id) === style)
      return {
        record: {
          id: before.id,
          source: 'brand',
          name: before.name ?? null,
          platform,
          tokens: before.tokens ?? carried,
          tokensFrom: before.tokens ? before.tokensFrom : carried ? 'theme.style:variation' : null
        },
        wroteBy
      }
    const kept = carried === null && before && before.id === style ? before : null
    return {
      record: {
        id: style,
        source: 'brand',
        name: null,
        platform,
        tokens: carried ?? kept?.tokens ?? null,
        tokensFrom: carried ? 'theme.style:variation' : (kept?.tokensFrom ?? null)
      },
      wroteBy
    }
  }
  if (before && before.source === 'quickstart' && before.id === style)
    return {
      record: {
        id: style,
        source: 'quickstart',
        name: before.name ?? null,
        platform,
        tokens: before.tokens,
        tokensFrom: before.tokensFrom
      },
      wroteBy
    }
  const tokens = tokensFor(style)
  if (tokens === null)
    return {
      record: { id: null, source: 'template', name: null, platform, tokens: null, tokensFrom: null },
      wroteBy
    }
  return {
    record: {
      id: style,
      source: 'catalog',
      name: nameFor(style),
      platform,
      tokens,
      tokensFrom: 'tracy-web:design-tokens.json'
    },
    wroteBy
  }
}
