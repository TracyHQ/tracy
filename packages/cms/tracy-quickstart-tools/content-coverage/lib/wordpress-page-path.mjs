// Where a WordPress page answers: a page under a parent answers only under the parent's path (`j-pages/login`;
// `login` alone is WordPress's own login screen, or nothing). The parents come from the inventory capture writes beside
// the content map (`inventory.json` posts: id, slug, parent, status, type). The ONE rule: the template kit
// (`template-kit/lib/site/adapters/wordpress-map.mjs`) and the template readiness demo pages
// (`apps/tracy-web/src/lib/template-readiness/demo-pages-of-contract.js`) import it, each adding its own spelling (a
// front page at `/`, slashes around the path).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The published pages of a contract folder's inventory (none when the folder has no inventory or it is unreadable). */
export function inventoryPagesOf(dir) {
  const file = join(dir, 'inventory.json')
  if (!existsSync(file)) return []
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    return (doc?.posts ?? []).filter((p) => p?.type === 'page' && p.status === 'publish')
  } catch {
    return []
  }
}

/**
 * The path of a page by its slug, parents first and without slashes around it (`visit/book`); the slug alone when the
 * inventory does not know the page.
 * @param {string} slug
 * @param {Array<{id: number, slug: string, parent: number}>} pages the published pages of the inventory
 */
export function wordpressPagePath(slug, pages) {
  const own = pages.find((p) => p.slug === slug)
  const slugs = [slug]
  const seen = new Set([own?.id])
  for (let at = own; at?.parent && !seen.has(at.parent); ) {
    seen.add(at.parent)
    at = pages.find((p) => p.id === at.parent)
    if (at) slugs.unshift(at.slug)
  }
  return slugs.join('/')
}
