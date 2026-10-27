/**
 * `/ops` › User Interface › Desktop App — the doors of the settings that belong to the Tracy Cowork
 * desktop app alone (`lib/desktop-setting.js`). Every other area of that screen applies to the app
 * as it is, through `/api/ui`.
 *
 * Also the installs of the app (`lib/desktop-install.js`, tasks/todo-desktop-auto-update.md): the
 * signed-in app links its install id to the person, and staff see every install.
 */
import { Hono } from 'hono'

import { installIdOf, linkInstall, listInstalls } from '../lib/desktop-install.js'
import {
  DESKTOP_PROVIDERS,
  parseDesktopPress,
  readDesktopSetting,
  readTracyModel,
  saveDesktopSetting
} from '../lib/desktop-setting.js'
import { escapeHtml } from '../lib/html.js'
import { requireViewer } from '../lib/http.js'
import { pageShell } from '../lib/page-shell.js'
import { renderedPage } from '../lib/security-headers.js'
import { admit, denied } from './admit.js'
import { belowReport, reportQuery, sinceOf } from './desktop-installs-report.js'
import { mountDesktopOpened } from './desktop-opened.js'

export function desktopRoutes({ pool, config, now = Date.now }) {
  const app = new Hono()
  mountDesktopOpened(app, { pool, config, now })

  /** Everyone who may see /ops may read; only an owner or admin, from this origin, may press. */
  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write) {
      if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
      if (c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    }
    return { who }
  }

  /** The stored settings with the model the app runs on while no plan is connected. */
  const read = async () => {
    const [setting, tracyModel] = await Promise.all([readDesktopSetting(pool), readTracyModel(pool)])
    return { ...setting, tracyModel }
  }
  /**
   * What the app reads: the `llm` block, that model, and the catalogue of the vendors on offer (id,
   * name, home page — for the first-run screen's cards), nothing about who pressed.
   */
  const answer = async () => {
    const { llm, tracyModel } = await read()
    const catalogue = DESKTOP_PROVIDERS.filter((p) => llm.providers.includes(p.id)).map(
      ({ id, name, homepage }) => ({ id, name, homepage })
    )
    return { llm, tracyModel, catalogue }
  }

  /**
   * ── GET /api/desktop/config — what the desktop app should offer ───────────────────────────────
   *
   * Public and not admitted: the app reads it before anyone signs in, and nothing in it is secret —
   * a vendor id, never a key. Read per request with `no-store`, so a press reaches the next read.
   */
  app.get('/api/desktop/config', async (c) => {
    c.header('cache-control', 'no-store')
    return c.json(await answer())
  })

  /**
   * ── GET /api/ops/desktop — the screen's whole document ───────────────────────────────────────
   *
   * The same answer the app reads, plus the vendors the screen may offer and who pressed last.
   */
  app.get('/api/ops/desktop', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const { llm, tracyModel, updatedBy, updatedAt } = await read()
    return c.json({
      llm,
      tracyModel,
      providers: DESKTOP_PROVIDERS,
      updatedBy,
      updatedAt,
      writable: ['owner', 'admin'].includes(g.who.role)
    })
  })

  /**
   * ── PUT /api/ops/desktop — `{ llm: { connect?: boolean, providers?: string[] } }` ───────────────
   *
   * Nothing is written unless every key is known and every value the right type.
   */
  app.put('/api/ops/desktop', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const press = parseDesktopPress(await c.req.json().catch(() => null))
    if (!press.ok) {
      const { ok: _ok, ...error } = press
      return c.json(error, 400)
    }
    await saveDesktopSetting(pool, press.llm, g.who.email)
    return c.json(await answer())
  })

  /**
   * ── POST /api/desktop/installs/link — `{ installId }` ─────────────────────────────────────────
   *
   * The signed-in app says which install it is; the row the feed recorded gets this person. Sent
   * from the app's own page (same origin, session cookie), so the cross-site guard applies as to
   * any other door. 404 until the feed has seen that id — the app tries again on a later load.
   */
  app.post('/api/desktop/installs/link', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const body = await c.req.json().catch(() => null)
    const installId = installIdOf(body?.installId)
    if (installId === null) return c.json({ code: 'INVALID_INSTALL_ID' }, 400)
    if ((await linkInstall(pool, { installId, email })) === 'unknown')
      return c.json({ code: 'UNKNOWN_INSTALL' }, 404)
    return c.body(null, 204)
  })

  /**
   * The report for an expected minimum version (`?below=&channel=[&days=]`), or the plain list when
   * the query names none of them. Read-only either way.
   * @returns {Promise<{ list: Awaited<ReturnType<typeof listInstalls>> } | { report: ReturnType<typeof belowReport> } | { invalid: object }>}
   */
  const installsAnswer = async (query) => {
    const expected = reportQuery(query)
    if (expected === null) return { list: await listInstalls(pool) }
    if (!expected.ok) {
      const { ok: _ok, ...invalid } = expected
      return { invalid }
    }
    const since = sinceOf(expected.days, now())
    const rows = await listInstalls(pool, { limit: null, channel: expected.channel, since })
    return { report: belowReport(rows, { ...expected, since }) }
  }

  /**
   * ── GET /api/ops/desktop/installs — every install, most recently seen first ───────────────────
   *
   * With `?below=<X.Y.Z[-dev.N]>&channel=<stable|dev>[&days=<7|30|90|all>]`: the installs of that
   * channel a minimum of `below` would block (C8), counted, split and listed. 400 on a bad query.
   */
  app.get('/api/ops/desktop/installs', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const answer = await installsAnswer(c.req.query())
    if (answer.invalid) return c.json(answer.invalid, 400)
    return c.json(answer.report ?? { installs: answer.list })
  })

  /**
   * ── GET /ops/desktop/installs — the same list as a plain table ───────────────────────────────
   *
   * Server-rendered here rather than in the /ops SPA (`packages/web/tracy-harness`): one read-only
   * table, English like the rest of /ops. Its form asks for an expected minimum version and shows
   * the same report as the JSON door; a bad query is a 400 page that keeps the form filled.
   */
  app.get('/ops/desktop/installs', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const query = c.req.query()
    const answer = await installsAnswer(query)
    return renderedPage(c, installsPage({ ...answer, query }), answer.invalid ? 400 : 200)
  })

  return app
}

/** The operating system a `desktop_install.platform` names, as /ops shows it (English, like /ops). */
const OS_NAME = { mac: 'macOS', win: 'Windows', linux: 'Linux' }

const cell = (value) => `<td>${value === null || value === undefined ? '—' : escapeHtml(String(value))}</td>`
const osOf = (i) => [OS_NAME[i.platform] ?? i.platform, i.osVersion].filter(Boolean).join(' ') || null
const minute = (iso) => iso.replace('T', ' ').slice(0, 16)
const TABLE = 'style="width:100%;border-collapse:collapse;font-size:0.875rem;margin-top:0.75rem"'
const head = (labels) =>
  `<thead><tr>${labels.map((l) => `<th align="left">${escapeHtml(l)}</th>`).join('')}</tr></thead>`

/** The question the page asks: which version would be required, on which channel, seen when. */
function expectedForm(query) {
  const option = (value, label, chosen) =>
    `<option value="${escapeHtml(value)}"${value === chosen ? ' selected' : ''}>${escapeHtml(label)}</option>`
  const below = typeof query.below === 'string' ? query.below : ''
  const channel = query.channel ?? 'stable'
  const days = query.days ?? 'all'
  const field = (label, control) =>
    `<label style="display:flex;flex-direction:column;gap:0.25rem;min-width:9rem">${label}${control}</label>`
  return `<form method="get" action="/ops/desktop/installs" style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-end;margin:1rem 0">
${field('Expected minimum version', `<input name="below" value="${escapeHtml(below)}" placeholder="0.6.0 or 0.6.0-dev.12" required style="padding:0 0.75rem">`)}
${field('Channel', `<select name="channel">${option('stable', 'stable', channel)}${option('dev', 'dev', channel)}</select>`)}
${field('Last seen', `<select name="days">${option('all', 'At any time', days)}${option('7', 'In the last 7 days', days)}${option('30', 'In the last 30 days', days)}${option('90', 'In the last 90 days', days)}</select>`)}
<button type="submit">Count installs below</button>
</form>`
}

/** @param {ReturnType<typeof belowReport>} r */
function reportSection(r) {
  const n = (count, one, many) => `${count} ${count === 1 ? one : many}`
  const window = r.since ? `seen since ${minute(r.since)} UTC` : 'seen at any time'
  const split = r.byPlatform
    .map((p) => `<tr>${cell(OS_NAME[p.platform] ?? p.platform)}${cell(p.arch)}${cell(p.count)}</tr>`)
    .join('')
  const versions = r.byVersion.map((v) => `<tr>${cell(v.version)}${cell(v.count)}</tr>`).join('')
  const machines = r.installs
    .map(
      (i) =>
        `<tr><td title="${escapeHtml(i.installId)}">${escapeHtml(i.installId.slice(0, 8))}</td>${cell(i.email)}${cell(i.version)}${cell(osOf(i))}${cell(i.arch)}${cell(minute(i.lastSeen))}</tr>`
    )
    .join('')
  return `<h2>Below ${escapeHtml(r.below)} on ${escapeHtml(r.channel)}</h2>
<p><strong>${escapeHtml(n(r.total, `${r.channel} install runs`, `${r.channel} installs run`))} a version below ${escapeHtml(r.below)}</strong>
(${escapeHtml(window)}); ${r.atOrAbove} at or above it, ${r.unknownVersion} with a version that could not be read.
Read-only: nothing is required until a person sets the minimum on the feed.</p>
${
  r.total === 0
    ? ''
    : `<table ${TABLE}>${head(['OS', 'Arch', 'Installs'])}<tbody>${split}</tbody></table>
<table ${TABLE}>${head(['Version', 'Installs'])}<tbody>${versions}</tbody></table>
<table ${TABLE}>${head(['Install', 'Person', 'Version', 'OS', 'Arch', 'Last seen (UTC)'])}<tbody>${machines}</tbody></table>`
}
<p class="card-description" style="margin-top:1rem"><a href="/ops/desktop/installs">Show every install</a></p>`
}

/** @param {Awaited<ReturnType<typeof listInstalls>>} installs */
function listSection(installs) {
  const rows = installs
    .map(
      (i) =>
        `<tr>${cell(i.installId)}${cell(i.email)}${cell(i.version)}${cell(i.channel)}${cell(i.arch)}${cell(osOf(i))}${cell(minute(i.lastSeen))}${cell(i.firstSeen.slice(0, 10))}</tr>`
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;font-size:0.875rem">
<thead><tr><th align="left">Install</th><th align="left">Person</th><th align="left">Version</th><th align="left">Channel</th><th align="left">Arch</th><th align="left">OS</th><th align="left">Last seen (UTC)</th><th align="left">First seen</th></tr></thead>
<tbody>${rows || '<tr><td colspan="8">No install has asked for an update yet.</td></tr>'}</tbody>
</table>`
}

/**
 * @param {{ query: Record<string, string>, list?: Awaited<ReturnType<typeof listInstalls>>,
 *   report?: ReturnType<typeof belowReport>, invalid?: { message: string } }} page
 */
function installsPage({ query, list, report, invalid }) {
  const body = invalid
    ? `<p role="alert" style="color:var(--destructive)">${escapeHtml(invalid.message)}</p>`
    : report
      ? reportSection(report)
      : listSection(list)
  return pageShell(
    'Desktop app installs',
    `<h1>Desktop app installs</h1>
<p class="card-description">Every Tracy Cowork app that asked the update feed, most recently seen first.
The person is known once the app has been signed in. Before raising a channel's minimum version,
count the installs it would block.</p>
${expectedForm(query)}
${body}`
  )
}
