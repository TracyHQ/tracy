// The request and the reply of the created Privacy page's writer call (`page-writer-system.mjs`, #575). Pure.
import { readWriterSeo } from './page-writer-page.mjs'
import { CONTACT_CHANNEL_KINDS } from './plan-placement-facts.mjs'
import { CREATE_PAGE, PRIVACY_KIND } from './plan-system-pages.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The privacy page the plan creates (`plan.legalPages`, `use: "create"`), or null. */
export const createdPrivacyOf = (plan) =>
  list(plan?.legalPages).find((l) => l?.kind === PRIVACY_KIND && l.use === CREATE_PAGE) ?? null

/** The user message of the privacy call. */
export function privacyRequestOf(entry, { plan, context, written, rewrite }) {
  const view = (id) => {
    const e = context.byId.get(id)
    return e?.what === 'fact' ? { kind: e.kind, value: e.entry.value } : null
  }
  const shown = [...new Set(plan.pages.flatMap((p) => p.blocks.flatMap((b) => list(b.data))))]
  const channels = shown.map(view).filter((f) => f && CONTACT_CHANNEL_KINDS.includes(f.kind))
  const name = list(plan.facts).find((f) => f.kind === 'business.name')?.value
  return {
    language: plan.language,
    business: isText(name) ? { name } : {},
    page: { id: entry.id, says: entry.says },
    facts: list(entry.factIds).map(view).filter(Boolean),
    site: {
      pages: plan.pages.map((p) => ({ name: p.name, pageType: p.pageType })),
      channels,
      forms: plan.pages.flatMap((p) =>
        p.blocks
          .filter((b) => ['form', 'newsletter'].includes(context.blocks.get(b.block)?.type))
          .map((b) => ({ page: p.name, label: b.label }))
      )
    },
    ...(context.voice ? { voice: context.voice } : {}),
    ...(context.seoLimits
      ? { seo: { titleLimit: context.seoLimits.title, descriptionLimit: context.seoLimits.description } }
      : {}),
    ...(written.length ? { written } : {}),
    ...(rewrite ? { rewrite } : {})
  }
}

/** The page as the reply gives it, or null when the reply is not the asked JSON object. */
export function readPrivacyReply(reply) {
  let value = reply
  if (typeof reply === 'string')
    try {
      value = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
    } catch {
      return null
    }
  if (!value || typeof value !== 'object' || !Array.isArray(value.body)) return null
  return {
    title: value.title,
    body: value.body.map((p) => (typeof p === 'string' ? { text: p, covers: [] } : p)),
    seo: readWriterSeo(value) ?? undefined
  }
}
