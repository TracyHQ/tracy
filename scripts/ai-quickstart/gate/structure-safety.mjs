#!/usr/bin/env node
/**
 * A dev runner of the two #586 measurements on a real throwaway blank site, until the gate runs them in one command:
 * structure (full, hidden, minimum) and write safety. Each write gets its own record and journal folder.
 *
 *   GATE_TOKEN_FILE=<file holding the site's Claude Cowork token> \
 *     node scripts/ai-quickstart/gate/structure-safety.mjs <AI quickstart folder> --site <base URL> --out <folder> \
 *       [--reset-site "<command that makes the site fresh again>"] [--only structure|write-safety] [--plugin <v>] \
 *       [--contract <blank site contract ref>] [--demo-content <released content-map.json>]
 *
 * The site must be fresh when the command starts. Without `--reset-site` the minimum variant and write safety are
 * `not_run`. Writes `structure.json` and `write-safety.json` to `--out` (keep it outside the repository). Exits 0 when
 * every measurement run passed, 1 otherwise, 2 on a usage error.
 */
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PHOSPHOR_SET,
  phosphorCatalog
} from '../../../apps/tracy-web/src/lib/picture-paint/icons/phosphor-set.js'
import { demoRoutesOf } from '../../built-site-check/inputs.mjs'
import { siteDoors } from '../../../packages/wo/website-opportunities/domain/site-doors.mjs'
import { directSend } from '../site-doors-send.mjs'
import { JOOMLA_PROBES } from './adapters/joomla-probes.mjs'
import { shownFields, withRecord } from './adapters/joomla-pages.mjs'
import { sitePages } from './adapters/joomla-t4.mjs'
import { markerBuild } from './marker-plan.mjs'
import { memoryTryWrite, openMarkerPicture } from './memory-write.mjs'
import { freshProblems, siteReset } from './site-reset.mjs'
import { realWrite } from './site-write.mjs'
import { structure } from './structure.mjs'
import { writeSafety } from './write-safety.mjs'
import { COMMON_PROBES } from './write-probes.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const argv = process.argv.slice(2)
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
const folder = argv.find((a, i) => !a.startsWith('-') && !argv[i - 1]?.startsWith('--'))
const base = flag('--site')?.replace(/\/+$/, '') ?? null
const out = flag('--out') ? path.resolve(flag('--out')) : null
const only = flag('--only')
if (!folder || !base || !out || (only && !['structure', 'write-safety'].includes(only))) {
  console.error(
    'usage: structure-safety.mjs <AI quickstart folder> --site <URL> --out <folder> [--reset-site "<cmd>"]'
  )
  process.exit(2)
}
mkdirSync(out, { recursive: true })
const log = (line) => {
  console.log(line)
  appendFileSync(path.join(out, 'run.log'), new Date().toISOString() + ' ' + line + '\n')
}
const json = (file) => JSON.parse(readFileSync(path.join(folder, file), 'utf8'))
const mapping = json('mapping.json')
const t = mapping.template ?? {}
const kit = {
  ref: t.slug + '/' + (t.cms ?? 'j6') + '@' + t.version,
  template: t,
  blockStore: json('block-store.json'),
  pageRecipes: json('page-recipes.json'),
  mapping,
  blankContract: json('blank-site-contract/content-map.json'),
  lock: json('blank-site-contract/presentation-lock.json')
}
const pin = flag('--plugin') ?? pinnedPlugin()
const token = readFileSync(process.env.GATE_TOKEN_FILE ?? '', 'utf8').trim()
const send = directSend({
  base,
  token,
  log: (e) => appendFileSync(path.join(out, 'calls.jsonl'), JSON.stringify(e).slice(0, 2000) + '\n')
})
const doors = siteDoors({ send })
const icons = { set: PHOSPHOR_SET, icons: phosphorCatalog() }
const build = (options) => markerBuild(kit, { iconLibrary: icons, tryWrite: memoryTryWrite(kit), ...options })
const plainMarks =
  (await build({})).writePlan?.ops.filter((o) => o.kind === 'menuItem.create').map((o) => o.mark) ?? []

let writes = 0
let applies = 0
const offMenus = new Map()
const site = {
  reset: siteReset({
    command: flag('--reset-site'),
    log,
    check: () =>
      freshProblems({
        send,
        pin,
        contract: flag('--contract'),
        contentMap: kit.blankContract,
        find: (mark) => doors.find({ kind: 'menuItem', mark }),
        marks: plainMarks.slice(0, 1)
      })
  }),
  async write(built) {
    writes += 1
    const dir = path.join(out, 'writes', String(writes))
    mkdirSync(dir, { recursive: true })
    const began = Date.now()
    const real = await realWrite({
      send,
      base,
      siteKey: createHash('sha256').update(token).digest('hex'),
      built,
      out: dir,
      pin,
      log,
      open: openMarkerPicture(built.registry)
    })
    log(
      'write ' + writes + ' ' + real.report.status + ' in ' + Math.round((Date.now() - began) / 1000) + ' s'
    )
    return { report: real.report, record: real.record, plugin: real.plugin }
  },
  pages: async (built, record) =>
    (await sitePages({ base, record, doors, order: built.order })).map((p) => withRecord(p, record)),
  async fetch(url) {
    try {
      const answer = await fetch(url, { signal: AbortSignal.timeout(45000) })
      return { status: answer.status, html: await answer.text() }
    } catch {
      return { status: 0, html: '' }
    }
  },
  async off(ops, record) {
    for (const op of ops) {
      const id = record.ids?.[op]
      if (!id || !op.startsWith('copy:')) continue
      offMenus.set(op, (await doors.get({ kind: 'moduleAssignment', id }))?.menuids ?? '[]')
      await doors.unassign({ applyId: 'safety-off-' + ++applies, id })
    }
  },
  async back(ops, record) {
    for (const op of ops)
      if (offMenus.has(op))
        await doors.update({
          applyId: 'safety-back-' + ++applies,
          kind: 'moduleAssignment',
          id: record.ids[op],
          fields: { menuids: offMenus.get(op) }
        })
  },
  hide: (record) => doors.hide({ applyId: 'structure-hide-' + ++applies, kind: record.kind, id: record.id }),
  show: (record) =>
    doors.update({
      applyId: 'structure-show-' + ++applies,
      kind: record.kind,
      id: record.id,
      fields: shownFields(record.kind)
    })
}

const demoContent = flag('--demo-content')
const demoRoutes =
  demoContent && existsSync(demoContent) ? demoRoutesOf(JSON.parse(readFileSync(demoContent, 'utf8'))) : []
const results = {}
if (site.reset) await site.reset()
if (only !== 'write-safety') {
  const began = Date.now()
  results.structure = await structure({ build, site, kit, base: base + '/', demoRoutes, log })
  results.structure.seconds = Math.round((Date.now() - began) / 1000)
  writeFileSync(path.join(out, 'structure.json'), JSON.stringify(results.structure, null, 1))
  log('structure ' + results.structure.status + ' in ' + results.structure.seconds + ' s')
}
if (only !== 'structure') {
  results.writeSafety = await writeSafety({ build, site, probes: [...COMMON_PROBES, ...JOOMLA_PROBES], log })
  writeFileSync(path.join(out, 'write-safety.json'), JSON.stringify(results.writeSafety, null, 1))
  log(
    'write safety ' +
      results.writeSafety.status +
      ', ' +
      (results.writeSafety.findings?.length ?? 0) +
      ' finding(s)'
  )
}
process.exit(Object.values(results).every((r) => r.status === 'passed') ? 0 : 1)

function pinnedPlugin() {
  const file = path.join(ROOT, 'apps/tracy-web/src/quickstarts.json')
  if (!existsSync(file)) return null
  const pins = JSON.parse(readFileSync(file, 'utf8'))
  return pins['quickstart/' + t.slug + '/' + (t.cms ?? 'j6')]?.cowork?.version ?? null
}
