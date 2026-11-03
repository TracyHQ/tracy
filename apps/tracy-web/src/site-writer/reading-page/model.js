// The copy reading page's model (ADR 0042): the plan, the written copy, the brief and the latest check result joined
// into what the page shows, in plan order. Pure: files in, a plain object out. Nothing is judged here; a slot is red
// only when the copy check listed a failure for it.
const asArray = (x) => (Array.isArray(x) ? x : [])
const sum = (items) => items.reduce((n, t) => n + [...String(t)].length, 0)

/** The failures of a check result by their "where", in rule order. */
function failureIndex(check) {
  const byWhere = new Map()
  for (const rule of asArray(check?.rules))
    for (const f of asArray(rule.failures)) {
      const list = byWhere.get(f.where) ?? []
      list.push({
        rule: rule.id,
        title: rule.title,
        cause: f.cause ?? null,
        detail: String(f.detail ?? '').replace(`${f.where}: `, '')
      })
      byWhere.set(f.where, list)
    }
  return byWhere
}

export function buildModel({ plan, brief, copy, check, run, standing }) {
  const failures = failureIndex(check)
  const placed = new Set()
  const take = (where) => {
    placed.add(where)
    return failures.get(where) ?? []
  }
  const facts = new Map(asArray(brief?.facts).map((f) => [f.id, f]))
  const factsOf = (ids) =>
    asArray(ids).map((id) => {
      const f = facts.get(id)
      return {
        id,
        field: f?.field ?? null,
        value: f?.value ?? null,
        evidence: f?.evidence ?? f?.quote ?? null
      }
    })
  const written = new Map()
  for (const s of asArray(copy.slots)) if (!written.has(s.slot)) written.set(s.slot, s)
  const alts = new Map(asArray(copy.alts).map((a) => [a.frame, a.text]))
  const returns = asArray(copy.returns)
  const returned = new Map(returns.filter((r) => r.slot).map((r) => [r.slot, r.reason]))
  const shown = new Set()

  const slotView = (entry, label = null) => {
    const w = written.get(entry.slot)
    shown.add(entry.slot)
    const items = w ? (Array.isArray(w.text) ? w.text : [w.text]) : []
    const fails = take(entry.slot)
    const limitText = fails.map((f) => /limit (\d+)/.exec(f.detail)?.[1]).find(Boolean)
    return {
      slot: entry.slot,
      label,
      says: entry.says ?? null,
      basis: entry.basis ?? null,
      facts: factsOf(entry.factIds),
      owner: w?.owner ?? null,
      items,
      chars: sum(items),
      limit: entry.maxCharacters ?? (limitText ? Number(limitText) : null),
      written: Boolean(w),
      returnedReason: returned.get(entry.slot) ?? null,
      failures: fails
    }
  }
  const pictureView = (p) => ({
    frame: p.frame,
    kind: p.kind ?? null,
    size: p.size ?? null,
    shows: p.shows ?? null,
    alt: alts.get(p.frame) ?? null,
    failures: take(p.frame)
  })
  const blockView = (b) => {
    if (b.decision && b.decision !== 'keep')
      return { id: b.block, decision: b.decision, why: b.why ?? null, slots: [], pictures: [], hidden: [] }
    const slots = asArray(b.copy).map((c) => slotView(c))
    const pictures = asArray(b.pictures).map(pictureView)
    for (const list of asArray(b.lists))
      asArray(list.items).forEach((item, i) => {
        const label = `${list.list} row ${i + 1}${item.about ? `: ${item.about}` : ''}`
        for (const c of asArray(item.copy)) slots.push(slotView(c, label))
        for (const p of asArray(item.pictures)) pictures.push(pictureView(p))
      })
    return {
      id: b.block,
      decision: 'keep',
      why: b.why ?? null,
      slots,
      pictures,
      hidden: asArray(b.hiddenSlots).map((h) => ({ slot: h.slot, why: h.why ?? null }))
    }
  }
  const seoOf = (page) => {
    const s = asArray(copy.seo).find((e) => e.page === page)
    return {
      title: s?.title ?? null,
      description: s?.description ?? null,
      titleFailures: take(`${page} (title)`),
      descriptionFailures: take(`${page} (description)`)
    }
  }
  const bodyOf = (page) => {
    const p = asArray(copy.pages).find((e) => e.page === page)
    if (!p) return null
    return {
      title: p.title,
      body: asArray(p.body).map((text, i) => ({ text, failures: take(`${page} (body ${i + 1})`) }))
    }
  }

  const sharedBlocks = asArray(plan.sharedBlocks).map(blockView)
  const pages = asArray(plan.pages).map((p) => ({
    id: p.id,
    decision: p.decision,
    why: p.why ?? null,
    blocks: p.decision === 'keep' ? asArray(p.blocks).map(blockView) : [],
    seo: p.decision === 'keep' ? seoOf(p.id) : null
  }))
  for (const p of pages) if (p.seo) p.failures = take(p.id)
  const legal = asArray(plan.site?.legalPages).map((l) => ({
    id: l.id,
    kind: l.kind,
    says: l.says ?? null,
    slug: l.slug ?? null,
    seo: seoOf(l.id),
    page: bodyOf(l.id),
    failures: take(l.id)
  }))
  const notFound = {
    says: plan.site?.notFound?.says ?? null,
    page: bodyOf('notFound'),
    failures: take('notFound')
  }
  const strays = [...written.values()]
    .filter((s) => !shown.has(s.slot))
    .map((s) => slotView({ slot: s.slot, factIds: s.factIds }, 'not a slot of the plan blocks'))
  const fixedUp = new Set([...failures.keys()].filter((k) => !placed.has(k)))
  const unplaced = [...fixedUp].flatMap((k) => failures.get(k).map((f) => ({ where: k, ...f })))
  const allSlots = [...sharedBlocks, ...pages.flatMap((p) => p.blocks)].flatMap((b) => b.slots).concat(strays)

  return {
    run: run ?? null,
    kit: copy.fingerprint?.kit ?? plan.kit ?? null,
    language: plan.site?.language ?? null,
    checker: check?.meta?.checker ?? null,
    summary: check?.summary ?? null,
    counts: {
      slots: allSlots.length,
      failing: allSlots.filter((s) => s.failures.length || (!s.written && !s.returnedReason)).length,
      returns: returns.length,
      failures: [...failures.values()].reduce((n, l) => n + l.length, 0)
    },
    sharedBlocks,
    pages,
    legal,
    notFound,
    strays,
    notebook: asArray(copy.notebook),
    returns,
    standing: String(standing ?? '')
      .split('\n')
      .filter(Boolean),
    unplaced
  }
}
