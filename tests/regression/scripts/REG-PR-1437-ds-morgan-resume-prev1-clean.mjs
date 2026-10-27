#!/usr/bin/env node
/**
 * Regression check for JA Morgan 1.0.8 and JA Resume 1.0.6 (PR 1437): the releases that stop linking files
 * Joomla 5/6 and the template package do not ship (PREV-1 on the dev /ops). Each release's committed
 * measurement is judged as /ops judges it (judgeMeasurement + preview-system-issues.json) and must leave no
 * rule failing (SCREEN-1 may warn), the slot contract's version range must hold the release, and the
 * content contract must name the archive the release published. Exit 0 only when all hold.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const CONTRACTS = join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const SLOTS = join(ROOT, 'packages/design/tracy-ds-slot/templates')
const { judgeMeasurement } = await import(join(ROOT, 'packages/design/tracy-ds-slot/src/measurement.mjs'))
const systemIssues = JSON.parse(readFileSync(join(SLOTS, 'preview-system-issues.json'), 'utf8'))
const RELEASES = [
  ['ja-morgan', '1.0.8', 'd6e4cc804c35e04c03bcb3d482fc074b45915374f999416397b4ab796fbb267f'],
  ['ja-resume', '1.0.6', '7ebee080f0789f59a7aec2f543ce0ef0bf87972ef56358e44e90fda2a0b02ec2']
]
const ALLOWED_WARN = new Set(['SCREEN-1'])
const newer = (a, b) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}
let bad = 0
const say = (ok, line) => {
  if (!ok) bad += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`)
}
for (const [slug, version, webroot] of RELEASES) {
  const dir = join(CONTRACTS, slug, 'j6', version)
  const file = join(dir, 'design-system-measurement.json')
  if (!existsSync(file)) {
    say(false, `${slug} ${version}: no measurement file`)
    continue
  }
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const judged = judgeMeasurement(doc, undefined, { systemIssues })
  const left = Object.entries(judged).filter(
    ([id, r]) =>
      !['pass', 'not-applicable'].includes(r.status) && !(r.status === 'warn' && ALLOWED_WARN.has(id))
  )
  say(
    left.length === 0 && doc.version === version,
    `${slug} ${version} measurement${left.map(([id, r]) => ` ${id}:${r.status}`).join('')}`
  )
  const slot = JSON.parse(readFileSync(join(SLOTS, `joomla-${slug}.json`), 'utf8'))
  const max = slot.maxVersion?.[`quickstart/${slug}/j6`]
  say(max !== undefined && !newer(version, max), `${slug} slot contract maxVersion ${max} holds ${version}`)
  const manifest = readFileSync(join(dir, 'manifest.json'), 'utf8')
  say(
    manifest.includes(webroot),
    `${slug} ${version} content contract names the published webroot ${webroot.slice(0, 8)}`
  )
}
process.exit(bad ? 1 : 0)
