// lane.mjs gives every lane its own ports for every step: before 18/10/2026 PREVIEW-PARITY listened on 9750+N,
// which is lane 5's preview dark port (9700+5*10+1 = 9751), so two lanes side by side died EADDRINUSE
// (Voyara 05:15, Tour 07:56), and the preview Chrome (9450 + port % 50) repeated every 5 lanes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromeOfServer, lanePorts, MAX_LANE } from '../scripts/lane-ports.mjs'

const LANES = Array.from({ length: MAX_LANE }, (_, i) => i + 1)
const all = (n) => {
  const p = lanePorts(n)
  return [p.stand, p.build, p.build + 1, p.build + 2, p.flowCdp, p.verifyCdp, ...p.servers]
}

test('lane ports: lanes up to at least 15', () => {
  assert.ok(MAX_LANE >= 15)
  assert.throws(() => lanePorts(0))
  assert.throws(() => lanePorts(MAX_LANE + 1))
  assert.throws(() => lanePorts(1.5))
})

test('lane ports: no port is used twice, within a lane or across lanes', () => {
  const seen = new Map()
  for (const n of LANES)
    for (const port of all(n)) {
      assert.ok(!seen.has(port), `lane ${n} port ${port} is also lane ${seen.get(port)}'s`)
      seen.set(port, n)
    }
})

test('lane ports: the old clash is gone (lane 5 dark vs lane N parity, lane 1 vs lane 6 preview Chrome)', () => {
  const parities = LANES.map((n) => lanePorts(n).parity)
  assert.ok(!parities.includes(lanePorts(5).previewDark))
  assert.notEqual(chromeOfServer(lanePorts(1).previewLight), chromeOfServer(lanePorts(6).previewLight))
})

test('lane ports: the Chromes preview-check and preview-parity derive (9450 + port % 50) never repeat', () => {
  const chromes = LANES.flatMap((n) => lanePorts(n).servers.map(chromeOfServer))
  assert.equal(new Set(chromes).size, chromes.length)
  // and no derived Chrome lands on a port a lane itself listens on
  const own = new Set(LANES.flatMap(all))
  for (const c of chromes) assert.ok(!own.has(c), `derived Chrome ${c} is a lane port`)
})

test('lane ports: clear of the ports agents pass by hand (preview-check 9611, parity 9660, 97xx/98xx)', () => {
  for (const n of LANES)
    for (const port of [...lanePorts(n).servers, lanePorts(n).flowCdp, lanePorts(n).verifyCdp]) {
      assert.ok(port !== 9611 && port !== 9660, `${port}`)
      assert.ok(port < 9300 || port >= 9900, `lane ${n} port ${port} sits in the hand-picked 93xx-98xx range`)
    }
})

test('lane ports: the stand and build ports the iMac tunnel mirrors are unchanged', () => {
  assert.equal(lanePorts(1).stand, 52981)
  assert.equal(lanePorts(3).build, 52330)
  assert.deepEqual(lanePorts(2).servers, [
    lanePorts(2).previewLight,
    lanePorts(2).previewDark,
    lanePorts(2).parity
  ])
})
