/**
 * The site build rules on one page, for the in-site editing agent (spec TracyHQ/tracy#189, COO decision 30/10/2026). After
 * the agent changes a page ("add a lesson"), `tracy_build_check` asks the door `GET /api/sites/_conversation/build-check`,
 * which runs this: the same final checks a brief build ends with (`runLeftoverCheck`, every check the registry
 * `build-rules.mjs` names, contact facts and the first screen included), read from the served site, and answers the
 * findings on that page plus the site-wide ones (menu, footer), each with its rule, the rule's guarantee and what to put
 * instead. So an owner's later edit keeps sibling parity, the footer shape and the rest.
 *
 * The site's last brief build gives the template's content map, the brief and the site plan; a site with none is checked
 * without them (the checks that need a declaration say nothing). Read-only: no write, no receipt change.
 */
import { contentMapOfTemplate } from './brief-build-path.js'
import { runLeftoverCheck } from './demo-leftover-check.js'

export const PAGE_BUILD_CHECK_VERSION = 'page-build-check/1'

/** Findings one answer lists; the rest are counted. */
const SHOWN = 40

/** The last brief build of a site with its revision's template and brief, or null. */
async function lastBuildOf(db, siteKey) {
  const { rows } = await db.query(
    `select b.receipt, r.template, r.brief from wo_build b join wo_revision r on r.id = b.revision_id
     where b.site_key = $1 order by b.created_at desc limit 1`,
    [siteKey]
  )
  return rows[0] ?? null
}

/**
 * The answer for one page from one full check report: its findings and the site-wide ones, each tagged with its rule.
 * @param {any} report - `runLeftoverCheck`'s report
 * @param {string} path
 * @param {{ruleOfFinding: Function, repairOf: Function}} domain
 */
export function pageBuildAnswer(report, path, domain) {
  const all = Array.isArray(report?.findings) ? report.findings : []
  const onPage = all.filter((f) => {
    const page = f?.page ?? f?.path ?? null
    return page === null || page === path || page === `${path}/`
  })
  const items = onPage.map((f) => {
    const rule = domain.ruleOfFinding(f)
    return {
      rule: rule?.id ?? null,
      blocks: rule?.severity === 'blocker' && rule.blocks?.(f) === true,
      kind: f.kind,
      page: f.page ?? f.path ?? null,
      place: f.place ?? f.href ?? null,
      found: String(f.found ?? f.label ?? f.why ?? '').slice(0, 120),
      guarantee: rule?.guarantee ?? null,
      instead: domain.repairOf(f)
    }
  })
  items.sort((a, b) => Number(b.blocks) - Number(a.blocks))
  const broken = (Array.isArray(report?.broken) ? report.broken : []).filter(
    (b) => b.path === path || b.path === '/'
  )
  return {
    version: PAGE_BUILD_CHECK_VERSION,
    path,
    pass: items.length === 0 && broken.length === 0,
    blockers: items.filter((i) => i.blocks).length,
    findings: items.slice(0, SHOWN),
    more: Math.max(0, items.length - SHOWN),
    broken,
    pages: Array.isArray(report?.pages) ? report.pages : []
  }
}

/**
 * Run the registry checks for one page of a site.
 * @param {{query: Function}} db
 * @param {{siteKey: string, path: string, readSitePage: (siteKey: string, path: string) => Promise<any>, domain: any,
 *   contentMapOf?: typeof contentMapOfTemplate, now?: () => number}} input
 */
export async function pageBuildCheck(
  db,
  { siteKey, path, readSitePage, domain, contentMapOf = contentMapOfTemplate, now = Date.now }
) {
  const build = await lastBuildOf(db, siteKey).catch(() => null)
  const sitePlan = build?.receipt?.sitePlan ?? null
  const kept = (sitePlan?.pages ?? [])
    .filter((p) => p.decision === 'keep' && typeof p.path === 'string')
    .map((p) => p.path)
  const report = await runLeftoverCheck({
    readPage: (p) => readSitePage(siteKey, p),
    check: domain.checkDemoLeftovers,
    contactCheck: domain.checkContactFacts ?? null,
    heroCheck: domain.checkHeroAnswers ?? null,
    contentMap: build ? contentMapOf(build.template) : null,
    brief: build?.brief ?? null,
    sitePlan,
    siteOrigin: siteKey,
    paths: [...new Set([path, ...kept])],
    now
  })
  return pageBuildAnswer(report, path, domain)
}
