#!/usr/bin/env node
// Runs one regression case of tests/regression/cases/ as its own steps say (S1–S4: deterministic
// commands, no model) and writes its verdict into --out. Read-only towards the repository: it never
// writes tests/regression/results or .runs (the catalogue is a separate engineer's).
//
//   regression-run.mjs --case REG-PR-948-site-publish-flow --out DIR [--repo ROOT] [--database-url URL]
//
// Verdict (exit): PASS (0) only when every `expect` line holds; BLOCKED (3) when step S2 needs
// PostgreSQL and --database-url is not given or no database answered; FAIL (1) otherwise; 2 for a
// bad invocation or a case that does not have the S1–S4 shape this driver reads.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const usage = (message) => {
  console.error(`regression-run: ${message}`)
  process.exit(2)
}
let args
try {
  args = parseArgs({
    options: {
      case: { type: 'string' },
      out: { type: 'string' },
      repo: { type: 'string', default: process.cwd() },
      'database-url': { type: 'string' }
    },
    allowPositionals: false,
    strict: true
  }).values
} catch (error) {
  usage(error.message)
}
if (!args.case || !args.out) usage('--case and --out are required')
if (!/^REG-[A-Za-z0-9._-]+$/.test(args.case)) usage('bad --case')
const ROOT = path.resolve(args.repo)
const OUT = path.resolve(args.out)
const ID = args.case
const BIG = 64 * 1024 * 1024
const { parseCase } = await import(pathToFileURL(path.join(ROOT, 'tests/regression/catalogue.mjs')).href)
const casePath = `tests/regression/cases/${ID}.json`
if (!existsSync(path.join(ROOT, casePath))) usage(`${casePath} does not exist in this tree`)
const parsed = parseCase(readTextSync(path.join(ROOT, casePath)), casePath)
if (parsed.problems?.length) {
  console.error(`regression-run: the case does not validate: ${parsed.problems.join('; ')}`)
  process.exit(2)
}
const git = (args) => {
  const out = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: BIG })
  if (out.status !== 0) throw new Error(`git ${args.join(' ')}: ${out.stderr}`)
  return out.stdout.trim()
}
const commit = git(['rev-parse', 'HEAD'])
const dirty = git(['status', '--porcelain', '--untracked-files=no']) !== ''
const log = []
const say = (line) => {
  log.push(line)
  console.log(line)
}
function suite(files, { postgres }) {
  const env = {
    ...process.env,
    NODE_TEST_CONTEXT: undefined,
    TEST_DATABASE_URL: postgres ? (args['database-url'] ?? '') : ''
  }
  const out = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', '--test-timeout=120000', ...files],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: BIG,
      timeout: 900_000,
      env
    }
  )
  const text = `${out.stdout}${out.stderr}`
  const count = (name) => Number(new RegExp(`^# ${name} (\\d+)`, 'm').exec(text)?.[1] ?? Number.NaN)
  const summary = Number.isNaN(count('tests'))
    ? null
    : [
        null,
        null,
        String(count('tests')),
        String(count('pass')),
        String(count('fail')),
        String(count('skipped'))
      ]
  return { exit: out.status, text, summary, error: out.error }
}
/** `ok` when a TAP result line of a test whose name starts with `prefix` reads ok; else what was found. */
const resultOf = (text, prefix) => {
  const lines = text.split('\n').filter((line) => /^(not ok|ok) \d+ - /.test(line))
  const mine = lines.filter((line) => line.replace(/^(not ok|ok) \d+ - /, '').startsWith(prefix))
  if (mine.length === 0) return 'absent'
  return mine.every((line) => line.startsWith('ok ')) ? 'ok' : 'not ok'
}
/** `'<prefix>' (NAME)` pairs out of a step's text, in the case's own words. */
const named = (step) =>
  [...step.matchAll(/(?:'((?:[^'\\]|\\.)+)'|"((?:[^"\\]|\\.)+)") \(([A-Z0-9]+)\)/g)].map((m) => [
    m[3],
    m[1] ?? m[2]
  ])

let verdict = 'PASS'
const fail = (why) => {
  verdict = verdict === 'BLOCKED' ? verdict : 'FAIL'
  say(`  ✗ ${why}`)
}
const steps = parsed.value.steps
say(
  `${ID} on ${commit}${dirty ? ' + working-tree changes not yet committed' : ''} at ${new Date().toISOString()}`
)

/** The test files a step's command names, in the case's own words. */
const filesOf = (step) => step.match(/\S+\.test\.mjs/g) ?? []
const s1Files = filesOf(steps[0])
const s2Files = filesOf(steps[1])
if (s1Files.length === 0 || s2Files.length === 0) {
  console.error('regression-run: could not read the test files out of steps S1 and S2')
  process.exit(2)
}

say('S1 (no database)')
const s1 = suite(s1Files, { postgres: false })
say(`  EXIT1=${s1.exit} FAIL1=${s1.summary?.[4]} SKIP1=${s1.summary?.[5]} (tests ${s1.summary?.[2]})`)
if (s1.exit !== 0 || s1.summary?.[4] !== '0' || s1.summary?.[5] !== '0')
  fail('S1 is not exit 0 / fail 0 / skipped 0')

say('S2 (PostgreSQL)')
const s2 = args['database-url'] ? suite(s2Files, { postgres: true }) : { exit: null, text: '', summary: null }
if (!s2.summary) {
  verdict = 'BLOCKED'
  say(
    `  no PostgreSQL could be had: ${args['database-url'] ? (s2.error?.message ?? 'the suite printed no summary') : '--database-url not given'}`
  )
} else {
  say(`  EXIT2=${s2.exit} FAIL2=${s2.summary[4]} SKIP2=${s2.summary[5]} (tests ${s2.summary[2]})`)
  if (s2.exit !== 0 || s2.summary[4] !== '0' || s2.summary[5] !== '0')
    fail('S2 is not exit 0 / fail 0 / skipped 0')
}

for (const [label, step, text] of [
  ['S3', steps[2], s2.text],
  ['S4', steps[3], s1.text]
]) {
  say(label)
  const wanted = named(step)
  if (wanted.length < 5) fail(`${label}: could not read the test names out of the case`)
  // Every name the case's `expect` lists must have been read out of its step, and the other way round.
  const expected = (
    parsed.value.expect[label === 'S3' ? 2 : 3].split(' are each')[0].match(/\b[A-Z][A-Z0-9]{2,}\b/g) ?? []
  ).filter((word) => !['EXIT1', 'EXIT2', 'FAIL1', 'FAIL2', 'SKIP1', 'SKIP2', 'PUBLISH_BUSY'].includes(word))
  const read = wanted.map(([name]) => name)
  if (expected.join(',') !== read.join(','))
    fail(
      `${label}: the names the step reads (${read.join(' ')}) are not the names the expectation lists (${expected.join(' ')})`
    )
  for (const [name, prefix] of wanted) {
    const got = resultOf(text, prefix)
    say(`  ${name}=${got}`)
    if (got !== 'ok') fail(`${name} is ${got}: ${prefix}`)
  }
}

say(`verdict ${verdict}`)
mkdirSync(OUT, { recursive: true })
writeFileSync(
  path.join(OUT, `${ID}.log`),
  `${log.join('\n')}\n\n── S1 output ──\n${s1.text}\n── S2 output ──\n${s2.text}\n`
)
writeFileSync(
  path.join(OUT, `${ID}.json`),
  `${JSON.stringify({ id: ID, verdict, commit, dirty, at: new Date().toISOString() }, null, 2)}\n`
)
process.exit(verdict === 'PASS' ? 0 : verdict === 'BLOCKED' ? 3 : 1)
