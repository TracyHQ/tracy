/**
 * The design-system slot's emitters (`packages/design/tracy-ds-slot`), loaded where this process runs,
 * for the Design system door (`sites/design-system.js`): which slot contract a running site's template
 * has, which systems of the library pass the quality gate, and the bytes each CMS wears a system with.
 *
 * 🔒 THIS PROCESS CANNOT IMPORT `packages/` IN THE IMAGE (the image carries `apps/tracy-web` alone), so
 * the Dockerfile copies the package's own `src/` and `templates/` to `src/ds-slot/`, with the files they
 * read laid out under `src/ds-slot/root/` exactly as in a checkout (`vendor/tracy/od-design-system/
 * catalog.json`, each system's `tokens.css` + `manifest.json`, the WordPress overlays' `tokens.css`) and
 * `@tracy/wordpress-theme/variation` in `src/ds-slot/node_modules/`. A checkout reads the package and
 * the repo in place. The bytes are the package's own — no second copy of the rules to keep equal
 * (`lib/seeder.js` is the same arrangement). `scripts/test/tracy-web-ds-slot-image.test.mjs` copies the
 * files the way the Dockerfile does and loads every module from the copy.
 *
 * The library the doors OFFER is Refero's alone, every system of it that passes the quality gate
 * (`referoLibrary`, 12/10/2026). The OpenDesign library (`dsLibrary`) is no longer offered: it is
 * read only to name an OpenDesign system a site already wears, so that site still shows it and still
 * undoes it. `emitFor` still emits an OpenDesign id (tooling, tests); the doors never ask it to.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { publishedTagOf } from './local-releases.js'
import { distinctReferoNames } from './refero-names.js'
import { readDesignAssets } from '../config.js'
import { designAssets, designAssetFingerprint } from './design-assets.js'

const IN_IMAGE = fileURLToPath(new URL('../ds-slot/', import.meta.url))
const IN_CHECKOUT = fileURLToPath(new URL('../../../../packages/design/tracy-ds-slot/', import.meta.url))

/** The package's directory (its `src/` and `templates/`): the image's copy, else the checkout's. */
export const DS_SLOT_DIR = existsSync(path.join(IN_IMAGE, 'src')) ? IN_IMAGE : IN_CHECKOUT
/** The root the emitters read the library from (`loadProfile(root, id)`). */
export const DS_ROOT = existsSync(path.join(IN_IMAGE, 'src'))
  ? path.join(IN_IMAGE, 'root')
  : fileURLToPath(new URL('../../../../', import.meta.url))

const assetSettings = readDesignAssets(process.env)
const remoteAssets = assetSettings
  ? designAssets({ ...assetSettings, fingerprint: designAssetFingerprint(DS_SLOT_DIR) })
  : null

/**
 * The modules this door loads, by file name without `.mjs`. The image test imports each one.
 * `tokenize` and `tokens56` are read by the Template Design System Readiness check
 * (`template-design-system-readiness/`), which judges a release's stylesheets with the tokenizer itself;
 * `measurement` scores its built-site rules from a release's measurement file; `role-variables` is the
 * one list of role variables its rule VARS-1 judges a release's role scan against; `preview-probe-version`
 * is the probe version its built-site rules name in an unmeasured message.
 */
export const DS_SLOT_MODULES = Object.freeze([
  'library',
  'emit',
  'wordpress',
  'joomla',
  'normalise',
  'tokenize',
  'tokens56',
  'measurement',
  'derive',
  'role-variables',
  'preview-probe-version',
  'text-roles'
])

/** @type {Map<string, Promise<any>>} */
const loaded = new Map()

/**
 * One of the package's modules.
 * @param {string} name
 * @returns {Promise<any>}
 */
export function dsSlotModule(name) {
  if (!DS_SLOT_MODULES.includes(name)) throw new Error(`not a ds-slot module: ${name}`)
  let module = loaded.get(name)
  if (module === undefined) {
    module = import(pathToFileURL(path.join(DS_SLOT_DIR, 'src', `${name}.mjs`)).href)
    loaded.set(name, module)
  }
  return module
}

/** An OpenDesign system id as the library and the catalogue spell it (`airbnb`). */
export const SYSTEM_ID = /^[a-z0-9][a-z0-9-]{0,60}$/

/**
 * The slot contracts by the template they fit, read once: `{name, template, ready, minVersion,
 * maxVersion}` for every `templates/*.json` that names one real template (the `t3-ja`/`t4-ja` family
 * bases are parents, not templates a site runs).
 * @returns {{ name: string, template: string, ready: boolean, minVersion: Record<string, string | null> | null, maxVersion: Record<string, string | null> | null }[]}
 */
let contracts = null
export function slotContracts() {
  if (contracts) return contracts
  const dir = path.join(DS_SLOT_DIR, 'templates')
  contracts = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const raw = JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
      const record = (v) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? /** @type {Record<string, string | null>} */ (v)
          : null
      return {
        name: f.slice(0, -5),
        template: String(raw.template ?? ''),
        ready: raw.ready !== false,
        extends: typeof raw.extends === 'string' ? raw.extends : null,
        minVersion: record(raw.minVersion),
        maxVersion: record(raw.maxVersion)
      }
    })
    .filter((c) => c.template !== '' && !/\/t[34]-ja$/.test(c.template))
  return contracts
}

/**
 * What a site's running template is called in the contracts' `template` field, from what the site
 * itself reports (`site-ds-slot` read: WordPress's stylesheet, Joomla's default site template) or, for
 * EmDash, its quickstart tag (an EmDash template is not something the container can name).
 * @param {{ platform: string, stylesheet?: string | null, template?: string | null, quickstartTag?: string | null }} site
 * @returns {string | null}
 */
export function templateKeyOf({ platform, stylesheet, template, quickstartTag }) {
  if (platform === 'wordpress') {
    const s = String(stylesheet ?? '').trim()
    if (!s) return null
    // `tracy` and `tracy-base` are one code base with two overlays; the README's matrix wears both
    // through the `tracy-base` contract.
    return `wordpress/${s === 'tracy' ? 'tracy-base' : s}`
  }
  if (platform === 'joomla') {
    const t = String(template ?? '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-')
    // The `tracy-base/j6` quickstart installs its T4 template under the element `tracy` (its
    // manifest's `template`, measured on the stand 11/10/2026); the JA ones are `ja_<name>`.
    return t ? `joomla/${t === 'tracy' ? 'tracy-base' : t}` : null
  }
  if (platform === 'emdash') {
    const first = String(quickstartTag ?? '')
      .split('/')[0]
      ?.trim()
    return first ? `emdash/${first}` : null
  }
  return null
}

/**
 * The raw template names a site may report for one template key — {@link templateKeyOf} turned back,
 * every name it maps to that key: what the Design system door asks a write to hold (`templates`), so
 * the bytes made for a key are written only while the site still runs that template. Empty for a key
 * that names no WordPress or Joomla template (EmDash names none in its container).
 * @param {string | null} templateKey
 * @returns {string[]}
 */
export function rawTemplatesOf(templateKey) {
  const m = /^(wordpress|joomla)\/([a-z0-9][a-z0-9._-]{0,99})$/.exec(String(templateKey ?? ''))
  if (!m) return []
  const [, platform, base] = m
  const names = [base, base.replace(/-/g, '_')]
  if (base === 'tracy-base') names.push('tracy')
  return [...new Set(names)].filter(
    (raw) => templateKeyOf({ platform, stylesheet: raw, template: raw }) === templateKey
  )
}

/** `a` compared with `b`, dotted numbers (`1.0.10` > `1.0.9`); null when either is not one. */
export function compareVersions(/** @type {unknown} */ a, /** @type {unknown} */ b) {
  const parse = (v) =>
    typeof v === 'string' && /^\d+(\.\d+){0,3}$/.test(v.trim()) ? v.trim().split('.').map(Number) : null
  const x = parse(a)
  const y = parse(b)
  if (!x || !y) return null
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  return 0
}

/**
 * Which version of what a site runs the contract's `minVersion` is checked against, from what the
 * site reports:
 *   - WordPress: the running theme (its stylesheet) and its `Version` header, read in the site by
 *     `site-ds-slot` — a theme release reaches running sites, so the site's own file is the truth;
 *   - Joomla, EmDash: the quickstart release the site was built from (`site.quickstart_tag` /
 *     `quickstart_version`; a local pack's tag read as the release it stands for, `local/tracy-base/j6` →
 *     `tracy-base/j6`, since contracts list published tags only). A re-released quickstart never reaches a site built from an older one,
 *     and the template element's own version does not move on a re-release (measured 11/10/2026:
 *     `dsbtnjo01`, built from `quickstart/ja-kinetic/j6` 1.0.4, carries `templateDetails.xml` 1.0.2).
 * @param {{ platform: string, stylesheet?: string | null, themeVersion?: string | null,
 *   quickstartTag?: string | null, quickstartVersion?: string | null }} site
 * @returns {{ key: string | null, version: string | null }}
 */
export function versionKeyOf({ platform, stylesheet, themeVersion, quickstartTag, quickstartVersion }) {
  const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  if (platform === 'wordpress') return { key: text(stylesheet), version: text(themeVersion) }
  const tag = text(quickstartTag)
  return { key: tag && publishedTagOf(tag), version: text(quickstartVersion) }
}

/**
 * The slot contract a site's template wears a system through, or why there is none.
 *
 * 🔒 A CONTRACT IS READY ONLY FOR THE RELEASES IT WAS MEASURED ON. Most contracts were measured on a
 * template whose stylesheets read the slot (a tokenized re-release: the JA Joomla quickstarts of
 * 09/10, the WordPress themes of #1087, batch 4's 1.0.1) — a site built from, or still running, an
 * older release paints its bands in its own colours, so a dark system there can put light text on a
 * light band. Two fields of the contract say which, per `<quickstart tag | WordPress stylesheet>`:
 * `minVersion` (`<first release that wears it> | null`, null = no release does yet) and `maxVersion`
 * (`<last release confirmed to wear it>`). A release is offered only inside [min, max]: other lines
 * keep re-releasing the same quickstarts and themes, and one built from the template's untokenized
 * source would paint its own colours under a worn system. So a release newer than the last one
 * confirmed is refused until someone checks it (its stylesheets still read `var(--ds-c-<role>, …)`)
 * and moves `maxVersion` — never assumed to wear it because its number is higher. A key with no
 * `maxVersion` is bounded by its own minimum (fails closed). `release` only records where the
 * contract was measured. With `site` given:
 *   - the site's release older than the minimum, or a minimum of null → `TEMPLATE_NEEDS_UPDATE`;
 *   - the site's release newer than the maximum → `TEMPLATE_VERSION_UNCHECKED` (`upTo` = the maximum);
 *   - no version known, the site's key not listed, or a contract with no `minVersion` →
 *     `TEMPLATE_VERSION_UNKNOWN` (never guessed ready).
 * Without `site`, only the template is judged (tooling, tests of the template mapping).
 * @param {string | null} templateKey
 * @param {{ key: string | null, version: string | null }} [site] — {@link versionKeyOf}
 * @returns {{ contract: string } | { reason: 'NO_TEMPLATE' | 'TEMPLATE_HAS_NO_SLOT' | 'TEMPLATE_NOT_READY' | 'TEMPLATE_VERSION_UNKNOWN', have?: string | null } | { reason: 'TEMPLATE_NEEDS_UPDATE', need: string | null, have: string } | { reason: 'TEMPLATE_VERSION_UNCHECKED', upTo: string | null, have: string }}
 */
export function contractFor(templateKey, site) {
  if (!templateKey) return { reason: 'NO_TEMPLATE' }
  const all = contractsOf(templateKey)
  if (all.length === 0) return { reason: 'TEMPLATE_HAS_NO_SLOT' }
  const ready = all.filter((c) => c.ready)
  if (ready.length === 0) return { reason: 'TEMPLATE_NOT_READY' }
  if (site === undefined) return { contract: ready[0].name }
  // a line may hold several contracts, each for its own releases (JA Podcast's two-mode contract from the
  // release whose script opens the system's side): the one whose range holds the site's release, else the
  // answer that says the most — past every range, the newest; before every range, the oldest
  /** @type {ReturnType<typeof judgeRange> | null} */
  let best = null
  for (const c of ready) {
    const r = judgeRange(c, site)
    if ('contract' in r) return r
    best = moreTelling(best, r)
  }
  return /** @type {any} */ (best)
}

/**
 * Every slot contract of one template key, the line's first before the ones that extend it to later releases
 * (the shortest name first: `joomla-ja-podcast` before `joomla-ja-podcast-modes`).
 * @param {string | null} templateKey
 */
function contractsOf(templateKey) {
  return slotContracts()
    .filter((c) => c.template === templateKey)
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
}

/**
 * One contract against one site's release: its `minVersion`..`maxVersion` (a key with no maximum is bounded
 * by its own minimum).
 * @param {{ name: string, minVersion: Record<string, string | null> | null, maxVersion: Record<string, string | null> | null }} found
 * @param {{ key: string | null, version: string | null }} site
 */
function judgeRange(found, site) {
  const min = found.minVersion
  if (!min || site.key === null || !Object.hasOwn(min, site.key))
    return { reason: /** @type {const} */ ('TEMPLATE_VERSION_UNKNOWN'), have: site.version }
  const need = min[site.key]
  if (site.version === null) return { reason: /** @type {const} */ ('TEMPLATE_VERSION_UNKNOWN'), have: null }
  if (need === null)
    return { reason: /** @type {const} */ ('TEMPLATE_NEEDS_UPDATE'), need: null, have: site.version }
  const cmp = compareVersions(site.version, need)
  if (cmp === null) return { reason: /** @type {const} */ ('TEMPLATE_VERSION_UNKNOWN'), have: site.version }
  if (cmp < 0) return { reason: /** @type {const} */ ('TEMPLATE_NEEDS_UPDATE'), need, have: site.version }
  const upTo =
    found.maxVersion && Object.hasOwn(found.maxVersion, site.key) ? found.maxVersion[site.key] : need
  const over = compareVersions(site.version, upTo)
  if (over === null || over > 0)
    return { reason: /** @type {const} */ ('TEMPLATE_VERSION_UNCHECKED'), upTo, have: site.version }
  return { contract: found.name }
}

/** Of two refusals for one release, the one that says most: past the ranges the newest, before them the oldest. */
function moreTelling(/** @type {any} */ a, /** @type {any} */ b) {
  if (!a) return b
  const rank = { TEMPLATE_VERSION_UNCHECKED: 2, TEMPLATE_NEEDS_UPDATE: 1, TEMPLATE_VERSION_UNKNOWN: 0 }
  if (rank[a.reason] !== rank[b.reason]) return rank[b.reason] > rank[a.reason] ? b : a
  if (a.reason === 'TEMPLATE_VERSION_UNCHECKED') return (compareVersions(b.upTo, a.upTo) ?? 0) > 0 ? b : a
  if (a.reason === 'TEMPLATE_NEEDS_UPDATE') return (compareVersions(b.need, a.need) ?? 0) < 0 ? b : a
  return a
}

/**
 * One field of a slot contract, read through its `extends` chain the way `library.mjs` `loadContract` merges it
 * (the nearest file that has it wins). `found: false` for a name with no file, a cycle or a chain without it.
 * @param {string | null | undefined} name
 * @param {string} key
 * @returns {{ found: boolean, value?: unknown }}
 */
function contractFieldOf(name, key) {
  const seen = new Set()
  let at = typeof name === 'string' ? name : ''
  while (/^[a-z0-9-]+$/.test(at) && !seen.has(at)) {
    seen.add(at)
    let raw
    try {
      raw = JSON.parse(readFileSync(path.join(DS_SLOT_DIR, 'templates', `${at}.json`), 'utf8'))
    } catch {
      return { found: false }
    }
    if (Object.hasOwn(raw, key)) return { found: true, value: raw[key] }
    at = typeof raw.extends === 'string' ? raw.extends : ''
  }
  return { found: false }
}

/**
 * Whether a slot contract wears both sides of its template's light/dark switch (`modes: true`, read through its
 * `extends` chain): the Design system preview then offers Light | Dark.
 * False for a name with no file, a cycle or a contract that keeps one look.
 * @param {string | null | undefined} name
 * @returns {boolean}
 */
export function modesOf(name) {
  return contractFieldOf(name, 'modes').value === true
}

/**
 * How a slot contract's template marks its dark side (`modeHook`, a condition on the root such as
 * `:has(> body.dark-active)`; '' for Tracy's own `data-theme="dark"`) and whether it has an "auto" state
 * (`modesAuto`, true unless false), read through its `extends` chain. The live preview frame reads and sets
 * the side shown with it (`design-system-live-page.js`).
 * @param {string | null | undefined} name
 * @returns {{ hook: string, auto: boolean }}
 */
export function modeHookOf(name) {
  const hook = contractFieldOf(name, 'modeHook').value
  return {
    hook: typeof hook === 'string' ? hook.trim() : '',
    auto: contractFieldOf(name, 'modesAuto').value !== false
  }
}

/**
 * A ready contract's `minVersion` for one template key, or null — what an apply hands the site's own
 * run on WordPress (`minTheme`), so a write made for a template never lands on an older theme.
 * @param {string | null} templateKey
 * @returns {Record<string, string | null> | null}
 */
export function minVersionOf(templateKey) {
  // the line's first release for each key, across every contract of the template
  /** @type {Record<string, string | null> | null} */
  let out = null
  for (const c of contractsOf(templateKey)) {
    if (!c.minVersion) continue
    out ??= {}
    for (const [key, v] of Object.entries(c.minVersion))
      if (
        !Object.hasOwn(out, key) ||
        (v !== null && (out[key] === null || (compareVersions(v, out[key]) ?? 0) < 0))
      )
        out[key] = v
  }
  return out
}

/**
 * A ready contract's last confirmed release for every key its `minVersion` names, or null: the
 * contract's `maxVersion`, a key it leaves out bounded by its own minimum (fails closed). What an
 * apply hands the site's own run on WordPress (`maxTheme`), so a theme updated past the last release
 * confirmed to wear the slot writes nothing either.
 * @param {string | null} templateKey
 * @returns {Record<string, string | null> | null}
 */
export function maxVersionOf(templateKey) {
  // the last confirmed release for each key, across every contract of the template
  /** @type {Record<string, string | null> | null} */
  let out = null
  for (const found of contractsOf(templateKey)) {
    if (!found.minVersion) continue
    out ??= {}
    for (const [key, min] of Object.entries(found.minVersion)) {
      const v = found.maxVersion && Object.hasOwn(found.maxVersion, key) ? found.maxVersion[key] : min
      if (
        !Object.hasOwn(out, key) ||
        (v !== null && (out[key] === null || (compareVersions(v, out[key]) ?? 0) > 0))
      )
        out[key] = v
    }
  }
  return out
}

/**
 * The OpenDesign library: every system of its catalogue, with whether the quality gate lets a site wear
 * it. NOT OFFERED any more (Refero only, 12/10/2026): the doors read it for the names of systems a
 * site already wears. Computed once per process (154 small files, pure).
 * @returns {Promise<{ id: string, name: string, category: string | null, colors: string[], ok: boolean }[]>}
 */
let library = null
export function dsLibrary() {
  library ??= (async () => {
    const { loadProfile } = await dsSlotModule('library')
    const { gate } = await dsSlotModule('normalise')
    const { modeOf } = await dsSlotModule('derive')
    const catalog = JSON.parse(
      readFileSync(path.join(DS_ROOT, 'vendor/tracy/od-design-system/catalog.json'), 'utf8')
    )
    const out = []
    for (const row of catalog.systems ?? []) {
      if (typeof row?.id !== 'string' || !SYSTEM_ID.test(row.id)) continue
      const profile = profileOf(loadProfile, `od:${row.id}`)
      let ok = false
      try {
        ok = profile !== null && gate(profile).ok
      } catch {
        ok = false
      }
      out.push({
        id: row.id,
        name: String(row.name ?? row.id),
        category: row.category ?? null,
        description: typeof row.description === 'string' ? row.description : null,
        fonts: fontSwapsOf(profile),
        colors: paletteOf(profile),
        // the side of light the system is (its page colour), as the Refero catalogue's `theme`: a template
        // with a switch opens on this side and derives the other (#1315)
        theme: profile ? modeOf(profile) : null,
        ok
      })
    }
    return out
  })()
  return library
}

/** A profile, or null when the source cannot be read. */
function profileOf(loadProfile, id) {
  try {
    return loadProfile(DS_ROOT, id)
  } catch {
    return null
  }
}

/**
 * The font substitutions the slot makes for one profile: every role whose source names a family that
 * is not on Google Fonts, worn through another one (the normaliser's own `substituted` verdict, D5 of
 * `tasks/ke-hoach-site-mac-dung-design-system.md`) — `{use: 'Inter', for: 'Airbnb Cereal'}`.
 * @param {any} profile
 * @returns {{ use: string, for: string }[]}
 */
export function fontSwapsOf(profile) {
  const out = []
  for (const role of ['display', 'body', 'mono']) {
    const f = profile?.fonts?.[role]
    if (f?.s !== 'substituted' || typeof f.v !== 'string') continue
    const named = String(f.substituteOf ?? f.named ?? '').trim()
    if (!named || named === f.v) continue
    if (!out.some((x) => x.use === f.v && x.for === named)) out.push({ use: f.v, for: named })
  }
  return out
}

/** The colour roles a card's swatch row shows, accent first like the gallery's (`swatches.ts`). */
const PALETTE_ROLES = Object.freeze(['accent', 'bg', 'fg', 'surface', 'muted'])

/**
 * A system's palette for its card: the hex values of its own normalised colours (the profile the slot
 * wears, read from the system's `tokens.css` or Refero's file), accent first, each value once. An
 * unreadable profile, or one with no such colours, gives an empty list: no swatches, never guessed ones.
 * @param {any} profile
 * @returns {string[]}
 */
export function paletteOf(profile) {
  const out = []
  for (const role of PALETTE_ROLES) {
    const v = profile?.colors?.[role]?.v
    if (typeof v !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(v)) continue
    const hex = v.toLowerCase()
    if (!out.includes(hex)) out.push(hex)
  }
  return out
}

/** A Refero library id (`refero:<uuid>`). */
export const REFERO_ID = /^refero:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/
/** A Refero uuid as the catalogue and the systems' folders spell it. */
const REFERO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The hand-picked Refero systems the library shows FIRST, in this order (uuids of
 * `vendor/tracy/refero/catalog.json`). The product owner owns this list, 12/10/2026; this is the only
 * place to change it. Every other offered system follows A to Z by name ({@link orderReferoRows}). A uuid
 * here that the library does not offer (missing, or refused by the quality gate) is skipped silently.
 * These are the systems measured on every published WordPress and Joomla template (13/10/2026:
 * "about 15, and each must look really good"): Stripe, Apple and Linear joined the twelve then.
 */
export const FEATURED_REFERO_SYSTEMS = Object.freeze([
  '7f70ee10-123b-43cc-bd04-498cfc5b5ac0', // Moxie
  '2bf4c61f-de10-4614-ba1b-20c0453bd2a9', // Notion
  '194faa2f-2f69-4bbf-9e29-290f28fa8ca2', // Airbnb
  '5f446754-1fb7-4a99-8cee-7bd5de3bfd9e', // Eddie
  '2bd7363d-7aae-4b1f-9d5a-1edeb17ca567', // MotherDuck
  '813be405-c2b9-41be-9864-7b53d66483dc', // Toggl Track
  '03b3d707-2a30-4f53-a524-347d1b70eb2c', // Voiceflow
  '031056ff-7af1-46db-8daa-115f731c5d26', // ElevenLabs
  '5fd3b3b4-02ab-456a-87aa-e4395636b671', // Figma
  '24929007-7e62-4c96-a940-7de65438a578', // Mailchimp
  '1514a95f-878c-4d4d-bb14-99d1b83f6227', // Spotify
  'da332394-784c-4df2-9e66-c3f7b1d28f28', // Pitch
  '48e5de76-05d5-4c4e-a269-c7c245b291ec', // Stripe
  'aecac5da-f397-4ddf-b71f-de1efc434cb8', // Apple
  '90ce5883-bb24-4466-93f7-801cd617b0d1' // Linear
])

/** A name as the A to Z part sorts it: leading punctuation and spaces ignored. */
const sortKeyOf = (/** @type {string} */ name) => name.replace(/^[\s\p{P}\p{S}]+/u, '') || name
const byName = new Intl.Collator('en', { sensitivity: 'accent' })

/**
 * The library order: the featured rows first, in `featured` order (a featured uuid with no row is
 * skipped), then every other row A to Z by name (case-insensitive, locale-aware, leading punctuation
 * and spaces ignored; ties by id). Pure; returns a new array.
 * @template {{ id: string, uuid: string, name: string }} R
 * @param {R[]} rows
 * @param {readonly string[]} [featured]
 * @returns {R[]}
 */
export function orderReferoRows(rows, featured = FEATURED_REFERO_SYSTEMS) {
  const byUuid = new Map(rows.map((r) => [r.uuid, r]))
  const first = []
  const taken = new Set()
  for (const uuid of featured) {
    const row = byUuid.get(uuid)
    if (!row || taken.has(uuid)) continue
    taken.add(uuid)
    first.push(row)
  }
  const rest = rows
    .filter((r) => !taken.has(r.uuid))
    .sort(
      (a, b) =>
        byName.compare(sortKeyOf(a.name), sortKeyOf(b.name)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    )
  return [...first, ...rest]
}

/**
 * The Refero library as the doors offer it (12/10/2026: Refero only, every system): every row
 * of `vendor/tracy/refero/catalog.json` whose profile loads and passes the quality gate, as library
 * rows (`id` = `refero:<uuid>`), in the library order ({@link orderReferoRows}), with the catalogue's name,
 * industry and description. A row whose files are not here (an image built without them), whose profile does not
 * load, or that the gate refuses is left out — never offered greyed. Measured 12/10/2026: 1,342 rows,
 * all load, 1,081 pass; the 261 left out lack a usable font (144), have text too faint on their
 * background (77), or name no text, accent or background colour (48, 12, 6; a row can have several).
 * No row is set in a handwriting face (body or headings) or a display face (body): the slot picks the
 * system's text face, and the gate refuses what would (`font-body-*`, `font-display-handwriting`).
 * Computed once per process (~0.2 s for the whole catalogue on a Mac mini).
 * @returns {Promise<{ id: string, uuid: string, name: string, category: string | null,
 *   description: string | null, theme: 'light' | 'dark' | 'mixed' | null, fonts: { use: string, for: string }[],
 *   colors: string[], ok: boolean }[]>}
 */
let referoLib = null
/** The catalogue's `theme` values the library passes on. */
const THEMES = new Set(['light', 'dark', 'mixed'])
export function referoLibrary() {
  if (remoteAssets) return Promise.resolve(remoteAssets.library())
  referoLib ??= (async () => {
    const { loadProfile } = await dsSlotModule('library')
    const { gate } = await dsSlotModule('normalise')
    let catalog = { systems: [] }
    try {
      catalog = JSON.parse(readFileSync(path.join(DS_ROOT, 'vendor/tracy/refero/catalog.json'), 'utf8'))
    } catch {}
    const out = []
    const seen = new Set()
    for (const row of catalog.systems ?? []) {
      const uuid = row?.id
      if (typeof uuid !== 'string' || !REFERO_UUID.test(uuid) || seen.has(uuid)) continue
      seen.add(uuid)
      const profile = profileOf(loadProfile, `refero:${uuid}`)
      if (!profile) continue
      let ok = false
      try {
        ok = gate(profile).ok
      } catch {
        ok = false
      }
      if (!ok) continue
      const industry = typeof row.industry === 'string' && row.industry ? row.industry : null
      out.push({
        id: `refero:${uuid}`,
        uuid,
        name: String(row.name ?? profile.name ?? uuid),
        category: industry ? industry[0].toUpperCase() + industry.slice(1) : 'Other',
        description: typeof row.description === 'string' ? row.description : null,
        // The catalogue's look: light, dark or mixed (every row has one, measured 12/10/2026); the lists' Theme filter.
        theme: THEMES.has(row.theme) ? row.theme : null,
        fonts: fontSwapsOf(profile),
        colors: paletteOf(profile),
        ok: true
      })
    }
    // A name several offered systems share gets a suffix from the source data ("Apple · iPhone 18
    // Pro", "Coda · coda.io"; `refero-names.js`). The order reads the catalogue's name, so a group
    // stays together; every door, list and change row then reads the distinct name.
    const source = new Map((catalog.systems ?? []).map((r) => [r?.id, r]))
    const names = distinctReferoNames(
      out.map((r) => ({
        uuid: r.uuid,
        name: r.name,
        sourceWebsite: source.get(r.uuid)?.sourceWebsite,
        theme: r.theme
      }))
    )
    return orderReferoRows(out).map((r) => ({ ...r, name: names.get(r.uuid) ?? r.name }))
  })()
  return referoLib
}

/** @type {Promise<Set<string>> | null} */
let referoOffered = null
/** Whether `uuid` is a Refero system the library offers ({@link referoLibrary}). */
export async function isReferoOffered(/** @type {unknown} */ uuid) {
  referoOffered ??= referoLibrary().then((rows) => new Set(rows.map((r) => r.uuid)))
  return typeof uuid === 'string' && (await referoOffered).has(uuid)
}

/**
 * Where an offered Refero system's card picture lies, or null for any other uuid: the 480-px WebP
 * thumbnail `scripts/build-refero-thumbs.mjs` makes from the snapshot's 1440-px screenshot, kept in
 * `@tracy/ds-slot`'s `refero-thumbs/` (the image copies only these, 13 MB, not the 151 MB originals).
 */
export async function referoScreenshotPath(/** @type {unknown} */ uuid) {
  if (!(await isReferoOffered(uuid))) return null
  if (remoteAssets) return remoteAssets.screenshot(String(uuid))
  return path.join(DS_SLOT_DIR, 'refero-thumbs', `${String(uuid)}.webp`)
}

/**
 * Whether a NEW site built from the newest release of one quickstart can wear a design system: the
 * Add site flow's question, answered by the same contracts and the same `contractFor` as a running
 * site's (`minVersion` .. `maxVersion` of the contract, Q5/Q16 of `tasks/ke-hoach-nut-design-system.md`).
 *   - Joomla, EmDash: the contract whose `minVersion` names the tag, judged against the release's
 *     version (what `site.quickstart_version` will be);
 *   - WordPress: the contract made for that quickstart (its `release`, else `wp-<name>`), judged by
 *     template only — the theme's version is read in the site at apply time and is not on the
 *     release row; `need` is the first theme version that wears it, `have` null.
 * Unknown quickstart or no contract → `TEMPLATE_NOT_READY`.
 * @param {{ platform: string, tag: string, version: string | null }} q
 * @returns {{ supported: boolean, reason: string | null, need: string | null, have: string | null }}
 */
/**
 * The WordPress contract made for one quickstart: the one whose `release` is the tag, else the one for
 * the theme the tag names (`quickstart/<name>/wp<n>` → `wp-<name>` or `<name>`).
 * @param {any[]} all `slotContracts()`
 * @param {string} tag
 */
function wordpressContractOfTag(all, tag) {
  const name = /^(?:quickstart\/)?([a-z0-9-]+)\/wp\d+$/.exec(tag)?.[1] ?? null
  return (
    all.find((c) => c.template.startsWith('wordpress/') && releaseTagOf(c.name) === tag) ??
    (name
      ? all.find((c) => c.template === `wordpress/wp-${name}` || c.template === `wordpress/${name}`)
      : undefined)
  )
}

export function supportForNewSite({ platform, tag: asked, version }) {
  // A local pack (`local-releases.js`) is judged as the release it stands for, as a site built from it is.
  const tag = typeof asked === 'string' ? publishedTagOf(asked) : asked
  const no = (reason, need = null, have = version ?? null) => ({ supported: false, reason, need, have })
  if (typeof tag !== 'string' || tag === '') return no('TEMPLATE_NOT_READY')
  const all = slotContracts()
  if (platform === 'wordpress') {
    const found = wordpressContractOfTag(all, tag)
    if (!found) return no('TEMPLATE_NOT_READY')
    if (!found.ready) return no('TEMPLATE_NOT_READY')
    const stylesheet = found.template.slice('wordpress/'.length)
    const need = found.minVersion?.[stylesheet] ?? null
    // `have` stays null: the release's number is not the theme's, and the theme is read at apply time.
    if (need === null) return no('TEMPLATE_NEEDS_UPDATE', null, null)
    return { supported: true, reason: null, need, have: null }
  }
  if (platform !== 'joomla' && platform !== 'emdash') return no('PLATFORM_HAS_NO_SLOT')
  const fit = quickstartContractOf({ platform, tag, version })
  if ('contract' in fit) return { supported: true, reason: null, need: fit.need, have: version ?? null }
  return no(fit.reason, fit.need)
}

/**
 * The slot contract a site built from one release of a quickstart wears a system through, or why
 * there is none: what {@link supportForNewSite} answers from, and the contract the Add site preview
 * door (`sites/design-system-preview.js`) makes the bytes for. `need`: the first release that wears it,
 * when the contract names one; `template`: the contract's template key.
 *   - Joomla, EmDash: the contract whose `minVersion` names the tag, judged by `contractFor` against
 *     `version` (the demo's own release);
 *   - WordPress: the contract made for that quickstart, judged by template only, as
 *     {@link supportForNewSite} judges it (the theme's version is read in the site at apply time).
 * @param {{ platform: string, tag: string, version: string | null }} q
 * @returns {{ contract: string, need: string | null, template: string } | { reason: string, need: string | null }}
 */
export function quickstartContractOf({ platform, tag: asked, version }) {
  // A local pack (`local-releases.js`) is judged as the release it stands for, as a site built from it is.
  const tag = typeof asked === 'string' ? publishedTagOf(asked) : asked
  if (platform !== 'joomla' && platform !== 'emdash' && platform !== 'wordpress')
    return { reason: 'PLATFORM_HAS_NO_SLOT', need: null }
  if (typeof tag !== 'string' || tag === '') return { reason: 'TEMPLATE_NOT_READY', need: null }
  if (platform === 'wordpress') {
    const found = wordpressContractOfTag(slotContracts(), tag)
    if (!found || !found.ready) return { reason: 'TEMPLATE_NOT_READY', need: null }
    const need = found.minVersion?.[found.template.slice('wordpress/'.length)] ?? null
    if (need === null) return { reason: 'TEMPLATE_NEEDS_UPDATE', need: null }
    return { contract: found.name, need, template: found.template }
  }
  const candidates = contractsNamingTag(platform, tag)
  const found = candidates.find((c) => c.ready) ?? candidates[0]
  if (!found) return { reason: 'TEMPLATE_NOT_READY', need: null }
  const need = minVersionOf(found.template)?.[tag] ?? null
  const fit = contractFor(found.template, { key: tag, version: version ?? null })
  if ('contract' in fit) return { contract: fit.contract, need, template: found.template }
  return { reason: fit.reason, need: 'need' in fit ? (fit.need ?? null) : need }
}

/**
 * The page grounds a site built from quickstart `tag` paints, as `#rrggbb`: the template's own `--bg` as its slot
 * contract records it (`baseTokens`, the side the page opens on) and its dark side's (`darkTokens`), each read through
 * the `extends` chain, each once. What the demo's brand accent is measured against before it paints the links
 * (`opportunities-build/brand-on-site.js`, ADR 0023 amended 26/10/2026). Empty when no contract names the tag or the
 * contract records no ground (a WordPress contract whose base look is a tokens file): the links then keep the
 * template's colour, since nothing proves the accent reads there.
 * @param {{ platform: string | null | undefined, tag: string | null | undefined }} q
 * @returns {string[]}
 */
export function pageGroundsOf({ platform, tag: asked }) {
  if (typeof asked !== 'string' || asked === '') return []
  const tag = publishedTagOf(asked.split('@')[0])
  let name = null
  if (platform === 'wordpress') name = wordpressContractOfTag(slotContracts(), tag)?.name ?? null
  else if (platform === 'joomla' || platform === 'emdash')
    name = contractsNamingTag(platform, tag)[0]?.name ?? null
  if (!name) return []
  const out = []
  for (const key of ['baseTokens', 'darkTokens']) {
    const tokens = contractFieldOf(name, key).value
    const bg = tokens && typeof tokens === 'object' ? String(/** @type {any} */ (tokens)['--bg'] ?? '') : ''
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg.trim())
    if (!m) continue
    const h = m[1].toLowerCase()
    const hex = `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`
    if (!out.includes(hex)) out.push(hex)
  }
  return out
}

/**
 * The template key (a contract's `template`, `<cms>/<template>`) a site built from quickstart `tag` on `platform` runs,
 * whatever release it is: what the customer lock (`design-system-customer-lock.js`) is keyed by. Joomla, EmDash: the
 * contract whose `minVersion` names the tag; WordPress: the contract made for that quickstart. Null when no contract
 * names it.
 * @param {{ platform: string, tag: string | null | undefined }} q
 * @returns {string | null}
 */
export function quickstartTemplateOf({ platform, tag: asked }) {
  if (typeof asked !== 'string' || asked === '') return null
  // A local pack (`local-releases.js`) runs the template of the release it stands for.
  const tag = publishedTagOf(asked)
  const all = slotContracts()
  if (platform === 'wordpress') return wordpressContractOfTag(all, tag)?.template ?? null
  if (platform !== 'joomla' && platform !== 'emdash') return null
  return contractsNamingTag(platform, tag)[0]?.template ?? null
}

/**
 * The Joomla or EmDash contracts whose `minVersion` names quickstart `tag`, the quickstart's own first: a
 * contract that extends another one naming the same tag is a design pack laid over that quickstart (Tracy
 * Apple's tag is named by joomla-tracy-base, its template `tracy`, and by joomla-tracy-airbnb, the Airbnb
 * pack installed on an Apple base), so it comes after the one it extends.
 * @param {string} platform
 * @param {string} tag
 */
function contractsNamingTag(platform, tag) {
  const named = slotContracts().filter(
    (c) => c.template.startsWith(`${platform}/`) && c.minVersion && Object.hasOwn(c.minVersion, tag)
  )
  const names = new Set(named.map((c) => c.name))
  const pack = (/** @type {{ extends: string | null }} */ c) => (c.extends && names.has(c.extends) ? 1 : 0)
  return named.sort((a, b) => pack(a) - pack(b))
}

/** The quickstart tag a contract records it was measured on (`release`, without `@version`), or null. */
function releaseTagOf(contractName) {
  try {
    const raw = JSON.parse(readFileSync(path.join(DS_SLOT_DIR, 'templates', `${contractName}.json`), 'utf8'))
    return typeof raw.release === 'string' ? raw.release.split('@')[0].split(' ')[0] : null
  } catch {
    return null
  }
}

/**
 * The bytes one CMS wears one system with — exactly what `scripts/ds-slot.mjs` writes for that CMS.
 * PURE but for `fontFaces` (WordPress only): the caller resolves Google's @font-face rules (I/O) and
 * passes them in; with none the variation still names the families and loads them by link.
 * @param {{ platform: 'emdash' | 'wordpress' | 'joomla', contract: string, id: string,
 *   fontFaces?: (href: string | null) => Promise<any[]> }} input
 * @returns {Promise<
 *   | { ok: true, id: string, name: string, platform: 'emdash', css: string }
 *   | { ok: true, id: string, name: string, platform: 'wordpress', slug: string, variation: object, fontsLoaded: boolean }
 *   | { ok: true, id: string, name: string, platform: 'joomla', html: string, module: { title: string, position: string, ordering: number, style: string } }
 *   | { ok: false, code: 'DS_UNKNOWN' | 'DS_REFUSED', reasons?: string[] }>}
 */
export async function emitFor({ platform, contract, id, fontFaces }) {
  const refero = REFERO_ID.exec(String(id))
  if (refero ? !(await isReferoOffered(refero[1])) : !SYSTEM_ID.test(id))
    return { ok: false, code: 'DS_UNKNOWN' }
  const { loadProfile, loadContract, contractBase } = await dsSlotModule('library')
  let profile
  try {
    if (remoteAssets && refero) {
      const { fromRefero, gate } = await dsSlotModule('normalise')
      profile = await remoteAssets.profile(refero[1], fromRefero, gate)
    } else profile = loadProfile(DS_ROOT, refero ? id : `od:${id}`)
  } catch {
    if (remoteAssets && refero) return { ok: false, code: 'DS_REFUSED', reasons: ['ASSET_UNAVAILABLE'] }
    return { ok: false, code: 'DS_UNKNOWN' }
  }
  const c = loadContract(contract)
  if (platform === 'emdash') {
    const { emdashCss } = await dsSlotModule('emit')
    // every EmDash template's contract is passed, tracy-base's too: its kicker's literal amber
    // (--color-warn-text) follows through templateVars since 12/10/2026 (`ds-slot.mjs` does the same)
    const r = emdashCss(profile, c)
    if ('refused' in r) return { ok: false, code: 'DS_REFUSED', reasons: r.refused }
    return { ok: true, id: profile.id, name: profile.name, platform, css: r.css }
  }
  if (platform === 'wordpress') {
    const { wordpressVariation } = await dsSlotModule('wordpress')
    const { fontsHref } = await dsSlotModule('emit')
    let faces = []
    let fontsLoaded = false
    if (fontFaces) {
      try {
        faces = await fontFaces(fontsHref(profile))
        fontsLoaded = true
      } catch {
        faces = []
      }
    }
    const r = wordpressVariation(profile, contractBase(DS_ROOT, c), c, { fontFaces: faces })
    if ('refused' in r) return { ok: false, code: 'DS_REFUSED', reasons: r.refused }
    return {
      ok: true,
      id: profile.id,
      name: r.name,
      platform,
      slug: r.slug,
      variation: r.variation,
      fontsLoaded
    }
  }
  if (platform === 'joomla') {
    const { joomlaSlot } = await dsSlotModule('joomla')
    const r = joomlaSlot(profile, contractBase(DS_ROOT, c), c)
    if ('refused' in r) return { ok: false, code: 'DS_REFUSED', reasons: r.refused }
    const m = c.module ?? {}
    return {
      ok: true,
      id: profile.id,
      name: profile.name,
      platform,
      html: r.html,
      module: {
        title: String(m.title ?? 'Tracy design system'),
        position: String(m.position ?? 'header-r'),
        ordering: Number(m.ordering ?? 0),
        style: String(m.style ?? 'System-none')
      }
    }
  }
  return { ok: false, code: 'DS_UNKNOWN' }
}

/** How long one css2 link's @font-face rules are kept in this process, and how many links at most. */
export const FONT_FACES_KEEP_MS = 24 * 60 * 60_000
const FONT_FACES_MAX = 256
/** @type {Map<string, { at: number, faces: any[] }>} */
const fontFaces = new Map()

/**
 * Google's @font-face rules for a css2 link (the package's own reader: one request), kept per link
 * for {@link FONT_FACES_KEEP_MS}: the same system asks for the same link on every press, and Google
 * answers it the same (measured 130–240 ms a press on the stand, 11/10/2026). A failed read is not
 * kept — the next press asks again.
 * @param {string | null} href
 * @param {{ read?: (href: string | null) => Promise<any[]>, now?: () => number }} [io]
 */
export async function googleFontFaces(href, io = {}) {
  const now = io.now ?? Date.now
  const key = String(href ?? '')
  const kept = fontFaces.get(key)
  if (kept && now() - kept.at < FONT_FACES_KEEP_MS) return kept.faces
  const read = io.read ?? (await dsSlotModule('library')).googleFontFaces
  const faces = await read(href)
  if (fontFaces.size >= FONT_FACES_MAX)
    fontFaces.delete(/** @type {string} */ (fontFaces.keys().next().value))
  fontFaces.set(key, { at: now(), faces })
  return faces
}
