// node perf/carry-notes.mjs <old-run> <new-run>: carries the lens notes, fix and close files of an earlier run onto a new run whose shots are
// byte-identical (a rebuild that changed no pixel: formatting, tooling). Rewrites tile paths and Seen hashes per shot; lines about a shot whose
// bytes differ are dropped (a reader must open it again), and the file times are kept (the merge applies fix and close rows in mtime order).
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'

const [oldRun, newRun] = process.argv.slice(2).map((p) => path.resolve(p))
const idx = (run) =>
  Object.fromEntries(
    JSON.parse(readFileSync(`${run}/index.json`, 'utf8')).shots.map((s) => [path.basename(s.file, '.png'), s])
  )
const a = idx(oldRun)
const b = idx(newRun)
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')
const same = new Set(
  Object.keys(b).filter((k) => a[k] && existsSync(a[k].file) && sha(a[k].file) === sha(b[k].file))
)
const changed = Object.keys(b).filter((k) => !same.has(k))
const re = new RegExp(`${oldRun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/shots/([^/\\s|]+)/(\\d+\\.png)`)
const reAll = new RegExp(re.source, 'g')
mkdirSync(`${newRun}/notes`, { recursive: true })
let lines = 0
for (const f of readdirSync(`${oldRun}/notes`).filter((x) => x.endsWith('.md') && x !== 'machine.md')) {
  const out = []
  for (const line of readFileSync(`${oldRun}/notes/${f}`, 'utf8').split('\n')) {
    const m = re.exec(line)
    if (m) {
      if (!same.has(m[1])) continue
      let l = line.replace(reAll, (_, k, n) => `${newRun}/shots/${k}/${n}`)
      if (a[m[1]]?.hash && b[m[1]]?.hash) l = l.split(a[m[1]].hash).join(b[m[1]].hash)
      out.push(l)
      lines++
    } else out.push(line)
  }
  const dest = `${newRun}/notes/${f}`
  writeFileSync(dest, out.join('\n'))
  const st = statSync(`${oldRun}/notes/${f}`)
  utimesSync(dest, st.atime, st.mtime)
}
console.log(
  `carry-notes: ${lines} tile line(s) carried, ${same.size} shot(s) identical, ${changed.length} changed${changed.length ? `: ${changed.slice(0, 12).join(', ')}` : ''}`
)
