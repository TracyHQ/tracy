/**
 * The final checks of the site build rules (spec TracyHQ/tracy#189), by the ids the registry names
 * (`website-opportunities/domain/build-rules.mjs`, each rule's `checks`). `runRuleChecks` runs every check some rule names,
 * once, and answers each one's raw result by id; `demo-leftover-check.js` builds the build receipt's report from them.
 *
 * 🔒 A RULE WITHOUT A CHECK IS A FAILING TEST, AND SO IS A CHECK WITHOUT A RULE: the registry and this map must name the same
 * ids (`apps/tracy-web/test/build-rule-checks.test.mjs`). A check reads the served pages of any CMS.
 */
import { checkIdsOf } from 'website-opportunities/domain/build-rules.mjs'
import { checkButtonsVideos } from './buttons-videos-check.js'
import { checkContactForms } from './contact-form-check.js'
import { checkContactPage } from './contact-page-check.js'
import { checkCopyLines } from './copy-lines-check.js'
import { checkCtaBands } from './cta-band-check.js'
import { checkEmptyFrames } from './empty-frame-check.js'
import { checkFooterNavigation } from './footer-navigation-check.js'
import { checkHeadBlocks } from './head-block-check.js'
import { checkMainMenu } from './main-menu-check.js'
import { checkOfferingRows } from './offering-rows-check.js'
import { checkOfferingSummaries } from './offering-summary-check.js'
import { checkPageIntros } from './page-intro-check.js'
import { checkPageSeo } from './page-seo-check.js'
import { peopleCardFindings } from './people-card-check.js'
import { checkRecordPages } from './record-pages-check.js'
import { checkRecordPictures } from './record-picture-check.js'
import { checkRecordSlots } from './record-slot-check.js'
import { checkRepeatedBlocks } from './repeated-block-check.js'
import { checkRepeatedCopy } from './repeated-copy-check.js'
import { checkReviewQuotes } from './review-quotes-check.js'
import { checkSelfLinks } from './self-link-check.js'
import { checkSiblingCopy } from './sibling-copy-check.js'
import { statisticFindings } from './statistic-check.js'
import { checkBookingButtons, checkDemoNameAddresses, checkIconRows } from './rule-gap-checks.js'
import { seeder } from '../lib/seeder.js'

/**
 * @typedef {{pages: any[], contentMap: any, brief: any, sitePlan: any, siteOrigin: string | null, missing: string[],
 *   styles: any[], broken: any[], missingPath: string, check: Function, contactCheck?: Function | null,
 *   heroCheck?: Function | null, copyLines?: any}} CheckContext
 */

/** Each final check by id: what it returns is that check's own report (an array of findings, or its report object). */
export const CHECKS = Object.freeze({
  'demo-leftovers': (/** @type {CheckContext} */ c) =>
    c.check({
      pages: c.pages,
      contentMap: c.contentMap,
      brief: c.brief,
      missing: c.missing,
      styles: c.styles,
      broken: c.broken
    }),
  'people-cards': (/** @type {CheckContext} */ c) =>
    peopleCardFindings({ pages: c.pages, contentMap: c.contentMap, brief: c.brief }),
  statistics: (/** @type {CheckContext} */ c) =>
    statisticFindings({ pages: c.pages, contentMap: c.contentMap, brief: c.brief }),
  'offering-summaries': (/** @type {CheckContext} */ c) =>
    checkOfferingSummaries({ pages: c.pages, brief: c.brief }),
  'contact-forms': (/** @type {CheckContext} */ c) => checkContactForms({ pages: c.pages, brief: c.brief }),
  'record-slots': (/** @type {CheckContext} */ c) =>
    c.sitePlan ? checkRecordSlots({ pages: c.pages, sitePlan: c.sitePlan, contentMap: c.contentMap }) : [],
  'review-quotes': (/** @type {CheckContext} */ c) => checkReviewQuotes({ pages: c.pages, brief: c.brief }),
  'head-blocks': (/** @type {CheckContext} */ c) =>
    checkHeadBlocks({ pages: c.pages, sitePlan: c.sitePlan, styles: c.styles }),
  'self-links': (/** @type {CheckContext} */ c) => checkSelfLinks({ pages: c.pages, origin: c.siteOrigin }),
  'buttons-videos': (/** @type {CheckContext} */ c) =>
    checkButtonsVideos({ pages: c.pages, sitePlan: c.sitePlan, origin: c.siteOrigin }),
  'sibling-copy': (/** @type {CheckContext} */ c) => checkSiblingCopy({ pages: c.pages }),
  'record-pages': (/** @type {CheckContext} */ c) => checkRecordPages({ pages: c.pages }),
  'footer-navigation': (/** @type {CheckContext} */ c) =>
    checkFooterNavigation({
      pages: c.pages,
      sitePlan: c.sitePlan,
      contentMap: c.contentMap,
      origin: c.siteOrigin
    }),
  'contact-page': (/** @type {CheckContext} */ c) =>
    checkContactPage({ pages: c.pages, sitePlan: c.sitePlan }),
  'record-pictures': (/** @type {CheckContext} */ c) => checkRecordPictures({ pages: c.pages }),
  'pages-served': (/** @type {CheckContext} */ c) => c.broken,
  'empty-frames': (/** @type {CheckContext} */ c) => checkEmptyFrames({ pages: c.pages }),
  'page-intros': (/** @type {CheckContext} */ c) => checkPageIntros({ pages: c.pages, sitePlan: c.sitePlan }),
  'copy-lines': (/** @type {CheckContext} */ c) => checkCopyLines({ copyLines: c.copyLines ?? null }),
  'cta-bands': (/** @type {CheckContext} */ c) =>
    checkCtaBands({ pages: c.pages, contentMap: c.contentMap, sitePlan: c.sitePlan }),
  'icon-rows': (/** @type {CheckContext} */ c) => checkIconRows({ pages: c.pages }),
  'main-menu': (/** @type {CheckContext} */ c) =>
    c.sitePlan ? checkMainMenu({ pages: c.pages, sitePlan: c.sitePlan, origin: c.siteOrigin }) : null,
  'offering-rows': (/** @type {CheckContext} */ c) => checkOfferingRows({ pages: c.pages, brief: c.brief }),
  'page-seo': (/** @type {CheckContext} */ c) =>
    checkPageSeo({ pages: c.pages, sitePlan: c.sitePlan, missingPath: c.missingPath }),
  'repeated-copy': async (/** @type {CheckContext} */ c) => {
    // Near copies as the writers judge them.
    const near = await seeder('distinct-copy')
      .then((m) => m.containedCopy)
      .catch(() => undefined)
    return checkRepeatedCopy({ pages: c.pages, near })
  },
  'repeated-blocks': (/** @type {CheckContext} */ c) =>
    checkRepeatedBlocks({ pages: c.pages, sitePlan: c.sitePlan }),
  'booking-buttons': (/** @type {CheckContext} */ c) =>
    checkBookingButtons({ pages: c.pages, sitePlan: c.sitePlan, origin: c.siteOrigin }),
  'demo-name-addresses': (/** @type {CheckContext} */ c) =>
    checkDemoNameAddresses({ pages: c.pages, contentMap: c.contentMap }),
  'contact-facts': (/** @type {CheckContext} */ c) =>
    typeof c.contactCheck === 'function' ? c.contactCheck({ pages: c.pages, brief: c.brief }) : [],
  'hero-first-screen': (/** @type {CheckContext} */ c) =>
    typeof c.heroCheck === 'function' ? c.heroCheck({ pages: c.pages, brief: c.brief }) : []
})

/**
 * Run every final check the registry names, each once, in registry order.
 * @param {CheckContext} context
 * @param {string[]} [ids] - the check ids to run (default: every id the registry names)
 * @returns {Promise<Record<string, any>>} each check's own report by id
 */
export async function runRuleChecks(context, ids = checkIdsOf()) {
  /** @type {Record<string, any>} */
  const out = {}
  for (const id of ids) {
    const run = /** @type {Record<string, (c: CheckContext) => any>} */ (CHECKS)[id]
    if (typeof run !== 'function') throw new Error(`build rule check "${id}" has no implementation`)
    out[id] = await run(context)
  }
  return out
}
