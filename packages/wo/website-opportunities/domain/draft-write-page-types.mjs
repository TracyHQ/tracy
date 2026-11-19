// The pages of a write order the kit can make (#575). A page whose type the kit does not declare
// (`page_type_not_declared`), or declares the write cannot make (`pages.<type>.unbuilt`, `page_unbuilt`), is left out
// of the write and listed, never a stopped build; the other pages' links to it are left to the write's own skips. Only a
// kit with `pages` is read. Pure: returns the order, or a copy without those pages.

/**
 * @param {{pages: object[]}} order the write order
 * @param {{mapping: {pages?: Record<string, {unbuilt?: {code?: string}}>}}} kit the draft write kit
 * @param {object[]} left the list the left out pages are added to
 */
export function writableOrderOf(order, kit, left) {
  const declared = kit.mapping.pages
  if (!declared) return order
  const out = (page) => {
    const decl = declared[page.pageType]
    if (!decl) return 'page_type_not_declared'
    return decl.unbuilt ? 'page_unbuilt' : null
  }
  const gone = order.pages.filter((page) => out(page))
  if (!gone.length) return order
  for (const page of gone)
    left.push({
      code: out(page),
      op: `page:${page.id}`,
      place: page.pageType ?? null,
      reason: declared[page.pageType]?.unbuilt?.code ?? null,
      at: 'plan'
    })
  return { ...order, pages: order.pages.filter((page) => !out(page)) }
}
