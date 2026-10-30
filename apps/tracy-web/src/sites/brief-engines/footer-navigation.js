import { invalidMenuLabel, menuPath } from 'website-opportunities/domain/main-menu.mjs'
import {
  invalidFooterHeading,
  planFooterNavigation
} from 'website-opportunities/domain/footer-navigation.mjs'
import { ruleText } from 'website-opportunities/domain/build-rules.mjs'
import { PRIVACY_TITLE } from 'website-opportunities/domain/privacy-policy.mjs'
import { pageNameOf } from 'website-opportunities/domain/declared-button-plan.mjs'
import { jsonObjectIn } from './shared.js'
import { settleText, textFallbackNotes } from './text-fallback.js'

const SYSTEM =
  "Name the footer link columns of a business website and the links in them. Each column heading says what the column holds, in the business's own words from the brief, in the requested language: " +
  'a column of offerings names them the way this business does, a column of company pages names the business or its pages. ' +
  'Never use a generic heading such as Site map, Links, Quick links, Menu or Navigation, and never the demo heading given. ' +
  'Each link names its page by its role; when a name is given, use it unless it is longer than maxCharacters. ' +
  // The link label rule is the site build rules registry's one wording (`build-rules.mjs`, rule 6).
  `${ruleText('menu-label-is-page-name')} Labels in one column are ` +
  'distinct. Never invent offerings or people. Return JSON only: {"headings":{"<column id>":"<heading>"},"labels":{"<link key>":"<label>"}}.'

/** The plain name of the Privacy Policy link: in full where the column's link fits it, else the one word. */
const privacyLabel = (max) => [PRIVACY_TITLE, 'Privacy'].find((t) => [...t].length <= max) ?? null

const fail = (code, detail) => Object.assign(new Error(`${code}: ${detail}`), { code })

/**
 * The footer link columns, written after the main menu (COO decision, spec TracyHQ/tracy#189 item 12): every kept page,
 * each offering page among them, is listed in a declared footer column; each used column gets a heading from what it
 * holds, an unused one is taken off. Native adapters read and write their CMS; failures stop the build clearly.
 * @param {{sitePlan: any, read: () => Promise<{columns: any[], items?: any[], offeringPages?: any[]}>,
 *   write: (plan: {columns: any[], off: string[]}) => Promise<void>, model: any, locale?: string,
 *   known?: Record<string, string>, signal?: AbortSignal}} input
 *   `known`: the main menu's labels by page id, so a page keeps one name across header and footer
 */
export async function writeFooterNavigation({
  sitePlan,
  read,
  write,
  model,
  locale = 'en',
  known = {},
  signal,
  note = () => {}
}) {
  if (!sitePlan || !(sitePlan.pages ?? []).some((p) => p.decision === 'keep')) return null
  const inventory = await read()
  const columns = inventory.columns ?? []
  if (!columns.length) return null
  const plan = planFooterNavigation({
    sitePlan,
    groups: columns,
    items: inventory.items ?? [],
    offeringPages: inventory.offeringPages ?? []
  })
  const unrouted = plan.targets.filter((t) => !t.path)
  if (unrouted.length) throw fail('FOOTER_MISSING_PAGE', unrouted.map((t) => t.pageId).join(', '))
  if (!model?.chat) throw fail('FOOTER_MODEL_UNAVAILABLE', 'footer headings require a text model')
  const byId = new Map(columns.map((c) => [c.id, c]))
  const demo = new Set(
    columns
      .map((c) =>
        String(c.demoHeading ?? '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  )
  const links = plan.columns.flatMap((c) =>
    c.links.map((l, i) => ({
      ...l,
      column: c.id,
      key: `${c.id}.${i}`,
      name: known[l.pageId] ?? l.label ?? '',
      // The page's own name, used as it is: the main menu's label, or the plan's name of an offering (#189 round 9, C6).
      // The Privacy Policy page keeps its plain name in English (criterion 10.1); another language lets the model translate it.
      fixed:
        known[l.pageId] ??
        (l.planned ? l.label : null) ??
        (l.role === 'privacy' && /^en\b/i.test(locale) ? privacyLabel(byId.get(c.id)?.linkMax ?? 40) : null)
    }))
  )
  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({
        business: {
          name: sitePlan.brand?.name?.value ?? '',
          description: sitePlan.brand?.description?.value ?? ''
        },
        locale,
        columns: plan.columns.map((c) => ({
          id: c.id,
          holds: c.holds,
          demoHeading: byId.get(c.id)?.demoHeading ?? '',
          maxCharacters: byId.get(c.id)?.headingMax ?? 40
        })),
        links: links.map((l) => ({
          key: l.key,
          column: l.column,
          role: l.role,
          path: l.path,
          ...(l.name ? { name: l.name } : {}),
          maxCharacters: byId.get(l.column)?.linkMax ?? 40
        }))
      })
    }
  ]
  const result = jsonObjectIn(await model.chat({ messages, maxTokens: 2000, temperature: 0, signal }))
  const business = String(sitePlan.brand?.name?.value ?? '').trim()
  const pageOf = (/** @type {string} */ id) => (sitePlan.pages ?? []).find((p) => p.id === id)
  const titleOf = (/** @type {string} */ id) => String(pageOf(id)?.title ?? pageOf(id)?.label ?? '').trim()
  /** @type {import('./text-fallback.js').TextFallback[]} */
  const fallbacks = []
  /** @type {import('./text-fallback.js').TextFinding[]} */
  const findings = []
  const usedHeadings = new Set()
  const written = []
  for (const c of plan.columns) {
    const column = byId.get(c.id)
    // The heading's stand-ins: an offerings column is named by its offerings index page, any column by the business; the
    // template's own heading only when it is not demo words (the check refuses those).
    const index = c.links.find((l) => ['services', 'menu', 'offerings'].includes(l.role))
    const candidates = [
      ...(index && c.holds !== 'company'
        ? [
            { source: 'offerings page name', text: known[index.pageId] },
            { source: 'offerings page title', text: titleOf(index.pageId) }
          ]
        : []),
      { source: 'business name', text: business },
      { source: 'template heading', text: column?.demoHeading }
    ]
    // A heading another column already shows is tried last, so two columns do not share one name when they need not.
    const fold = (/** @type {unknown} */ t) =>
      String(t ?? '')
        .trim()
        .toLowerCase()
    candidates.sort((a, b) => Number(usedHeadings.has(fold(a.text))) - Number(usedHeadings.has(fold(b.text))))
    const settled = settleText({
      site: 'footer heading',
      key: c.id,
      value: result?.headings?.[c.id],
      invalid: (t) => invalidFooterHeading(t, { max: column?.headingMax ?? 40, demo }),
      candidates
    })
    if (settled.fallback) fallbacks.push(settled.fallback)
    // No value passes: the column keeps the heading it shows now and the final check judges the served footer.
    if (settled.finding) findings.push(settled.finding)
    const heading = settled.text ?? String(column?.heading ?? '')
    usedHeadings.add(fold(heading))
    const seen = new Set()
    const max = column?.linkMax ?? 40
    const columnLinks = []
    for (const l of links.filter((x) => x.column === c.id)) {
      const own = typeof l.fixed === 'string' ? l.fixed.trim() : ''
      const invalid = (/** @type {string} */ t) =>
        invalidMenuLabel(t, l.role, max) ?? (seen.has(t.toLocaleLowerCase(locale)) ? 'duplicate-label' : null)
      const label = settleText({
        site: 'footer link',
        key: l.key,
        value: own && !invalid(own) ? own : result?.labels?.[l.key],
        invalid,
        candidates: [
          { source: 'page name', text: l.name },
          { source: 'page title', text: titleOf(l.pageId) },
          { source: 'offering name', text: l.label },
          // The name its address reads ("about/our-team" is "Our team"), the last deterministic name a page has.
          { source: 'page address', text: l.path ? pageNameOf({ path: l.path }) : null }
        ]
      })
      if (label.fallback) fallbacks.push(label.fallback)
      // A link no name passes for is left out of its column (a finding), never written with a refused name.
      if (label.finding || label.text === null) {
        if (label.finding) findings.push(label.finding)
        continue
      }
      seen.add(label.text.toLocaleLowerCase(locale))
      columnLinks.push({ pageId: l.pageId, path: l.path, role: l.role, label: label.text })
    }
    written.push({ id: c.id, heading, links: columnLinks })
  }
  for (const line of textFallbackNotes({ fallbacks, findings })) note(line)
  await write({ columns: written, off: plan.off })
  const after = (await read()).columns ?? []
  const refused = []
  for (const column of written) {
    const now = after.find((c) => c.id === column.id)
    const shown = (now?.links ?? []).map((l) => `${menuPath(l.path)}\u0000${l.label}`)
    const wanted = column.links.map((l) => `${menuPath(l.path)}\u0000${l.label}`)
    if (!now || now.hidden || now.heading !== column.heading || shown.join('\n') !== wanted.join('\n'))
      refused.push(column.id)
  }
  for (const id of plan.off) if (after.find((c) => c.id === id && !c.hidden)) refused.push(id)
  if (refused.length) throw fail('FOOTER_READBACK', refused.join(', '))
  return { columns: written, off: plan.off, fallbacks, findings }
}
