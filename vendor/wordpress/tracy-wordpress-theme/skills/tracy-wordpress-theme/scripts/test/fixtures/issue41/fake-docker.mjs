#!/usr/bin/env node
// A `docker` stand-in for the joomla-dump.mjs test of #41: it answers the three statements the dump
// sends through `docker exec … mariadb … -e <sql>` from the tables in $FAKE_JOOMLA_DB (a JSON file
// `{ "<table>": [ {column: value} ] }`, prefixed names): SHOW TABLES, SHOW COLUMNS FROM `t` (a table
// that is not there fails, as mariadb does), and SELECT JSON_OBJECT('c', CAST(`c` AS CHAR), …)
// FROM `t`, with or without the WHERE forms `c = 'v'` and `c IN ('v', …)` (a NULL is never equal). A table named in the file's `__fail__` object
// (`{ "<table>": "<mariadb error>" }`) fails SHOW COLUMNS with that error — a table that is there but
// cannot be read. `__columns__` (`{ "<table>": [column] }`) is what SHOW COLUMNS answers for that
// table instead of the keys of its first row; `__lines__` (`{ "<table>": [line] }`) is printed after
// the rows of its SELECT, as a client that prints something else would; a table in `__hang__` (a list)
// never answers its SELECT, as a stuck database would. Every statement is appended
// to $FAKE_JOOMLA_DB.sql.
//
// `… php -r <code> -- <file> <fields>` (the web server, reading configuration.php) is answered from
// the file's `__php__`: `{ "configuration": "<path>" }` runs the real `php` on that file instead of
// <file> (the code and fields as sent), `{ "print": "<text>" }` prints the text as a php that ignores
// the field list would, `{ "fail": "<error>", "status": N }` fails with it (exit N, 1 if not given); no `__php__` fails as a container
// without php. The argv (code, file, fields) is appended to $FAKE_JOOMLA_DB.php as one JSON line.
// Anything else exits 3.
import { appendFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const db = JSON.parse(readFileSync(process.env.FAKE_JOOMLA_DB, 'utf8'))
const argv = process.argv.slice(2)
const php = argv.indexOf('php')
if (php !== -1 && argv[php + 1] === '-r') {
  const [code, dashes, file, fields] = argv.slice(php + 2)
  appendFileSync(`${process.env.FAKE_JOOMLA_DB}.php`, JSON.stringify({ target: argv.slice(0, php), code, dashes, file, fields }) + '\n')
  const web = db.__php__
  if (!web) {
    process.stderr.write('OCI runtime exec failed: exec: "php": executable file not found in $PATH\n')
    process.exit(127)
  }
  if (web.fail !== undefined) {
    process.stderr.write(`${web.fail}\n`)
    process.exit(web.status ?? 1)
  }
  if (web.print !== undefined) {
    process.stdout.write(web.print)
    process.exit(0)
  }
  const r = spawnSync('php', ['-r', code, '--', web.configuration, fields], { encoding: 'utf8' })
  process.stdout.write(r.stdout ?? '')
  process.stderr.write(r.stderr ?? '')
  process.exit(r.status ?? 1)
}
const sql = argv[argv.indexOf('-e') + 1] ?? ''
appendFileSync(`${process.env.FAKE_JOOMLA_DB}.sql`, sql + '\n')
const done = (lines) => {
  process.stdout.write(lines.map((l) => l + '\n').join(''))
  process.exit(0)
}
const fail = db.__fail__ ?? {}
const columns = db.__columns__ ?? {}
const extra = db.__lines__ ?? {}
const hang = db.__hang__ ?? []
for (const k of ['__fail__', '__columns__', '__lines__', '__hang__', '__php__']) delete db[k]
if (/^SHOW TABLES$/i.test(sql.trim())) done(Object.keys(db))
let m = /^SHOW COLUMNS FROM `([^`]+)`$/i.exec(sql.trim())
if (m) {
  if (fail[m[1]]) {
    process.stderr.write(`${fail[m[1]]}\n`)
    process.exit(1)
  }
  if (!db[m[1]]) {
    process.stderr.write(`ERROR 1146 (42S02): Table '${m[1]}' doesn't exist\n`)
    process.exit(1)
  }
  done((columns[m[1]] ?? Object.keys(db[m[1]][0] ?? {})).map((c) => `${c}\tvarchar(255)\tNO\t\t\t`))
}
m = /^SELECT JSON_OBJECT\((.*)\) FROM `([^`]+)`(?: WHERE (.*))?$/is.exec(sql.trim())
if (m && hang.includes(m[2])) setInterval(() => {}, 1000)
else if (m) {
  const cols = [...m[1].matchAll(/'([^']+)', CAST\(`([^`]+)` AS CHAR\)/g)].map((x) => x[2])
  let rows = db[m[2]] ?? []
  const where = m[3]?.trim()
  if (where) {
    const eq = /^(\w+) = '([^']*)'$/.exec(where)
    const inList = /^(\w+) IN \((.*)\)$/.exec(where)
    if (eq) rows = rows.filter((r) => String(r[eq[1]]) === eq[2])
    else if (inList) {
      const vals = [...inList[2].matchAll(/'([^']*)'/g)].map((x) => x[1])
      rows = rows.filter((r) => vals.includes(String(r[inList[1]])))
    } else {
      process.stderr.write(`fake-docker: WHERE ${where} not understood\n`)
      process.exit(3)
    }
  }
  done([...rows.map((r) => JSON.stringify(Object.fromEntries(cols.map((c) => [c, r[c] === null || r[c] === undefined ? null : String(r[c])])))), ...(extra[m[2]] ?? [])])
} else {
  process.stderr.write(`fake-docker: no answer for ${sql}\n`)
  process.exit(3)
}
