/**
 * One site URL → one design inspiration on disk, in the site folder (`Brand/<host>/`, Lee 06/09
 * decision 3), in the shape the 152 vendored systems have — so `@tracy/dsh-design-inspiration` can pin it
 * to the front of its library and draw it with the same card, dialog and Guideline pages:
 *
 *   Brand/<host>/prefetch/material.md   what the harvester measured (colours by frequency, fonts, copy)
 *   Brand/<host>/brand.json             the Brand after Tracy's refine step (refine.mjs)
 *   Brand/<host>/logos/*, fonts/*       downloaded by the harvester; fonts/ also holds the self-hosted Google faces
 *   Brand/<host>/imagery/*              the site's representative images (og:image, hero, large <img>), ≤ 8
 *   Brand/<host>/system/*               the engine's output: seed, tokens.*.json, variables*.css, kit*.html, artifacts/*
 *   Brand/<host>/DESIGN.md              brandToDesignMd — same frontmatter shape as the 152 systems
 *   Brand/<host>/tokens.css             the 56 Tracy tokens, mapped from the derived DesignTokens
 *   Brand/<host>/components.html        = system/kit.html, the inspiration's fixture
 *   Brand/<host>/slots.json             its text slots, numbered exactly as build-od-slots numbers the 152
 *   Brand/<host>/artifact-slots.json    the same for its seven artifacts (landing, deck, poster, email, newsletter, form, typography)
 *   Brand/<host>/manifest.json          id `brand:<host>` · kind own|reference · name · notes · source · counts
 *
 * Deterministic and LLM-free: the same site on the same day yields the same files. `index.ts` (the
 * routes and the `tracy_brand` tool) and `scripts/brand-engine.mjs` (the measuring CLI) both call
 * `extractBrand`; nothing here knows about HTTP or dsh.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  brandFromMaterial,
  brandToDesignMd,
  renderTypography,
  buildBrandSystem,
  ensureImageryFallback,
  ensureLogoFallback,
  prefetchBrand,
  prefetchFromHtml,
  selfHostGoogleFonts,
  slugify,
  tracyTokensCss,
  writeBrandSystem
} from '@tracy/od-brand-engine'

// Bundled into lib/index.js at build time (a relative import, not a package): the SAME numbering
// rules as the 152 systems' slots.json, so a brand's kit gets slots the cards already know how to
// fill. `linkedom` behind it stays a runtime dependency of this plugin.
import { slotsOf } from '../../../../../scripts/lib/od-slots-dom.mjs'
import { crawlSite, PAGES_DIR } from './crawl.mjs'
import { runRecon } from './recon.mjs'
import { hostOf, refineBrand } from './refine.mjs'

/** The site-folder directory that holds every extracted brand. Capitalised on purpose: beside `TracyWork/`, `SiteContent/`. */
export const BRAND_DIR = 'Brand'

/** Overall bound for one extraction — the harvester's own per-fetch timeout is 8 s, times a handful of fetches. */
export const EXTRACT_TIMEOUT_MS = 90_000

/**
 * A hostname this plugin will create a directory for: labels of `[a-z0-9-]`, at least one dot, no
 * label starting or ending in `-`. Anything else — an IP, `localhost`, a path — is refused before
 * any `path.join`, because `<host>` becomes a directory name under the site folder.
 */
const SAFE_HOST =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/**
 * The host a customer's input names, or `null` when it cannot become a brand directory.
 * Accepts a bare host (`stripe.com`) as well as a URL.
 * @param {string} input
 * @returns {string | null}
 */
export function brandHostOf(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const host = hostOf(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  // A dotted-digits host is an IP, not a site — and an IP is where SSRF lives (the harvester's
  // safe-fetch refuses private ranges too, but a brand directory named after an IP is wrong anyway).
  if (!host || !SAFE_HOST.test(host) || /^[0-9.]+$/.test(host)) return null
  return host
}

/**
 * The URL to fetch for an input: a bare host becomes `https://<host>/`; `http(s)` URLs pass; any
 * other scheme is refused (the harvester's safe-fetch also refuses, but a clear answer here is cheaper).
 * @param {string} input
 * @returns {string | null}
 */
export function urlOf(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).href
    } catch {
      return null
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null
  return brandHostOf(raw) ? `https://${brandHostOf(raw)}/` : null
}

/**
 * Own site or a reference: own when the input's host is the lane's site, else reference — unless the
 * caller says otherwise (the Brand builder tab may point at the site itself as a reference).
 * @param {string} host
 * @param {string | null} siteKey
 * @param {'own' | 'reference' | undefined} requested
 * @returns {'own' | 'reference'}
 */
export function kindOf(host, siteKey, requested) {
  if (requested === 'own' || requested === 'reference') return requested
  return siteKey !== null && host === siteKey.toLowerCase().replace(/^www\./, '') ? 'own' : 'reference'
}

/**
 * The catalog row this inspiration contributes (spec-brand-engine §3.2). `category` is what the
 * library's chips show; `vi` is false because nothing here is translated; `nav`/`hero` are the
 * engine kit's fixed layout.
 * `source.pages` / `source.recon` say what "Fork a site" left beside the inspiration: the static pages
 * (phase 1) and the rendered-DOM evidence (recon.mjs status) — absent on a plain extraction.
 * @param {{ host: string, kind: 'own' | 'reference', name: string, description: string, url: string, finalUrl: string, thin: boolean, blocked: boolean, notes: string[], counts: Record<string, number>, slug: string, extractedAt: string, pages?: boolean, recon?: string }} m
 */
export function manifestOf(m) {
  return {
    id: `brand:${m.host}`,
    host: m.host,
    kind: m.kind,
    slug: m.slug,
    name: m.name,
    category: m.kind === 'own' ? 'Your brand' : 'Reference',
    description: m.description,
    nav: 'top-left',
    hero: 'centered',
    source: {
      url: m.url,
      finalUrl: m.finalUrl,
      extractedAt: m.extractedAt,
      thin: m.thin,
      blocked: m.blocked,
      ...(m.pages === undefined ? {} : { pages: m.pages }),
      ...(m.recon === undefined ? {} : { recon: m.recon })
    },
    refined: m.notes,
    counts: m.counts
  }
}

/**
 * Upstream's three deterministic harvesters, run after the refine step the way the app runs them
 * before its agent: icons when the page yielded no logo, representative images always (the kit's
 * gallery and the Brand card show them), and the Google Fonts faces the page linked, self-hosted so
 * the kit and artifacts render in the brand's real type. Injectable so a test runs with no network.
 * @typedef {{
 *   logo?: (url: string, logosDir: string, slot: { primary: string | null, alternates: string[], notes: string }) => Promise<{ changed: boolean }>,
 *   imagery?: (url: string, imageryDir: string, slot: { samples?: { file: string, kind?: string, caption?: string }[] }) => Promise<{ changed: boolean }>,
 *   googleFonts?: (brand: import('@tracy/od-brand-engine').Brand, dir: string) => Promise<import('@tracy/od-brand-engine').FontFile[]>
 * }} Enrich
 */
/** @type {Required<Enrich>} */
export const LIVE_ENRICH = {
  logo: ensureLogoFallback,
  imagery: ensureImageryFallback,
  googleFonts: selfHostGoogleFonts
}
/** @type {Required<Enrich>} */
export const NO_ENRICH = {
  logo: async () => ({ changed: false }),
  imagery: async () => ({ changed: false }),
  googleFonts: async () => []
}

/**
 * From harvested material to every file of the inspiration. Split from the fetch so a test can run it
 * on material built from a string (`prefetchFromHtml`) with no network.
 *
 * @param {import('@tracy/od-brand-engine').PrefetchResult} material
 * @param {{ url: string, host: string, kind: 'own' | 'reference', dir: string, onProgress?: (step: string, detail?: string) => void, enrich?: Enrich, pages?: number, recon?: string }} o
 * @returns {Promise<ReturnType<typeof manifestOf>>}
 */
export async function writeDirection(material, o) {
  const progress = o.onProgress ?? (() => {})
  const enrich = { ...LIVE_ENRICH, ...o.enrich }
  await fs.mkdir(path.join(o.dir, 'prefetch'), { recursive: true })
  await fs.writeFile(path.join(o.dir, 'prefetch', 'material.md'), material.materialMd)

  progress('brand')
  const provisional = brandFromMaterial(material, o.url)
  // Both harvest paths leave the concatenated stylesheets here, and `refineBrand` reads the site's
  // own `h1..h6` rule out of them — a declaration count cannot tell a heading from a paragraph.
  const css = await fs.readFile(path.join(o.dir, 'prefetch', 'styles.css'), 'utf8').catch(() => '')
  const { brand, notes } = refineBrand(provisional, material, o.url, { css })

  // Each harvester is best effort and never throws (upstream's contract); a failure leaves the slot as it was.
  if (brand.logo.primary === null) {
    progress('logo-fallback')
    await enrich.logo(o.url, path.join(o.dir, 'logos'), brand.logo).catch(() => ({ changed: false }))
    if (brand.logo.primary !== null)
      notes.push(`logo: none in the page; took ${brand.logo.primary} from the site's icons`)
  }
  progress('imagery')
  /** @type {{ samples?: { file: string, kind?: string, caption?: string }[] }} */
  const imagery = { samples: brand.imagery.samples ?? [] }
  await enrich.imagery(o.url, path.join(o.dir, 'imagery'), imagery).catch(() => ({ changed: false }))
  if (imagery.samples && imagery.samples.length > 0)
    brand.imagery = { ...brand.imagery, samples: imagery.samples }
  progress('imagery-done', `${imagery.samples?.length ?? 0} images`)
  progress('google-fonts')
  let fontFiles = material.fontFiles ?? []
  try {
    const hosted = await enrich.googleFonts(brand, o.dir)
    if (hosted.length > fontFiles.length) {
      notes.push(
        `fonts: ${hosted.length - fontFiles.length} faces self-hosted from Google Fonts (${brand.typography.display.family})`
      )
    }
    if (hosted.length > 0) fontFiles = hosted
  } catch {
    /* the site's own faces from the harvest stay */
  }
  progress('google-fonts-done', `${fontFiles.length} font files`)
  await fs.writeFile(path.join(o.dir, 'brand.json'), `${JSON.stringify(brand, null, 2)}\n`)

  progress('system')
  const system = buildBrandSystem(brand, { fontFiles })
  writeBrandSystem(system, path.join(o.dir, 'system'))
  // Tracy's seventh product: the type specimen with the brand's own DESIGN.md (spec §4h, Lee 06/09 17:4x).
  const designMd = brandToDesignMd(brand)
  await fs.writeFile(
    path.join(o.dir, 'system', 'artifacts', 'typography.html'),
    renderTypography(brand, system.themes.default, { designMd })
  )
  system.files['artifacts/typography.html'] = renderTypography(brand, system.themes.default, { designMd })

  progress('library')
  const kit = system.files['kit.html'] ?? ''
  const display = brand.typography?.display?.family ?? null
  await fs.writeFile(path.join(o.dir, 'DESIGN.md'), designMd)
  const tokensCss = tracyTokensCss(system.themes.default, display)
  await fs.writeFile(path.join(o.dir, 'tokens.css'), tokensCss)
  await fs.writeFile(path.join(o.dir, 'components.html'), kit)
  // The two files a vendored system has that a brand folder lacked (ADR 0023): the reading order
  // an agent follows (`USAGE.md`) and the compact component inventory (`components.manifest.json`),
  // so a brand is one more system to the seeder, the skill and the check — not a special case.
  await fs.writeFile(path.join(o.dir, 'USAGE.md'), usageMdOf(brand, system.seed))
  await fs.writeFile(
    path.join(o.dir, 'components.manifest.json'),
    `${JSON.stringify(componentsManifestOf(`brand:${o.host}`, kit, tokensCss), null, 2)}\n`
  )
  const slots = slotsOf(kit, [])
  await fs.writeFile(
    path.join(o.dir, 'slots.json'),
    `${JSON.stringify({ schemaVersion: 'tracy-od-slots/v1', slots }, null, 1)}\n`
  )
  // The six artifacts' slot maps too: "the customer's Form in this inspiration" is one of them filled
  // with the agent's words (Generate new page, spec §4f decision 9). The engine's templates differ by
  // brand (a logo, a tagline length), so they are measured here, not shared from the library.
  /** @type {Record<string, unknown[]>} */
  const artifacts = {}
  for (const kind of ['landing', 'deck', 'poster', 'email', 'newsletter', 'form', 'typography']) {
    const html = system.files[`artifacts/${kind}.html`]
    if (typeof html === 'string') artifacts[kind] = slotsOf(html, [])
  }
  await fs.writeFile(
    path.join(o.dir, 'artifact-slots.json'),
    `${JSON.stringify({ schemaVersion: 'tracy-od-slots/v1', artifacts }, null, 1)}\n`
  )

  const manifest = manifestOf({
    host: o.host,
    kind: o.kind,
    slug: slugify(brand.name),
    name: brand.name,
    description: brand.description,
    url: o.url,
    finalUrl: material.finalUrl,
    thin: material.thin,
    blocked: material.blocked,
    notes,
    extractedAt: new Date().toISOString(),
    ...(o.pages === undefined ? {} : { pages: true, recon: o.recon }),
    counts: {
      ...(o.pages === undefined ? {} : { pages: o.pages }),
      colors: material.colors.length,
      fonts: material.fonts.length,
      logos: material.logos.length + (brand.logo.primary && !material.logos.length ? 1 : 0),
      imagery: imagery.samples?.length ?? 0,
      fonts_files: fontFiles.length,
      headings: material.headings.length,
      engineFiles: Object.keys(system.files).length,
      slots: slots.length
    }
  })
  await fs.writeFile(path.join(o.dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  progress('done', `${brand.name} · accent ${system.seed.colorPrimary} · ${slots.length} slots`)
  return manifest
}

/**
 * The whole chain for one input. Refuses an input that is not a public http(s) host; returns
 * `{ ok: false, code }` for a site that could not be fetched. Any previous extraction of the same
 * host is replaced whole (logos of the old run would otherwise linger beside the new brand.json).
 *
 * With `pages: true` ("Fork a site", phase 1 + 2) the site is crawled into `pages/` first and the
 * inspiration is read from that folder (`prefetchFromHtml` on the home page + its stylesheets) — one
 * network pass — then `recon.mjs` adds the rendered-DOM evidence when the lane has a browser.
 * `fetch` and `enrich` are injectable so a test runs with no network.
 *
 * @param {{ input: string, siteDir: string, siteKey: string | null, kind?: 'own' | 'reference', pages?: boolean, fetch?: typeof fetch, enrich?: Enrich, reconScriptsDir?: string, onProgress?: (step: string, detail?: string) => void, signal?: AbortSignal }} o
 * @returns {Promise<{ ok: true, manifest: ReturnType<typeof manifestOf> } | { ok: false, code: 'BAD_URL' | 'NO_MATERIAL' | 'ABORTED', error: string }>}
 */
export async function extractBrand(o) {
  const host = brandHostOf(o.input)
  const url = urlOf(o.input)
  if (host === null || url === null) {
    return {
      ok: false,
      code: 'BAD_URL',
      error: `Not a public http(s) site: ${String(o.input).slice(0, 120)}`
    }
  }
  const kind = kindOf(host, o.siteKey, o.kind)
  const dir = path.join(o.siteDir, BRAND_DIR, host)
  // A forked host stays a fork: "Extract again" on the card (or the agent's plain extract) must not
  // wipe pages/ and recon/ — measured 06/09 on lucaswp, where a plain re-extract at 16:11 deleted
  // both and the agent had to git-checkout them back. The whole directory is still replaced; the
  // crawl and the recon simply run again.
  const wasFork = await fs
    .access(path.join(dir, PAGES_DIR, 'pages.json'))
    .then(() => true)
    .catch(() => false)
  const pages = o.pages === true || wasFork
  // 🔒 THE PREVIOUS MEASUREMENT SURVIVES A FAILED ONE. The directory has to be emptied before the
  // harvest — a half-replaced folder is worse than either version — but emptying it up front used
  // to mean that measuring a site which had gone down, moved behind an anti-bot wall, or simply
  // timed out DELETED the good card that was already there. Since measurements are now kept and
  // handed back for thirty days, that card is the product, not a cache.
  //
  // So the old folder steps aside instead of dying, and comes back on any failure. Named `.prev`,
  // which no hostname can be mistaken for: `listBrands` and `readBrands` both require the manifest
  // to say `brand:<the directory's own name>`, and this one says `brand:<host>`.
  const aside = `${dir}.prev`
  await fs.rm(aside, { recursive: true, force: true })
  const hadPrevious = await fs
    .rename(dir, aside)
    .then(() => true)
    .catch(() => false)
  /** Put the previous measurement back, or clear the wreckage when there was none. */
  const rollBack = async () => {
    await fs.rm(dir, { recursive: true, force: true })
    if (hadPrevious) await fs.rename(aside, dir).catch(() => undefined)
  }
  await fs.mkdir(dir, { recursive: true })
  let material
  /** @type {number | undefined} */
  let pageCount
  try {
    if (pages) {
      const crawl = await crawlSite(url, dir, { fetch: o.fetch, onProgress: o.onProgress, signal: o.signal })
      pageCount = crawl.pages.length
      const home = crawl.pages[0]
      const html = home ? await fs.readFile(path.join(dir, home.file), 'utf8') : ''
      const css = await fs.readFile(path.join(dir, PAGES_DIR, 'styles.css'), 'utf8').catch(() => '')
      material = await prefetchFromHtml(html, css, url, dir, o.onProgress)
      if (material && home) material = { ...material, finalUrl: home.url }
    } else {
      material = await prefetchBrand(url, dir, { onProgress: o.onProgress, signal: o.signal })
    }
  } catch (error) {
    await rollBack()
    const aborted = o.signal?.aborted === true
    return {
      ok: false,
      code: aborted ? 'ABORTED' : 'NO_MATERIAL',
      error: aborted ? 'Extraction stopped.' : error instanceof Error ? error.message : String(error)
    }
  }
  if (!material) {
    await rollBack()
    return { ok: false, code: 'NO_MATERIAL', error: `${host} could not be fetched from the lane.` }
  }
  /** @type {string | undefined} */
  let recon
  if (pages) {
    const r = await runRecon(url, dir, {
      scriptsDir: o.reconScriptsDir,
      onProgress: o.onProgress,
      signal: o.signal
    })
    recon = r.status
    if (r.detail) o.onProgress?.('recon-note', `${r.status}: ${r.detail}`)
  }
  const manifest = await writeDirection(material, {
    url,
    host,
    kind,
    dir,
    onProgress: o.onProgress,
    enrich: o.enrich,
    pages: pageCount,
    recon
  })
  await fs.rm(aside, { recursive: true, force: true })
  return { ok: true, manifest }
}

/**
 * Every extracted brand in the site folder, own first, then newest first.
 * @param {string} siteDir
 * @returns {Promise<ReturnType<typeof manifestOf>[]>}
 */
export async function listBrands(siteDir) {
  /** @type {ReturnType<typeof manifestOf>[]} */
  const out = []
  let entries
  try {
    entries = await fs.readdir(path.join(siteDir, BRAND_DIR), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (!e.isDirectory() || !SAFE_HOST.test(e.name)) continue
    try {
      const parsed = JSON.parse(
        await fs.readFile(path.join(siteDir, BRAND_DIR, e.name, 'manifest.json'), 'utf8')
      )
      if (parsed && typeof parsed === 'object' && parsed.id === `brand:${e.name}`) out.push(parsed)
    } catch {
      /* a directory without a readable manifest is an extraction in progress or a failed one: not a brand */
    }
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'own' ? -1 : 1
    return String(b.source?.extractedAt ?? '').localeCompare(String(a.source?.extractedAt ?? ''))
  })
  return out
}

/**
 * `USAGE.md` in the shape upstream OpenDesign writes for each of the 154: the read order, the
 * highlights, and the do/avoid lines an agent is held to — for a brand, filled from `brand.json`.
 * @param {{ name: string, description?: string, colors?: { role?: string, hex?: string }[], typography?: { display?: { family?: string }, body?: { family?: string } } }} brand
 * @param {{ colorPrimary?: string }} seed
 */
export function usageMdOf(brand, seed) {
  const accent = brand.colors?.find((c) => c.role === 'accent')?.hex ?? seed.colorPrimary ?? ''
  const display = brand.typography?.display?.family ?? ''
  const body = brand.typography?.body?.family ?? ''
  return [
    `# ${brand.name} Usage`,
    '',
    "The customer's own brand as a design-system package, extracted by Tracy's brand engine.",
    '',
    '## Read Order',
    '',
    '1. Read this file first to understand the package contract.',
    '2. Read `DESIGN.md` for visual intent, constraints, and anti-patterns.',
    '3. Take every colour, font, size and space from `tokens.css` (the 56 tokens every Tracy system shares).',
    '4. Use `components.manifest.json` for the compact component inventory; open `components.html` when exact selectors or states matter.',
    '5. `system/artifacts/*.html` are sample products in this brand; `logos/`, `fonts/`, `imagery/` are the harvested assets.',
    '',
    '## Design Highlights',
    '',
    `- Brand: ${brand.name}${brand.description ? ` — ${brand.description}` : ''}`,
    `- Primary: \`${accent}\` — the accent of the harvested site.`,
    `- Type: ${display || 'system'} for display${body ? `, ${body} for body` : ''}.`,
    '',
    '## Do',
    '',
    '- Keep the palette and type to the tokens; a colour or font outside them is not this brand.',
    '- Reuse the components of `components.html` before inventing parallel ones.',
    '',
    '## Avoid',
    '',
    '- Avoid raw hex values outside the copied `:root` token block.',
    "- Avoid other brands' logos, taglines or imagery: these files hold the customer's own.",
    ''
  ].join('\n')
}

/**
 * The component groups upstream's inventory names, each with the words that place a selector or a
 * class in it and the markup that proves it is on the page. The engine's kit draws most components
 * with inline styles and few classes — a button is `<a role="button">` — so the markup test is
 * what makes `present` honest there.
 */
const COMPONENT_GROUPS = [
  ['buttons', 'Buttons and calls to action', /\b(btn|button|cta)\b/i, ['button'], /role="button"|<button\b/i],
  [
    'inputs',
    'Form fields and controls',
    /\b(field|input|select|textarea|checkbox|radio|control)\b/i,
    ['input', 'select', 'textarea', 'label'],
    /<(input|select|textarea)\b/i
  ],
  ['cards', 'Cards and panels', /\b(card|panel|tile)\b/i, [], null],
  ['badges', 'Badges, tags and chips', /\b(badge|tag|chip|pill)\b/i, [], null],
  [
    'navigation',
    'Navigation and headers',
    /\b(nav|header|menu|topbar|brand)\b/i,
    ['nav', 'header'],
    /<(nav|header)\b/i
  ],
  ['hero', 'Hero and lead sections', /\b(hero|lead|masthead)\b/i, [], null],
  ['tables', 'Tables and lists', /\b(table|row|list)\b/i, ['table', 'ul', 'ol'], /<table\b/i],
  ['footer', 'Footer', /\b(footer)\b/i, ['footer'], /<footer\b/i],
  [
    'feedback',
    'Alerts, notices and status',
    /\b(alert|notice|toast|status|banner)\b/i,
    [],
    /role="alert"|role="status"/i
  ]
]

/**
 * `components.manifest.json` in upstream's shape (schemaVersion 1): what the fixture declares
 * and which component groups are present, read off `components.html` and `tokens.css`.
 * @param {string} brandId
 * @param {string} kitHtml
 * @param {string} tokensCss
 */
export function componentsManifestOf(brandId, kitHtml, tokensCss) {
  const styles = [...kitHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
  const css = styles.join('\n')
  const selectors = [
    ...new Set(
      [...css.matchAll(/(?:^|[}\s])([^{}@/]+?)\s*\{/g)]
        .flatMap((m) => m[1].split(',').map((x) => x.trim()))
        .filter((x) => x && !x.startsWith('@'))
    )
  ].sort()
  const classes = [
    ...new Set([...kitHtml.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean))
  ].sort()
  const elements = [
    ...new Set(
      [...kitHtml.matchAll(/<([a-z][a-z0-9-]*)\b/g)]
        .map((m) => m[1])
        .filter((t) => !['html', 'head', 'body', 'style', 'script', 'meta', 'link', 'title'].includes(t))
    )
  ].sort()
  const declared = [
    ...new Set(
      [...tokensCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])
    )
  ].sort()
  const title = /<title>([^<]*)<\/title>/i.exec(kitHtml)?.[1]?.trim() ?? ''
  const groups = COMPONENT_GROUPS.map(([id, label, re, tags, markup]) => {
    const groupSelectors = selectors.filter(
      (sel) => re.test(sel) || tags.some((t) => new RegExp(`(^|[\\s>+~])${t}(?![a-z0-9-])`).test(sel))
    )
    const groupClasses = classes.filter((c) => re.test(c))
    const groupElements = elements.filter((e) => tags.includes(e))
    const inMarkup = markup !== null && markup.test(kitHtml)
    const refs = [
      ...new Set(
        groupSelectors.flatMap((sel) => {
          const i = css.indexOf(sel)
          if (i < 0) return []
          const block = css.slice(i, css.indexOf('}', i))
          return [...block.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1])
        })
      )
    ].sort()
    return {
      id,
      label,
      present: inMarkup || groupSelectors.length > 0 || groupClasses.length > 0 || groupElements.length > 0,
      selectors: groupSelectors,
      classes: groupClasses,
      elements: groupElements,
      tokenReferences: refs
    }
  })
  return {
    schemaVersion: 1,
    brandId,
    source: { componentsHtml: 'components.html', tokensCss: 'tokens.css' },
    fixture: {
      title,
      description: 'Component kit generated by the brand engine from the harvested brand.',
      styleBlockCount: styles.length,
      selectorCount: selectors.length,
      classCount: classes.length,
      elementCount: elements.length
    },
    tokens: { declared },
    selectors,
    classes,
    elements,
    groups
  }
}
