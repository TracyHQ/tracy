#!/usr/bin/env node
/**
 * PREVIEW-PARITY (probe v10, Akemi 17/10/2026): the Design system popup must show a template as Try on
 * shows it. A customer who sees JA Essence's carousel cut, or JA Vital's and Podcast's icons as empty
 * squares, in the popup but not on the page takes the popup for a bug. For each declared page and each
 * system, on a running Joomla site this script may write to (a lane's stand), it opens:
 *
 *   - the POPUP's page, the site wearing nothing, by each path `--popup` lists: `live` as BOTH
 *     popups frame it — the running site's since c43fa34e56, the Add site form's (the template's demo, its door's
 *     `live=1`) since 18/10/2026: the page's own address, the slot's bytes laid in by `liveWornHtmlOf` (the one
 *     function the site proxy uses for either ticket), the contract `quickstartContractOf` judges (the Add site
 *     door's), the page's scripts running — so one `live` row judges what a customer sees in either popup;
 *     `static/door` the static copy (`wornPageOf`, no script, stylesheets and fonts through the asset door) as
 *     the Add site popup framed it before 18/10/2026 (and as a door without its secret still answers);
 *     `static/site` the same copy with its stylesheets read straight off the site from another origin, as the
 *     running site's popup framed it before 34df1669e8; `live/door` the Add site popup end to end: the real
 *     door (`mountDesignSystemPreview`, `live=1`) mints the ticket for this stand as its demo, and every
 *     document the frame loads is answered as the site proxy answers it (`designSystemLivePages().pageOf`
 *     with the ticket's claims, the frame's own script included; no ticket on the address, the page as it is,
 *     as a redirect that drops it would get);
 *   - the page after TRY ON: the system written into the site as the apply writes it (the module rows of
 *     `flow.mjs`'s Joomla adapter), the page loaded as a visitor loads it;
 *
 * both read by PARITY_PROBE and compared (`preview-parity/compare.mjs`). Each carousel stopped on its first
 * slide and every reveal played out (cdp.mjs `still`), so timing is not a difference.
 *
 *   node apps/tracy-web/scripts/preview-parity.mjs --site http://127.0.0.1:52981 --tag quickstart/ja-essence/j6
 *        --version 1.0.9 --joomla-db b2-l1-db --joomla-prefix <prefix> [--joomla-login site]
 *        [--systems id,…] [--pages all|home|<path,…>] [--widths 1440,390] [--popup live,live/door,static/door,static/site]
 *        [--port 9660] [--out <dir>] [--concurrency <n>] [--write]
 *
 * --concurrency: how many pages are read at once, each in a Chrome of its own (default DEFAULT_CONCURRENCY).
 *   The site wears one system at a time, so the steps stay in order (every popup of a system, then Try on,
 *   then every page after it); within a step the pages are read together and the rows put together in page
 *   order (`inPool`, tracy-ds-slot/src/measure-pool.mjs): the same rows, misses and files as --concurrency 1.
 * --widths: every page at the first width; the home page also at each further one (the popup's Mobile).
 * --popup: `live,live/door` by default, the running site's popup and the Add site popup as customers see them.
 * --write: the live paths' rows (`live`, `live/door`, each row naming its `popup`) into the version's measurement file as its `previewParity` block (measurement.mjs
 *   `judgeParity`). Only while the rule is current (PREVIEW_PROBE_VERSION ≥ PARITY_SINCE): a scratch run
 *   with PREVIEW_PROBE_NEXT=1 writes nothing to the tree. A run with a view of a live path not compared (a
 *   popup or Try on that failed, a system with no slot) writes nothing and exits 1 (measure-gaps.mjs).
 * Writes <out>/<page>/<system>-<width>-{tryon,<path>}.png and <out>/parity-<path>.json. Leaves the site wearing
 * nothing (the module trashed, as the door's delete does).
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { Hono } from 'hono'
import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import {
  measurementPath,
  PARITY_SINCE,
  previewLineOf,
  validateMeasurement
} from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { loadContract } from '../../../packages/design/tracy-ds-slot/src/library.mjs'
import { parityGaps } from '../../../packages/design/tracy-ds-slot/src/measure-gaps.mjs'
import { concurrencyOf, inPool } from '../../../packages/design/tracy-ds-slot/src/measure-pool.mjs'
import { PREVIEW_PROBE_VERSION } from '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'
import { locationKeepingTicket } from '../src/bar/ds-preview.js'
import { DS_PREVIEW_PARAM, readDsPreviewTicket } from '../src/lib/ds-preview-ticket.js'
import { emitFor, googleFontFaces, modesOf, quickstartContractOf, referoLibrary } from '../src/lib/ds-slot.js'
import { designSystemLivePages, liveWornHtmlOf } from '../src/sites/design-system-live-page.js'
import { mountDesignSystemPreview } from '../src/sites/design-system-preview.js'
import { assetKindOf, cssForPreview } from '../src/sites/design-system-preview-assets.js'
import { previewPathOf } from '../src/sites/design-system-preview-links.js'
import { slotOf, withoutNoscriptNotices, wornPageOf } from '../src/sites/design-system-preview-page.js'
import { hostNamedAddress } from './preview-check/host-named.mjs'
import { measureBlockOf } from './preview-check/measure-block.mjs'
import { declaredPagesOf, pageSlugOf, pagesFor } from './preview-pages.mjs'
import { compareParity } from './preview-parity/compare.mjs'
import { PARITY_PROBE } from './preview-parity/probe.mjs'

const args = process.argv.slice(2)
const opt = (/** @type {string} */ n, /** @type {string | null} */ d = null) => {
  const i = args.indexOf(n)
  return i === -1 ? d : args.splice(i, 2)[1]
}
const flag = (/** @type {string} */ n) => (args.includes(n) ? (args.splice(args.indexOf(n), 1), true) : false)
// a stand at a loopback IP is read at localhost, as a customer's site always has a host name: YouTube refuses
// some videos inside a page served from a bare IP (JA Spa /our-spa, PREV-1; preview-check/host-named.mjs)
const SITE_OPT = opt('--site')
const SITE = SITE_OPT ? hostNamedAddress(SITE_OPT).replace(/\/+$/, '') : ''
const TAG = opt('--tag')
const VERSION = opt('--version')
const JDB = opt('--joomla-db')
const JPREFIX = opt('--joomla-prefix')
const JLOGIN = opt('--joomla-login', 'site')
const SYSTEMS = (
  opt('--systems') ??
  'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0,refero:5fd3b3b4-02ab-456a-87aa-e4395636b671'
)
  .split(',')
  .filter(Boolean)
const PAGES = opt('--pages', 'all')
const WIDTHS = (opt('--widths') ?? '1440,390')
  .split(',')
  .map(Number)
  .filter((w) => w > 0)
const PATHS = (opt('--popup') ?? 'live,live/door').split(',').filter(Boolean)
const PORT = Number(opt('--port', '9660'))
// pages read at once, each in its own Chrome: as preview-check.mjs (the tdsr skill, §3)
const DEFAULT_CONCURRENCY = 4
const CONCURRENCY = concurrencyOf(opt('--concurrency'), DEFAULT_CONCURRENCY)
const OUT = resolve(opt('--out', 'preview-parity'))
const WRITE = flag('--write')
const ROOT = resolve(import.meta.dirname, '../../..')
if (
  !SITE ||
  !TAG ||
  !VERSION ||
  !JDB ||
  !JPREFIX ||
  !PATHS.length ||
  PATHS.some((x) => !['live', 'live/door', 'static/door', 'static/site'].includes(x))
) {
  console.error(
    'usage: preview-parity.mjs --site <url> --tag <tag> --version <x.y.z> --joomla-db <container> --joomla-prefix <p> [--popup live,live/door,static/door,static/site] [--write]'
  )
  process.exit(2)
}
const active = PREVIEW_PROBE_VERSION >= PARITY_SINCE
if (WRITE && !active)
  console.log(
    `PREVIEW-PARITY belongs to probe v${PARITY_SINCE} (current v${PREVIEW_PROBE_VERSION}): measured, not written`
  )
mkdirSync(OUT, { recursive: true })
const fit = quickstartContractOf({ platform: 'joomla', tag: TAG, version: VERSION })
if (!('contract' in fit)) throw new Error(`no slot contract for ${TAG}@${VERSION}: ${fit.reason}`)

// --- Try on: the module rows flow.mjs's Joomla adapter writes (Claude Cowork's content.update `module`)
const sql = (/** @type {string} */ q) =>
  execFileSync(
    'docker',
    ['exec', '-i', JDB, 'mariadb', `-u${JLOGIN}`, `-p${JLOGIN}`, JLOGIN, '-N', '-e', q],
    {
      encoding: 'utf8',
      maxBuffer: 1 << 26
    }
  )
const esc = (/** @type {string} */ v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
/** @param {{ html: string, module: { title: string, position: string, ordering: number, style: string } }} out */
function wear(out) {
  const m = out.module
  const params = JSON.stringify({
    prepare_content: '0',
    layout: '_:default',
    moduleclass_sfx: '',
    cache: '0',
    style: m.style
  })
  const pick = `select id from ${JPREFIX}modules where title='${esc(m.title)}' and module='mod_custom' and client_id=0`
  const existing = sql(`${pick} order by id limit 1`).trim()
  if (existing)
    return sql(
      `update ${JPREFIX}modules set content='${esc(out.html)}', published=1, position='${m.position}', ordering=${Number(m.ordering ?? 0)}, params='${esc(params)}' where id=${existing}`
    )
  sql(
    `insert into ${JPREFIX}modules (asset_id,title,note,content,ordering,position,checked_out,publish_up,publish_down,published,module,access,showtitle,params,client_id,language) values (0,'${esc(m.title)}','','${esc(out.html)}',${Number(m.ordering ?? 0)},'${m.position}',NULL,NULL,NULL,1,'mod_custom',1,0,'${esc(params)}',0,'*')`
  )
  const id = sql(`${pick} order by id desc limit 1`).trim()
  sql(`insert ignore into ${JPREFIX}modules_menu (moduleid, menuid) values (${id}, 0)`)
}
const takeOff = () =>
  sql(
    `update ${JPREFIX}modules set published=-2 where title='Tracy design system' and module='mod_custom' and client_id=0`
  )
/** Until the site serves the page wearing `id` (or nothing): the module is read on the next request. */
async function servedWearing(/** @type {string | null} */ id) {
  for (let i = 0; i < 30; i++) {
    const html = await (await fetch(`${SITE}/`)).text().catch(() => '')
    const m = /tracy-ds-slot: ([A-Za-z0-9:-]+)/.exec(html)
    if (id ? m?.[1] === id : !m) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`the site does not serve ${id ?? 'the template default'}`)
}

// --- the static popup: wornPageOf's page served from another origin, its scripts taken out as the frame's
// sandbox does (preview-check.mjs `asTheFrameRuns`); `--assets door`: stylesheets and fonts through a local
// copy of the asset door, as the Add site popup loads them
/** @type {Map<string, string>} */
const served = new Map()
const assetOf = (/** @type {string} */ p) =>
  `http://127.0.0.1:${PORT}/api/design-system/preview-asset?path=${encodeURIComponent(p)}`
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  if (url.pathname === '/api/design-system/preview-asset') {
    const path = previewPathOf(url.searchParams.get('path'))
    const kind = path && assetKindOf(path)
    if (!path || !kind) return void res.writeHead(400).end()
    try {
      const r = await fetch(new URL(path, SITE))
      if (!r.ok) return void res.writeHead(r.status).end()
      if (kind === 'css')
        res
          .writeHead(200, { 'content-type': 'text/css' })
          .end(cssForPreview(await r.text(), { cssUrl: new URL(path, SITE).href, assetOf }))
      else res.writeHead(200, { 'content-type': `font/${kind}` }).end(Buffer.from(await r.arrayBuffer()))
    } catch {
      res.writeHead(502).end()
    }
    return
  }
  const html = served.get(url.pathname)
  if (!html) return void res.writeHead(404).end()
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
})
await new Promise((ok) => server.listen(PORT, '127.0.0.1', () => ok(null)))
const asTheFrameRuns = (/** @type {string} */ html) =>
  withoutNoscriptNotices(html)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<\/?noscript\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')

// --- the Add site popup's live door, end to end: this stand as the quickstart's demo, a ticket of its own
const DOOR_SECRET = randomBytes(32).toString('hex')
const STAND_KEY = 'preview-parity-stand'
const door = new Hono()
mountDesignSystemPreview(door, {
  signedIn: async () => ({ email: 'preview-parity@tracy.test', probe: true }),
  previewRate: async () => ({ over: false, retryAfterS: 0 }),
  demoOf: async () => ({
    site_key: STAND_KEY,
    host: 'local',
    label: 'stand',
    platform: 'joomla',
    address: `${SITE}/`,
    quickstart_version: VERSION
  }),
  innerOf: () => new URL(`${SITE}/`),
  fetchImpl: fetch,
  ds: { refero: referoLibrary, quickstartContractOf, emitFor, fontFaces: googleFontFaces, modesOf },
  secret: DOOR_SECRET
})
const livePages = designSystemLivePages()
/** The live frame's address the door gives for `system`, or why it gives none. */
async function doorSrcOf(/** @type {string} */ system) {
  const q = new URLSearchParams({ quickstart: String(TAG), platform: 'joomla', id: system, live: '1' })
  const res = await door.request(`/api/design-system/preview?${q}`)
  const body = /** @type {any} */ (await res.json().catch(() => null))
  if (!res.ok || !body?.live || typeof body.src !== 'string')
    throw new Error(`door ${res.status} ${body?.code ?? ''} ${body?.reason ?? ''}`)
  return new URL(body.src)
}

// the contract's `measureBlock` failed at once, on the popup's page and on the page after Try on alike, as
// flow.mjs and preview-check.mjs fail it (preview-check/measure-block.mjs)
// one Chrome per pool slot, each with its own profile and tab (a popup's document rewrite is per browser)
const chromes = await Promise.all(
  Array.from({ length: CONCURRENCY }, () =>
    browser(9450 + (PORT % 50), { block: measureBlockOf([loadContract(fit.contract)]) })
  )
)
/** One page at one width: its probe and a picture. */
async function read(
  /** @type {any} */ chrome,
  /** @type {string} */ href,
  /** @type {number} */ width,
  /** @type {string} */ shot
) {
  await chrome.open(href, width, { still: true })
  const probe = await chrome.evaluate(PARITY_PROBE)
  await chrome.shot(shot)
  return probe
}
/** The popup's page of `path` under the slot `slot`, at `width`, by the popup path `how`. */
async function popupOf(
  /** @type {any} */ chrome,
  /** @type {string} */ how,
  /** @type {string} */ path,
  /** @type {any} */ slot,
  /** @type {number} */ width,
  /** @type {string} */ shot
) {
  if (how === 'live/door') {
    // the door's own address for the home, the ticket carried to `path` as the frame's script carries it on a link
    const src = await doorSrcOf(slot.system)
    const page = new URL(path, `${SITE}/`)
    page.searchParams.set(DS_PREVIEW_PARAM, String(src.searchParams.get(DS_PREVIEW_PARAM)))
    const pub = new URL(`${SITE}/`)
    const ticketOf = (/** @type {string} */ url) => {
      const at = new URL(url)
      if (at.origin !== pub.origin) return null
      const ticket = at.searchParams.get(DS_PREVIEW_PARAM)
      return readDsPreviewTicket(DOOR_SECRET, ticket, STAND_KEY) ? String(ticket) : null
    }
    const asProxy = async (/** @type {string} */ url, /** @type {string} */ html) => {
      const ticket = ticketOf(url)
      const claims = ticket ? readDsPreviewTicket(DOOR_SECRET, ticket, STAND_KEY) : null
      if (!ticket || !claims) return null
      return livePages.pageOf({
        html,
        claims,
        ticket,
        site: { platform: 'joomla' },
        inner: pub,
        pub,
        parentOrigin: `http://127.0.0.1:${PORT}`,
        fetchImpl: fetch
      })
    }
    // a redirect the site answers keeps the ticket as the proxy keeps it (bar/route.js): followed here, as the
    // frame follows the proxy's Location, so the browser opens the page the frame lands on
    for (let hop = 0; hop < 5; hop++) {
      const asked = new URL(page)
      asked.searchParams.delete(DS_PREVIEW_PARAM)
      const res = await fetch(asked, { redirect: 'manual' })
      if (res.status < 300 || res.status >= 400) break
      const ticket = ticketOf(page.href)
      const to = ticket
        ? locationKeepingTicket(res.headers.get('location'), {
            asked: `${page.origin}${page.pathname}`,
            ticket
          })
        : null
      if (!to) break
      page.href = to
    }
    await chrome.rewriteDocuments(asProxy)
    try {
      return await read(chrome, page.href, width, shot)
    } finally {
      await chrome.rewriteDocuments(null)
    }
  }
  if (how === 'live') {
    // every page of the site's origin, as the site proxy lays the slot into every page the ticket rides on
    // (a redirect included); the frame's own helper script changes nothing a visitor sees and is left out
    const page = new URL(path, `${SITE}/`).href
    await chrome.rewriteDocuments((url, html) =>
      new URL(url).origin === new URL(SITE).origin
        ? liveWornHtmlOf(html, { platform: 'joomla', ...slot, script: '' })
        : null
    )
    try {
      return await read(chrome, page, width, shot)
    } finally {
      await chrome.rewriteDocuments(null)
    }
  }
  const pub = new URL(`${SITE}/`)
  const built = await wornPageOf({
    platform: 'joomla',
    bytes: slot.bytes,
    inner: pub,
    pub,
    fetchImpl: fetch,
    waitMs: 60000,
    path,
    assetOf: how === 'static/door' ? assetOf : null
  })
  if ('miss' in built) throw new Error(`static popup of ${path}: ${built.miss}`)
  const key = `/popup/${how.replace('/', '-')}/${pageSlugOf(path)}`
  served.set(key, asTheFrameRuns(built.html))
  return read(chrome, `http://127.0.0.1:${PORT}${key}`, width, shot)
}

const declared = await declaredPagesOf(
  { platform: 'joomla', tag: TAG, version: VERSION, address: `${SITE}/` },
  { root: ROOT }
)
const wanted = pagesFor(PAGES, declared.pages)
/** @type {Record<string, any[]>} */
const rows = Object.fromEntries(PATHS.map((x) => [x, []]))
/** @type {Record<string, { page: string, system: string, width: number, miss: string }[]>} */
const misses = Object.fromEntries(PATHS.map((x) => [x, []]))
const missAll = (/** @type {any} */ m) => PATHS.forEach((x) => misses[x].push(m))
const started = Date.now()
try {
  for (const system of SYSTEMS) {
    const out = await emitFor({ platform: 'joomla', contract: fit.contract, id: system })
    const slot = out.ok ? slotOf(out) : null
    if (!out.ok || !slot) {
      for (const page of wanted)
        missAll({ page, system, width: WIDTHS[0], miss: `NO_SLOT (${out.code ?? 'emit'})` })
      continue
    }
    const tag = system.replace(/[^a-z0-9]/gi, '').slice(-8)
    const views = wanted.flatMap((page) =>
      (page === '/' ? WIDTHS : WIDTHS.slice(0, 1)).map((width) => ({ page, width }))
    )
    /** @type {Map<string, any>} */
    const popups = new Map()
    // the popup is opened before Try on: the site wears nothing yet
    takeOff()
    await servedWearing(null)
    // every view of one page in one slot, one after the other: the static popups serve a page's copy at one
    // address for both widths
    const byPage = wanted.map((page) => views.filter((v) => v.page === page))
    const opened = await inPool(byPage, CONCURRENCY, async (pageViews, _, at) => {
      /** @type {{ how: string, v: { page: string, width: number }, popup?: any, miss?: string }[]} */
      const got = []
      for (const v of pageViews) {
        const dir = join(OUT, pageSlugOf(v.page))
        mkdirSync(dir, { recursive: true })
        for (const how of PATHS)
          try {
            const shot = join(dir, `${tag}-${v.width}-${how.replace('/', '-')}.png`)
            got.push({
              how,
              v,
              popup: await popupOf(chromes[at], how, v.page, { ...slot, system }, v.width, shot)
            })
          } catch (e) {
            got.push({ how, v, miss: `POPUP (${String(e?.message ?? e).slice(0, 120)})` })
          }
      }
      return got
    })
    for (const { how, v, popup, miss } of opened.flat())
      if (miss) misses[how].push({ page: v.page, system, width: v.width, miss })
      else popups.set(`${how}|${v.page}|${v.width}`, popup)
    wear(/** @type {any} */ (out))
    await servedWearing(system)
    const tried = await inPool(views, CONCURRENCY, async (v, _, at) => {
      try {
        return {
          tryOn: await read(
            chromes[at],
            new URL(v.page, `${SITE}/`).href,
            v.width,
            join(OUT, pageSlugOf(v.page), `${tag}-${v.width}-tryon.png`)
          )
        }
      } catch (e) {
        return { miss: `TRY_ON (${String(e?.message ?? e).slice(0, 120)})` }
      }
    })
    for (const [i, v] of views.entries()) {
      const dir = join(OUT, pageSlugOf(v.page))
      const { tryOn, miss } = tried[i]
      if (miss) {
        missAll({ page: v.page, system, width: v.width, miss })
        continue
      }
      for (const how of PATHS) {
        const popup = popups.get(`${how}|${v.page}|${v.width}`)
        if (!popup) continue
        if (popup.slot !== system || tryOn.slot !== system) {
          misses[how].push({
            page: v.page,
            system,
            width: v.width,
            miss: `NOT_WORN (popup ${popup.slot}, try on ${tryOn.slot})`
          })
          continue
        }
        const found = compareParity(popup, tryOn)
        writeFileSync(
          join(dir, `${tag}-${v.width}-${how.replace('/', '-')}.json`),
          JSON.stringify({ popup, tryOn, found }, null, 1)
        )
        rows[how].push({
          page: v.page,
          system,
          width: v.width,
          count: found.count,
          findings: found.findings.slice(0, 60)
        })
        console.log(
          `${how.padEnd(11)} ${v.page.padEnd(40)} ${tag} ${v.width}: ${found.count ? found.findings.map((f) => `${f.kind} ${f.at}${f.family ? ` (${f.family})` : ''}${f.why ? ` (${f.why})` : ''}`).join('; ') : 'same'}`
        )
      }
    }
  }
} finally {
  try {
    takeOff()
  } catch {}
  for (const chrome of chromes) chrome.close()
  server.close()
}
/** @type {Record<string, any>} */
const blocks = {}
for (const how of PATHS) {
  blocks[how] = {
    probeVersion: active ? PREVIEW_PROBE_VERSION : PARITY_SINCE,
    popup: how,
    measuredAt: new Date().toISOString(),
    pages: declared.pages,
    rows: rows[how],
    ...(misses[how].length ? { misses: misses[how] } : {})
  }
  const file = join(OUT, `parity-${how.replace('/', '-')}.json`)
  writeFileSync(file, `${JSON.stringify(blocks[how], null, 2)}\n`)
  console.log(
    `PREVIEW-PARITY ${how}: ${rows[how].length} views, ${rows[how].filter((r) => r.count > 0).length} differ, ${misses[how].length} not read, ${Math.round((Date.now() - started) / 1000)} s → ${file}`
  )
}
// What a customer sees: the live paths (both popups), their rows together, each saying which popup it read.
const written = PATHS.filter((x) => x === 'live' || x === 'live/door')
const block = written.length
  ? {
      ...blocks[written[0]],
      popup: written.join(', '),
      rows: written.flatMap((x) => rows[x].map((r) => ({ ...r, popup: x }))),
      ...(written.some((x) => misses[x].length)
        ? { misses: written.flatMap((x) => misses[x].map((m) => ({ ...m, popup: x }))) }
        : {})
    }
  : null
if (WRITE && active && block) {
  // a view not compared beside one that was would pass unseen (measure-gaps.mjs): nothing written
  const gaps = parityGaps(block)
  if (gaps.length) {
    console.error(`not written, ${gaps.length} views not compared:\n  ${gaps.join('\n  ')}`)
    process.exit(1)
  }
  const line = previewLineOf({ platform: 'joomla', tag: TAG })
  if (!line) throw new Error(`${TAG} names no template line`)
  const file = resolve(
    ROOT,
    measurementPath({
      cms: 'joomla',
      template: line.template,
      tag: `${line.template}/${line.cmsDir}`,
      version: VERSION
    })
  )
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  doc.previewParity = block
  const bad = validateMeasurement(doc)
  if (bad.length) throw new Error(`not written, the file would not validate: ${bad.join('; ')}`)
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
  console.log(`written: ${file}`)
}
