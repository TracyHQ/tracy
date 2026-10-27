#!/usr/bin/env node
/**
 * One JA Joomla quickstart through the design-system slot, from its release to a measured verdict:
 *
 *   node scripts/pass-joomla.mjs <slug> --port <n> [--cdp <n>] [--evidence <dir>] [--keep] [--no-tokenize]
 *
 *  1. stand: the release restored and served (stand.mjs up quickstart/<slug>/j6);
 *  2. contract draft templates/joomla-<slug>.json (extends joomla-t4-ja, or joomla-t3-ja for a T3
 *     template): colours and faces read off the release (joomla-palette.mjs), roles read off its home page (discover.mjs) — an existing contract
 *     is kept as it is;
 *  3. the default page snapped (the control's reference);
 *  4. the stand's template stylesheets tokenized and T4's combined cache emptied — what the next
 *     release ships (release-joomla.mjs builds that from the same contract);
 *  5. flow.mjs with four contrasting systems (light, square mono, dark, Apple) and both controls.
 * The stand is taken down afterwards unless --keep. Prints one JSON summary line.
 *
 * A quickstart that is not JA's own (gavick-gk-*, purity-iii, t3/t4-framework) is named by its
 * release slug; its contract by the template element it installs (`t4_bs5_blank` → joomla-t4-bs5-blank),
 * the key tracy-web's templateKeyOf() reads off a running site. --no-tokenize measures the slot module
 * alone, on the release's own stylesheets: the case of a template Tracy may not re-release modified.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { innerPass } from './inner.mjs'
import { contractBase, loadContract } from '../src/library.mjs'
import { tokenizeCss } from '../src/tokenize.mjs'
import { COLOUR_TOKENS } from '../src/tokens56.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const args = process.argv.slice(2)
const opt = (n, d = null) => {
  const i = args.indexOf(n)
  return i === -1 ? d : args.splice(i, 2)[1]
}
const port = Number(opt('--port'))
const cdp = opt('--cdp', '9341')
const SYSTEMS_OPT = opt('--systems')
// --inner <n>: up to n inner pages of other kinds (a content page, a menu page), measured too under
// --inner-systems (default the first and last of --systems); summarised under `inner` (inner.mjs)
const innerN = Number(opt('--inner', '0'))
const INNER_SYSTEMS_OPT = opt('--inner-systems')
// --version: the release restored (default the newest), passed to stand.mjs
const versionOpt = opt('--version')
// --bands: before the default is snapped, the kept bands are read off the running default page and
// drafted into the contract's `bands` (scripts/bands.mjs --draft) when it has none
const draftBands = args.includes('--bands')
// --from-dir: the release files laid out locally (manifest.json + its parts), passed to stand.mjs — a
// release with no switch yet (ja-civica, 11/10/2026: a rolling pre-release whose only asset is the zip)
const fromDir = opt('--from-dir')
const keep = args.includes('--keep')
const noTokenize = args.includes('--no-tokenize')
// --page: the page measured when the home page is a demo chooser (JA Aiga's "Dark. / Light."): the
// template's real home layout; recorded in the contract as measuredPage, which flow.mjs reads
// --path: the same, under the name batch 3 gave it (JA Good, 11/10/2026)
const pageOpt = opt('--page') ?? opt('--path')
const slug = args.find((a) => !a.startsWith('--'))
if (!/^[a-z0-9][a-z0-9-]+$/.test(slug ?? '') || !port) {
  console.error(
    'usage: pass-joomla.mjs <slug> --port <n> [--cdp <n>] [--evidence <dir>] [--keep] [--no-tokenize]'
  )
  process.exit(1)
}
const EVIDENCE = resolve(
  opt('--evidence', join(ROOT, 'tasks/evidence/ds-slot-released-2026-10-09')),
  `${slug}-j6`
)
const SYSTEMS_DEFAULT = [
  'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0', // Moxie: light, dark accent text
  'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567', // MotherDuck: square, mono-led
  'refero:813be405-c2b9-41be-9864-7b53d66483dc', // Toggl Track: dark
  'od:apple'
]
// --systems a,b,c: the systems measured (default the four contrasting ones above); the OpenDesign
// library is what a customer picks from, so a check of what customers get names od: ids
const SYSTEMS = SYSTEMS_OPT ? SYSTEMS_OPT.split(',').filter(Boolean) : SYSTEMS_DEFAULT
const node = (script, ...a) =>
  execFileSync(process.execPath, [join(HERE, script), ...a], { encoding: 'utf8', maxBuffer: 1 << 26 })
const name = `${slug}-j6`.slice(0, 40)
// A theme file's colour stays where the page paints it in that kind of role (text, fill, line);
// where it does not, the colour measured on the page takes the role (JA Kinetic: a light theme file
// under a dark home page). Faces always from the theme file.
const KIND = {
  bg: 'fill',
  surface: 'fill',
  'surface-warm': 'fill',
  accent: 'fill',
  fg: 'text',
  'fg-2': 'text',
  muted: 'text',
  meta: 'text',
  'accent-on': 'text',
  border: 'line',
  'border-soft': 'line'
}
const merge = (theme = {}, measured = {}, paints = {}) => {
  const out = { ...theme }
  for (const [role, v] of Object.entries(measured)) {
    if (role === 'link') continue
    const own = theme[`--${role}`]?.toLowerCase()
    const kind = KIND[role]
    if (own && kind && (paints[kind] ?? []).includes(own)) continue
    out[`--${role}`] = v
  }
  return out
}
// WCAG contrast of two #rrggbb (or #rgb) colours
const contrast = (a, b) => {
  const lum = (h) => {
    const x =
      h.length === 4
        ? h
            .slice(1)
            .split('')
            .map((c) => c + c)
            .join('')
        : h.slice(1, 7)
    return [0, 2, 4]
      .map((i) => Number.parseInt(x.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
  }
  if (!/^#[0-9a-f]{3,8}$/i.test(a ?? '') || !/^#[0-9a-f]{3,8}$/i.test(b ?? '')) return 0
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const t0 = Date.now()
// Tracy's own templates are released as <slug>/j6; JA's and every other quickstart as quickstart/<slug>/j6
const tagOf = (s) => (s.startsWith('tracy-') ? `${s}/j6` : `quickstart/${s}/j6`)
// What a Gavern (GavickPro gk_*) contract carries in place of a JA family base: the same site module
// and selector rules, no runtime variables (Gavern has none), only --ds-c-* written
const GAVERN_FAMILY = {
  template: 'joomla/gavern-gk',
  applies:
    "a GavickPro Gavern (gk_*) quickstart: the same site module as the JA families, in the earliest position its layout renders. Gavern has no runtime colour variables: its compiled stylesheets read the slot once tokenized (a JoomlArt re-release), and the slot's own selector rules do the rest",
  module: {
    title: 'Tracy design system',
    position: 'header',
    ordering: 0,
    style: 'System-none'
  },
  tokenScope: ':root',
  runtime: {},
  selectors: {
    headingsAll: [':is(h1, h2, h3, h4)'],
    display: 'h1',
    body: ['body'],
    themeToggle: '[data-tracy-theme-toggle]'
  },
  specificity:
    "Rules are prefixed :root×6 (0,6,0): above every template rule, below an element's own inline style.",
  extraPalettes: [],
  genericTokens: false,
  genericNote: 'the slot writes no short token names (--bg, --accent…) here; everything reads --ds-c-*',
  classifyText: true
}

// 1. stand
// a stand that fails half-way leaves containers behind: take them down before reporting
let stand
try {
  stand = JSON.parse(
    node(
      'stand.mjs',
      'up',
      tagOf(slug),
      '--port',
      String(port),
      '--name',
      name,
      ...(fromDir ? ['--from-dir', fromDir] : []),
      ...(versionOpt ? ['--version', versionOpt] : [])
    )
      .trim()
      .split('\n')
      .pop()
  )
} catch (e) {
  node('stand.mjs', 'down', '--name', name)
  throw e
}
const manifest = JSON.parse(readFileSync(join(stand.dir, 'dl/manifest.json'), 'utf8'))
const tplDir = join(stand.dir, 'site/templates', manifest.template)
const site = stand.site
try {
  const T3 = existsSync(join(tplDir, 'less')) && !existsSync(join(tplDir, 'etc/theme/default.json'))
  // GavickPro's Gavern framework (gk_*): no runtime colour variables, no theme file, no LESS
  // variables in the release; its contract stands alone (GAVERN below), not on a JA family base
  const GAVERN = existsSync(join(tplDir, 'lib/gk.framework.php'))
  const family = GAVERN
    ? GAVERN_FAMILY
    : JSON.parse(
        readFileSync(join(HERE, `../templates/${T3 ? 'joomla-t3-ja' : 'joomla-t4-ja'}.json`), 'utf8')
      )
  // 2. contract draft
  // the contract's key: a JA or Tracy slug is its own; any other quickstart's is its template element
  const key = /^(ja|tracy)-/.test(slug) ? slug : manifest.template.toLowerCase().replace(/_/g, '-')
  const cname = `joomla-${key}`
  const cfile = join(HERE, '../templates', `${cname}.json`)
  if (!existsSync(cfile)) {
    // Gavern's less/variables.less carries Bootstrap 2 names (@bodyBackground, @textColor,
    // @primary_color …), which joomla-palette.mjs reads beside T3's
    const pal = JSON.parse(node('joomla-palette.mjs', tplDir))
    const found = JSON.parse(
      node(
        'discover.mjs',
        '--site',
        site,
        '--template',
        `joomla/${key}`,
        '--cdp',
        String(Number(cdp) + 5),
        ...(pageOpt ? ['--page', pageOpt] : [])
      )
    )
    const r = found.roles
    // Gavern sizes its containers and sections per breakpoint with max-width and fixed paddings
    // (GK Appetit's split page, GK Archi's band under the hero picture): a system's width or section
    // rhythm written over them breaks the layout (a 1680px page at 1440, a heading under the picture),
    // so a Gavern contract leaves both to the template and does not measure them
    if (GAVERN) {
      delete r.container
      delete r.section
      delete found.discovered?.container
      delete found.discovered?.section
    }
    const cls = (sel) => (sel ? sel.split(' ').pop() : null)
    const contract = {
      schema: 'tracy-ds-template/v1',
      ...(GAVERN
        ? (({ module: _m, template: _t, ...rest }) => rest)(GAVERN_FAMILY)
        : { extends: T3 ? 'joomla-t3-ja' : 'joomla-t4-ja' }),
      template: `joomla/${key}`,
      release: `${tagOf(slug)}@${manifest.version}`,
      ...(pageOpt && pageOpt !== '/' && { measuredPage: pageOpt }),
      roles: r,
      discovered: found.discovered,
      // inverse bands the page keeps (discover.mjs): their rules stay the template's
      keepScopes: found.inverse ?? [],
      // a draft is never offered: a build door reads `ready !== false` as ready (ds-slot.js)
      ready: false,
      readyNote: 'NOT offered yet — drafted by pass-joomla.mjs, not measured',
      baseSystem: 'od:apple',
      // translucent text (rgba of a palette colour) follows at its own opacity (tokenize.mjs alphaText)
      alphaText: true,
      // a fill painted with T4's accent variable pairs its text as the accent's (tokenize.mjs)
      pairVarFill: true,
      // what the default page paints first (discover.mjs), the theme file's keys where it is silent;
      // the theme file's own light set and the content link colour stay as palettes of their own
      baseTokens: merge(pal.baseTokens, found.painted, found.paints),
      darkTokens: pal.darkTokens,
      extraPalettes: [
        pal.baseTokens &&
          Object.fromEntries(
            Object.entries(pal.baseTokens)
              .filter(([k]) => !k.startsWith('--font'))
              .map(([k, v]) => [k.slice(2), v])
          ),
        // what the page paints, whole: where the theme file's colour kept a role, the painted one
        // takes it too (JA Podcast's paragraphs are a grey its theme file does not name)
        found.painted && Object.fromEntries(Object.entries(found.painted).filter(([k]) => k !== 'link')),
        found.painted?.link && { accent: found.painted.link },
        // every other text colour the page paints on its ground, one palette each
        ...(found.textsOnPage ?? []).map((t) => ({ [t.role]: t.hex })),
        ...(family.extraPalettes ?? [])
      ].filter(Boolean),
      baseNote: `painted on the default home page (discover.mjs), then ${pal.baseNote.replace(/^read off the release: /, '')}`,
      selectors: {
        ...(GAVERN ? GAVERN_FAMILY.selectors : {}),
        ...(r.display && { displaySize: cls(r.display) }),
        heading: GAVERN
          ? ['#gkBg h2', '#gkBg-main h2']
          : T3
            ? ['.t3-wrapper h2', 'main h2']
            : ['.t4-section h2', 'main h2'],
        button: ['.btn', ...(r['button-primary'] ? [cls(r['button-primary'])] : [])],
        buttonPrimary: ['.btn-primary', ...(r['button-primary'] ? [cls(r['button-primary'])] : [])],
        ...(r.card && { card: [cls(r.card), '.card'] }),
        ...(!GAVERN && {
          container: [
            T3 ? '#t3-mainbody .container, .container' : '.t4-section .container',
            ...(r.container ? [cls(r.container)] : [])
          ]
        }),
        ...(r.section && { section: [cls(r.section)] }),
        bodyFace: ['body']
      },
      contrast: GAVERN
        ? {
            // a Gavern home page can be one hero and a logo (GK Appetit): its headings and logo are
            // always there, so the contrast judged is never empty
            'accent-text': '#gkPageContent a:not([class*=btn]):not(:has(img))',
            // the page wrapper is #gkBg, or #gkBg-main (GK Spotlight)
            muted: ':is(#gkBg, #gkBg-main) p:not([class*=hero]):not([class*=banner]):not([class*=slide])',
            body: '#gkPageContent p, #gkPageContent li',
            heading: ':is(#gkBg, #gkBg-main) :is(h1, h2, h3, h4)',
            logo: '.gkLogo',
            footer: '#gkFooter a, #gkFooterNavWrap a'
          }
        : T3
          ? {
              // every text of the page's wrapper (a home page built of modules has no #t3-mainbody):
              // flow.mjs judges each one against itself on the default page
              'accent-text': '.t3-wrapper a:not([class*=btn]):not(:has(img))',
              muted: '.t3-wrapper p:not([class*=hero]):not([class*=banner]):not([class*=slide])',
              body: '.t3-wrapper p, .t3-wrapper li',
              heading: '.t3-wrapper :is(h1, h2, h3, h4)',
              footer: '.t3-footer a, #t3-footer a'
            }
          : {
              'accent-text': '.t4-section a:not([class*=btn]):not(:has(img))',
              muted: '.t4-section p:not([class*=hero]):not([class*=banner]):not([class*=slide])',
              body: 'main p, .t4-section p, .t4-section li',
              heading: '.t4-section :is(h1, h2, h3, h4)',
              footer: '.t4-footer a, .t4-footnav a'
            }
    }
    // a Gavern style that recompiles its LESS on every request (GK Spotlight) would overwrite the
    // tokenized sheets: the draft says so, and the stand and the next release turn it off
    if (
      GAVERN &&
      execFileSync(
        'docker',
        [
          'exec',
          '-i',
          stand.db,
          'mariadb',
          '-usite',
          '-psite',
          'site',
          '-N',
          '-e',
          `select count(*) from ${manifest.prefix}template_styles where template = '${manifest.template}' and params like '%"recompile_css":"1"%'`
        ],
        { encoding: 'utf8' }
      ).trim() !== '0'
    )
      contract.gavernRecompileOff = true
    writeFileSync(cfile, `${JSON.stringify(contract, null, 2)}\n`)
  }
  // the slot's position: the module position this template renders earliest on its home page, of
  // those its header blocks name and those holding an every-page module (a layout without header-r
  // never shows a module put there)
  const contract0 = JSON.parse(readFileSync(cfile, 'utf8'))
  const page = pageOpt ?? contract0.measuredPage ?? '/'
  if (!contract0.module) {
    const sql = (q) =>
      execFileSync('docker', ['exec', '-i', stand.db, 'mariadb', '-usite', '-psite', 'site', '-N', '-e', q], {
        encoding: 'utf8'
      })
    const P = manifest.prefix
    // T4 names positions in html/layouts/t4/block/*.html; T3 in tpls/blocks/*.php (`_p('x')`);
    // GavickPro's Gavern framework in layouts/*.php and layouts/blocks/*.php (`name="mainbody_top"`)
    const named = [
      join(tplDir, 'html/layouts/t4/block'),
      join(tplDir, 'tpls/blocks'),
      join(tplDir, 'layouts'),
      join(tplDir, 'layouts/blocks')
    ]
      .filter((d) => existsSync(d))
      .flatMap((d) =>
        readdirSync(d)
          .filter((f) => /\.(html|php)$/.test(f))
          .flatMap((f) =>
            [...readFileSync(join(d, f), 'utf8').matchAll(/name="([a-z0-9_-]+)"|_p\('([a-z0-9_-]+)'\)/g)].map(
              (m) => m[1] ?? m[2]
            )
          )
      )
    const everyPage = sql(
      `select distinct m.position from ${P}modules m join ${P}modules_menu mm on mm.moduleid = m.id where m.client_id = 0 and m.published = 1 and mm.menuid = 0 and m.position <> ''`
    )
      .split('\n')
      .filter(Boolean)
    const candidates = [...new Set(['header-r', ...named, ...everyPage])].filter((x) =>
      /^[a-z0-9_-]+$/.test(x)
    )
    // One page per pass, not one per candidate: on the shared, loaded Docker VM a JA T3 home page
    // took 1–3 minutes to render (ja-lawfirm, 11/10/2026), and some templates name 20+ positions.
    // Pass 1 puts a marked probe module in every candidate position and reads the order they render
    // in; pass 2 confirms the earliest renders on its own (a block may show a position only when a
    // sibling position is filled), falling back to the next.
    const get = (path) => {
      for (let i = 1; ; i++)
        try {
          return execFileSync('curl', ['-s', '-L', '--noproxy', '*', '-m', '300', `${site}${path}`], {
            encoding: 'utf8',
            maxBuffer: 1 << 26
          })
        } catch (e) {
          if (i >= 3) throw e
        }
    }
    const probeIds = []
    const addProbe = (pos) => {
      sql(
        `insert into ${P}modules (asset_id,title,note,content,ordering,position,checked_out,publish_up,publish_down,published,module,access,showtitle,params,client_id,language) values (0,'Tracy design system probe','','<style>/* tracy-ds-slot-probe:${pos}: */</style>',0,'${pos}',NULL,NULL,NULL,1,'mod_custom',1,0,'{"style":"System-none"}',0,'*')`
      )
      const id = sql(`select max(id) from ${P}modules where title = 'Tracy design system probe'`).trim()
      // ignore: a demo dump can carry an orphan assignment row for the id the probe gets (ja-spark:
      // (216, 0) with no module 216) — it assigns the probe to every page, which is what it wants
      sql(`insert ignore into ${P}modules_menu (moduleid, menuid) values (${id}, 0)`)
      probeIds.push(id)
    }
    const dropProbes = () => {
      for (const id of probeIds.splice(0)) {
        sql(`delete from ${P}modules_menu where moduleid = ${id}`)
        sql(`delete from ${P}modules where id = ${id}`)
      }
    }
    let best = null
    try {
      for (const pos of candidates) addProbe(pos)
      const all = get(page)
      const order = candidates
        .map((pos) => ({ pos, at: all.indexOf(`tracy-ds-slot-probe:${pos}:`) }))
        .filter((x) => x.at !== -1)
        .sort((a, b) => a.at - b.at)
      dropProbes()
      for (const { pos } of order) {
        addProbe(pos)
        const at = get(page).indexOf(`tracy-ds-slot-probe:${pos}:`)
        // a position the measured page renders must render on the home page too
        const onHome = page === '/' || get('/').includes(`tracy-ds-slot-probe:${pos}:`)
        dropProbes()
        if (at !== -1 && onHome) {
          best = { pos, at }
          break
        }
      }
    } finally {
      dropProbes()
    }
    if (!best)
      throw new Error(`${slug}: no module position renders on the home page (${candidates.join(', ')})`)
    contract0.module = {
      ...family.module,
      position: best.pos,
      why: `the earliest position this template renders on ${page === '/' ? 'its home page' : `${page} and its home page`}, of ${candidates.length} tried (byte ${best.at}); pass-joomla.mjs`
    }
    writeFileSync(cfile, `${JSON.stringify(contract0, null, 2)}\n`)
  }
  // near variants of the palette the stylesheets paint (≤ 24 apart, same side of light, role by
  // property): written into the draft as one more palette, `nearNote` saying so — read by a person
  const contractN = JSON.parse(readFileSync(cfile, 'utf8'))
  if (!contractN.nearPalette && !noTokenize) {
    const sheets = readdirSync(tplDir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.css') && /^(css|acm|local)\//.test(f))
      .map((f) => join(tplDir, f))
    const sug = JSON.parse(
      node('tokenize.mjs', '--template', cname, '--near', '24', '--json', ...sheets).trim()
    )
    // one hex per role per palette: the rest go into further palettes
    const sets = []
    for (const x of sug.suggest ?? []) {
      const set = sets.find((o) => !o[x.role]) ?? (sets.push({}), sets[sets.length - 1])
      set[x.role] = x.hex
    }
    contractN.extraPalettes = [...(contractN.extraPalettes ?? []), ...sets]
    contractN.nearPalette = sug.suggest ?? []
    contractN.nearNote =
      'near variants the stylesheets paint, each in the role its property allows (tokenize.mjs --suggest --near 24): added as palettes, read by a person'
    writeFileSync(cfile, `${JSON.stringify(contractN, null, 2)}\n`)
  }
  // what the variables the slot repoints compute on the released page: given back inside the bands
  // the page keeps (keepRules), so a kept band stays the template's whole
  // a T4 template's own theme colours (params/typelist-theme.xml, e.g. JA Artsy's --heading_color):
  // T4 writes each as a root variable its stylesheets read, which the family's runtime does not name.
  // Each takes the role the template's palette gives its value for the kind its name says (a *_bg is a
  // fill, a *border* a line, the rest text) — the tokenizer's own rule, on one declaration
  const contractV = JSON.parse(readFileSync(cfile, 'utf8'))
  // the template's own field list, else T4's base one (JA Athena ships none of its own)
  const typelist = [
    join(tplDir, 'params/typelist-theme.xml'),
    join(stand.dir, 'site/plugins/system/t4/themes/base/params/typelist-theme.xml')
  ].find((f) => existsSync(f))
  if (!T3 && !contractV.templateVars && typelist) {
    const fam = JSON.parse(
      readFileSync(join(HERE, `../templates/${contractV.extends ?? 'joomla-t4-ja'}.json`), 'utf8')
    )
    const theme = existsSync(join(tplDir, 'etc/theme/default.json'))
      ? JSON.parse(readFileSync(join(tplDir, 'etc/theme/default.json'), 'utf8'))
      : {}
    const c = loadContract(cname)
    const base = contractBase(ROOT, c)
    const palette = [
      Object.fromEntries(COLOUR_TOKENS.map((n) => [n, base[`--${n}`]])),
      ...(c.extraPalettes ?? [])
    ]
    const vars = {}
    for (const [tag] of readFileSync(typelist, 'utf8').matchAll(/<field\b[^>]*>/g)) {
      const attr = (n) => new RegExp(`\\s${n}="([^"]*)"`).exec(tag)?.[1]
      const fieldName = attr('name')
      if (!/^t4(brand|color)$/.test(attr('type') ?? '') || !fieldName) continue
      const v = attr('data-variable') ?? `--${fieldName.replace(/_/g, '-')}`
      if (/^--color-(white|black)$/.test(v)) continue
      const hex = String(theme[fieldName] ?? attr('default') ?? '').trim()
      if (!/^#[0-9a-f]{3,8}$/i.test(hex)) continue
      // the family names it: kept, unless the family makes it a light fill (T4's secondary →
      // surface) while this template's value is a strong colour on its page — JA Athena and JA
      // Candidate paint section titles with it, which under every system read on their own ground
      const famRole = fam.runtime?.[v]
      const strong = contrast(hex, base['--bg']) >= 3
      const fill = /bg|background/.test(fieldName)
      if (famRole !== undefined && (fill || !(famRole === 'var(--ds-c-surface)' && strong))) continue
      const prop = famRole
        ? 'color'
        : fill
          ? 'background-color'
          : /border/.test(fieldName)
            ? 'border-color'
            : 'color'
      const role = /var\(--ds-c-([\w-]+),/.exec(
        tokenizeCss(`.x{${prop}:${hex}}`, palette, { classifyText: c.classifyText }).css
      )?.[1]
      if (role) vars[v] = `var(--ds-c-${role})`
    }
    if (Object.keys(vars).length) {
      contractV.templateVars = vars
      contractV.templateVarsNote =
        "the template's own T4 theme colours (params/typelist-theme.xml), each in the role the template's palette gives its value; pass-joomla.mjs"
      // the kept bands' defaults must hold these too
      delete contractV.keepDefaults
      writeFileSync(cfile, `${JSON.stringify(contractV, null, 2)}\n`)
    }
  }
  const contractK = JSON.parse(readFileSync(cfile, 'utf8'))
  if (contractK.keepScopes?.length && !contractK.keepDefaults) {
    const fam = contractK.extends
      ? JSON.parse(readFileSync(join(HERE, `../templates/${contractK.extends}.json`), 'utf8'))
      : contractK
    const keys = [...Object.keys(fam.runtime ?? {}), ...Object.keys(contractK.templateVars ?? {})]
    const got = JSON.parse(
      node(
        'discover.mjs',
        '--site',
        site,
        '--cdp',
        String(Number(cdp) + 5),
        '--vars',
        keys.join(','),
        '--page',
        contractK.measuredPage ?? '/',
        '--colors',
        contractK.keepScopes.join(',')
      )
    )
    contractK.keepDefaults = got.rootVars ?? {}
    // the text colour each kept band computes as released: its texts that set none inherit it, and
    // a body that follows the system would otherwise reach them (JA Alumni's topbar and feature cards)
    contractK.keepColors = got.bandColors ?? {}
    writeFileSync(cfile, `${JSON.stringify(contractK, null, 2)}\n`)
  }
  // 2b. the kept bands, read off the default page, drafted into the contract (--bands)
  if (draftBands)
    node(
      'bands.mjs',
      '--site',
      site,
      '--template',
      cname,
      '--page',
      page,
      '--cdp',
      String(Number(cdp) + 7),
      '--draft',
      '--fills'
    )
  // 3. the default, as released
  node(
    'flow.mjs',
    '--cms',
    'joomla',
    '--template',
    cname,
    '--site',
    site,
    '--cdp',
    cdp,
    '--out',
    join(EVIDENCE, 'baseline'),
    '--snap'
  )
  // 4. tokenized stylesheets, T4 cache emptied
  // every stylesheet the template ships: css/ (T3's css/themes/* included) and its ACM modules'
  const css = readdirSync(tplDir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.css') && /^(css|acm|local)\//.test(f))
    .map((f) => join(tplDir, f))
  // a contract with t4SiteCss: T4's generated per-style sheets too (media/t4/css/<style id>.css), where
  // the template style's typography writes body colours as literals (JA Justitia)
  const t4css = join(stand.dir, 'site/media/t4/css')
  if (JSON.parse(readFileSync(cfile, 'utf8')).t4SiteCss && existsSync(t4css))
    css.push(
      ...readdirSync(t4css)
        .filter((f) => /^\d+\.css$/.test(f))
        .map((f) => join(t4css, f))
    )
  // a Gavern template style with "Recompile CSS" on compiles less/ into css/ on EVERY request, over the
  // tokenized sheets (GK Spotlight 1.0.0 ships it on): a contract's `gavernRecompileOff` turns it off in
  // the stand's template styles, as the next release ships it (release-joomla.mjs); the sheets the
  // default page was just served from are the compiled ones, tokenized below
  if (GAVERN && JSON.parse(readFileSync(cfile, 'utf8')).gavernRecompileOff)
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        stand.db,
        'mariadb',
        '-usite',
        '-psite',
        'site',
        '-e',
        `update ${manifest.prefix}template_styles set params = replace(params, '"recompile_css":"1"', '"recompile_css":"0"') where template = '${manifest.template}'`
      ],
      { encoding: 'utf8' }
    )
  // --no-tokenize: the release's stylesheets as they are (nothing the template ships is changed)
  const tok = noTokenize
    ? { total: { replaced: 0 } }
    : JSON.parse(
        node('tokenize.mjs', '--template', cname, '--write', ...css)
          .trim()
          .split('\n')
          .pop()
      )
  // the translucent text names the tokenized sheets read (alphaText): the slot defines each
  {
    const c = JSON.parse(readFileSync(cfile, 'utf8'))
    // (not on --no-tokenize: sheets measured as they are, e.g. a release build, say nothing of them)
    if (
      !noTokenize &&
      c.alphaText &&
      JSON.stringify(c.alphaVars ?? []) !== JSON.stringify(tok.total.alphas ?? [])
    ) {
      c.alphaVars = tok.total.alphas ?? []
      writeFileSync(cfile, `${JSON.stringify(c, null, 2)}\n`)
    }
  }
  // T4's combined cache, and Gavern's (css_compression: administrator/cache/gk_compress, written once
  // from the default page's sheets and never again while it exists)
  for (const cache of [
    join(stand.dir, 'site/media/t4/optimize'),
    join(stand.dir, 'site/administrator/cache/gk_compress')
  ])
    if (existsSync(cache))
      for (const d of readdirSync(cache)) rmSync(join(cache, d), { recursive: true, force: true })
  // 5. measure
  const flow = spawnSync(
    process.execPath,
    [
      join(HERE, 'flow.mjs'),
      '--cms',
      'joomla',
      '--template',
      cname,
      '--site',
      site,
      '--cdp',
      cdp,
      '--joomla-db',
      stand.db,
      '--joomla-prefix',
      manifest.prefix,
      '--joomla-login',
      'site',
      '--out',
      join(EVIDENCE, 'final'),
      '--baseline',
      join(EVIDENCE, 'baseline/default.json'),
      // the numbers of this run, as the tdsr-measurement/v1 file of this version (measurement.mjs)
      '--measure-version',
      manifest.version,
      '--measure-tag',
      tagOf(slug),
      '--measure-template',
      slug,
      ...SYSTEMS
    ],
    { encoding: 'utf8', maxBuffer: 1 << 26 }
  )
  if (!existsSync(join(EVIDENCE, 'final/flow.json')))
    throw new Error(`flow did not finish: ${(flow.stderr || flow.stdout).slice(-600)}`)
  const f = JSON.parse(readFileSync(join(EVIDENCE, 'final/flow.json'), 'utf8'))
  // 6. inner pages (--inner): other kinds of page under a few systems, before the stand goes down
  const innerSystems = INNER_SYSTEMS_OPT
    ? INNER_SYSTEMS_OPT.split(',').filter(Boolean)
    : [...new Set([SYSTEMS[0], SYSTEMS[SYSTEMS.length - 1]])]
  const snapArgs = ['--cms', 'joomla', '--template', cname, '--site', site, '--cdp', cdp]
  const inner = innerN
    ? await innerPass({
        site,
        start: pageOpt ?? JSON.parse(readFileSync(cfile, 'utf8')).measuredPage ?? '/',
        n: innerN,
        cdp: Number(cdp) + 9,
        here: HERE,
        snap: snapArgs,
        common: [
          ...snapArgs,
          '--joomla-db',
          stand.db,
          '--joomla-prefix',
          manifest.prefix,
          '--joomla-login',
          'site'
        ],
        evidence: EVIDENCE,
        systems: innerSystems
      })
    : undefined
  const sys = f.verdicts.filter((v) => v.kind === 'system')
  const controls = f.verdicts.filter((v) => v.kind === 'control')
  console.log(
    JSON.stringify({
      slug,
      contract: cname,
      tokenized: !noTokenize,
      version: manifest.version,
      template: manifest.template,
      pass: `${f.verdicts.filter((v) => v.pass).length}/${f.verdicts.length}`,
      controls: controls.map((c) => c.differences),
      follows: sys.map((v) => v.follows?.rate),
      // what of the template's own colours a visitor still sees (remnant.mjs), first screen · page
      left: sys.map((v) => (v.left ? [v.left.first.share, v.left.page.share] : null)),
      systems: SYSTEMS,
      misses: [...new Set(sys.flatMap((v) => (v.misses ?? []).map((m) => m.split('=')[0])))],
      // under 4.5:1 AND worse than the template's own default (its own grey-on-black footer is its own)
      lowContrast: sys.flatMap((v) =>
        (v.contrast ?? [])
          .filter(
            (c) =>
              // flow.mjs judges each text against the same text on the default page (regressed)
              c.regressed ??
              (c.ratio < 4.5 &&
                c.ratio <
                  (f.rows[0].views[v.vw].contrast?.find((o) => o.name === c.name)?.ratio ?? 99) - 0.05)
          )
          .map((c) => `${v.label}/${v.vw}:${c.name} ${c.ratio}`)
      ),
      // a kind of text the contract names that the measured page never shows: measured nothing
      contrastEmpty: Object.keys(JSON.parse(readFileSync(cfile, 'utf8')).contrast ?? {}).filter(
        (k) => !(f.rows[0].views.desktop.contrast ?? []).some((c) => c.name === k)
      ),
      replaced: tok.total.replaced,
      minutes: Math.round((Date.now() - t0) / 6000) / 10,
      flowExit: flow.status,
      ...(inner ? { inner } : {})
    })
  )
} finally {
  if (!keep) node('stand.mjs', 'down', '--name', name)
}
