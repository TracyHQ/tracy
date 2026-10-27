/**
 * The page every Inbox e2e test drives: `inbox-page-entry.tsx` bundled with this plugin's own
 * stylesheet (Tailwind run exactly like `scripts/build-client.mjs`) and dsh's token sheet
 * (`design-platform.css`, so `--dsw-alias-*` carry the values customers see in both themes),
 * served from loopback, and a browser to open it in.
 *
 * Same recipe as `tracy-my-sites/test/fixtures/open-harness.mjs`. Dependencies resolve from the
 * packages that declare them (`playwright` from apps/tracy-host, `react-dom` from @tracy/core,
 * `esbuild` from this plugin); a missing one or a browser that will not launch throws, so a caller
 * fails instead of skipping.
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
    const cssFile = path.join(outDir, 'inbox.css')
    execFileSync(
      process.execPath,
      [
        path.join(pkgRoot, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
        '--input',
        path.join(pkgRoot, 'src', 'client', 'inbox.css'),
        '--output',
        cssFile,
        '--minify'
      ],
      { cwd: pkgRoot, stdio: ['ignore', 'ignore', 'inherit'] }
    )
    await esbuild.build({
      entryPoints: { app: path.join(here, 'inbox-page-entry.tsx') },
      absWorkingDir: pkgRoot,
      outdir: outDir,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      target: ['es2020'],
      loader: { '.css': 'css', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty' },
      define: {
        __TAILWIND_CSS__: JSON.stringify(readFileSync(cssFile, 'utf8')),
        'process.env.NODE_ENV': '"production"'
      },
      nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
      logLevel: 'silent'
    })
    // A system font stack like dsh's (`--dsw-font-family`). `#panel` stands in for dsh's tab body:
    // positioned, a fixed height, and it clips what overflows it.
    writeFileSync(
      path.join(outDir, 'page.html'),
      '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css">' +
        "<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--foreground)}" +
        '#panel{box-sizing:border-box;position:relative;height:100vh;overflow:hidden}</style></head>' +
        '<body><div id="panel"></div><script src="/app.js"></script></body></html>'
    )
    server = http.createServer((req, res) => {
      const url = req.url.split('?')[0]
      const name = url.endsWith('/app.js') ? 'app.js' : url.endsWith('/app.css') ? 'app.css' : 'page.html'
      const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'
      res.writeHead(200, { 'content-type': type })
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
