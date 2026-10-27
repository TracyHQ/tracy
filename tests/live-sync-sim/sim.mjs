#!/usr/bin/env node
/**
 * Sync from live, simulated end to end on the local stack (docs/references/running-tracy-locally.md):
 *
 *   1. a Joomla site built on the stack plays the customer's LIVE site (it carries Claude Cowork);
 *   2. it is brought in with the real Import flow — `POST /api/sites {origin:'import'}`, the add-site
 *      host's `start` with the live site's Cowork token (the "paste the code" road), `status`, then
 *      `provision` — which builds the COPY Tracy works on, with a Cowork token of its own;
 *   3. each scenario then changes the live site as a customer would (SQL, files, configuration) and
 *      the copy as Tracy would (the Apply door, files), presses Sync, and checks the copy's database,
 *      files and rendered page against what the scenario expects.
 *
 *   node tests/live-sync-sim/sim.mjs [--only S3,S4] [--keep] [--shots <dir>]
 *
 * Writes `<shots>/report.json` and one picture of the live site and the copy per scenario. The two
 * sites stay (`--keep`) for the screenshot pass of the Sync button (`ui.mjs`). Nothing here talks to
 * a site except through the stack's own doors or the site's own containers.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { get as httpGet } from 'node:http'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = process.env.SIM_ORIGIN ?? 'http://tracy.test:51710'
const OWNER = process.env.SIM_OWNER ?? 'owner@livesync.test'
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const ONLY = value('--only', '').split(',').filter(Boolean)
const SHOTS = value('--shots', `${process.env.HOME}/TCH-local/live-sync/sim-shots`)
const STATE = `${SHOTS}/state.json`
mkdirSync(SHOTS, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Every value a run writes carries this run's tag, so a second run on the same two sites changes
// something again (the same title written twice is no change, and a username twice is refused).
const T = value('--tag', Date.now().toString(36).slice(-5))
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', maxBuffer: 1 << 26 }).trim()

// ── the stack's doors ─────────────────────────────────────────────────────────────────────────
const cookie = `tracy_sess=${docker(
  'exec',
  'tracy-tracy-web-1',
  'node',
  '-e',
  `import('/opt/tracy-web/src/lib/session.js').then(async (m) => console.log(await m.mintSession(${JSON.stringify(OWNER)}, process.env.SESSION_SECRET)))`
)}`

// The cookies a browser would hold: the session, and what dsh's own page hands out (`/new/` sets
// the dsh grant the add-site doors under `/new/api/…` need).
const jar = new Map([['tracy_sess', cookie.slice('tracy_sess='.length)]])
const cookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
function keep(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';')
    const at = pair.indexOf('=')
    jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
  }
}
async function open(path) {
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(`${ORIGIN}${path}`, { headers: { cookie: cookies() }, redirect: 'manual' })
    keep(res)
    await res.arrayBuffer()
    if (res.status < 300 || res.status >= 400) return res.status
    path = res.headers.get('location') ?? path
  }
}

async function call(method, path, json, extra) {
  // A dropped connection is asked again (a long import's status poll met one, 20/10/2026); an
  // answer, whatever its status, is not.
  for (let attempt = 1; ; attempt++) {
    try {
      return await callOnce(method, path, json, extra)
    } catch (error) {
      if (attempt >= 5) throw error
      await sleep(2000 * attempt)
    }
  }
}

async function callOnce(method, path, json, extra = {}) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      cookie: cookies(),
      origin: ORIGIN,
      accept: 'application/json',
      ...(json ? { 'content-type': 'application/json' } : {}),
      ...extra
    },
    body: json ? JSON.stringify(json) : undefined,
    redirect: 'manual'
  })
  keep(res)
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 300) }
  }
  return { status: res.status, body }
}

async function waitJob(siteKey, jobId, budgetMs = 20 * 60_000) {
  const until = Date.now() + budgetMs
  let last = null
  while (Date.now() < until) {
    const { body } = await call('GET', `/api/sites/${encodeURIComponent(siteKey)}/jobs/${jobId}`)
    if (body?.step && body.step !== last) console.log(`   … ${body.step}`)
    last = body?.step ?? last
    if (body?.state === 'done' || body?.state === 'failed') return body
    await sleep(3000)
  }
  throw new Error(`job ${jobId} of ${siteKey} did not end`)
}

// ── the two sites' own containers ─────────────────────────────────────────────────────────────
const sql = (label, script) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      `${label}-db-1`,
      'sh',
      '-c',
      'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -N -B joomla'
    ],
    {
      input: script,
      encoding: 'utf8'
    }
  ).trim()
const rows = (label, query) =>
  sql(label, query)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))
const prefixOf = (label) =>
  docker(
    'exec',
    `${label}-web-1`,
    'sh',
    '-c',
    'grep -oE "dbprefix *= *\'[a-zA-Z0-9_]+" configuration.php | grep -oE "[a-zA-Z0-9_]+$"'
  )
const readFile = (label, path) => docker('exec', `${label}-web-1`, 'cat', path)
const writeFile = (label, path, body) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      '-u',
      'www-data',
      `${label}-web-1`,
      'sh',
      '-c',
      `mkdir -p "$(dirname '${path}')" && cat > '${path}'`
    ],
    { input: body }
  )
const page = async (label) => (await fetch(`http://${label}.tracy.test:51710/`)).text()

/** Joomla's own way to make an article: asset, article, featured, workflow. Answers its id. */
function newArticle(label, title, text) {
  const p = prefixOf(label)
  return sql(
    label,
    `INSERT INTO ${p}assets (parent_id, lft, rgt, level, name, title, rules)
       SELECT id, 0, 0, 2, CONCAT('tmp-', UUID()), ${q(title)}, '{}' FROM ${p}assets WHERE name = 'com_content.category.2';
     SET @asset = LAST_INSERT_ID();
     INSERT INTO ${p}content (asset_id, title, alias, introtext, \`fulltext\`, state, catid, created, created_by, modified, publish_up,
       featured, access, language, metakey, metadesc, metadata, attribs, urls, images, note, version, hits)
       VALUES (@asset, ${q(title)}, ${q(title.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}, ${q(text)}, '', 1, 2, NOW(),
       (SELECT id FROM ${p}users ORDER BY id LIMIT 1), NOW(), NOW(), 1, 1, '*', '', '', '{}', '{}', '{}', '{}', '', 1, 0);
     SET @id = LAST_INSERT_ID();
     UPDATE ${p}assets SET name = CONCAT('com_content.article.', @id) WHERE id = @asset;
     INSERT INTO ${p}content_frontpage (content_id, ordering) VALUES (@id, 0);
     INSERT INTO ${p}workflow_associations (item_id, stage_id, extension) VALUES (@id, 1, 'com_content.article');
     SELECT @id;`
  )
}
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
/** The next number of `table` made the same on both sites: the clash a scenario is about. */
function sameNext(L, C, table) {
  const next = Math.max(
    ...[L, C].map((label) =>
      Number(sql(label, `SELECT COALESCE(MAX(id), 0) + 1 FROM ${prefixOf(label)}${table}`))
    )
  )
  for (const label of [L, C]) sql(label, `ALTER TABLE ${prefixOf(label)}${table} AUTO_INCREMENT = ${next}`)
  return next
}
/**
 * A row put last under the root of a nested-set table, as Joomla's own `store()` does: the root's
 * right edge moves by two and the row takes the gap. `values` names the other columns.
 */
function nestedLast(label, table, values) {
  const p = prefixOf(label)
  const cols = Object.keys(values)
  return sql(
    label,
    `SELECT rgt INTO @r FROM ${p}${table} WHERE id = 1;
     UPDATE ${p}${table} SET rgt = rgt + 2 WHERE id = 1;
     INSERT INTO ${p}${table} (parent_id, level, lft, rgt, ${cols.join(', ')}) VALUES (1, 1, @r, @r + 1, ${cols.map((c) => values[c]).join(', ')});
     SELECT LAST_INSERT_ID();`
  )
}
function menuItem(label, title, link) {
  const p = prefixOf(label)
  const component = sql(
    label,
    `SELECT extension_id FROM ${p}extensions WHERE element = 'com_content' AND type = 'component'`
  )
  return nestedLast(label, 'menu', {
    menutype: q('mainmenu'),
    title: q(title),
    alias: q(slug(title)),
    path: q(slug(title)),
    link: q(link),
    type: q('component'),
    published: 1,
    component_id: component,
    access: 1,
    img: q(''),
    params: q('{}'),
    language: q('*'),
    client_id: 0,
    home: 0
  })
}
function customModule(label, title, html) {
  const p = prefixOf(label)
  return sql(
    label,
    `INSERT INTO ${p}modules (asset_id, title, note, content, ordering, position, published, module, access, showtitle, params, client_id, language)
       VALUES (0, ${q(title)}, '', ${q(html)}, 9, 'sidebar-right', 1, 'mod_custom', 1, 1, '{}', 0, '*');
     SET @m = LAST_INSERT_ID();
     INSERT INTO ${p}modules_menu (moduleid, menuid) VALUES (@m, 0);
     SELECT @m;`
  )
}
/** Every row of a nested-set table inside its parent, no two edges equal, the root spanning all. */
function nestedSound(label, table) {
  const p = prefixOf(label)
  const [[n, rootRgt, edges, distinct, outside]] = rows(
    label,
    `SELECT (SELECT COUNT(*) FROM ${p}${table}), (SELECT rgt FROM ${p}${table} WHERE id = 1),
            (SELECT COUNT(*) * 2 FROM ${p}${table}),
            (SELECT COUNT(DISTINCT e) FROM (SELECT lft e FROM ${p}${table} UNION ALL SELECT rgt FROM ${p}${table}) x),
            (SELECT COUNT(*) FROM ${p}${table} c JOIN ${p}${table} r ON r.id = c.parent_id WHERE c.id <> 1 AND NOT (c.lft > r.lft AND c.rgt < r.rgt))`
  )
  return Number(rootRgt) === 2 * Number(n) - 1 && edges === distinct && outside === '0'
}

// ── setup: the live site, and its import ──────────────────────────────────────────────────────
async function setup() {
  let saved = {}
  try {
    saved = JSON.parse(readFileSync(STATE, 'utf8'))
  } catch {
    /* first run */
  }
  if (saved.copy) return saved
  const tag = saved.tag ?? Date.now().toString(36).slice(-5)
  let live = saved.live
  if (!live) {
    console.log('== live site: a Joomla site built on the stack')
    const made = await call('POST', '/api/sites', {
      label: `simlive${tag}`,
      platform: 'joomla',
      buildId: crypto.randomUUID()
    })
    if (made.status !== 202) throw new Error(`create live: ${made.status} ${JSON.stringify(made.body)}`)
    live = { siteKey: made.body.siteKey, label: made.body.siteKey.split('.')[0] }
    const built = await waitJob(live.siteKey, made.body.jobId)
    if (built.state !== 'done') throw new Error(`live build failed: ${JSON.stringify(built).slice(0, 400)}`)
    writeFileSync(STATE, JSON.stringify({ live, tag }, null, 2))
  }
  // A hosting with room for the Claude Cowork package (≈53 MB): at PHP's default 128M Joomla's
  // installer runs out of memory reading it and the wizard answers install_failed (measured 20/10).
  spawnSync('docker', [
    'exec',
    `${live.label}-web-1`,
    'sh',
    '-c',
    'echo "memory_limit=512M" > /usr/local/etc/php/conf.d/zz-sim-live.ini && apachectl -k graceful'
  ])
  // The customer's own Super User, as a customer has one: the import signs in with it and installs
  // Claude Cowork itself, the way the wizard does for a customer who types an admin login.
  const password = 'Sim-Live-Owner-2026!'
  spawnSync('docker', [
    'exec',
    '-u',
    'www-data',
    `${live.label}-web-1`,
    'php',
    'cli/joomla.php',
    'user:add',
    '--username=owner',
    '--name=Shop Owner',
    `--password=${password}`,
    '--email=owner@lantern.example',
    '--usergroup=Super Users',
    '-n'
  ])
  // The same address a browser uses: tracy-dsh and tracy-host reach `<label>.tracy.test:51710` too
  // (measured 20/10/2026; docs/references/running-tracy-locally.md still says :8080, which no longer answers).
  const adminUrl = `http://${live.label}.tracy.test:51710/administrator/`

  console.log('== import: the real Import flow — admin sign-in, Claude Cowork installed by the wizard')
  // A new name per import: a copy that failed stays (the delete door removes it), so a retry
  // cannot claim the same name again.
  const siteKey = `lantern-${tag}-${Date.now().toString(36).slice(-4)}.example`
  const claim = await call('POST', '/api/sites', { origin: 'import', siteKey, platform: 'joomla' })
  if (![200, 201, 202].includes(claim.status))
    throw new Error(`claim: ${claim.status} ${JSON.stringify(claim.body)}`)
  const base = process.env.SIM_DSH_BASE ?? '/new'
  await open(`${base}/`)
  const start = await call('POST', `${base}/api/tracy-add-site/start`, {
    siteKey,
    platform: 'joomla',
    adminUrl,
    username: 'owner',
    password
  })
  if (start.status >= 300) throw new Error(`start: ${start.status} ${JSON.stringify(start.body)}`)
  let run = { state: 'running', id: start.body.runId ?? start.body.id }
  while (run.state === 'running') {
    await sleep(2000)
    run = (await call('POST', `${base}/api/tracy-add-site/status`, { runId: run.id })).body
    console.log(`   … ${run.step} ${JSON.stringify(run.detail ?? {})}`)
  }
  if (run.state !== 'done') throw new Error(`import read failed: ${JSON.stringify(run)}`)
  const prov = await call('POST', `/api/sites/${encodeURIComponent(siteKey)}/provision`, {
    platform: 'joomla',
    ...run.result
  })
  if (prov.status !== 202) throw new Error(`provision: ${prov.status} ${JSON.stringify(prov.body)}`)
  const done = await waitJob(siteKey, prov.body.jobId)
  if (done.state !== 'done') throw new Error(`copy build failed: ${JSON.stringify(done).slice(0, 400)}`)
  const label = (await call('GET', '/api/sites')).body.sites
    .find((s) => s.siteKey === siteKey)
    .folder.split('/')
    .pop()
  const state = { live, copy: { siteKey, label }, tag }
  writeFileSync(STATE, JSON.stringify(state, null, 2))
  return state
}

// ── one sync, through the door the button calls ───────────────────────────────────────────────
async function sync(siteKey, during) {
  // A press within 90 s of the agent's last write meets its write lease (SYNC_SITE_BUSY), and a
  // person presses again a little later: so does this, for up to three minutes.
  let started
  for (let i = 0; ; i++) {
    started = await call('POST', `/api/sites/${encodeURIComponent(siteKey)}/sync`)
    if (started.body?.code !== 'SYNC_SITE_BUSY' || i >= 12) break
    await sleep(15_000)
  }
  if (started.status !== 202) return { refused: started }
  // What a scenario does while the sync runs (an agent writing, say), once.
  if (during) await during()
  // A read that answers no row (a busy machine's 502/504, a page instead of JSON) is read again; a
  // run of them is the failure, said with what answered.
  for (let misses = 0; ; ) {
    await sleep(2500)
    const { status, body } = await call('GET', `/api/sites/${encodeURIComponent(siteKey)}/sync`)
    if (!body?.sync) {
      if (++misses >= 40)
        throw new Error(`the sync door answered ${status} ${JSON.stringify(body).slice(0, 200)}`)
      continue
    }
    misses = 0
    if (body.sync.state !== 'running') return body.sync
  }
}

async function shot(url, file) {
  const require = createRequire(
    join(fileURLToPath(new URL('../../', import.meta.url)), 'apps/tracy-host/package.json')
  )
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] })
  const p = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.screenshot({ path: file, fullPage: true })
  await browser.close()
}

// ── the handover ZIP, through the doors the Export button calls ───────────────────────────────
/**
 * What "Export site as ZIP" hands the customer, fetched the way the dialog fetches it
 * (`export-backup.ts`): a fresh backup, its export, the code mailed to the Owner (read from the
 * local stack's mail preview in tracy-web's log), the download link, the bytes. Unpacked under
 * `<shots>/zip-<tag>/`.
 */
async function handoverZip(siteKey) {
  const base = `/api/sites/${encodeURIComponent(siteKey)}`
  const before = Number((await call('GET', `${base}/backups`)).body?.latest?.version ?? 0)
  let version = 0
  const made = await call('POST', `${base}/backup`, {
    title: `Handover (simulator ${T})`,
    includeLarge: true
  })
  if (made.status === 202 && made.body?.code === 'BACKUP_PENDING') {
    for (let i = 0; i < 400 && !(version > before); i++) {
      await sleep(3000)
      version = Number((await call('GET', `${base}/backups`)).body?.latest?.version ?? 0)
    }
  } else version = Number(made.body?.version)
  if (!(version > before)) throw new Error(`no fresh backup: ${JSON.stringify(made).slice(0, 300)}`)
  const asked = await call('POST', `${base}/backups/${version}/export`, { includeLarge: true })
  if (asked.status !== 202) throw new Error(`export refused: ${JSON.stringify(asked).slice(0, 300)}`)
  const id = asked.body.exportId
  let state = asked.body.state
  let installCode = null
  for (let i = 0; i < 600 && !['ready', 'failed'].includes(state); i++) {
    await sleep(3000)
    const status = (await call('GET', `${base}/backups/${version}/export/${id}`)).body
    state = status?.state
    installCode = status?.installCode ?? installCode
  }
  if (state !== 'ready') throw new Error(`export ${state}`)
  const since = new Date(Date.now() - 2000).toISOString()
  const coded = await call('POST', `${base}/backups/${version}/export/${id}/code`)
  if (coded.status !== 202) throw new Error(`code refused: ${JSON.stringify(coded).slice(0, 300)}`)
  await sleep(1500)
  const log = execFileSync('docker', ['logs', '--since', since, 'tracy-tracy-web-1'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1 << 26
  })
  const mailed = log.split(`[mail] to=${OWNER}`).at(-1)
  const code = /\b(\d{6})\b/.exec(mailed ?? '')?.[1]
  if (!code) throw new Error('no download code in the mail preview')
  const issued = await call('POST', `${base}/backups/${version}/export/${id}/download`, {
    challengeId: coded.body.challengeId,
    code
  })
  if (!issued.body?.url) throw new Error(`no link: ${JSON.stringify(issued).slice(0, 300)}`)
  const bytes = await download(issued.body.url)
  const dir = join(SHOTS, `zip-${T}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.zip'), bytes)
  execFileSync('unzip', ['-q', '-o', join(dir, 'package.zip'), '-d', join(dir, 'unzipped')])
  // The package (#1473): installer.php, index.html, README.md and one `tracy-package-<random>/`
  // holding webroot.tar, db.sql.gz and their sums.
  const pkg = readdirSync(join(dir, 'unzipped')).find((n) => n.startsWith('tracy-package-'))
  return {
    dir,
    version,
    installCode,
    pkg: pkg ? join(dir, 'unzipped', pkg) : null,
    entries: execFileSync('unzip', ['-Z1', join(dir, 'package.zip')], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  }
}

/**
 * The package's bytes. The local stack signs store links for `host.docker.internal:51740`, a name
 * only containers know: the Mac connects to 127.0.0.1 with that name in Host, which the signature
 * covers, and the link is used unchanged.
 */
function download(link) {
  const url = new URL(link)
  const local = url.hostname === 'host.docker.internal'
  return new Promise((resolve, reject) => {
    httpGet(
      {
        hostname: local ? '127.0.0.1' : url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        headers: { host: url.host }
      },
      (res) => {
        if (res.statusCode !== 200) return reject(new Error(`download ${res.statusCode}`))
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      }
    ).on('error', reject)
  })
}

/**
 * The README's installer, as a customer runs it, on hosting Tracy has never touched: the ZIP
 * unpacked into the empty web folder of the official Joomla image (its entrypoint left out — it
 * would install a new site), an empty MariaDB beside it, `installer.php` opened in a browser, the
 * database filled in, the address confirmed, Install pressed (the install code typed when the
 * installer asks: the database is another container, so another server). Then the site's pages.
 */
async function runClean(zip, articleIds = []) {
  const name = `simzip-${T}`
  const sh = (...a) => spawnSync('docker', a, { encoding: 'utf8' })
  sh('rm', '-f', `${name}-web`, `${name}-db`)
  sh('network', 'rm', name)
  docker('network', 'create', name)
  const web = join(zip.dir, 'web')
  rmSync(web, { recursive: true, force: true })
  cpSync(join(zip.dir, 'unzipped'), web, { recursive: true })
  execFileSync('chmod', ['-R', 'a+rwX', web])
  const require = createRequire(
    join(fileURLToPath(new URL('../../', import.meta.url)), 'apps/tracy-host/package.json')
  )
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ args: ['--proxy-server=direct://', '--proxy-bypass-list=*'] })
  try {
    docker(
      'run',
      '-d',
      '--name',
      `${name}-db`,
      '--network',
      name,
      '--network-alias',
      'db',
      '-e',
      'MARIADB_ROOT_PASSWORD=clean',
      '-e',
      'MARIADB_DATABASE=site',
      'mariadb:11'
    )
    for (
      let i = 0;
      i < 60 && sh('exec', `${name}-db`, 'mariadb', '-uroot', '-pclean', '-e', 'select 1').status !== 0;
      i++
    )
      await sleep(1000)
    docker(
      'run',
      '-d',
      '--name',
      `${name}-web`,
      '--network',
      name,
      '-v',
      `${web}:/var/www/html`,
      '-p',
      '127.0.0.1::80',
      '--entrypoint',
      'apache2-foreground',
      'joomla:6-apache'
    )
    const port = docker('port', `${name}-web`, '80').split(':').pop()
    const origin = `http://127.0.0.1:${port}`
    for (
      let i = 0;
      i < 30 &&
      !(await fetch(`${origin}/installer.php`)
        .then((r) => r.ok)
        .catch(() => false));
      i++
    )
      await sleep(1000)
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
    await page.goto(`${origin}/installer.php`, { waitUntil: 'networkidle' })
    await page.fill('#db_host', 'db')
    await page.fill('#db_name', 'site')
    await page.fill('#db_user', 'root')
    await page.fill('#db_password', 'clean')
    await page.check('input[name="confirm"]')
    if (
      await page
        .locator('#install_code')
        .isVisible()
        .catch(() => false)
    )
      await page.fill('#install_code', zip.installCode ?? '')
    await page.screenshot({ path: join(SHOTS, 'S13-installer-form.png'), fullPage: true })
    await page.click('#go')
    // Done when the installer links to the admin area; its own words otherwise, for the report.
    const done = await page
      .locator('a[href*="/administrator"]')
      .first()
      .waitFor({ timeout: 20 * 60_000 })
      .then(() => true)
      .catch(() => false)
    await page.screenshot({ path: join(SHOTS, 'S13-installer-done.png'), fullPage: true })
    zip.installerSaid = done
      ? 'done'
      : (
          await page
            .locator('body')
            .innerText()
            .catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 300)
    const home = await fetch(`${origin}/`)
      .then(async (r) => ({ status: r.status, text: await r.text() }))
      .catch(() => ({ status: 0, text: '' }))
    const admin = await fetch(`${origin}/administrator/`)
      .then((r) => r.status)
      .catch(() => 0)
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' }).catch(() => {})
    await page.screenshot({ path: join(SHOTS, 'S13-zip-on-clean-host.png'), fullPage: true })
    const css = await fetch(`${origin}/${CSS}`)
      .then((r) => r.text())
      .catch(() => '')
    // Each article on its own page: the home page lists only the newest featured ones.
    const articles = {}
    for (const id of articleIds)
      articles[id] = await fetch(`${origin}/index.php?option=com_content&view=article&id=${id}`)
        .then((r) => r.text())
        .catch(() => '')
    const left = readdirSync(web).filter((n) => n === 'installer.php' || n.startsWith('tracy-package-'))
    return { done, home, admin, css, articles, left }
  } finally {
    await browser.close()
    sh('rm', '-f', `${name}-web`, `${name}-db`)
    sh('network', 'rm', name)
  }
}

// ── the scenarios, in order: each builds on the state the one before left ────────────────────
const CSS = 'media/templates/site/cassiopeia/css/user.css'
const cssLines = (edits = {}) =>
  Array.from({ length: 24 }, (_, i) => edits[i] ?? `/* line ${i} */`).join('\n') + '\n'
/** The file as it is on the site, with only the lines `edits` names changed — as a person edits. */
function editLines(label, path, edits) {
  let lines
  try {
    lines = readFile(label, path).split('\n')
  } catch {
    lines = cssLines().split('\n')
  }
  while (lines.length < 25) lines.push(`/* line ${lines.length} */`)
  const { append, ...at } = edits
  for (const [i, text] of Object.entries(at)) lines[Number(i)] = text
  const body = lines.join('\n').replace(/\n*$/, '\n')
  writeFile(label, path, append ? `${body}${append}\n` : body)
}

function scenarios(s) {
  const L = s.live.label
  const C = s.copy.label
  const lp = () => prefixOf(L)
  const cp = () => prefixOf(C)
  // The Apply door as the agent calls it: one apply_id per request, the conversation's session.
  const apply = (fields, id) =>
    call(
      'POST',
      `/api/sites/${encodeURIComponent(s.copy.siteKey)}/apply`,
      {
        action: 'content.update',
        params: { apply_id: `sim-${T}-${Date.now()}`, kind: 'article', id, fields }
      },
      { 'x-tracy-session': `sim-agent-${T}` }
    )
  return [
    {
      id: 'S1',
      title: 'Customer adds an article and edits another on the live site; both come over',
      async live() {
        s.liveNew = newArticle(L, `Spring sale ${T}`, '<p>All beans 10% off.</p>')
        const first = rows(L, `SELECT id FROM ${lp()}content ORDER BY id LIMIT 1`)[0][0]
        s.firstId = first
        sql(
          L,
          `UPDATE ${lp()}content SET introtext = '<p>Edited by the customer on the live site (${T}).</p>' WHERE id = ${first}`
        )
      },
      async expect(answer) {
        return [
          [answer.state === 'applied', `state ${answer.state}`],
          [
            rows(C, `SELECT COUNT(*) FROM ${cp()}content WHERE title = 'Spring sale ${T}'`)[0][0] === '1',
            'Spring sale on the copy'
          ],
          [(await page(C)).includes(`Spring sale ${T}`), 'Spring sale on the copy’s home page'],
          [
            rows(C, `SELECT introtext FROM ${cp()}content WHERE id = ${s.firstId}`)[0][0].includes(
              `Edited by the customer on the live site (${T})`
            ),
            'the edit came over'
          ]
        ]
      }
    },
    {
      id: 'S2',
      title:
        'Tracy edits an article title on the copy (Apply door); a sync with nothing new on the live site keeps it',
      async copy() {
        const res = await apply({ title: `Our house blend — by Tracy ${T}` }, Number(s.firstId))
        s.applyStatus = res.status
        s.applyOk = res.body?.ok === true
        s.applyWrote =
          rows(C, `SELECT title FROM ${cp()}content WHERE id = ${s.firstId}`)[0][0] ===
          `Our house blend — by Tracy ${T}`
      },
      async expect(answer) {
        return [
          [s.applyStatus === 200 && s.applyOk, `Apply answered ${s.applyStatus} ok=${s.applyOk}`],
          [s.applyWrote, 'Apply wrote the copy before the sync'],
          [answer.state === 'applied', `state ${answer.state}`],
          [
            rows(C, `SELECT title FROM ${cp()}content WHERE id = ${s.firstId}`)[0][0] ===
              `Our house blend — by Tracy ${T}`,
            'Tracy’s title stays'
          ]
        ]
      }
    },
    {
      id: 'S3',
      title: 'Both change the same title: Tracy’s stays, and the sync lists the place with the live value',
      async live() {
        sql(L, `UPDATE ${lp()}content SET title = 'House blend (customer ${T})' WHERE id = ${s.firstId}`)
      },
      async expect(answer) {
        const kept = (answer.kept ?? []).find((k) => k.column === 'title')
        return [
          [answer.state === 'applied', `state ${answer.state}`],
          [
            rows(C, `SELECT title FROM ${cp()}content WHERE id = ${s.firstId}`)[0][0] ===
              `Our house blend — by Tracy ${T}`,
            'Tracy’s title kept'
          ],
          [kept?.values?.theirs?.title?.text === `House blend (customer ${T})`, 'kept lists the live value']
        ]
      }
    },
    {
      id: 'S4',
      title:
        'Both create a new article (same AUTO_INCREMENT number): both end up on the copy, the customer’s under a new number',
      async copy() {
        // Both tables' next number made the same, as on the day of the import: the clash this
        // scenario is about, also on a second run (the first one's renumbering moved them apart).
        const next = Math.max(
          ...[
            [L, lp()],
            [C, cp()]
          ].map(([label, p]) => Number(sql(label, `SELECT COALESCE(MAX(id), 0) + 1 FROM ${p}content`)))
        )
        sql(L, `ALTER TABLE ${lp()}content AUTO_INCREMENT = ${next}`)
        sql(C, `ALTER TABLE ${cp()}content AUTO_INCREMENT = ${next}`)
        s.copyNew = newArticle(C, `Tracy picks: autumn ${T}`, '<p>Written by Tracy on the copy.</p>')
      },
      async live() {
        s.liveNew2 = newArticle(L, `Latte art class ${T}`, '<p>Saturday 10:00.</p>')
      },
      async expect(answer) {
        const titles = rows(C, `SELECT title FROM ${cp()}content`).map((r) => r[0])
        const latte = rows(
          C,
          `SELECT id, asset_id FROM ${cp()}content WHERE title = 'Latte art class ${T}'`
        )[0]
        const assetName = latte
          ? rows(C, `SELECT name FROM ${cp()}assets WHERE id = ${latte[1]}`)[0]?.[0]
          : null
        const html = await page(C)
        return [
          [s.copyNew === s.liveNew2, `same number on both sides (${s.copyNew} / ${s.liveNew2})`],
          [answer.state === 'applied', `state ${answer.state}`],
          [
            titles.includes(`Tracy picks: autumn ${T}`) && titles.includes(`Latte art class ${T}`),
            'both articles on the copy'
          ],
          [latte && latte[0] !== s.copyNew, `customer’s article renumbered (${latte?.[0]})`],
          [assetName === `com_content.article.${latte?.[0]}`, `its asset follows (${assetName})`],
          [
            html.includes(`Latte art class ${T}`) && html.includes(`Tracy picks: autumn ${T}`),
            'both on the home page'
          ],
          [
            (answer.summary?.renumbered ?? []).some((r) => /content/.test(r.table ?? JSON.stringify(r))),
            'the renumbering is reported'
          ]
        ]
      }
    },
    {
      id: 'S5',
      title: 'The customer edits that renumbered article on the live site: the edit lands on it',
      async live() {
        sql(
          L,
          `UPDATE ${lp()}content SET title = 'Latte art class ${T} — 2 seats left' WHERE id = ${s.liveNew2}`
        )
      },
      // The agent writes while the sync runs: the site's write lease is the sync's.
      async during() {
        const res = await apply({ title: `Written during the sync ${T}` }, Number(s.copyNew))
        s.duringCode = res.body?.code ?? (res.body?.ok ? 'WROTE' : res.status)
      },
      async expect(answer) {
        return [
          [s.duringCode === 'SITE_BUSY', `an agent write during the sync is refused (${s.duringCode})`],
          [answer.state === 'applied', `state ${answer.state}`],
          [
            rows(
              C,
              `SELECT COUNT(*) FROM ${cp()}content WHERE title = 'Latte art class ${T} — 2 seats left'`
            )[0][0] === '1',
            'edit came over'
          ],
          [
            rows(C, `SELECT title FROM ${cp()}content WHERE id = ${s.copyNew}`)[0][0] ===
              `Tracy picks: autumn ${T}`,
            'Tracy’s article untouched'
          ]
        ]
      }
    },
    {
      id: 'S6',
      title:
        'Both edit the template CSS and both add a rule at its end: the line both changed stays Tracy’s, both added rules stay',
      async copy() {
        editLines(C, CSS, {
          3: `.container-header { background: #bf5b3d !important; } /* Tracy ${T} */`,
          append: `.site-grid { gap: 2rem; } /* Tracy ${T} */`
        })
      },
      async live() {
        editLines(L, CSS, {
          3: `.container-header { background: #6a1b9a !important; } /* customer ${T} */`,
          append: `.item-title a { color: #2e7d32 !important; } /* customer ${T} */`
        })
      },
      async expect(answer) {
        const css = readFile(C, CSS)
        return [
          [answer.state === 'applied', `state ${answer.state}`],
          [css.includes(`/* Tracy ${T} */`) && !css.includes('#6a1b9a'), 'the clashing line is Tracy’s'],
          [
            css.includes(`#2e7d32 !important; } /* customer ${T} */`),
            'the rule the customer added came over'
          ],
          [css.includes(`.site-grid { gap: 2rem; } /* Tracy ${T} */`), 'the rule Tracy added stays'],
          [(answer.kept ?? []).some((k) => k.path === CSS), 'kept lists the file']
        ]
      }
    },
    {
      id: 'S7',
      title:
        'The customer renames the site in configuration.php: the name comes over, the copy still serves (its database settings kept)',
      async live() {
        docker(
          'exec',
          `${L}-web-1`,
          'sh',
          '-c',
          `sed -i "s/public \\$sitename = '[^']*';/public \\$sitename = 'Lantern Coffee Roasters ${T}';/" configuration.php`
        )
      },
      async expect(answer) {
        const cfg = readFile(C, 'configuration.php')
        const res = await fetch(`http://${C}.tracy.test:51710/`)
        return [
          [answer.state === 'applied', `state ${answer.state}`],
          [cfg.includes(`$sitename = 'Lantern Coffee Roasters ${T}'`), 'site name came over'],
          [res.status === 200, `copy still serves (${res.status})`]
        ]
      }
    },
    {
      id: 'S8',
      title: 'The customer deletes an article nobody else touched: it goes on the copy too',
      async live() {
        sql(
          L,
          `DELETE FROM ${lp()}content WHERE id = ${s.liveNew}; DELETE FROM ${lp()}content_frontpage WHERE content_id = ${s.liveNew};`
        )
      },
      async expect(answer) {
        return [
          [answer.state === 'applied', `state ${answer.state}`],
          [
            rows(C, `SELECT COUNT(*) FROM ${cp()}content WHERE title = 'Spring sale ${T}'`)[0][0] === '0',
            'Spring sale gone from the copy'
          ]
        ]
      }
    },
    {
      id: 'S9',
      title: 'A visitor registers on the live site: the new user comes over with its group',
      async live() {
        sql(
          L,
          `INSERT INTO ${lp()}users (name, username, email, password, block, sendEmail, registerDate, lastvisitDate, activation, params, lastResetTime, resetCount, otpKey, otep, requireReset, authProvider)
             VALUES ('Mai Tran', 'mai${T}', 'mai${T}@example.com', '$2y$10$abcdefghijklmnopqrstuv', 0, 0, NOW(), NULL, '', '{}', NULL, 0, '', '', 0, '');
           INSERT INTO ${lp()}user_usergroup_map (user_id, group_id) VALUES (LAST_INSERT_ID(), 2);`
        )
      },
      async expect(answer) {
        return [
          [answer.state === 'applied', `state ${answer.state}`],
          [
            rows(
              C,
              `SELECT COUNT(*) FROM ${cp()}users u JOIN ${cp()}user_usergroup_map m ON m.user_id = u.id WHERE u.username = 'mai${T}' AND m.group_id = 2`
            )[0][0] === '1',
            'user and group on the copy'
          ]
        ]
      }
    },
    {
      id: 'S10',
      title:
        'The copy’s Claude Cowork token stays its own after every sync (the live one is refused by the copy)',
      async expect() {
        const ct = sql(
          C,
          `SELECT JSON_UNQUOTE(JSON_EXTRACT(params,'$.token')) FROM ${cp()}extensions WHERE element='com_claudecowork'`
        )
        const lt = sql(
          L,
          `SELECT JSON_UNQUOTE(JSON_EXTRACT(params,'$.token')) FROM ${lp()}extensions WHERE element='com_claudecowork'`
        )
        return [[ct && lt && ct !== lt, 'copy token differs from the live token']]
      },
      noSync: true
    },
    {
      id: 'S11',
      title:
        'The customer adds a category and its menu item while Tracy adds a menu item: both menus on the copy, the menu tree sound, the category page lists its article',
      async copy() {
        sameNext(L, C, 'menu')
        s.tracyMenu = menuItem(
          C,
          `Our story ${T}`,
          `index.php?option=com_content&view=article&id=${s.firstId}`
        )
      },
      async live() {
        s.liveCat = nestedLast(L, 'categories', {
          asset_id: 0,
          path: q(`events-${T}`),
          extension: q('com_content'),
          title: q(`Events ${T}`),
          alias: q(`events-${T}`),
          note: q(''),
          description: q(''),
          published: 1,
          access: 1,
          params: q('{}'),
          metadesc: q(''),
          metakey: q(''),
          metadata: q('{}'),
          created_user_id: `(SELECT id FROM ${lp()}users ORDER BY id LIMIT 1)`,
          created_time: 'NOW()',
          modified_user_id: 0,
          modified_time: 'NOW()',
          hits: 0,
          language: q('*'),
          version: 1
        })
        sql(L, `UPDATE ${lp()}content SET catid = ${s.liveCat} WHERE id = ${s.liveNew2}`)
        s.liveMenu = menuItem(L, `Events ${T}`, `index.php?option=com_content&view=category&id=${s.liveCat}`)
      },
      async expect(answer) {
        const titles = rows(C, `SELECT id, title FROM ${cp()}menu WHERE menutype = 'mainmenu'`)
        const events = titles.find((r) => r[1] === `Events ${T}`)
        const cat = rows(
          C,
          `SELECT c.title FROM ${cp()}content a JOIN ${cp()}categories c ON c.id = a.catid WHERE a.title = 'Latte art class ${T} — 2 seats left'`
        )[0]?.[0]
        const home = await page(C)
        const catPage = await fetch(`http://${C}.tracy.test:51710/index.php/events-${T}`).then(async (r) => ({
          status: r.status,
          text: await r.text()
        }))
        return [
          [s.tracyMenu === s.liveMenu, `same number on both sides (${s.tracyMenu} / ${s.liveMenu})`],
          [answer.state === 'applied', `state ${answer.state}`],
          [titles.some((r) => r[1] === `Our story ${T}`) && !!events, 'both menu items on the copy'],
          [events && events[0] !== s.tracyMenu, `the customer’s item renumbered (${events?.[0]})`],
          [nestedSound(C, 'menu') && nestedSound(C, 'categories'), 'the menu and category trees are sound'],
          [cat === `Events ${T}`, `the article sits in the customer’s category (${cat})`],
          [
            home.includes(`Our story ${T}`) && home.includes(`Events ${T}`),
            'both items in the copy’s main menu'
          ],
          [
            catPage.status === 200 && catPage.text.includes(`Latte art class ${T} — 2 seats left`),
            `the category page lists the article (${catPage.status})`
          ]
        ]
      }
    },
    {
      id: 'S12',
      title:
        'Both add a Custom module on the sidebar (same number): both show on the copy, each with its own page assignment',
      async copy() {
        sameNext(L, C, 'modules')
        s.tracyModule = customModule(C, `Tracy note ${T}`, `<p>Fresh roast every Monday (${T}).</p>`)
      },
      async live() {
        s.liveModule = customModule(L, `Opening hours ${T}`, `<p>Mon–Sat 7:00–18:00 (${T}).</p>`)
      },
      async expect(answer) {
        const mods = rows(
          C,
          `SELECT m.id, m.title, (SELECT COUNT(*) FROM ${cp()}modules_menu x WHERE x.moduleid = m.id) FROM ${cp()}modules m WHERE m.module = 'mod_custom' AND m.title IN ('Tracy note ${T}', 'Opening hours ${T}')`
        )
        const home = await page(C)
        return [
          [s.tracyModule === s.liveModule, `same number on both sides (${s.tracyModule} / ${s.liveModule})`],
          [answer.state === 'applied', `state ${answer.state}`],
          [
            mods.length === 2 && mods[0][0] !== mods[1][0],
            `both modules on the copy (${mods.map((m) => m[0]).join(', ')})`
          ],
          [mods.every((m) => m[2] === '1'), 'each keeps its page assignment'],
          [
            home.includes(`Fresh roast every Monday (${T})`) && home.includes(`Mon–Sat 7:00–18:00 (${T})`),
            'both on the copy’s home page'
          ]
        ]
      }
    },
    {
      id: 'S13',
      title:
        'The handover ZIP holds Tracy’s and the customer’s changes, nothing of the sync, and runs on a clean Joomla host',
      noSync: true,
      async expect() {
        const zip = await handoverZip(s.copy.siteKey)
        const pkg = zip.pkg
        const files = execFileSync('tar', ['-tf', join(pkg, 'webroot.tar')], {
          encoding: 'utf8',
          maxBuffer: 1 << 28
        }).split('\n')
        const dump = execFileSync('gunzip', ['-c', join(pkg, 'db.sql.gz')], {
          encoding: 'utf8',
          maxBuffer: 1 << 30
        })
        const sums = readFileSync(join(pkg, 'SHA256SUMS'), 'utf8').trim().split('\n')
        const sumsOk = sums.every((line) => {
          const [want, file] = line.split(/\s+/)
          return (
            execFileSync('shasum', ['-a', '256', join(pkg, file)], { encoding: 'utf8' }).split(' ')[0] ===
            want
          )
        })
        // What the sync keeps beside a site (its folder, the last read, the id map, the history) —
        // never inside the webroot it packs; a database dump at the top would be one too.
        const leftovers = files.filter((f) =>
          /^(\.git|sync)\/|live-base\.sql|live-manifest\.json|id-map\.json|^[^/]+\.sql(\.gz)?$/.test(
            f.replace(/^\.\//, '')
          )
        )
        const top = [
          ...new Set(zip.entries.map((e) => e.split('/')[0].replace(/^tracy-package-.*/, 'tracy-package-…')))
        ].sort()
        const cfg = execFileSync('tar', ['-xOf', join(pkg, 'webroot.tar'), './configuration.php'], {
          encoding: 'utf8'
        })
        const latteId = rows(
          C,
          `SELECT id FROM ${cp()}content WHERE title = 'Latte art class ${T} — 2 seats left'`
        )[0]?.[0]
        const tracyId = rows(
          C,
          `SELECT id FROM ${cp()}content WHERE title = 'Tracy picks: autumn ${T}'`
        )[0]?.[0]
        const ran = await runClean(zip, [latteId, tracyId].filter(Boolean))
        const text = ran.home.text
        return [
          [
            JSON.stringify(top) ===
              JSON.stringify(['README.md', 'index.html', 'installer.php', 'tracy-package-…']),
            `the ZIP is the installer and its package (${top.join(', ')})`
          ],
          [sumsOk, 'every SHA256SUMS line matches'],
          [leftovers.length === 0, `no sync leftovers in the files (${leftovers.slice(0, 5).join(', ')})`],
          [!/live-base|tracy_sync|joomla_tracy_sync/.test(dump), 'no sync scratch in the database'],
          [
            (cfg.match(/tracy-placeholder/g) ?? []).length === 4,
            'configuration.php carries the four placeholders, no database password'
          ],
          [dump.includes(`Our house blend — by Tracy ${T}`), 'Tracy’s title is in the database'],
          [
            dump.includes(`Latte art class ${T} — 2 seats left`) && dump.includes(`Tracy picks: autumn ${T}`),
            'both new articles are in the database'
          ],
          [dump.includes(`'mai${T}'`), 'the live site’s new user is in the database'],
          [ran.done, `the installer finished (${zip.installerSaid})`],
          [ran.home.status === 200, `the clean host serves the home page (${ran.home.status})`],
          [
            (ran.articles[latteId] ?? '').includes(`Latte art class ${T} — 2 seats left`) &&
              (ran.articles[tracyId] ?? '').includes(`Tracy picks: autumn ${T}`),
            `both new articles open on their pages (${latteId}, ${tracyId})`
          ],
          [!text.includes(`Spring sale ${T}`), 'the article the customer deleted is not there'],
          [text.includes(`Lantern Coffee Roasters ${T}`), 'the site name the customer set is there'],
          [
            text.includes(`Events ${T}`) && text.includes(`Our story ${T}`),
            'both menu items on its home page'
          ],
          [
            text.includes(`Fresh roast every Monday (${T})`) && text.includes(`Mon–Sat 7:00–18:00 (${T})`),
            'both modules on its home page'
          ],
          [
            ran.css.includes(`/* Tracy ${T} */`) &&
              ran.css.includes(`#2e7d32 !important; } /* customer ${T} */`) &&
              ran.css.includes(`.site-grid { gap: 2rem; } /* Tracy ${T} */`),
            'its CSS holds Tracy’s lines and the customer’s'
          ],
          [[200, 303].includes(ran.admin), `its administrator answers (${ran.admin})`],
          [ran.left.length === 0, `the installer removed itself and the package (${ran.left.join(', ')})`]
        ]
      }
    }
  ]
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────
const s = await setup()
console.log(`live ${s.live.siteKey} (${s.live.label}) → copy ${s.copy.siteKey} (${s.copy.label})`)
const report = []
for (const sc of scenarios(s)) {
  if (ONLY.length && !ONLY.includes(sc.id)) continue
  console.log(`\n== ${sc.id} ${sc.title}`)
  try {
    if (sc.copy) await sc.copy()
    if (sc.live) await sc.live()
    const answer = sc.noSync ? {} : await sync(s.copy.siteKey, sc.during)
    const checks = await sc.expect(answer)
    const pass = checks.every(([ok]) => ok)
    for (const [ok, what] of checks) console.log(`   ${ok ? '✓' : '✗'} ${what}`)
    await shot(`http://${s.live.label}.tracy.test:51710/`, join(SHOTS, `${sc.id}-live.png`))
    await shot(`http://${s.copy.label}.tracy.test:51710/`, join(SHOTS, `${sc.id}-copy.png`))
    report.push({
      id: sc.id,
      title: sc.title,
      pass,
      checks: checks.map(([ok, what]) => ({ ok, what })),
      kept: answer.kept ?? [],
      summary: answer.summary ?? null
    })
  } catch (error) {
    console.log(`   ✗ ${error.message}`)
    report.push({ id: sc.id, title: sc.title, pass: false, error: String(error.message).slice(0, 500) })
  }
  writeFileSync(join(SHOTS, 'report.json'), JSON.stringify({ state: s, report }, null, 2))
}
console.log(`\n${report.filter((r) => r.pass).length}/${report.length} scenarios pass`)
if (!flag('--keep'))
  console.log('(sites kept; --keep is the default for now — remove them with the delete door when done)')
spawnSync('true')
