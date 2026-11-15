// The Joomla page records of the structure measurement (ticket #586): which record a built page stands on, and how a
// hidden record is published again (measured on plugin 0.24.85, `ai-quickstart-contract.md`: `{published: 1}` brings
// a menu item back with every page below it; an article takes `{state: 1}`). Pure.

/** The fields that publish a record again: the inverse of the door client's `hide`. */
export const shownFields = (kind) => (kind === 'article' ? { state: 1 } : { published: 1 })

/**
 * A page of `sitePages` with the record it stands on (`{kind, id}`, from the write record key it came from) and
 * whether it is the home page.
 * @param {{from: string, path: string}} page
 * @param {{ids?: Record<string, number>}} record
 */
export function withRecord(page, record) {
  const kind = /^(menuItem|article|contact):/.exec(String(page.from ?? ''))?.[1] ?? null
  const id = kind ? (record?.ids?.[page.from] ?? null) : null
  return { ...page, home: page.path === 'index.php', record: kind && id ? { kind, id } : null }
}
