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
//   unowned-slots      block  3 planner     new: unowned slots that still hold their demo; a warning when no visitor sees one
//   empty-controls     block  9 write       new: a button with no words or going nowhere, a form field nothing names
//   glued-words        block  9 write       new: words run into a highlight with no space
//   unfinished-heading block  3 or 6        new: a heading that stops on a small word; whoever owns its words (label: planner, copy: writer)
//   main-heading       block  9 write       new: more than one main heading on a page; a warning when there is none
//   brand-accent       block  2 brand       new: the brand style changes only the accent family, and no template accent is left
//   band-contrast      block  2 brand       theme-reads.js: words the brand style touched, on a plain ground, in both themes (3:1 for brand accent words)
//   words-over-picture block  8, 2 or 0     theme-reads.js: words against the picture region under them, in both themes
//   logo-readable      block  2 or 0        theme-reads.js: a logo's pixels against its ground, in both themes
//   self-links         block  3 or 6        page-faults.js: a button that leads to the page it is on
//   heading-separator  block  6 writer      page-faults.js: a page title printed as a heading, separator and all
//   broken-sentence    block  6 writer      printed-sentences.js: copy rule W12, read as the page prints it
//   created-controls   block  9 write       page-faults.js: a created page shows controls the template's content pages do not
//
// Faults that need the meaning understood (does an icon suit the words, is a sentence clumsy) are step 12's, a person with eyes.
import { brandAccentGroup } from './brand-accent.js'
import { createdControlsGroup, headingSeparatorGroup, selfLinksGroup } from './page-faults.js'
import { brokenSentenceGroup } from './printed-sentences.js'
import { bandContrastGroup, logoReadableGroup, wordsOverPictureGroup } from './theme-reads.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead, WIDTHS } from './host-pages.js'
import { hostVerdictGroup } from './host-verdicts.js'
import {
  findDeadLinks,
  findEmptyControls,
  findGluedWords,
  findMainHeadings,
  findStretchedPictures,
  findTallBlocks,
  findTextOverflow,
  findUnfinishedHeadings
} from './page-measures.js'
import { ownerStep } from './steps.js'
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
      const failures = find(read, context).map((f) => ({ level, ...f }))
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
    // The words' owner is who fixes them: a label is the planner's, a line of copy the writer's. Words no line wrote stay the plan's.
    find: (read, { report }) => {
      const lines = (report?.slots ?? []).filter(
        (s) => s.status === 'written' && typeof s.ordered === 'string'
      )
      const said = (text) => String(text).replace(/\s+/g, ' ').trim().toLowerCase()
      return findUnfinishedHeadings(read.measures).map((f) => ({
        ...f,
        causingStep: ownerStep(lines.find((s) => said(s.ordered) === said(f.measured))?.owner) ?? 3
      }))
    }
  }),
  measuredGroup({
    name: 'main-heading',
    level: 'block',
    causingStep: 9,
    find: (read) => {
      // A host from before this measure answers the others: silence about headings is not one heading.
      if (read.measures.length && !read.measures.some((m) => Array.isArray(m.mainHeadings)))
        throw new GroupUnmeasured('The host answered no main headings, so this was not measured.')
      return findMainHeadings(read.measures)
    }
  }),
  brandAccentGroup,
  unownedShownGroup,
  bandContrastGroup,
  wordsOverPictureGroup,
  logoReadableGroup,
  selfLinksGroup,
  headingSeparatorGroup,
  brokenSentenceGroup,
  createdControlsGroup
]
