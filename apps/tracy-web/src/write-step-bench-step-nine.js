// Wiring: the write step bench's `run --out <dir>`, step 9 whole as the build runs it (spec #418, #424): the write, then the
// finisher, through the one step 9 path (write-step-nine.js `runStepNine`), the first site check started beside the finder
// and the final one kept on the run. Without `--out` the bench's `run` writes only, and `finish` starts the finisher later
// on the written site. It sits beside app.js because it joins the write step, the finisher and the site check. BENCH ONLY:
// it writes to a site this bench made.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { joomlaAddresses } from './lib/quickstart-releases.js'
import { finishedLines, finisherSources } from './write-step-bench-finish-sources.js'
import { siteCheckOfRun } from './write-step-bench-site-check.js'
import { runStepNine } from './write-step-nine.js'

export const STEP_NINE_USAGE = `      [--out <dir> [--site-pictures-file <path>]]  with --out: step 9 whole, the write then the finisher (as the build
                                              runs it), the finisher's repair-log.json and crops and the final
                                              site-check.json written into <dir>; without it the write only`

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))

/**
 * The finisher's side of step 9 for a bench run, or the reason it cannot run (checked before anything is written).
 * @param {object} d the bench's dependencies (write-step-bench-cli.js)
 * @param {object} values the command's flags
 * @param {(file: string) => string} inCwd
 * @returns {Promise<{ refused: string } | { finisher: object, checkSite: Function, dir: string, saveFile: Function }>}
 */
export async function stepNineSetup(d, values, inCwd) {
  if (!d.makeFinisherDoors || !d.makeCapture)
    return { refused: 'FINISHER_UNWIRED: this bench was given no finisher doors or no page capture.' }
  const facts = {}
  for (const [flag, name] of [
    ['brief-file', 'brief'],
    ['copy-file', 'copy'],
    ['site-pictures-file', 'pictures']
  ]) {
    if (!values[flag]) continue
    try {
      facts[name] = await readJson(inCwd(values[flag]))
    } catch (error) {
      return { refused: `--${flag} cannot be read as JSON: ${error?.message ?? error}` }
    }
  }
  const dir = inCwd(values.out)
  await mkdir(dir, { recursive: true })
  const saveFile = async (name, data) => {
    const file = path.join(dir, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, data)
  }
  // A bench site is Joomla with rewriting off: each layout carries its /index.php address (lib/quickstart-releases.js).
  const shoot = await d.makeCapture(values.site)
  const sources = await finisherSources(d, { report: { site: values.site }, kitRef: values.kit })
  return {
    dir,
    saveFile,
    lines: sources.lines,
    finisher: {
      doors: await d.makeFinisherDoors(),
      capture: (layouts, opts) => shoot(joomlaAddresses(layouts, 'joomla'), opts),
      saveFile,
      facts,
      ...sources.input,
      ...(d.finisherLimits ? { limits: d.finisherLimits } : {}),
      ...(d.finisherTimer ? { timer: d.finisherTimer } : {})
    },
    checkSite: (report, { baseline }) =>
      siteCheckOfRun(d, report, {
        account: values.account,
        baseline,
        pictures: facts.pictures ?? null,
        allGroups: false
      })
  }
}

/**
 * Step 9 whole on a bench run: the write's input as `run` builds it, then the finisher.
 * @returns {Promise<{ report: object, lines: string[] }>} the build's write report (its site check the final one, or the
 *   first when the finisher gave none) and the bench lines of the finisher
 */
export async function stepNineOfRun(d, setup, write) {
  const step = await runStepNine({
    write,
    finisher: setup.finisher,
    checkSite: setup.checkSite,
    ...(d.baselines ? { baselines: d.baselines } : {}),
    ...(d.index ? { contracts: d.index } : {}),
    ...(d.now ? { now: d.now } : {})
  })
  const lines = [...setup.lines]
  if (step.siteCheck) await setup.saveFile('site-check.json', `${JSON.stringify(step.siteCheck, null, 2)}\n`)
  if (step.repairLog)
    lines.push(...finishedLines({ log: step.repairLog, finalCheck: step.finisher ? null : step.siteCheck }))
  if (step.finisher)
    lines.push(
      `finisher: ${step.finisher.code}: ${step.finisher.reason}${step.repairLog ? '' : '; the site is delivered as the write left it'}`
    )
  return { report: step.report, lines }
}
