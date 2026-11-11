// Shared: the site writer, the write step and the brand step read it, so it lives in lib/ (module-graph.test.mjs).
// Exports a site-copy/1 file (ADR 0042) as the mapping the Joomla content contract write door accepts
// (`applyJoomlaContract`): { contract, revision, changes: { <content map key>: string }, evidence, pending, emptyLinks }.
// Pure: no I/O, no network, no site. Nothing is written anywhere; the caller decides what to do with the result.
//
// The main menu dropdown labels are copy slots like any other (`menuItem-195.0` in `changes`). The menu items to hide
// are not words, so they are not in the copy file: given the plan and the content map, the export derives them
// (main-menu.js) into `extras.mainMenu.hide` for step 9, which the write door does not take today.
//
// The kit's platform chooses the door: `platform: 'wordpress'` maps to the WordPress content contract door
// (contract-mapping-wordpress.js), with the same extras; any other platform keeps the Joomla mapping above.
import { readCopy } from '../site-copy-view.js'
import { mainMenuOf } from './main-menu.js'
import { contentMapKey } from '../content-map-key.js'
import { withEmphasis } from './inline-emphasis.js'
import { kitSlotIndex } from '../template-kit/kit-slots.js'
import { wordpressContractMapping } from './contract-mapping-wordpress.js'
import { articleExportProblems } from './article-provenance.js'

const BULLET_ALL = (slot) => Number(slot?.bullets) > 0 && !(Number(slot?.paragraphs) > 0)

// A content map stores markup as plain text with doubled round brackets: a paragraph is `((p))text((/p))`, a bullet
// list `((ul))` with one `((li))text((/li))` per item (see the ja-tour and ja-seven content maps). A slot written as
// one string is exported as is. A list of strings is joined by the slot's format: bullets when the kit shows only
// bullets, otherwise paragraphs. Without a kit, a list is read as paragraphs, the common case.
export function joinItems(items, kitSlot, sample = '') {
  if (items.length === 1) return items[0]
  const form = listFormOf(sample)
  if (form) {
    const lead = form.lead ? [`${form.lead}${items[0]}((/p))`] : []
    const rest = form.lead ? items.slice(1) : items
    return [
      ...lead,
      `${form.open}\n${rest.map((t) => `((li))${t}((/li))`).join('\n')}\n((/${form.tag}))`
    ].join('\n')
  }
  if (BULLET_ALL(kitSlot)) return `((ul))\n${items.map((t) => `((li))${t}((/li))`).join('\n')}\n((/ul))`
  return items.map((t) => `((p))${t}((/p))`).join('\n')
}

/**
 * The form of a template sample that holds a list: the list tag with its own attributes (`((ul class="x"))`), and the
 * opening of the paragraph that leads it, if the sample has text before the list. Null when the sample has no list.
 */
export function listFormOf(sample) {
  const text = String(sample ?? '')
  const list = /\(\(\s*(ul|ol)((?:\s[^()]*)?)\s*\)\)/i.exec(text)
  if (!list) return null
  const before = text.slice(0, list.index)
  const lead = /\(\(\s*p(?:\s[^()]*)?\s*\)\)/i.exec(before)
  const tag = list[1].toLowerCase()
  return { tag, open: list[0], lead: lead && before.replace(/\(\([^()]*\)\)/g, '').trim() ? lead[0] : null }
}

/**
 * Where each footer column heading of the plan sits: the kit's navigation group of each `site.footerMenu[].group`
 * gives its title slot and its block (the group's `block`, else the kit block that lists the title slot). For the
 * reading page, which has no kit.
 */
export function footerHeadingsOf(plan, kit) {
  const groups = new Map((kit?.site?.navigationGroups ?? []).map((g) => [g?.id, g]))
  const slots = kitSlotIndex(kit)
  const blockOf = (slot) =>
    (kit?.blocks ?? []).find((b) =>
      [...(b.slots ?? []), ...(b.lists ?? []).flatMap((l) => l.rowSlots ?? [])].some((s) => s.id === slot)
    )?.id ?? null
  return (plan?.site?.footerMenu ?? [])
    .map((m) => ({ m, g: groups.get(m?.group) }))
    .filter(({ g }) => typeof g?.titleSlot === 'string' && g.titleSlot)
    .map(({ m, g }) => ({
      group: g.id,
      slot: g.titleSlot,
      block: typeof g.block === 'string' ? g.block : blockOf(g.titleSlot),
      says: m.heading?.says ?? null,
      maxCharacters: slots.get(g.titleSlot)?.maxCharacters ?? null
    }))
}

/**
 * The main menu as step 9 needs it: every main menu item in menu order with the label it ends up with (from the copy;
 * null when the copy has none), the items to hide, and the plan children that matched no item.
 */
export function mainMenuExport({ plan, kit, contentMap, copy }) {
  const menu = mainMenuOf({ plan, kit, contentMap })
  const { view } = readCopy(copy)
  const text = new Map(view.slots.map((s) => [s.slot, s.items.join(' ')]))
  const slots = new Map(menu.slots.map((s) => [s.slot, s]))
  return {
    menutype: menu.menutype,
    items: menu.items.map((i) => ({
      item: i.item,
      slot: i.slot,
      path: i.path,
      parent: i.parent,
      state: i.state,
      label: text.get(i.slot) ?? null,
      demo: i.demo,
      ...(i.intent !== undefined ? { intent: i.intent } : {}),
      ...(slots.has(i.slot) ? { maxCharacters: slots.get(i.slot).maxCharacters, writer: true } : {}),
      ...(i.why ? { why: i.why } : {})
    })),
    hide: menu.hidden,
    problems: menu.problems
  }
}

/**
 * @param {{ copy: object, contract: string, revision: string, kit?: object, brief?: { facts?: {id:string,value:string}[] },
 *   plan?: object, contentMap?: object | null, platform?: string }} input with `plan` and `contentMap`,
 *   `extras.mainMenu` carries the main menu labels and the items to hide (mainMenuExport); `platform` is the kit's
 *   (openKit), "wordpress" for the WordPress door, else the Joomla one
 * @returns {{ mapping: object, extras: { alts: Record<string,string>, pageMeta: Record<string,{title:string,description:string}>, pages: Record<string,{title:string,body:string[]}>, mainMenu?: object }, problems: object[] }}
 */
export function exportContractMapping({ copy, contract, revision, kit, brief, plan, contentMap, platform }) {
  const { view, problems } = readCopy(copy)
  const articleProblems = articleExportProblems({ kit, plan, brief, view })
  problems.push(...articleProblems)
  const blocked = new Set(articleProblems.map((p) => p.where))
  view.slots = view.slots.filter((s) => !blocked.has(s.slot))
  const safeCopy = blocked.size
    ? { ...copy, slots: (copy.slots ?? []).filter((s) => !blocked.has(s.slot)) }
    : copy
  if (platform === 'wordpress') {
    const mainMenu = plan && contentMap ? mainMenuExport({ plan, kit, contentMap, copy }) : null
    const out = wordpressContractMapping({
      copy: safeCopy,
      contract,
      revision,
      brief,
      contentMap,
      menuSlots: new Set((mainMenu?.items ?? []).map((i) => i.slot))
    })
    return {
      mapping: out.mapping,
      extras: extrasOf({ view, plan, kit, mainMenu }),
      problems: [...articleProblems, ...out.problems]
    }
  }
  const kitSlots = kitSlotIndex(kit)
  const samples = new Map((contentMap?.slots ?? []).map((c) => [c?.key, c?.sample]))
  const facts = new Map((brief?.facts ?? []).map((f) => [f.id, f.value]))
  const changes = {}
  const evidence = {}
  for (const s of view.slots) {
    const key = contentMapKey(s.slot)
    // The writer's emphasis is wrapped in the demo's span; a slot whose demo marks no span ignores it (ADR 0042 section 11).
    const kitSlot = kitSlots.get(s.slot)
    changes[key] = joinItems(withEmphasis(s.items, s.emphasis, kitSlot), kitSlot, samples.get(key))
    if (s.factIds.length) {
      const cited = s.factIds.map((id) => (facts.has(id) ? `${id}: ${facts.get(id)}` : id))
      evidence[key] = `Brief facts: ${cited.join('; ')}`
    }
  }
  const mainMenu = plan && contentMap ? mainMenuExport({ plan, kit, contentMap, copy }) : null
  return {
    mapping: { contract, revision, changes, evidence, pending: [], emptyLinks: [] },
    extras: extrasOf({ view, plan, kit, mainMenu }),
    problems
  }
}

/** What the door does not take, for either platform: alt texts, page meta, pages without kit slots, the menus. */
function extrasOf({ view, plan, kit, mainMenu }) {
  return {
    alts: Object.fromEntries(view.alts.map((a) => [a.frame, a.text])),
    pageMeta: Object.fromEntries(
      view.seo.map((s) => [s.page, { title: s.title, description: s.description }])
    ),
    pages: Object.fromEntries(view.pages.map((p) => [p.page, { title: p.title, body: p.body }])),
    ...(plan && kit ? { footerHeadings: footerHeadingsOf(plan, kit) } : {}),
    ...(mainMenu ? { mainMenu } : {})
  }
}

export { contentMapKey }
