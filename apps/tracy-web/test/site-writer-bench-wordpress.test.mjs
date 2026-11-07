// The site writer bench on a WordPress kit (#463): a run on the committed JA Diner WP7 contract with a stubbed model.
// The writer is asked for the labels of the menu the theme's header shows, the copy check reads its answer, and the
// downloaded mapping is in the WordPress content contract door's shape. No real model is called; nothing is written
// to any site.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { runCli } from '../src/site-writer/bench-cli.js'
import { readRun } from '../src/site-writer/bench-store.js'
import { scriptedModel } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  brief,
  DINER_REF,
  dinerContentMap,
  dinerIndex,
  plan,
  writerAnswer
} from './_site-writer-diner-wp7.mjs'
import { assignWriterDoor, balances, drain, lastUserText, reply, SECRET } from './_site-writer-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const index = dinerIndex()
let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'site-writer-wp-'))
  writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan()))
  writeFileSync(path.join(dir, 'brief.json'), JSON.stringify(brief()))
})
after(() => dir && rmSync(dir, { recursive: true, force: true }))

async function cli(...argv) {
  const out = []
  const err = []
  const code = await runCli(argv, {
    pool: db.pool,
    secret: SECRET,
    index,
    cwd: dir,
    out: (line) => out.push(line),
    err: (line) => err.push(line)
  })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

test(
  'a writer run on JA Diner WP7 writes the theme menu labels and exports the WordPress mapping',
  opts,
  async () => {
    await assignWriterDoor(db.pool)
    const started = await cli(
      'run',
      '--plan-file',
      'plan.json',
      '--kit',
      DINER_REF,
      '--brief-file',
      'brief.json'
    )
    assert.equal(started.code, 0, started.err)
    const model = scriptedModel([reply(writerAnswer())])
    await drain(db.pool, { fetchImpl: model.fetchImpl, index, balanceFetch: balances(['1', '1']).fetchImpl })
    const run = await readRun(db.pool, started.out)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 1, 'the copy passed the check on round 0')

    // The writer was asked for the labels of the Diner header menu, by their demo words.
    const asked = lastUserText(model.requests[0])
    for (const demo of ['"Home - Red"', '"About Us"', '"Contact Us"']) assert.ok(asked.includes(demo), demo)
    assert.equal(asked.includes('"Reservation"'), false, 'a hidden item is not asked')

    const got = await cli('get', started.out, '--out', 'files')
    assert.equal(got.code, 0, got.err)
    const read = (name) => JSON.parse(readFileSync(path.join(dir, 'files', name), 'utf8'))
    const check = read('check-v1.json')
    assert.ok(check.rules.length > 0, 'the copy check read the output')
    assert.deepEqual(
      check.rules.filter((r) => r.status === 'fail').map((r) => r.id),
      []
    )

    const { mapping, extras, problems } = read('mapping.json')
    assert.equal(mapping.platform, 'wordpress')
    assert.equal(mapping.contract, DINER_REF)
    assert.deepEqual(problems, [])
    const slots = new Map(dinerContentMap().doc.slots.map((s) => [s.key, s]))
    assert.ok(Object.keys(mapping.changes).length > 0)
    for (const [key, value] of Object.entries(mapping.changes)) {
      assert.equal(slots.get(key)?.type, 'text', key)
      assert.deepEqual(
        { block: mapping.targets[key].block, attr: mapping.targets[key].attr },
        slots.get(key).target
      )
      assert.doesNotMatch(value, /\(\(|<|>/)
    }
    assert.equal(
      Object.keys(mapping.changes).some((k) => k.startsWith('module-') || k.startsWith('menuItem-')),
      false,
      'no Joomla key'
    )
    assert.equal(extras.mainMenu.menutype, 'mainmenu')
    assert.deepEqual(
      extras.mainMenu.items.filter((i) => i.state !== 'hidden').map((i) => [i.demo, i.label]),
      [
        ['Home', 'Home'],
        ['Home - Red', 'Seasonal menu'],
        ['About Us', 'Our kitchen'],
        ['Contact Us', 'Book a table']
      ]
    )
  }
)
