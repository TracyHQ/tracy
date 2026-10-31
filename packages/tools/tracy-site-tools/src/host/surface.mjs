/**
 * Which tools a conversation on ONE site is sent, and what `tracy_site` says there.
 *
 * WHY THIS FILE. `tracy_site` was one static description for every site — Joomla's content
 * contract, WordPress's options, the operational verbs of both — 7,391 characters sent on every
 * step of every conversation, three quarters of it false for the site at hand. And every plugin's
 * tool was sent to every site: the Joomla build tool on a WordPress site, `tracy_emdash` on Joomla.
 * Measured on the ja-business suite (r2, 24/09/2026, 99 turns on develop plugins): 57 WordPress
 * calls asked for `content.contract` or `content.batch`, which the WordPress component does not
 * have (all `bad_action`); 26 asked `content.find` on a sealed site, which refuses it by design; 36
 * asked WordPress to list a Joomla or non-post kind; 3 sealed-Joomla calls asked `content.update`,
 * closed on a bound site.
 *
 * 🔒 DECIDED ONCE, AT `agent/created`, AND NEVER AGAIN IN THE CONVERSATION (cache rules CS1 and CS2
 * of `perf/harness-text-edits`). DeepSeek caches by prefix, and the tools array sits right after the
 * system text: a description that changes mid-conversation re-sends everything after it uncached.
 * Measured over 177 sessions, every `request/header` reason was `initial` — keep it that way. So:
 * - the scoped `tracy_site` and the platform mask are registered by the `agent/created` listener
 *   (`index.ts`), and nothing re-registers or re-masks them afterwards — not on the 5-minute
 *   site-facts memo, not when a seal marker appears or the platform reads differently, not when a
 *   build finishes. A fact that changes mid-session reaches the model as a message, never as a new
 *   description;
 * - hiding `tracy_site` (or any tool) for a role goes through that same `agent/created` listener or
 *   a `tools/pre-execute` guard — never a later `restrict()`, which would change the tools array of
 *   a conversation already under way. The one later change is an ADDITION: a tool deferred at
 *   `agent/created` comes back when its road starts (`deferred-tools.mjs`), which dsh sends as a
 *   `tool-addition` after the cached prefix on an `addition-only` route; nothing is ever removed or
 *   re-described;
 * - every text here is a function of the SURFACE alone (platform × sealed), never of a site: no
 *   label, URL, host, port, `/site/<label>`, `-web-1`, contract version, revision, locale, date or
 *   session id. Two sites of one kind get byte-identical tools, so the second one's prefix is a
 *   cache hit. `test/surface.test.mjs` holds both properties.
 *
 * Nothing here grants anything. Hiding a tool only removes it from this agent's list; every door
 * keeps its own fence (the Apply door and the component for `tracy_site`, `emdashSiteOf` for
 * `tracy_emdash`, `spec.platform` for a build tool, the path fence for files).
 *
 * 🔒 EVERY BLOCK FOLLOWS ONE TEMPLATE (T12 of the plan): WHAT · USE WHEN · NOT FOR (→ instead) · CALL ·
 * RETURNS · EFFECTS · REFUSALS, in that order, within 700 characters. Measured on r2 (V6 of the plan):
 * a refusal that gave the rule and the value received was self-repaired 45 % of the time, one with no
 * cause 4 %; a description works the same way — the door's rules said once, in the block of the
 * actions they govern, with one example call. `test/surface.test.mjs` finds each part by its label
 * in every action block; a part left out, or a block over 700, is a row of its exception table with
 * the measured reason (the sealed budgets of 3,700 cannot hold every part of every block — the
 * REFUSALS part goes first, where r2 shows no refusal the text would prevent or where a T10 next
 * already gives the call). Facts about THIS site belong in the site context (`site-context.mjs`),
 * never here; a rule both need is one exported constant quoted by both (`CONTRACT_LANGUAGE_RULE`).
 */

import {
  CONTRACT_LANGUAGE_RULE,
  ENGINE_ONLY_ACTIONS,
  LOCAL_ACTIONS,
  RELAY_ACTIONS,
  WRITE_VERBS
} from './site.mjs'
import { COMMENT_PARAMETER } from './comment-echo.mjs'
import { LIST_SEARCH_SINCE } from './list-search.mjs'
import { REPLACE_PLATFORMS, replaceKey } from './site-context.mjs'
import { tiersSentenceFor } from './tiers.mjs'

/**
 * Tools that act on ONE kind of site, and the platforms they act on. Everywhere else they can only
 * refuse (`NOT_EMDASH`, "this tool builds Joomla only", "No WordPress or Joomla install found").
 * Measured r2: the other platform's build tool rode along on every sealed step (3,958 characters
 * for WordPress's, 5,460 for Joomla's) and was called 0 times on a site it does not build.
 *
 * 🔒 THE NAMES ARE OTHER PLUGINS' NAMES. `test/surface.test.mjs` reads each owner's source and fails
 * when one is renamed: a stale name here does not throw, it just stops hiding the tool.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const PLATFORM_ONLY_TOOLS = Object.freeze({
  tracy_emdash: Object.freeze(['emdash']),
  tracy_site_build_emdash: Object.freeze(['emdash']),
  tracy_site_build_joomla: Object.freeze(['joomla']),
  tracy_site_build_wordpress: Object.freeze(['wordpress']),
  // `tracy-webroot-read` reads a PHP webroot; an EmDash site has none (its `.webroot/` holds data).
  tracy_site_profile: Object.freeze(['joomla', 'wordpress']),
  // 🔒 WORDPRESS ONLY (09/10/2026): its patterns are WordPress calls (`register_post_type`, `add_shortcode`,
  // `register_block_type`, `add_action`, …); Joomla declares extensions in XML manifests, so on Joomla every
  // search answered a confident "no matches" — worse than no tool.
  tracy_find_definition: Object.freeze(['wordpress'])
})

/** The platforms this file fits a surface to. Anything else is read as "cannot tell". */
const KNOWN_PLATFORMS = Object.freeze(['joomla', 'wordpress', 'emdash'])

/**
 * The tools to hide from an agent on a site of `platform`, out of the names it can see.
 * An unrecognised platform hides nothing: an agent with every tool is today's agent, and a mask built
 * on a guess would hide the one door the site has. Only names the agent can see come back — dsh's
 * `restrict()` throws on a name the agent does not inherit.
 * @param {readonly string[]} names - what `tools.schemas(agent)` lists.
 * @param {string} platform - `joomla` | `wordpress` | `emdash` | anything else.
 * @returns {string[]}
 */
export function platformHiddenTools(names, platform) {
  if (!KNOWN_PLATFORMS.includes(platform)) return []
  return names.filter((name) => {
    const only = Object.hasOwn(PLATFORM_ONLY_TOOLS, name) ? PLATFORM_ONLY_TOOLS[name] : undefined
    return only !== undefined && !only.includes(platform)
  })
}

/**
 * `wordpress-contract` (merge of PR #336 with #337, 25/09/2026): a sealed WordPress site that
 * provision BOUND to its contract — its Claude Cowork plugin refuses record writes (`LEGACY_STRUCTURE_CODE`) and takes words
 * by slot, as sealed Joomla does. `wordpress-sealed` stays the sealed WordPress site with no binding
 * (a release that pins no Claude Cowork plugin): the host fence seals it and the Claude Cowork plugin takes records.
 *
 * `joomla-derived` / `wordpress-derived` (01/10/2026): an IMPORTED copy whose Claude Cowork plugin derived
 * a contract from the copy's own database at import provisioning (`derivedContractOf`, `site-context.mjs`).
 * Its open surface stays whole — the record writes, the shell, the files — and `content.contract` rides
 * on top, because `content.read` and a pick hand the agent exactly that apply for a field the derived
 * map holds (`apps/tracy-web/src/sites/content-locate.js`). Without it every such `next` was refused
 * here (`NOT_ON_THIS_PLATFORM`) before it reached the door that accepts it.
 * @typedef {'joomla-sealed' | 'joomla' | 'wordpress-contract' | 'wordpress-sealed' | 'wordpress' | 'emdash' | 'joomla-derived' | 'wordpress-derived'} Surface
 */

/** The platform a surface belongs to. */
const platformOfSurface = (/** @type {Surface} */ surface) =>
  surface === 'emdash' ? 'emdash' : surface.startsWith('wordpress') ? 'wordpress' : 'joomla'

/** Whether a surface's writes go through a bound content contract (the `content.contract` apply). */
const contractSurface = (/** @type {Surface} */ surface) =>
  surface === 'joomla-sealed' || surface === 'wordpress-contract'

/**
 * Whether a surface is an imported copy with a derived contract: the open surface, and the derived
 * slots on top. Not a `contractSurface`: its words still have the record road, and the replace job
 * runs its platform's open engine, which reads the same records.
 */
const derivedSurface = (/** @type {Surface} */ surface) =>
  surface === 'joomla-derived' || surface === 'wordpress-derived'

/**
 * The fixed list plus the replace job where it is live — through the SAME gate the site context
 * reads (`REPLACE_PLATFORMS`, empty until Wave 2 of `perf/harness-text-edits` ships an engine), so
 * the context and the tool can never disagree about whether `content.replace` exists here. A sealed
 * Joomla site writes through the contract (`joomla-contract`), and so does a bound WordPress site
 * (`wordpress-contract`); a sealed WordPress site with no binding does not, so its key is plain
 * `wordpress`.
 *
 * ⚠ A LIVE KEY WITH NO TEXT TURNS THE SUITE RED, NOT THE MODEL WRONG: `test/surface.test.mjs` holds
 * every description to naming each action of its surface, so the replace job's block (T7′, Wave 2)
 * must land with the key.
 * @param {Surface} surface
 * @param {string[]} actions - in the order of the description's blocks.
 */
const withReplace = (surface, actions) =>
  Object.freeze(
    REPLACE_PLATFORMS.has(replaceKey(platformOfSurface(surface), contractSurface(surface)))
      ? [...actions, 'content.replace']
      : actions
  )

/**
 * The `tracy_site` actions each kind of site is TOLD about, in the order of the description's blocks.
 * Exported for `planCall`, whose `BAD_ACTION` / `NOT_ON_THIS_PLATFORM` answer lists THIS surface's
 * actions (on WordPress the global list offered `content.contract`, which fed the five-attempt chains
 * of r2 C05 and C24).
 *
 * 🔒 WHAT THE COMPONENT ACTUALLY HAS, not what the seat book routes. Read 24–25/09/2026 from
 * `claude-cowork` origin/main 2aa7840: the WordPress `Engine.php` has no `content.contract`,
 * `content.batch`, `extension.*`, `core.upgrade`, `db.snapshot` or `db.rollback`; the Joomla one
 * refuses `content.batch`, `content.update`, `content.delete`, `extension.install|enable`,
 * `db.rollback|restore|cleanup|purge`, `core.upgrade` and `files.restore` on a bound site
 * (`Engine.php:150`). `content.find` is not offered on a sealed surface: the file tools read the
 * same files there (ADR 0022 opened them), and on EmDash every relay but `content.read` answers `EMDASH_SITE`,
 * so only that read and the lane's own page tools are listed there. Product decisions on top: `page.look` everywhere (it answers
 * `NO_BROWSER` honestly where no browser exists), no `db.*` on a sealed site, no theme or plugin
 * install on a sealed WordPress site (a sealed quickstart's look is fixed).
 *
 * 🔒 AN ACTION LEFT OUT IS REFUSED, NOT MERELY UNMENTIONED. `index.ts` passes this list to
 * `planCall({actions})`, which answers a known action that is not on it with `NOT_ON_THIS_PLATFORM`
 * before anything is relayed (`site.mjs`, the `surface` check) — so every omission below is a hard
 * host refusal on that surface, and each is a decision:
 * - `media.upload` IS on every surface, the sealed ones and EmDash included — the history, since both
 *   halves of the old omission are gone: P5 left it off the sealed surfaces because it took the file's
 *   bytes as `content_b64` and a bound site takes an upload only at a content-addressed
 *   `<folder>/tracy-content/<sha256>.png|jpg|webp` (`Engine.php:154-157`), a hash the model cannot
 *   compute. ADR 0022 (26/09/2026) gave every quickstart the open surface, and since 27/09 the call is
 *   `media.upload {file}`: the host reads the customer's picture from the site folder and names it by
 *   its sha256 itself (`upload.mjs`). A picture for a contract slot is still `media.draw {prompt, slot}`,
 *   drawn to the slot's demo shape — the two `site.mjs` nexts for a missing slot picture name it alone;
 * - no `db.*` on either sealed surface (plan D19), although sealed WordPress answered `db.tables` /
 *   `db.dump` 11 of 11 in r2: a sealed quickstart's words are read through its doors, not its tables;
 * - no `content.batch` on open Joomla, although its component takes one: no description has ever
 *   offered it (develop's global text did not), one `content.update` per record is the road that
 *   groups its undo by apply_id, and its shape (apply_id + request_id + 1–100 operations) is a
 *   paragraph the surface has no room for. r2 had no open Joomla site. Add it WITH a block when a
 *   turn needs one atomic multi-record write.
 */
/**
 * 🔒 A QUICKSTART SITE HAS THE OPEN SURFACE, AND ITS CONTRACT ON TOP (Tracy ADR 0022, 26/09/2026).
 * Until then the sealed surfaces left out every write the component refused on a bound site, and
 * `planCall` refuses an action a surface leaves out before any relay — so once the component opened
 * (Joomla 0.18.0-rc.6, WordPress 0.14.0-rc.5) the agent still never reached it: measured 26/09 in round
 * 5, a Joomla agent wrote a PHP script to create an article rather than call `content.update`. An older
 * component on a running site still refuses; its answer names the road that works (`site.mjs`).
 */
const JOOMLA_ACTIONS = Object.freeze([
  'content.list',
  'content.get',
  'content.read',
  'content.locate',
  'info',
  'extension.list',
  'content.find',
  'page.text',
  'page.look',
  'media.scan',
  'media.draw',
  'media.upload',
  'media.delete',
  'content.update',
  'content.delete',
  // The site name's recorded door (`JOOMLA_IDENTITY_BLOCK`): without it the name changed through the shell,
  // where no receipt lists it for an undo (ladder DL14/DL15, 14/10/2026).
  'site.identity',
  'apply.revert',
  'apply.list',
  'look.revert',
  'look.set',
  'page.create',
  'db.snapshot',
  'db.rollback',
  'db.tables',
  'db.dump',
  'core.manifest',
  'extension.install',
  'extension.enable',
  'core.upgrade'
])
const WORDPRESS_ACTIONS = Object.freeze([
  'content.list',
  'content.get',
  'content.read',
  'content.locate',
  'info',
  'plugin.list',
  'theme.list',
  'content.find',
  'page.text',
  'page.look',
  'media.scan',
  'media.draw',
  'media.upload',
  'media.delete',
  'content.update',
  'content.delete',
  'content.language',
  'language.install',
  'apply.revert',
  'apply.list',
  'look.revert',
  'look.set',
  'page.create',
  'theme.install',
  'theme.activate',
  'theme.style',
  'plugin.install',
  'plugin.activate',
  'db.tables',
  'db.dump',
  'core.manifest'
])

export const SURFACE_ACTIONS = Object.freeze({
  'joomla-sealed': withReplace('joomla-sealed', [...JOOMLA_ACTIONS, 'content.contract']),
  joomla: withReplace('joomla', [...JOOMLA_ACTIONS]),
  'wordpress-contract': withReplace('wordpress-contract', [...WORDPRESS_ACTIONS, 'content.contract']),
  'wordpress-sealed': withReplace('wordpress-sealed', [...WORDPRESS_ACTIONS]),
  wordpress: withReplace('wordpress', [...WORDPRESS_ACTIONS]),
  // media.draw joined on 26/09/2026 (#402): it uploads through the site's own media_upload, and the
  // answer names the media id for tracy_emdash content_update. media.upload joined on 27/09/2026 by
  // the same road, for the customer's own picture: the host reads the file the Files tab put in the
  // site folder (`upload.mjs`), where the agent's own base64 or url looped 24–40 steps on the stand —
  // or, since 29/09/2026, the picture they sent in this chat (`attachment`).
  //
  // content.read IS here (Lee, 25/09/2026): the relay serves it on EmDash through the site's own reader
  // (#352), and it is the map that names the `tracy_emdash` entry and field to change. Every other
  // relayed action still answers EMDASH_SITE (`index.ts`).
  //
  // content.locate too (comment → edit, 27/09/2026): the seat book answers it through the same reader.
  emdash: withReplace('emdash', [
    'content.read',
    'content.locate',
    'page.text',
    'page.look',
    'media.scan',
    'media.draw',
    'media.upload',
    // The look undo (Brian, 29/09/2026, `look-undo.mjs`) on every surface; told by the turn, not here
    // (`TURN_ONLY_ACTIONS`).
    'look.revert',
    // A token in one call (PR #926, `look-set.mjs`); told by the LOOK line of the rules (`CONTEXT_TOLD_ACTIONS`).
    'look.set',
    // A new page and its menu row in one call (05/10/2026, `page-create.mjs`), through `tracy_emdash`'s road.
    'page.create'
  ]),
  // An imported copy whose plugin derived a contract (01/10/2026): its platform's open list, and the
  // derived slots' door on top — the same shape a quickstart has over its open surface (ADR 0022).
  'joomla-derived': withReplace('joomla-derived', [...JOOMLA_ACTIONS, 'content.contract']),
  'wordpress-derived': withReplace('wordpress-derived', [...WORDPRESS_ACTIONS, 'content.contract'])
})

/**
 * Which description a site gets. Null keeps the full, platform-neutral one — for a platform this
 * cannot read, and for a Joomla or WordPress site whose seal could not be read (one wrong guess there
 * tells a sealed site it may `content.update`, or an open one that it may not).
 *
 * 🔒 A SEALED WORDPRESS SITE HAS TWO ROADS SINCE #337, AND THE MARKER SAYS WHICH. `contractDoor` is
 * `contractDoorOf`'s answer (`site-context.mjs`, the one reader): true when provision bound the site
 * to its contract (`wordpress-contract`), false when its release pinned no Claude Cowork plugin
 * (`wordpress-sealed`, the record road), null when the marker could not say — then the full
 * description too, because each surface refuses the other's write before the relay (`planCall`), so a
 * wrong guess would leave the agent no way to its site's one door. A caller that does not pass it
 * reads the marker's old meaning, the record road.
 *
 * 🔒 AN IMPORTED COPY IS NEVER SEALED, AND ITS DERIVED CONTRACT DOES NOT SEAL IT (01/10/2026). `derived` is
 * `derivedContractOf`'s answer (`site-context.mjs`): true only for an open site whose host-owned import
 * record names the contract its own plugin derived. It adds the derived door to the open surface and
 * changes nothing else; a sealed site never reads it, so a quickstart keeps its own surface.
 * @param {{ platform: string, sealed: boolean | null | undefined, contractDoor?: boolean | null, derived?: boolean }} site
 * @returns {Surface | null}
 */
export function surfaceOf({ platform, sealed, contractDoor, derived }) {
  if (platform === 'emdash') return 'emdash'
  if (platform !== 'joomla' && platform !== 'wordpress') return null
  if (typeof sealed !== 'boolean') return null
  if (!sealed) return derived === true ? `${platform}-derived` : platform
  if (platform === 'joomla') return 'joomla-sealed'
  if (contractDoor === null) return null
  return contractDoor === true ? 'wordpress-contract' : 'wordpress-sealed'
}

// ── Canonical texts (T6, T8, T13 of the plan; T11 is `CONTRACT_LANGUAGE_RULE` in site.mjs) ───────────

/**
 * T6's second sentence: the `normalized` fact, said on every surface — Tracy corrects calls on all
 * of them (aliases, keys beside `params`, kinds, ids) and names what it changed in the answer.
 */
export const NORMALIZED_FACT =
  "An answer's `normalized` lists what Tracy corrected in your call: use that form next time."

/**
 * T6 — who makes a contract apply's ids. It REPLACES the sentences that told the model to make them
 * (V6 C1 of the plan): "apply_id MUST start with contract-" and "request_id is any string" stood
 * beside "Tracy makes them", two rules for one field in one prompt. Tracy mints both (`contract-…`
 * and `r-<hash>`) and reuses them only to retry the same send.
 */
export const CONTRACT_IDS_RULE =
  'Leave apply_id and request_id out: Tracy makes a pair per apply (an apply_id you give starts "contract-" and is new). ' +
  NORMALIZED_FACT

/**
 * T8 — the `page.text` block, the same on every surface.
 *
 * 🔒 774 CHARACTERS, OVER THE 700 A BLOCK GETS, BY MEASUREMENT, NOT BY OVERSIGHT (`test/surface.test.mjs`
 * lists every block over 700 and bounds it at its measured length). It carries the page-read rules the
 * site context no longer repeats (T2′) and `maxChars` — without it nothing gets past 2,000 characters.
 * Cutting the e-mail/phone hint would bring it to 731, still over, and that hint is how a contact
 * detail is found by a fragment. Its WHEN part reads "Use it to …", the plan's own wording.
 */
// 25/09/2026, round 2 of the agent chat on the local stand: asked "what sections does the home page
// have", the agent read `page.text {outline}` alone on Joomla and EmDash — once — and left out the
// Clients band, which the content map lists. "to answer a question about a page" sent it here; the
// sections a page has are the map's (content.read), said in the NOT, at no cost in length.
//
// 28/09/2026 (suite v6, #3): `head` — what a crawler reads (`page-head.mjs`) — and a text file's
// lines, where "not a page" was refused. The Writer and SEO/GEO roles carry no bash, so without them
// an SEO agent could not see the tags it was asked to write or check. Its NOT now reads "a words
// write": a tag written through a setting is NOT checked by its receipt — the receipt says what was
// stored, not whether the theme prints it — so that one read after it is the check, not a read-back.
export const PAGE_TEXT_BLOCK =
  'page.text: the words a visitor reads on a page of THIS site, as served now. Use it to find where a text is, a page\'s parts when the customer names a position, or its SEO tags. Not after a words write (its answer is the check); not for looks (page.look), sections or the page list (content.read {view:"pages"}). Call {path:"/", match?, maxChars?:≤8000, outline?:true, head?:true, paths?:[…≤8]}. Returns {url, lang, title, text}, text ≤2,000 chars unless maxChars; match keeps the lines holding it ("@" for e-mails, a few digits for a phone) plus pictures:[{near, src}] in their card; outline: one line per part, "<topbar|header|main|footer> <h1|p|button|nav|logo|text>: words [href]"; head: description, robots, canonical, og, hreflang, jsonLd, headings, alt-less images; robots.txt or a sitemap reads as lines; paths: {pages:[…]}. Read-only. Refusals: BAD_PATH → a path starting with one "/"; status:404 → no such path.'

/**
 * Actions the EmDash lead's list of page tools leaves out. `content.replace` has a block of its own;
 * `content.locate` (which record printed an element the customer picked — comment → edit,
 * 27/09/2026, `apps/tracy-web/src/sites/content-locate.js`) is named by no description at all: it
 * is told only in the turn that carries a pick.
 *
 * 🔒 NOT IN THE DESCRIPTION. The first cut appended "Picked element: content.locate … first" to every
 * map block: +150 characters on every step of every conversation on every site, for a turn only the
 * Browser tab's Comment sends — and "first" put a locate (and a `content.read`, which an editor seat
 * may not call) before `content.replace`, the one-call road for words. The comment turn carries the
 * locate answer with its ids and names both roads itself (`tracy-chat-input` `comment-turn.mjs`
 * `LOCATE_HINT`); the action stays in the enum, and its refusal says the call's shape. The one
 * exception to "a description names its own actions" (`surface.test.mjs`).
 *
 * The clause's last lesson lives on in that hint (Lee, 27/09/2026, P6 on the local stand): the agent
 * sent the block's CSS selector as `marks`; the door ignores a mark it cannot read, but a mark that
 * names no owner still turns a value-only answer into `unconfirmed` — so `marks` are the values of
 * the block's `marks:` line, split at ` | `, never its selector.
 */
// `look.revert` (Brian, 29/09/2026, `look-undo.mjs`) is the second: the result of the look write it
// undoes names the call and the id (`lookUndoNote`), in the turn that made it.
export const TURN_ONLY_ACTIONS = Object.freeze(['content.locate', 'look.revert'])

/**
 * Actions no description names: the turn-only ones above, and `look.set` (PR #926, `look-set.mjs`),
 * which the site context's LOOK line names with its call (`site-context.mjs` `LOOK_SET`).
 *
 * 🔒 THE LOOK LINE, NOT THE DESCRIPTION. The LOOK line reaches exactly the modes that may change how a
 * site looks — Designer and Developer, the ones with a shell (`lookLine`, `toolReach`) — and knows the
 * platform, so it says what look.set covers there (EmDash: tokens only). In the description the same
 * words would ride every step of every mode, the Writer's and SEO/GEO's included, which look.set
 * refuses (`LOOK_SET_NOT_IN_MODE`). The enum still carries it, so a call reaches the door, and its
 * refusals spell the shape.
 */
export const CONTEXT_TOLD_ACTIONS = Object.freeze([...TURN_ONLY_ACTIONS, 'look.set'])
const NOT_IN_LEAD = new Set(['content.replace', 'page.create', ...CONTEXT_TOLD_ACTIONS])

/**
 * 🔒 A PAGE THE CUSTOMER NAMES IS THE FIRST READ, ON JOOMLA AND WORDPRESS (30/09/2026). The sentence used to
 * say "Call {describe:true} once, then …", which made the describe — 15–35k characters — the first read of
 * every request. In the round-7 add-by-chat runs the ones that read it first took 11.3 steps against 6.9 for
 * the ones that did not, and it cannot say which category or query a page lists, which is what an add needs.
 * `{view:"pages", url}` finds the page and, for a listing page, answers what it lists and the call that adds
 * to it (`page-lists.mjs`); the describe stays the read for what the map cannot say — the types, the block
 * kinds, where SEO, menus and forms live. It costs +85 characters (316 → 401) on every step of the Joomla and
 * WordPress surfaces; EmDash keeps its own sentence.
 */
const PAGE_FIRST =
  'Call {view:"pages", url} first for a page the customer names, then {id}; {describe:true} for types, block kinds, where SEO/menus/forms live; {type:"page", locale} lists one type; follow links.next.'
/** EmDash keeps the describe-first sentence: its add road is `tracy_emdash` and measured 4–5 steps. */
const DESCRIBE_FIRST =
  'Call {describe:true} once, then {type:"page", locale} or {view:"pages", url:link}; then {id}; follow links.next.'

/**
 * `content.read` — the Content API read (#347, tracy-content/v1), on every Joomla and WordPress
 * surface. It is a READ of the Claude Cowork plugin, relayed like `content.get`; a Claude Cowork plugin without it answers
 * `CONTENT_ADAPTER_UNSUPPORTED`. Left off the surfaces by #341, it was refused before the relay
 * (`NOT_ON_THIS_PLATFORM`) on every site. Measured 25/09/2026 through the agent chat on
 * `capiwp1333` (before #341): asked "what sections does the home page have" with no tool named, the
 * agent spent 15 calls on page.text and a screenshot and described the footer wrongly; named, this
 * read answered in two. It also used a WordPress post id (`42`) three times, and `limit:200`,
 * `type:"template-part"`, `locale:"vi-VN"` — the bounds and the opaque ids are said here for that.
 *
 * The call names `type` and `locale` (25/09/2026, final acceptance on dev, `fj1823`): an unfiltered
 * `{limit:20}` answered twenty records in every language, the agent opened two of them and never the
 * Home page the map lists, then hunted raw records for 17 calls. A filtered list names the page first.
 *
 * DESCRIBE FIRST (Content API v2, 26/09/2026): `{describe:true}` answers `tracy-content-describe/v1` —
 * types with counts, block kinds with their fields and constraints, what the seat may edit and the
 * CMS's own guidance — so those rules travel with the data instead of sitting in every step's prefix.
 * A read that skips it gets a `next` pointing there (`site-call.mjs`, `contentReadNext`).
 *
 * BY ADDRESS, AND ONLY WHAT IS ASKED (Content API v2, 26/09/2026, Lee): a customer names a page or
 * pastes its link; `{view:"pages", url}` is the relay's walk of the listing that answers which
 * record that is (round 5b spent 12 listings and 7 reads on one such question). `fields` trims a
 * read to the keys named, ids kept (`apps/tracy-web/src/sites/content-pages.js`, `content-fields.js`).
 *
 * THE CMS'S OWN IDS (Lee, 27/09/2026): each content carries `native: [{kind, id|key}]`, the records
 * content.get / content.update / content.delete take (Claude Cowork plugins Joomla/WordPress, EmDash reader).
 * Before that the block said "never CMS ids" and the agent ran content.list/content.get to learn them.
 */
const contentReadBlock = (
  /** @type {string} */ bridge,
  /** @type {string} */ refusals = '',
  /** @type {string} */ call = PAGE_FIRST
) =>
  `content.read: THIS site's map: pages, articles, shared parts. Use it to find page fields. Not for writing. ${call} Returns ids; native: CMS {kind, id|key}${bridge}. Read-only. Refusals: CONTENT_BAD_QUERY names the field${refusals}.`

/** On a site whose words change by record (open Joomla/WordPress, sealed WordPress with no binding). */
export const CONTENT_READ_BLOCK = contentReadBlock('')

/**
 * 🔒 THE MAP NAMES THE EDIT (Lee, 25/09/2026: the Content API is a map, judged by calls and seconds
 * from a customer's question to the right edit). On a contract surface a field's `slotKey` IS the key
 * a `content.contract` apply takes in `changes` — the e2e on dev wrote `changes:{[field.slotKey]: …}`
 * and read it back (`tasks/evidence/content-api-integration/e2e-dev.mjs`), `<lang>::<key>` copies
 * included. Unsaid, the agent found the field here and then located the slot again with an inspect.
 *
 * ⚠ AND THIS READ'S `revision` IS NOT THE CONTRACT'S: the Content API revision is per content, an
 * apply's `expected_revision` is the contract's (`docs/references/content-api-v1.md`, "The Content API
 * revision used for reads"). Passed as `expected_revision`, the component runs a full inspect
 * (12–20 s) and refuses "Content changed". Left out, Tracy sends the content revisions this read
 * showed as `expected_content_revisions` (Content API v2, D2: Claude Cowork plugin rc.5 / rc.2; the model is never
 * told the key), and only when a changed slot was not read does CC-12 fill the revision this
 * conversation inspected, or inspect once and answer INSPECT_FIRST (`normalize.mjs`, `site-call.mjs`).
 * So the shortest road is content.read → apply without a revision, and no inspect at all.
 */
export const CONTRACT_CONTENT_READ_BLOCK = contentReadBlock(
  "; slotKey is a field's key in content.contract apply changes; a writable:true field's next is that apply (≤constraints.maxCharacters; leave expected_revision out: Tracy fills it)"
)

/**
 * EmDash's map (#352: the relay serves `content.read` through the site's own reader,
 * `tracy-emdash-theme-business/tools/content-api/reader.mjs`). Its fields are the entry's own field
 * names and `slug` is the entry's slug, which is what `tracy_emdash` `content_get` takes as `id`
 * (`EMDASH_WORDS_ROAD`); the collection is not in the map (the reader's `type` is `page`, `shared`,
 * `article`…), so the site context's collection rule names it. The reader is opt-in at image build
 * (`TRACY_CONTENT_API_SCALARS=1`), so most EmDash sites answer CONTENT_ADAPTER_UNSUPPORTED, and that
 * refusal names the road that always works.
 */
export const EMDASH_CONTENT_READ_BLOCK = contentReadBlock(
  "; a field's key is its tracy_emdash field, slug its entry id: content_get {collection, id:<slug>, locale} (collection: the site context's rule; a shared part: site)",
  '; CONTENT_ADAPTER_UNSUPPORTED → no map here: tracy_emdash content_get',
  DESCRIBE_FIRST
)

/**
 * `apply.list`'s NOT (D6′), said once per surface in the block that carries `apply.list`: measured r2,
 * 55 of its 63 calls came right after an accepted write in the same turn (WordPress 37, Joomla 18) — a
 * read-back of what the write's own answer said. A clause, not a sentence: each block frames it.
 *
 * 🔒 AND WHERE AN EARLIER CONVERSATION'S CHANGE IS FOUND (14/10/2026, ladder DL15): with no apply_id in a
 * conversation that wrote nothing, the Apply door lists the site's recent changes with their apply_id
 * (`normalize.mjs` AL-4). Unsaid, a customer's "undo the change you made" in a new conversation had no
 * road: the agent read the plugin's log through the shell and undid the wrong change.
 */
export const APPLY_LIST_RULE =
  "never after a write: the write's answer is the receipt; with no apply_id before any write: the site's recent changes"

/**
 * T13 — the sealed Joomla CONTRACT block: the door's apply rules, said ONCE (the site context's T3′
 * keeps only this site's facts and points here). T6 is quoted, never restated.
 *
 * 🔒 T11 (which language a slot changes in) IS SAID BY THE SITE CONTEXT ALONE (09/10/2026). It was quoted
 * here AND in the context's WHERE row of every contract site (`SEALED_JOOMLA_WHERE`,
 * `SEALED_WORDPRESS_CONTRACT_WHERE`), the same constant twice on every step: 178 characters on Joomla, 371
 * on WordPress. The row is sent to every mode of such a site, so the block points at it in one clause. It is the
 * whole door of a sealed site, so its pictures (`media.draw`), its undo (`apply.revert`) and its
 * receipts (`apply.list`) are clauses of it rather than blocks of their own: one block's WHAT, WHEN and
 * NOT cost ≈ 150 characters that the sealed Joomla budget does not have.
 *
 * ⚠ 1,785 CHARACTERS, NOT THE 1,300 THE PLAN AIMED AT: the plan's own text with T6 (255) and T11
 * (178) inside measures 1,555; `media.draw`'s cost clause (+25) and the `apply.list` clause (+108)
 * moved in; and the language clause now gives the retire call's whole shape (+97) — plan text said
 * "its refusal's next gives the shape", but the component's refusal is `bad_params` "an mlang-
 * apply_id is required" (`Engine.php:1801`), which P3's default next does not turn into a call, and a
 * model that followed T6 sent no id or a `contract-` one. The retire pass is also undone by
 * `multilingual.restore` with its id, not by `apply.revert`, which on a bound site takes contract
 * receipts only (`Engine.php:158-161`). Every other clause is a measured r2 failure (ids, languages,
 * the occupied rule, the read-back after a receipt, the inspect's cost), so the block keeps them and
 * the rest of the sealed Joomla surface is shorter instead: the whole stays within the plan's 3,700.
 *
 * 29/09/2026: `media.draw`'s cost clause left the block again (−25): a reply to a customer names no
 * price, so the tool text no longer asks for one (`test/reply-plain.test.mjs`).
 */
// 25/09/2026, dev acceptance on fj1823: asked which picture the hero shows, the agent called this
// door's inspect in both runs — 60–80 s each on the dev machine — although the content.read detail it
// had already opened carried the picture, its block and its alt. A question that only reads is the
// map's; this door is for the change.
export const CONTRACT_BLOCK =
  'content.contract: reads and changes this quickstart site slot by slot. Use when content.replace cannot: a picture, a link, words it refused. Not for structure or settings (content.update) or a read-only question (content.read). Call: after content.read showed the slot (field.next), ONE {operation:"apply", changes:{"<slot key>":"<value>", …}} carrying every change — no inspect, Tracy sends the revisions it read; a slot marked requiresEvidence also takes evidence:{"<key>":"<the customer\'s words>"}. Only when content.read did not show the slot: {operation:"inspect", page, slots:"text", match} (10–20 s at first), then apply with expected_revision:<its revision>. ' +
  CONTRACT_IDS_RULE +
  ' A slot\'s language: the site context\'s rule. Apart from Site identity, an occupied slot cannot be emptied and an empty one cannot be filled; nothing is created or deleted. Returns the apply\'s receipt: read nothing afterwards. Pictures: media.draw {prompt, slot}, then apply the path. Languages: content.contract {operation:"multilingual.retire", keep:[<tags to keep>], apply_id:"mlang-<new>"} hides the rest (repeat until completed); tracy_site_build_joomla request language.add adds one. Undo: apply.revert {apply_id} (the latest contract apply; a retire: multilingual.restore, same id). Refusals: contract_failed → its next; writer_busy → Tracy already retried: tell the customer.'

/**
 * T13 on a BOUND WordPress site (#337): the same door, the same ids (T6), the same receipts — and
 * what the WordPress Claude Cowork plugin does differently, each read from claude-cowork `origin/main` a0ab275
 * (Claude Cowork plugin 0.13.2), `wordpress/cowork/lib/{Engine.php, QuickstartContract.php}`:
 * - the inspect lists the SOURCE edition's slots only, as a map of key → current words, and a copy in
 *   another language is written `<edition>::<key>` (`plan()`): `WORDPRESS_CONTRACT_LANGUAGE_RULE`,
 *   quoted, never restated (the site context quotes the same constant);
 * - a slot takes plain words, or a link (`checkValue`: no markup, `urlAllowed`), or — an image slot,
 *   Claude Cowork plugin 0.14.0-rc.4 — the path `media.draw {prompt, slot}` answers; no occupancy rule, no
 *   evidence slot in the wp7 profiles;
 * - `multilingual.retire` / `multilingual.restore` from Claude Cowork plugin 0.13.0, under an `mlang-` id the
 *   model names; no build request adds a language on WordPress (`tracy_site_build_wordpress` has no
 *   `request` action), so none is named.
 * The inspect is narrowed host-side (`narrowInspect` reads the WordPress map too): `page` and `match`.
 */
export const WORDPRESS_CONTRACT_BLOCK =
  'content.contract: reads and changes this quickstart site\'s words slot by slot. Use when content.replace cannot: a picture, a link, words it refused. Not for structure or settings (content.update) or a read-only question (content.read). Call: after content.read showed the slot (field.next), ONE {operation:"apply", changes:{"<slot key>":"<plain words>", …}} carrying every change — no inspect, Tracy sends the revisions it read. Only when content.read did not show the slot: {operation:"inspect", page, match} then apply with expected_revision:<its revision>. ' +
  CONTRACT_IDS_RULE +
  ' A slot\'s language and its other editions\' keys: the site context\'s rule. No markup; a link takes https://, mailto:, tel: or a /path. Returns the apply\'s receipt: read nothing afterwards. Pictures: media.draw {prompt, slot}, then apply the path. Languages: content.contract {operation:"multilingual.retire", keep:[<languages to keep>], apply_id:"mlang-<new>"} hides the rest (repeat until completed). Undo: apply.revert {apply_id} (the latest contract apply; a retire: multilingual.restore, same id). Refusals: contract_failed → its next; writer_busy → Tracy already retried: tell the customer.'

/**
 * The derived contract of an IMPORTED copy (01/10/2026): what its Claude Cowork plugin derived from the
 * copy's own database at import provisioning — the words, links and pictures a page shows, wherever the
 * theme or builder keeps them (builder JSON, widgets, theme mods, module params), each as one slot. Said
 * with the plugin's own rules (claude-cowork `DerivedMap::slot`, `QuickstartContract::checkValue`): a slot
 * rewrites the value already there, keeps its stored format, takes plain text up to max(40, 1.25×) its
 * length, and a Joomla slot is never emptied — so longer text, a new or removed part and a setting go
 * by the record writes below, and the refusals send them there. No inspect call: `content.read` gives the
 * slot key with the revision it was read at (CC-12, `normalize.mjs`), where an inspect of a derived map lists
 * thousands of leaves. A slotKey found in the index is NO read: the conversation's first apply then answers
 * INSPECT_FIRST once and is sent again, which the block says (it used to promise ONE apply, and 8 of 45 bench
 * cases paid the extra call; review, 02/10/2026). Tracy makes the apply's ids, as on a quickstart (T6).
 */
export const DERIVED_CONTRACT_BLOCK =
  'content.contract: changes an imported site\'s words, links and pictures slot by slot. Use when content.read, a pick or docs/agents/import-contract/slots.tsv (grep -i) gives a slotKey. Not for longer text, new or removed parts, settings: content.update. Call {operation:"apply", changes:{"<slotKey>":"<plain text | URL | library path>", …}} with every change, no inspect: Tracy makes the ids and sends the revision content.read showed; with none read, the first apply answers INSPECT_FIRST (the slot\'s words now, a revision): send the same apply again. Returns the receipt: read nothing afterwards. Effects: a slot takes plain text up to 1.25× its length; a Joomla slot is never emptied; apply.revert {apply_id} undoes the latest apply. Refusals: SLOT_TOO_LONG or SLOT_EMPTY_STATE → content.update or content.replace on that record; SLOT_UNKNOWN → grep the index or content.read again.'

// ── The blocks ────────────────────────────────────────────────────────────────────────────────────

/** The tool's lead. The action list is the `action` enum of the parameters, so it is not repeated. */
const leadOf = (/** @type {boolean} */ normalized) =>
  "tracy_site: THIS site's content, as the person you work with. Call {action, params}." +
  (normalized ? ` ${NORMALIZED_FACT}` : '')

/**
 * 🔒 `content.list {search}` IS OFFERED (30/09/2026), WITH THE RELEASE THAT READS IT AND THE ROAD WHEN AN OLDER
 * PLUGIN REFUSES IT. The Claude Cowork plugin releases exist (Joomla 0.20.0, WordPress 0.16.0,
 * `list-search.mjs`), and the guard (`route.js`, `site-call.mjs`) turns an answer that did not read the key
 * into `LIST_SEARCH_UNSUPPORTED`, which the model then meets with its road. So the description names the key
 * without saying "this site has the plugin" — it may not, and the sentence says what happens. The words are
 * static per platform, so a site's cached prefix does not change per turn. WordPress adds "in every
 * language": the plain list answers the default language only, and the search reaches every one.
 *
 * 🔒 THE ROAD IN THIS SENTENCE IS THE ONE THAT IS TRUE OF EVERY KIND: page with `offset`. It used to say
 * `content.read`, which lists an article, a menu item and a module (`list-search.mjs` `contentReadLists`) but
 * not a category, a banner or a language, and the description is sent at every step of every kind. The refusal
 * itself names the road for the kind asked (`site.mjs` `listWithoutSearchNext`): `content.read` where it lists
 * the kind, the same call paged where it does not.
 */
const LIST_SEARCH_OLDER = 'an older one answers LIST_SEARCH_UNSUPPORTED, whose next is the road'
const LIST_SEARCH_JOOMLA = `search matches title or alias (Joomla ${LIST_SEARCH_SINCE.joomla}+; ${LIST_SEARCH_OLDER}).`
const LIST_SEARCH_WORDPRESS = `search matches title or slug, in every language (WordPress ${LIST_SEARCH_SINCE.wordpress}+; ${LIST_SEARCH_OLDER});`

/**
 * The Joomla reads. `kind` is the component's own list (`SiteWriter::KINDS`, claude-cowork origin/main
 * 2aa7840): the seat book also routes `fieldValue`, which the component refuses, so it is not named.
 *
 * 🔒 EVERY KIND IS NAMED, NO ELLIPSIS. Six names and "…" was the whole list until 16/09, and the two
 * the language job needed — `language`, `extensionParams` — were inside the ellipsis: that turn spent
 * fifteen calls tracing Joomla's own source to a change the door could make all along. A kind the
 * component does not carry is refused by NAME, which is an answer; an ellipsis was a locked door.
 *
 * No REFUSALS part (a listed exception in the test): r2's sealed Joomla turns made 72 reads and 2 were
 * refused — `id required`, a kind outside the list — both shape errors whose T10 next is the corrected
 * call; the sealed surface has no room for a clause that prevents two.
 */
const JOOMLA_READ_BLOCK = `content.list · content.get · info · extension.list: THIS site's records, versions and extensions. Use when a change needs a record's id or stored fields. Not for visitor words (page.text) or the page list (content.read {view:"pages"}). Call content.list {kind, search?:"<part of the title>", offset?, limit?:≤200, include_body?} · content.get {kind, id}; kind ∈ {article, category, tag, field, menuItem, menutype, module, moduleAssignment, templateStyle, language, languageFilter, articleAssociation, menuAssociation, redirect, banner, bannerClient, contact, newsfeed, user, extensionParams}. ${LIST_SEARCH_JOOMLA} Returns {items}; content.get {item}. Read-only.`

/**
 * 🔒 THE WORDPRESS READ SHAPES THE COMPONENT ANSWERS, measured 24/09/2026 on `wp-dmlj6g` (r2):
 * `content.list` with any kind but post came back `serves kind "post" only` 22 times (menuItem 8,
 * option 7, postmeta 4, templatePart 3); `content.get {kind:"option", key}` answered 4 of 4 — the old
 * description said options could not be read back; Joomla kinds asked of WordPress (templateStyle,
 * field, module, page) were refused 13 times. List rows are cut to six fields on arrival
 * (`site-call.mjs`), and `content.get` answers WordPress's own `post_*` columns.
 *
 * No REFUSALS part (a listed exception in the test): its two r2 classes are answered elsewhere — the
 * kind class (50) is prevented by "posts only" in CALL and corrected by `normalize.mjs` (WP-4…6), and
 * `not_found` (28, 21 of them one turn guessing ids 1…24) gets P3's T10 next with the listing call.
 * The clause ("not_found → list the ids; never guess one", 52 characters) is what sealed WordPress
 * could not fit under 3,700.
 */
const WORDPRESS_READ_CALL = `Call content.list {search?:"<part of the title>", post_type?:"page"|"wp_navigation"|"wp_template_part", name?:"<slug>", limit?:≤200, offset?, include_body?} — posts only; ${LIST_SEARCH_WORDPRESS} kind:"pattern" lists registered block patterns; content.get {kind, id | key}, kind ∈ {post, postmeta, option, templatePart, term, menuItem}: option, templatePart by key ({kind:"option", key:"blogname"}); postmeta, term by id + key. Returns rows {id, title, slug, type, status, path} (include_body:true adds content, ≤25 rows); content.get answers post_* fields. Read-only.`
const WORDPRESS_READ_BLOCK = `content.list · content.get · info · plugin.list · theme.list: THIS site's stored records. Use when a write needs an id or the body. Not for visitor words (page.text) or the page list (content.read {view:"pages"}). ${WORDPRESS_READ_CALL}`
/**
 * The same reads on a BOUND WordPress site (#337): the Claude Cowork plugin keeps them open, but no write takes an
 * id or a body there — words change by slot — so its WHEN and NOT say what a record read is still for.
 */
const WORDPRESS_CONTRACT_READ_BLOCK = `content.list · content.get · info · plugin.list · theme.list: THIS site's records as stored. Use when a question needs stored fields. Not for words (content.contract, page.text) or the page list (content.read {view:"pages"}). ${WORDPRESS_READ_CALL}`

/**
 * `content.find` (open sites only: every sealed site refuses it, `CONTENT_CONTRACT`). No REFUSALS part
 * (a listed exception): all 26 of its r2 refusals were `CONTENT_CONTRACT` on a sealed site, where it is
 * no longer offered; r2 had no open site to measure it on.
 */
const FIND_BLOCK =
  'content.find: which file holds a string the customer sees, and the door that changes it. Use when the words are the software\'s own ("Read more", a form label). Not for records (content.list) or a grep of the webroot. Call {text}. Returns {matches:[{layer, door, file, line}], notSearched}. Read-only.'

/**
 * `media.upload`'s call in the pictures block: the customer's picture by NAME, from either place it can
 * be — the Files tab (the site folder) or the chat it was sent in (dsh's attachment store) — and the
 * host reads the bytes (`upload.mjs`).
 *
 * 🔒 THE CHAT ROAD IS SAID HERE, OR THE MODEL TYPES BASE64 (29/09/2026). A picture sent in the chat was
 * visible to the model and out of reach of every door; v5 measured 12 min / 28 steps (WordPress) and a
 * 725 s timeout (EmDash) of base64 typed by hand (bench cause O). `attachment` takes the name dsh
 * prints beside the picture, or its `sha256:` id (all a text-only model is shown).
 *
 * Paid for inside the budgets, not by raising them: the WHAT and WHEN lost 16 characters that said
 * nothing the head does not; on the open surfaces the upload's own return (`{path, width, height}`)
 * left the RETURNS list — its answer carries a `next` that names the write, which is what the model
 * acts on — and on EmDash the draw's and the upload's returns are one (`{id, url}`: both answer the
 * media id and url; a draw's cost and model are not returned at all, `draw.mjs`). Measured: the block 735 → 722 on the open and
 * contract surfaces, EmDash's description 2,500 → 2,504 of its 2,509.
 */
export const UPLOAD_CALL =
  'media.upload {file, alt?} (Files-tab name) | {attachment, alt?} (attached in chat: name or sha256)'

/**
 * The `media.draw` call in the pictures block, by what the surface takes it for.
 *
 * 🔒 EACH SURFACE NAMES THE SHAPE ITS DOOR ACCEPTS AND NO OTHER (bench v7, 29/09/2026). The block said
 * `{prompt, like?:"<a site picture>" | aspect?:"16/10"}` on every Joomla and WordPress surface, quickstart
 * ones included, while the contract block two paragraphs down said `{prompt, slot}` — and a bound
 * WordPress site refuses anything but a slot (`SLOT_REQUIRED`), where a Joomla quickstart's Claude Cowork plugin
 * refuses a picture cut to the wrong shape at the apply. 20 picture runs spent 2–8 calls finding the
 * slot key, guessed one, or sent the slot beside an aspect and were refused for it. A slot brings its
 * own shape (the demo picture the Claude Cowork plugin measures against), so the text says so, and says where the
 * key is; the open surfaces keep `like` and `aspect`. EmDash has no slot: the picture it replaces is an
 * entry field, which the door measures (`replaces`) — an `aspect` typed by the model was 16/10 read off
 * a stock example, 5/4 rounded from 1000×880, and 4/3 read off a CSS frame (v7 EmDash picks).
 * @type {Record<'open' | 'joomla-slot' | 'wordpress-slot' | 'emdash', string>}
 */
const DRAW_CALL = {
  open: ' · media.draw {prompt, like?:"<a site picture>" | aspect?:"16/10"}',
  'joomla-slot': ' · media.draw {prompt, slot:"module-441.8"}',
  'wordpress-slot': ' · media.draw {prompt, slot:"home.hero.img" | aspect (library only)}',
  emdash: ' · media.draw {prompt, replaces:{collection, id, field} | aspect:"<w>:<h>" (a new picture)}'
}

/** Where a slot key comes from, and what a slot spares the agent — said once, after the call. */
const SLOT_KEY_FROM = ' (key: inspect {slots:"image", page}; a slot sets its shape: no like/media.scan)'

/**
 * The page's look and the site's pictures in one block. On sealed Joomla `media.draw` is in the
 * contract block (it takes a slot's shape and its path goes in by apply, so a second block would
 * repeat it). `media.upload {file}` (the customer's own picture, read by the host from the site folder
 * the Files tab writes into — `upload.mjs`) rides here on every surface since 27/09/2026, EmDash
 * included, in fewer characters than the `content_b64` shape it replaced on the open ones; and
 * `{attachment}`, the picture sent in the chat, since 29/09/2026 (`UPLOAD_CALL`).
 * @param {'joomla-slot' | 'wordpress-slot' | 'open' | 'emdash'} mode - `*-slot`: a quickstart with a
 *   contract (a picture goes into a slot); `open`: every other Joomla and WordPress surface.
 */
const picturesBlock = (mode) => {
  const emdash = mode === 'emdash'
  const slot = mode === 'joomla-slot' || mode === 'wordpress-slot'
  const mediaDelete = emdash ? '' : ' · media.delete: preview, confirm; no shell/files; report refusals.'
  // `style` (28/09/2026, suite v6 #3): one element's computed CSS and the var(--token) chain behind
  // it, from the same browser (`look-style.mjs`) — a designer learns WHICH token to change instead of
  // patching one element, and checks a look without grepping stylesheets.
  const style = " · style: each prop's value, rule and var(--token) source"
  const effects = emdash
    ? 'Effects: media.draw adds one picture per call: write its id with tracy_emdash content_update.'
    : slot
      ? 'Effects: media.draw adds ONE picture per call: apply its path.'
      : 'Effects: media.draw adds ONE picture per call: write its path where it belongs.'
  return `page.look · media.scan · media.draw · media.upload: a page's look, the site's pictures. Use when asked about either. Not for words (page.text). Call page.look {path:"/", style?:{text|selector, nth?:0 = the first, props?, viewport?}} · media.scan {${emdash ? 'limit?:≤100 | id' : 'limit?:≤100'}}${DRAW_CALL[mode]}${slot ? SLOT_KEY_FROM : ''} · ${UPLOAD_CALL}${mediaDelete}. ${emdash ? `Returns {file, url}${style} · {id, alt, url}, id: the picture · {id, url}` : `Returns {file, url, description?}: follow its next${style} · the largest images {path, url, width, height} · {path}`}. ${effects} Refusals: NO_BROWSER → page.text.`
}

/**
 * The WordPress write, one shape per kind.
 *
 * 🔒 `post_content` AND A TEMPLATE PART'S `content` REPLACE THE WHOLE BODY — SAID HERE BECAUSE THAT WAS
 * THE ROOT CAUSE. Measured r2 (25/09/2026): 6 of 33 WordPress cases truncated a live page with their
 * first write — the home post (≈ 26.9k characters) overwritten with 252, 4,231, 4,192 and 4,155; the
 * contact post (≈ 15.6k) with 3,191; the header part with 19. One case then spent 8 more writes
 * rebuilding the page in chunks. The model read `fields` as a patch. `BODY_SHRINK` (site-call.mjs)
 * refuses the short write; this sentence stops it being sent.
 *
 * 🔒 ITS NOT IS THE SLOT KEY, the largest write error of r2: 15 `write_failed` answers "no writable
 * field for kind post" to `fields:{hero.heading…}`, `{contact.item.N.text…}` — the contract's slot
 * habit carried to a door that has none. Its REFUSALS part is not labelled (a listed exception):
 * `BODY_SHRINK` is named where the whole-body rule is said, inside CALL, in the plan's pinned words.
 *
 * 🔒 "AN EDIT NAMES ITS ID": r2 C02/C04/C20 sent `{apply_id, fields:{post_content}}` with no kind and
 * no id — which CREATES a new draft. The ids are Tracy's on WordPress: one `wp-…` apply_id per
 * write (WP-27; one per customer request under D9 until 26/10/2026).
 *
 * 🔒 OVER 700 BY MEASUREMENT (a listed exception, bounded at its length): five kind shapes, the edit-id
 * clause and the whole-body sentence are each an r2 failure class, and the plan pins their words.
 *
 * ⚠ `readBack` IS THE D6′ (c) FALLBACK, ONE FLAG WITH THE SITE CONTEXT'S `wordpressReadBack`: a build
 * whose door does NOT check a post or templatePart body after writing it (the in-tool `verified`
 * check) tells the agent to read that record once — in the site context's words — and then this
 * block must not say the opposite. The same flag goes to both, or the tool and the context contradict
 * each other in one prompt.
 */
const wordpressWriteBlock = (/** @type {boolean} */ readBack, /** @type {boolean} */ replace = false) =>
  // PR2 review (25/09): where content.replace exists, words already on a page are its job.
  (replace
    ? 'content.update: changes one record. Use when settings change or content.replace cannot. '
    : 'content.update: changes one record. Use when words or settings change. ') +
  'Not for slot keys: the words live inside post_content. ' +
  'Call — post {kind:"post", id, fields:{post_title|post_content|post_excerpt|post_name|post_status}} (an edit names its id; without one it CREATES a post) · option {kind:"option", key, fields:{value}} · templatePart {kind:"templatePart", key:"header"|"footer", fields:{content, title}} · postmeta {kind:"postmeta", id, key, fields:{value}} · term {kind:"term", id, key:"<taxonomy>", fields:{name}}. A body (post_content, a part\'s content) goes by blocks: content.get {…, outline:true} numbers them, with rev (always over 16,000 chars), block:i reads one; {rev, blocks:{"<i>":"<markup>"|null, "+<i>":"<markup>"|{pattern:"<name>"}}} changes, drops or adds just those; a key may be a block\'s own metadata.name, a value {find,replace} (find stands once in it) or {attrs:{…}} (metadata, lock; any attr of a /--> block; null removes one). In fields: the WHOLE body (shorter: BODY_SHRINK). ' +
  (readBack
    ? 'Returns {kind, id, key, created}: the receipt — except after a post or templatePart write: content.get that record once to check the body is whole. '
    : 'Returns {kind, id, key, created, verified}: the receipt. ') +
  'Effects: live at once; apply.revert undoes it.'

/**
 * The rest of the WordPress writes, and the receipts.
 *
 * ⚠ apply_id (WP-27): Tracy makes a `wp-…` id for each content write that leaves it out (`normalize.mjs`;
 * one per customer request under D9 until 26/10/2026), so this says "optional" and never asks for one. The site
 * context's SEVERAL JOBS line says the same on WordPress since 25/09 (it asked for an id per item on
 * every open door); `consistency.test.mjs` holds both texts to it. `media.upload` (in the pictures block)
 * takes no apply_id from the model: its receipt is Tracy's `media-<sha16>` (`upload.mjs`, 27/09/2026),
 * given back in its answer. No REFUSALS part (a listed exception): r2 measured one delete
 * (accepted) and two `content.language` calls without an id, which `normalize.mjs` refuses before the
 * relay with its own next (WP-28).
 */
const WORDPRESS_MORE_BLOCK = `content.delete · content.language · language.install · apply.revert · apply.list: delete, translate, undo. Use when a page goes, a language comes or a change is undone. Not for words (content.update); apply.list ${APPLY_LIST_RULE}. Call content.delete {kind:"post", id} · content.language {id, lang, translations?:{<lang>:<id>}} · language.install {locale} · apply.revert {apply_id} · apply.list {apply_id?}. apply_id is optional: left out, Tracy makes one per write. Returns receipts; apply.list {apply_id, steps}. Effects: a delete trashes; apply.revert undoes one apply to the byte.`

/**
 * Open Joomla: the four verbs as the component defines them — add, edit, move, trash (read 21/09 from
 * `claude-cowork`, both engines: `content.update` with id 0 INSERTS and answers `{created:true, id}`;
 * `parent_id` / `move_after` re-hang a node; `content.delete` writes the kind's trash column).
 * `WRITE_VERBS` (site.mjs) says the same for the full fallback and `site.test.mjs` holds it to the
 * component; this block says it in T12 order, and `test/surface.test.mjs` pins the same four facts
 * and the same two call shapes.
 *
 * The component refuses a Joomla content write without an apply_id (`contentUpdate`, `Engine.php:2058-2061`);
 * Tracy names one per write when the call leaves it out (J-6, 26/10/2026), and here the model is still asked
 * to name it — one per item, the rule the site context's SEVERAL JOBS line gives, since the
 * component's undo log groups writes by it and `apply.revert` then undoes that item alone. This is
 * the ONE surface that asks the model for an id per item (`test/surface.test.mjs` holds the others
 * to it).
 *
 * Its NOT is the file-backed words: the language job of 16/09 spent fifteen calls writing records for
 * words that live in files, where `content.find` names the door.
 *
 * Where `content.replace` exists (27/09: open Joomla's own engine, sealed Joomla's contract one), words
 * already on a page are its job, and the lead says so as WordPress's does (`wordpressWriteBlock`): -15
 * characters, the WHEN that listed every verb giving way to one the WHAT already names.
 *
 * 🔒 "A KEY HELD AS JSON TEXT IS PATCHED AS AN OBJECT" (03/10/2026, dev site leemood, module 93): the agent
 * sent `{patch:{"jatools-config":"<the whole config again>"}}` to change one heading, typed `":type"` as
 * `"type"`, and the hero printed nothing; a second try lost a `}` and broke the tool call itself. The host
 * now refuses such a string (`PARAMS_KEYS_LOST`); this clause stops it being sent.
 */
const joomlaWriteBlock = (/** @type {boolean} */ replace) =>
  'content.update · content.delete: add, edit, move or trash one record of THIS site. ' +
  (replace
    ? 'Use when settings change or content.replace cannot. '
    : 'Use when a record is added, changed, translated, moved or removed. ') +
  'Not for words the software prints (content.find). Call content.update {kind, id, fields, apply_id} — id left out (or 0) CREATES one; on an existing record parent_id / move_after MOVE it with everything under it; fields.params (or attribs, images, urls, metadata) as {patch:{…}} merges into the stored column (null removes a key; a key held as JSON text (jatools-config) is patched as an object, never re-typed) · content.delete {kind, id, apply_id}. apply_id names the receipt: one per item of the request. Returns {kind, id, created}: the receipt. Effects: live at once; a delete TRASHES (nothing is purged); apply.revert {apply_id} undoes that item, an insert included. Refusals: a kind that cannot be created or moved is refused by name.'

/**
 * Open Joomla: the receipts. No REFUSALS part (a listed exception): r2 had no open Joomla site, and on
 * the sealed one every receipt call was accepted (21 of 23; the other two were `apply.list` without an
 * id, which `normalize.mjs` now fills with the latest write).
 */
const JOOMLA_RECEIPTS_BLOCK = `apply.revert · apply.list: undo one apply, or say what it changed. Use when the customer asks to undo a change, or what one did. Not for words (content.update); apply.list ${APPLY_LIST_RULE}. Call apply.revert {apply_id} · apply.list {apply_id?}. Returns {reverted} · {apply_id, steps}. Effects: apply.revert undoes one apply to the byte.`

/**
 * Every Joomla surface: the site's name, description and page-title setting — Global Configuration, which
 * no record holds (Claude Cowork for Joomla 0.22.0, `lib/SiteIdentity.php`; an older plugin answers
 * "unknown action", a readable refusal).
 *
 * 🔒 THE SITE NAME'S ONLY RECORDED DOOR (ladder DL14/DL15 on dsl2jo, 14/10/2026). With no such action the
 * agent asked to change "the home title" of a home with no h1 renamed the site through the shell
 * (`php cli/joomla.php config:set sitename=…`): it showed on every page, and nothing recorded it — so in
 * the next conversation "undo the title change" found no such change among the receipts, and two
 * articles were undone instead. Through this door the change has an apply_id, a Site changes row and the
 * plugin's own undo step. `normalize.mjs` J-5 sends new fields as a set and names its receipt when the
 * call names none.
 */
export const JOOMLA_IDENTITY_BLOCK =
  'site.identity: THIS site\'s name, its description and whether page titles carry the name — one value for every page (Joomla\'s global configuration). Use when the customer renames the site, or the name every page shows in the browser tab or the header. Not for a heading of one page (content.replace). Call {operation:"read"} · {operation:"set", fields:{sitename?, MetaDesc?, sitename_pagetitles?:0|1|2}}. Returns {fields, changed}: the receipt; normalized names its apply_id. Effects: live on every page at once; apply.revert {apply_id} undoes it. Refusals: unsupported → only those three fields.'

/** Open Joomla: what the site RUNS. Its one r2 refusal class: `db.dump` of a table named without its prefix. */
const JOOMLA_OPS_BLOCK =
  'db.snapshot · db.rollback · db.tables · db.dump · core.manifest · extension.install · extension.enable · core.upgrade: what THIS site RUNS. Use when installing or upgrading. Not for content or reading it: content.get/list, never db.dump. Call db.snapshot {tables?} FIRST · db.rollback {tag} · db.dump {table, limit?, cursor?} · extension.install {url:"https://….zip"} (the site downloads it; no uninstall) · extension.enable {type, element, folder?, enabled, apply_id} · core.upgrade {to:"4.4"|"5.4"|"6.1", step:"prepare"|"finalise"}: ONE hop, two separate calls. Returns {tag} from db.snapshot. Effects: live at once; db.rollback {tag} undoes. Refusals: dump_failed → db.tables for the real name.'

/** Open WordPress: what the site RUNS. Shapes from the component's readers (`Engine.php:610-760`). */
const WORDPRESS_OPS_BLOCK =
  'theme.install · theme.activate · theme.style · plugin.install · plugin.activate · db.tables · db.dump · core.manifest: what THIS site RUNS. Use when installing a theme or plugin. Not for content or reading it (content.get/list). Call db.dump {table, limit?, cursor?} · theme.install | plugin.install {url:"https://….zip"} · theme.activate {stylesheet} · theme.style {style} · plugin.activate {file:"<dir>/<file>.php"}; install, then activate: two calls. Returns the receipt. Effects: live at once. Refusals: dump_failed → db.tables for the real name.'

/**
 * T7′ in the action form (D21: Lee has not added `tracy_site_replace` to `DOOR_TOOLS`), one block per
 * surface where `REPLACE_PLATFORMS` has the job, SENT FIRST among the actions: the replace road is the
 * shortest one a words edit has, and the site context offers it first too. What it is not for names
 * THIS surface's own door, so the model is never sent to an action its list does not carry.
 *
 * 🔒 THE UNDO IS THE ANSWER'S, NOT A SHAPE TO REBUILD: `apply.revert` on Joomla and WordPress, the
 * same action with `restore` on EmDash (D14) — `undoOf` writes it into every receipt.
 * @param {Surface} surface
 */
export function replaceBlock(surface) {
  const instead =
    surface === 'emdash'
      ? 'tracy_emdash'
      : surface === 'joomla-sealed'
        ? 'content.contract'
        : 'content.update'
  const writes =
    surface === 'emdash'
      ? 'the field showing the words, published'
      : surface === 'joomla-sealed'
        ? 'the slot showing the words'
        : 'the record showing the words'
  // WordPress: words and links a theme prints at render time go down the plugin's rendered-words road
  // (`rendered-words.mjs`) on their own; only a link target needs the agent to say so, and it is the
  // one link this call takes.
  const notFor = String(surface).startsWith('wordpress')
    ? `Not for pictures, sections or links (${instead}) but links the theme prints: changes:[{find:old href,replace,href:true}]. `
    : `Not for pictures, links or sections (${instead}). `
  return (
    `content.replace: changes words already on THIS site in one call. Use when the customer quotes old words or names a place, and gives new ones. ${notFor}` +
    'Call {find, replace, path?:"/", where?:topbar|header|main|footer|title, all?:true only for "everywhere" or a phone/e-mail/address, at?:[…], expect?:n, changes?:[{find,replace}], dryRun?}. ' +
    'Returns {changed:[{at, where, before, after}], undo}: the receipt; read nothing before or after. ' +
    `Effects: writes ${writes}; dryRun (needs replace) writes nothing; undo: the answer's, as given. ` +
    'All but X: dryRun {find, replace, all:true} lists each place (at, count); then at:[the wanted]. stillHolds: lines left that open like the changed ones. ' +
    'Refusals: AMBIGUOUS → at:[…]; NOT_FOUND → page.text {match}, quote exactly; NOT_EDITABLE → tell the customer why.'
  )
}

/**
 * `page.create` (05/10/2026, `page-create.mjs`), one block on every surface that has it, sent right
 * after the replace job's: the other one-call road for what a customer most often asks. Measured on
 * the D bench before it: "an FAQ page with three questions, in the top menu after Services" took 22–26
 * calls on WordPress, Joomla and EmDash — the describe's recipe, then theme patterns, SCSS and template
 * files — before two to four writes. `menu.name` is left to the refusal that lists the menus: the call
 * the customer's words give names the item the page follows.
 */
export const PAGE_CREATE_BLOCK =
  'page.create: a new page and its menu link in one call, in the theme\'s own markup. Use when the customer asks for a new page. Not for an existing one (content.replace). Call {title, body:[{title?, text}, …] in their order, menu?:{after:"<the item it follows>"}, locale?}. Returns {page:{path}, menu, verified, undo}: the receipt; read nothing back. Effects: live at once. Refusals: NOT_FOUND or AMBIGUOUS list the menus to name.'

/** The answers every Joomla and WordPress surface shares. */
const tailOf = (/** @type {boolean} */ sealed) =>
  "A refusal's next is the fix; a toolset it names is the role the customer needs." +
  (sealed ? '' : ' Content written here is in the site database, not a file commit.')

/** The EmDash lead: where the content door is, and the page tools, from the surface's own list. */
const emdashLeadOf = (/** @type {readonly string[]} */ actions) =>
  `tracy_site: THIS EmDash site's page tools (${actions.filter((a) => !NOT_IN_LEAD.has(a)).join(', ')}) as {action, params}; words, pictures, menus, settings: tracy_emdash. ${NORMALIZED_FACT}`

/**
 * @typedef {object} SurfaceOptions
 * @property {boolean} [wordpressReadBack] - plan v2 D6′ (c): the build's `tracy_site` does NOT check
 *   a WordPress post or templatePart body after writing it, so the agent reads it once. The SAME
 *   value as `siteContext`'s option of that name; false (the default) when the door checks itself.
 */

/**
 * The description's blocks for one surface, in the order they are sent. Exported so the test can
 * hold every block to the template; `siteToolDescription` joins them.
 * @param {Surface} surface
 * @param {SurfaceOptions} [options]
 * @returns {{ kind: 'lead' | 'action' | 'tail', text: string }[]}
 */
export function siteToolBlocks(surface, options = {}) {
  const actions = Object.hasOwn(SURFACE_ACTIONS, surface) ? SURFACE_ACTIONS[surface] : undefined
  if (actions === undefined) throw new Error(`no tracy_site surface "${String(surface)}"`)
  const block = (/** @type {'lead' | 'action' | 'tail'} */ kind, /** @type {string} */ text) => ({
    kind,
    text
  })
  const replace = [
    ...(actions.includes('content.replace') ? [block('action', replaceBlock(surface))] : []),
    ...(actions.includes('page.create') ? [block('action', PAGE_CREATE_BLOCK)] : [])
  ]
  if (surface === 'emdash')
    return [
      block('lead', emdashLeadOf(actions)),
      ...replace,
      block('action', EMDASH_CONTENT_READ_BLOCK),
      block('action', PAGE_TEXT_BLOCK),
      block('action', picturesBlock('emdash')),
      block('tiers', tiersSentenceFor(actions))
    ]
  const wordpress = surface.startsWith('wordpress')
  const contract = contractSurface(surface)
  // An imported copy's derived slots (01/10/2026): every block of the open surface, byte for byte, plus
  // the slot bridge on the map's block and the derived door after the pictures — never a quickstart's
  // wording, which promises named slots, identity and editions a derived map does not have.
  const derived = derivedSurface(surface)
  return [
    block('lead', leadOf(!contract)),
    ...replace,
    block(
      'action',
      wordpress ? (contract ? WORDPRESS_CONTRACT_READ_BLOCK : WORDPRESS_READ_BLOCK) : JOOMLA_READ_BLOCK
    ),
    ...(actions.includes('content.read')
      ? [block('action', contract || derived ? CONTRACT_CONTENT_READ_BLOCK : CONTENT_READ_BLOCK)]
      : []),
    ...(actions.includes('content.find') ? [block('action', FIND_BLOCK)] : []),
    block('action', PAGE_TEXT_BLOCK),
    block('action', picturesBlock(contract ? (wordpress ? 'wordpress-slot' : 'joomla-slot') : 'open')),
    // The contract first on a quickstart site: the quickest road for its words, and the one that
    // keeps the design. The open writes follow, for everything else.
    ...(contract ? [block('action', wordpress ? WORDPRESS_CONTRACT_BLOCK : CONTRACT_BLOCK)] : []),
    ...(derived ? [block('action', DERIVED_CONTRACT_BLOCK)] : []),
    ...(wordpress
      ? [
          block(
            'action',
            wordpressWriteBlock(options.wordpressReadBack === true, actions.includes('content.replace'))
          ),
          block('action', WORDPRESS_MORE_BLOCK)
        ]
      : [
          block('action', joomlaWriteBlock(actions.includes('content.replace'))),
          ...(actions.includes('site.identity') ? [block('action', JOOMLA_IDENTITY_BLOCK)] : []),
          block('action', JOOMLA_RECEIPTS_BLOCK)
        ]),
    block('action', wordpress ? WORDPRESS_OPS_BLOCK : JOOMLA_OPS_BLOCK),
    // Which of these doors ask the customer first (`tiers.mjs`), named per surface. A derived contract
    // has no language operations, so its tiers line names no retire pass.
    block('tiers', tiersSentenceFor(actions, { multilingual: !derived })),
    block('tail', tailOf(false))
  ]
}

/**
 * The `tracy_site` description for one kind of site.
 * @param {Surface} surface
 * @param {SurfaceOptions} [options]
 * @returns {string}
 */
export function siteToolDescription(surface, options = {}) {
  return siteToolBlocks(surface, options)
    .map((b) => b.text)
    .join('\n')
}

/**
 * The `tracy_site` parameters for one kind of site: `action` becomes an enum of what that site is told
 * about, and `siteKey` is gone — on a host dsh the conversation's site is the only one a call reaches,
 * and naming another only earns `SITE_OUTSIDE_CONVERSATION`.
 *
 * ⚠ THE ENUM STEERS, IT DOES NOT REJECT. `tracy_site` is registered raw, and dsh validates arguments
 * only for `defineTool` tools, so an action outside the enum still reaches `execute` — where
 * `planCall` answers `BAD_ACTION` with this surface's list. No `params` schema per action: a closed
 * `oneOf` over every action measured ≈ +1,378 tokens per step, and without strict decoding it only
 * turns corrections into refusals.
 * @param {Surface} surface
 * @returns {Record<string, unknown>}
 */
export function siteToolParameters(surface) {
  const actions = Object.hasOwn(SURFACE_ACTIONS, surface) ? SURFACE_ACTIONS[surface] : undefined
  if (actions === undefined) throw new Error(`no tracy_site surface "${String(surface)}"`)
  return {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [...actions],
        description: 'An action the description gives the rules of.'
      },
      params: {
        type: 'object',
        description: "That action's parameters, as its line shows them.",
        additionalProperties: true
      },
      comment: structuredClone(COMMENT_PARAMETER)
    },
    required: ['action']
  }
}

/** Every action a surface may name is one `planCall` accepts — exported for the test. Never an
 * engine-only one (`ENGINE_ONLY_ACTIONS`): the full description must not offer it either. */
export const KNOWN_ACTIONS = Object.freeze(
  [...LOCAL_ACTIONS, ...RELAY_ACTIONS].filter((x) => !ENGINE_ONLY_ACTIONS.includes(x))
)

/**
 * The full, platform-neutral description — for a conversation this file cannot fit (a single-site
 * lane, a platform or seal it cannot read). Moved here from `index.ts` `descriptionFor()` so a test
 * can hold it, with the corrections the per-surface texts carry:
 * - an option is READ with `content.get {kind:"option", key}` (below);
 * - `templatePart` and `term` are kinds, and `content.get` takes `id | key`;
 * - a contract apply's ids are Tracy's (T6), and the language sentence is `CONTRACT_LANGUAGE_RULE`
 *   (T11) instead of "words reach them through the language job", which the component does not do.
 * It keeps its size: it is sent only where nothing narrower can be said truthfully.
 * @returns {string}
 */
export function fullSiteToolDescription() {
  return (
    'The one door to THIS site: read and change its content through the seat book, as the person you are ' +
    'working with — their seat decides what is allowed, and every call is recorded. ' +
    `action ∈ {${KNOWN_ACTIONS.join(', ')}}; params are that action's own parameters.\n` +
    'READ (any accepted seat): info → CMS/PHP/component versions · content.list {kind, search, offset, limit≤200, include_body} → one page of records; ' +
    `search:"<part of the title>" keeps the rows whose title, alias or slug holds it (Joomla ${LIST_SEARCH_SINCE.joomla}+, WordPress ${LIST_SEARCH_SINCE.wordpress}+; ${LIST_SEARCH_OLDER}). ` +
    // 🔒 NAME EVERY KIND THIS DOOR ROUTES. Six names and an ellipsis was the whole list until
    // 16/09, and the two the language job needed — `language`, `extensionParams` — were inside
    // the ellipsis. An unnamed capability reads as an absent one, and the fallback for an absent
    // capability is the database: that turn spent fifteen calls tracing Joomla's own source to a
    // change the door could make all along, and said so itself when it finally found out. This
    // list is what tracy-web routes (`sites/route.js` KIND_TOOLSET, which since 27/09/2026 names the
    // WordPress `templatePart` as code and `term` as content, like their Joomla counterparts); a kind
    // the component does not carry is refused by NAME, which is an answer, where an ellipsis was a
    // locked door.
    'kind ∈ {article, articleAssociation, category, tag, field, fieldValue, menuItem, menuAssociation, menutype, module, moduleAssignment, templateStyle, language, languageFilter, redirect, banner, bannerClient, contact, newsfeed, user, extensionParams, post, postmeta, option, templatePart, term} · ' +
    'content.get {kind, id | key} → one full record · ' +
    // PR2 review (25/09): the action list named content.replace and nothing said what it takes.
    'content.replace {find, replace, path?, where?, all?, changes?, dryRun?} → changes words already on this site in one call, where the site has it; its answer is the receipt with its undo · ' +
    // #347 (content api): the read door of a Claude Cowork plugin that serves tracy-content/v1.
    'content.read {type?, locale?, limit?, cursor?} → authenticated tracy-content/v1 live summaries; {id, blocksCursor?} reads detail; {id, blockId, blocksCursor?} reads one block. Available only when the Claude Cowork plugin supports it. Follow links.next, keep filters unchanged, restart on CONTENT_SNAPSHOT_EXPIRED. A 413 on bodyHtml carries error.links.firstBlock: pass its id/blockId/blocksCursor query to read the page block by block. Partial/unresolved data is explicit; reading a field does not authorize writing it. Use fresh native inspect for writes. · ' +
    // 🔒 A RECORD WHOSE IDENTITY IS A NAME IS ADDRESSED BY `key`. Measured 19/09/2026 on
    // `demowpnam`, three consecutive calls to make ONE change: `{kind:"option", id:"blogname",
    // fields:{option_value:…}}` refused, then `{key:"blogname", fields:{option_value:…}}` refused,
    // then `{key:"blogname", fields:{value:…}}` accepted. The agent was guessing, because the shape
    // said `{kind, id, fields}` and the word `key` appeared nowhere in this description.
    //
    // ⚠ UNTIL 24/09 THIS SAID THE DOOR COULD NOT READ AN OPTION BACK. The component has served it
    // since 19/09 — measured r2 on `wp-dmlj6g`: `content.get {kind:"option", key}` answered 4 of 4,
    // `content.list {kind:"option"}` was refused 7 of 7. A description that forbids a working read
    // sends the agent to the page instead — and, before the read existed, it wrote
    // `show_comments_cookies_opt_in = 1` and back to `0` on a live site only to learn the old value.
    'An option is addressed by NAME: content.get {kind:"option", key:"<option_name>"} reads it and content.update {kind:"option", key, fields:{value:"…"}} writes it; on WordPress content.list lists posts only. Never write an option in order to discover what it was. · ' +
    'extension.list (Joomla) · plugin.list, theme.list (WordPress) · db.tables · core.manifest · ' +
    'media.scan {limit≤100} → the largest images in the webroot with width/height and public URL (runs in the lane, not via the site) · ' +
    // The picture road a sealed site otherwise lacks: it takes only a path already in its library.
    'media.draw {prompt, slot? | like? | aspect?} → {path, width, height, next}: DRAWS a new picture from your prompt with the picture model /ops assigned and uploads it to the media library as the person you work with. For a contract image slot pass `slot:"module-441.8"` (WordPress: `home.hero.img`) and the tool takes that slot\'s shape itself, so no like or aspect; otherwise `like` (a picture on the site) or aspect "16/10" — one of the two. The prompt is sent as you write it — describe what the customer asked for, including any words that must appear in the picture. Then put the returned path where it belongs (content.contract apply on a sealed quickstart). One call per picture · ' +
    "content.find {text} → {matches:[{layer, door, file, line, key?, value?}], notSearched}: which FILE-backed layer holds a string the customer can see, and which door changes it — the shipped phrases, the overrides already in place, the template overrides. It searches files only; articles, menu items, posts and every record's params are in the database, so reach for content.list for those. Use it instead of grepping the webroot (runs in the lane, not via the site).\n" +
    PAGE_TEXT_BLOCK +
    ' ' +
    'page.look {path="/"} → {file, url, description?}: a screenshot of that page of this site, for when the request is about how it LOOKS. Read the answer before acting: ' +
    "when this session's model accepts no images, an image-capable model describes the picture and next says to read `description` " +
    'instead of calling read_image on the file; when it does accept them, the picture itself comes back attached to the answer, so no read_image step is needed. Either way the file stays to cite (runs in the lane, not via the site).\n' +
    // Conditional in WORDS because this description is built once per registration while the fact
    // is per site folder. `siteContext` states the contract line only for a contracted site; this
    // said `first` to every Joomla session, so an uncontracted one opened with a call that can
    // only be refused — and a refusal at call one is the worst place for the agent to learn the
    // door works.
    // A WordPress site provision bound has the same door since #337; the fallback is what such a site
    // gets when its marker could not say which road it has, so it names both platforms.
    'SEALED QUICKSTART (Joomla, or WordPress bound to its contract), only when the site context above says this site has a content contract: call content.contract {operation:"inspect"} first. A bound site accepts only mapped scalar content. ' +
    // Business answers 2.1 MB unfiltered; `narrowInspect` indexes it and these filters cut it. It
    // also lists the Site identity block on every narrowed words inspect (no page is assigned it),
    // so "only those" would be a claim the answer contradicts.
    'A large contract answers an index instead of every slot — narrow it: content.contract {operation:"inspect", slots:"image"|"text"|"url", page:"<route>", entity:"module-444", match:"<words>"} returns only those source slots (key, label, current, and for a picture its demo `sample`); one for words also lists the Site identity block every page shares. ' +
    CONTRACT_LANGUAGE_RULE +
    ' ' +
    // Lee, 23/09/2026: evidence slots take inventions, declared as such.
    'A slot marked requiresEvidence takes, in the same apply, evidence:{"<key>": "<the customer\'s own words>"} — or, for a value you invented to fit the customer, evidence:{"<key>": "Invented by Tracy to fit the customer; not from the brief. Replace it with the real one."}; then tell the customer which slots hold inventions. ' +
    'Use content.contract {operation:"apply", expected_revision, changes:{"slot.key":"value"}, evidence:{}}. ' +
    // 🔒 T6 REPLACES THE ID-MAKING SENTENCES. Measured 23/09 on `j-1ibzqi`: told only that the id
    // must start "contract-" and that request_id was "any string", the model chose
    // `h1-toyota-hanoi-motors` and moved ids around for fourteen calls. Tracy mints both now.
    CONTRACT_IDS_RULE +
    ' Keep original modules, menus, access and presentation; collect missing facts/images from the customer. Undo the latest contract receipt first. ' +
    'Prepare mappings under docs/agents; shell, terminal and direct webroot access are disabled for protected quickstarts.\n' +
    'WRITE (role-gated; a refusal names the missing toolset and its next says what to tell the person; a Viewer is never sent to the CMS admin): ' +
    WRITE_VERBS +
    // 27/09/2026: the host reads the customer's file (`upload.mjs`); the model never types its bytes.
    // 29/09/2026: or the picture they sent in this chat, read back from dsh's attachment store.
    "media.upload {file | attachment, alt?} → a picture the customer put in the Files tab (file: its name there, in this site's folder) or sent in this chat (attachment: its name or sha256 id); PNG, JPEG or WebP, ≤8 MiB; goes into the media library; answers where it landed and its next · " +
    // One rule per door, said where the doors differ: WordPress content writes and contract applies
    // get their apply_id from Tracy (WP-27, D9); a Joomla content write groups its undo log by the one the
    // agent names, or the one Tracy makes for that write (J-6).
    `apply.revert {apply_id} undoes one apply_id to the byte. apply.list {apply_id?} says what an apply changed — ${APPLY_LIST_RULE}. apply_id names the receipt: optional on a content write (left out, Tracy makes one per write, so apply.revert undoes that write alone; undo a whole request newest-first) and made by Tracy for a contract apply.\n` +
    'OPERATIONAL (role-gated the same way; these change what the site RUNS, so take a snapshot first): ' +
    'db.snapshot {tables?} → {tag} copies every table aside · db.rollback {tag} renames them back, parking what it displaces in the trash · ' +
    'db.dump {table, …} · ' +
    'extension.install {url} installs from an https .zip the SITE downloads itself (no local path, no uninstall) · ' +
    'extension.enable {type, element, folder?, enabled, apply_id} switches one extension on or off; core rows and this component are refused · ' +
    'core.upgrade {to:"4.4"|"5.4"|"6.1", step:"prepare"|"finalise"} is ONE hop, and the two steps are two separate calls: prepare replaces the code on disk, finalise has to run on the code the next call loads. Snapshot before prepare — a rollback after finalise needs it.\n' +
    // The `normalized` fact is said once, inside T6 (`CONTRACT_IDS_RULE`) above: the same sentence
    // twice in one description is a rule the model reads as two.
    'Answers come back as the seat book and the component return them: {ok:true, …} or {ok:false, code|error, …}; a refusal that carries next says what to do instead.' +
    ' COMPONENT_NOT_REGISTERED means this site is not connected yet; NO_VIEWER means nobody has this site open in a browser. ' +
    'Content written here is stored in the site database and is not a file commit; file changes still go through the webroot.'
  )
}
