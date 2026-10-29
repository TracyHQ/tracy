// Explicit acceptance: real Chrome renders a site container with curl and no browser.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import jpeg from 'jpeg-js'
import { dockerExec, hostBrowserExec } from '../../src/host/exec.mjs'
import { captureView } from '../../src/host/view.mjs'

const exec = promisify(execFile)
const chrome = process.env.TRACY_TEST_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

test('visual capture: before and after render in real Chrome through the isolated site container', async () => {
  assert.ok(existsSync(chrome), 'set TRACY_TEST_CHROME to a Chrome executable')
  const label = `beta-visual-${process.pid}`
  const container = `${label}-web-1`
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-beta-visual-'))
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
      '-v',
      `${dir}:/var/www/html:ro`,
      '--entrypoint',
      'apache2-foreground',
      'joomla:6-apache'
    ])
    owned = true
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
          chrome,
          run: async (input) => {
            hostCalls++
            const result = await hostBrowserExec({ ...input, chrome, mode: 'view', timeoutMs: 28000 })
            hostResults.push(result)
            return result
          }
        }
      })
    const before = await draw()
    assert.equal(before.ok, true, JSON.stringify({ before, hostResults }))
    paint('#1122cc')
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
