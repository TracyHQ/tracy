/** Read-only native evidence for agent-demo. No writer, model, seed-only inventory or publication filter. */
import { createHash } from 'node:crypto'
import { siteApi } from './brief-engines/emdash-menus.js'
import { nativeCopyBindings, nativeStructure } from './brief-engines/quickstart-native.js'
import { parseBlocks } from './brief-engines/wp-blocks.js'
import { maskBuildChanges } from '../lib/agent-demo-changes.js'

const fail = (code, detail) => Object.assign(new Error(code), { code, detail })
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])])
        )
      : value
const hash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
const enc = encodeURIComponent
const MAX_RECORDS = 10000
const MAX_MS = 90000
/**
 * Apply calls in flight at once. One call took 0.3–0.8 s on the stand and a Tracy Business Joomla site holds ~7,800
 * records (bebop, 24/10/2026); 8 was ~3.5× one at a time, 16 no faster than 8.
 */
const IN_FLIGHT = 8
/** The most list pages of one kind asked for at once. */
const PAGE_WAVE = 8
/** A Joomla `content.list` page with `include_body` holds at most this many rows (Engine.php). */
const BODY_PAGE = 25
const RELATION_KINDS = {
  module: 'moduleAssignment',
  article: 'articleAssociation',
  menuItem: 'menuAssociation'
}

/**
 * The page a Joomla menu item opens, for an item whose `content.list` row carries no `url` (Claude Cowork for Joomla
 * gives none for menu items). Joomla's SEF address of an item is a base (`/`, `/index.php/`, with a language's code
 * after it on a multilingual site) followed by the item's `path`; the base is read off the addresses the site's other
 * rows DO carry, where one of them is an item's path (`/index.php/page/blog/2-a-post` under `page/blog`). Only a
 * published site item of type `component` opens a page of the site; the home item opens the base itself. No row in
 * that form (a non-SEF site, `index.php?option=…`) → no route: never guessed.
 *
 * lrsweep rig, JA Spa j6 (24/10/2026): the item opening `/index.php/contact` had no route, so the residue sweep found
 * no Contact page and left 17 template links.
 * @param {Array<Record<string, any>>} records
 */
function routeMenuItems(records) {
  const items = records.filter(
    (r) => r.identity?.kind === 'menuItem' && !r.routes?.length && typeof r.data?.path === 'string'
  )
  if (!items.length) return
  const paths = [...new Set(items.map((r) => r.data.path).filter((p) => p !== ''))].sort(
    (a, b) => b.length - a.length
  )
  const language = (r) => (typeof r.data?.language === 'string' && r.data.language ? r.data.language : '*')
  const byPath = new Map(items.map((r) => [r.data.path, language(r)]))
  /** @type {Map<string, Map<string, number>>} votes per menu language, then per base */
  const votes = new Map()
  for (const record of records)
    for (const route of record.routes ?? []) {
      if (typeof route !== 'string' || !route.startsWith('/')) continue
      const slashed = route.endsWith('/') ? route : `${route}/`
      // The longest item path in the address is the item it was routed under.
      for (const path of paths) {
        const at = slashed.indexOf(`/${path}/`)
        if (at < 0) continue
        const base = slashed.slice(0, at + 1)
        for (const key of [byPath.get(path), '']) {
          const counted = votes.get(key) ?? new Map()
          votes.set(key, counted)
          counted.set(base, (counted.get(base) ?? 0) + 1)
        }
        break
      }
    }
  const baseFor = (lang) => {
    const counted = votes.get(lang) ?? (lang === '*' ? votes.get('') : undefined)
    if (!counted) return null
    return [...counted.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
  }
  for (const record of items) {
    const { data } = record
    if (Number(data.published) !== 1 || data.type !== 'component' || Number(data.client_id ?? 0) !== 0)
      continue
    const base = baseFor(language(record))
    if (base === null) continue
    if (Number(data.home) === 1) record.routes = [base === '/' ? '/' : base.slice(0, -1)]
    else if (data.path) record.routes = [base + data.path]
  }
}

/** At most `most` tasks run at once; a freed slot passes straight to the next waiting task. */
function gate(most) {
  let active = 0
  const waiting = []
  return async (task) => {
    if (active < most) active++
    else await new Promise((resolve) => waiting.push(resolve))
    try {
      return await task()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}

/** The rows of a `db.dump` chunk's `INSERT … VALUES ('…','…'),…` as string cells, or null when any row is not `width` quoted cells. */
function dumpedRows(sql, width) {
  const rows = []
  for (const line of sql.split('\n')) {
    if (!line.startsWith('INSERT INTO ')) continue
    for (const tuple of line.slice(line.indexOf(' VALUES ') + 8).matchAll(/\(([^()]*)\)/g)) {
      const cells = [...tuple[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((cell) =>
        cell[1].replace(/\\(.)/g, '$1')
      )
      if (cells.length !== width) return null
      rows.push(cells)
    }
  }
  return rows
}
const editable = {
  article: ['title', 'introtext', 'fulltext'],
  module: ['title', 'content', 'params'],
  menuItem: ['title'],
  category: ['title', 'description'],
  contact: [
    'name',
    'misc',
    'address',
    'suburb',
    'state',
    'country',
    'postcode',
    'telephone',
    'mobile',
    'email_to',
    'webpage',
    'con_position'
  ],
  // `post_date`: a template post's date becomes the build day (residue sweep, `residue-sweep.js`).
  post: ['post_title', 'post_content', 'post_excerpt', 'post_date'],
  template: ['title', 'content'],
  templatePart: ['title', 'content'],
  option: ['value']
}
const volatile = new Set([
  'modified',
  'modified_by',
  'post_modified',
  'post_modified_gmt',
  'hits',
  'checked_out',
  'checked_out_time',
  'version',
  'updatedAt'
])

/**
 * A setting that names where something goes (`social-intro[link]`, `btn-link`, `url`): the place it points to is the
 * build's to make real, as `cta-real` asks — a `#` that becomes the business's page is no changed structure (dev
 * 24/10/2026, a dental site's only failing check).
 */
// A Joomla contact's `webpage` is its link too (local measure 28/10/2026: Death & Co's contact took the business's site
// where the template left it empty, and native-structure read a changed record for the rest of the build).
const LINK_KEY = /(?:^|[^a-z])(?:link|url|href|webpage|website)(?:[^a-z]|$)/i
/** A date a record shows (`date`, `eventDate`, `published_date`) is its words: a build dates the business's own news. */
const DATE_KEY = /(?:^|_)date$|[a-z]Date$/
/**
 * What a record says about its own words is its words: the reading time a post shows and its table of contents follow the
 * text the build wrote (local round 18, 25/10/2026: EmDash posts rewritten went from 0 to 2 minutes, their contents
 * listed anew).
 */
const WORDS_OF_TEXT_KEY =
  /^(?:reading_?time|readingTime|word_?count|wordCount|toc|table_of_contents|tableOfContents)$/
// Joomla article image descriptions are editorial text; their field names and non-string types stay structural.
const JOOMLA_PICTURE_WORDS_KEY = /^image_(?:intro|fulltext)_(?:alt|caption)$/
/**
 * A page's words for the browser and search engines are words (local round 35, 26/10/2026: a Joomla menu item's
 * "Browser Page Title" set to the business's name failed native-structure).
 */
const PAGE_WORDS_KEY =
  /^(?:page_title|page_heading|menu-meta_description|menu-meta_keywords|meta_?description|meta_?keywords|metadesc|metakey)$/
/**
 * A status or type a visitor reads ("Paid 22 Jul 2026", "Full-time · 15/15 rotation", "Full-time") is words: several
 * words, or a capital first. One a machine reads (`published`, `in_stock`, `image`) is one lower-case token and stays
 * structure (local round 20, 25/10/2026: an EmDash bakery's vacancies rewritten, each failing on its `type`).
 */
const STATUS_KEY = /(?:^|_)(?:status|type)$/i
const shownStatus = (value) =>
  typeof value === 'string' &&
  /\p{L}/u.test(value) &&
  (/\S\s+\S/.test(value.trim()) || /^\p{Lu}/u.test(value.trim()))
function linkValues(value) {
  if (Array.isArray(value)) return value.map(linkValues)
  return typeof value === 'string' ? '$link' : pictureValues(value)
}

/** The keys an EmDash picture object may hold beside its library id. */
const PICTURE_KEYS = new Set([
  'id',
  'alt',
  'src',
  'width',
  'height',
  'filename',
  'mimeType',
  'provider',
  'meta',
  'caption'
])

/** An EmDash library item's id: a ULID. */
const LIBRARY_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/
/** A key that names a picture's place (`image`, `avatar`, `heroImage`, `logo`, `cover`, `photo`…). */
const PICTURE_PLACE_KEY =
  /(?:^|[_-]|[a-z](?=[A-Z]))(?:image|img|photo|picture|avatar|logo|cover|thumbnail|thumb|icon|banner|background|bg|media|contain)s?$/i

function pictureValues(value) {
  if (Array.isArray(value)) return value.map(pictureValues)
  if (value && typeof value === 'object') {
    if (value.id && (value.provider || value.mimeType)) return { media: '$photo' }
    // A library item named by its id with only its words beside it (`{id:"01M5…", alt}`) is the same picture: EmDash
    // fills a bare id into the whole object, an object it keeps as written (local round 36, 26/10/2026: four checks of
    // an EmDash build failed on picture fields written this way).
    if (
      typeof value.id === 'string' &&
      LIBRARY_ID.test(value.id) &&
      Object.keys(value).every((key) => PICTURE_KEYS.has(key))
    )
      return { media: '$photo' }
    // An EmDash picture written by its file path is kept as `{provider:"external", id:"", src}`: still a picture in
    // the same field (local round 22, 25/10/2026), which `media.import`'s `mediaId` now avoids for new writes.
    if (typeof value.provider === 'string' && typeof value.src === 'string' && value.src)
      return { media: '$photo' }
    // A label–value row (`{key: "Share price", value: "RUB 384.50"}`): its label is copy like its value.
    if (typeof value.key === 'string' && typeof value.value === 'string' && value.key !== '$copy')
      return pictureValues({ ...value, key: '$copy' })
    // A link with its own label beside it (Joomla contact `linka` / `linka_name`): the label is the words a visitor
    // reads, the link where it goes — the business's own profile in place of the template's.
    const labelled = Object.keys(value).filter(
      (key) =>
        key.endsWith('_name') &&
        typeof value[key] === 'string' &&
        value[key] !== '$copy' &&
        typeof value[key.slice(0, -5)] === 'string'
    )
    if (labelled.length)
      return pictureValues({
        ...value,
        ...Object.fromEntries(
          labelled.flatMap((key) => [
            [key, '$copy'],
            [key.slice(0, -5), '$link']
          ])
        )
      })
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !volatile.has(key))
        .map(([key, item]) => [
          key,
          /^(?:featured_image_id|featured_media)$/.test(key)
            ? '$photo'
            : // A library item's bare id in a picture's place is that picture: EmDash fills a bare id into the whole
              // object in a media field, and keeps it as written inside a JSON field (local round 37, 26/10/2026: the
              // `sample` pictures of an EmDash build written as ids failed native-structure seven checks running).
              PICTURE_PLACE_KEY.test(key) && typeof item === 'string' && LIBRARY_ID.test(item)
              ? { media: '$photo' }
              : (DATE_KEY.test(key) && typeof item === 'string') ||
                  WORDS_OF_TEXT_KEY.test(key) ||
                  (PAGE_WORDS_KEY.test(key) && typeof item === 'string') ||
                  (JOOMLA_PICTURE_WORDS_KEY.test(key) && typeof item === 'string') ||
                  (STATUS_KEY.test(key) && shownStatus(item))
                ? '$copy'
                : LINK_KEY.test(key)
                  ? linkValues(item)
                  : pictureValues(item)
        ])
    )
  }
  if (typeof value !== 'string') return value
  // A field left empty, or holding only a dash or a dot, holds words: an EmDash row's figure or cell the research has no
  // value for ("" or "—", local round 21, 25/10/2026). A technical value set to one still differs from its literal.
  if (/^[^\p{L}\p{N}]*$/u.test(value)) return '$copy'
  // A module's settings held as one JSON string (a JA `jatools-config`) are read as the data they are, so a photo
  // in them is a photo and its words are words (pilot 24/10/2026: every Joomla hero whose picture the build changed
  // failed native-structure, the whole config read as copy after and as structure before).
  if (/^\s*[{[]/.test(value))
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object') return { $json: pictureValues(parsed) }
    } catch {
      // not JSON: plain text below
    }
  return (
    value
      // A WordPress block delimiter is structure, its attributes are not (ids, urls, labels): kept as the block's name
      // alone, so a menu's items still count when its links are words (local round 22, 25/10/2026: a navigation
      // whose comments were all dropped differed only as newlines nobody could read).
      .replace(/<!--\s*(\/?)wp:([a-z0-9/-]+)[\s\S]*?(\/?)-->/g, '<!--$1wp:$2$3-->')
      // Any other comment a paste left (`<!--(figmeta)…-->`) and how a void tag is closed are no structure (dev 24/10/2026).
      .replace(/<!--(?!\/?wp:)[\s\S]*?-->/g, '')
      .replace(/<(img|br|hr|input|source|meta|link)\b([^>]*?)\s*\/>/gi, '<$1$2>')
      .replace(/\b(src|srcset|href|alt|title)\s*=\s*("[^"]*"|'[^']*')/gi, '$1="$value"')
      // Any other attribute holding a picture's path is the picture (local round 35, 26/10/2026: Joomla's
      // `data-path="local-images:/joomlart/others/pic-2.jpg"` beside each article image read as changed structure).
      .replace(
        /\b([\w:-]+)\s*=\s*(["'])[^"']*\.(?:jpe?g|png|webp|avif|gif|svg)(?:[?#][^"']*)?\2/gi,
        '$1="$photo"'
      )
      // A style attribute is the look, which look-kept judges (a paint), not the shape: a photo darkened with an
      // inline filter is the same figure (local round 29, 25/10/2026).
      .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '')
      // A WordPress image block names its picture's attachment in its class: a new picture is a new id (round 19),
      // and a picture written without one is still a picture (round 28, 25/10/2026: a slide's new photo, no class).
      .replace(/\bwp-image-\d+\b/g, '')
      .replace(/\sclass=(["'])\s*\1/g, '')
      .replace(/\bclass="\s*([^"]*?)\s*"/g, 'class="$1"')
      // An address in angle brackets ("Name <no-reply@shop.test>") is words, not a tag (round 20, an EmDash mail sample).
      .replace(/<[^\s<>@]+@[^\s<>]+>/g, '<$email>')
      // A text element left empty, or holding only a dash or a dot, holds words too: the brief keeps a price the
      // research lacks empty (round 20, a WordPress menu's `dish-price` paragraphs, written "" or "—"), and such an
      // element is the same element as a written one.
      .replace(
        /(<(p|h[1-6]|span|li|td|th|figcaption|strong|em|b|i|small|label|button)\b[^>]*>)[^<>\p{L}\p{N}]*(<\/\2>)/giu,
        '$1$copy$3'
      )
      .replace(/url\(\s*[^)]*\)/gi, 'url($photo)')
      .replace(/https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|avif)(?:\?[^\s"'<>]*)?/gi, '$photo')
      .replace(
        // Joomla keeps `#joomlaImage://local-images/…?width=…` after a picture's path.
        /^(?:\/?(?:images|media|wp-content\/uploads)\/[^\s#?]+\.(?:jpe?g|png|webp|avif))(?:[?#].*)?$/i,
        '$photo'
      )
  )
}
function preserveRowIds(shape, original) {
  if (Array.isArray(shape)) return shape.map((item, i) => preserveRowIds(item, original?.[i]))
  if (shape && typeof shape === 'object')
    return Object.fromEntries(
      Object.entries(shape).map(([key, value]) => [
        key,
        key === '_rowId' ? original?.[key] : preserveRowIds(value, original?.[key])
      ])
    )
  return shape
}

/**
 * A relation's own words (the title, label or name its child carries) are copy; its ids, routes and counts are not.
 * WordPress lists a post's tags by NAME (`tags_input`): a tag renamed for the business is the same tag on the same
 * posts (local round 24, 25/10/2026: "Fish" renamed "Breads" failed here, and the build renamed it back), so how many
 * a post has counts and their words do not.
 */
function relationCopy(value) {
  if (Array.isArray(value)) return value.map(relationCopy)
  if (!value || typeof value !== 'object') return value
  const copyOf = (k, v) => {
    if (['title', 'label', 'name'].includes(k) && typeof v === 'string') return '$copy'
    // The lists a WordPress post's row names its categories and tags in are their names too (local round 36,
    // 26/10/2026: the template's tag "Fish" renamed for the bakery failed on four posts' `list:tags`).
    if (['tags_input', 'list:tags', 'list:categories'].includes(k) && Array.isArray(v))
      return v.map((name) => (typeof name === 'string' ? '$copy' : name))
    return relationCopy(v)
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyOf(k, v)]))
}

const isEmpty = (value) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
const isRichText = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((block) => block && typeof block === 'object' && typeof block._type === 'string')

/**
 * A list of other organisations' marks (press, awards, partners, clients, "recognition") whose entries carry a picture:
 * a build keeps only the marks the research holds for the business, so its length is the business's, not structure —
 * one entry at least (local stand 24/10/2026: an EmDash bakery filled four of five client logos with its own logo and
 * sketches, the count being held).
 */
const MARKS_KEY = /(?:^|_)(?:logos?|partners?|clients?|press|awards?|recognitions?|sponsors?|brands?)(?:_|$)/i
/**
 * So is a list of the business's own profiles elsewhere (`social`, `socials`, `social_links`) whose entries carry a
 * link: a template shows six networks, the business has the ones the research found (local round 20: two of six).
 */
const PROFILES_KEY = /(?:^|_)social(?:s|_links?|_profiles?)?(?:_|$)/i
const everyEntry = (item, mark) =>
  Array.isArray(item) &&
  item.length > 0 &&
  item.every((entry) => entry && typeof entry === 'object' && JSON.stringify(entry).includes(mark))
function marksLists(value) {
  if (Array.isArray(value)) return value.map(marksLists)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      (MARKS_KEY.test(key) && everyEntry(item, '$photo')) ||
      (PROFILES_KEY.test(key) && everyEntry(item, '$link'))
        ? { $marks: true }
        : marksLists(item)
    ])
  )
}

/**
 * A line break or a link inside words is how the words are set, not structure: three lines of opening hours written as one
 * (`$copy<br>$copy<br>$copy` → `$copy<br>`, local round 20, a WordPress offers band) are the same paragraph.
 */
function lineBreaksInWords(value) {
  if (Array.isArray(value)) return value.map(lineBreaksInWords)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, lineBreaksInWords(v)]))
  if (typeof value !== 'string') return value
  // Blank space around and between a markup's tags is how it was typed (round 24, 25/10/2026: a WordPress header
  // part written back without its last newline read as a changed shape).
  const typed = value.includes('<') ? value.trim().replace(/>\s+</g, '><') : value
  return (
    typed
      // A link inside words is words and a link (`tel:` around a phone, round 22): "Words, links and pictures never fail".
      .replace(/<a\b[^>]*>\s*\$copy\s*<\/a>/g, '$copy')
      // So is its emphasis: italics or bold kept or dropped in rewritten words (round 23, a WordPress offers band).
      .replace(/<(i|em|b|strong|u|mark|small|sup|sub)\b[^>]*>\s*\$copy\s*<\/\1>/g, '$copy')
      // A space beside words belongs to the words, whichever side of a tag it was typed on.
      .replace(/[ \t]+\$copy/g, '$copy')
      .replace(/\$copy[ \t]+/g, '$copy')
      .replace(/\$copy(?:\s*<br\s*\/?>\s*(?:\$copy)?)+/g, '$copy')
      .replace(/\$copy(?:\s*\$copy)+/g, '$copy')
      // A full stop left after an emphasized passage is still its words, never part of the containing frame.
      .replace(/(>\$copy)[^\p{L}\p{N}<>$]*(?=<)/gu, '$1')
  )
}

/**
 * A key holding null holds nothing, as a key left out does: a CMS that cannot delete a key a build added sets it null
 * (local round 25, 25/10/2026: an EmDash page's `sample.ctaUrl`, "now null, was missing"). An array keeps its nulls,
 * which hold places.
 */
function withoutNulls(value) {
  if (Array.isArray(value)) return value.map(withoutNulls)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, withoutNulls(v)])
  )
}

export function inventoryInvariant(records) {
  // The articles a Joomla menu item opens on their own are pages; every other article is a post of a blog or a list.
  const pageArticles = new Set(
    records
      .filter((r) => r.identity?.kind === 'menuItem')
      .flatMap((r) =>
        [...String(r.data?.link ?? '').matchAll(/[?&]view=article&id=(\d+)(?=[&:]|$)/g)].map((m) =>
          Number(m[1])
        )
      )
  )
  return records
    .map((record) => {
      const data = marksLists(pictureValues(withoutNulls(record.data)))
      // A WordPress post carries its tags by name in its own data too, not only among its relations: a tag renamed
      // there is the same tag (local round 31, 25/10/2026: "Fish" renamed "bread" failed on the post's data, the build
      // renamed it back, and no-demo-words then named "fish" — four checks back and forth).
      if (Array.isArray(data?.tags_input))
        data.tags_input = relationCopy({ tags_input: data.tags_input }).tags_input
      // Where WordPress keeps a template or part — the theme's file, or the site's own copy once a build writes it — is
      // storage, not structure (round 31: the sidebar part written for its heading read as "file missing").
      if (['template', 'templatePart'].includes(record.identity?.kind) && data && typeof data === 'object') {
        delete data.file
        delete data.source
      }
      // An editorial field the template left empty and the build filled (a tagline, a contact's suburb) is copy, not
      // structure: the same placeholder either way (local stand 24/10/2026, read as a changed record every build).
      // Left out of the record altogether is empty too (round 18, 25/10/2026: a post's `lede` written where it had none).
      // So is an editorial rich-text body (EmDash Portable Text, blocks with `_type`): its paragraphs and their `_key`s are
      // the words, and a build rewrites them (local stand 24/10/2026: empty legal pages filled, keys made anew).
      for (const field of record.editorialFields ?? [])
        if (data && typeof data === 'object' && (isEmpty(data[field]) || isRichText(data[field])))
          data[field] = '$copy'
      // A WordPress article's body is its words, as an EmDash rich-text body is: a blog post rewritten in fewer
      // paragraphs is the same post (local round 21, 25/10/2026: four template news posts rewritten for a bakery). A
      // page's body is its layout and stays structure.
      if (
        record.identity?.kind === 'post' &&
        data?.post_type === 'post' &&
        (record.editorialFields ?? []).includes('post_content')
      )
        data.post_content = '$copy'
      // …and so is a Joomla blog post's: a template article no menu item opens on its own (local measure 28/10/2026:
      // Death & Co's nine posts, written from the research without the template's quote block, failed native-structure
      // on every check). An article a menu item opens is a page; its markup stays structure.
      if (record.identity?.kind === 'article' && data && !pageArticles.has(Number(record.identity.id)))
        for (const field of ['introtext', 'fulltext'])
          if ((record.editorialFields ?? []).includes(field) && typeof data[field] === 'string')
            data[field] = '$copy'
      // An EmDash menu written again gets new item ids: its items are known by position, their tree and targets kept.
      let relations = record.relations
      if (record.key?.startsWith('menu/') && Array.isArray(data?.items)) {
        const at = new Map(data.items.map((item, i) => [item?.id, `#${i}`]))
        const byPosition = (item) =>
          item && typeof item === 'object'
            ? {
                ...item,
                id: at.get(item.id) ?? item.id,
                parentId: item.parentId ? (at.get(item.parentId) ?? item.parentId) : item.parentId
              }
            : item
        data.items = data.items.map(byPosition)
        if (Array.isArray(relations)) relations = relations.map(byPosition)
      }
      // WordPress files a template or part the site stores under its theme and area itself: a build writing a part
      // adds two rows nobody chose (round 31: 36 → 38). The rows of the site's own records are what stays.
      if (record.identity?.kind === 'taxonomyRelations' && relations?.own)
        relations = { table: relations.table, own: relations.own }
      const selected = nativeCopyBindings(data, record.editorialFields ?? [])
      const shape = lineBreaksInWords(
        nativeStructure([{ ...record, data, bindings: selected.bindings }])[0].shape
      )
      return {
        key: record.key,
        identity: record.identity,
        publication: record.publication,
        routes: record.routes,
        relations: relationCopy(relations),
        shape: preserveRowIds(shape, data)
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key))
}
/**
 * A page that shows the template itself, not the business: sign-in, registration and profile screens, a search page,
 * typography, offline and error pages, colour or theme variants, style guides and kits. Judged by the address.
 */
const SHOWCASE_SEGMENT =
  /^(?:log-?in|sign-?in|sign-?up|registration|register|reminder|reset|remind|(?:your-|user-)?profile|smart-search|search|typography|offline(?:-page)?|error(?:-page)?|404|elements|shortcodes|style-?guide|kit(?:-[a-z0-9-]+)?|[a-z]+-colou?r|themes?|bonus-pages|j-pages|joomla-content|featured-articles|category-blog|tagged-items|all-categories|submit-an-article|user-page|other-pages)$/i

/** Whether a menu target (`/explore/themes/blue-color/`, `index.php/pages/user-page/login`, a full URL) is one. */
export function isShowcaseRoute(target) {
  if (typeof target !== 'string' || !target.trim()) return false
  let path = target.trim()
  try {
    path = new URL(path, 'http://site.invalid').pathname
  } catch {
    return false
  }
  const segments = path.split('/').filter((s) => s && s !== 'index.php')
  return segments.length > 0 && SHOWCASE_SEGMENT.test(segments.at(-1))
}

/**
 * 🔒 THE TEMPLATE'S SHOWCASE PAGES ARE KEPT AND MADE THE BUSINESS'S (24/10/2026: "keep them, but adapt them
 * to the business"). Every menu entry and page stays, counted as before; what a build may change on the entries and pages
 * that were showcase ones in the frozen inventory is where they point and what they are called — a "Blue Color" page
 * becomes the catering page, with its own address. They are found in the frozen records (`showcaseOf`) and their
 * address and name fields are read as one placeholder in both inventories (`maskShowcase`); every other page and entry
 * is held exactly. WordPress `wp_navigation` blocks, Joomla menu items and EmDash pages and menu items alike.
 * @param {any[]} records - the frozen inventory's.
 */
export function showcaseOf(records) {
  const recordKeys = new Set()
  const pageIds = new Set()
  const menuItemIds = new Set()
  for (const r of records ?? []) {
    const routes = (r.routes ?? []).map((route) => (typeof route === 'string' ? route : route?.pattern))
    const joomlaItem = r.key.startsWith('menuItem/') && r.data?.id !== undefined
    if (
      routes.some(isShowcaseRoute) ||
      (joomlaItem && (isShowcaseRoute(r.data.path) || isShowcaseRoute(r.data.link)))
    ) {
      recordKeys.add(r.key)
      if (r.identity?.id !== undefined) pageIds.add(String(r.identity.id))
    }
  }
  for (const r of records ?? []) {
    if (r.data?.post_type === 'wp_navigation' && typeof r.data.post_content === 'string')
      for (const m of r.data.post_content.matchAll(/<!-- wp:navigation-(?:link|submenu) (\{[^]*?\}) \/?-->/g))
        try {
          const attrs = JSON.parse(m[1])
          if (isShowcaseRoute(attrs.url) || pageIds.has(String(attrs.id)))
            menuItemIds.add(`wp:${attrs.id ?? attrs.url}`)
        } catch {
          // an unreadable block is compared as it stands
        }
    if (r.key.startsWith('menu/') && Array.isArray(r.data?.items))
      for (const item of r.data.items)
        if (isShowcaseRoute(item.url) || pageIds.has(String(item.contentId))) menuItemIds.add(String(item.id))
  }
  return { recordKeys, pageIds, menuItemIds }
}

const ADDRESS_FIELDS = ['post_name', 'alias', 'slug', 'path', 'link', 'url', 'title', 'post_title', 'label']

/** The records with the showcase entries' and pages' address and name fields read as `$showcase`. */
export function maskShowcase(records, showcase) {
  const mask = (data) =>
    data && typeof data === 'object'
      ? Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, ADDRESS_FIELDS.includes(k) ? '$showcase' : v])
        )
      : data
  return (records ?? []).map((r) => {
    if (showcase.recordKeys.has(r.key))
      return { ...r, routes: (r.routes ?? []).map(() => '$showcase'), data: mask(r.data) }
    if (r.data?.post_type === 'wp_navigation' && typeof r.data.post_content === 'string') {
      const content = r.data.post_content.replace(
        /<!-- wp:navigation-(link|submenu) (\{[^]*?\}) (\/?)-->/g,
        (block, kind, json, close) => {
          try {
            const attrs = JSON.parse(json)
            if (!showcase.menuItemIds.has(`wp:${attrs.id ?? attrs.url}`)) return block
            return `<!-- wp:navigation-${kind} ${JSON.stringify(mask(attrs))} ${close}-->`
          } catch {
            return block
          }
        }
      )
      return { ...r, data: { ...r.data, post_content: content } }
    }
    if (r.key.startsWith('menu/') && Array.isArray(r.data?.items))
      return {
        ...r,
        data: {
          ...r.data,
          items: r.data.items.map((item) => (showcase.menuItemIds.has(String(item.id)) ? mask(item) : item))
        },
        relations: Array.isArray(r.relations)
          ? r.relations.map((rel) =>
              showcase.menuItemIds.has(String(rel.id)) ? { ...rel, url: '$showcase' } : rel
            )
          : r.relations
      }
    return r
  })
}

/**
 * A list the template left empty and the build filled is words, as an empty text field filled is: the empty list
 * reads `$copy` (`inventoryInvariant`), so the filled one at the same place does too (local round 21, 25/10/2026: an
 * EmDash bakery's empty project galleries filled with its photos). A field's type is fixed by its collection, so
 * `$copy` facing a list can only be a list that was empty.
 */
function filledLists(was, now) {
  const align = (a, b) => {
    if (a === '$copy' && Array.isArray(b)) return '$copy'
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      if (Array.isArray(b)) return b.map((item, i) => align(a[i], item))
      return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, align(a[k], v)]))
    }
    return b
  }
  const before = new Map(was.map((r) => [r.key, r]))
  return now.map((r) => (before.has(r.key) ? { ...r, shape: align(before.get(r.key).shape, r.shape) } : r))
}

/** A class naming a service a box was made for (the page read's `SERVICE_CLASS`, `demo-qa-browser.js`). */
const SERVICE_CLASS =
  /(?:^|[-_\s])(?:form|booking|book-?now|reserv(?:e|ation)s?|widget|feed|embed|map|newsletter|subscribe|sign-?up|opentable|calendar)(?:[-_\s]|$)/i
/** An element of markup with nothing inside it: `<div class="ot-form"></div>`. */
const EMPTY_ELEMENT = /(<(div|section|span)\b[^>]*\bclass="([^"]*)"[^>]*>)\s*<\/\2>/g

/** Where the element opened at `from` closes, counting the same tag nested inside it; -1 when it never does. */
function closingOf(text, from, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g')
  re.lastIndex = from
  let depth = 1
  for (let m = re.exec(text); m; m = re.exec(text)) {
    depth += m[1] ? -1 : m[0].endsWith('/>') ? 0 : 1
    if (depth === 0) return m.index
  }
  return -1
}

/**
 * 🔒 A SERVICE BOX THE TEMPLATE LEFT EMPTY IS THE BUILD'S TO FILL (plan "10/10" §5, David 26/10/2026). Local round 31
 * shipped an empty orange band under the hero — the template's OpenTable form group, empty at install — and the way to
 * fill it (one button to the business's booking link, phone or Contact page) adds blocks inside it. In markup the
 * build filled, what is now inside an element that was empty at install and whose class names a service
 * (`SERVICE_CLASS`, the same reading as `no-empty-boxes`) is read as it was: empty. Every other element, and the box
 * itself, is held exactly.
 * @param {string} was
 * @param {string} now
 */
export function serviceBoxesAsBefore(was, now) {
  if (typeof was !== 'string' || typeof now !== 'string' || was === now) return now
  let out = now
  const seen = new Map()
  for (const m of was.matchAll(EMPTY_ELEMENT)) {
    const [, open, tag, cls] = m
    const nth = seen.get(open) ?? 0
    seen.set(open, nth + 1)
    if (!SERVICE_CLASS.test(cls)) continue
    let at = -1
    for (let k = 0, from = 0; k <= nth; k++) {
      at = out.indexOf(open, from)
      if (at < 0) break
      from = at + open.length
    }
    if (at < 0) continue
    const start = at + open.length
    const end = closingOf(out, start, tag)
    if (end > start && out.slice(start, end).trim() !== '') out = out.slice(0, start) + out.slice(end)
  }
  return out
}

/** `serviceBoxesAsBefore` over every string two invariant records hold at the same place. */
function filledBoxes(was, now) {
  const align = (a, b) => {
    if (typeof a === 'string' && typeof b === 'string') return serviceBoxesAsBefore(a, b)
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      if (Array.isArray(b)) return b.map((item, i) => align(a[i], item))
      return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, align(a[k], v)]))
    }
    return b
  }
  const before = new Map(was.map((r) => [r.key, r]))
  return now.map((r) => (before.has(r.key) ? { ...r, shape: align(before.get(r.key).shape, r.shape) } : r))
}

/** Normalize only a server-authorized text fallback at the same frozen header brand block path. */
function brandFallbackRecords(before, after, policy) {
  const applied = []
  if (policy.allowWordPressSiteTitle !== true) return { records: after, applied }
  const original = new Map(before.map((r) => [r.key, r]))
  const records = after.map((record) => {
    const frozen = original.get(record.key)
    if (frozen?.identity?.kind !== 'templatePart' || frozen.identity.key !== 'header') return record
    let data = record.data
    for (const field of ['content', 'post_content']) {
      const was = frozen.data?.[field],
        now = data?.[field]
      if (typeof was !== 'string' || typeof now !== 'string') continue
      const first = parseBlocks(was),
        second = parseBlocks(now)
      if (!first || !second) continue
      const edits = []
      const brand = (node) =>
        node.name === 'core/group' &&
        /(?:^|\s)(?:logo|site-branding)(?:\s|$)/.test(node.attrs?.className ?? '')
      const walk = (a, b, path = [], inBrand = false) => {
        if (
          inBrand &&
          a.name === 'core/site-logo' &&
          b.name === 'core/site-title' &&
          a.selfClosing &&
          b.selfClosing
        ) {
          edits.push({ start: b.start, end: b.end, text: was.slice(a.start, a.end) })
          applied.push({ record: record.key, field, path })
          return
        }
        if (a.name !== b.name || a.children.length !== b.children.length) return
        a.children.forEach((child, i) =>
          walk(child, b.children[i], [...path, i], inBrand || (brand(a) && brand(b)))
        )
      }
      walk(first, second)
      let content = now
      for (const edit of edits.reverse())
        content = content.slice(0, edit.start) + edit.text + content.slice(edit.end)
      if (content !== now) data = { ...data, [field]: content }
    }
    return data === record.data ? record : { ...record, data }
  })
  return { records, applied }
}

export function compareAgentInventory(before, after, policy = {}) {
  if (!before?.complete || !after?.complete)
    return {
      id: 'native-structure',
      pass: false,
      skipped: true,
      detail: 'The native inventory is incomplete; publication, relation and count evidence is unavailable.'
    }
  const showcase = showcaseOf(before.records)
  // A frozen inventory read before patterns were (`expandPatterns`) is held to the references as they were read.
  const asRead = before.patternsRead !== true && after.patternsRead === true
  const afterRead = asRead
    ? after.records.map(({ patternsAsRead, ...r }) =>
        patternsAsRead ? { ...r, data: { ...r.data, ...patternsAsRead } } : r
      )
    : after.records
  // A starting inventory read before the site's own relation rows were told apart is compared by every row, as it was read.
  const rowsAsRead = before.records.some((r) => r.identity?.kind === 'taxonomyRelations' && !r.relations?.own)
  const afterRecords = rowsAsRead
    ? afterRead.map((r) =>
        r.identity?.kind === 'taxonomyRelations' && r.relations?.own
          ? {
              ...r,
              relations: { table: r.relations.table, rows: r.relations.rows, chunks: r.relations.chunks }
            }
          : r
      )
    : afterRead
  // An article's address and date are the build's (`agent-demo-changes.js`); the showcase pages' address and name too.
  const branding = brandFallbackRecords(before.records, afterRecords, policy)
  const was = inventoryInvariant(maskBuildChanges(maskShowcase(before.records, showcase)))
  const now = filledBoxes(
    was,
    filledLists(was, inventoryInvariant(maskBuildChanges(maskShowcase(branding.records, showcase))))
  )
  const same = hash(was) === hash(now)
  return {
    id: 'native-structure',
    pass: same,
    ...(branding.applied.length ? { brandFallbacks: branding.applied } : {}),
    measured: `${before.records.length}/${after.records.length}`,
    expected: 'all frozen native IDs, counts, publication, routes, row identities and relations stay intact',
    detail: [
      {
        reason: same
          ? 'Native IDs, counts, publication, routes, row identities and relations match the frozen inventory.'
          : 'Native structure differs from the frozen inventory; retain all IDs, counts, publication, routes and relations. Each record below reads as the template installed it with tracy_demo {operation:"structure.read", record:"<record>"}: write its markup back with only the words and pictures changed.'
      },
      // Which records differ and where, so the build can put each one back (a bare "differs" sent the
      // agent of the 23/10/2026 pilot away with nothing to repair).
      ...(same ? [] : inventoryDifferences(was, now))
    ]
  }
}

/** A pattern a WordPress record inserts: `<!-- wp:pattern {"slug":"theme/name"} /-->`. */
const PATTERN_REF = /<!-- wp:pattern (\{[^]*?\}) \/-->/g
/** How deep a pattern inside a pattern is read. */
const PATTERN_DEPTH = 3

/**
 * 🔒 A PATTERN IS READ AS THE BLOCKS IT INSERTS (local round 33, 26/10/2026). A theme's sidebar part held only
 * `<!-- wp:pattern {"slug":"…/part-sidebar"} /-->`; the build changed its words the way the block editor does —
 * the pattern expanded into the stored part, then the words written — and native-structure failed it at every check,
 * the inserted blocks against a one-line reference. Round 31 had gone the other way and edited the pattern's PHP,
 * which the build fence now refuses. Each reference is replaced by the registered pattern's own content
 * (`content.get {kind:"pattern"}`, the registry having run its PHP) before the shape is taken, in both inventories, so
 * an expanded part is held to the very blocks of its pattern and its words stay copy. A plugin that cannot read
 * patterns leaves the reference as it was read.
 * @param {string} text
 * @param {(key: string) => Promise<string | null>} read
 * @param {number} [depth]
 * @returns {Promise<string>}
 */
export async function expandPatterns(text, read, depth = 0) {
  if (typeof text !== 'string' || !text.includes('<!-- wp:pattern ') || depth >= PATTERN_DEPTH) return text
  let out = ''
  let last = 0
  for (const m of text.matchAll(PATTERN_REF)) {
    let slug = null
    try {
      slug = JSON.parse(m[1]).slug
    } catch {
      // an unreadable reference stays as it stands
    }
    const body = typeof slug === 'string' ? await read(slug) : null
    out += text.slice(last, m.index) + (body === null ? m[0] : await expandPatterns(body, read, depth + 1))
    last = m.index + m[0].length
  }
  return out + text.slice(last)
}

/** The fields of a WordPress record that can insert a pattern. */
const PATTERN_FIELDS = ['post_content', 'content']
/** Those fields as read, before their patterns were. */
const patternFields = (item) =>
  Object.fromEntries(PATTERN_FIELDS.filter((f) => typeof item?.[f] === 'string').map((f) => [f, item[f]]))

/** A WordPress record with the patterns its body or content inserts read as their blocks (`expandPatterns`). */
async function withPatternsRead(item, read) {
  if (!item || typeof item !== 'object') return item
  let out = item
  for (const field of PATTERN_FIELDS)
    if (typeof out[field] === 'string' && out[field].includes('<!-- wp:pattern ')) {
      const expanded = await expandPatterns(out[field], read)
      if (expanded !== out[field]) out = { ...out, [field]: expanded }
    }
  return out
}

/** At most this many differing records are named in a failed `native-structure`. */
const DIFFERENCES_NAMED = 8

/** The first path at which two invariant values differ, or null when they are equal. */
function firstDifference(a, b, path = '') {
  if (a === b) return null
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    if (Array.isArray(a) && a.length !== b.length)
      return { path: path || '.', was: `${a.length} items`, now: `${b.length} items` }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const found = firstDifference(a[key], b[key], Array.isArray(a) ? `${path}[${key}]` : `${path}.${key}`)
      if (found) return found
    }
    return null
  }
  // Two long strings (a block page's markup) are shown where they part, not from their first character.
  if (typeof a === 'string' && typeof b === 'string' && Math.max(a.length, b.length) > 120) {
    let at = 0
    while (at < a.length && a[at] === b[at]) at++
    const from = Math.max(0, at - 40)
    const around = (s) => `${from ? '…' : ''}${s.slice(from, at + 80)}${at + 80 < s.length ? '…' : ''}`
    return { path: path || '.', at, was: JSON.stringify(around(a)), now: JSON.stringify(around(b)) }
  }
  const shown = (v) => (v === undefined ? 'missing' : JSON.stringify(v).slice(0, 120))
  return { path: path || '.', was: shown(a), now: shown(b) }
}

/** Each record whose invariant changed: added, missing, or the part and field that moved. */
export function inventoryDifferences(was, now) {
  const before = new Map(was.map((r) => [r.key, r]))
  const after = new Map(now.map((r) => [r.key, r]))
  const out = []
  for (const [key, record] of before) {
    const next = after.get(key)
    if (!next) {
      out.push({ record: key, problem: 'missing' })
      continue
    }
    for (const part of ['identity', 'publication', 'routes', 'relations', 'shape']) {
      const found = firstDifference(record[part], next[part])
      if (found) {
        out.push({ record: key, part, ...found })
        break
      }
    }
  }
  for (const key of after.keys()) if (!before.has(key)) out.push({ record: key, problem: 'added' })
  return out.slice(0, DIFFERENCES_NAMED)
}

export function createAgentDemoInventory({
  siteAccess,
  siteReader,
  applyFor,
  checkGrant,
  fetchImpl = fetch,
  now = Date.now
}) {
  return async function read({ site, email, structure = null }) {
    const started = now(),
      records = [],
      coverage = [],
      seen = new Set()
    const check = async () => {
      if (now() - started > MAX_MS || records.length >= MAX_RECORDS) throw fail('AGENT_DEMO_INVENTORY_LIMIT')
      await checkGrant(site.site_key, email)
    }
    const add = (record) => {
      if (!record.key || seen.has(record.key)) throw fail('AGENT_DEMO_INVENTORY_DUPLICATE')
      seen.add(record.key)
      records.push(record)
    }
    const slot = gate(IN_FLIGHT)
    // The first failure stops every call still waiting for a slot: a refused inventory asks the site nothing more.
    let stopped = null
    let listed = 0
    // `optional`: a call whose refusal the reader answers another way, so it stops nothing.
    const apply = (action, params, { optional = false } = {}) =>
      slot(async () => {
        if (stopped) throw stopped
        try {
          await check()
          const answer = await applyFor(email)({ siteKey: site.site_key, action, params })
          if (!answer || answer.ok === false || answer.code || answer.error)
            throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', {
              action,
              kind: params.kind,
              code: answer?.code ?? answer?.error
            })
          return answer
        } catch (error) {
          if (!optional) stopped ??= error
          throw error
        }
      })
    // Every page of a kind, in order: the first alone, then twice as many at once each time (to `PAGE_WAVE`) until one comes back short.
    const paged = async (kind, extra = {}, { size = 100, body = false } = {}) => {
      const items = [],
        ids = new Set()
      for (let offset = 0, wave = 1; ; offset += size * wave, wave = Math.min(wave * 2, PAGE_WAVE)) {
        const pages = await Promise.all(
          Array.from({ length: wave }, (_, i) =>
            apply('content.list', {
              kind,
              limit: size,
              offset: offset + i * size,
              ...extra,
              ...(body ? { include_body: true } : {})
            })
          )
        )
        let short = false
        for (const page of pages) {
          if (!Array.isArray(page.items)) throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { kind })
          // A page past the end that holds rows: the list moved under the paging.
          if (short && page.items.length) throw fail('AGENT_DEMO_INVENTORY_PAGINATION_REQUIRED', { kind })
          for (const row of page.items) {
            const id = String(row.id ?? row.ID ?? row.key ?? '')
            if (!id || ids.has(id)) throw fail('AGENT_DEMO_INVENTORY_PAGINATION_REQUIRED', { kind })
            ids.add(id)
            items.push(row)
          }
          if (page.items.length < size) short = true
        }
        listed += pages.reduce((sum, page) => sum + page.items.length, 0)
        if (listed >= MAX_RECORDS) throw fail('AGENT_DEMO_INVENTORY_LIMIT')
        if (short) break
      }
      return { items, coverage: { surface: kind, state: 'read', count: items.length, ...extra } }
    }
    // One table's every row through `db.dump` chunks: how many, each chunk's hash, and its SQL.
    const dumpTable = async (table, surface, optional = false) => {
      const chunks = [],
        sql = [],
        cursors = new Set()
      let cursor = '',
        offset = null,
        rows = 0,
        total = null
      for (;;) {
        const chunk = await apply(
          'db.dump',
          { table, limit: 5000, ...(offset === null ? { cursor } : { offset }) },
          { optional }
        )
        if (
          typeof chunk.sql_b64 !== 'string' ||
          !Number.isInteger(chunk.rows) ||
          chunk.rows < 0 ||
          !Number.isInteger(chunk.total) ||
          chunk.total < 0 ||
          (total !== null && total !== chunk.total)
        )
          throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: `${surface}-chunk` })
        total = chunk.total
        rows += chunk.rows
        const bytes = Buffer.from(chunk.sql_b64, 'base64')
        chunks.push(createHash('sha256').update(bytes).digest('hex'))
        sql.push({ text: bytes.toString('utf8'), rows: chunk.rows })
        if (rows > MAX_RECORDS) throw fail('AGENT_DEMO_INVENTORY_LIMIT')
        if (chunk.done) break
        const next = typeof chunk.next_cursor === 'string' ? chunk.next_cursor : chunk.next_offset
        if (!chunk.rows || next == null || cursors.has(String(next)))
          throw fail('AGENT_DEMO_INVENTORY_PAGINATION_REQUIRED', { surface: table })
        cursors.add(String(next))
        if (typeof chunk.next_cursor === 'string') cursor = chunk.next_cursor
        else offset = chunk.next_offset
      }
      if (rows !== total) throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: `${surface}-count` })
      return { rows, chunks, sql }
    }
    /**
     * Joomla's module assignments and associations read whole from their two tables, answering for one record exactly
     * what `content.get` of that relation kind answers (JoomlaRelations::read): two dumps instead of one call per
     * module, article and menu item. Null when the tables cannot be dumped: then each record is asked on its own.
     */
    const joomlaRelations = async () => {
      let tables, menus, links
      try {
        const answer = await apply('db.tables', {}, { optional: true })
        const prefix = answer.prefix
        const names = typeof prefix === 'string' ? [`${prefix}modules_menu`, `${prefix}associations`] : []
        if (!names.length || !names.every((name) => answer.tables?.includes(name))) return null
        tables = await Promise.all(names.map((name) => dumpTable(name, name, true)))
        ;[menus, links] = tables.map((table, i) =>
          table.sql.flatMap((chunk) => {
            const rows = dumpedRows(chunk.text, i === 0 ? 2 : 3)
            if (rows?.length !== chunk.rows)
              throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: names[i] })
            return rows
          })
        )
      } catch (error) {
        if (error.code !== 'AGENT_DEMO_INVENTORY_UNAVAILABLE') throw error
        return null
      }
      const menusOf = new Map(),
        keyOf = new Map(),
        members = new Map()
      for (const [module, menu] of menus)
        menusOf.set(Number(module), [...(menusOf.get(Number(module)) ?? []), Number(menu)])
      for (const [id, context, key] of links) {
        keyOf.set(`${context}\n${id}`, key)
        // The site's driver answers integer columns as numbers.
        members.set(`${context}\n${key}`, [
          ...(members.get(`${context}\n${key}`) ?? []),
          { id: Number(id), context, key }
        ])
      }
      return (kind, id) => {
        if (kind === 'moduleAssignment')
          return { menuids: JSON.stringify((menusOf.get(Number(id)) ?? []).sort((a, b) => a - b)) }
        const context = kind === 'articleAssociation' ? 'com_content.item' : 'com_menus.item'
        const key = keyOf.get(`${context}\n${id}`)
        const group = key ? [...members.get(`${context}\n${key}`)].sort((a, b) => a.id - b.id) : []
        return { members: JSON.stringify(group) }
      }
    }
    if (site.platform === 'emdash') {
      const access = await siteAccess(site.site_key)
      const call = siteApi(access.origin, access.token, null, fetchImpl)
      const api = async (path) => {
        await check()
        return call('GET', path)
      }
      const collections = await api('/_emdash/api/schema/collections')
      const allCollections = Array.isArray(collections) ? collections : collections?.items
      if (!Array.isArray(allCollections))
        throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: 'collections' })
      for (const collection of allCollections) {
        const schema = (
          await api(`/_emdash/api/schema/collections/${enc(collection.slug)}?includeFields=true`)
        ).item
        if (!Array.isArray(schema?.fields))
          throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: 'schema' })
        for (const trashed of [false, true]) {
          let cursor = null
          const cursors = new Set()
          for (;;) {
            const query = new URLSearchParams({
              limit: '100',
              ...(!trashed ? { status: 'all' } : {}),
              ...(cursor ? { cursor } : {})
            })
            const page = await api(
              `/_emdash/api/content/${enc(collection.slug)}${trashed ? '/trash' : ''}?${query}`
            )
            if (!Array.isArray(page.items))
              throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: 'content' })
            for (const row of page.items) {
              const locale = row.locale
              if (!locale || !row.id) throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: 'identity' })
              const response = trashed
                ? { item: row }
                : await api(
                    `/_emdash/api/content/${enc(collection.slug)}/${enc(row.id)}?locale=${enc(locale)}`
                  )
              const item = response.item
              if (!item || item.id !== row.id || item.status == null)
                throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: 'record' })
              if (
                trashed &&
                schema.fields.some((field) => field.type === 'reference' && field.validation?.relation)
              )
                coverage.push({
                  surface: `trash-relations:${collection.slug}/${row.id}`,
                  state: 'unresolved',
                  reason: 'trash-api-omits-storageless-reference-edges'
                })
              const route =
                collection.urlPattern?.replace('{slug}', enc(item.slug)) ??
                schema.urlPattern?.replace('{slug}', enc(item.slug))
              add({
                key: `${collection.slug}/${row.id}@${locale}${trashed ? ':trash' : ''}`,
                identity: { collection: collection.slug, id: row.id, slug: item.slug, locale },
                publication: {
                  status: item.status,
                  deletedAt: item.deletedAt ?? null,
                  scheduledAt: item.scheduledAt ?? null,
                  draft: !!item.draftRevisionId
                },
                routes: route ? [{ pattern: route, locale }] : [],
                // The collection's own date and title fields, which the residue sweep writes
                // (`residue-sweep.js` `dateFieldOf`); null when the collection names none.
                dateField: schema.dateField ?? collection.dateField ?? null,
                titleField: schema.titleField ?? collection.titleField ?? null,
                relations: item.references ?? {},
                data: structuredClone(item.liveData ?? item.data ?? {}),
                editorialFields: schema.fields
                  .filter((field) =>
                    [
                      'string',
                      'text',
                      'number',
                      'integer',
                      'portableText',
                      'repeater',
                      'blocks',
                      'json'
                    ].includes(field.type)
                  )
                  .map((field) => field.slug)
              })
            }
            if (!page.nextCursor) break
            if (cursors.has(page.nextCursor)) throw fail('AGENT_DEMO_INVENTORY_PAGINATION_REQUIRED')
            cursors.add(page.nextCursor)
            cursor = page.nextCursor
          }
        }
        coverage.push({
          surface: `collection:${collection.slug}`,
          state: 'read',
          allLocales: true,
          allPublication: true,
          trash: true
        })
      }
      const menus = await api('/_emdash/api/menus')
      const allMenus = Array.isArray(menus) ? menus : menus?.items
      if (!Array.isArray(allMenus)) throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: 'menus' })
      for (const menu of allMenus) {
        const item = await api(`/_emdash/api/menus/${enc(menu.name)}?locale=${enc(menu.locale)}`)
        if (!Array.isArray(item?.items))
          throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: 'menu-items' })
        add({
          key: `menu/${menu.id}@${menu.locale}`,
          identity: { kind: 'menu', id: menu.id, locale: menu.locale },
          publication: { status: 'menu' },
          routes: [],
          relations: item.items.map((row) => ({
            id: row.id,
            parentId: row.parentId ?? null,
            contentId: row.contentId ?? null,
            url: row.url ?? null,
            position: row.position ?? row.order ?? null
          })),
          data: item,
          editorialFields: ['label', 'items']
        })
      }
    } else {
      const reader = await siteReader(site.site_key)
      const kinds =
        site.platform === 'joomla'
          ? ['article', 'module', 'menuItem', 'category', 'contact']
          : ['post', 'templatePart', 'template']
      const postTypes =
        site.platform === 'wordpress'
          ? Object.entries(JSON.parse(await reader.text('/wp-json/wp/v2/types')))
              .filter(
                ([key, value]) =>
                  key !== 'attachment' &&
                  !['wp_template', 'wp_template_part'].includes(key) &&
                  value?.rest_base
              )
              .map(([key]) => key)
          : []
      if (site.platform === 'wordpress' && !postTypes.length)
        throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: 'post-types' })
      const joomla = site.platform === 'joomla'
      // The relation tables are dumped while the kinds are listed.
      const relationsRead = joomla ? joomlaRelations() : Promise.resolve(null)
      const recordOf = (kind, row, item, related) => {
        if (!item) throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { kind })
        const identity = ['template', 'templatePart'].includes(kind)
          ? { kind, key: row.key }
          : { kind, id: row.id ?? row.ID }
        const data = structuredClone(item)
        for (const field of ['params', 'images'])
          if (typeof data[field] === 'string' && data[field].trim().startsWith('{')) {
            try {
              data[field] = JSON.parse(data[field])
            } catch {
              throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { kind, field })
            }
          }
        const relations = {}
        for (const key of [
          'parent_id',
          'post_parent',
          'post_category',
          'tags_input',
          'catid',
          'categories',
          'tags',
          'terms',
          'references',
          'menutype',
          'component_id',
          'associations',
          'menu',
          'assignment'
        ])
          if (item[key] !== undefined) relations[key] = item[key]
        if (related) relations[RELATION_KINDS[kind]] = related
        if (site.platform === 'wordpress' && kind === 'post') {
          for (const key of ['categories', 'tags', 'parent', 'in_menu', 'template'])
            if (Object.hasOwn(row, key)) relations[`list:${key}`] = row[key]
        }
        return {
          key: `${kind}/${identity.key ?? identity.id}`,
          identity,
          publication: {
            status:
              item.state ??
              item.published ??
              item.post_status ??
              item.status ??
              (['template', 'templatePart'].includes(kind) ? 'template' : null),
            client: item.client_id ?? null
          },
          routes:
            typeof row.url === 'string'
              ? [new URL(row.url, reader?.base ?? 'https://site.invalid').pathname]
              : [],
          relations,
          data,
          editorialFields: editable[kind] ?? [],
          // The post's featured picture as the list reads it (`content.get` has none): where a blog card's and a
          // post's template picture is kept, which the residue sweep sets to an imported photo.
          ...(site.platform === 'wordpress' && row.featured_image?.url
            ? { featured: { id: row.featured_image.id ?? null, url: row.featured_image.url } }
            : {})
        }
      }
      const get = async (kind, row) =>
        (
          await apply(
            'content.get',
            ['template', 'templatePart'].includes(kind)
              ? { kind, key: row.key }
              : { kind, id: row.id ?? row.ID }
          )
        ).item
      /** One registered pattern's blocks, read once per inventory (`content.get {kind:"pattern"}`), null when unread. */
      const patterns = new Map()
      const pattern = (key) => {
        if (!patterns.has(key))
          patterns.set(
            key,
            Promise.resolve()
              .then(() => apply('content.get', { kind: 'pattern', key }))
              .then((answer) => (typeof answer?.item?.content === 'string' ? answer.item.content : null))
              .catch(() => null)
          )
        return patterns.get(key)
      }
      /**
       * One kind's records. Joomla lists them WITH their bodies, 25 a page (`include_body`: the component's `read()` of
       * each row merged over its summary), and one `content.get` names the columns `read()` answers (`SELECT *`, the same
       * for every row of a table), so each record holds exactly what its own `content.get` would. A component that sends
       * no bodies, or bodies that differ from that read, is asked one record at a time.
       */
      const readKind = async (kind, extra) => {
        const list = await paged(kind, extra, joomla ? { size: BODY_PAGE, body: true } : {})
        const rows = list.items
        let items = null
        if (joomla && rows.length) {
          const first = await get(kind, rows[0])
          const columns = first ? Object.keys(first) : []
          if (
            columns.length &&
            rows.every((row) => columns.every((column) => Object.hasOwn(row, column))) &&
            columns.every((column) => JSON.stringify(rows[0][column]) === JSON.stringify(first[column]))
          )
            items = rows.map((row, i) =>
              i === 0 ? first : Object.fromEntries(columns.map((column) => [column, row[column]]))
            )
        }
        items ??= await Promise.all(rows.map((row) => get(kind, row)))
        // Each pattern a record inserts is read as its blocks; the reference as read is kept beside it for a frozen
        // inventory read before patterns were (`compareAgentInventory`).
        const raws = []
        if (site.platform === 'wordpress')
          items = await Promise.all(
            items.map(async (item, i) => {
              const read = await withPatternsRead(item, pattern)
              if (read !== item) raws[i] = patternFields(item)
              return read
            })
          )
        const relationKind = joomla ? RELATION_KINDS[kind] : null
        const tables = relationKind ? await relationsRead : null
        const related = relationKind
          ? await Promise.all(
              rows.map(async (row) => {
                if (tables) return tables(relationKind, row.id)
                const answer = await apply('content.get', { kind: relationKind, id: row.id })
                return answer.item ?? answer.items ?? answer
              })
            )
          : []
        return {
          coverage: list.coverage,
          records: rows.map((row, i) => {
            const record = recordOf(kind, row, items[i], related[i])
            return raws[i] ? { ...record, patternsAsRead: raws[i] } : record
          })
        }
      }
      const read = await Promise.all(
        kinds.flatMap((kind) =>
          (kind === 'post' ? postTypes : [null]).map((postType) =>
            readKind(kind, postType ? { post_type: postType } : {})
          )
        )
      )
      // Added in the order the kinds are named, whichever answered first.
      for (const kind of read) {
        for (const record of kind.records) add(record)
        coverage.push(kind.coverage)
      }
      if (joomla) routeMenuItems(records)
      if (site.platform === 'wordpress') {
        // Native WP_Post exposes built-in term inputs; the relation table also covers custom taxonomies.
        const tables = (await apply('db.tables', {})).tables
        const candidates = Array.isArray(tables)
          ? tables.filter(
              (table) =>
                typeof table === 'string' &&
                table.endsWith('_term_relationships') &&
                tables.includes(table.slice(0, -'term_relationships'.length) + 'posts')
            )
          : []
        if (candidates.length !== 1)
          throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: 'term-relationships-table' })
        const table = candidates[0]
        const { rows, chunks, sql } = await dumpTable(table, 'term-relationships')
        // Without the rows of the templates and parts the site stores (their `id`): WordPress files those under the
        // theme and an area itself, and one a build writes adds them. Read only when every row parses.
        const stored = new Set(
          records
            .filter((r) => ['template', 'templatePart'].includes(r.identity.kind))
            .map((r) => Number(r.data?.id))
            .filter((id) => id > 0)
        )
        const tuples = sql.flatMap(({ text }) => [...text.matchAll(/\('(\d+)','(\d+)','(-?\d+)'\)/g)])
        const kept = tuples
          .filter((m) => !stored.has(Number(m[1])))
          .map((m) => `${m[1]},${m[2]},${m[3]}`)
          .sort()
        const own =
          tuples.length === rows
            ? { rows: kept.length, hash: createHash('sha256').update(kept.join('\n')).digest('hex') }
            : null
        add({
          key: `relations/${table}`,
          identity: { kind: 'taxonomyRelations', key: table },
          publication: { status: 'relation-table' },
          routes: [],
          relations: { table, rows, chunks, ...(own ? { own } : {}) },
          data: {},
          editorialFields: []
        })
        coverage.push({ surface: 'all-taxonomy-relations', state: 'read', count: rows })
      }
      const options = new Set(site.platform === 'wordpress' ? ['blogname', 'blogdescription'] : [])
      const walk = (value) => {
        if (!value || typeof value !== 'object') return
        if (typeof value.target?.option === 'string') options.add(value.target.option)
        for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child)
      }
      walk(structure?.contract)
      for (const key of options) {
        const item = (await apply('content.get', { kind: 'option', key })).item
        if (!item) throw fail('AGENT_DEMO_INVENTORY_UNAVAILABLE', { surface: `option:${key}` })
        add({
          key: `option/${key}`,
          identity: { kind: 'option', key },
          publication: { status: 'option' },
          routes: [],
          relations: {},
          data: item,
          editorialFields: editable.option
        })
      }
    }
    const counts = {}
    for (const record of records) {
      const key = record.identity.kind ?? record.identity.collection
      counts[key] = (counts[key] ?? 0) + 1
    }
    const complete =
      coverage.every((entry) => entry.state !== 'unresolved') &&
      records.length > 0 &&
      records.every((record) => record.publication.status !== null)
    return {
      version: 'agent-demo-native/1',
      ...(site.platform === 'wordpress' ? { patternsRead: true } : {}),
      complete,
      records,
      counts,
      coverage,
      hash: hash(records),
      invariantHash: hash(inventoryInvariant(records))
    }
  }
}

/**
 * The top-level block of a WordPress body that holds `at`, numbered as `content.get {outline:true}` numbers them
 * (site-tools `topBlocks`: a run of words between blocks is a position too), or null.
 * @param {string} body
 * @param {number} at
 */
function blockAt(body, at) {
  const root = parseBlocks(body)
  if (!root) return null
  let position = 0
  let last = 0
  for (const block of root.children) {
    if (body.slice(last, block.start).trim() !== '') position++
    if (at >= block.start && at < block.end) return position
    position++
    last = block.end
  }
  return null
}

/** A WordPress body field of a record: a post's `post_content`, a template part's `content`. */
const bodyOf = (record) =>
  typeof record?.data?.post_content === 'string'
    ? record.data.post_content
    : typeof record?.data?.content === 'string'
      ? record.data.content
      : null

/**
 * Where each template picture `no-demo-pictures` names sits in the live site: the record that holds it and, in a
 * WordPress body, its block by position. A page read names the picture; the agent writes records, and spent four
 * checks looking for the block of `wp-image-35` (local round 26, 25/10/2026, Levain).
 * @param {any[]} checks
 * @param {{records?: any[]} | null} inventory - the live read the same check compared.
 */
/** Where a template picture held by no content record is changed: the setting that picks it, named in the template's notes. */
const PICTURE_SETTING_HINT =
  'no content record holds this picture: a template setting picks it. content.find {text:"<a word of its file name or its place, e.g. banner>"} names the template line that reads it (on WordPress its option); set that setting to the new picture — media.import answers its path, and on WordPress its attachmentId — with content.update {kind:"option", key, fields:{value}} or the template’s own settings door. For a Joomla T4 logo use template.siteSettings {operation:"read", template:"<template>"}, then {operation:"set", template:"<template>", profiles:{"<profile>":{site_logo:"<imported picture path>"}}}; preserve the other profile settings and use this native Undo-recorded door, not template file edits.'

export function picturesWhere(checks, inventory) {
  const records = Array.isArray(inventory?.records) ? inventory.records : []
  if (!records.length) return checks
  const texts = records.map((record) => ({ record, json: JSON.stringify(record.data ?? null) }))
  const find = (detail) => {
    const id = String(detail?.selector ?? '').match(/\bwp-image-(\d+)\b/)?.[1]
    const file = String(detail?.file ?? '')
      .split('/')
      .pop()
      ?.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, '')
      .replace(/\.[a-z0-9]+$/i, '')
    // A file is named whole, with a size or `-scaled` WordPress cut from it: `banner-1` is not in `banner-130` (local round
    // 31, 25/10/2026: a picture the theme picks from a setting was named in the record whose anchor reads banner-130).
    const name = file && file.length >= 4 ? file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null
    const needles = [
      id ? new RegExp(`\\bwp-image-${id}\\b`) : null,
      name
        ? new RegExp(`(?<![\\w-])${name}(?=(?:-\\d+x\\d+|-scaled)?(?:\\.[a-z0-9]+)?(?![\\w-]))`, 'i')
        : null
    ].filter(Boolean)
    // The page's own record first: one template file shows on several pages (local round 27: a picture of
    // /about-us/ was named in the home page's record).
    const path = (value) => String(value ?? '').replace(/\/+$/, '') || '/'
    const page = path(detail?.page)
    const ordered = [
      ...texts.filter(({ record }) => (record.routes ?? []).some((r) => path(r) === page)),
      ...texts.filter(({ record }) => !(record.routes ?? []).some((r) => path(r) === page))
    ]
    for (const needle of needles)
      for (const { record, json } of ordered) {
        if (!needle.test(json)) continue
        const body = bodyOf(record)
        const at = body === null ? -1 : body.search(needle)
        const block = at >= 0 ? blockAt(body, at) : null
        // A post's featured picture (a list's thumbnail: WordPress prints it `attachment-<size>` / `wp-post-image`) is
        // its `_thumbnail_id`, never a block (local round 37, 26/10/2026: a gallery list's album thumbnails were sent
        // to swap the album post's blocks).
        if (
          record.identity?.kind === 'post' &&
          /\b(?:wp-post-image|attachment-[a-z0-9_-]+)\b/i.test(String(detail?.selector ?? ''))
        )
          return {
            record: record.key,
            featured: `content.update {kind:"postmeta", id:${record.identity.id}, key:"_thumbnail_id", fields:{value:<attachmentId>}}`
          }
        // A WordPress block's picture is swapped in place (`wp-blocks.mjs` `{pictures}`), never the block retyped.
        const address = record.identity?.key ? `key:"${record.identity.key}"` : `id:${record.identity?.id}`
        const swap =
          block !== null && record.identity?.kind
            ? `content.get {kind:"${record.identity.kind}", ${address}, outline:true} gives rev; content.update {kind:"${record.identity.kind}", ${address}, rev, blocks:{"${block}":{pictures:{"${String(
                detail?.file ?? ''
              )
                .split('/')
                .pop()}":{path, attachmentId}}}}}`
            : null
        return { record: record.key, ...(block !== null ? { block } : {}), ...(swap ? { swap } : {}) }
      }
    return null
  }
  return checks.map((check) =>
    check?.id !== 'no-demo-pictures' || !Array.isArray(check.detail)
      ? check
      : {
          ...check,
          detail: check.detail.map((detail) => {
            if (!detail || typeof detail !== 'object' || detail.in) return detail
            const where = find(detail)
            if (where) return { ...detail, in: where }
            // 🔒 A PICTURE NO RECORD HOLDS IS A SETTING'S (local round 35, 26/10/2026): JA Restaurant shows its blog
            // banner from the attachment an option names (`wp_ja_restaurant_blog_banner_image`, set by file name at
            // install); the build read "theme-owned, no door" and left it for eight checks.
            return typeof detail.file === 'string'
              ? { ...detail, in: { setting: PICTURE_SETTING_HINT } }
              : detail
          })
        }
  )
}
