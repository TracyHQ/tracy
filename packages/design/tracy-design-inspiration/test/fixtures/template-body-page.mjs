/**
 * A real browser page that mounts the REAL `TemplateBody` with this plugin's own Tailwind sheet —
 * shared by `template-body.test.mjs` and any one-off measurement of the preview frame.
 *
 * Nothing is redrawn by hand: the component is bundled from `src/client` with esbuild, and the CSS
 * is Tailwind run exactly the way `scripts/build-client.mjs` runs it (same input, same `--minify`),
 * then injected through `styles.ts` the way the plugin injects it into dsh's page. The page mounts
 * inside `.tracy-design-inspiration`, the dialog's scope class, because the sheet's `box-sizing`
 * rule is scoped to it — and that rule is what made the old 390-px frame 382 px inside (#630).
 *
 * `held: true` points the card at `/held.html`, a demo that answers only after `GET /release` — how
 * a test sees the frame while a slow demo is still loading. `streamed: true` points it at
 * `/streamed.html`, which sends the first half of a page at once (a flat blue ground, nothing else —
 * what a real demo paints before its text and pictures) and the rest only after `GET /release`: the
 * half-painted document the frame must never show.
 *
 * The framed demo is a loopback fixture on the same server: a 390-px page with 16-px side gaps, so
 * a clipped frame shows as a right gap smaller than the left one. It posts `tracy:frame-height` like
 * a real demo does. Dependencies resolve from where the repo declares them (`playwright` from
 * `apps/tracy-host`, `react-dom` from `@tracy/core`, `esbuild` from this plugin); a missing one or a
 * browser that will not launch throws, so a caller fails instead of skipping.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const pkgRoot = path.resolve(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const require = createRequire(import.meta.url)

/** The gutter the fixture page leaves on each side, in its own CSS pixels. */
export const PAGE_GAP = 16
/** Live mode pads the row with `p-2`; screenshot mode adds the 160-px rail, a 16-px gap and `px-4`. */
export const ROOM_INSET = { live: 16, shot: 160 + 16 + 32 }

/**
 * Parent of every scratch directory this harness makes: `TDI_SCRATCH_DIR` when a caller wants its
 * evidence run to leave nothing outside its own folder, the OS temp dir otherwise. The browser's own
 * profile is Playwright's and stays where Playwright puts it.
 */
export function scratchRoot() {
  return process.env.TDI_SCRATCH_DIR || tmpdir()
}

/** Tailwind over the plugin's stylesheet, with the flags the plugin build uses. */
export function buildCss() {
  const outDir = mkdtempSync(path.join(scratchRoot(), 'tdi-body-css-'))
  const outFile = path.join(outDir, 'design-inspiration.css')
  try {
    execFileSync(
      process.execPath,
      [
        path.join(pkgRoot, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
        '--input',
        path.join(pkgRoot, 'src', 'client', 'design-inspiration.css'),
        '--output',
        outFile,
        '--minify'
      ],
      { cwd: pkgRoot, stdio: ['ignore', 'ignore', 'inherit'] }
    )
    return readFileSync(outFile, 'utf8')
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

const FIXTURE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>html,body{margin:0;background:#fff}#page{margin:0 ${PAGE_GAP}px;height:1400px;background:#c33}</style>
</head><body><div id="page"></div><script>
  const bad = new URLSearchParams(location.search).get('bad')
  const post = (height) => parent.postMessage({ type: 'tracy:frame-height', height }, '*')
  if (bad) for (const h of [NaN, -5, 0, Infinity, '900', null]) post(h)
  else post(document.documentElement.scrollHeight)
</script></body></html>`

/** The first half of a streamed demo: a flat ground, no text, no pictures, and no `load` yet. */
const PARTIAL = `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;background:#2a4dd0}#page{margin:0 ${PAGE_GAP}px;height:1400px;background:#c33}</style>
</head><body><div id="partial"></div>`

/** The rest of it: the page itself, then the document ends and `load` fires. */
const PARTIAL_REST = `<div id="page"></div><script>
  parent.postMessage({ type: 'tracy:frame-height', height: document.documentElement.scrollHeight }, '*')
</script></body></html>`

const SHOT = (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect width="${w}" height="${h}" fill="#fff"/><rect x="${PAGE_GAP}" width="${w - 2 * PAGE_GAP}" height="${h}" fill="#3a3"/></svg>`

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head>
<body><div id="dialog" class="tracy-design-inspiration" style="display:flex;flex-direction:column;height:800px"></div>
<script>
  // Counts the element observations still live, so a test can tell a disconnected observer from a
  // leaked one after a switch or an unmount.
  window.__observing = 0
  const Native = window.ResizeObserver
  window.ResizeObserver = class extends Native {
    observe(el, o) { this.n = (this.n ?? 0) + 1; window.__observing++; return super.observe(el, o) }
    disconnect() { window.__observing -= this.n ?? 0; this.n = 0; return super.disconnect() }
  }
</script>
<script src="/app.js"></script></body></html>`

/**
 * Bundle, serve, launch. `templateBody` points at the module to mount (default: the plugin's own),
 * so the same harness can measure another revision of the component.
 */
export async function openHarness({
  templateBody = path.join(pkgRoot, 'src', 'client', 'TemplateBody.tsx')
} = {}) {
  const esbuild = require('esbuild')
  const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
  const chromium = playwright.chromium ?? playwright.default?.chromium

  const css = buildCss()
  const outDir = mkdtempSync(path.join(scratchRoot(), 'tdi-body-'))
  let server
  let browser
  const close = async () => {
    await browser?.close()
    // A still-held demo request would keep `close` waiting forever.
    server?.closeAllConnections()
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
    rmSync(outDir, { recursive: true, force: true })
  }
  try {
    const built = await esbuild.build({
      stdin: {
        contents: `
          import { createElement } from 'react'
          import { flushSync } from 'react-dom'
          import { createRoot } from 'react-dom/client'
          import { TemplateBody } from ${JSON.stringify(templateBody)}
          import { TAILWIND } from './styles'
          const style = document.createElement('style')
          style.textContent = TAILWIND
          document.head.append(style)
          const root = createRoot(document.getElementById('dialog'))
          window.__render = (props) => flushSync(() =>
            root.render(props ? createElement(TemplateBody, { ...props, t: (k) => k }) : null))`,
        resolveDir: path.join(pkgRoot, 'src', 'client'),
        loader: 'tsx'
      },
      absWorkingDir: pkgRoot,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['es2020'],
      jsx: 'automatic',
      loader: { '.css': 'empty' },
      define: { __TAILWIND_CSS__: JSON.stringify(css) },
      // react-dom is not a dependency of this plugin; tracy-core declares it.
      nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
      write: false,
      logLevel: 'silent'
    })
    const files = {
      '/app.js': ['text/javascript', built.outputFiles[0].text],
      '/index.html': ['text/html', PAGE],
      '/fixture.html': ['text/html', FIXTURE],
      '/shot-mobile.svg': ['image/svg+xml', SHOT(390, 1600)],
      '/shot-desktop.svg': ['image/svg+xml', SHOT(1440, 2400)]
    }
    writeFileSync(path.join(outDir, 'app.js'), files['/app.js'][1])
    // A demo that answers only when told to (`GET /release`): the slow first load of a real demo
    // (cold PHP page plus megabytes of pictures), made deterministic.
    const held = []
    const streamed = []
    server = http.createServer((req, res) => {
      const route = (req.url ?? '/').split('?')[0]
      if (route === '/held.html') return void held.push(res)
      if (route === '/streamed.html') {
        res.writeHead(200, { 'content-type': 'text/html' })
        // Padded past the parser's first chunk so the browser paints this half before the rest.
        res.write(`${PARTIAL}<!--${' '.repeat(4096)}-->`)
        return void streamed.push(res)
      }
      if (route === '/release') {
        for (const r of held.splice(0)) r.writeHead(200, { 'content-type': 'text/html' }).end(FIXTURE)
        for (const r of streamed.splice(0)) r.end(PARTIAL_REST)
        return res.writeHead(204).end()
      }
      const file = files[route]
      if (!file) return res.writeHead(404).end('not found')
      res.writeHead(200, { 'content-type': file[0] })
      res.end(file[1])
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    // The installed Chrome first, then Playwright's bundled Chromium — the order check-tests uses.
    browser = await chromium
      .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
      .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
    return { base, browser, css, close }
  } catch (err) {
    await close()
    throw err
  }
}

/** A quickstart card whose demo is the fixture; `demo: false` gives the card with no live demo. */
export function templateCard(base, { demo = true, badHeights = false, held = false, streamed = false } = {}) {
  return {
    quickstarts: {},
    version: '1.0.0',
    image: null,
    demo: { url: demo ? `${base}/` : '', version: '1.0.0' },
    // What `templateRows` gives a card with one side (#1717): its pictures stand for light, so the
    // Screenshot side is offered while the preview shows light.
    defaultTheme: 'light',
    languages: ['en'],
    layouts: [
      {
        key: 'home',
        label: 'Home',
        path: streamed
          ? '/streamed.html'
          : held
            ? '/held.html'
            : badHeights
              ? '/fixture.html?bad=1'
              : '/fixture.html',
        shots: { desktop: '/shot-desktop.svg', mobile: '/shot-mobile.svg' }
      }
    ]
  }
}

/**
 * Size the dialog so the frame's column (the room) is `room` px wide, then render. `mode` is which
 * layout the row takes ('live' pads by 8 px, 'shot' adds the rail), so the room is exact.
 */
export async function show(page, { room, mode = 'live', props }) {
  await page.evaluate(
    ({ width, props }) => {
      const dialog = document.getElementById('dialog')
      dialog.style.display = 'flex'
      dialog.style.width = `${width}px`
      if (props !== undefined) window.__render(props)
    },
    { width: room + ROOM_INSET[mode], props }
  )
  await settle(page)
}

/** Two frames: the ResizeObserver's answer, then the render it caused. */
export const settle = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

/**
 * Where everything sits, in the host page's CSS pixels unless named otherwise. `inside` is read
 * from the framed page itself (same origin): its layout width and the page's own gutters.
 */
export function measure(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const iframe = q('#dialog iframe')
    const img = q('#dialog img[alt^="Preview"]')
    // Marked by the phone; for a revision without the marks (the frame before #630, or desktop),
    // the frame is whatever holds the page and the room is the frame's column.
    const frame = q('[data-phone-frame]') ?? (iframe ?? img)?.parentElement ?? null
    const room = q('[data-phone-room]') ?? frame?.parentElement ?? null
    const box = (el) => (el ? el.getBoundingClientRect().toJSON() : null)
    let inside = null
    if (iframe?.contentWindow?.document?.getElementById('page')) {
      const w = iframe.contentWindow
      const p = w.document.getElementById('page').getBoundingClientRect()
      inside = {
        innerWidth: w.innerWidth,
        scrollWidth: w.document.documentElement.scrollWidth,
        left: p.left,
        right: w.innerWidth - p.right,
        marker: w.__marker ?? null
      }
    }
    const cs = frame ? getComputedStyle(frame) : null
    const dialog = q('#dialog')
    return {
      scale: frame ? Number(frame.parentElement.dataset.phoneScale ?? 1) : null,
      // The scale the browser actually drew: painted width over layout width.
      drawnScale: frame ? frame.getBoundingClientRect().width / frame.offsetWidth : null,
      room: box(room),
      frame: box(frame),
      frameClientWidth: frame?.clientWidth ?? null,
      frameOffsetWidth: frame?.offsetWidth ?? null,
      bezel: cs ? [cs.borderLeftWidth, cs.borderRightWidth] : null,
      transform: cs?.transform ?? null,
      iframe: box(iframe),
      iframeHeight: iframe ? iframe.style.height : null,
      img: box(img),
      imgOffsetWidth: img?.offsetWidth ?? null,
      inside,
      overflow: {
        room: room ? room.scrollWidth - room.clientWidth : null,
        dialog: dialog.scrollWidth - dialog.clientWidth,
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth
      }
    }
  })
}
