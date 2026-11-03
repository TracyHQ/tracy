import { arr, norm, obj, str } from './rule-set.js'

// R02 facts
export function checkR02(ctx) {
  const { R, plan, facts, missingFields, withheld, isObserved, decisions, decisionParts, W } = ctx
  const r = R.r2
  if (!facts.size) r.note('cannot check: brief.facts missing or empty')
  const seenWhere = new Set()
  const labelKeys = ['block', 'id', 'page', 'slot', 'list', 'frame', 'link', 'group']
  ;(function walk(node, path, labels) {
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`, labels))
    if (!node || typeof node !== 'object') return
    let l = labels
    for (const k of labelKeys)
      if (typeof node[k] === 'string' && node[k].length < 80) l = [...l, `${k}=${node[k]}`]
    for (const [k, v] of Object.entries(node)) {
      if (k === 'factIds' || k === 'factId') {
        const ids = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []
        ids.forEach((id) => {
          const f = facts.get(id)
          const where = `${l.slice(-3).join(' / ') || 'plan'} @ ${path}.${k}`
          if (!f) return r.fail(where, `fact id ${id} not in brief.facts`)
          r.ok()
          if (missingFields.has(f.field))
            r.fail(where, `fact ${id} has field "${f.field}", which is listed in brief.missing`)
        })
        // observed-only hard claims
        if (k === 'factIds' && ids.length && ids.every((id) => isObserved(facts.get(id)))) {
          const text = str(node.says) + ' ' + str(node.about) + ' ' + str(node.how)
          if (/\d|biggest|largest|best|most|only|number one|no\.?\s?1|first/i.test(text)) {
            r.fail(
              `${l.slice(-3).join(' / ')} @ ${path}`,
              'hard claim (number or superlative) rests only on observed facts'
            )
          }
        }
        // Spec: a label that says nothing about the business is basis "trade"; a "brief" line always cites a fact.
        // Row copy (inside list items) is checked below with its own message.
        if (
          k === 'factIds' &&
          node.basis === 'brief' &&
          ids.length === 0 &&
          !/\.items\[\d+\]\.copy\[/.test(path)
        ) {
          r.fail(
            `${l.slice(-3).join(' / ')} @ ${path}`,
            `basis "brief" but no fact id cited ("${str(node.says).slice(0, 50)}"): a label that says nothing about the business is "trade"; one that names a service, sport or person cites that fact`,
            'plan'
          )
        }
      } else walk(v, `${path}.${k}`, l)
    }
  })(plan, '$', [])
  // Row copy: basis is required (brief|trade), and a "brief" line must cite at least one fact that exists.
  decisions.forEach((x) =>
    decisionParts(x.d)
      .copy.filter((c) => c.inItem)
      .forEach((c) => {
        const where = W(x, `list ${c.inItem.list} row ${c.inItem.row} / slot ${str(c.slot)}`)
        if (c.basis !== 'brief' && c.basis !== 'trade')
          return r.fail(where, `row copy has basis "${str(c.basis)}", expected "brief" or "trade"`, 'plan')
        if (c.basis !== 'brief') return r.ok()
        const real = arr(c.factIds).filter((id) => facts.has(id))
        if (!real.length)
          r.fail(
            where,
            `row copy with basis "brief" cites no fact that exists in the brief ("${str(c.says).slice(0, 50)}"): a label that says nothing about the business is "trade"; one that names a service, sport or person cites that fact`,
            'plan'
          )
        else r.ok()
      })
  )
  // items rows must cite a fact
  decisions.forEach((x) =>
    decisionParts(x.d).lists.forEach((l) =>
      arr(l.items).forEach((it, i) => {
        const item = obj(it)
        const cited = [...arr(item.copy).flatMap((c) => arr(obj(c).factIds)), ...arr(obj(item.proof).factIds)]
        if (!cited.length) r.fail(W(x, `list ${l.list} row ${i}`), 'row cites no fact id')
      })
    )
  )
  // withheld values quoted anywhere in the plan's text
  const strings = []
  ;(function collect(n, p) {
    if (typeof n === 'string') strings.push([p, n])
    else if (Array.isArray(n)) n.forEach((v, i) => collect(v, `${p}[${i}]`))
    else if (n && typeof n === 'object') Object.entries(n).forEach(([k, v]) => collect(v, `${p}.${k}`))
  })(plan, '$')
  // Only text that can reach the site is scanned. ownerTasks, forbidden[] and why/seen/avoid are notes to the owner or reviewer, not site words.
  const notSiteText = (p) =>
    /^\$\.(ownerTasks|site\.forbidden)/.test(p) || /\.(why|seen|avoid)(\[\d+\])?$/.test(p)
  withheld.forEach((w) =>
    strings
      .filter(([p]) => !notSiteText(p))
      .forEach(([p, s]) => {
        if (norm(s).includes(norm(w.value))) {
          r.fail(p, `text contains a value withheld in brief.missing (${w.field}): "${w.value}"`)
          seenWhere.add(p)
        }
      })
  )
  r.note(
    'hard-claim detection is a regex on says/about (digits, superlatives); real facts of source "observed" are detected through fact.source or evidence[].source'
  )
}

// R03 canHide:false + logo
export function checkR03(ctx) {
  const { R, plan, logoIds, slotRow, frameById, decisions, decisionParts, W } = ctx
  const r = R.r3
  const unshownRow = []
  decisions.forEach((x) => {
    const parts = decisionParts(x.d)
    const rowsOf = new Map(
      parts.lists.map((l) => [l.list, typeof l.rows === 'number' ? l.rows : arr(l.items).length])
    )
    parts.hidden.forEach((h) => {
      const f = frameById.get(h.slot)
      if (!f) return
      const sr = slotRow.get(f.id)
      if (sr && rowsOf.has(sr.list) && sr.row >= rowsOf.get(sr.list)) {
        unshownRow.push(f.id)
        return
      } // row not shown: listing it is redundant, not a hide
      if (f.canHide === false)
        r.fail(
          W(x, `frame ${f.id}`),
          `frame has canHide:false but is in hiddenSlots (${str(h.why).slice(0, 60)})`
        )
      else r.ok()
    })
  })
  if (unshownRow.length)
    r.note(
      `not failed: ${unshownRow.length} canHide:false frames listed in hiddenSlots sit in list rows past the planned row count, so they are not shown anyway (redundant entries): ${unshownRow.join(', ')}`
    )
  const logoHits = []
  ;(function walk(n, p) {
    if (typeof n === 'string') {
      if (logoIds.has(n)) logoHits.push([p, n])
    } else if (Array.isArray(n)) n.forEach((v, i) => walk(v, `${p}[${i}]`))
    else if (n && typeof n === 'object') Object.entries(n).forEach(([k, v]) => walk(v, `${p}.${k}`))
  })(plan, '$')
  logoHits.forEach(([p, id]) =>
    r.fail(p, `logo frame/spot ${id} is mentioned in the plan; logos belong to the brand step`)
  )
  if (!logoHits.length) r.ok()
  Object.keys(obj(plan.site))
    .filter((k) => /logo|favicon/i.test(k))
    .forEach((k) => r.fail(`site.${k}`, 'plan decides a logo or favicon; the brand step owns it'))
}
