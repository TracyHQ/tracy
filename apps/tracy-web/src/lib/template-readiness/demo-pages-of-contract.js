/**
 * Which pages of an untouched demo are measured, and as which quickstart version, read from the contract folder
 * (`scripts/demo-measures.mjs`, ticket #456).
 *
 *   Joomla     the template kit (`template-kit.json`): `quickstart.product`, `quickstart.version`, `pages[].path`.
 *              Joomla answers its pages under `/index.php`; the readers add that themselves (`underIndex`).
 *   WordPress  no kit: the version is the manifest's, the slug is the first part of the contract id, and the pages are
 *              the `page` entities of the content map (identity `{ postType, slug }`), asked as `/<slug>/`. A page under
 *              a parent answers only under the parent's path (`/j-pages/login/`; `/login/` is WordPress's own login), so
 *              the parents come from the inventory beside the content map (`inventory.json` posts: slug, parent, status).
 *              The page the site shows at its root (the inventory's `page_on_front`, else the slug `front-page`) is asked
 *              as `/`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** The slug of the page WordPress prints at the site root when the inventory does not say which one it is. */
const FRONT_PAGE_SLUG = 'front-page'

/**
 * The path a WordPress page is asked at, from its content map identity, or null when it is no page of the front end.
 * @param {any} identity
 * @param {{ pages: any[], front: number | null }} [inventory] the published pages of the inventory and the front page id
 */
export function wordpressPagePath(identity, inventory = { pages: [], front: null }) {
  if (identity?.postType !== 'page' || typeof identity.slug !== 'string' || identity.slug === '') return null
  const own = inventory.pages.find((p) => p.slug === identity.slug)
  if (own ? own.id === inventory.front : identity.slug === FRONT_PAGE_SLUG) return '/'
  const slugs = [identity.slug]
  const seen = new Set([own?.id])
  for (let at = own; at && at.parent && !seen.has(at.parent); ) {
    seen.add(at.parent)
    at = inventory.pages.find((p) => p.id === at.parent)
    if (at) slugs.unshift(at.slug)
  }
  return `/${slugs.join('/')}/`
}

/** The published pages of a contract's inventory, and its front page id (none when the folder has no inventory). */
function inventoryOf(dir) {
  const doc = readJson(path.join(dir, 'inventory.json'))
  const front = Number(doc?.options?.page_on_front)
  return {
    pages: (doc?.posts ?? []).filter((p) => p?.type === 'page' && p.status === 'publish'),
    front: Number.isInteger(front) && front > 0 ? front : null
  }
}

/**
 * @param {string} dir the contract folder
 * @returns {{ quickstart: { slug: unknown, version: unknown }, pages: string[] } | null} null when the folder holds
 *   neither a template kit nor a WordPress manifest
 */
export function demoPagesOfContract(dir) {
  const kit = readJson(path.join(dir, 'template-kit.json'))
  if (kit)
    return {
      quickstart: { slug: kit.quickstart?.product, version: kit.quickstart?.version },
      pages: (kit.pages ?? []).map((p) => p.path).filter((p) => typeof p === 'string')
    }
  const manifest = readJson(path.join(dir, 'manifest.json'))
  if (manifest?.platform !== 'wordpress') return null
  const map = readJson(path.join(dir, 'content-map.json'))
  const inventory = inventoryOf(dir)
  const pages = [
    ...new Set(
      (map?.entities ?? []).map((e) => wordpressPagePath(e?.identity, inventory)).filter((p) => p !== null)
    )
  ]
  return {
    quickstart: {
      slug: typeof manifest.id === 'string' ? manifest.id.split('/')[0] : undefined,
      version: manifest.quickstart?.version
    },
    pages
  }
}

/** The platform a contract folder is of (its manifest's), for the readers that ask pages differently per platform. */
export function platformOfContract(dir) {
  return readJson(path.join(dir, 'manifest.json'))?.platform === 'wordpress' ? 'wordpress' : 'joomla'
}
