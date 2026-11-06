#!/usr/bin/env node
// The counts the docs quote — regression tests, kit tools, reference packets, invariants — measured
// from the tree and compared with every file that states them. A number typed into a doc goes stale
// the day after: SKILL.md said "184 regression tests" while the suite had grown past 300, and read
// as fact. Skill-level, like check-kit-sync.mjs: not kit-owned, never copied into a template.
//
//   node scripts/check-docs-numbers.mjs [--json]     exit 1 on a mismatch (`npm run test:docs`)
//
// What counts:
//   regressionTests  `test(` / `it(` calls that open a line, across the files `test-kit.mjs` runs
//                    (scripts/tests/*.test.mjs). Static: a test declared in a loop counts once here.
//   tools            entries of scripts/tools/ (files and the content-api/ directory) — the kit a
//                    template copies; each must also have a row in references/tools.md.
//   packets          references/**/*.md
//   invariants       the numbered list under SKILL.md's "## <N> invariants" heading, which must run
//                    1..N in order.
// Also: every relative markdown link in SKILL.md, references/**/*.md and the root README/AGENTS/
// INSTALL resolves to a file or directory.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
const toNumber = (s) => (/^\d+$/.test(s) ? Number(s) : WORDS.indexOf(s.toLowerCase()))

function walk(dir, pick) {
  const out = []
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules') continue
    const p = path.join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p, pick))
    else if (pick(p)) out.push(p)
  }
  return out
}

function invariantsOf(skillMd) {
  const at = skillMd.search(/^## \w+ invariants/m)
  if (at < 0) return { count: 0, numbers: [] }
  const body = skillMd.slice(at).split(/\n## /)[0].slice(3)
  const numbers = [...body.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]))
  return { count: numbers.length, numbers }
}

export function measure(skill = SKILL) {
  const tests = path.join(skill, 'scripts', 'tests')
  const regressionTests = readdirSync(tests)
    .filter((f) => f.endsWith('.test.mjs'))
    .reduce((n, f) => n + (readFileSync(path.join(tests, f), 'utf8').match(/^\s*(?:test|it)(?:\.\w+)?\(/gm) ?? []).length, 0)
  const toolEntries = readdirSync(path.join(skill, 'scripts', 'tools')).sort()
  const packets = walk(path.join(skill, 'references'), (p) => p.endsWith('.md')).length
  const inv = invariantsOf(readFileSync(path.join(skill, 'SKILL.md'), 'utf8'))
  return { regressionTests, tools: toolEntries.length, toolEntries, packets, invariants: inv.count, invariantNumbers: inv.numbers }
}

/** Files that quote a count, and the regex that reads it. Add a line when a doc starts quoting one. */
const QUOTES = [
  { file: 'SKILL.md', key: 'regressionTests', re: /kit's (\d+) regression tests/ },
  { file: 'SKILL.md', key: 'invariants', re: /^## (\w+) invariants/m },
  { file: 'references/tools.md', key: 'tools', re: /There are (\d+) entries in `scripts\/tools\/`/ },
  { file: '../../README.md', key: 'invariants', re: /the (\w+) invariants/ },
  { file: '../../README.md', key: 'packets', re: /references\/\s+(\d+) packets/ },
  { file: '../../AGENTS.md', key: 'invariants', re: /the (\w+) invariants/ }
]

const DOCS = (skill) => [
  path.join(skill, 'SKILL.md'),
  ...walk(path.join(skill, 'references'), (p) => p.endsWith('.md')),
  ...['README.md', 'AGENTS.md', 'INSTALL.md'].map((f) => path.join(skill, '..', '..', f))
]

/** Relative links `[..](target)` whose target does not exist. Code spans and fenced blocks are skipped. */
export function brokenLinks(skill = SKILL) {
  const out = []
  for (const file of DOCS(skill)) {
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0]
      if (!target || /^[a-z]+:/i.test(m[1])) continue
      if (!existsSync(path.resolve(path.dirname(file), target)))
        out.push(`${path.relative(skill, file)} links to ${m[1]}, which does not exist`)
    }
  }
  return out
}

export function check(skill = SKILL) {
  const m = measure(skill)
  const problems = []
  const gap = m.invariantNumbers.findIndex((n, i) => n !== i + 1)
  if (gap >= 0) problems.push(`SKILL.md invariants are numbered ${m.invariantNumbers.join(',')} — expected 1..${m.invariants} in order`)
  for (const q of QUOTES) {
    let text
    try {
      text = readFileSync(path.join(skill, q.file), 'utf8')
    } catch {
      problems.push(`${q.file} is missing`)
      continue
    }
    const hit = q.re.exec(text)
    // A quote that is reworded away must be removed here too, or the check silently stops checking.
    if (!hit) problems.push(`${q.file}: no ${q.key} quote matching ${q.re} — reword the doc or update QUOTES`)
    else if (toNumber(hit[1]) !== m[q.key]) problems.push(`${q.file} says ${hit[1]} ${q.key}, tree has ${m[q.key]}`)
  }
  // A row names the tool in its first cell: `name`, `name <args>` or `name/` (a directory).
  const firstCells = readFileSync(path.join(skill, 'references', 'tools.md'), 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('| `'))
    .map((l) => l.split(' | ')[0])
  for (const t of m.toolEntries) {
    const named = new RegExp('`' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ `/]')
    if (!firstCells.some((c) => named.test(c))) problems.push(`references/tools.md has no row for scripts/tools/${t}`)
  }
  problems.push(...brokenLinks(skill))
  return { measured: m, problems }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { measured, problems } = check()
  if (process.argv.includes('--json')) console.log(JSON.stringify(measured, null, 2))
  else {
    console.log(`docs-numbers: ${measured.regressionTests} regression tests · ${measured.tools} tools · ${measured.packets} packets · ${measured.invariants} invariants`)
    for (const p of problems) console.log(`  !! ${p}`)
  }
  process.exit(problems.length ? 1 : 0)
}
