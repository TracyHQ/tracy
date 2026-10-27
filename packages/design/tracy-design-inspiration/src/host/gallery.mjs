/**
 * The pure half of the host: what the routes decide, without a server around them.
 *
 * WHY A SEPARATE, PLAIN MODULE. The one thing this host half can get wrong in a way that hurts is
 * serving a file it was not asked to serve: `/systems/<id>/<file>` is a static-file route, which is
 * where directory traversal lives. So the decision "which file, if any" is a function of (catalog
 * ids, id, file) with no filesystem in it, and `test/gallery.test.mjs` pins it. The server code in
 * `index.ts` only carries the answer to `res`.
 */

import path from 'node:path'

/**
 * The files of an inspiration this route will serve, and nothing else. The three the cards need, plus
 * the Guideline pages upstream ships per system (re-vendored 06/09): the token previews, the brand
 * engine's kit (light and dark) and its six sample artifacts. Nested names are literal keys — the
 * path is never built from the request.
 */
export const SYSTEM_FILES = Object.freeze({
  'tokens.css': 'text/css; charset=utf-8',
  'components.html': 'text/html; charset=utf-8',
  'DESIGN.md': 'text/markdown; charset=utf-8',
  'preview/colors.html': 'text/html; charset=utf-8',
  'preview/typography.html': 'text/html; charset=utf-8',
  'preview/spacing.html': 'text/html; charset=utf-8',
  'system/kit.html': 'text/html; charset=utf-8',
  'system/kit.dark.html': 'text/html; charset=utf-8',
  'system/artifacts/landing.html': 'text/html; charset=utf-8',
  'system/artifacts/deck.html': 'text/html; charset=utf-8',
  'system/artifacts/poster.html': 'text/html; charset=utf-8',
  'system/artifacts/email.html': 'text/html; charset=utf-8',
  'system/artifacts/newsletter.html': 'text/html; charset=utf-8',
  'system/artifacts/form.html': 'text/html; charset=utf-8',
  'system/artifacts/typography.html': 'text/html; charset=utf-8'
})

/** Where the customer's read-off-the-site content lives inside the site folder (skill B5). */
export const SITE_FILE = path.join('docs', 'agents', 'design-preview.json')

/**
 * Inspirations extracted by `@tracy/dsh-brand-engine` live in the site folder under `Brand/<host>/`,
 * one `manifest.json` each, and carry the id `brand:<host>` (spec-brand-engine §3.2). They are pinned
 * to the FRONT of the catalog — the customer's own brand first, then the references — and served
 * from that folder instead of the image. The filesystem is the contract between the two plugins.
 */
export const BRAND_PREFIX = 'brand:'
export const BRAND_DIR = 'Brand'

/** The same hostname shape the brand engine accepts as a directory name; anything else is refused before `path.join`. */
const SAFE_HOST =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/**
 * The host a `brand:<host>` id names, or `null` when the id is not a brand id or names no safe host.
 * @param {string} id
 * @returns {string | null}
 */
export function brandHostOf(id) {
  if (typeof id !== 'string' || !id.startsWith(BRAND_PREFIX)) return null
  const host = id.slice(BRAND_PREFIX.length)
  return SAFE_HOST.test(host) && !/^[0-9.]+$/.test(host) ? host : null
}

/**
 * One file of a brand inspiration, under the site folder — the same closed list as the image's
 * systems; a file the engine does not produce (`preview/*`) simply is not there and the read 404s.
 * @param {string} siteDir - the site folder.
 * @param {string} host - a host `brandHostOf` accepted.
 * @param {string} file - requested file name.
 * @returns {{ path: string, type: string } | null}
 */
export function resolveBrandFile(siteDir, host, file) {
  if (!Object.hasOwn(SYSTEM_FILES, file)) return null
  const type = /** @type {Record<string, string>} */ (SYSTEM_FILES)[file]
  return { path: path.join(siteDir, BRAND_DIR, host, file), type }
}

/** Font files the brand engine self-hosts under `Brand/<host>/fonts/`, as `injectFontFaces` references them. */
const FONT_URL = /url\((["']?)((?:\.\.\/)+)fonts\/([a-z0-9][a-z0-9._-]*\.(woff2?|ttf|otf))\1\)/gi
const FONT_MIME = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' }

/**
 * A brand inspiration's HTML is drawn in a `sandbox=""` iframe from text (`srcDoc`), where a relative
 * `url(../fonts/x.woff2)` resolves nowhere — the frame has no origin and no cookie. So the host inlines
 * every self-hosted face as a data: URL before handing the page over: a few faces of 20–100 KB each,
 * against a page that would otherwise fall back to the system font. Files the reader cannot supply
 * are left as they were.
 * @param {string} html - `components.html` or a `system/*.html` of a brand.
 * @param {(file: string) => Buffer | null} readFont - bytes of `fonts/<file>`, or null.
 * @returns {string}
 */
export function inlineBrandFonts(html, readFont) {
  return html.replace(FONT_URL, (whole, _q, _up, file, ext) => {
    const bytes = readFont(file)
    if (!bytes) return whole
    const mime =
      /** @type {Record<string, string>} */ (FONT_MIME)[ext.toLowerCase()] ?? 'application/octet-stream'
    return `url(data:${mime};base64,${bytes.toString('base64')})`
  })
}

/**
 * The manifests of the `Brand/` folder as catalog rows, own brand first, then newest first; a
 * manifest whose id does not match its directory, or names an unsafe host, is not a row.
 * @param {{ dir: string, manifest: unknown }[]} found - directory name and parsed manifest.json.
 * @returns {ReturnType<typeof slimCatalog>}
 */
export function brandRows(found) {
  const rows = []
  for (const { dir, manifest } of found) {
    const m = /** @type {Record<string, unknown> | null} */ (
      manifest && typeof manifest === 'object' ? manifest : null
    )
    if (!m || m.id !== `${BRAND_PREFIX}${dir}` || brandHostOf(String(m.id)) === null) continue
    rows.push(m)
  }
  rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'own' ? -1 : 1
    const at = (/** @type {Record<string, unknown>} */ x) =>
      String(/** @type {{ extractedAt?: unknown } | undefined} */ (x.source)?.extractedAt ?? '')
    return at(b).localeCompare(at(a))
  })
  return slimCatalog({ systems: rows })
}

/**
 * A chip as one URL segment: its slashes become `~` (`/about/` → `~about~`), the rest percent-encoded.
 * The reverse is `chipOfToken`. A `~` in a real page path would be misread; none of the site's pages
 * carry one, and a page that did would only lose its versions, never a route.
 * @param {string} chip
 */
export function chipToken(chip) {
  return encodeURIComponent(chip.replace(/\//g, '~'))
}

/** @param {string} segment */
export function chipOfToken(segment) {
  try {
    return decodeURIComponent(segment).replace(/~/g, '/')
  } catch {
    return ''
  }
}

/**
 * The route a request names, or `null`.
 *
 * @param {string} prefix - the mount, `/api/tracy-design-inspiration`.
 * @param {string} method - HTTP method.
 * @param {string} url - `req.url`, query included.
 * @returns {{ kind: 'catalog', systems?: 'all' } | { kind: 'template', id: string, file: string } | { kind: 'site' } | { kind: 'choose' } | { kind: 'system', id: string, file: string } | { kind: 'artifactSlots', id: string, type: string } | { kind: 'copy', id: string, lang: string } | { kind: 'copyVersionCreate', id: string, chip: string, lang: string } | { kind: 'copyVersionDelete', id: string, chip: string, vid: string, lang: string } | { kind: 'copySelect', id: string, chip: string, lang: string } | { kind: 'copyJob', id: string, job: string, lang: string } | null}
 */
export function parseRoute(prefix, method, url) {
  const pathname = (url ?? '').split('?')[0] ?? ''
  if (!pathname.startsWith(prefix)) return null
  /**
   * Which language's copy the caller means, from `?lang=`. Empty means the site's own first
   * language — the one whose file keeps the bare name.
   *
   * 🔒 IT RIDES IN THE QUERY, NOT THE PATH, so every route keeps the shape it had and a caller that
   * names no language asks for exactly what it always asked for. A path segment would have made
   * `copy/<id>` and `copy/<id>/<lang>` two routes, and the second one would have had to be taught
   * to every client at once.
   */
  const query = (url ?? '').split('?')[1] ?? ''
  const lang = new URLSearchParams(query).get('lang') ?? ''
  const rest = pathname.slice(prefix.length).replace(/^\/+/, '').replace(/\/+$/, '')
  const parts = rest.split('/')
  // `?systems=all`: the Design system panel's library. The panel has its own switch
  // (`toolbar-design-system`) and applies through Tracy's door, which never read the gallery's
  // "Design systems on Design inspiration" switch — so the panel lists the systems that door can
  // apply even while the creation gallery shows finished templates only (measured 11/10/2026: with
  // the gallery switch off, as on production, the panel listed nothing at all).
  if (method === 'GET' && rest === 'catalog')
    return new URLSearchParams(query).get('systems') === 'all'
      ? { kind: 'catalog', systems: 'all' }
      : { kind: 'catalog' }
  // A template's picture (its card, a layout's shot): `template/<template id>/<file>`.
  if (method === 'GET' && parts.length === 3 && parts[0] === 'template')
    return { kind: 'template', id: parts[1] ?? '', file: parts[2] ?? '' }
  if (method === 'GET' && rest === 'site') return { kind: 'site' }
  if (method === 'POST' && rest === 'choose') return { kind: 'choose' }
  // The copy of one inspiration (spec §4h decision 5): the file, one more version of one chip, one version
  // fewer, the chip's remembered choice. A chip that is a page path travels with its slashes as `~`
  // (`~about~`, see `chipToken`): `%2F` came back DECODED through the lane's Worker (measured on lucaswp
  // 06/09, `UNKNOWN_ROUTE`), and a decoded slash is a split segment.
  if (method === 'GET' && parts.length === 2 && parts[0] === 'copy') {
    return { kind: 'copy', id: decodeURIComponent(parts[1] ?? ''), lang }
  }
  if (method === 'GET' && parts.length === 4 && parts[0] === 'copy' && parts[2] === 'jobs') {
    return {
      kind: 'copyJob',
      id: decodeURIComponent(parts[1] ?? ''),
      job: decodeURIComponent(parts[3] ?? ''),
      lang
    }
  }
  if (parts.length >= 5 && parts[0] === 'copy' && parts[2] === 'pages') {
    const id = decodeURIComponent(parts[1] ?? '')
    const chip = chipOfToken(parts[3] ?? '')
    if (method === 'POST' && parts.length === 5 && parts[4] === 'versions') {
      return { kind: 'copyVersionCreate', id, chip, lang }
    }
    if (method === 'DELETE' && parts.length === 6 && parts[4] === 'versions') {
      return { kind: 'copyVersionDelete', id, chip, vid: decodeURIComponent(parts[5] ?? ''), lang }
    }
    if (method === 'PUT' && parts.length === 5 && parts[4] === 'selected') {
      return { kind: 'copySelect', id, chip, lang }
    }
  }
  // The slot map of one artifact of an inspiration (the shared engine template for the 152, the brand's own for `brand:`).
  if (method === 'GET' && parts.length === 4 && parts[0] === 'systems' && parts[2] === 'artifact-slots') {
    return {
      kind: 'artifactSlots',
      id: decodeURIComponent(parts[1] ?? ''),
      type: decodeURIComponent(parts[3] ?? '')
    }
  }
  if (method === 'GET' && parts.length >= 3 && parts[0] === 'systems') {
    // `file` may be nested (`system/kit.html`); resolveSystemFile checks it against the closed list.
    return {
      kind: 'system',
      id: decodeURIComponent(parts[1] ?? ''),
      file: parts
        .slice(2)
        .map((p) => decodeURIComponent(p))
        .join('/')
    }
  }
  return null
}

/**
 * The absolute path of one file of one inspiration, or `null` when the request must be refused.
 *
 * 🔒 The id is checked AGAINST THE CATALOG'S SET, not against the filesystem, and the file against
 * a closed list. Nothing from the request is joined into a path until both checks pass, so `..`,
 * an absolute path, or a file the route does not know all fall out as `null` before `path.join`.
 *
 * @param {string} systemsDir - the `systems/` directory.
 * @param {Set<string>} ids - every id in the catalog.
 * @param {string} id - requested id.
 * @param {string} file - requested file name.
 * @returns {{ path: string, type: string } | null}
 */
export function resolveSystemFile(systemsDir, ids, id, file) {
  if (!ids.has(id)) return null
  if (!Object.hasOwn(SYSTEM_FILES, file)) return null
  const type = /** @type {Record<string, string>} */ (SYSTEM_FILES)[file]
  return { path: path.join(systemsDir, id, file), type }
}

/**
 * The catalog as the browser needs it: the fields the grid filters and titles by, and the two
 * shape fields the hero band lays itself out by. `description` stays behind — 152 sentences the
 * card never shows.
 *
 * @param {unknown} catalog - parsed `catalog.json`.
 * @returns {{ id: string, name: string, category: string, nav: string, hero: string }[]}
 * @param {Record<string, { safe?: unknown }> | null} [dark] - `dark.json`'s `systems`, when the image has
 *   one. Absent (an older image) every row reads `dark: true` — the override block is the lane's
 *   default and a missing verdict is not a verdict.
 */
export function slimCatalog(catalog, dark = null) {
  const raw = /** @type {{ systems?: unknown } | null} */ (
    catalog && typeof catalog === 'object' ? catalog : null
  )
  const systems = raw && Array.isArray(raw.systems) ? raw.systems : []
  const out = []
  for (const entry of systems) {
    const s = /** @type {Record<string, unknown> | null} */ (
      entry && typeof entry === 'object' ? entry : null
    )
    if (!s || typeof s.id !== 'string') continue
    out.push({
      id: s.id,
      name: typeof s.name === 'string' ? s.name : s.id,
      category: typeof s.category === 'string' ? s.category : 'Uncategorised',
      // 🔒 NO `docLanguages` HERE. The catalog carries which languages a system's DESIGN.md was
      // translated into; that is the agent's business when it picks a document to read, and no
      // filter on this grid asks it. Its predecessor `vi` rode out to the browser for exactly as
      // long as it took someone to read the switch it drew and ask what it meant.
      // A catalog written before the classification pass has no shape fields: the band's own
      // defaults, spelled out so the client never sees `undefined`.
      nav: typeof s.nav === 'string' ? s.nav : 'top-left',
      hero: typeof s.hero === 'string' ? s.hero : 'split',
      // A brand row (no entry in dark.json) has the engine's own dark tokens: always true.
      dark: dark === null || !(s.id in dark) ? true : dark[s.id]?.safe !== false,
      // Published by Tracy — a design system, the style a site would be dressed in.
      provider: 'Tracy',
      /**
       * 🔒 NO ROW HERE IS BUILDABLE TODAY, AND SAYING SO IS THE WHOLE POINT OF THIS FIELD.
       *
       * Every row this function makes is a DESIGN SYSTEM: a look, not a site. Turning one into a
       * site is the agent's dressing run — provision a site, then write its theme, pages, words
       * and pictures from the system's DESIGN.md — and that run is not a way in any more (since
       * 24/09/2026: one creation flow, the Add site wizard). What a customer can make today is a
       * QUICKSTART: a finished site installed as seen, and those rows come from `templates.mjs`
       * with their own real `platforms`, not from here.
       *
       * So the honest answer for these rows is "nowhere", and the gallery shows them as Coming
       * soon rather than hiding them: 151 looks that are being prepared are worth seeing, and a
       * customer who cannot tell what is ready from what is not will find out by pressing.
       *
       * ⚠ THIS LINE HAS BEEN WRONG BEFORE, THE SAME WAY. It stamped `['joomla', 'wordpress']` onto
       * every row including `brand:` ones, so both Create-with buttons lit up on a card whose
       * build fails at stage 1 of 6 — `checkStage` refuses a `brand:` inspiration outright
       * (`tracy-site-build-core/src/host/stages-shared.mjs`: "A brand has no theme style yet").
       * The customer paid for that lie in the expensive order: press, wait through a whole
       * provision, then be asked whether to retry a step that cannot succeed. Brand rows were
       * given `[]` on 15/09; the rest kept the stamp until now. Since 29/09 the catalog door
       * replaces a brand row's `[]` with the CMSes a published quickstart can wear it on
       * (`withBrandPlatforms`, `templates.mjs`) — WordPress builds a brand now (ADR 0023).
       *
       * An empty list, not `undefined`: `undefined` means "names no platforms", which the dialog
       * reads as buildable everywhere.
       */
      platforms: []
    })
  }
  return out
}

/**
 * Where the `systems/` directory is, given where the catalog file really is. The catalog is
 * reached through a symlink (`/opt/tracy/design-catalog.json`, `tch/design-catalog.json`) whose
 * target sits in the package next to `systems/` — one path to configure, not two to keep aligned.
 *
 * @param {string} catalogRealPath - the resolved (real) path of `catalog.json`.
 * @returns {string}
 */
export function systemsDirFor(catalogRealPath) {
  return path.join(path.dirname(catalogRealPath), 'systems')
}

/**
 * Validate a `choose` body: one catalog id, nothing else.
 *
 * @param {unknown} body - parsed JSON body.
 * @param {Set<string>} ids - every id in the catalog.
 * @returns {string | null} the id, or `null` when refused.
 */
export function chosenId(body, ids) {
  if (!body || typeof body !== 'object') return null
  const id = /** @type {Record<string, unknown>} */ (body).id
  return typeof id === 'string' && ids.has(id) ? id : null
}

/**
 * The agent's three picks out of the tool's arguments: catalog ids only, one line of why each,
 * at most three, duplicates dropped. `null` when the call is not usable.
 *
 * @param {unknown} args - tool arguments as dsh validated them.
 * @param {Set<string>} ids - every id in the catalog.
 * @returns {{ id: string, why: string }[] | null}
 */
export function validPicks(args, ids) {
  const list = /** @type {{ picks?: unknown } | null} */ (args && typeof args === 'object' ? args : null)
    ?.picks
  if (!Array.isArray(list) || list.length === 0) return null
  /** @type {{ id: string, why: string }[]} */
  const out = []
  for (const entry of list) {
    const p = /** @type {Record<string, unknown> | null} */ (
      entry && typeof entry === 'object' ? entry : null
    )
    if (!p || typeof p.id !== 'string' || !ids.has(p.id)) return null
    if (out.some((x) => x.id === p.id)) continue
    out.push({ id: p.id, why: typeof p.why === 'string' ? p.why.trim().slice(0, 200) : '' })
    if (out.length === 3) break
  }
  return out
}

/** Page types drawn on the inspiration's own fixture (`components.html`), as the preview library knows them. */
export const PAGE_TYPES = Object.freeze(['home', 'listing', 'article', 'pricing'])
/**
 * Page types drawn on one of the inspiration's six artifacts (`system/artifacts/<type>.html`, the brand
 * engine's sample products) — a generated page of this type is "the customer's Form in this inspiration".
 */
export const ARTIFACT_TYPES = Object.freeze([
  'landing',
  'deck',
  'poster',
  'email',
  'newsletter',
  'form',
  'typography'
])

/** Where the written copy lives, one file per inspiration (spec §4h decision 5; shape in `copy.mjs`). */
export const COPY_DIR = path.join('docs', 'agents', 'design-copy')

/**
 * An inspiration id as a file name: `brand:stripe.com` → `brand--stripe.com`. Ids are catalog-checked
 * before this.
 *
 * ONE FILE PER LANGUAGE, and the site's first language keeps the bare name (08/09 — a site can
 * be built in several). Two reasons it is a file each rather than one file with a language inside:
 *
 *   - Every copy file written before today is called `<id>.json` and holds one language. Leaving
 *     that name to mean exactly what it always meant is how a site already running keeps the words
 *     its owner approved; a schema change would have to migrate them, and a migration that runs on
 *     a customer's folder is a migration that can lose them.
 *   - A take is written, chosen and reread per language. Sharing one file would put two languages
 *     behind one write queue for no gain.
 *
 * @param {string} id
 * @param {string} [lang] - an EXTRA language. The site's own first language passes nothing and
 *   keeps the bare name, whatever that language is — a Vietnamese site's main file is `<id>.json`.
 */
export function copyFileName(id, lang) {
  const base = id.replace(/:/g, '--')
  return lang === undefined || lang === '' ? `${base}.json` : `${base}.${lang}.json`
}

/**
 * The length rule of spec §4f decision 5, per slot role: a paragraph is measured in characters, a
 * headline or title in words, a button in words within ±15%. Everything else (labels, numbers, nav)
 * is measured in words. Returns the inclusive [min, max] the written text must land in.
 * @param {{ role: string, words: number, chars: number }} slot
 * @returns {{ unit: 'chars' | 'words', min: number, max: number }}
 */
export function slotLimits(slot) {
  if (slot.role === 'paragraph' || slot.role === 'quote') {
    return { unit: 'chars', min: Math.floor(slot.chars * 0.75), max: Math.ceil(slot.chars * 1.25) }
  }
  const tol = slot.role === 'button' ? 0.15 : 0.25
  return {
    unit: 'words',
    min: Math.max(1, Math.floor(slot.words * (1 - tol))),
    max: Math.max(1, Math.ceil(slot.words * (1 + tol)))
  }
}

/** @param {string} text @param {'chars'|'words'} unit */
export function measure(text, unit) {
  const t = text.trim()
  return unit === 'chars' ? t.length : t.split(/\s+/).filter(Boolean).length
}

/**
 * Validate what the agent wrote for one inspiration (`tracy_design_copy write`). The only rule is the
 * slot length (§4f): a text OVER the ceiling is refused — it is what breaks a layout — and one under
 * the floor is accepted with a warning, since a shorter line never overflows. Unknown slot ids are
 * refused by name. Empty texts are dropped.
 *
 * @param {unknown} args - tool arguments.
 * @param {{ id: string, role: string, words: number, chars: number }[]} slots - the inspiration's slot map.
 * @returns {{ ok: true, slots: Record<string, string>, lang: string, brief: { goal: string, voice: string } | null, warnings: string[] } | { ok: false, error: string, offending?: { id: string, unit: string, got: number, min: number, max: number }[] }}
 */
export function validCopy(args, slots) {
  const a = /** @type {Record<string, unknown> | null} */ (args && typeof args === 'object' ? args : null)
  const raw = a?.slots
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      error: 'slots must be an object of { "<slot id>": "<text>" } — get the ids from action "form".'
    }
  }
  const known = new Map(slots.map((s) => [s.id, s]))
  const unknown = Object.keys(raw).filter((k) => !known.has(k))
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Not slots of this inspiration: ${unknown.join(', ')}. Use the ids from action "form".`
    }
  }
  /** @type {Record<string, string>} */
  const out = {}
  /** @type {{ id: string, unit: string, got: number, min: number, max: number }[]} */
  const over = []
  /** @type {string[]} */
  const warnings = []
  for (const [id, value] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
    if (typeof value !== 'string' || value.trim() === '') continue
    const slot = known.get(id)
    if (!slot) continue
    const lim = slotLimits(slot)
    const got = measure(value, lim.unit)
    if (got > lim.max) over.push({ id, unit: lim.unit, got, min: lim.min, max: lim.max })
    else if (got < lim.min)
      warnings.push(`${id}: ${got} ${lim.unit}, below ${lim.min} — fine, but the slot will look short`)
    out[id] = value.trim().replace(/\s+/g, ' ')
  }
  if (over.length > 0) {
    return {
      ok: false,
      error: `Too long for the slot (the layout would overflow): ${over.map((o) => `${o.id} ${o.got}/${o.max} ${o.unit}`).join(', ')}. Shorten those and write again.`,
      offending: over
    }
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'No slot text given.' }
  const brief =
    a?.brief && typeof a.brief === 'object' ? /** @type {Record<string, unknown>} */ (a.brief) : null
  return {
    ok: true,
    slots: out,
    lang: typeof a?.lang === 'string' && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(a.lang) ? a.lang : 'en',
    brief: brief ? { goal: String(brief.goal ?? ''), voice: String(brief.voice ?? '') } : null,
    warnings
  }
}

/**
 * How close an inspiration sits to the customer's brand — the score the library sorts by once a brand
 * exists (§4f slice 3, "match score"). Three signals, each 0..1: accent hue, canvas lightness
 * (light on light, dark on dark), display face. 1 is the brand itself.
 * @param {string} brandTokens - the brand's tokens.css.
 * @param {string} systemTokens - an inspiration's tokens.css.
 * @returns {number}
 */
export function fitScore(brandTokens, systemTokens) {
  const b = tokenFacts(brandTokens)
  const s = tokenFacts(systemTokens)
  let score = 0
  if (b.accent && s.accent) {
    const dh = Math.abs(b.accent.h - s.accent.h)
    const hue = 1 - Math.min(dh, 360 - dh) / 180
    // A grey accent has no hue to compare: fall back to lightness only.
    score += (b.accent.s < 0.12 || s.accent.s < 0.12 ? 0.5 : hue) * 0.55
  }
  if (b.bg !== null && s.bg !== null) score += (1 - Math.abs(b.bg - s.bg)) * 0.3
  if (b.font && s.font) score += (b.font === s.font ? 1 : 0) * 0.15
  return Math.round(score * 1000) / 1000
}

/** @param {string} css */
function tokenFacts(css) {
  const grab = (/** @type {string} */ name) => {
    const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css)
    return m ? m[1].trim() : null
  }
  const accentHex = grab('--accent')
  const bgHex = grab('--bg')
  const font = grab('--font-display')
  return {
    accent: accentHex ? hsl(accentHex) : null,
    bg: bgHex ? (hsl(bgHex)?.l ?? null) : null,
    font: font
      ? font
          .split(',')[0]
          .trim()
          .replace(/^["']|["']$/g, '')
          .toLowerCase()
      : null
  }
}

/** @param {string} hex @returns {{ h: number, s: number, l: number } | null} */
function hsl(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const sat = d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  return { h, s: sat, l }
}
