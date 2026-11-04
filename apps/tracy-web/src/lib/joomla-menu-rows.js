// Every menu item of a Joomla site through the content door. Shared: the write step writes through the rows and the site
// check reads where a page is shown from them, so it is in lib/ (module-graph.test.mjs).

const each = (value) => (Array.isArray(value) ? value : [])
const PAGE_ROWS = 25

/** Every menu item, whole rows, a page of the door at a time. */
export async function menuRows(call) {
  const rows = []
  for (let offset = 0; offset < 5000; offset += PAGE_ROWS) {
    const answer = await call('content.list', {
      kind: 'menuItem',
      limit: PAGE_ROWS,
      offset,
      include_body: true
    })
    const items = each(answer?.items)
    rows.push(...items)
    if (items.length < PAGE_ROWS) break
  }
  return rows
}
