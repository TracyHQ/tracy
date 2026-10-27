/**
 * The page `../e2e/settings-fits-360.test.mjs` drives: `settings-entry.tsx` bundled with the three
 * stylesheets the Settings dialog carries on the dsh page (this plugin's, My Sites' and Model
 * plan's Tailwind output, run exactly like each `scripts/build-client.mjs`), served from loopback
 * together with the doors the sections read, and a browser to open it in.
 *
 * Same recipe as `packages/site/tracy-my-sites/test/fixtures/open-harness.mjs`: dependencies resolve
 * from the packages that declare them (`playwright` from apps/tracy-host, `react-dom` from
 * @tracy/core); a missing one or a browser that will not launch throws, so the caller fails.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

/** Each plugin's Tailwind input, built from its own package root (its own class sources). */
const SHEETS = {
  __SETTINGS_TAILWIND__: ['packages/ui/tracy-settings', 'src/client/settings.css'],
  __SITES_TAILWIND__: ['packages/site/tracy-my-sites', 'src/client/my-sites.css'],
  __PLAN_TAILWIND__: ['packages/ui/tracy-model-plan', 'src/client/model-plan.css']
}

/** The doors' answers, in the shapes measured on dev (09/10/2026). */
const DOORS = {
  '/auth/me': { email: 'e2e-r1010amhc-owner@example.test' },
  '/api/seat-plan/status': {
    next: null,
    enabled: true,
    providers: [
      { id: 'claude', name: 'Claude' },
      { id: 'codex', name: 'ChatGPT Codex' }
    ],
    connections: [],
    routing: { enabled: false, tracyFallback: true, connectionOrder: [], version: 1 }
  },
  '/api/notifications/preferences': {
    groups: [
      { id: 'about-you', section: 'team', locked: true, inbox: true, email: true },
      { id: 'join-requests', section: 'team', locked: false, inbox: true, email: true },
      { id: 'teammates', section: 'team', locked: false, inbox: true, email: false },
      { id: 'site-changes', section: 'team', locked: false, inbox: true, email: false },
      { id: 'mentions-replies', section: 'comments', locked: false, inbox: true, email: true },
      { id: 'resolved-reopened', section: 'comments', locked: false, inbox: true, email: false }
    ]
  },
  '/api/build': { commit: '1892ccce69a1b2c3d4e5f60718293a4b5c6d7e8f', builtAt: '2026-10-09T08:00:00Z' }
}

/** Bundle, serve, launch. Returns the loopback base URL, the browser and a `close`. */
export async function openHarness(prefix) {
  const esbuild = require('esbuild')
  const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
  const chromium = playwright.chromium ?? playwright.default?.chromium

  const outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), prefix))
  let server
  let browser
  const close = async () => {
    await browser?.close()
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
    rmSync(outDir, { recursive: true, force: true })
  }
  try {
    const define = { 'process.env.NODE_ENV': '"production"', __TAILWIND_CSS__: '""' }
    for (const [name, [pkg, input]] of Object.entries(SHEETS)) {
      const root = path.join(repoRoot, pkg)
      const out = path.join(outDir, `${name}.css`)
      execFileSync(
        process.execPath,
        [
          path.join(root, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
          '--input',
          path.join(root, input),
          '--output',
          out,
          '--minify'
        ],
        { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] }
      )
      define[name] = JSON.stringify(readFileSync(out, 'utf8'))
    }
    const built = await esbuild.build({
      entryPoints: [path.join(here, 'settings-entry.tsx')],
      absWorkingDir: pkgRoot,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      target: ['es2020'],
      loader: { '.css': 'empty', '.module.css': 'empty' },
      define,
      nodePaths: [
        path.join(pkgRoot, 'node_modules'),
        path.join(repoRoot, 'packages/site/tracy-my-sites/node_modules'),
        path.join(repoRoot, 'packages/ui/tracy-model-plan/node_modules'),
        path.join(corePkg, 'node_modules')
      ],
      write: false,
      logLevel: 'silent'
    })
    writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
    // A system font stack like dsh's (`--dsw-font-family`): the widths under test are text widths.
    writeFileSync(
      path.join(outDir, 'page.html'),
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        "<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--background)}</style>" +
        '</head><body><div id="panel"></div><script src="/app.js"></script></body></html>'
    )
    server = http.createServer((req, res) => {
      const url = req.url.split('?')[0]
      if (url in DOORS) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(DOORS[url]))
        return
      }
      const name = url.endsWith('/app.js') ? 'app.js' : 'page.html'
      res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
      res.end(readFileSync(path.join(outDir, name)))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    browser = await chromium
      .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
      .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
    return { base, browser, close }
  } catch (err) {
    await close()
    throw err
  }
}
