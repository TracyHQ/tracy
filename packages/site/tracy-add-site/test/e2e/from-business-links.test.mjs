/**
 * Build it from my business in a real browser, with this package's own Tailwind CSS (local stand 26/10/2026):
 * - the mode switch fits a narrow panel (the left column, 276 px) and a phone (390 px): no overflow, no clipped label;
 * - a business kept from its links reopens in links mode with its links, not an empty "Search by name";
 * - the research line names the business by the best name the server knows, never a host it already replaced.
 *
 *   node --test --test-timeout=60000 packages/site/tracy-add-site/test/e2e/from-business-links.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(here, '../..')
const repoRoot = path.resolve(pkgRoot, '../../..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')
const playwright = await import(
  pathToFileURL(require.resolve('playwright', { paths: [path.join(repoRoot, 'apps/tracy-host')] })).href
)

const LINKS = [
  'https://share.google/hscFakeLink01',
  'https://magicpin.com/uae/Dubai/Al-Barsha/Fitness/Padel-and-Tennis-Coach/store/1000001',
  'https://www.instagram.com/harbour.sportclub'
]
const LINKS_GOOGLE = LINKS[0]
let browser
let script
let css

/** The package's Tailwind output, built the way `scripts/build-client.mjs` builds it. */
function tailwind() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'tracy-add-site-e2e-css-'))
  try {
    const out = path.join(outDir, 'add-site.css')
    execFileSync(
      process.execPath,
      [
        path.join(pkgRoot, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
        '--input',
        'src/client/add-site.css',
        '--output',
        out
      ],
      { cwd: pkgRoot, stdio: ['ignore', 'ignore', 'inherit'] }
    )
    return readFileSync(out, 'utf8')
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

before(async () => {
  css = tailwind()
  const built = await esbuild.build({
    stdin: {
      contents: `
        import { createRoot } from 'react-dom/client'
        import { ModeSwitch } from '@tracy/wo-views/link-rows'
        import { FromBusiness } from './src/client/from-business'
        import { en } from './src/client/strings'
        const t = (key, params = {}) =>
          Object.entries(params).reduce((text, [name, value]) => text.replaceAll('{' + name + '}', String(value)), en[key] ?? key)
        const root = createRoot(document.getElementById('root'))
        window.showServerBuild = (initialError = null) => {
          let action = { id: 'action-1', workflow: 'agent-demo/1', state: initialError ? 'failed' : 'queued',
            error: initialError, siteKey: 'owner-site.tracy.test', acceptedAt: new Date(Date.now() - 120000).toISOString() }
          const store = new Map([['tracy:from-business:v1', JSON.stringify({ id: 'business-1', name: 'Owner business', at: Date.now() })]])
          const storage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) }
          const state = { retries: [], opened: [], prepares: 0, hasKept: () => store.has('tracy:from-business:v1'),
            fail: () => { action = { ...action, state: 'failed', error: 'QA_NEEDS_REVIEW' } },
            complete: () => { action = { ...action, state: 'completed', error: null } } }
          const api = {
            question: async () => ({ ok: true, body: {} }),
            state: async () => ({ ok: true, body: { business: { id: 'business-1', phase: 'build', action } } }),
            retry: async (id, actionId) => {
              state.retries.push({ id, actionId })
              action = { ...action, id: 'action-2', state: 'queued', error: null }
              return { ok: true, body: { business: { phase: 'build', action } } }
            },
            prepare: async () => { state.prepares++; throw new Error('A chain must never prepare a chat') }
          }
          let mounts = 0
          state.remount = () => root.render(<FromBusiness key={++mounts} t={t} lang="en" onBack={() => {}} api={api} storage={storage} open={href => state.opened.push(href)} />)
          window.serverBuild = state
          state.remount()
        }
        const draftApi = {
          question: () => Promise.resolve({ ok: true, body: {} }),
          find: text => Promise.resolve({ ok: true, body: { candidates: [{ providerId: 'p1', name: text + ' result' }] } })
        }
        window.showDraftQuery = initialQuery => root.render(<FromBusiness t={t} lang="en" initialQuery={initialQuery} onBack={() => {}} api={draftApi} storage={null} />)
        window.showSwitch = (width) => root.render(
          <div id="panel" style={{ width: width + 'px' }}>
            <ModeSwitch mode="search" onMode={() => {}} search={<>{t('own_mode_search')}</>} links={<>{t('own_mode_links')}</>} />
          </div>
        )
        window.showStarted = (links, judged) => {
          const never = new Promise(() => {})
          const api = {
            question: () => Promise.resolve({ ok: true, status: 200, body: {} }),
            start: () => Promise.resolve({ ok: true, status: 201, body: { business: { id: 'b3', name: 'Club' }, links: judged } }),
            state: (id) => Promise.resolve({ ok: true, status: 200, body: { business: { id, phase: 'research', name: 'Club', job: null } } }),
            templates: () => never
          }
          const store = new Map([['tracy:from-business:v1', JSON.stringify({ id: 'x', name: 'x', links, at: 0 })]])
          const storage = { getItem: () => null, setItem: (k, v) => store.set(k, v), removeItem: () => {} }
          root.render(<div style={{ width: '390px' }}><FromBusiness t={t} lang="en" onBack={() => {}} api={api} storage={storage} /></div>)
        }
        window.showKept = (kept, serverName) => {
          const store = new Map([['tracy:from-business:v1', JSON.stringify({ ...kept, at: Date.now() })]])
          const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
          const never = new Promise(() => {})
          let asked = 0
          const api = {
            question: () => Promise.resolve({ ok: true, status: 200, body: {} }),
            state: (id) => asked++ === 0
              ? Promise.resolve({ ok: true, status: 200, body: { business: { id, phase: 'research', name: serverName, job: null } } })
              : never,
            templates: () => never
          }
          root.render(<div style={{ width: '390px' }}><FromBusiness t={t} lang="en" onBack={() => {}} api={api} storage={storage} /></div>)
        }
      `,
      resolveDir: pkgRoot,
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2020'],
    loader: { '.css': 'empty' },
    nodePaths: [
      path.join(pkgRoot, 'node_modules'),
      path.join(repoRoot, 'packages/core/tracy-core/node_modules')
    ],
    write: false,
    logLevel: 'silent'
  })
  script = built.outputFiles[0].text
  browser = await (playwright.chromium ?? playwright.default.chromium).launch({
    headless: true,
    args: ['--disable-features=MacAppCodeSignClone']
  })
})

after(async () => {
  await browser?.close()
})

async function withPage(run) {
  const context = await browser.newContext({ viewport: { width: 800, height: 900 } })
  try {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setContent('<!doctype html><html><head></head><body><div id="root"></div></body></html>')
    await page.addStyleTag({ content: css })
    await page.addScriptTag({ content: script })
    await run(page)
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
}

test('a server-owned build shows building, survives reopening and retries the same site before opening', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => window.showServerBuild())
    await page.getByRole('status').filter({ hasText: 'Building your site' }).waitFor()
    assert.equal(
      await page.getByText('Opening the chat where Tracy builds your site…', { exact: true }).count(),
      0
    )
    assert.match(await page.locator('[data-own-build-progress]').innerText(), /2 min so far/)
    await page.evaluate(() => window.serverBuild.fail())
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor({ timeout: 10000 })
    for (const width of [276, 390, 800]) {
      await page.setViewportSize({ width, height: 900 })
      const box = await page.getByRole('button', { name: 'Try again', exact: true }).evaluate((button) => {
        const label = document.createRange()
        label.selectNodeContents(button)
        return {
          button: button.getBoundingClientRect().toJSON(),
          label: label.getBoundingClientRect().toJSON(),
          alert: button.closest('[role="alert"]').getBoundingClientRect().toJSON()
        }
      })
      assert.ok(box.label.left >= box.button.left, `${width}px: retry label starts outside its button`)
      assert.ok(box.label.right <= box.button.right, `${width}px: retry label ends outside its button`)
      assert.ok(box.button.right <= box.alert.right, `${width}px: retry button leaves its alert`)
    }
    assert.equal(await page.evaluate(() => window.serverBuild.hasKept()), true)
    await page.evaluate(() => window.serverBuild.remount())
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Building your site' }).waitFor()
    assert.deepEqual(await page.evaluate(() => window.serverBuild.retries), [
      { id: 'business-1', actionId: 'action-1' }
    ])
    assert.deepEqual(await page.evaluate(() => window.serverBuild.opened), [])
    await page.evaluate(() => window.serverBuild.complete())
    await page.waitForFunction(() => window.serverBuild.opened.length === 1, {}, { timeout: 10000 })
    assert.deepEqual(await page.evaluate(() => window.serverBuild.opened), ['/owner-site.tracy.test'])
    assert.equal(await page.evaluate(() => window.serverBuild.prepares), 0)
    assert.equal(await page.evaluate(() => window.serverBuild.hasKept()), false)
  })
})

test('a blocked immutable brief has no futile own-site retry button', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => window.showServerBuild('BRIEF_NOT_READY'))
    await page.locator('[data-own-failed]').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 0)
    assert.equal(await page.evaluate(() => window.serverBuild.hasKept()), true)
  })
})

test('the mode switch fits a 276 px panel and a 390 px phone, both labels whole', async () => {
  await withPage(async (page) => {
    for (const width of [276, 390, 200]) {
      await page.evaluate((w) => window.showSwitch(w), width)
      const box = await page
        .locator('[data-link-mode]')
        .waitFor()
        .then(() =>
          page.evaluate(() => {
            const panel = document.getElementById('panel').getBoundingClientRect()
            const group = document.querySelector('[data-link-mode]')
            const items = [...group.querySelectorAll('[data-slot="toggle-group-item"]')]
            return {
              panelRight: panel.right,
              groupRight: group.getBoundingClientRect().right,
              items: items.map((item) => ({
                right: item.getBoundingClientRect().right,
                clipped: item.scrollWidth > item.clientWidth + 1
              }))
            }
          })
        )
      assert.ok(box.groupRight <= box.panelRight + 0.5, `${width}px: the switch ends past the panel`)
      assert.equal(box.items.length, 2)
      for (const item of box.items) {
        assert.ok(item.right <= box.panelRight + 0.5, `${width}px: a half ends past the panel`)
        assert.equal(item.clipped, false, `${width}px: a label is clipped`)
      }
    }
  })
})

test('a business kept from its links reopens in links mode with them, named by the best name known', async () => {
  await withPage(async (page) => {
    await page.evaluate(
      (links) => window.showKept({ id: 'b1', name: 'httpbin.org', links }, 'Harbour Sport Club'),
      LINKS
    )
    await page.locator('[data-link-mode="links"]').waitFor()
    const values = await page
      .locator('[data-link-row] input')
      .evaluateAll((inputs) => inputs.map((i) => i.value))
    assert.deepEqual(values.slice(0, 3), LINKS)
    await page.getByText('Harbour Sport Club', { exact: false }).first().waitFor()
    const line = await page.locator('[data-own-progress]').textContent()
    assert.match(line, /Harbour Sport Club/)
    assert.doesNotMatch(line, /httpbin\.org/)
  })
})

test('a business kept from a place reopens in search mode, as before', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => window.showKept({ id: 'b2', name: 'Crumb & Co' }, 'Crumb & Co'))
    await page.locator('[data-own-progress]').waitFor()
    assert.equal(await page.locator('[data-link-mode]').getAttribute('data-link-mode'), 'search')
  })
})

test('after a start, a link the server left out shows its reason, not the client status', async () => {
  await withPage(async (page) => {
    await page.evaluate(() =>
      window.showStarted(
        [],
        [
          {
            url: 'https://share.google/hscFakeLink01',
            kind: 'google',
            used: false,
            reason: 'unresolvable'
          },
          { url: 'https://www.instagram.com/harbour.sportclub', kind: 'instagram', used: true }
        ]
      )
    )
    await page.locator('[data-link-mode]').waitFor()
    await page.locator('[data-link-mode] [data-slot="toggle-group-item"]').nth(1).click()
    const inputs = page.locator('[data-link-row] input')
    await inputs.nth(0).fill(LINKS_GOOGLE)
    await inputs.nth(1).fill('https://www.instagram.com/harbour.sportclub')
    await page.getByText('Read from Google').waitFor()
    await page.locator('form button[type="submit"]').click()
    await page.locator('[data-own-progress]').waitFor()
    await page.getByText('Left out: Google could not read this link').waitFor()
    assert.equal(await page.getByText('Read from Google').count(), 0)
  })
})

test('a corrected business draft drops old search results and preserves a manual clear', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => window.showDraftQuery('Bakery A'))
    const input = page.locator('input').first()
    assert.equal(await input.inputValue(), 'Bakery A')
    await page.locator('button[type="submit"]').click()
    await page.locator('[data-own-places]').waitFor()
    await page.evaluate(() => window.showDraftQuery('Bakery B'))
    await page.waitForFunction(() => document.querySelector('input')?.value === 'Bakery B')
    assert.equal(await page.locator('[data-own-places]').count(), 0, 'A results do not belong to B')
    await input.fill('')
    await page.evaluate(() => window.showDraftQuery('Bakery C'))
    await page.waitForTimeout(200)
    assert.equal(await input.inputValue(), '')
  })
})
