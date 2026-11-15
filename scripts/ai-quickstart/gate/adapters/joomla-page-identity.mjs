// Which page a Joomla page is, whatever address it was asked at (ticket #586, review round 3): the menu item the body
// element names (`item-<id>` of T4 templates, `itemid-<id>` of the core templates) with the page title. The same page
// answers at `index.php?Itemid=<id>` and at the friendly address the menu prints (`/index.php/<alias>`); the structure
// check finds a planned page by this identity, not by its spelling. Two articles shown under one menu item differ by
// their titles. Null when the page names no menu item. Pure.

/** The identity of a page's markup, or null. */
export function joomlaPageIdentity(html) {
  const text = String(html ?? '')
  const body = /<body\b[^>]*\bclass\s*=\s*(["'])([^"']*)\1/i.exec(text)
  const item = body ? /(?:^|\s)item(?:id)?-(\d+)(?:\s|$)/i.exec(body[2])?.[1] : null
  if (!item) return null
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(text)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
  return item + '|' + title
}
