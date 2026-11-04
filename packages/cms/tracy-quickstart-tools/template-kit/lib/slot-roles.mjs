// Settle a written kit again from the content map and field-drives.json, as `relabel` does for link labels: no browser,
// no capture, no image. It only adds (`pages[].titleSlot`, `pageTitleOf`, `blocks[].sentences`, `blocks[].buttons`, `site.contentPages`,
// `storedFields`, `coverage.fields`) and counts the page title gate again.
import { settleButtons } from './button-slots.mjs'
import { settleContentPages } from './content-pages.mjs'
import { pageTitleChecks, settlePageTitles } from './page-titles.mjs'
import { settleSentenceGroups } from './sentence-groups.mjs'
import { settleStoredFields, storedFieldReport } from './stored-fields.mjs'

export function settleSlotRoles(kit, { map, drives = {} }) {
  settlePageTitles(kit, { map, drives })
  settleSentenceGroups(kit, { map })
  settleStoredFields(kit, { map, drives })
  settleButtons(kit, { map })
  settleContentPages(kit, { map })
  const coverage = kit.coverage ?? { parts: {}, failures: [] }
  const failures = (coverage.failures ?? []).filter((f) => f.part !== 'pageTitleSlots')
  const parts = { ...coverage.parts }
  parts.pageTitleSlots = pageTitleChecks(kit, (part, where, reason) => failures.push({ part, where, reason }))
  kit.coverage = { ...coverage, parts, failures, fields: storedFieldReport(kit) }
  kit.checks = { ...kit.checks, slotCoverage: Object.values(parts).reduce((a, n) => a + n, 0) }
  return {
    pageTitleSlots: parts.pageTitleSlots,
    sentenceGroups: kit.blocks.flatMap((b) => b.sentences ?? []).length,
    fields: kit.coverage.fields,
    slotCoverage: kit.checks.slotCoverage
  }
}
