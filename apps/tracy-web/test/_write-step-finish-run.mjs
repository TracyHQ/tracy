// One `finish` of the step 9 bench on the invented written site of _write-step-finisher.mjs, with the knobs the finisher's
// rounds, limits and batches need (#424): a fake clock each model call moves on, the cost each call reports, a page reader,
// the finisher's limits, and a checker that approves (or refuses) every repair it is shown, whatever their numbers.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runCli } from '../src/write-step-bench-cli.js'
import { kitIndex, memoryStore } from './_write-step-bench.mjs'
import {
  BLOCKS,
  benchSite,
  fakeCapture,
  heldAtStart,
  PAGES,
  scriptedDoor,
  writtenRun,
  writtenSite
} from './_write-step-finisher.mjs'
import { memoryRunStore } from './_write-step-run.mjs'

/** A clock that only moves when a test says so. */
export const fakeClock = () => {
  const clock = { at: 0, now: () => clock.at }
  return clock
}

/**
 * A door whose every call moves the clock on by `ms` and reports `usd`, and waits a few turns of the event loop, so calls
 * that run side by side overlap. `inFlight.max` is the most calls that were open at once.
 */
export function slowDoor(scripted, { clock = null, ms = 0, usd = null } = {}) {
  const ask = scripted.door.ask
  const inFlight = { now: 0, max: 0 }
  scripted.door.ask = async (message) => {
    inFlight.now += 1
    inFlight.max = Math.max(inFlight.max, inFlight.now)
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
    if (clock) clock.at += ms
    const answer = await ask(message)
    inFlight.now -= 1
    return usd === null ? answer : { ...answer, costUsd: usd }
  }
  return { ...scripted, inFlight }
}

/** A checker door that gives `verdict` to every repair it is shown, read from the "Repair <n>." lines it was sent. */
export function everyRepairChecker(verdict = 'better', reason = 'reads as words') {
  const asked = []
  return {
    asked,
    door: {
      ok: true,
      label: 'Finisher checker',
      model: 'deepseek-flash',
      providerId: 'deepseek',
      images: true,
      async ask(message) {
        asked.push(message)
        const numbers = message.content
          .filter((c) => c.type === 'text')
          .map((c) => /^Repair (\d+)\. /.exec(c.text)?.[1])
          .filter(Boolean)
          .map(Number)
        return {
          text: JSON.stringify({ verdicts: numbers.map((repair) => ({ repair, verdict, reason })) }),
          costUsd: 0.01
        }
      }
    }
  }
}

const kits = kitIndex({ tool: 'template-kit 3.1.0', blocks: BLOCKS, pages: PAGES })
/** The kit's head injection block, module 9, where a style repair is written (finisher-style.js). */
const HEAD_MODULE = 9
const HEAD_SITE = { head: { injection: { position: { block: `block-${HEAD_MODULE}` }, maxBytes: 65535 } } }
const headKits = kitIndex({ tool: 'template-kit 3.1.0', blocks: BLOCKS, pages: PAGES, site: HEAD_SITE })

/** The written site with the head module behind `content.get` and `content.update`, as a style repair needs it. */
function withHeadModule(site) {
  const module = { content: '' }
  const inner = site.door.apply
  site.door.apply = async (call) => {
    const { action, params } = call
    if (action !== 'content.get' && action !== 'content.update') return inner(call)
    if (params.id !== HEAD_MODULE) return { ok: false, error: 'not_found', message: `no module ${params.id}` }
    if (action === 'content.get') return { ok: true, item: { id: HEAD_MODULE, content: module.content } }
    module.content = params.fields.content
    return { ok: true }
  }
  return { ...site, module }
}
const dirs = []

/** Removes the kit index and the output folders; call it from `after`. */
export function cleanUp() {
  kits.done()
  headKits.done()
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
}

/**
 * @param {{ finder: object, fixer: object, checker: object, served?: ((held: object) => (page: string) => string) | null,
 *   limits?: object, clock?: object, sideEffect?: object | null, first?: object, files?: Record<string, object> | null,
 *   held?: Record<string, string>, head?: boolean, boxText?: Function }} input `head` gives the kit a head injection
 *   module, so a style repair can be written; `boxText` is what the host reads off a slot's element (fakeCapture)
 *   `finder`, `fixer`, `checker` are doors as scriptedDoor makes them; `served` renders a page from what the site holds now
 */
export async function finishOn({
  finder,
  fixer,
  checker,
  served = null,
  limits = null,
  clock = null,
  sideEffect = null,
  first = {},
  timer = null,
  files = null,
  held = heldAtStart(),
  head = false,
  boxText = undefined
}) {
  const written = writtenSite({ ...held }, { sideEffect })
  const site = head ? withHeadModule(written) : written
  const shots = fakeCapture({ held: site.held, boxText })
  const out = []
  const err = []
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-finish-run-'))
  dirs.push(dir)
  const runs = memoryRunStore([writtenRun({ held: { ...held }, ...first })])
  // `files`: the brief, copy and pictures files by their bench option (`brief-file`), written next to the run.
  const fileArgs = Object.entries(files ?? {}).flatMap(([option, data]) => {
    const file = path.join(dir, `${option}.json`)
    writeFileSync(file, JSON.stringify(data))
    return [`--${option}`, file]
  })
  const argv = ['finish', '--run', 'run-1', '--account', 'bench@example.test', '--out', dir, ...fileArgs]
  const code = await runCli(argv, {
    runs,
    store: memoryStore([benchSite()]),
    index: (head ? headKits : kits).index,
    makeDoor: () => site.door,
    makeCapture: async () => shots.capture,
    makeFinisherDoors: async () => ({ finder: finder.door, fixer: fixer.door, checker: checker.door }),
    ...(served ? { pageHtml: async ({ path: page }) => served(site.held)(page) } : {}),
    ...(limits ? { finisherLimits: limits } : {}),
    ...(timer ? { finisherTimer: timer } : {}),
    ...(clock ? { now: clock.now } : {}),
    out: (l) => out.push(l),
    err: (l) => err.push(l)
  })
  const logFile = path.join(dir, 'repair-log.json')
  const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : null
  return { code, out, err, site, shots, log, dir, runs }
}

export { scriptedDoor }
