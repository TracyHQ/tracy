// One site writer bench run end to end (#329), at the bench-run seam: a run started on the invented Quay Fitness
// Studio plan, brief and kit sends one first message with the trimmed input, puts the writer's answer together into
// a site-copy/1 file (version, fingerprint, label slots filled from the plan), grades it with the copy check, and
// records time, cost per call and the provider balance before and after. Its inputs are frozen. The model and the
// balance endpoint are fakes: no real model or account is called.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { withCmsLine } from '../src/lib/cms-line.js'
import { writerPrompt } from '../src/site-writer/writer-prompt.js'
import { readRun } from '../src/site-writer/bench-store.js'
import { CHECKER_VERSION } from '../src/site-writer/copy-check/check-copy.js'
import { scriptedModel } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  assignWriterDoor,
  balances,
  copy,
  drain,
  kit,
  kitIndex,
  lastUserText,
  plan,
  reply,
  startRun,
  writerAnswer
} from './_site-writer-bench.mjs'
import * as menu from './_site-writer-main-menu.mjs'

// The main menu fixtures' kit parts (header labels, mobile menu block, pages) on the shipped bench kit.
const menuKitParts = () => {
  const k = menu.kit()
  return {
    blocks: k.blocks.map((b) => (b.id === 'block-2' ? kit().blocks.find((x) => x.id === 'block-2') : b)),
    pages: k.pages
  }
}
const menuPlan = () => ({ ...menu.plan(), kit: 'tracy-template-kit/2 demo-gym/j6/1.0.0' })

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const kits = kitIndex()
after(kits.done)

test('the writer prompt opens with the CMS line of the kit, WordPress or Joomla', opts, async () => {
  const { pool } = db
  for (const platform of ['wordpress', 'joomla']) {
    await db.reset()
    const own = kitIndex({ platform })
    try {
      await assignWriterDoor(pool)
      const started = await startRun(pool, own.index)
      const model = scriptedModel([reply(writerAnswer())])
      await drain(pool, {
        fetchImpl: model.fetchImpl,
        index: own.index,
        balanceFetch: balances(['1', '1']).fetchImpl
      })
      const run = await readRun(pool, started.id)
      assert.equal(run.status, 'succeeded', run.error)
      const system = model.requests[0].body.messages[0].content
      assert.equal(system, withCmsLine(writerPrompt().text, platform))
      assert.match(
        system,
        platform === 'wordpress'
          ? /^This site runs on WordPress \(block editor\)\.\n\n/
          : /^This site runs on Joomla\.\n\n/
      )
    } finally {
      own.done()
    }
  }
})

test('a kit with no platform fails the writer run before any model call', opts, async () => {
  const { pool } = db
  const own = kitIndex({ platform: '' })
  try {
    await assignWriterDoor(pool)
    const started = await startRun(pool, own.index)
    const model = scriptedModel([reply(writerAnswer())])
    await drain(pool, {
      fetchImpl: model.fetchImpl,
      index: own.index,
      balanceFetch: balances(['1', '1']).fetchImpl
    })
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'failed')
    assert.match(run.error, /SITE_WRITER_KIT_PLATFORM/)
    assert.equal(model.requests.length, 0)
  } finally {
    own.done()
  }
})

test(
  'a run writes a valid site-copy/1 file, with the label slots filled by code from the plan',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index)
    const model = scriptedModel([reply(writerAnswer())])
    const balance = balances(['10.00', '9.99'])
    await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balance.fetchImpl })

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.standingFailures, null)
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state, r.failureList]),
      [[0, 'checked', '']]
    )
    const written = run.rounds[0].copy
    assert.equal(written.version, 'site-copy/1')
    assert.deepEqual(written.fingerprint, {
      kit: plan().kit,
      planSha256: run.rounds[0].copy.fingerprint.planSha256,
      briefSha256: run.briefSha256,
      promptSha256: run.promptSha256
    })
    assert.match(written.fingerprint.planSha256, /^[0-9a-f]{64}$/)
    // The label slot the writer left out holds the plan's words, owned by the plan; every writer entry is as written.
    assert.deepEqual(
      written.slots.find((s) => s.slot === 'block-1.1'),
      { slot: 'block-1.1', owner: 'plan-label', text: 'Join us', factIds: [] }
    )
    assert.deepEqual(
      written.slots.filter((s) => s.owner === 'writer'),
      writerAnswer().slots
    )
    assert.deepEqual(new Set(written.slots.map((s) => s.slot)), new Set(copy().slots.map((s) => s.slot)))
    assert.equal(run.rounds[0].checkResult.summary.fail, 0)

    // Time, cost per call and the balance around the run.
    assert.equal(run.totals.turns, 1)
    assert.ok(run.costUsd > 0, 'the call was priced from the DeepSeek price table')
    assert.ok(run.finishedAt && Date.parse(run.finishedAt) >= Date.parse(run.createdAt))
    assert.deepEqual(run.balance.before.infos, [{ currency: 'USD', total: 10 }])
    assert.deepEqual(run.balance.after.infos, [{ currency: 'USD', total: 9.99 }])
    assert.equal(balance.asked.length, 2)
    assert.equal(run.harness.effort, 'max')
    assert.equal(run.door.model, 'deepseek-flash')
  }
)

test(
  'the first message carries the trimmed input: the plan, cited facts, quoted reviews, slim kit, name slots',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    await startRun(pool, kits.index)
    const model = scriptedModel([reply(writerAnswer())])
    await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })

    const body = model.requests[0].body
    assert.equal(body.tools, undefined, 'the writer has no tools')
    assert.equal(body.reasoning_effort, 'max')
    const users = body.messages.filter((m) => m.role === 'user')
    assert.equal(users.length, 1)
    const text =
      typeof users[0].content === 'string' ? users[0].content : users[0].content.map((p) => p.text).join('')
    assert.ok(!/image_url/.test(JSON.stringify(body.messages)), 'no image is sent')
    const part = (title) => JSON.parse(text.split(`## ${title}\n\n`)[1].split('\n')[0])
    assert.equal(part('The site plan').kit, plan().kit)
    // Only cited facts, each with the quote it was read from; never the uncited email.
    const facts = part('The brief facts the plan cites')
    assert.deepEqual(facts.map((f) => f.id).sort(), ['f-coach', 'f-hours', 'f-name', 'f-phone', 'f-review-1'])
    assert.deepEqual(facts.find((f) => f.id === 'f-hours').evidence, ['We open at 06:00 and close at 21:00.'])
    assert.deepEqual(part('The reviews the plan quotes, in full'), [
      { id: 'r1', text: 'The coaches know every member by name and the classes never feel crowded.' }
    ])
    // The blocks the plan uses, not the hidden block-4; text slots slimmed, the look as text.
    const blocks = part('The kit: every block the plan uses')
    assert.deepEqual(
      blocks.map((b) => b.id),
      ['block-1', 'block-2', 'block-3', 'block-5']
    )
    assert.equal(blocks[1].look, 'A wide hero with a heading.')
    assert.deepEqual(Object.keys(blocks[1].slots[0]), [
      'id',
      'role',
      'type',
      'maxCharacters',
      'sample',
      'demoChars',
      'shape',
      'paragraphs',
      'bullets'
    ])
    assert.deepEqual(blocks[2].lists[0].rows, [
      {
        index: 1,
        slots: [
          {
            id: 'block-3.6',
            role: 'editorial.paragraph',
            type: 'text',
            maxCharacters: 120,
            sample: 'Another long demo review sentence from the template sits right here.',
            demoChars: { total: 68, lead: null, bullets: [] },
            shape: { lead: false, points: 0, leadChars: null, pointChars: null },
            // W03's window: 80% of the 68 character demo to the demo plus 3, under the limit of 120.
            characters: { min: 55, max: 71 },
            paragraphs: 1,
            bullets: 0
          }
        ]
      }
    ])
    assert.match(part('The kit: how long each text slot is written'), /at least min and at most max characters/)
    assert.deepEqual(part('The kit: footer column headings'), [
      { group: 'group-footer-a', titleSlot: 'block-6.1', heading: 'Useful links' },
      { group: 'group-footer-b', titleSlot: 'block-6.2', heading: 'Find out more' }
    ])
    assert.deepEqual(
      part('The name slots the brand step hands over (write them as the home page seo entry)').map(
        (n) => n.where
      ),
      ['document-title', 'meta description']
    )
    assert.match(
      text,
      /Write these pages now, in this order: shared, page-home, page-about, legal:privacy, notFound\./
    )
  }
)

test('the inputs of a run are frozen once it is stored', opts, async () => {
  const { pool } = db
  await assignWriterDoor(pool)
  const started = await startRun(pool, kits.index)
  for (const [column, value] of [
    ['plan', '{}'],
    ['brief', '{}'],
    ['kit', '{}'],
    ['door', '{}'],
    ['harness', '{}']
  ])
    await assert.rejects(
      pool.query(`update site_writer_run set ${column} = $2::jsonb where id = $1`, [started.id, value]),
      /site writer run input is immutable/
    )
  for (const column of ['plan_sha256', 'prompt_sha256'])
    await assert.rejects(
      pool.query(`update site_writer_run set ${column} = $2 where id = $1`, [started.id, 'f'.repeat(64)]),
      /immutable/
    )
  await assert.rejects(
    pool.query(`update site_writer_run set checker_version = 'x' where id = $1`, [started.id]),
    /immutable/
  )
})

test('a second run is refused while one is active; a plan made on another kit is refused', opts, async () => {
  const { pool } = db
  await assignWriterDoor(pool)
  const first = await startRun(pool, kits.index)
  const { startWriterRun } = await import('../src/site-writer/bench-control.js')
  const { SECRET, brief } = await import('./_site-writer-bench.mjs')
  const base = {
    pool,
    secret: SECRET,
    planSource: { kind: 'file', name: 'p.json' },
    brief: brief(),
    briefSource: { kind: 'file', name: 'b.json' },
    kitRef: 'demo-gym/j6/1.0.0',
    startedBy: 'cli',
    index: kits.index
  }
  const again = await startWriterRun({ ...base, plan: plan() })
  assert.equal(again.code, 'SITE_WRITER_RUN_ACTIVE')
  assert.equal(again.active.id, first.id)
  const other = await startWriterRun({
    ...base,
    plan: { ...plan(), kit: 'tracy-template-kit/2 other/j6/1.0.0' }
  })
  assert.equal(other.code, 'SITE_WRITER_PLAN_SHAPE')
})

test(
  'a run freezes the hash of the content map it read, writes the dropdowns, and stops when the file changed',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const map = menu.contentMap()
    const menuKits = kitIndex({ kitDoc: { ...kit(), ...menuKitParts() }, contentMap: map })
    try {
      const first = await startRun(pool, menuKits.index, { plan: menuPlan() })
      const { rows } = await pool.query('select kit from site_writer_run where id = $1', [first.id])
      assert.equal(
        rows[0].kit.contentMapSha256,
        createHash('sha256').update(JSON.stringify(map)).digest('hex')
      )
      // The writer is asked for the dropdowns: its first message names them under their parent.
      const answer = writerAnswer()
      answer.slots.push(
        { slot: 'menuItem-21.0', owner: 'writer', text: 'Yoga', factIds: [] },
        { slot: 'menuItem-31.0', owner: 'writer', text: 'Coaches', factIds: [] }
      )
      const model = scriptedModel([reply(answer)])
      await drain(pool, {
        fetchImpl: model.fetchImpl,
        index: menuKits.index,
        balanceFetch: balances([]).fetchImpl
      })
      const done = await readRun(pool, first.id)
      assert.match(lastUserText(model.requests[0]), /## Main menu: the dropdown slots/)
      assert.equal(done.status, 'succeeded', done.error)
      assert.equal(done.rounds[0].checkResult.meta.checker, CHECKER_VERSION)

      const second = await startRun(pool, menuKits.index, { plan: menuPlan() })
      menuKits.writeContentMap({ ...map, slots: [] })
      await drain(pool, { fetchImpl: scriptedModel([]).fetchImpl, index: menuKits.index })
      const refused = await readRun(pool, second.id)
      assert.equal(refused.status, 'failed')
      assert.match(refused.error, /^SITE_WRITER_CONTENT_MAP_CHANGED: /)
    } finally {
      menuKits.done()
    }
  }
)
