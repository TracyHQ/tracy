#!/usr/bin/env node
/**
 * One JA WordPress quickstart through the design-system slot, from its release to a measured verdict:
 *
 *   node scripts/pass-wordpress.mjs <slug> --port <n> [--cdp <n>] [--evidence <dir>] [--keep]
 *
 *  1. stand: quickstart/<slug>/wp7 restored and served (stand.mjs);
 *  2. contract draft templates/wordpress-<slug>.json (extends wordpress-tracy-base): the theme's own
 *     look is its overlay tokens.css, roles read off its home page — an existing contract is kept;
 *  3. the default page snapped (the control's reference);
 *  4. the theme's own stylesheet tokenized IN ITS SOURCE (overlays/wp-<slug>/assets/css/wp-<slug>.css,
 *     what the theme release ships), the theme rebuilt, the built stylesheets copied onto the stand;
 *  5. flow.mjs with four contrasting systems and both controls.
 * The stand is taken down afterwards unless --keep. Prints one JSON summary line.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { innerPass } from './inner.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const THEMES = join(ROOT, 'packages/cms/tracy-wordpress-theme')
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
const keep = args.includes('--keep')
// --no-tokenize: the theme as released, its own stylesheets measured (what customers run today)
const noTokenize = args.includes('--no-tokenize')
// --all-sheets: every stylesheet of the theme's overlay is tokenized and copied onto the stand, not
// only its own <theme>.css (TDSR CSS-2, 13/10/2026: JA Essence je-detail.css, JA Impact groups/*.css…)
const allSheets = args.includes('--all-sheets')
// --theme-tree: the theme as the tree builds it (what its next release ships, every file) laid over the
// restored release before anything is measured — a theme hotfix not yet in any quickstart (JA Vega
// 1.1.17, whose 1.1.16 inc/extra.php printed PHP as text, 13/10/2026). Its PHP alone is not enough:
// the tree's functions.php loads the tree's stylesheets, and the page came out unstyled
const themeTree = args.includes('--theme-tree')
const slug = args.find((a) => !a.startsWith('--'))
if (!/^(ja|tracy)-[a-z0-9-]+$/.test(slug ?? '') || !port) {
  console.error('usage: pass-wordpress.mjs <ja-slug> --port <n> [--cdp <n>] [--evidence <dir>] [--keep]')
  process.exit(1)
}
// Tracy Base's theme is `tracy-base`; every other theme is `wp-<slug>`
const theme = slug === 'tracy-base' ? 'tracy-base' : `wp-${slug}`
const EVIDENCE = resolve(
  opt('--evidence', join(ROOT, 'tasks/evidence/ds-slot-released-2026-10-09')),
  `${slug}-wp7`
)
const SYSTEMS_DEFAULT = [
  'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567',
  'refero:813be405-c2b9-41be-9864-7b53d66483dc',
  'od:apple'
]
// --systems a,b,c: the systems measured (default the four contrasting ones above); the OpenDesign
// library is what a customer picks from, so a check of what customers get names od: ids
const SYSTEMS = SYSTEMS_OPT ? SYSTEMS_OPT.split(',').filter(Boolean) : SYSTEMS_DEFAULT
const node = (script, ...a) =>
  execFileSync(process.execPath, [join(HERE, script), ...a], { encoding: 'utf8', maxBuffer: 1 << 26 })
const name = `${slug}-wp7`.slice(0, 40)
const rootVariationTokens = (t) => {
  const cfg = JSON.parse(readFileSync(join(THEMES, 'overlays', t, 'theme.config.json'), 'utf8'))
  const file = join(THEMES, 'src', t, 'styles', `${cfg.rootVariation}.json`)
  if (!cfg.rootVariation || !existsSync(file)) return {}
  const v = JSON.parse(readFileSync(file, 'utf8'))
  return Object.fromEntries((v.settings?.color?.palette ?? []).map((p) => [`--${p.slug}`, p.color]))
}
const t0 = Date.now()
// JA quickstarts are released as quickstart/<slug>/wp7; Tracy's own templates as <slug>/wp7
const tagOf = (s) => (s.startsWith('ja-') ? `quickstart/${s}/wp7` : `${s}/wp7`)
const source = join(THEMES, 'overlays', theme, 'assets/css', `${theme}.css`)
if (!noTokenize && !existsSync(source)) throw new Error(`${source}: no theme stylesheet to tokenize`)

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
const site = stand.site
try {
  if (themeTree) {
    execFileSync(process.execPath, [join(THEMES, 'scripts/build.mjs'), '--target', theme], {
      cwd: THEMES,
      stdio: 'ignore'
    })
    cpSync(join(THEMES, 'src', theme), join(stand.dir, 'site/wp-content/themes', theme), { recursive: true })
  }
  const cname = `wordpress-${slug}`
  const cfile = join(HERE, '../templates', `${cname}.json`)
  if (!existsSync(cfile)) {
    const found = JSON.parse(
      node(
        'discover.mjs',
        '--site',
        site,
        '--template',
        `wordpress/${theme}`,
        '--cdp',
        String(Number(cdp) + 5)
      )
    )
    const r = found.roles
    const cls = (sel) => (sel ? sel.split(' ').pop() : null)
    const boot = JSON.parse(readFileSync(join(HERE, '../templates/joomla-t4-ja.json'), 'utf8')).extraPalettes
    const contract = {
      schema: 'tracy-ds-template/v1',
      extends: 'wordpress-tracy-base',
      template: `wordpress/${theme}`,
      release: tagOf(slug),
      // the theme's own look: its overlay tokens.css, or (a theme whose look is a root variation,
      // JA Kinetic) that variation's palette
      ...(existsSync(join(THEMES, 'overlays', theme, 'tokens.css'))
        ? { baseTokensFile: `packages/cms/tracy-wordpress-theme/overlays/${theme}/tokens.css` }
        : { baseTokens: rootVariationTokens(theme) }),
      roles: r,
      discovered: found.discovered,
      // inverse bands the page keeps (discover.mjs): their rules stay the template's
      keepScopes: found.inverse ?? [],
      extraPalettes: boot,
      selectors: {
        ...(r.display && { display: `${cls(r.display)}, .tracy-display` }),
        heading: ['main h2.wp-block-heading'],
        ...(r['button-primary'] && { buttonPrimary: [`.tracy ${cls(r['button-primary'])}`] }),
        bodyFace: ['body.tracy', '.tracy p', '.tracy li'],
        ...(r.container && { container: [`.tracy ${cls(r.container)}`] }),
        ...(r.section && { section: [`.tracy ${r.section}`] })
      },
      contrast: {
        'accent-text': 'main .tracy-eyebrow, main a:not([class*=button]):not(:has(img))',
        muted: 'main .has-muted-color, main .tracy-section__head p',
        body: 'main p',
        'card-text': 'main .tracy-card p'
      }
    }
    writeFileSync(cfile, `${JSON.stringify(contract, null, 2)}\n`)
  }
  // what the presets (and the theme's own variables) compute on the released page: given back
  // inside the bands the page keeps (keepRules)
  const contractK = JSON.parse(readFileSync(cfile, 'utf8'))
  if (contractK.keepScopes?.length && !contractK.keepDefaults) {
    const COLOURS = [
      'bg',
      'surface',
      'surface-warm',
      'fg',
      'fg-2',
      'muted',
      'meta',
      'border',
      'border-soft',
      'accent',
      'accent-on',
      'accent-hover',
      'accent-active',
      'success',
      'warn',
      'danger'
    ]
    const keys = [
      ...COLOURS.map((n) => `--wp--preset--color--${n}`),
      ...Object.keys(contractK.templateVars ?? {})
    ]
    const got = JSON.parse(
      node('discover.mjs', '--site', site, '--cdp', String(Number(cdp) + 5), '--vars', keys.join(','))
    )
    contractK.keepDefaults = got.rootVars ?? {}
    writeFileSync(cfile, `${JSON.stringify(contractK, null, 2)}\n`)
  }
  // the kept bands, read off the default page, drafted into the contract (--bands)
  if (draftBands)
    node(
      'bands.mjs',
      '--site',
      site,
      '--template',
      cname,
      '--cdp',
      String(Number(cdp) + 7),
      '--draft',
      '--fills'
    )
  node(
    'flow.mjs',
    '--cms',
    'wordpress',
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
  let tok = { total: { replaced: 0 } }
  if (!noTokenize) {
    const overlayCss = join(THEMES, 'overlays', theme, 'assets/css')
    const sheets = allSheets
      ? readdirSync(overlayCss, { recursive: true })
          .map(String)
          .filter((f) => f.endsWith('.css') && !/^(fixtures|artifacts)\//.test(f))
      : [`${theme}.css`]
    tok = JSON.parse(
      node('tokenize.mjs', '--template', cname, '--write', ...sheets.map((f) => join(overlayCss, f)))
        .trim()
        .split('\n')
        .pop()
    )
    execFileSync(process.execPath, [join(THEMES, 'scripts/build.mjs'), '--target', theme], {
      cwd: THEMES,
      stdio: 'ignore'
    })
    const built = join(THEMES, 'src', theme, 'assets/css')
    const live = join(stand.dir, 'site/wp-content/themes', theme, 'assets/css')
    // only the tokenized stylesheets: the control then isolates tokenization from any other change
    // develop made to the theme since its release
    for (const f of sheets) copyFileSync(join(built, f), join(live, f))
  }
  const flow = spawnSync(
    process.execPath,
    [
      join(HERE, 'flow.mjs'),
      '--cms',
      'wordpress',
      '--template',
      cname,
      '--site',
      site,
      '--cdp',
      cdp,
      '--wp-container',
      stand.web,
      '--out',
      join(EVIDENCE, 'final'),
      '--baseline',
      join(EVIDENCE, 'baseline/default.json'),
      // the numbers of this run, as the tdsr-measurement/v1 file of this version (measurement.mjs)
      '--measure-version',
      stand.version,
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
  const snapArgs = ['--cms', 'wordpress', '--template', cname, '--site', site, '--cdp', cdp]
  const inner = innerN
    ? await innerPass({
        site,
        n: innerN,
        cdp: Number(cdp) + 9,
        here: HERE,
        snap: snapArgs,
        common: [...snapArgs, '--wp-container', stand.web],
        evidence: EVIDENCE,
        systems: innerSystems
      })
    : undefined
  const sys = f.verdicts.filter((v) => v.kind === 'system')
  console.log(
    JSON.stringify({
      slug: `${slug}/wp7`,
      version: stand.version,
      theme: (() => {
        try {
          // the theme the site runs (installed into the container, not always in the stand's webroot)
          return /Version:\s*(\S+)/.exec(
            execFileSync(
              'docker',
              ['exec', stand.web, 'cat', `/var/www/html/wp-content/themes/${theme}/style.css`],
              {
                encoding: 'utf8'
              }
            )
          )?.[1]
        } catch {
          return null
        }
      })(),
      pass: `${f.verdicts.filter((v) => v.pass).length}/${f.verdicts.length}`,
      controls: f.verdicts.filter((v) => v.kind === 'control').map((c) => c.differences),
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
      replaced: tok.total.replaced,
      minutes: Math.round((Date.now() - t0) / 6000) / 10,
      flowExit: flow.status,
      ...(inner ? { inner } : {})
    })
  )
} finally {
  if (!keep) node('stand.mjs', 'down', '--name', name)
}
