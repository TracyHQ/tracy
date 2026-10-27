#!/usr/bin/env node
// Apply the demo-content changes of the next Tracy Base WordPress cut (`tracy-base/wp7`, after 1.1.5)
// to a restored site: apply-tracy-base-changes.php, run inside WordPress, plus the literal copy edits
// of content-edits/tracy-base-wp7.json. Re-runnable: a second run reports `0 changed`.
//
// Install the tracy-base theme built from this branch on the site first: the header row's Resources
// panel is copied from the theme's parts/header.html.
//
// Usage, either on a stand made by restore-release.mjs:
//   node apply-tracy-base-changes.mjs --stand <dir> [--project tracy-base-wp7-stand] [--port 8291]
// or through any wp-cli command that reads PHP on stdin (a local Tracy site, for instance):
//   node apply-tracy-base-changes.mjs --wp 'ssh imac docker exec -i <site>-web-1 wp --allow-root --path=/var/www/html'
// Then pack-and-verify.mjs packs the stand; capture the new contract from that pack, since the
// presentation lock hashes the pages and template parts changed here.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { standEnv, wp } from './stand.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const EDITS = path.resolve(HERE, '../content-edits/tracy-base-wp7.json')

const { values: o } = parseArgs({
  options: {
    stand: { type: 'string' },
    project: { type: 'string', default: 'tracy-base-wp7-stand' },
    port: { type: 'string', default: '8291' },
    wp: { type: 'string' }
  }
})
if (!o.stand === !o.wp) throw new Error('give exactly one of --stand <dir> or --wp "<wp-cli command>"')

const php = readFileSync(path.join(HERE, 'apply-tracy-base-changes.php'), 'utf8')
const edits = readFileSync(EDITS).toString('base64')
let out
if (o.stand) {
  const env = standEnv({ stand: o.stand, port: o.port })
  out = wp(o.project, env, ['eval-file', '-', edits], { input: php })
} else {
  const r = spawnSync('sh', ['-c', `${o.wp} eval-file - ${edits}`], {
    input: php,
    encoding: 'utf8',
    maxBuffer: 1 << 26
  })
  if (r.status !== 0) throw new Error(`wp eval-file failed (exit ${r.status}): ${r.stderr}`)
  out = r.stdout
}

const report = JSON.parse(out.slice(out.indexOf('{')))
for (const what of report.changed) console.log(`changed    ${what}`)
console.log(`${report.changed.length} changed, ${report.unchanged.length} already as wanted`)
