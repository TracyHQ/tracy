/**
 * The demo-leftover check's runner (spec TracyHQ/tracy#189, ticket #191): reads the pages a brief build serves and judges
 * them with the domain's one check (`website-opportunities/domain/demo-leftovers.mjs`). It runs after every brief build,
 * before the hand-off; its report is kept on the build's receipt (`receipt.leftovers`), where the hand-off report, the ops
 * view and the cleanup turn (#197) read it.
 *
 * Which pages: home, every page the site plan keeps, and the site's own links found on them, up to `MAX_PAGES`; plus one
 * address no page has, so the not-found page is read too (C16). A link to an address that answers 404 is a link that
 * leads nowhere (C19). A page that cannot be read is listed as unread, never as clean.
 */
import { ruleOfFinding } from 'website-opportunities/domain/build-rules.mjs'
import { keptPageReader } from '../lib/kept-page-reader.js'
import { keepEngineReport } from './engine-report.js'
import { contentMapOfTemplate } from './brief-build-path.js'
import { ownStylesheets, MAX_STYLES } from '../lib/own-stylesheets.js'
import { unusedBriefContent } from './page-seo-check.js'
import { runRuleChecks } from './build-rule-checks.js'

/** The most pages one check reads: a brief build's site has a handful, a demo's showcase branch can have dozens. */
export const MAX_PAGES = 24
export { MAX_STYLES, ownStylesheets }
/** An address no site serves, read to see the not-found page. */
export const MISSING_PROBE = '/tracy-leftover-check-missing-page'
/** Findings kept on the receipt; the rest are counted. */
const FINDINGS_KEPT = 400

/** A finding with the id of the site build rule it belongs to (`rule`), when one owns it. */
function withRule(finding) {
  const rule = ruleOfFinding(finding)
  return rule ? { ...finding, rule: rule.id } : finding
}

/** The site's own page addresses a page links to (same site, no files, no anchors). */
function ownLinks(html) {
  const out = new Set()
  for (const [, href] of String(html).matchAll(/<a\b[^>]*\shref\s*=\s*["']([^"'#]+)["']/gi)) {
    if (!href.startsWith('/') || href.startsWith('//')) continue
    const clean = href.replace(/[?#].*$/, '')
    if (
      /\.(?:jpe?g|png|gif|svg|webp|pdf|zip|css|js|xml|ico)$/i.test(clean) ||
      /^\/(?:administrator|api)\b/.test(clean)
    )
      continue
    out.add(clean.replace(/\/+$/, '') || '/')
  }
  return [...out]
}

/**
 * Read the served pages and judge them.
 * @param {object} input
 * @param {(path: string) => Promise<{status: number, html: string} | null>} input.readPage - one page as the site serves it
 * @param {(input: {pages: any[], contentMap: any, brief: any, missing: string[], styles: any[]}) => any} input.check - the domain's check
 * @param {(input: {pages: any[], brief: any}) => any[]} [input.contactCheck] - the domain's contact-fact check
 * @param {(input: {pages: any[], brief: any}) => any[]} [input.heroCheck] - the domain's first-screen check
 * @param {any} input.contentMap
 * @param {any} input.brief
 * @param {string[]} [input.paths] - the pages the site plan keeps
 * @param {() => number} [input.now]
 * @returns {Promise<{version: string, pass: boolean, broken: Array<{path: string, status: number | null, why: string}>, findings: any[], counts: Record<string, number>, pages: string[],
 *   unread: string[], missing: string[], truncated: number, at: string}>}
 */
export async function runLeftoverCheck({
  readPage,
  check,
  contactCheck = null,
  heroCheck = null,
  contentMap,
  brief,
  sitePlan = null,
  siteOrigin = null,
  paths = [],
  now = Date.now
}) {
  const kept = [...new Set(['/', ...paths.map((p) => p.replace(/\/+$/, '') || '/')])]
  const readKept = keptPageReader(readPage)
  const queue = [...kept]
  const pages = []
  const unread = []
  const missing = []
  /** @type {Array<{path: string, status: number | null, why: string}>} */
  const answers = []
  const seen = new Set()
  const servedRoutes = new Set()
  while (queue.length && seen.size < Math.max(MAX_PAGES, kept.length)) {
    const path = /** @type {string} */ (queue.shift())
    if (seen.has(path) || servedRoutes.has(path)) continue
    seen.add(path)
    const page = kept.includes(path) ? await readKept(path) : await readPage(path).catch(() => null)
    if (!page || page.status === null) {
      unread.push(path)
      answers.push({ path, status: null, why: 'the page did not answer' })
      continue
    }
    if (page.status === 404) {
      missing.push(path)
      answers.push({ path, status: 404, why: 'the page answered 404' })
      continue
    }
    if (page.status >= 300) {
      unread.push(path)
      answers.push({ path, status: page.status, why: `the page answered ${page.status}` })
      continue
    }
    if (page.status === 200 && !String(page.html ?? '').trim()) {
      unread.push(path)
      answers.push({ path, status: 200, why: 'the page returned an empty body' })
      continue
    }
    if (page.status !== 200)
      answers.push({ path, status: page.status, why: `the page answered ${page.status}, not 200` })
    servedRoutes.add(page.servedPath ?? path)
    pages.push({ path, servedPath: page.servedPath ?? path, status: page.status, html: page.html })
    for (const link of ownLinks(page.html)) if (!seen.has(link)) queue.push(link)
  }
  const probe = await readPage(MISSING_PROBE).catch(() => null)
  if (!probe || probe.status >= 500) unread.push(MISSING_PROBE)
  if (probe && probe.status >= 400)
    pages.push({ path: MISSING_PROBE, status: probe.status, html: probe.html })
  // The stylesheets are read with the same reader: a background the template settings paint lives there, not in a page.
  const styles = []
  for (const href of ownStylesheets(pages)) {
    const sheet = await readPage(href).catch(() => null)
    if (sheet && sheet.status === 200) styles.push({ href, css: sheet.html })
    else unread.push(href)
  }
  // 🔒 A SITE THAT DOES NOT ANSWER IS NEVER CLEAN. Pages that fail to answer carry no demo words, so a broken site used to
  // report 0 in every kind. A page the plan keeps (home, and every kept page: its address or the same address under the
  // site's index prefix) that is not served with 200 makes the whole report `broken`, and `pass` false.
  const served = pages.filter((p) => p.status === 200).map((p) => p.path)
  const broken = answers.filter((a) => kept.includes(a.path))
  if (!served.includes('/') && !broken.some((b) => b.path === '/'))
    broken.unshift({ path: '/', status: null, why: 'the home page was not served with 200' })
  // 🔒 THE CHECKS COME FROM THE REGISTRY (`website-opportunities/domain/build-rules.mjs`): every check a site build rule
  // names runs here, once (`build-rule-checks.js`); the report keeps each check's own field as before.
  const raw = await runRuleChecks({
    pages,
    contentMap,
    brief,
    sitePlan,
    siteOrigin,
    missing,
    styles,
    broken,
    missingPath: MISSING_PROBE,
    check,
    contactCheck,
    heroCheck
  })
  const mainMenu = raw['main-menu']
  // The footer link columns list every kept page (COO decision, #189 item 12), where the map declares them.
  const footerNavigation = raw['footer-navigation']
  // A button never leads to the page it sits on (COO decision, #189 item 23).
  const selfLinks = raw['self-links']
  // No play control opens an empty frame, a channel's line leads to that channel, one page has one name (#189 round 9, C).
  const buttonsVideos = raw['buttons-videos']
  const checked = raw['demo-leftovers']
  const people = raw['people-cards']
  const statistics = raw.statistics
  const report = {
    ...checked,
    pass: checked.pass && people.length === 0 && statistics.length === 0,
    findings: [...checked.findings, ...people, ...statistics],
    counts: {
      ...checked.counts,
      C07: (checked.counts?.C07 ?? 0) + people.length,
      C17: (checked.counts?.C17 ?? 0) + statistics.length
    }
  }
  // A contact fact the brief holds that no page shows (address, email, phone, hours): reported beside the leftovers.
  const contactMissing = raw['contact-facts']
  // Which of what, where and how to contact the home page's first screen does not answer (`hero-first-screen.mjs`).
  const heroMissing = raw['hero-first-screen']
  const pageIntros = raw['page-intros']
  const offeringSummaries = raw['offering-summaries']
  const reviewQuotes = raw['review-quotes']
  report.findings.push(...reviewQuotes)
  // No line under an offering's name only repeats it, and one list's cards share one set of row labels (#189 round 9).
  const offeringRows = raw['offering-rows']
  report.findings.push(...offeringRows)
  // The cards of one list share one text shape, one record one shape everywhere, one spelling per site (COO rule 30/10/2026).
  const siblingCopy = raw['sibling-copy']
  report.findings.push(...siblingCopy)
  // Sibling record pages: each shows its own pictures and its own words, no empty card, no blog pager (#189 rules 1-3).
  const recordPages = raw['record-pages']
  report.findings.push(...recordPages)
  // No visible message form without an email of the owner's, judged on the served pages (COO decision, #189 item 19).
  const contactForms = raw['contact-forms']
  report.findings.push(...contactForms.findings)
  // Every channel linked on the Contact page, numbers tappable, and no walk-in copy for a business by appointment (#189 item 19).
  const contactPage = raw['contact-page']
  report.findings.push(...contactPage)
  // A kept call-to-action band shows a message with its button (COO decision, #189 item 7), where the map declares bands.
  const ctaBands = raw['cta-bands']
  report.findings.push(...ctaBands)
  // No empty frame a visitor sees: a fact row group is shown complete or taken off on every page (#189 items 14, 15).
  const emptyFrames = raw['empty-frames']
  report.findings.push(...emptyFrames)
  // Every head block the build owes a page is on it: the brand colours, the leftover rules, each centred card row (#189 item 28).
  const headBlocks = raw['head-blocks']
  report.findings.push(...headBlocks)
  // Every kept page says its planned title and description, and the not-found page speaks for the business (#189 round 9).
  const pageSeo = raw['page-seo']
  report.findings.push(...pageSeo)
  // The brief's content no page shows, each with why: a report, never a finding (#189 round 9, item I3).
  const unused = sitePlan ? unusedBriefContent({ pages, brief, sitePlan }) : []
  // Every record the site plan assigned (a review and its author, a person's name) is on the site as given (#189 item 18).
  const recordSlots = raw['record-slots']
  report.findings.push(...recordSlots)
  // No sentence said twice on a page, reworded or not, nor on two pages (#189 round 9, class F).
  const repeatedCopy = raw['repeated-copy']
  report.findings.push(...repeatedCopy)
  // A showcase block the plan keeps on one page is on one page; an undeclared repeat is named (COO decision 30/10/2026).
  const repeatedBlocks = raw['repeated-blocks']
  report.findings.push(...repeatedBlocks)
  report.findings.push(...offeringSummaries.map((f) => ({ kind: 'C03', ...f })))
  report.counts.C03 = (report.counts.C03 ?? 0) + offeringSummaries.length
  const mainMenuFindings = (mainMenu?.findings ?? []).map((f) => ({
    ...f,
    kind: 'main-menu',
    severity: 'major',
    why: `Main menu ${f.reason}: ${f.href ?? f.page ?? f.path ?? 'unread'}`
  }))
  const footerFindings = (footerNavigation?.findings ?? []).map((f) => ({
    ...f,
    kind: 'footer-navigation',
    severity: 'major',
    why: `Footer ${f.reason}: ${f.href ?? f.label ?? f.path ?? 'unread'}`
  }))
  const selfLinkFindings = selfLinks.findings.map((f) => ({
    ...f,
    kind: 'self-link',
    severity: 'major',
    why: `Link to its own page: ${f.path} "${f.label}"`
  }))
  // The site build rules that had no check before the registry (#189): rule 2, rule 4, booking buttons, demo-name addresses.
  const ruleGaps = [
    ...raw['record-pictures'],
    ...raw['icon-rows'],
    ...raw['booking-buttons'],
    ...raw['demo-name-addresses']
  ]
  const all = [
    ...report.findings,
    ...mainMenuFindings,
    ...footerFindings,
    ...selfLinkFindings,
    ...buttonsVideos,
    ...pageIntros,
    ...ruleGaps
  ].map(withRule)
  return {
    ...report,
    mainMenu,
    footerNavigation,
    selfLinks,
    buttonsVideos,
    contactMissing,
    heroMissing,
    offeringSummaries,
    offeringRows,
    siblingCopy,
    recordPages,
    reviewQuotes,
    recordSlots,
    repeatedCopy,
    repeatedBlocks,
    contactForms,
    contactPage,
    pageSeo,
    unused,
    ctaBands,
    pageIntros,
    broken,
    pass:
      (!mainMenu || mainMenu.pass) &&
      (!footerNavigation || footerNavigation.pass) &&
      selfLinks.pass &&
      !buttonsVideos.some((f) => f.severity === 'major') &&
      report.pass === true &&
      broken.length === 0 &&
      unread.length === 0 &&
      offeringSummaries.length === 0 &&
      offeringRows.length === 0 &&
      siblingCopy.length === 0 &&
      recordPages.length === 0 &&
      reviewQuotes.length === 0 &&
      contactForms.findings.length === 0 &&
      contactPage.length === 0 &&
      emptyFrames.length === 0 &&
      headBlocks.length === 0 &&
      !pageSeo.some((f) => f.severity === 'major') &&
      recordSlots.length === 0 &&
      repeatedCopy.length === 0 &&
      !repeatedBlocks.some((f) => f.severity === 'major') &&
      ctaBands.length === 0 &&
      pageIntros.length === 0 &&
      !ruleGaps.some((f) => f.severity === 'blocker' || f.severity === 'major'),
    ruleGaps,
    findings: all.slice(0, FINDINGS_KEPT),
    truncated: Math.max(0, all.length - FINDINGS_KEPT),
    pages: pages.map((p) => p.path),
    unread,
    missing,
    at: new Date(now()).toISOString()
  }
}

/**
 * Check one brief build and keep the report on its receipt. Answers the build as it stands afterwards.
 * @param {{query: Function}} db
 * @param {{build: any, revision: any, domain: any, readSitePage: (siteKey: string, path: string) => Promise<any>,
 *   contentMapOf?: typeof contentMapOfTemplate, now?: () => number}} input
 */
export async function checkBuildLeftovers(
  db,
  { build, revision, domain, readSitePage, contentMapOf = contentMapOfTemplate, now = Date.now }
) {
  const kept = (build.receipt?.sitePlan?.pages ?? [])
    .filter((p) => p.decision === 'keep' && typeof p.path === 'string')
    .map((p) => p.path)
  const report = await runLeftoverCheck({
    readPage: (path) => readSitePage(build.site_key, path),
    check: domain.checkDemoLeftovers,
    contactCheck: domain.checkContactFacts,
    heroCheck: domain.checkHeroAnswers,
    contentMap: contentMapOf(revision.template),
    brief: revision.brief,
    sitePlan: build.receipt?.sitePlan ?? null,
    siteOrigin: build.site_key,
    paths: kept,
    now
  })
  const { rows } = await db.query(
    `update wo_build set receipt = coalesce(receipt, '{}'::jsonb) || jsonb_build_object('leftovers', $2::jsonb),
       updated_at = now() where id = $1 returning *`,
    [build.id, JSON.stringify(report)]
  )
  // The engine's own words and refusals travel with the check, so the report says why a part did not happen.
  return keepEngineReport(db, rows[0] ?? { ...build, receipt: { ...build.receipt, leftovers: report } })
}
