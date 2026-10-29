// Explicit acceptance: real Chrome renders a site container with curl and no browser.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import jpeg from 'jpeg-js'
import { dockerExec, hostBrowserExec } from '../../src/host/exec.mjs'
import { captureView } from '../../src/host/view.mjs'

const exec = promisify(execFile)
const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '../../../../..')
const playwright = await import(
  pathToFileURL(require.resolve('playwright', { paths: [path.join(root, 'apps/tracy-host')] })).href
)
const chromium = playwright.chromium ?? playwright.default?.chromium
const chrome =
  process.env.TRACY_TEST_CHROME ??
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    chromium.executablePath()
  ].find((file) => existsSync(file))

test('visual capture: before and after render in real Chrome through the isolated site container', async () => {
  assert.ok(chrome && existsSync(chrome), 'install Playwright Chromium or set TRACY_TEST_CHROME')
  const label = `beta-visual-${process.pid}`
  const container = `${label}-web-1`
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-beta-visual-'))
  // CI containers cannot provide Chromium's sandbox. Match Playwright's test launcher on Linux.
  let launcher = chrome
  if (process.platform === 'linux') {
    launcher = path.join(dir, 'chrome-test')
    writeFileSync(
      launcher,
      `#!${process.execPath}\nconst {spawnSync}=require('node:child_process');const r=spawnSync(${JSON.stringify(chrome)},['--no-sandbox',...process.argv.slice(2)],{stdio:['inherit','inherit','inherit',3,4]});process.exit(r.status??1);\n`
    )
    chmodSync(launcher, 0o700)
  }
  const paint = (color) =>
    writeFileSync(
      path.join(dir, 'index.html'),
      `<html><head><style>html,body{margin:0;background:${color};min-height:1500px}</style></head><body>Visual check<script>document.body.style.background="#00ff00"</script></body></html>`
    )
  let owned = false
  try {
    paint('#cc2211')
    await exec('docker', [
      'run',
      '-d',
      '--name',
      container,
      '--network',
      'none',
      '--entrypoint',
      'apache2-foreground',
      'joomla:6-apache'
    ])
    owned = true
    // Docker may run outside the CI runner's filesystem; copy through its API instead of bind-mounting.
    const publish = () =>
      exec('docker', ['cp', path.join(dir, 'index.html'), `${container}:/var/www/html/index.html`])
    await publish()
    for (let n = 0; ; n++) {
      try {
        await exec('docker', ['exec', container, 'curl', '-fsS', 'http://127.0.0.1/'])
        break
      } catch (error) {
        if (n === 30) throw error
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    let hostCalls = 0
    const hostResults = []
    const draw = () =>
      captureView({
        label,
        view: { path: '/', w: 640, h: 480, y: 240, dark: false },
        internalPort: 80,
        run: dockerExec,
        host: {
          chrome: launcher,
          run: async (input) => {
            hostCalls++
            const result = await hostBrowserExec({
              ...input,
              chrome: launcher,
              mode: 'view',
              // Browser suites share CI CPUs; bound each capture below the suite's 120-second cap.
              deadlineMs: 45000,
              timeoutMs: 50000
            })
            hostResults.push(result)
            return result
          }
        }
      })
    const before = await draw()
    assert.equal(before.ok, true, JSON.stringify({ before, hostResults }))
    paint('#1122cc')
    await publish()
    const after = await draw()
    assert.equal(after.ok, true, JSON.stringify(after))
    assert.equal(hostCalls, 2, 'both captures used the host browser fallback')
    assert.equal(before.loaded, true)
    assert.equal(after.loaded, true)
    assert.equal(before.y, 240)
    assert.equal(after.y, 240)
    const center = (shot) => {
      const image = jpeg.decode(shot.jpeg)
      assert.equal(image.width, 640)
      assert.equal(image.height, 480)
      const i = (240 * image.width + 320) * 4
      return [...image.data.subarray(i, i + 3)]
    }
    const a = center(before)
    const b = center(after)
    assert.ok(a[0] > a[2] + 100, `before is red: ${a}`)
    assert.ok(b[2] > b[0] + 100, `after is blue: ${b}`)
    assert.notDeepEqual(before.jpeg, after.jpeg)
  } finally {
    if (owned) await exec('docker', ['rm', '-f', '-v', container])
    rmSync(dir, { recursive: true, force: true })
  }
})
