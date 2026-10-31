/**
 * The per-site tool surface, pinned without a server: which tools a conversation on one site is
 * sent, which `tracy_site` actions it is told about, and what each description says — held to the
 * component it describes, to the one-template rule, to its budget, and to the cache rule that a
 * description never carries a site's own values.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CONTRACT_LANGUAGE_RULE,
  planCall,
  WORDPRESS_CONTRACT_LANGUAGE_RULE,
  WRITE_VERBS
} from '../src/host/site.mjs'
import { REPLACE_PLATFORMS, replaceKey } from '../src/host/site-context.mjs'
import {
  APPLY_LIST_RULE,
  CONTENT_READ_BLOCK,
  CONTRACT_BLOCK,
  CONTRACT_CONTENT_READ_BLOCK,
  CONTRACT_IDS_RULE,
  DERIVED_CONTRACT_BLOCK,
  EMDASH_CONTENT_READ_BLOCK,
  fullSiteToolDescription,
  JOOMLA_IDENTITY_BLOCK,
  KNOWN_ACTIONS,
  NORMALIZED_FACT,
  PAGE_CREATE_BLOCK,
  PAGE_TEXT_BLOCK,
  platformHiddenTools,
  SURFACE_ACTIONS,
  siteToolBlocks,
  siteToolDescription,
  siteToolParameters,
  surfaceOf,
  CONTEXT_TOLD_ACTIONS,
  WORDPRESS_CONTRACT_BLOCK
} from '../src/host/surface.mjs'
import { LIST_SEARCH_SINCE } from '../src/host/list-search.mjs'
import { tiersSentenceFor } from '../src/host/tiers.mjs'

/** `packages/` of this repo. */
const PACKAGES = fileURLToPath(new URL('../../../', import.meta.url))
/** The repo root. */
const REPO = join(PACKAGES, '..')
// `wordpress-contract` since the merge with #337: a WordPress site provision bound to its contract.
const SURFACES = /** @type {const} */ ([
  'joomla-sealed',
  'joomla',
  'wordpress-contract',
  'wordpress-sealed',
  'wordpress',
  'emdash',
  // An imported copy with a derived contract (01/10/2026): its open surface, the derived door on top.
  'joomla-derived',
  'wordpress-derived'
])

/** The two surfaces of a quickstart with a contract: a picture goes into a slot there. */
const slotSurface = (/** @type {string} */ s) => s === 'joomla-sealed' || s === 'wordpress-contract'

const escape = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The actions of `actions` that `text` names as whole tokens (`content.get` is not `content.get_x`). */
const named = (/** @type {string} */ text, /** @type {readonly string[]} */ actions) =>
  actions.filter((a) => new RegExp(`(?<![\\w.])${escape(a)}(?![\\w])`).test(text))

// The 27 tools a designer conversation was sent on EVERY site in the ja-business suite (r2, 24/09/2026).
const DESIGNER = [
  'ask_user_question',
  'bash',
  'edit',
  'exit_plan_mode',
  'glob',
  'grep',
  'job_kill',
  'job_list',
  'job_output',
  'read',
  'read_image',
  'skill',
  'todo_write',
  'tracy_brand',
  'tracy_design_copy',
  'tracy_design_library',
  'tracy_design_propose',
  'tracy_emdash',
  'tracy_find_definition',
  'tracy_site',
  'tracy_site_build_emdash',
  'tracy_site_build_joomla',
  'tracy_site_build_wordpress',
  'tracy_site_profile',
  'web_fetch',
  'web_search',
  'write'
]

test('a site is sent only the tools that act on its own platform', () => {
  // `tracy_find_definition` knows WordPress definitions only (register_post_type, add_shortcode, …): on
  // Joomla every search answered a confident "no matches", so the tool is not sent there at all.
  assert.deepEqual(platformHiddenTools(DESIGNER, 'joomla'), [
    'tracy_emdash',
    'tracy_find_definition',
    'tracy_site_build_emdash',
    'tracy_site_build_wordpress'
  ])
  assert.deepEqual(platformHiddenTools(DESIGNER, 'wordpress'), [
    'tracy_emdash',
    'tracy_site_build_emdash',
    'tracy_site_build_joomla'
  ])
  assert.deepEqual(platformHiddenTools(DESIGNER, 'emdash'), [
    'tracy_find_definition',
    'tracy_site_build_joomla',
    'tracy_site_build_wordpress',
    'tracy_site_profile'
  ])
})

test('an unread platform hides nothing, and nothing is named that the agent cannot see', () => {
  assert.deepEqual(platformHiddenTools(DESIGNER, 'unknown'), [])
  assert.deepEqual(platformHiddenTools(DESIGNER, 'shopify'), [])
  assert.deepEqual(platformHiddenTools(DESIGNER, ''), [])
  // dsh's restrict() throws on a name the agent does not inherit, so the answer is always a subset.
  assert.deepEqual(platformHiddenTools(['read', 'tracy_site'], 'emdash'), [])
  // A model- or plugin-supplied name like `constructor` is not a table row.
  assert.deepEqual(platformHiddenTools(['constructor', 'toString', '__proto__'], 'joomla'), [])
})

test('which description a site gets', () => {
  assert.equal(surfaceOf({ platform: 'joomla', sealed: true }), 'joomla-sealed')
  assert.equal(surfaceOf({ platform: 'joomla', sealed: false }), 'joomla')
  assert.equal(surfaceOf({ platform: 'wordpress', sealed: true }), 'wordpress-sealed')
  assert.equal(surfaceOf({ platform: 'wordpress', sealed: false }), 'wordpress')
  // #337: a sealed WordPress site provision bound gets the contract road; one whose release pinned no
  // Claude Cowork plugin keeps the record road; a marker that could not say keeps the full description, since each
  // road's surface refuses the other's write before the relay.
  assert.equal(surfaceOf({ platform: 'wordpress', sealed: true, contractDoor: true }), 'wordpress-contract')
  assert.equal(surfaceOf({ platform: 'wordpress', sealed: true, contractDoor: false }), 'wordpress-sealed')
  assert.equal(surfaceOf({ platform: 'wordpress', sealed: true, contractDoor: null }), null)
  // The door is a fact of the seal: an open site, and Joomla, are not changed by it.
  assert.equal(surfaceOf({ platform: 'wordpress', sealed: false, contractDoor: true }), 'wordpress')
  assert.equal(surfaceOf({ platform: 'joomla', sealed: true, contractDoor: null }), 'joomla-sealed')
  assert.equal(surfaceOf({ platform: 'emdash', sealed: null }), 'emdash')
  // 01/10/2026: an imported copy whose plugin derived a contract keeps its open surface and adds the
  // derived door; a sealed site never reads the flag, and an EmDash or unread site is not changed by it.
  assert.equal(surfaceOf({ platform: 'joomla', sealed: false, derived: true }), 'joomla-derived')
  assert.equal(surfaceOf({ platform: 'wordpress', sealed: false, derived: true }), 'wordpress-derived')
  assert.equal(surfaceOf({ platform: 'joomla', sealed: false, derived: false }), 'joomla')
  assert.equal(surfaceOf({ platform: 'wordpress', sealed: false }), 'wordpress')
  assert.equal(surfaceOf({ platform: 'joomla', sealed: true, derived: true }), 'joomla-sealed')
  assert.equal(
    surfaceOf({ platform: 'wordpress', sealed: true, contractDoor: true, derived: true }),
    'wordpress-contract'
  )
  assert.equal(surfaceOf({ platform: 'emdash', sealed: false, derived: true }), 'emdash')
  assert.equal(surfaceOf({ platform: 'joomla', sealed: null, derived: true }), null)
  assert.equal(surfaceOf({ platform: 'emdash', sealed: true }), 'emdash')
  // An unreadable seal keeps the full description rather than guessing which half is true.
  assert.equal(surfaceOf({ platform: 'joomla', sealed: null }), null)
  assert.equal(surfaceOf({ platform: 'wordpress', sealed: undefined }), null)
  assert.equal(surfaceOf({ platform: 'unknown', sealed: false }), null)
  assert.throws(() => siteToolDescription(/** @type {any} */ ('shopify')), /no tracy_site surface/)
  assert.throws(() => siteToolParameters(/** @type {any} */ ('constructor')), /no tracy_site surface/)
})

test('every action a surface names is one planCall accepts', () => {
  assert.deepEqual(Object.keys(SURFACE_ACTIONS), [...SURFACES])
  for (const [surface, actions] of Object.entries(SURFACE_ACTIONS)) {
    assert.deepEqual(
      actions.filter((a) => !KNOWN_ACTIONS.includes(a)),
      [],
      surface
    )
    assert.equal(new Set(actions).size, actions.length, `${surface} lists an action twice`)
    assert.ok(Object.isFrozen(actions), surface)
  }
})

test('the replace job joins a surface only through the gate the site context reads', () => {
  for (const surface of SURFACES) {
    const platform =
      surface === 'emdash' ? 'emdash' : surface.startsWith('wordpress') ? 'wordpress' : 'joomla'
    const live = REPLACE_PLATFORMS.has(
      replaceKey(platform, surface === 'joomla-sealed' || surface === 'wordpress-contract')
    )
    assert.equal(SURFACE_ACTIONS[surface].includes('content.replace'), live, surface)
  }
})

test('🔒 a description names its own actions and no other', () => {
  for (const [surface, actions] of Object.entries(SURFACE_ACTIONS)) {
    for (const readBack of [false, true]) {
      const d = siteToolDescription(/** @type {any} */ (surface), { wordpressReadBack: readBack })
      assert.deepEqual(
        named(
          d,
          KNOWN_ACTIONS.filter((a) => !actions.includes(a))
        ),
        [],
        `${surface} names a foreign action`
      )
      // Turn-only actions (`content.locate`) are told by the turn that needs them, never here; look.set
      // by the LOOK line of the rules, which only a mode that may change looks reads (PR #926).
      const described = actions.filter((a) => !CONTEXT_TOLD_ACTIONS.includes(a))
      assert.deepEqual(
        named(d, described).sort(),
        [...described].sort(),
        `${surface} leaves one of its own out`
      )
    }
  }
})

// 🔒 MEASURED, r2 24/09/2026: 57 WordPress calls asked for content.contract or content.batch (the
// component had neither) — 50 of them ordered by a context and a description that told every site about
// the contract; 26 asked content.find on a sealed site; 3 asked sealed Joomla for content.update
// (`LEGACY_STRUCTURE_CODE`). Since #337 a WordPress site provision BOUND has the contract (its own test below);
// the two WordPress surfaces without a binding are still never told about it.
test('🔒 unbound WordPress is never told about a contract, and a quickstart site has the open surface', () => {
  for (const s of /** @type {const} */ (['wordpress', 'wordpress-sealed'])) {
    const d = siteToolDescription(s)
    assert.doesNotMatch(d, /content\.contract|content\.batch|contract-/, s)
    assert.ok(!SURFACE_ACTIONS[s].includes('content.contract'), s)
  }
  // Tracy ADR 0022 (26/09/2026): a quickstart surface is its platform's open surface, the contract on top.
  const open = {
    'joomla-sealed': 'joomla',
    'wordpress-contract': 'wordpress',
    'wordpress-sealed': 'wordpress',
    'joomla-derived': 'joomla',
    'wordpress-derived': 'wordpress'
  }
  for (const [s, base] of Object.entries(open)) {
    // The replace job goes through the contract where there is one (`withReplace`): not an open action.
    const extra = SURFACE_ACTIONS[s].filter(
      (a) => !SURFACE_ACTIONS[base].includes(a) && a !== 'content.replace'
    )
    const missing = SURFACE_ACTIONS[base].filter(
      (a) => !SURFACE_ACTIONS[s].includes(a) && a !== 'content.replace'
    )
    assert.deepEqual(missing, [], `${s} leaves out what ${base} offers`)
    assert.deepEqual(extra, s === 'wordpress-sealed' ? [] : ['content.contract'], s)
  }
  // Open Joomla takes content.batch at the component, but no surface offers it (see SURFACE_ACTIONS).
  for (const s of SURFACES) assert.ok(!SURFACE_ACTIONS[s].includes('content.batch'), s)
  // page.look everywhere (it answers NO_BROWSER honestly where there is no browser).
  for (const s of SURFACES) assert.ok(SURFACE_ACTIONS[s].includes('page.look'), s)
})

/**
 * 🔒 A BOUND WORDPRESS SITE (#337) IS TOLD THE CONTRACT, AND NOTHING ITS CLAUDE COWORK PLUGIN REFUSES. The Claude Cowork plugin
 * 0.12+ answers `LEGACY_STRUCTURE_CODE` to content.update, content.delete, content.language, language.install,
 * plugin.* and theme.* on a bound site (claude-cowork `wordpress/cowork/lib/Engine.php`
 * structural-write block list) and keeps its reads; its contract has no picture slot, and it takes an upload
 * only at `wp-content/uploads/tracy-content/<sha256>.*` — where `media.draw` would name its file
 * `images/tracy-content/…`. So its list is sealed Joomla's with WordPress's reads, and no picture road.
 */
// 25/09: #341 set the surfaces without `content.read`, so the Content API door (#347) was refused
// before the relay (NOT_ON_THIS_PLATFORM) on every site. It is a read of every Joomla and WordPress
// Claude Cowork plugin; a Claude Cowork plugin without it answers CONTENT_ADAPTER_UNSUPPORTED, which is an answer.
// 25/09: EmDash too — the relay serves it there through the site's own reader (#352). Each
// surface gets the block that bridges the map to ITS write door: the contract's slot, EmDash's entry.
test("🔒 content.read is on every surface, described once, bridged to that surface's write door", () => {
  const blockOf = {
    'joomla-sealed': CONTRACT_CONTENT_READ_BLOCK,
    joomla: CONTENT_READ_BLOCK,
    'wordpress-contract': CONTRACT_CONTENT_READ_BLOCK,
    'wordpress-sealed': CONTENT_READ_BLOCK,
    wordpress: CONTENT_READ_BLOCK,
    emdash: EMDASH_CONTENT_READ_BLOCK,
    // The derived slots carry a slotKey too, so the map's block is the bridge to the same apply.
    'joomla-derived': CONTRACT_CONTENT_READ_BLOCK,
    'wordpress-derived': CONTRACT_CONTENT_READ_BLOCK
  }
  for (const s of SURFACES) {
    const actions = SURFACE_ACTIONS[s]
    assert.ok(actions.includes('content.read'), s)
    assert.equal(planCall({ action: 'content.read', params: { limit: 1 } }, { actions }).ok, true, s)
    const d = siteToolDescription(s)
    assert.equal(d.split(blockOf[s]).length - 1, 1, s)
    // …and no other surface's variant rides along.
    for (const other of new Set(Object.values(blockOf)))
      if (other !== blockOf[s]) assert.ok(!d.includes(other), `${s}: another content.read block`)
  }
})

/**
 * 🔒 COMMENT → EDIT (27/09/2026, plan P5): every surface offers content.locate — the EmDash one too,
 * where the relay serves it through the site's reader — and NO description names it. The turn that
 * carries a pick says the road itself (`tracy-chat-input` `comment-turn.mjs` `LOCATE_HINT`); a clause
 * in the map's block cost +150 characters on every step of every conversation, and its "first" put a
 * locate before content.replace, the one-call road for words.
 */
test('🔒 content.locate is on every surface and accepted before the relay, yet no description names it', () => {
  for (const s of SURFACES) {
    const actions = SURFACE_ACTIONS[s]
    assert.ok(actions.includes('content.locate'), s)
    const planned = planCall(
      { action: 'content.locate', params: { url: 'https://x.test/', text: 'Services' } },
      { actions }
    )
    assert.equal(planned.ok, true, s)
    assert.doesNotMatch(siteToolDescription(s), /content\.locate|mentioned-element/, s)
  }
})

/**
 * 🔒 DESCRIBE FIRST (Content API v2, 26/09/2026) — AND, SINCE 30/09/2026, THE NAMED PAGE FIRST ON JOOMLA AND
 * WORDPRESS. The types, block kinds, field constraints, what the seat may edit and the CMS's own guidance
 * come with `{describe:true}`'s answer, not in this description (just-in-time), and a call that skips it is
 * sent there by the answer's own `next` (site-call.mjs). But "Call {describe:true} once, then …" made the
 * describe — 15–35k characters — the first read of every request: in the round-7 add-by-chat runs on
 * WordPress and Joomla the ones that read it first took 11.3 steps against 6.9 for the ones that did not. A
 * page the customer names is found by its address (`view=pages`, Content API v2), and that answer is where
 * the page's lists and the call that adds to it are read (`page-lists.mjs`); the describe stays the answer
 * for what the map cannot say: the types, the block kinds, where SEO, menus and forms live. EmDash keeps
 * the describe-first wording: its add road is `tracy_emdash` and measured 4–5 steps.
 */
test('🔒 the Joomla and WordPress content.read blocks send a named page to {view:"pages", url} first; the describe is for what the map cannot say', () => {
  for (const block of [CONTENT_READ_BLOCK, CONTRACT_CONTENT_READ_BLOCK]) {
    assert.match(
      block,
      /Call \{view:"pages", url\} first for a page the customer names, then \{id\}; \{describe:true\} for types, block kinds, where SEO\/menus\/forms live; \{type:"page", locale\} lists one type; follow links\.next\./
    )
    assert.doesNotMatch(
      block,
      /once|describe:true\} first|Call \{describe/,
      'the describe is no longer asked for first'
    )
  }
  assert.doesNotMatch(CONTENT_READ_BLOCK, /writable|content\.contract/, 'no slot door off the contract')
})

test('🔒 the EmDash content.read block keeps {describe:true} first, then the filtered list or the link, then one id', () => {
  assert.match(
    EMDASH_CONTENT_READ_BLOCK,
    /Call \{describe:true\} once, then \{type:"page", locale\} or \{view:"pages", url:link\}; then \{id\}/
  )
})

/**
 * 🔒 THE MAP CARRIES THE CMS'S OWN IDS (27/09/2026): a content names the records it is written
 * through as `native: [{kind, id|key}]` — the kinds content.get / content.update / content.delete
 * take — so no inspect or content.list is run only to learn an id. "never CMS ids" was true until then
 * and now would send the model looking for what it already holds.
 */
test('🔒 every content.read block says native holds the CMS ids', () => {
  for (const block of [CONTENT_READ_BLOCK, CONTRACT_CONTENT_READ_BLOCK, EMDASH_CONTENT_READ_BLOCK]) {
    assert.match(block, /Returns ids; native: CMS \{kind, id\|key\}/)
    assert.doesNotMatch(block, /never CMS ids/)
  }
})

/**
 * 🔒 TASK A (25/09/2026): the map names the edit. A contract field's `slotKey` is the key a
 * `content.contract` apply takes in `changes` (the dev e2e wrote `changes:{[field.slotKey]: …}`), and
 * the read's own revision is not the one an apply is based on — so the block says leave it out, which
 * CC-12 fills or answers with INSPECT_FIRST. Said only where `content.contract` is on the list, and
 * never asking for the ids T6 says Tracy makes.
 *
 * Content API v2 (26/09/2026): a relay that knows the field's writability hands the apply itself as
 * the field's `next`, so the block names that call and its limit; the slotKey sentence stays for a
 * Claude Cowork plugin that sends no `writable`/`next` (wire contract item 3).
 */
test('🔒 on a contract surface, content.read names slotKey as the key of content.contract apply changes', () => {
  assert.match(CONTRACT_CONTENT_READ_BLOCK, /slotKey[^.;]*content\.contract apply changes/)
  assert.match(CONTRACT_CONTENT_READ_BLOCK, /writable:true field's next is that apply/)
  assert.match(CONTRACT_CONTENT_READ_BLOCK, /constraints\.maxCharacters/)
  assert.match(CONTRACT_CONTENT_READ_BLOCK, /leave expected_revision out: Tracy fills it/)
  assert.doesNotMatch(CONTRACT_CONTENT_READ_BLOCK, /apply_id|request_id/, 'T6: Tracy makes the ids')
  for (const s of SURFACES) {
    const d = siteToolDescription(s)
    assert.equal(
      d.includes(CONTRACT_CONTENT_READ_BLOCK),
      SURFACE_ACTIONS[s].includes('content.contract'),
      `${s}: the slot bridge goes exactly where the contract door is`
    )
  }
  // The same door's own block still carries T6 once: the two texts agree on who makes the ids.
  for (const s of /** @type {const} */ (['joomla-sealed', 'wordpress-contract']))
    assert.equal(siteToolDescription(s).split(CONTRACT_IDS_RULE).length - 1, 1, s)
})

/**
 * 🔒 TASK B: on EmDash the map names the `tracy_emdash` entry and field — a field's key is the field
 * `content_update` takes, the slug is the id `content_get` takes — and a site whose image has no
 * reader is sent to that same road.
 */
test('🔒 on EmDash, content.read is accepted before the relay and names the tracy_emdash entry', () => {
  const actions = SURFACE_ACTIONS.emdash
  const planned = planCall({ action: 'content.read', params: { id: 'c-1' } }, { actions })
  assert.equal(planned.ok, true)
  assert.equal(siteToolDescription('emdash').split(EMDASH_CONTENT_READ_BLOCK).length - 1, 1)
  assert.match(
    EMDASH_CONTENT_READ_BLOCK,
    /field's key is its tracy_emdash field, slug its entry id: content_get \{collection, id:<slug>, locale\}/
  )
  assert.match(
    EMDASH_CONTENT_READ_BLOCK,
    /CONTENT_ADAPTER_UNSUPPORTED → no map here: tracy_emdash content_get/
  )
  assert.doesNotMatch(EMDASH_CONTENT_READ_BLOCK, /content\.contract|slotKey/)
})

test('🔒 a bound WordPress site is told the contract, on top of the open WordPress writes', () => {
  const noReplace = (/** @type {readonly string[]} */ list) =>
    new Set(list.filter((a) => a !== 'content.replace'))
  assert.deepEqual(
    noReplace(SURFACE_ACTIONS['wordpress-contract']),
    noReplace([...SURFACE_ACTIONS.wordpress, 'content.contract'])
  )
  const d = siteToolDescription('wordpress-contract')
  assert.ok(d.includes(WORDPRESS_CONTRACT_BLOCK))
  assert.ok(!d.includes(CONTRACT_BLOCK), 'not the Joomla block')
  // The WordPress read kinds, and a contract block in WordPress's words: keys, editions, and a
  // picture only into an image slot (Claude Cowork plugin 0.14.0-rc.4).
  assert.match(d, /kind ∈ \{post, postmeta, option, templatePart, term, menuItem\}/)
  assert.match(
    WORDPRESS_CONTRACT_BLOCK,
    /Use when content\.replace cannot: a picture, a link, words it refused\. Not for structure or settings \(content\.update\) or a read-only question \(content\.read\)\./
  )
  assert.match(WORDPRESS_CONTRACT_BLOCK, /Pictures: media\.draw \{prompt, slot\}, then apply the path\./)
  assert.match(WORDPRESS_CONTRACT_BLOCK, /\{operation:"inspect", page, match\}/)
  assert.ok(WORDPRESS_CONTRACT_BLOCK.includes(CONTRACT_IDS_RULE))
  assert.ok(!WORDPRESS_CONTRACT_BLOCK.includes(WORDPRESS_CONTRACT_LANGUAGE_RULE), 'the context says it')
  assert.ok(
    !WORDPRESS_CONTRACT_BLOCK.includes(CONTRACT_LANGUAGE_RULE),
    "Joomla's language rule is not true here"
  )
  assert.match(WORDPRESS_CONTRACT_LANGUAGE_RULE, /"<edition>::<key>" \(e\.g\. "vi::home\.hero\.heading"\)/)
  // No Joomla road rides along: no module ids, no Joomla build request, no occupancy rule (the WordPress
  // Claude Cowork plugin has none), no evidence (no wp7 slot asks for it). `slots:"image"` is NOT on this
  // list any more: a bound WordPress site has image slots since Claude Cowork plugin 0.14.0-rc.4 (a picture
  // goes into a slot and nowhere else) and the pictures block says where their keys are (30/09/2026).
  assert.doesNotMatch(
    d,
    /tracy_site_build_joomla|module-\d|occupied slot|requiresEvidence|images\/tracy-content/
  )
  // …and no build request for a language, which WordPress's build tool does not have.
  assert.doesNotMatch(d, /language\.add/)
  assert.match(WORDPRESS_CONTRACT_BLOCK, /apply_id:"mlang-<new>"/)
  assert.match(WORDPRESS_CONTRACT_BLOCK, /a retire: multilingual\.restore, same id/)
})

/**
 * 🔒 AN IMPORTED COPY WITH A DERIVED CONTRACT (01/10/2026) is its open surface byte for byte, the slot bridge
 * on the map's block, and the derived door — never a quickstart's words. Before it, every `next` that
 * `content.read` and a pick handed such a copy (`content.contract apply`, `apps/tracy-web/src/sites/
 * content-locate.js`) was refused here (`NOT_ON_THIS_PLATFORM`) before it reached the door that accepts it.
 */
test('🔒 an imported copy with a derived contract keeps its open surface and gets the derived door', () => {
  const apply = {
    action: 'content.contract',
    params: { operation: 'apply', changes: { 'post-12.post_content.0bfa07e1cb': 'x' } }
  }
  for (const [s, base] of /** @type {const} */ ([
    ['joomla-derived', 'joomla'],
    ['wordpress-derived', 'wordpress']
  ])) {
    for (const readBack of [false, true]) {
      const open = siteToolBlocks(base, { wordpressReadBack: readBack }).map((b) => b.text)
      const mine = siteToolBlocks(s, { wordpressReadBack: readBack }).map((b) => b.text)
      // Every open block in its order, the map's block swapped for the bridge, the derived door added.
      assert.deepEqual(
        mine
          .filter((t) => t !== DERIVED_CONTRACT_BLOCK)
          .map((t) => (t === CONTRACT_CONTENT_READ_BLOCK ? CONTENT_READ_BLOCK : t)),
        open,
        s
      )
      assert.equal(mine.filter((t) => t === DERIVED_CONTRACT_BLOCK).length, 1, s)
    }
    assert.equal(planCall(apply, { actions: SURFACE_ACTIONS[s] }).ok, true, s)
    // The open sibling — a fresh site, an unbound template — still refuses it before the relay.
    assert.equal(planCall(apply, { actions: SURFACE_ACTIONS[base] }).ok, false, base)
  }
  // The derived door says the plugin's own limits and where a refused change goes, and promises none of a
  // quickstart's: no named slots or identity, no editions, no slot-shaped draw, no evidence, no inspect.
  for (const rule of [
    /Use when content\.read, a pick or docs\/agents\/import-contract\/slots\.tsv \(grep -i\) gives a slotKey/,
    /Not for longer text, new or removed parts, settings: content\.update/,
    /no inspect: Tracy makes the ids and sends the revision content\.read showed; with none read, the first apply answers INSPECT_FIRST/,
    /send the same apply again\. Returns the receipt: read nothing afterwards/,
    /plain text up to 1\.25× its length; a Joomla slot is never emptied/,
    /apply\.revert \{apply_id\} undoes the latest apply/,
    /SLOT_TOO_LONG or SLOT_EMPTY_STATE → content\.update or content\.replace on that record/,
    /SLOT_UNKNOWN → grep the index or content\.read again/
  ])
    assert.match(DERIVED_CONTRACT_BLOCK, rule)
  assert.doesNotMatch(
    DERIVED_CONTRACT_BLOCK,
    /quickstart|identity|multilingual|::|slot:"|evidence|operation:"inspect"|request_id|contract-/
  )
  // The block is in every step's prompt of every conversation on an imported copy: it rides the quickstart's
  // content.contract exception, so its growth is pinned here, not left to the budget it is added to.
  assert.ok(DERIVED_CONTRACT_BLOCK.length <= 1000, `${DERIVED_CONTRACT_BLOCK.length} characters`)
})

/**
 * 🔒 NO SURFACE ASKS THE MODEL FOR A FILE'S BYTES (27/09/2026). `media.upload` took `content_b64`, and a
 * bound site takes only `<folder>/tracy-content/<sha256>.*` — a hash the model cannot compute
 * (`Engine.php:154-157`); on EmDash the agent's own base64 and url looped 24–40 steps on the stand. The
 * call is now `media.upload {file}` on every surface, EmDash included: the host reads the customer's
 * picture from the site folder the Files tab writes into (`upload.mjs`). A picture for a contract slot
 * is still `media.draw {prompt, slot}`, drawn to the slot's demo shape.
 *
 * 🔒 AND THE PICTURE SENT IN THE CHAT BY NAME TOO (29/09/2026): `{attachment}` names it (or its sha256),
 * the host reads it back from dsh's store. Unsaid, the model had no road but base64 typed by hand
 * (bench v5 cause O: 12 min on WordPress, a 725 s timeout on EmDash).
 */
test("🔒 every surface takes the customer's own file by name, and a quickstart keeps the slot picture road", () => {
  const FILE =
    /media\.upload \{file, alt\?\} \(Files-tab name\) \| \{attachment, alt\?\} \(attached in chat: name or sha256\)/
  for (const s of /** @type {const} */ (['wordpress-contract', 'joomla-sealed']))
    for (const readBack of [false, true]) {
      const text = siteToolDescription(s, { wordpressReadBack: readBack })
      assert.match(text, FILE, s)
      assert.match(text, /media\.draw \{prompt, slot\}/, s)
    }
  for (const s of SURFACES) {
    assert.match(siteToolDescription(s), FILE, s)
    assert.doesNotMatch(siteToolDescription(s), /content_b64|base64/, `${s} asks for bytes`)
  }
  assert.match(fullSiteToolDescription(), /media\.upload \{file \| attachment, alt\?\}/)
  assert.match(fullSiteToolDescription(), /sent in this chat \(attachment: its name or sha256 id\)/)
  assert.doesNotMatch(fullSiteToolDescription(), /content_b64/)
})

/**
 * 🔒 EACH SURFACE NAMES THE DRAW SHAPE ITS DOOR ACCEPTS (bench v7, 30/09/2026). The pictures block said
 * `{prompt, like?:… | aspect?:"16/10"}` on every Joomla and WordPress surface, quickstart ones included:
 * a bound WordPress site refuses anything but a slot, a Joomla quickstart's apply refuses a picture cut to
 * the wrong shape, and 20 picture runs spent 2–8 calls finding the slot key or were refused for sending
 * the slot beside an aspect. A quickstart says `slot` (its own key form, where the key is, that the slot
 * brings the shape); an open site keeps `like` and `aspect`. A bound WordPress site also keeps a picture
 * in the media library only, with a shape of its own (#255: its Claude Cowork plugin takes that upload), so
 * its block names `aspect (library only)` beside the slot; the slot still fixes a placed picture's shape.
 */
test('🔒 the pictures block offers a draw a slot on a quickstart, like or aspect on an open site', () => {
  const pictures = (/** @type {any} */ s) =>
    siteToolBlocks(s).find((b) => b.text.startsWith(PICTURES))?.text ?? ''
  const KEY_FROM = /\(key: inspect \{slots:"image", page\}; a slot sets its shape: no like\/media\.scan\)/
  const joomla = pictures('joomla-sealed')
  const wordpress = pictures('wordpress-contract')
  assert.match(joomla, /media\.draw \{prompt, slot:"module-441\.8"\}/)
  assert.match(wordpress, /media\.draw \{prompt, slot:"home\.hero\.img" \| aspect \(library only\)\}/)
  assert.doesNotMatch(joomla, /library only/, 'Joomla draws without a slot already; its block says the slot')
  for (const text of [joomla, wordpress]) {
    assert.match(text, KEY_FROM)
    assert.doesNotMatch(text, /like\?|aspect\?|16\/10/, 'a quickstart draw offers neither like nor aspect')
    assert.match(text, /Effects: media\.draw adds ONE picture per call: apply its path\./)
  }
  // Each says its own CMS's key form only.
  assert.doesNotMatch(joomla, /home\.hero\.img/)
  assert.doesNotMatch(wordpress, /module-441/)
  for (const s of ['joomla', 'wordpress', 'wordpress-sealed']) {
    assert.match(pictures(s), /media\.draw \{prompt, like\?:"<a site picture>" \| aspect\?:"16\/10"\}/, s)
    assert.doesNotMatch(pictures(s), /slot/, `${s} has no contract slot to draw for`)
  }
  // The slot's shape reaches the door with the slot: the fallback description says the same in one sentence.
  assert.match(fullSiteToolDescription(), /so no like or aspect; otherwise `like`/)
})

/**
 * 🔒 `content.list {search}` IS ADVERTISED (30/09/2026), WITH THE PLUGIN RELEASE THAT READS IT AND THE ROAD
 * WHEN AN OLDER PLUGIN REFUSES IT. The plugin releases exist (Joomla 0.20.0, WordPress 0.16.0) and the
 * guard of #654 turns an unfiltered answer into `LIST_SEARCH_UNSUPPORTED` at the relay and at the host,
 * so the description may name the key: a model that reaches for it used to guess it (2 of 110 list calls,
 * refused), and a record known by its title cost one call per ~76 rows. Each block names its own CMS's
 * release only; nothing hardcodes "this site has the plugin" — the road when it does not is in the
 * sentence: page with `offset`, which is true of every kind. The sentence does not name `content.read`:
 * it lists an article, a menu item and a module, not a banner or a category, so the refusal itself names
 * the road that exists for the kind asked (`site.mjs` `listWithoutSearchNext`).
 */
test('🔒 the read blocks offer content.list search with the release that reads it and the road an older plugin sends the model to', () => {
  const read = (/** @type {any} */ s) =>
    siteToolBlocks(s).find((b) => b.text.startsWith('content.list ·'))?.text ?? ''
  const OLDER = 'an older one answers LIST_SEARCH_UNSUPPORTED, whose next is the road'
  for (const s of /** @type {const} */ (['joomla-sealed', 'joomla'])) {
    const text = read(s)
    assert.ok(
      text.includes(
        'Call content.list {kind, search?:"<part of the title>", offset?, limit?:≤200, include_body?}'
      ),
      `${s}: the shape`
    )
    assert.ok(
      text.includes(`. search matches title or alias (Joomla 0.20.0+; ${OLDER}). Returns {items};`),
      `${s}: the sentence sits between the kinds and what the call returns`
    )
    assert.doesNotMatch(text, /WordPress|0\.16\.0/, `${s} names its own CMS's release only`)
  }
  for (const s of /** @type {const} */ (['wordpress-contract', 'wordpress-sealed', 'wordpress'])) {
    const text = read(s)
    assert.ok(
      text.includes(
        `Call content.list {search?:"<part of the title>", post_type?:"page"|"wp_navigation"|"wp_template_part", name?:"<slug>", limit?:≤200, offset?, include_body?} — posts only; search matches title or slug, in every language (WordPress 0.16.0+; ${OLDER}); kind:"pattern" lists registered block patterns; content.get {kind, id | key}`
      ),
      `${s}: the shape and the sentence`
    )
    assert.doesNotMatch(text, /Joomla|0\.20\.0/, `${s} names its own CMS's release only`)
  }
  // EmDash has no `content.list` (it searches with `tracy_emdash`'s own tool).
  assert.doesNotMatch(siteToolDescription('emdash'), /LIST_SEARCH_UNSUPPORTED|search\?:"<part of the title>"/)
  // The platform-neutral description names both releases in one sentence.
  assert.ok(
    fullSiteToolDescription().includes(
      `content.list {kind, search, offset, limit≤200, include_body} → one page of records; search:"<part of the title>" keeps the rows whose title, alias or slug holds it (Joomla 0.20.0+, WordPress 0.16.0+; ${OLDER}). `
    )
  )
})

test('🔒 the contract block is T13: T6 replaces the id-making sentences, T11 is quoted verbatim', () => {
  const d = siteToolDescription('joomla-sealed')
  assert.ok(d.includes(CONTRACT_BLOCK))
  assert.ok(CONTRACT_BLOCK.includes(CONTRACT_IDS_RULE))
  assert.ok(!CONTRACT_BLOCK.includes(CONTRACT_LANGUAGE_RULE), 'the context says T11; the block points at it')
  assert.equal(
    CONTRACT_IDS_RULE,
    'Leave apply_id and request_id out: Tracy makes a pair per apply (an apply_id you give starts "contract-" and is new). An answer\'s `normalized` lists what Tracy corrected in your call: use that form next time.'
  )
  // V6 C2: the sentence that disagreed with the component is gone from every text.
  for (const text of [...SURFACES.map((s) => siteToolDescription(s)), fullSiteToolDescription()])
    assert.doesNotMatch(text, /through the language job|Write to source slots only/)
  // The rules the r2 failures were about.
  for (const rule of [
    /ONE \{operation:"apply", changes:/,
    /requiresEvidence/,
    /an occupied slot cannot be emptied and an empty one cannot be filled/,
    /read nothing afterwards/,
    /apply\.revert \{apply_id\} \(the latest contract apply/,
    /media\.draw \{prompt, slot\}/
  ])
    assert.match(CONTRACT_BLOCK, rule)
  // 🔒 THE RETIRE PASS TAKES ITS OWN ID, AND IS UNDONE BY ITS OWN CALL. The component refuses a retire
  // without an `mlang-` apply_id (`Engine.php:1801`, bad_params) — T6's "leave apply_id out" is about an
  // APPLY, and Tracy mints only for an apply (`normalize.mjs` contractIds). On a bound site apply.revert
  // takes contract receipts only (`Engine.php:158-161`); a retire comes back with multilingual.restore.
  assert.match(
    CONTRACT_BLOCK,
    /content\.contract \{operation:"multilingual\.retire", keep:\[[^\]]+\], apply_id:"mlang-<new>"\}/
  )
  assert.match(CONTRACT_BLOCK, /repeat until completed/)
  assert.match(CONTRACT_BLOCK, /a retire: multilingual\.restore, same id/)
})

/**
 * 🔒 V6 C1 OF THE PLAN — ONE RULE PER ID, AND ONLY WHERE NOTHING MINTS ONE DOES THE MODEL NAME IT.
 * "apply_id MUST start with contract-" and "request_id is any string" beside "Tracy makes them" gave one
 * field two rules in one prompt. Tracy mints a contract apply's pair (T6) and WordPress's one id per
 * customer request (D9, `normalize.mjs` WP-27).
 *
 * The MAKES pattern alone passed only because the wording avoided its five verbs, so the ids the
 * model DOES fill are listed per surface, explicitly:
 * - open Joomla, and only there, asks for one apply_id PER ITEM: nothing mints a Joomla content id and
 *   the component refuses a write without one (`contentUpdate`, `Engine.php:2058-2061`); the site
 *   context's SEVERAL JOBS line gives the same rule;
 * - a shape whose apply_id the model fills (a receipt's id passed to apply.revert / apply.list is not
 *   one): the retire pass on sealed Joomla (`mlang-`, `Engine.php:1801`), a Joomla content write and
 *   `extension.enable`. `media.upload` left this list on 27/09/2026: its shape is `{file}` and its
 *   receipt Tracy's (`media-<sha16>`, `upload.mjs`).
 * WP-27: WordPress says "optional … one per write" (one per customer request under D9 until 26/10/2026), and since 25/09 the site context's
 * SEVERAL JOBS line no longer asks a WordPress agent for an id per item (`consistency.test.mjs`).
 */
test('🔒 only the Joomla record writes ask for an apply_id per item, and every id the model fills is listed', () => {
  const MAKES =
    /\b(choose|make|pick|create|invent)\b[^.;]{0,40}\b(apply_id|request_id)\b|apply_id:"contract-<|apply_id MUST|request_id (is any|matches|stays)/i
  const PER_ITEM = /apply_id[^.]{0,60}one per item|one per item[^.]{0,60}apply_id/
  /** Shapes whose apply_id the MODEL fills, per surface. */
  const MODEL_FILLS = {
    'joomla-sealed': ['content.contract', 'content.delete', 'content.update', 'extension.enable'],
    joomla: ['content.delete', 'content.update', 'extension.enable'],
    // The retire pass's `mlang-` id, as on sealed Joomla (#337: Claude Cowork plugin 0.13.0 has it too).
    'wordpress-contract': ['content.contract'],
    'wordpress-sealed': [],
    wordpress: [],
    emdash: [],
    // The open lists: a derived apply's ids are Tracy's (the block says so), as on a quickstart.
    'joomla-derived': ['content.delete', 'content.update', 'extension.enable'],
    'wordpress-derived': []
  }
  for (const s of SURFACES)
    for (const readBack of [false, true]) {
      const d = siteToolDescription(s, { wordpressReadBack: readBack })
      assert.doesNotMatch(d.replace(CONTRACT_IDS_RULE, ''), /request_id/, `${s} names request_id outside T6`)
      assert.doesNotMatch(d.replace(CONTRACT_IDS_RULE, ''), MAKES, s)
      if (s === 'joomla' || s === 'joomla-sealed' || s === 'joomla-derived')
        assert.match(d, /apply_id names the receipt: one per item of the request/)
      else assert.doesNotMatch(d, PER_ITEM, `${s} asks for an apply_id per item`)
      const fills = [...d.matchAll(/([a-z]+\.[a-z.]+) \{[^{}]*\bapply_id\b/gi)]
        .map((m) => m[1])
        .filter((a) => a !== 'apply.revert' && a !== 'apply.list')
      assert.deepEqual([...new Set(fills)].sort(), MODEL_FILLS[s], `${s}: the ids the model fills`)
    }
  // The retire pass is the one sealed id, and it is named with its prefix — never a free choice.
  assert.match(siteToolDescription('joomla-sealed'), /apply_id:"mlang-<new>"/)
  for (const s of /** @type {const} */ (['wordpress', 'wordpress-sealed'])) {
    const d = siteToolDescription(s)
    // Optional, and Tracy's: one id per write (WP-27, owner 26/10/2026).
    assert.match(d, /apply_id is optional: left out, Tracy makes one per write\./)
    // The write shapes carry no apply_id: the one thing an edit must name is its record.
    const write = siteToolBlocks(s).find((b) => b.text.startsWith('content.update:'))
    assert.ok(write)
    assert.doesNotMatch(write.text, /apply_id/)
  }
  assert.doesNotMatch(fullSiteToolDescription(), /request_id is any string|apply_id MUST|Choose one apply_id/)
})

test('🔒 WordPress reads: lists are posts only, an option is read by its key', () => {
  for (const s of /** @type {const} */ (['wordpress-contract', 'wordpress-sealed', 'wordpress'])) {
    const d = siteToolDescription(s)
    assert.match(d, /— posts only/)
    // The registered block patterns (01/10/2026): listed by kind, inserted by name in the write block.
    assert.match(d, /kind:"pattern" lists registered block patterns;/)
    assert.match(d, /\{kind:"option", key:"blogname"\}/)
    assert.match(d, /kind ∈ \{post, postmeta, option, templatePart, term, menuItem\}/)
    assert.match(d, /Returns rows \{id, title, slug, type, status, path\} \(include_body:true adds content/)
    assert.match(d, /content\.get answers post_\* fields/)
    assert.doesNotMatch(d, /templateStyle|moduleAssignment|extensionParams|articleAssociation/)
  }
  // The Joomla kinds are the component's own (`SiteWriter::KINDS`), and no WordPress kind.
  const j = siteToolDescription('joomla-sealed')
  assert.match(
    j,
    /kind ∈ \{article, category, tag, field, menuItem, menutype, module, moduleAssignment, templateStyle, language, languageFilter, articleAssociation, menuAssociation, redirect, banner, bannerClient, contact, newsfeed, user, extensionParams\}/
  )
  assert.doesNotMatch(j, /fieldValue|postmeta|templatePart|\bterm\b/)
})

// 🔒 MEASURED r2 (25/09/2026): 6 of 33 WordPress cases truncated a live page with their first write
// (the home post, ≈ 26.9k characters, overwritten with 252 / 4,231 / 4,192 / 4,155; the contact post
// with 3,191; the header part with 19). The model read `fields` as a patch.
test('🔒 the WordPress write says post_content replaces the whole body, and every write names its key', () => {
  for (const s of /** @type {const} */ (['wordpress-sealed', 'wordpress'])) {
    const write = siteToolBlocks(s).find((b) => b.text.startsWith('content.update:'))
    assert.ok(write, s)
    assert.match(
      write.text,
      /A body \(post_content, a part's content\) goes by blocks: content\.get \{…, outline:true\} numbers them, with rev \(always over 16,000 chars\), block:i reads one; \{rev, blocks:\{"<i>":"<markup>"\|null, "\+<i>":"<markup>"\|\{pattern:"<name>"\}\}\} changes, drops or adds just those; a key may be a block's own metadata\.name, a value \{find,replace\} \(find stands once in it\) or \{attrs:\{…\}\} \(metadata, lock; any attr of a \/--> block; null removes one\)\. In fields: the WHOLE body \(shorter: BODY_SHRINK\)/
    )
    // Shapes by kind — an option, a template part and a meta are written by key; an edit names its id.
    assert.match(write.text, /option \{kind:"option", key, fields:\{value\}\}/)
    assert.match(
      write.text,
      /templatePart \{kind:"templatePart", key:"header"\|"footer", fields:\{content, title\}\}/
    )
    assert.match(write.text, /postmeta \{kind:"postmeta", id, key, fields:\{value\}\}/)
    assert.match(write.text, /term \{kind:"term", id, key:"<taxonomy>", fields:\{name\}\}/)
    assert.match(write.text, /post \{kind:"post", id, fields:\{post_title\|post_content/)
    assert.match(write.text, /an edit names its id; without one it CREATES a post/)
  }
})

test('the WordPress read-back fallback changes only the write block, and says the read the context says', () => {
  for (const s of /** @type {const} */ ([
    'wordpress-sealed',
    'wordpress',
    'wordpress-contract',
    'wordpress-derived'
  ])) {
    const plain = siteToolBlocks(s)
    const readBack = siteToolBlocks(s, { wordpressReadBack: true })
    assert.equal(plain.length, readBack.length)
    const changed = plain.filter((b, i) => b.text !== readBack[i].text)
    assert.equal(changed.length, 1, s)
    assert.ok(changed[0].text.startsWith('content.update:'))
    const fallback = readBack.find((b) => b.text.startsWith('content.update:'))
    assert.match(
      fallback?.text ?? '',
      // The site context's words for the same fallback (`site-context.mjs`, `wordpressReadBack`).
      /except after a post or templatePart write: content\.get that record once to check the body is whole/
    )
    assert.match(changed[0].text, /Returns \{kind, id, key, created, verified\}: the receipt\. Effects/)
  }
  // A Joomla or EmDash surface does not have the WordPress body write, nor a bound WordPress site
  // (its words change by slot): the flag changes nothing there.
  for (const s of /** @type {const} */ (['joomla-sealed', 'joomla', 'emdash', 'joomla-derived']))
    assert.equal(siteToolDescription(s, { wordpressReadBack: true }), siteToolDescription(s))
})

test('an EmDash site is told only the page tools, and where its content door is', () => {
  const d = siteToolDescription('emdash')
  // IX2 (PR2): the replace job is live on EmDash, described in its own block after the lead.
  assert.deepEqual(
    [...SURFACE_ACTIONS.emdash],
    [
      'content.read',
      'content.locate',
      'page.text',
      'page.look',
      'media.scan',
      'media.draw',
      'media.upload',
      'look.revert',
      'look.set',
      'page.create',
      'content.replace'
    ]
  )
  assert.match(d, /tracy_emdash/)
  // The opening is built from the surface's own list of PAGE tools; the replace job has its own block.
  // content.locate is told only by the comment turn that carries a pick (TURN_ONLY_ACTIONS); look.set
  // by the LOOK line (CONTEXT_TOLD_ACTIONS).
  const pageTools = SURFACE_ACTIONS.emdash.filter(
    (a) => a !== 'content.replace' && a !== 'page.create' && !CONTEXT_TOLD_ACTIONS.includes(a)
  )
  assert.ok(d.startsWith(`tracy_site: THIS EmDash site's page tools (${pageTools.join(', ')})`))
  assert.match(d, /\ncontent\.replace: changes words already on THIS site in one call\./)
  // media.draw joined EmDash on 26/09/2026 (a picture to an aspect, url written by tracy_emdash).
  assert.doesNotMatch(d, /content\.update|apply\.list|content\.get|\{list: ?true\}/)
  // 30/09/2026: the picture it replaces is an entry field the door measures (`replaces`); `aspect` is for
  // a NEW picture, and no stock ratio stands as an example for the model to copy (v7: 16/10, 5/4, 4/3).
  assert.match(
    d,
    /media\.draw \{prompt, replaces:\{collection, id, field\} \| aspect:"<w>:<h>" \(a new picture\)\}/
  )
  assert.doesNotMatch(d, /16\/10/)
  // The entry field holds the media item's id (`emdashPlacedNext` says so): the description says "id", not "url".
  assert.match(d, /media\.draw adds one picture per call: write its id with tracy_emdash content_update\./)
  // media.upload joined EmDash on 27/09/2026: the customer's own picture, read by the host, its id back
  // (29/09/2026: from the Files tab or the chat; one return for the draw and the upload).
  assert.match(
    d,
    /media\.upload \{file, alt\?\} \(Files-tab name\) \| \{attachment, alt\?\} \(attached in chat: name or sha256\)\. Returns [^.]*\{id, url\}/
  )
})

test('every surface says the page read, the normalized fact and the apply.list rule the same way', () => {
  for (const s of SURFACES) {
    const d = siteToolDescription(s)
    assert.equal(d.split(PAGE_TEXT_BLOCK).length - 1, 1, `${s}: page.text block`)
    assert.equal(d.split(NORMALIZED_FACT).length - 1, 1, `${s}: normalized fact`)
    if (SURFACE_ACTIONS[s].includes('apply.list')) {
      assert.equal(d.split(APPLY_LIST_RULE).length - 1, 1, `${s}: apply.list`)
      // …and it is apply.list's NOT, said beside apply.list (D6′: 55 of 63 r2 calls were read-backs).
      assert.match(d, /apply\.list[^.]{0,60}never after a write: the write's answer is the receipt/, s)
    }
  }
  // And the fallback says the normalized fact once too (it sat in T6 AND in its tail until 25/09).
  assert.equal(fullSiteToolDescription().split(NORMALIZED_FACT).length - 1, 1)
})

/**
 * 🔒 OPEN JOOMLA'S WRITE BLOCK SAYS THE FOUR VERBS THE COMPONENT HAS — add, edit, move, trash. It is
 * written in T12 order rather than quoting `WRITE_VERBS` (site.mjs), which still serves the full
 * fallback and which `site.test.mjs` holds to the component; so the same facts, and the same two call
 * shapes, are pinned here.
 */
test("open Joomla's write block names add, edit, move and trash in the component's own shapes", () => {
  const write = siteToolBlocks('joomla').find((b) => b.text.startsWith('content.update · content.delete:'))
  assert.ok(write)
  for (const shape of [
    'content.update {kind, id, fields, apply_id}',
    'content.delete {kind, id, apply_id}'
  ]) {
    assert.ok(write.text.includes(shape), shape)
    assert.ok(WRITE_VERBS.includes(shape), `WRITE_VERBS no longer says ${shape}`)
  }
  assert.match(write.text, /id left out \(or 0\) CREATES one/)
  assert.match(write.text, /parent_id \/ move_after MOVE it/)
  assert.match(write.text, /a delete TRASHES \(nothing is purged\)/)
  assert.match(write.text, /apply\.revert \{apply_id\} undoes that item, an insert included/)
  // 03/10/2026 (leemood module 93): a nested `jatools-config` re-typed as a string dropped `:type`.
  assert.match(
    write.text,
    /a key held as JSON text \(jatools-config\) is patched as an object, never re-typed/
  )
})

/**
 * The T12 parts, in their order, each found by its label. WHEN is "Use when …" (T8 keeps the plan's
 * "Use it to …"); EFFECTS is "Effects: …", or "Read-only" for a read, or T13's "Undo: …".
 */
const T12_PARTS = /** @type {const} */ ([
  ['WHAT', /^[a-z_]+(?:\.[a-z_.]+)?(?: · [a-z_]+(?:\.[a-z_.]+)?)*: /],
  ['WHEN', /\bUse (?:when|it to)\b/],
  ['NOT', /\bNot (?:for|after)\b/],
  ['CALL', /\bCall\b/],
  ['RETURNS', /\bReturns\b/],
  ['EFFECTS', /\bEffects:|\bRead-only\b|\bUndo:/],
  ['REFUSALS', /\bRefusals:/]
])

/** A block's name: the action list before its first colon. */
const headOf = (/** @type {string} */ text) => text.slice(0, text.indexOf(': '))

/**
 * 🔒 THE PARTS A BLOCK LEAVES OUT, EACH A MEASURED DECISION (the sealed budgets of 3,700 cannot hold all
 * seven in every block; REFUSALS goes first, and only where the text would prevent nothing r2 measured
 * or a T10 next already gives the call). The test fails both ways: a part missing from a block not
 * listed here, and a part listed here that the block has grown back — so the table cannot go stale.
 */
const LEFT_OUT = /** @type {Record<string, string[]>} */ ({
  // r2 sealed Joomla: 2 of 72 reads refused (`id required`, a kind outside the list), both shape errors
  // whose T10 next is the corrected call.
  'content.list · content.get · info · extension.list': ['REFUSALS'],
  // The kind class (50) is prevented by "posts only" in CALL and corrected by normalize.mjs; not_found
  // (28) gets P3's listing next. The 52-character clause is what sealed WordPress could not fit.
  'content.list · content.get · info · plugin.list · theme.list': ['REFUSALS'],
  // All 26 r2 refusals were CONTENT_CONTRACT on a sealed site, where it is no longer offered.
  'content.find': ['REFUSALS'],
  // BODY_SHRINK is named inside CALL (the plan's pinned whole-body sentence); the no-writable-field
  // class (r2: 15) is its NOT line.
  'content.update': ['REFUSALS'],
  // r2: one delete (accepted), two content.language calls without an id — refused before the relay by
  // normalize.mjs (WP-28) with its own next.
  'content.delete · content.language · language.install · apply.revert · apply.list': ['REFUSALS'],
  // r2: every receipt call on the sealed Joomla site was accepted but the two apply.list calls without
  // an id, which normalize.mjs now fills with the latest write; no open Joomla site was measured.
  'apply.revert · apply.list': ['REFUSALS']
})

/**
 * 🔒 OVER 700 BY MEASUREMENT, BOUNDED AT THE MEASURED LENGTH, NOT WAIVED: T8 (`page.text`, 774: the
 * page-read rules and `maxChars`; 926 since v6 #3's `head`); the pictures block (735 since v6 #3's
 * `page.look {style}`); T13 (the sealed Joomla contract, 1,785: the plan's own text with T6
 * and T11 inside is 1,555, plus the media.draw cost, the apply.list clause and the retire call's shape);
 * the WordPress write (806: five kind shapes, the edit-id clause and the pinned whole-body sentence, each
 * an r2 failure class), and 897 under the D6′ (c) read-back fallback, which exists only if the in-tool
 * body check is dropped.
 */
// content.contract +61 (25/09/2026): " Nor for a question that only reads: content.read answers it."
// — cut to +44 (26/09, Content API v2): " Nor for a read-only question: content.read."
// — on dev the agent answered "which picture is the hero" with this door's inspect, 60–80 s a call.
// — +79 (26/09, Content API v2 D2): " After content.read, apply needs no inspect: Tracy sends the
// revisions it read." — the read already named the slot, and the inspect cost 10–20 s for nothing.
// +17 on the record road that has content.replace (PR2 review, 27/09): "Use when settings change or
// content.replace cannot." in place of "Use when words or settings change." — words already on a page
// are the replace's job, and the block must not claim them.
// +101 on the WordPress write (W2, 27/09): the whole-body sentence became the block road — a body is
// read as its outline, one block by `block:i`, and written by `blocks:{…}` — in place of "send every
// block back". Measured 26/09: four whole-body sends in one turn generated 64,000 tokens and 189 s.
// +148 on the WordPress write (v6 fix M, 29/09/2026): a block key may be its metadata.name and its value
// {find,replace} or {attrs:{…}} — the model changed one element by re-typing a 12.4k-character block
// (WordPress L2-02: 26.8 s, 8.1k output tokens; a 139-character replace took 2 s). PO to confirm.
const W2_PATCH = 148
// +17 on the WordPress write (01/10/2026, `tasks/todo-wordpress-block-editing.md` line A): the outline
// comes ", with rev" and a write is "{rev, blocks:{…}}" — a write by position must send back the rev of the
// read that numbered the blocks, or the host refuses it (`REVISION_STALE` when the page changed since).
// Before it, the old numbers were applied to whatever the body held at write time: a block added on top
// in WordPress admin between the read and the write moved every position, and the wrong block was replaced
// with no error. The rule is new, so the description has to say it: a model that sends no rev pays one
// refusal and one read to learn it. Paid for by nothing else.
const W2_REV = 17
// +19 on the WordPress write (01/10/2026, line C): an insert's value may be `|{pattern:"<name>"}` — a
// registered pattern the host reads and inserts as its markup (`wp-patterns.mjs`), so a section the theme
// already has is named, never re-typed through the model's output. Paid for by nothing else.
const W2_PATTERN = 19
// +19 on the WordPress write (01/10/2026, E2E before pass on Twenty Twenty-Five, WordPress 7.1.2): `{attrs}`
// says which keys it takes — "(metadata, lock; any attr of a /--> block; null removes one)" in place of
// "(merged into its attrs, null removes one)". Merged into the comment of a block with saved HTML, `level`
// (core/heading) and `verticalAlignment` (core/columns) made the block invalid in the editor, and `url`
// (core/button), `sizeSlug` (core/image), `tagName` (core/group) changed nothing the visitor sees while the
// write answered ok; the host now refuses those (`ATTRS_IN_HTML`), and the description says so before the
// model sends one. Paid for by nothing else.
const W2_ATTRS = 19
// +118 on the Joomla write (v6 fix M): `fields.params` as {patch:{…}} merges into the stored column —
// a whole `params` re-typed broke a module (V5-chat-01) and cost 15k output tokens (Joomla L2-02).
const JOOMLA_PATCH = 118
// +82 on the Joomla write (03/10/2026, dev site leemood, module 93): "a key held as JSON text (jatools-config)
// is patched as an object, never re-typed". The agent re-typed a module's nested `jatools-config` as a string to
// change one heading, dropped its `:type` key, and the hero printed nothing; the host now refuses that string
// (`PARAMS_KEYS_LOST`). Paid for by nothing else: the clause stops the write being sent at all.
const JOOMLA_JSON_TEXT = 82
const W2_BLOCKS = 101 + W2_PATCH + W2_REV + W2_PATTERN + W2_ATTRS
// ⚠ The two verification reads (suite v6 #3, 28/09/2026 — PO to confirm, as for #347's +370): the
// Writer and SEO/GEO roles carry no bash, so without `page.text {head:true}` an SEO agent could not
// see the tags it was asked to write or check, and a designer grepped stylesheets for the token behind
// a colour. `page.text` gains `head`, its WHEN "or its SEO tags", a NOT narrowed to "a words write"
// (a setting's receipt does not say the theme prints the tag) and the text-file clause: 762 → 926.
// The pictures block gains `page.look {style}` and what it returns: 635 → 735 (EmDash 541 → 641).
// Paid for by nothing else: every clause names a read the agent had no road to.
const VERIFY_HEAD = 926 - 762
const VERIFY_STYLE = 735 - 635
// content.replace: 698 → 905 on EmDash (+207; the other two 690 → 897): `at`, `expect`, that dryRun needs
// a replace, the "all except X" road and `stillHolds` — v6 measured a dropped line (WP L5-01) and four BAD_PARAMS.
// 23/10/2026: WordPress gains the theme-printed link line (`href:true`, `rendered-words.mjs`): 897 → 933.
// Words the theme prints need no sentence (the job finds them); a link target cannot be guessed.
const REPLACE_BLOCK_MAX = 933
// ⚠ `content.list {search}` advertised (30/09/2026, bench v7 follow-up; the Claude Cowork plugin releases
// that read it are Joomla 0.20.0 and WordPress 0.16.0, both published 30/09): the read block of each
// platform gains the `search?:"<part of the title>"` shape, what it matches (Joomla: title or alias;
// WordPress: title or slug, in every language, where the plain list answers the default one), the release
// that reads it and the road an older plugin sends the model to (`LIST_SEARCH_UNSUPPORTED`, then
// paging with `offset`). PO to confirm. Joomla 152 = 31 (shape) + 121 (sentence); WordPress 173 = 31 + 142.
// Paid for by nothing else: a record known only by its title had no road but paging the whole list —
// bench v7 cp4, Joomla 44 languages / ~1,900 articles: 13 of 48 runs looked a record up by name with
// `content.list` (30 calls, answers of 14–16k characters cut at 16,000), and the worst of them
// spent 18 model calls, 13 of them wasted, paging at offsets 76/100/174/247/300 to find the language
// editions of one article, then guessed a `search` key that was refused. Both texts are static per
// surface, so the cached prefix of a site does not change from one turn to the next (`prefix-stability`).
const LIST_SEARCH_JOOMLA = 152
const LIST_SEARCH_WORDPRESS = 173
// +48 on the WordPress read block (01/10/2026, line C): ` kind:"pattern" lists registered block patterns;`
// — the list the model picks a pattern's name from before it inserts one (`{pattern:"<name>"}`, see
// W2_PATTERN). Without it a site's own layouts had no road but the model re-typing markup it guessed. A
// plugin that cannot list them answers PATTERNS_UNSUPPORTED with the markup road (`wp-patterns.mjs`); no
// release number is said. Paid for by nothing else.
const LIST_PATTERN_WORDPRESS = 48
// ⚠ +62 on every surface that carries apply.list (14/10/2026, ladder DL15 on dsl2jo, PO to confirm): the
// apply.list rule says where an EARLIER conversation's change is found — "; with no apply_id before any
// write: the site's recent changes" (`normalize.mjs` AL-4, the Apply door's `recent-changes.js`). Unsaid,
// a customer's "undo the change you made" in a new conversation had no road: the agent bootstrapped Joomla
// from the shell to read the plugin's log, found no site-name change there, and undid two articles.
const APPLY_LIST_RECENT = 62
// ⚠ +596 on the Joomla surfaces (14/10/2026, ladder DL14/DL15, PO to confirm): `site.identity`, the site
// name's one recorded door (`JOOMLA_IDENTITY_BLOCK`, 595 characters plus its line break). Without it the
// agent renamed the site through the shell (`config:set sitename`), which no receipt lists, so the undo
// the customer asked for in the next conversation could not be found. Paid for by nothing else.
const SITE_IDENTITY = JOOMLA_IDENTITY_BLOCK.length + 1
const OVER_700 = {
  'content.replace': REPLACE_BLOCK_MAX,
  // The two read blocks (609 on Joomla; 678, and 690 on a bound WordPress site) cross 700 with the
  // `search` shape and sentence, each bounded at its own measured length (see LIST_SEARCH_JOOMLA).
  'content.list · content.get · info · extension.list': 609 + LIST_SEARCH_JOOMLA,
  'content.list · content.get · info · plugin.list · theme.list':
    690 + LIST_SEARCH_WORDPRESS + LIST_PATTERN_WORDPRESS,
  'page.text': 762 + VERIFY_HEAD,
  // +39 for the media.delete guidance after restoring the original page.look call shape and wording:
  // open blocks 735 → 774, Joomla contract 800 → 839, WordPress contract 801 → 840. This is the only block budget raised.
  'page.look · media.scan · media.draw · media.upload': 635 + VERIFY_STYLE + 39,
  'content.contract': 1785 + 44 + 79,
  'content.update': 806 + 17 + W2_BLOCKS,
  'content.update · content.delete': 675 + JOOMLA_PATCH + JOOMLA_JSON_TEXT
}
const OVER_700_READ_BACK = { ...OVER_700, 'content.update': 897 + 17 + W2_BLOCKS }
// +66 on the pictures block of the two contract surfaces (bench v7, 30/09/2026): `media.draw {prompt,
// slot:"<its own key form>"}` in place of `{prompt, like?:… | aspect?:"16/10"}`, and where the key is and
// what the slot spares the agent (` (key: inspect {slots:"image", page}; the slot sets the shape: no aspect,
// like or media.scan)`). 20 picture runs spent 2–8 calls finding the slot key, or sent the slot beside an
// aspect and were refused. The open surfaces keep 735.
const SLOT_DRAW = 66
const PICTURES = 'page.look · media.scan · media.draw · media.upload'

test('every action block follows T12: its parts in order, each missing one listed, within its budget', () => {
  /** @type {Set<string>} */
  const usedLeftOut = new Set()
  for (const s of SURFACES) {
    for (const readBack of [false, true]) {
      const blocks = siteToolBlocks(s, { wordpressReadBack: readBack })
      assert.equal(blocks[0].kind, 'lead', s)
      for (const b of blocks) {
        if (b.kind !== 'action') {
          assert.ok(b.text.length <= 400, `${s} ${b.kind}: ${b.text.length}`)
          continue
        }
        const head = headOf(b.text)
        const left = Object.hasOwn(LEFT_OUT, head) ? LEFT_OUT[head] : []
        if (left.length > 0) usedLeftOut.add(head)
        let last = -1
        for (const [part, label] of T12_PARTS) {
          const at = b.text.search(label)
          if (left.includes(part)) {
            assert.equal(at, -1, `${s}: "${head}" has ${part} again — take it off LEFT_OUT`)
            continue
          }
          assert.ok(at >= 0, `${s}: "${head}" has no ${part}`)
          assert.ok(at > last, `${s}: "${head}" says ${part} out of T12 order`)
          last = at
        }
        const bounds = readBack ? OVER_700_READ_BACK : OVER_700
        const base = Object.hasOwn(bounds, head) ? bounds[/** @type {keyof typeof bounds} */ (head)] : 700
        const max = head === PICTURES && slotSurface(s) ? base + SLOT_DRAW : base
        assert.ok(b.text.length <= max, `${s}: "${head}" is ${b.text.length} > ${max}`)
        assert.ok(!b.text.includes('\n'), `${s}: a block is one line`)
      }
    }
  }
  assert.deepEqual([...usedLeftOut].sort(), Object.keys(LEFT_OUT).sort(), 'a LEFT_OUT row no block uses')
})

/**
 * 🔒 7,391 characters for every site until this file (V6 of the plan measured r2's `tracy_site`). A
 * budget per surface, so the next sentence for one platform is added to that platform's description,
 * not to all of them. Measured WITHOUT the replace job's block (plan item 6: "surface description
 * minus the replace doc"), so the surface that gains `content.replace` in Wave 2 is not pushed over by
 * the one block the budget was never meant to hold.
 *
 * The three surfaces r3 measures are held to the plan's own budgets (joomla-sealed and
 * wordpress-sealed 3,700, EmDash 1,400; measured 25/09 with every T12 part: 3,680 · 3,687 · 1,398).
 * The two open ones are held to their measured length (4,421 and 4,753, rounded up to the next ten),
 * not to measured + 5 %: +16 % and +11 % over the plan's 3,800 / 4,300, which were set before the
 * blocks carried T12's USE WHEN, RETURNS, EFFECTS and REFUSALS parts. The trims paid for most of those
 * parts first (the lead lost its seat and recording clauses, the Joomla write block its second receipt
 * NOT, the tail its long form; open Joomla was 4,357 with no WHEN in any block) — so the next sentence
 * on an open surface has to be paid for too. The WordPress read-back fallback (plan D6′ (c)) is a
 * contingency that adds one clause to the write block, so it gets that clause's 100 on top.
 */
test('each description stays within its budget, the replace job left out', () => {
  // ⚠ +370 on the five Joomla/WordPress surfaces (25/09, Content API P5): `CONTENT_READ_BLOCK` is
  // 362 characters plus its line break. #341 set these budgets with `content.read` off every surface
  // (it was refused before the relay, `NOT_ON_THIS_PLATFORM`); the read is the Content API v1 door
  // (#347) and is restored here UNPAID — no other block was trimmed. The product owner kept the +370 on
  // 25/09/2026 rather than paying for it with a trim elsewhere.
  //
  // ⚠ +202 more on the two CONTRACT surfaces (the bridge approved 25/09): their content.read
  // block says a field's slotKey is the key of a content.contract apply's changes, and that the
  // apply leaves expected_revision out (this read's revision is not the contract's) — measured 564
  // against the plain block's 362, the whole description 4,043 → 4,245 (sealed Joomla) and
  // 3,965 → 4,167 (bound WordPress). The record surfaces keep the plain block: no slot door there.
  // +85 (30/09/2026, first call of an add): the plain block names a page the customer names as the first read,
  // 316 → 401 characters, and keeps {describe:true} for what the map cannot say. The two Joomla/WordPress rows of
  // the site context, which name the same read, got 6 and 2 characters shorter; and the steps it takes away are
  // the reason: the add-by-chat runs that read the describe first took 11.3 steps against 6.9. EmDash is
  // unchanged (`EMDASH_CONTENT_READ` below).
  const CONTENT_READ = 402
  const SLOT_BRIDGE = 178
  // Content API v2 (26/09/2026): the three content.read blocks became describe-first — the types,
  // fields, constraints, permissions and guidance travel with `{describe:true}`'s answer, not here —
  // and the contract bridge names the field's `next` apply: plain block 378 → 316, contract 580 → 494,
  // EmDash 611 → 549; with READ_NOT 61 → 44 the two contract surfaces lose 103 each (5,009 → 4,906
  // and 4,240 → 4,137). The constants below follow the new lengths; no budget grew.
  // +61 more on the two contract surfaces (25/09): the contract block's NOT sends a question that
  // only reads to content.read (see OVER_700).
  const READ_NOT = 44
  // +79 on the two contract surfaces (Content API v2 D2, 26/09): the contract block says an apply after
  // content.read needs no inspect (Tracy sends the revisions read). Paid out of the 103 each surface
  // gave back above: still 24 under the budget before describe-first.
  const APPLY_NO_INSPECT = 79
  // ⚠ +610 on EmDash (25/09): content.read joined its surface (#352 serves it through the
  // site's own reader) — its block, 595 characters plus a line break, and 14 in the lead's action
  // list; measured 1,398 → 2,008. Its bridge names the tracy_emdash entry and field instead of a
  // slot, and its refusal the road a site with no reader takes. Paid for by nothing else: the
  // map replaces the page.text/tracy_emdash hunt for which entry and field hold a word.
  // +10 of it (25/09, final acceptance on dev): the call shape names {type:"page", locale}, because an
  // unfiltered list mixed every language and the agent never reached the Home page the map lists.
  const EMDASH_CONTENT_READ = 558
  // ⚠ +115 on EmDash (27/09/2026): media.upload joined its surface — the lead's list, the pictures
  // block's head, its call `{file, alt?}` with the Files tab named, and `{id, url}`; measured 2,121 →
  // 2,236. Paid for by nothing else: without it the customer's own picture had no road on EmDash, and
  // the agent's own base64 or url looped 24–40 steps (7–12 min) on the local stand. The five other
  // surfaces pay for the same call themselves: `{file, alt?}` is 5 characters shorter than the
  // `{path, content_b64 ≤8 MiB, apply_id}` shape it replaced there.
  const EMDASH_UPLOAD = 115
  // +11: `media.scan {limit?:≤100 | id}` and its `{id, alt, url}` return on the EmDash pictures block.
  const MEDIA_SCAN_ID = 11
  // +52: `replaces` on the EmDash pictures block (see the budget below).
  const EMDASH_REPLACES = 52
  // ⚠ Tracy ADR 0022 (26/09/2026): a quickstart surface is its platform's open surface with the
  // contract on top, so its budget is COMPUTED as exactly that — the open budget, the contract block and
  // the difference between the contract's content.read block and the plain one — never typed by hand.
  // The unused sealed constants stay for the history of the numbers above.
  void [READ_NOT, APPLY_NO_INSPECT]
  // +LIST_SEARCH_JOOMLA / +LIST_SEARCH_WORDPRESS (30/09/2026): see the constants above OVER_700.
  // +APPLY_LIST_RECENT on both, +SITE_IDENTITY on Joomla (14/10/2026): see the constants above OVER_700.
  const joomla = 4430 + CONTENT_READ + LIST_SEARCH_JOOMLA + APPLY_LIST_RECENT + SITE_IDENTITY
  // +LIST_PATTERN_WORDPRESS (01/10/2026): see the constant above OVER_700.
  const wordpress = 4760 + CONTENT_READ + LIST_SEARCH_WORDPRESS + LIST_PATTERN_WORDPRESS + APPLY_LIST_RECENT
  const bridge = CONTRACT_CONTENT_READ_BLOCK.length - CONTENT_READ_BLOCK.length
  // Tiers (26/09/2026, Content API v2 plan V2-5): every surface carries one line naming the
  // destructive doors that ask the customer first — computed from the surface's own actions.
  const tiers = (/** @type {keyof typeof SURFACE_ACTIONS} */ s) =>
    tiersSentenceFor(SURFACE_ACTIONS[s], { multilingual: !String(s).endsWith('-derived') }).length + 1
  // +VERIFY_HEAD +VERIFY_STYLE on all six surfaces (suite v6 #3): the page.text and pictures blocks
  // every surface carries — see OVER_700.
  const verify = VERIFY_HEAD + VERIFY_STYLE
  const budget = {
    // +SLOT_DRAW on the two contract surfaces (30/09/2026): see OVER_700.
    'joomla-sealed':
      joomla +
      CONTRACT_BLOCK.length +
      1 +
      bridge +
      tiers('joomla-sealed') +
      verify +
      JOOMLA_PATCH +
      JOOMLA_JSON_TEXT +
      SLOT_DRAW,
    joomla: joomla + tiers('joomla') + verify + JOOMLA_PATCH + JOOMLA_JSON_TEXT,
    'wordpress-contract':
      wordpress +
      WORDPRESS_CONTRACT_BLOCK.length +
      1 +
      bridge +
      tiers('wordpress-contract') +
      W2_BLOCKS +
      verify +
      SLOT_DRAW,
    // +17 on the two WordPress record surfaces that carry content.replace (PR2 review, 27/09): the
    // content.update lead leaves words already on a page to the replace (see OVER_700).
    // +W2_BLOCKS on the three WordPress surfaces (see OVER_700).
    'wordpress-sealed': wordpress + 17 + tiers('wordpress-sealed') + W2_BLOCKS + verify,
    wordpress: wordpress + 17 + tiers('wordpress') + W2_BLOCKS + verify,
    // An imported copy with a derived contract (01/10/2026) is COMPUTED as its open surface, the slot bridge
    // on the map's block and the derived door — never typed by hand, as ADR 0022 does for a quickstart.
    'joomla-derived':
      joomla +
      tiers('joomla-derived') +
      verify +
      JOOMLA_PATCH +
      JOOMLA_JSON_TEXT +
      bridge +
      DERIVED_CONTRACT_BLOCK.length +
      1,
    'wordpress-derived':
      wordpress +
      17 +
      tiers('wordpress-derived') +
      W2_BLOCKS +
      verify +
      bridge +
      DERIVED_CONTRACT_BLOCK.length +
      1,
    // +80 on EmDash (26/09/2026: "EmDash media.draw" was the one open picture road — rounds 3–5
    // refused every redraw there): the pictures block gains media.draw {prompt, aspect} and the url
    // it hands to tracy_emdash content_update, worded to the bone (measured 2,736 against 2,657).
    // +EMDASH_UPLOAD (27/09/2026): media.upload joined the EmDash surface — see the constant.
    // +MEDIA_SCAN_ID (29/09/2026, v6 L2-01): media.scan {id} on EmDash copies one library picture where
    // read_image opens it; the alt is then written from the picture, not invented ("placeholder").
    // +EMDASH_REPLACES (30/09/2026): `media.draw {prompt, replaces:{collection, id, field} | aspect:"<w>:<h>" (a
    // new picture)}` in place of `{prompt, aspect:"16/10"}` — the door measures the picture the field
    // holds (v7: three EmDash picks drew at a shape the model guessed: 16/10, 5/4, 4/3; the picture is
    // 1000×880); "write its id" for "write its url" (the field holds the media id) is one character less.
    emdash:
      1400 +
      EMDASH_CONTENT_READ +
      80 +
      EMDASH_UPLOAD +
      MEDIA_SCAN_ID +
      EMDASH_REPLACES +
      tiers('emdash') +
      verify
  }
  void SLOT_BRIDGE
  const measured = (/** @type {any} */ s, /** @type {boolean} */ readBack) =>
    siteToolBlocks(s, { wordpressReadBack: readBack })
      .filter((b) => !/^(?:content\.replace|tracy_site_replace|page\.create)\b/.test(b.text))
      .map((b) => b.text)
      .join('\n').length
  // `page.create` (05/10/2026) is a one-call job like the replace: its block is left out of the surface
  // budgets above and bounded by its own length here (427 measured, one line, T12's parts in order).
  assert.ok(PAGE_CREATE_BLOCK.length <= 430, `page.create block: ${PAGE_CREATE_BLOCK.length}`)
  for (const [s, max] of Object.entries(budget)) {
    const plain = measured(s, false)
    assert.ok(plain <= max, `${s}: ${plain} > ${max}`)
    // Until the replace job is live on a surface, the filter removes nothing there.
    if (!SURFACE_ACTIONS[/** @type {keyof typeof SURFACE_ACTIONS} */ (s)].includes('content.replace'))
      assert.equal(plain, siteToolDescription(/** @type {any} */ (s)).length, s)
    const readBack = measured(s, true)
    assert.ok(readBack - plain <= 100, `${s}: the read-back fallback adds ${readBack - plain}`)
  }
})

test('the action parameter is an enum of the surface, and siteKey is gone', () => {
  for (const [surface, actions] of Object.entries(SURFACE_ACTIONS)) {
    const p = /** @type {any} */ (siteToolParameters(/** @type {any} */ (surface)))
    assert.deepEqual(p.properties.action.enum, [...actions])
    assert.equal(p.properties.siteKey, undefined)
    assert.deepEqual(p.required, ['action'])
    // H6: `comment` is the echo of the person's numbered comment (`comment-echo.mjs`), on every surface.
    assert.deepEqual(Object.keys(p.properties), ['action', 'params', 'comment'])
    // A fresh object each time: a caller that edits its copy cannot change the next agent's tool.
    p.properties.action.enum.push('x')
    assert.deepEqual(
      /** @type {any} */ (siteToolParameters(/** @type {any} */ (surface))).properties.action.enum,
      [...actions]
    )
  }
})

/**
 * 🔒 CS2 OF THE PLAN — A DESCRIPTION NEVER CARRIES A SITE'S OWN VALUES. The tools array follows the
 * system text in the cached prefix, so one site byte there makes every other site of the class miss the
 * cache from that point on. Two fixture sites per class: their descriptions and parameters must be
 * byte-identical, and hold none of their label, domain, container, folder, contract version, revision
 * or locale — nor a date, a clock time or a session id.
 */
test('🔒 two sites of one kind get byte-identical tools, free of either site', () => {
  const pairs = [
    [
      {
        label: 'j-1ibzqi',
        platform: 'joomla',
        sealed: true,
        contract: 'tracy-business/j6/1.1.0',
        locale: 'en-GB',
        revision: 'a3f9c2e1b7'
      },
      {
        label: 'j-7qd2mx',
        platform: 'joomla',
        sealed: true,
        contract: 'tracy-business/j6/1.2.0',
        locale: 'ru-RU',
        revision: '51cc0d9e22'
      }
    ],
    [
      { label: 'jopen-4k', platform: 'joomla', sealed: false, contract: '', locale: 'vi-VN', revision: '' },
      { label: 'jopen-9z', platform: 'joomla', sealed: false, contract: '', locale: 'de-DE', revision: '' }
    ],
    [
      {
        label: 'wp-dmlj6g',
        platform: 'wordpress',
        sealed: true,
        contract: 'tracy-business/wp7/1.1.0',
        locale: 'en_US',
        revision: ''
      },
      {
        label: 'wp-8hh1rt',
        platform: 'wordpress',
        sealed: true,
        contract: 'tracy-apple/wp7/1.3.0',
        locale: 'pt_BR',
        revision: ''
      }
    ],
    [
      {
        label: 'wp-bg36dd1',
        platform: 'wordpress',
        sealed: true,
        contractDoor: true,
        contract: 'tracy-business/wp7/1.1.0',
        locale: 'en_US',
        revision: '096791a521'
      },
      {
        label: 'wp-bg3hc0b',
        platform: 'wordpress',
        sealed: true,
        contractDoor: true,
        contract: 'tracy-business/wp7/1.2.0',
        locale: 'de_DE',
        revision: 'cbf9406fdf'
      }
    ],
    [
      {
        label: 'wpopen-a1',
        platform: 'wordpress',
        sealed: false,
        contract: '',
        locale: 'fr_FR',
        revision: ''
      },
      {
        label: 'wpopen-b2',
        platform: 'wordpress',
        sealed: false,
        contract: '',
        locale: 'es_ES',
        revision: ''
      }
    ],
    // Two imported copies of one platform with a derived contract (01/10/2026): the contract id names the copy.
    [
      {
        label: 'shop-example-com-1a2b3c4d',
        platform: 'joomla',
        sealed: false,
        derived: true,
        contract: 'derived/shop-example-com-1a2b3c4d',
        locale: 'fr-FR',
        revision: ''
      },
      {
        label: 'studio-example-org-5e6f7a8b',
        platform: 'joomla',
        sealed: false,
        derived: true,
        contract: 'derived/studio-example-org-5e6f7a8b',
        locale: 'it-IT',
        revision: ''
      }
    ],
    [
      {
        label: 'cafe-example-net-9c8d7e6f',
        platform: 'wordpress',
        sealed: false,
        derived: true,
        contract: 'derived/cafe-example-net-9c8d7e6f',
        locale: 'nl_NL',
        revision: ''
      },
      {
        label: 'farm-example-io-0a1b2c3d',
        platform: 'wordpress',
        sealed: false,
        derived: true,
        contract: 'derived/farm-example-io-0a1b2c3d',
        locale: 'sv_SE',
        revision: ''
      }
    ],
    [
      { label: 'ed-ivj9ni', platform: 'emdash', sealed: null, contract: '', locale: 'en', revision: '' },
      { label: 'ed-2kq7pa', platform: 'emdash', sealed: null, contract: '', locale: 'ja', revision: '' }
    ]
  ]
  const DOMAIN = 'tracy.test'
  for (const pair of pairs) {
    const rendered = pair.map((site) => {
      const surface = surfaceOf(site)
      assert.ok(surface !== null, site.label)
      return (
        siteToolDescription(surface) +
        JSON.stringify(siteToolParameters(surface)) +
        siteToolDescription(surface, { wordpressReadBack: true })
      )
    })
    assert.equal(rendered[0], rendered[1], `${pair[0].label} and ${pair[1].label} differ`)
    for (const site of pair) {
      const text = rendered[0]
      for (const value of [
        site.label,
        `${site.label}.${DOMAIN}`,
        DOMAIN,
        `${site.label}-web-1`,
        `/site/${site.label}`,
        site.contract,
        site.revision,
        `"${site.locale}"`,
        site.locale.length > 2 ? site.locale : null
      ].filter((v) => typeof v === 'string' && v !== ''))
        assert.ok(!text.includes(/** @type {string} */ (value)), `${site.label}: carries ${value}`)
    }
    // ⚠ The one version every site's description carries is the plugin release that reads `content.list {search}`
    // (30/09/2026: "Joomla 0.20.0+", "WordPress 0.16.0+"): the same words on every site of a platform, so it is
    // no site's own value — the byte-identity above is what proves that. Only those two exact forms are let past.
    const withoutReleases = Object.values(LIST_SEARCH_SINCE).reduce(
      (text, release) => text.replaceAll(`${release}+`, ''),
      rendered[0]
    )
    for (const pattern of [
      /\d+\.\d+\.\d+/, // a version
      /\b[a-z]{2}[-_][A-Z]{2}\b/, // a locale tag
      /\d{4}-\d{2}-\d{2}/, // a date
      /\b\d{1,2}:\d{2}\b/, // a clock time
      /session-/,
      /127\.0\.0\.1|localhost|:\d{4,5}\b/, // an address or a port
      /-web-1|\/site\//
    ])
      assert.doesNotMatch(withoutReleases, pattern, `${pair[0].platform}: ${pattern}`)
  }
})

test('the full description is the fallback, with the per-surface corrections in it', () => {
  const d = fullSiteToolDescription()
  // 🔒 The option read works (r2: 4 of 4); the old text forbade it.
  assert.doesNotMatch(d, /cannot read them back|WRITES options and cannot/)
  assert.match(d, /content\.get \{kind:"option", key:"<option_name>"\} reads it/)
  assert.match(d, /content\.get \{kind, id \| key\}/)
  assert.match(d, /\btemplatePart\b/)
  assert.match(d, /\bterm\b/)
  assert.ok(d.includes(CONTRACT_IDS_RULE))
  assert.ok(d.includes(CONTRACT_LANGUAGE_RULE))
  assert.ok(d.includes(APPLY_LIST_RULE))
  assert.ok(d.includes(PAGE_TEXT_BLOCK))
  assert.match(d, /Prepare mappings under docs\/agents/)
  // It names every action (it is the one text for a site nothing else fits).
  assert.deepEqual(named(d, KNOWN_ACTIONS).sort(), [...KNOWN_ACTIONS].sort())
  assert.doesNotMatch(d, /\b\d{1,2}:\d{2}\b/)
  assert.equal(fullSiteToolDescription(), d)
})

// ── T-D, the roster part ────────────────────────────────────────────────────────────────────────

/**
 * Every plugin a generated preset mounts, and the tools it registers — each pinned below against the
 * plugin's own source, so a plugin added to a preset (or a tool renamed) turns this red instead of
 * quietly riding past both masks. `dir` is under dsh's `packages/`; the one `@tracy/` row is read from
 * `packages/tools/tracy-webroot-read`.
 */
const PRESET_PLUGINS = /** @type {Record<string, { dir: string, tools: string[] }>} */ ({
  '@deepseek-ai/dsh-persona': { dir: 'preset/persona', tools: [] },
  '@deepseek-ai/dsh-agent-instructions': { dir: 'context/agent-instructions', tools: [] },
  '@deepseek-ai/dsh-tool-bash': { dir: 'shell/tool-bash', tools: ['bash'] },
  '@deepseek-ai/dsh-tool-jobs': { dir: 'jobs/tool-jobs', tools: ['job_list', 'job_output', 'job_kill'] },
  '@deepseek-ai/dsh-tool-fs': { dir: 'fs/tool-fs', tools: ['read', 'write', 'edit', 'read_image'] },
  '@deepseek-ai/dsh-tool-fs-search': { dir: 'fs/tool-fs-search', tools: ['grep', 'glob'] },
  '@deepseek-ai/dsh-skill-filesystem': { dir: 'skill/skill-filesystem', tools: [] },
  '@deepseek-ai/dsh-tool-skill': { dir: 'skill/tool-skill', tools: ['skill'] },
  '@deepseek-ai/dsh-plan-mode': { dir: 'plan/plan-mode', tools: ['exit_plan_mode'] },
  '@deepseek-ai/dsh-tool-todo': { dir: 'todo/tool-todo', tools: ['todo_write'] },
  '@deepseek-ai/dsh-tool-ask-user': { dir: 'interaction/tool-ask-user', tools: ['ask_user_question'] },
  '@deepseek-ai/dsh-compaction-basic': { dir: 'compaction/compaction-basic', tools: [] },
  '@deepseek-ai/dsh-command-compact': { dir: 'compaction/command-compact', tools: [] },
  '@deepseek-ai/dsh-compaction-tool-result-pruner': {
    dir: 'compaction/compaction-tool-result-pruner',
    tools: []
  },
  '@deepseek-ai/dsh-tool-web': { dir: 'web/tool-web', tools: ['web_search', 'web_fetch'] },
  '@tracy/dsh-webroot-read': { dir: '', tools: ['tracy_site_profile', 'tracy_find_definition'] }
})

const HARNESS = join(REPO, 'vendor/tracy/deepseek-harness/packages')
const PRESETS = join(PACKAGES, 'bundle/tracy-native/presets.patch.yml')

/** Every source file under a directory, concatenated. */
function sourceOf(/** @type {string} */ dir) {
  let text = ''
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) text += sourceOf(full)
    else if (/\.(ts|mjs|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
      text += readFileSync(full, 'utf8')
  }
  return text
}

/**
 * The generated presets: id → the plugin packages its standing mount names.
 * Since dsh 0.1.7 a preset is a `preset-<id>` row under the file's one `insert` block (written by
 * `scripts/gen-presets.ts`, fixed shape): `config.id` is the preset id, and every row nested in
 * `config.plugins` is an `- id:` line followed by its `name:` line, at any depth.
 */
function presetRosters() {
  /** @type {Map<string, string[]>} */
  const rosters = new Map()
  const rows = readFileSync(PRESETS, 'utf8')
    .split(/^ {4}- id: preset-/m)
    .slice(1)
  for (const row of rows) {
    const id = /^ {8}id: (\S+)$/m.exec(row)?.[1]
    const plugins = row.slice(row.search(/^ {8}plugins:$/m))
    assert.ok(id && plugins.length < row.length, `a preset row without config.id or config.plugins`)
    rosters.set(
      id,
      [...plugins.matchAll(/^\s+- id: \S+\n\s+name: '?([^'\n]+)'?$/gm)]
        .map((m) => m[1])
        .filter((name) => name !== 'cordis:group')
    )
  }
  return rosters
}

const toolsOf = (/** @type {string[]} */ plugins) => plugins.flatMap((p) => PRESET_PLUGINS[p]?.tools ?? [])

test('T-D roster: every plugin a generated preset mounts is known, and registers the tools named here', () => {
  const rosters = presetRosters()
  assert.ok(rosters.size >= 12, `${rosters.size} generated presets`)
  for (const [id, plugins] of rosters)
    for (const plugin of plugins)
      assert.ok(
        Object.hasOwn(PRESET_PLUGINS, plugin),
        `${id} mounts ${plugin}: decide what a sealed site and each platform do with its tools, then add it here`
      )
  for (const [plugin, { dir, tools }] of Object.entries(PRESET_PLUGINS)) {
    if (plugin.startsWith('@tracy/')) {
      const src = readFileSync(join(PACKAGES, 'tools/tracy-webroot-read/index.js'), 'utf8')
      for (const tool of tools) assert.match(src, new RegExp(`name: '${tool}'`), plugin)
      continue
    }
    const pkg = JSON.parse(readFileSync(join(HARNESS, dir, 'package.json'), 'utf8'))
    assert.equal(pkg.name, plugin, dir)
    const src = sourceOf(join(HARNESS, dir, 'src'))
    for (const tool of tools) assert.match(src, new RegExp(`['"]${tool}['"]`), `${plugin} registers ${tool}`)
    if (tools.length === 0)
      assert.doesNotMatch(src, /tools\.register\(|defineTool\(/, `${plugin} registers a tool`)
  }
})

/**
 * 🔒 THE MASKS ARE COMPUTED ONCE, FROM THE DEFAULT PRESET — SO IT MUST MOUNT EVERY TOOL ANY PRESET CAN.
 * Both the sealed deny list (`tracy-subprocess-docker`) and the platform mask (this file, via the
 * `agent/created` listener in `index.ts`) read `tools.schemas(agent)` once, when the agent is made, and
 * dsh's `restrict()` can only name tools the agent inherits then. A new session is created on the
 * bundle default and the mode picker re-links it to `<role>-<platform>` before its first turn
 * (`tracy-mode-picker` `presetForSite`; measured 14/09: `designer-joomla` 179 ms after creation). A
 * tool the re-linked preset mounts and the default does not would arrive unmasked: visible on a sealed
 * site, refused on use.
 */
test('T-D roster: the bundle default mounts every tool of every generated preset', () => {
  const bundle = readFileSync(join(PACKAGES, 'bundle/tracy-native/cordis.patch.yml'), 'utf8')
  const def = /- id: agent-preset-registry\n\s+config:\n\s+default: (\S+)/.exec(bundle)?.[1]
  assert.ok(def, 'the customer bundle names a default preset')
  const rosters = presetRosters()
  const defaultTools = new Set(toolsOf(rosters.get(def) ?? []))
  assert.ok(defaultTools.size > 0, `${def} is a generated preset`)
  for (const [id, plugins] of rosters)
    assert.deepEqual(
      toolsOf(plugins).filter((t) => !defaultTools.has(t)),
      [],
      `${id} mounts a tool the default ${def} does not, so a re-link would bring it in unmasked`
    )
  // The platform-only tools are the bundle's own, in every agent whatever the preset.
  for (const pkg of [
    '@tracy/dsh-site-tools',
    '@tracy/dsh-site-build-joomla',
    '@tracy/dsh-site-build-wordpress',
    '@tracy/dsh-site-build-emdash',
    '@tracy/dsh-webroot-read'
  ])
    assert.match(bundle, new RegExp(`name: '${escape(pkg)}'`), pkg)
})

test('the site tool never offers content.renderedWords: content.replace calls it itself', () => {
  assert.doesNotMatch(fullSiteToolDescription(), /content\.renderedWords/)
})
