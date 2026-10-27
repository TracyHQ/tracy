/**
 * The paths an EmDash theme's link gate knows: the keys of the `RECORDS` table in
 * `src/lib/link-gate.ts`, each the path a page record is served at (Tracy Business: `about`,
 * `services`; Tracy Base: `services` for the record `services_page`, `home-2` for `home_2`;
 * Tracy SaaS: `product/features`). A listed page missing there keeps its links and children alive
 * once unticked (PAGE-4, PAGE-7). Null when the theme has no link gate.
 */

/** @param {Map<string, string>} files the theme's source files (`template-source-tree.js`) */
export function linkGateRecords(files) {
  const gate = files.get('src/lib/link-gate.ts')
  if (gate === undefined) return null
  const table = /RECORDS[^=]*=\s*\{([^]*?)\n\}/.exec(gate)?.[1] ?? ''
  return new Set(
    [...table.matchAll(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_-]+))\s*:/gm)].map((m) => m[1] ?? m[2] ?? m[3])
  )
}

/**
 * The listed page ids the link gate does not cover. A page id is a page record SLUG
 * (`services_page`), while RECORDS is keyed by PATH (`services`), so each id is looked up through
 * the menu paths that open its record (`sitePagesOfRelease(...).paths`). An id no menu path opens is
 * looked up as a path itself.
 * @param {string[]} ids @param {Set<string>} keys @param {((id: string) => string[]) | null} pathsOf
 */
export function pagesOutsideLinkGate(ids, keys, pathsOf) {
  return ids.filter((id) => {
    const paths = pathsOf?.(id) ?? []
    return !(paths.length ? paths : [id]).some((p) => keys.has(p))
  })
}
