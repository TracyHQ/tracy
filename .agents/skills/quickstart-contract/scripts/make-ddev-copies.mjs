#!/usr/bin/env node
// Copies two Tracy tools into a DDEV project with their webroot path rewritten, so they can run in
// the DDEV web container without changing Tracy's own code. Tracy's sites keep Joomla at
// /var/www/html; a DDEV project mounts at /var/www/html with Joomla in web/.
//   dump-inventory.php  -> <site>/dump-inventory-ddev.php   exactly 1 line changed
//   joomla-bootstrap.php -> <site>/joomla-bootstrap-ddev.php exactly 2 lines changed
// The require must be the whole line, as in the source today; the webroot the bootstrap is handed
// (`'webroot' => …`, what its retry reads) is matched inside its line. Each rewrite must hit exactly once; any other count means the source moved under us: fail
// and leave neither copy behind.
//
// Usage: node make-ddev-copies.mjs --tch <tch checkout> --site <DDEV project dir>
// Prints one JSON line on stdout; exit 0 = pass, 1 = fail.

import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const REQUIRE_FROM = "require '/var/www/html/configuration.php';"
const REQUIRE_TO = "require '/var/www/html/web/configuration.php';"
const RETRY_FROM = "'webroot' => '/var/www/html',"
const RETRY_TO = "'webroot' => '/var/www/html/web',"

const COPIES = [
  {
    source: 'packages/cms/tracy-joomla-quickstart/scripts/dump-inventory.php',
    target: 'dump-inventory-ddev.php',
    replace: [[REQUIRE_FROM, REQUIRE_TO, 'line']],
    expected: 1
  },
  {
    source: 'packages/fleet/tracy-fleet-operation/scripts/provision/joomla-bootstrap.php',
    target: 'joomla-bootstrap-ddev.php',
    replace: [
      [REQUIRE_FROM, REQUIRE_TO, 'line'],
      [RETRY_FROM, RETRY_TO, 'part']
    ],
    expected: 2
  }
]

function finish(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exit(result.ok ? 0 : 1)
}

function fail(message, extra = {}) {
  process.stderr.write(`make-ddev-copies: ${message}\n`)
  finish({ ok: false, error: message, ...extra })
}

let args
try {
  ;({ values: args } = parseArgs({ options: { tch: { type: 'string' }, site: { type: 'string' } } }))
} catch (error) {
  fail(error.message)
}
if (!args.tch || !args.site) fail('--tch and --site are required')

const targets = COPIES.map((c) => join(args.site, c.target))
const removeCopies = () => {
  for (const t of targets) rmSync(t, { force: true })
}

// Build every copy in memory first; nothing is written unless all of them pass.
const results = []
for (const copy of COPIES) {
  let text
  try {
    text = readFileSync(join(args.tch, copy.source), 'utf8')
  } catch (error) {
    removeCopies()
    fail(`cannot read ${copy.source}: ${error.message}`)
  }
  const before = text.split('\n')
  // Each rewrite must hit exactly once on its own: a total line count alone lets a missing rewrite
  // hide behind a second hit of another one (say the retry string also sitting in a comment).
  const hits = copy.replace.map(() => 0)
  const after = before.map((line) =>
    copy.replace.reduce((l, [from, to, scope], r) => {
      if (scope === 'line') {
        if (l.trim() !== from) return l
        hits[r] += 1
        return l.replace(from, to)
      }
      hits[r] += l.split(from).length - 1
      return l.split(from).join(to)
    }, line)
  )
  const changed = []
  after.forEach((line, i) => {
    if (line !== before[i]) changed.push({ line: i + 1, from: before[i].trim(), to: line.trim() })
  })
  const rewrites = copy.replace.map(([from], r) => ({ from, hits: hits[r] }))
  const ok = changed.length === copy.expected && rewrites.every((w) => w.hits === 1)
  results.push({ ...copy, text: after.join('\n'), changed, rewrites, ok })
}

const report = results.map(({ source, target, expected, changed, rewrites, ok }) => ({
  source,
  target: join(args.site, target),
  expected,
  changedLines: changed.length,
  changed,
  rewrites,
  ok
}))

if (!results.every((r) => r.ok)) {
  removeCopies()
  for (const r of report.filter((r) => !r.ok)) {
    const hits = r.rewrites.map((w) => `${w.from} ${w.hits}x`).join(', ')
    process.stderr.write(
      `make-ddev-copies: ${r.source}: expected ${r.expected} changed line(s), each rewrite once; got ${r.changedLines} line(s), ${hits}; no copy left\n`
    )
  }
  finish({ ok: false, copies: report })
}

try {
  results.forEach((r, i) => {
    writeFileSync(targets[i], r.text)
  })
} catch (error) {
  removeCopies()
  fail(`cannot write copies into ${args.site}: ${error.message}`)
}
finish({ ok: true, copies: report })
