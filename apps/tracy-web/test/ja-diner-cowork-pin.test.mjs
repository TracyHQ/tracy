// JA Diner j6 1.0.8 is pinned on a stable Claude Cowork for Joomla release whose hide review covers its contract. On
// 16/11/2026 it sat on 0.24.95-rc.2, the only package with the Diner review, and every new site updated itself to the
// stable 0.24.95, which has none: the plugin then refused 18 hides of a dev chain build ("the plugin's review does not
// list the column ..."). A stable pin that carries the review ends that, and the readiness verdict reads the review
// from cowork-plugin-doors.json, so the pin and that file must name the same package.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (rel) => JSON.parse(readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8'))
const pins = [
  read('apps/tracy-web/src/quickstarts.json'),
  read('packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json')
]
const doors = read('apps/tracy-web/src/lib/template-readiness/cowork-plugin-doors.json')
const stable = (v) => /^\d+\.\d+\.\d+$/.test(v)
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

test('JA Diner j6 is pinned on a stable Claude Cowork release, the same pin in both catalogues', () => {
  const [web, host] = pins.map((c) => c['quickstart/ja-diner/j6'])
  assert.deepEqual(web.cowork, host.cowork)
  assert.equal(web.contract ?? 'ja-diner/j6/1.0.8', 'ja-diner/j6/1.0.8')
  assert.ok(stable(web.cowork.version), `pinned on ${web.cowork.version}, a release candidate`)
  assert.ok(!newer('0.24.96', web.cowork.version), `pinned on ${web.cowork.version}, before the Diner review`)
  assert.equal(
    web.cowork.url,
    `https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v${web.cowork.version}/${web.cowork.file}`
  )
})

test("the pinned package's hide review covers the JA Diner 1.0.8 contract, read from the same bytes", () => {
  const pin = pins[0]['quickstart/ja-diner/j6'].cowork
  const release = doors.releases[pin.version]
  assert.ok(release, `cowork-plugin-doors.json has no ${pin.version}`)
  assert.equal(release.sha256, pin.sha256)
  assert.ok(release.reviews['ja-diner/j6/1.0.8'], 'no review of ja-diner/j6/1.0.8')
  for (const [door, offered] of Object.entries(release.evidence)) assert.equal(offered, true, door)
})
