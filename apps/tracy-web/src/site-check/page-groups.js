// The site check's page groups (ADR 0044, decision 8): demo words and pictures (#360) and the remaining measures (#361), on
// every kept page at 1440 and 390. They run after read-back, so a site that does not hold what was ordered stops before them.
// Blocking when a customer would see the fault; warning when it needs a person's eye.
//
//   group              level  causing step  source
//   demo-words         block  6 writer      host no-demo-words, against the demo baseline
//   demo-pictures      block  8 pictures    host no-demo-pictures, against the demo baseline
//   demo-links         block  3 planner     host no-third-party-demo, cta-real (the plan owns link targets)
//   dead-links         block  3 planner     new: visited pages and links that answer an error
//   empty-frames       block  3 planner     host no-empty-picture-slots, no-empty-boxes (the plan owns hide decisions)
//   cms-errors         block  9 write       host no-cms-error-leak, no-raw-placeholders
//   text-overflow      block  6 writer      new: text cut by or past its box
//   tall-blocks        warn   6 writer      new
//   stretched-pictures warn   8 pictures    new
//   unowned-slots      warn   3 planner     new: unowned slots that still hold their demo
//   empty-controls     block  9 write       new: a button with no words or going nowhere, a form field nothing names
//   glued-words        block  9 write       new: words run into a highlight with no space
//   unfinished-heading block  3 planner     new: a heading that stops on a small word
//   brand-accent       block  2 brand       new: the brand style changes only the accent family, and no template accent is left
import { brandAccentGroup } from './brand-accent.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead, WIDTHS } from './host-pages.js'
import { hostVerdictGroup } from './host-verdicts.js'
import {
  findDeadLinks,
  findEmptyControls,
  findGluedWords,
  findStretchedPictures,
  findTallBlocks,
  findTextOverflow,
  findUnfinishedHeadings
} from './page-measures.js'
import { unownedShownGroup } from './unowned-shown.js'

/** A group over the browser measures the host adds to its answer. Without them it could not tell, so it is unmeasured. */
function measuredGroup({ name, level, causingStep, find, needsVisited = false }) {
  return {
    name,
    causingStep,
    level,
    async run(context) {
      const read = await pagesRead(context)
      if (!read.hasMeasures && !needsVisited)
        throw new GroupUnmeasured(
          'The host answered no page measures (`pageMeasures`), so this was not measured.'
        )
      const failures = find(read).map((f) => ({ level, ...f }))
      return { checked: read.paths.length, widths: WIDTHS, calls: read.calls, failures }
    }
  }
}

export const PAGE_CHECK_GROUPS = [
  hostVerdictGroup({
    name: 'demo-words',
    ids: ['no-demo-words'],
    level: 'block',
    causingStep: 6,
    needsBaseline: true
  }),
  hostVerdictGroup({
    name: 'demo-pictures',
    ids: ['no-demo-pictures'],
    level: 'block',
    causingStep: 8,
    needsBaseline: true
  }),
  hostVerdictGroup({
    name: 'demo-links',
    ids: ['no-third-party-demo', 'cta-real'],
    level: 'block',
    causingStep: 3
  }),
  measuredGroup({
    name: 'dead-links',
    level: 'block',
    causingStep: 3,
    needsVisited: true,
    find: (read) => findDeadLinks(read.visited, read.measures)
  }),
  hostVerdictGroup({
    name: 'empty-frames',
    ids: ['no-empty-picture-slots', 'no-empty-boxes'],
    level: 'block',
    causingStep: 3
  }),
  hostVerdictGroup({
    name: 'cms-errors',
    ids: ['no-cms-error-leak', 'no-raw-placeholders'],
    level: 'block',
    causingStep: 9
  }),
  measuredGroup({
    name: 'text-overflow',
    level: 'block',
    causingStep: 6,
    find: (read) => findTextOverflow(read.measures)
  }),
  measuredGroup({
    name: 'tall-blocks',
    level: 'warn',
    causingStep: 6,
    find: (read) => findTallBlocks(read.measures)
  }),
  measuredGroup({
    name: 'stretched-pictures',
    level: 'warn',
    causingStep: 8,
    find: (read) => findStretchedPictures(read.measures)
  }),
  measuredGroup({
    name: 'empty-controls',
    level: 'block',
    causingStep: 9,
    find: (read) => findEmptyControls(read.measures)
  }),
  measuredGroup({
    name: 'glued-words',
    level: 'block',
    causingStep: 9,
    find: (read) => findGluedWords(read.measures)
  }),
  measuredGroup({
    name: 'unfinished-heading',
    level: 'block',
    causingStep: 3,
    find: (read) => findUnfinishedHeadings(read.measures)
  }),
  brandAccentGroup,
  unownedShownGroup
]
