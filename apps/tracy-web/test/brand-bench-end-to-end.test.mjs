// The brand bench end to end (brand step trial bench, #320): a words-only invented brief and the JA Boxing 1.0.10 kit,
// the REAL brand tools and the REAL gate, the real wiring (run folder on disk, heading font through the fake Google
// Fonts door), a scripted agent and reviewer. The run ends with the gate accepting and `get` exporting everything.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { runCli } from '../src/brand-step/brand-cli.js'
import { roundsOf } from '../src/brand-step/brand-round-store.js'
import { brandRunDir } from '../src/brand-step/brand-wiring.js'
import { SECRET, REVIEWER_MODEL } from './_brand-bench.mjs'
import { PICTURE_MODEL } from './_brand-bench-doors.mjs'
import { symbolAgent } from './_brand-bench-symbol.mjs'
import { wordsOnlyRun } from './_brand-e2e-run.mjs'
import { faviconBlockOf } from '../src/brand-step/brand-safe-version.js'
import { ringMaterialPng } from './_brand-tool-fixtures.mjs'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

test(
  'a words-only brief ends with a brand file the gate accepts, with an icon drawn through the picture door, and get exports all of it',
  opts,
  async () => {
    const { pool } = db
    const dir = mkdtempSync(path.join(tmpdir(), 'brand-e2e-'))
    try {
      const { id, run, config, font, requests, kitImages, wiring } = await wordsOnlyRun(pool, dir, {
        icon: true
      })
      assert.equal(run.error, null)
      const rounds = await roundsOf(pool, id)
      assert.equal(run.outcome, 'brand-file', JSON.stringify(rounds.map((r) => r.gateResult?.rejected ?? r)))
      assert.deepEqual(
        run.rounds.map((r) => [r.round, r.state]),
        [[0, 'accepted']],
        'accepted on round 0, no fix round'
      )
      assert.equal(font.seen.length, 2, 'the heading font is fetched once (stylesheet, file) and then cached')
      assert.equal(
        requests.filter((m) => m === REVIEWER_MODEL).length,
        2,
        'one blind look at the icon and one look for all the logos'
      )
      assert.equal(requests.filter((m) => m === PICTURE_MODEL).length, 1, 'one drawing')
      assert.ok(run.cost.agent > 0 && run.cost.reviewer > 0, JSON.stringify(run.cost))
      assert.equal(run.cost.drawing, 0.034, 'the drawing is counted in the run cost')
      const calls = (
        await pool.query('select kind, tool, model, state from brand_call where kind = $1', ['drawing'])
      ).rows
      assert.deepEqual(calls, [
        { kind: 'drawing', tool: 'make_icon', model: PICTURE_MODEL, state: 'answered' }
      ])

      const out = path.join(dir, 'out')
      const lines = []
      const code = await runCli(['get', id, '--out', out], {
        pool,
        secret: SECRET,
        kitImages,
        wiring,
        runDir: (id) => brandRunDir(config, id),
        cwd: dir,
        out: (l) => lines.push(l),
        err: (l) => lines.push(l)
      })
      assert.equal(code, 0, lines.join('\n'))
      const files = readdirSync(out, { recursive: true }).map(String)
      for (const f of [
        'brand-file.json',
        'gate/round-0.json',
        'run.json',
        'turns.json',
        'calls.json',
        'cost.json'
      ])
        assert.ok(files.includes(f), f)
      const brand = JSON.parse(readFileSync(path.join(out, 'brand-file.json'), 'utf8'))
      assert.equal(brand.logo.mark.decision, 'icon')
      assert.equal(brand.logo.mark.icon.attempts[0].blind.verdict, 'pass')
      for (const f of [brand.favicon.png32, brand.favicon.ico, brand.logo.mark.file])
        assert.ok(existsSync(path.join(out, f)), `${f} is exported beside the brand file`)
      const turns = JSON.parse(readFileSync(path.join(out, 'turns.json'), 'utf8'))
      assert.ok(turns.some((t) => t.toolCalls.includes('compose_logo')))
      const split = JSON.parse(readFileSync(path.join(out, 'cost.json'), 'utf8'))
      assert.ok(split.agent > 0 && split.reviewer > 0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)

test(
  'when every icon drawing fails the tool failures are not attempts and the lettermark is accepted',
  opts,
  async () => {
    const { pool } = db
    const dir = mkdtempSync(path.join(tmpdir(), 'brand-e2e-'))
    try {
      const { id, run, requests } = await wordsOnlyRun(pool, dir, {}, { picture: 'fails' })
      const rounds = await roundsOf(pool, id)
      assert.equal(run.outcome, 'brand-file', JSON.stringify(rounds.map((r) => r.gateResult?.rejected ?? r)))
      assert.equal(run.brandFile.logo.mark.decision, 'lettermark')
      assert.deepEqual(
        run.brandFile.logo.mark.icon.attempts.map((t) => t.verdict),
        Array(4).fill('tool-failed')
      )
      assert.equal(requests.filter((m) => m === PICTURE_MODEL).length, 4, 'four calls, four tool failures')
      assert.equal(run.cost.drawing, 0, 'a failed drawing costs nothing')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)

test(
  'a file the gate keeps rejecting ends with the safe version, built by the real tools from the real files',
  opts,
  async () => {
    const { pool } = db
    const dir = mkdtempSync(path.join(tmpdir(), 'brand-e2e-'))
    try {
      const { run, config } = await wordsOnlyRun(pool, dir, { wrongName: true })
      assert.equal(run.outcome, 'safe-version')
      assert.equal(run.safeVersionReason, 'gate')
      const safe = run.brandFile
      assert.equal(safe.safeVersion.reason, 'gate')
      assert.equal(safe.name.value, 'Glen Bay Swim Academy')
      assert.equal(safe.logo.mark.decision, 'lettermark')
      assert.equal(safe.favicon.from, 'mark')
      assert.deepEqual(
        safe.ownerTasks.map((t) => t.kind),
        ['replace-temporary-logo']
      )
      const folder = brandRunDir(config, run.id)
      for (const f of [
        safe.logo.mark.file,
        safe.favicon.png32,
        safe.favicon.ico,
        ...safe.logo.spots.map((x) => x.file)
      ])
        assert.ok(existsSync(path.join(folder, f)), `${f} is in the run folder`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)

test(
  'a found logo with a symbol: cut_mark, recolour_mark, compose, fit, favicon and looks end with the gate accepting',
  opts,
  async () => {
    const { pool } = db
    const dir = mkdtempSync(path.join(tmpdir(), 'brand-e2e-'))
    try {
      // the invented logo: a dark ring around a grey bar above a text-like bar, on white
      const material = await ringMaterialPng('#ffffff', '#1a1a1a', '#8a8a8a')
      const { id, run, config, requests } = await wordsOnlyRun(
        pool,
        dir,
        {},
        {
          caseId: '4-black-grey-symbol',
          material,
          agentFor: (kit) =>
            symbolAgent(kit, {
              brief: {
                brand: { logo: 'c3f2e4d6-9d50-4e7b-8c83-4fb0719d2e35', name: 'Northgate Racquet House' }
              },
              faviconBlockOf
            })
        }
      )
      const rounds = await roundsOf(pool, id)
      assert.equal(run.error, null)
      assert.equal(run.outcome, 'brand-file', JSON.stringify(rounds.map((r) => r.gateResult?.rejected ?? r)))
      const mark = run.brandFile.logo.mark
      assert.equal(mark.decision, 'cut')
      assert.equal(mark.file, 'mark/cut-mark.png')
      assert.equal(mark.recoloured.dark, 'mark/recoloured.dark.png')
      assert.equal(requests.filter((m) => m === REVIEWER_MODEL).length, 3, 'three looks, no icon')
      const folder = brandRunDir(config, id)
      for (const f of [
        mark.file,
        'mark/cut-mark.mask.png',
        mark.recoloured.dark,
        run.brandFile.favicon.png32
      ])
        assert.ok(existsSync(path.join(folder, f)), `${f} is in the run folder`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)
