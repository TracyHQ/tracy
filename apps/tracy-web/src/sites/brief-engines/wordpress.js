/**
 * "Apply" for a WordPress site built from a sealed quickstart (`tracy-business/wp7`, `tracy-base/wp7`): the
 * customer's words, written the way the seeder writes them, in a fraction of the time.
 *
 *   prepare  (while the site installs, no site needed)
 *     the contract's slots come from the profile this process already holds → the slots an answer names
 *     (the site title, the contact lines) are filled from the answer → every other text slot goes to the
 *     model in batches of 35, ALL AT ONCE, with thinking off (`seed-model.js` has the numbers) → what
 *     comes back is checked for facts nobody gave (`guard.js`); beside it, a few pictures of the customer's
 *     own business are drawn (`pictures.js`)
 *   apply    (the moment the site is up)
 *     [inspect the site's contract → hide the demo posts]  ‖  [read each extra language's pages → plan
 *     them in that language (→ their second chance)]  ‖  [judge the template's pages, plan every language's
 *     other words]  ‖  [cut the pictures to the demo's shape and upload them]  → write everything through ONE
 *     revision → take what is left of the template's company off, by block, in every language → hide the
 *     editions nobody asked for
 *
 * It is the seeder's own sequence (`tracy-seeder/src/cli.mjs` `seedWordPressContract`) with two changes: the
 * model batches run concurrently instead of one after another, and the part that needs no site — the
 * source language's words — runs before the site exists instead of after it. The planners, the door
 * calls and every rule that keeps a model out of a sealed site are the seeder's modules, loaded as they
 * are (`lib/seeder.js`).
 *
 * 🔒 THE SOURCE EDITION STAYS IN FRONT (decision 21, measured on dev 25/09). Whatever languages are asked for,
 * `/` is the archive's source edition and a chosen language lives under its own prefix: making another
 * edition the default breaks every URL baked into the navigation.
 *
 * 🔒 ONE LANGUAGE THAT IS NOT ENGLISH IS WRITTEN INTO THAT SOURCE EDITION (TCH #1013, D10, O2). The language
 * question asks for one language: the source edition at `/` is written in it, no edition is added under a
 * prefix, every other edition the archive ships is hidden, and WordPress is told to speak it (its core
 * translation installed, `WPLANG`). Several languages (an older brief) keep the source in English plus `/vi/`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { declaredCopy, listOf } from '../../lib/contract-copy.js'
import { seeder, seederDataDir } from '../../lib/seeder.js'
import { showcaseNavMap, showcasePageIds } from '../../lib/showcase-nav-map.js'
import { translateAuthorWords } from './author-words.js'
import { translateBlog } from './blog-translate.js'
import { writeContractPictures } from './contract-real-pictures.js'
import { giveGlyphs } from './glyph-fallback.js'
import { factsOf, guardChanges } from './guard.js'
import { demoNameChanges } from './joomla-demo-names.js'
import { languageName } from './joomla-languages.js'
import { keptById, pageKind, slugsForIds, unpickedById, unpickedPages } from './picked-pages.js'
import { drawPictures, pictureBriefs, pictureGroups, shapePictures, uploadPictures } from './pictures.js'
import { pictureReport, realPicturesOf, shapeReal } from './real-pictures.js'
import { isInterface, repairSlots } from './repair.js'
import {
  ABOUT_BLANK_NOTE,
  aboutGiven,
  aboutInLanguage,
  briefForJudges,
  budgetSignal,
  firmGenerate,
  nameAnswered,
  planConcurrently,
  pool,
  recordedDoor,
  recordTextUsage,
  sayUnbound,
  siteBlock,
  spokenOf,
  staged,
  stopwatch,
  withTemplateName
} from './shared.js'
import { woContentOf } from './wo-content.js'
import { copyPinsOf, pinStates, recordPins, sampleAt, samplePagesOf, sweepDishesOf } from './wo-copy-pins.js'

import { translateBlockWords } from './wp-block-words.js'
import { plain } from './wp-blocks.js'
import { dishItemPictures, UNSOURCED } from './wp-wo-fill.js'
import { buttonsIn, fileLinksToContact, holdTargets, pageAt, sharesWord, targetName } from './wp-buttons.js'
import { heldContactSlots } from './wp-contacts.js'
import { blockText, uniqueSlots } from './wp-duplicates.js'
import { formIdsIn, formLabels, formLines } from './wp-forms.js'
import { shownOnly } from './wp-hide.js'
import { isKitPage, translateKitLines } from './wp-kit.js'
import { labelLines, namedRuns, planLines, slotCountsByPage, slottedOn, staticLines } from './wp-leaves.js'
import { listPosts, planPosts, planTerms, writePosts } from './wp-posts.js'
import {
  buttonLabels,
  buttonTargets,
  buttonWords,
  editionPageIds,
  judgeSite,
  listAll,
  navLabels,
  PARTS,
  PROTECTED,
  showcasePages,
  pathOfUrl,
  partsInMap,
  slotBlocksByPage,
  sweepWordPress,
  writtenLines
} from './wp-residue.js'
import { finishRuns, maskRuns, remask } from './wp-runs.js'
import { writeWoPosts } from './wp-wo-content.js'
import { woNameAsLogo } from './wp-wo-logo.js'

/**
 * The blocks of the slots an opportunity's build pinned empty (a dish's description with no source, `contractCopyPins`):
 * the door writes no empty value, so the sweep empties these blocks itself.
 * @param {Record<string, string> | undefined} pins
 * @param {{ slots: any[] }} contentMap
 * @returns {Set<string>}
 */
function blankBlocks(pins, contentMap) {
  const empty = new Set(Object.keys(pins ?? {}).filter((key) => pins?.[key] === ''))
  return new Set(
    contentMap.slots
      .filter((slot) => empty.has(slot.key) && typeof slot.target?.block === 'string')
      .map((slot) => slot.target.block)
  )
}

/**
 * @typedef {{ edition: string, id: number, block: string, nth: number, value: string }} EditionEdit - a line for the nth block of
 *   a name on another language's copy of a page (by its id), written by block in the sweep
 * @typedef {{ edition: string, id: number, block: string, nth: number, sample: string }} EditionDrop - the nth block of a name
 *   on another language's copy, to go while it still shows `sample`
 * @typedef {{ pass: { slug: string, tag: string }, slots: Array<{ slot: any, place: { id: number, block: string, nth: number, at: string } }>, whole: boolean }} EditionLeft
 *   - what an edition's first pass left with the template's words, for its second chance; `whole` when every call of that
 *   first pass answered
 */

/** Extra-language pages read from the site at once. */
const READ_AT_ONCE = 6
/** How long the extra languages may take once the site is up; past it they keep the template's words. */
const EDITIONS_MS = 60_000
/** How long the model may take to say which pages and menu labels of the template this business would not want. */
const JUDGE_MS = 20_000
/**
 * How long the other words of the pages, of the kit pages and of the demo posts may take once the site is up, beside the
 * writes: their batches are asked all at once, and a long article body (JA Essence: 12 paragraphs a page) takes longer than
 * the judge's one short answer.
 */
const WORDS_MS = 45_000
/**
 * The designs whose demo is ANOTHER COMPANY'S facts (a Russian contractor's history, certificates, safety record, projects and
 * clients), as on Joomla (`FACT_MODULE_DESIGNS`, `tracy-business/j6`): with About given, a block the customer's words never
 * reached is that company's and is cut (`pruneBody` with no names), its section with it. Every other design keeps its blocks
 * and only a block naming the template's company goes (TCH #1013, 11/10/2026).
 */
const FACT_DESIGNS = new Set(['tracy-business/wp7'])

/**
 * The pages of the languages asked for beyond the source, from the release's own inventory: the page list of a site
 * that runs Polylang shows only the source edition (`editionPageIds`). One language, nothing is read; an inventory that
 * cannot be read leaves those languages' pages as the template made them, and is said.
 * @param {{ dir: string }} contract
 * @param {Array<{ slug: string, source?: boolean }>} editions
 * @param {(note: string) => void} note
 * @returns {import('./wp-residue.js').EditionPage[]}
 */
function editionPagesOf(contract, editions, note) {
  const slugs = editions.filter((e) => !e.source).map((e) => e.slug)
  if (slugs.length === 0) return []
  try {
    return editionPageIds(JSON.parse(readFileSync(path.join(contract.dir, 'inventory.json'), 'utf8')), slugs)
  } catch (error) {
    note(
      `the pages of the other languages could not be found and keep the template’s words: ${error instanceof Error ? error.message : error}`
    )
    return []
  }
}

/** How long a site that listed no pages is given before it is asked again. */
const LISTING_RETRY_MS = 1500
/** The meta a block theme's posts page prints its heading from (`home.title`): no slot and no block holds it. */
const PAGE_HEADING = 'tracy_page_heading'
/**
 * The most blocks one Apply takes off for having no honest line. Past it, the ones that matter most go first (`dropOrder`) and the
 * rest keep the template's words — never none of them: with the guard refusing the template's own facts (ledger L09) a template
 * with many such lines would otherwise keep every one.
 */
const MAX_DROPS = 30
/** The words a guard reason ends with when the fact it refused is the template's own (`guard.js` `ungrounded`). */
const TEMPLATE_OWN = /it is the template’s own$/

/**
 * The lines of a body no slot names that the model is asked to say again (`wp-leaves.js`), less the demo contact lines of a
 * kind the customer typed nothing for: they keep the template's words (`heldContactSlots`, 11/10/2026).
 * @param {string} content
 * @param {{ email?: unknown, phone?: unknown, address?: unknown, hours?: unknown }} given
 * @param {(content: string, options?: { slotted?: (name: string) => number }) => Array<{ text: string, block: string, href?: string }>} [linesOf]
 * @param {(name: string) => number} [slotted] - a page's or a post's body: how many blocks of a name its slots write into
 *   (`slottedOn`); a later block of a name is a line of the page. Absent for a template part, whose names are the theme's.
 */
function ownLines(content, given, linesOf = staticLines, slotted = undefined) {
  const lines = linesOf(content, slotted ? { slotted } : {})
  const held = heldContactSlots(
    lines.map((line) => ({ key: line.text, type: 'text', sample: line.text })),
    given
  )
  return held.size === 0 ? lines : lines.filter((line) => !held.has(line.text))
}

/**
 * The names the template gives its own company: the samples of the contract's name slots (`input: 'name'`, a `name` or
 * `legalName` key), as a line would carry them.
 * @param {{ slots: any[] }} contentMap
 * @returns {string[]}
 */
function demoNames(contentMap) {
  const names = contentMap.slots
    .filter((slot) => slot.input === 'name' || /(?:^|\.)(?:name|legalName)$/.test(String(slot.key)))
    .map((slot) =>
      String(slot.sample ?? '')
        .trim()
        .toLowerCase()
    )
    .filter((name) => name.length >= 3)
  return [...new Set(names)]
}

/**
 * The lines with no honest replacement, the ones to take off first: a line naming the template's company, then one the second
 * pass said needs facts nobody gave (a person, a client, a certificate: somebody else's), then one whose only fault is the
 * template's own fact, then the rest; within a rank, in plan order.
 * @param {Iterable<string>} keys
 * @param {{ sampleOf: (key: string) => string, names: string[], nulls: Set<string>, ownFacts: Set<string> }} why
 * @returns {string[]}
 */
function dropOrder(keys, { sampleOf, names, nulls, ownFacts }) {
  const rank = (/** @type {string} */ key) => {
    const sample = sampleOf(key).toLowerCase()
    if (names.some((name) => sample.includes(name))) return 0
    if (nulls.has(key)) return 1
    if (ownFacts.has(key)) return 2
    return 3
  }
  return [...keys]
    .map((key, at) => ({ key, at, rank: rank(key) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map((entry) => entry.key)
}

/**
 * Which block of which page a slot is, the same in every language: `<entity>\u0000<block name>\u0000<nth>`, or null for a slot
 * that is no block (an option).
 * @param {string} key - a key of a map `uniqueSlots` made
 * @param {Map<string, import('./wp-duplicates.js').Repeat>} repeats
 * @param {Map<string, any>} slotOf
 */
const blockOf = (key, repeats, slotOf) => {
  const repeat = repeats.get(key)
  const slot = slotOf.get(key)
  const block = repeat?.block ?? slot?.target?.block
  return block ? `${repeat?.entity ?? slot.entity}\u0000${block}\u0000${repeat?.nth ?? 1}` : null
}

/**
 * The model's share of a contract map — the slots no answer names — planned by the seeder's own planner
 * with its batches asked all at once (`planConcurrently`). The planner sees the WHOLE map, so the letters
 * it learns for each language come from every sample of the edition: a Vietnamese value carrying a `ơ`
 * that no sample of its own 35 happens to carry is not judged "another language" and thrown away.
 * @param {object} input
 * @param {{entities: any[], slots: any[]}} input.contentMap
 * @param {Record<string, unknown>} input.site - `languages` is the edition's tag
 * @param {(call: {system: string, input: unknown}) => Promise<string>} input.generate
 * @param {Set<string>} input.written - slot keys the answers already wrote
 * @param {Set<string>} [input.hidden] - the entities of the pages the customer unticked (no button is sent there)
 */
async function planModelSlots({ contentMap, site, generate, written, hidden = new Set() }) {
  const { planWordpressContract } = await seeder('plan-wordpress-contract')
  const { result, calls, failed } = await planConcurrently(
    (ask) => planWordpressContract({ contentMap, site, generate: ask, hasInput: written, hidden }),
    generate
  )
  return { ...result, calls, failed }
}

/**
 * The second chance `planLines` asks for the lines its first pass left, as a callback that never throws: when it cannot be
 * asked (the model is gone, the time is up), it answers nothing and takes nothing off, so the first pass's answers already in
 * hand are written all the same and the failure is said — one failed call never costs the lines that came back.
 * @param {(call: {system: string, input: unknown}) => Promise<string>} generate
 * @param {Record<string, unknown>} site
 * @param {(error: unknown) => void} said
 */
const askAgain = (generate, site, said) => async (/** @type {any[]} */ slots) => {
  try {
    return await repairSlots({
      generate,
      site,
      slots: slots.map((slot) => ({
        key: slot.key,
        label: slot.label,
        sample: slot.sample,
        maxCharacters: slot.maxCharacters
      }))
    })
  } catch (error) {
    said(error)
    return { texts: {}, nulls: new Set() }
  }
}

/**
 * The one language the site is written in when it is not English (the single language question, D10), else null: several
 * languages, or English in any spelling, keep the source edition in English.
 * @param {unknown} languages - `site.languages`
 * @returns {string | null}
 */
export function soleOtherLanguage(languages) {
  if (!Array.isArray(languages) || languages.length !== 1) return null
  const tag = String(languages[0] ?? '').toLowerCase()
  return tag !== '' && !/^en(?:-|$)/.test(tag) ? tag : null
}

/**
 * The site block the source edition is planned with: the edition's own language, or the one language it is written in
 * (`sourceLanguage`, which the seeder's planner puts on the source edition's slots).
 * @param {Record<string, unknown>} site
 * @param {string} sourceTag
 * @param {string | null | undefined} writtenIn
 */
function writing(site, sourceTag, writtenIn) {
  return writtenIn
    ? { ...site, languages: [writtenIn], sourceLanguage: writtenIn }
    : { ...site, languages: [sourceTag] }
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
 *   posts for a site an opportunity built (`wo-content.js`), written into the demo posts without a model
 */
export function createWordpressEngine({
  models,
  applyFor,
  siteFile = null,
  siteReader = null,
  fetchImpl,
  realPictures = null,
  woContent = null
}) {
  /**
   * `bound`: a slot plan's card pictures (`copyPinsOf`), each card's own entity's. `copy`: the copy pins, whose card
   * names decide which offering photo each card takes (`fill-plan.mjs`), as on Joomla.
   */
  const pictures = async (ctx, real, bound = {}, copy = null) => {
    if (!realPictures || !siteFile || !ctx.contract) return null
    real ??= await realPictures.forSite({
      siteKey: ctx.siteKey,
      email: ctx.email,
      strict: true,
      signal: ctx.signal
    })
    if (!real) return null
    const apply = recordedDoor(ctx, applyFor(ctx.email, ctx.runId))
    const [{ loadContract }, door] = await Promise.all([
      seeder('apply-wordpress-contract'),
      seeder('wordpress-contract-door')
    ])
    const { contentMap, editions } = loadContract(seederDataDir(ctx.contract), ctx.contract.id)
    const inspect = async () => {
      const read = await door.inspectWordPressContract(apply, ctx.siteKey)
      if (!read.supported || !read.bound)
        throw new Error('the image phase requires a bound WordPress contract')
      return read.state
    }
    return writeContractPictures({
      ctx,
      real,
      realPictures,
      apply,
      siteFile,
      siteReader,
      inspect,
      contentMap,
      bound,
      copy,
      write: async ({ state, changes }) => {
        const result = await door.applyWordPressThroughContract({
          apply,
          siteKey: ctx.siteKey,
          state,
          writes: Object.entries(changes).map(([slot, value]) => ({ slot, value })),
          source: editions?.source?.language ?? 'en',
          slots: new Map(contentMap.slots.map((s) => [s.key, s]))
        })
        return new Set(result.skipped.map((r) => r.slot))
      }
    })
  }
  return {
    pictures,
    /**
     * 🔒 WHAT THE WORDS COST IS RECORDED HOWEVER THE BUILD ENDS (Sol review, 22/10/2026): a prepare that throws after its planner
     * ran, or a site that never came up, still says what was spent. `apply` records again on the same model, so its totals
     * replace these, never add to them.
     * @param {import('../brief-build.js').BriefContext} ctx
     */
    async prepare(ctx) {
      /** @type {{ text: any }} */
      const spent = { text: null }
      try {
        return await this.prepareWords(ctx, spent)
      } finally {
        recordTextUsage(ctx, spent.text)
      }
    },

    /**
     * @param {import('../brief-build.js').BriefContext} ctx
     * @param {{ text: any }} built - the build's text model, once there is one
     */
    async prepareWords(ctx, built) {
      if (!ctx.contract)
        throw new Error('this template is not sealed by a content contract, so its words stay as released')
      // A name left blank keeps the template's: the template's own company stands in for the address name (`withTemplateName`).
      ctx.normalized = withTemplateName(
        ctx.normalized,
        listOf(declaredCopy(ctx.contract.dir).demoCompanyNames)
      )
      const [{ loadContract, inputsFromSite, planContractWrites }, door, { text, image }] = await Promise.all(
        [seeder('apply-wordpress-contract'), seeder('wordpress-contract-door'), models()]
      )
      built.text = text ?? null
      const started = Date.now()
      const { manifest, contentMap, editions } = loadContract(seederDataDir(ctx.contract), ctx.contract.id)
      // A key the contract gives to two blocks of a page is two slots to the planner (`wp-duplicates.js`).
      const { map: planMap, repeats } = uniqueSlots(contentMap)
      // The pages of kinds the customer did not pick go once the site is up (`sweepWordPress` `unwanted`, which takes these too):
      // their words are not planned, so the model's time goes to the pages that stay.
      const contractPages = contentMap.entities
        .filter((e) => e.identity?.postType === 'page')
        .map((e) => ({ slug: String(e.identity.slug), entity: e.key }))
      // The pages the customer unticked in the standard set go by their id (`brief.pages`), beside the kinds of the older question.
      const unticked = slugsForIds(unpickedById(ctx.brief?.pages), contractPages)
      const skipPages = [
        ...unpickedPages(ctx.brief?.answers, contractPages).hide,
        ...contractPages.filter((page) => unticked.has(page.slug))
      ]
      const skipEntities = new Set(skipPages.map((page) => page.entity))
      const slotByKey = new Map(planMap.slots.map((s) => [s.key, s]))
      const pageSlug = (/** @type {string} */ entity) =>
        contentMap.entities.find((e) => e.key === entity)?.identity?.slug ?? null
      // The pictures are drawn beside the words, never instead of them, and never fail them — and only as many as
      // this template has demo pictures to replace.
      const groups = pictureGroups(
        contentMap.slots,
        () => true,
        (slot) => slot.entity === 'page-home'
      )
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
      const site = siteBlock(ctx.normalized)
      // One language that is not English: the source edition alone, written in it (D10).
      const writtenIn = soleOtherLanguage(site.languages)
      const passes = writtenIn
        ? {
            editions: editions
              ? door.chosenEditions(editions, []).editions
              : [{ slug: 'en', tag: 'en-us', source: true }],
            unknown: []
          }
        : editions
          ? door.chosenEditions(editions, site.languages)
          : {
              editions: [{ slug: 'en', tag: 'en-us', source: true }],
              unknown: site.languages.filter((l) => !/^en(?:-|$)/i.test(l))
            }
      for (const tag of passes.unknown)
        ctx.note(`this template has no ${tag} version, so that language was not written`)
      const source = passes.editions[0]
      /** The site block the source edition is planned with: its language, or the one language it is written in. */
      const sourceSite = writing(site, source.tag, writtenIn)

      // The slots an answer names are written exactly as it said them; the model never touches those.
      // 🔒 THE DESCRIPTION IS WRITTEN AS SAID ONLY IN THE SITE'S OWN LANGUAGE (TCH #1013, 13/10/2026): About typed in
      // Vietnamese for a site left in English put "Tiệm bánh gia đình ở Dubai" under the English <title> (JA Impact WP). A
      // description in another language than the site's feeds no slot as said; the model writes those in the site's language.
      const inputs = inputsFromSite(site)
      if (!aboutInLanguage(site.about, sourceSite.languages?.[0] ?? site.languages?.[0])) {
        delete inputs.tagline
        delete inputs['hero.paragraph']
      }
      const { writes: inputWrites } = planContractWrites(contentMap, inputs)
      // Opening hours the owner wrote are written as they wrote them in the source edition (English), where the contract names
      // no input for them; in any other edition, or when they were not written in English, the model says them in that language.
      const hoursSlot = ctx.normalized.hours
        ? contentMap.slots.find((slot) => slot.key === 'identity.contact.hours')
        : null
      if (
        hoursSlot &&
        /^[\x20-\x7E]+$/.test(ctx.normalized.hours) &&
        !inputWrites.some((w) => w.slot === hoursSlot.key)
      )
        inputWrites.push({
          slot: hoursSlot.key,
          value: String(ctx.normalized.hours).slice(0, hoursSlot.maxCharacters ?? 80),
          sourceOnly: true
        })
      // The profiles the owner linked go where the contract keeps a link for that network (`identity.social.<network>`), as they
      // wrote them, in the source edition only: the identity belongs to the site, not to an edition. A network the template has
      // no link for is not written anywhere.
      for (const [network, url] of Object.entries(ctx.normalized.social ?? {})) {
        const slot = contentMap.slots.find((s) => s.key === `identity.social.${network}` && s.type === 'url')
        if (slot && !inputWrites.some((w) => w.slot === slot.key))
          inputWrites.push({
            slot: slot.key,
            value: String(url).slice(0, slot.maxCharacters > 0 ? slot.maxCharacters : 300),
            sourceOnly: true
          })
      }
      // The page words an opportunity's build has a source for, written like an answer: the model never plans them
      // (`wo-copy-pins.js`), in the source edition only — the other editions' planners leave them too.
      const copyPins = await copyPinsOf(woContent, ctx, {
        cms: 'wordpress',
        contentMap,
        lang: sourceSite.languages?.[0] ?? 'en',
        pictures: (await reading)?.pictures
      })
      for (const [slot, value] of Object.entries(copyPins?.pins ?? {})) {
        const at = inputWrites.findIndex((w) => w.slot === slot)
        if (at >= 0) inputWrites.splice(at, 1)
        inputWrites.push({ slot, value, sourceOnly: true })
      }
      const written = new Set(inputWrites.map((w) => w.slot))
      // 🔒 A contact line of a kind nobody typed keeps the demo's words (11/10/2026): not planned, never taken off.
      const held = new Set(
        [...heldContactSlots(planMap.slots, ctx.normalized)].filter((key) => !written.has(key))
      )
      // 🔒 AN OPPORTUNITY'S BUILD HIDES NOTHING (product owner, 22/10/2026): a dish of the menu with no dish of the
      // restaurant, a price nobody collected, the template's testimonials take the fixed placeholders as pins above
      // (`section-fills.mjs`), and the sweep fills the template's dish items no slot covers (`wp-wo-fill.js`).
      // Nor are the pages the template ships to show its features (colour variants, sign-in, profile, error pages): nobody
      // visits them on a demo, in English or in the one language the site is written in.
      const wo = copyPins ?? (await woReading)
      if (wo) {
        const samples = await samplePagesOf(contractPages)
        for (const entity of samples) skipEntities.add(entity)
        // …and, never planned, they go with the unticked pages (`unwanted`): the Explore menu of JA Restaurant links its four
        // colour copies of the home page, demo prices and all (Sol review, 22/10/2026).
        for (const page of contractPages)
          if (samples.includes(page.entity) && !skipPages.includes(page)) skipPages.push(page)
        const left = planMap.slots.filter((slot) => samples.includes(slot.entity)).length
        if (left > 0) ctx.time('woSampleSlotsSkipped', left)
      }
      const standing = copyPins?.placeholders?.length ?? 0
      if (standing > 0) ctx.time('woPlaceholderSlots', standing)

      let plan = { changes: {}, pending: [], reasons: {}, planned: 0, calls: 0, failed: 0 }
      // About left blank keeps the template's words: no line, menu label or other word is planned from the name (`aboutGiven`),
      // except in a site written in one language the template has no words in (`writtenIn`): there is no demo text to keep in
      // it, as the EmDash tool's `rewritesIn` does. Read again by `apply` for the judge, the other words and the editions.
      const rewrites = described || Boolean(writtenIn)
      if (!text) ctx.note('no text model is set, so only the details you gave were written')
      else if (!rewrites) ctx.note(ABOUT_BLANK_NOTE)
      else {
        plan = await planModelSlots({
          contentMap:
            skipEntities.size > 0 || held.size > 0
              ? {
                  ...planMap,
                  slots: planMap.slots.filter((slot) => !skipEntities.has(slot.entity) && !held.has(slot.key))
                }
              : planMap,
          site: sourceSite,
          generate: firmGenerate(staged(text, 'planner'), budgetSignal(ctx.signal, ctx.deadlineAt)),
          written,
          hidden: skipEntities
        })
        if (plan.calls > 0 && plan.failed === plan.calls)
          ctx.note('the text model did not answer, so only the details you gave were written')
        else if (plan.failed > 0)
          ctx.note(`${plan.failed} part(s) of the text could not be written and keep the template’s words`)
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

      // Facts nobody gave never reach the site.
      const facts = factsOf(spokenOf(ctx.brief), ctx.normalized.contact, ctx.normalized.name)
      const { kept, dropped } = guardChanges(plan.changes, slotByKey, facts)
      if (dropped.length > 0)
        ctx.note(`${dropped.length} line(s) were left out because they stated facts you did not give`)

      // A second chance for every text line still wearing the template's words: pending, or left out for a fact.
      // What the model cannot write honestly even now is taken off the page, never left with another company's name.
      const left = [...new Set([...plan.pending, ...dropped.map((d) => d.key)])]
        .map((key) => slotByKey.get(key))
        .filter(
          (slot) =>
            slot &&
            slot.type === 'text' &&
            !written.has(slot.key) &&
            !held.has(slot.key) &&
            // A template button the planner could not translate keeps the demo's label: a second chance would rewrite it (K6).
            !['button-untranslated', 'void-no-contact'].includes(plan.reasons?.[slot.key]) &&
            typeof slot.sample === 'string'
        )
      const finalKept = { ...kept }
      /** @type {Set<string>} */
      let nothing = new Set()
      /** The lines the second pass said need facts nobody gave, and the ones refused only for the template's own facts. */
      let nulls = new Set()
      const ownFacts = new Set(dropped.filter((d) => TEMPLATE_OWN.test(d.reason)).map((d) => d.key))
      if (text && left.length > 0) {
        try {
          const second = await repairSlots({
            generate: firmGenerate(staged(text, 'repair'), budgetSignal(ctx.signal, ctx.deadlineAt)),
            site: sourceSite,
            slots: left.map((slot) => ({
              key: slot.key,
              label: slot.label,
              sample: slot.sample,
              maxCharacters: slot.maxCharacters ?? 200
            }))
          })
          const again = guardChanges(second.texts, slotByKey, facts)
          Object.assign(finalKept, again.kept)
          nulls = second.nulls
          for (const d of again.dropped) if (TEMPLATE_OWN.test(d.reason)) ownFacts.add(d.key)
          nothing = new Set([...second.nulls, ...again.dropped.map((d) => d.key)])
        } catch (error) {
          ctx.note(
            `the lines the first pass left could not be asked again: ${error instanceof Error ? error.message : error}`
          )
        }
      }
      if (nothing.size > MAX_DROPS) {
        const order = dropOrder(nothing, {
          sampleOf: (key) => String(slotByKey.get(key)?.sample ?? ''),
          names: demoNames(contentMap),
          nulls,
          ownFacts
        })
        ctx.note(
          `${nothing.size} lines had no honest replacement: the ${MAX_DROPS} naming the template’s company or repeating its facts were taken off first, the other ${nothing.size - MAX_DROPS} keep the template’s words`
        )
        nothing = new Set(order.slice(0, MAX_DROPS))
      }
      // 🔒 A NAME GIVEN WITH NO DESCRIPTION RENAMES THE DEMO COMPANY IN THE WORDS KEPT (D9), as on Joomla: every spelling the
      // template declares (`demoCompanyNames`, `<version>.copy.json`) in a line nobody wrote, never one that goes, wants
      // evidence or takes a detail the customer gave, never inside an address or a file (`joomla-demo-names.js`).
      const ownName = String(ctx.normalized.name ?? '').trim()
      if (ownName && nameAnswered(ctx.normalized) && String(ctx.brief?.about ?? '').trim() === '')
        Object.assign(
          finalKept,
          demoNameChanges({
            slots: planMap.slots.filter(
              (slot) =>
                !slot.requiresEvidence &&
                !skipEntities.has(slot.entity) &&
                !(slot.key in finalKept) &&
                !nothing.has(slot.key) &&
                !written.has(slot.key)
            ),
            valueOf: (slot) => String(slot.sample ?? ''),
            names: listOf(declaredCopy(ctx.contract.dir).demoCompanyNames),
            replacement: ownName
          })
        )
      /** The lines the contract door writes, and the ones only a block can take (a second block of a name). */
      /** @type {Record<string, string>} */
      const changes = {}
      /** @type {Array<{ slug: string, block: string, nth: number, value: string }>} */
      const duplicates = []
      for (const [key, value] of Object.entries(finalKept)) {
        const repeat = repeats.get(key)
        const slug = repeat ? pageSlug(repeat.entity) : null
        if (!repeat) changes[key] = value
        else if (slug) duplicates.push({ slug, block: repeat.block, nth: repeat.nth, value })
      }
      /** @type {Array<{ slug: string, block: string, nth: number, sample: string }>} */
      const drops = []
      for (const key of nothing) {
        const slot = slotByKey.get(key)
        const repeat = repeats.get(key)
        const slug = pageSlug(String(repeat?.entity ?? slot?.entity))
        const block = repeat?.block ?? slot?.target?.block
        if (slug && block && typeof slot?.sample === 'string')
          drops.push({ slug, block, nth: repeat?.nth ?? 1, sample: slot.sample })
      }
      // The blocks of the source edition planned to carry the customer's words, or to go, with the line that does it: a copy of
      // one in another language that has no honest words of its own even after its second chance goes too (`apply`), unless the
      // site refuses that line — then the source keeps the template's words there, and so does the copy.
      /** @type {Array<{ key: string, at: string }>} */
      const settled = []
      for (const key of [...Object.keys(finalKept), ...nothing, ...inputWrites.map((w) => w.slot)]) {
        const at = blockOf(key, repeats, slotByKey)
        if (at) settled.push({ key, at })
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
        contractId: manifest.id,
        rewrites,
        described,
        passes,
        source,
        writtenIn,
        inputWrites,
        changes,
        duplicates,
        drops,
        settled,
        pending: plan.pending.filter((key) => !(key in finalKept) && !nothing.has(key)),
        dropped: dropped.filter((d) => !(d.key in finalKept)).length,
        planned: plan.planned,
        pictures: art.drawn,
        groups,
        real,
        wo: await woReading,
        copyPins,
        // The dishes the sweep fills the template's dish items with: the pins' own, or, with no slot-role map, the brief's.
        woDishes:
          copyPins?.dishes ??
          ((await woReading)
            ? await sweepDishesOf(woContent, ctx, { lang: sourceSite.languages?.[0] ?? 'en' })
            : []),
        // The blocks the sweep hides, by page (`wp-hide.js`): none on an opportunity's build since 22/10/2026 (replace,
        // never remove); kept for the facts below and a build prepared before.
        hides: [],
        // The demo facts outside the slots, said with the restaurant's or hidden (`wp-facts.js`), by page or template part.
        facts: copyPins?.facts ?? [],
        // The picture model draws an empty hero, banner or background from the restaurant's own photographs (plan §8).
        drawDoor: real ? (image ?? null) : null,
        // The one text model of this build: `apply` asks it too, so the build's words are counted in one place.
        textModel: text ?? null,
        skipPages: skipPages.map((page) => page.slug)
      }
    },

    /**
     * @param {import('../brief-build.js').BriefContext} ctx
     * @param {Awaited<ReturnType<ReturnType<typeof createWordpressEngine>['prepare']>>} prepared
     */
    async apply(ctx, prepared) {
      // The model apply asked: prepare's, or — when prepare had none — the one apply got itself (its calls alone, so nothing is
      // counted twice).
      /** @type {{ text: any }} */
      const used = { text: prepared?.textModel ?? null }
      try {
        return await this.applyWords(ctx, prepared, used)
      } finally {
        recordTextUsage(ctx, used.text)
      }
    },

    /**
     * @param {import('../brief-build.js').BriefContext} ctx
     * @param {Awaited<ReturnType<ReturnType<typeof createWordpressEngine>['prepare']>>} prepared
     * @param {{ text: any }} [used] - the text model this apply asked, for `apply` to record
     */
    async applyWords(ctx, prepared, used = { text: null }) {
      let stagedPictureValues = {}
      /** What each placed picture is (`pictureReport` receipts): the dish items no slot covers read it. */
      let pictureReceipts = null
      if (prepared.real && realPictures && siteFile) {
        const staged = await pictures(
          ctx,
          prepared.real,
          prepared.copyPins?.pictures,
          prepared.copyPins ?? null
        )
        stagedPictureValues = staged?.values ?? {}
        pictureReceipts = staged?.receipts ?? null
        prepared.real = null
      }
      const [{ loadContract }, door, { doorOps }] = await Promise.all([
        seeder('apply-wordpress-contract'),
        seeder('wordpress-contract-door'),
        seeder('site-ops')
      ])
      const time = stopwatch(ctx)
      // About left blank (`prepared.rewrites`): the judge, the other words and the editions ask no model either.
      // One text model for the whole build, the one `prepare` asked: what the build's words cost is counted once, per stage.
      /** @type {Promise<{text: any, image?: any}> | null} */
      let ownModels = null
      const textModels =
        prepared.rewrites === false
          ? async () => ({ text: null, image: null })
          : () =>
              (ownModels ??= prepared.textModel
                ? Promise.resolve({ text: prepared.textModel })
                : models().then((got) => {
                    used.text = got?.text ?? null
                    return got
                  }))
      // Every apply id the writes name is kept on the row, so the whole Apply can be undone (`recordedDoor`); the install's own
      // language receipt, which the retire below writes under again, is kept apart.
      /** @type {Set<string>} */
      const reusedIds = new Set()
      const apply = recordedDoor(ctx, applyFor(ctx.email, ctx.runId), (id) => reusedIds.has(id))
      const siteKey = ctx.siteKey
      if (!ctx.contract) throw new Error('this template is not sealed by a content contract')
      const { contentMap, editions } = loadContract(seederDataDir(ctx.contract), ctx.contract.id)
      // How many blocks of each name the slots of a page write into: a later block of a name is a line of the page (`wp-leaves.js`).
      const slotCounts = slotCountsByPage(contentMap)
      const pageSlotted = (/** @type {string | null | undefined} */ slug) => slottedOn(slotCounts, slug)
      const extra = prepared.passes.editions.slice(1)
      const stop = new AbortController()
      const written = new Set(prepared.inputWrites.map((w) => w.slot))
      /**
       * The blocks of a page (its slug) or a template part (`part-<key>`) this build hides or writes a fact into
       * (`prepared.hides`, `prepared.facts`): settled by code, so no planner says them again.
       */
      const hidesOn = (/** @type {string} */ slug) =>
        [...(prepared.hides ?? []), ...(prepared.facts ?? [])].filter((h) =>
          'part' in h && h.part ? slug === `part-${h.part}` : h.page === slug
        )

      // What is left of the template's own company once the words are in — pages and menu labels only a business
      // like the template's could use — is judged now, beside the install of the words, from what the site shows
      // before any of them is written; the cutting waits for the words (`sweepWordPress` below).
      const entitySlugs = new Set(
        contentMap.entities.filter((e) => e.identity?.postType === 'page').map((e) => String(e.identity.slug))
      )
      const door1 = (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) =>
        apply({ siteKey, action, params })
      /** What the door holds under that address, or null when it holds nothing there or would not say. */
      const valueAt = (/** @type {Record<string, unknown>} */ params) =>
        door1('content.get', params)
          .then((/** @type {any} */ a) => (a?.ok === false ? null : a?.item?.value))
          .catch(() => null)
      /** A meta's words, or null when it says nothing worth saying again. */
      const wordsOf = (/** @type {unknown} */ v) =>
        typeof v === 'string' && v.trim().length >= 3 ? v.trim() : null

      // 🔒 A PAGE'S <title> AND DESCRIPTION ARE ITS WORDS TOO, WHEN THE THEME KEEPS THEM ITSELF. Measured 05/10/2026 (ledger
      // L16) on a JA template made with Apply: every page's `<title>` and description still sold the demo company. Such a
      // theme prints them from two metas per page named after itself, `<stylesheet with - as _>_document_title` and
      // `…_metadesc` (`wp-ja-kinetic` reads `wp_ja_kinetic_document_title` and `wp_ja_kinetic_metadesc` in its
      // `inc/extra.php`); no slot holds them, and the plugin's SEO door knows Yoast, Rank Math and AIOSEO only. The names
      // are the ones the site is wearing, read through the door: its stylesheet and, for a child theme, its parent
      // (`template`), whose code prints them — so every theme on that convention is reached and no other key is guessed at;
      // a page without the meta, or a site whose theme cannot be read, is left quietly. The description is no hidden tag
      // only: `wp-ja-kinetic` prints `_metadesc` as the visible sub-title under a shell page's heading (`inc/item-ids.php`),
      // so the model is told it is the page's description and sub-title.
      const themeMetas = (async () => {
        const names = await Promise.all(
          ['stylesheet', 'template'].map((key) => valueAt({ kind: 'option', key }))
        )
        const prefixes = [
          ...new Set(
            names
              .filter((n) => typeof n === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(n))
              .map((n) => String(n).replace(/-/g, '_'))
          )
        ]
        return prefixes.flatMap((prefix) => [
          { key: `${prefix}_document_title`, role: 'document title' },
          { key: `${prefix}_metadesc`, role: 'page description (sub-title)' }
        ])
      })()
      /**
       * The words a page prints from metas of its own: the heading some pages print over their content (`PAGE_HEADING`), the
       * excerpt under it (read with the page), and the theme's title and description.
       * @param {number} id
       * @param {unknown} excerpt
       */
      const metasOf = async (id, excerpt) => {
        const keys = await themeMetas
        const [heading, ...own] = await Promise.all(
          [PAGE_HEADING, ...keys.map((k) => k.key)].map((key) => valueAt({ kind: 'postmeta', id, key }))
        )
        return {
          heading: wordsOf(heading),
          excerpt: wordsOf(excerpt),
          own: keys.map((k, i) => ({ ...k, text: wordsOf(own[i]) })).filter((m) => m.text !== null)
        }
      }
      /** A page's metas as lines of the line map, for `planLines` (`meta-<slug>`). */
      const metaLines = (
        /** @type {{ heading: string | null, excerpt: string | null, own: Array<{ role: string, text: string | null }> }} */ m
      ) => [
        ...(m.heading ? [{ text: m.heading, block: 'page heading' }] : []),
        ...(m.excerpt ? [{ text: m.excerpt, block: 'page excerpt' }] : []),
        ...m.own.map((o) => ({ text: String(o.text), block: o.role }))
      ]
      const judging = (async () => {
        const { text: seed } = await textModels()
        if (!seed) return null
        // Made once a person is waiting on the site: these calls go before the ones still being made for other sites.
        const text = staged(seed.urgent?.() ?? seed, 'judge')
        const signal = AbortSignal.any([ctx.signal, stop.signal, AbortSignal.timeout(JUDGE_MS)])
        const answer = (/** @type {unknown} */ r) => {
          if (/** @type {any} */ (r)?.ok === false)
            throw new Error(String(/** @type {any} */ (r).message ?? 'refused'))
          return r
        }
        const read = (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) =>
          door1(action, params).then(answer)
        // A site always has pages: a listing with none is the site not answering yet, not a site with nothing to judge. It is
        // read again once, and said out loud when it is still empty, so a judgement is never silently made of nothing.
        let [pages, navs] = await Promise.all([
          listAll(read, 'page', true),
          listAll(read, 'wp_navigation', true)
        ])
        if (pages.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, LISTING_RETRY_MS))
          ;[pages, navs] = await Promise.all([
            listAll(read, 'page', true),
            listAll(read, 'wp_navigation', true)
          ])
        }
        if (pages.length === 0) throw new Error('the site listed no pages')
        const extraSlugs = prepared.passes.editions.filter((e) => !e.source).map((e) => e.slug)
        const ofEdition = (/** @type {string} */ slug) =>
          extraSlugs.some((x) => slug === x || slug.endsWith(`-${x}`))
        // The theme's parts (a sidebar's newsletter promise) carry words of their own, in the same kind of block, and
        // sometimes a menu written inside them (JA Kinetic WP's header).
        // A part the content map covers is written through its slots, so none of its words is planned again here (#139).
        const covered = partsInMap(contentMap)
        const partBodies = (
          await Promise.all(
            PARTS.filter((key) => !covered.has(key)).map(async (key) => {
              try {
                const answer = /** @type {any} */ (await read('content.get', { kind: 'templatePart', key }))
                const content = answer?.item?.content
                return typeof content === 'string' && content !== '' ? { slug: `part-${key}`, content } : null
              } catch {
                return null
              }
            })
          )
        ).filter((p) => p !== null)
        // The source edition's published pages: where a button of the site leads (`wp-buttons.js`).
        const ownPages = pages.filter((p) => p.status === 'publish' && !ofEdition(p.slug))
        const titleOf = (/** @type {{ title?: string, slug: string } | null} */ page) =>
          page ? plain(String(page.title ?? '')) || page.slug : null
        // 🔒 A button of a part is judged with the page it opens, and its label must name that page (TCH #1013, measured
        // 10/10/2026 on dev g59-ess-wp-full: "Become a subscriber" → /contact came back "Xem thực đơn").
        const partTargets = prepared.writtenIn
          ? partBodies
              .flatMap((p) => buttonTargets(p.content))
              .map((b) => ({
                ...b,
                target: titleOf(pageAt(b.href, ownPages))
              }))
          : []
        // 🔒 A button to a document of the demo company leads to the Contact page and says so (DEMO FILE LINKS, 10/10/2026); on
        // FULL a worded button that leads nowhere does too (PAGE-5, 11/10/2026), a header's or a footer's included: no slot
        // holds a part, so the seeder's rule for the content slots never reached them (`wp-buttons.js`). BLANK keeps them.
        const contactPage = ownPages.find((p) => pageKind(p.slug) === 'contact') ?? null
        const voids = prepared.described === true
        const bodies = [...ownPages, ...partBodies].map((p) => p.content ?? '')
        const moving = (/** @type {boolean} */ withVoids) =>
          bodies.reduce((n, body) => {
            const out = fileLinksToContact(body, { url: '#', label: 'x', voids: withVoids })
            return n + out.moved + out.left
          }, 0)
        const fileCount = moving(false)
        const voidCount = voids ? moving(true) - fileCount : 0
        const hasFiles = fileCount + voidCount > 0
        if (fileCount > 0 && !contactPage)
          ctx.note(
            'the buttons to a document of the template’s company keep their link: the site has no Contact page'
          )
        if (voidCount > 0 && !contactPage)
          ctx.note(
            `${voidCount} button(s) of the pages and parts that lead nowhere keep the template’s label: the site has no Contact page to send them to`
          )
        // The template's own contact label: a button that leads to Contact, else a button that names contact, else the
        // page's title (`template-buttons.mjs` contactLabel, the seeder's rule for the content slots).
        const { contactLabel } = await seeder('template-buttons')
        const allButtons = bodies.flatMap((body) => buttonsIn(body))
        const contactWords = contactPage
          ? contactLabel({
              toContact: allButtons
                .filter((b) => b.kind === 'page' && pageAt(b.href, ownPages) === contactPage)
                .map((b) => b.text),
              labels: allButtons.map((b) => b.text),
              fallback: titleOf(contactPage)
            })
          : null
        // Only the menu labels are judged: no page is ever taken off but the ones the customer unticked (TCH #1013).
        const labels = [
          ...new Set([
            ...navs
              .filter((n) => n.status === 'publish' && n.content !== undefined && !ofEdition(n.slug))
              .flatMap((n) => navLabels(n.content ?? '')),
            ...partBodies.flatMap((p) => navLabels(p.content)),
            // In the site's one language the buttons of the parts too, which no other words reach (LANG-2, `buttonLabels`),
            // and the titles of the pages they open, so each has a name in that language to be held to (`holdTargets`).
            ...(prepared.writtenIn
              ? [
                  ...partBodies.flatMap((p) => buttonLabels(p.content)),
                  ...partTargets.flatMap((b) => (b.target ? [b.target] : [])),
                  // The pages the long buttons of the pages and parts open too (the line pass, `toldWhere`).
                  ...[...ownPages, ...partBodies].flatMap((p) =>
                    staticLines(p.content ?? '').flatMap((line) => {
                      const target = line.href ? titleOf(pageAt(line.href, ownPages)) : null
                      return target ? [target] : []
                    })
                  ),
                  ...(hasFiles && contactPage ? [String(titleOf(contactPage))] : [])
                ]
              : [])
          ])
        ]
        const judgement = judgeSite(
          text,
          {
            name: ctx.normalized.name,
            about: briefForJudges(ctx.brief),
            sector: ctx.normalized.sector ?? null
          },
          // 🔒 A site written in one language other than the source's has every menu label written in it: the labels are no
          // slot of the contract, so nothing else reaches them (TCH #1013, dev tamq-8w-bizwp 08/10/2026).
          {
            labels,
            language: prepared.writtenIn ? languageName(prepared.writtenIn) : null,
            locale: prepared.writtenIn ?? null,
            note: ctx.note,
            targets: Object.fromEntries(partTargets.map((b) => [b.text, targetName(b.href, ownPages)]))
          },
          signal
        )
          .then((judged) => {
            ctx.time('judgeRelabelled', judged.relabel.size)
            const { held, unsure } = holdTargets(judged.relabel, partTargets, {
              language: Boolean(prepared.writtenIn)
            })
            if (held.length > 0)
              ctx.note(
                `${held.length} header or footer button label(s) named a page they do not open and take that page's name instead (${held.join(', ')})`
              )
            if (unsure.length > 0)
              ctx.note(
                `${unsure.length} header or footer button label(s) may not name the page they open: that page has no name in the site's language (${unsure.join(', ')})`
              )
            return judged
          })
          .catch((error) => {
            ctx.note(
              `the template's own menu labels could not be judged: ${error instanceof Error ? error.message : error}`
            )
            return { relabel: new Map() }
          })
        // The words no slot names — a heading on the News page, a contact form for construction quotes — are planned
        // like slots, beside the judgement and the writing of the contract (`wp-leaves.js`).
        const sourcePages = pages.filter(
          (p) => p.status === 'publish' && p.content !== undefined && !ofEdition(p.slug)
        )
        // The template's showcase keeps its content and URLs (`showcasePages`): its words are not planned; its navigation was
        // put away at provisioning.
        const showcase = new Set(showcasePages(sourcePages, entitySlugs).map((p) => p.slug))
        const kept = sourcePages.filter((p) => !showcase.has(p.slug))
        // 🔒 THE KIT AND SYSTEM PAGES KEEP THE TEMPLATE'S CONTENT (K3, TCH #1013): typography, the error and offline pages, the
        // login forms are never said again for the business; in a site written in another language they are translated, and so
        // is the showcase, which stays as released in the template's language only.
        const kit = new Set(kept.filter((p) => isKitPage(p)).map((p) => p.slug))
        const translated = [
          ...kept.filter((p) => kit.has(p.slug)),
          ...sourcePages.filter((p) => showcase.has(p.slug))
        ]
        // Every published form too: a theme file draws a form by its title (JA Essence's newsletter, `[contact-form-7
        // title="Newsletter"]` in a pattern), which no id in the pages names (LANG-2, measured 11/10/2026 on dev g58-ess-wp-full).
        const listedForms = await listAll(read, 'wpcf7_contact_form', false).catch(() => [])
        const formIds = new Set([
          ...[...kept, ...partBodies].flatMap((p) => formIdsIn(p.content ?? '')),
          ...listedForms.filter((f) => f.status === 'publish').map((f) => f.id)
        ])
        // 🔒 A FORM THAT CANNOT BE READ COSTS ITS OWN LINES ONLY (LANG-2, measured 10/10/2026 on dev, JA Essence WordPress
        // 1.0.10): the Contact page embeds `[contact-form-7 id="65" title="Contact"]`, Contact Form 7 draws it by its title, and
        // id 65 is a picture with no `_form` meta. The refusal used to reject this whole judgement, so a Vietnamese site kept
        // every English menu label, page title and line. Such a form keeps its words, and that is said.
        const forms = (
          await Promise.all(
            [...formIds].map(async (id) => {
              try {
                const meta = /** @type {any} */ (
                  await read('content.get', { kind: 'postmeta', id, key: '_form' })
                )
                return typeof meta?.item?.value === 'string'
                  ? { id, lines: formLines(meta.item.value), labels: formLabels(meta.item.value) }
                  : null
              } catch (error) {
                ctx.note(
                  `the words of form ${id} could not be read and keep the template’s words: ${error instanceof Error ? error.message : error}`
                )
                return null
              }
            })
          )
        ).filter((f) => f !== null)
        // The heading some pages print from a meta of their own and the sentence under it (the excerpt) are the template's words
        // too, in no slot and no block: the News page said "News & engineering notes" over a bakery's posts. So are the title
        // and the description the theme keeps (`themeMetas`). Read beside the forms, said again like the other lines, written
        // back where they stand.
        const metas = (
          await Promise.all(
            kept
              .filter((p) => !ofEdition(p.slug))
              .map(async (p) => {
                const post = /** @type {any} */ (
                  await read('content.get', { kind: 'post', id: p.id }).catch(() => null)
                )
                return { id: p.id, slug: p.slug, ...(await metasOf(p.id, post?.item?.post_excerpt)) }
              })
          )
        ).filter((m) => m.heading !== null || m.excerpt !== null || m.own.length > 0)
        const site = writing(siteBlock(ctx.normalized), prepared.source.tag, prepared.writtenIn)
        const facts = factsOf(spokenOf(ctx.brief), ctx.normalized.contact, ctx.normalized.name)
        // The other words get their own budget (`WORDS_MS`); the judge keeps its short one.
        const words = AbortSignal.any([ctx.signal, stop.signal, AbortSignal.timeout(WORDS_MS)])
        const generate = firmGenerate(staged(text, 'planLines'), words)
        // 🔒 In the site's one language the labels of every page and form are translated too (LANG-2, `labelLines`,
        // `formLabels`): the words no rewrite takes because they are not a business's sentences.
        const translatedSlugs = new Set(translated.map((p) => p.slug))
        const kitSaid = prepared.writtenIn
          ? translateKitLines({
              pages: [
                ...translated.map((p) => ({
                  slug: p.slug,
                  lines: [
                    ...ownLines(p.content ?? '', ctx.normalized, staticLines, pageSlotted(p.slug)),
                    ...ownLines(p.content ?? '', ctx.normalized, labelLines, pageSlotted(p.slug))
                  ]
                })),
                ...sourcePages
                  .filter((p) => !translatedSlugs.has(p.slug))
                  .map((p) => ({
                    slug: p.slug,
                    lines: ownLines(p.content ?? '', ctx.normalized, labelLines, pageSlotted(p.slug))
                  })),
                ...forms.map((f) => ({ slug: `form-${f.id}`, lines: f.labels })),
                ...metas
                  .filter((m) => kit.has(m.slug))
                  .map((m) => ({ slug: `meta-${m.slug}`, lines: metaLines(m) })),
                // The social buttons of the parts and the ones that lead nowhere: translated, never rewritten (K6).
                {
                  slug: 'part-buttons',
                  lines: partBodies.flatMap((p) => buttonWords(p.content)).map((text) => ({ text }))
                },
                // The template's contact label, for a button to a document of the demo company (or, on FULL, to nowhere)
                // that now leads to the Contact page.
                ...(hasFiles && contactWords
                  ? [{ slug: 'contact-label', lines: [{ text: contactWords }] }]
                  : [])
              ],
              locale: prepared.writtenIn,
              model: text,
              signal: words,
              note: ctx.note
            })
          : Promise.resolve([])
        // In the site's one language the named lines of the parts too, which no other words reach (LANG-2, `namedRuns`):
        // under their own slug, so the sweep writes them back as runs and never as the part's unnamed lines. Their identity
        // tokens are masked while the model writes them, and put back after (`wp-runs.js`).
        const runs = maskRuns(
          prepared.writtenIn
            ? partBodies.map((p) => ({ slug: p.slug.replace(/^part-/, 'run-'), lines: namedRuns(p.content) }))
            : []
        )
        const runOf = new Map(runs.runs.map((r) => [r.masked, r]))
        /** The answers for masked runs with their masks put back where the model wrote the name or a year instead. */
        const remasked = (/** @type {Record<string, string>} */ changes, /** @type {any} */ slotOf) =>
          Object.fromEntries(
            Object.entries(changes).map(([key, value]) => {
              const sample = typeof slotOf === 'function' ? slotOf(key)?.sample : slotOf.get(key)?.sample
              const run = runOf.get(String(sample ?? ''))
              return [key, run ? remask(String(value), run.tokens, { name: ctx.normalized.name }) : value]
            })
          )
        /** The button lines planned below that open a page of the site: the title of that page, by slug and text. */
        /** @type {Map<string, string>} */
        const buttonPages = new Map()
        /** A line of a body, told where it leads when it is a button (`staticLines` `href`). */
        const toldWhere = (
          /** @type {string} */ slug,
          /** @type {{ text: string, block: string, href?: string }} */ line
        ) => {
          if (!line.href) return line
          const target = titleOf(pageAt(line.href, ownPages))
          if (target) buttonPages.set(`${slug}\u0000${line.text}`, target)
          return {
            text: line.text,
            block: `${line.block} that opens ${targetName(line.href, ownPages)}; its label names where it leads`
          }
        }
        const said = planLines({
          pages: [
            ...[...kept.filter((p) => !kit.has(p.slug)), ...partBodies].map((p) => ({
              slug: p.slug,
              // What the sweep hides (`prepared.hides`) is not said again: nobody reads it.
              lines: ownLines(
                shownOnly(p.content ?? '', hidesOn(p.slug)),
                ctx.normalized,
                staticLines,
                p.slug.startsWith('part-') ? undefined : pageSlotted(p.slug)
              ).map((line) => toldWhere(p.slug, line))
            })),
            ...runs.pages,
            ...metas
              .filter((m) => !kit.has(m.slug))
              .map((m) => ({ slug: `meta-${m.slug}`, lines: metaLines(m) }))
          ],
          forms,
          language: prepared.source.slug,
          name: ctx.normalized.name,
          plan: async (map) => {
            const planned = await planModelSlots({ contentMap: map, site, generate, written: new Set() })
            if (planned.failed > 0)
              ctx.note(
                `${planned.failed} part(s) of the other words of the pages could not be written and keep the template’s words`
              )
            return planned
          },
          repair: askAgain(generate, site, (error) =>
            ctx.note(
              `the other words of the pages the first pass left could not be asked again: ${error instanceof Error ? error.message : error}`
            )
          ),
          guard: (changes, slotOf) => guardChanges(remasked(changes, slotOf), slotOf, facts)
        }).catch((error) => {
          ctx.note(
            `the other words of the pages could not be written: ${error instanceof Error ? error.message : error}`
          )
          return { lines: [], forms: new Map() }
        })
        const own = await said
        // 🔒 A run whose answer lost a token is asked again, then translated, then said; never dropped in silence (`wp-runs.js`).
        if (runs.runs.length > 0) {
          const finished = await finishRuns({
            runs: runs.runs,
            said: own.lines,
            name: ctx.normalized.name,
            note: ctx.note,
            retry: async (open) => {
              const slots = open.map((run, i) => ({
                key: `run.${i + 1}`,
                label: `${run.slug.replace(/^run-/, '')} of the site — ${run.block.replace(/^core\//, '')}, keep ${run.tokens.map((_, n) => `⟦${n + 1}⟧`).join(' ')} exactly as written, each once`,
                sample: run.masked,
                maxCharacters: Math.max(40, Math.ceil(run.masked.length * 1.5))
              }))
              const answer = await askAgain(generate, site, () => {})(slots)
              const slotOf = new Map(slots.map((slot) => [slot.key, slot]))
              const { kept } = guardChanges(remasked(answer.texts, slotOf), slotOf, facts)
              return new Map(
                open.flatMap((run, i) => (`run.${i + 1}` in kept ? [[run, kept[`run.${i + 1}`]]] : []))
              )
            },
            translate: async (open) => {
              const said = await translateKitLines({
                pages: [{ slug: 'runs', lines: open.map((run) => ({ text: run.masked })) }],
                locale: String(prepared.writtenIn),
                model: text,
                signal: words,
                note: ctx.note
              })
              const byText = new Map(said.map((line) => [line.text, line.value]))
              return new Map(
                open.flatMap((run) => (byText.has(run.masked) ? [[run, String(byText.get(run.masked))]] : []))
              )
            }
          })
          own.lines = [...own.lines.filter((line) => !line.slug.startsWith('run-')), ...finished]
        }
        /** The translated lines: a form's go into its edits (`form-<id>`), a page's beside the page's other lines. */
        const kitLines = []
        /** @type {Map<string, string>} the parts' social and void button labels, translated */
        const buttonSaid = new Map()
        /** @type {string | null} */
        let contactSaid = null
        for (const line of await kitSaid) {
          const form = /^form-(\d+)$/.exec(line.slug)
          if (line.slug === 'part-buttons') buttonSaid.set(line.text, line.value)
          else if (line.slug === 'contact-label') contactSaid = line.value
          else if (!form) kitLines.push(line)
          else {
            const id = Number(form[1])
            const edits = own.forms.get(id) ?? new Map()
            if (!edits.has(line.text)) own.forms.set(id, edits.set(line.text, line.value))
          }
        }
        const judged = await judgement
        // The parts' social and void buttons take their translation, the way the judge's labels are written (`relabelButtons`).
        for (const [from, to] of buttonSaid) if (!judged.relabel.has(from)) judged.relabel.set(from, to)
        // 🔒 A planned button label that names nothing of the page it opens takes that page's name (`wp-buttons.js`).
        let held = 0
        let unsure = 0
        for (const line of own.lines) {
          const target = buttonPages.get(`${line.slug}\u0000${line.text}`)
          if (!target || typeof line.value !== 'string' || line.value === '') continue
          const name = prepared.writtenIn ? (judged.relabel.get(target) ?? null) : target
          if (sharesWord(line.value, target) || (name && sharesWord(line.value, name))) continue
          if (!name) {
            unsure += 1
            continue
          }
          line.value = name
          held += 1
        }
        if (held > 0)
          ctx.note(
            `${held} button label(s) of the pages named a page they do not open and take that page's name instead`
          )
        if (unsure > 0)
          ctx.note(
            `${unsure} button label(s) of the pages may not name the page they open: that page has no name in the site's language`
          )
        // 🔒 DEMO FILE LINKS: the Contact page's address, and its name in the site's language.
        const contactSays = contactWords
          ? prepared.writtenIn
            ? (judged.relabel.get(contactWords) ?? contactSaid)
            : contactWords
          : null
        if (hasFiles && contactPage && !contactSays)
          ctx.note(
            'the buttons to a document of the template’s company or to nowhere keep their link: the Contact page has no name in the site’s language'
          )
        const files =
          hasFiles && contactPage && contactSays
            ? { url: contactPage.url ?? `/${contactPage.slug}/`, label: contactSays, voids }
            : undefined
        return {
          ...judged,
          ...(files ? { files } : {}),
          ...own,
          lines: [...own.lines, ...kitLines],
          meta: metas
        }
      })().catch((error) => {
        ctx.note(
          `the template's own pages could not be judged: ${error instanceof Error ? error.message : error}`
        )
        return null
      })

      // The extra languages are planned from what each edition's pages say on the site today, so they wait
      // for the site — and for nothing else here, so they run beside the seal below.
      //
      // 🔒 EVERY LANGUAGE ASKED FOR GETS THE SOURCE'S TREATMENT, IN ITS OWN WORDS. Measured 05/10/2026 (ledger L15) on a
      // two-language `tracy-business/wp7` site made with Apply: the Vietnamese About page kept a whole demo section — its heading
      // and intro, an industrial park and five cities — because three things were done for the source edition only: the second
      // and third blocks of a name (the contract door writes the first; `wp-duplicates.js`), the second chance for the lines the
      // first pass left (`repair.js`, what even that cannot write goes), and the lines no slot names (`wp-leaves.js`). The copy
      // was only swept, and a section one written line reached is the customer's and is kept whole. So an edition's map is made
      // unique the way the source's is, each repeated block shown its OWN words (the door reads the first block of a name only),
      // and its first pass is the same concurrent batches as before — no extra call; what it leaves gets a second chance, and
      // the edition's other lines are planned, both beside the writes (below), never in front of them.
      /** @type {{ writes: Array<{slot: string, value: string, locale: string}>, carried: Map<string, Set<string>>, edits: EditionEdit[], left: EditionLeft[] }} */
      const none = { writes: [], carried: new Map(), edits: [], left: [] }
      const planExtra = async () => {
        const { text: seed } = await textModels()
        const text = seed ? staged(seed.urgent?.() ?? seed, 'editions') : seed
        if (!text) {
          if (prepared.rewrites !== false)
            ctx.note('no text model is set, so the extra languages keep the template’s words')
          return none
        }
        const ops = doorOps({ apply, siteKey, applyId: 'read-only' })
        const signal = AbortSignal.any([ctx.signal, stop.signal, AbortSignal.timeout(EDITIONS_MS)])
        const generate = firmGenerate(text, signal)
        // Each edition's pages, once, all of them at once.
        /** @type {Map<number, string | null>} */
        const contents = new Map()
        const ids = [...new Set(extra.flatMap((pass) => Object.values(editions.locales[pass.slug].ids)))]
        await pool(
          ids.map((id) => async () => {
            contents.set(id, await ops.readContent(id))
          }),
          READ_AT_ONCE
        )
        const facts = factsOf(spokenOf(ctx.brief), ctx.normalized.contact, ctx.normalized.name)
        const out = []
        /** @type {Map<string, Set<string>>} the slots each extra edition's pages carry */
        const carried = new Map()
        /** @type {EditionEdit[]} */
        const edits = []
        /** @type {EditionLeft[]} */
        const left = []
        await Promise.all(
          extra.map(async (pass) => {
            const view = await door.editionContentMap(
              contentMap,
              editions,
              pass.slug,
              async (id) => contents.get(id) ?? null
            )
            if (view.missing.length > 0)
              ctx.note(
                `the ${pass.tag} version lacks ${view.missing.length} block(s) the template ships elsewhere; they keep its words`
              )
            const inView = new Set(view.contentMap.slots.map((s) => s.key))
            carried.set(pass.slug, inView)
            // The answers' own slots go into every language: a name is a name in each of them.
            for (const w of prepared.inputWrites)
              if (inView.has(w.slot) && !w.sourceOnly)
                out.push({ slot: w.slot, value: w.value, locale: pass.slug })
            // A key the contract gives to two blocks is two slots here too, each shown what ITS block says in this language;
            // a repeated block the copy lacks, or one that is no line of text, is not planned.
            const pageIds = editions.locales[pass.slug].ids
            const { map: unique, repeats } = uniqueSlots(view.contentMap)
            const slots = unique.slots.flatMap((slot) => {
              const repeat = repeats.get(slot.key)
              if (!repeat) return [slot]
              const sample = blockText(contents.get(pageIds[repeat.entity]), repeat.block, repeat.nth)
              return slot.type === 'text' && repeat.attr === 'content' && sample !== null
                ? [{ ...slot, sample }]
                : []
            })
            // A contact line of a kind nobody typed keeps the demo's words in this language too.
            const heldHere = heldContactSlots(slots, ctx.normalized)
            const map = { ...unique, slots: slots.filter((slot) => !heldHere.has(slot.key)) }
            const slotOf = new Map(map.slots.map((slot) => [slot.key, slot]))
            const plan = await planModelSlots({
              contentMap: map,
              site: { ...siteBlock(ctx.normalized), languages: [pass.tag] },
              generate,
              written
            })
            const { kept, dropped } = guardChanges(plan.changes, slotOf, facts)
            /** Where a slot of this edition stands: its copy's id, and the block the source counts it as. */
            const placeOf = (/** @type {string} */ key) => {
              const at = blockOf(key, repeats, slotOf)
              const id = pageIds[repeats.get(key)?.entity ?? slotOf.get(key)?.entity]
              if (!at || !id) return null
              const [, block, nth] = at.split('\u0000')
              return { id, block, nth: Number(nth), at }
            }
            for (const [slot, value] of Object.entries(kept)) {
              const place = repeats.has(slot) ? placeOf(slot) : null
              if (!repeats.has(slot)) out.push({ slot, value, locale: pass.slug })
              else if (place)
                edits.push({ edition: pass.slug, id: place.id, block: place.block, nth: place.nth, value })
            }
            if (plan.failed > 0)
              ctx.note(`${plan.failed} part(s) of the ${pass.tag} version could not be written`)
            // What still wears the template's words: pending, or stopped for a fact nobody gave. Its second chance waits for
            // nothing but this plan.
            const unwritten = [...new Set([...plan.pending, ...dropped.map((d) => d.key)])].flatMap((key) => {
              const slot = slotOf.get(key)
              const place = placeOf(key)
              return slot &&
                place &&
                slot.type === 'text' &&
                !written.has(slot.key) &&
                typeof slot.sample === 'string' &&
                slot.sample.trim() !== ''
                ? [{ slot, place }]
                : []
            })
            if (unwritten.length > 0) left.push({ pass, slots: unwritten, whole: plan.failed === 0 })
          })
        )
        return { writes: out, carried, edits, left }
      }
      const planning = extra.length > 0 ? time('editionsMs', planExtra) : Promise.resolve(none)
      planning.catch(() => {})

      // An edition's second chance: what it writes goes in by block, during the sweep; a line it answers null for goes. A line
      // it answered nothing for — left out of the answer, or the whole reply unreadable — goes too when its source
      // counterpart now carries the customer's words or went (`prepared.settled`): the source says the block is the
      // customer's to fill and the edition has no honest words for it. Never a lone interface line ("01"), never when any
      // call of the edition's first pass failed or the second chance itself failed or ran out of time (a model gone wrong
      // takes nothing off, it keeps the template's words and is said), and never more than MAX_DROPS blocks of one language.
      // A plan that failed outright was said where it is awaited (below), and leaves nothing to ask again.
      const finishing = planning
        .catch(() => none)
        .then(async ({ left }) => {
          /** @type {{ edits: EditionEdit[], drops: EditionDrop[], silent: Array<EditionDrop & { at: string }> }} */
          const done = { edits: [], drops: [], silent: [] }
          if (left.length === 0) return done
          const { text: seed } = await textModels()
          const text = seed ? staged(seed.urgent?.() ?? seed, 'editions') : null
          const signal = AbortSignal.any([ctx.signal, stop.signal, AbortSignal.timeout(JUDGE_MS)])
          const facts = factsOf(spokenOf(ctx.brief), ctx.normalized.contact, ctx.normalized.name)
          await Promise.all(
            left.map(async ({ pass, slots, whole }) => {
              /** @type {Record<string, string>} */
              let texts = {}
              /** @type {Set<string>} */
              let nulls = new Set()
              /** Whether the second chance came back at all: only then is its silence about a line an answer. */
              let answered = false
              if (text)
                try {
                  const second = await repairSlots({
                    generate: firmGenerate(text, signal),
                    site: { ...siteBlock(ctx.normalized), languages: [pass.tag] },
                    slots: slots.map(({ slot }) => ({
                      key: slot.key,
                      label: slot.label,
                      sample: slot.sample,
                      maxCharacters: slot.maxCharacters ?? 200
                    }))
                  })
                  const again = guardChanges(
                    second.texts,
                    new Map(slots.map(({ slot }) => [slot.key, slot])),
                    facts
                  )
                  texts = again.kept
                  nulls = new Set([...second.nulls, ...again.dropped.map((d) => d.key)])
                  answered = true
                } catch (error) {
                  ctx.note(
                    `the ${pass.tag} lines the first pass left could not be asked again: ${error instanceof Error ? error.message : error}`
                  )
                }
              for (const { slot, place } of slots) {
                const where = { edition: pass.slug, id: place.id, block: place.block, nth: place.nth }
                if (slot.key in texts) done.edits.push({ ...where, value: texts[slot.key] })
                else if (nulls.has(slot.key)) done.drops.push({ ...where, sample: slot.sample })
                // Its silence decides once the source's words are in: only a source line the site took settles the block.
                else if (whole && answered && !isInterface(slot.sample))
                  done.silent.push({ ...where, sample: slot.sample, at: place.at })
              }
            })
          )
          return done
        })
        .catch((error) => {
          ctx.note(
            `the extra languages’ second chance could not be asked: ${error instanceof Error ? error.message : error}`
          )
          return { edits: [], drops: [], silent: [] }
        })

      // The words no slot names on each extra language's pages, planned in that language from the copies as the release made
      // them (read by id: a site that runs Polylang lists its source edition only), beside the writes.
      const editionPages = editionPagesOf(ctx.contract, prepared.passes.editions, ctx.note)
      /** @type {{ lines: Array<{ id?: number, slug: string, text: string, value: string | null }>, meta: Array<{ id: number, slug: string, heading: string | null, excerpt: string | null, own: Array<{ key: string, role: string, text: string | null }> }> }} */
      const unsaid = { lines: [], meta: [] }
      const editionSaying = (async () => {
        /** @type {typeof unsaid} the lines of the copies' bodies (by id) and of their metas (under `meta-<slug>`) */
        const out = { lines: [], meta: [] }
        if (extra.length === 0 || editionPages.length === 0) return out
        const { text: seed } = await textModels()
        if (!seed) return out
        const text = staged(seed.urgent?.() ?? seed, 'editions')
        const signal = AbortSignal.any([ctx.signal, stop.signal, AbortSignal.timeout(JUDGE_MS)])
        const generate = firmGenerate(text, signal)
        const facts = factsOf(spokenOf(ctx.brief), ctx.normalized.contact, ctx.normalized.name)
        // The copies of pages every site keeps or the contract names; a copy of the template's showcase stays as released, like
        // its page.
        const wanted = editionPages.filter(
          (p) => p.base !== null && (entitySlugs.has(p.base) || PROTECTED.has(p.base))
        )
        const read = await pool(
          wanted.map((page) => async () => {
            const item = /** @type {any} */ (await door1('content.get', { kind: 'post', id: page.id }))?.item
            return item?.post_type === 'page' &&
              item.post_name === page.slug &&
              item.post_status === 'publish' &&
              typeof item.post_content === 'string'
              ? { page, content: String(item.post_content), metas: await metasOf(page.id, item.post_excerpt) }
              : null
          }),
          READ_AT_ONCE
        )
        const copies = read.flatMap((r) => (r.ok && r.value ? [r.value] : []))
        // Each language on its own: one that fails costs its own lines, never another's.
        await Promise.all(
          extra.map(async (pass) => {
            try {
              /** @type {Map<string, number>} a page of the line map → the copy it is */
              const named = new Map()
              /** The copies' metas with words in them, under the copy's name in the line map. */
              const metas = []
              const pages = copies
                .filter((c) => c.page.edition === pass.slug)
                .map(({ page, content, metas: m }) => {
                  const own = `${page.base}-${pass.slug}`
                  const slug = named.has(own) ? `${own}-${page.id}` : own
                  named.set(slug, page.id)
                  if (m.heading !== null || m.excerpt !== null || m.own.length > 0)
                    metas.push({ id: page.id, slug, ...m })
                  return {
                    slug,
                    lines: ownLines(content, ctx.normalized, staticLines, pageSlotted(page.base))
                  }
                })
              const site = { ...siteBlock(ctx.normalized), languages: [pass.tag] }
              const said = await planLines({
                pages: [...pages, ...metas.map((m) => ({ slug: `meta-${m.slug}`, lines: metaLines(m) }))],
                forms: [],
                language: pass.slug,
                name: ctx.normalized.name,
                plan: async (map) => {
                  const planned = await planModelSlots({
                    contentMap: map,
                    site,
                    generate,
                    written: new Set()
                  })
                  if (planned.failed > 0)
                    ctx.note(
                      `${planned.failed} part(s) of the other words of the ${pass.tag} pages could not be written and keep the template’s words`
                    )
                  return planned
                },
                repair: askAgain(generate, site, (error) =>
                  ctx.note(
                    `the ${pass.tag} lines the first pass left could not be asked again: ${error instanceof Error ? error.message : error}`
                  )
                ),
                guard: (changes, slotOf) => guardChanges(changes, slotOf, facts)
              })
              for (const line of said.lines) {
                const id = named.get(line.slug)
                if (id !== undefined)
                  out.lines.push({ id, slug: line.slug, text: line.text, value: line.value })
                // A meta's line is found by its page's name, as the source's are (`sweepWordPress` `meta`).
                else if (line.slug.startsWith('meta-')) out.lines.push(line)
              }
              out.meta.push(...metas)
            } catch (error) {
              ctx.note(
                `the other words of the ${pass.tag} pages could not be written: ${error instanceof Error ? error.message : error}`
              )
            }
          })
        )
        return out
      })().catch((error) => {
        ctx.note(
          `the other words of the other languages’ pages could not be written: ${error instanceof Error ? error.message : error}`
        )
        return unsaid
      })

      // The pictures' shape is read from the site's public address and cut here: no write, so it runs beside everything.
      // The uploads are writes, and a site takes ONE write at a time, so they wait for the demo trim (below).
      // The customer's own photographs go where the planner puts them, the demo's shape read the same way.
      const skipped = new Set(prepared.skipPages ?? [])
      const realShaping =
        prepared.real && siteFile && realPictures
          ? time('shapeMs', () =>
              shapeReal({
                real: prepared.real,
                contentMap,
                cms: 'wordpress',
                pages: { keepRoute: (route) => !skipped.has(route), homeRoute: 'home' },
                siteFile: siteFile(siteKey),
                siteBytes: async (file) =>
                  siteReader ? ((await siteReader(siteKey))?.bytes(file) ?? null) : null,
                realPictures,
                note: ctx.note,
                time: ctx.time,
                drawDoor: prepared.drawDoor ?? null,
                signal: ctx.signal,
                bound: prepared.copyPins?.pictures ?? {},
                copy: prepared.copyPins ?? null
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

      /** @type {any} */
      let state
      try {
        const seal = await time('inspectMs', () => door.inspectWordPressContract(apply, siteKey))
        if (!seal.bound)
          throw new Error(
            seal.supported
              ? 'the site is not bound to its content contract yet'
              : 'this site’s Claude Cowork plugin has no content contract door'
          )
        state = seal.state
        // Demo posts first, so a listing the customer opens right after the build shows no vendor news.
        const trim = await time('trimMs', () => door.trimWordPressDemo({ apply, siteKey }))
        if (trim.status === 'none') ctx.note('this site could not hide the template’s demo posts')
        else if (!trim.alreadyTrimmed && trim.hidden > 0)
          // The trim moved rows the revision counts: inspect again before writing.
          state = (await time('reinspectMs', () => door.inspectWordPressContract(apply, siteKey))).state
      } catch (error) {
        stop.abort()
        throw error instanceof Error ? new Error(sayUnbound(error.message)) : error
      }

      // 🔒 THE DEMO POSTS OF A FULL SITE ARE TRANSLATED, NEVER REWRITTEN (product owner, decision 1 after g65, 12/10/2026;
      // `wp-posts.js`): listed once the demo trim has hidden the posts a release's profile hides (Tracy Business: another
      // company's news), translated beside the writes and written after the sweep. Their categories are named for the business
      // (decision (3) of 12/10/2026) and, with the tags, translated on a site in another language; they are settled on their own,
      // first, because the sweep gives a menu item that leads to a renamed category its new name (L1). A posts listing the site
      // would not give keeps them as the template made them.
      /** @type {Awaited<ReturnType<typeof planPosts>>} */
      const noPosts = { writes: [], lines: 0 }
      /** @type {Awaited<ReturnType<typeof planTerms>>} */
      const noTerms = { terms: [], renamed: [] }
      const blogReading = (async () => {
        const { text: seed } = await textModels()
        if (!seed || (!prepared.described && !prepared.writtenIn)) return null
        const text = seed.urgent?.() ?? seed
        const signal = AbortSignal.any([ctx.signal, stop.signal, AbortSignal.timeout(WORDS_MS)])
        const read = async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) => {
          const answer = /** @type {any} */ (await door1(action, params))
          if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
          return answer
        }
        /** @type {import('./wp-posts.js').Translate} */
        const translate = (lines, what) =>
          translateBlog({
            lines,
            locale: String(prepared.writtenIn),
            model: staged(text, 'posts'),
            signal,
            note: ctx.note,
            keep: [String(ctx.normalized.name ?? '')],
            what
          })
        return { text, signal, read, translate, posts: await listPosts(read) }
      })().catch((error) => {
        ctx.note(
          `the demo posts keep the template’s words: ${error instanceof Error ? error.message : error}`
        )
        return null
      })
      const termNaming = blogReading
        .then((blog) =>
          blog
            ? planTerms({
                read: blog.read,
                posts: blog.posts,
                rewrite: prepared.described === true,
                language: prepared.writtenIn ?? null,
                translate: blog.translate,
                note: ctx.note,
                about: String(ctx.brief?.about ?? ''),
                name: ctx.normalized.name,
                generate: firmGenerate(staged(blog.text, 'terms'), blog.signal),
                titleLanguage: prepared.writtenIn ?? prepared.source.tag ?? null
              })
            : noTerms
        )
        .catch((error) => {
          ctx.note(
            `the blog categories keep the template’s names: ${error instanceof Error ? error.message : error}`
          )
          return noTerms
        })
      const postSaying = time('postsMs', async () => {
        const blog = await blogReading
        return blog
          ? planPosts({
              posts: blog.posts,
              rewrite: prepared.described === true,
              language: prepared.writtenIn ?? null,
              // Every line a visitor reads of a body: whole blocks, and the runs of a block a link or a tag cuts.
              linesOf: (content) => [
                ...ownLines(content, ctx.normalized, staticLines, () => 1),
                ...ownLines(content, ctx.normalized, labelLines, () => 1)
              ],
              translate: blog.translate
            })
          : noPosts
      }).catch((error) => {
        ctx.note(
          `the demo posts keep the template’s words: ${error instanceof Error ? error.message : error}`
        )
        return noPosts
      })

      /** @type {Array<{slot: string, value: string, locale?: string}>} */
      let more = []
      /** @type {Map<string, Set<string>>} */
      let carried = new Map()
      /** @type {EditionEdit[]} the second and third blocks of a name in the other languages, written by block in the sweep */
      let editionEdits = []
      try {
        ;({ writes: more, carried, edits: editionEdits } = await planning)
      } catch (error) {
        // A language that could not be planned keeps the template's words; the first language is written.
        ctx.note(
          `the extra languages could not be written: ${error instanceof Error ? error.message : error}`
        )
      }

      // Uploads after the trim (both are writes) and before the one contract apply that names their paths.
      const art = await time('picturesMs', async () =>
        uploadPictures({ shaped: await shaping, platform: 'wordpress', apply, siteKey, note: ctx.note })
      ).catch((error) => {
        ctx.note(`the pictures could not be placed: ${error instanceof Error ? error.message : error}`)
        return { values: {}, placed: 0 }
      })
      Object.assign(art.values, stagedPictureValues)
      // A photograph has no language: what was placed in the source edition goes into every other edition too.
      const pictureWrites = [...carried].flatMap(([locale, slots]) =>
        Object.entries(art.values)
          .filter(([slot]) => slots.has(slot))
          .map(([slot, value]) => ({ slot, value, locale }))
      )
      // A sourced slot a person changed keeps their words (`pinStates`): read from the site when its inspect lists the slots.
      /** @type {Map<string, any>} */
      const live = new Map()
      for (const slot of Array.isArray(state?.slots) ? state.slots : contentMap.slots)
        if (!live.has(slot.key)) live.set(slot.key, slot)
      const pinsBefore = prepared.copyPins ? pinStates(prepared.copyPins.pins, live) : {}
      const writes = [
        ...prepared.inputWrites
          .filter((w) => (pinsBefore[w.slot] ?? 'written') === 'written')
          .map((w) => ({ slot: w.slot, value: w.value })),
        ...Object.entries(prepared.changes).map(([slot, value]) => ({ slot, value })),
        ...Object.entries(art.values).map(([slot, value]) => ({ slot, value })),
        ...more
      ]
      const through = await time('writeMs', () =>
        door.applyWordPressThroughContract({
          apply,
          siteKey,
          state,
          writes,
          source: prepared.source.slug,
          slots: new Map(contentMap.slots.map((s) => [s.key, s])),
          log: () => {}
        })
      )
      // A slot the model left empty (a link nobody has) is not a refusal; one the site would not take is.
      const refused = through.skipped.filter((s) => !String(s.reason).startsWith('empty after removing'))
      if (refused.length > 0)
        ctx.note(`${refused.length} line(s) were refused by the site and keep the template’s words`)
      const refusedSlots = new Set(refused.map((r) => r.slot))
      if (prepared.copyPins && woContent) {
        const took = new Set(writes.map((w) => w.slot).filter((slot) => !refusedSlots.has(slot)))
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
          const after = await door.inspectWordPressContract(apply, siteKey).catch(() => null)
          const slots = after?.state?.slots ?? null
          const readback = Array.isArray(slots)
            ? new Map(slots.map((slot) => [slot.key, String(slot.current ?? slot.sample ?? '')]))
            : null
          const homeHtml = siteReader ? await (await siteReader(siteKey))?.text('/').catch(() => null) : null
          const { receipts, report } = pictureReport({
            shaped: placedReal,
            homeHtml: homeHtml ?? null,
            values: art.values,
            refused: refusedSlots,
            readback
          })
          pictureReceipts = receipts
          ctx.time('picturesPlaced', report.photos)
          ctx.time('picturePlaceholders', report.placeholders)
          ctx.time('pictureDemoLeft', report.demoLeft.length)
          await realPictures.recordOutcome(prepared.real.buildId, { receipts, report })
        }).catch((error) => {
          ctx.note(
            `what the photographs became could not be recorded: ${error instanceof Error ? error.message : error}`
          )
        })
      /** A write as the contract door named it: `<edition>::<slot>` for another language. */
      const doorKey = (/** @type {{ slot: string, locale?: string }} */ w) =>
        w.locale && w.locale !== prepared.source.slug ? `${w.locale}::${w.slot}` : w.slot

      // The pictures of the other languages go in a second, small write: if the site would not take one of them, it costs
      // those pictures and never the words just written (a refused value is set aside by name only a few times).
      let pictured = 0
      if (pictureWrites.length > 0) {
        try {
          const second = await time('editionPicturesMs', async () => {
            const again = await door.inspectWordPressContract(apply, siteKey)
            return door.applyWordPressThroughContract({
              apply,
              siteKey,
              state: again.state,
              writes: pictureWrites,
              source: prepared.source.slug,
              slots: new Map(contentMap.slots.map((s) => [s.key, s])),
              log: () => {}
            })
          })
          pictured = second.written.length
        } catch (error) {
          ctx.note(
            `the pictures of the other languages could not be placed: ${error instanceof Error ? error.message : error}`
          )
        }
      }

      // The template's own company, off the site: what the words never reached, the labels the model would change, the pages
      // the customer unticked and the links to them. A refusal costs that change only (`sweepWordPress` says which).
      const attempted = writes.filter((w) => !refusedSlots.has(doorKey(w)))
      try {
        const [judged, finished, editionSaid, named] = await Promise.all([
          judging.then((j) => j ?? { relabel: new Map(), lines: [], forms: new Map() }),
          finishing,
          editionSaying,
          termNaming
        ])
        // What the other languages' blocks were given by block, in each language: a section one of them reached is the
        // customer's (`pruneBody`), as in the source.
        const byBlock = [...editionEdits, ...finished.edits]
        // The blocks the source's words now hold or took off — the lines the site refused are not among them — settle the
        // silence of the other languages' second chance (above); more blocks of one language to take off than MAX_DROPS is a
        // model gone wrong, and none of them go.
        const settledNow = new Set(
          (prepared.settled ?? []).filter((s) => !refusedSlots.has(s.key)).map((s) => s.at)
        )
        /** @type {EditionDrop[]} */
        const editionDrops = []
        for (const pass of extra) {
          const gone = [
            ...finished.drops.filter((d) => d.edition === pass.slug),
            ...finished.silent.filter((d) => d.edition === pass.slug && settledNow.has(d.at))
          ]
          if (gone.length > MAX_DROPS)
            ctx.note(
              `${gone.length} lines of the ${pass.tag} version had no honest replacement, which is too many to take off the pages: they keep the template’s words`
            )
          else
            editionDrops.push(
              ...gone.map(({ edition, id, block, nth, sample }) => ({ edition, id, block, nth, sample }))
            )
        }
        if (extra.length > 0)
          ctx.time(
            'editionsPlaced',
            byBlock.length + editionSaid.lines.filter((l) => l.value !== null).length
          )
        // An opportunity's build also loses the template's sample pages its contract does not list, judged by their path: JA
        // Restaurant WP's Typography (`explore/j-pages/category-blog`) and Smart Search stayed in its menu (22/10/2026).
        const byOpportunity = Boolean(prepared.copyPins || prepared.wo)
        const sample = byOpportunity ? await sampleAt() : () => false
        const placeOfPage = (/** @type {{ slug: string, url?: string }} */ page) =>
          (page.url ? pathOfUrl(page.url) : page.slug).replace(/^\/+|\/+$/g, '')
        const swept = await time('sweepMs', () =>
          sweepWordPress({
            call: door1,
            applyId: `residue-${Date.now().toString(36)}`,
            written: writtenLines([
              ...attempted.filter((w) => !w.locale).map((w) => w.value),
              ...prepared.duplicates.map((d) => d.value)
            ]),
            edits: [...prepared.duplicates, ...byBlock],
            drops: [...prepared.drops, ...editionDrops],
            hides: prepared.hides ?? [],
            facts: prepared.facts ?? [],
            lines: [...(judged.lines ?? []), ...editionSaid.lines],
            forms: judged.forms ?? new Map(),
            meta: [...(judged.meta ?? []), ...editionSaid.meta],
            // 🔒 A FORM'S MAIL REACHES SOMEBODY WHO RUNS THE BUSINESS (the owner's decision of 05/10/2026, ledger L05). The
            // mailbox the customer typed wins; with none typed, the account of the person who pressed Apply — never shown on a
            // page, only the forms' recipient. Before, a form kept `[_site_admin_email]`, which on a site Tracy installs is
            // Tracy's own mailbox: a visitor's message reached nobody who could answer it.
            to: ctx.normalized.email || ctx.email || null,
            // The links that mail or call the template's company lead to what the customer TYPED, and only that: the
            // account above receives mail and is never shown (`wp-contacts.js`).
            contact: { email: ctx.normalized.email ?? '', phone: ctx.normalized.phone ?? '' },
            entitySlugs,
            // The blocks the contract's slots write into stay, whatever has no honest words (TCH #1013).
            slotBlocks: slotBlocksByPage(contentMap),
            // A header or footer the map covers is the contract's: its slots are written above, never swept (#139).
            mapParts: partsInMap(contentMap),
            slotCounts,
            // 🔒 ABOUT LEFT BLANK CUTS NOTHING (TCH #1013, ABOUT-3, 11/10/2026): no word was written, so every section of the
            // template is one "the words never reached"; the site keeps them all, as in the demo, the demo company renamed (D9).
            prune: prepared.rewrites !== false,
            // 🔒 …and an opportunity's build cuts no block at all (product owner, 22/10/2026): replace, never remove. A block
            // that names the template's own company stays, every line of it saying the placeholder.
            pruneFill: byOpportunity ? UNSOURCED : null,
            // 🔒 ABOUT GIVEN KEEPS THE TEMPLATE'S BLOCKS TOO (TCH #1013, 11/10/2026, dev g57-ess-wp-full): a block the words never
            // reached is cut only when it names the template's own company; the article bodies and kit cards stay (`pruneBody`).
            // A design whose demo is another company's facts (`FACT_DESIGNS`) loses every such block: its history, certificates,
            // safety record and project lists are that company's, as its fact modules are on Joomla.
            // An opportunity's build fills only what names the company, whatever the design: never every unreached block.
            names:
              FACT_DESIGNS.has(ctx.quickstart) && !byOpportunity
                ? null
                : [...demoNames(contentMap), ...listOf(declaredCopy(ctx.contract.dir).demoCompanyNames)],
            extras: prepared.passes.editions
              .filter((e) => !e.source)
              .map((e) => ({
                slug: e.slug,
                written: writtenLines([
                  ...attempted.filter((w) => w.locale === e.slug).map((w) => w.value),
                  ...byBlock.filter((d) => d.edition === e.slug).map((d) => d.value)
                ])
              })),
            editionPages,
            judged,
            // 🔒 L1 (product owner, after g65): a menu item that leads to a renamed blog category, or names it, takes its new name.
            categories: named.renamed,
            // The only pages that go: those of kinds the customer did not pick in the `pages` question, and those the customer
            // unticked by id.
            unwanted: (pages) => {
              const { hide, note } = unpickedPages(ctx.brief?.answers, pages)
              if (note) ctx.note(note)
              // A page whose words were never planned goes whatever the site's list says now: it must not show the template's.
              const slugs = new Set([
                ...hide.map((page) => page.slug),
                ...slugsForIds(unpickedById(ctx.brief?.pages), pages),
                ...(prepared.skipPages ?? []).filter((slug) => pages.some((page) => page.slug === slug)),
                ...pages.filter((page) => sample(placeOfPage(page))).map((page) => page.slug)
              ])
              ctx.time('pagesUnpicked', slugs.size)
              return slugs
            },
            // The pages the customer ticked stay, even when an older answer names their kind.
            kept: (pages) => slugsForIds(keptById(ctx.brief?.pages), pages),
            // The same answers by path: two pages of one slug are told apart by it (JA Impact WP's Blog and Category Blog).
            unwantedPaths: unpickedById(ctx.brief?.pages),
            keptPaths: keptById(ctx.brief?.pages),
            // The template's dish items no slot covers take the restaurant's dishes and pictures, and each section its mark.
            // A dish's description pinned empty is not written by the door (`contractValue`): the sweep empties its block.
            woFill: byOpportunity
              ? {
                  ...dishItemPictures({
                    receipts: pictureReceipts,
                    dishes: prepared.woDishes ?? prepared.copyPins?.dishes ?? []
                  }),
                  ...(prepared.copyPins?.neutralItem ? { neutralName: prepared.copyPins.neutralItem } : {}),
                  neutralAlt: String(ctx.normalized.name ?? '').trim(),
                  blank: blankBlocks(prepared.copyPins?.pins, contentMap)
                }
              : null,
            // The pages the contract's showcase-navigation map put away from the menus stay published (`showcasePageIds`),
            // a link it names by address only resolved against the source pages.
            showcase: (pages) => showcasePageIds(showcaseNavMap(ctx.contract.dir), pages),
            wo: byOpportunity
          })
        )
        // A release with no slot-role map (JA Diner) has no pins, but its build is the opportunity's all the same.
        const buildId = prepared.copyPins?.buildId ?? prepared.wo?.buildId
        if (byOpportunity && buildId && Object.keys(swept.sections).length > 0)
          await woContent
            ?.recordSections?.(buildId, swept.sections)
            .catch((/** @type {any} */ error) =>
              ctx.note(
                `the sections of the pages could not be recorded: ${error instanceof Error ? error.message : error}`
              )
            )
        if (swept.dishLines) ctx.time('woDishLines', swept.dishLines)
        ctx.time('residueCut', swept.cut)
        ctx.time('residueHidden', swept.hidden.length)
        ctx.time('linksRemoved', swept.unlinked)
        ctx.time('postsHidden', swept.posts)
        ctx.time('pagesTitled', swept.titles)
        ctx.time('residuePlaced', swept.edited)
        ctx.time('residueDropped', swept.dropped)
        if (swept.blocksHidden) ctx.time('woBlocksHidden', swept.blocksHidden)
        if (swept.factsWritten) ctx.time('woFactsWritten', swept.factsWritten)
        ctx.time('mailboxes', swept.mailboxes)
        ctx.time('siteOptions', swept.options)
        ctx.time('contactLinks', swept.contacts)
        ctx.time('buttonsToContact', swept.files)
        if (swept.files > 0)
          ctx.note(
            `${swept.files} button(s) to a document of the template’s company${judged?.files?.voids ? ' or to nowhere' : ''} lead to the Contact page`
          )
        for (const note of swept.notes.slice(0, 3)) ctx.note(note)
      } catch (error) {
        ctx.note(
          `the template's own sections could not be taken off: ${error instanceof Error ? error.message : error}`
        )
      }

      // The demo posts' words and their terms' names, one write at a time once the sweep is done (a site takes one writer).
      try {
        const [planned, named] = await Promise.all([postSaying, termNaming])
        ctx.time('postLines', planned.lines)
        if (planned.writes.length > 0 || named.terms.length > 0) {
          const done = await time('postsWriteMs', () =>
            writePosts({
              call: door1,
              applyId: `posts-${Date.now().toString(36)}`,
              writes: planned.writes,
              terms: named.terms,
              note: ctx.note
            })
          )
          ctx.time('postsTranslated', done.posts)
          ctx.time('termsTranslated', done.terms)
        }
      } catch (error) {
        ctx.note(
          `the demo posts keep the template’s words: ${error instanceof Error ? error.message : error}`
        )
      }

      // The restaurant's own posts in place of the demo's, last of the writes that touch posts (`wp-wo-content.js`).
      if (prepared.wo && woContent) {
        const wo = await time('woPostsMs', () =>
          writeWoPosts({ call: door1, read: prepared.wo, woContent, note: ctx.note })
        )
        if (wo) {
          ctx.time('woPostsWritten', wo.written)
          ctx.time('woPostsHidden', wo.hidden)
          if (wo.failed > 0) ctx.time('woPostsFailed', wo.failed)
        }
      }

      // An opportunity's build with no logo given shows the business name as text, not the demo's logo (`wp-wo-logo.js`).
      // The brand step writes a given logo after this one, so only a build without one is touched.
      const logoGiven = ['light', 'dark', 'single'].some((v) => Boolean(ctx.brief?.brand?.logo?.[v]))
      if ((prepared.copyPins || prepared.wo) && !logoGiven)
        await woNameAsLogo({ call: door1, applyId: `wo-logo-${Date.now().toString(36)}`, note: ctx.note })

      // Only the languages asked for stay in the switcher, and an English variant relabels the source.
      const keep = prepared.passes.editions.map((e) => e.tag)
      const onRecord = state?.multilingual?.applyId ?? null
      // The door writes under the install's receipt again when there is one (`retireWordPressOthers`): not this Apply's to undo.
      if (typeof onRecord === 'string' && onRecord.startsWith('mlang-')) reusedIds.add(onRecord)
      const retired = await time('retireMs', () =>
        door.retireWordPressOthers({ apply, siteKey, keep, onRecord })
      )
      if (retired.status === 'none') ctx.note('this site could not hide the languages nobody asked for')
      // A site with one language has nothing to hide; a language it cannot add was said while preparing.
      const relabelled = await time('relabelMs', () =>
        door.relabelWordPressSource({ apply, siteKey, languages: ctx.normalized.languages })
      )
      // The language WordPress itself speaks (`<html lang>`, dates, its own words): the one the site is written in, or the
      // English variant a site with no translation plugin could not respell its source edition as.
      const spoken =
        prepared.writtenIn ??
        (relabelled.status === 'single' && ctx.normalized.languages.length === 1
          ? ctx.normalized.languages[0]
          : null)
      if (spoken) {
        const set = await time('localeMs', () =>
          door.setWordPressLocale({
            apply,
            siteKey,
            language: spoken,
            applyId: `lang-${Date.now().toString(36)}`
          })
        )
        for (const warning of set.warnings) ctx.note(warning)
        // What followed the language on its own (plugin after 0.18.7): the forms' locale, the date and time formats.
        const follow = /** @type {any} */ (set.follow)
        if (follow?.formats && typeof follow.formats === 'object' && Object.keys(follow.formats).length > 0)
          ctx.note(
            `WordPress writes dates and times in ${set.locale}'s own formats: ${JSON.stringify(follow.formats)}`
          )
        if (Array.isArray(follow?.failed) ? follow.failed.length > 0 : follow?.failed)
          ctx.note(`some settings could not follow the site language: ${JSON.stringify(follow.failed)}`)
        // 🔒 The words the blocks carry as attributes ("Read more", "By ", "Search"), in the site's language (`wp-block-words.js`).
        if (prepared.writtenIn && set.locale) {
          const { text: seed } = await textModels()
          if (!seed)
            ctx.note(
              "no text model is set, so the words the theme's blocks carry keep the template's language"
            )
          else {
            const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(JUDGE_MS)])
            const words = await time('blockWordsMs', () =>
              translateBlockWords({
                call: door1,
                locale: String(set.locale),
                applyId: `words-${Date.now().toString(36)}`,
                translate: async (texts) =>
                  new Map(
                    (
                      await translateKitLines({
                        pages: [{ slug: 'block-words', lines: texts.map((t) => ({ text: t })) }],
                        locale: String(prepared.writtenIn),
                        model: staged(seed.urgent?.() ?? seed, 'blockWords'),
                        signal,
                        note: ctx.note
                      })
                    ).map((line) => [line.text, line.value])
                  ),
                note: ctx.note
              })
            )
            ctx.time('blockWords', words.written)
          }
        }
      } else if (relabelled.status === 'single')
        ctx.note('this template has one language, so its English could not take the variant you chose')
      // 🔒 THE AUTHORS' JOB AND BIO ARE SAID IN THE SITE'S LANGUAGE ON FULL, NEVER REWRITTEN (LANG-2, `author-words.js`): user meta
      // no contract slot reaches ("Collaborator & Editor" on 17 pages of dev g60-ess-wp-full). BLANK keeps the demo's.
      if (prepared.writtenIn && prepared.described === true) {
        const { text: seed } = await textModels()
        const authors = await time('authorWordsMs', () =>
          translateAuthorWords({
            platform: 'wordpress',
            apply,
            siteKey,
            locale: String(prepared.writtenIn),
            source: 'en',
            described: true,
            model: seed ? staged(seed, 'authorWords') : null,
            signal: ctx.signal,
            note: ctx.note
          })
        )
        if (authors.written > 0) ctx.time('authorWords', authors.written)
      }
      // 🔒 THE SITE'S LANGUAGE IS DRAWN IN ITS OWN LETTERS (LANG-2, `glyph-fallback.js`): last, when the page is what a visitor
      // reads, the families it uses that cannot draw them are given faces that can.
      if (siteReader && prepared.writtenIn) {
        const glyphs = await time('glyphsMs', async () =>
          giveGlyphs({
            platform: 'wordpress',
            reader: await siteReader(siteKey).catch(() => null),
            lang: String(prepared.writtenIn),
            write: door1,
            note: ctx.note
          })
        )
        if (glyphs.faces > 0) ctx.time('glyphFaces', glyphs.faces)
      }
      return {
        wrote: through.written.length + pictured,
        kept: prepared.pending.length + prepared.dropped + refused.length
      }
    }
  }
}
