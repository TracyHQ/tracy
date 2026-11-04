// The site check's `written-not-printed` measure (ADR 0044, decision 12): a value the write report says was written, that no page
// showing its slot prints. Read-back compares the site's database with the report and stays green when the template drops the block that
// would print the value (a video poster printed only with a video id); this reads the pages as a visitor gets them, with the same rule
// the write step uses (lib/printed-in-body.js), and does not take the write step's own word for it. The write step owns the fault: it
// wrote a value that does not reach the page, and printing it, or saying why it cannot, is its job.
import { printedSlotsOf, sitePrints, slotsOnPages } from '../lib/printed-in-body.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { WRITE_STEP } from './steps.js'

export const writtenNotPrintedGroup = {
  name: 'written-not-printed',
  causingStep: WRITE_STEP,
  /** @param {{ report: object, kit?: object | null, pageHtml?: (path: string) => Promise<string | null> }} context */
  async run({ report, kit, pageHtml }) {
    if (typeof pageHtml !== 'function')
      throw new GroupUnmeasured('No page reader was given, so no page could be read as a visitor reads it.')
    if (!kit) throw new GroupUnmeasured('No kit was given, so which page shows which slot is not known.')
    const onPages = slotsOnPages(kit, report?.keptPages)
    if (!onPages.size) throw new GroupUnmeasured('The write report names no kept page the kit knows.')
    const slots = printedSlotsOf(report?.slots, kit)
    const pages = new Map()
    for (const path of onPages.keys()) pages.set(path, await pageHtml(path).catch(() => null))
    const unread = [...pages].filter(([, html]) => typeof html !== 'string').map(([path]) => path)
    if (unread.length === pages.size) throw new GroupUnmeasured(`No page answered: ${unread.join(', ')}.`)
    const values = new Map(slots.map((s) => [s.slot, s]))
    const result = sitePrints({ onPages, pages, slots })
    return {
      checked: result.printed.size + result.notPrinted.length,
      skipped: result.unread.length,
      unreadPages: unread,
      viaFallback: [...result.printed].filter(([, p]) => p.via === 'fallback').map(([slot]) => slot),
      failures: result.notPrinted.map(({ slot, pages: read }) => ({
        page: read[0],
        slot,
        measured: 'not printed',
        ordered: values.get(slot).value,
        reason:
          values.get(slot).kind === 'picture'
            ? `The picture is written and no page that shows this slot prints it (${read.join(', ')})`
            : `The words are written and no page that shows this slot prints them (${read.join(', ')})`
      }))
    }
  }
}
