#!/usr/bin/env node
/**
 * On a phone width the rail stays reachable beside the right panel.
 *
 * Below 768px dsh presents an open right panel (the site's Browser) fullscreen: `SidebarRight.tsx`
 * gives it `width: 100vw` from the right edge of the frame, so it covered the whole rail too and
 * the person's face at the rail's foot (the account menu) could not be pressed. Measured 09/10/2026
 * on a stand at 360×740 (`tasks/evidence/account-menu/stand/probe-mobile-360.mjs`): the point at the
 * face's centre was the Browser's iframe. Tracy's sheet (`styles.ts`) keeps that panel out of the
 * rail column.
 *
 * Driven in a real browser over a page laid out like dsh's frame (the parts copied by hand from
 * `ui-layout` AppFrame.module.css and `ui-sidebar-right` SidebarRight.module.css / SidebarRight.tsx)
 * with Tracy's real stylesheet on it. The verdict is the one a finger gets: the element at the
 * face's centre is the face.
 *
 *   node --test packages/ui/tracy-sidebar/test/e2e/rail-beside-fullscreen-panel.test.mjs
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(here, '..', '..', '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwrightPath = require.resolve('playwright', { paths: [hostPkg] })
const playwright = await import(pathToFileURL(playwrightPath).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

// dsh's frame as it renders with the rail collapsed and the right panel open fullscreen: the frame
// publishes the sidebar track as --dsh-frame-sidebar, the right column is a zero-width track at the
// frame's right edge, and the panel is absolute from that edge, 100vw wide (inline, as
// SidebarRight.tsx writes it). The panel itself lets the pointer through; its docked content does not.
const PAGE = `<!doctype html><meta charset="utf-8">
<style>
body { margin:0; font:14px system-ui }
.frame { position:relative; display:grid; height:100vh; grid-template-columns:var(--dsh-frame-sidebar) minmax(0,1fr) 0px }
.sidebarCol { min-width:0; overflow:hidden }
.rightbarCol { position:relative; min-width:0; overflow:visible }
.panel { position:absolute; top:0; right:0; bottom:0; display:flex; flex-direction:column; min-width:0; pointer-events:none }
.dock { flex:1; pointer-events:auto; background:#fff }
.dock iframe { width:100%; height:100%; border:0 }
.foot { position:absolute; bottom:8px; left:10px }
.face { width:36px; height:44px }
</style>
<div class="frame" style="--dsh-frame-sidebar: 56px" data-sidebar-collapsed data-rightbar-fullscreen>
  <div class="sidebarCol"><div class="tsb-root tsb-rail" style="position:relative; height:100%">
    <div class="foot"><button type="button" class="face" data-tracy-account-trigger aria-label="Account">A</button></div>
  </div></div>
  <div class="centerCol"></div>
  <div class="rightbarCol">
    <div class="panel" data-sidebar-right-panel="fullscreen" data-sidebar-right-open style="width: 100vw; --dsh-sidebar-width: 100vw">
      <div class="dock" data-dockkit-host="dock"><iframe srcdoc="<p>site preview</p>"></iframe></div>
    </div>
  </div>
</div>
<script src="/app.js"></script>`

let outDir
let server
let base
let browser

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tsb-rail-panel-'))
  const built = await esbuild.build({
    stdin: {
      contents: `import { CSS } from './styles'
        const style = document.createElement('style')
        style.textContent = CSS
        document.head.appendChild(style)`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'ts'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    define: { __TAILWIND_CSS__: '""' },
    write: false,
    logLevel: 'silent'
  })
  writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
  writeFileSync(path.join(outDir, 'page.html'), PAGE)
  server = http.createServer((req, res) => {
    const name = req.url.split('?')[0] === '/app.js' ? 'app.js' : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** What a finger at the face's centre lands on, and where the panel's left edge is. */
async function measure(width, height) {
  const page = await browser.newPage({ viewport: { width, height } })
  try {
    await page.goto(`${base}/`)
    return await page.evaluate(() => {
      const face = document.querySelector('[data-tracy-account-trigger]')
      const b = face.getBoundingClientRect()
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      const panel = document.querySelector('[data-sidebar-right-panel]').getBoundingClientRect()
      return { hitIsFace: face.contains(hit), hit: hit?.tagName ?? null, panelLeft: Math.round(panel.left) }
    })
  } finally {
    await page.close()
  }
}

test('at 360×740 the face at the rail foot can be pressed beside a fullscreen right panel', async () => {
  const r = await measure(360, 740)
  assert.equal(r.hitIsFace, true, `the point at the face's centre is <${r.hit}>, not the face`)
  assert.equal(r.panelLeft, 56, 'the panel does not start at the rail edge')
})

test('on a wide window a fullscreen panel the person chose still covers the whole frame', async () => {
  const r = await measure(1280, 800)
  assert.equal(r.panelLeft, 0, 'the chosen fullscreen panel no longer starts at the window edge')
})
