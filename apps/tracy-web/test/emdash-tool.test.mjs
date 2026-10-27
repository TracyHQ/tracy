/** The EmDash personalize tool as this process holds it: one tool for three templates, and a way to run it. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { runNode } from '../src/lib/emdash-tool.js'

const CMS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../packages/cms')

test('the three templates ship ONE personalize tool: the image carries a single copy, so they must not differ', () => {
  const [business, saas, base] = ['business', 'saas', 'base'].map((t) =>
    readFileSync(path.join(CMS, `tracy-emdash-theme-${t}`, 'tools', 'personalize.mjs'))
  )
  assert.ok(business.equals(saas), 'saas differs from business')
  assert.ok(business.equals(base), 'base differs from business')
})

test('the image carries every seed file the tool reads, for every template that ships it (DEMO FILE LINKS)', () => {
  // Measured 10/10/2026 on g60-biz-emd-full: the hero's "Download company profile (PDF)" still opened the demo company's
  // brochure, because the image carried seed.json, personalize.json and questions.json but not media-map.json, the only
  // file that says which link the importer fills with a document. The tool found no file link, and said nothing.
  const tool = readFileSync(path.join(CMS, 'tracy-emdash-theme-business', 'tools', 'personalize.mjs'), 'utf8')
  const read = new Set(
    [...tool.matchAll(/\bread\('([\w.-]+\.json)'\)|SEED_DIR, '([\w.-]+\.json)'/g)].map((m) => m[1] ?? m[2])
  )
  assert.ok(read.has('media-map.json') && read.has('seed.json'), [...read].join(', '))
  const dockerfile = readFileSync(path.join(CMS, '..', '..', 'apps', 'tracy-web', 'Dockerfile'), 'utf8')
  for (const [template, pkg] of [
    ['tracy-business', 'tracy-emdash-theme-business'],
    ['tracy-saas', 'tracy-emdash-theme-saas'],
    ['tracy-base', 'tracy-emdash-theme-base']
  ]) {
    const copied = new Set(
      dockerfile
        .split('\n')
        .filter(
          (line) => line.startsWith('COPY ') && line.trim().endsWith(`./src/emdash-tool/${template}/seed/`)
        )
        .flatMap((line) => line.split(/\s+/).filter((w) => w.startsWith(`packages/cms/${pkg}/seed/`)))
        .map((w) => path.basename(w))
    )
    for (const file of read)
      if (existsSync(path.join(CMS, pkg, 'seed', file)))
        assert.ok(copied.has(file), `${template}: the tool reads seed/${file}, the image does not carry it`)
  }
})

test('runNode: the child’s own environment, its output, its exit code — and a child that cannot start is exit 1, not a throw', async () => {
  const echo = await runNode({
    args: [
      '-e',
      'console.log(process.env.ONLY_THIS ?? "none", process.env.SESSION_SECRET ?? "no secret"); console.error("err"); process.exit(3)'
    ],
    env: { PATH: process.env.PATH ?? '', ONLY_THIS: 'yes' }
  })
  assert.equal(echo.code, 3)
  assert.equal(echo.stdout.trim(), 'yes no secret')
  assert.equal(echo.stderr.trim(), 'err')
  assert.equal(echo.killed, false)
  const missing = await runNode({ args: ['/no/such/script.mjs'], env: { PATH: process.env.PATH ?? '' } })
  assert.notEqual(missing.code, 0)
})

test('runNode: a signal or a time limit ends the child, and says it did', async () => {
  const controller = new AbortController()
  const running = runNode({
    args: ['-e', 'setInterval(() => {}, 1000)'],
    env: { PATH: process.env.PATH ?? '' },
    signal: controller.signal
  })
  setTimeout(() => controller.abort(), 100)
  const stopped = await running
  assert.equal(stopped.killed, true)
  const late = await runNode({
    args: ['-e', 'setInterval(() => {}, 1000)'],
    env: { PATH: process.env.PATH ?? '' },
    timeoutMs: 150
  })
  assert.equal(late.killed, true)
  const already = new AbortController()
  already.abort()
  assert.equal(
    (
      await runNode({
        args: ['-e', 'setInterval(() => {}, 1000)'],
        env: { PATH: process.env.PATH ?? '' },
        signal: already.signal
      })
    ).killed,
    true
  )
})

test('image-only placement reads the seed files shipped by the Dockerfile, without falling back to checkout media', async () => {
  const { cpSync, mkdirSync, mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { emdashPictureInventory } = await import('../src/sites/brief-engines/emdash-real-pictures.js')
  const root = mkdtempSync(path.join(tmpdir(), 'emdash-image-seeds-'))
  try {
    const repo = path.resolve(CMS, '..', '..')
    const lines = readFileSync(path.join(repo, 'apps/tracy-web/Dockerfile'), 'utf8').split('\n')
    for (const name of ['business', 'saas', 'base']) {
      const target = `./src/emdash-tool/tracy-${name}/seed`
      const dir = path.join(root, name)
      mkdirSync(dir)
      for (const line of lines.filter(
        (line) => line.startsWith('COPY packages/cms/') && line.split(/\s+/).at(-1).startsWith(target)
      )) {
        const words = line.trim().split(/\s+/),
          destination = words.pop(),
          suffix = destination.slice(target.length)
        const dest = path.join(dir, suffix)
        for (const source of words.slice(1)) {
          if (suffix === '/media') cpSync(path.join(repo, source), dest, { recursive: true })
          else
            cpSync(
              path.join(repo, source),
              suffix.endsWith('.json') ? dest : path.join(dest, path.basename(source))
            )
        }
      }
      const inventory = await emdashPictureInventory({ seedDir: dir })
      assert.ok(inventory.slots.length > 0, `${name}: no runnable image inventory in the image layout`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
