// A site check group that is the host's own verdict on the pages (`demo-qa` check ids), turned into failures with a level and
// the step that caused them. The host measures; this file only names who answers for it.
import { noDemoFaults } from './demo-baseline.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead, WIDTHS } from './host-pages.js'

/** The first of a finding's fields that says what was seen. */
const SAID = ['text', 'words', 'file', 'url', 'href', 'selector', 'problem']
const seen = (finding) => {
  const key = SAID.find((k) => typeof finding[k] === 'string' && finding[k] !== '')
  return key ? String(finding[key]).slice(0, 160) : null
}

/**
 * @param {{ name: string, ids: string[], level: 'block' | 'warn', causingStep: number, needsBaseline?: boolean,
 *   notMine?: (finding: object, context: object) => boolean }} spec `ids`: the host's checks this group answers for;
 *   `notMine`: a finding of the host this group does not hold against the site (another group judges it)
 */
export function hostVerdictGroup({
  name,
  ids,
  level,
  causingStep,
  needsBaseline = false,
  notMine = () => false
}) {
  return {
    name,
    causingStep,
    level,
    async run(context) {
      if (needsBaseline && !context.baseline)
        throw new GroupUnmeasured(
          `There is no demo baseline for ${context.report.contract ?? 'this quickstart'}: measure one on an untouched site first.`
        )
      const read = await pagesRead(context)
      const failures = []
      for (const id of ids) {
        const check = read.checks.get(id)
        if (!check) throw new GroupUnmeasured(`The host gave no verdict for ${id}.`)
        if (check.skipped) throw new GroupUnmeasured(`The host could not judge ${id}: ${check.skipped}.`)
        if (check.pass) continue
        const detail = check.detail.filter((f) => !notMine(f, context))
        if (check.detail.length && !detail.length) continue
        const found = detail.length ? detail : [{}]
        for (const f of found)
          failures.push({
            page: f.page ?? null,
            slot: f.slot ?? null,
            measured: seen(f) ?? check.measured ?? null,
            level,
            reason: `${id}: ${check.expected}`
          })
      }
      if (needsBaseline) failures.push(...noDemoFaults(context.baseline, read.paths))
      return { checked: read.paths.length, widths: WIDTHS, calls: read.calls, ids, failures }
    }
  }
}
