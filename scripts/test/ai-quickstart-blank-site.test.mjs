// The blank site command of the AI quickstart (ADR 0045, ticket #582) run as a command, on an invented installer
// archive holding the demo data fixture of tracy-joomla-quickstart and one template file.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  mappingFile,
  releasedContract
} from '../../packages/cms/tracy-joomla-quickstart/test/fixtures/blank-site/contract.mjs'
import { makeZip } from '../../packages/cms/tracy-joomla-quickstart/test/fixtures/blank-site/make-zip.mjs'
import {
  listEntries,
  readEntry
} from '../../packages/cms/tracy-joomla-quickstart/scripts/zip-replace-entry.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const COMMAND = path.join(ROOT, 'scripts/ai-quickstart/blank-site.mjs')
const DEMO_DATA = readFileSync(
  path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/test/fixtures/blank-site/custom.sql.txt'),
  'utf8'
)

function workdir(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ai-quickstart-blank-site-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const installer = path.join(dir, 'human.zip')
  writeFileSync(
    installer,
    makeZip([
      ['installation/sql/mysql/custom.sql', DEMO_DATA, true],
      ['templates/ja_bakery/css/template.css', 'body { color: #123456; }\n', true]
    ])
  )
  return { dir, installer }
}

const run = (...args) => spawnSync(process.execPath, [COMMAND, ...args], { cwd: ROOT, encoding: 'utf8' })

test('one command makes the blank site, and running it again gives the same archive and report', (t) => {
  const { dir, installer } = workdir(t)
  const before = readFileSync(installer)
  for (const n of ['1', '2']) {
    const res = run(
      installer,
      '--out',
      path.join(dir, `blank-${n}.zip`),
      '--report',
      path.join(dir, `report-${n}.json`)
    )
    assert.equal(res.status, 0, res.stderr + res.stdout)
    assert.match(
      res.stdout,
      /after {3}siteMenuItems 0 · articles 0 .* assignedSiteBlocks 0 · users 0 · sessions 0/
    )
  }
  const [a, b] = ['1', '2'].map((n) => readFileSync(path.join(dir, `blank-${n}.zip`)))
  assert.ok(a.equals(b), 'the two archives are identical')
  const [ra, rb] = ['1', '2'].map((n) => JSON.parse(readFileSync(path.join(dir, `report-${n}.json`), 'utf8')))
  delete ra.blankSite.file
  delete rb.blankSite.file
  assert.deepEqual(ra, rb)
  assert.deepEqual(ra.problems, [])
  assert.ok(readFileSync(installer).equals(before), 'the human quickstart is only read')
  assert.equal(readEntry(a, 'templates/ja_bakery/css/template.css').toString(), 'body { color: #123456; }\n')
  assert.deepEqual(
    listEntries(a).find((e) => e.name.endsWith('template.css')).raw,
    listEntries(before).find((e) => e.name.endsWith('template.css')).raw
  )
})

test('--check fails on the human quickstart and passes on the blank site', (t) => {
  const { dir, installer } = workdir(t)
  const human = run('--check', installer)
  assert.equal(human.status, 1)
  assert.match(human.stdout, /not blank: site menu item 101 \(Home\)/)
  assert.match(human.stdout, /not blank: secret extensions 10 password/)
  const out = path.join(dir, 'blank.zip')
  assert.equal(run(installer, '--out', out).status, 0)
  const blank = run('--check', out)
  assert.equal(blank.status, 0, blank.stdout)
  assert.match(blank.stdout, /blank site: no pages/)
})

test('the command refuses to write over its input', (t) => {
  const { installer } = workdir(t)
  const res = run(installer, '--out', installer)
  assert.equal(res.status, 2)
  assert.match(res.stderr, /--out must not be the input archive/)
})

test('when the result is not blank the command exits 1 and writes no archive', (t) => {
  const { dir } = workdir(t)
  const installer = path.join(dir, 'unreadable.zip')
  writeFileSync(
    installer,
    makeZip([
      [
        'installation/sql/mysql/custom.sql',
        `${DEMO_DATA}\nINSERT INTO \`jos_users\` (\`id\`) VALUES (7);\n`,
        true
      ]
    ])
  )
  const out = path.join(dir, 'blank.zip')
  const res = run(installer, '--out', out)
  assert.equal(res.status, 1, res.stderr + res.stdout)
  assert.match(res.stdout, /not blank: .*jos_users/)
  assert.equal(existsSync(out), false, 'no archive at the output path')
})

/** The invented released contract and mapping file of the fixture, written into the work folder. */
function contractFiles(dir) {
  const { manifest, contentMap, lock } = releasedContract()
  const released = path.join(dir, 'released')
  mkdirSync(released)
  for (const [name, doc] of [
    ['manifest.json', manifest],
    ['content-map.json', contentMap],
    ['presentation-lock.json', lock]
  ])
    writeFileSync(path.join(released, name), `${JSON.stringify(doc, null, 2)}\n`)
  const mapping = path.join(dir, 'mapping.json')
  writeFileSync(mapping, JSON.stringify(mappingFile()))
  return { released, mapping }
}

test('--contract writes the blank site contract, the same bytes each run, and needs --mapping', (t) => {
  const { dir, installer } = workdir(t)
  const { released, mapping } = contractFiles(dir)
  const alone = run(
    installer,
    '--out',
    path.join(dir, 'b.zip'),
    '--contract',
    released,
    '--contract-out',
    dir
  )
  assert.equal(alone.status, 2)
  assert.match(alone.stderr, /--contract needs --mapping/)
  const half = run(installer, '--out', path.join(dir, 'b.zip'), '--mapping', mapping, '--contract', released)
  assert.equal(half.status, 2)
  assert.match(half.stderr, /--contract and --contract-out go together/)

  const files = ['manifest.json', 'content-map.json', 'presentation-lock.json']
  const runs = ['1', '2'].map((n) => {
    const out = path.join(dir, `contract-${n}`)
    const report = path.join(dir, `report-${n}.json`)
    const res = run(
      installer,
      '--out',
      path.join(dir, `blank-${n}.zip`),
      '--report',
      report,
      '--mapping',
      mapping,
      '--contract',
      released,
      '--contract-out',
      out
    )
    assert.equal(res.status, 0, res.stderr + res.stdout)
    assert.match(res.stdout, /blank site contract ja-bakery-blank\/j6\/1.0.3: 3 records removed/)
    return {
      bytes: files.map((f) => readFileSync(path.join(out, f), 'utf8')),
      report: JSON.parse(readFileSync(report, 'utf8'))
    }
  })
  assert.deepEqual(runs[0].bytes, runs[1].bytes)
  const made = runs[0].report.blankSiteContract
  assert.equal(made.id, 'ja-bakery-blank/j6/1.0.3')
  assert.deepEqual(made.removed, ['article-1', 'category-8', 'menuItem-102'])
  assert.equal(made.opened, 1)
  const map = JSON.parse(runs[0].bytes[1])
  assert.deepEqual(map.slots.find((s) => s.key === 'module-90.0').opensEmpty, true)
})
