/**
 * REG-PR-1424: the three EmDash templates resolve astro, @astrojs/node and sharp to a fixed release.
 * Each template is a standalone pnpm project, so the fence is its own lockfile: the `importers`
 * row of the template must resolve every package to at least the first fixed release of its line.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, ROOT } from './lib.mjs'

const FIXED = { astro: '7.2.8', '@astrojs/node': '11.1.3', sharp: '0.35.5' }
const TEMPLATES = ['tracy-emdash-theme-base', 'tracy-emdash-theme-business', 'tracy-emdash-theme-saas']

/** @param {string} a @param {string} b */
const atLeast = (a, b) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return true
}

const c = checks()
for (const t of TEMPLATES) {
  const lock = readFileSync(join(ROOT, 'packages/cms', t, 'pnpm-lock.yaml'), 'utf8')
  const importer = lock.slice(lock.indexOf('importers:'), lock.indexOf('\npackages:'))
  for (const [name, fixed] of Object.entries(FIXED)) {
    const m = importer.match(
      new RegExp(
        `\\n      '?${name.replace('/', '\\/')}'?:\\n        specifier: [^\\n]+\\n        version: (\\d+\\.\\d+\\.\\d+)`
      )
    )
    const got = m ? m[1] : 'missing'
    c.check(`${t}: ${name} >= ${fixed}`, m !== null && atLeast(got, fixed), got)
  }
}
c.done()
