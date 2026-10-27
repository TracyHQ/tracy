/**
 * The Team tab's table, driven in a real browser at every panel tier (Akemi, 30/09).
 *
 * The fixture (`../fixtures/team-roster-entry.tsx`) runs this plugin's real `apply()` and mounts the
 * real Team tab over a book this test sets. Pinned here, for cases A–F of the approved options page
 * and at panel widths 720, 620, 430 and 300 (Role and Status fold into a badge line under the name
 * below 560px):
 *
 *   - every seat shows a status, "Active" included, at every width;
 *   - the access line ("Granted … · by …") sits under the member's email at EVERY width; there is no
 *     Access column (Akemi, 01/10: a 140px column cut the granter's address while Member stood half
 *     empty);
 *   - Role, Status and the actions are only as wide as their content (slack ≤ 1px), so the
 *     Member column holds every spare pixel: a name or email is cut only when the row is out of room,
 *     and never at 720px in cases A, B, C and E;
 *   - every visible column header starts at the same x as its first cell's content (±1px);
 *   - nothing scrolls sideways and no cell's content spills out of it;
 *   - the actions column follows the viewer's role (Owner yes, Editor and Viewer no; ADR 0028);
 *   - a declined row reads "Invited …", not "Granted …";
 *   - on a light panel a non-owner role badge is a filled chip, not a hairline outline, and "Active"
 *     is a success-coloured dot (Akemi, 01/10: the outline measured 1.17:1 against the panel);
 *   - all of it with a second plugin's sheet loaded after ours, as in dsh's page.
 *
 * Harness rules as in `tab-loading.test.mjs`: `playwright` from apps/tracy-host, `react-dom` from
 * @tracy/core, and a missing dependency or browser FAILS instead of skipping.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

// ── The books: the same people as the options page ────────────────────────────────────────────
const DAY = 86_400_000
const ago = (ms) => new Date(Date.now() - ms).toISOString()
const ME = 'akemi@example.com'
const W = 'user420@example.com'
let n = 0
const seat = (o) => ({
  id: `acc-${++n}`,
  displayName: null,
  avatarUrl: null,
  status: 'active',
  grantedAt: ago(o.days * DAY),
  grantedBy: o.by ? `id-${o.by}` : `id-${o.email}`,
  grantedByEmail: o.by ?? o.email,
  revokedAt: null,
  requestedAt: null,
  scope: 'site',
  ...o
})
const only = [seat({ email: ME, role: 'owner', days: 0.7 })]
const many = [
  seat({ email: ME, role: 'owner', days: 17 }),
  seat({ email: W, role: 'owner', days: 14, by: ME }),
  seat({ displayName: 'Lan Nguyen', email: 'lan.nguyen@example.com', role: 'editor', days: 14, by: W }),
  seat({ email: 'minh.tran@studio-example.com', role: 'editor', days: 9, by: W }),
  seat({ email: 'brian@example.com', role: 'editor', days: 3, by: ME })
]
const statuses = [
  seat({ email: ME, role: 'owner', days: 17 }),
  seat({ email: 'hoa.pham@example.com', role: 'editor', days: 6, by: ME }),
  seat({ email: 'new.hire@example.com', role: 'viewer', status: 'invited', days: 2 / 24, by: W }),
  seat({
    email: 'visitor@example.com',
    role: 'editor',
    status: 'invited',
    days: 3 / 24,
    requestedAt: ago(3 * 3_600_000)
  }),
  seat({ email: 'declined.guy@example.com', role: 'editor', status: 'declined', days: 5, by: ME }),
  seat({
    email: 'old.member@example.com',
    role: 'editor',
    status: 'revoked',
    days: 9,
    revokedAt: ago(2 * DAY)
  }),
  seat({ email: 'ops@example.com', role: 'editor', scope: 'workspace', days: 30, by: W }),
  seat({
    email: 'contractor@example.com',
    role: 'editor',
    scope: 'workspace',
    status: 'invited',
    days: 1,
    by: W
  })
]
const LONG_BY = 'operations.department.head@another-very-long-domain.co.uk'
const longs = [
  seat({ email: ME, role: 'owner', days: 17 }),
  seat({
    email: 'marketing.team.lead+tracy-site-ops@verylongcompanydomain-example.com',
    role: 'editor',
    days: 14,
    by: LONG_BY
  }),
  seat({
    displayName: 'Christopher Alexander Montgomery-Whitfield',
    email: 'christopher.montgomery-whitfield@enterprise-holdings-example.com',
    role: 'editor',
    status: 'invited',
    days: 59 / 1440,
    by: LONG_BY
  }),
  seat({ email: 'brian@example.com', role: 'viewer', days: 3, by: ME })
]
const eSite = [
  seat({ email: ME, role: 'owner', days: 17 }),
  seat({ email: W, role: 'owner', days: 14, by: ME }),
  seat({ displayName: 'Lan Nguyen', email: 'lan.nguyen@example.com', role: 'viewer', days: 14, by: ME })
]
const eEditorSite = [...eSite, seat({ email: 'hoa.pham@example.com', role: 'editor', days: 6, by: W })]
/**
 * Case F (ADR 0028 §6): one Viewer asked for edit access. Measured 08/10/2026 on the local cluster:
 * the request's chip and its Approve + Decline widened Status and the actions column so much that
 * Member shrank and EVERY row's email was cut. The request must cost Member nothing.
 */
const fQuiet = [
  seat({ email: 'octopal.operations@example.com', role: 'owner', days: 17 }),
  seat({ email: 'lan.nguyen@studio-example.com', role: 'editor', days: 9, by: ME }),
  seat({ email: 'dana+tom@nova-studio-example.com', role: 'viewer', days: 2, by: ME })
]
const fAsked = fQuiet.map((s) => (s.role === 'viewer' ? { ...s, editRequestedAt: ago(20 * 60_000) } : s))

/**
 * [case, seats, viewer email, viewer role, room at 720px for every name?]
 * C is out of room at 720px on purpose: "Viewer", "Asked to join", "Invited 2 hours ago" and
 * Approve + an icon leave Member ~235px, so "declined.guy@example.com" is cut — with every other
 * column at zero slack, which is what the rule asks (the slack assertion proves it).
 */
const CASES = [
  ['A', only, ME, 'owner', true],
  ['B', many, ME, 'owner', true],
  ['C', statuses, ME, 'owner', false],
  ['D', longs, ME, 'owner', false],
  ['E-owner', eSite, ME, 'owner', true],
  ['E-viewer', eSite, 'lan.nguyen@example.com', 'viewer', true],
  ['E-editor', eEditorSite, 'hoa.pham@example.com', 'editor', true],
  ['F-quiet', fQuiet, 'octopal.operations@example.com', 'owner', true],
  ['F-asked', fAsked, 'octopal.operations@example.com', 'owner', true]
]
const WIDTHS = [720, 620, 430, 300]

let outDir
let server
let browser
let page
const report = []

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR ?? tmpdir(), 'tst-team-roster-'))
  const cssFile = path.join(outDir, 'site-tabs.css')
  execFileSync(
    process.execPath,
    [
      path.join(pkgRoot, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
      '--input',
      path.join(pkgRoot, 'src', 'client', 'site-tabs.css'),
      '--output',
      cssFile,
      '--minify'
    ],
    { cwd: pkgRoot, stdio: ['ignore', 'ignore', 'inherit'] }
  )
  const built = await esbuild.build({
    entryPoints: [path.join(here, '..', 'fixtures', 'team-roster-entry.tsx')],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2020'],
    loader: { '.css': 'empty' },
    define: {
      __TAILWIND_CSS__: JSON.stringify(readFileSync(cssFile, 'utf8')),
      'process.env.NODE_ENV': '"production"'
    },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  writeFileSync(path.join(outDir, 'app.js'), built.outputFiles[0].text)
  // `#panel` is dsh's tab body; the test sets its width per tier.
  writeFileSync(
    path.join(outDir, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif}' +
      '#panel{position:relative;box-sizing:border-box;width:720px;height:800px;margin:20px;overflow:auto}' +
      '</style></head><body><div id="panel"></div><script src="/app.js"></script></body></html>'
  )
  server = http.createServer((req, res) => {
    const name = req.url.split('?')[0].endsWith('/app.js') ? 'app.js' : 'page.html'
    res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(readFileSync(path.join(outDir, name)))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // No photo lookups: every face falls back to initials, as offline.
  await page.route(/gravatar\.com/, (route) => route.abort())
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => Boolean(window.__tabs?.['tracy:team']), null, { timeout: 8000 })
  assert.deepEqual(errors, [], 'the fixture page boots without errors')
})

after(async () => {
  if (report.length > 0) process.stdout.write(`# widths\n${report.map((r) => `# ${r}`).join('\n')}\n`)
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

async function show(seats, me, role, width) {
  await page.evaluate(
    ([seats, me, role, width]) => {
      document.getElementById('panel').style.width = `${width}px`
      window.__team = { me, site: { siteKey: 'shop.example.com', myRole: role, seats } }
      window.__mountTeam()
    },
    [seats, me, role, width]
  )
  await page.waitForSelector('[data-team-roster] tbody tr', { timeout: 5000 })
  await page.waitForTimeout(50)
}

/** Everything the assertions read, measured in the page. */
const measure = () =>
  page.evaluate(() => {
    const panel = document.getElementById('panel')
    const frame = panel.firstElementChild
    const wrap = panel.querySelector('[data-team-roster]')
    const table = wrap.querySelector('table')
    const ths = [...table.querySelectorAll('thead th')]
    const rows = [...table.querySelectorAll('tbody tr')]
    const visible = (el) => el.getClientRects().length > 0
    const textRect = (el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return range.getBoundingClientRect()
    }
    const pad = (el) => {
      const cs = getComputedStyle(el)
      return { l: Number.parseFloat(cs.paddingLeft), r: Number.parseFloat(cs.paddingRight) }
    }
    /** The narrowest this cell could be: its widest badge, button or line, plus padding. */
    const needed = (cell) => {
      const p = pad(cell)
      let widest = 0
      for (const el of cell.querySelectorAll('*')) {
        if (!visible(el)) continue
        const isAtom = el.matches('[class*="group/badge"], [data-slot="button"], [data-status]')
        const isLine = !isAtom && el.children.length === 0 && el.textContent.trim() !== ''
        if (!isAtom && !isLine) continue
        if (isLine && el.closest('[class*="group/badge"], [data-slot="button"], [data-status]')) continue
        const truncated = el.scrollWidth > el.clientWidth + 0.5 && getComputedStyle(el).overflow === 'hidden'
        const w = isAtom ? el.getBoundingClientRect().width : truncated ? el.clientWidth : textRect(el).width
        widest = Math.max(widest, w)
      }
      // Buttons sit side by side: their widths add up (plus the 2px gap between them).
      const buttons = [...cell.querySelectorAll('[data-slot="button"]')].filter(visible)
      if (buttons.length > 0)
        widest = Math.max(
          widest,
          buttons.reduce((sum, b) => sum + b.getBoundingClientRect().width, 0) + 2 * (buttons.length - 1)
        )
      if (cell.tagName === 'TH' && cell.textContent.trim() !== '')
        widest = Math.max(widest, textRect(cell).width)
      return widest + p.l + p.r
    }
    const cols = ths.map((th, i) => {
      const cells = [th, ...rows.map((r) => r.children[i])]
      const shown = visible(th)
      return {
        header: th.textContent.trim() || '(actions)',
        shown,
        width: shown ? th.getBoundingClientRect().width : 0,
        slack: shown ? Math.min(...cells.map((c) => c.getBoundingClientRect().width - needed(c))) : 0,
        // header text left vs the first row's content left
        align:
          shown && th.textContent.trim() !== ''
            ? {
                th: textRect(th).left,
                td: rows[0].children[i].firstElementChild.getBoundingClientRect().left
              }
            : null
      }
    })
    const perRow = rows.map((r) => {
      const statuses = [...r.querySelectorAll('[data-status]')]
        .filter(visible)
        .map((b) => b.textContent.trim())
      const lines = [...r.querySelectorAll('[data-member-name], [data-col="member"] .truncate')].filter(
        visible
      )
      return {
        text: r.innerText.replace(/\s+/g, ' '),
        status: statuses,
        cut: lines
          .filter((el) => el.scrollWidth > el.clientWidth + 0.5 && !el.matches('.text-\\[11px\\]'))
          .map((el) => el.textContent),
        titled: lines.every((el) => el.title === el.textContent),
        foldedAccess: [...r.querySelectorAll('[data-col="member"] .text-\\[11px\\]')].some(visible),
        badgeLine: [...r.querySelectorAll('[data-col="member"] [data-status]')].some(visible),
        spill: [...r.children].filter((c) => visible(c) && c.scrollWidth > c.clientWidth + 0.5).length
      }
    })
    const invite = [...frame.querySelectorAll('button')].find((b) => b.title === 'Invite member')
    return {
      cols,
      rows: perRow,
      scroll: { wrap: wrap.scrollWidth - wrap.clientWidth, frame: frame.scrollWidth - frame.clientWidth },
      memberWidth: ths[0].getBoundingClientRect().width,
      tableWidth: table.getBoundingClientRect().width,
      inviteWidth: invite ? invite.getBoundingClientRect().width : null
    }
  })

for (const [id, seats, me, role, roomAt720] of CASES) {
  test(`case ${id}: every tier holds its layout rules`, async () => {
    for (const width of WIDTHS) {
      await show(seats, me, role, width)
      const m = await measure()
      const where = `case ${id} at ${width}px`
      report.push(
        `${where}: table ${m.tableWidth.toFixed(0)}, member ${m.memberWidth.toFixed(0)}, ` +
          m.cols
            .filter((c) => c.shown && c.header !== 'Member')
            .map((c) => `${c.header} ${c.width.toFixed(0)}`)
            .join(', ') +
          (m.rows.some((r) => r.cut.length) ? ` · cut: ${m.rows.flatMap((r) => r.cut).join(' | ')}` : '')
      )

      assert.ok(
        m.scroll.wrap <= 0 && m.scroll.frame <= 0,
        `${where}: no sideways scroll ${JSON.stringify(m.scroll)}`
      )
      for (const r of m.rows) {
        assert.equal(r.status.length, 1, `${where}: one visible status badge in "${r.text}"`)
        assert.equal(r.spill, 0, `${where}: no cell content spills out of its cell in "${r.text}"`)
        assert.ok(r.titled, `${where}: every name/email line carries its full text as a title`)
        assert.ok(r.foldedAccess, `${where}: the access line sits under the email at every width`)
        assert.equal(r.badgeLine, width < 560, `${where}: Role and Status fold under the name only < 560px`)
      }
      for (const c of m.cols) {
        if (c.align)
          assert.ok(
            Math.abs(c.align.th - c.align.td) <= 1,
            `${where}: header ${c.header} lines up ${JSON.stringify(c.align)}`
          )
        if (c.shown && c.header !== 'Member')
          assert.ok(
            c.slack <= 1,
            `${where}: ${c.header} is only as wide as its content (slack ${c.slack.toFixed(1)}px)`
          )
      }

      const shown = Object.fromEntries(m.cols.map((c) => [c.header, c.shown]))
      assert.equal(
        shown['(actions)'] ?? false,
        role === 'owner',
        `${where}: actions column follows the viewer's role`
      )
      assert.equal(shown.Access ?? false, false, `${where}: there is no Access column`)
      assert.equal(shown.Role, width >= 560, `${where}: Role is a column only at ≥ 560px`)
      assert.equal(shown.Status, width >= 560, `${where}: Status is a column only at ≥ 560px`)
      if (role === 'owner')
        assert.equal(
          m.inviteWidth !== null && m.inviteWidth < 40,
          width < 560,
          `${where}: Invite member is icon-only only < 560px`
        )
      if (width === 720 && roomAt720)
        assert.deepEqual(
          m.rows.flatMap((r) => r.cut),
          [],
          `${where}: no name or email is cut while the row has room`
        )
    }
  })
}

test('case A: the lone owner reads "Active", in full, at 720px', async () => {
  await show(only, ME, 'owner', 720)
  const m = await measure()
  assert.deepEqual(m.rows[0].status, ['Active'])
  assert.match(m.rows[0].text, /akemi@example\.com \(you\)/)
  assert.deepEqual(m.rows[0].cut, [])
})

test('case C: access lines — declined reads Invited, workspace says where access came from', async () => {
  await show(statuses, ME, 'owner', 720)
  const m = await measure()
  const row = (email) => m.rows.find((r) => r.text.includes(email)).text
  assert.match(row('declined.guy@'), /Invited 5 days ago · by you/)
  assert.doesNotMatch(row('declined.guy@'), /Granted/)
  assert.match(row('ops@'), /Granted 30 days ago · from your workspace/)
  assert.doesNotMatch(row('ops@'), /From your workspace/, 'no longer a badge in Status')
  assert.match(row('hoa.pham@'), /Granted 6 days ago · by you/)
  assert.match(row('new.hire@'), /Invited 2 hours ago · by user420@example\.com/)
})

test('case D: a long email is cut only because the row is out of room', async () => {
  await show(longs, ME, 'owner', 720)
  const m = await measure()
  assert.ok(
    m.rows.some((r) => r.cut.length > 0),
    'the very long address is cut at 720px'
  )
  for (const c of m.cols.filter((c) => c.shown && c.header !== 'Member'))
    assert.ok(c.slack <= 1, `${c.header} gives Member every spare pixel (slack ${c.slack.toFixed(1)}px)`)
})

test('light panel: role chips and the Active dot can be seen, and the granter is never cut at 720px', async () => {
  await show(many, ME, 'owner', 720)
  const read = await page.evaluate(() => {
    const roster = document.querySelector('[data-team-roster]')
    const probe = document.createElement('span')
    probe.style.color = 'var(--success)'
    roster.append(probe)
    const success = getComputedStyle(probe).color
    probe.remove()
    const admin = [...roster.querySelectorAll('[class*="group/badge"]')].find(
      (b) => b.textContent.trim() === 'Editor'
    )
    const active = [...roster.querySelectorAll('[data-status]')].find(
      (b) => b.textContent.trim() === 'Active'
    )
    const dot = active.querySelector('[data-status-dot]')
    const access = [...roster.querySelectorAll('[data-col="member"] .text-\\[11px\\]')]
    return {
      dark: document.querySelector('[data-ds-dark-theme]') !== null,
      adminBorder: getComputedStyle(admin).borderTopColor,
      adminBg: getComputedStyle(admin).backgroundColor,
      activeIsBadge: active.matches('[class*="group/badge"]'),
      dotBg: dot ? getComputedStyle(dot).backgroundColor : null,
      success,
      accessCut: access.filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent)
    }
  })
  assert.equal(read.dark, false, 'the fixture page is the light theme')
  assert.match(read.adminBorder, /rgba\(0, 0, 0, 0\)|transparent/, 'Editor has no hairline outline')
  assert.doesNotMatch(read.adminBg, /rgba\(0, 0, 0, 0\)|transparent/, 'Editor is a filled chip')
  assert.equal(read.activeIsBadge, false, 'Active is a dot and a word, not an outlined badge')
  assert.equal(read.dotBg, read.success, 'the Active dot is the success colour')
  assert.deepEqual(read.accessCut, [], 'no granter address is cut while the row has room')
})

test('case F: a request for edit access costs the Member column nothing, at every width', async () => {
  const me = 'octopal.operations@example.com'
  for (const width of WIDTHS) {
    await show(fQuiet, me, 'owner', width)
    const quiet = await measure()
    await show(fAsked, me, 'owner', width)
    const asked = await measure()
    const where = `case F at ${width}px`
    assert.ok(
      asked.memberWidth >= quiet.memberWidth - 0.5,
      `${where}: Member is ${asked.memberWidth.toFixed(1)}px with the request, ${quiet.memberWidth.toFixed(1)}px without`
    )
    assert.deepEqual(
      asked.rows.flatMap((r) => r.cut),
      quiet.rows.flatMap((r) => r.cut),
      `${where}: the request cuts no name or email that was whole without it`
    )
    // The request is still said and still answerable on the row that asked.
    const row = asked.rows.find((r) => r.text.includes('dana+tom@'))
    assert.match(row.text, /Asked for edit access/, `${where}: the request is named`)
    assert.match(row.text, /Approve/, `${where}: Approve is on the row`)
    assert.match(row.text, /Decline/, `${where}: Decline is on the row`)
  }
})
