/**
 * What happens to ONE `tracy_site` call between the model and the door: the spellings a door has one
 * reading of are corrected (and the answer says so in `normalized`), a call the door would certainly
 * refuse is refused here — in 0 s, before any write lease is taken — and a parameter the component
 * would silently drop is refused by name.
 *
 * WHY HERE, AND WHY THESE RULES ONLY. Measured on r2 (25/09/2026, 99 cases), 406 of 1,393 calls were
 * refused, 172 of them for the SHAPE of the call, and the component's own `bad_params` answer reached
 * the model with "This site answered no" as its next step 172 times. Every rule below has an r2 count
 * (the corpus test names each measured call), and each obeys four conditions: the intent is
 * unambiguous from the call itself, the corrected call goes through the same door as the same person,
 * a read never becomes a write (nor an edit a create), and the answer carries the correction. The
 * rules with no r2 occurrence wait for P12 (PR2) with their tests; the ones a PR1 text relies on stay
 * whatever their count (D9's ids: the CONTRACT description tells the model to leave them out).
 *
 * Pure: no network, no clock. The reads a correction needs are injected (`resolveCall`), and a fresh
 * id comes from `facts.mint` (call-memory's minter).
 */
import { createHash } from 'node:crypto'

import { normalizeFields } from './content-read-fields.mjs'
import { patternsUnsupported } from './wp-patterns.mjs'
import { activeFolders, componentVersion, seoPluginOf, versionAtLeast, WP_SEO_META } from './wp-seo.mjs'

/**
 * WordPress: the post columns the component writes (claude-cowork `origin/main` 2aa7840,
 * `wordpress/cowork/lib/class-claude-cowork-writers.php:35-51` POST_FIELDS) and the fields it writes
 * beside the row (`write_beyond_the_row`, `:718-747`). Pinned by `test/fixtures/wp-post-fields.json`.
 */
export const WP_POST_FIELDS = Object.freeze([
  'post_title',
  'post_content',
  'post_excerpt',
  'post_status',
  'post_name',
  'post_parent',
  'menu_order',
  'post_type',
  'post_date',
  'post_category',
  'tags_input',
  'categories',
  'tags',
  'featured_image_id',
  'template',
  'seo'
])

/**
 * 🔒 THE READ SHAPE'S NAMES, SPELLED FOR THE WRITE. A `content.list` row says `title`/`content`/
 * `status`; the write refuses those names — and drops them SILENTLY when one valid field rides along
 * (`write_post` keeps the fields it knows, `:628-645`). Measured r2: 6 whole-page writes refused for
 * `content`/`title` alone. `categories`/`category`/`tags` are NOT here: `categories` and `tags` are
 * real fields (slugs, `write_beyond_the_row`), so mapping them to the id lists would change meaning.
 */
const WP_POST_ALIASES = Object.freeze({
  title: 'post_title',
  content: 'post_content',
  excerpt: 'post_excerpt',
  status: 'post_status',
  slug: 'post_name',
  date: 'post_date',
  parent: 'post_parent',
  order: 'menu_order'
})

/** A template part is written as `{content, title, area}` (`write_template_part`, `:905-935`). */
const WP_PART_FIELDS = Object.freeze(['content', 'title', 'area'])
const WP_PART_ALIASES = Object.freeze({ post_content: 'content', post_title: 'title' })

const WP_PART_WORDS = new Set(['templatePart', 'template_part', 'wp_template_part', 'templatepart', 'part'])
const WP_NAV_WORDS = new Set([
  'menuItem',
  'menuitem',
  'menu',
  'menus',
  'navigation',
  'wp_navigation',
  'nav_menu_item'
])
const WP_POST_TYPES = new Set([
  'page',
  'post',
  'wp_template_part',
  'wp_navigation',
  'wp_template',
  'wpcf7_contact_form'
])
const WP_NOT_LISTABLE = new Set([
  'postmeta',
  'meta',
  'term',
  'category',
  'categories',
  'tag',
  'tags',
  'post_tag'
])

/**
 * What the options door answers when "list the options" is asked of a door that lists none (WP-7):
 * the ones a page shows.
 */
export const WP_SHOWN_OPTIONS = Object.freeze([
  'blogname',
  'blogdescription',
  'page_on_front',
  'page_for_posts',
  'show_on_front'
])

/**
 * Joomla words asked of WordPress, each with where that thing lives there. Measured r2: `field` 3,
 * `module` 2, `templateStyle` 4, `contract` 2, `slot` 1 — each refused by the component with no way on.
 */
const JOOMLA_ONLY = Object.freeze({
  article: 'a post: content.get {kind:"post", id}',
  module: 'a block inside post_content, or the header/footer template part (kind "templatePart")',
  field: 'postmeta: content.get {kind:"postmeta", id, key:"<meta key>"}',
  fieldValue: 'postmeta: content.get {kind:"postmeta", id, key:"<meta key>"}',
  templateStyle: 'the site title is option "blogname": content.get {kind:"option", key:"blogname"}',
  menutype: 'menus are wp_navigation posts: content.list {kind:"post", post_type:"wp_navigation"}',
  menuAssociation: 'menus are wp_navigation posts: content.list {kind:"post", post_type:"wp_navigation"}',
  articleAssociation: 'content.language {id, lang, translations}',
  moduleAssignment: 'a block belongs to the page or template part that holds it',
  language: 'content.language (a page) or language.install (WordPress itself)',
  languageFilter: 'content.language {id, lang, translations}',
  contact: 'the contact page is a post: content.list {kind:"post", post_type:"page"}',
  extensionParams: 'an option: content.get {kind:"option", key}',
  banner: 'a block inside post_content',
  // A site provision bound has one since #337; `refusalNext` drops this road where the surface lacks it.
  contract:
    'content.contract {operation:"inspect"} where the site is bound to one; elsewhere words live in posts and template parts',
  slot: 'WordPress has no slots: words live inside post_content'
})

/** WordPress words asked of Joomla (J-1). Measured r2: `option` 1. */
const WORDPRESS_ONLY = Object.freeze({
  option:
    'the site name is the template style; on a quickstart site a content.contract slot when the inspect lists Site identity',
  post: 'an article (kind "article") or a menu item (kind "menuItem")',
  page: 'an article (kind "article") or a menu item (kind "menuItem")',
  postmeta: 'a field value (kind "fieldValue")',
  templatePart: 'a module (kind "module"): header and footer blocks are modules',
  term: 'a category or a tag (kind "category" / "tag")',
  // WordPress's registered block patterns (01/10/2026): a Joomla section is a module.
  pattern: 'a module (kind "module"): Joomla has no registered block patterns'
})

/**
 * WP-11: a category or a tag is a term, read and written by its taxonomy as `key` (`write_term`,
 * `class-claude-cowork-writers.php:762-765`).
 */
const WP_TERM_TAXONOMY = Object.freeze({
  category: 'category',
  categories: 'category',
  tag: 'post_tag',
  tags: 'post_tag',
  post_tag: 'post_tag'
})
/** WP-15: the words a model uses for the page a site shows on its front. */
const WP_FRONT_WORDS = new Set(['home', 'front', 'front-page', 'homepage'])
/** WP-19: the post types a write by id may be taken for a post of, once a read has said which. */
const WP_POST_LIKE_TYPES = new Set(['page', 'post', 'wp_navigation'])
/** WP-25: the names an option's or a postmeta's one value arrives under besides `value`. */
const WP_VALUE_SPELLINGS = Object.freeze(['option_value', 'meta_value'])
/** WP-26: a term's name arrives as its read shape's `title` or a `label`. */
const WP_TERM_ALIASES = Object.freeze({ title: 'name', label: 'name' })

/** CC-2: the words for "read the slots" (the component knows only `inspect`). */
const CONTRACT_READ_WORDS = new Set([
  'inspect',
  'list',
  'slots',
  'read',
  'get',
  'show',
  'map',
  'index',
  'describe'
])
/** CC-3: the words for "write the slots" (the component knows only `apply`). */
const CONTRACT_WRITE_WORDS = new Set(['update', 'write', 'set', 'change', 'save', 'edit', 'patch'])
/** CC-5: the spellings a contract apply's three ids were measured under (j-1ibzqi 23/09, 11 shapes). */
const ID_SPELLINGS = Object.freeze({
  apply_id: Object.freeze(['applyId', 'apply-id']),
  request_id: Object.freeze(['requestId', 'request-id']),
  expected_revision: Object.freeze(['expectedRevision', 'expected-revision', 'revision'])
})
/** CC-5: the objects the ids were measured inside. */
const ID_WRAPPERS = Object.freeze(['request', 'meta', 'ids', 'args', 'options', 'contract'])
/** CC-6: a contract slot key (`module-441.1`) or a language copy's (`…::vi-VN`). */
const SLOT_KEY = /^[a-zA-Z]+-\d+\.\d+$|::/

/** The contract's operations (`Engine.php` contentContract, claude-cowork 2aa7840). */
export const CONTRACT_OPERATIONS = Object.freeze([
  'inspect',
  'apply',
  'multilingual.plan',
  'multilingual.package',
  'multilingual.apply',
  'multilingual.verify',
  'multilingual.revert',
  'multilingual.retire',
  'multilingual.restore',
  'demoTrim.apply',
  'demoTrim.revert'
])
const CONTRACT_PREFIXES = Object.freeze(['multilingual.', 'demoTrim.', 'siteLanguage.', 'sourceLanguage.'])

/**
 * Parameters Tracy itself reads and never relays, per action: the body guard's `removes` (D6′) and
 * the inspect's filters (the component ignores them, `Engine.php:1204-1208`; `narrowInspect` reads
 * them). They are in the allowlist below AND taken off the call before it is sent.
 */
const HOST_PARAMS = Object.freeze({
  // W2: `outline` / `block` shape what a WordPress body read shows (`site-call.mjs` `bodyByBlocks`).
  'content.get': Object.freeze(['outline', 'block']),
  // W2: `blocks` is expanded into the body before this runs (`site-call.mjs` `expandBlockEdits`), and
  // `rev` (01/10/2026) is the body read those blocks were counted in, checked there.
  'content.update': Object.freeze(['removes', 'blocks', 'rev']),
  // 09/10/2026: `locale` keeps a delete to that one language; left out, a record in several languages is
  // deleted in all of them on one question (`delete-group.mjs`, `site-call.mjs`).
  'content.delete': Object.freeze(['locale']),
  'content.contract:inspect': Object.freeze(['page', 'slots', 'match', 'entity', 'offset']),
  // `file` names the customer's picture in the site folder, `attachment` one they sent in the chat
  // (29/09/2026): the host reads either and sends its bytes (`upload.mjs`); `alt` is kept by EmDash
  // only. None of them ever reaches a component.
  'media.upload': Object.freeze(['file', 'attachment', 'alt'])
})
/**
 * Tracy's own parameter on EVERY action: `confirm:true` is the agent's word that the customer answered
 * an ask_user_question for a destructive call (`tiers.mjs`; judged in `site-call.mjs` against the
 * conversation's memory, never taken on its own). Lifted off the call and never relayed.
 */
const UNIVERSAL_HOST_PARAMS = Object.freeze(['confirm'])

/**
 * 🔒 THE COMPONENT'S OWN READERS, PER PLATFORM AND ACTION — the parameters each one reads, and
 * nothing else (V0, D22). An unknown key is refused by name instead of relayed.
 *
 * WHY A REFUSAL AND NOT A PASS. The component IGNORES a key it does not read and answers `ok:true`
 * with the unfiltered list. Measured r2: 8 accepted calls carried a filter nobody read (`search` ×4,
 * `key` ×2, `lang`/`language` ×2 on WordPress `content.list`) and returned 120,108 chars that looked
 * filtered — the model's own reasoning then said "the search parameter didn't work as expected", and
 * it re-read with bodies (49,875 chars). Data that looks filtered but is not is worse than a refusal.
 *
 * Each row cites the reader (claude-cowork `origin/main` 2aa7840); `test/fixtures/closed-params/`
 * holds the same rows and the test compares both ways. An action with no row here is passed through:
 * a key is refused only where the reader was read.
 */
export const ALLOWED_PARAMS = Object.freeze({
  wordpress: Object.freeze({
    // WPEngine.php:837-914 contentList → class-claude-cowork-writers.php:187 list_posts(offset, limit, with_body, name, type)
    // + `search` (read since WordPress 0.16.0, `LIST_SEARCH_SINCE`): an older plugin ignores it, so the relay
    // refuses an answer that does not echo it (`LIST_SEARCH_UNSUPPORTED`).
    'content.list': Object.freeze(['kind', 'post_type', 'name', 'limit', 'offset', 'include_body', 'search']),
    // The registered block patterns (01/10/2026): the plugin's pattern list reads kind, search, category,
    // offset, limit (`contentList` with kind "pattern", the release after 0.16.0). An older plugin refuses the
    // kind or lists its posts; `site-call.mjs` trusts only an answer that says `kind:"pattern"`.
    'content.list:pattern': Object.freeze(['kind', 'search', 'category', 'offset', 'limit']),
    // WPEngine.php:916-966 contentGet: kind, id, key
    'content.get': Object.freeze(['kind', 'id', 'key', 'outline', 'block']),
    // WPEngine.php:1074-1127 contentUpdate: apply_id, kind, fields, id, key (+ Tracy's `removes`, `blocks`,
    // `rev`). 🔒 NOT `expected_body_revision`: only the host sends it, with the `body_revision` its own read
    // got from the plugin (`site-call.mjs`); the model sending one is refused here by name.
    'content.update': Object.freeze(['kind', 'id', 'key', 'fields', 'apply_id', 'removes', 'blocks', 'rev']),
    // WPEngine.php:1146-1210 contentDelete: apply_id, kind, key, id (+ Tracy's `locale`, `delete-group.mjs`)
    'content.delete': Object.freeze(['kind', 'id', 'key', 'apply_id', 'locale']),
    // WPEngine.php:968-1072 contentLanguage: apply_id, id, lang, translations
    'content.language': Object.freeze(['id', 'lang', 'translations', 'apply_id']),
    // WPEngine.php:1481 applyList, :1431 applyRevert, :1588 applyId
    'apply.list': Object.freeze(['apply_id']),
    'apply.revert': Object.freeze(['apply_id']),
    // WPEngine.php:246-262 dbDump: table, limit, cursor (offset is the older wire)
    'db.dump': Object.freeze(['table', 'limit', 'cursor', 'offset']),
    // WPEngine.php:233 dbTables(): no parameter
    'db.tables': Object.freeze([]),
    // A BOUND site's contract (#337; claude-cowork a0ab275, Claude Cowork plugin 0.13.2): Engine.php:265-310
    // contentContract reads `operation` (and `contract`, which only provision's bind names); the rest
    // are Tracy's filters, as on Joomla
    'content.contract:inspect': Object.freeze(['operation', 'page', 'slots', 'match', 'entity', 'offset']),
    // Engine.php:330-346 contractApply: apply_id, request_id, changes, evidence;
    // QuickstartContract.php:740 plan(): expected_revision
    'content.contract:apply': Object.freeze([
      'operation',
      'apply_id',
      'request_id',
      'expected_revision',
      // Content API v2 (W2; Joomla Claude Cowork plugin rc.5, WordPress rc.2): `{contentId: revision}` from
      // content.read. An older Claude Cowork plugin ignores it, and `site-call.mjs` falls back once (D2).
      'expected_content_revisions',
      'changes',
      'evidence'
    ]),
    // Engine.php:2379-2451 mediaUpload: apply_id, path, content_b64, sha256 (checked against the bytes
    // that arrived, :2407); claude-cowork 4351bb4. Until 27/09 no row: any key was relayed, and a call
    // with no content_b64 wrote a 0-byte file and answered ok (F5). + Tracy's `file`, `attachment`, `alt`.
    'media.upload': Object.freeze(['path', 'content_b64', 'apply_id', 'sha256', 'file', 'attachment', 'alt']),
    'media.delete': Object.freeze(['apply_id', 'id', 'url', 'dry_run']),
    // Words a theme prints at render time (claude-cowork `content.renderedWords`, advertised by
    // `info.rendered_words`): inspect a page's targets, apply proven rules, read a scope's status.
    'content.renderedWords:inspect': Object.freeze(['operation', 'path', 'targets', 'composition']),
    'content.renderedWords:apply': Object.freeze([
      'operation',
      'apply_id',
      'request_id',
      'expected_revision',
      'proof',
      'rules'
    ]),
    'content.renderedWords:status': Object.freeze(['operation', 'request_id', 'post', 'locale'])
  }),
  joomla: Object.freeze({
    // Engine.php:1112-1146 contentList: kind, offset, include_body, limit; + `search` (read since Joomla
    // 0.20.0, `LIST_SEARCH_SINCE`), guarded as on WordPress
    'content.list': Object.freeze(['kind', 'offset', 'limit', 'include_body', 'search']),
    // Engine.php:1151-1175 contentGet: kind, id
    'content.get': Object.freeze(['kind', 'id']),
    // Engine.php:2053-2160 contentUpdate: apply_id, kind, fields, id (+ Tracy's `removes`: the body guard's
    // way through for a cut the customer asked for, 09/10/2026 — taken off before the call is sent)
    'content.update': Object.freeze(['kind', 'id', 'fields', 'apply_id', 'removes']),
    // Engine.php:2166-2220 contentDelete: apply_id, kind, id (+ Tracy's `locale`, `delete-group.mjs`)
    'content.delete': Object.freeze(['kind', 'id', 'apply_id', 'locale']),
    // Engine.php:2337 applyList, :2273 applyRevert, :2451 applyId
    'apply.list': Object.freeze(['apply_id']),
    'apply.revert': Object.freeze(['apply_id']),
    // Engine.php:706-757 dbDump: table, limit, cursor (offset is the older wire)
    'db.dump': Object.freeze(['table', 'limit', 'cursor', 'offset']),
    // Engine.php:284 dbTables(), :1013 extensionList(): no parameter
    'db.tables': Object.freeze([]),
    'extension.list': Object.freeze([]),
    // Engine.php:1204-1208 inspect reads `operation` only; the rest are Tracy's filters
    'content.contract:inspect': Object.freeze(['operation', 'page', 'slots', 'match', 'entity', 'offset']),
    // Engine.php:1216-1224 apply_id, request_id, changes, evidence; QuickstartContract.php:565-567 expected_revision
    'content.contract:apply': Object.freeze([
      'operation',
      'apply_id',
      'request_id',
      'expected_revision',
      // Content API v2 (W2; Joomla Claude Cowork plugin rc.5, WordPress rc.2): `{contentId: revision}` from
      // content.read. An older Claude Cowork plugin ignores it, and `site-call.mjs` falls back once (D2).
      'expected_content_revisions',
      'changes',
      'evidence'
    ]),
    // Engine.php:2222-2263 mediaUpload: apply_id, path, content_b64 (claude-cowork 4351bb4). `sha256` is
    // not read there yet: Tracy sends it on both platforms so one road serves both, and a Joomla
    // component that learns WordPress's check (:2407 there) verifies it without a change here.
    'media.upload': Object.freeze(['path', 'content_b64', 'apply_id', 'sha256', 'file', 'attachment', 'alt']),
    // Engine.php:3521 siteIdentityDoor: operation, fields, apply_id (:3920 applyId) — Claude Cowork for Joomla 0.22.0
    'site.identity': Object.freeze(['operation', 'fields', 'apply_id']),
    'media.delete': Object.freeze(['apply_id', 'path', 'dry_run'])
  })
})

/**
 * Keys that change nothing wherever they appear, dropped with a note instead of refused: a `siteKey`
 * inside `params` (the site is the conversation's, never a parameter) and `context` (a REST habit —
 * measured r2 once, `content.get {context:"edit"}`, which answers the whole record anyway).
 */
const DROPPED_PARAMS = Object.freeze(['siteKey', 'context'])

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v.trim() : '')
/** @param {unknown} v */
const positiveId = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 ? n : 0
}
/**
 * An id the call carries that the component would read as some OTHER record: present, not `0`/"0",
 * and not a whole positive number (`"42abc"`, 42.5, `true`, -3). `undefined`, `null` and `''` are
 * absent — the component reads each as 0, a create, which is what the call says.
 * @param {unknown} v
 */
export const malformedId = (v) =>
  v !== undefined &&
  v !== null &&
  v !== '' &&
  v !== 0 &&
  !(typeof v === 'string' && v.trim() === '0') &&
  positiveId(v) === 0
/** @param {string} s */
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)
/** @param {unknown} s @param {number} max */
const sanitize = (s, max) =>
  String(s)
    .replace(/[^a-zA-Z0-9._:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)

/**
 * The request id of one contract apply: `r-<sha256([changes, evidence, expected_revision])[:16]>`
 * (D9). Deterministic, so a re-send of the same apply is the same request and the component answers
 * its recorded result (`Engine.php:1220-1228`) instead of applying twice.
 *
 * Content API v2 (D2): the content revisions the apply is based on join the hash when there are any —
 * another base is another request — and an apply with none keeps the id it always had.
 * @param {unknown} changes
 * @param {unknown} evidence
 * @param {unknown} expectedRevision
 * @param {unknown} [contentRevisions] - `expected_content_revisions`.
 */
export function requestIdOf(changes, evidence, expectedRevision, contentRevisions) {
  const base = [changes ?? null, evidence ?? {}, expectedRevision ?? null]
  if (isRecord(contentRevisions) && Object.keys(contentRevisions).length > 0)
    base.push(
      Object.fromEntries(
        Object.keys(contentRevisions)
          .sort()
          .map((k) => [k, contentRevisions[k]])
      )
    )
  return `r-${sha16(JSON.stringify(base))}`
}

/**
 * The key used to find an action's allowlist: the contract's two main operations have their own.
 * @param {string} action
 * @param {Record<string, unknown>} params
 */
function allowKey(action, params) {
  if (action === 'content.list') return str(params.kind) === 'pattern' ? 'content.list:pattern' : action
  if (action === 'content.renderedWords') {
    const op = str(params.operation)
    return op === 'inspect' || op === 'apply' || op === 'status' ? `content.renderedWords:${op}` : null
  }
  if (action !== 'content.contract') return action
  const op = str(params.operation)
  return op === 'inspect' || op === 'apply' ? `content.contract:${op}` : null
}

/**
 * V0 — the closed-params check (D22): null when every key of `params` is one the component reads here
 * (or Tracy's own), else a bare `UNKNOWN_PARAM` refusal. An unknown platform, or an action whose reader
 * is not in {@link ALLOWED_PARAMS}, passes.
 *
 * 🔒 THE REFUSAL NAMES `search` AMONG THE KEYS AN ACTION TAKES (30/09/2026, the plugin releases that read it
 * exist) — except for a site that just showed its plugin ignores it (`unread`, from call-memory
 * `noListSearch`): a refusal that said "allowed: …, search" beside a next that says "this site has no search"
 * would contradict itself.
 * @param {string} platform
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {{ unread?: readonly string[] }} [site] - keys this site's plugin was found not to read.
 * @returns {Record<string, unknown> | null}
 */
export function checkParams(platform, action, params, site = {}) {
  const table = /** @type {Record<string, readonly string[]> | undefined} */ (
    /** @type {Record<string, unknown>} */ (ALLOWED_PARAMS)[platform]
  )
  if (table === undefined || !isRecord(params)) return null
  const key = allowKey(action, params)
  // A platform with no pattern list of its own (Joomla) judges `kind:"pattern"` by its plain list row.
  const allowed =
    key === null
      ? undefined
      : (table[key] ?? (key === 'content.list:pattern' ? table['content.list'] : undefined))
  if (allowed === undefined) return null
  const given = Object.keys(params).filter((k) => !allowed.includes(k) && !UNIVERSAL_HOST_PARAMS.includes(k))
  if (given.length === 0) return null
  const unread = Array.isArray(site.unread) ? site.unread : []
  const offered = allowed.filter((k) => !unread.includes(k))
  const named = `${given
    .slice(0, 2)
    .map((k) => `"${k.slice(0, 30)}"`)
    .join(', ')}${given.length > 2 ? ` (+${given.length - 2})` : ''}`
  const what = key === null ? action : key.replace(':', ' ')
  return {
    ok: false,
    code: 'UNKNOWN_PARAM',
    action,
    platform,
    given,
    allowed: [...offered],
    ...(action === 'content.contract' ? { operation: str(params.operation) } : {}),
    // T10: the rule and the value received, in at most 160 characters.
    error:
      `${named} ${given.length === 1 ? 'is not a parameter' : 'are not parameters'} of ${what} here; allowed: ${offered.join(', ') || 'none'}`.slice(
        0,
        160
      )
  }
}

/**
 * `contractDoor` (#337): a sealed WordPress site provision BOUND to its contract (true), or one whose
 * marker could not say (null) — `contractDoorOf` in `site-context.mjs`; absent or false, the record road.
 * `derived` (01/10/2026): an IMPORTED copy whose own plugin derived a contract (`derivedContractOf`): its
 * derived slots take the contract's rules, and its record writes keep their own.
 * @typedef {{
 *   platform: string,
 *   contractBound?: boolean,
 *   contractDoor?: boolean | null,
 *   derived?: boolean,
 *   missing?: string[],
 *   noListSearch?: boolean,
 *   lastRevision?: string | null,
 *   contentRevisions?: ((slotKeys: string[]) => Record<string, string> | null) | null,
 *   applyIds?: string[], okIds?: string[], unknownIds?: string[], idMap?: Record<string, string>,
 *   postsRead?: { id: number, title: string }[],
 *   wpApplyId?: string | ((prefix?: string) => string),
 *   mint?: (prefix: string) => string
 * }} CallFacts
 *   `missing`: actions this site's component answered `bad_action` for within the hour (E3.3,
 *   call-memory `learned`). `noListSearch`: this site's plugin ignored a `content.list` search within the
 *   last 15 minutes (call-memory `learned`). `lastRevision`: the contract revision this conversation last
 *   read (CC-12).
 *   `contentRevisions`: `{contentId: revision}` for the contents the given slots belong to, as this
 *   conversation's `content.read` showed them, or null when any slot was not read (Content API v2, D2;
 *   call-memory `contentRevisionsFor`).
 * @typedef {{ type: 'wpSlug', slug: string } | { type: 'wpNavFallback' } | { type: 'wpOptions', keys: string[] }
 *   | { type: 'wpPartTitle', key: string } | { type: 'wpFront', key: string } | { type: 'wpKindOfId', id: number }
 *   | { type: 'wpPartSlug', id: number } | { type: 'wpSeoMeta', field: 'title' | 'description' }
 *   | { type: 'wpSeoField' }} Resolve
 * @typedef {{ kind: 'relay', action: string, params: Record<string, unknown>, host: Record<string, unknown>,
 *   notes: string[], resolve?: Resolve,
 *   meta?: { askedApplyId: string | null, needsRevision?: boolean, mintedIds?: string[] } }} Relay
 *   `meta.mintedIds`: the parameters whose value Tracy made for this call (`apply_id` minted by D9 /
 *   WP-27, a contract apply's `request_id`) — never one the model gave (E3.2's repeat key).
 * @typedef {{ kind: 'refuse', answer: Record<string, unknown>, notes: string[] }} Refuse
 */

/**
 * One call, corrected where its intent is unambiguous, refused where the door would certainly refuse
 * it, and checked against the component's reader.
 *
 * @param {string} action - canonical, from `planCall`.
 * @param {Record<string, unknown>} params - never mutated.
 * @param {CallFacts} facts
 * @returns {Relay | Refuse}
 */
export function normalizeCall(action, params, facts) {
  const f = /** @type {CallFacts} */ (isRecord(facts) ? facts : { platform: 'unknown' })
  /** @type {Record<string, unknown>} */
  let p
  try {
    p = structuredClone(isRecord(params) ? params : {})
  } catch {
    p = { ...(isRecord(params) ? params : {}) }
  }
  /** @type {string[]} */
  const notes = []
  const platform = typeof f.platform === 'string' ? f.platform : 'unknown'
  for (const k of DROPPED_PARAMS)
    if (k in p) {
      delete p[k]
      notes.push(`params.${k} dropped: nothing reads it`)
    }
  /** @param {string} code @param {Record<string, unknown>} extra @returns {Refuse} */
  const refuse = (code, extra) => ({
    kind: 'refuse',
    answer: { ok: false, code, action, platform, ...extra },
    notes
  })
  /**
   * 🔒 WP-3 / E3.3 — A DEAD ROAD IS SAID AT ONCE. This site's component answered `bad_action` for
   * this action within the hour (call-memory `learn`): it lacks it, and another spelling of the call
   * will not grow it. Measured r1/r2: the same missing action asked again and again inside one case
   * (23 WordPress repeats of one `bad_action` in r1), each a relay, a lock and a refusal. Keyed per
   * site and cleared when the component itself changes (`core.upgrade`, `extension.install`).
   */
  if (Array.isArray(f.missing) && f.missing.includes(action))
    return refuse('NOT_ON_THIS_PLATFORM', {
      what: action,
      learned: true,
      error: `this site's component answered bad_action for ${action.slice(0, 40)} within the last hour`
    })
  // A `search` on `content.list` (30/09/2026): judged before anything is sent, and before the platform's
  // own rules, because every platform relays it the same way.
  if (action === 'content.list' && p.search !== undefined) {
    const refused = listSearch(p, f, notes, refuse)
    if (refused !== null) return refused
  }
  /**
   * 🔒 F5 — AN UPLOAD WITHOUT BYTES NEVER LEAVES. Both components read `content_b64` with
   * `base64_decode($b64, true)` (WordPress `Engine.php:2393`, Joomla `:2236`), which answers "" — not
   * false — for an empty or absent value: such a call wrote a 0-byte file and answered ok. A value that
   * cannot be base64 is refused here too, before up to 11 MB cross the relay to be refused there. The
   * way on is `file`: the host reads the customer's picture from the site folder (`upload.mjs`).
   */
  if (action === 'media.upload') {
    const problem = uploadBytesProblem(p.content_b64)
    if (problem !== null) return refuse('UPLOAD_NEEDS_FILE', { error: problem })
  }
  if (action === 'media.delete') {
    if (str(p.apply_id) === '') return refuse('bad_params', { error: 'media.delete requires apply_id' })
    const wpHasId = p.id !== undefined && p.id !== null && p.id !== ''
    const wpHasUrl = str(p.url) !== ''
    const targetPresent =
      platform === 'wordpress'
        ? wpHasId !== wpHasUrl && (!wpHasId || positiveId(p.id) > 0)
        : platform === 'joomla'
          ? str(p.path) !== ''
          : true
    if (!targetPresent)
      return refuse('bad_params', {
        error:
          platform === 'wordpress'
            ? 'media.delete requires a WordPress attachment id or URL'
            : 'media.delete requires a Joomla path relative to images/'
      })
  }
  // A record named the way Tracy's own page list prints it (`record` "post:26", "article:552").
  if ((platform === 'wordpress' || platform === 'joomla') && RECORD_REF_ACTIONS.has(action))
    recordRef(p, platform, notes)
  /** @type {Relay | Refuse} */
  let out
  if (action === 'apply.list' || action === 'apply.revert') out = receipts(action, p, f, notes, refuse)
  else if (action === 'content.read') out = contentRead(p, notes)
  else if (platform === 'wordpress') out = wordpress(action, p, f, notes, refuse)
  else if (platform === 'joomla') out = joomla(action, p, f, notes, refuse)
  // 🔒 THE CONTRACT'S RULES DO NOT WAIT FOR THE PLATFORM TO BE KNOWN. `content.contract` exists on
  // Joomla alone, so a call of it IS a Joomla call: with the platform unread, CC-1 (no operation → an
  // inspect, not a write lease) and D9 (Tracy's apply ids) must still run, or an inspect takes the
  // door's write lease and an apply goes out under a spelling the component refuses.
  else if (action === 'content.contract') out = contract(p, f, notes, refuse)
  else out = relay(action, p, notes)
  if (out.kind === 'refuse') return out
  const unknown = checkParams(platform, out.action, out.params, {
    unread: out.action === 'content.list' && f.noListSearch === true ? ['search'] : []
  })
  if (unknown !== null) return { kind: 'refuse', answer: unknown, notes }
  const made = MINTED.get(out.params)
  if (made !== undefined && made.size > 0)
    out = {
      ...out,
      meta: { askedApplyId: out.meta?.askedApplyId ?? null, ...out.meta, mintedIds: [...made] }
    }
  return splitHost(out)
}

/** The record actions whose `id` may arrive as `<kind>:<id>` — the form `content.read {view:"pages"}` prints. */
const RECORD_REF_ACTIONS = new Set(['content.get', 'content.update', 'content.delete', 'content.language'])
/** A record as the page list prints it: a kind word, a colon, the CMS number. */
const RECORD_REF = /^([A-Za-z][A-Za-z_]{0,30}):(\d{1,15})$/

/**
 * 🔒 THE WRITE TAKES THE RECORD AS TRACY'S OWN READ PRINTED IT (09/10/2026). `content.read {view:"pages"}`
 * names each page's CMS record as `kind:id` (`read-compact.mjs` `recordOf`: "post:26", "article:552"), and
 * the model copied that string into `id`. WordPress refused it `ADDRESS_MISSING` ("an id is a number"), the
 * component refused the same id on `content.get` with `bad_params`, and each cost a step to learn the split
 * (bench hb, 09/10: two of two copies on a WordPress delete). One reading only: the kind is the prefix, the
 * id the number. A prefix that disagrees with a `kind` the call also names is left as asked, so its own
 * refusal says which of the two is wrong — save a WordPress page, which IS a post there (WP-10).
 * @param {Record<string, unknown>} p - mutated.
 * @param {string} platform
 * @param {string[]} notes
 */
function recordRef(p, platform, notes) {
  if (typeof p.id !== 'string') return
  const m = RECORD_REF.exec(p.id.trim())
  if (m === null) return
  const [whole, kind, digits] = m
  const id = Number(digits)
  const given = str(p.kind)
  const agrees =
    given === '' ||
    given === kind ||
    (platform === 'wordpress' && kind === 'post' && (given === 'page' || given === 'pages'))
  if (!Number.isSafeInteger(id) || id <= 0 || !agrees) return
  p.id = id
  if (given === '') p.kind = kind
  notes.push(`id "${whole}" → kind ${kind}, id ${id} (the record as content.read lists it)`)
}

/** The most characters a `content.list` search may hold, counted as the plugin counts them: characters. */
const SEARCH_MAX_CHARS = 200

/**
 * What a call that carried `search` on `content.list` says, before it leaves: an empty one filters
 * nothing and is dropped (said in `normalized`); a site that ignored one a moment ago is refused at
 * once (call-memory `noListSearch`, 15 minutes), which costs no relay; a value that is not text, or is
 * over {@link SEARCH_MAX_CHARS}, is refused `bad_params` — the plugin's own word for it. A text is
 * sent trimmed.
 *
 * 🔒 WHETHER THE PLUGIN READ IT IS NOT DECIDED HERE. Joomla 0.20.0 and WordPress 0.16.0 read it (`LIST_SEARCH_SINCE`),
 * an older plugin does not, and this host stores no plugin version: the answer's `search` key is the
 * proof, judged where the answer arrives (the relay's `LIST_SEARCH_UNSUPPORTED`, and `site-call.mjs` for a
 * relay that predates the guard).
 * @param {Record<string, unknown>} p - mutated: an empty search leaves it, a text is trimmed.
 * @param {CallFacts} f
 * @param {string[]} notes
 * @param {(code: string, extra: Record<string, unknown>) => Refuse} refuse
 * @returns {Refuse | null}
 */
function listSearch(p, f, notes, refuse) {
  const asked = p.search
  if (asked === null || (typeof asked === 'string' && asked.trim() === '')) {
    delete p.search
    notes.push('params.search dropped: it is empty, so it filters nothing')
    return null
  }
  // A plugin found to ignore a search lists its posts for any kind: it has no pattern list either.
  if (f.noListSearch === true && str(p.kind) === 'pattern')
    return {
      kind: 'refuse',
      answer: { ...patternsUnsupported({ list: true }), action: 'content.list' },
      notes
    }
  if (f.noListSearch === true)
    return refuse('LIST_SEARCH_UNSUPPORTED', {
      learned: true,
      error:
        "This site's Claude Cowork plugin ignored a search on content.list within the last 15 minutes, so none was sent."
    })
  if (typeof asked !== 'string') {
    const was = Array.isArray(asked)
      ? 'a list'
      : typeof asked === 'object'
        ? 'an object'
        : `a ${typeof asked}`
    return refuse('bad_params', {
      error: `search must be text of at most ${SEARCH_MAX_CHARS} characters, not ${was}`
    })
  }
  const text = asked.trim()
  const chars = [...text].length
  if (chars > SEARCH_MAX_CHARS)
    return refuse('bad_params', {
      error: `search is ${chars} characters; the most it takes is ${SEARCH_MAX_CHARS}`
    })
  p.search = text
  return null
}

/**
 * Why an upload's `content_b64` cannot be a file, or null when it can. Read as PHP's strict decoder
 * reads it: whitespace is skipped, padding is optional, and any other character outside the alphabet
 * — or a length no base64 text can have — is refused.
 * @param {unknown} value
 * @returns {string | null}
 */
export function uploadBytesProblem(value) {
  if (value === undefined || value === null)
    return "media.upload names no file: give file, the picture's name in this site's folder, or attachment, one sent in this chat"
  const text = typeof value === 'string' ? value.replace(/\s+/g, '') : ''
  if (text === '') return 'content_b64 is empty: the site would store a file of 0 bytes'
  const body = text.replace(/={1,2}$/, '')
  if (!/^[A-Za-z0-9+/]+$/.test(body) || body.length % 4 === 1) return 'content_b64 is not valid base64'
  return null
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {string[]} notes
 * @param {Resolve} [resolve]
 * @returns {Relay}
 */
function relay(action, params, notes, resolve) {
  return { kind: 'relay', action, params, host: {}, notes, ...(resolve ? { resolve } : {}) }
}

/**
 * 🔒 CONTENT.READ: THE NAMES AND VALUES THE RELAY TAKES, MIRRORED. site-tools cannot import tracy-web;
 * the source is `apps/tracy-web/src/lib/content-query.js` (`CONTENT_QUERY_NAMES`, `MAX_BYTES_RANGE`,
 * `VERSION_PATTERN`, the `type` enum) and the relay's `contentQueryProblem` in
 * `apps/tracy-web/src/sites/route.js` (which names go together). `test/normalize-content-read.test.mjs`
 * fails when a name kept here is not in that file.
 */
const CONTENT_READ_NAMES = new Set([
  'id',
  'ids',
  'type',
  'locale',
  'limit',
  'cursor',
  'blocksCursor',
  'blockId',
  'itemsCursor',
  'describe',
  'view',
  'url',
  'fields',
  'ifVersion',
  'changedSince',
  'maxBytes'
])
const CONTENT_READ_TYPES = new Set(['page', 'article', 'service', 'project', 'shared', 'generic'])
/**
 * 🔒 A CMS'S OWN WORD FOR A TYPE READS AS THE CONTENT API'S (09/10/2026). The relay knows six types and
 * refuses any other (`CONTENT_BAD_QUERY "type must be one of …"`), and the model asks for the records by the
 * name its CMS gives them: `type:"post"` for WordPress posts (bench hb, 09/10: 4 of 4 such reads on a
 * WordPress delete, each a refused step, and one of them hid a `fields` key the relay would have dropped).
 * Each word below has one reading in every adapter — a WordPress post and a Joomla article are `article`,
 * a Joomla menu item is the `page` it opens, a module the `shared` part it is (`list-search.mjs`
 * `JOOMLA_READ_TYPES`), a plural its singular. A word with two readings ("news", "blog": a page or the
 * posts it lists) is not here: its refusal names the six.
 */
const CONTENT_READ_TYPE_WORDS = Object.freeze({
  post: 'article',
  posts: 'article',
  articles: 'article',
  pages: 'page',
  menuitem: 'page',
  module: 'shared',
  modules: 'shared',
  projects: 'project',
  services: 'service'
})
const CONTENT_VERSION = /^cv1\.[a-f0-9]{32}$/

/**
 * The three shapes of a `content.read` whose extra names have one reading, each with what it keeps
 * (as `contentQueryProblem` accepts it) and what it drops. A name in neither list leaves the call as
 * asked. `offset` is not a content.read name at all; beside view "pages" it can only mean paging the
 * walk, which the relay does itself.
 */
export const CONTENT_READ_KEPT = Object.freeze({
  id: Object.freeze(['id', 'blockId', 'blocksCursor', 'itemsCursor', 'fields', 'maxBytes', 'ifVersion']),
  pages: Object.freeze(['view', 'locale', 'url', 'ifVersion', 'changedSince']),
  changedSince: Object.freeze(['changedSince', 'locale'])
})
const CONTENT_READ_DROPPED = Object.freeze({
  id: Object.freeze(['type', 'locale', 'limit', 'cursor', 'view', 'url']),
  pages: Object.freeze([
    'offset',
    'limit',
    'cursor',
    'type',
    'fields',
    'maxBytes',
    'blockId',
    'blocksCursor',
    'itemsCursor'
  ]),
  changedSince: Object.freeze([
    'type',
    'limit',
    'cursor',
    'fields',
    'maxBytes',
    'blockId',
    'blocksCursor',
    'itemsCursor',
    'ifVersion'
  ])
})
const CONTENT_READ_WHY = Object.freeze({
  id: 'id reads one content',
  pages: 'view "pages" takes only locale, url, ifVersion and changedSince',
  changedSince: 'changedSince takes only locale'
})
/**
 * A value the relay refuses on its own, or a name it does not know: such a call is relayed as asked,
 * so its worded refusal names what to fix. Correcting around it would hide the mistake.
 * @param {Record<string, unknown>} p
 */
function contentReadUnsafe(p) {
  for (const key of Object.keys(p))
    if (!CONTENT_READ_NAMES.has(key) && !(key === 'offset' && p.view === 'pages')) return true
  if (p.type !== undefined && !CONTENT_READ_TYPES.has(/** @type {string} */ (p.type))) return true
  if (p.view !== undefined && p.view !== 'pages') return true
  if (p.limit !== undefined) {
    const limit = Number(p.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return true
  }
  if (
    p.maxBytes !== undefined &&
    !(Number.isInteger(p.maxBytes) && Number(p.maxBytes) >= 8192 && Number(p.maxBytes) <= 262144)
  )
    return true
  for (const key of ['ifVersion', 'changedSince'])
    if (p[key] !== undefined && !(typeof p[key] === 'string' && CONTENT_VERSION.test(p[key]))) return true
  if (
    p.fields !== undefined &&
    typeof p.fields !== 'string' &&
    !(Array.isArray(p.fields) && p.fields.every((x) => typeof x === 'string'))
  )
    return true
  return false
}

/** The `fields` paths that show a slot's key: a read that shows one is what an apply may be based on. */
const SLOT_SHOWING_PATHS = new Set(['blocks', 'fields', 'blocks.fields.slotKey', 'fields.slotKey'])

/**
 * 🔒 A PROJECTION THAT SHOWS SLOT KEYS ALSO CARRIES THE CONTENT'S REVISION. The relay keeps only the
 * keys asked for (`content-fields.js`: a content's `id` and `native` are all it adds), so
 * `fields:"title,blocks.fields.value,blocks.fields.slotKey"` — the projection the describe document's
 * own `next` teaches — showed the slots and no revision. The apply that followed had nothing to be
 * based on and answered INSPECT_FIRST, although the door's own text promises "apply, no inspect"
 * (round 7: 4 of the 12 INSPECT_FIRST answers of the picture runs; a model that asked for `revision`
 * itself was the exception). A read that shows no slot key teaches no slot, so it is left as asked.
 * @param {Record<string, unknown>} p - a safe `content.read` (`contentReadUnsafe` said no).
 */
function withRevision(p) {
  if (p.fields === undefined) return
  const list = typeof p.fields === 'string' ? p.fields.split(',') : /** @type {string[]} */ (p.fields)
  const named = list.map((x) => x.trim()).filter((x) => x !== '')
  if (named.includes('revision') || !named.some((x) => SLOT_SHOWING_PATHS.has(x))) return
  p.fields = typeof p.fields === 'string' ? [...named, 'revision'].join(',') : [...list, 'revision']
}

/**
 * `content.read` (measured 28/09/2026, dev + local stand since 26/09: the wrong-parameter refusals
 * whose intent is unambiguous). `fields` naming an id the answer always carries, or a key the record
 * does not have, loses that name (`content-read-fields.mjs`); an id beside listing filters,
 * changedSince beside anything but locale, and view "pages" beside anything that pages or narrows the
 * walk lose what the relay would refuse them for. `describe` and `ids` are never touched: each is
 * asked alone, and a call mixing them asks two things.
 * @param {Record<string, unknown>} p
 * @param {string[]} notes
 * @returns {Relay}
 */
function contentRead(p, notes) {
  if (typeof p.type === 'string' && !CONTENT_READ_TYPES.has(p.type)) {
    const word = p.type.trim().toLowerCase()
    const type = Object.hasOwn(CONTENT_READ_TYPE_WORDS, word)
      ? CONTENT_READ_TYPE_WORDS[/** @type {keyof typeof CONTENT_READ_TYPE_WORDS} */ (word)]
      : CONTENT_READ_TYPES.has(word)
        ? word
        : null
    if (type !== null) {
      notes.push(`type "${p.type.slice(0, 30)}" → "${type}" (content.read's word for it)`)
      p.type = type
    }
  }
  if (contentReadUnsafe(p)) return relay('content.read', p, notes)
  if (p.fields !== undefined) {
    const shaped = normalizeFields(p.fields)
    if (shaped !== null) {
      notes.push(...shaped.notes)
      if (shaped.fields === null) delete p.fields
      else p.fields = typeof p.fields === 'string' ? shaped.fields.join(',') : shaped.fields
    }
    withRevision(p)
  }
  const shape =
    p.id !== undefined
      ? 'id'
      : p.view === 'pages'
        ? 'pages'
        : p.changedSince !== undefined
          ? 'changedSince'
          : null
  if (shape === null) return relay('content.read', p, notes)
  const kept = CONTENT_READ_KEPT[shape]
  const dropped = CONTENT_READ_DROPPED[shape]
  const extra = Object.keys(p).filter((k) => !kept.includes(k))
  if (extra.length === 0 || !extra.every((k) => dropped.includes(k))) return relay('content.read', p, notes)
  for (const k of extra) delete p[k]
  notes.push(`${extra.map((k) => `params.${k}`).join(', ')} dropped: ${CONTENT_READ_WHY[shape]}`)
  return relay('content.read', p, notes)
}

/**
 * Take Tracy's own parameters off the call: they were checked with the rest, and they never reach the
 * component.
 * @param {Relay} n
 * @returns {Relay}
 */
function splitHost(n) {
  const key = allowKey(n.action, n.params) ?? n.action
  const own = [
    .../** @type {Record<string, readonly string[]>} */ (HOST_PARAMS[key] ?? []),
    ...UNIVERSAL_HOST_PARAMS
  ]
  /** @type {Record<string, unknown>} */
  const host = { ...n.host }
  const params = { ...n.params }
  for (const k of own)
    if (k in params) {
      host[k] = params[k]
      delete params[k]
    }
  return { ...n, params, host }
}

/**
 * The receipts (AL-1, AL-2, AL-3). Measured r2: 4 `apply.list` calls with no id — every one BEFORE any
 * write, used to look around rather than to check a receipt.
 *
 * 🔒 AL-3: AN UNDO WITH NO ID IS REFUSED HERE, WITH THIS CONVERSATION'S IDS — NEVER GUESSED. Relayed,
 * the component answered `bad_params "apply_id required"`, and that next told the model to invent "a
 * short name for this change": a name that matches no receipt, or another conversation's. 0 in r2,
 * kept because an undo is destructive.
 *
 * 🔒 AL-4 (14/10/2026, ladder DL15 on dsl2jo): A LIST WITH NO ID IN A CONVERSATION THAT WROTE NOTHING IS
 * THE SITE'S RECENT CHANGES. It was refused `NOTHING_TO_LIST`, and that is exactly the call a customer's
 * "undo the change you made" opens with in a NEW conversation: the agent found no receipt, bootstrapped
 * Joomla from the shell to read the plugin's log, and undid two articles the customer had not named. Sent
 * with no id, the Apply door answers from Tracy's own record — every conversation's recorded changes on
 * this site, newest first, each with its apply_id (`apps/tracy-web/src/sites/recent-changes.js`). A
 * conversation that HAS written still lists its own latest (AL-1), as measured.
 * @param {string} action
 * @param {Record<string, unknown>} p
 * @param {CallFacts} f
 * @param {string[]} notes
 * @param {(code: string, extra: Record<string, unknown>) => Refuse} refuse
 * @returns {Relay | Refuse}
 */
function receipts(action, p, f, notes, refuse) {
  const asked = str(p.apply_id)
  const ids = Array.isArray(f.applyIds) ? f.applyIds : []
  const map = isRecord(f.idMap) ? f.idMap : {}
  if (asked === '') {
    if (action === 'apply.revert')
      return refuse('ADDRESS_MISSING', {
        needs: 'apply_id',
        candidates: ids.slice(-5),
        error: 'apply.revert needs the apply_id of the change to undo; it is never guessed'
      })
    const last = ids.at(-1)
    if (last === undefined) {
      delete p.apply_id
      notes.push("no apply_id: the site's recent changes, from every conversation")
      return relay(action, p, notes)
    }
    p.apply_id = last
    notes.push(`apply_id ${last} (the latest write of this conversation)`)
  } else if (typeof map[asked] === 'string' && map[asked] !== asked) {
    p.apply_id = map[asked]
    notes.push(`apply_id ${asked} → ${p.apply_id} (the id the write was sent under)`)
  }
  return relay(action, p, notes)
}

/**
 * WordPress (WP-1, 2, 4–10, 13, 16–18, 20, 22–24, 27–29; each with an r2 count, or D9).
 * @param {string} action
 * @param {Record<string, unknown>} p
 * @param {CallFacts} f
 * @param {string[]} notes
 * @param {(code: string, extra: Record<string, unknown>) => Refuse} refuse
 * @returns {Relay | Refuse}
 */
function wordpress(action, p, f, notes, refuse) {
  // WP-1 — r2: 50 calls in 32 of 33 cases, 23 of them repeats after a next that did not say why.
  // 🔒 EXCEPT ON A SITE PROVISION BOUND (#337): its Claude Cowork plugin (0.12+) has the door and refuses every
  // record write, so the contract's own rules run as on Joomla (CC-1, D9). A marker that could not say
  // (null) lets the call through too — the Claude Cowork plugin's answer is then the truth, where a refusal here
  // would leave a bound site with no door at all.
  if (action === 'content.contract') {
    // An imported copy's derived slots (01/10/2026): `content.read` and a pick name their apply, and the
    // plugin takes it beside every record write — the contract's own rules run here too.
    if (f.contractDoor === true || f.contractDoor === null || f.derived === true)
      return contract(p, f, notes, refuse)
    return refuse('NOT_ON_THIS_PLATFORM', {
      what: 'content.contract',
      error:
        'this WordPress site is not bound to a content contract: its words live in posts and template parts'
    })
  }
  // WP-2 — r2: 7.
  if (action === 'content.batch')
    return refuse('NOT_ON_THIS_PLATFORM', {
      what: 'content.batch',
      error: 'WordPress has no content.batch; each record is one content.update'
    })
  if (action === 'content.renderedWords') {
    const op = str(p.operation)
    if (op !== 'inspect' && op !== 'apply' && op !== 'status')
      return refuse('BAD_PARAMS', {
        param: 'operation',
        error: 'content.renderedWords takes operation "inspect", "apply" or "status"'
      })
    if (op === 'apply') {
      ensureApplyId(p, f, notes)
      // One request per apply: a replay of the same request answers `replayed`, never a second write.
      if (str(p.request_id) === '' && str(p.apply_id) !== '') {
        p.request_id = str(p.apply_id)
        notes.push('request_id = apply_id (Tracy set it)')
      }
    }
    return relay(action, p, notes)
  }
  if (action === 'content.list') return wpList(p, notes, refuse)
  if (action === 'content.get') return wpGet(p, notes, refuse)
  if (action === 'content.update' || action === 'content.delete') return wpWrite(action, p, f, notes, refuse)
  if (action === 'content.language') {
    // WP-28 — r2: 2, each relayed, refused, and holding the write lease meanwhile.
    if (positiveId(p.id) === 0 || str(p.lang) === '')
      return refuse('ADDRESS_MISSING', {
        needs: 'id and lang',
        error: 'content.language needs the post id and the language it is written in'
      })
    ensureApplyId(p, f, notes)
  }
  return relay(action, p, notes)
}

/**
 * @param {Record<string, unknown>} p
 * @param {string[]} notes
 * @param {(code: string, extra: Record<string, unknown>) => Refuse} refuse
 * @returns {Relay | Refuse}
 */
function wpList(p, notes, refuse) {
  const asked = str(p.kind)
  if (asked === '' || asked === 'post') return relay('content.list', p, notes)
  // The site's registered block patterns (01/10/2026): listed by the plugin, judged by its echo
  // (`site-call.mjs` `patternListOrRefused`).
  if (asked === 'pattern' || asked === 'patterns') {
    if (asked !== 'pattern') {
      p.kind = 'pattern'
      notes.push(`kind ${asked} → pattern`)
    }
    return relay('content.list', p, notes)
  }
  /** @param {string} postType @param {Resolve} [resolve] */
  const asPosts = (postType, resolve) => {
    notes.push(`kind ${asked} → post, post_type "${postType}"`)
    p.kind = 'post'
    p.post_type = postType
    return relay('content.list', p, notes, resolve)
  }
  // WP-4 (r2: 4), WP-5 (r2: 4), WP-6 (r2: 8): the component lists posts only, of any post type.
  if (asked === 'page' || asked === 'pages') return asPosts('page')
  if (WP_PART_WORDS.has(asked)) return asPosts('wp_template_part')
  if (WP_NAV_WORDS.has(asked)) return asPosts('wp_navigation', { type: 'wpNavFallback' })
  // WP-7 (r2: 7): no door lists options; the ones a page shows are read one by one.
  if (asked === 'option' || asked === 'options') {
    notes.push('no door lists options: the ones a page shows, read one by one')
    // Listed by this host, whole: a search would be read by nobody and the list would look filtered.
    if (p.search !== undefined) {
      delete p.search
      notes.push('params.search dropped: options are listed whole, never searched')
    }
    return relay('content.list', p, notes, { type: 'wpOptions', keys: [...WP_SHOWN_OPTIONS] })
  }
  // WP-8 (r2: 4 postmeta).
  if (WP_NOT_LISTABLE.has(asked))
    return refuse('NOT_LISTABLE', {
      kind: asked,
      error: `${asked} is not listed here; it is read one at a time`
    })
  // WP-9 (r2: 12).
  return refuse('NOT_ON_THIS_PLATFORM', {
    what: `kind ${asked.slice(0, 40)}`,
    instead: JOOMLA_ONLY[/** @type {keyof typeof JOOMLA_ONLY} */ (asked)] ?? null,
    error: `kind "${asked.slice(0, 40)}" is not a WordPress kind; content.list lists posts (any post_type)`
  })
}

/**
 * @param {Record<string, unknown>} p
 * @param {string[]} notes
 * @param {(code: string, extra: Record<string, unknown>) => Refuse} refuse
 * @returns {Relay | Refuse}
 */
function wpGet(p, notes, refuse) {
  let kind = str(p.kind)
  let id = positiveId(p.id)
  if (kind in JOOMLA_ONLY)
    return refuse('NOT_ON_THIS_PLATFORM', {
      what: `kind ${kind}`,
      instead: JOOMLA_ONLY[/** @type {keyof typeof JOOMLA_ONLY} */ (kind)],
      error: `kind "${kind}" is not a WordPress kind`
    })
  // WP-10 (r2: 4): a page IS a post here.
  if (kind === 'page' || kind === 'pages') {
    notes.push(`kind ${kind} → post`)
    kind = 'post'
    p.kind = 'post'
  }
  // TP-MODEL M5 (02/10/2026): `rev` copied from an outline's next onto a body READ. It means nothing on a
  // read (a read answers the rev), so it is dropped and said — never refused, which cost a step and taught
  // nothing. On any other kind it stays an unknown key.
  if ('rev' in p && ['', 'post', 'templatePart', 'template'].includes(kind)) {
    delete p.rev
    notes.push('params.rev dropped: a read needs none; send rev with blocks on content.update')
  }
  kind = termKind(p, kind, notes)
  optionKey(p, kind, notes)
  // WP-14 (0 in r2): a template part named by its row's number is that row — a post.
  if (kind === 'templatePart' && str(p.key) === '' && id > 0) {
    notes.push(`templatePart id ${id} → kind post (a part's stored row is a post)`)
    kind = 'post'
    p.kind = 'post'
  }
  id = positiveId(p.id)
  const key = str(p.key)
  // WP-18 — no kind and a name for an id: the call names no record the component can read.
  if (kind === '' && p.id !== undefined && id === 0 && key === '')
    return refuse('ADDRESS_MISSING', {
      needs: 'kind and key',
      got: String(p.id).slice(0, 40),
      error: 'this call names no record: an id is a number; a name is read with kind and key'
    })
  // WP-13 (r2: 2): a template part is named by its slug — `theme//footer` or `footer` given as id.
  if (kind === 'templatePart' && key === '' && p.id !== undefined && id === 0) {
    const was = String(p.id)
    const slug = was.split('//').pop()?.trim() ?? ''
    if (slug !== '') {
      delete p.id
      p.key = slug
      notes.push(`templatePart id "${was.slice(0, 40)}" → key "${slug}"`)
    }
  }
  if (kind === 'post' || kind === '') {
    if (id === 0 && key !== '') {
      // WP-15 (0 in r2): "home" is whichever page the site shows on its front — option
      // `page_on_front` says which; a slug lookup of "home" finds a page that may not be it.
      if (WP_FRONT_WORDS.has(key.toLowerCase()))
        return relay('content.get', p, notes, { type: 'wpFront', key: key.slice(0, 40) })
      // WP-16 (r2: 1): a post type named as the key is a list of that type.
      if (WP_POST_TYPES.has(key)) {
        notes.push(`content.get {key:"${key}"} → content.list {post_type:"${key}"}`)
        return relay('content.list', { kind: 'post', post_type: key }, notes)
      }
      // WP-17 (r2: 2): the component reads a post by id only (`WWriters.php:82`); a slug is found by
      // `content.list {name}`, then read by its id.
      return relay('content.get', p, notes, { type: 'wpSlug', slug: key })
    }
  }
  // WP-18 (r2: 4 postmeta): both halves of the address, or the component answers not_found.
  if (kind === 'postmeta' && (id === 0 || key === ''))
    return refuse('ADDRESS_MISSING', {
      kind,
      needs: id === 0 ? 'id' : 'key',
      error: `a postmeta is read with both its post id and its key; this call has no ${id === 0 ? 'id' : 'key'}`
    })
  if (kind === 'term' && (id === 0 || key === ''))
    return refuse('ADDRESS_MISSING', {
      kind,
      needs: id === 0 ? 'id' : 'key',
      error: `a term is read with its taxonomy (key) and its id; this call has no ${id === 0 ? 'id' : 'key'}`
    })
  return relay('content.get', p, notes)
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} p
 * @param {CallFacts} f
 * @param {string[]} notes
 * @param {(code: string, extra: Record<string, unknown>) => Refuse} refuse
 * @returns {Relay | Refuse}
 */
function wpWrite(action, p, f, notes, refuse) {
  let kind = str(p.kind)
  const id = positiveId(p.id)
  // WP-21 (0 in r2): a page is a post; a NEW one says its post type, or it is created as a post.
  if (kind === 'page' || kind === 'pages') {
    notes.push(`kind ${kind} → post`)
    kind = 'post'
    p.kind = 'post'
    if (action === 'content.update' && id === 0 && !malformedId(p.id) && isRecord(p.fields)) {
      if (!('post_type' in p.fields)) {
        p.fields.post_type = 'page'
        notes.push('fields.post_type "page" (a new page)')
      }
    }
  }
  kind = termKind(p, kind, notes)
  optionKey(p, kind, notes)
  if (kind in JOOMLA_ONLY)
    return refuse('NOT_ON_THIS_PLATFORM', {
      what: `kind ${kind}`,
      instead: JOOMLA_ONLY[/** @type {keyof typeof JOOMLA_ONLY} */ (kind)],
      error: `kind "${kind}" is not a WordPress kind`
    })
  /**
   * 🔒 A PRESENT ID THAT IS NOT A WHOLE NUMBER IS REFUSED, NEVER READ AS "NO ID". `positiveId` reads
   * "42abc", 42.5 or `true` as 0 — a create, which the body guard passes — while the component casts
   * with PHP `(int)` and writes post 42 (or 1). Verified 25/09: `{kind:"post", id:"42abc",
   * fields:{post_content:"x"}}` after a 26,884-char read was relayed and overwrote the page with one
   * character. Only `0`/"0" and a missing id mean create. A template part's string id is its slug
   * (WP-13), handled in `partFields`; an option is named by its key and reads no id.
   */
  if (malformedId(p.id) && kind !== 'option' && !(kind === 'templatePart' && typeof p.id === 'string'))
    return refuse('ADDRESS_MISSING', {
      ...(kind ? { kind } : {}),
      needs: 'id',
      got: String(p.id).slice(0, 40),
      error: `an id is a number, and ${JSON.stringify(String(p.id).slice(0, 40))} is not one`
    })
  /**
   * WP-19 (0 in r2): an EDIT by id whose every field is a post field is a post — but only once a
   * read says the row is a page, a post or a menu (`wpKindOfId`, before the body guard); a template
   * part's row is written by its key instead. 🔒 NEVER A CREATE: with no id this is WP-20 below.
   */
  if (
    kind === '' &&
    id > 0 &&
    action === 'content.update' &&
    isRecord(p.fields) &&
    Object.keys(p.fields).length > 0 &&
    Object.keys(p.fields).every((k) => WP_POST_FIELDS.includes(k) || Object.hasOwn(WP_POST_ALIASES, k))
  ) {
    const bad = postFields(p.fields, notes)
    if (bad !== null) return refuse('NO_WRITABLE_FIELD', { kind: 'post', ...bad })
    p.kind = 'post'
    ensureApplyId(p, f, notes)
    return relay(action, p, notes, { type: 'wpKindOfId', id })
  }
  // WP-20 (r2: 7 — C02, C04, C20: `{apply_id, fields:{post_content: 6–27 KB}}`). 🔒 NEVER GUESSED:
  // without kind and id this call would have CREATED a new draft instead of changing the page. An id
  // the call carries is kept (the next never names another one); only an id-less call is shown the
  // posts this conversation read, to choose from.
  if (kind === '')
    return refuse(
      'ADDRESS_MISSING',
      id > 0
        ? { needs: 'kind', id, error: 'this call names no kind of record' }
        : {
            needs: 'kind and id',
            candidates: (Array.isArray(f.postsRead) ? f.postsRead : []).slice(-5),
            error: 'Without kind and id this call would have CREATED a new draft instead of changing a page.'
          }
    )
  if (action === 'content.update') {
    const fields = p.fields
    // WP-29 (r2: 2 probes with `fields:{}`). W1 (c): the after-final bench C47 sent `removes` with no
    // fields, as if it removed something itself; the hint lets the next say it only lets a shorter
    // body through.
    if (!isRecord(fields) || Object.keys(fields).length === 0)
      return refuse('NO_WRITABLE_FIELD', {
        kind,
        given: [],
        ...('removes' in p ? { hint: 'removes' } : {}),
        error: 'fields is empty: nothing would change'
      })
    if (kind === 'post') {
      const bad = postFields(fields, notes)
      if (bad !== null) return refuse('NO_WRITABLE_FIELD', { kind, ...bad })
      // A post write's `seo` is held to the search title's rules (`wpSeoField`): an older plugin drops it
      // where no SEO plugin already holds the post's value, without a word.
      if ('seo' in fields) {
        ensureApplyId(p, f, notes)
        return relay(action, p, notes, { type: 'wpSeoField' })
      }
    } else if (kind === 'templatePart') {
      // WP-24's read (0 in r2): a part named by its stored row's number is written by that row's
      // slug — one read (`wpPartSlug`, which `runSiteCall` makes before the body guard) says which,
      // and that it IS a part.
      const pending = str(p.key) === '' && positiveId(p.id) > 0 ? positiveId(p.id) : 0
      const bad = partFields(p, fields, notes, pending > 0)
      if (bad !== null) return refuse(bad.code, { kind, ...bad.extra })
      ensureApplyId(p, f, notes)
      if (pending > 0) return relay(action, p, notes, { type: 'wpPartSlug', id: pending })
      // WP-24 — the component sets the part's title to its slug when `title` is left out
      // (`write_template_part`, `:924`); measured once in r2. The title is read back and kept.
      if (!('title' in /** @type {Record<string, unknown>} */ (p.fields)) && str(p.key) !== '')
        return relay(action, p, notes, { type: 'wpPartTitle', key: str(p.key) })
      return relay(action, p, notes)
    } else if (kind === 'postmeta' || kind === 'option' || kind === 'term') {
      // WP-18's write half — r2: 1 (`postmeta needs a key`), refused only after holding the lease.
      // A term's key is its taxonomy (`write_term`, `:762-765`).
      if (str(p.key) === '' || (kind === 'postmeta' && id === 0))
        return refuse('ADDRESS_MISSING', {
          kind,
          needs: str(p.key) === '' ? 'key' : 'id',
          error:
            kind === 'term'
              ? 'a term is written with its taxonomy as key, e.g. "category", and its id'
              : `a ${kind} is written with ${kind === 'postmeta' ? 'its post id and ' : ''}its key`
        })
      if (kind === 'term') termFields(fields, notes)
      else {
        const bad = valueField(kind, str(p.key), fields, notes)
        if (bad !== null) return refuse('NO_WRITABLE_FIELD', { kind, ...bad })
        // The plugin's own search title or description: printed only by a plugin new enough, and only
        // where no SEO plugin runs — one read of the site says which key holds (`wpSeoMeta`).
        const field =
          kind === 'postmeta' && str(p.key) === WP_SEO_META.title
            ? 'title'
            : kind === 'postmeta' && str(p.key) === WP_SEO_META.description
              ? 'description'
              : null
        if (field !== null) {
          ensureApplyId(p, f, notes)
          return relay(action, p, notes, { type: 'wpSeoMeta', field })
        }
      }
    }
  }
  ensureApplyId(p, f, notes)
  return relay(action, p, notes)
}

/**
 * WP-22 and WP-23 on a post's fields. Returns null when every field is one the component writes.
 *
 * 🔒 A LEFTOVER FIELD IS REFUSED, NOT PASSED: `write_post` writes the fields it knows and DROPS the
 * rest without a word when one of them is valid (`:628-645`). Measured r2: 10 writes named fields that
 * do not exist — `hero.cta.1`, `services.item.5.title`, `__probe__`, `post_content_find`.
 * @param {Record<string, unknown>} fields
 * @param {string[]} notes
 * @returns {Record<string, unknown> | null}
 */
function postFields(fields, notes) {
  for (const [alias, real] of Object.entries(WP_POST_ALIASES)) {
    if (!(alias in fields)) continue
    if (real in fields && JSON.stringify(fields[real]) !== JSON.stringify(fields[alias]))
      return {
        given: [alias, real],
        allowed: [...WP_POST_FIELDS],
        conflict: { alias, real },
        error: `fields holds both ${alias} and ${real} with different values`
      }
    fields[real] = fields[alias]
    delete fields[alias]
    notes.push(`fields.${alias} → ${real}`)
  }
  if (fields.post_status === 'published') {
    fields.post_status = 'publish'
    notes.push('post_status "published" → "publish"')
  }
  /**
   * 🔒 A POST'S WORDS ARE ONE STRING, OR NOTHING IS SENT. The component copies each value into
   * `wp_update_post` as it is, so an array or an object is stored as the word "Array" and a number
   * as its digits — and the body guard measures only a string, so such a write passed it unmeasured.
   * Verified 25/09 after a 26,884-char read: `{content:{raw:"<p>…</p>"}}` (the REST shape, aliased
   * here), `post_content:["…"]` and `post_content:7` were each relayed and answered `ok:true`. The
   * REST shape's `raw` is the block markup itself, so it is unwrapped; `rendered` is the page's HTML
   * with the blocks gone, and is never read as the body.
   */
  for (const field of ['post_title', 'post_content', 'post_excerpt']) {
    if (!(field in fields)) continue
    const value = fields[field]
    if (isRecord(value) && typeof value.raw === 'string') {
      fields[field] = value.raw
      notes.push(`fields.${field}.raw → ${field}`)
    } else if (
      field === 'post_content' ? typeof value !== 'string' : value === null || typeof value === 'object'
    )
      return {
        given: [field],
        allowed: [...WP_POST_FIELDS],
        needs: 'string',
        field,
        error: `${field} is ${field === 'post_content' ? "the page's block markup" : 'text'} as one string`
      }
  }
  const unknown = Object.keys(fields).filter((k) => !WP_POST_FIELDS.includes(k))
  if (unknown.length === 0) return null
  // W1 (c): `removes` is Tracy's parameter beside fields; the after-final bench C47 put it inside them twice.
  const hint = unknown.includes('removes')
    ? 'removes'
    : unknown.some((k) => /^[a-z]+(\.[a-z0-9_]+)+$/i.test(k))
      ? 'slot'
      : unknown.some((k) => /_(find|replace)$/.test(k))
        ? 'replace'
        : unknown.some((k) => /probe|bogus|^__|^nope$/i.test(k))
          ? 'probe'
          : null
  return {
    given: unknown,
    allowed: [...WP_POST_FIELDS],
    hint,
    error: `no writable field ${unknown
      .slice(0, 3)
      .map((k) => `"${k.slice(0, 30)}"`)
      .join(', ')} for kind post`
  }
}

/**
 * WP-24 on a template part: `post_content`/`post_title` are its read names; `content` is required.
 * @param {Record<string, unknown>} p
 * @param {Record<string, unknown>} fields
 * @param {string[]} notes
 * @param {boolean} [slugPending] - the part is named by its row's number, and a read will give its
 *   slug (`wpPartSlug`): the missing key is not refused here.
 * @returns {{ code: string, extra: Record<string, unknown> } | null}
 */
function partFields(p, fields, notes, slugPending = false) {
  for (const [alias, real] of Object.entries(WP_PART_ALIASES))
    if (alias in fields && !(real in fields)) {
      fields[real] = fields[alias]
      delete fields[alias]
      notes.push(`fields.${alias} → ${real}`)
    }
  // The REST shape's `raw` is the part's block markup (see `postFields`).
  if (isRecord(fields.content) && typeof fields.content.raw === 'string') {
    fields.content = fields.content.raw
    notes.push('fields.content.raw → content')
  }
  // A part named by `theme//slug` or its slug as the id: the key is the slug (WP-13's write half).
  if (str(p.key) === '' && typeof p.id === 'string' && positiveId(p.id) === 0) {
    const slug = p.id.split('//').pop()?.trim() ?? ''
    if (slug !== '') {
      notes.push(`templatePart id "${p.id.slice(0, 40)}" → key "${slug}"`)
      delete p.id
      p.key = slug
    }
  }
  /**
   * 🔒 A PART IS WRITTEN BY ITS SLUG ALONE, SO A NUMBER BESIDE THE SLUG LEAVES THE CALL. The component
   * reads only the key (`write()` → `write_template_part($key, $fields)`,
   * `class-claude-cowork-writers.php:357-358`), while the body guard looked the id up FIRST: with the
   * header (7,848 chars) and the footer (3,000, post 81) read, `{kind:"templatePart", key:"header",
   * id:81, fields:{content: 2,500 chars}}` was judged against the footer and cut the header (review,
   * 25/09). The id changes nothing on the site, so no reader may take it for the address.
   */
  if (str(p.key) !== '' && p.id !== undefined && positiveId(p.id) > 0) {
    notes.push(`templatePart id ${String(p.id).slice(0, 20)} dropped: a part is written by its key`)
    delete p.id
  }
  if (str(p.key) === '' && !slugPending)
    return {
      code: 'ADDRESS_MISSING',
      extra: {
        needs: 'key',
        error: 'a template part is written by its slug (key), e.g. "header" or "footer"'
      }
    }
  const unknown = Object.keys(fields).filter((k) => !WP_PART_FIELDS.includes(k))
  if (unknown.length > 0 || typeof fields.content !== 'string')
    return {
      code: 'NO_WRITABLE_FIELD',
      extra: {
        given: unknown,
        allowed: [...WP_PART_FIELDS],
        ...(unknown.includes('removes') ? { hint: 'removes' } : {}),
        needs: typeof fields.content === 'string' ? undefined : 'content',
        error:
          typeof fields.content === 'string'
            ? `no writable field ${unknown.map((k) => `"${k.slice(0, 30)}"`).join(', ')} for a template part`
            : 'a template part write needs fields.content: the whole block markup of the part'
      }
    }
  return null
}

/**
 * WP-11 (0 in r2): a category or a tag is a term. The component reads and writes one by its
 * taxonomy as `key` and its id (`write_term`, `:762-765`); `kind:"category"` was refused
 * `bad_params` only after the door had taken the write lease.
 * @param {Record<string, unknown>} p
 * @param {string} kind
 * @param {string[]} notes
 * @returns {string} the kind the call now has.
 */
function termKind(p, kind, notes) {
  if (!Object.hasOwn(WP_TERM_TAXONOMY, kind)) return kind
  const taxonomy = WP_TERM_TAXONOMY[/** @type {keyof typeof WP_TERM_TAXONOMY} */ (kind)]
  const had = str(p.key)
  p.kind = 'term'
  p.key = taxonomy
  notes.push(
    `kind ${kind} → term, key "${taxonomy}"${had !== '' && had !== taxonomy ? ` (not "${had.slice(0, 24)}")` : ''}`
  )
  return 'term'
}

/**
 * WP-12 (0 in r2; hist demowpnam 19/09 `{kind:"option", id:"blogname"}`): an option is named by its
 * key, and the component reads no id for it — a name given as `id` is that key.
 * @param {Record<string, unknown>} p
 * @param {string} kind
 * @param {string[]} notes
 */
function optionKey(p, kind, notes) {
  if (kind !== 'option' || str(p.key) !== '' || typeof p.id !== 'string') return
  const name = p.id.trim()
  if (name === '' || positiveId(name) > 0) return
  p.key = name
  delete p.id
  notes.push(`option id "${name.slice(0, 40)}" → key`)
}

/**
 * WP-25 (0 in r2): an option or a postmeta takes ONE field, `value`. The read shape's own names
 * (`option_value`, `meta_value`) or the key itself as the field's name are that value; two or more
 * fields are refused, since the component would write one and say nothing of the rest.
 * @param {string} kind
 * @param {string} key
 * @param {Record<string, unknown>} fields
 * @param {string[]} notes
 * @returns {Record<string, unknown> | null} a `NO_WRITABLE_FIELD` refusal's fields, or null.
 */
function valueField(kind, key, fields, notes) {
  const names = Object.keys(fields)
  if (names.length > 1)
    return {
      given: names,
      allowed: ['value'],
      error: `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind} takes one field, value; this call has ${names.length}`
    }
  const name = names[0]
  if (name !== 'value' && (WP_VALUE_SPELLINGS.includes(name) || (key !== '' && name === key))) {
    fields.value = fields[name]
    delete fields[name]
    notes.push(`fields.${name.slice(0, 30)} → value`)
  }
  return null
}

/**
 * WP-26 (0 in r2): a term's name arrives as `title` (its read shape) or `label`. `write_term` ignores
 * a field it does not know and answers `ok:true` — a rename that changed nothing.
 * @param {Record<string, unknown>} fields
 * @param {string[]} notes
 */
function termFields(fields, notes) {
  for (const [alias, real] of Object.entries(WP_TERM_ALIASES))
    if (alias in fields && !(real in fields)) {
      fields[real] = fields[alias]
      delete fields[alias]
      notes.push(`fields.${alias} → ${real}`)
    }
}

/**
 * WP-27: a write with no apply_id gets one of its own, the n-th of this turn (call-memory `wpApplyId`; owner
 * 26/10/2026, was one id per turn under D9), so `apply.revert` undoes that write alone and a whole build
 * reverts newest-first. A given id is kept.
 * @param {Record<string, unknown>} p
 * @param {CallFacts} f
 * @param {string[]} notes
 * @param {string} [prefix] - `wp` on WordPress, `jo` on Joomla.
 */
function ensureApplyId(p, f, notes, prefix = 'wp') {
  if (str(p.apply_id) !== '') return
  // A fixed `wpApplyId` (a caller with no conversation memory) is WordPress's; another prefix mints its own.
  const id =
    typeof f.wpApplyId === 'function' ? f.wpApplyId(prefix) : prefix === 'wp' ? f.wpApplyId : f.mint?.(prefix)
  if (typeof id !== 'string' || id === '') return
  p.apply_id = id
  minted(p, 'apply_id')
  notes.push(`apply_id ${id} (this write's; Tracy made it)`)
}

/**
 * The parameters whose value Tracy made for one call, by the params object it was written into —
 * read back once into `Relay.meta.mintedIds` at the end of `normalizeCall`.
 * @type {WeakMap<Record<string, unknown>, Set<string>>}
 */
const MINTED = new WeakMap()

/**
 * Mark `name` as a value Tracy made for this call, not one the model gave (E3.2: only such an id is
 * left out of the call's repeat key).
 * @param {Record<string, unknown>} p
 * @param {string} name
 */
function minted(p, name) {
  let names = MINTED.get(p)
  if (names === undefined) {
    names = new Set()
    MINTED.set(p, names)
  }
  names.add(name)
}

/**
 * Joomla (J-1, J-2, J-3, and the contract).
 * @param {string} action
 * @param {Record<string, unknown>} p
 * @param {CallFacts} f
 * @param {string[]} notes
 * @param {(code: string, extra: Record<string, unknown>) => Refuse} refuse
 * @returns {Relay | Refuse}
 */
function joomla(action, p, f, notes, refuse) {
  const kind = str(p.kind)
  // J-1 (r2: 1).
  if (
    ['content.list', 'content.get', 'content.update', 'content.delete'].includes(action) &&
    kind in WORDPRESS_ONLY
  )
    return refuse('NOT_ON_THIS_PLATFORM', {
      what: `kind ${kind}`,
      instead: WORDPRESS_ONLY[/** @type {keyof typeof WORDPRESS_ONLY} */ (kind)],
      error: `kind "${kind}" is a WordPress kind; this site runs Joomla`
    })
  // J-2 (r2: 1 — `{kind:"extensionParams", id:"com_config"}`).
  if (action === 'content.get' && kind === 'extensionParams' && positiveId(p.id) === 0)
    return refuse('ADDRESS_MISSING', {
      needs: 'id',
      got: String(p.id ?? '').slice(0, 40),
      error: 'extensionParams is read by the extension_id number, not by name'
    })
  // J-4 (30/09/2026): a delete with no apply_id was refused `bad_params "apply_id required"` — AFTER
  // the customer had said yes, so their agreement went on a call that removed nothing and the resend
  // asked them again (v7 Joomla pick case). The receipt's name is Tracy's to make, as on WordPress
  // (WP-27): one per delete, so `apply.revert` puts back that record and nothing else.
  if (action === 'content.delete' && str(p.apply_id) === '' && typeof f.mint === 'function') {
    p.apply_id = f.mint('del')
    minted(p, 'apply_id')
    notes.push(`apply_id ${p.apply_id} (this delete's; Tracy made it)`)
  }
  // J-6 (26/10/2026, owner): a content write or upload with no apply_id was refused `bad_params "apply_id
  // required"`, and the next asked the model for a name, which it gave one per request or reused. Tracy names
  // it, one per write as on WordPress (WP-27), so a whole build reverts newest-first, write by write.
  if (action === 'content.update' || action === 'media.upload') ensureApplyId(p, f, notes, 'jo')
  // J-5 (14/10/2026): the site name's door (`site.identity`) reads unless its operation is "set", so
  // new values sent with no operation would come back as an ok READ that changed nothing — the same
  // trap CC-1/CC-3 close for a contract. And its receipt is Tracy's to name when the call names none, as
  // a delete's is (J-4): the plugin refuses a set without one, after the customer asked for it.
  if (action === 'site.identity') {
    if (str(p.operation) === '' && isRecord(p.fields) && Object.keys(p.fields).length > 0) {
      p.operation = 'set'
      notes.push('operation "set" (fields carry new values)')
    }
    if (str(p.operation) === 'set' && str(p.apply_id) === '' && typeof f.mint === 'function') {
      p.apply_id = f.mint('identity')
      minted(p, 'apply_id')
      notes.push(`apply_id ${p.apply_id} (this change's; Tracy made it)`)
    }
  }
  // J-3 retired (Tracy ADR 0022): a quickstart site's component takes structural writes since Joomla
  // 0.18.0-rc.6; an older one refuses them itself, and that answer names the road that works.
  if (action !== 'content.contract') return relay(action, p, notes)
  return contract(p, f, notes, refuse)
}

/**
 * The contract (CC-1..6, CC-9, CC-10, CC-12 — and D9's ids). The operation decides everything
 * downstream: an inspect is served from this turn's snapshot and takes no write lease; an apply is
 * ordered in the site's flight.
 * @param {Record<string, unknown>} p
 * @param {CallFacts} f
 * @param {string[]} notes
 * @param {(code: string, extra: Record<string, unknown>) => Refuse} refuse
 * @returns {Relay | Refuse}
 */
function contract(p, f, notes, refuse) {
  // CC-5 (0 in r2; 11 shapes on j-1ibzqi 23/09): the three ids, wherever they were spelled.
  hoistIds(p, notes)
  let op = str(p.operation)
  // CC-2 (0 in r2; r1 C04, C08): "list the slots" is an inspect — the component knows no other read
  // word, and refused `list` and `slots` only after taking its lock. A `slots` OBJECT is not the
  // inspect's type filter (a string), so it leaves.
  if (CONTRACT_READ_WORDS.has(op)) {
    if (op !== 'inspect') {
      notes.push(`operation ${op.slice(0, 20)} → inspect`)
      p.operation = 'inspect'
      op = 'inspect'
    }
    if (isRecord(p.slots)) {
      delete p.slots
      notes.push('params.slots object dropped: an inspect filters by slots "text", "url" or "image"')
    }
  }
  // CC-6 (0 in r2; hist t1s16): after a WRITE word only, slot values sent as `slots`/`values`/
  // `fields` are the changes — and only when every key is a slot key, so nothing else moves.
  if ((op === 'apply' || CONTRACT_WRITE_WORDS.has(op)) && !hasChanges(p)) takeChanges(p, notes)
  // CC-3 (0 in r2): a write word with changes is an apply; without changes it writes nothing.
  if (CONTRACT_WRITE_WORDS.has(op)) {
    if (!hasChanges(p))
      return refuse('UNKNOWN_OPERATION', {
        asked: op.slice(0, 40),
        operations: [...CONTRACT_OPERATIONS],
        error: `"${op.slice(0, 40)}" carries no changes, so it writes nothing: an apply says operation "apply"`
      })
    notes.push(`operation ${op.slice(0, 20)} → apply`)
    p.operation = 'apply'
    op = 'apply'
  }
  const has = hasChanges(p)
  if (op === '') {
    // 🔒 CC-1: no operation is an INSPECT to the component (`Engine.php:1204`) but a WRITE to the
    // door's lease (`sites/route.js:309` takes the lease unless operation is "inspect") — measured r1
    // C08, `content.contract {}` → SITE_BUSY. Named here, so the door reads it as the read it is.
    if (!has) {
      p.operation = 'inspect'
      notes.push('operation "inspect" (none was given)')
    }
    // With changes and no operation the component would answer an INSPECT and write nothing, and
    // `ok:true` would read as a write that happened.
    else
      return refuse('UNKNOWN_OPERATION', {
        asked: '',
        error:
          'content.contract with changes and no operation writes nothing: an apply says operation "apply"'
      })
  } else if (op === 'apply') {
    if (!has)
      return refuse('CONTRACT_RULE', {
        rule: 'no_changes',
        error: 'an apply carries changes: {"<slot key>": "<text>"}, at least one'
      })
  } else if (op === 'string' && (f.derived === true || f.platform === 'wordpress'))
    return stringOverride(p, f, notes, refuse)
  else if (op !== 'inspect' && op !== 'bind' && !CONTRACT_PREFIXES.some((x) => op.startsWith(x)))
    // CC-4: the component answers "Unknown contract operation" only after taking its lock.
    return refuse('UNKNOWN_OPERATION', {
      asked: op.slice(0, 40),
      operations: [...CONTRACT_OPERATIONS],
      error: `"${op.slice(0, 40)}" is not a contract operation`
    })
  if (p.operation !== 'apply') return relay('content.contract', p, notes)
  // CC-9 (0 in r2; r1 C05 `{"module-435.2": 123}`): every slot takes text. A number or a yes/no is
  // written as its text; anything else is not a slot's value, and the component would refuse it
  // only after a full inspect (12–20 s, "Unknown content slot or non-string value").
  const changes = /** @type {Record<string, unknown>} */ (p.changes)
  for (const [key, value] of Object.entries(changes)) {
    if (typeof value === 'number' || typeof value === 'boolean') {
      changes[key] = String(value)
      notes.push(`changes["${key.slice(0, 30)}"]: ${typeof value} → text`)
    } else if (typeof value !== 'string')
      return refuse('CONTRACT_RULE', {
        rule: 'not_text',
        key: key.slice(0, 60),
        error: `changes["${key.slice(0, 40)}"] is ${value === null ? 'null' : Array.isArray(value) ? 'a list' : 'an object'}; every slot takes text`
      })
  }
  // CC-10 (0 in r2): evidence given as {slots:{…}}, or as one sentence for the one change there is.
  flattenEvidence(p, notes)
  /**
   * 🔒 CC-12 (0 in r2): AN APPLY IS BASED ON A REVISION, AND THE COMPONENT HAS NO DEFAULT. Without
   * `expected_revision` it runs a full inspect and then refuses ("Content changed; inspect again",
   * `QuickstartContract.php` `plan()`), 12–20 s for nothing. The revision THIS conversation last
   * read fills it; with none read, the host inspects once and shows the values first (INSPECT_FIRST,
   * `site-call.mjs`) — words are never written over values nobody here has seen.
   */
  contentBase(p, f, notes)
  if (str(p.expected_revision) === '' && p.expected_content_revisions === undefined) {
    const last = typeof f.lastRevision === 'string' ? f.lastRevision.trim() : ''
    if (last !== '') {
      p.expected_revision = last
      notes.push(`expected_revision ${last.slice(0, 12)} (the revision this conversation last read)`)
    } else {
      const ids = contractIds(p, f, notes)
      return { ...ids, meta: { askedApplyId: ids.meta?.askedApplyId ?? null, needsRevision: true } }
    }
  }
  return contractIds(p, f, notes)
}

/**
 * A WordPress gettext string override (`content.contract {operation:"string", domain, msgid, context?,
 * locale, value}`, claude-cowork `StringOverrides`, WordPress plugin 0.15.0+): the words a theme or plugin
 * prints that no content row holds — the road `content.locate` names for words that are not in the site's
 * content (`notInContentNext`). Until 01/10/2026 this file knew no such operation and refused it
 * (`UNKNOWN_OPERATION`), so that road ended here. It is known on an IMPORTED copy's DERIVED surface only
 * (`f.derived`) until 26/10/2026, and on every WordPress site since: the plugin takes it on a quickstart site as on a
 * derived one (claude-cowork `tests/string-overrides.php`), and a build, fenced out of the theme's files, had no other
 * road for the words a theme prints through gettext (local round 35: JA Restaurant's blog sidebar). The plugin records it under
 * the caller's apply_id and refuses a missing or `contract-` one (those name contract applies), so Tracy
 * makes the receipt's id, as it does for a delete (J-4) and a WordPress content write (WP-27).
 * @param {Record<string, unknown>} p
 * @param {CallFacts} f
 * @param {string[]} notes
 * @param {(code: string, extra: Record<string, unknown>) => Refuse} refuse
 * @returns {Relay | Refuse}
 */
function stringOverride(p, f, notes, refuse) {
  if (f.platform !== 'wordpress')
    return refuse('NOT_ON_THIS_PLATFORM', {
      what: 'content.contract string',
      error:
        "a string override is WordPress's: a phrase the software prints changes by a language override here, which content.find names"
    })
  p.operation = 'string'
  const asked = str(p.apply_id)
  if ((asked === '' || asked.startsWith('contract-')) && typeof f.mint === 'function') {
    p.apply_id = f.mint('string')
    minted(p, 'apply_id')
    notes.push(`apply_id ${p.apply_id} (this override's; Tracy made it)`)
  }
  return relay('content.contract', p, notes)
}

/**
 * 🔒 CONTENT API v2 (D2): AN APPLY AFTER `content.read` NEEDS NO INSPECT. The Claude Cowork plugin (Joomla rc.5,
 * WordPress rc.2) takes `expected_content_revisions: {contentId: revision}` and checks each changed
 * slot's content against it (W2). Tracy fills it from what this conversation read, only when every
 * changed slot was read; a model's own map is kept when it is `{string: string}` and dropped (with a
 * note) otherwise. A named `expected_revision` stays, and the map rides beside it (the Claude Cowork plugin checks
 * both); with the map and no named revision, the site-wide one CC-12 would fill is NOT added — it
 * moves with every write anywhere on the site, and would refuse an apply the map proves current.
 * @param {Record<string, unknown>} p
 * @param {CallFacts} f
 * @param {string[]} notes
 */
function contentBase(p, f, notes) {
  if (p.expected_content_revisions !== undefined) {
    const given = p.expected_content_revisions
    const valid =
      isRecord(given) &&
      Object.keys(given).length > 0 &&
      Object.entries(given).every(([k, v]) => k !== '' && typeof v === 'string' && v !== '')
    if (valid) return
    delete p.expected_content_revisions
    notes.push('expected_content_revisions dropped: not {contentId: revision}')
  }
  if (typeof f.contentRevisions !== 'function') return
  const map = f.contentRevisions(Object.keys(/** @type {Record<string, unknown>} */ (p.changes)))
  if (!isRecord(map) || Object.keys(map).length === 0) return
  p.expected_content_revisions = map
  notes.push(`based on the content.read revisions of ${Object.keys(map).length} content(s)`)
}

/** @param {Record<string, unknown>} p */
const hasChanges = (p) => isRecord(p.changes) && Object.keys(p.changes).length > 0

/**
 * CC-6: take the first of `slots`/`values`/`fields` that is an object of slot keys to text as the
 * changes.
 * @param {Record<string, unknown>} p
 * @param {string[]} notes
 */
function takeChanges(p, notes) {
  for (const name of ['slots', 'values', 'fields']) {
    const held = p[name]
    if (!isRecord(held)) continue
    const keys = Object.keys(held)
    if (keys.length === 0 || !keys.every((k) => SLOT_KEY.test(k))) continue
    if (Object.values(held).some((v) => v !== null && typeof v === 'object')) continue
    p.changes = { ...held }
    delete p[name]
    notes.push(`params.${name} → changes`)
    return
  }
}

/**
 * CC-5 — the ids of an apply, hoisted to where the component reads them.
 *
 * 🔒 AN ID IS NEVER A SLOT, SO TAKING ONE OUT OF `changes` REMOVES NO CHANGE: a slot key is
 * `<kind>-<id>.<n>` (hist t1s18 sent `apply_id` and `request_id` as two more "slots"). A wrapper that
 * held nothing but ids leaves; one that held anything else stays, for V0 to name.
 * @param {Record<string, unknown>} p
 * @param {string[]} notes
 */
function hoistIds(p, notes) {
  /** @type {Set<string>} */
  const idNames = new Set([...Object.keys(ID_SPELLINGS), ...Object.values(ID_SPELLINGS).flat()])
  /** @param {string} name */
  const canonOf = (name) =>
    Object.entries(ID_SPELLINGS).find(([canon, alts]) => canon === name || alts.includes(name))?.[0] ?? name
  if (isRecord(p.changes))
    for (const name of idNames)
      if (typeof p.changes[name] === 'string') {
        const canon = canonOf(name)
        if (str(p[canon]) === '') p[canon] = p.changes[name]
        delete p.changes[name]
        notes.push(`${name} taken out of changes: an id is not a slot`)
      }
  for (const [canon, alts] of Object.entries(ID_SPELLINGS)) {
    if (str(p[canon]) !== '') continue
    const top = alts.find((alt) => str(p[alt]) !== '')
    if (top !== undefined) {
      p[canon] = str(p[top])
      notes.push(`${top} → ${canon}`)
      continue
    }
    for (const wrapper of ID_WRAPPERS) {
      const inner = p[wrapper]
      if (!isRecord(inner)) continue
      const names = [canon, ...alts, ...(canon === 'request_id' && wrapper === 'request' ? ['id'] : [])]
      const hit = names.find((n) => str(inner[n]) !== '')
      if (hit === undefined) continue
      p[canon] = str(inner[hit])
      notes.push(`${wrapper}.${hit} → ${canon}`)
      break
    }
  }
  for (const wrapper of ID_WRAPPERS) {
    const inner = p[wrapper]
    if (
      isRecord(inner) &&
      Object.keys(inner).every((k) => idNames.has(k) || (wrapper === 'request' && k === 'id'))
    )
      delete p[wrapper]
  }
  for (const alt of Object.values(ID_SPELLINGS).flat()) delete p[alt]
}

/**
 * One sentence of evidence given for no slot: a string, or `{note|reason|source: "…"}` alone.
 * @param {unknown} evidence
 * @returns {string | null}
 */
export function singleEvidence(evidence) {
  if (typeof evidence === 'string') return evidence.trim() !== '' ? evidence : null
  if (!isRecord(evidence)) return null
  const keys = Object.keys(evidence)
  if (keys.length !== 1 || !['note', 'reason', 'source'].includes(keys[0])) return null
  const text = evidence[keys[0]]
  return typeof text === 'string' && text.trim() !== '' ? text : null
}

/**
 * CC-10 — evidence as the component reads it, `{<slot key>: "<the customer's words>"}`: a
 * `{slots:{…}}` wrapper is opened, and one sentence given for no slot belongs to the one change.
 * With several changes the sentence waits for `prepareContractApply`, which knows from the inspect
 * which of them needs evidence.
 * @param {Record<string, unknown>} p
 * @param {string[]} notes
 */
function flattenEvidence(p, notes) {
  if (isRecord(p.evidence) && isRecord(p.evidence.slots)) {
    const { slots, ...rest } = p.evidence
    p.evidence = { ...rest, ...slots }
    notes.push('evidence.slots → evidence')
  }
  const sentence = singleEvidence(p.evidence)
  const keys = Object.keys(/** @type {Record<string, unknown>} */ (p.changes))
  if (sentence !== null && keys.length === 1) {
    p.evidence = { [keys[0]]: sentence }
    notes.push(`evidence → evidence["${keys[0].slice(0, 30)}"]`)
  }
}

/**
 * D9 — the ids of one contract apply, made by Tracy.
 *
 * 🔒 A NEW APPLY_ID FOR EVERY REVISION, AND NEVER ONE THIS CONVERSATION ALREADY SAW ANSWERED. The
 * component refuses a used id ("Use one new apply_id per content revision", `Engine.php:1230`) and
 * replays the recorded answer when apply_id, request_id AND the content all repeat. The old
 * description said the opposite ("choose one apply_id per customer request and reuse it"), and one
 * turn on j-1ibzqi (23/09) spent 16 refused calls in 11 id spellings — 1.1 M tokens — on it. So:
 * absent → minted; given without the `contract-` prefix → prefixed; given and already answered ok →
 * a new one; given and last sent with an unknown outcome → kept, so the component replays instead of
 * applying twice. The request id is made from the content (D9), so the same apply is the same request.
 * @param {Record<string, unknown>} p
 * @param {CallFacts} f
 * @param {string[]} notes
 * @returns {Relay}
 */
function contractIds(p, f, notes) {
  const mint =
    typeof f.mint === 'function'
      ? f.mint
      : (/** @type {string} */ prefix) => `${prefix}-${Date.now().toString(36)}`
  const asked = str(p.apply_id)
  const okIds = new Set(Array.isArray(f.okIds) ? f.okIds : [])
  const unknownIds = new Set(Array.isArray(f.unknownIds) ? f.unknownIds : [])
  let id = asked
  if (id === '') {
    id = mint('contract')
    minted(p, 'apply_id')
    notes.push(`apply_id ${id} (Tracy made it: one new per apply)`)
  } else {
    if (!id.startsWith('contract-')) {
      const was = id
      id = `contract-${sanitize(id, 90) || 'apply'}`
      notes.push(`apply_id ${was.slice(0, 30)} → ${id.slice(0, 40)}`)
    }
    if (okIds.has(id) && !unknownIds.has(id)) {
      const was = id
      id = mint('contract')
      minted(p, 'apply_id')
      notes.push(`apply_id ${was.slice(0, 30)} already holds an apply → ${id}`)
    }
  }
  p.apply_id = id
  const request = requestIdOf(p.changes, p.evidence, p.expected_revision, p.expected_content_revisions)
  if (str(p.request_id) !== '' && str(p.request_id) !== request)
    notes.push(`request_id → ${request} (Tracy made it)`)
  p.request_id = request
  // Always Tracy's: made from the changes, evidence and revision, which the repeat key holds anyway.
  minted(p, 'request_id')
  return { ...relay('content.contract', p, notes), meta: { askedApplyId: asked === '' ? null : asked } }
}

/**
 * The reads a correction needs, done through the SAME relay the model's own read would take — so the
 * door's role gate applies to each, and none is a write.
 *
 * @param {Relay} n
 * @param {(action: string, params: Record<string, unknown>) => Promise<unknown>} read
 * @param {{ partTitle?: (key: string) => string | null }} [known] - what this conversation already
 *   read (a template part's title), so a read is not repeated.
 * @returns {Promise<Relay | { kind: 'answer', answer: unknown, notes: string[] } | Refuse>}
 */
export async function resolveCall(n, read, known = {}) {
  const r = n.resolve
  if (r === undefined || r.type === 'wpNavFallback') return n
  const notes = [...n.notes]
  if (r.type === 'wpSlug') {
    const found = /** @type {Record<string, any>} */ (
      await read('content.list', { kind: 'post', name: r.slug, limit: 2 })
    )
    if (!found || found.ok !== true || !Array.isArray(found.items))
      return { kind: 'answer', answer: found, notes }
    if (found.items.length === 0)
      return {
        kind: 'answer',
        answer: {
          ok: false,
          error: 'not_found',
          message: `no page or post with slug "${r.slug.slice(0, 60)}"`
        },
        notes
      }
    if (found.items.length > 1)
      return {
        kind: 'refuse',
        answer: {
          ok: false,
          code: 'ADDRESS_MISSING',
          action: 'content.get',
          platform: 'wordpress',
          needs: 'id',
          candidates: found.items
            .slice(0, 5)
            .map((/** @type {any} */ it) => ({ id: it.id, title: it.title, type: it.type })),
          error: `two posts have the slug "${r.slug.slice(0, 60)}"`
        },
        notes
      }
    const id = Number(found.items[0].id)
    notes.push(`key "${r.slug.slice(0, 40)}" → id ${id} (content.get reads posts by id)`)
    const { resolve: _drop, ...rest } = n
    return { ...rest, params: { kind: 'post', id }, notes }
  }
  if (r.type === 'wpOptions') {
    const answers = await Promise.all(
      r.keys.map(async (key) => {
        const got = /** @type {Record<string, any>} */ (await read('content.get', { kind: 'option', key }))
        return got?.ok === true ? { key, value: got.item?.value ?? null } : { key, value: null }
      })
    )
    return {
      kind: 'answer',
      answer: {
        ok: true,
        kind: 'option',
        items: answers,
        note: 'no door lists options; these are the ones a page shows. content.get {kind:"option", key} reads any other.'
      },
      notes
    }
  }
  // WP-15: the page on the front is named by option page_on_front; 0 means the latest posts.
  if (r.type === 'wpFront') {
    const got = /** @type {Record<string, any>} */ (
      await read('content.get', { kind: 'option', key: 'page_on_front' })
    )
    if (!got || got.ok !== true) return { kind: 'answer', answer: got, notes }
    const id = positiveId(got.item?.value)
    if (id === 0)
      return {
        kind: 'answer',
        answer: {
          ok: false,
          error: 'not_found',
          message: 'this site shows its latest posts on the front page, not a page'
        },
        notes
      }
    notes.push(`key "${r.key}" → id ${id} (option page_on_front: the page on the front)`)
    const { resolve: _drop, ...rest } = n
    return { ...rest, params: { kind: 'post', id }, notes }
  }
  // WP-19 and WP-24: one read of the row says what it is, before the write is judged or sent.
  if (r.type === 'wpKindOfId' || r.type === 'wpPartSlug') {
    const got = /** @type {Record<string, any>} */ (await read('content.get', { kind: 'post', id: r.id }))
    if (!got || got.ok !== true || !isRecord(got.item)) return { kind: 'answer', answer: got, notes }
    const type = str(got.item.post_type)
    const slug = str(got.item.post_name)
    const { resolve: _drop, ...rest } = n
    /** @param {Record<string, unknown>} extra @returns {Refuse} */
    const refuse = (extra) => ({
      kind: 'refuse',
      answer: { ok: false, code: 'ADDRESS_MISSING', action: n.action, platform: 'wordpress', ...extra },
      notes
    })
    if (r.type === 'wpKindOfId') {
      if (WP_POST_LIKE_TYPES.has(type)) {
        notes.push(`kind post (post ${r.id} is a ${type})`)
        return { ...rest, notes }
      }
      if (type === 'wp_template_part' && slug !== '')
        return refuse({
          kind: 'templatePart',
          needs: 'key',
          key: slug.slice(0, 60),
          error: `post ${r.id} is the "${slug.slice(0, 40)}" template part: it is written as {kind:"templatePart", key:"${slug.slice(0, 40)}"}`
        })
      return refuse({
        needs: 'kind',
        id: r.id,
        error: `post ${r.id} is a ${type.slice(0, 30) || 'row of unknown type'}: name its kind`
      })
    }
    if (type !== 'wp_template_part' || slug === '')
      return refuse({
        kind: 'templatePart',
        needs: 'key',
        error: `post ${r.id} is not a template part (${type.slice(0, 30) || 'unknown'}): a part is written by its slug`
      })
    /** @type {Record<string, unknown>} */
    const params = { ...n.params, key: slug }
    delete params.id
    const fields = { .../** @type {Record<string, unknown>} */ (n.params.fields) }
    notes.push(`templatePart id ${r.id} → key "${slug.slice(0, 40)}" (a part is written by its slug)`)
    // The read that named the slug also gave the title the component would otherwise reset.
    if (!('title' in fields) && typeof got.item.post_title === 'string' && got.item.post_title !== '') {
      fields.title = got.item.post_title
      notes.push(
        `fields.title "${got.item.post_title.slice(0, 30)}" kept (without it the part's title becomes its slug)`
      )
    }
    return { ...rest, params: { ...params, fields }, notes }
  }
  if (r.type === 'wpSeoMeta' || r.type === 'wpSeoField') return resolveSeo(n, r, read, notes)
  if (r.type === 'wpPartTitle') {
    const fields = /** @type {Record<string, unknown>} */ (n.params.fields)
    const held = known.partTitle?.(r.key) ?? null
    let title = held
    if (title === null) {
      const got = /** @type {Record<string, any>} */ (
        await read('content.get', { kind: 'templatePart', key: r.key })
      )
      title = got?.ok === true && typeof got.item?.title === 'string' ? got.item.title : null
    }
    const { resolve: _drop, ...rest } = n
    if (title === null || title === '') return { ...rest, notes }
    notes.push(`fields.title "${title.slice(0, 30)}" kept (without it the part's title becomes its slug)`)
    return { ...rest, params: { ...n.params, fields: { ...fields, title } }, notes }
  }
  return n
}

/**
 * 🔒 A PAGE'S SEARCH TITLE GOES WHERE THE SITE PRINTS IT, OR NOWHERE WITH A SENTENCE (05/10/2026).
 * `_claude_cowork_seo_title`/`_description` print only on a Claude Cowork of `WP_SEO_META.since` or later
 * and only while no SEO plugin runs (`SeoFields.php`); sent to an older plugin they land in a meta nothing
 * reads and the answer says ok. So the site is read first, through the same relay as the model's reads:
 * - Yoast SEO or Rank Math runs: the key becomes theirs (`_yoast_wpseo_title`…), the one printed on any
 *   plugin version. A post write's `seo` lands there too, but only from `since`: before, the plugin wrote
 *   it only where the post already held a value, so the refusal names their key to write instead;
 * - another SEO plugin runs: refused — it keeps them where no door of the plugin writes;
 * - none runs: sent when `info.component` is `since` or later; otherwise refused, saying the page title is
 *   the only title and renaming it renames the breadcrumb and heading too. A read that failed is passed on,
 *   never taken for an old plugin. A title holding no site name is sent with a note: it is the whole
 *   `<title>`, so the site's " – <site name>" end goes unless the customer asked for that.
 * @param {Relay} n
 * @param {{ type: 'wpSeoMeta', field: 'title' | 'description' } | { type: 'wpSeoField' }} r
 * @param {(action: string, params: Record<string, unknown>) => Promise<unknown>} read
 * @param {string[]} notes
 * @returns {Promise<Relay | { kind: 'answer', answer: unknown, notes: string[] } | Refuse>}
 */
async function resolveSeo(n, r, read, notes) {
  const { resolve: _drop, ...rest } = n
  /** @param {string} code @param {string} error @param {string} next @returns {Refuse} */
  const refuse = (code, error, next) => ({
    kind: 'refuse',
    answer: { ok: false, code, action: n.action, platform: 'wordpress', error, next },
    notes
  })
  const list = /** @type {Record<string, any>} */ (await read('plugin.list', {}))
  // A plugin list that could not be read leaves the plugin's own refusal to judge an SEO plugin.
  const folders = list?.ok === true ? activeFolders(list.plugins) : new Set()
  let modules = /** @type {unknown} */ ([])
  if (folders.has('jetpack')) {
    const got = /** @type {Record<string, any>} */ (
      await read('content.get', { kind: 'option', key: 'jetpack_active_modules' })
    )
    modules = got?.ok === true ? got.item?.value : []
  }
  const running = seoPluginOf(folders, modules)
  if (running !== null && (running.title === null || running.description === null))
    return refuse(
      'SEO_PLUGIN_FIELDS',
      `this site runs ${running.name}, which keeps a page's search title and description where no door of the Claude Cowork plugin writes; nothing was written`,
      `Tell the customer they are changed in ${running.name}'s own settings for the page; do not rename the page instead.`
    )
  if (running !== null && r.type === 'wpSeoMeta') {
    const theirs = /** @type {string} */ (running[r.field])
    notes.push(`key ${str(n.params.key)} → ${theirs} (${running.name} runs on this site and prints that one)`)
    return { ...rest, params: { ...n.params, key: theirs }, notes }
  }
  const info = await read('info', {})
  if (!isRecord(info) || info.ok !== true) return { kind: 'answer', answer: info, notes }
  const version = componentVersion(info)
  if (!versionAtLeast(version, WP_SEO_META.since)) {
    const seen = version ?? 'of a version it does not say'
    if (running !== null)
      return refuse(
        'SEO_FIELD_DROPPED',
        `this site's Claude Cowork plugin is ${seen}: it writes seo only where the post already holds a ${running.name} value (${running.title}, ${running.description}), and drops it otherwise; nothing was written`,
        `Write each with content.update {kind:"postmeta", id:<post id>, key:"${running.title}" (title) or "${running.description}" (description), fields:{value}}.`
      )
    return refuse(
      'SEO_TITLE_UNSUPPORTED',
      `this site's Claude Cowork plugin is ${seen}: a page's own search title and description need ${WP_SEO_META.since} or later, so nothing was written`,
      'Tell the customer: on this site the page title is the title search engines show, and changing it also changes the page’s breadcrumb and heading. Change the page title (content.update {kind:"post", fields:{post_title}}) only if they still want that.'
    )
  }
  if (r.type === 'wpSeoMeta' && r.field === 'title' && running === null) {
    const value = isRecord(n.params.fields) ? str(n.params.fields.value) : ''
    const got = /** @type {Record<string, any>} */ (
      await read('content.get', { kind: 'option', key: 'blogname' })
    )
    const site = got?.ok === true ? str(got.item?.value) : ''
    if (site !== '' && value !== '' && !value.toLowerCase().includes(site.toLowerCase()))
      notes.push(
        `this title holds no "${site.slice(0, 60)}": it is the whole <title>, so the site's " – ${site.slice(0, 60)}" end leaves this page; keep it unless the customer asked for a different full title`
      )
  }
  return { ...rest, notes }
}

/**
 * The library path of a picture, as an image slot takes it: no leading slash, no site address.
 *
 * 🔒 THE SLOT TAKES `wp-content/uploads/…` (WordPress) OR `images/…` (Joomla), AND `content.read`
 * SHOWS A WORDPRESS PICTURE AS `/wp-content/uploads/…`, the form a browser needs. The component refuses
 * the shown form (`SLOT_IMAGE_INVALID`, "Image must be a png, jpg or webp under wp-content/uploads/"),
 * so every model that reused a library picture copied the shown form, was refused, and spent calls
 * guessing why (round 7: 5 of 5 WordPress runs that reused a picture; one concluded that a slot
 * cannot take an existing picture and rewrote the block's markup). Only the ADDRESS is cut here: what
 * is left still goes to the component, which checks the folder, the extension, that the library holds
 * the file and that its shape fits the slot. A `..` segment is left as sent (the component refuses
 * it), and so is an address of another host: a picture from elsewhere is not the same file here.
 * @param {unknown} value
 * @param {string} [host] - the site's own host name when it is known: `http(s)://<host>[:port]/…` is
 *   then this site's own address for the same file (the component's link rule compares the host only).
 * @returns {string} the path; `value` itself when it is not written in one of those two forms.
 */
export function libraryPath(value, host = '') {
  if (typeof value !== 'string') return /** @type {any} */ (value)
  const v = value.trim()
  let rest
  const address = /^https?:\/\/([^/?#\s]+)(\/[^?#\s]*)?/i.exec(v)
  if (address !== null) {
    const own = host.trim().toLowerCase()
    if (own === '' || address[1].toLowerCase().replace(/:\d+$/, '') !== own || address[2] === undefined)
      return value
    rest = address[2].slice(1)
  } else if (/^\/(?!\/)/.test(v)) rest = v.slice(1)
  else return value
  return rest === '' || rest.split('/').includes('..') ? value : rest
}

/**
 * The changes of an apply the component refused only for how its pictures are WRITTEN, with each
 * picture written as a library path ({@link libraryPath}) — or null when that is not the whole story.
 * The refusal names the slots (`errors[]`, W3), so no snapshot of the site is needed to know which
 * values are pictures. All or nothing: an apply is atomic, so a refusal that names anything else, or
 * a picture this cannot rewrite, would be refused again and is left to the model.
 * @param {unknown} errors - the refusal's `errors[]`.
 * @param {unknown} changes - the changes that were sent.
 * @param {string} [host] - the site's own host name when known.
 * @returns {{ changes: Record<string, unknown>, notes: string[] } | null}
 */
export function repairedPictures(errors, changes, host = '') {
  if (!Array.isArray(errors) || errors.length === 0 || !isRecord(changes)) return null
  const fixed = { ...changes }
  /** @type {Set<string>} */
  const done = new Set()
  /** @type {string[]} */
  const notes = []
  for (const error of errors) {
    if (!isRecord(error) || error.code !== 'SLOT_IMAGE_INVALID') return null
    const key = isRecord(error.field) && typeof error.field.slotKey === 'string' ? error.field.slotKey : ''
    const sent = changes[key]
    if (key === '' || typeof sent !== 'string') return null
    if (done.has(key)) continue
    const path = libraryPath(sent, host)
    if (path === sent) return null
    done.add(key)
    fixed[key] = path
    notes.push(
      `${key.slice(0, 30)}: ${/^\s*\//.test(sent) ? 'leading "/"' : 'site address'} cut from the picture path`
    )
  }
  return { changes: fixed, notes }
}

/** The component's cap on one evidence text: `strlen($evidence) > 8000` (`QuickstartContract.php`). */
export const EVIDENCE_BYTES = 8000
/** CC-15: a bare phone number as a customer writes one (F4). */
const BARE_PHONE = /^[+\d][\d\s().-]{5,}$/
/** CC-15: a bare e-mail address. */
const BARE_EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/
/** CC-15: a phone number as it stands in the customer's words, its `+` included. */
const WRITTEN_PHONE = /(?:\+\s?)?\d[\d\s().-]{4,}\d/g

/**
 * CC-15: whether a phone link keeps the `+` the model's value starts with.
 *
 * 🔒 THE CUSTOMER'S WORDS DECIDE, NOT THE MODEL'S. A `+` turns a local number into another one: the
 * customer writes 0909 123 456, the model sends +0909 123 456, and `tel:+0909123456` calls nobody
 * (review, 25/09 — the value's own `+` used to be kept). So when the customer's latest message holds
 * those digits, the `+` is kept only if they wrote it there. A number their latest message does not
 * hold (given a turn earlier, read off the site) keeps the model's `+` unless a 0 follows it: no
 * country code starts with 0 (E.164), while dropping the `+` of a real one — `tel:84909…` — would
 * make it another number too.
 * @param {string} value - the model's value, trimmed.
 * @param {string} digits - its digits.
 * @param {string} words - the customer's latest message.
 */
function phonePlus(value, digits, words) {
  if (!value.startsWith('+')) return false
  const written = [...words.matchAll(WRITTEN_PHONE)].filter((m) => m[0].replace(/\D/g, '') === digits)
  if (written.length > 0) return written.some((m) => m[0].startsWith('+'))
  return !/^\+[\s(]*0/.test(value)
}

/**
 * CC-15, CC-16 and CC-10's second half: one contract apply corrected against the slots this person
 * read in this turn (the E3.1 snapshot). Pure; with no snapshot it changes nothing, and the
 * component decides as before. The request id is made again when anything changed (D9: it is made
 * from the content).
 *
 * - **CC-15** A link slot showing `tel:` given a bare phone number becomes `tel:<digits>` — a `+` only
 *   when the customer wrote one (`phonePlus`; never added: `tel:+0909…` is another number) — and one
 *   showing `mailto:` given a bare address becomes `mailto:<address>`. The component allows
 *   `tel:[+0-9 ()-]+` and refuses a bare number as an "Unsupported CTA URL" after a full inspect
 *   (12–20 s).
 * - **CC-10** One sentence of evidence given for no slot belongs to the one change that needs it.
 * - **CC-16** A slot that needs evidence (`requiresEvidence`, value ≠ sample) and has none gets the
 *   customer's OWN sentence holding the value, when their latest message holds it: compared with
 *   case, spacing and composition set aside, at least 3 characters and on word boundaries — digit
 *   for digit for a `tel:` value — cut to the component's 8,000 bytes. 🔒 NEVER the "Invented by
 *   Tracy" sentence: that one is the model's to declare, and a harness that wrote it would turn every
 *   invention into a declared one nobody chose.
 * @param {Record<string, unknown>} params - the apply as `normalizeCall` made it.
 * @param {{ slots?: unknown, customerWords?: unknown }} [ctx] - the snapshot's `slots`, the latest
 *   customer message.
 * @returns {{ params: Record<string, unknown>, notes: string[] }}
 */
export function prepareContractApply(params, ctx = {}) {
  /** @type {string[]} */
  const notes = []
  const slots = Array.isArray(ctx.slots) ? ctx.slots : null
  if (slots === null || !isRecord(params) || !isRecord(params.changes)) return { params, notes }
  /** @type {Map<string, Record<string, unknown>>} */
  const byKey = new Map()
  for (const slot of slots) if (isRecord(slot) && typeof slot.key === 'string') byKey.set(slot.key, slot)
  const changes = { ...params.changes }
  let evidence = isRecord(params.evidence) ? { ...params.evidence } : params.evidence
  const words = typeof ctx.customerWords === 'string' ? ctx.customerWords : ''
  for (const [key, value] of Object.entries(changes)) {
    const slot = byKey.get(key)
    if (slot?.type !== 'url' || typeof value !== 'string') continue
    const current = str(slot.current)
    const v = value.trim()
    if (/^tel:/i.test(current) && BARE_PHONE.test(v)) {
      const digits = v.replace(/\D/g, '')
      changes[key] = `tel:${phonePlus(v, digits, words) ? '+' : ''}${digits}`
      notes.push(`${key.slice(0, 24)}: a phone link is ${changes[key]}`)
    } else if (/^mailto:/i.test(current) && BARE_EMAIL.test(v)) {
      changes[key] = `mailto:${v}`
      notes.push(`${key.slice(0, 24)}: an e-mail link is mailto:${v.slice(0, 40)}`)
    }
  }
  /** @param {string} key */
  const needs = (key) => {
    const slot = byKey.get(key)
    return slot?.requiresEvidence === true && typeof changes[key] === 'string' && changes[key] !== slot.sample
  }
  const sentence = singleEvidence(evidence)
  if (sentence !== null) {
    const needing = Object.keys(changes).filter(needs)
    if (needing.length === 1) {
      evidence = { [needing[0]]: sentence }
      notes.push(`evidence → evidence["${needing[0].slice(0, 30)}"], the one change that needs it`)
    }
  }
  if (evidence === undefined || evidence === null || isRecord(evidence))
    for (const key of Object.keys(changes)) {
      if (!needs(key)) continue
      const held = isRecord(evidence) ? evidence[key] : undefined
      if (typeof held === 'string' && held.trim() !== '') continue
      const own = customerSentence(words, /** @type {string} */ (changes[key]))
      if (own === null) continue
      evidence = { ...(isRecord(evidence) ? evidence : {}), [key]: own }
      notes.push(`evidence["${key.slice(0, 30)}"]: the customer's own sentence`)
    }
  if (notes.length === 0) return { params, notes }
  /** @type {Record<string, unknown>} */
  const out = { ...params, changes }
  if (evidence !== undefined) out.evidence = evidence
  out.request_id = requestIdOf(
    out.changes,
    out.evidence,
    out.expected_revision,
    out.expected_content_revisions
  )
  return { params: out, notes }
}

/** @param {string} s */
const foldText = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
/** @param {string} s */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The customer's own sentence that holds `value` (CC-16), or null. A `tel:` value is compared digit
 * for digit with the numbers the message holds ("0909 123 456" is `tel:0909123456`); a `mailto:`
 * value by its address; any other by its words. The sentence is the one the value sits in — split at
 * a line break or at `.`/`!`/`?` followed by a space, so an address or a dotted number stays whole —
 * or the whole message when the value spans two.
 * @param {string} words - the customer's latest message.
 * @param {string} value
 * @returns {string | null}
 */
export function customerSentence(words, value) {
  if (typeof words !== 'string' || words.trim() === '' || typeof value !== 'string') return null
  const phone = /^tel:/i.test(value.trim())
  const target = value.trim().replace(/^(?:tel|mailto):/i, '')
  /** @param {string} text */
  const holds = (text) => {
    if (phone) {
      const digits = target.replace(/\D/g, '')
      if (digits.length < 6) return false
      for (const m of text.matchAll(/[+\d][\d\s().-]{4,}\d/g))
        if (m[0].replace(/\D/g, '') === digits) return true
      return false
    }
    const needle = foldText(target)
    if ([...needle].length < 3) return false
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(needle)}(?![\\p{L}\\p{N}])`, 'u').test(foldText(text))
  }
  const sentences = words
    .split(/(?<=[.!?\u2026])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
  const hit = sentences.find(holds) ?? (holds(words) ? words.trim() : null)
  return hit === null ? null : clipBytes(hit, EVIDENCE_BYTES)
}

/**
 * `text` cut to at most `max` UTF-8 bytes, on a character boundary.
 * @param {string} text
 * @param {number} max
 */
function clipBytes(text, max) {
  if (Buffer.byteLength(text, 'utf8') <= max) return text
  let out = ''
  let bytes = 0
  for (const ch of text) {
    const size = Buffer.byteLength(ch, 'utf8')
    if (bytes + size > max) break
    out += ch
    bytes += size
  }
  return out
}
