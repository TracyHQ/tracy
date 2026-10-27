/**
 * REG-PR-1358-cowork-joomla-0-24-29: every Joomla quickstart pins Claude Cowork for Joomla 0.24.29, the release whose
 * extension.install streams the package to a file instead of into memory (TracyHQ/claude-cowork#187), with the published asset's size
 * and sha256, in both catalogue copies alike. S1 reads the two catalogues.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checks, ROOT } from './lib.mjs'

const c = checks()
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const ASSET = {
  file: 'pkg_claudecowork-0.24.29.zip',
  version: '0.24.29',
  bytes: 42593192,
  sha256: '14080d2b11416201370ca94556adb231fd2e039f994ebce5163c885112050dee',
  url: 'https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v0.24.29/pkg_claudecowork-0.24.29.zip'
}

// S1: both catalogues, every Joomla pin
const catalogues = [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]
const pins = catalogues.map((p) =>
  Object.entries(json(p))
    .filter(([, e]) => e.platform === 'joomla' && e.cowork?.version)
    .map(([id, e]) => [id, ...Object.keys(ASSET).map((k) => e.cowork[k])])
)
c.check('S1: the catalogue has Joomla pins', pins[0].length > 0, pins[0].length)
for (const [id, ...got] of pins[0])
  c.eq(
    `S1: ${id} pins the published 0.24.29 asset`,
    JSON.stringify(got),
    JSON.stringify(Object.values(ASSET))
  )
c.check(
  'S1: both catalogue copies pin the same releases',
  JSON.stringify(pins[0]) === JSON.stringify(pins[1])
)

c.done()
