/**
 * The rules of the site plan check (`site-plan-check.js`) that read the plan's words and its order: placed facts against
 * the brief, the shared glossary, the writing order, and the actions of buttons and links. Each returns its reasons.
 */

const norm = (/** @type {unknown} */ s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])

/**
 * 🔒 A PLACED FACT MUST BE STATED BY THE BRIEF (COO rule 30/10/2026, `fact-sources.mjs`): every lead, fact and glossary
 * description of the plan is checked against the whole brief with the one business-fact detector; citations are not read.
 * @param {any} plan @param {any} site @param {any} facts - the `fact-sources` module
 */
export function factReasons(plan, site, facts) {
  const brief = [...facts.sourceTexts(site).values()].join(' \n ')
  const out = []
  const check = (/** @type {string} */ where, /** @type {unknown} */ text) => {
    const missing = facts.factsNotIn(String(text ?? ''), brief, site)
    if (missing.length)
      out.push({
        rule: 'unsourced-fact',
        element: where,
        message: `${where} places a business fact the brief does not state: ${missing.join(', ')} (in "${text}")`
      })
  }
  for (const page of list(plan?.pages).filter((p) => ['keep', 'add'].includes(p?.decision))) {
    check(page.id, page.lead)
    for (const fact of list(page.facts)) check(page.id, fact)
  }
  for (const entry of list(plan?.glossary)) check(`glossary:${entry?.name}`, entry?.description)
  return out
}

/**
 * Every item named on more than one shown page (a page's `items`, and the `items` of a card collection on it) has one
 * glossary entry with a description, so every page names it the same way.
 * @param {any} plan @param {Map<string, any>} elements @param {Set<string>} shownPages
 */
export function glossaryReasons(plan, elements, shownPages) {
  /** @type {Map<string, {name: string, pages: Set<string>}>} */
  const seen = new Map()
  const note = (/** @type {unknown} */ name, /** @type {string} */ page) => {
    if (!norm(name)) return
    const entry = seen.get(norm(name)) ?? { name: String(name).trim(), pages: new Set() }
    entry.pages.add(page)
    seen.set(norm(name), entry)
  }
  for (const page of list(plan?.pages))
    if (shownPages.has(page?.id)) for (const item of list(page.items)) note(item, page.id)
  for (const decision of list(plan?.decisions)) {
    const element = elements.get(decision?.element)
    if (element?.kind !== 'cards' || decision.decision === 'hide') continue
    for (const page of list(element.pages).filter((p) => shownPages.has(p)))
      for (const item of list(decision.items)) note(item, page)
  }
  const glossary = new Set(
    list(plan?.glossary)
      .filter((g) => norm(g?.description))
      .map((g) => norm(g?.name))
  )
  return [...seen.values()]
    .filter((item) => item.pages.size > 1 && !glossary.has(norm(item.name)))
    .map((item) => ({
      rule: 'missing-glossary',
      element: `glossary:${item.name}`,
      message: `"${item.name}" appears on ${item.pages.size} pages (${[...item.pages].join(', ')}) and has no glossary entry with a description`
    }))
}

/**
 * The writing order names every shown page once, every dependency is a shown page, no page depends on itself through
 * others, and every page comes after the pages it depends on.
 * @param {any} plan @param {Set<string>} shownPages
 */
export function orderReasons(plan, shownPages) {
  const out = []
  const order = list(plan?.writingOrder).map(String)
  const at = new Map(order.map((id, i) => [id, i]))
  const deps = new Map(
    list(plan?.pages)
      .filter((p) => shownPages.has(p?.id))
      .map((p) => [p.id, list(p.dependsOn).map(String)])
  )
  for (const [page, needs] of deps) {
    if (!at.has(page))
      out.push({
        rule: 'writing-order-missing',
        element: page,
        message: `${page} is not in the writing order`
      })
    for (const need of needs.filter((n) => !shownPages.has(n)))
      out.push({
        rule: 'writing-order-missing',
        element: page,
        message: `${page} depends on ${need}, which is not a kept or added page`
      })
  }
  for (const id of order.filter((id) => !shownPages.has(id)))
    out.push({
      rule: 'writing-order-missing',
      element: id,
      message: `the writing order names ${id}, which is not a kept or added page`
    })
  /** @type {Map<string, 'open' | 'done'>} */
  const state = new Map()
  const visit = (/** @type {string} */ page, /** @type {string[]} */ path) => {
    if (state.get(page) === 'done') return
    if (state.get(page) === 'open') {
      const cycle = [...path.slice(path.indexOf(page)), page]
      out.push({
        rule: 'writing-order-cycle',
        element: page,
        message: `the writing order has a cycle: ${cycle.join(' -> ')}`
      })
      return
    }
    state.set(page, 'open')
    for (const need of deps.get(page) ?? []) if (deps.has(need)) visit(need, [...path, page])
    state.set(page, 'done')
  }
  for (const page of deps.keys()) visit(page, [])
  for (const [page, needs] of deps)
    for (const need of needs)
      if (at.has(page) && at.has(need) && (at.get(need) ?? 0) > (at.get(page) ?? 0))
        out.push({
          rule: 'writing-order-late',
          element: page,
          message: `${page} is written before ${need}, which it depends on`
        })
  return out
}

const PHONE = /\+?\d[\d\s().-]{5,}\d/g
const digits = (/** @type {string} */ s) => s.replace(/\D+/g, '')
const webOf = (/** @type {string} */ s) =>
  s
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/.]+$/, '')

/**
 * Every kept button and link does something real for the business: opens a kept or added page, opens the item its card
 * shows (`item`, to a card row or record page), reaches a phone, email, booking address or street address the brief
 * states, or acts on its own page (`control`: a modal close, a video play, a form send).
 * @param {{elements: Map<string, any>, decided: Map<string, any>, off: (e: any) => boolean, shownPages: Set<string>,
 *   site: any, facts: any}} input
 */
export function buttonReasons({ elements, decided, off, shownPages, site, facts }) {
  const brief = [...facts.sourceTexts(site).values()].join(' \n ')
  const phones = (brief.match(PHONE) ?? []).map(digits).filter((d) => d.length >= 7)
  const real = (/** @type {any} */ action) => {
    // A control acts on the page it sits on (a modal close, a video play, a form send): real wherever it is kept.
    if (action?.kind === 'control') return true
    const target = String(action?.target ?? '').trim()
    if (!target) return false
    switch (action?.kind) {
      case 'page':
        return shownPages.has(target)
      case 'call':
      case 'whatsapp': {
        const want = digits(target)
        return want.length >= 7 && phones.some((p) => p.endsWith(want) || want.endsWith(p))
      }
      case 'email':
        return (
          /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(target) && brief.toLowerCase().includes(target.toLowerCase())
        )
      case 'booking':
        return /^https?:\/\/\S+$/i.test(target) && brief.toLowerCase().includes(webOf(target))
      case 'map':
        return norm(site?.address) !== ''
      case 'item':
        return ['cards', 'record-page', 'page'].includes(elements.get(target)?.kind) || shownPages.has(target)
      default:
        return false
    }
  }
  const out = []
  for (const [id, entry] of decided) {
    const element = elements.get(id)
    if (!['button', 'link'].includes(element?.kind) || entry.decision === 'hide' || off(element)) continue
    if (!real(entry.action))
      out.push({
        rule: 'button-no-action',
        element: id,
        message: `${id} has no real action: "${entry.action?.kind ?? ''}" to "${entry.action?.target ?? ''}" is not a kept page or a contact the brief states`
      })
  }
  return out
}
