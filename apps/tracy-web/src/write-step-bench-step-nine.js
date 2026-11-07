// Wiring: the write step bench's `run --repair --out <dir>`, step 9 whole as a build runs it (#448): the write, the first
// site check with the finder beside it, step 9b through Tracy's site agent, and hand-over, through the one step 9 entry
// point (write-step-nine.js `runStepNine`). Without `--repair` the bench's `run` writes only. It sits beside app.js because
// it joins the write step, the site check, the finder and the site agent. BENCH ONLY: it writes to a site this bench made.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openKit } from './lib/template-kit-source.js'
import { checkLines } from './site-check/check-lines.js'
import { runSiteCheck } from './site-check/site-check.js'
import { runStepNine } from './write-step-nine.js'

export const STEP_NINE_USAGE = `      [--repair --out <dir> [--site-pictures-file <path>]]
                                              with --repair: step 9 whole (write, first site check with the finder,
                                              step 9b through Tracy's site agent as the site owner, site check again);
                                              the write report, both site checks and repair-pass.json go into <dir>`

/** Why this bench cannot run step 9 whole, or null. */
export const stepNineRefusal = (d) =>
  d.makeRepairAgent ? null : 'REPAIR_UNWIRED: this bench was given no site agent for step 9b.'

/** The bench lines of step 9b's result. */
export function repairLines(repair) {
  if (!repair) return []
  const lines = [
    `step 9b: ${repair.status}${repair.error ? ` (${repair.error})` : ''}${repair.reason ? ` (${repair.reason})` : ''}, ${repair.sent} faults sent in ${repair.turns.length} turns, ${repair.undone.length} undone, ${repair.resent.length} resent, ${repair.dropped.length} dropped, ${repair.skipped.length} skipped, ${(repair.ms / 1000).toFixed(1)} s`
  ]
  for (const s of repair.timeline ?? [])
    lines.push(
      `  ${s.stage}${s.page ? ` ${s.page}` : ''} ${(s.startMs / 1000).toFixed(1)}-${(s.endMs / 1000).toFixed(1)} s`
    )
  for (const t of repair.turns)
    lines.push(
      `  turn ${t.turnId} ${t.state} ${t.how} page=${t.page} round=${t.round} faults=${t.faults.length} changes=${t.changes.length}`
    )
  for (const u of repair.undone)
    lines.push(`  undone ${u.turnId} page=${u.page}: ${u.ok ? u.why : `undo-failed ${u.reason}`}`)
  for (const x of repair.dropped) lines.push(`  dropped page=${x.page}: ${x.reason}`)
  for (const x of repair.notSent) lines.push(`  not sent page=${x.page}: ${x.faults} faults, ${x.reason}`)
  return lines
}

/**
 * Step 9 whole on a bench run: the write's input as `run` builds it, then the rest of the step.
 * @returns {Promise<{ report: object, lines: string[] }>}
 */
export async function stepNineOfRun(d, values, write, inCwd) {
  const dir = inCwd(values.out)
  await mkdir(dir, { recursive: true })
  const saveFile = async (name, data) => {
    const file = path.join(dir, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, data)
  }
  const pictures = values['site-pictures-file']
    ? JSON.parse(await readFile(inCwd(values['site-pictures-file']), 'utf8'))
    : null
  const kit = openKit(values.kit, d.index ? { index: d.index } : {})?.doc ?? null
  const host = d.makeHost ? await d.makeHost(values.site) : null
  // A check after a repair turn reads only the pages it changed (`pages`, write-step-nine.js).
  const checkSite = (report, { baseline, allGroups = false, pages = null }) =>
    runSiteCheck({
      door: d.makeDoor({ account: values.account, platform: 'joomla' }),
      report,
      ...(host ? { host } : {}),
      ...(d.pageHtml ? { pageHtml: (page) => d.pageHtml({ siteKey: report.site, path: page }) } : {}),
      baseline,
      kit,
      pictures,
      // Step 9 asks for every group; `--all-groups` says the same.
      allGroups: allGroups || values['all-groups'] === true,
      ...(pages ? { pages } : {}),
      ...(d.now ? { now: d.now } : {})
    })
  const finder = d.makeFinder
    ? await d.makeFinder({ siteKey: values.site, kitRef: values.kit, saveFile })
    : null
  const agent = await d.makeRepairAgent({ siteKey: values.site, account: values.account })
  const step = await runStepNine({
    write,
    checkSite,
    finder,
    agent,
    saveFile,
    // The page as the site serves it, for the element each comment points at (repair-served-element.js).
    ...(d.pageHtml ? { pageHtml: (page) => d.pageHtml({ siteKey: values.site, path: page }) } : {}),
    ...(d.baselines ? { baselines: d.baselines } : {}),
    ...(d.index ? { contracts: d.index } : {}),
    ...(d.now ? { now: d.now } : {}),
    ...(d.sleep ? { sleep: d.sleep } : {}),
    log: { warn: (line) => d.err(line) }
  })
  const lines = [
    ...(finder ? [] : ['finder: none given, so step 9b sends only the site check faults']),
    ...repairLines(step.repair),
    ...(step.siteCheck ? checkLines(step.siteCheck) : [])
  ]
  return { report: step.report, lines }
}
