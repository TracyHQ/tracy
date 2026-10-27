/**
 * Backup download on a deployment: an Owner exports a backup point, downloads the zip and verifies
 * it (plan tasks/todo-backup-export.md, PR #1185). Env: ORIGIN (https://cowork.tracy.site), SITE_KEY
 * (a WordPress/Joomla site), OWNER_EMAIL + SESSION_SECRET (a session is minted, no OTP typed), or
 * TRACY_SESS (a ready cookie). Prints TAP-like lines; exits 1 on any failure.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ORIGIN = (process.env.ORIGIN ?? 'https://cowork.tracy.site').replace(/\/$/, '')
const KEY = process.env.SITE_KEY ?? ''
let sess = process.env.TRACY_SESS ?? ''
if (!sess) {
  const { mintSession } = await import(`${ROOT}/apps/tracy-web/src/lib/session.js`)
  sess = await mintSession(process.env.OWNER_EMAIL, process.env.SESSION_SECRET)
}
let failures = 0
const say = (ok, label, got) => {
  process.stdout.write(
    `${ok ? 'ok' : 'not ok'} - ${label}${ok || got === undefined ? '' : `: got ${JSON.stringify(got)}`}\n`
  )
  if (!ok) failures++
}
const api = async (p, init = {}) => {
  const r = await fetch(ORIGIN + p, {
    ...init,
    headers: { cookie: `tracy_sess=${sess}`, ...(init.body ? { 'content-type': 'application/json' } : {}) }
  })
  let j = null
  try {
    j = await r.json()
  } catch {}
  return { status: r.status, json: j }
}
const b = await api(`/api/sites/${KEY}/backups`)
say(b.status === 200, 'B1: GET /backups answers', b.status)
say(b.json?.may?.export === true, 'B1: may.export is true on this deployment', b.json?.may)
let full = (b.json?.rows || []).find((r) => r.database?.state === 'full')
if (!full) {
  const c = await api(`/api/sites/${KEY}/backup`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Backup download check' })
  })
  say(c.status === 200, 'B1: a backup was created for the check', c.json)
  full = ((await api(`/api/sites/${KEY}/backups`)).json?.rows || []).find((r) => r.database?.state === 'full')
}
say(Boolean(full), 'B1: a full backup point exists', full?.version)
const V = full?.version
const t0 = Date.now()
const e = await api(`/api/sites/${KEY}/backups/${V}/export`, { method: 'POST' })
say(e.status === 202 && e.json?.exportId, 'B2: POST export answers 202 queued', e.json)
const id = e.json?.exportId
let view = null
const states = []
for (let i = 0; i < 240 && id; i++) {
  view = (await api(`/api/sites/${KEY}/backups/${V}/export/${id}`)).json
  if (states.at(-1) !== view?.state) states.push(view?.state)
  if (['ready', 'failed', 'expired'].includes(view?.state)) break
  await new Promise((r) => setTimeout(r, 3000))
}
const secs = ((Date.now() - t0) / 1000).toFixed(1)
say(view?.state === 'ready', `B2: export ready (${states.join('→')} in ${secs}s)`, view?.error ?? view?.state)
say(
  Boolean(view?.url && view?.bytes && view?.sha256 && view?.expiresAt),
  'B2: ready view carries url, bytes, sha256, expiresAt'
)
if (view?.url) {
  const r = await fetch(view.url)
  const buf = Buffer.from(await r.arrayBuffer())
  say(r.status === 200, 'B3: the link downloads', r.status)
  say(buf.length === view.bytes, 'B3: bytes match', [buf.length, view.bytes])
  say(createHash('sha256').update(buf).digest('hex') === view.sha256, 'B3: sha256 matches')
  say(
    /backup-v\d+\.zip/.test(r.headers.get('content-disposition') || ''),
    'B3: saves as <site>-backup-vN.zip',
    r.headers.get('content-disposition')
  )
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-export-'))
  const zip = path.join(dir, 'export.zip')
  fs.writeFileSync(zip, buf)
  execFileSync('unzip', ['-q', zip, '-d', path.join(dir, 'unz')])
  const files = fs.readdirSync(path.join(dir, 'unz')).sort()
  say(
    ['SHA256SUMS', 'db.sql.gz', 'manifest.json', 'tracy_setting.json', 'webroot.tar'].every((f) =>
      files.includes(f)
    ),
    'B4: the zip holds the five files',
    files
  )
  let sums = true
  for (const line of fs.readFileSync(path.join(dir, 'unz/SHA256SUMS'), 'utf8').trim().split('\n')) {
    const [h, f] = line.trim().split(/\s+\*?/)
    if (
      createHash('sha256')
        .update(fs.readFileSync(path.join(dir, 'unz', f)))
        .digest('hex') !== h
    )
      sums = false
  }
  say(sums, 'B4: SHA256SUMS verify')
  const BIG = { maxBuffer: 256 * 1024 * 1024 }
  const tar = execFileSync('tar', ['-tf', path.join(dir, 'unz/webroot.tar')], BIG)
    .toString()
    .split('\n')
  const cfgName = tar.find((l) => /^(\.\/)?(wp-config\.php|configuration\.php)$/.test(l))
  say(
    Boolean(cfgName),
    'B4: webroot.tar carries the config file at its root',
    tar.filter((l) => /config/.test(l)).slice(0, 3)
  )
  const cfg = cfgName
    ? execFileSync('tar', ['-xOf', path.join(dir, 'unz/webroot.tar'), cfgName], BIG).toString()
    : ''
  say(
    (cfg.match(/tracy-placeholder/g) || []).length >= 4,
    'B4: the config file carries DB placeholders',
    (cfg.match(/tracy-placeholder/g) || []).length
  )
  const head = execFileSync('sh', [
    '-c',
    `gzip -dc "${path.join(dir, 'unz/db.sql.gz')}" | head -c 4000`
  ]).toString()
  say(!/CREATE DATABASE|^USE /m.test(head), 'B4: the dump has no CREATE DATABASE / USE')
  process.stdout.write(`# zip ${buf.length} bytes, ready in ${secs}s, kept at ${zip}\n`)
}
process.stdout.write(failures ? `${failures} CHECK(S) FAILED\n` : 'ALL CHECKS PASSED\n')
process.exit(failures ? 1 : 0)
