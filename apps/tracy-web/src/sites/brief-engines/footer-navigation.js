import { invalidMenuLabel, menuPath } from 'website-opportunities/domain/main-menu.mjs'
import {
  invalidFooterHeading,
  planFooterNavigation
} from 'website-opportunities/domain/footer-navigation.mjs'
import { jsonObjectIn } from './shared.js'

const SYSTEM =
  "Name the footer link columns of a business website and the links in them. Each column heading says what the column holds, in the business's own words from the brief, in the requested language: " +
  'a column of offerings names them the way this business does, a column of company pages names the business or its pages. ' +
  'Never use a generic heading such as Site map, Links, Quick links, Menu or Navigation, and never the demo heading given. ' +
  'Each link names its page by its role; when a name is given, use it unless it is longer than maxCharacters. Never use a ' +
  'generic action such as Learn more, Read more or Details. Contact names only a contact page. Labels in one column are ' +
  'distinct. Never invent offerings or people. Return JSON only: {"headings":{"<column id>":"<heading>"},"labels":{"<link key>":"<label>"}}.'

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
  signal
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
      name: known[l.pageId] ?? l.label ?? ''
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
  const written = plan.columns.map((c) => {
    const heading = String(result?.headings?.[c.id] ?? '').trim()
    const bad = invalidFooterHeading(heading, { max: byId.get(c.id)?.headingMax ?? 40, demo })
    if (bad) throw fail('FOOTER_INVALID', `${c.id}: ${bad}`)
    const seen = new Set()
    return {
      id: c.id,
      heading,
      links: links
        .filter((l) => l.column === c.id)
        .map((l) => {
          const label = String(result?.labels?.[l.key] ?? '').trim()
          const invalid = invalidMenuLabel(label, l.role, byId.get(c.id)?.linkMax ?? 40)
          const folded = label.toLocaleLowerCase(locale)
          if (invalid || seen.has(folded))
            throw fail('FOOTER_INVALID', `${l.key}: ${invalid ?? 'duplicate-label'}`)
          seen.add(folded)
          return { pageId: l.pageId, path: l.path, role: l.role, label }
        })
    }
  })
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
  return { columns: written, off: plan.off }
}
