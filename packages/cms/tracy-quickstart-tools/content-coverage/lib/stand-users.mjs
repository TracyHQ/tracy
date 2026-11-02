// Accounts of the machine a quickstart is measured on are not demo content. A stand gets a local admin account so a
// person can sign in; the release's database does not hold it, yet an author list (Joomla's author view) prints it
// with a link to its author page. With the release database given (`--db-dump`), the audit never follows a link to
// the author page of a user the database lacks, and drops that user's entry from the page: the link, its words, and
// the same words elsewhere on the page (the picture's text). Without the database nothing is filtered.

const norm = (s) =>
  String(s ?? '')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .toLowerCase()

/** The user an author page link names (`.../author/<user>`), or null. */
function authorOf(href) {
  const m = /\/author\/([^/?#]+)/i.exec(String(href ?? ''))
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

/**
 * @param {{users: string[] | null | undefined}} input the names and logins of the release database's users
 */
export function standUserFilter({ users }) {
  const known = users ? new Set(users.map(norm)) : null
  const isStandLink = (href) => {
    if (!known) return false
    const user = authorOf(href)
    return user !== null && !known.has(norm(user))
  }
  const hrefOf = (it) => (it.kind === 'link' ? it.value : it.href)
  /** The item lists of one page (one per viewport), without the entries of users the database lacks. */
  const dropItems = (lists) => {
    if (!known) return lists
    const names = new Set()
    for (const items of lists)
      for (const it of items)
        if (it.kind === 'text' && isStandLink(it.href) && norm(it.value)) names.add(norm(it.value))
    return lists.map((items) =>
      items.filter(
        (it) =>
          !isStandLink(hrefOf(it)) &&
          !((it.kind === 'text' || it.kind === 'attr') && names.has(norm(it.value)))
      )
    )
  }
  return { isStandLink, dropItems }
}
