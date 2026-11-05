/**
 * REG-PR-389: JA Restaurant passes Tracy's Template Customization Question Readiness check, and its links follow the
 * pages the customer unticked. The fences, each measured with bare node (no stand):
 *  1. the link gate: a child of an unticked page is dead, a script URL is dead, an own-host URL is a path, an external
 *     link is not touched, only a same-site path takes the locale prefix (the theme's pure libs under src/lib);
 *  2. the seed: the dark logo is written to an entry the seed has, the Pages list holds Our History and the nested pages;
 *  3. the readiness rule ABOUT-1 reads the stamped collection of the home view (the readiness tests of apps/tracy-web).
 * At the parent of the fix (REPO_ROOT=<worktree>) the libs and the seed rule are missing or wrong: the script is red.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks, ROOT } from './lib.mjs'

const THEME = join(ROOT, 'packages/cms/tracy-emdash-theme-restaurant')
const c = checks()

// 1. the link gate
const lib = async (name) => {
  const file = join(THEME, 'src/lib', name)
  return existsSync(file) ? import(pathToFileURL(file).href) : null
}
const [records, parents, links, menu] = await Promise.all(
  ['page-records.ts', 'parent-gate.ts', 'data-links.ts', 'menu-gate.ts'].map(lib)
)
c.check(
  'the theme has the link gate libs',
  Boolean(records && parents && links && menu),
  'parent-gate.ts, data-links.ts or menu-gate.ts is missing'
)
if (records && parents && links && menu) {
  const table = {
    menu: { collection: 'pages', slug: 'menu' },
    'menu/simple-menu': { collection: 'pages', slug: 'simple-menu' }
  }
  const off = async ({ slug }) => slug !== 'menu'
  const kit = await records.linkChecker(off, table, ['en'])(['/menu', '/menu/simple-menu'])
  c.check(
    'the kit checker alone leaves the child of an unticked page live (the defect)',
    kit('/menu/simple-menu') === true,
    String(kit('/menu/simple-menu'))
  )
  const gate = parents.withParents(records.linkChecker(off, table, ['en']), table, ['en'])
  const origins = ['http://site.test']
  const asPath = (u) => links.sameSitePath(u, origins) ?? u
  const urls = [
    '/menu',
    '/menu/simple-menu',
    '//site.test:80/menu',
    'https://site.test/menu',
    'https://example.com/menu',
    'tel:+1',
    '#top',
    '/'
  ]
  const live = await gate(urls.map(asPath))
  const dead = (u) => !links.isScriptUrl(u) && live(asPath(u))
  c.check(
    'Menu unticked: /menu, its child and every spelling of the own-host link are dead',
    [urls[0], urls[1], urls[2], urls[3]].every((u) => dead(u) === false),
    urls.map(dead).join(',')
  )
  c.check(
    'Menu unticked: external, tel:, # and / stay live',
    [urls[4], urls[5], urls[6], urls[7]].every((u) => dead(u) === true)
  )
  c.check(
    'a script URL is never printed, however it is spelled',
    [' JaVaScript:alert(1)', 'java\tscript:x', 'data:text/html,x'].every(
      (u) => links.isScriptUrl(u) && links.dataHref(u, (p) => p) === null
    )
  )
  const vi = (p) => `/vi${p}`
  c.check(
    'only a same-site path takes the locale prefix',
    links.dataHref('/menu', vi) === '/vi/menu' &&
      ['https://example.com/a', '#about', 'tel:+1'].every((u) => links.dataHref(u, vi) === u)
  )
  const items = [
    { url: '/', children: [] },
    { url: '/menu', children: [{ url: '/menu/simple-menu', children: [] }] },
    { url: '', children: [{ url: '/menu/simple-menu', children: [] }] }
  ]
  c.check(
    'the menu loses an unticked page, its children and a heading left empty',
    menu.pruneMenu(items, dead).length === 1
  )
}

// 2. the seed
const seed = JSON.parse(readFileSync(join(THEME, 'seed/seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(join(THEME, 'seed/personalize.json'), 'utf8'))
const dark = map.brand?.logoDark
c.check(
  'the dark logo targets an entry the seed has (the header reads chrome/chrome)',
  Boolean(dark && (seed.content[dark.collection] ?? []).some((e) => e.slug === dark.slug)),
  JSON.stringify(dark)
)
const pages = spawnSync(process.execPath, [join(THEME, 'tools/release.mjs'), '--site-pages', THEME], {
  encoding: 'utf8',
  env: { ...process.env, TRACY_CHECKOUT: ROOT }
})
let ids = []
try {
  ids = JSON.parse(pages.stdout).pages.map((p) => p.id)
} catch {}
c.check(
  'tracy_site_pages.json lists the nested pages, Our History included',
  ['our-history', 'simple-menu', 'menu-with-image', '2-column-menu', 'phone-reservation', 'contact-us'].every(
    (id) => ids.includes(id)
  ),
  ids.join(',')
)

// 3. the readiness rule
const t = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-reporter=tap',
    '--test-name-pattern=ABOUT-1',
    'apps/tracy-web/test/template-customization-question-readiness-c.test.mjs'
  ],
  { cwd: ROOT, encoding: 'utf8' }
)
c.check(
  'ABOUT-1 reads the stamped collection and covers every entry (readiness tests)',
  t.status === 0 && /ok \d+ - ABOUT-1: JA Restaurant keeps its home heading/.test(t.stdout),
  `exit ${t.status}`
)

c.done()
