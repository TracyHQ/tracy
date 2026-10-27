#!/usr/bin/env node
// This template's own contract generator. `tools/build-qa-contract.mjs` beside it is the kit's copy
// (the Tracy Business generator the kit ships as its example) and is not used here.
// Build qa.contract.json for JA Kinetic from a crawl of the running Joomla quickstart, the seed and the
// template config. Every expected string is read from the CRAWLED SOURCE HTML at generation time, never
// from the running EmDash site; theme colours are parsed from the visual contract's token table (values
// computed on the rendered source, 15/09). Nothing machine-specific is written into the contract.
//   node tools/build-qa-contract-kinetic.mjs <source-crawl-dir> <visual-contract.md>
//        [--config template.config.json] [--seed seed/seed.json] [--out qa.contract.json]
// <source-crawl-dir> holds crawl.json (page URL → file) plus the saved pages and assets; it is also the
// folder `qa-contract.mjs --source` hashes. Re-run this after a new crawl: routes whose own page is
// missing from the crawl fall back to a family stand-in automatically, and pick up their own page
// (with its strings) once a crawl provides it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { initContract, filesUnder } from './qa-contract.mjs'
import { deriveShots } from './fast-gate.mjs'
import { importClosure } from './visual-lib.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const [sourceDir, visualContractFile] = args
if (!sourceDir || !visualContractFile || sourceDir.startsWith('--')) {
  console.error(
    'usage: build-qa-contract.mjs <source-crawl-dir> <visual-contract.md> [--config f] [--seed f] [--out f]'
  )
  process.exit(2)
}
const config = JSON.parse(readFileSync(opt('--config', 'template.config.json'), 'utf8'))
const seed = JSON.parse(readFileSync(opt('--seed', 'seed/seed.json'), 'utf8'))
const crawl = JSON.parse(readFileSync(path.join(sourceDir, 'crawl.json'), 'utf8'))
const fail = (msg) => {
  throw new Error(msg)
}

// ── reading the crawl ─────────────────────────────────────────────────────────────────────────────
const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  mdash: '—',
  ndash: '–',
  hellip: '…'
}
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
const textOf = (html) =>
  decode(html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
const htmlCache = new Map()
const htmlOf = (file) => {
  if (!htmlCache.has(file))
    htmlCache.set(
      file,
      readFileSync(path.join(sourceDir, file), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '')
    )
  return htmlCache.get(file)
}
// The text of the first element whose opening tag carries `cls` (a class token). Fails loudly: a
// missing string means the crawl changed shape, and a contract built on a guess is worse than none.
const byClass = (file, cls, tag = '[a-z0-9]+') => {
  const re = new RegExp(`<(${tag})\\b[^>]*class="(?:[^"]*\\s)?${cls}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</\\1>`)
  const m = htmlOf(file).match(re)
  if (!m) fail(`source ${file}: no element with class ${cls}`)
  return textOf(m[2])
}
const within = (file, outerCls, innerCls) => {
  const html = htmlOf(file)
  const i = html.search(new RegExp(`class="(?:[^"]*\\s)?${outerCls}(?:\\s[^"]*)?"`))
  if (i < 0) fail(`source ${file}: no ${outerCls}`)
  const slice = html.slice(i, i + 4000)
  const m = slice.match(
    new RegExp(`<([a-z0-9]+)\\b[^>]*class="(?:[^"]*\\s)?${innerCls}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</\\1>`)
  )
  if (!m) fail(`source ${file}: no ${innerCls} inside ${outerCls}`)
  return textOf(m[2])
}
// First <p> after the element carrying `cls` (list mastheads print their description as a bare <p>).
const pAfter = (file, cls) => {
  const html = htmlOf(file)
  const i = html.search(new RegExp(`class="(?:[^"]*\\s)?${cls}(?:\\s[^"]*)?"`))
  if (i < 0) fail(`source ${file}: no ${cls}`)
  const m = html.slice(i, i + 3000).match(/<p\b[^>]*>([\s\S]*?)<\/p>/)
  if (!m) fail(`source ${file}: no <p> after ${cls}`)
  return textOf(m[1])
}
// A megamenu label, for routes whose own page the crawl does not hold: Joomla's page title of a menu
// item is the item's title, which every crawled page prints in its megamenu.
const menuLabel = (file, url) => {
  const m = htmlOf(file).match(
    new RegExp(
      `href="${url.replace(/[.?]/g, '\\$&')}"[^>]*>(?:\\s*<span[^>]*>)*\\s*<span class="menu-item-title">([^<]+)<`
    )
  )
  if (!m) fail(`source ${file}: no menu item for ${url}`)
  return textOf(m[1])
}
const titleOf = (file) =>
  textOf((htmlOf(file).match(/<title>([^<]*)<\/title>/) ?? fail(`no <title> in ${file}`))[1])
const urlPath = (u) => {
  const x = new URL(decode(u))
  return x.pathname + x.search
}
// crawl.json can name one file for several URLs (the crawler saved `?view=category&id=2` and `?start=N`
// onto the page's own file, the last write wins). A file HOLDS the last crawled URL whose recorded
// <title> matches the file's <title> now.
const urlsByFile = new Map()
for (const p of crawl.pages) {
  if (!urlsByFile.has(p.file)) urlsByFile.set(p.file, [])
  urlsByFile.get(p.file).push({ url: urlPath(p.url), title: decode(p.title ?? '') })
}
const heldUrls = (file) => {
  const t = titleOf(file)
  return (urlsByFile.get(file) ?? []).filter((e) => e.title === t).map((e) => e.url)
}
const heldUrl = (file) => heldUrls(file).at(-1) ?? null
const fileFor = (url) => crawl.pages.find((p) => urlPath(p.url) === url)?.file ?? null
// The page's own crawled file when the file still holds that URL, else null (the route then cites a
// stand-in). `/` and `/index.php` share one file and one title, so any matching URL counts.
const ownFile = (url) => {
  const f = fileFor(url)
  if (!f || !existsSync(path.join(sourceDir, f))) return null
  return heldUrls(f).includes(url) ? f : null
}

// ── theme tokens: visual-contract.md §1, one column per direction × theme ─────────────────────────
const tokens = (() => {
  const md = readFileSync(visualContractFile, 'utf8')
  const rows = md.split('\n').filter((l) => /^\|\s*`--[a-z-]+`\s*\|/.test(l))
  const head =
    md.split('\n').find((l) => /^\|\s*Vai\s*\|\s*terminal light/.test(l)) ??
    fail('visual contract: no token table header')
  const cols = head
    .split('|')
    .slice(2, -1)
    .map((c) => c.trim().replace(' ', '-'))
  const out = {}
  for (const row of rows) {
    const cells = row
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    const name = cells[0].replace(/`/g, '').slice(2)
    cells.slice(1).forEach((v, i) => ((out[cols[i]] ??= {})[name] = v))
  }
  for (const k of [
    'terminal-light',
    'terminal-dark',
    'blueprint-light',
    'blueprint-dark',
    'signal-light',
    'signal-dark'
  ])
    for (const t of ['bg', 'text', 'elevated', 'border', 'primary', 'primary-ink'])
      if (!/^#[0-9A-F]{6}$/i.test(out[k]?.[t] ?? '')) fail(`visual contract: ${k} --${t} missing`)
  return out
})()
const rgb = (hex) =>
  `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`

// ── skeleton ──────────────────────────────────────────────────────────────────────────────────────
const c = initContract(sourceDir, config)
c.source.reference =
  'JA Kinetic Joomla 6 quickstart 1.0.0 (ja-kinetic-j6-quickstart-1.0.0.zip, sha256 e08d46fd…402ce36, DECISIONS D1) run locally; ' +
  `same-origin crawl of ${crawl.pages.length} page URLs (maxPages ${crawl.maxPages}, ${crawl.crawledAt}) saved as HTML + assets, crawl.json maps URL → file`
// A crawl of a rendered URL: two-sided parity reads the saved pages served from this folder (--source-site).
c.source.kind = 'url'
c.source.parity = 'two-sided'
// r1 (2026-09-15): first contract of this template. r2: repaired crawl (inner pages and blog page 2 cite
// their own files, D25), article route = Joomla alias (D23), list headings/subs, standfirsts and the author
// tagline asserted as data (D24), megamenu re-hover note. r3: interaction states moved to 200 tag routes;
// 404 chrome cites pricing (inactive first nav item); h2/eyebrow/card/mono-button rules re-derived per
// component from source measurements; per-component h2 parity pairs. r4: one masthead eyebrow style on
// all eight pages (D26), Contact-only mastEyebrow parity pair, no exceptions (see the eyebrow rules).
// r5: Integrations and Changelog assert their masthead sub as content `sub` without a lede parity pair (D27).
// r6: navLink / headerCta site sides are `:visible`, so they compare only where both sides render (≥ 992px).
// r7: framed masthead h1 unpaired on the seven inner pages, asserted by `mast-title-framed` (D28); framed sub
// rule `mast-sub-framed`; FAQ drops its lede pair (source 15 / 26.25 at 390).
// r8: three scan:bright-border exceptions for state accents (D29).
c.revision = 8
c.design.theme = config.qa.theme

// Fonts: the three families of visual-contract §2, self-hosted through Astro Fonts. CDP reports the
// variable Space Grotesk under its default instance name "Space Grotesk Light". The fallbacks are what
// the declared stacks resolve to in Chrome on macOS (system-ui → .SF NS, monospace → Menlo); none
// rendered a glyph on the probed pages, so any other family is a substitution for font-review.
c.fonts = {
  selectors: ['h1', 'h2', 'h3', 'p', 'a', 'button', 'input', 'label', 'code'],
  platform: 'macOS (Chrome); Space Grotesk + IBM Plex Sans + JetBrains Mono, self-hosted',
  allowed: {
    en: ['Space Grotesk', 'Space Grotesk Light', 'IBM Plex Sans', 'JetBrains Mono', '.SF NS', 'Menlo']
  }
}

// ── design rules ──────────────────────────────────────────────────────────────────────────────────
// Values are the rendered source's computed styles (visual-contract.md §1–§3, measured at 1440 × 1000).
// Properties the contract measured at one width only (type sizes, tracking) are asserted at 1440; the
// narrower variants assert what does not scale (family, weight, radius, container gutter) and leave
// size to design.parity, which reads the source render at the same viewport.
const perVariant = (fn) => Object.fromEntries(c.variants.map((v) => [v.id, fn(v)]))
const wide = (v) => v.width >= 1440
const STYLES = ['terminal', 'blueprint', 'signal']
const tok = (style, v) => tokens[`${style}-${v.theme}`]
const rule = (id, selector, styles, extra = {}) => ({
  id,
  selector,
  source: 'index.html',
  ...extra,
  styles: perVariant(styles)
})
c.design.rules = [
  rule('body-font', 'body', () => ({ 'font-family': 'IBM Plex Sans', 'font-size': '16px' })),
  // Surfaces per direction (html[data-style]); a page lists the rule of its own style.
  ...STYLES.map((s) =>
    rule(`surface-${s}`, 'body', (v) => ({
      'background-color': rgb(tok(s, v).bg),
      color: rgb(tok(s, v).text)
    }))
  ),
  ...STYLES.map((s) =>
    rule(`footer-${s}`, 'footer.k-footer', (v) => ({
      'background-color': rgb(tok(s, v).elevated),
      'border-top-color': rgb(tok(s, v).border),
      'border-top-width': '1px'
    }))
  ),
  // The measured primary button is the header CTA (§2: 14px / 600, radius 8, 33px tall). The header
  // swaps it for the drawer below 992px, so the rule is optional; mobile is covered by `drawer`.
  ...STYLES.map((s) =>
    rule(
      `btn-primary-${s}`,
      'header .k-header-cta',
      (v) => ({
        'font-family': 'IBM Plex Sans',
        'font-size': '14px',
        'font-weight': '600',
        'border-top-left-radius': '8px',
        height: '33px',
        'background-color': rgb(tok(s, v).primary),
        color: rgb(tok(s, v)['primary-ink'])
      }),
      { optional: true }
    )
  ),
  // Container 1240 + 32px gutter, 20px under 620px (§3). The header row is the one container every page has.
  rule('container', 'header.k-header .k-header-row', (v) => ({
    'max-width': '1240px',
    'padding-left': v.width < 620 ? '20px' : '32px',
    'padding-right': v.width < 620 ? '20px' : '32px'
  })),
  // Nav link §2: IBM Plex Sans 14, padding 8×12, radius 8. Hidden under 992px (drawer), hence optional.
  rule(
    'nav-link',
    'header .k-nav-link',
    () => ({
      'font-family': 'IBM Plex Sans',
      'font-size': '14px',
      'padding-left': '12px',
      'border-top-left-radius': '8px'
    }),
    { optional: true }
  ),
  // Hero h1 §2: Space Grotesk 700, 52 / 54.08, −1.5px.
  rule('h1-hero', 'main .hero-title', (v) => ({
    'font-family': 'Space Grotesk',
    'font-weight': '700',
    ...(wide(v) ? { 'font-size': '52px', 'line-height': '54.08px', 'letter-spacing': '-1.5px' } : {})
  })),
  rule('h1-any', 'main h1', () => ({ 'font-family': 'Space Grotesk', 'font-weight': '700' })),
  // Section h2 — r3: MEASURED on the source render (static crawl :4380, Chrome, 15/09), per component and
  // width, because the source has no single section-h2 size (visual-contract §2's "38" was one element):
  //   bento title   .acm-bento-title            1440 38/41.04 −1   · 768 38/41.04 −1   · 390 27/29.16 −1
  //   query split   .acm-split-title            1440 34/38.08 −0.8 · 768 30/33.6 −0.8  · 390 27/30.24 −0.8
  //   timeline      .acm-incident-head .hx-h2   1440 34/37.4 −0.8  · 768 34/37.4 −0.8  · 390 26/28.6 −0.5
  //   ledger (landing) .hx-h2 "Built for the pager" 1440 38/41.04 −1 · 768 38/41.04 −1 · 390 27/29.16 −0.6
  //   inner pages (760 column) .hx-h2           1440 24 −0.5 · 768 24 −0.5 · 390 22 −0.5 (line-height 25.92–27.6
  //                                             varies by instance, not asserted)
  ...[
    [
      'h2-bento',
      'main .bento-title',
      {
        1440: ['38px', '41.04px', '-1px'],
        768: ['38px', '41.04px', '-1px'],
        390: ['27px', '29.16px', '-1px']
      }
    ],
    [
      'h2-split',
      'main .split-title',
      {
        1440: ['34px', '38.08px', '-0.8px'],
        768: ['30px', '33.6px', '-0.8px'],
        390: ['27px', '30.24px', '-0.8px']
      }
    ],
    [
      'h2-timeline',
      'main .tl:not(.is-narrow) .tl-title',
      {
        1440: ['34px', '37.4px', '-0.8px'],
        768: ['34px', '37.4px', '-0.8px'],
        390: ['26px', '28.6px', '-0.5px']
      }
    ],
    [
      'h2-ledger',
      'main .fl:not(.is-narrow) .k-h2',
      {
        1440: ['38px', '41.04px', '-1px'],
        768: ['38px', '41.04px', '-1px'],
        390: ['27px', '29.16px', '-0.6px']
      }
    ],
    [
      'h2-narrow',
      'main .is-narrow .k-h2',
      { 1440: ['24px', null, '-0.5px'], 768: ['24px', null, '-0.5px'], 390: ['22px', null, '-0.5px'] }
    ]
  ].map(([id, selector, table]) =>
    rule(
      id,
      selector,
      (v) => {
        const [size, lh, ls] = table[v.width]
        return {
          'font-family': 'Space Grotesk',
          'font-weight': '700',
          'font-size': size,
          ...(lh ? { 'line-height': lh } : {}),
          'letter-spacing': ls
        }
      },
      { optional: true }
    )
  ),
  rule('h2-any', 'main h2', () => ({ 'font-family': 'Space Grotesk' }), { optional: true }),
  // Eyebrows §2: JetBrains Mono, uppercase everywhere. Sizes — r3: MEASURED on the source at 1440 per
  // component (the §2 "12.5px / 2px" is the hero's; other components differ on the source itself):
  //   12px / 2px    .hx-cta-eyebrow (article/blog/page CTA band) · .acm-bento-eyebrow · .acm-split-eyebrow ·
  //                 timeline and testimonial .hx-eyebrow · pricing matrix "(02) / COMPARE PLANS"
  //   12.5px / 2px  hero, features ledger, accordion ("// pricing faq"), teams ("(04) / THE TEAM")
  //   features-intro eyebrow: 12px on features, 12.5px on about — no single source value, family only.
  //   masthead      r4, DECISIONS D26 (SOURCE): the site uses ONE masthead eyebrow on all eight pages,
  //                 12.5px / 2px / uppercase / JetBrains Mono, pill. The source varies it per page through
  //                 page-specific CSS only (helix-page-<slug>), measured 1440 on :4380 against :4370, both themes:
  //                   features, integrations, changelog, faq  11.5px / 1.5px (faq: theme-primary pill tint)
  //                   team      letter-spacing normal, text-transform none
  //                   about     plain text: no pill (padding 0, radius 0, no border)
  //                   pricing   size/tracking as the site; pill radius 100px vs 999px, lime tint in light too
  //                   contact   identical on every property in both themes — the one two-sided pair (mastEyebrow)
  //                 No design.exceptions entry is needed: exceptions match a finding's element / rule /
  //                 selector (pair key) / state — never its page or property — and no comparison reads the
  //                 masthead eyebrow from the source except the Contact pair, which matches.
  rule(
    'eyebrow',
    'main .k-eyebrow',
    () => ({ 'font-family': 'JetBrains Mono', 'text-transform': 'uppercase' }),
    { optional: true }
  ),
  rule(
    'eyebrow-12',
    'main .cta-eyebrow, main .bento-eyebrow, main .split-eyebrow, main .tl-eyebrow, main section.t .k-eyebrow, main .matrix .k-eyebrow',
    (v) => (wide(v) ? { 'font-size': '12px', 'letter-spacing': '2px' } : { 'font-family': 'JetBrains Mono' }),
    { optional: true }
  ),
  rule(
    'eyebrow-12-5',
    'main .hero-eyebrow, main .fl-eyebrow, main .acc .k-eyebrow, main .teams .k-eyebrow',
    (v) =>
      wide(v) ? { 'font-size': '12.5px', 'letter-spacing': '2px' } : { 'font-family': 'JetBrains Mono' },
    { optional: true }
  ),
  rule('mast-eyebrow', 'main .pm-eyebrow', (v) => ({
    'font-family': 'JetBrains Mono',
    'text-transform': 'uppercase',
    ...(wide(v) ? { 'font-size': '12.5px', 'letter-spacing': '2px' } : {})
  })),
  // Framed masthead title — r7, DECISIONS D28 (SOURCE): one site rule replaces the two-sided h1 pair on the
  // seven framed pages. The source uses 46 / 49.68 / −1.3 on all seven at ≥ 861px (the site's 1440 value)
  // and a per-page size below, measured on :4380 (size / line-height / letter-spacing):
  //                 768                    390
  //   pricing       36 / 38.88 / −1.3      28 / 30.24 / −0.8
  //   features      30 / 32.4 / −0.8       30 / 32.4 / −0.8
  //   integrations  46 / 49.68 / −1.3      30 / 33 / −1
  //   changelog     38 / 41.04 / −1        33 / 35.64 / −1
  //   faq           38 / 41.04 / −1        32 / 34.56 / −0.8
  //   about         46 / 49.68 / −1.3      34 / 36.72 / −1
  //   team          32 / 34.56 / −1        32 / 34.56 / −1
  // No size has a majority; the site: 46 / 49.68 / −1.3 → 38 / 41.04 / −1 at ≤ 860 → 32 / 34.56 / −1 at ≤ 620.
  rule('mast-title-framed', 'main .pm.is-narrow .pm-title', (v) => ({
    'font-family': 'Space Grotesk',
    'font-weight': '700',
    ...{
      1440: { 'font-size': '46px', 'line-height': '49.68px', 'letter-spacing': '-1.3px' },
      768: { 'font-size': '38px', 'line-height': '41.04px', 'letter-spacing': '-1px' },
      390: { 'font-size': '32px', 'line-height': '34.56px', 'letter-spacing': '-1px' }
    }[v.width]
  })),
  // Framed masthead sub — D27 line-height 1.75 at every width, D28 16px at ≤ 620 (17 / 29.75 → 16 / 28). On
  // the source Pricing, Features, About and Team match at 1440/768/390; Integrations and Changelog are
  // 17 / 27.2 (15 / 24 at 390) and FAQ 15 / 26.25 at 390, which is why those three pages do not pair it.
  rule('mast-sub-framed', 'main .pm.is-narrow .pm-sub', (v) =>
    v.width <= 620
      ? { 'font-size': '16px', 'line-height': '28px' }
      : { 'font-size': '17px', 'line-height': '29.75px' }
  ),
  // Sub / lede §2: IBM Plex Sans 17px, max-width 460.
  rule(
    'sub',
    'main .k-sub',
    (v) => ({
      'font-family': 'IBM Plex Sans',
      ...(wide(v) ? { 'font-size': '17px', 'max-width': '460px' } : {})
    }),
    { optional: true }
  ),
  // Buttons §2: primary IBM Plex Sans 600; ghost JetBrains Mono 600, radius 9. r3: the query split's CTA
  // (.acm-split-cta, "Read the HelixQL docs") is a mono button on the source: JetBrains Mono 500 (measured 1440).
  rule(
    'btn-any',
    'main .k-btn:not(.k-btn-ghost):not(.split-cta)',
    () => ({ 'font-family': 'IBM Plex Sans', 'font-weight': '600' }),
    {
      optional: true
    }
  ),
  rule('btn-mono', 'main .split-cta', () => ({ 'font-family': 'JetBrains Mono', 'font-weight': '500' }), {
    optional: true
  }),
  rule(
    'btn-ghost',
    'main .k-btn-ghost',
    () => ({ 'font-family': 'JetBrains Mono', 'font-weight': '600', 'border-top-left-radius': '9px' }),
    { optional: true }
  ),
  // Cards §3: 1px border. Radius — r3: MEASURED on the source (1440): 16px bento tiles (.acm-bento-tile),
  // testimonials (.hx-testi-*), spec rows (.hx-specrows) · 14px value/feature cards (.hx-feat) · 12px
  // integration cards (.acm-clients-card) and landing stat cards (.hx-stat).
  rule('card', 'main .k-card', () => ({ 'border-top-width': '1px' }), { optional: true }),
  rule(
    'card-16',
    'main .k-card.tile, main .k-card.t-card, main .k-card.fl-list',
    () => ({ 'border-top-left-radius': '16px' }),
    { optional: true }
  ),
  rule('card-14', 'main .k-card.fi-card', () => ({ 'border-top-left-radius': '14px' }), { optional: true }),
  rule(
    'card-12',
    'main .k-card.integ-card, main .k-card.fl-stat',
    () => ({ 'border-top-left-radius': '12px' }),
    { optional: true }
  ),
  rule('footer-link', 'footer .k-footer-col a', () => ({ 'font-family': 'IBM Plex Sans' }), {
    optional: true
  })
]
// Coverage: every visible element of these roles must be measured by a rule above (visual-review-method.md).
c.design.coverage = [
  { selector: 'main h1', properties: ['font-family', 'font-weight'] },
  { selector: 'main h2', properties: ['font-family'] },
  { selector: 'main .k-eyebrow', properties: ['font-family', 'text-transform'] },
  { selector: 'main .k-btn', properties: ['font-family', 'font-weight'] },
  { selector: 'main .k-card', properties: ['border-top-width'] },
  { selector: 'header .k-nav-link', properties: ['font-size'] },
  { selector: 'footer .k-footer-col a', properties: ['font-family'] }
]
// Parity: the same logical element on the saved source page and on the site. The source has no <main>
// and no utility classes, so source sides use its own component classes (read from the crawl) or the
// content text. Source dark mode is `html.t4-dark` (darkmode.js sets class + data-theme together), so
// the source theme hook writes the class attribute; `j6` is the class the page ships with.
const CHROME_PAIRS = ['navLink', 'headerCta', 'wordmark', 'footer', 'footerLink', 'footerHeading']
c.design.parity = {
  properties: [
    'color',
    'background-color',
    'font-family',
    'font-size',
    'font-weight',
    'letter-spacing',
    'line-height',
    'padding-top',
    'padding-left',
    'border-top-left-radius',
    'border-top-color',
    'border-top-width'
  ],
  hexTolerance: 8,
  pxTolerance: 0.5,
  // Three signals, measured 16/09 on the live source through its own cookie (`ja_kinetic-theme`):
  // `class` (t4-dark) drives text colour, `data-bs-theme` paints section surfaces (the testimonials
  // band), `data-theme` is carried because the source sets it. Flipping only `class` produced a
  // light page with a dark band and a dark-on-dark heading — see D31/D38.
  sourceTheme: [
    { selector: 'html', attribute: 'class', values: { light: 'j6', dark: 'j6 t4-dark' } },
    { selector: 'html', attribute: 'data-theme', values: { light: 'light', dark: 'dark' } },
    { selector: 'html', attribute: 'data-bs-theme', values: { light: 'light', dark: 'dark' } }
  ],
  selectors: {
    h1: { content: 'h1' },
    lede: { content: 'lede' },
    heroCta: { site: 'main .hero .k-btn-primary', source: '.acm-hero-copy .hx-btn--primary' },
    eyebrow: { site: 'main .hero .k-eyebrow', source: '.acm-hero-copy .hx-eyebrow' },
    // r3: one pair per section heading. A generic `.k-h2` ↔ `.hx-h2` pair matched the site's bento title
    // against the source's timeline heading on home (34 vs 38 was two different elements).
    bentoH2: { site: 'main .bento-title', source: '.acm-bento-title' },
    splitH2: { site: 'main .split-title', source: '.acm-split-title' },
    timelineH2: { site: 'main .tl-title', source: '.acm-incident-head .hx-h2' },
    mastEyebrow: { site: 'main .pm-eyebrow', source: '.hx-mast-head .hx-eyebrow' },
    // r6: below 992px the source drops the inline nav and header CTA (the drawer replaces them) while the
    // site keeps both in the DOM, hidden by CSS. visual-qa reads the site side with page.locator(...).first()
    // and no visibility test, the source side with visible elements only, so a hidden site element was
    // "present on one side" at 768/390. Playwright's `:visible` makes the site side absent where the element
    // is not rendered: both sides absent is silent, and 1440 still compares the same elements. Cost: each
    // empty `:visible` lookup waits out visual-qa's 3s evaluate timeout (~6s per narrow axis, measured).
    // The site selectors reach only Playwright locators (visual-qa.mjs 415/422), never querySelector.
    navLink: { site: 'header .k-nav-link:visible', source: '#t4-megamenu-mainmenu .nav-link' },
    headerCta: { site: 'header .k-header-cta:visible', source: '.kinetic-header .hx-cta-pill' },
    wordmark: { site: 'header .k-wordmark', source: '.kinetic-logo-text' },
    footer: { site: 'footer.k-footer', source: 'footer.kinetic-footer' },
    footerLink: { site: 'footer .k-footer-col a', source: '.hx-foot-col a' },
    footerHeading: { site: 'footer .k-footer-heading', source: '.hx-foot-col h3' }
  }
}
// The source slots its body between #t4-header and #t4-footer without a <main>; `main` is the site's.
// imageCensus falls back to <body> where the scope is absent, so the source count includes chrome
// images (none: the logo is inline SVG) — the comparison stays like for like.
c.design.images = { scope: 'main', sourceSlot: null, placeholder: null }
// r8, DECISIONS D29: a 1px primary border marking a STATE (popular plan, current pagination page, selected tag
// chip) is an accent in both themes, not a light border leaking into dark. The source draws the same accents in
// dark at 1440: `div.hx-card.hx-plan` and the blog pagination's current `a.page-link` carry a primary border (the
// source tag page's Bootstrap blue rgb(13,110,253) is a SOURCE defect; the site uses primary).
// How the engine matches (read, not guessed): visual-lib scanBrightBorders returns kind 'bright-border' and
// visual-qa prefixes `scan:`; the finding's `element` is the lowercased tag + ALL its classes joined by dots
// (class string cut at 40 chars), with no parent path; an exception's regex is tested against element / rule /
// selector / state only. So the regexes are anchored on the full class list — `a.k-nav-link.is-active`,
// `a.month.active` and `span.box.off` do not match — but they cannot be narrowed by parent or by colour: a
// wrongly coloured border on the same element would be accepted too. Where each renders on the site today (dark,
// 1440, every contract page): article.plan.is-popular only on Pricing; span.box.current only in the blog-family
// pagination; a.active on the tag chips (1px primary) and on the Blog browse bar and rail (no border).
c.design.exceptions = [
  [
    '^article\\.plan\\.is-popular$',
    'popular plan card: primary border marks the recommended plan (source div.hx-card.hx-plan, dark)'
  ],
  [
    '^span\\.box\\.current$',
    'current page in the pagination: primary border marks the page shown (source a.page-link, dark)'
  ],
  ['^a\\.active$', 'selected tag chip on tag pages: primary border marks the active filter']
].map(([match, reason]) => ({
  kind: 'scan:bright-border',
  match,
  reason: `${reason}; a state accent in both themes, not a leaked light border`,
  decision: 'tasks/emdash-ja-kinetic/DECISIONS.md D29'
}))

// ── interactions ──────────────────────────────────────────────────────────────────────────────────
// Selectors read from src/components/islands/MegaMenu.tsx + MobileNav.tsx and site/Header.astro. CSS
// only (no Playwright `>> nth`), because mega-hover passes trigger/panel into a page-side probe.
c.interactions = {
  // Product: the second top-level item, three titled columns (D20). Opens on pointer enter.
  // Known risk: after Escape, qa-browser.mjs calls trigger.hover() while the pointer is still inside the
  // same <li> (it moved into the panel before Escape). MegaMenu opens on the <li>'s pointerenter, which
  // does not fire again without leaving the item, so the re-open can depend on Chrome's synthetic
  // boundary events after the panel hides. Watch the first browser run.
  megamenu: {
    trigger: 'header .k-mega > ul > li:nth-child(2) > button[aria-expanded]',
    panel: 'header .k-mega-wrap:not([hidden]) .k-mega-panel',
    link: 'header .k-mega-wrap:not([hidden]) a.k-mega-link',
    open: 'hover'
  },
  // The hamburger below 992px opens a right-hand dialog; its first link row is a top-level link (Pricing).
  drawer: {
    trigger: 'header button[aria-haspopup="dialog"]',
    panel: '.k-drawer-root:not([hidden]) .k-drawer',
    link: '.k-drawer-root:not([hidden]) a.k-drawer-row',
    open: 'click'
  }
}

// ── routes (architecture.md §3) ───────────────────────────────────────────────────────────────────
// `url` is the source page on the quickstart (the crawl key). `standIn` is the file cited when the
// crawl does not hold the route's own page: the family's representative, as Business cites the list
// page for derived routes — chrome parity holds, heading parity would compare different roles.
const J = '/index.php'
const INNER_STAND_IN = `${J}/pricing`
const pageByPath = new Map(seed.content.pages.map((p) => [p.data.path, p]))
const styleOf = (p) => pageByPath.get(p)?.data?.style ?? 'terminal'
const home = (id, sitePath, url) => ({
  id,
  path: sitePath,
  url,
  layout: 'home',
  view: 'Sections',
  kind: 'hero',
  // D8 / G9: the hero CTA points at /pages/register on the source and has no destination on the site
  // (`#`); the label is asserted, the href is not.
  ctaHref: false
})
// Every inner page carries the one framed masthead: eyebrow (D26), title (D28) and sub (D27/D28).
// `unpaired` names the two-sided pairs the page leaves out because its source differs per page through
// page-specific CSS; the text they would compare stays asserted under a content id that is not a pair
// name (`heading` for h1, `sub` for lede). D28: no framed page pairs its h1 (per-page sizes below 861px).
const inner = (id, sitePath, url, unpaired = []) => ({
  id,
  path: sitePath,
  url,
  layout: 'inner',
  view: 'Sections',
  kind: 'inner',
  rules: ['mast-eyebrow', 'mast-title-framed', 'mast-sub-framed'],
  unpaired: ['h1', ...unpaired]
})
const tagRoute = (id, slug, extra = {}) => ({
  id,
  path: `/product/blog/tag/${slug}`,
  url: `${J}/pages/tags/${slug}`,
  layout: 'list',
  view: 'Blog',
  kind: 'tag',
  ...extra
})
const ROUTES = [
  home('home', '/', '/'),
  home('home-blueprint', '/home-menu/home-blueprint', `${J}/home-menu/home-blueprint`),
  home('home-signal', '/home-menu/home-signal', `${J}/home-menu/home-signal`),
  inner('features', '/product/features', `${J}/product/features`),
  // DECISIONS D27 (SOURCE): the masthead sub in the 760px column is line-height 1.75 (29.75px at 17px) on the
  // site, as on the Pricing, Features, FAQ, About and Team sources; Integrations and Changelog set 1.6
  // (27.2px) through per-page styling. An exception cannot be scoped to a page (D26), so these pages do not
  // pair the sub two-sided; its text is still asserted, under the content id `sub` (not a pair name).
  // D28 (r7, measured :4380 vs :4370 at 390): FAQ's source sub is 15px / 26.25px against the site's framed
  // 16px / 28px, so FAQ drops the lede pair too. Pricing, Features, About and Team match at 1440/768/390.
  inner('integrations', '/product/integrations', `${J}/product/integrations`, ['lede']),
  inner('changelog', '/product/changelog', `${J}/product/changelog`, ['lede']),
  inner('faq', '/product/faq', `${J}/product/faq`, ['lede']),
  inner('pricing', '/pricing', `${J}/pricing`),
  inner('about', '/company/about', `${J}/company/about`),
  inner('team', '/company/team', `${J}/company/team`),
  // The landing hero's CTA is `#` on the source itself, so its href is asserted.
  {
    id: 'landing',
    path: '/pages/landing',
    url: `${J}/pages/landing`,
    layout: 'landing',
    view: 'Sections',
    kind: 'hero',
    ctaHref: true
  },
  {
    id: 'contact',
    path: '/company/contact',
    url: `${J}/company/contact`,
    layout: 'contact',
    view: 'Sections',
    kind: 'masthead',
    rules: ['mast-eyebrow'],
    // The one page whose source masthead eyebrow already is the site's uniform style (D26).
    pairs: ['mastEyebrow']
  },
  {
    id: 'blog',
    path: '/product/blog',
    url: `${J}/product/blog`,
    layout: 'list',
    view: 'Blog',
    kind: 'blogmast'
  },
  // Page 2 (`?start=6` on the source) is saved as its own file, which crawl.json does not list (DECISIONS
  // D25: the crawler wrote query URLs over the plain page). Accepted only when it shows page 2 as current.
  {
    id: 'blog-page-2',
    path: '/product/blog?page=2',
    file: 'index.php/product/blog/page-2/index.html',
    holds: (html) => /aria-current="true" aria-label="Page 2"/.test(html),
    url: `${J}/product/blog`,
    layout: 'list',
    view: 'Blog',
    kind: 'blogmast'
  },
  {
    id: 'category',
    path: '/product/blog/category/incident-retros',
    url: `${J}/product/blog/30-incident-retros`,
    layout: 'list',
    view: 'Blog',
    kind: 'category',
    // Every crawled category page is an instance of this layout; the first is measured.
    alsoFrom: [
      `${J}/product/blog/31-product`,
      `${J}/product/blog/32-tutorials`,
      `${J}/product/blog/33-practice`,
      `${J}/product/blog/34-culture`
    ]
  },
  tagRoute('tag', 'incident', {
    alsoFrom: ['alerting', 'cost', 'latency', 'dashboards', 'tracing'].map((t) => `${J}/pages/tags/${t}`)
  }),
  // Interaction carriers (r3). The kit has no per-variant states — a state runs on every variant of its
  // page — and the interaction runner needs a 200 page. The megamenu exists only at ≥ 992px and the
  // drawer only below, so each state rides on a real tag route (not otherwise in the contract) restricted
  // to the widths where its trigger exists, with the same identity and content as the incident tag page.
  tagRoute('tag-slo', 'slo', { variants: (v) => v.width >= 992, states: ['megamenu'] }),
  tagRoute('tag-metrics', 'metrics', { variants: (v) => v.width < 992, states: ['drawer'] }),
  {
    id: 'engineering',
    path: '/pages/engineering',
    url: `${J}/pages/engineering`,
    layout: 'list',
    view: 'Blog',
    kind: 'engineering'
  },
  // The author route of the blog family renders the Blog view filtered by author.
  {
    id: 'author-posts',
    path: '/product/authors/priya-raman',
    url: `${J}/index.php/product/authors/author/priya.raman`,
    layout: 'list',
    view: 'Blog',
    kind: 'author'
  },
  {
    id: 'article',
    // The site slug is the seed's (title-derived) slug; the source alias carries the Joomla id prefix.
    path: `/product/blog/${seed.content.posts.find((p) => p.data.title === 'Building an incident timeline automatically from telemetry')?.slug ?? fail('seed: article missing')}`,
    url: `${J}/product/blog/136-automatic-incident-timeline`,
    layout: 'detail',
    view: 'Article',
    kind: 'article',
    alsoFrom: [
      `${J}/product/blog/134-continuous-profiling-intro`,
      `${J}/product/blog/135-detecting-slow-leaks`,
      `${J}/product/blog/163-reading-the-timeline-back-how-we-rebuilt-an-incident-from-raw-traces`,
      `${J}/product/blog/164-five-minutes-to-mitigate-the-anatomy-of-a-fast-recovery`,
      `${J}/product/blog/165-what-i-wish-someone-told-me-before-my-first-on-call-shift`
    ]
  },
  {
    id: 'helixql',
    path: '/pages/helixql',
    url: `${J}/pages/helixql`,
    layout: 'detail',
    view: 'Article',
    kind: 'article'
  },
  {
    id: 'all-categories',
    path: '/product/all-categories',
    url: `${J}/product/all-categories`,
    layout: 'terms',
    view: 'Terms',
    kind: 'cats'
  },
  { id: 'tags', path: '/pages/tags', url: `${J}/pages/tags`, layout: 'terms', view: 'Terms', kind: 'tags' },
  {
    id: 'archive',
    path: '/product/article-archive',
    url: `${J}/product/article-archive`,
    layout: 'archive',
    view: 'Archive',
    kind: 'archive'
  },
  {
    id: 'writers',
    path: '/product/authors',
    url: `${J}/product/authors`,
    layout: 'writers',
    view: 'Authors',
    kind: 'writers'
  },
  {
    id: 'author',
    path: '/pages/author',
    url: `${J}/index.php/product/authors/author/priya.raman`,
    layout: 'author',
    view: 'Authors',
    kind: 'author'
  },
  // The crawl holds the empty search page (no query), so the site is measured in the same state.
  {
    id: 'search',
    path: '/pages/search',
    url: `${J}/pages/search`,
    layout: 'search',
    view: 'Search',
    kind: 'search'
  },
  {
    id: 'privacy',
    path: '/privacy-policy',
    url: `${J}/privacy-policy`,
    layout: 'legal',
    view: 'Legal',
    kind: 'legal'
  },
  {
    id: 'terms-of-service',
    path: '/terms-of-service',
    url: `${J}/terms-of-service`,
    layout: 'legal',
    view: 'Legal',
    kind: 'legal'
  },
  // Unknown-route handling is an output requirement; the quickstart has no 404 page in the crawl, so
  // these cite an inner page for chrome only (layout hasSource false). r3: the pricing page, whose first
  // megamenu item ("Home") is inactive like the site's on a 404; on the home page it is the active item.
  {
    id: 'not-found',
    path: '/404',
    url: null,
    layout: 'notfound',
    view: 'NotFound',
    kind: 'chrome',
    status: 404
  },
  // Unknown-route probes (template.config audit.unknownProbes), plain 404 checks.
  {
    id: 'unknown-route',
    path: '/product/blog/nope',
    url: null,
    layout: 'notfound',
    view: 'NotFound',
    kind: 'chrome',
    status: 404
  },
  // D8: the account pages are not built; the route answers 404 (template.config qa.expectedStatus).
  {
    id: 'account-login',
    path: '/pages/login',
    url: null,
    layout: 'notfound',
    view: 'NotFound',
    kind: 'chrome',
    status: 404
  }
]

// ── content expectations per page kind (source strings, site selectors) ──────────────────────────
const field = (id, selector, file, expected, binding, owner = 'field', attribute = 'text') => ({
  id,
  selector,
  source: file,
  owner,
  binding,
  attribute,
  expected
})
const H1 = 'main h1'
// Mastheads of the blog family print the subtitle as `.sub` under the h1 (components/blog/Masthead.astro).
const SUB = 'main .mast .sub'
// Eyebrows are not asserted: the site writes the source's lower-case text and uppercases it with CSS
// (`text-transform`, as the source does), and innerText returns the transformed case. The schema
// compares whitespace-normalised text exactly and has no attribute carrying the raw string, so the
// eyebrow is held by the `eyebrow` rule (text-transform: uppercase) instead of a content field.
const contentFor = (r, file, own) => {
  const out = [
    // The header wordmark: settings.title on the site, the logo text on every source page.
    field(
      'wordmark',
      'header .k-wordmark',
      file,
      byClass(file, 'kinetic-logo-text'),
      'settings.title',
      'setting'
    )
  ]
  if (!own) {
    // No own source page: only what every crawled page states about the route (its menu title).
    if (r.kind === 'inner')
      out.push(
        field(
          'h1',
          'main .page-title',
          file,
          menuLabel(file, r.url),
          `pages.${r.id}.title (megamenu label; own page absent from the crawl)`
        )
      )
    return out
  }
  switch (r.kind) {
    case 'hero': {
      out.push(
        field('h1', 'main .hero-title', file, within(file, 'acm-hero-copy', 'hx-h1'), 'hero.<entry>.title')
      )
      out.push(
        field('lede', 'main .hero-sub', file, within(file, 'acm-hero-copy', 'hx-sub'), 'hero.<entry>.sub')
      )
      const cta = htmlOf(file).match(
        /<div class="acm-hero-copy">[\s\S]*?<a class="hx-btn hx-btn--primary" href="([^"]*)">([\s\S]*?)<\/a>/
      )
      if (!cta) fail(`source ${file}: no hero primary CTA`)
      out.push(field('cta', 'main .hero .k-btn-primary', file, textOf(cta[2]), 'hero.<entry>.cta1_label'))
      if (r.ctaHref)
        out.push(
          field(
            'cta-href',
            'main .hero .k-btn-primary',
            file,
            decode(cta[1]),
            'hero.<entry>.cta1_link',
            'field',
            'href'
          )
        )
      return out
    }
    case 'inner':
      // D18: the article frame's title band stays (breadcrumb + title); byline, "Uncategorised" chip and
      // related posts are not asserted. The masthead section below it owns the second h1.
      out.push(
        field(
          'title',
          'main .page-title',
          file,
          byClass(file, 'hx-article__title', 'h1'),
          `pages.${r.id}.title`
        )
      )
      // D28 / D27: `heading` and `sub` (not parity pair names) where the page leaves the h1 / lede pair out.
      out.push(
        field(
          r.unpaired?.includes('h1') ? 'heading' : 'h1',
          'main .pm-title',
          file,
          within(file, 'hx-mast-head', 'hx-h1'),
          'page_masthead.<entry>.title'
        )
      )
      out.push(
        field(
          r.unpaired?.includes('lede') ? 'sub' : 'lede',
          'main .pm-sub',
          file,
          within(file, 'hx-mast-head', 'hx-mast-sub'),
          'page_masthead.<entry>.sub'
        )
      )
      return out
    case 'masthead':
      out.push(field('h1', H1, file, within(file, 'hx-mast-head', 'hx-h1'), 'page_masthead.<entry>.title'))
      out.push(
        field(
          'lede',
          'main .pm-sub',
          file,
          within(file, 'hx-mast-head', 'hx-mast-sub'),
          'page_masthead.<entry>.sub'
        )
      )
      return out
    case 'blogmast':
      out.push(
        field(
          'h1',
          H1,
          file,
          byClass(file, 'hx-blogmast__title', 'h1'),
          'pages.blog.title → category term label'
        )
      )
      out.push(
        field('lede', SUB, file, pAfter(file, 'hx-blogmast__title'), 'taxonomy category description (D22)')
      )
      return out
    case 'category':
      out.push(
        field(
          'h1',
          H1,
          file,
          byClass(file, 'hx-blogmast__title', 'h1'),
          'taxonomy category term label',
          'derived'
        )
      )
      out.push(
        field(
          'lede',
          SUB,
          file,
          byClass(file, 'hx-blogmast__desc', 'div'),
          'taxonomy category description (D22)',
          'derived'
        )
      )
      return out
    case 'tag':
      // The "Tagged: " prefix is the source layout's; the site composes it with the term label.
      out.push(
        field(
          'h1',
          H1,
          file,
          byClass(file, 'kinetic-tags-h1', 'h1'),
          '"Tagged: " + taxonomy tag term label',
          'derived'
        )
      )
      out.push(
        field(
          'lede',
          SUB,
          file,
          byClass(file, 'kinetic-tags-sub', 'div'),
          'taxonomy tag description',
          'derived'
        )
      )
      return out
    case 'engineering':
      out.push(field('h1', H1, file, byClass(file, 'hxcat-h1', 'h1'), 'pages.engineering.title'))
      out.push(field('lede', SUB, file, pAfter(file, 'hxcat-h1'), 'taxonomy category description (D22)'))
      return out
    case 'author':
      out.push(
        field('h1', H1, file, byClass(file, 'hx-author__title', 'h1'), 'writers.<entry>.name', 'derived')
      )
      // The line under the name on the source author masthead; `bio` is the side card's text (D24).
      out.push(
        field('lede', SUB, file, byClass(file, 'hx-author__sub', 'p'), 'writers.<entry>.tagline (D24)')
      )
      return out
    case 'article':
      out.push(field('h1', H1, file, byClass(file, 'hx-article__title', 'h1'), 'posts.<slug>.title'))
      out.push(
        field(
          'lede',
          SUB,
          file,
          byClass(file, 'hx-article__sub', 'p'),
          r.id === 'helixql' ? 'pages.helixql.sub (D24)' : 'posts.<slug>.excerpt'
        )
      )
      return out
    case 'cats':
      out.push(field('h1', H1, file, byClass(file, 'hx-cats-title', 'h1'), 'pages.all-categories.title'))
      out.push(field('lede', SUB, file, byClass(file, 'hx-cats-sub', 'p'), 'pages.all-categories.sub (D24)'))
      return out
    case 'tags':
      out.push(field('h1', H1, file, byClass(file, 'kinetic-tags-h1', 'h1'), 'pages.tags.heading (D24)'))
      out.push(field('lede', SUB, file, byClass(file, 'kinetic-tags-sub', 'p'), 'pages.tags.sub (D24)'))
      return out
    case 'archive':
      out.push(
        field(
          'h1',
          H1,
          file,
          byClass(file, 'hx-archmast__title', 'h1'),
          'pages.article-archive.heading (D24)'
        )
      )
      out.push(
        field('lede', SUB, file, byClass(file, 'hx-archmast__sub', 'p'), 'pages.article-archive.sub (D24)')
      )
      return out
    case 'writers':
      out.push(field('h1', H1, file, byClass(file, 'hx-authors__title', 'h1'), 'pages.writers.heading (D24)'))
      out.push(field('lede', SUB, file, byClass(file, 'hx-authors__sub', 'p'), 'pages.writers.sub (D24)'))
      return out
    case 'search':
      out.push(
        field('h1', H1, file, byClass(file, 'kinetic-finder__title', 'h1'), 'pages.search.heading (D24)')
      )
      out.push(field('lede', SUB, file, byClass(file, 'kinetic-finder__sub', 'p'), 'pages.search.sub (D24)'))
      return out
    case 'legal':
      out.push(field('h1', H1, file, byClass(file, 'hx-article__title', 'h1'), `pages.${r.id}.title`))
      // The standfirst sits under the title on the source's article masthead: `pages.sub` (D24).
      out.push(field('lede', SUB, file, byClass(file, 'hx-article__sub', 'p'), `pages.${r.id}.sub (D24)`))
      return out
    default:
      return out
  }
}

// ── render inputs: which view renders a route and which seed collections reach its pixels ─────────
const readsIn = (file) =>
  [...readFileSync(file, 'utf8').matchAll(/getEmDash(?:Entry|Collection)\(\s*['"]([a-z_]+)['"]/g)].map(
    (m) => m[1]
  )
const renderOf = (r) => {
  const view = `src/views/${r.view}.astro`
  if (!existsSync(view)) fail(`route ${r.id}: no view ${view}`)
  const closure = importClosure('.', view)
  const cols = new Set(closure.flatMap((f) => (/\.(astro|ts|tsx|mjs|js)$/.test(f) ? readsIn(f) : [])))
  // Sections are loaded by collection name from the page's own `sections` list (src/lib/sections.ts).
  for (const s of pageByPath.get(r.path.split('?')[0])?.data?.sections ?? []) cols.add(s.collection)
  // The blog CTA band (loadBlogCta) renders the blog page's `cta` sections on documents and articles.
  if (closure.some((f) => f.endsWith('.astro') && /await loadBlogCta\(/.test(readFileSync(f, 'utf8'))))
    for (const s of pageByPath.get('/product/blog')?.data?.sections ?? [])
      if (s.collection === 'cta') cols.add('cta')
  return { view, collections: [...cols].sort() }
}

// ── pages ─────────────────────────────────────────────────────────────────────────────────────────
const ALL = c.variants.map((v) => v.id)
const COMMON = [
  'body-font',
  'container',
  'nav-link',
  'h1-any',
  'h2-bento',
  'h2-split',
  'h2-timeline',
  'h2-ledger',
  'h2-narrow',
  'h2-any',
  'eyebrow',
  'eyebrow-12',
  'eyebrow-12-5',
  'sub',
  'btn-any',
  'btn-mono',
  'btn-ghost',
  'card',
  'card-16',
  'card-14',
  'card-12',
  'footer-link'
]
const standInFile = ownFile(INNER_STAND_IN) ?? fail('crawl: the inner stand-in page is missing')
const convertedBy = new Map() // file → page ids
const hasOwnSource = new Map() // page id → cites its own crawled page
c.pages = ROUTES.map((r) => {
  const own = r.file
    ? existsSync(path.join(sourceDir, r.file)) && r.holds(htmlOf(r.file))
      ? r.file
      : null
    : r.url
      ? ownFile(r.url)
      : null
  hasOwnSource.set(r.id, Boolean(own))
  const file = own ?? standInFile
  const also = (r.alsoFrom ?? []).map((u) => ownFile(u)).filter(Boolean)
  const source = [file, ...also.filter((f) => f !== file)]
  if (own) for (const f of [own, ...also]) convertedBy.set(f, [...(convertedBy.get(f) ?? []), r.id])
  const style = styleOf(r.path.split('?')[0])
  const pairs = !own
    ? CHROME_PAIRS
    : r.kind === 'hero'
      ? [...CHROME_PAIRS, 'h1', 'lede', 'heroCta', 'eyebrow', 'bentoH2', 'splitH2', 'timelineH2']
      : [...CHROME_PAIRS, 'h1', 'lede']
  return {
    id: r.id,
    path: r.path,
    locale: c.defaultLocale,
    status: r.status ?? 200,
    identity: 'main h1',
    source,
    variants: r.variants ? c.variants.filter(r.variants).map((v) => v.id) : ALL,
    render: renderOf(r),
    states: ['default', ...(r.states ?? [])],
    rules: [
      ...COMMON,
      `surface-${style}`,
      `footer-${style}`,
      `btn-primary-${style}`,
      ...(r.kind === 'hero' ? ['h1-hero'] : []),
      ...(r.rules ?? [])
    ],
    // Stand-in pages share chrome with their cited page, not headings; pages paired with their own
    // source compare their heading and lede too.
    parity: [...pairs.filter((k) => !(r.unpaired ?? []).includes(k)), ...(own ? (r.pairs ?? []) : [])],
    // A stand-in's picture count is not this page's; a paginated list's count is data.
    images: !own || r.images ? 'placeholders' : undefined,
    layout: r.layout,
    content: contentFor(r, file, Boolean(own))
  }
})

// ── source dispositions ───────────────────────────────────────────────────────────────────────────
const ACCOUNT = /^index\.php\/pages\/(login|register|reset|remind|profile)\//
for (const f of c.source.files) {
  if (f.path === 'crawl.json') {
    f.disposition = 'excluded'
    f.reason = 'crawl manifest (URL → saved file), metadata of the copy rather than a page of the source'
  } else if (/format=feed|\.(rss|atom)$|\/feed\//.test(f.path)) {
    f.disposition = 'excluded'
    f.reason = 'feed: EmDash 0.37 publishes no per-category feed (content-gaps G10, DECISIONS D21)'
  } else if (/\.html?$/i.test(f.path)) {
    const held = heldUrl(f.path)
    if (ACCOUNT.test(f.path)) {
      f.disposition = 'excluded'
      f.reason =
        'Joomla account page (com_users): not built, the route answers 404 (DECISIONS D8, content-gaps G1)'
    } else if (held && /[?&](amp;)?view=category/.test(held)) {
      f.disposition = 'excluded'
      f.reason = `crawl artefact: the file holds ${held} (Joomla "Uncategorised" category view), which the crawler saved over the menu page of the same path; the route cites a stand-in until a re-crawl holds its own page`
    } else if (convertedBy.has(f.path)) f.disposition = 'converted'
    else fail(`converted source without a page: ${f.path} (holds ${held})`)
  } else f.disposition = 'asset'
}

// ── layouts: what the eyes look at; one representative per layout (the heaviest member with its own source)
const LAYOUTS = [
  ['home', 'home', 'home'],
  ['inner', 'inner', 'pricing'],
  ['landing', 'landing', 'landing'],
  ['contact', 'contact', 'contact'],
  ['list', 'list', 'blog'],
  ['detail', 'detail', 'article'],
  ['terms', 'terms', 'all-categories'],
  ['archive', 'archive', 'archive'],
  ['writers', 'author', 'writers'],
  ['author', 'author', 'author'],
  ['search', 'search', 'search'],
  ['legal', 'legal', 'privacy'],
  ['notfound', 'notfound', 'not-found']
]
c.layouts = LAYOUTS.map(([id, family, representative]) => {
  const pages = c.pages.filter((p) => p.layout === id)
  const rep = pages.find((p) => p.id === representative) ?? fail(`layout ${id}: no page ${representative}`)
  return {
    id,
    family,
    view: rep.render.view,
    representative,
    pages: pages.map((p) => p.id),
    states: rep.states,
    // A representative citing a stand-in (or nothing of its own) gets no source picture.
    hasSource: hasOwnSource.get(rep.id)
  }
})
for (const p of c.pages)
  if (!c.layouts.some((l) => l.pages.includes(p.id))) fail(`page ${p.id} has no layout`)

// ── visual ────────────────────────────────────────────────────────────────────────────────────────
// Stages in the fixed order (qa-lenses.md §2): light desktop → light responsive → dark desktop → dark responsive.
c.visual = {
  stages: [
    { id: 'light-desktop', variants: ['1440-light'] },
    { id: 'light-responsive', variants: ['768-light', '390-light'] },
    { id: 'dark-desktop', variants: ['1440-dark'] },
    { id: 'dark-responsive', variants: ['768-dark', '390-dark'] }
  ],
  shots: [],
  // The interaction carriers are list-layout pages but not its representative, so the resolver would
  // not pick them; each is added with the state it carries.
  fastGate: {
    add: [
      { page: 'tag-slo', reason: 'carries the megamenu state (1440 only: the menu exists at ≥ 992px)' },
      {
        page: 'tag-metrics',
        reason: 'carries the drawer state (768 and 390 only: the drawer exists below 992px)'
      }
    ]
  },
  renderInputs: [
    'src/styles/**',
    'src/layouts/**',
    'src/components/**',
    'src/lib/**',
    'astro.config.mjs',
    'template.config.json',
    'package.json',
    'public/**'
  ]
}

// ── reviews, capabilities, distribution ───────────────────────────────────────────────────────────
// Every gate is required; `forms` too — the footer newsletter is a Forms plugin form (D14).
c.reviews = Object.fromEntries(Object.keys(c.reviews).map((g) => [g, { mode: 'required' }]))
c.capabilities = ['forms', 'search', 'seo', 'media']
// The shipped file set: source, lockfile, seed with its media, tools + ingest + contract, docs. Never
// data/, uploads/, .env, tokens, node_modules — and never qa.contract.json (qa-contract.md).
c.distribution.include = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'template.config.json',
  'astro.config.mjs',
  'tsconfig.json',
  'components.json',
  'emdash-env.d.ts',
  '.env.example',
  'public',
  'seed',
  'src',
  'tools',
  'ingest',
  'contract',
  'tests',
  'docs',
  'README.md',
  'AGENTS.md',
  'PROVENANCE.md',
  // release.mjs copies LICENSE out of the packed artifact, so it has to be inside it.
  'LICENSE',
  // The fleet builds the site image from the packed template (emdash.sh → emdash_build_image), so the
  // Dockerfile ships too; its entrypoint is tools/docker-entrypoint.sh, already under tools/.
  'Dockerfile'
].filter((p) => existsSync(p) || fail(`distribution include missing: ${p}`))
c.distribution.required = [
  'package.json',
  'pnpm-lock.yaml',
  'template.config.json',
  'README.md',
  'AGENTS.md',
  'PROVENANCE.md',
  'LICENSE',
  'public/favicon.svg',
  'contract/validate.mjs',
  'ingest/normalize-joomla-model.mjs',
  'tools/qa.mjs',
  'tools/qa-contract.mjs',
  'tools/distribution.mjs',
  'tools/qa-receipt.mjs',
  'tools/admin-session.mjs',
  'tools/admin-roundtrip.mjs',
  'tools/recovery-check.mjs',
  'tools/clean-install.sh',
  'tools/forms.json',
  'seed/seed.json',
  'seed/media-map.json',
  'seed/field-map.json',
  ...filesUnder('.', 'seed/media')
].filter((p) => existsSync(p) || fail(`distribution required file missing: ${p}`))
c.pending = []
c.visual.shots = deriveShots(c)
writeFileSync(opt('--out', 'qa.contract.json'), JSON.stringify(c, null, 2) + '\n')
const count = (d) => c.source.files.filter((f) => f.disposition === d).length
console.log(
  JSON.stringify({
    pages: c.pages.length,
    variants: c.variants.length,
    rules: c.design.rules.length,
    layouts: c.layouts.length,
    sourceFiles: c.source.files.length,
    converted: count('converted'),
    asset: count('asset'),
    excluded: count('excluded'),
    standIns: c.pages.filter((p) => !hasOwnSource.get(p.id)).map((p) => p.id)
  })
)
