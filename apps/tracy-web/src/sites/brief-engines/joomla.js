/**
 * "Apply" for a Joomla site built from a sealed quickstart (`tracy-business/j6`, `tracy-base/j6`, the JoomlArt
 * templates): the customer's words, written through the same content contract the seeder writes through,
 * in a fraction of the time.
 *
 *   prepare  (while the site installs, no site needed)
 *     the contract's slots come from the profile this process already holds, each standing for the words the
 *     template ships (`current = sample`, which is what a site that nobody has touched holds) → the
 *     seeder's own planner writes them from the customer's text, its batches asked ALL AT ONCE with thinking
 *     off → what comes back is checked for facts nobody gave (`guard.js`); beside it, a few pictures of the
 *     customer's own business are drawn (`pictures.js`)
 *   apply    (the moment the site is up)
 *     [hide the demo rows → inspect the site (the revision the write must name)]  ‖  [cut the pictures to the
 *     demo's shape and upload them]  → one contract apply → hide the editions nobody asked for
 *
 * The seeder's sequence (`tracy-seeder/src/cli.mjs`) read the site FIRST and planned against what it said, which
 * put the model's whole latency after the install. A fresh site holds exactly the words its profile says it
 * does, so the plan can be made from the profile and checked against the site afterwards: a slot the site
 * no longer carries, or that somebody has changed since, is left alone.
 *
 * 🔒 THE SOURCE EDITION STAYS IN FRONT (decision 21), as on WordPress: `/` speaks en-GB whatever languages are asked
 * for, and a chosen language lives under its own prefix. A language the template ships (`ru-RU` in Business) is written
 * like the source; one it does not is DERIVED from the words the site then holds, and translated BEFORE the site exists
 * wherever those words are already known (`joomla-languages.js`). One language other than en-GB is the exception (D10, O2): the
 * source edition is written in it, every other edition is hidden, and the source is then CALLED by that language
 * (`writeSourceLanguage`: `<html lang>`, Joomla's own words and the footer headings follow). A site a visitor reads in one
 * language answers without the `/en/` prefix (`dropDefaultPrefix`, D8): the prefix's `sef` is never renamed, only left out.
 */
import { writeJoomlaMainMenu } from './main-menu-joomla.js'
import { writeJoomlaFooterNavigation } from './footer-navigation-joomla.js'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { seeder, seederDataDir, translationsDirOf } from '../../lib/seeder.js'
import { navHiddenMenuIds, showcaseNavMap } from '../../lib/showcase-nav-map.js'
import {
  briefForJudges,
  budgetSignal,
  firmGenerate,
  planConcurrently,
  recordedDoor,
  sayUnbound,
  siteBlock,
  spokenOf,
  stopwatch,
  aboutGiven,
  ABOUT_BLANK_NOTE,
  answeredName,
  nameAnswered,
  withTemplateName
} from './shared.js'
import { copyPlanBudget, isBlockCopyLine, recordCopyPlan, settleKeptSlots } from './copy-plan-stage.js'
import { factsOf, guardChanges, guardWritten } from './guard.js'
import { drawPictures, pictureBriefs, pictureGroups, shapePictures, uploadPictures } from './pictures.js'
import { keptPages, pictureReport, realPicturesOf, shapeReal } from './real-pictures.js'
import { prepareContractPictures, writeContractPictures } from './contract-real-pictures.js'
import { declaredPictureSlots } from './drawn-pictures.js'
import { copyPinsOf, pinStates, recordPins } from './wo-copy-pins.js'
import { sourcedPinEvidence } from './copy-pin-priority.js'
import { woContentOf } from './wo-content.js'
import { offeringPostsOf } from './offering-posts.js'
import { planContactSteps } from './joomla-plan-contacts.js'
import { honestWords, leftDemoWords, planRecordSteps } from './joomla-plan-records.js'
import { narrowRepeatedBlocks } from './joomla-repeated-blocks.js'
import { withInlineStyles } from './inline-styles.js'
import { inlineStylesLost, placeInlineStyles, styleChanges, takeStyleMarks } from './joomla-inline-styles.js'
import { planIdentitySteps } from './joomla-plan-identity.js'
import { guardBoundNodes } from './joomla-bound-nodes.js'
import { withoutStaleRecordFields } from './joomla-contact-page.js'
import { bookingButtonTargets } from 'website-opportunities/domain/booking-button-targets.mjs'
import { contentMapAt, plannedSlotValues, showcaseOff, writeOutsideMap } from './joomla-outside-map.js'
import { takenOffPicturePaths } from './cutout-css.js'
import { onceNote, overlapSafetyNet } from './picture-overlap-net.js'
import { lineLimits, withBoxLimits, withinLines } from './slot-box-limits.js'
import { characterRefusals, refusedCardHides, rewriteWithinBox } from './refused-box-rewrite.js'
import { writeWoContent } from './joomla-wo-content.js'
import { heroSlotValues } from './hero-lines.js'
import { buttonActionValues } from './button-action-values.js'
import { offeringSummaryValues } from './offering-summaries.js'
import { nameOnlyOfferingLines } from './offering-name-only.js'
import { writeOfferingDescriptions } from './offering-description-writer.js'
import { settleSiteSpelling } from './site-voice.js'
import { styleSheetRule } from 'website-opportunities/domain/site-style-sheet.mjs'
import { shapeSiblingCopy } from './sibling-copy-writer.js'
import { writeRecordPages } from './record-page-writer.js'
import { ctaBandValues } from './cta-band-messages.js'
import { pagePass } from './page-pass.js'
import { slotOwnership } from './slot-ownership.js'
import { rulesFor } from 'website-opportunities/domain/build-rules.mjs'
import { plainText, spellingKey } from 'website-opportunities/domain/sibling-copy-shape.mjs'
import { decorationLeftAlone } from 'website-opportunities/domain/layout-bands.mjs'
import {
  addDerivedLanguages,
  setSiteLanguage,
  sourceHeadings,
  warmTranslations,
  writeSourceLanguage
} from './joomla-languages.js'
import { hideFactModules } from './joomla-modules.js'
import { demoNameChanges } from './joomla-demo-names.js'
import { kitEntities, translateKit } from './joomla-kit.js'
import { translateKeep } from './keep-words.js'
import { translateLeft } from './left-words.js'
import { translateAuthorWords } from './author-words.js'
import { giveGlyphs } from './glyph-fallback.js'
import { declaredCopy, listOf } from '../../lib/contract-copy.js'
import { isFactList, partialFactRows, withFieldEvidence } from '../../lib/fact-fields.js'
import { dropDefaultPrefix } from './joomla-url-prefix.js'
import {
  contactSteps,
  anchorOnlyMenuItems,
  anchorSteps,
  deadLinkMenuItems,
  findConsentPlugin,
  judgeMenuItems,
  menuSteps,
  orphanedMenuItems,
  pageMetaSteps,
  readMenu,
  setConsentNote,
  shippedPageMeta,
  pagesNotAnswering,
  strandedMenuItems,
  withoutKeptTakeOff,
  writeSteps
} from './joomla-tidy.js'
import { hideRecordPagers } from './joomla-record-pager.js'
import {
  keptById,
  leaveShowcase,
  pickedPages,
  showcaseHolders,
  tickedMenuItems,
  unpickedById,
  unpickedMenuItems
} from './picked-pages.js'
import { routeSteps } from './joomla-article-routes.js'
import { pinArticleOrder } from './joomla-article-order.js'
import { articleSteps, unpickedArticles } from './joomla-articles.js'
import { articleRows, blogArticleSlots, joinPlans } from './joomla-blog-articles.js'
import { translateBlog } from './blog-translate.js'
import { menuCategorySteps } from './joomla-menu-categories.js'
import { categoryLanguageSteps } from './joomla-categories.js'
import { templateOf, translateLanguageOverrides } from './joomla-site-strings.js'
import { customizable, customizableSlots } from '../../lib/contract-customize.js'
import { contractOccupancy, occupiedSample } from './joomla-contract-occupancy.js'

/** The language every Tracy quickstart is written in, and the one on the front page. */
const SOURCE = 'en-GB'
/** Rounds of "write again without what the site refused" before the write is given up. */
const REFUSAL_ROUNDS = 5
/**
 * The designs whose demo is ANOTHER COMPANY'S facts (a Russian contractor's team, certificates and clients), so a module that holds
 * nothing but evidence-gated lines is that company's, not the template's own placeholder. `tracy-base` is Tracy's own template: its
 * evidence-gated modules are whole sections of the page and are never taken off it.
 */
const FACT_MODULE_DESIGNS = new Set(['tracy-business/j6'])
/**
 * The design whose menus are its own words, never the demo company's: the menu judge (labels only since 08/10/2026, TCH #1013)
 * is not asked about it. Every other Joomla quickstart carries another company's labels in its footer menus.
 */
const OWN_MENU_DESIGN = 'tracy-base/'
/** A piece of evidence is a phone, a year, a name: this long at most. A longer quotation of the brief is evidence of nothing. */
const MAX_EVIDENCE = 90
/** Rounds of "hide the other languages" before it is given up: each round hides one chunk. */
const RETIRE_ROUNDS = 100
/** What a line holds when the template reads it as a number (an id, a count, a page): digits only. */
const BARE_NUMBER = /^\d+$/

/**
 * One contract write, handed the reading just made, and made again without what the site refuses by name.
 *
 * 🔒 THE CONTRACT WRITE IS ALL OR NOTHING: ONE LINE THE PLUGIN REFUSES LOSES EVERY WORD (measured 03/10/2026: two lines
 * written into empty slots, "Content cannot activate an empty slot", and 500 lines were never written). The plugin names
 * what it refuses, so those lines are set aside by name and the write is made again without them, a few rounds at most.
 * `changes` and `evidence` are left holding what was written, and `emptyLinks` the links taken off (`empty_links`).
 * @param {object} input
 * @param {(input: any) => Promise<any>} input.applyJoomlaContract - the seeder's write
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {{ contract: string, revision: string }} input.reading - the site as just read
 * @param {Record<string, string>} input.changes
 * @param {Record<string, string>} input.evidence
 * @param {string[]} [input.emptyLinks] - link slots to take off, each one inspect marked `emptyLink`
 * @param {Record<string, string>} [input.replaceKept] - kept pictures the write replaces, each with the words asking for it
 * @param {(job: () => Promise<any>) => Promise<any>} input.timed
 * @param {Record<string, number>} [input.lines] - the lines each slot's box holds, by key (`lineLimits`)
 * @param {(asks: Array<{ key: string, value: string, limit: number }>) => Promise<Record<string, string>>} [input.shorten] -
 *   a line refused as too long for its box, written shorter once (`refused-box-rewrite.js`, #189 item 30)
 * @returns {Promise<string[]>} the keys the site refused
 */
async function writeContractOnce({
  applyJoomlaContract,
  apply,
  siteKey,
  reading,
  changes,
  evidence,
  emptyLinks = [],
  replaceKept = {},
  timed,
  lines = {},
  shorten
}) {
  // 🔒 A LINE IS WRITTEN WITHIN THE LINES ITS BOX HOLDS (spec TracyHQ/tracy#189, 29/10/2026). The plugin refuses words with
  // more line breaks than the box's measured lines (`SlotFit.php`, SLOT_TOO_LONG "more lines than its box holds"), and a
  // refused line kept the template's words: on a local brief build three step descriptions of a T4 home page, each a box of
  // one line, were refused for the writer's two-line answer. Whatever wrote the words (the writer, a fallback, neutral
  // words), the lines past the box's last one join it.
  for (const [key, value] of Object.entries(changes))
    if (key in lines) changes[key] = withinLines(value, lines[key])
  // Occupancy is sealed by the sample, across text, URL and image slots. Route removals to
  // records without provoking an all-or-nothing refusal. Empty samples stay neutral until an
  // explicit records planner activates them (for example the hero's second button).
  const slots = new Map((reading.slots ?? []).map((slot) => [slot.key, slot]))
  const setAside = []
  for (const [key, value] of Object.entries(changes)) {
    if (!contractOccupancy(slots.get(key), value)) continue
    delete changes[key]
    delete evidence[key]
    setAside.push(key)
  }
  if (Object.keys(changes).length === 0 && emptyLinks.length === 0) return setAside
  // The contract door reads the site once more before it writes; it is handed the reading just made.
  let served = false
  const door = async (/** @type {any} */ call) => {
    if (!served && call.action === 'content.contract' && call.params?.operation === 'inspect') {
      served = true
      return reading
    }
    return apply(call)
  }
  /** The lines already written shorter once: refused again, they are set aside. */
  const shortened = new Set()
  for (let attempt = 0; ; attempt += 1) {
    try {
      await timed(() =>
        applyJoomlaContract({
          apply: door,
          siteKey,
          mapping: {
            contract: reading.contract,
            revision: reading.revision,
            changes,
            evidence,
            emptyLinks,
            // Only the kept pictures this write still changes: a line set aside takes its words with it.
            replaceKept: Object.fromEntries(Object.entries(replaceKept).filter(([key]) => key in changes)),
            pending: []
          }
        })
      )
      return setAside
    } catch (error) {
      const words = error instanceof Error ? error.message : String(error)
      const named = [...Object.keys(changes), ...emptyLinks].filter((key) =>
        new RegExp(`(?<![\\w.-])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.])`).test(words)
      )
      if (named.length === 0 || attempt >= REFUSAL_ROUNDS) throw error
      // A line refused for its line count, with a box the map did not measure: written again within the lines the site names.
      let folded = 0
      for (const [, limit, key] of words.matchAll(/at most (\d+) line\(s\): ([\w.-]+)/g)) {
        const value = changes[key]
        const within = typeof value === 'string' ? withinLines(value, Number(limit)) : value
        if (within === value) continue
        changes[key] = within
        folded += 1
      }
      if (folded > 0) {
        served = false
        continue
      }
      // 🔒 A LINE TOO LONG FOR ITS BOX IS ASKED AGAIN ONCE, WITH THE LIMIT THE SITE NAMES (#189 item 30): a refused name kept the
      // demo's on the card, its page and every menu mirroring it. The shorter words replace the long ones in every line of
      // this write that held them, so the places agree; refused again, the line is set aside below.
      const over = characterRefusals(words).filter(
        ({ key }) => typeof changes[key] === 'string' && !shortened.has(key)
      )
      if (shorten && over.length > 0) {
        for (const { key } of over) shortened.add(key)
        const shorter = await shorten(
          over.map(({ key, limit }) => ({ key, value: changes[key], limit }))
        ).catch(() => ({}))
        let rewritten = 0
        for (const [key, value] of Object.entries(shorter)) {
          const long = changes[key]
          if (typeof long !== 'string' || typeof value !== 'string' || !value) continue
          for (const [other, held] of Object.entries(changes))
            if (held === long) {
              changes[other] = value
              if (other in evidence && evidence[other] === long) evidence[other] = value
            }
          rewritten += 1
        }
        if (rewritten > 0) {
          console.warn(
            `[brief-joomla] ${siteKey}: ${rewritten} line(s) refused as too long were written shorter`
          )
          served = false
          continue
        }
      }
      // Which lines the site refused and why, in the log: a refused line keeps the template's words until it is emptied
      // (`planRecordSteps` `extraBlanks`), and the reason is what tells a box limit from markup or an empty slot.
      console.warn(`[brief-joomla] ${siteKey}: the site refused ${named.join(', ')}: ${words}`)
      for (const key of named) {
        delete changes[key]
        delete evidence[key]
        if (emptyLinks.includes(key)) emptyLinks.splice(emptyLinks.indexOf(key), 1)
        setAside.push(key)
      }
      served = false
      // Every line refused: there is nothing left to write, and that is said, not thrown.
      if (Object.keys(changes).length === 0 && emptyLinks.length === 0) return setAside
    }
  }
}

/** The most slots one contract write takes (`apply-joomla-contract`: "Review at most 1500 scalar slots in one content revision"). */
export const WRITE_SLOTS = 1500
/** The most entities one contract write touches (the Claude Cowork plugin, `Engine.php`: "Split the revision into at most 300 entities"). */
export const WRITE_ENTITIES = 300

/** The entity a contract slot belongs to: its key is `<entity>.<n>` (`module-400.1`). */
const entityOf = (/** @type {string} */ key) => {
  const at = key.lastIndexOf('.')
  return at > 0 ? key.slice(0, at) : key
}

/**
 * Write the planned lines, as many contract writes as they need, each within what one write takes: `WRITE_SLOTS` lines and
 * `WRITE_ENTITIES` entities.
 *
 * 🔒 A SITE WITH MORE LINES THAN ONE WRITE TAKES IS WRITTEN IN PARTS, NEVER NOT AT ALL (TCH #1013, 13/10/2026). Measured on
 * the local stand: on JA Kinetic Joomla every Apply that had About to write (Vietnamese, every page of the kit) planned more
 * than 1500 lines, the seeder refused the write whole ("Review at most 1500 scalar slots in one content revision"), and the
 * site kept the template's words with the brief `failed`. Each part is its own content revision, read again before it is
 * written; the links taken off go with the first part. What a part refuses is set aside as one write refuses it.
 * 🔒 AND BY ENTITIES (14/10/2026, run j2): JA Voyara Joomla planned 1,833 lines on 348 entities; two parts by lines still
 * held more than 300 entities each, the plugin refused them ("Split the revision into at most 300 entities") and the brief
 * failed whole. A part closes before either bound is passed, and an entity's lines always travel together.
 * @param {Parameters<typeof writeContractOnce>[0]} input
 * @returns {Promise<string[]>} the keys the site refused
 */
export async function writeContract(input) {
  const { changes, evidence, emptyLinks = [], apply, siteKey } = input
  const keys = Object.keys(changes)
  const linkEntities = new Set(emptyLinks.map(entityOf))
  // The lines grouped by entity, in plan order: a plan within both bounds is one part, written once, as before.
  /** @type {Map<string, string[]>} */
  const groups = new Map()
  for (const key of keys) {
    const entity = entityOf(key)
    const group = groups.get(entity)
    if (group) group.push(key)
    else groups.set(entity, [key])
  }
  /** @type {string[][]} */
  const parts = []
  /** @type {string[]} */
  let part = []
  let slots = emptyLinks.length
  let held = new Set(linkEntities)
  for (const [entity, group] of groups) {
    const more = held.has(entity) ? 0 : 1
    if (part.length > 0 && (slots + group.length > WRITE_SLOTS || held.size + more > WRITE_ENTITIES)) {
      parts.push(part)
      part = []
      slots = 0
      held = new Set()
    }
    part.push(...group)
    slots += group.length
    held.add(entity)
  }
  if (part.length > 0 || parts.length === 0) parts.push(part)
  /** @type {string[]} */
  const setAside = []
  let reading = input.reading
  let written = 0
  /**
   * One part, written as one revision. The plugin also writes a new picture to every language copy the site carries
   * (`QuickstartContract::plan`, "A PICTURE IS THE SAME PICTURE IN EVERY LANGUAGE"), entities these keys do not name: a part
   * those copies take past 300 is refused by that very sentence, and is then written as two halves by entity, never again
   * whole.
   * @param {string[]} keysOfPart @param {string[]} links
   */
  const writePart = async (keysOfPart, links) => {
    if (written > 0)
      reading = await apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
    /** @type {string[]} */
    let refused
    // The part's own lines: what the write wrote shorter (`shorten`) is copied back, so the caller knows what was written.
    const ofPart = Object.fromEntries(keysOfPart.map((key) => [key, changes[key]]))
    try {
      refused = await writeContractOnce({
        ...input,
        reading,
        changes: ofPart,
        evidence: Object.fromEntries(
          keysOfPart.filter((key) => key in evidence).map((key) => [key, evidence[key]])
        ),
        emptyLinks: links
      })
    } catch (error) {
      const owned = [...new Set(keysOfPart.map(entityOf))]
      if (
        !/at most 300 entities/.test(String(error instanceof Error ? error.message : error)) ||
        owned.length < 2
      )
        throw error
      const half = new Set(owned.slice(0, Math.ceil(owned.length / 2)))
      await writePart(
        keysOfPart.filter((key) => half.has(entityOf(key))),
        links
      )
      await writePart(
        keysOfPart.filter((key) => !half.has(entityOf(key))),
        []
      )
      return
    }
    written++
    for (const [key, value] of Object.entries(ofPart)) changes[key] = value
    for (const key of refused) {
      delete changes[key]
      delete evidence[key]
      if (emptyLinks.includes(key)) emptyLinks.splice(emptyLinks.indexOf(key), 1)
      setAside.push(key)
    }
  }
  for (const [n, keysOfPart] of parts.entries()) await writePart(keysOfPart, n === 0 ? [...emptyLinks] : [])
  return setAside
}

/** @type {Map<string, {slots: any[], pages: any[], declared: any[]}>} a contract's map, read once: a release never changes. */
const maps = new Map()

/**
 * The menu entries Apply publishes again because the customer ticked their page (`tickedMenuItems`), read off the release
 * before the site exists: its menu as the lock ships it, with the entries the demo-trim map hides already off — the menu the
 * tidy-up will read once the trim has run. Ids, as the planner's `republished` takes them; empty without a trim map.
 *
 * 🔒 THE WORDS ARE PLANNED BEFORE APPLY PUBLISHES THE PAGE AGAIN, SO THE PLAN MUST ALREADY KNOW (TCH #1013). The planner
 * counts a link into a page the trim hid as dead (until 10/10/2026 it sent it to the contact page and wrote its label for
 * that; now it is taken off after the trim): a ticked Projects on Tracy Business j6 came back after Apply while the About
 * and Services CTAs' "alt" buttons into it led to Contact.
 * @param {{ dir: string }} contract
 * @param {Set<string>} visible - the language tags a visitor will reach
 * @param {unknown} sitePages - `brief.pages`
 * @returns {Set<string>}
 */
function republishedByApply(contract, visible, sitePages) {
  const file = (/** @type {string} */ name) => path.join(contract.dir, name)
  if (!existsSync(file('demo-trim-map.json')) || !existsSync(file('presentation-lock.json'))) return new Set()
  try {
    const rows = trimmedMenuRows(contract, file)
    if (rows === null) return new Set()
    // Each call gets rows of its own: the cached ones are never handed out.
    const own = rows.map((/** @type {any} */ row) => ({ ...row }))
    return new Set(tickedMenuItems(own, visible, sitePages).off.map(String))
  } catch {
    return new Set()
  }
}

/**
 * Whether the release's contract ships a demo-trim profile the receiver can hide demo rows by; an unknown contract is asked.
 * @param {{ dir: string } | null | undefined} contract
 */
export function hasDemoTrim(contract) {
  return !contract?.dir || existsSync(path.join(contract.dir, 'demo-trim-map.json'))
}

/** @type {Map<string, any[] | null>} a release's menu after its trim, read once: a release never changes (as `maps`). */
const trimmedMenus = new Map()

/**
 * The release's menu as the lock ships it, with the entries the demo-trim map hides already off; null when the map hides
 * no menu entry. Parsing the 8 MB lock was most of a Joomla Apply's planning (13/10/2026), once per run.
 * @param {{ dir: string }} contract @param {(name: string) => string} file
 * @returns {any[] | null}
 */
function trimmedMenuRows(contract, file) {
  if (trimmedMenus.has(contract.dir)) return trimmedMenus.get(contract.dir) ?? null
  const hidden = new Set(
    (JSON.parse(readFileSync(file('demo-trim-map.json'), 'utf8')).hide ?? [])
      .filter((/** @type {any} */ h) => h.kind === 'menuItem')
      .map((/** @type {any} */ h) => h.key)
  )
  let rows = null
  if (hidden.size > 0) {
    const lock = JSON.parse(readFileSync(file('presentation-lock.json'), 'utf8')).entities ?? {}
    const entities = JSON.parse(readFileSync(file('content-map.json'), 'utf8')).entities ?? []
    rows = entities
      .filter((/** @type {any} */ e) => e.kind === 'menuItem' && lock[e.key])
      .map((/** @type {any} */ e) => ({
        ...lock[e.key],
        id: Number(e.sourceId),
        published: hidden.has(e.key) ? 0 : Number(lock[e.key].published)
      }))
  }
  trimmedMenus.set(contract.dir, rows)
  return rows
}

/**
 * The site a profile describes when nobody has touched it: every slot holds the words it ships.
 *
 * 🔒 A FACT FIELD WANTS EVIDENCE WHATEVER ITS MODULE IS CALLED (TCH #1326, `fact-fields.js`). The profile's own flags
 * were set by module title, so a hero's `stat-value`, a Branches `city`, a "Home - Stats" `value` and a singular
 * "Landing - Testimonial" `quote` were the planner's to invent (dev, 13/10/2026). The role is added here, on the map
 * every plan and apply reads, so it holds on a site whose plugin still carries the title-only profile.
 */
function staticState(contract) {
  let entry = maps.get(contract.id)
  if (!entry) {
    const map = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
    // A slot the profile only declares (`customize: "keep"`, `lib/contract-customize.js`) is never planned or written here.
    entry = {
      // Each line is planned within its measured box, the limit the site checks (`slot-box-limits.js`).
      // A slot whose demo mixes styles carries its style pattern: the words are replaced, never the style (#189).
      slots: withInlineStyles(
        withBoxLimits(withFieldEvidence(customizableSlots(map.slots ?? []))),
        contract.dir
      ),
      pages: map.pages ?? [],
      // The vocabulary version and the entities (their `demoOnly` mark): the fill plan reads both (ADR 0040).
      roleVocabularyVersion: map.roleVocabularyVersion ?? null,
      entities: map.entities ?? [],
      // The footer link columns the release declares (quickstart-contract skill, #189 item 12).
      navigationGroups: map.navigationGroups ?? [],
      // The call-to-action bands the release declares: message, button and ground as one unit (#189 item 7).
      ctaBands: map.ctaBands ?? [],
      // The contact blocks the release declares: a footer keeps its demo entries kind by kind (#189, site build rule 5).
      contactBlocks: map.contactBlocks ?? [],
      // The record pages the release declares, each with its layout: a landing one loses the blog pager (#189 rule 3).
      recordPages: map.recordPages ?? [],
      declared: withFieldEvidence((map.slots ?? []).filter((slot) => !customizable(slot)))
    }
    maps.set(contract.id, entry)
  }
  return {
    contract: contract.id,
    revision: 'static',
    slots: entry.slots.map((slot) => ({ ...slot, current: slot.sample })),
    pages: entry.pages,
    roleVocabularyVersion: entry.roleVocabularyVersion,
    entities: entry.entities,
    navigationGroups: entry.navigationGroups,
    ctaBands: entry.ctaBands,
    contactBlocks: entry.contactBlocks,
    recordPages: entry.recordPages
  }
}

/**
 * The slots the profile only declares (`customize: "keep"`), as the template ships them: Customize never plans or writes their
 * words, and only the demo company's name is renamed in them (ABOUT-3).
 * @param {{id: string, dir: string}} contract
 */
function declaredSlots(contract) {
  staticState(contract)
  return (maps.get(contract.id)?.declared ?? []).map((slot) => ({ ...slot, current: slot.sample }))
}

/**
 * The demo pictures of the home page a customer's own should replace, in the edition the words are written in.
 * @param {{id: string, dir: string}} contract
 * @param {Map<string, string> | null} langOf - the language of each entity, from the contract
 */
function homeGroups(contract, langOf) {
  const inEdition = (slot) => {
    const own = langOf?.get(slot.entity)
    return own === undefined || own === '*' || own === SOURCE
  }
  const onHome = (slot) => /\bHome\s*-|\bhero\b/i.test(slot.label ?? '')
  return pictureGroups(staticState(contract).slots, inEdition, onHome)
}

/** Two-letter answers that name no written form; the ones a customer asking for them most likely means. */
const DEFAULT_FORM = Object.freeze({ zh: 'zh-CN', pt: 'pt-BR' })

/**
 * The Joomla tags of the languages asked for: `languages` with the source first, each once, an unknown one named and left
 * out; `picked` the same tags in the order the owner gave them, without the source added.
 *
 * A two-letter answer (`pl`) names a language, not the pack Joomla files it under (`pl-PL`): the seeder's own alias table
 * knows a dozen, and the template knows the rest — it ships its demo copy translated into each language a pack exists for,
 * one `<tag>.json` apiece, so those file names are the tags.
 *
 * 🔒 THE SOURCE FIRST IS A MULTILINGUAL SITE'S ORDER, NOT THE OWNER'S. `normaliseLocales` puts en-GB in front of every list,
 * which is right for a template that ships two editions (`/` speaks en-GB, decision 21) and wrong for one that ships a single
 * edition: written in `languages[0]`, a customer who picked only German got English copy, and was told "only en-GB was
 * written" (ledger L11b, read 05/10/2026). A one-edition site is written in `picked[0]`.
 * @param {string[]} asked
 * @param {{ dir: string }} contract
 * @param {(note: string) => void} note
 * @returns {Promise<{ languages: string[], picked: string[] }>}
 */
async function chosenLanguages(asked, contract, note) {
  const { normaliseLocale, normaliseLocales, primaryOf } = await seeder('locales')
  const folder = translationsDirOf(contract)
  const known = folder
    ? readdirSync(folder)
        .filter((f) => /^[a-z]{2,3}-[A-Za-z]{2,4}\.json$/.test(f))
        .map((f) => f.replace(/\.json$/, ''))
    : []
  const tags = []
  for (const tag of asked) {
    const lower = String(tag).toLowerCase()
    try {
      tags.push(normaliseLocale(DEFAULT_FORM[lower] ?? tag))
    } catch {
      // Not one the seeder's table knows: the pack the template ships for that language, if it ships one.
      const own = known.filter((t) => t.toLowerCase().startsWith(`${lower.split('-')[0]}-`))
      const exact = own.find((t) => t.toLowerCase() === lower)
      const preferred = own.find((t) => t === DEFAULT_FORM[lower])
      const pick = exact ?? preferred ?? (lower.includes('-') ? undefined : own[0])
      if (pick) tags.push(pick)
      else note(`${tag} is not a language this site can speak, so it was left out`)
    }
  }
  // A variant of the source language is the source language, as `normaliseLocales` has it.
  const picked = [...new Set(tags.map((tag) => (primaryOf(tag) === primaryOf(SOURCE) ? SOURCE : tag)))]
  return { languages: normaliseLocales(tags), picked }
}

/**
 * @param {object} deps
 * @param {() => Promise<{text: any | null, image?: {url: string, key: string, imageModel: string} | null}>} deps.models - the models this deployment has, per call
 * @param {(email: string, setupRun?: string) => (call: any) => Promise<any>} deps.applyFor - the Apply door, as one person
 * @param {((siteKey: string) => (path: string) => Promise<Buffer | null>) | null} [deps.siteFile] - the first bytes of a file a site serves
 * @param {((siteKey: string) => Promise<import('./glyph-fallback.js').SiteReader | null>) | null} [deps.siteReader] - a site as a
 *   visitor reads it, at its public address (`glyph-fallback.js`)
 * @param {typeof fetch} [deps.fetchImpl] - the picture model's transport; a test's stand-in
 * @param {{forSite: Function, recordPlan: Function, recordOutcome: Function} | null} [deps.realPictures] - the customer's own
 *   photographs for a site an opportunity built (`real-pictures.js`); with them, nothing is drawn
 * @param {{forSite: Function, recordBefore: Function, recordWrite: Function} | null} [deps.woContent] - the restaurant's own
 *   posts for a site an opportunity built (`wo-content.js`), written into the demo articles last
 * @param {((siteKey: string, pages: string[]) => Promise<{findings?: any[]} | null>) | null} [deps.pictureOverlap] - the
 *   site's host reading the build's pictures over the words at every width (`picture-overlap-net.js`); none: unchecked
 */
/** The keys of the slots whose demo words name one of the demo company's names (never served while unwritten). */
function demoNamedKeys(/** @type {any[]} */ slots, /** @type {string[]} */ names) {
  const own = names.map((n) => String(n).trim().toLowerCase()).filter((n) => n.length > 2)
  if (own.length === 0) return []
  return slots
    .filter((slot) =>
      own.some((n) =>
        String(slot?.sample ?? '')
          .toLowerCase()
          .includes(n)
      )
    )
    .map((slot) => slot.key)
}

export function createJoomlaEngine({
  models,
  applyFor,
  siteFile = null,
  siteReader = null,
  fetchImpl,
  realPictures = null,
  woContent = null,
  pictureOverlap = null
}) {
  /**
   * `bound`: a slot plan's card pictures (`copyPinsOf`), each card's own entity's. `copy`: the copy pins, whose card
   * names decide which offering photo each card takes (`fill-plan.mjs`).
   */
  const pictures = async (
    ctx,
    real,
    bound = {},
    copy = null,
    drawDoor = null,
    shaped = undefined,
    written = null
  ) => {
    if (!realPictures || !siteFile || !ctx.contract) return null
    real ??= await realPictures.forSite({
      siteKey: ctx.siteKey,
      email: ctx.email,
      strict: true,
      signal: ctx.signal
    })
    if (!real) return null
    const apply = recordedDoor(ctx, applyFor(ctx.email, ctx.runId))
    const inspect = () =>
      apply({ siteKey: ctx.siteKey, action: 'content.contract', params: { operation: 'inspect' } })
    const { applyJoomlaContract } = await seeder('apply-joomla-contract')
    const { isDerived } = await seeder('plan-joomla-contract')
    const map = staticState(ctx.contract)
    await pinArticleOrder({ apply, siteKey: ctx.siteKey, note: ctx.note })
    const plan = woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
    const sitePlan = await Promise.resolve(plan).catch(() => null)
    return writeContractPictures({
      ctx,
      real,
      realPictures,
      shaped,
      apply,
      siteFile,
      siteReader,
      inspect,
      contentMap: { ...map, slots: map.slots.filter((slot) => !isDerived(slot)) },
      bound,
      copy,
      // Drawn pictures, icons and cut-outs of a brief build (#194, #195): `drawn-pictures.js`.
      drawDoor,
      declared: declaredPictureSlots(ctx.contract),
      // A brief build's kept cards show what the site plan names them (#192): one decider for words and pictures.
      cardNames: sitePlan?.honesty?.cardNames ?? null,
      // The writer's text model reads which glyph shows each item icon (#189).
      textModel: async () => (await models()).text ?? null,
      // Copy first, then pictures (#189): the words settled in `prepare` choose each frame.
      written,
      write: async ({ state, changes, replaceKept }) =>
        new Set(
          await writeContract({
            applyJoomlaContract,
            apply,
            siteKey: ctx.siteKey,
            reading: state,
            changes,
            evidence: {},
            lines: lineLimits(staticState(ctx.contract).slots),
            ...(replaceKept ? { replaceKept } : {}),
            timed: (job) => job()
          })
        )
    })
  }
  return {
    pictures,
    async preparePictures(ctx, prepared) {
      if (!prepared.real || !realPictures || !siteFile || !ctx.contract) return null
      const { isDerived } = await seeder('plan-joomla-contract')
      const map = staticState(ctx.contract)
      const sitePlan = await Promise.resolve(
        woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
      ).catch(() => null)
      return prepareContractPictures({
        ctx,
        real: prepared.real,
        realPictures,
        siteFile,
        siteReader,
        contentMap: { ...map, slots: map.slots.filter((slot) => !isDerived(slot)) },
        bound: prepared.copyPins?.pictures ?? {},
        copy: prepared.copyPins ?? null,
        drawDoor: prepared.drawDoor ?? null,
        declared: declaredPictureSlots(ctx.contract),
        cardNames: sitePlan?.honesty?.cardNames ?? null,
        textModel: async () => (await models()).text ?? null,
        // 🔒 COPY FIRST, THEN PICTURES (#189, site build rule 2): every word the plan writes is settled in `prepare`, so
        // each frame is chosen and drawn from its page, the copy next to it and its role.
        written: prepared.changes ?? null
      })
    },
    /** @param {import('../brief-build.js').BriefContext} ctx */
    async prepare(ctx) {
      if (!ctx.contract)
        throw new Error('this template is not sealed by a content contract, so its words stay as released')
      // A name left blank keeps the template's: the template's own company stands in for the address name (`withTemplateName`).
      ctx.normalized = withTemplateName(
        ctx.normalized,
        listOf(declaredCopy(ctx.contract.dir).demoCompanyNames)
      )
      const [{ planJoomlaContract, entityLanguages, isDerived }, { text, image }] = await Promise.all([
        seeder('plan-joomla-contract'),
        models()
      ])
      const started = Date.now()
      const dataDir = seederDataDir(ctx.contract)
      // The pictures are drawn beside the words, never instead of them, and never fail them — and only as many as
      // this template has demo pictures to replace.
      const groups = homeGroups(ctx.contract, entityLanguages(dataDir, ctx.contract.id))
      // About left blank: a picture has no language, so none is drawn from the name alone (`aboutGiven`).
      const described = aboutGiven(ctx.brief)
      // The customer's own photographs, when an opportunity built this site: then nothing is drawn (`real-pictures.js`).
      const reading = realPicturesOf(realPictures, ctx)
      const woReading = woContentOf(woContent, ctx)
      const drawing = reading.then((real) =>
        drawPictures({
          door: described && !real ? (image ?? null) : null,
          briefs: pictureBriefs(ctx.normalized).slice(0, groups.length),
          signal: budgetSignal(ctx.signal, ctx.deadlineAt),
          fetchImpl
        })
      )
      const state = staticState(ctx.contract)
      // A quickstart that ships two editions carries its customer's language beside the source; one that
      // ships none is written in the first language asked for.
      const multilingual = existsSync(path.join(ctx.contract.dir, 'multilingual-map.json'))
      const { languages, picked } = await chosenLanguages(ctx.normalized.languages, ctx.contract, ctx.note)
      // 🔒 ONE LANGUAGE THAT IS NOT THE SOURCE'S IS WRITTEN INTO THE SOURCE EDITION, EVEN ON A TWO-EDITION TEMPLATE (TCH #1013,
      // D10, O2): no edition is made under a prefix, every other edition (the shipped one of that language too) is hidden,
      // and `/` speaks the language chosen. Several languages keep the source in en-GB and the others beside it (decision 21).
      const sole = multilingual && picked.length === 1 && picked[0] !== SOURCE
      const editions = multilingual && !sole
      const written = editions ? SOURCE : (picked[0] ?? SOURCE)
      if (!multilingual && picked.length > 1)
        ctx.note(`this template carries one language, so only ${written} was written`)
      // The page words an opportunity's build has a source for: pinned into the plan, never asked of the model (`wo-copy-pins.js`).
      const copyReading = reading.then((real) =>
        copyPinsOf(woContent, ctx, {
          cms: 'joomla',
          contentMap: state,
          lang: written,
          pictures: real?.pictures
        })
      )
      // The editions the template ships itself are written like the source; the others have to be made.
      const shipped = new Set(entityLanguages(dataDir, ctx.contract.id)?.values() ?? [])
      const keep = editions
        ? languages.filter((tag) => tag === SOURCE || shipped.has(tag))
        : sole
          ? [SOURCE]
          : []
      const missing = editions ? languages.filter((tag) => !keep.includes(tag)) : []
      // A source written in one other language is called by it once the site is up, headings included: they are
      // translated now, beside the words, so the site's own plan finds every one answered.
      // So are the headings of a one-edition site written in another language (`setSiteLanguage`).
      const headings =
        (sole || (!multilingual && written !== SOURCE)) && text
          ? warmTranslations({
              locale: written,
              slots: sourceHeadings(ctx.contract, SOURCE),
              changes: {},
              shipped: new Map(),
              model: text,
              signal: budgetSignal(ctx.signal, ctx.deadlineAt),
              keep: [String(ctx.normalized.name ?? '')]
            })
              .then(({ cache }) => cache)
              .catch(() => new Map())
          : Promise.resolve(new Map())
      const statisticPlan = await Promise.resolve(
        woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
      ).catch(() => null)
      const site = {
        ...siteBlock(ctx.normalized),
        statistics: statisticPlan?.statistics ?? [],
        // The copy writer never invites a walk-in to a business that works by appointment (#189 item 19).
        byAppointment: Boolean(statisticPlan?.contact?.booking),
        // One spelling, casing and number format for the whole site (`site-style-sheet.mjs`, COO criterion 1.6).
        styleRule: styleSheetRule(statisticPlan?.styleSheet),
        languages: editions ? languages : [written],
        ...(editions ? {} : { sourceLanguage: written })
      }
      // 🔒 THE KIT SAMPLE PAGES KEEP THE TEMPLATE'S CONTENT, IN THE SITE'S LANGUAGE (K3): never planned in the customer's words,
      // translated beside the plan when the site is written in another language (`joomla-kit.js`).
      const kit = kitEntities(ctx.contract.dir)
      const ownLanguage = entityLanguages(dataDir, ctx.contract.id)
      /** Whether a visitor reads a slot's entity: the source edition, or an edition kept. */
      const shown = (/** @type {any} */ slot) => {
        const own = ownLanguage?.get(slot.entity)
        return own === undefined || own === '*' || own === SOURCE || keep.includes(own)
      }
      const kitWords = (async () =>
        translateKit({
          slots: state.slots.filter((slot) => {
            const own = ownLanguage?.get(slot.entity)
            return kit.has(slot.entity) && (own === undefined || own === '*' || own === SOURCE)
          }),
          locale: written,
          source: SOURCE,
          model: text,
          shipped:
            written === SOURCE
              ? new Map()
              : (await seeder('shipped-translations')).loadShippedTranslations(
                  dataDir,
                  ctx.contract.id,
                  written
                ),
          signal: budgetSignal(ctx.signal, ctx.deadlineAt),
          note: ctx.note
        }))()
      // 🔒 THE DEMO BLOG ARTICLES OF A FULL SITE ARE TRANSLATED, NEVER REWRITTEN (product owner, decision 1 after g65, 12/10/2026;
      // `blog-translate.js`): the pages' planner leaves the posts of the blog alone (a post a page opens too is one of them,
      // `joomla-blog-articles.js`); their pictures, links, aliases and number stay. About left blank keeps them, even on a site
      // written in another language: blank keeps the template.
      const posts = described
        ? blogArticleSlots({
            slots: state.slots,
            pages: state.pages,
            kit,
            shown,
            isDerived,
            articles: articleRows(ctx.contract.dir)
          })
        : { slots: [], articles: 0, left: 0, stories: [] }
      const stories = new Set(posts.stories)
      const copyPins = await copyReading
      const pinned = new Set(Object.keys(copyPins?.pins ?? {}))
      const planned = {
        ...state,
        slots: state.slots.filter(
          (slot) =>
            !((kit.has(slot.entity) || stories.has(slot.entity)) && slot.type === 'text') &&
            !pinned.has(slot.key)
        )
      }
      // The lines of the articles that are no story (a legal text) are planned line by line, beside the pages.
      const lineByLine = posts.slots.filter((slot) => !stories.has(slot.entity))

      /** @type {{changes: Record<string, any>, evidence: any, pending: string[], reasons: any, invented: string[], owners?: Record<string, string>}} */
      let plan = { changes: {}, evidence: {}, pending: [], reasons: {}, invented: [] }
      /** @type {Record<string, string>} the band message lines the page pass was told an action for (`page-pass.js`) */
      let passActions = {}
      /** @type {Record<string, any> | null} the page pass's hints, by key: the rule an unwritten line is repaired by */
      let passHints = null
      let calls = 0
      let failed = 0
      // The pages the customer ticked that the demo trim hides come back in Apply: a button into one keeps its page (#1013).
      const republished = republishedByApply(
        ctx.contract,
        new Set([SOURCE, ...keep]),
        ctx.brief?.pages ?? null
      )
      // About left blank keeps the template's words (`aboutGiven`), except in a source written in a language the template has no
      // words in: there is no demo text to keep in it, as the EmDash tool's `rewritesIn` does.
      const rewrites = described || written !== SOURCE
      // Facts nobody gave never reach the site.
      const facts = factsOf(spokenOf(ctx.brief), ctx.normalized.contact, answeredName(ctx.normalized))
      const slotByKey = new Map(state.slots.map((s) => [s.key, s]))
      // Beside the pages' planner, never waiting on it: the posts of the blog in the site's language, each distinct text once; on a
      // site in the template's language they stay as it has them. A fact line (an author's name) goes with the lines the plan
      // left (`translateLeft`).
      const blogLines = posts.slots.filter(
        (slot) => stories.has(slot.entity) && slot.type === 'text' && !slot.requiresEvidence
      )
      const blogKeys = new Set(blogLines.map((slot) => slot.key))
      /** @type {Promise<Record<string, string>>} */
      const blogWords =
        text && written !== SOURCE && blogLines.length > 0
          ? translateBlog({
              lines: blogLines.map((slot) => ({
                key: slot.key,
                sample: String(slot.sample ?? ''),
                maxCharacters: Number(slot.maxCharacters ?? 600)
              })),
              locale: written,
              model: text,
              signal: budgetSignal(ctx.signal, ctx.deadlineAt),
              note: ctx.note,
              keep: [String(ctx.normalized.name ?? '')],
              what: 'the demo blog articles'
            }).catch((error) => {
              ctx.note(
                `the demo articles could not be translated and keep the template’s words: ${error instanceof Error ? error.message : error}`
              )
              return {}
            })
          : Promise.resolve({})
      // 🔒 A `keep` LINE KEEPS ITS MEANING, NOT THE TEMPLATE'S LANGUAGE (LANG-2, 25/10/2026; `keep-words.js`): on a site written in
      // another language, every keep line a visitor reads is translated from the template's words, beside the plan, never
      // waiting on it. A heading split into styled pieces ("THE" + "WORKOUT") is asked as one phrase.
      /** @type {Promise<Record<string, string>>} */
      const keepWords =
        text && written !== SOURCE
          ? translateKeep({
              slots: declaredSlots(ctx.contract).filter(
                (slot) => !isDerived(slot) && shown(slot) && !pinned.has(slot.key)
              ),
              locale: written,
              source: SOURCE,
              model: text,
              signal: budgetSignal(ctx.signal, ctx.deadlineAt),
              note: ctx.note,
              keep: [String(ctx.normalized.name ?? '')]
            }).catch((error) => {
              ctx.note(
                `the lines the template keeps could not be translated and keep its words: ${error instanceof Error ? error.message : error}`
              )
              return {}
            })
          : Promise.resolve({})
      let postsUnread = false
      if (!text) ctx.note('no text model is set, so the template keeps its own words')
      else if (!rewrites) ctx.note(ABOUT_BLANK_NOTE)
      else {
        const generate = firmGenerate(text, budgetSignal(ctx.signal, ctx.deadlineAt))
        // 🔒 EACH OFFERING'S CARD AND PAGE IS WRITTEN FROM THAT OFFERING (spec TracyHQ/tracy#189): a brief build's site plan names
        // the offering of every kept card (`honesty.cardNames`), and the writer is told it line by line.
        // The cards the plan takes off are not named in the heading of the section that held them (`sectionShows`).
        const planHonesty = await Promise.resolve(
          woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
        )
          .then((plan) => plan?.honesty ?? null)
          .catch(() => null)
        const offerings = planHonesty?.cardNames ?? null
        const hiddenCards = (planHonesty?.records ?? [])
          .filter((r) => r?.decision === 'hide')
          .map((r) => r.group)
        // 🔒 COPY VOICE (#189 round 9, class F): each offering is written from the owner's own posts about it, and the lines
        // the build pinned from the brief are what the writer must not say again elsewhere (`offering-posts.js`, `copy-voice.mjs`).
        const offeringPosts = offeringPostsOf((await woReading)?.items, Object.values(offerings ?? {}))
        const pinnedWords = state.slots
          .filter((slot) => typeof copyPins?.pins?.[slot.key] === 'string')
          .map((slot) => ({ ...slot, value: copyPins.pins[slot.key] }))
        // 🔒 ONE PASS PER PAGE (COO decision 30/10/2026, spec TracyHQ/tracy#189, `page-pass.js`): the copy writer is given each
        // page whole, with the shape of every sibling list, the lines of sibling record pages, the offerings a line must
        // describe and the action of every band, and its answer is judged by the checks of the writers that used to patch
        // the page afterwards. Those writers only write the lines the pass hands them, never a line the pass holds.
        const page = rewrites
          ? pagePass({
              slots: state.slots.filter((slot) => !isDerived(slot) && shown(slot)),
              contentMap: staticState(ctx.contract),
              honesty: planHonesty,
              sitePlan: statisticPlan,
              apart: new Set([
                ...Object.keys(heroSlotValues(statisticPlan, written, () => undefined)),
                ...(statisticPlan?.slots ?? [])
                  .filter((s) => String(s?.reason ?? '').startsWith('intro-'))
                  .map((s) => s.key)
              ]),
              briefText: [
                facts.text,
                String(statisticPlan?.brand?.description?.value ?? ''),
                ...Object.values(planHonesty?.values ?? {}).map((v) => String(v.value))
              ].join(' '),
              fixed: {
                ...Object.fromEntries(
                  Object.entries(planHonesty?.values ?? {}).map(([key, v]) => [key, String(v?.value ?? '')])
                ),
                ...copyPins?.pins
              }
            })
          : null
        passHints = page?.hints ?? null
        passActions = Object.fromEntries(
          Object.entries(page?.hints ?? {})
            .filter(([, h]) => typeof h?.action === 'string')
            .map(([key, h]) => [key, h.action])
        )
        const answered = await planConcurrently(
          async (ask) => {
            const pages = await planJoomlaContract({
              state: planned,
              site,
              generate: ask,
              dataDir,
              surface: 'pages',
              trimmed: true,
              republished,
              inventions: 'never',
              offerings,
              hidden: hiddenCards,
              written: pinnedWords,
              offeringPosts,
              byPage: true,
              hints: page?.hints ?? null,
              complain: page?.complain ?? null,
              rules: rulesFor({ writer: 'page-copy' })
            })
            if (lineByLine.length === 0) return pages
            try {
              const articles = await planJoomlaContract({
                state: { ...planned, slots: lineByLine },
                site,
                generate: ask,
                dataDir,
                trimmed: false,
                inventions: 'never'
              })
              return joinPlans(pages, articles)
            } catch {
              // No batch of the articles could be read: they keep the template's words, and the pages are not lost with them.
              postsUnread = true
              return pages
            }
          },
          generate,
          copyPlanBudget(ctx)
        )
        plan = answered.result
        recordCopyPlan(ctx, answered, plan)
        if (posts.articles > 0) ctx.time('articlesPlanned', postsUnread ? 0 : posts.articles)
        if (postsUnread) ctx.note('the demo articles could not be written and keep the template’s words')
        if (posts.left > 0)
          ctx.note(
            `${posts.left} demo article(s) keep the template’s words: one Apply writes at most the lines of ${posts.articles}`
          )
        calls = answered.calls
        failed = answered.failed
        if (calls > 0 && failed === calls)
          ctx.note('the text model did not answer, so the template keeps its own words')
        else if (failed > 0)
          ctx.note(`${failed} part(s) of the text could not be written and keep the template’s words`)
        const unread = Object.values(plan.reasons ?? {}).filter((r) => r === 'model-unreadable').length
        if (unread > 0)
          ctx.note(`${unread} line(s) of text could not be written and keep the template’s words`)
        const untranslated = Object.values(plan.reasons ?? {}).filter(
          (r) => r === 'button-untranslated'
        ).length
        if (untranslated > 0)
          ctx.note(
            `${untranslated} social or unlinked button label(s) could not be translated and keep the template’s words`
          )
        const noContact = Object.values(plan.reasons ?? {}).filter((r) => r === 'void-no-contact').length
        if (noContact > 0)
          ctx.note(
            `${noContact} button(s) that lead nowhere keep the template’s label: the site has no Contact page to send them to`
          )
      }

      // Facts nobody gave never reach the site; and nothing the model itself says it made up.
      const madeUp = new Set(plan.invented)
      // The writer's style marks are kept apart: every step below reads plain words, the write styles them (#189).
      const styleMarks = takeStyleMarks(plan.changes)
      // The lines the page pass holds: no later writer overwrites one while it still holds the pass's words.
      const owned = slotOwnership()
      owned.claim(
        Object.fromEntries(Object.entries(plan.changes).filter(([key]) => key in (plan.owners ?? {}))),
        'page-copy',
        plan.owners ?? {}
      )
      const candidate = Object.fromEntries(Object.entries(plan.changes).filter(([key]) => !madeUp.has(key)))
      const { kept, dropped } = guardChanges(candidate, slotByKey, facts)
      const left = dropped.length + [...madeUp].filter((key) => key in plan.changes).length
      if (left > 0) ctx.note(`${left} line(s) were left out because they stated facts you did not give`)
      // The posts of the blog, translated beside the plan.
      const blogSaid = await blogWords
      Object.assign(kept, blogSaid)
      if (Object.keys(blogSaid).length > 0) ctx.time('articleLinesTranslated', Object.keys(blogSaid).length)

      // 🔒 A SLOT THAT WANTS EVIDENCE IS SATISFIED BY A QUOTATION OF THE BRIEF, SO A MODEL QUOTES ALL OF IT. Measured 03/10/2026: the
      // About page's "Safety" paragraph and its lede both read "Golden Crust Bakery, 12 Hang Bac, Hanoi. Fresh sourdough, ...
      // Call 0912 345 678 ... Open 6am-8pm every day", because the planner takes a value of an evidence slot when it is a
      // verbatim piece of the brief. A long quotation is not evidence of anything: the slot keeps the template's words.
      for (const key of Object.keys(kept))
        if (slotByKey.get(key)?.requiresEvidence && [...kept[key]].length > MAX_EVIDENCE) delete kept[key]
      // 🔒 THE DEMO COMPANY'S CONTACT DETAILS NEVER STAND FOR THE CUSTOMER'S (15/10/2026, TCH #1367; it replaces D12 of
      // 11/10/2026, which kept them as placeholders). Production site ali-barber, a Dutch barbershop on Tracy Business: every page
      // printed a Russian contractor's phone, mailbox and Kaluga address, and the customer left after a minute. A line the plan
      // rewrote without the detail goes in as written, and the site identity's details nobody gave are emptied (the Claude Cowork
      // plugin lets an identity slot be emptied, and the layout leaves out a line whose token is blank) once the brief names or
      // describes the business — with neither, the site is still the demo company's, and its details stay with it.
      /** @type {Set<string>} identity slots emptied on purpose: never "left in the template's language" to translate */
      const emptied = new Set()
      if (described || nameAnswered(ctx.normalized)) {
        const { resolveChromeSlots } = await seeder('chrome-slots')
        const chrome = resolveChromeSlots({ contract: state.contract, slots: state.slots, site })
        for (const [key, value] of Object.entries(chrome.values)) {
          const slot = slotByKey.get(key)
          if (value !== '' || slot?.siteIdentity !== true || !shown(slot)) continue
          if (String(slot.current ?? slot.sample ?? '').trim() === '') continue
          kept[key] = ''
        }
      }
      for (const key of Object.keys(kept))
        if (kept[key] === '' && slotByKey.get(key)?.siteIdentity === true) emptied.add(key)
      // 🔒 A REPEATED ROW IS ONE FACT (`partialFactRows`): a branch's city is not written beside the demo's address, and one
      // place in the description is not three branches. Such a row keeps the template's words, every cell of it.
      const halfRows = partialFactRows({ slots: state.slots, changes: kept, evidence: plan.evidence ?? {} })
      for (const key of halfRows) delete kept[key]
      if (halfRows.length > 0)
        ctx.note(`${halfRows.length} line(s) of rows you did not describe in full keep the template’s words`)
      // The facts the customer gave, as the plan wrote them: a translation of the template's own words below may put a fact
      // line back (`translateLeft`), and that is no fact of theirs.
      const given = new Set(
        Object.keys(kept).filter((key) => String(plan.evidence?.[key] ?? '').trim() !== '')
      )
      Object.assign(kept, await kitWords)

      // 🔒 WHAT THE PLAN LEFT IN THE TEMPLATE'S LANGUAGE IS TRANSLATED, NEVER SHOWN IN ENGLISH (LANG-2, TCH #1013; `left-words.js`):
      // a line the answer kept in English or left out (dev g60-ess-j-full: the menu headings "User", "J!Pages", "J! Content"),
      // a line a batch lost. A demo contact detail kept as a placeholder (D12), a kit page (translated above), a derived copy
      // and a hidden edition are not lines of the site's words.
      const swept = rewrites
        ? await translateLeft({
            slots: state.slots.filter(
              (slot) =>
                !kit.has(slot.entity) &&
                !isDerived(slot) &&
                shown(slot) &&
                !emptied.has(slot.key) &&
                !blogKeys.has(slot.key) &&
                !pinned.has(slot.key)
            ),
            written: kept,
            locale: written,
            source: SOURCE,
            model: text,
            signal: budgetSignal(ctx.signal, ctx.deadlineAt),
            note: ctx.note,
            keep: [String(ctx.normalized.name ?? '')]
          })
        : {}
      Object.assign(kept, swept)
      // The keep lines in the site's language, translated beside the plan; Apply writes exactly these keep slots (`translatedKeep`).
      const keepSaid = await keepWords
      Object.assign(kept, keepSaid)

      // 🔒 A NAME THE CUSTOMER GAVE RENAMES THE DEMO COMPANY IN EVERY LINE A VISITOR READS (D9, ABOUT-3, 25/10/2026). Every
      // spelling the template declares (`demoCompanyNames`, `<version>.copy.json`) becomes the customer's name, as a word, never
      // inside an address or a file (`joomla-demo-names.js`), WHETHER OR NOT About was answered: a description rewrites the
      // pages, but the blog's posts are only translated (an English site keeps them as shipped), a line the model echoes or a
      // batch loses keeps the demo's words, and a `keep` slot is never planned. On accept-boxing-1025 (JA Boxing 1.0.3, About
      // given) "We opened Studio Getfit in 2008" stayed on four class pages and "JA Boxing" in the search masthead, because this
      // rename ran only with About blank. It renames what each line will hold: the words written for it, or the template's.
      // Never a line that wants evidence, a derived copy, a hidden edition or a sourced pin. A `keep` slot takes the rename and
      // nothing else (`renamedKeep`): the name is not a fact of the demo's that the slot is kept for, it is the demo's brand.
      const name = String(ctx.normalized.name ?? '').trim()
      /** @type {string[]} the `keep` slots whose words only change by the rename, written in Apply beside the plan */
      const renamedKeep = []
      /** @type {string[]} the lines naming the demo company beside a fact (a year, a founding, a count): emptied, never renamed */
      const factLines = []
      if (name && nameAnswered(ctx.normalized)) {
        const names = listOf(declaredCopy(ctx.contract.dir).demoCompanyNames)
        const declared = declaredSlots(ctx.contract)
        const tokenized = [...state.slots, ...declared].some((slot) => /\{site\./.test(slot.sample ?? ''))
        const renamed = demoNameChanges({
          slots: [...state.slots, ...declared].filter(
            (slot) => !slot.requiresEvidence && !isDerived(slot) && shown(slot) && !pinned.has(slot.key)
          ),
          valueOf: (slot) => (slot.key in kept ? kept[slot.key] : String(slot.sample ?? '')),
          names,
          replacement: tokenized ? '{site.name}' : name,
          factLines
        })
        Object.assign(kept, renamed)
        // A fact line the writer echoed holds the demo's words too: it leaves the plan and is emptied below.
        for (const key of factLines) delete kept[key]
        const keepKeys = new Set(declared.map((slot) => slot.key))
        renamedKeep.push(...Object.keys(renamed).filter((key) => keepKeys.has(key)))
      }

      // 🔒 NO PLACEHOLDER, AND NO NEW NAME FOR A SOCIAL NETWORK, WHATEVER STEP WROTE THE LINE (`guardWritten`). The plan was checked
      // above; the translations made since were not, and JA Mood j6 1.0.2's icons came back with "trống" for their invisible
      // "empty" and "Google cộng" for "Google plus" (sq-check mod-lad4, 13/10/2026). Such a line keeps what the site holds.
      const guarded = new Map([...slotByKey, ...declaredSlots(ctx.contract).map((slot) => [slot.key, slot])])
      for (const { key } of guardWritten(kept, guarded, facts).held) delete kept[key]
      /** @type {string[]} the `keep` slots written in the site's language, by Apply beside the plan */
      const translatedKeep = Object.keys(keepSaid).filter((key) => key in kept)
      // 🔒 NO INVENTED PERSON, PRICE OR NUMBER, AND THE SITE PLAN'S RECORDS AND FACTS (#192, `joomla-plan-records.js`): a name or a
      // figure the customer never gave is not written, whatever build; on a brief build the plan's people, offerings and emptied
      // facts win over the writer, and a label left in the demo's words takes its neutral label.
      const sitePlan = await Promise.resolve(
        woContent?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
      ).catch(() => null)
      const honesty = sitePlan?.honesty ?? null
      const honest = await honestWords({
        kept,
        slots: state.slots.filter(
          (slot) => !kit.has(slot.entity) && !isDerived(slot) && shown(slot) && !pinned.has(slot.key)
        ),
        ownText: [facts.text, ...Object.values(honesty?.values ?? {}).map((v) => String(v.value))].join(' '),
        honesty,
        locale: written,
        business: { phone: ctx.normalized.phone, email: ctx.normalized.email },
        pages: state.pages ?? []
      })
      if (honest.counts.invented > 0)
        ctx.note(
          `${honest.counts.invented} line(s) named a person, a price or a number you did not give and were left out`
        )
      // 🔒 NO LINE THE COPY WRITER WAS GIVEN KEEPS THE DEMO'S WORDS (spec TracyHQ/tracy#189, C03/C09; `leftDemoWords`). A line the
      // writer pended, never answered or wrote only for a guard to drop, and a demo sentence that only took the owner's name,
      // takes the plan's fallback, its role's neutral words or the business's own description, else it is emptied after the
      // write. Measured 29/10/2026 (local stand, a coaching club brief on a Joomla T4 template): step descriptions and module
      // paragraphs in the demo's sport stayed on the home page. Brief builds only (a site plan); the blog's posts are not lines
      // of the copy writer.
      /** @type {any[]} the left demo lines to empty after the write, beside the plan's own fact fields */
      let demoBlanks = []
      /** @type {any[]} the cards whose title the writer left in the demo's words, taken off whole after the write */
      let demoHides = []
      /** @type {string[]} the keys the copy writer was given: a line the site refuses later is emptied too */
      let demoAsked = []
      if (sitePlan?.slots && rewrites) {
        demoAsked = sitePlan.slots
          .filter(
            (s) => s?.decision === 'text' && !blogKeys.has(s.key) && !stories.has(String(s.key).split('.')[0])
          )
          .map((s) => s.key)
        const left = await leftDemoWords({
          kept,
          slots: state.slots.filter(
            (slot) => !kit.has(slot.entity) && !isDerived(slot) && shown(slot) && !pinned.has(slot.key)
          ),
          asked: demoAsked,
          held: [
            ...(plan.pending ?? []),
            ...Object.keys(plan.reasons ?? {}),
            ...Object.keys(plan.changes ?? {}).filter((key) => !(key in kept))
          ],
          ownText: [facts.text, ...Object.values(honesty?.values ?? {}).map((v) => String(v.value))].join(
            ' '
          ),
          honesty,
          locale: written,
          business: { phone: ctx.normalized.phone, email: ctx.normalized.email },
          description: String(sitePlan?.brand?.description?.value ?? ''),
          pages: state.pages ?? [],
          entities: state.entities ?? []
        })
        demoBlanks = left.blanks
        demoHides = left.hides
        if (left.counts.hidden > 0) ctx.time('demoCardsHidden', left.counts.hidden)
        const replaced = left.counts.fallbacks + left.counts.neutral + left.counts.described
        if (replaced + left.counts.blanked > 0) {
          ctx.time('demoLinesReplaced', replaced)
          ctx.time('demoLinesEmptied', left.counts.blanked)
        }
      }
      // A demo line stating a fact beside the demo company's name, given no other words, is emptied after the write (#189).
      const blanked = new Set(demoBlanks.map((slot) => slot.key))
      demoBlanks.push(
        ...state.slots.filter(
          (slot) => factLines.includes(slot.key) && !(slot.key in kept) && !blanked.has(slot.key)
        )
      )
      // The sourced words, as their sources say them: no guard of the model's words is theirs.
      Object.assign(kept, copyPins?.pins ?? {}, plannedSlotValues(sitePlan))
      // A planned statistic is a complete sourced unit even when the profile copy reader returned no pins.
      demoBlanks = demoBlanks.filter((slot) => !(slot.key in plannedSlotValues(sitePlan)))
      // 🔒 THE FIRST SCREEN SAYS WHAT, WHERE AND HOW TO CONTACT (COO rule 29/10/2026, `hero-lines.js`): the site plan's hero
      // and offering-page intro lines win over the copy writer's, judged against the headings as written, and the left-demo
      // sweep never empties them.
      const heroLines = heroSlotValues(sitePlan, written, (key) =>
        key in kept ? kept[key] : slotByKey.get(key)?.sample
      )
      Object.assign(
        heroLines,
        await buttonActionValues({
          sitePlan,
          locale: written,
          slots: [...state.slots, ...declaredSlots(ctx.contract)],
          model: text,
          signal: ctx.signal,
          note: ctx.note
        })
      )
      // A hero line's own marks (the USP's key words) style it; the copy writer's marks for that slot no longer count.
      Object.assign(styleMarks, takeStyleMarks(heroLines))
      Object.assign(kept, heroLines)
      demoBlanks = demoBlanks.filter((slot) => !(slot.key in heroLines))
      // Required card summaries are settled after copy pins and protected from later empty-field cleanup.
      const offeringSummaries = await offeringSummaryValues({
        slots: state.slots.filter((slot) => !isDerived(slot) && shown(slot)),
        honesty,
        written: kept,
        locale: written,
        model: text,
        signal: ctx.signal,
        note: ctx.note
      })
      Object.assign(kept, offeringSummaries)
      demoBlanks = demoBlanks.filter((slot) => !(slot.key in offeringSummaries))
      // 🔒 EVERY KEPT OFFERING CARD DESCRIBES ITS OFFERING (COO rule, #189 round 9, `offering-description-writer.js`): a line
      // the brief has no words for beyond the name, left unwritten or only naming it, is written once more by the text
      // model from the trade (editorial words only), and kept through the cleanup like a summary.
      const describedLines = await writeOfferingDescriptions({
        slots: state.slots.filter((slot) => !isDerived(slot) && shown(slot)),
        honesty,
        written: kept,
        about: {
          styleSheet: sitePlan?.styleSheet ?? null,
          business: String(ctx.normalized.name ?? ''),
          description: String(sitePlan?.brand?.description?.value ?? ''),
          sourceText: [facts.text, ...Object.values(honesty?.values ?? {}).map((v) => String(v.value))].join(
            ' '
          )
        },
        model: text,
        locale: written,
        signal: ctx.signal
      })
      Object.assign(kept, owned.admit(describedLines, 'offering', kept))
      Object.assign(offeringSummaries, describedLines)
      demoBlanks = demoBlanks.filter((slot) => !(slot.key in describedLines))
      // 🔒 A LINE UNDER AN OFFERING'S NAME SAYS MORE THAN THE NAME (COO rule, #189 round 9, `offering-name-only.js`): one that
      // would only repeat it, or one the writer still left unwritten, is emptied after the write, whoever wrote it.
      for (const slot of nameOnlyOfferingLines({
        slots: state.slots.filter((slot) => !isDerived(slot) && shown(slot)),
        honesty,
        written: kept
      })) {
        delete kept[slot.key]
        if (!demoBlanks.some((b) => b.key === slot.key)) demoBlanks.push(slot)
      }
      // 🔒 SIBLINGS OF ONE LIST SHARE ONE SHAPE (COO rules 30/10/2026, `sibling-copy-writer.js`): every body of a repeated
      // card list is written to the band its demo text gives (sentences, length, the demo's line count in that box), the
      // same line count for every sibling. Never three lines beside one line, never one item body of four, never cut.
      const shownSlots = state.slots.filter((slot) => !isDerived(slot) && shown(slot))
      const siblingShape = await shapeSiblingCopy({
        slots: shownSlots,
        written: kept,
        about: {
          styleSheet: sitePlan?.styleSheet ?? null,
          business: String(ctx.normalized.name ?? ''),
          description: String(sitePlan?.brand?.description?.value ?? ''),
          sourceText: [facts.text, ...Object.values(honesty?.values ?? {}).map((v) => String(v.value))].join(
            ' '
          )
        },
        model: text,
        locale: written,
        signal: ctx.signal,
        apart: new Set([
          ...Object.keys(heroLines),
          ...(sitePlan?.slots ?? [])
            .filter((s) => String(s?.reason ?? '').startsWith('intro-'))
            .map((s) => s.key)
        ])
      })
      // A spelling aligned to the card's own title keeps the pass's words: the one change of a held line allowed.
      const spelt = (/** @type {string} */ v) =>
        plainText(v)
          .split(/\s+/)
          .map((w) => spellingKey(w))
          .join(' ')
      Object.assign(
        kept,
        owned.admit(siblingShape.values, 'sibling', kept, { refines: (held, v) => spelt(held) === spelt(v) })
      )
      Object.assign(offeringSummaries, siblingShape.values)
      demoBlanks = demoBlanks.filter((slot) => !(slot.key in siblingShape.values))
      if (siblingShape.unreached.length > 0)
        ctx.note(
          `${siblingShape.unreached.length} card text(s) could not be written to their list's shape: ${siblingShape.unreached.join(', ')}`
        )
      if (siblingShape.lists.length > 0) ctx.time('siblingListsShaped', siblingShape.lists.length)
      // 🔒 EACH RECORD PAGE IS WRITTEN FOR ITS RECORD, AND NO CARD IS LEFT EMPTY (#189, site build rules 1 and 3,
      // `record-page-writer.js`): a section that repeats a sibling page with the name swapped is written again, and a card
      // of the layout a sibling page fills is written in the same shape, before any picture is chosen.
      const recordCopy = await writeRecordPages({
        contentMap: { ...staticState(ctx.contract), slots: shownSlots },
        written: kept,
        blanked: new Set(demoBlanks.map((slot) => slot.key)),
        about: {
          styleSheet: sitePlan?.styleSheet ?? null,
          business: String(ctx.normalized.name ?? ''),
          trade: String(ctx.normalized.sector ?? ''),
          description: String(sitePlan?.brand?.description?.value ?? ''),
          sourceText: [facts.text, ...Object.values(honesty?.values ?? {}).map((v) => String(v.value))].join(
            ' '
          )
        },
        model: text,
        locale: written,
        signal: ctx.signal
      })
      Object.assign(kept, owned.admit(recordCopy.values, 'record-page', kept))
      demoBlanks = demoBlanks.filter((slot) => !(slot.key in recordCopy.values))
      if (recordCopy.unreached.length > 0)
        ctx.note(
          `${recordCopy.unreached.length} record page line(s) could not be written for their own record: ${recordCopy.unreached.join(', ')}`
        )
      if (Object.keys(recordCopy.values).length > 0)
        ctx.time('recordPageLines', Object.keys(recordCopy.values).length)

      // 🔒 A MODULE THAT STATES ONLY ANOTHER COMPANY'S FACTS COMES OFF THE PAGE. Seven modules of `tracy-business/j6` are nothing
      // but facts the contract asks evidence for — the team and their titles, the certificates, the clients, three strips of
      // counters, the share stats (by field, #1326) — and the customer, who never gave any, would otherwise show a bakery's visitors "ISO 9001:2015", "Andrey
      // Kulagin, Chief Executive Officer" and "380+ projects delivered" (measured 03/10/2026). Joomla's contract cannot empty
      // an occupied slot, so the module is unpublished through the open surface once the words are in (`hideFactModules`),
      // and nothing is written into it: what a model quotes of a bakery's description there (a product, a city) is no fact of
      // those kinds.
      // 🔒 ONLY FOR A CUSTOMER WHO DESCRIBED THE BUSINESS (TCH #1013, ABOUT-3, 11/10/2026). About left blank keeps the template
      // as it is, the demo company renamed (D9): its team, certificates, clients and counters stay published, as in the demo.
      /** @type {Array<{ id: number, title: string }>} */
      const factModules = []
      // 🔒 A LIST OF THE DEMO COMPANY'S PLACES OR PRICES COMES OFF THE PAGE TOO (15/10/2026, TCH #1367): on ali-barber the
      // Contact page kept three Russian offices with +7 numbers and the head office in Kaluga, and Services priced a haircut
      // "from ₽48,000/m²", because a cell that wants evidence keeps the demo's value and Joomla's contract cannot empty it. A
      // module whose words are such a list under at most a heading and an intro (`isFactList`), none of whose facts the
      // customer gave, is unpublished like the modules above, once the brief names or describes the business. A kit sample page
      // keeps its modules (K3); a module with more words of its own (a hero over counters) keeps them all.
      const proven = (/** @type {any} */ slot) => given.has(slot.key) && slot.key in kept
      if (FACT_MODULE_DESIGNS.has(ctx.quickstart) && (described || nameAnswered(ctx.normalized))) {
        /** @type {Map<string, any[]>} */
        const byEntity = new Map()
        const own = entityLanguages(dataDir, ctx.contract.id)
        for (const slot of state.slots) {
          if (!/^module-\d+$/.test(String(slot.entity)) || slot.type !== 'text') continue
          if (typeof slot.sample !== 'string' || slot.sample.trim() === '') continue
          const language = own?.get(slot.entity)
          if (language !== undefined && language !== '*' && language !== SOURCE) continue
          byEntity.set(slot.entity, [...(byEntity.get(slot.entity) ?? []), slot])
        }
        for (const [entity, slots] of byEntity) {
          const allFacts = described && slots.every((slot) => slot.requiresEvidence)
          const factList = !kit.has(entity) && isFactList(slots) && !slots.some(proven)
          if (!allFacts && !factList) continue
          for (const slot of slots) delete kept[slot.key]
          const label = String(slots[0].label ?? '').split(' / ')[0]
          const title = label.replace(/ \([A-Za-z]{2,3}(?:-[A-Za-z]+)?\)$/, '')
          factModules.push({ id: Number(entity.slice('module-'.length)), title })
        }
      }
      // 🔒 A FORM WITH NO DESTINATION COMES OFF WHOLE (COO rule 29/10/2026, `form-blocks.mjs`): a newsletter box, a booking widget
      // or a login box the brief gives no destination for (no email-marketing account, no verified booking link) promised the
      // visitor something false and swallowed their email (measured on a local build: "Join our coaching newsletter" in the
      // footer, its words rewritten by the copy writer). Any design, any framework: the module is unpublished in every language
      // with the fact modules above, and none of its words is written.
      for (const hide of honesty?.hide ?? []) {
        if (hide.reason !== 'no-form-destination' || hide.how !== 'entity' || hide.kind !== 'module') continue
        const own = state.slots.filter((slot) => slot.entity === hide.entity)
        for (const slot of own) delete kept[slot.key]
        demoBlanks = demoBlanks.filter((slot) => slot.entity !== hide.entity)
        const id = Number(hide.entity.slice('module-'.length))
        if (factModules.some((m) => m.id === id)) continue
        const label = String(own[0]?.label ?? '').split(' / ')[0]
        factModules.push({ id, title: label.replace(/ \([A-Za-z]{2,3}(?:-[A-Za-z]+)?\)$/, '') })
      }
      // 🔒 A CALL-TO-ACTION BAND IS ONE UNIT (COO decision, #189 item 7, `cta-band-messages.js`): its heading and line are
      // written for the action its button now carries, after every pin and sweep above, and kept through the cleanup; a
      // band with no message that can be written comes off whole, never a lone button.
      const ctaBands = await ctaBandValues({
        contentMap: staticState(ctx.contract),
        slots: [...state.slots, ...declaredSlots(ctx.contract)],
        sitePlan,
        written: kept,
        locale: written,
        briefText: [
          facts.text,
          String(sitePlan?.brand?.description?.value ?? ''),
          ...Object.values(honesty?.values ?? {}).map((v) => String(v.value))
        ].join(' '),
        business: {
          styleSheet: sitePlan?.styleSheet ?? null,
          name: String(sitePlan?.brand?.name?.value ?? ctx.normalized.name ?? ''),
          description: String(sitePlan?.brand?.description?.value ?? ''),
          offerings: (honesty?.offerings ?? []).map((o) => o?.label)
        },
        model: text,
        signal: ctx.signal,
        note: ctx.note,
        // The band lines the page pass wrote for the action it was told: kept when that is still the button's action.
        passed: Object.fromEntries(
          Object.entries(passActions)
            .filter(([key]) => owned.ownerOf(key, kept[key]) === 'page-copy')
            .map(([key, action]) => [key, { value: kept[key], action }])
        )
      })
      Object.assign(kept, ctaBands.values)
      demoBlanks = demoBlanks.filter((slot) => !(slot.key in ctaBands.values))
      demoBlanks.push(...ctaBands.blanks.filter((slot) => !demoBlanks.some((b) => b.key === slot.key)))
      // A band's message group is no demo card: the left-demo sweep never takes it off once the band has its message.
      const bandGroups = new Set(
        state.slots
          .filter((slot) => slot.key in ctaBands.values && slot.group?.id)
          .map((slot) => slot.group.id)
      )
      demoHides = demoHides.filter((hide) => !bandGroups.has(hide.group))
      for (const band of ctaBands.removed) {
        const own = state.slots.filter((slot) => slot.entity === band.entity)
        for (const slot of own) delete kept[slot.key]
        demoBlanks = demoBlanks.filter((slot) => slot.entity !== band.entity)
        const id = Number(String(band.entity).slice('module-'.length))
        if (!/^module-\d+$/.test(band.entity) || factModules.some((m) => m.id === id)) continue
        const label = String(own[0]?.label ?? '').split(' / ')[0]
        factModules.push({ id, title: label.replace(/ \([A-Za-z]{2,3}(?:-[A-Za-z]+)?\)$/, '') })
      }
      // 🔒 ONE SPELLING FOR THE WHOLE SITE (COO criterion 1.6, `site-voice.js`): every writer was told the site's style sheet;
      // a line still spelt in the other English is respelt the site's way here, after the last writer, names kept as given.
      const spelling = settleSiteSpelling(kept, sitePlan?.styleSheet, {
        slots: state.slots,
        keep: [String(ctx.normalized.name ?? ''), ...(honesty?.offerings ?? []).map((o) => o?.label)]
      })
      Object.assign(kept, spelling.values)
      if (spelling.respelt.length) ctx.time('linesRespelt', spelling.respelt.length)
      // 🔒 EVERY VISIBLE SLOT OF A KEPT BLOCK IS WRITTEN OR REMOVED (R12 group A, `settleKeptSlots` of `copy-plan-stage.js`): a
      // demo line nobody wrote is never emptied in place. A line whose call was lost keeps the template's words for the repair
      // loop; a refused one takes its item or its whole block off when the template can (the module unpublished with the fact
      // modules above, before the band decoration is judged), else it too keeps its words for the repair loop. Either way the
      // unwritten lines are on the build's row, and the final check reads them as blockers.
      const settledLines = settleKeptSlots({
        blanks: demoBlanks,
        plan,
        hints: passHints,
        contentMap: staticState(ctx.contract),
        slots: shownSlots,
        written: kept,
        // The demo company's own lines are never served while they wait for the repair loop (ABOUT-3).
        unsafe: new Set([
          ...factLines,
          ...demoNamedKeys(shownSlots, listOf(declaredCopy(ctx.contract.dir).demoCompanyNames))
        ]),
        removed: {
          entities: [
            ...factModules.map((m) => `module-${m.id}`),
            ...demoHides.filter((h) => h.how === 'entity').map((h) => h.entity),
            ...(honesty?.hide ?? []).filter((h) => h.how === 'entity').map((h) => h.entity)
          ],
          groups: [
            ...demoHides.map((h) => h.group).filter(Boolean),
            ...(honesty?.records ?? []).filter((r) => r.decision === 'hide').map((r) => r.group)
          ]
        }
      })
      demoBlanks = settledLines.blanks
      demoHides.push(
        ...settledLines.hides.filter((h) => !demoHides.some((d) => d.group && d.group === h.group))
      )
      for (const entity of settledLines.modules) {
        const id = Number(entity.slice('module-'.length))
        const own = state.slots.filter((slot) => slot.entity === entity)
        for (const slot of own) delete kept[slot.key]
        demoBlanks = demoBlanks.filter((slot) => slot.entity !== entity)
        if (factModules.some((m) => m.id === id)) continue
        const label = String(own[0]?.label ?? '').split(' / ')[0]
        factModules.push({ id, title: label.replace(/ \([A-Za-z]{2,3}(?:-[A-Za-z]+)?\)$/, '') })
      }
      if (settledLines.removedKeys.length) {
        ctx.time('keptSlotsRemoved', settledLines.removedKeys.length)
        ctx.note(
          `${settledLines.hides.length + settledLines.modules.length} block(s) or card(s) whose words could not be written were taken off whole`
        )
      }
      // 🔒 A BAND THAT LOST ITS WORKING PARTS COMES OFF WHOLE (COO decision, #189 item 30, `layout-bands.mjs`): a logo or an
      // icon set beside a block taken off above (a sign-up box with no destination) would stand alone in an empty strip.
      // Its decoration modules are unpublished with it, unless the content map declares them standalone.
      const bandDecoration = decorationLeftAlone(
        staticState(ctx.contract),
        factModules.map((m) => `module-${m.id}`)
      )
      for (const { entity } of bandDecoration) {
        if (!/^module-\d+$/.test(entity)) continue
        const own = state.slots.filter((slot) => slot.entity === entity)
        for (const slot of own) delete kept[slot.key]
        demoBlanks = demoBlanks.filter((slot) => slot.entity !== entity)
        const label = String(own[0]?.label ?? '').split(' / ')[0]
        factModules.push({
          id: Number(entity.slice('module-'.length)),
          title: label.replace(/ \([A-Za-z]{2,3}(?:-[A-Za-z]+)?\)$/, '')
        })
      }
      if (bandDecoration.length) ctx.time('bandDecorationRemoved', bandDecoration.length)
      if (ctaBands.bands.length) ctx.time('ctaBandsWritten', ctaBands.bands.filter((b) => b.written).length)
      if (ctaBands.removed.length) {
        ctx.time('ctaBandsRemoved', ctaBands.removed.length)
        ctx.note(
          `${ctaBands.removed.length} call-to-action band(s) had no message that could be written and were taken off`
        )
      }
      // 🔒 A LINE WHOSE CALL WAS LOST IS NEVER BLANKED SILENTLY (copy-plan stage, invariant 5, `copy-plan-stage.js`): it keeps
      // the template's words for now and goes to the repair loop as "unwritten", with its rule, through the build's row.
      const settledKeys = new Set(settledLines.removedKeys)
      const copyLines = {
        unwritten: settledLines.unwritten.filter(
          (line) => !factModules.some((m) => line.key.startsWith(`module-${m.id}.`))
        ),
        // A copy line of a kept block emptied because its demo words name the demo company: a blocker until it is written.
        blanked: demoBlanks
          .filter(
            (slot) =>
              String(slot?.sample ?? '').trim() &&
              isBlockCopyLine(slot) &&
              !settledKeys.has(slot.key) &&
              !factModules.some((m) => slot.entity === `module-${m.id}`) &&
              !String(slot.entity).startsWith('menuItem-')
          )
          .map((slot) => slot.key)
      }
      ctx.record?.('copyLines', copyLines)
      if (copyLines.unwritten.length) ctx.time('copyLinesUnwritten', copyLines.unwritten.length)
      // The languages the template does not ship are translated from the words as they will stand, while the site installs.
      const derive = []
      if (missing.length > 0 && !text)
        ctx.note(`no text model is set, so ${missing.join(', ')} could not be added`)
      else if (missing.length > 0) {
        const { loadShippedTranslations } = await seeder('shipped-translations')
        const languages = entityLanguages(dataDir, ctx.contract.id)
        const sourceSlots = state.slots.filter((slot) => {
          const own = languages?.get(slot.entity)
          return own === undefined || own === '*' || own === SOURCE
        })
        const warmed = await Promise.all(
          missing.map(async (locale) => {
            const shipped = loadShippedTranslations(dataDir, ctx.contract.id, locale)
            try {
              const { cache, failed } = await warmTranslations({
                locale,
                slots: sourceSlots,
                changes: kept,
                shipped,
                model: text,
                signal: budgetSignal(ctx.signal, ctx.deadlineAt),
                keep: [String(ctx.normalized.name ?? '')]
              })
              if (failed > 0)
                ctx.note(
                  `${failed} part(s) of the ${locale} translation could not be made ahead and are made when the site is up`
                )
              return { locale, cache }
            } catch (error) {
              // Nothing is lost: the plan the site hands over is translated when the site is up.
              ctx.note(
                `the ${locale} translation could not be made ahead (${error instanceof Error ? error.message : error}) and is made when the site is up`
              )
              return { locale, cache: new Map(shipped) }
            }
          })
        )
        derive.push(...warmed)
      }
      const art = await drawing
      const real = await reading
      if (real) ctx.time('picturesCollected', real.pictures.length)
      else if (!image) ctx.note('no picture model is set, so the template keeps its own pictures')
      else if (art.failed > 0)
        ctx.note(`${art.failed} picture(s) could not be drawn, so the template keeps its own`)
      ctx.time('planMs', Date.now() - started)
      // What the words cost, for the report: calls and tokens (a model double has no meter, and then there is nothing to say).
      const spent = text?.usage?.()
      if (spent?.calls) {
        ctx.time('modelCalls', spent.calls)
        ctx.time('modelTokens', spent.promptTokens + spent.completionTokens)
      }
      return {
        contractId: ctx.contract.id,
        pictures: art.drawn,
        groups,
        real,
        // The picture model draws an empty hero, banner or background from the restaurant's own photographs (plan §8).
        drawDoor: real ? (image ?? null) : null,
        derive,
        multilingual,
        written,
        sole,
        rewrites,
        // About given: the blog categories are named for the business (`blog-categories.js`).
        described,
        headings: await headings,
        keep,
        changes: kept,
        renamedKeep,
        translatedKeep,
        // 🔒 A SOURCED PIN IS ITS OWN EVIDENCE (#189 item 18): a reviewer's name pinned from the brief passes the write gate
        // of an evidence slot instead of leaving the demo's reviewer for a later step to overwrite.
        evidence: Object.fromEntries(
          Object.entries({
            ...plan.evidence,
            ...honest.evidence,
            ...sourcedPinEvidence(copyPins, kept)
          }).filter(([key]) => key in kept)
        ),
        pending: plan.pending,
        factModules,
        // The page titles and descriptions the release ships in its menu, read while the site installs (`pageMetaSteps`).
        shippedMeta: shippedPageMeta(ctx.contract.dir),
        left,
        planned: calls,
        woPosts: await woReading,
        copyPins,
        demoBlanks,
        demoHides,
        demoAsked,
        // The lines left for the repair loop (`settleKeptSlots`), merged with the lines the site refuses at the write.
        copyLines,
        styleMarks,
        offeringSummaries,
        // The call-to-action bands' messages, kept through the cleanup, and the bands taken off (`cta-band-messages.js`).
        ctaBands,
        // The site plan's search title, description and LocalBusiness record (`place-seo.mjs`).
        seo: sitePlan?.seo ?? null
      }
    },

    /**
     * @param {import('../brief-build.js').BriefContext} ctx
     * @param {Awaited<ReturnType<ReturnType<typeof createJoomlaEngine>['prepare']>>} prepared
     */
    async apply(ctx, prepared) {
      let preparedPictures = null
      if (prepared.real && realPictures && siteFile) {
        if (!prepared.realPicturesPrepared || prepared.realPictureShape)
          preparedPictures = await pictures(
            ctx,
            prepared.real,
            prepared.copyPins?.pictures,
            prepared.copyPins ?? null,
            prepared.drawDoor ?? null,
            prepared.realPictureShape,
            prepared.changes ?? null
          )
        prepared.real = null
      }
      const [
        { applyJoomlaContract, doorRefusal },
        { trimJoomlaDemo },
        { isDerived, deadLinks, entityLanguages }
      ] = await Promise.all([
        seeder('apply-joomla-contract'),
        seeder('apply-joomla-demo-trim'),
        seeder('plan-joomla-contract')
      ])
      const time = stopwatch(ctx)
      // Every apply id the writes name is kept on the row, so the whole Apply can be undone (`recordedDoor`).
      const apply = recordedDoor(ctx, applyFor(ctx.email, ctx.runId))
      const siteKey = ctx.siteKey
      const contract = (params) => apply({ siteKey, action: 'content.contract', params })

      // The pictures' shape is read from the site's public address and cut here: no write, so it runs beside everything.
      // The uploads are writes, and a site takes ONE write at a time, so they wait for the demo trim (below).
      // The customer's own photographs go where the planner puts them, the demo's shape read the same way.
      const realShaping =
        prepared.real && siteFile && realPictures
          ? time('shapeMs', () =>
              shapeReal({
                real: prepared.real,
                contentMap: staticState(ctx.contract),
                cms: 'joomla',
                pages: keptPages(/** @type {any} */ (ctx.brief)?.pages),
                siteFile: siteFile(siteKey),
                siteBytes: async (file) =>
                  siteReader ? ((await siteReader(siteKey))?.bytes(file) ?? null) : null,
                realPictures,
                note: ctx.note,
                time: ctx.time,
                drawDoor: prepared.drawDoor ?? null,
                signal: ctx.signal,
                bound: prepared.copyPins?.pictures ?? {},
                copy: prepared.copyPins ?? null,
                textModel: async () => (await models()).text ?? null
              })
            ).catch((error) => {
              ctx.note(
                `the photographs could not be placed: ${error instanceof Error ? error.message : error}`
              )
              return null
            })
          : null
      const shaping = realShaping
        ? realShaping.then((placed) => placed?.shaped ?? [])
        : time('shapeMs', async () =>
            !siteFile || (prepared.pictures ?? []).length === 0
              ? []
              : shapePictures({
                  drawn: prepared.pictures,
                  groups: prepared.groups,
                  siteFile: siteFile(siteKey),
                  note: ctx.note
                })
          ).catch((error) => {
            ctx.note(`the pictures could not be shaped: ${error instanceof Error ? error.message : error}`)
            return []
          })

      // 🔒 Before any write, the demo's article order is pinned where its keys tie (`joomla-article-order.js`): a later write
      // must not reshuffle Previous/Next or an articles list, BLANK included.
      const ordered = await time('orderMs', () => pinArticleOrder({ apply, siteKey, note: ctx.note }))
      if (ordered > 0) ctx.time('articlesOrdered', ordered)
      // The demo rows go first: hiding them moves the revision a write must name, so the site is read after.
      // 🔒 ONLY A CONTRACT THAT SHIPS A REVIEWED DEMO-TRIM PROFILE IS ASKED TO TRIM. The receiver hides demo rows by that
      // profile alone and answers every other contract "unsupported", which the report read as a refused write. Without one,
      // the demo rows the brief does not keep go in the tidy-up below, through the content door (unpicked pages, demo posts).
      const trim = hasDemoTrim(ctx.contract)
        ? await time('trimMs', () => trimJoomlaDemo({ apply, siteKey }))
        : /** @type {const} */ ({ status: 'none' })
      if (trim.status === 'skipped') ctx.note(trim.reason)
      // Then the pictures, one at a time: the site is read after every write, so the revision it names is the last.
      const art = await time('picturesMs', async () =>
        uploadPictures({ shaped: await shaping, platform: 'joomla', apply, siteKey, note: ctx.note })
      ).catch((error) => {
        ctx.note(`the pictures could not be placed: ${error instanceof Error ? error.message : error}`)
        return { values: {}, placed: 0 }
      })
      const state = await time('inspectMs', () => contract({ operation: 'inspect' }))
      if (!state?.ok) throw new Error(sayUnbound(doorRefusal(state)))
      if (state.contract !== prepared.contractId)
        throw new Error('the site carries another content contract than the one the text was written for')

      // What is written is what the site still holds as the template shipped it: a slot the site no longer
      // carries, or that a person has changed since, keeps what it has.
      const live = new Map((state.slots ?? []).map((slot) => [slot.key, slot]))
      // The site's plugin answers with the profile's own flags (set by module title); the fact fields are gated by the
      // map the words were planned against (`staticState`), the same contract (checked above).
      const factKeys = new Set(
        staticState(ctx.contract)
          .slots.filter((slot) => slot.requiresEvidence)
          .map((slot) => slot.key)
      )
      /** @type {Record<string, string>} */
      const changes = {}
      /** @type {Record<string, string>} */
      const evidence = {}
      let kept = prepared.pending.length + prepared.left
      const keepWritten = new Set([...(prepared.renamedKeep ?? []), ...(prepared.translatedKeep ?? [])])
      // A brief build's site plan writes what the copy path does not: the brief's own video in a video slot (#196).
      const outsidePlan = await woContent
        ?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
        .catch(() => null)
      // A declared action is an explicit customization of a shared template string, including a kept language string.
      for (const s of outsidePlan?.slots ?? [])
        if (s.reason === 'button-action' && s.key in prepared.changes) keepWritten.add(s.key)
      // 🔒 A button whose written words name booking or contact leads to the Contact page, else to the brief's channel
      // (`booking-button-targets.mjs`, COO rule 30/10/2026): its link is a declared customization like a button action's.
      const bookingTargets = bookingButtonTargets({
        words: { ...prepared.changes, ...plannedSlotValues(outsidePlan) },
        contentMap: staticState(ctx.contract),
        sitePlan: outsidePlan
      })
      for (const key of Object.keys(bookingTargets)) keepWritten.add(key)
      if (Object.keys(bookingTargets).length > 0)
        ctx.time('bookingButtonsRetargeted', Object.keys(bookingTargets).length)
      for (const [key, value] of Object.entries({
        ...prepared.changes,
        ...art.values,
        ...plannedSlotValues(outsidePlan),
        ...bookingTargets
      })) {
        // A fact the site plan wrote (the address line of a contact block) is its own evidence: the brief is its source.
        const planFact = key in plannedSlotValues(outsidePlan)
        const slot = live.get(key)
        // A `keep` slot is written only with the demo company renamed in it (`renamedKeep`) or in the site's language
        // (`translatedKeep`), never with other words.
        if (!slot || isDerived(slot) || (!customizable(slot) && !keepWritten.has(key))) continue
        if ((slot.current ?? slot.sample) === value) continue
        // 🔒 A LINE THAT SHIPS A BARE NUMBER ONLY EVER TAKES A NUMBER. It is a number the template reads (a JA module's
        // `id-article`, a pager's page), not words: measured 08/10/2026 on a JA Podcast site, `id-article` "46" written as
        // "Bánh mỗi sáng" was read as article 0 and the home page answered HTTP 500.
        if (
          slot.type === 'text' &&
          BARE_NUMBER.test(String(slot.sample ?? '').trim()) &&
          !BARE_NUMBER.test(value.trim())
        )
          continue
        if (slot.current !== undefined && slot.current !== slot.sample) {
          kept += 1
          continue
        }
        if ((slot.requiresEvidence || factKeys.has(key)) && !prepared.evidence[key]?.trim() && !planFact) {
          kept += 1
          continue
        }
        changes[key] = value
        if (prepared.evidence[key]) evidence[key] = prepared.evidence[key]
        else if (planFact) evidence[key] = value
      }

      // A row the site holds part of in a person's words, or that lost a cell above, is still written whole or not at all.
      const held = new Set(
        [...live.values()]
          .filter((slot) => slot.current !== undefined && slot.current !== slot.sample)
          .map((slot) => slot.key)
      )
      for (const key of partialFactRows({
        slots: staticState(ctx.contract).slots,
        changes,
        evidence,
        held
      })) {
        delete changes[key]
        delete evidence[key]
        kept += 1
      }

      // 🔒 THE WORDS ARE REPLACED, NEVER THE STYLE (spec TracyHQ/tracy#189, `joomla-inline-styles.js`): a styled ACM field takes
      // its markers through the contract; a styled HTML unit is written plain here and styled by the records step after it.
      const styled = styleChanges({
        changes,
        slots: new Map(staticState(ctx.contract).slots.map((slot) => [slot.key, slot])),
        marks: prepared.styleMarks ?? {}
      })
      let wrote = 0
      /** The lines the site refused in the write of the words: nothing later asks for them again. */
      const refusedByWrite = new Set()
      /** The words planned for each line before the write, kept to say which card the site refused (#189 item 30). */
      const plannedWords = { ...changes }
      if (Object.keys(changes).length === 0) ctx.note('there was nothing to write into the template')
      else {
        const setAside = await writeContract({
          applyJoomlaContract,
          apply,
          siteKey,
          reading: state,
          changes,
          evidence,
          lines: lineLimits(staticState(ctx.contract).slots),
          timed: (job) => time('writeMs', job),
          // A line refused as too long for its box is written shorter once (#189 item 30, `refused-box-rewrite.js`).
          shorten: async (asks) => {
            const roles = new Map(staticState(ctx.contract).slots.map((slot) => [slot.key, slot.role]))
            const shorter = await rewriteWithinBox({
              asks: asks.map((ask) => ({ ...ask, role: roles.get(ask.key) })),
              model: (await models()).text ?? null,
              locale: prepared.written ?? SOURCE,
              signal: ctx.signal
            })
            ctx.time('linesShortenedAfterRefusal', Object.keys(shorter).length)
            return shorter
          }
        })
        for (const key of setAside) refusedByWrite.add(key)
        if (setAside.length > 0)
          ctx.note(
            `${setAside.length} line(s) were routed outside the contract write for safe removal or left empty`
          )
        ctx.time('contractLinesDeferred', setAside.length)
        wrote = Object.keys(changes).length
      }
      if (prepared.copyPins && woContent) {
        const took = new Set(Object.keys(changes).filter((key) => !refusedByWrite.has(key)))
        await recordPins(
          woContent,
          prepared.copyPins,
          pinStates(prepared.copyPins.pins, live, took),
          ctx.note
        )
      }
      // What the photographs' places hold now, read back from the site, kept beside the plan (`real-pictures.js`).
      const placedReal = realShaping ? await realShaping : null
      if (placedReal && realPictures)
        await time('pictureAuditMs', async () => {
          const after = await contract({ operation: 'inspect' }).catch(() => null)
          const readback = after?.ok
            ? new Map(
                (after.slots ?? []).map((slot) => [slot.key, String(slot.current ?? slot.sample ?? '')])
              )
            : null
          const homeHtml = siteReader ? await (await siteReader(siteKey))?.text('/').catch(() => null) : null
          const { receipts, report } = pictureReport({
            shaped: placedReal,
            homeHtml: homeHtml ?? null,
            values: art.values,
            refused: refusedByWrite,
            readback
          })
          ctx.time('picturesPlaced', report.photos)
          ctx.time('picturePlaceholders', report.placeholders)
          ctx.time('pictureDemoLeft', report.demoLeft.length)
          await realPictures.recordOutcome(prepared.real.buildId, { receipts, report })
        }).catch((error) => {
          ctx.note(
            `what the photographs became could not be recorded: ${error instanceof Error ? error.message : error}`
          )
        })

      // The template's own menu labels, the entries of the pages the customer unticked and the contact form's mailbox are tidied
      // from what the menus say now that the words are in. 🔒 No other page goes (product owner, 08/10/2026, TCH #1013): the
      // model relabels entries and never takes one off. What the model is asked is read and judged beside the hiding of the other
      // languages below, which is the long step; the writes (one transaction) come right after it and before any language is made,
      // so an edition made from the source copies a tidy one.
      const visibleNow = new Set([SOURCE, ...prepared.keep])
      // 🔒 THE SHOWCASE IS NEVER UNPUBLISHED ON A DEMO BUILD (product owner): the entries the contract's showcase-navigation map
      // put away at provisioning (`menu_show` 0) keep their pages reachable; only the customer's business pages go when unticked.
      // A BRIEF BUILD TAKES THE SHOWCASE OFF (spec TracyHQ/tracy#189, ticket #196): its entries go with the unpicked pages in
      // the tidy-up below (`showcaseOff`, `joomla-outside-map.js`), so their addresses answer 404.
      const showcase = navHiddenMenuIds(showcaseNavMap(ctx.contract?.dir))
      const readItem = async (/** @type {number} */ id) => {
        const answer = await apply({ siteKey, action: 'content.get', params: { kind: 'menuItem', id } })
        return answer?.ok === false ? null : (answer?.item ?? null)
      }
      /**
       * What goes with the entries `going`: a link entry into a path of the site nothing will answer, an entry that only leads
       * to a page that is off, and the pages under any entry that goes or was off already. `out`: entries the site would not
       * take off, which stay published, so what sits under them or leads into them is not a dead end because of them.
       * @param {any[]} menu
       * @param {number[]} going
       * @param {Set<number>} [out]
       */
      const dependentsOf = async (menu, going, out = new Set()) => {
        const stay = (/** @type {number[]} */ ids) => ids.filter((id) => !out.has(id))
        // A showcase entry is never taken off, not even with what goes, nor is any entry above one (`showcaseHolders`): it is
        // already off the menus, and its page keeps answering only through published parents.
        const holders = showcaseHolders(menu, showcase)
        const shown = (/** @type {{ ids: number[], note: string | null }} */ part) => {
          const left = leaveShowcase(part.ids, menu, holders)
          return {
            ...part,
            ids: left.ids,
            note: [part.note, left.note].filter(Boolean).join('; ') || null
          }
        }
        const dead = shown(
          await deadLinkMenuItems({ apply, siteKey, rows: menu, going, visible: visibleNow })
        )
        const stranded = shown(
          await strandedMenuItems({
            apply,
            siteKey,
            rows: menu,
            hiding: [...going, ...stay(dead.ids)],
            visible: visibleNow
          })
        )
        const orphaned = shown(
          await orphanedMenuItems({
            rows: menu,
            going: [...going, ...stay(dead.ids), ...stay(stranded.ids)],
            visible: visibleNow,
            read: readItem
          })
        )
        // A link item that is a bare `#` goes to the page of its name or goes (`anchorOnlyMenuItems`), judged last: the entries
        // above are off, so none of them is a page to go to.
        const anchors = anchorOnlyMenuItems({
          rows: menu,
          going: [...going, ...stay(dead.ids), ...stay(stranded.ids), ...stay(orphaned.ids)],
          visible: visibleNow
        })
        return { dead, stranded, orphaned, anchors }
      }
      // The template's own words in the site's language (`joomla-site-strings.js`) are read and translated from here, beside
      // the menu's long step; they are written where they always were, once the languages are settled (TCH #1367).
      const overrides =
        prepared.written && prepared.written !== SOURCE && (!prepared.multilingual || prepared.sole)
          ? time('overridesTranslateMs', async () =>
              translateLanguageOverrides({
                apply,
                siteKey,
                template: templateOf(ctx.contract.dir),
                locale: prepared.written,
                model: (await models()).text ?? null,
                signal: ctx.signal,
                note: ctx.note
              })
            )
          : null
      overrides?.catch(() => {})
      const tidying = (async () => {
        const { text: seed } = await models()
        // The article categories are records the planner never sees: a site written in another language calls them in it
        // (LANG-2, `joomla-categories.js`), translated beside the long step and written with the tidy-up.
        const named = (/** @type {'category' | 'tag'} */ kind) =>
          categoryLanguageSteps({
            apply,
            siteKey,
            locale: prepared.written ?? SOURCE,
            source: SOURCE,
            model: seed ?? null,
            signal: ctx.signal,
            kind,
            // 🔒 FULL: the blog categories are renamed for the business (decision (3) of 12/10/2026); BLANK keeps the demo's.
            rename:
              kind === 'category' && prepared.described && seed
                ? {
                    generate: firmGenerate(seed, budgetSignal(ctx.signal, ctx.deadlineAt)),
                    about: String(ctx.brief?.about ?? ''),
                    name: answeredName(ctx.normalized)
                  }
                : null
          })
        // The tags are named in it too, beside the categories (LANG-2).
        const categories = time('categoriesMs', () => Promise.all([named('category'), named('tag')])).then(
          ([c, t]) => ({
            steps: [...c.steps, ...t.steps],
            note: [c.note, t.note].filter(Boolean).join('; ') || null,
            renamed: c.renamed
          })
        )
        // The menu is read ONCE, whole: the judge's titles, where an alias leads, the page titles and the pages the customer did
        // not pick all come from it. A menu the site will not hand over leaves the entries as they are, said once; the rest of
        // Apply goes on.
        /** @type {any[] | null} */
        let menu = null
        /** @type {string | null} */
        let unread = null
        try {
          menu = await time('menuReadMs', () => readMenu(apply, siteKey))
        } catch (error) {
          unread = `the site's menu could not be read, so its entries and page titles were left as the template has them: ${error instanceof Error ? error.message : error}`
        }
        // The pages the customer ticked stay, whatever the demo trim did to their entries (`tickedMenuItems`): every step below
        // reads the menu as it will be once those are published again.
        const ticked = menu
          ? tickedMenuItems(menu, visibleNow, ctx.brief?.pages ?? null)
          : { ids: /** @type {number[]} */ ([]), off: /** @type {number[]} */ ([]) }
        if (menu && ticked.off.length > 0) {
          const back = new Set(ticked.off)
          menu = menu.map((row) => (back.has(Number(row.id)) ? { ...row, published: 1 } : row))
        }
        const judged = menu
          ? await time('menuJudgeMs', () =>
              judgeMenuItems({
                apply,
                siteKey,
                model:
                  seed && prepared.rewrites && !String(ctx.quickstart).startsWith(OWN_MENU_DESIGN)
                    ? (seed.urgent?.() ?? seed)
                    : null,
                business: {
                  name: answeredName(ctx.normalized),
                  about: briefForJudges(ctx.brief),
                  sector: ctx.normalized.sector ?? null
                },
                given: spokenOf(ctx.brief),
                visible: visibleNow,
                signal: ctx.signal,
                rows: menu
              })
            )
          : {
              relabels:
                /** @type {Array<{ kind: string, id: number, fields: Record<string, string> }>} */ ([]),
              note: unread
            }
        // The only pages that go: those of kinds the customer did not pick in the `pages` question, by their menu entries, and
        // those the customer unticked by id (`brief.pages`); the links into them are taken off (`takeLinksOff`).
        const wanted = pickedPages(ctx.brief?.answers) !== null || unpickedById(ctx.brief?.pages).length > 0
        const unpicked = menu
          ? await time('menuUnpickedMs', () =>
              unpickedMenuItems(
                ctx.brief?.answers,
                menu,
                visibleNow,
                readItem,
                ctx.brief?.pages ?? null,
                showcase
              )
            )
          : {
              ids: /** @type {number[]} */ ([]),
              note: wanted
                ? 'the menu could not be read, so the pages you did not pick could not be taken off'
                : null
            }
        // 🔒 A BRIEF BUILD TAKES THE SHOWCASE OFF (spec #189, ticket #196): its entries go with the unpicked pages, so their
        // addresses answer 404, their articles go and the links into them are taken off. A demo build keeps the showcase.
        if (menu && outsidePlan?.outside?.showcase?.decision === 'remove') {
          const off = showcaseOff({ rows: menu, showcase, visible: visibleNow })
          showcase.clear()
          if (off.length > 0) {
            unpicked.ids = [...new Set([...unpicked.ids, ...off])]
            ctx.time('showcaseTakenOff', off.length)
          }
        }
        // What goes with them (dead-end links, aliases into pages that are off, pages under entries that are off): read beside
        // the long step too.
        const none = { ids: /** @type {number[]} */ ([]), note: /** @type {string | null} */ (null) }
        const noAnchors = {
          relink: /** @type {Array<{ id: number, link: string }>} */ ([]),
          hide: /** @type {number[]} */ ([])
        }
        const { dead, stranded, orphaned, anchors } = menu
          ? await time('menuDependentsMs', () => dependentsOf(menu, unpicked.ids))
          : { dead: none, stranded: none, orphaned: none, anchors: noAnchors }
        // The articles of those pages go with them, unless a page that stays still shows them (`unpickedArticles`).
        const articles = menu
          ? await unpickedArticles({
              apply,
              siteKey,
              rows: menu,
              causes: unpicked.ids,
              gone: [...unpicked.ids, ...dead.ids, ...stranded.ids, ...orphaned.ids],
              visible: visibleNow
            })
          : {
              ids: /** @type {number[]} */ ([]),
              by: new Map(),
              routes: /** @type {any[]} */ ([]),
              note: null
            }
        // A template that ships the consent box's text as a language string (a Russian law, in `tracy-business/j6`) is told
        // to say a plain sentence instead, by the plugin's own parameter. Read here, written with the rest.
        const consent = FACT_MODULE_DESIGNS.has(ctx.quickstart)
          ? await findConsentPlugin({ apply, siteKey })
          : null
        // The page titles and descriptions the release ships in its menu entries, whatever the design.
        const pages = menu
          ? pageMetaSteps({
              rows: menu,
              visible: visibleNow,
              // 🔒 A Name left blank names no page (TCH #1013, 14/10/2026): the home keeps the title the template ships.
              owner: {
                name: answeredName(ctx.normalized),
                // A brief build's search title and description, of facts only (`place-seo.mjs`), when it has no `about`.
                title: String(prepared.seo?.title ?? ''),
                said: spokenOf(ctx.brief),
                about: String(ctx.brief?.about ?? '') || String(prepared.seo?.description ?? ''),
                // Every kept page's planned search title and description (`page-seo.mjs`, #189 round 9, class G): they win.
                pages: Array.isArray(prepared.seo?.pages) ? prepared.seo.pages : []
              },
              // The language the owner's description is in: as read from it, else the one the site's words were written in.
              wroteIn: ctx.normalized.writtenIn ?? prepared.written,
              shipped: prepared.shippedMeta ?? null,
              demoNames: listOf(declaredCopy(ctx.contract.dir).demoCompanyNames)
            })
          : { steps: [] }
        return {
          ...judged,
          menu,
          ticked,
          unpicked,
          dead,
          stranded,
          orphaned,
          anchors,
          articles,
          consent,
          pages,
          categories: await categories
        }
      })().catch((error) => ({
        ticked: { ids: /** @type {number[]} */ ([]), off: /** @type {number[]} */ ([]) },
        menu: /** @type {any[] | null} */ (null),
        unpicked: { ids: /** @type {number[]} */ ([]), note: null },
        relabels: /** @type {Array<{ kind: string, id: number, fields: Record<string, string> }>} */ ([]),
        dead: { ids: /** @type {number[]} */ ([]), note: null },
        stranded: { ids: /** @type {number[]} */ ([]), note: null },
        orphaned: { ids: /** @type {number[]} */ ([]), note: null },
        anchors: {
          relink: /** @type {Array<{ id: number, link: string }>} */ ([]),
          hide: /** @type {number[]} */ ([])
        },
        articles: {
          ids: /** @type {number[]} */ ([]),
          by: /** @type {Map<number, number[]>} */ (new Map()),
          routes: /** @type {any[]} */ ([]),
          note: null
        },
        consent: null,
        pages: {
          steps: /** @type {Array<{ kind: string, id: number, fields: Record<string, string> }>} */ ([])
        },
        categories: {
          steps: /** @type {Array<{ kind: string, id: number, fields: Record<string, string> }>} */ ([]),
          note: null,
          renamed: /** @type {Map<number, { to: string, names: string[] }>} */ (new Map())
        },
        note: `the template's own menu entries could not be judged: ${error instanceof Error ? error.message : error}`
      }))
      // 🔒 A LINK IN A PAGE INTO A PAGE THE TIDY-UP TOOK OFF IS TAKEN OFF, NEVER SENT TO THE CONTACT PAGE (product owner,
      // 08/10/2026, TCH #1013; WordPress does the same, `wp-unlink.js`). The pages the customer did not pick
      // (`unpickedMenuItems`) are decided after the words are written: measured 05/10/2026 on a Tracy Business j6 site, the
      // 404 page's "you may be looking for" rows still led to the slide kit and the careers page the tidy-up had taken off.
      // The links into them are found with the planner's rule (`deadLinks`, told the ids the tidy-up took off) over what the
      // slots hold now, and written through the contract (a slot is written nowhere else) as `empty_links`, before any
      // edition is derived from the source, with the words' own set-aside rounds.
      // 🔒 THE SAME FOR A PAGE THE DEMO TRIM HID THAT THE CUSTOMER DID NOT TICK (product owner, 10/10/2026, TCH #1013). The
      // planner used to send its links to the contact page; it now leaves them as they are (`deadLinks`), and they are
      // taken off here once the trim has run (`trim.status` "hidden": a trim that did not run hides nothing).
      // ⚠ A button's link is a contract slot, and the component empties one only where it reviewed the layout that draws it
      // (Claude Cowork for Joomla 0.24.4: inspect marks the slot `emptyLink`, "hidden" or "plain"); emptied anywhere else
      // the layout may print `<a href="">`. Any other link — an older component marks none — is left as it is and said:
      // a button that still leads to a page taken off is the lesser harm than one sent somewhere the customer never chose.
      // A link a person set, a translated copy, or a line the write of the words already had refused is not this step's.
      // `back`: the entries the trim hid that the tidy-up published again (pages the customer ticked) — a link into one leads
      // to a live page, so it is not taken off.
      const takeLinksOff = async (/** @type {number[]} */ away, /** @type {number[]} */ back = []) => {
        const now = state.slots.map((slot) =>
          slot.key in changes ? { ...slot, current: changes[slot.key] } : slot
        )
        const ours = new Map(now.map((slot) => [slot.key, slot]))
        const dead = deadLinks({ contract: state.contract, slots: now }, seederDataDir(ctx.contract), {
          also: new Set(away.map(String)),
          back: new Set(back.map(String)),
          trim: trim.status === 'hidden'
        })
        // Only in an edition a visitor reads: a hidden edition's links lead nowhere anyone goes.
        const ownLanguage = entityLanguages(seederDataDir(ctx.contract), ctx.contract.id)
        const found = dead.filter((key) => {
          const slot = ours.get(key)
          if (!slot || isDerived(slot) || refusedByWrite.has(key)) return false
          if (!(key in changes) && slot.current !== undefined && slot.current !== slot.sample) return false
          const own = ownLanguage?.get(slot.entity)
          if (own !== undefined && own !== '*' && !visibleNow.has(own)) return false
          return String(slot.current ?? slot.sample ?? '') !== ''
        })
        if (found.length === 0) return
        // Whether the site reviewed a link's layout is already in the reading the words were written with: a link it did not
        // review is left and said without asking the site again.
        const reviewed = found.filter((key) => live.get(key)?.emptyLink)
        let left = found.length - reviewed.length
        try {
          if (reviewed.length === 0) return
          const reading = await contract({ operation: 'inspect' })
          if (!reading?.ok) throw new Error(doorRefusal(reading))
          // What the site holds now must be what was just written: a slot changed since is left to whoever changed it.
          const held = new Map((reading.slots ?? []).map((slot) => [slot.key, slot]))
          const unchanged = reviewed.filter((key) => {
            const there = held.get(key)
            const was = ours.get(key)
            return there && (there.current ?? there.sample) === (was?.current ?? was?.sample)
          })
          if (unchanged.length < reviewed.length)
            ctx.note(
              `${reviewed.length - unchanged.length} link(s) to pages taken off changed on the site since they were read, and were left`
            )
          const emptyLinks = unchanged.filter((key) => held.get(key)?.emptyLink)
          left += unchanged.length - emptyLinks.length
          if (emptyLinks.length === 0) return
          const refused = await writeContract({
            applyJoomlaContract,
            apply,
            siteKey,
            reading,
            changes: {},
            evidence: {},
            emptyLinks,
            timed: (job) => time('linksMs', job)
          })
          if (refused.length > 0) {
            ctx.time('linksRefused', refused.length)
            ctx.note(
              `${refused.length} link(s) to pages taken off were refused by the site and still lead there`
            )
          }
          if (emptyLinks.length > 0) ctx.time('linksTakenOff', emptyLinks.length)
        } catch (error) {
          ctx.note(
            `${reviewed.length} link(s) to pages taken off could not be taken off: ${error instanceof Error ? error.message : error}`
          )
        } finally {
          if (left > 0) {
            ctx.time('linksLeft', left)
            ctx.note(
              `${left} link(s) to pages taken off cannot be taken off on this site's layout, so they still lead there`
            )
          }
        }
      }
      let tidied = false
      const tidyUp = async () => {
        if (tidied) return
        tidied = true
        try {
          const judged = await tidying
          if (judged.note) ctx.note(judged.note)
          for (const part of [
            judged.stranded,
            judged.unpicked,
            judged.dead,
            judged.orphaned,
            judged.articles
          ])
            if (part.note) ctx.note(part.note)
          // What the pages not picked take off is written first; what only goes with it comes after.
          const causes = [...new Set(judged.unpicked.ids)]
          const dependents = [
            ...new Set([
              ...judged.dead.ids,
              ...judged.stranded.ids,
              ...judged.orphaned.ids,
              ...judged.anchors.hide
            ])
          ].filter((id) => !causes.includes(id))
          const hiding = [...causes, ...dependents]
          const after = new Set(dependents)
          // An entry the site will not take off keeps what only went with it: read again without it, and the rest is not sent.
          const still = async (/** @type {Array<{ kind: string, id: number }>} */ refused) => {
            const out = new Set(refused.filter((step) => step.kind === 'menuItem').map((step) => step.id))
            const again = judged.menu
              ? await dependentsOf(
                  judged.menu,
                  causes.filter((id) => !out.has(id)),
                  out
                ).catch(() => null)
              : null
            const stand = new Set(
              again
                ? [...again.dead.ids, ...again.stranded.ids, ...again.orphaned.ids, ...again.anchors.hide]
                : []
            )
            // An article goes only with the entries it went with: one of them left, it stays.
            return (/** @type {{ kind: string, id: number }} */ step) =>
              step.kind === 'article'
                ? !(judged.articles.by.get(step.id) ?? []).some((id) => out.has(id))
                : step.kind !== 'menuItem' || !after.has(step.id) || stand.has(step.id)
          }
          // The site plan's contact facts (one reader, `contact-reading.mjs`): the record shows the address as the brief gives it.
          const planned = await woContent
            ?.sitePlanFor?.({ siteKey: ctx.siteKey, email: ctx.email })
            .catch(() => null)
          const contacts = await contactSteps({
            apply,
            siteKey,
            contact: planned?.contact ?? null,
            channels: Array.isArray(planned?.channels) ? planned.channels : null,
            // The menu read once above: an entry of a contact record may turn its form back on (#189 item 19).
            menu: judged.menu ?? [],
            given: {
              email: ctx.normalized.email,
              phone: ctx.normalized.phone,
              address: ctx.normalized.address,
              name: ctx.normalized.name
            },
            visible: visibleNow
          })
          if (contacts.note) ctx.note(contacts.note)
          // The component's "Miscellaneous Information" over the channel list is hidden by the leftover head block
          // (`CONTACT_LIST_HEADINGS`): the site refuses the en-GB language override that would reword it (#189, round 10).
          // The site plan's contact facts in the custom modules' contact lines, linked (`joomla-contact-links.js`, #191).
          const moduleContacts = await planContactSteps({
            apply,
            siteKey,
            ctx,
            woContent,
            visible: visibleNow,
            // No contact line added beside a bound node moves it (`joomla-contact-lines.js`).
            slots: [...staticState(ctx.contract).slots, ...(staticState(ctx.contract).declared ?? [])],
            // A footer block keeps the demo's entries kind by kind (`footer-contact-shape.mjs`, site build rule 5).
            contentMap: staticState(ctx.contract)
          })
          // The site plan's social links, map, demo logo picture and demo posts (`joomla-plan-identity.js`, #193), merged over the module writes above.
          const identity = await planIdentitySteps({
            apply,
            siteKey,
            ctx,
            woContent,
            visible: visibleNow,
            base: moduleContacts.steps
          })
          // The site plan's cards beyond the brief taken off and its fact fields emptied (`joomla-plan-records.js`, #192).
          // The demo lines the writer left (`leftDemoWords`), and a line of the copy writer's the site refused, are emptied with them.
          const staticSlots = new Map(
            [...staticState(ctx.contract).slots, ...declaredSlots(ctx.contract)].map((slot) => [
              slot.key,
              slot
            ])
          )
          // 🔒 A CARD WHOSE NAME THE SITE STILL REFUSED GOES WHOLE (#189 item 30, `refusedCardHides`): never the demo's name
          // on the card, its page or the menus that mirror it. The footer and main menu are written after this from the
          // published records, so its links go with it; the note names the offering and why.
          const nameRefused = refusedCardHides({
            refused: refusedByWrite,
            contentMap: staticState(ctx.contract)
          })
          const nameRefusedGroups = new Set(nameRefused.map((hide) => hide.group))
          for (const hide of nameRefused) {
            const key = [...refusedByWrite].find((k) => staticSlots.get(k)?.group?.id === hide.group)
            const named = key ? String(plannedWords[key] ?? '').trim() : ''
            ctx.note(
              `${named ? `"${named}"` : 'a card'} could not be shown: its name is too long for the template's box even written shorter, so its card and page were taken off`
            )
          }
          // 🔒 A LINE THE SITE REFUSED IS SETTLED LIKE ANY UNWRITTEN LINE (`settleKeptSlots`, R12 group A): its block or item
          // comes off when the template can, else it keeps the demo's words for the repair loop, never emptied in a kept block.
          // A line the plan itself emptied (its planned words are '') is a decision of the plan, emptied as planned; only
          // words the site refused are settled.
          const refusedSlots = [...refusedByWrite]
            .map((key) => staticSlots.get(key))
            .filter((slot) => slot && occupiedSample(slot) && !nameRefusedGroups.has(slot.group?.id))
          const plannedEmpty = refusedSlots.filter(
            (slot) => String(plannedWords[slot.key] ?? '').trim() === ''
          )
          const refusedLines = settleKeptSlots({
            blanks: refusedSlots.filter((slot) => !plannedEmpty.includes(slot)),
            plan: null,
            contentMap: staticState(ctx.contract),
            removed: {
              entities: [
                ...(prepared.factModules ?? []).map((m) => `module-${m.id}`),
                ...(prepared.demoHides ?? []).filter((h) => h.how === 'entity').map((h) => h.entity)
              ],
              groups: [...(prepared.demoHides ?? []), ...nameRefused].map((h) => h.group).filter(Boolean)
            }
          })
          for (const entity of refusedLines.modules) {
            const id = Number(entity.slice('module-'.length))
            prepared.factModules = prepared.factModules ?? []
            if (!prepared.factModules.some((m) => m.id === id))
              prepared.factModules.push({
                id,
                title: String(staticSlots.get(`${entity}.0`)?.label ?? entity)
              })
          }
          if (refusedLines.unwritten.length > 0 || refusedLines.removedKeys.length > 0) {
            const before = prepared.copyLines ?? { unwritten: [], blanked: [] }
            prepared.copyLines = {
              unwritten: [
                ...before.unwritten,
                ...refusedLines.unwritten.filter((line) => !before.unwritten.some((u) => u.key === line.key))
              ],
              blanked: before.blanked.filter((key) => !refusedLines.removedKeys.includes(key))
            }
            ctx.record?.('copyLines', prepared.copyLines)
          }
          const refusedKept = new Set(refusedLines.unwritten.map((line) => line.key))
          const records = await planRecordSteps({
            apply,
            siteKey,
            ctx,
            woContent,
            protectedKeys: new Set([
              ...Object.keys(prepared.offeringSummaries ?? {}),
              ...Object.keys(prepared.ctaBands?.values ?? {})
            ]),
            extraBlanks: [
              ...(prepared.demoBlanks ?? []),
              ...plannedEmpty,
              ...refusedLines.blanks.filter((slot) => !refusedKept.has(slot.key))
            ],
            extraHides: [...(prepared.demoHides ?? []), ...nameRefused, ...refusedLines.hides],
            // A fact row emptied in one cell is emptied whole (`wholeFactRowsOf`, #189 items 14 and 15).
            slots: [...staticSlots.values()]
          })
          const requiredRecords = new Set(records.steps.map((step) => `${step.kind}-${step.id}`))
          const requiredRecord = (step) => requiredRecords.has(`${step.kind}-${step.id}`)
          // 🔒 A RECORD WRITE THE SITE REFUSES IS SAID, NEVER THE END OF THE BUILD (#189, round 10): the demo words it was to take
          // off are left on that one record, the rest of the tidy-up, the head blocks, the contact record and the cleanup turn
          // still run, and the final check with the blocker gate decides whether the build needs fixes.
          const cleanupLeft = (/** @type {string} */ reason, /** @type {number} */ count) => {
            ctx.time('recordWritesLeft', count)
            ctx.note(
              `the template's demo content could not be removed from ${reason}, and is left for a person to fix`
            )
          }
          // 🔒 No records write takes away a node a contract slot binds to (`joomla-bound-nodes.js`, #189): the plugin's
          // inspect would refuse every contract write after it.
          // The styled units whose words the contract took, laid into the records steps (#189).
          const styling = await placeInlineStyles({
            apply,
            siteKey,
            styled: styled.filter(({ slot }) => !refusedByWrite.has(slot.key)),
            steps: [...identity.steps, ...records.steps]
          }).catch((error) => {
            ctx.note(
              `the template's heading styles could not be read: ${error instanceof Error ? error.message : error}`
            )
            return { steps: [...identity.steps, ...records.steps], placed: [], missed: [] }
          })
          const bound = await guardBoundNodes({
            apply,
            siteKey,
            steps: styling.steps,
            // Every slot the plugin resolves, the declared `keep` ones too.
            slots: [...staticState(ctx.contract).slots, ...declaredSlots(ctx.contract)]
          }).catch((error) => {
            // Unchecked record writes could take away a node the contract binds to: none is written, and that is said.
            ctx.note(
              `the template's bound lines could not be checked, so ${styling.steps.length} record change(s) were not made: ${error instanceof Error ? error.message : error}`
            )
            if (requiredRecords.size > 0) ctx.time('recordWritesLeft', requiredRecords.size)
            return { steps: [], dropped: [] }
          })
          const heldRequired = bound.dropped.filter(requiredRecord)
          if (heldRequired.length > 0)
            cleanupLeft(heldRequired.flatMap((step) => step.keys).join(', '), heldRequired.length)
          if (bound.dropped.length > 0) {
            ctx.time('recordWritesHeld', bound.dropped.length)
            console.warn(
              `[brief-joomla] ${siteKey}: records writes held to keep bound slots: ${bound.dropped.map((d) => `${d.kind}-${d.id} (${d.keys.join(', ')})`).join('; ')}`
            )
          }
          if (judged.categories.note) ctx.note(judged.categories.note)
          // An entry the tidy-up takes off is only taken off: a title written into it would show nowhere.
          const retitled = judged.pages.steps.filter((step) => !hiding.includes(step.id))
          // 🔒 L1: an entry into a blog category renamed for the business takes its new name (`joomla-menu-categories.js`), after
          // the judge's labels and the page titles, so it is the last word on that entry.
          const intoCategories = menuCategorySteps({
            rows: judged.menu ?? [],
            renamed: judged.categories.renamed ?? new Map(),
            source: SOURCE
          }).filter((step) => !hiding.includes(step.id))
          // 🔒 Whatever step names it, the home entry and a kept page's entry are never taken off (withoutKeptTakeOff).
          const keptPaths = keptById(ctx.brief?.pages)
          const guardedIds = (judged.menu ?? [])
            .filter(
              (row) =>
                Number(row?.published) === 1 &&
                (Number(row?.home ?? 0) === 1 || keptPaths.includes(String(row?.path ?? '')))
            )
            .map((row) => Number(row.id))
          const homeSafe = (
            /** @type {Array<{ kind: string, id: number, fields: Record<string, unknown> }>} */ list
          ) => {
            const { steps, kept } = withoutKeptTakeOff(list, judged.menu ?? [], keptPaths)
            if (kept.length > 0) ctx.time('keptEntriesHeld', kept.length)
            return steps
          }
          /** @type {Array<{ kind: string, id: number, fields: Record<string, unknown> }>} */
          let tidySteps = []
          const done = await time('tidyMs', () =>
            writeSteps({
              apply,
              siteKey,
              steps: (tidySteps = homeSafe([
                // A ticked page the demo trim took off comes back first, so nothing below reads it as gone.
                ...judged.ticked.off.map((id) => ({ kind: 'menuItem', id, fields: { published: 1 } })),
                ...menuSteps(causes),
                ...articleSteps(judged.articles.ids),
                // An article a page that stays still shows, whose only route went, gets an entry of its own.
                ...routeSteps({ rows: judged.menu ?? [], articles: judged.articles.routes }),
                ...judged.relabels.filter((step) => !hiding.includes(step.id)),
                ...retitled,
                ...contacts.steps,
                ...judged.categories.steps,
                ...intoCategories,
                ...menuSteps(dependents),
                ...anchorSteps(judged.anchors.relink.filter((a) => !hiding.includes(a.id)))
              ])),
              applyId: `tidy-${Date.now().toString(36)}`,
              still
            })
          )
          ctx.time('menuKept', judged.ticked.off.length)
          ctx.time('menuUnpicked', judged.unpicked.ids.length)
          ctx.time('articlesUnpicked', judged.articles.ids.length)
          ctx.time('articlesRouted', judged.articles.routes.length)
          ctx.time('menuStranded', judged.stranded.ids.length)
          ctx.time('menuDeadLinks', judged.dead.ids.length)
          ctx.time('menuOrphaned', judged.orphaned.ids.length)
          ctx.time('menuAnchorRelinked', judged.anchors.relink.length)
          // 🔒 A BROKEN SITE IS NEVER HANDED OVER: after the tidy-up the home page and every kept page are read; one that does not
          // answer 200 takes the menu entries this tidy-up took off back, and the reason is recorded.
          const reader = siteReader ? await siteReader(siteKey).catch(() => null) : null
          const broken = await pagesNotAnswering(reader, guardedIds)
          if (broken.length > 0) {
            const back = [
              ...new Set(
                done.written > 0
                  ? tidySteps.filter(
                      (step) =>
                        step.kind === 'menuItem' &&
                        Number(step.fields?.published ?? 1) !== 1 &&
                        !done.refused.some((r) => r.kind === step.kind && r.id === step.id) &&
                        !done.skipped.some((r) => r.kind === step.kind && r.id === step.id)
                    )
                  : []
              )
            ]
            const restored = back.length
              ? await writeSteps({
                  apply,
                  siteKey,
                  steps: back.map((step) => ({ kind: 'menuItem', id: step.id, fields: { published: 1 } })),
                  applyId: `tidy-revert-${Date.now().toString(36)}`
                })
              : null
            const stillBroken = await pagesNotAnswering(reader, guardedIds)
            ctx.time('tidyMenuReverted', restored?.written ?? 0)
            ctx.note(
              `after the menu tidy-up ${broken.map((b) => `${b.url} answered ${b.status ?? 'nothing'}`).join(', ')}, so its ${back.length} menu change(s) were taken back${stillBroken.length ? `; still not answering: ${stillBroken.map((b) => `${b.url} ${b.status ?? 'nothing'}`).join(', ')}` : ''}`
            )
          }
          ctx.time('menuAnchorHidden', judged.anchors.hide.length)
          ctx.time('menuRelabelled', judged.relabels.length)
          ctx.time('pagesRetitled', retitled.length)
          ctx.time('contactsRouted', contacts.steps.length)
          ctx.time('categoriesTranslated', judged.categories.steps.length)
          ctx.time('menuCategoriesNamed', intoCategories.length)
          for (const note of done.notes.slice(0, 3)) ctx.note(note)
          if (done.skipped.length > 0)
            ctx.note(
              `${done.skipped.length} menu entry(ies) that went only with one the site would not change were left`
            )
          // A link into an entry the site would not take off, or into one that was left with it, still leads somewhere and stays.
          // One into a dependent the site refused does not: what it went with is gone, so it is a dead end anyway, and moves.
          const left = new Set(
            [...done.refused.filter((step) => causes.includes(step.id)), ...done.skipped]
              .filter((step) => step.kind === 'menuItem')
              .map((step) => step.id)
          )
          const gone = hiding.filter((id) => !left.has(id))
          const refusedBack = new Set(
            done.refused.filter((step) => step.kind === 'menuItem').map((step) => step.id)
          )
          // The pages the tidy-up took off, and those the trim hid that nobody ticked: their links go.
          if (gone.length > 0 || trim.status === 'hidden')
            await takeLinksOff(
              gone,
              judged.ticked.off.filter((id) => !refusedBack.has(id))
            )
          if (judged.consent) {
            const refused = await setConsentNote({
              apply,
              siteKey,
              plugin: judged.consent,
              applyId: `tidy-consent-${Date.now().toString(36)}`
            })
            if (refused) ctx.note(refused)
            else ctx.time('consentNote', 1)
          }
          // 🔒 THE WRITES OUTSIDE THE CONTRACT INTO MODULE AND ARTICLE HTML GO LAST (#189): every contract write of the tidy-up
          // (the links taken off above) is made first, so none reads a row these steps rewrite.
          // 🔒 No later records write puts back a field the tidy-up wrote above, the Contact page's channel list in a contact
          // record first among them (`withoutStaleRecordFields`, #189 item 19 round 11): those steps were computed from the rows
          // as read before the tidy-up.
          const fresh = withoutStaleRecordFields(bound.steps, tidySteps)
          if (fresh.held.length > 0) {
            ctx.time('recordFieldsKeptFromTidy', fresh.held.length)
            console.warn(
              `[brief-joomla] ${siteKey}: records fields the tidy-up already wrote, left as written: ${fresh.held.map((h) => `${h.kind}-${h.id} (${h.keys.join(', ')})`).join('; ')}`
            )
          }
          if (fresh.steps.length > 0) {
            const wroteRecords = await time('recordsMs', () =>
              writeSteps({
                apply,
                siteKey,
                steps: fresh.steps,
                applyId: `tidy-records-${Date.now().toString(36)}`
              })
            )
            const missed = [...wroteRecords.refused, ...wroteRecords.skipped].filter(requiredRecord)
            if (missed.length > 0)
              cleanupLeft(missed.map((step) => `${step.kind}-${step.id}`).join(', '), missed.length)
            if (wroteRecords.refused.length > 0)
              ctx.note(
                `${wroteRecords.refused.length} change(s) to the template's cards and fact lines were refused`
              )
          }
          // 🔒 A HEADING THAT LOST THE DEMO'S STYLE IS SAID, NEVER SLIPS (#189): read back from the site after every write.
          const takenStyles = styled.filter(({ slot }) => !refusedByWrite.has(slot.key))
          if (takenStyles.length > 0) {
            const lost = await inlineStylesLost({ apply, siteKey, styled: takenStyles }).catch(() =>
              takenStyles.map(({ slot }) => slot.key)
            )
            ctx.time('inlineStylesKept', takenStyles.length - lost.length)
            if (lost.length > 0) {
              ctx.time('inlineStyleLost', lost.length)
              ctx.note(
                `${lost.length} heading(s) lost the template's inline style (accent words, line breaks): ${lost.slice(0, 8).join(', ')}`
              )
            }
          }
        } catch (error) {
          if (error?.code === 'JOOMLA_RECORD_FALLBACK_UNRESOLVED') throw error
          ctx.note(
            `the template's own menu entries could not be taken off: ${error instanceof Error ? error.message : error}`
          )
        }
      }

      // A quickstart that ships one edition is written in the language chosen; Joomla is told to speak it too.
      if (!prepared.multilingual && prepared.written && prepared.written !== SOURCE) {
        const { text } = await models()
        const spoken = await time('siteLanguageMs', () =>
          setSiteLanguage({
            contract,
            locale: prepared.written,
            note: ctx.note,
            cache: prepared.headings ?? new Map(),
            model: text ?? null,
            signal: ctx.signal
          })
        )
        if (spoken) ctx.time('siteLanguage', 1)
      }
      // Whether a visitor reads the site in one language once the languages are settled: then its addresses lose the prefix.
      let oneLanguage = !prepared.multilingual
      // Only the languages asked for stay in the switcher. A quickstart that ships one edition has nothing to hide.
      if (prepared.multilingual) {
        // What is kept: the source, the shipped editions asked for and the ones about to be made (an edition still to be
        // derived stays hidden until its words land, so the order is: hide, derive, hide what the derivation woke).
        const keep = [...prepared.keep, ...(prepared.derive ?? []).map((d) => d.locale)]
        const applyId = `mlang-retire-${Date.now().toString(36)}`
        const retire = (name = 'retireMs') =>
          time(name, async () => {
            for (let round = 0; round < RETIRE_ROUNDS; round += 1) {
              const answer = await contract({ operation: 'multilingual.retire', keep, apply_id: applyId })
              if (!answer?.ok) {
                const why = doorRefusal(answer)
                if (/unknown (multilingual|contract) operation|unknown action/i.test(why))
                  return 'unsupported'
                throw new Error(why)
              }
              if (answer.status === 'completed') return 'done'
            }
            throw new Error('hiding the other languages did not finish')
          })
        const retired = await retire()
        oneLanguage = retired === 'done' && prepared.keep.length === 1 && (prepared.derive ?? []).length === 0
        await tidyUp()
        // One language other than the source's: every other edition is hidden now, so its tag can name the source.
        if (prepared.sole && retired === 'done') {
          const { text } = await models()
          const spoken = await time('sourceLanguageMs', () =>
            writeSourceLanguage({
              contract,
              locale: prepared.written,
              cache: prepared.headings ?? new Map(),
              model: text,
              signal: ctx.signal,
              note: ctx.note
            })
          )
          if (spoken) ctx.time('sourceLanguage', 1)
        }
        if (retired === 'unsupported') ctx.note('this site could not hide the languages nobody asked for')
        else if ((prepared.derive ?? []).length > 0) {
          const { text } = await models()
          if (!text) ctx.note('no text model is set, so the extra languages were not added')
          else {
            const { added } = await time('languagesMs', () =>
              addDerivedLanguages({
                apply,
                siteKey,
                languages: prepared.derive,
                model: text,
                signal: ctx.signal,
                note: ctx.note,
                time
              })
            )
            // A derivation can leave an archive row of its language showing beside the copy it made.
            if (added.length > 0) await retire('retireAfterMs')
          }
        }
      }
      await tidyUp()
      // The modules that state only the template's own facts come off the page, in every language that shows them.
      if ((prepared.factModules ?? []).length > 0) {
        try {
          const derived = (prepared.derive ?? []).map((d) => d.locale)
          const done = await time('hideMs', () =>
            hideFactModules({
              apply,
              siteKey,
              modules: prepared.factModules,
              copies: prepared.keep.length > 1 || derived.length > 0,
              visible: new Set([SOURCE, ...prepared.keep, ...derived]),
              applyId: `facts-${Date.now().toString(36)}`
            })
          )
          ctx.time('hiddenModules', done.hidden.length)
          for (const note of done.notes.slice(0, 3)) ctx.note(note)
        } catch (error) {
          ctx.note(
            `the template's own facts could not be taken off the page: ${error instanceof Error ? error.message : error}`
          )
        }
      }
      // 🔒 THE TEMPLATE'S OWN WORDS FOLLOW THE SITE'S LANGUAGE (LANG-2, `joomla-site-strings.js`): once the site speaks one
      // language other than en-GB, the strings its template and extensions still print in en-GB become language overrides.
      if (overrides) {
        const { text } = await models()
        const translated = await overrides
        const done = await time('overridesMs', () => translated.write())
        if (done.written > 0) ctx.time('languageOverrides', done.written)
        // What the site offered and refused beside it, so the build report shows a short write without a second read.
        if (done.offered > 0) ctx.time('languageOverridesOffered', done.offered)
        if (done.refused > 0) ctx.time('languageOverridesRefused', done.refused)
        // 🔒 THE AUTHORS' JOB AND BIO ARE SAID IN THE SITE'S LANGUAGE ON FULL, NEVER REWRITTEN (LANG-2, `author-words.js`): user
        // profile fields no contract slot reaches ("Collaborator & Editor" on 17 pages of dev g60-ess-j-full). BLANK keeps them.
        const authors = await time('authorWordsMs', () =>
          translateAuthorWords({
            platform: 'joomla',
            apply,
            siteKey,
            locale: prepared.written,
            source: SOURCE,
            described: aboutGiven(ctx.brief),
            model: text ?? null,
            signal: ctx.signal,
            note: ctx.note
          })
        )
        if (authors.written > 0) ctx.time('authorWords', authors.written)
      }
      // 🔒 ONE LANGUAGE, NO `/en/` (D8): last, once no language job is left to write the filter's settings back.
      if (oneLanguage) {
        const prefix = await time('prefixMs', () =>
          dropDefaultPrefix({
            apply,
            siteKey,
            applyId: `prefix-${Date.now().toString(36)}`,
            note: ctx.note
          })
        )
        if (prefix === 'dropped') ctx.time('prefixDropped', 1)
      }
      // 🔒 THE SITE'S LANGUAGE IS DRAWN IN ITS OWN LETTERS (LANG-2, `glyph-fallback.js`): last, when the page is what a visitor
      // reads, the families it uses that cannot draw them are given faces that can.
      if (
        siteReader &&
        prepared.written &&
        prepared.written !== SOURCE &&
        (!prepared.multilingual || prepared.sole)
      ) {
        const glyphs = await time('glyphsMs', async () =>
          giveGlyphs({
            platform: 'joomla',
            reader: await siteReader(siteKey).catch(() => null),
            lang: prepared.written,
            write: (action, params) => apply({ siteKey, action, params }),
            template: templateOf(ctx.contract.dir),
            note: ctx.note
          })
        )
        if (glyphs.faces > 0) ctx.time('glyphFaces', glyphs.faces)
      }
      // What the content map does not reach (#196): credit line, page addresses, and the head block that repaints the demo
      // backgrounds and hides demo play buttons and links to pages taken off (`joomla-outside-map.js`). A brief build only.
      if (outsidePlan?.outside) {
        // Both writes say each line once: the net's head-only rewrite never repeats the first write's notes.
        const outsideNote = onceNote(ctx.note)
        const outsideMap = async (pictures, headOnly = false) =>
          writeOutsideMap({
            apply,
            siteKey,
            plan: outsidePlan,
            reader: siteReader ? await siteReader(siteKey).catch(() => null) : null,
            contentMap: contentMapAt(ctx.contract?.dir),
            note: outsideNote,
            time: ctx.time,
            applyId: `outside-${Date.now().toString(36)}`,
            locale: prepared.written ?? SOURCE,
            pictures,
            removedGalleryPictures: preparedPictures?.removedGalleryPictures ?? [],
            headOnly
          })
        // Cut-out figures taken off (ladder step 2): hidden by the head block, so they leave no box.
        const hidden = [
          ...new Set([
            ...(preparedPictures?.hiddenPictures ?? []),
            ...takenOffPicturePaths(placedReal, art.values, refusedByWrite)
          ])
        ]
        await time('outsideMapMs', () => outsideMap(hidden))
        // The safety net: a placed picture that covers words at any width is taken off too (`picture-overlap-net.js`).
        if (pictureOverlap && Object.keys(art?.values ?? {}).length > 0)
          await time('pictureOverlapMs', async () =>
            overlapSafetyNet({
              check: pictureOverlap,
              reader: siteReader ? await siteReader(siteKey).catch(() => null) : null,
              siteKey,
              plan: outsidePlan,
              pictures: hidden,
              rewrite: (pictures) => outsideMap(pictures, true),
              note: ctx.note,
              time: ctx.time
            })
          )
      }
      // 🔒 The restaurant's own posts, last: after the tidy-up and the demo trim settled which articles show (`joomla-wo-content.js`).
      if (prepared.woPosts && woContent)
        await time('woContentMs', () =>
          writeWoContent({
            apply,
            siteKey,
            read: prepared.woPosts,
            woContent,
            visible: visibleNow,
            note: ctx.note,
            time: ctx.time
          })
        )
      // The main menu owns its labels after copy pins and every cleanup write.
      const menuPlan = await woContent?.sitePlanFor?.({ siteKey, email: ctx.email })
      // 🔒 A showcase block repeated across kept pages stays on the one the plan keeps it on (`joomla-repeated-blocks.js`,
      // COO decision 30/10/2026): its page assignment is narrowed, never unpublished.
      await narrowRepeatedBlocks({
        apply,
        siteKey,
        sitePlan: menuPlan,
        applyId: `repeat-${Date.now().toString(36)}`,
        note: ctx.note,
        time: ctx.time
      })
      // 🔒 A record page laid out as a landing page shows no blog pager (#189, site build rule 3): the template declares
      // which pages are (`recordPages`), and their Previous / Next article links are switched off.
      const pagers = await hideRecordPagers({
        apply,
        siteKey,
        contentMap: staticState(ctx.contract),
        applyId: `pager-${Date.now().toString(36)}`,
        note: ctx.note
      })
      if (pagers > 0) ctx.time('recordPagersOff', pagers)
      if (menuPlan?.pages?.some((p) => p.decision === 'keep')) {
        const { text: menuModel } = await models()
        const menu = await writeJoomlaMainMenu({
          apply,
          siteKey,
          sitePlan: menuPlan,
          model: menuModel,
          locale: prepared.written ?? SOURCE,
          signal: ctx.signal,
          contentMap: staticState(ctx.contract)
        })
        ctx.time('mainMenuLabels', menu.items.length)
        // The footer link columns list every kept page, each with the name the main menu gave it.
        const footer = await writeJoomlaFooterNavigation({
          apply,
          siteKey,
          sitePlan: menuPlan,
          model: menuModel,
          locale: prepared.written ?? SOURCE,
          signal: ctx.signal,
          contentMap: staticState(ctx.contract),
          known: Object.fromEntries(menu.items.map((i) => [i.pageId, i.label]))
        })
        ctx.time('footerNavigationLinks', footer?.columns.reduce((n, c) => n + c.links.length, 0) ?? 0)
      }
      return { wrote, kept }
    }
  }
}
