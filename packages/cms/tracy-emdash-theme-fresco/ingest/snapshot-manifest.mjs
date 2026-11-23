#!/usr/bin/env node
// source/snapshot is NOT committed (22 MB: a mirror of the source site plus the pictures its pages cite). This tool writes
// and checks `source/snapshot-SHA256SUMS` (`<sha256>  <path>` lines, sorted by path; `sha256sum -c` works from inside source/snapshot/), the small text record the gates read in its place.
//   node ingest/snapshot-manifest.mjs write <snapshot-dir> source/snapshot-SHA256SUMS
//   node ingest/snapshot-manifest.mjs verify <snapshot-dir> source/snapshot-SHA256SUMS     exit 1 = the folder differs
//   node ingest/snapshot-manifest.mjs missing <snapshot-dir> source/snapshot-SHA256SUMS    paths the manifest names that the folder lacks
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [cmd, dir, file] = process.argv.slice(2)
if (!['write', 'verify', 'missing'].includes(cmd) || !dir || !file) {
  console.error('usage: snapshot-manifest.mjs write|verify|missing <snapshot-dir> <SHA256SUMS>')
  process.exit(2)
}
const walk = (d, base = d) =>
  readdirSync(d).flatMap((n) => {
    const p = path.join(d, n)
    return statSync(p).isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')]
  })
const sha = (p) =>
  createHash('sha256')
    .update(readFileSync(path.join(dir, p)))
    .digest('hex')
const have = new Set(walk(dir))
if (cmd === 'write') {
  writeFileSync(
    file,
    [...have]
      .sort()
      .map((p) => `${sha(p)}  ${p}`)
      .join('\n') + '\n'
  )
  console.log(`snapshot-manifest: ${have.size} files`)
} else {
  const want = Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => [l.slice(66), l.slice(0, 64)])
  )
  const missing = Object.keys(want).filter((p) => !have.has(p))
  if (cmd === 'missing') {
    for (const p of missing) console.log(p)
    process.exit(0)
  }
  const extra = [...have].filter((p) => !(p in want))
  const changed = Object.keys(want).filter((p) => have.has(p) && sha(p) !== want[p])
  console.log(
    `snapshot-manifest verify: missing=${missing.length} extra=${extra.length} changed=${changed.length}`
  )
  process.exit(missing.length || extra.length || changed.length ? 1 : 0)
}
