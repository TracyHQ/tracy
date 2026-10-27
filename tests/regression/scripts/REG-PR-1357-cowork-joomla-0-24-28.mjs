/**
 * REG-PR-1357-cowork-joomla-0-24-28: every Joomla quickstart pins Claude Cowork for Joomla 0.24.28, the release whose
 * self-updater never downloads inside a visitor's request (TracyHQ/claude-cowork#186), with the published asset's size
 * and sha256, in both catalogue copies alike. S1 reads the two catalogues.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checks, ROOT } from './lib.mjs'

const c = checks()
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
// The pins have since moved on (REG-PR-1358-cowork-joomla-0-24-29 holds the exact asset), so what
// this case still fences is the floor: no Joomla pin goes back below 0.24.28, whose self-updater
// never downloads inside a visitor's request, and both catalogue copies agree.
const FLOOR = [0, 24, 28]
const atLeast = (v) => {
  const p = String(v).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((p[i] ?? 0) !== FLOOR[i]) return (p[i] ?? 0) > FLOOR[i]
  return true
}

// S1: both catalogues, every Joomla pin
const catalogues = [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]
const pins = catalogues.map((p) =>
  Object.entries(json(p))
    .filter(([, e]) => e.platform === 'joomla' && e.cowork?.version)
    .map(([id, e]) => [id, e.cowork.file, e.cowork.version, e.cowork.bytes, e.cowork.sha256, e.cowork.url])
)
c.check('S1: the catalogue has Joomla pins', pins[0].length > 0, pins[0].length)
for (const [id, , version] of pins[0]) c.check(`S1: ${id} pins 0.24.28 or later`, atLeast(version), version)
c.check(
  'S1: both catalogue copies pin the same releases',
  JSON.stringify(pins[0]) === JSON.stringify(pins[1])
)

c.done()
