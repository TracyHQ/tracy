/**
 * The page every My Sites e2e test drives: a fixture (`table-fits-entry.tsx` by default) bundled with this plugin's own
 * stylesheet (Tailwind run exactly like `scripts/build-client.mjs`), served from loopback, and a
 * browser to open it in.
 *
 * Dependencies resolve from the packages that declare them (`playwright` from apps/tracy-host,
 * `react-dom` from @tracy/core, `esbuild` from this plugin); a missing one or a browser that will not
 * launch throws, so a caller fails instead of skipping.
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
/** A workspace member on dsh's own React (18): the toolbar fork that dsh's page also runs. */
const dshReactPkg = path.join(repoRoot, 'vendor/tracy/dsh-better-sidebar')
const require = createRequire(import.meta.url)

/**
 * Bundle, serve, launch. Returns the loopback base URL, the browser and a `close`. `entry` is the
 * fixture to bundle, beside this file (`table-fits-entry.tsx` unless named).
 *
 * `dshReact: true` bundles the React dsh's page runs (18; the plugin keeps `react*` external and
 * gets the host's) instead of @tracy/core's 19. They differ where it shows: React 18 drops a `ref`
 * passed to a function component that does not forward it, so `ref={x}` on tracy-ui's
 * `DialogContent` stays null on dsh and passes under 19 (measured on dev 17/10/2026).
 */
export async function openHarness(prefix, entry = 'table-fits-entry.tsx', { dshReact = false } = {}) {
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
    const cssFile = path.join(outDir, 'my-sites.css')
    execFileSync(
      process.execPath,
      [
        path.join(pkgRoot, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
        '--input',
        path.join(pkgRoot, 'src', 'client', 'my-sites.css'),
        '--output',
        cssFile,
        '--minify'
      ],
      { cwd: pkgRoot, stdio: ['ignore', 'ignore', 'inherit'] }
    )
    const built = await esbuild.build({
      entryPoints: [path.join(here, entry)],
      absWorkingDir: pkgRoot,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      target: ['es2020'],
      loader: { '.css': 'empty', '.module.css': 'empty' },
      define: {
        __TAILWIND_CSS__: JSON.stringify(readFileSync(cssFile, 'utf8')),
        // The Team dialogs (invite wizard, Approve) are styled by the site tabs' plain rules file, which
        // shares the dsh page with this plugin's sheet; a fixture that opens one loads it as well.
        __SITE_TABS_RULES__: JSON.stringify(
          readFileSync(
            path.join(pkgRoot, '..', 'tracy-site-tabs', 'src', 'client', 'site-tabs-rules.css'),
            'utf8'
          )
        ),
        'process.env.NODE_ENV': '"production"'
      },
      nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
      // Every importer (base-ui too) gets the one copy, so hooks see a single React.
      ...(dshReact && {
        alias: Object.fromEntries(
          ['react', 'react-dom'].map((name) => [
            name,
            path.dirname(require.resolve(`${name}/package.json`, { paths: [dshReactPkg] }))
          ])
        )
      }),
      write: false,
      logLevel: 'silent'
    })
    writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
    // A system font stack like dsh's (`--dsw-font-family`): the widths under test are text widths.
    // `#panel` stands in for dsh's tab body, which is positioned (the loading bar sits against it).
    writeFileSync(
      path.join(outDir, 'page.html'),
      '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:-apple-system,' +
        "BlinkMacSystemFont,'Segoe UI',sans-serif}#panel{box-sizing:border-box;position:relative}</style></head>" +
        '<body><div id="panel"></div><script src="/app.js"></script></body></html>'
    )
    server = http.createServer((req, res) => {
      const name = req.url.split('?')[0].endsWith('/app.js') ? 'app.js' : 'page.html'
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
