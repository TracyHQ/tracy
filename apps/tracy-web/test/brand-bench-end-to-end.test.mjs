// The brand bench end to end (brand step trial bench, #320): a words-only invented brief and the JA Boxing 1.0.10 kit,
// the REAL brand tools and the REAL gate, the real wiring (run folder on disk, heading font through the fake Google
// Fonts door), a scripted agent and reviewer. The run ends with the gate accepting and `get` exporting everything.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { runCli } from '../src/brand-step/brand-cli.js'
import { brandRunDir, productionWiring } from '../src/brand-step/brand-wiring.js'
import { roundsOf } from '../src/brand-step/brand-round-store.js'
import { readRun } from '../src/brand-step/brand-store.js'
import { createBrandQueue } from '../src/brand-step/brand-worker.js'
import { fileDb } from './_db.mjs'
import { assignBrandDoors, quiet, REVIEWER_MODEL, SECRET, startRun } from './_brand-bench.mjs'
import { scriptedAgent } from './_brand-bench-agent.mjs'
import { fakeFontFetch, passingReviewer } from './_brand-bench-doors.mjs'
import { loadCase } from './_brand-gate-files.mjs'
import sharp from 'sharp'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
/** Kit images that are real pictures (the shared fake serves invented bytes, which no tool can open). */
async function pictureKitImages() {
  const png = await sharp({ create: { width: 1440, height: 900, channels: 3, background: '#223344' } })
    .png()
    .toBuffer()
  return {
    async ensure(kit) {
      const image = { mediaType: 'image/png', base64: png.toString('base64') }
      return {
        ok: true,
        images: {
          open: async (id) => ({
            text: JSON.stringify({ id }),
            images: [{ ...image, ref: { kit: kit.ref, image: id } }]
          }),
          resolve: async () => image
        }
      }
    }
  }
}

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

/** Start a words-only run on the real wiring and let a worker run it to its end. */
async function wordsOnlyRun(pool, dir, agentOptions) {
  const kitImages = await pictureKitImages()
  const config = { readinessDir: path.join(dir, 'readiness') }
  const font = fakeFontFetch()
  const wiring = productionWiring(config, { fetchImpl: font.fetchImpl })
  const c = await loadCase('3-no-logo')
  await assignBrandDoors(pool)
  const started = await startRun(pool, c, { wiring, kitImages })
  const agent = scriptedAgent(c.kit, agentOptions)
  const requests = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    requests.push(body.model)
    const reply = body.model === REVIEWER_MODEL ? passingReviewer(body) : agent(body)
    return new Response(JSON.stringify(reply), { headers: { 'content-type': 'application/json' } })
  }
  await createBrandQueue({
    pool,
    secret: SECRET,
    fetchImpl,
    kitImages,
    wiring,
    log: quiet,
    retry: { attempts: 1 }
  }).drain()
  return { id: started.id, run: await readRun(pool, started.id), config, font, requests, kitImages, wiring }
}

test(
  'a words-only brief ends with a brand file the gate accepts, and get exports all of it',
  opts,
  async () => {
    const { pool } = db
    const dir = mkdtempSync(path.join(tmpdir(), 'brand-e2e-'))
    try {
      const { id, run, config, font, requests, kitImages, wiring } = await wordsOnlyRun(pool, dir)
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
        1,
        'one reviewer look for all the logos'
      )
      assert.ok(run.cost.agent > 0 && run.cost.reviewer > 0, JSON.stringify(run.cost))

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
