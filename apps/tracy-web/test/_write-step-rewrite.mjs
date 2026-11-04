// Fixtures for rewriting a site the write step already wrote (ADR 0044, decision 6): one fake site kept across runs, frozen
// files for each run, and the writes a run made. The kit, files and pictures are the invented ones of the other write step tests.
import { runWriteStep } from '../src/write-step/write-step.js'
import { copy as baseCopy, frozenFiles, KIT, plan as basePlan, SITE } from './_write-step-run.mjs'

const WRITE_OPERATIONS = new Set(['apply', 'set', 'setSource', 'blocks.unpublish'])

/** Whether a door call changes the site. */
export const isWrite = (call) =>
  WRITE_OPERATIONS.has(call.params?.operation) ||
  call.action === 'media.upload' ||
  call.action === 'content.update'

/** The lines of a report that were not sent. */
export const unchangedLines = (report) => report.slots.filter((s) => s.unchanged)

/** A site kept across runs: `run(files, last)` writes these files on it, and `writes()` says what the last run wrote. */
export function keptSite(
  site,
  { kit = KIT(), contentMap = null, log = site.calls ?? site.log, deps = {} } = {}
) {
  let mark = 0
  return {
    site,
    log,
    writes: () => log.slice(mark).filter(isWrite),
    calls: () => log.slice(mark),
    async run(files, last = null, more = {}) {
      mark = log.length
      return runWriteStep({
        door: site.door,
        siteKey: SITE,
        kit,
        contentMap,
        files,
        last,
        sleep: async () => {},
        ...deps,
        ...more
      })
    }
  }
}

/** Runs each file set in `steps` on a fake site in turn, each compared with the report before it. */
export async function runInTurn(kept, steps) {
  const reports = []
  for (const step of steps) {
    const frozen = frozenFiles({ plan: step.plan ?? basePlan(), copy: step.copy ?? baseCopy() })
    try {
      reports.push(await kept.run(frozen.files, reports.at(-1) ?? null, step.deps ?? {}))
    } finally {
      frozen.done()
    }
  }
  return reports
}

/** The copy with the words of one slot changed. */
export function copyWith(slot, text) {
  const c = baseCopy()
  c.slots.find((s) => s.slot === slot).text = text
  return c
}

/** A menu row as the door lists it. */
export const menuRow = (id, over = {}) => ({
  kind: 'menuItem',
  id,
  published: 1,
  home: 0,
  path: '',
  menutype: 'mainmenu',
  params: JSON.stringify({ page_title: 'Demo Gym', 'menu-meta_description': 'Template words', show_icon: 1 }),
  ...over
})
