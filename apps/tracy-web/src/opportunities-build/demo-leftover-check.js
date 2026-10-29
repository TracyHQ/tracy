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
import { keepEngineReport } from './engine-report.js'
import { contentMapOfTemplate } from './brief-build-path.js'
import { ownStylesheets, MAX_STYLES } from '../lib/own-stylesheets.js'

/** The most pages one check reads: a brief build's site has a handful, a demo's showcase branch can have dozens. */
export const MAX_PAGES = 24
export { MAX_STYLES, ownStylesheets }
/** An address no site serves, read to see the not-found page. */
export const MISSING_PROBE = '/tracy-leftover-check-missing-page'
/** Findings kept on the receipt; the rest are counted. */
const FINDINGS_KEPT = 400

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
  contentMap,
  brief,
  paths = [],
  now = Date.now
}) {
  const kept = [...new Set(['/', ...paths.map((p) => p.replace(/\/+$/, '') || '/')])]
  const queue = [...kept]
  const pages = []
  const unread = []
  const missing = []
  /** @type {Array<{path: string, status: number | null, why: string}>} */
  const answers = []
  const seen = new Set()
  while (queue.length && seen.size < MAX_PAGES) {
    const path = /** @type {string} */ (queue.shift())
    if (seen.has(path)) continue
    seen.add(path)
    const page = await readPage(path).catch(() => null)
    if (!page) {
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
    if (page.status !== 200)
      answers.push({ path, status: page.status, why: `the page answered ${page.status}, not 200` })
    pages.push({ path, status: page.status, html: page.html })
    for (const link of ownLinks(page.html)) if (!seen.has(link)) queue.push(link)
  }
  const probe = await readPage(MISSING_PROBE).catch(() => null)
  if (probe && probe.status >= 400)
    pages.push({ path: MISSING_PROBE, status: probe.status, html: probe.html })
  // The stylesheets are read with the same reader: a background the template settings paint lives there, not in a page.
  const styles = []
  for (const href of ownStylesheets(pages)) {
    const sheet = await readPage(href).catch(() => null)
    if (sheet && sheet.status < 300) styles.push({ href, css: sheet.html })
  }
  // 🔒 A SITE THAT DOES NOT ANSWER IS NEVER CLEAN. Pages that fail to answer carry no demo words, so a broken site used to
  // report 0 in every kind. A page the plan keeps (home, and every kept page: its address or the same address under the
  // site's index prefix) that is not served with 200 makes the whole report `broken`, and `pass` false.
  const served = pages.filter((p) => p.status === 200).map((p) => p.path)
  const reached = (/** @type {string} */ path) =>
    served.some((s) => s === path || (path !== '/' && s.endsWith(path)))
  const broken = answers.filter((a) => kept.includes(a.path) && !(a.status === 404 && reached(a.path)))
  if (!served.includes('/') && !broken.some((b) => b.path === '/'))
    broken.unshift({ path: '/', status: null, why: 'the home page was not served with 200' })
  const report = check({ pages, contentMap, brief, missing, styles, broken })
  // A contact fact the brief holds that no page shows (address, email, phone, hours): reported beside the leftovers.
  const contactMissing = typeof contactCheck === 'function' ? contactCheck({ pages, brief }) : []
  return {
    ...report,
    contactMissing,
    broken,
    pass: report.pass === true && broken.length === 0,
    findings: report.findings.slice(0, FINDINGS_KEPT),
    truncated: Math.max(0, report.findings.length - FINDINGS_KEPT),
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
    contentMap: contentMapOf(revision.template),
    brief: revision.brief,
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
