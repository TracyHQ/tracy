/**
 * The plans containers of `copy-proof.mjs` (ticket #584): every block placed `inside:` a container, copied, written,
 * drawn and read back, on one page holding two container copies.
 *
 * The container copy draws every module of the position it names (`holds.position`) that is assigned to the page,
 * and prints each module's title as the label of its tab: the tab label is a field of the container block
 * (`placements[<held>].title.field`) written at the held copy's module title. Two container copies naming the store
 * position each draw the tabs of both. The procedure that keeps them apart: create the container copy, then write
 * `tracy-tabs-<container copy id>` (a position no layout of the template prints on its own) at `holds.position` of
 * the container copy, and give that position to the copies it holds (the `container` reset).
 */

/** Prove the containers and the blocks they hold; return the module types shown. */
export async function proveHeld(ctx, parts) {
  const { K, door, lib, base, mapping, step, marker, count, copy, menuItem, own, placed } = ctx
  const { textFields, companions, cut, LANDING } = parts
  const write = (fields, values) => values.reduce((out, v) => K.setAt(out, v.at, v.value, lib), fields)
  const plans = await menuItem('Proof Plans', 'mainmenu', LANDING)
  const boxBlock = placed.find((b) => mapping.placements[b.id].holds)
  const box = mapping.placements[boxBlock.id]
  const heldBlocks = box.holds.blocks.map((id) => placed.find((b) => b.id === id))
  // Two container copies on one page: the first holds two blocks, the second the third one.
  const groups = [heldBlocks.filter((_, i) => i !== 1), [heldBlocks[1]]]
  let n = 800
  const fill = (b) => textFields(b).map((f) => ({ at: f.at, value: marker(n++, f.field.limit) }))
  const containers = []
  for (const group of groups) {
    const text = fill(boxBlock)
    const id = await copy(box.entity, (f) => write(f, [...companions(boxBlock), ...text]), [plans])
    const tabs = []
    for (const b of group) {
      const field = mapping.placements[b.id].title.field
      const limit = boxBlock.fields.find((f) => f.name === field.name).limit
      const label = { at: mapping.blocks[field.block].fields[field.name], value: marker(n++, limit) }
      const values = fill(b)
      const tab = await copy(own(b), (f) => write(cut(b.id, 1)(f), [...companions(b), label, ...values]), [
        plans
      ])
      tabs.push({ block: b.id, id: tab, label, values })
    }
    containers.push({ id, text, tabs })
  }
  const labels = containers.flatMap((c) => c.tabs.map((t) => t.label.value))
  const shared = await K.pageHtml(base, plans)
  step(
    'two plans containers sharing the store position: each draws the tabs of both',
    labels.every((l) => count(shared, l) >= 2),
    { labelCounts: labels.map((l) => count(shared, l)) }
  )
  // The procedure: a position of its own per container copy, written on the container and on the copies it holds.
  for (const c of containers) {
    c.position = `tracy-tabs-${c.id}`
    const record = await door.get('module', c.id)
    await door.update('module', c.id, { params: K.setAt(record, box.holds.position, c.position, lib).params })
    for (const t of c.tabs) await door.update('module', t.id, { position: c.position })
  }
  const html = await K.pageHtml(base, plans)
  // Each container's tabs print between its own words and the next container's.
  const starts = containers.map((c) => html.indexOf(c.text[0].value))
  const order = [...starts].sort((a, b) => a - b)
  const inside = containers.every((c, i) => {
    const end = order.find((s) => s > starts[i]) ?? html.length
    return c.tabs.every((t) => {
      const at = html.indexOf(t.label.value)
      return at > starts[i] && at < end
    })
  })
  step(
    'a position of its own per container copy keeps them apart',
    labels.every((l) => count(html, l) === 1) && inside,
    {
      labelCounts: labels.map((l) => count(html, l)),
      tabsInsideTheirContainer: inside,
      positions: containers.map((c) => c.position)
    }
  )
  const types = new Set()
  for (const c of containers) {
    const record = await door.get('module', c.id)
    const unread = c.text.filter((v) => K.getAt(record, v.at, lib) !== v.value).length
    const position = K.getAt(record, box.holds.position, lib)
    const missing = c.text.filter((v) => !html.includes(v.value)).length
    if (
      step(`container ${boxBlock.id} as module ${c.id}`, !unread && !missing && position === c.position, {
        written: c.text.length,
        readBack: !unread,
        printed: c.text.length - missing,
        position
      })
    )
      types.add(mapping.entities[box.entity].identity?.module)
    for (const t of c.tabs) {
      const tab = await door.get('module', t.id)
      const all = [t.label, ...t.values]
      const unreadTab = all.filter((v) => K.getAt(tab, v.at, lib) !== v.value).length
      const printed = all.filter((v) => count(html, v.value) === 1).length
      step(
        `held ${t.block} as module ${t.id} in container ${c.id}`,
        !unreadTab && printed === all.length && tab.position === c.position,
        {
          written: all.length,
          readBack: !unreadTab,
          printedOnce: printed,
          tabLabel: t.label.at.column,
          position: tab.position
        }
      )
    }
  }
  return types
}
