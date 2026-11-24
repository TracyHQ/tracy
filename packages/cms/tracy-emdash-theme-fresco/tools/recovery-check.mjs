#!/usr/bin/env node
// Recovery evidence on a RUNNING site you own: an editor's published change survives a server
// restart, and backup.sh → restore.sh brings that change back after it was overwritten. Runs from the
// site directory (data/, uploads/, tools/, dist/). The site is stopped and restarted by this script.
//   node tools/recovery-check.mjs --site <origin> --token-file data/tracy-agent.token --collection <c>
//        --slug <s> --field <text field> --public <path> --out <report.json> [--locale en] [--port <n>]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const site = opt('--site'),
  tokenFile = opt('--token-file', 'data/tracy-agent.token'),
  collection = opt('--collection'),
  slug = opt('--slug')
const field = opt('--field'),
  pub = opt('--public'),
  out = opt('--out'),
  locale = opt('--locale', 'en'),
  port = opt('--port', new URL(site ?? 'http://x').port)
if (!site || !collection || !slug || !field || !pub || !out) {
  console.error(
    'usage: recovery-check.mjs --site <origin> --collection <c> --slug <s> --field <f> --public <path> --out <report.json> [--token-file f] [--locale en]'
  )
  process.exit(2)
}
const token = readFileSync(tokenFile, 'utf8').trim()
const H = { authorization: `Bearer ${token}`, 'X-EmDash-Request': '1', accept: 'application/json' }
async function api(method, route, body) {
  const res = await fetch(`${site}${route}`, {
    method,
    headers: { ...H, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${JSON.stringify(json).slice(0, 200)}`)
  return json.data ?? json
}
async function entry() {
  const d = await api(
    'GET',
    `/_emdash/api/content/${collection}/${encodeURIComponent(slug)}?locale=${locale}`
  )
  const item = d.item ?? d
  return { id: item.id, rev: d._rev, live: item.liveData ?? item.data ?? {} }
}
async function setField(value) {
  const e = await entry()
  const upd = await api('PUT', `/_emdash/api/content/${collection}/${e.id}?locale=${locale}`, {
    data: { ...e.live, [field]: value },
    _rev: e.rev
  })
  await api('POST', `/_emdash/api/content/${collection}/${e.id}/publish?locale=${locale}`, {})
  return upd
}
const publicHas = async (text) => (await fetch(`${site}${pub}`).then((r) => r.text())).includes(text)
const report = { site, collection, slug, field, public: pub, capturedAt: new Date().toISOString(), steps: [] }
const step = (name, pass, detail) => {
  report.steps.push({ name, pass: !!pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`)
}
const serverEntry = path.resolve('dist/server/entry.mjs')
async function stopServer() {
  // Kill whatever LISTENS on the site's port (the server may have been started with a relative path);
  // without -sTCP:LISTEN lsof also lists this script's own client connection.
  try {
    const pids = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
    for (const pid of pids) process.kill(Number(pid), 'SIGTERM')
  } catch {}
  for (let i = 0; i < 20; i++) {
    if (
      !(await fetch(`${site}/`).then(
        () => true,
        () => false
      ))
    )
      return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
async function startServer() {
  const child = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
  for (let i = 0; i < 60; i++) {
    if (
      await fetch(`${site}/`).then(
        (r) => r.ok,
        () => false
      )
    )
      return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
let original
try {
  original = (await entry()).live[field] ?? ''
  const stamp = `Recovery ${Date.now()}`
  await setField(stamp)
  step("editor's change is published", await publicHas(stamp), { original: String(original).slice(0, 40) })
  step('server stopped', await stopServer())
  step('server restarted', await startServer())
  step('published change survives a restart', await publicHas(stamp))
  // backup.sh prints "<archive> <size>" as its last line.
  const archive = execFileSync('bash', ['tools/backup.sh', 'data', 'uploads', 'backups'], {
    encoding: 'utf8'
  })
    .match(/(\S+\.t(?:ar\.)?gz)\s/g)
    ?.pop()
    ?.trim()
  step('backup archive written', Boolean(archive) && existsSync(archive), { archive })
  await setField(`${stamp} overwritten`)
  step('change overwritten after the backup (simulated loss)', await publicHas(`${stamp} overwritten`))
  step('server stopped for restore', await stopServer())
  let restored = false
  try {
    execFileSync('bash', ['tools/restore.sh', archive, 'data', 'uploads'], {
      encoding: 'utf8',
      stdio: 'pipe'
    })
    restored = true
  } catch (error) {
    step('restore.sh', false, { error: String(error.stderr ?? error.message).slice(0, 300) })
  }
  step('server restarted after restore', await startServer())
  step(
    "restore brings the editor's change back",
    restored && (await publicHas(stamp)) && !(await publicHas(`${stamp} overwritten`))
  )
} catch (error) {
  step('recovery check aborted', false, { error: error.message })
} finally {
  try {
    if (original !== undefined) {
      await setField(original)
      step('cleanup: original value republished', !(await publicHas('Recovery ')))
    }
  } catch (error) {
    step('cleanup failed', false, { error: error.message })
  }
}
writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
process.exitCode = report.steps.every((s) => s.pass) ? 0 : 1
