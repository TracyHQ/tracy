// How the repairs of one page are judged together (spec #418, #424), after all of them are written:
//   - a repair no screenshot shows (live-confirm.js) and a repair code can judge (code-judge.js) read the page the site serves
//     now, once for the whole page;
//   - every other repair is judged by the checker model: the page is shot again ONCE, only the tiles that hold a repaired
//     block (page-shots.js `bands`, from the block boxes of the first shot), each repaired block is cropped before and after
//     (repair-crops.js), and ONE checker call answers a verdict per repair. Its call is kept as a reply file like every role's.
// Past a limit (run-limits.js) the checker is not asked, and one still open when new work stops is let go: such a repair is
// not proven, so it is undone.
import { shootPages } from '../../lib/page-shots.js'
import { codeVerdict } from './code-judge.js'
import { askChecker, verdictsOf } from './finisher-roles.js'
import { liveVerdict } from './live-confirm.js'
import { pageSlug } from './model-replies.js'
import { budgetReason } from './run-limits.js'
import { blockBox, cropsOf } from './repair-crops.js'
import { VIEWPORTS } from './fault-kinds.js'

/** How far around a repaired block the re-shoot reaches, in page pixels: a repair may move the block a little. */
const BAND_MARGIN = 160

/**
 * The bands of the page to shoot again, per width: around the box of every repaired block on the first shot. A width where a
 * block has no box is shot whole (no band for it).
 * @returns {Record<string, { y: number, height: number }[]> | null}
 */
export function repairBands(firstShots, page, repairs) {
  const bands = {}
  for (const viewport of VIEWPORTS) {
    const boxes = repairs.map((r) => blockBox(firstShots.boxes ?? [], { page, viewport }, r.wordsBefore))
    if (!boxes.length || boxes.some((b) => !b)) continue
    bands[viewport] = boxes.map((b) => ({
      y: Math.max(0, b.y - BAND_MARGIN),
      height: b.height + 2 * BAND_MARGIN
    }))
  }
  return Object.keys(bands).length ? bands : null
}

/** The page as served now, read once, for every repair of the page judged on it. */
async function servedJudges(run, page, repairs) {
  const reader = run.pageHtml
  const html = reader ? await reader(page).catch(() => null) : null
  const read = reader ? async () => html : null
  const verdicts = new Map()
  for (const r of repairs) {
    if (r.judgeBy === 'live-page')
      verdicts.set(r.number, {
        ...(await liveVerdict(read, r.fault, r)),
        checkedBy: 'live-page',
        proven: true
      })
    else
      verdicts.set(r.number, {
        ...(typeof html === 'string'
          ? codeVerdict(html, r)
          : {
              verdict: 'not better',
              reason: `the live page ${page} could not be read, so the repair is not proven`
            }),
        checkedBy: 'code',
        proven: true
      })
  }
  return verdicts
}

/** The checker on crops of every repaired block, in one call. */
async function checkerJudges(run, page, repairs, firstShots, round) {
  const verdicts = new Map()
  const stopped = run.budget.stopped()
  if (stopped) {
    for (const r of repairs)
      verdicts.set(r.number, {
        verdict: 'not better',
        reason: `${budgetReason(stopped)}, so the checker was not asked and the repair is not proven`,
        checkedBy: null,
        proven: true
      })
    return verdicts
  }
  const bands = repairBands(firstShots, page, repairs)
  const after = await run.budget.timed('shoot', () =>
    shootPages({ capture: run.capture, pages: [page], ...(bands ? { bands: { [page]: bands } } : {}) })
  )
  const cropped = []
  for (const r of repairs)
    cropped.push({
      r,
      crops: await cropsOf({
        fault: r.fault,
        before: firstShots,
        after,
        wordsBefore: r.wordsBefore,
        wordsAfter: r.wordsAfter,
        name: `r${r.number}`,
        saveFile: run.saveFile
      })
    })
  const judged = await run.budget.ask('judge', () =>
    askChecker(
      run.doors.checker,
      cropped.map(({ r, crops }) => ({
        repair: r.number,
        fault: r.fault,
        before: crops.beforeShots,
        after: crops.afterShots
      }))
    )
  )
  await run.replies.keep({
    name: `checker-${pageSlug(page)}-round${round}`,
    role: 'checker',
    page,
    repair: repairs.length === 1 ? repairs[0].number : null,
    door: run.doors.checker,
    sent: judged.sent,
    images: cropped.flatMap(({ crops }) => [...crops.files.before, ...crops.files.after]),
    call: judged
  })
  const verdictOf = judged.problem ? null : verdictsOf(judged.answer)
  for (const { r, crops } of cropped)
    verdicts.set(r.number, {
      ...(verdictOf
        ? verdictOf(r.number)
        : { verdict: 'not better', reason: `the checker: ${judged.problem}` }),
      crops,
      checkedBy: 'checker',
      proven: crops.afterShots.length > 0
    })
  return verdicts
}

/**
 * @param {object} run the finisher's run (finisher.js)
 * @param {string} page
 * @param {{ number: number, fault: object, order: object, valid: object, judgeBy: 'live-page' | 'code' | 'checker',
 *   wordsBefore?: string, wordsAfter?: string }[]} repairs the page's written repairs
 * @returns {Promise<Map<number, { verdict: string, reason: string, checkedBy: string | null, proven: boolean,
 *   crops?: object }>>} by repair number
 */
export async function judgePage(run, page, repairs, firstShots, round) {
  const byServedPage = repairs.filter((r) => r.judgeBy !== 'checker')
  const byChecker = repairs.filter((r) => r.judgeBy === 'checker')
  const verdicts = new Map()
  if (byServedPage.length)
    for (const [n, v] of await run.budget.timed('judge', () => servedJudges(run, page, byServedPage)))
      verdicts.set(n, v)
  if (byChecker.length)
    for (const [n, v] of await checkerJudges(run, page, byChecker, firstShots, round)) verdicts.set(n, v)
  return verdicts
}
