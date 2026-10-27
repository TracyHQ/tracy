// A brand follows the viewer to the site they create from it (measured 30/09 on the stand `dsgnm`):
// the brand engine extracts into site A's folder (`Brand/<host>/`), the Build of the new site B runs
// in B's folder, so its `style` stage found no `Brand/<host>/tokens.css`. tracy-web checks that the
// viewer holds a seat on A and names it in the provision; this host — the one process that holds the
// sites root — copies the brand folder once the provision succeeded, before any Build can start.
import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'
import { brandFromOf, copyBrand } from '../src/brand-copy.js'
import { runProvisionJob } from '../src/provision.js'

async function sitesRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'tracy-host-brand-'))
  const brand = path.join(root, 'site-a', 'Brand', 'basecamp.com')
  mkdirSync(path.join(brand, 'fonts'), { recursive: true })
  writeFileSync(path.join(brand, 'tokens.css'), ':root { --bg: #0a0a0a; }\n')
  writeFileSync(path.join(brand, 'brand.json'), '{"name":"Basecamp"}\n')
  writeFileSync(path.join(brand, 'fonts', 'body.woff2'), 'font')
  writeFileSync(path.join(root, 'site-a', 'secret.txt'), 'not the brand')
  symlinkSync(path.join(root, 'site-a', 'secret.txt'), path.join(brand, 'leak.txt'))
  mkdirSync(path.join(root, 'site-b'), { recursive: true })
  return root
}

test('copyBrand copies Brand/<host>/ of one site into another, files and folders only', async () => {
  const root = await sitesRoot()
  const out = await copyBrand({ sitesRoot: root, from: 'site-a', to: 'site-b', host: 'basecamp.com' })
  assert.deepEqual(out, { copied: 3 })
  const dest = path.join(root, 'site-b', 'Brand', 'basecamp.com')
  assert.equal(readFileSync(path.join(dest, 'tokens.css'), 'utf8'), ':root { --bg: #0a0a0a; }\n')
  assert.equal(readFileSync(path.join(dest, 'fonts', 'body.woff2'), 'utf8'), 'font')
  // A link is never followed: it could point anywhere on the host.
  assert.equal(existsSync(path.join(dest, 'leak.txt')), false)
  assert.equal(lstatSync(path.join(dest, 'tokens.css')).isFile(), true)
  rmSync(root, { recursive: true, force: true })
})

test('copyBrand says why it copied nothing: no such brand, or no tokens.css in it', async () => {
  const root = await sitesRoot()
  assert.deepEqual(await copyBrand({ sitesRoot: root, from: 'site-a', to: 'site-b', host: 'other.com' }), {
    copied: 0,
    reason: 'Brand/other.com is not in site-a'
  })
  rmSync(path.join(root, 'site-a', 'Brand', 'basecamp.com', 'tokens.css'))
  assert.deepEqual(await copyBrand({ sitesRoot: root, from: 'site-a', to: 'site-b', host: 'basecamp.com' }), {
    copied: 0,
    reason: 'Brand/basecamp.com of site-a has no tokens.css'
  })
  assert.equal(existsSync(path.join(root, 'site-b', 'Brand')), false)
  rmSync(root, { recursive: true, force: true })
})

test('brandFromOf takes a safe label and a safe brand host, never the site itself', () => {
  assert.deepEqual(brandFromOf({ label: 'site-a', host: 'basecamp.com' }, 'site-b'), {
    label: 'site-a',
    host: 'basecamp.com'
  })
  assert.equal(brandFromOf(undefined, 'site-b'), null)
  for (const bad of [
    { label: '../x', host: 'basecamp.com' },
    { label: 'site-a', host: '../etc' },
    { label: 'site-a', host: '10.0.0.1' },
    { label: 'site-a', host: 'Basecamp.com' },
    { label: 'site-b', host: 'basecamp.com' },
    'site-a',
    { label: 'site-a' }
  ])
    assert.equal(brandFromOf(bad, 'site-b'), undefined, JSON.stringify(bad))
})

test('the brand copy runs after a good provision and never after a failed one', async () => {
  for (const code of [0, 1]) {
    const root = await sitesRoot()
    const logDir = await mkdtemp(path.join(tmpdir(), 'tracy-host-brand-logs-'))
    const puts = []
    await runProvisionJob({
      jobId: 'j1',
      body: {
        label: 'site-b',
        site: 'site-b',
        platform: 'wordpress',
        fresh: true,
        brandFrom: { label: 'site-a', host: 'basecamp.com' }
      },
      config: { logDir, privateRoot: '/srv', scriptsDir: '/opt', sitesRoot: root },
      jobs: { put: async (_id, fields) => puts.push(fields) },
      run: async ({ onLine }) => {
        await onLine('TRACY_RESULT port=8181 label=site-b')
        return { code, tail: [] }
      }
    })
    const copied = existsSync(path.join(root, 'site-b', 'Brand', 'basecamp.com', 'tokens.css'))
    const last = puts.at(-1)
    if (code === 0) {
      assert.equal(copied, true)
      assert.equal(last.state, 'done')
      assert.deepEqual(last.brand, { from: 'site-a', host: 'basecamp.com', copied: 3 })
    } else {
      assert.equal(copied, false)
      assert.equal(last.state, 'failed')
    }
    rmSync(root, { recursive: true, force: true })
    rmSync(logDir, { recursive: true, force: true })
  }
})

test('POST /_host/provision refuses a brand source of the wrong shape before starting anything', async () => {
  const dir = async (n) => mkdtemp(path.join(tmpdir(), `tracy-host-${n}-`))
  const config = {
    hostName: 'local',
    hostSecret: 'host-secret',
    sitesRoot: await dir('sites'),
    privateRoot: await dir('private'),
    scriptsDir: await dir('scripts'),
    jobsDir: await dir('jobs'),
    logDir: await dir('logs')
  }
  let ran = false
  const app = buildApp({
    config,
    jobs: { put: async () => {}, get: async () => null },
    run: async () => {
      ran = true
      return { code: 0, tail: [] }
    }
  })
  const payload = JSON.stringify({
    site: 'site-b.tracy.test',
    label: 'site-b',
    platform: 'wordpress',
    fresh: true,
    brandFrom: { label: '../site-a', host: 'basecamp.com' }
  })
  const headers = await signHostCall({ secret: config.hostSecret, path: '/_host/provision', body: payload })
  const res = await app.fetch(
    new Request('http://tracy-host.test/_host/provision', { method: 'POST', headers, body: payload })
  )
  assert.equal(res.status, 400)
  assert.match(JSON.stringify(await res.json()), /refused brandFrom/)
  assert.equal(ran, false)
})
