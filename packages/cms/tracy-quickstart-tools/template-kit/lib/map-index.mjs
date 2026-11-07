// Read a content map the way the page summary needs it: what each block declares, and which map entity
// owns the component area of a page, found by the page path.
import { pathOfRoute } from './kit-paths.mjs'

const queryOf = (link) =>
  Object.fromEntries([...String(link ?? '').matchAll(/([\w[\]]+)=([^&]*)/g)].map((m) => [m[1], m[2]]))
// A segment is an alias, or `<id>-<alias>` on an address with no menu item; an alias may itself start with a number
// (`48-hours-in-porto`), so the whole segment is tried first.
const aliasesOf = (segment) => {
  const whole = String(segment ?? '')
  const bare = whole.replace(/^\d+-/, '')
  return bare === whole ? [whole] : [whole, bare]
}

export function indexMap(map) {
  const entities = new Map(map.entities.map((e) => [e.key, e]))
  const slotsBy = new Map()
  for (const s of map.slots ?? []) {
    if (!slotsBy.has(s.entity)) slotsBy.set(s.entity, [])
    slotsBy.get(s.entity).push(s)
  }
  const positionOf = new Map()
  for (const p of map.pages ?? [])
    for (const a of p.assignedModules ?? [])
      if (!positionOf.has(a.entity)) positionOf.set(a.entity, a.position)
  const pageByPath = new Map((map.pages ?? []).map((p) => [pathOfRoute(p.route), p]))
  const byAlias = new Map()
  for (const e of map.entities) {
    const i = e.identity ?? {}
    if ((e.kind === 'article' || e.kind === 'contact') && i.alias) byAlias.set(`${e.kind}:${i.alias}`, e.key)
    if (e.kind === 'tag' && i.path) byAlias.set(`tag:${String(i.path).split('/').pop()}`, e.key)
    if (e.kind === 'category' && i.path) byAlias.set(`category:${String(i.path).split('/').pop()}`, e.key)
  }
  return { map, entities, slotsBy, positionOf, pageByPath, byAlias }
}

/**
 * The published modules the map assigns to the page at `path` (for blocks that render without a wrapper id), each
 * with the module it renders inside, if any (contract-read.mjs withModulesInside), and the selector it is found by
 * when its platform names blocks that way. An unpublished one prints nothing.
 */
export function assignedAt(idx, path) {
  // A page the map does not list prints what the front page prints (Joomla modules on every page), or, on a platform
  // whose map names the areas any page prints (WordPress, `otherPageAreas`), those areas.
  const p =
    idx.pageByPath.get(path.split('?')[0]) ??
    (idx.map.otherPageAreas ? { assignedModules: idx.map.otherPageAreas } : idx.pageByPath.get('/'))
  return (p?.assignedModules ?? [])
    .filter((a) => String(a.published ?? '1') !== '0')
    .map((a) => ({
      entity: a.entity,
      position: a.position,
      ...(a.inside ? { inside: a.inside } : {}),
      // A block a platform finds by selector (WordPress areas and page sections, wordpress-map.mjs).
      ...(a.selector ? { selector: a.selector } : {}),
      ...(a.kind ? { kind: a.kind } : {})
    }))
}

/**
 * Which map entity fills the component area of the page at `path`: a menu page by its link (category by
 * `view=category&id=N`, contact `contact-N`, article `article-N`), otherwise by the last path segment
 * (an article or contact alias, a tag `tag-N`, a category alias). `?start=N` keeps the owner of its list.
 * @returns {{owner: string|null, kind: string}}
 */
export function ownerOfPath(idx, path) {
  const [base, query] = path.split('?')
  const page = idx.pageByPath.get(base)
  const listPage = query ? ` (list position ${query.replace('start=', '')})` : ''
  // A page entity (WordPress: `page-<slug>`, its post content found by metadata.name) owns the page it is.
  if (page && idx.entities.get(page.entity)?.kind === 'page') return { owner: page.entity, kind: 'page' }
  if (page && page.link && page.link !== '#') {
    const q = queryOf(page.link)
    const view = q.view ?? ''
    // Content views are com_content's and a contact is com_contact's: a category of another component (news feeds)
    // lists no content items.
    const option = q.option ?? 'com_content'
    const content = option === 'com_content'
    if (content && view === 'category' && q.id)
      return { owner: `category-${q.id}`, kind: `category listing${listPage}` }
    if (option === 'com_contact' && view === 'contact' && q.id)
      return { owner: `contact-${q.id}`, kind: 'contact page' }
    if (content && view === 'article' && q.id) return { owner: `article-${q.id}`, kind: 'article' }
    if (content && view === 'featured') return { owner: null, kind: `featured articles${listPage}` }
    const component = (q.option ?? 'unknown').replace(/^com_/, '')
    return { owner: null, kind: `${component} ${view || 'page'}`.trim() }
  }
  const segments = base.split('/').filter(Boolean)
  const last = aliasesOf(segments.at(-1))
  const find = (kind) => last.map((a) => idx.byAlias.get(`${kind}:${a}`)).find(Boolean)
  // A page one level under a tags menu page (`view=tags`) is the page of the tag its last segment names.
  const parent = idx.pageByPath.get(`/${segments.slice(0, -1).join('/')}`)
  const underTags = queryOf(parent?.link).option === 'com_tags'
  if (underTags || segments.includes('tag') || segments.includes('tags')) {
    const tag = find('tag')
    return { owner: tag ?? null, kind: tag ? `tag listing${listPage}` : 'tag listing (no map entity)' }
  }
  if (segments.includes('author')) return { owner: null, kind: `author listing${listPage} (no map entity)` }
  for (const kind of ['article', 'contact', 'category']) {
    const key = find(kind)
    if (key) return { owner: key, kind: kind === 'category' ? `category listing${listPage}` : kind }
  }
  return { owner: null, kind: 'unknown' }
}
