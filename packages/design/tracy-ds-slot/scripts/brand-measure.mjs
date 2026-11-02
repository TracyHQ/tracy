#!/usr/bin/env node
/**
 * Brand mode measured on a RUNNING Joomla stand (BRAND-3, ADR 0031 revision 02/11/2026): for each brand id the
 * module is written the way flow.mjs's Joomla adapter writes it, each page is opened on each side, and
 * `src/brand-check.mjs` reads the accent words, the accent fills and any template accent left. The result is
 * `brand-measurement.json`, which the readiness check scores (BRAND-3) once it sits beside
 * design-system-measurement.json in the contract folder of the version. The module is trashed at the end.
 *
 *   node scripts/brand-measure.mjs --template <contract> --site <stand address> --joomla-db <db container> \
 *     [--joomla-prefix tr_] [--joomla-login site] [--pages /,/index.php/x] --tag <release tag> --version <v> \
 *     --out <dir> [--machine <kind>] brand:<bg>-<fg>-<accent> …
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { arch, platform, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBrandId, templateAccents } from '../src/brand.mjs'
import { BRAND_MEASUREMENT_SCHEMA, brandProbe, judgeBrandMeasurement } from '../src/brand-check.mjs'
import { contractBase, loadContract } from '../src/library.mjs'
import { keptScopes } from '../src/tokens56.mjs'
import { browser } from './cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const args = process.argv.slice(2)
const opt = (/** @type {string} */ n) => {
  const i = args.indexOf(n)
  return i === -1 ? null : args.splice(i, 2)[1]
}
const TEMPLATE = opt('--template')
const SITE = opt('--site')
const DB = opt('--joomla-db')
const PREFIX = opt('--joomla-prefix') ?? 'tr_'
const LOGIN = opt('--joomla-login') ?? 'site'
const TAG = opt('--tag')
const VERSION = opt('--version')
const OUT = opt('--out')
// the kind of machine, never its hostname (flow.mjs: a hostname often carries a person's name)
const MACHINE = opt('--machine') ?? `${platform()}-${arch()}`
const CDP = Number(opt('--cdp') ?? 9333)
const IDS = args.filter((a) => a.startsWith('brand:'))
if (!TEMPLATE || !SITE || !DB || !TAG || !VERSION || !OUT || IDS.length === 0) {
  console.error('usage: brand-measure.mjs --template --site --joomla-db --tag --version --out brand:<…> …')
  process.exit(2)
}
for (const id of IDS) if (!parseBrandId(id)) throw new Error(`not a brand id: ${id}`)
const contract = loadContract(TEMPLATE)
const base = contractBase(ROOT, contract)
const PAGES = (opt('--pages') ?? contract.measuredPage ?? '/').split(',').filter(Boolean)
const scopes = keptScopes(contract)
const accents = templateAccents(contract, base)

const sql = (/** @type {string} */ q) =>
  execFileSync('docker', ['exec', '-i', DB, 'mariadb', `-u${LOGIN}`, `-p${LOGIN}`, LOGIN, '-N', '-e', q], {
    encoding: 'utf8'
  })
const esc = (/** @type {string} */ v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const TITLE = 'Tracy design system'

/** The module of `id` written as flow.mjs's Joomla adapter writes it (one mod_custom, every page). */
function apply(/** @type {string} */ id) {
  const tmp = join(mkdtempSync(join(tmpdir(), 'ds-brand-')), 'm.html')
  const r = JSON.parse(
    execFileSync(
      process.execPath,
      [join(HERE, 'ds-slot.mjs'), 'joomla', id, '--template', TEMPLATE, '--out', tmp],
      { encoding: 'utf8' }
    )
  )
  const html = readFileSync(tmp, 'utf8')
  const m = r.module
  const params = JSON.stringify({
    prepare_content: '0',
    layout: '_:default',
    moduleclass_sfx: '',
    cache: '0',
    style: m.style
  })
  const existing = sql(
    `select id from ${PREFIX}modules where title='${TITLE}' and module='mod_custom' and client_id=0 order by id limit 1`
  ).trim()
  if (existing)
    sql(
      `update ${PREFIX}modules set content='${esc(html)}', published=1, position='${m.position}', ordering=${Number(m.ordering ?? 0)}, params='${esc(params)}' where id=${existing}`
    )
  else {
    sql(
      `insert into ${PREFIX}modules (asset_id,title,note,content,ordering,position,checked_out,publish_up,publish_down,published,module,access,showtitle,params,client_id,language) values (0,'${TITLE}','','${esc(html)}',${Number(m.ordering ?? 0)},'${m.position}',NULL,NULL,NULL,1,'mod_custom',1,0,'${esc(params)}',0,'*')`
    )
    const nid = sql(
      `select id from ${PREFIX}modules where title='${TITLE}' and module='mod_custom' and client_id=0 order by id desc limit 1`
    ).trim()
    sql(`insert ignore into ${PREFIX}modules_menu (moduleid, menuid) values (${nid}, 0)`)
  }
  return r.adjusted ?? []
}

const runs = []
const b = await browser(CDP)
try {
  for (const id of IDS) {
    const adjusted = apply(id)
    const accent = /** @type {any} */ (parseBrandId(id)).accent
    for (const page of PAGES)
      for (const want of ['dark', 'light']) {
        const url = `${SITE.replace(/\/$/, '')}${page}${page.includes('?') ? '&' : '?'}theme=${want}`
        await b.open(url, 1440, { scheme: want })
        await b.settle()
        const r = await b.evaluate(brandProbe(scopes, accents))
        // a template with no side switch answers one side whatever is asked: measured once
        if (runs.some((x) => x.id === id && x.page === page && x.side === r.side)) continue
        runs.push({ id, accent, side: r.side, page, adjusted, spots: r.spots })
      }
  }
} finally {
  sql(
    `update ${PREFIX}modules set published=-2 where title='${TITLE}' and module='mod_custom' and client_id=0`
  )
  await b.close?.()
}
const doc = {
  schema: BRAND_MEASUREMENT_SCHEMA,
  tag: TAG,
  version: VERSION,
  template: TEMPLATE,
  measuredAt: new Date().toISOString(),
  machine: MACHINE,
  templateAccents: accents,
  runs
}
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'brand-measurement.json'), `${JSON.stringify(doc, null, 1)}\n`)
const j = judgeBrandMeasurement(doc)
console.log(
  JSON.stringify({ file: join(OUT, 'brand-measurement.json'), runs: j.runs, ok: j.ok, findings: j.findings })
)
