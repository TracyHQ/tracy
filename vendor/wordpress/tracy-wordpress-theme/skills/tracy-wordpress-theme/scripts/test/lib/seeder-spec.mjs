// A small spec-pack for the whole-seed tests of the seeder issues (#68, #74): written to disk, seeded
// against the fake site, `edit(spec)` changing any file's object before it is written.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseArgs, runSeed } from '../../seed.mjs'

export const body = (t) => `<!-- wp:paragraph --><p>${t}</p><!-- /wp:paragraph -->`

export function baseSpec() {
  const pagemap = {
    locales: ['en'],
    defaultLocale: 'en',
    pages: [
      { file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page' },
      { file: 'about.html', path: '/about-us', slug: 'about-us', title: 'About us', view: 'page' }
    ]
  }
  const page = (i, extra = {}) => ({ ...pagemap.pages[i], parent: null, status: 'publish', content: body(pagemap.pages[i].title), meta: {}, images: [], ...extra })
  return {
    'page-map': pagemap,
    content: {
      site: { name: 'Fake', tagline: 'Site', locales: ['en'], defaultLocale: 'en' },
      pages: [page(0), page(1)],
      posts: [],
      categories: [],
      archives: [],
      images: []
    },
    sections: { acm: [], custom: [], other: [] },
    menus: { menus: [] },
    redirects: { rules: [] },
    'patterns.map': { types: {} }
  }
}

/** Seed `spec` (see baseSpec) into `site`; returns the report. `n` numbers the report of a repeat run. */
export async function seedSpec(site, { root = mkdtempSync(join(tmpdir(), 'seeder-issue-')), edit = null, n = 1, extraArgs = [], logs = null } = {}) {
  const spec = baseSpec()
  edit?.(spec)
  const dir = join(root, 'spec')
  mkdirSync(dir, { recursive: true })
  for (const [name, value] of Object.entries(spec)) writeFileSync(join(dir, name === 'patterns.map' ? 'patterns.map.json' : `${name}.json`), JSON.stringify(value))
  const opts = parseArgs([
    '--spec', dir, '--wp', 'fake', '--theme', 'wp-tracy-business',
    '--patterns-map', join(dir, 'patterns.map.json'), '--images', '/img',
    '--base-url', 'http://x', '--report', join(root, `report-${n}.json`), ...extraArgs
  ])
  const stderr = console.error
  console.error = (...args) => { logs?.push(args.join(' ')) }
  try {
    return await runSeed(opts, { runner: site.wp, fetch: async () => ({ status: 200, headers: new Map() }) })
  } finally {
    console.error = stderr
  }
}
