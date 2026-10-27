// Run the ja-business suite on ONE site the way a customer does: restore the site to its baseline,
// open the site's workspace, press "New session", type the case's sentence, press Send, and wait
// for the agent's turn to end (read from dsh's own session log, not from the screen). Then judge
// the live site with the case's oracle and keep the session log for analysis.
//   node run3.mjs <label> <out-dir> [C01,C02,...] [--timeout-min 12] [--no-restore] [--suite cases-v3.json]
// v2: prompts carry {placeholders} from the site, a case may have several `turns` in one session
// (undo), and `asked` records whether the agent put a question to the customer.
// v5: a turn may be an object — pictures attached in the composer, files put in the Files tab, or a
// Comment pick in the Browser tab (turn-v5.mjs). String turns run exactly as before.
// v6: a case with `role` (designer|developer|writer|seo-geo) first picks that Mode in the composer, as a
// customer does, and proves the session runs `<role>-<platform>` from its own log (result.preset; else the
// case ends `RUNNER: mode …`); v6 oracle rules (style, meta, jsonLd, http, …) are judged by judgeAsync;
// `--trace` writes trace.json + trace.md (trace.mjs) next to every case. Cases without `role` run as before.
// v6 measurement fixes (EXISTING-FINDINGS §3), for every case: X1 no blind wait after a pick is sent
// (turn-v5.mjs); X4 deliveryMs across the two clocks (the dsh container's clock offset is measured per case)
// and queueMs inside dsh's own clock; X10 the site's write lease is cleared with the restore (what was held
// before: leaseBefore; held again before the first message: leaseAtStart); X11 every page an oracle read is saved under <case>/pages/<phase>/; per turn agentMs from the
// session log and runningAfterEndMs (composer still "running" after turn/end); foreign messages flagged (X2).
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  rmSync,
  existsSync
} from 'node:fs'
// Playwright is resolved from the TCH checkout's node_modules (run from a checkout that has it installed).
import { chromium } from 'playwright'
import { answerCard, skipCard, confirmCard } from './card-answer.mjs'
import { awaitsCustomer } from './v6/lib/confirm.mjs'
import { verbOf as callKind, refusalOf } from './trace.mjs'
import {
  annotatedShot,
  attachImages,
  uploadToFiles,
  pickAndSend,
  pickedBlock,
  fixturePath
} from './turn-v5.mjs'
import {
  judge,
  baselineOf,
  fill,
  missingKeys,
  judgeBudget,
  judgeAsync,
  baselineAsync,
  fetchPage as fetchLive
} from './oracle.mjs'
import { selectMode, presetFromEvents } from './v6/lib/mode.mjs'
// v7: the dsh page's chat chrome named once (selectors verified against tch b3a395cbf, v7/RUNNER-COMPAT-CHAT.md §a).
import {
  EDITOR,
  PRIMARY_SEND,
  STOP_GENERATING,
  newSessionButton,
  stopGenerating,
  ensureChatView,
  uiLine,
  uiState,
  trackPageErrors
} from './v6/lib/chat-ui.mjs'

const HERE = new URL('.', import.meta.url).pathname
const ORIGIN = 'http://tracy.test:51710'
const args = process.argv.slice(2)
const [label, OUT] = args
const only = args[2] && !args[2].startsWith('--') ? new Set(args[2].split(',')) : null
const TIMEOUT_MS =
  Number(args.includes('--timeout-min') ? args[args.indexOf('--timeout-min') + 1] : 12) * 60000
const RESTORE = !args.includes('--no-restore')
const TRACE = args.includes('--trace')
// X18 (29/09): RESTORE_LOCK=1 keeps restores apart from measured turns across every runner on this Mac — a
// restore waits for the turns in flight (on any site) to end and blocks new ones while it runs. Off by default:
// a run compared with one measured without it must use the same setting.
const RESTORE_LOCK = process.env.RESTORE_LOCK === '1'
const LOCK_DIR = process.env.RESTORE_LOCK_DIR ?? `${HERE}/.locks`
/** A v6 scripted message gets at most this many question cards answered with a confirmation (X16). */
const MAX_CARDS = 3
const SUITE = args.includes('--suite') ? args[args.indexOf('--suite') + 1] : 'cases-v3.json'
const suite = JSON.parse(readFileSync(`${HERE}/${SUITE}`, 'utf8'))
if (!suite.sites[label])
  throw new Error(`no derived baseline for ${label} in ${SUITE} — run derive.mjs first`)
const site = { ...suite.sites[label], label }
// An imported copy keeps the customer's domain as its site key (01/10/2026): the suite names it; every
// quickstart bench site keeps the label-based key, so earlier waves stay comparable.
const siteKey = typeof site.siteKey === 'string' && site.siteKey !== '' ? site.siteKey : `${label}.tracy.test`
const LANE = `/desk-home/sessions/--site-${label}--`
mkdirSync(`${OUT}/${label}`, { recursive: true })
const log = (...a) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${label} ${a.join(' ')}`
  console.log(line)
  appendFileSync(`${OUT}/${label}/run.log`, `${line}\n`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** fill() for a v5 turn object: strings anywhere inside arrays and objects get their {placeholders}. */
const fillDeep = (v) =>
  Array.isArray(v)
    ? v.map(fillDeep)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x)]))
      : fill(v, site)
const sayOf = (turn) => (typeof turn === 'string' ? turn : turn.say)
/** The one neutral reply to a question left open after the last scripted message (v5 cases carry `confirmOnce`; v3/v4 cases never do, so their runs are unchanged). */
/** How long a sent message may take to reach dsh before the runner reloads and sends it again. */
const DELIVERY_WAIT_MS = 300000
const CONFIRM = 'Mình xác nhận yêu cầu vừa rồi, cứ làm đúng như vậy, không thêm gì khác.'

/** The session log as events. The file is a live zstd stream: a torn last frame is expected. */
function events(sessionId) {
  // Bounded: an unbounded docker exec hung for 66 minutes in r1 (C10 Joomla) while the stand was
  // under load, and the case's own timeout never got a turn to fire.
  // dsh writes session format v4 since the develop of 27/09 (the event shapes the runner reads are the
  // same); v3 stays readable for sessions written by an older image (BEFORE).
  const raw = spawnSync(
    'docker',
    [
      'exec',
      'tracy-dsh',
      'sh',
      '-c',
      `cat "${LANE}/${sessionId}/session.v4.jsonl.zstd" 2>/dev/null || cat "${LANE}/${sessionId}/session.v3.jsonl.zstd"`
    ],
    {
      maxBuffer: 256 * 1024 * 1024,
      timeout: 30000
    }
  )
  if (raw.status !== 0) return { list: [], text: '' }
  const out = spawnSync('zstd', ['-dc'], { input: raw.stdout, maxBuffer: 512 * 1024 * 1024, timeout: 30000 })
  const text = out.stdout.toString('utf8')
  const list = []
  for (const line of text.split('\n')) {
    try {
      list.push(JSON.parse(line))
    } catch {}
  }
  return { list, text }
}

function textOf(node, out = []) {
  if (Array.isArray(node)) for (const n of node) textOf(n, out)
  else if (node && typeof node === 'object') {
    if (node.type === 'text' && typeof node.text === 'string') out.push(node.text)
    for (const v of Object.values(node)) if (v && typeof v === 'object') textOf(v, out)
  }
  return out
}

/** X11: a fetchPage that also saves every page it reads under <case>/pages/<phase>/ (+ index.json). */
function recorder(dir, phase) {
  const where = `${dir}/pages/${phase}`
  const index = {}
  return (l, path) => {
    const got = fetchLive(l, path)
    try {
      mkdirSync(where, { recursive: true })
      const name = (
        String(path)
          .replace(/^https?:\/\/[^/]+/, '')
          .replace(/[^A-Za-z0-9._-]+/g, '_')
          .replace(/^_+|_+$/g, '') || 'home'
      ).slice(0, 120)
      writeFileSync(`${where}/${name}.html`, got.html ?? '')
      index[path] = { file: `${name}.html`, status: got.status, ...(got.error ? { error: got.error } : {}) }
      writeFileSync(`${where}/index.json`, JSON.stringify(index, null, 1))
    } catch {}
    return got
  }
}

/** X4: the dsh container's clock minus this Mac's (docker's VM clock drifts), so a send time taken here and a
 *  turn/start stamped there can be subtracted. Uncertainty = half the round trip of the reading. */
function dshClock() {
  const t0 = Date.now()
  const r = spawnSync('docker', ['exec', 'tracy-dsh', 'date', '+%s%3N'], { encoding: 'utf8', timeout: 20000 })
  const t1 = Date.now()
  const remote = Number(String(r.stdout ?? '').trim())
  if (r.status !== 0 || !Number.isFinite(remote) || remote < 1e12) return null
  return { offsetMs: Math.round(remote - (t0 + t1) / 2), uncertaintyMs: Math.ceil((t1 - t0) / 2) }
}

/** X10: the site's write lease as tracy-web keeps it (site_write_lease, one row per site: holder_session,
 *  wrote_at; a lease frees 90 s after its holder's last write). `null` = no row or nobody holds it. */
const psql = (sql) =>
  spawnSync('docker', ['exec', 'tracy-postgres-1', 'psql', '-U', 'tracy', '-d', 'tracy', '-Atc', sql], {
    encoding: 'utf8',
    timeout: 20000
  })
function leaseOf(l) {
  const r = psql(
    `select coalesce(holder_session, ''), coalesce(to_char(wrote_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''), coalesce(round(extract(epoch from (now() - wrote_at)) * 1000)::bigint, -1) from site_write_lease where site_key = '${l === label ? siteKey : `${l}.tracy.test`}'`
  )
  if (r.status !== 0)
    return {
      error:
        String(r.stderr ?? '')
          .trim()
          .slice(0, 120) || `psql exit ${r.status}`
    }
  const [holder, wrote, age] = String(r.stdout ?? '')
    .trim()
    .split('|')
  return holder ? { holder_session: holder, wrote_at: wrote || null, ageMs: Number(age ?? -1) } : null
}
/** Part of resetting THIS site (never another's row: other runners are live on other sites): nobody holds it. */
function clearLease(l) {
  const r = psql(
    `update site_write_lease set holder_session = null, holder_actor = null, taken_at = null, wrote_at = null, wanted_session = null, wanted_actor = null, wanted_at = null where site_key = '${l === label ? siteKey : `${l}.tracy.test`}' returning coalesce(holder_session, '')`
  )
  return r.status === 0
    ? null
    : String(r.stderr ?? '')
        .trim()
        .slice(0, 120) || `psql exit ${r.status}`
}

// ---- X18: the restore lock (files in LOCK_DIR; an entry whose process is gone is stale and removed)
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}
function liveTurns() {
  let names = []
  try {
    names = readdirSync(LOCK_DIR).filter((f) => f.startsWith('turn.'))
  } catch {}
  return names.filter((f) => {
    if (alive(Number(f.split('.').pop()))) return true
    rmSync(`${LOCK_DIR}/${f}`, { force: true })
    return false
  })
}
function restoreHolder() {
  try {
    const [who, pid] = readFileSync(`${LOCK_DIR}/restore.lock/owner`, 'utf8').trim().split(' ')
    if (!alive(Number(pid))) {
      rmSync(`${LOCK_DIR}/restore.lock`, { recursive: true, force: true })
      return null
    }
    return who
  } catch {
    return existsSync(`${LOCK_DIR}/restore.lock`) ? 'unknown' : null
  }
}
const held = new Set()
function releaseAll() {
  for (const f of held) rmSync(f, { recursive: true, force: true })
  held.clear()
}
process.on('exit', releaseAll)
/** One restore at a time, and only once no turn is in flight on any site (≤ 15 min). */
async function takeRestoreLock(who) {
  mkdirSync(LOCK_DIR, { recursive: true })
  const t0 = Date.now()
  const dirLock = `${LOCK_DIR}/restore.lock`
  for (;;) {
    try {
      mkdirSync(dirLock)
      writeFileSync(`${dirLock}/owner`, `${who} ${process.pid}`)
      held.add(dirLock)
      break
    } catch {
      restoreHolder()
      await sleep(2000)
    }
  }
  while (liveTurns().length && Date.now() - t0 < 15 * 60000) await sleep(2000)
  return {
    waitMs: Date.now() - t0,
    release: () => {
      rmSync(dirLock, { recursive: true, force: true })
      held.delete(dirLock)
    }
  }
}
/** A measured turn: waits while a restore runs anywhere (≤ 20 min), then marks itself in flight. */
async function takeTurnMark(who) {
  mkdirSync(LOCK_DIR, { recursive: true })
  const t0 = Date.now()
  while (restoreHolder() && Date.now() - t0 < 20 * 60000) await sleep(2000)
  const f = `${LOCK_DIR}/turn.${who}.${process.pid}`
  writeFileSync(f, new Date().toISOString())
  held.add(f)
  return {
    waitMs: Date.now() - t0,
    release: () => {
      rmSync(f, { force: true })
      held.delete(f)
    }
  }
}

/** Did turn `t` change the site (trace.mjs classes: door writes, site file edits, shell writes, builds)? */
function turnWrote(list, t) {
  const results = new Map(
    list.filter((e) => e.type === 'tool/result').map((e) => [e.data?.message?.source?.callId, e])
  )
  return list.some((e) => {
    if (e.type !== 'tool/call' || e.data?.turn !== t || !callKind(e.data).write) return false
    const r = results.get(e.data.callId)
    if (!r) return true
    const text = textOf(r.data?.message?.content ?? []).join('')
    return !refusalOf(text, { isError: Boolean(r.data?.message?.isError), tool: e.data.name })
  })
}

/** The agent's final answer in each of these turns (its last assistant message), joined in turn order. */
function answerFor(list, turns) {
  return [...new Set(turns)]
    .sort((a, b) => a - b)
    .map((t) =>
      textOf(
        list.filter((e) => e.type === 'assistant/message' && e.data?.turn === t).at(-1)?.data?.message
          ?.content ?? []
      ).join('\n')
    )
    .filter(Boolean)
    .join('\n')
}

/** The agent's own time in one turn, from its log: turn/start → turn/end minus question cards waiting. */
function agentMsOf(list, t) {
  const start = list.find((e) => e.type === 'turn/start' && e.data?.turn === t)
  if (!start) return null
  const end = list.find((e) => e.type === 'turn/end' && e.data?.turn === t)
  const last = list
    .filter((e) => e.data?.turn === t && typeof e.time === 'number')
    .reduce((a, e) => Math.max(a, e.time), start.time)
  const asks = new Map(
    list
      .filter((e) => e.type === 'tool/call' && e.data?.turn === t && e.data?.name === 'ask_user_question')
      .map((e) => [e.data.callId, e.time])
  )
  let wait = 0
  for (const e of list)
    if (e.type === 'tool/result' && asks.has(e.data?.message?.source?.callId))
      wait += Math.max(0, e.time - asks.get(e.data.message.source.callId))
  return (end ? end.time : last) - start.time - wait
}

const cookie = readFileSync(`${HERE}/cookie.txt`, 'utf8').trim()
const browser = await chromium.launch({
  headless: true,
  args: [
    '--proxy-server=direct://',
    '--proxy-bypass-list=*',
    '--host-resolver-rules=MAP *.tracy.test 127.0.0.1, MAP tracy.test 127.0.0.1'
  ]
})

let livePage = null
let livePageErrors = null
let uiLogged = false
for (const c of suite.cases) {
  if (only && !only.has(c.id)) continue
  livePage = null
  const dir = `${OUT}/${label}/${c.id}`
  mkdirSync(dir, { recursive: true })
  const result = {
    site: label,
    platform: site.platform,
    case: c.id,
    group: c.group,
    title: c.title,
    prompt: c.prompt
  }
  // v6 cases say which Mode and level they measure; v3–v5 results keep their shape.
  if (c.role) Object.assign(result, { role: c.role, level: c.level, via: c.via })
  const uploaded = []
  // `requires` names pages and keys a case needs but may not write as a {placeholder} (homeRu, contact…).
  const missing = missingKeys(
    [c.prompt, c.turns, c.oracle, c.turnOracles, (c.requires ?? []).map((k) => `{${k}}`)],
    site
  )
  if (missing.length > 0) {
    result.outcome = 'n/a'
    result.missing = missing
    writeFileSync(`${dir}/result.json`, JSON.stringify(result, null, 2))
    log(c.id, 'n/a (site has no', missing.join(', ') + ')')
    continue
  }
  try {
    if (RESTORE) {
      // X10: what the previous case left holding this site's write lease (read before the restore resets it).
      const before = leaseOf(label)
      if (before) result.leaseBefore = before
      const lock = RESTORE_LOCK ? await takeRestoreLock(label) : null
      if (lock) result.restoreWaitMs = lock.waitMs
      const t = Date.now()
      // The restore's window (this Mac's clock), so a summary can tell which measured turns on OTHER sites it overlapped.
      result.restore = { start: new Date(t).toISOString(), lock: RESTORE_LOCK }
      let rs
      try {
        // A restore that fails is the stand's failure, never the agent's: say so (RUNNER) with snap.sh's own words.
        rs = spawnSync(`${HERE}/snap.sh`, ['restore', label], {
          encoding: 'utf8',
          timeout: 180000,
          stdio: ['ignore', 'ignore', 'pipe']
        })
      } finally {
        lock?.release()
        result.restore.end = new Date().toISOString()
      }
      if (rs.status !== 0)
        throw new Error(
          `RUNNER: restore of ${label} failed (snap.sh exit ${rs.status ?? rs.signal}): ${String(
            rs.stderr ?? rs.error ?? ''
          )
            .trim()
            .slice(-300)}`
        )
      result.restoreMs = Date.now() - t
      const cleared = clearLease(label)
      if (cleared) result.leaseError = cleared
    }
    // The site may still be warming after a restore (r1 C09 Joomla: HTTP 0 right after it).
    let sane = judge({ home: { has: ['{h1key}'] } }, site)
    for (let i = 0; i < 12 && !sane.pass; i++) {
      await sleep(5000)
      sane = judge({ home: { has: ['{h1key}'] } }, site)
    }
    if (!sane.pass) throw new Error(`baseline not in place: ${JSON.stringify(sane.checks)}`)
    // 29/09: WARM-UP. A restore restarts the site (EmDash: the whole container), and the agent's FIRST door call then paid a cold start
    // of 35-55 s (measured 29/09: tracy_site content.replace on EmDash, 54.7 s SITE_UNREACHABLE then 36.5 s) — a cost of the bench's
    // restore-per-case method, not of the agent: a customer's running site is warm. One read through the same door the agent uses warms
    // the plugin and the reader; its time is recorded (result.warmUpMs) so the cold start still shows as its own number. WARM_UP=0 turns it off.
    if (process.env.WARM_UP !== '0') {
      const w0 = Date.now()
      try {
        const r = spawnSync(
          'curl',
          [
            '-s',
            '-m',
            '120',
            '--noproxy',
            '*',
            '--resolve',
            'tracy.test:51710:127.0.0.1',
            '-X',
            'POST',
            '-H',
            `cookie: tracy_sess=${cookie}`,
            '-H',
            'origin: http://tracy.test:51710',
            '-H',
            'content-type: application/json',
            '-d',
            '{"action":"content.read","params":{"limit":1}}',
            `http://tracy.test:51710/api/sites/${siteKey}/apply`
          ],
          { encoding: 'utf8', timeout: 130000 }
        )
        result.warmUp = { ms: Date.now() - w0, ok: /"schemaVersion"/.test(r.stdout ?? '') }
        if (!result.warmUp.ok) result.warmUp.answer = String(r.stdout ?? r.stderr ?? '').slice(0, 160)
        // The read is cheap (2-5 s) and does NOT warm what a text edit pays for: a words replace scans every record of the site — on Joomla
        // the plugin re-proves the files a restore just rewrote (30-55 s), on EmDash the Content API index is built. A dry run of the SAME
        // call the agent makes first (nothing to find, nothing written) pays that cost here, before the agent's clock starts.
        const w1 = Date.now()
        const r2 = spawnSync(
          'curl',
          [
            '-s',
            '-m',
            '170',
            '--noproxy',
            '*',
            '--resolve',
            'tracy.test:51710:127.0.0.1',
            '-X',
            'POST',
            '-H',
            `cookie: tracy_sess=${cookie}`,
            '-H',
            'origin: http://tracy.test:51710',
            '-H',
            'content-type: application/json',
            '-d',
            JSON.stringify({
              action: 'content.replace',
              params: { find: '\u2063warm-up\u2063', replace: '\u2063warm-up\u2063', dryRun: true }
            }),
            `http://tracy.test:51710/api/sites/${siteKey}/apply`
          ],
          { encoding: 'utf8', timeout: 175000 }
        )
        result.warmUp.replaceMs = Date.now() - w1
        result.warmUp.replaceAnswer = String(r2.stdout ?? r2.stderr ?? '').slice(0, 120)
      } catch (error) {
        result.warmUp = { ms: Date.now() - w0, ok: false, answer: String(error.message).slice(0, 160) }
      }
      log(
        c.id,
        `warm-up read ${(result.warmUp.ms / 1000).toFixed(1)} s${result.warmUp.ok ? '' : ' (no answer)'}, replace scan ${((result.warmUp.replaceMs ?? 0) / 1000).toFixed(1)} s`
      )
    }
    // unchangedPages "oracle" (v4 cases): fingerprint every page the case names, not only home.
    const pageOpts = { allPages: c.unchangedPages === 'oracle' }
    // judgeAsync/baselineAsync = judge/baselineOf for every oracle without v6 style rules (v3–v5: identical);
    // style rules are measured in this runner's own Chromium (a fresh context per page and viewport).
    const baseline = await baselineAsync(site, [c.oracle, ...(c.turnOracles ?? [])], {
      ...pageOpts,
      browser,
      strict: Boolean(c.role),
      fetchPage: recorder(dir, 'baseline')
    })
    result.baseline = baseline

    const picks = (c.turns ?? []).some((x) => x && typeof x === 'object' && x.pick)
    const ctx = await browser.newContext({
      viewport: picks ? { width: 2400, height: 1300 } : { width: 1500, height: 950 }
    })
    // '.tracy.test': the session must also reach the SITE hosts (<label>.tracy.test) — the Comment picker's
    // ticket is redeemed only on a request that carries it (27/09: a host-only cookie left every pick without a button).
    await ctx.addCookies([{ name: 'tracy_sess', value: cookie, domain: '.tracy.test', path: '/' }])
    const page = await ctx.newPage()
    livePage = page
    // v7: the page's own JavaScript errors (new plugin code on the page: Comments view, site picker, held-message notice).
    const pageErrors = trackPageErrors(page)
    livePageErrors = pageErrors
    const editor = page.locator(EDITOR).first()
    // A page that does not draw its composer is loaded again, twice at most (r1 C11 Joomla).
    for (let attempt = 1; ; attempt++) {
      try {
        // 02/10: a pick case needs the Browser tab, and a site whose side card never opened it (a fresh import) has none:
        // ask for it with the product's own deep link (tracy-site-tabs browser-link.mjs), the address a shared link carries.
        await page.goto(
          picks ? `${ORIGIN}/${siteKey}/?open=browser&page=%2F&mode=interactive` : `${ORIGIN}/${siteKey}/`,
          { waitUntil: 'domcontentloaded', timeout: 120000 }
        )
        // A bench session lives 72 h; past that the workspace sends the page to /login and every later case
        // would look like "page did not load" (27/09 full1 from 13:10 UTC). Say what it is.
        if (/\/login\b/.test(page.url()))
          throw new Error(`RUNNER: signed out (${page.url()}) — the bench cookie expired: node login.mjs`)
        await editor.waitFor({ state: 'visible', timeout: 90000 })
        break
      } catch (error) {
        // v7: say what the page showed — an inert composer (contenteditable="false", "Choose workspace": a workspace the
        // seat book has not registered yet, #557) and a page that never drew its bar look the same to a timeout.
        const seen = await uiLine(page)
        if (attempt >= 3) {
          if (String(error?.message ?? error).startsWith('RUNNER')) throw error
          // The stand's failure, never the agent's: a RUNNER error is what run-v7.sh runs once more.
          throw new Error(
            `RUNNER: the composer never became editable on ${siteKey} (${String(error?.message ?? error).split('\n')[0]}) [page ${seen}]`
          )
        }
        log(c.id, `page did not load (attempt ${attempt}), again`, seen)
      }
    }
    const before = page.url()
    try {
      await (await newSessionButton(page)).click({ timeout: 30000 })
    } catch (error) {
      throw new Error(
        `RUNNER: no "New session" button could be pressed (${String(error?.message ?? error).split('\n')[0]}) [page ${await uiLine(page)}]`
      )
    }
    // A new session is a new address — unless the open one is still empty, which dsh keeps rather
    // than making another. Either way the session we type into must hold no message yet.
    for (let i = 0; i < 16 && (page.url() === before || !/\/s\/session-/.test(page.url())); i++)
      await sleep(500)
    let sessionId = /\/s\/(session-[0-9a-f-]+)/.exec(page.url())?.[1]
    if (!sessionId) throw new Error(`no session in the address (url ${page.url()})`)
    const prior = events(sessionId)
    if ((prior.list ?? []).some((e) => e.type === 'user/message'))
      throw new Error(`session ${sessionId} is not empty`)
    result.session = sessionId
    await editor.waitFor({ state: 'visible', timeout: 60000 })
    // Give the mode picker time to follow the site (presetForSite), as a customer's page would.
    await sleep(8000)
    // The address can still move after the first read: 27/09 A1 EmDash V4-conversation-06 read an already-open
    // empty session, then the page moved to the one "New session" had made, and turn 2 went THERE (7 min of work
    // the runner never saw; the case timed out at step 0 and the page verdict still said PASS). Take the address
    // again once the page has settled, and start over from the session it names.
    const settled = /\/s\/(session-[0-9a-f-]+)/.exec(page.url())?.[1]
    if (settled && settled !== sessionId) {
      log(c.id, `session moved ${sessionId} → ${settled} after New session; following it`)
      if ((events(settled).list ?? []).some((e) => e.type === 'user/message'))
        throw new Error(`session ${settled} is not empty`)
      sessionId = settled
      result.session = sessionId
    }
    // 02/10: the Browser tab belongs to the session: a deep link read before "New session" does not carry over, and a
    // site whose side card never held the tab (a fresh import) starts without it. A pick case loads ITS session with
    // the product's own link, as a shared link to it would.
    if (picks && !page.frames().some((f) => f.url().startsWith(`http://${label}.tracy.test:`))) {
      await page.goto(`${ORIGIN}/${siteKey}/s/${sessionId}?open=browser&page=%2F&mode=interactive`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000
      })
      await editor.waitFor({ state: 'visible', timeout: 90000 })
      let up = false
      for (let i = 0; i < 40 && !up; i++) {
        up = page.frames().some((f) => f.url().startsWith(`http://${label}.tracy.test:`))
        if (!up) await sleep(1000)
      }
      log(c.id, `the Browser tab opened by its link: ${up ? 'site frame up' : 'still no site frame'}`)
    }
    result.chip = ((await page.evaluate(() => document.body.innerText)).match(
      /(?:Designer|Writer|Developer|SEO)\s+[A-Z]\s+\w+/
    ) ?? [''])[0]
    // v7: once per run, what the new-session screen shows (tabs, pills, operator switches, composer) — the first thing to
    // read after the stand is rebuilt.
    if (!uiLogged) {
      uiLogged = true
      log(c.id, 'ui', await uiLine(page))
    }
    // v6: the customer picks the case's Mode before typing (after the site-platform follow has landed).
    // tc-run/d farm copy (05/10/2026): the local stand hides the Mode row (ui switch mode-platform-row, no staff seat to
    // turn it on), so the case runs in the site's default mode; the case's role still drives strict judging.
    let pickerHidden = false
    if (c.role) {
      try {
        result.mode = await selectMode(page, {
          role: c.role,
          platform: site.platform,
          readEvents: () => events(sessionId).list,
          log: (m) => log(c.id, m)
        })
        result.chip = `${result.mode.modePill} · ${result.mode.platformPill}`
        log(
          c.id,
          `mode ${result.mode.preset} (${result.mode.clicked ? `picked in ${Math.round(result.mode.ms / 1000)} s` : 'already on it'})`
        )
      } catch (e) {
        if (!/no Mode picker/.test(String(e?.message ?? e))) throw e
        pickerHidden = true
        result.modeNote = `role ${c.role} not selectable (Mode row hidden); ran in the site default`
        log(c.id, result.modeNote)
      }
    }
    // X10: the lease was cleared with the restore; one held again now means a session still writing here.
    const leaseNow = RESTORE ? leaseOf(label) : null
    if (leaseNow && !leaseNow.error) {
      result.leaseAtStart = leaseNow
      log(c.id, `the site's write lease is held again before the first message (${leaseNow.holder_session})`)
    }
    // X4: this case's clock offset between the dsh container and this Mac.
    const clock = dshClock()
    if (clock) result.clock = clock

    const prompts = (c.turns ?? [c.prompt]).map(fillDeep)
    result.prompts = prompts
    // The scripted messages as the case wrote them (prompts[] also gets the confirmations spliced in).
    const scriptedMsgs = prompts.slice()
    const cardsFor = new Map()
    result.turns = []
    const t0 = Date.now()
    // p = the scripted prompt being worked on. A question the agent asks with its question tool is answered
    // IN ITS CARD, as a customer does (the card stands where the composer was — 27/09 A1 EmDash
    // V4-conversation-01 died clicking a composer the card covered): the next scripted prompt goes into the
    // card and the SAME turn goes on. A question asked in plain text ends the turn; the next prompt is typed
    // into the composer as a new turn. The time a question sits open (15 s detection + typing) is the
    // customer's, not the agent's: it is kept as customerMs and taken out of wallMs.
    let p = 0
    let customerTotal = 0
    // v5 `confirmOnce`: when the agent answers a scripted message with a question (a card, or text ending in
    // "?"), the customer confirms ONCE with CONFIRM before the next scripted message — unless the case says
    // the next scripted message IS the answer (`answersAfter`: 1-based scripted numbers). `step[i]` = which
    // scripted message prompts[i] serves, so turn checks run after the confirmation, not before it.
    const step = prompts.map((_, i) => i)
    const scripted = prompts.length
    const confirmed = new Set()
    const wantsConfirm = (i) =>
      Boolean(c.confirmOnce) &&
      !confirmed.has(step[i]) &&
      !((c.answersAfter ?? []).includes(step[i] + 1) && step[i] + 1 < scripted)
    const addConfirm = (i, t, via, question) => {
      prompts.splice(i + 1, 0, CONFIRM)
      step.splice(i + 1, 0, step[i])
      confirmed.add(step[i])
      let questions = null
      try {
        questions = JSON.parse(String(question)).questions?.length ?? null
      } catch {}
      ;(result.confirms ??= []).push({
        turn: t,
        afterMessage: step[i] + 1,
        via,
        questions,
        question: String(question).slice(-300)
      })
    }
    const checkAfter = (i) =>
      i + 1 < prompts.length && step[i + 1] !== step[i] ? (c.turnOracles ?? [])[step[i]] : undefined
    const promptLabel = (i) => (i > 0 && step[i] === step[i - 1] ? 'confirm' : step[i] + 1)
    const mine = new Set()
    // 02/10 (import catalogue L5): a scripted message with `queueAfterMs` is typed and sent that long after the
    // previous one, WHILE the agent is still on it (the composer's Queue/Steer button) — a customer who does not
    // wait. preSent: prompt index → {at, sentAs, afterMs}. Its turn then only waits; if dsh took the words into
    // the running turn and no turn of their own follows, the turn is recorded as merged.
    const preSent = new Map()
    for (let t = 1; p < prompts.length; t++) {
      const here = /\/s\/(session-[0-9a-f-]+)/.exec(page.url())?.[1]
      if (here !== sessionId)
        throw new Error(
          `RUNNER: the page left session ${sessionId} (now ${here ?? page.url()}) before turn ${t}`
        )
      const spec = prompts[p]
      const extra = {}
      // dsh 0.1.7-rc.2 (develop 27/09, measured with probe-idle.mjs): after `turn/end` the page's connection
      // drops and reconnects, and the composer keeps showing the run as live (Stop over an empty draft,
      // "Queue message" over a typed one) until the page is reloaded. A customer then presses the button
      // anyway; the server is idle, so the message runs at once (2 s measured). The runner waits up to 10 s
      // for Send, then presses whatever the button says, and keeps which one it was (`sentAs`).
      if (t > 1) {
        const w0 = Date.now()
        const stop = page.locator(STOP_GENERATING)
        while ((await stop.count()) && Date.now() - w0 < 10000) await sleep(1000)
        extra.idleWaitMs = Date.now() - w0
      }
      if (typeof spec === 'object' && spec.upload) {
        const paths = spec.upload.map(fixturePath)
        uploaded.push(...paths.map((x) => x.split('/').pop()))
        extra.uploaded = await uploadToFiles(page, sessionId, `/site/${label}`, paths)
        log(c.id, `turn ${t} put ${extra.uploaded.map((u) => u.name).join(', ')} in the Files tab`)
      }
      // Everything that puts this message in front of the agent; run again once if it never arrives.
      const deliver = async () => {
        if (preSent.has(p)) {
          extra.sentAs = preSent.get(p).sentAs
          extra.queuedAfterMs = preSent.get(p).afterMs
          extra.preSentAt = preSent.get(p).at
          return
        }
        if (typeof spec === 'object' && spec.pick) {
          extra.pick = await pickAndSend(page, site, spec.pick, spec.say, dir, t, (m) => log(c.id, m))
        } else {
          if (typeof spec === 'object' && spec.images) {
            const paths = []
            for (const [i, img] of spec.images.entries()) {
              if (typeof img === 'string') paths.push(fixturePath(img))
              else {
                const shot = await annotatedShot(
                  browser,
                  site,
                  img.annotate,
                  `${dir}/annotated-${t}-${i + 1}.png`
                )
                ;(extra.annotated ??= []).push({ url: shot.url, target: shot.target })
                paths.push(shot.file)
              }
            }
            await attachImages(page, paths)
            extra.images = paths.map((x) => x.split('/').pop())
          }
          // v7: Chat is the view on screen (the Comments view swaps the composer for "Add a comment…"), and a composer
          // that is not shown is the page's fault, said as such — not a 30 s click timeout that reads as the agent's.
          await ensureChatView(page, (m) => log(c.id, `turn ${t} ${m}`))
          try {
            await editor.waitFor({ state: 'visible', timeout: 30000 })
          } catch {
            throw new Error(`RUNNER: the composer is not shown before turn ${t} [page ${await uiLine(page)}]`)
          }
          await editor.click()
          await page.keyboard.type(sayOf(spec), { delay: 2 })
          // 29/09: a customer takes seconds to type a request, and the page picture of PR #599 is drawn WHILE they type (the first keystroke
          // warms it) — the turn only waits VIEW_WAIT_MS (3.5 s) for one still on its way. The bench typed 200 characters in 0.4 s, so the
          // first message of a case on a cold site went without its picture. Dwell like a person before Send (0 turns it off). The agent's
          // clock starts at Send, so this is not in any agent second.
          await sleep(Number(process.env.TYPING_DWELL_MS ?? 6000))
          // Send / Queue message; v7 also Steer message (the third label of the primary button, dsh InputBar.tsx:310-313 —
          // only with the busy-Enter preference set to steer, default queue). `sentAs` keeps which one it was.
          const primary = page.locator(PRIMARY_SEND).last()
          extra.sentAs = await primary.getAttribute('aria-label', { timeout: 30000 })
          await primary.click()
        }
      }
      const mark = RESTORE_LOCK ? await takeTurnMark(label) : null
      if (mark && mark.waitMs > 1000) {
        extra.lockWaitMs = mark.waitMs
        log(c.id, `turn ${t} waited ${Math.round(mark.waitMs / 1000)} s for a restore to end`)
      }
      await deliver()
      // A Comment turn left the popover at `sentAt`; the agent's clock starts there, not after the popover closed.
      let started = extra.pick?.sentAt ?? extra.preSentAt ?? Date.now()
      if (extra.preSentAt) delete extra.preSentAt
      if (extra.pick) delete extra.pick.sentAt
      let sent = started
      log(c.id, `turn ${t} sent`, sessionId, '|', result.chip)
      let end = null
      let asked = null
      let lastSteps = -1
      let customerMs = 0
      const turn = {
        turn: t,
        prompts: [promptLabel(p)],
        ...extra,
        startedAt: new Date(started).toISOString()
      }
      turn.said = String(sayOf(spec) ?? '').slice(0, 200)
      // Which scripted messages this turn serves (a card answer adds the next one; a confirmOnce turn serves
      // the same one again) — `answerHas` reads the answers of every turn that served its message.
      turn.scripted = [step[p]]
      while (Date.now() - sent < TIMEOUT_MS) {
        await sleep(4000)
        const { list } = events(sessionId)
        // A sent message that never reaches OUR session is the runner's failure, not a slow agent: say so now.
        // An empty list is a failed read (docker exec timed out under load — a live session always holds
        // events), not a turn that never started: only a list that has events and lacks this turn counts.
        const began = list.find((e) => e.type === 'turn/start' && e.data?.turn === t)
        if (began && turn.deliveryMs === undefined)
          turn.deliveryMs = Math.max(0, began.time - (clock?.offsetMs ?? 0) - started)
        const nextSpec = prompts[p + 1]
        if (
          nextSpec &&
          typeof nextSpec === 'object' &&
          Number.isFinite(nextSpec.queueAfterMs) &&
          !preSent.has(p + 1) &&
          Date.now() - started >= nextSpec.queueAfterMs
        ) {
          await ensureChatView(page, (m) => log(c.id, `turn ${t} ${m}`))
          await editor.click()
          await page.keyboard.type(sayOf(nextSpec), { delay: 2 })
          const primaryNow = page.locator(PRIMARY_SEND).last()
          const sentAs = await primaryNow.getAttribute('aria-label', { timeout: 30000 }).catch(() => null)
          await primaryNow.click()
          preSent.set(p + 1, { at: Date.now(), sentAs, afterMs: Date.now() - started })
          log(
            c.id,
            `turn ${t} message ${step[p] + 2} sent while the agent was still working (${sentAs ?? 'button'})`
          )
        }
        if (preSent.has(p) && !began) {
          const lastEnd = list.filter((e) => e.type === 'turn/end').at(-1)
          const lastStart = list.filter((e) => e.type === 'turn/start').at(-1)
          const idle = lastEnd && (!lastStart || lastStart.time <= lastEnd.time)
          const quietMs = lastEnd ? Date.now() - (lastEnd.time - (clock?.offsetMs ?? 0)) : 0
          if (idle && Date.now() - preSent.get(p).at > 30000 && quietMs > 20000) {
            turn.merged = true
            end = lastEnd
            log(
              c.id,
              `turn ${t}: message ${step[p] + 1} was taken into the running turn (no turn of its own)`
            )
            break
          }
          if (Date.now() - started > DELIVERY_WAIT_MS) {
            // a queued message is never re-sent: the customer saw it go
          }
        }
        // 27/09 (root cause in PR #483): while the seat gateway's mux socket storms, a sent prompt waits in
        // the browser's connection queue and reaches dsh 75–461 s later. That delay is the product's, kept
        // as deliveryMs; only after DELIVERY_WAIT_MS with nothing is the message treated as lost.
        if (!preSent.has(p) && Date.now() - started > DELIVERY_WAIT_MS && list.length > 0 && !began) {
          // 27/09 full2 EmDash V5-pick-02: the message showed in the transcript and never reached the server
          // (sent while the page's connection was dropping and reconnecting, the same fault that leaves the
          // composer "running"). A customer who gets no answer reloads and sends again: so does the runner,
          // ONCE, and counts it (result.lostMessages) — a lost message is a product failure, kept apart.
          if (turn.resent)
            throw new Error(
              `RUNNER: turn ${t} never reached session ${sessionId} in ${DELIVERY_WAIT_MS / 1000} s, also after a reload and a second send (page at ${page.url()})`
            )
          result.lostMessages = (result.lostMessages ?? 0) + 1
          await page.screenshot({ path: `${dir}/lost-${t}.png` }).catch(() => {})
          log(
            c.id,
            `turn ${t} never reached the session in ${DELIVERY_WAIT_MS / 1000} s — reload and send again`
          )
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
          await editor.waitFor({ state: 'visible', timeout: 90000 })
          await sleep(8000)
          await deliver()
          turn.resent = { after: Math.round((Date.now() - started) / 1000), sentAs: extra.sentAs ?? null }
          if (extra.pick) Object.assign(turn, { pick: extra.pick })
          started = extra.pick?.sentAt ?? Date.now()
          if (extra.pick) delete extra.pick.sentAt
          sent = started
          continue
        }
        const steps = list.filter((e) => e.type === 'step/start' && e.data?.turn === t).length
        if (steps !== lastSteps) {
          lastSteps = steps
          log(c.id, `turn ${t} step ${steps} (+${Math.round((Date.now() - started) / 1000)}s)`)
        }
        end = list.find((e) => e.type === 'turn/end' && e.data?.turn === t)
        if (end) break
        // A question to the customer blocks the turn.
        const calls = list.filter((e) => e.type === 'tool/call' && e.data?.name === 'ask_user_question')
        const answered = new Set(
          list.filter((e) => e.type === 'tool/result').map((e) => e.data?.message?.source?.callId)
        )
        const open = calls.find((e) => !answered.has(e.data.callId) && !mine.has(e.data.callId))
        if (open && Date.now() - open.time > 15000) {
          // v6 (X16, X17): a question card never ends a scripted message. The customer answers it — the one
          // option that does the change, or, when the card offers several roads, the request restated in words —
          // and the SAME turn goes on until turn/end, where the turn is judged; the next scripted message is then
          // typed as a new turn. At most MAX_CARDS cards per message are answered; later ones are skipped. Not when
          // the case says the next scripted message IS the answer (answersAfter), which goes into the card as before.
          const v6Card =
            Boolean(c.role) &&
            Boolean(c.confirmOnce) &&
            !((c.answersAfter ?? []).includes(step[p] + 1) && step[p] + 1 < scripted)
          if (v6Card) {
            mine.add(open.data.callId)
            const n = (cardsFor.get(step[p]) ?? 0) + 1
            cardsFor.set(step[p], n)
            let questions = null
            try {
              questions = JSON.parse(String(open.data.arguments)).questions?.length ?? null
            } catch {}
            const question = String(open.data.arguments).slice(0, 300)
            if (n <= MAX_CARDS) {
              const asked1 = String(sayOf(scriptedMsgs[step[p]]) ?? '')
                .replace(/\s+/g, ' ')
                .trim()
              const restated = `Mình không chọn thêm phương án nào: cứ làm đúng yêu cầu ban đầu — «${asked1}» — không thêm gì khác.`
              const clicks = await confirmCard(page, CONFIRM, restated)
              confirmed.add(step[p])
              ;(result.confirms ??= []).push({
                turn: t,
                afterMessage: step[p] + 1,
                via: 'card',
                nth: n,
                questions,
                question: String(open.data.arguments).slice(-300),
                ...(clicks?.choice ? { restated: true } : {})
              })
              ;(turn.answeredInCard ??= []).push({ prompt: 'confirm', nth: n, clicks, questions, question })
              log(
                c.id,
                `turn ${t} question card ${n} for message ${step[p] + 1} answered with the confirmation${clicks?.choice ? ' (the request restated: several roads offered)' : ''}`
              )
            } else {
              ;(turn.skippedCard ??= []).push({ nth: n, clicks: await skipCard(page), question })
              log(
                c.id,
                `turn ${t} question card ${n} for message ${step[p] + 1} skipped (more than ${MAX_CARDS})`
              )
            }
            customerMs += Date.now() - open.time
            sent = Date.now()
            continue
          }
          // v5: a question still open after the customer's LAST scripted message (typically "are you sure?"
          // about a change they asked for in so many words) gets one neutral reply, as a customer gives it.
          if (wantsConfirm(p)) addConfirm(p, t, 'card', open.data.arguments)
          if (c.continueAfterAsk && p + 1 < prompts.length && typeof prompts[p + 1] === 'object') {
            // The next scripted turn carries pictures or a pick, which a question card cannot take: the
            // customer skips the card and sends that turn once the agent's turn ends.
            mine.add(open.data.callId)
            ;(turn.skippedCard ??= []).push({
              clicks: await skipCard(page),
              question: String(open.data.arguments).slice(0, 300)
            })
            customerMs += Date.now() - open.time
            log(c.id, `turn ${t} question card skipped (next turn is not a sentence)`)
            sent = Date.now()
            continue
          }
          if (c.continueAfterAsk && p + 1 < prompts.length) {
            const turnOracle = checkAfter(p)
            if (turnOracle) {
              const said = answerFor(list, [
                ...result.turns.filter((x) => (x.scripted ?? []).includes(step[p])).map((x) => x.turn),
                t
              ])
              const mid = await judgeAsync(turnOracle, site, {
                baseline,
                answer: `${said}\n${open.data.arguments}`,
                browser,
                strict: Boolean(c.role),
                fetchPage: recorder(dir, `after-message-${step[p] + 1}`)
              })
              ;(turn.checks ??= []).push({ prompt: step[p] + 1, ...mid })
              log(c.id, `turn ${t} prompt ${step[p] + 1} check`, mid.pass ? 'PASS' : 'FAIL')
            }
            p++
            mine.add(open.data.callId)
            const clicks =
              promptLabel(p) === 'confirm'
                ? await confirmCard(page, prompts[p])
                : await answerCard(page, prompts[p])
            customerMs += Date.now() - open.time
            let questions = null
            try {
              questions = JSON.parse(String(open.data.arguments)).questions?.length ?? null
            } catch {}
            ;(turn.answeredInCard ??= []).push({
              prompt: promptLabel(p),
              clicks,
              questions,
              question: String(open.data.arguments).slice(0, 300)
            })
            turn.prompts.push(promptLabel(p))
            turn.scripted.push(step[p])
            log(c.id, `turn ${t} question answered in its card with prompt ${promptLabel(p)}`)
            sent = Date.now()
            continue
          }
          asked = open.data.arguments
          break
        }
      }
      turn.endedAt = new Date().toISOString()
      mark?.release()
      turn.wallMs = Date.now() - started - customerMs
      turn.steps = lastSteps
      if (customerMs) turn.customerMs = customerMs
      customerTotal += customerMs
      if (!end) {
        turn.outcome = asked ? 'asked-user' : 'timeout'
        await page.screenshot({ path: `${dir}/stuck-${t}.png` })
        // v7: the composer's own "Stop generating" — never a background job's "Stop task <label>" that stands earlier in the page.
        await stopGenerating(page, 30000) // v6 waited up to 30 s for this press too
        await sleep(5000)
      } else turn.outcome = end.data?.reason?.kind ?? 'ended'
      if (asked) turn.asked = String(asked).slice(0, 500)
      result.turns.push(turn)
      if (!end) break
      // The composer still says "running" after turn/end (dsh 0.1.7, #483): how long, up to 10 s.
      {
        const w0 = Date.now()
        const stopBtn = page.locator(STOP_GENERATING)
        while ((await stopBtn.count()) && Date.now() - w0 < 10000) await sleep(500)
        turn.runningAfterEndMs = Date.now() - w0
      }
      // v6 (X15): how the turn ended — a question ("?" in the last paragraph), an offer that awaits a decision on a
      // turn that changed nothing, or a statement (v6/lib/confirm.mjs). v5 cases keep the trailing-"?" rule.
      if (c.role) {
        const { list } = events(sessionId)
        const said = textOf(
          list.filter((e) => e.type === 'assistant/message' && e.data?.turn === t).at(-1)?.data?.message
            ?.content ?? []
        )
          .join('\n')
          .trim()
        turn.wrote = turnWrote(list, t)
        const ends = awaitsCustomer(said, { wrote: turn.wrote })
        turn.endedOn = ends?.kind ?? 'statement'
        if (ends && wantsConfirm(p)) {
          addConfirm(p, t, 'text', said)
          result.confirms.at(-1).why = ends.why
          log(
            c.id,
            `turn ${t} ended on ${ends.kind === 'offer' ? 'an offer' : 'a question'} (${ends.why}): the customer confirms once`
          )
        }
      } else if (wantsConfirm(p)) {
        const { list } = events(sessionId)
        const said = textOf(
          list.filter((e) => e.type === 'assistant/message' && e.data?.turn === t).at(-1)?.data?.message
            ?.content ?? []
        )
          .join('\n')
          .trim()
        if (/\?\s*\S{0,3}\s*$/.test(said)) {
          addConfirm(p, t, 'text', said)
          log(c.id, `turn ${t} ended on a question: the customer confirms once`)
        }
      }
      const turnOracle = checkAfter(p)
      if (turnOracle) {
        await sleep(3000)
        const { list } = events(sessionId)
        const said = answerFor(
          list,
          result.turns.filter((x) => (x.scripted ?? []).includes(step[p])).map((x) => x.turn)
        )
        const mid = await judgeAsync(turnOracle, site, {
          baseline,
          answer: said,
          browser,
          strict: Boolean(c.role),
          fetchPage: recorder(dir, `after-message-${step[p] + 1}`)
        })
        ;(turn.checks ??= []).push({ prompt: step[p] + 1, ...mid })
        log(c.id, `turn ${t} prompt ${step[p] + 1} check`, mid.pass ? 'PASS' : 'FAIL')
      }
      p++
      if (p < prompts.length) await sleep(2000)
    }
    result.wallMs = Date.now() - t0 - customerTotal
    result.outcome = result.turns.at(-1)?.outcome ?? 'error'
    const lastSteps = result.turns.reduce((n, x) => n + Math.max(0, x.steps), 0)
    await sleep(3000)
    const { list, text } = events(sessionId)
    writeFileSync(`${dir}/session.jsonl`, text)
    // v7 (OPTIONAL, additive, never judged): the Browser tab's own verdict on the comment turns of this case. Its pins
    // (`[data-comment-pin]`, one per comment, kept until resolved) go sent -> working -> done | failed | asked from the
    // agent's tool receipts (chat-input comment-status.mjs); at the end of a case they say what the product itself concluded,
    // next to the page oracle. [] = no pins on the page (the comment never became one, or the tab was gone); null = unreadable.
    if ((c.turns ?? []).some((x) => x && typeof x === 'object' && x.pick))
      result.pins = await page
        .evaluate(() =>
          [...document.querySelectorAll('[data-comment-pin]')].map((p) => ({
            n: (p.textContent || '').trim(),
            status: p.getAttribute('data-status')
          }))
        )
        .catch(() => null)
    // v5: what each object turn actually delivered — the element block a pick carried, the pictures a message held.
    // The customer's own messages, one per turn in order (question-card answers are tool results, and the
    // workspace reminder dsh adds carries no user source).
    const userMsgs = list.filter((e) => e.type === 'user/message' && e.data?.source?.kind === 'user')
    for (const turn of result.turns) {
      const msg = userMsgs[turn.turn - 1] ?? null
      const parts = msg?.data?.content ?? []
      if (turn.pick)
        turn.pick.block = pickedBlock(
          parts
            .filter((x) => x.type === 'text')
            .map((x) => x.text)
            .join('\n')
        )
      if (turn.images) turn.imagesSeen = parts.filter((x) => x.type === 'image').length
      // Inside dsh's own clock: the agent's time, and the wait from the message entering the inbox to its turn.
      turn.agentMs = agentMsOf(list, turn.turn)
      const began = list.find((e) => e.type === 'turn/start' && e.data?.turn === turn.turn)
      const inbox = began
        ? list
            .filter(
              (e) =>
                e.type === 'agent/inbox/spliced' && (e.data?.inserted ?? []).length && e.time <= began.time
            )
            .at(-1)
        : null
      if (inbox) turn.queueMs = began.time - inbox.time
    }
    result.agentMs = result.turns.reduce((a, x) => a + (x.agentMs ?? 0), 0)
    // X2: a user message the runner did not send (another probe typing into this session) contaminates the case.
    const msgText = (m) =>
      (m.data?.content ?? [])
        .filter((x) => x.type === 'text')
        .map((x) => x.text)
        .join('\n')
    const foreign = userMsgs.filter(
      (m) => !result.turns.some((x) => x.said && msgText(m).includes(x.said.slice(0, 40)))
    )
    if (foreign.length) result.foreignMessages = foreign.map((m) => msgText(m).slice(0, 160))
    const lastTurn = result.turns.some((x) => x.merged)
      ? Math.max(0, ...list.filter((e) => e.type === 'turn/end').map((e) => e.data?.turn ?? 0))
      : result.turns.length
    const assistants = list.filter((e) => e.type === 'assistant/message' && e.data?.turn === lastTurn)
    const answer = textOf(assistants.at(-1)?.data?.message?.content ?? []).join('\n')
    result.answer = answer.slice(0, 1500)
    const askedTool = list.some((e) => e.type === 'tool/call' && e.data?.name === 'ask_user_question')
    // D farm (05/10/2026): a question in the middle of the reply, or a polite request with no "?" ("Bạn cho mình xin số fax…
    // nhé."), is still the agent asking; only the end of the reply used to count.
    const requests =
      /\?|cho (mình|em|tôi) xin|vui lòng (cung cấp|cho)|please (provide|share|send|tell)|could you (share|provide|tell|send)/i
    const asked = askedTool || requests.test(answer) || result.outcome === 'asked-user'
    result.asked = asked
    // The final oracle's `answerHas` reads every turn that served the LAST scripted message (its own turn and a
    // confirmOnce turn after it): an answer given before a confirmation still counts.
    const lastScripted = step[step.length - 1]
    const answerAll =
      answerFor(
        list,
        result.turns.filter((x) => (x.scripted ?? []).includes(lastScripted)).map((x) => x.turn)
      ) || answer
    // 29/09: SETTLE before the final verdict. A site that answers 5xx right after the agent's write (EmDash re-rendering, PHP-FPM busy under
    // six parallel runs) is the stand's condition, not the agent's page: wait (≤ 90 s) until the home page answers, then judge.
    {
      const s0 = Date.now()
      let code = 0
      for (let i = 0; i < 30; i++) {
        code = fetchLive(label, '/').status
        if (code >= 200 && code < 500) break
        await sleep(3000)
      }
      if (Date.now() - s0 > 1500) {
        log(c.id, `site settled after ${Math.round((Date.now() - s0) / 1000)} s (home ${code})`)
        result.settleMs = Date.now() - s0
      }
    }
    const verdict = await judgeAsync(c.oracle, site, {
      answer: answerAll,
      baseline,
      asked,
      browser,
      strict: Boolean(c.role),
      fetchPage: recorder(dir, 'final')
    })
    result.pass =
      verdict.pass &&
      result.turns.every((x) => (x.checks ?? []).every((k) => k.pass) && (!x.check || x.check.pass))
    // The same verdict with a label and its value laid out apart on the page (oracle.mjs `loose`).
    result.passLoose =
      (verdict.passLoose ?? verdict.pass) &&
      result.turns.every(
        (x) =>
          (x.checks ?? []).every((k) => k.passLoose ?? k.pass) &&
          (!x.check || (x.check.passLoose ?? x.check.pass))
      )
    // The second verdict: where the platform has no door, an unchanged site plus an honest answer is
    // right (refuseOk); where the request means two things, asking back is right (askOk).
    if (c.unchangedPages === 'oracle') {
      const now = baselineOf(site, [c.oracle, ...(c.turnOracles ?? [])], pageOpts)
      const names = Object.keys(now).filter((k) => !k.includes(':'))
      result.unchangedPages = Object.fromEntries(names.map((k) => [k, now[k] === baseline[k]]))
      result.unchanged = names.every((k) => now[k] === baseline[k])
    } else {
      const homeNow = baselineOf(site).home
      result.unchanged = homeNow === baseline.home
    }
    result.acceptable =
      result.pass || (Boolean(c.refuseOk) && result.unchanged) || (Boolean(c.askOk) && asked)
    result.checks = verdict.checks
    // Trace budget: judged from the same session log, kept NEXT TO the page verdict and never folded into
    // pass/acceptable (a slow correct run is still correct; the budget says how slow).
    if (c.budget) result.budgetCheck = judgeBudget(c.budget, list)
    // v6: which preset the session really ran — the last one selected before turn 1, from its own log.
    if (c.role) {
      const ran = presetFromEvents(list)
      result.preset = ran.preset
      if (!pickerHidden && ran.preset !== `${c.role}-${site.platform}`)
        result.error = `RUNNER: mode — the session ran on ${ran.preset}, not ${c.role}-${site.platform} (selected: ${ran.selected.map((x) => x.preset).join(' → ') || 'none'})`
    }
    await page.screenshot({ path: `${dir}/chat.png` })
    // v7: only when the page threw something of its own (a file beside the result, never a result field).
    if (pageErrors.length) writeFileSync(`${dir}/page-errors.json`, JSON.stringify(pageErrors, null, 1))
    await ctx.close()
    log(
      c.id,
      result.outcome,
      result.pass ? 'PASS' : result.acceptable ? 'OK-REFUSE/ASK' : 'FAIL',
      `${Math.round(result.wallMs / 1000)}s`,
      `${lastSteps} steps`,
      result.asked ? '(asked)' : '',
      ...(result.budgetCheck
        ? [`budget ${result.budgetCheck.pass ? 'ok' : `OVER: ${result.budgetCheck.failures.join('; ')}`}`]
        : [])
    )
  } catch (error) {
    result.error = String(error?.stack ?? error).slice(0, 800)
    releaseAll()
    // An agent left running would keep writing into the next case's restored site: stop it, as a customer would.
    if (livePage) await stopGenerating(livePage, 3000).catch(() => {})
    // What the page looked like when the runner gave up (v5: pick and picture turns have new ways to fail).
    if (livePage) await livePage.screenshot({ path: `${dir}/error.png` }).catch(() => {})
    // v7: and what it said in words (composer, tabs, pills, cards, operator switches) plus its own errors.
    if (livePage) {
      try {
        writeFileSync(
          `${dir}/error-ui.json`,
          JSON.stringify({ ui: await uiState(livePage), pageErrors: livePageErrors ?? [] }, null, 1)
        )
      } catch {}
    }
    // 29/09: what the agent did before the error is evidence too — an agent loop (AGENT: …) is the agent's failure and needs its trace.
    if (result.session) {
      try {
        const text = events(result.session).text
        if (text) writeFileSync(`${dir}/session.jsonl`, text)
      } catch {}
    }
    log(c.id, 'ERROR', result.error.split('\n')[0])
  }
  writeFileSync(`${dir}/result.json`, JSON.stringify(result, null, 2))
  // v6: the speed microscope, per case, in its own process (a trace bug can never stop the run).
  if (TRACE) {
    const tr = spawnSync(process.execPath, [`${HERE}/trace.mjs`, dir], { encoding: 'utf8', timeout: 120000 })
    if (tr.status !== 0)
      log(
        c.id,
        'trace failed:',
        String(tr.stderr || tr.error || '')
          .split('\n')[0]
          .slice(0, 200)
      )
  }
  // Files-tab uploads live in the site folder, which snap.sh does not restore: take them out again.
  if (uploaded.length)
    spawnSync('docker', ['exec', 'tracy-dsh', 'rm', '-f', ...uploaded.map((n) => `/site/${label}/${n}`)], {
      timeout: 30000
    })
}
await browser.close()
if (RESTORE) execFileSync(`${HERE}/snap.sh`, ['restore', label], { stdio: 'ignore', timeout: 180000 })
log('done')
