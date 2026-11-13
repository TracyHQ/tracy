/**
 * The masthead of `copy-proof.mjs` (ticket #584), built the way the build builds it, through its mapping locations.
 *
 * One copy for the site holds one row of `menuitem_config` per page that places it, each printed only on the page its
 * key (`item_id`) names; a placed page with no row prints the default title and intro. The build writes every value
 * at its mapping location (the demo row index: a list row at its index, the row a `pageType` key names at its own),
 * writes the key of each row (`keyAt`) to the id of its page, then cuts every row it did not write (`row` hide),
 * keeping the written rows in their order. A written row then sits at its position among the kept rows, where it is
 * read back. The copy is assigned to the pages whose recipe places it (`recipe-pages`).
 */

/** Prove the masthead; return the module types shown. */
export async function proveMasthead(ctx, parts) {
  const { K, door, lib, base, mapping, step, marker, count, copy, menuItem, own, placed } = ctx
  const { textFields, companions, rowHide, DEFAULT, home } = parts
  const mast = placed.find((b) => b.id === 'block-162')
  const entry = mapping.placements[mast.id]
  const places = mapping.blocks[mast.id]
  const row = rowHide(mast.id).row
  const depth = row.parent.length
  const rowOf = (loc) => loc.jsonPath[depth + 1]
  const pageA = await menuItem('Proof Masthead A', 'mainmenu', DEFAULT)
  const pageB = await menuItem('Proof Masthead B', 'mainmenu', DEFAULT)
  const keyedPage = await menuItem('Proof Masthead Keyed', 'mainmenu', DEFAULT)
  const noRow = await menuItem('Proof Masthead Default', 'mainmenu', DEFAULT)
  let n = 900
  // The fields outside the list: the default title (the business name fact), the default intro, and the row a page
  // type keys (its fields and its key place).
  const name = mapping.facts.name.find((at) => at.entity === own(mast))
  const single = [
    {
      at: name,
      value: marker(n++, mast.fields.find((f) => f.name === 'default-title').limit),
      role: 'default'
    },
    ...textFields(mast).map((f) => ({
      at: f.at,
      value: marker(n++, f.field.limit),
      role: rowOf(f.at) === undefined ? 'default' : 'keyed'
    })),
    ...companions(mast).map((c) => ({ ...c, role: 'keyed', image: true }))
  ]
  const keyed = Object.values(places.fields).find((e) => e?.keyAt && e.pageType)
  // Two rows of the list, one per page: the first rows of the list, in order.
  const list = places.lists.pages.fields
  const limits = Object.fromEntries(mast.lists[0].fields.map((f) => [f.name, f.limit]))
  const listRows = [pageA, pageB].map((page, i) => ({
    page,
    index: rowOf(list.title[0][i]),
    values: [
      { at: list.title[0][i], value: marker(n++, limits.title) },
      { at: list.intro[0][i], value: marker(n++, limits.intro) }
    ],
    key: { at: list.page.keyAt[0][i], value: String(page) }
  }))
  const keys = [...listRows.map((r) => r.key), { at: keyed.keyAt, value: String(keyedPage) }]
  const kept = [...listRows.map((r) => r.index), rowOf(keyed.keyAt)]
  const all = [...single, ...listRows.flatMap((r) => r.values), ...keys]
  const assigned = entry.assign === 'recipe-pages' ? [pageA, pageB, keyedPage, noRow] : [0]
  const id = await copy(
    own(mast),
    (f) =>
      K.cutRows(
        all.reduce((out, v) => K.setAt(out, v.at, v.value, lib), f),
        row,
        kept
      ),
    assigned
  )
  const record = await door.get('module', id)
  const unread = all
    .filter((v) => K.getAt(record, K.movedAfterCut(v.at, row, kept), lib) !== v.value)
    .map((v) => v.at.slot ?? v.at.jsonPath.join('.'))
  const rowsLeft = K.getAt(record, { ...row, jsonPath: [...row.parent, row.arrays[0]] }, lib)?.length
  step(
    `masthead ${mast.id} written through its mapping locations, rows cut, read back`,
    !unread.length && rowsLeft === kept.length,
    {
      module: id,
      assign: `${entry.assign} ${JSON.stringify(assigned)}`,
      written: all.length,
      keptRows: kept,
      rowsLeft,
      ...(unread.length ? { unread } : {})
    }
  )
  const html = {}
  for (const p of [pageA, pageB, keyedPage, noRow, home]) html[p] = await K.pageHtml(base, p)
  const text = (role) => single.filter((v) => v.role === role && !v.image).map((v) => v.value)
  const has = (p, values) => values.every((v) => html[p].includes(v))
  const none = (p, values) => values.every((v) => !html[p].includes(v))
  const [rowA, rowB] = listRows.map((r) => r.values.map((v) => v.value))
  const checks = {
    [`page ${pageA}: its row only`]:
      has(pageA, rowA) && none(pageA, [...rowB, ...text('default'), ...text('keyed')]),
    [`page ${pageB}: its row only`]:
      has(pageB, rowB) && none(pageB, [...rowA, ...text('default'), ...text('keyed')]),
    [`page ${keyedPage}: the ${keyed.pageType} row`]:
      has(keyedPage, text('keyed')) && none(keyedPage, [...rowA, ...rowB]),
    [`page ${noRow}: the default title and intro`]:
      has(noRow, text('default')) && none(noRow, [...rowA, ...rowB]),
    [`home ${home}: not assigned, no masthead copy`]: !html[home].includes(`id="Mod${id}"`)
  }
  step('the masthead copy draws the row of each page', Object.values(checks).every(Boolean), checks)
  step(
    'the masthead pieces print once each',
    [...rowA, ...rowB, ...text('keyed'), ...text('default')].every(
      (v) => Object.values(html).reduce((sum, h) => sum + count(h, v), 0) === 1
    )
  )
  return Object.values(checks).every(Boolean) && !unread.length
    ? new Set([mapping.entities[own(mast)].identity?.module])
    : new Set()
}
