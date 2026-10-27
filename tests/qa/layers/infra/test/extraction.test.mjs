// The denominator is extracted from code, so the extractors get tested against inputs that are
// not the happy path: dynamic syntax, multi-source COPY, --from, heredocs, globs, symlinks, FIFOs.
import { scratchDir } from '../lib/scratch.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { after, test } from 'node:test'
import * as jsYaml from 'js-yaml'
import { generate } from '../generate-denominator.mjs'
import { Extraction, extract, listScripts, listScriptsDeep, routesFromSource } from '../lib/extract.mjs'
import { parseDockerfile } from '../lib/dockerfile.mjs'
import { isIgnored, loadDockerignore } from '../lib/dockerignore.mjs'
import { LAYER_DIR, REPO } from '../lib/harness.mjs'
import { WEBROOT_KINDS } from '../lib/cases-host.mjs'
import { parseNa } from '../../../lib/denominator.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const temps = []
const scratch = () => {
  const dir = scratchDir('qa-infra-extract-')
  temps.push(dir)
  return dir
}
after(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })))

test('the extraction is deterministic and matches an independent scan of the same sources', () => {
  const a = extract()
  const b = extract()
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  const routes = a.items.filter((i) => i.kind === 'host-route')
  const app = readTextSync(path.join(REPO, 'apps/tracy-host/src/app.js'))
  const scanned = [...app.matchAll(/app\.(get|post)\('([^']+)'/g)].map(
    (m) => `host-route:${m[1].toUpperCase()} ${m[2]}`
  )
  assert.deepEqual(routes.map((r) => r.id).sort(), scanned.sort())
  const kinds = a.items
    .filter((i) => i.kind === 'host-job-kind')
    .map((i) => i.id.replace('host-job-kind:', ''))
  for (const kind of WEBROOT_KINDS)
    assert.ok(kinds.includes(kind), `kind ${kind} missing from the denominator`)
  assert.ok(kinds.includes('core-manifest-write'), 'the branch outside the table is missing')
  const compose = jsYaml.load(readTextSync(path.join(REPO, 'deploy/compose.yml')))
  assert.deepEqual(
    a.items
      .filter((i) => i.kind === 'compose-service')
      .map((i) => i.id.replace('compose-service:', ''))
      .sort(),
    Object.keys(compose.services).sort()
  )
})

test('the committed denominator and case manifests are exactly what the generator produces', async () => {
  for (const [rel, body] of await generate())
    assert.equal(readTextSync(path.join(LAYER_DIR, rel)), body, `${rel} is stale`)
})

test('every obligation is covered, N-A with a reason + source, or reported open — and N-A never lacks a source', () => {
  const d = extract()
  for (const item of d.items) {
    for (const [tag, key] of Object.entries(item.na)) {
      assert.ok(!item.requiredTags.includes(tag), `${item.id}: ${tag} is both required and N-A`)
      assert.ok(parseNa(d.naReasons[key]), `${item.id}/${tag}: N-A reason names no source`)
    }
  }
  assert.equal(d.details.extraction, d.unresolved.length === 0 ? 'complete' : 'incomplete')
})

test('dynamic syntax is reported, not guessed: a non-literal route path becomes `unresolved`', () => {
  const ex = new Extraction()
  routesFromSource(
    ex,
    'x.js',
    "const app = {}\napp.get(path, h)\napp.post(`/a/${id}`, h)\napp.get('/ok', h)\napp.use('/mw/*', h)"
  )
  assert.deepEqual([...ex.items.keys()], ['host-route:GET /ok'])
  assert.equal(ex.unresolved.length, 2)
})

test('Dockerfile reader: continuation lines, multi-source COPY, --from, flags, stages; heredoc/JSON COPY are unresolved', () => {
  const parsed = parseDockerfile(
    [
      'FROM node:24 AS build',
      'WORKDIR /app',
      'COPY a.txt b.txt ./dir/',
      'RUN echo one \\',
      '    && echo two',
      'FROM node:24',
      'COPY --from=build --chown=33:33 /app/out /srv/out',
      'COPY ["x", "y"]',
      'COPY <<EOF /etc/x\nline\nEOF',
      'USER www-data'
    ].join('\n')
  )
  assert.equal(parsed.stages.length, 2)
  const copy = parsed.stages[0].instructions.find((i) => i.op === 'COPY')
  assert.deepEqual(copy.sources, ['a.txt', 'b.txt'])
  assert.equal(copy.resolved, '/app/dir/')
  const second = parsed.stages[1].instructions.find((i) => i.op === 'COPY')
  assert.equal(second.flags.from, 'build')
  assert.equal(second.flags.chown, '33:33')
  assert.ok(parsed.unresolved.some((u) => /JSON form/.test(u.why)))
})

test('.dockerignore: negation re-includes, last match wins, a parent match excludes the subtree', () => {
  const dir = scratch()
  writeFileSync(
    path.join(dir, '.dockerignore'),
    '# c\npackages/web\n!packages/web/keep/dist\n**/node_modules\n.env*\n'
  )
  const patterns = loadDockerignore(path.join(dir, '.dockerignore'))
  assert.equal(isIgnored(patterns, 'packages/web/other/dist'), true)
  assert.equal(isIgnored(patterns, 'packages/web/keep/dist'), false)
  assert.equal(isIgnored(patterns, 'apps/x/node_modules/y'), true)
  assert.equal(isIgnored(patterns, '.env.local'), true)
  assert.equal(isIgnored(patterns, 'apps/x/src/a.js'), false)
})

test('symlinks and FIFOs are never followed or read: script listing only takes regular files', () => {
  const base = scratch()
  const dir = path.join(base, 'scripts')
  mkdirSync(dir)
  writeFileSync(path.join(dir, 'real.sh'), '#!/bin/sh\n')
  symlinkSync('/etc/passwd', path.join(dir, 'link.sh'))
  assert.equal(spawnSync('mkfifo', [path.join(dir, 'fifo.sh')]).status, 0)
  writeFileSync(path.join(dir, 'real.test.mjs'), '')
  assert.deepEqual(listScripts('scripts', base), ['scripts/real.sh'])
})

test('scripts are listed recursively and every timer callback is an item; a special entry is reported', () => {
  const d = extract()
  const ids = new Set(d.items.map((i) => i.id))
  const nested = [...ids].filter((id) =>
    /^script:packages\/fleet\/tracy-fleet-operation\/scripts\/[^/]+\/[^/]+\/.+/.test(id)
  )
  assert.ok(nested.length > 0, 'no script below the second level was found')
  for (const callback of ['sweepExpired', 'sweepClaims', 'sweepSiteMailDomains', 'refreshReleases'])
    assert.ok(
      [...ids].some((id) => id.startsWith('cron-callback:') && id.endsWith(`/${callback}`)),
      `cron callback ${callback} is missing`
    )
  const dir = scratch()
  mkdirSync(path.join(dir, 'a/b'), { recursive: true })
  writeFileSync(path.join(dir, 'a/b/deep.sh'), '#!/bin/sh\n')
  writeFileSync(path.join(dir, 'a/b/deep.test.sh'), '#!/bin/sh\n')
  symlinkSync(path.join(dir, 'a/b/deep.sh'), path.join(dir, 'a/b/link.sh'))
  const listed = listScriptsDeep('a', dir)
  assert.deepEqual(listed.found, ['a/b/deep.sh'])
  assert.deepEqual(listed.special, ['a/b/link.sh'])
})

test('every Dockerfile stage and stage-to-stage COPY is an item', () => {
  const d = extract()
  assert.ok(d.items.some((i) => i.kind === 'dockerfile-stage'))
  assert.ok(d.items.every((i) => i.kind !== 'dockerfile-stage-copy' || i.requiredTags.includes('rollback')))
})

test('the callback graph is followed: an imported callee is an unresolved edge, a stage index is a stage', async () => {
  const { extract: run } = await import('../lib/extract.mjs')
  const out = run()
  assert.ok(
    out.unresolved.some((u) =>
      /callee \w+ is imported from .*the callbacks inside it are not traced/.test(u.reason)
    ),
    'no imported cron callee was reported as an unresolved edge'
  )
  assert.ok(
    !out.items.some((i) => /dockerfile-stage:.*#line\d+/.test(i.id)),
    'a stage id depends on a line number'
  )
  const { parseDockerfile } = await import('../lib/dockerfile.mjs')
  const parsed = parseDockerfile('FROM a\nRUN x\nFROM b\nCOPY --from=0 /x /y\nADD --from=0 /z /w\n')
  assert.equal(parsed.stages[1].instructions.filter((i) => i.flags?.from === '0').length, 2)
})
