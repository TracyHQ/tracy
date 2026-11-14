/**
 * What fold and unfold compare a demo by (provision/farm-common.sh: farm_probe_paths, farm_baseline):
 * `/` itself, its landing page when `/` redirects on the same host, and two links from the page.
 * curl here is a fake that answers from a table; the real thing runs in test/e2e/demo-farm/run.sh.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/demo-farm-baseline.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const COMMON = fileURLToPath(new URL('../scripts/provision/farm-common.sh', import.meta.url))
const HOST = 'demo.tracy.test'

/** `pages`: path -> [code, location, body]. A path not in it answers 404. */
function run(pages, script) {
  const dir = mkdtempSync(join(tmpdir(), 'tracy-farm-baseline-'))
  try {
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    writeFileSync(join(dir, 'pages.json'), JSON.stringify(pages))
    writeFileSync(
      join(bin, 'curl'),
      `#!/usr/bin/env node
const { readFileSync } = require('node:fs')
const pages = JSON.parse(readFileSync(${JSON.stringify(join(dir, 'pages.json'))}, 'utf8'))
const path = new URL(process.argv[process.argv.length - 1]).pathname + new URL(process.argv[process.argv.length - 1]).search
const [code, loc, body] = pages[path] || [404, '', '']
process.stdout.write(body + '\\n__TRACY_PROBE__ ' + code + ' ' + loc)
`
    )
    chmodSync(join(bin, 'curl'), 0o755)
    return spawnSync('bash', ['-c', `set -euo pipefail; . "$COMMON"; ${script}`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        COMMON,
        LABEL: 'demo',
        HOST_PORT: '1',
        PROBE_HOST: HOST
      }
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const page = (title, ...hrefs) =>
  `<html><head><title>${title}</title></head><body>${hrefs.map((h) => `<a href="${h}">x</a>`).join('')}</body></html>`

test('baseline: `/` that is a 200 keeps its own links and nothing else', () => {
  const r = run(
    {
      '/': [200, '', page('Home', '/about', `https://${HOST}/news`, 'https://elsewhere.test/x', '/third')],
      '/about': [200, '', page('About')],
      '/news': [200, '', page('News')]
    },
    'farm_baseline site; printf "%s" "$BASELINE"'
  )
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '/\t200\t\tHome\n/about\t200\t\tAbout\n/news\t200\t\tNews\n')
})

test('baseline: `/` that redirects on its own host is kept as a redirect, its landing page and links are added', () => {
  for (const loc of [
    `https://${HOST}/en/`,
    `http://${HOST}:8080/en/`,
    '/en/',
    'http://127.0.0.1:1/en/',
    `https://${HOST.toUpperCase()}/en/`
  ]) {
    const r = run(
      {
        '/': [301, loc, ''],
        '/en/': [200, '', page('Home EN', '/en/about', '/en/news', '/en/more')],
        '/en/about': [200, '', page('A')],
        '/en/news': [200, '', page('N')]
      },
      'farm_baseline site; printf "%s" "$BASELINE"'
    )
    assert.equal(r.status, 0, `${loc}: ${r.stderr}`)
    assert.equal(
      r.stdout,
      `/\t301\t${loc}\t\n/en/\t200\t\tHome EN\n/en/about\t200\t\tA\n/en/news\t200\t\tN\n`,
      loc
    )
  }
})

test('baseline: a redirect that goes through two hops lands on the page', () => {
  const r = run(
    {
      '/': [302, `https://${HOST}/a`, ''],
      '/a': [301, `https://${HOST}/en/`, ''],
      '/en/': [200, '', page('EN')]
    },
    'farm_probe_paths'
  )
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), '/\n/en/')
})

test('baseline: a redirect to another host is refused', () => {
  const r = run({ '/': [301, 'https://other.test/en/', ''] }, 'farm_baseline site')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /not a page on demo\.tracy\.test/)
})

test('baseline: a redirect loop and more than 3 hops are refused', () => {
  let r = run(
    {
      '/': [301, `https://${HOST}/en/`, ''],
      '/en/': [301, `https://${HOST}/`, '']
    },
    'farm_baseline site'
  )
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /in a loop/)
  r = run(
    {
      '/': [301, '/a', ''],
      '/a': [301, '/b', ''],
      '/b': [301, '/c', ''],
      '/c': [301, '/d', ''],
      '/d': [200, '', page('D')]
    },
    'farm_baseline site'
  )
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /more than 3 times/)
})

test('baseline: a landing page that is not a 200 is refused, and so is a `/` that is neither', () => {
  let r = run({ '/': [301, '/en/', ''], '/en/': [404, '', 'gone'] }, 'farm_baseline site')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /answers 404/)
  r = run({ '/': [500, '', 'boom'] }, 'farm_baseline site')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /does not answer \/ with 200/)
})

test('baseline: a Location with userinfo, another hostname or another local port is refused', () => {
  for (const loc of [
    `https://${HOST}:80@evil.test/en/`,
    `https://user@${HOST}/en/`,
    'http://127.0.0.1:2/en/',
    `https://${HOST}.evil.test/en/`
  ]) {
    const r = run({ '/': [301, loc, ''], '/en/': [200, '', page('EN')] }, 'farm_baseline site')
    assert.notEqual(r.status, 0, loc)
    assert.match(r.stderr, /not a page on/, loc)
  }
})

test('verify: a baseline line with an empty title (a redirect) verifies equal; a changed Location differs', () => {
  const pages = {
    '/': [301, `https://${HOST}/en/`, ''],
    '/en/': [200, '', page('Home EN', '/en/about')],
    '/en/about': [301, `https://${HOST}/en/about/`, '']
  }
  let r = run(pages, 'farm_baseline site 2>/dev/null; farm_verify site')
  assert.equal(r.status, 0, r.stderr)
  r = run(
    pages,
    `farm_baseline site 2>/dev/null; BASELINE="$(printf '%s' "$BASELINE" | sed 's|/en/about/|/en/other/|')
"; TRACY_FARM_VERIFY_TRIES=1 farm_verify site`
  )
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /\/en\/about: was/)
})
