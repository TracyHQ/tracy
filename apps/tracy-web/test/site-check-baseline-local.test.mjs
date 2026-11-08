/**
 * `scripts/site-check-baseline.mjs --base`: the demo baseline of a new quickstart version measured on an untouched demo
 * read on this machine by tracy-host's own browser reader, as `demo-measures.mjs --base` reads it, so step 0 needs no
 * running tracy-web and tracy-host of the current code (JA Diner 1.0.5, 06/11/2026: the only stand with a tracy-web was a
 * week older than the baseline script). The pages go to the reader under `/index.php`, as the site's host asks them.
 * Fabricated gym demo, fabricated address.
 */
import assert from 'node:assert/strict'
import { readdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { main } from '../scripts/site-check-baseline.mjs'
import { demoRead, fakeHost } from './_site-check-pages.mjs'
import { kitIndex } from './_write-step-bench.mjs'

const VERSION = 'demo-gym/j6/1.2.3'
const kits = kitIndex()
const dirs = []
after(async () => {
  kits.done()
  await Promise.all(dirs.map((d) => rm(d, { recursive: true })))
})

async function setUp() {
  const dir = await mkdtemp(path.join(tmpdir(), 'baseline-local-'))
  dirs.push(dir)
  const pagesFile = path.join(dir, 'pages.json')
  writeFileSync(pagesFile, JSON.stringify(['/', '/about']))
  const cache = path.join(dir, 'cache')
  return { dir, pagesFile, cache }
}

test('--base measures on a demo read on this machine, with no database, and keeps the baseline in the cache', async () => {
  const { pagesFile, cache } = await setUp()
  const { host, calls } = fakeHost({ '/': demoRead('/'), '/about': demoRead('/about') })
  const out = []
  const code = await main(
    ['--base', 'https://demo-gym.example.test', '--version', VERSION, '--pages-file', pagesFile],
    { WRITE_BENCH_BASELINE_DIR: cache },
    { hostOf: async () => ({ host }), index: kits.index, out: (l) => out.push(l) }
  )
  assert.equal(code, 0, out.join('\n'))
  assert.ok(calls.length > 0, 'the reader was asked')
  assert.deepEqual(calls[0].pages, ['/', '/index.php/about'], 'Joomla pages are asked under /index.php')
  const kept = readdirSync(cache)
  assert.equal(kept.length, 1)
  const doc = JSON.parse(await readFile(path.join(cache, kept[0]), 'utf8'))
  assert.equal(doc.quickstart, VERSION)
  assert.match(out.join('\n'), /demo-gym\/j6\/1\.2\.3/)
})

test('--base and --site are one or the other, and --base still needs the baseline folder', async () => {
  const { pagesFile, cache } = await setUp()
  const err = []
  const both = await main(
    [
      '--base',
      'https://demo-gym.example.test',
      '--site',
      'site-1',
      '--version',
      VERSION,
      '--pages-file',
      pagesFile
    ],
    { WRITE_BENCH_BASELINE_DIR: cache },
    { err: (l) => err.push(l) }
  )
  assert.equal(both, 2)
  const noDir = await main(
    ['--base', 'https://demo-gym.example.test', '--version', VERSION, '--pages-file', pagesFile],
    {},
    { err: (l) => err.push(l) }
  )
  assert.equal(noDir, 2)
  assert.match(err.join('\n'), /usage/)
})
