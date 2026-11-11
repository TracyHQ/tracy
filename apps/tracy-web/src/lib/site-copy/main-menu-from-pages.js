// A header without menu label slots cannot vote for its Joomla menu. Only an unambiguous intersection of the
// planned page paths and released menu identities may identify it. This fallback owns no writer label slots.
const each = (x) => (Array.isArray(x) ? x : [])
const pathOf = (x) => String(x ?? '').replace(/^\/+|\/+$/g, '')
const up = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null)
const refusal = (detail) => ({
  menutype: null,
  items: [],
  slots: [],
  hidden: [],
  problems: [{ page: null, parent: null, detail }]
})

export function mainMenuFromPages({ plan, kit, entities, demo }) {
  const pages = new Map(
    each(kit?.pages)
      .filter((p) => typeof p?.path === 'string')
      .map((p) => [p.id, pathOf(p.path)])
  )
  const planned = []
  const collect = (items) => {
    for (const item of each(items)) {
      if (pages.has(item?.page)) planned.push(pages.get(item.page))
      collect(item?.children)
    }
  }
  collect(plan?.mainMenu)
  if (!planned.length) return refusal('no planned page paths identify the main menu')
  let types = null
  for (const path of planned) {
    const matches = new Set(
      [...entities.values()]
        .filter((e) => pathOf(e.identity?.path) === path && String(e.identity?.client_id ?? '0') === '0')
        .map((e) => e.identity?.menutype)
        .filter((t) => typeof t === 'string' && t)
    )
    // Joomla's default page can serve / with an unrelated stored path such as home. Never guess that alias.
    if (!matches.size && path === '') continue
    if (!matches.size) return refusal(`the planned path /${path} identifies no menu item`)
    types = types === null ? matches : new Set([...types].filter((t) => matches.has(t)))
  }
  if (types?.size !== 1) return refusal('the planned page paths do not identify one main menu')
  const menutype = [...types][0]
  const tree = [...entities.values()]
    .filter((e) => e.identity?.menutype === menutype && String(e.identity?.client_id ?? '0') === '0')
    .map((e) => ({ item: e.key, slot: `${e.key}.0`, path: pathOf(e.identity?.path) }))
  const byPath = new Map(tree.map((n) => [n.path, n]))
  if (byPath.size !== tree.length) return refusal('the inferred main menu has ambiguous duplicate paths')
  const known = new Set(pages.values())
  const keep = new Set(planned)
  for (const p of each(plan?.pages))
    if (p?.decision === 'keep' && pages.has(p.page)) keep.add(pages.get(p.page))
  // Unrepresented nodes are not authority to unpublish anything. Preserve them and every ancestor they need.
  // This includes the real default Home whose stored path is absent from the kit's page paths.
  for (const n of tree) if (!known.has(n.path)) keep.add(n.path)
  for (const path of [...keep]) {
    let parent = up(path)
    while (parent !== null) {
      if (byPath.has(parent)) keep.add(parent)
      parent = up(parent)
    }
  }
  const items = tree.map((n) => {
    const parent = byPath.get(up(n.path))?.item ?? null
    const shown = keep.has(n.path)
    return {
      item: n.item,
      slot: n.slot,
      path: `/${n.path}`,
      parent,
      demo: demo.get(n.slot) ?? null,
      state: shown ? (parent ? 'shown' : 'top') : 'hidden',
      ...(!shown ? { why: 'the plan does not keep this kit-mapped main menu page' } : {})
    }
  })
  const hidden = items
    .filter((n) => n.state === 'hidden')
    .map(({ item, slot, path, why }) => ({ item, slot, path, why }))
  return { menutype, items, slots: [], hidden, problems: [] }
}
