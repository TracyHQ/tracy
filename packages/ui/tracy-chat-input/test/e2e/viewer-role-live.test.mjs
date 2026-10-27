/**
 * The role follows an Owner's change while the page is open (#1036), in a real browser: the real
 * SeatBar (the session occupant above the chat box), the real role store, its signal watcher and the
 * `<html data-tracy-seat-viewer>` mirror, with this plugin's real CSS. The door (`/api/sites`) is a
 * fake the test answers; the signal is the page's real `tracy:team-changed` event, the one the Inbox
 * sends when its poll sees the approval.
 *
 *   - a Viewer made Editor: the Viewer bar goes, the attribute goes, "You can now edit this site."
 *     shows once and leaves on its own; the draft in the chat box and the page itself stay (no reload);
 *   - an Editor made Viewer: the bar and the attribute come back, no notice.
 *
 * Harness rules as in `hero-placeholder.test.mjs`: `playwright` from apps/tracy-host, system Chrome,
 * and a missing dependency or browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

let outDir = ''
let script = ''
let browser

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tci-role-live-e2e-'))
  const outfile = path.join(outDir, 'page.js')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { createRoot } from 'react-dom/client'
        import { SeatBar } from './SeatBar'
        import {
          createAskedSites, createPromotedNotice, createSeatRole, mirrorViewerAttr, watchRoleSignals
        } from './seat-role.mjs'
        import { en } from './strings'
        import { CSS } from './styles'
        window.mount = (role, noticeMs) => {
          window.door = { role, reads: 0 }
          const read = async () => {
            window.door.reads += 1
            return { status: 200, body: { sites: [{ siteKey: 'a.test', role: window.door.role }] } }
          }
          const asked = createAskedSites()
          const seatRole = createSeatRole({ siteKey: 'a.test', read, asked })
          const notice = createPromotedNotice({
            seatRole,
            setTimer: (fn, ms) => window.setTimeout(fn, ms),
            clearTimer: (h) => window.clearTimeout(h),
            ms: noticeMs
          })
          watchRoleSignals({ refresh: () => seatRole.refresh(), event: 'tracy:team-changed', target: window, doc: document })
          mirrorViewerAttr(document.documentElement, seatRole, 'data-tracy-seat-viewer')
          const style = document.createElement('style')
          style.textContent = CSS
          document.head.appendChild(style)
          const t = (key, params) => {
            let s = en[key] ?? key
            for (const [k, v] of Object.entries(params ?? {})) s = s.replace('{' + k + '}', String(v))
            return s
          }
          createRoot(document.getElementById('dock')).render(
            createElement(SeatBar, { siteKey: 'a.test', t, asked, seatRole, notice })
          )
        }`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    nodePaths: [path.join(corePkg, 'node_modules')],
    outfile,
    logLevel: 'silent'
  })
  script = outfile
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** A page with the dock and a chat box holding a draft, mounted as `role`. */
async function open(role, noticeMs = 1500) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } })
  await page.setContent(
    '<!doctype html><html style="--dsh-composer-card-max-width:640px;--dsh-composer-side-clearance:16px">' +
      '<body><div data-slot="conversation.input.dock" id="dock"></div>' +
      '<textarea id="draft"></textarea></body></html>'
  )
  await page.addScriptTag({ path: script })
  await page.evaluate(
    ([r, ms]) => {
      window.loadedOnce = 'yes'
      window.mount(r, ms)
    },
    [role, noticeMs]
  )
  await page.fill('#draft', 'half-written message')
  return page
}

const state = (page) =>
  page.evaluate(() => ({
    attr: document.documentElement.hasAttribute('data-tracy-seat-viewer'),
    bar: document.querySelector('[data-viewer-bar-place="session"]') !== null,
    notice: document.querySelector('[data-viewer-bar="promoted"]')?.textContent ?? null,
    draft: document.getElementById('draft').value,
    sameLoad: window.loadedOnce === 'yes'
  }))

/** The Owner changes the role on the server; the Inbox tells the page its book changed. */
const ownerSets = (page, role) =>
  page.evaluate((r) => {
    window.door.role = r
    window.dispatchEvent(new CustomEvent('tracy:team-changed', { detail: { siteKey: 'a.test' } }))
  }, role)

test('a Viewer made Editor: the bar and the attribute go, one notice, no reload, draft kept', async () => {
  const page = await open('viewer')
  await page.waitForSelector('[data-viewer-bar-place="session"]')
  assert.deepEqual(await state(page), {
    attr: true,
    bar: true,
    notice: null,
    draft: 'half-written message',
    sameLoad: true
  })
  await ownerSets(page, 'editor')
  await page.waitForSelector('[data-viewer-bar="promoted"]')
  const after = await state(page)
  assert.equal(after.attr, false, '<html data-tracy-seat-viewer> is gone')
  assert.equal(after.bar, false, 'the Viewer bar is gone')
  assert.equal(after.notice, 'You can now edit this site.')
  assert.equal(after.draft, 'half-written message', 'the draft is kept')
  assert.equal(after.sameLoad, true, 'the page was not reloaded')
  const role = await page.getAttribute('[data-viewer-bar="promoted"]', 'role')
  assert.equal(role, 'status', 'a status line, not a dialog')
  // It leaves on its own.
  await page.waitForSelector('[data-viewer-bar="promoted"]', { state: 'detached', timeout: 5000 })
  assert.equal((await state(page)).bar, false)
  await page.close()
})

test('an Editor made Viewer: the bar and the attribute come back, no notice', async () => {
  const page = await open('editor')
  await page.waitForFunction(() => window.door.reads >= 1)
  assert.equal((await state(page)).bar, false)
  await ownerSets(page, 'viewer')
  await page.waitForSelector('[data-viewer-bar-place="session"]')
  const after = await state(page)
  assert.equal(after.attr, true)
  assert.equal(after.notice, null)
  assert.equal(after.draft, 'half-written message')
  assert.equal(after.sameLoad, true)
  await page.close()
})
