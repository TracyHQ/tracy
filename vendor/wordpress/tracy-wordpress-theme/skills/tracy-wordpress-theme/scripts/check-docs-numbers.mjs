#!/usr/bin/env node
// The counts the docs quote — tests, scripts, reference packets, gotcha numbering — measured from
// the tree and compared with every file that states them. A number typed into a README goes stale
// the day after; three copies (README, INSTALL, the TCH IMPORT-NOTE) disagreed by 100+ tests on
// 14/09 while each one read as fact. Run with `--json` for the counts, with no flag as a gate
// (exit 1 on a mismatch). `npm test` runs it.
//
// What counts: testCalls = `test(` calls across scripts/test/*.test.mjs (static — the runtime
// number `npm test` prints is higher, tests in loops count once here; docs quote the runtime one
// only where it is re-measured at pin time, the TCH IMPORT-NOTE); scripts = every .mjs/.sh/.py under scripts/ outside
// test/; packets = references/**/*.md; gotchas = `## N.` headings, which must run 1..N without a gap.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir, pick) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    if (e === 'node_modules') continue
    if (statSync(p).isDirectory()) out.push(...walk(p, pick))
    else if (pick(p)) out.push(p)
  }
  return out
}

export function measure(root = ROOT) {
  const testCalls = walk(path.join(root, 'scripts', 'test'), (p) => p.endsWith('.test.mjs')).reduce(
    (n, p) => n + (readFileSync(p, 'utf8').match(/^\s*test\(/gm) ?? []).length,
    0
  )
  const scripts = walk(path.join(root, 'scripts'), (p) => /\.(mjs|sh|py)$/.test(p) && !p.includes(`${path.sep}test${path.sep}`)).length
  const packets = walk(path.join(root, 'references'), (p) => p.endsWith('.md')).length
  const headings = [...readFileSync(path.join(root, 'references', 'gotchas.md'), 'utf8').matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]))
  const gotchaGap = headings.find((n, i) => n !== i + 1) ?? null
  return { testCalls, scripts, packets, gotchas: headings.length, gotchaGap }
}

/** Files that quote a count, and the regex that reads it. Add a line when a doc starts quoting one. */
const QUOTES = [
  { file: '../../README.md', key: 'packets', re: /references\/\s+(\d+) packet/ },
  { file: 'SKILL.md', key: 'gotchas', re: /gotchas\.md\)\s*\((\d+) items\)/ }
]

export function check(root = ROOT) {
  const m = measure(root)
  const problems = []
  if (m.gotchaGap !== null) problems.push(`gotchas.md numbering breaks at ${m.gotchaGap} (expected consecutive from 1)`)
  for (const q of QUOTES) {
    const p = path.join(root, q.file)
    let text
    try {
      text = readFileSync(p, 'utf8')
    } catch {
      continue
    }
    const hit = q.re.exec(text)
    if (hit && Number(hit[1]) !== m[q.key]) problems.push(`${q.file} says ${hit[1]} ${q.key}, tree has ${m[q.key]}`)
  }
  return { measured: m, problems }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { measured, problems } = check()
  if (process.argv.includes('--json')) console.log(JSON.stringify(measured, null, 2))
  else {
    console.log(`docs-numbers: ${measured.testCalls} test calls · ${measured.scripts} scripts · ${measured.packets} packets · gotchas 1–${measured.gotchas}`)
    for (const p of problems) console.log(`  !! ${p}`)
  }
  process.exit(problems.length ? 1 : 0)
}
