// The plan revisions of the revision run tests (#599), each made on the invented florist's approved plan and gated
// profile in the shape the plan edit gate returns them (`gateEditedPlan`: the plan one revision on, the profile with the
// customer's values), and the site compared by what it shows, so that two builds that made their records in another
// order compare equal. Invented data only.
import { withWithheld } from 'website-opportunities/domain/plan-withheld.mjs'
import { site } from './draft-revision-fixtures.mjs'

export const SERVICE = 'service-wild-meadow-bouquet'
export const NEW_NAME = 'Hedgerow bouquet'
export const HELD_PERSON = 'Wenna Clout'
export const SITE_NAME = 'Meadowlight Flowers'

const base = () => ({
  plan: structuredClone(site.build.approval.plan),
  profile: structuredClone(site.build.approval.profile)
})
const blockOf = (plan, id) => plan.pages.flatMap((p) => p.blocks).find((b) => b.id === id)
const factOf = (plan, id) => plan.facts.find((f) => f.id === id)

/** Each edit: `{plan, profile}` of revision 2, from revision 1. */
export const EDITS = {
  'rename a service': ({ plan, profile }) => {
    plan.items.find((i) => i.id === SERVICE).label = NEW_NAME
    profile.items.service.find((s) => s.id === SERVICE).fields['offering.name'].value = NEW_NAME
  },
  'remove a service': ({ plan }) => {
    blockOf(plan, 'classes-b4').data = [SERVICE]
    plan.pages = plan.pages.filter((p) => p.id !== 'class-2')
  },
  'add a service': ({ plan }) => {
    blockOf(plan, 'classes-b4').data.push('service-wedding-table-set')
    const page = structuredClone(plan.pages.find((p) => p.id === 'class-2'))
    Object.assign(page, { id: 'class-3', name: 'Wedding table set' })
    for (const b of page.blocks) b.id = b.id.replace('class-2-', 'class-3-')
    page.blocks.at(-1).data = ['service-wedding-table-set']
    plan.pages.splice(plan.pages.findIndex((p) => p.id === 'class-2') + 1, 0, page)
  },
  'change the phone': ({ plan, profile }) => {
    factOf(plan, 'contact-phone').value = '+1 555 0100 377'
    profile.facts['contact.phone'][0].value = '+1 555 0100 377'
  },
  'change the site name': ({ plan, profile }) => {
    factOf(plan, 'business-name').value = 'Larkspur Stems'
    profile.facts['business.name'][0].value = 'Larkspur Stems'
  },
  'hold a reviewer': (draft) => {
    draft.profile = withWithheld(draft.profile, { withheld: { people: [HELD_PERSON] } })
  },
  'hold the business name': (draft) => {
    draft.profile = withWithheld(draft.profile, { withheld: { name: true, siteName: SITE_NAME } })
    factOf(draft.plan, 'business-name').value = SITE_NAME
  },
  'reorder services': ({ plan }) => {
    blockOf(plan, 'classes-b4').data.reverse()
  },
  'change nothing': () => {},
  'rename a page': ({ plan }) => {
    plan.pages.find((p) => p.id === 'contact').name = 'Find the shop'
  }
}

/** Revision 2 of the florist's plan after one edit. */
export function revisedBy(name, edits = EDITS) {
  const draft = base()
  edits[name](draft)
  draft.plan.revision += 1
  return draft
}

const ID_PLACES = [/(Itemid=)(\d+)/g, /([?&]id=)(\d+)/g, /(tracy-tabs-)(\d+)/g]
/**
 * What a memory site shows, with every id a build made named by its record's mark (a menu item's alias, a module's note)
 * so that two builds that made their records in another order compare equal. Ids of the blank site stay as they are.
 */
export function canonicalOf(memory) {
  const { records, slots, assignments, uploads, identity } = memory.site
  const names = new Map()
  for (const [kind, table] of Object.entries(records))
    for (const [id, row] of table)
      if (id >= 1000) names.set(id, `${kind}:${row.note || row.alias || row.title}`)
  const name = (id) => names.get(Number(id)) ?? String(id)
  // An id the build made, in a link, a tab position or a quoted number of a stored setting (`item_id`).
  const quoted = (v) =>
    v.replace(/\\?"(\d+)\\?"/g, (all, id) => (names.has(Number(id)) ? `"<${name(id)}>"` : all))
  const text = (value) =>
    typeof value === 'string'
      ? quoted(ID_PLACES.reduce((v, re) => v.replace(re, (_, a, id) => `${a}<${name(id)}>`), value))
      : value
  const row = (r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, k === 'id' || k === 'catid' ? name(v) : text(v)])
    )
  const sorted = (entries) => entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return structuredClone({
    records: Object.fromEntries(
      Object.entries(records).map(([kind, table]) => [
        kind,
        sorted([...table].map(([id, r]) => [name(id), row(r)]))
      ])
    ),
    slots: [...slots.entries()].map(([key, s]) => [key, text(s.current), Boolean(s.removed)]),
    assignments: sorted([...assignments].map(([id, m]) => [name(id), m.map((x) => (x === 0 ? 0 : name(x)))])),
    uploads: sorted([...uploads.entries()]),
    identity
  })
}
