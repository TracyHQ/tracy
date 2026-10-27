/**
 * ONE FACT, ONE PLACE — held across every text the model reads on one site (PLAN v2.1 IX1).
 *
 * 🔒 WHY A TEST OF ITS OWN. The texts are written in five modules by five owners — the site context
 * (`site-context.mjs`), the tool surface (`surface.mjs`), the refusals (`site.mjs` `refusalNext`), the
 * file search (`find.mjs`), the EmDash road (`emdash.mjs`) — and each module's own suite holds its own
 * text. None of them sees the others, so a context that sends the agent to an action its surface
 * refuses, or a budget `next` naming a parameter the door does not read, passes every suite and fails
 * the customer. Measured on r2 (25/09/2026): on WordPress the global action list offered
 * `content.contract` and C05/C24 tried it five times each; `{list: true} first` stood in seven texts
 * and 32 of 33 EmDash turns paid 49,977 characters for it; two texts told the model to make a
 * `request_id` while a third said Tracy makes it.
 *
 * The texts that live in FILES (the emdash-site skill, the persona, the preset row) are held by gate
 * `infra-contracts`; this suite holds only what the code renders.
 *
 *   node --test packages/tools/tracy-site-tools/test/consistency.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  EMDASH_BUDGETS,
  EMDASH_DESCRIPTION,
  EMDASH_LANGUAGE_RULE,
  EMDASH_PARAMETERS,
  normalizeEmdashShape,
  RECORD_FIELDS_KEY
} from '../src/host/emdash.mjs'
import { CONTENT_TYPES } from '../../../cms/tracy-content-api/validate.mjs'
import { contentFind } from '../src/host/find.mjs'
import { JOOMLA_READ_TYPES } from '../src/host/list-search.mjs'
import { ALLOWED_PARAMS, normalizeCall, WP_POST_FIELDS } from '../src/host/normalize.mjs'
import { joomlaListsOf, withPageLists, wordpressListsOf } from '../src/host/page-lists.mjs'
import { contentDoor, pageAnswer, pageRefusal } from '../src/host/page.mjs'
import { isFact, REPLACE_CONFIRM_OVER } from '../src/host/replace.mjs'
import { budgetFor, cutContentList } from '../src/host/site-call.mjs'
import { siteContext } from '../src/host/site-context.mjs'
import {
  CONTRACT_LANGUAGE_RULE,
  EMDASH_ROAD,
  LOCAL_ACTIONS,
  narrowInspect,
  planCall,
  RELAY_ACTIONS,
  refusalNext,
  WORDPRESS_CONTRACT_LANGUAGE_RULE,
  withNext
} from '../src/host/site.mjs'
import {
  CONTRACT_BLOCK,
  CONTRACT_IDS_RULE,
  fullSiteToolDescription,
  siteToolDescription,
  SURFACE_ACTIONS,
  WORDPRESS_CONTRACT_BLOCK
} from '../src/host/surface.mjs'
// The component's article columns, as the fake Joomla site of the replace tests lists them (`JoomlaSiteWriter::MAP`).
import { WRITABLE as JOOMLA_WRITABLE } from './fixtures/replace/fake-joomla-open.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name) => JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8'))

// `wordpress-contract` since the merge with #337: a WordPress site provision bound to its contract.
const SURFACES = /** @type {const} */ ([
  'joomla-sealed',
  'joomla',
  'wordpress-contract',
  'wordpress-sealed',
  'wordpress',
  'emdash'
])
/** @param {string} surface */
const platformOf = (surface) => surface.split('-')[0]
/** Whether a surface's site is sealed: both contract surfaces and the record-sealed one. */
const sealedSurface = (/** @type {string} */ surface) =>
  surface.endsWith('-sealed') || surface.endsWith('-contract')

/** EmDash 0.38's own tools and each one's `inputSchema` properties (`tools-0.38.json`). */
const EMDASH_TOOLS = new Map(fixture('emdash/tools-0.38.json').map((t) => [t.name, new Set(t.args)]))

const ACTIONS = [...LOCAL_ACTIONS, ...RELAY_ACTIONS]
/** Every `tracy_site` action a text names, as a whole token (`content.get`, not `content.get_x`). */
const actionsNamed = (/** @type {string} */ text) =>
  ACTIONS.filter((a) => new RegExp(`(^|[^\\w.])${a.replace('.', '\\.')}(?![\\w.])`).test(text))
/**
 * Every EmDash tool a text names: EmDash's own `family_verb` names. A family written with a wildcard
 * (`schema_delete_*`) stands for the tools that start with it, and is kept as `schema_delete_*`.
 */
const emdashToolsNamed = (/** @type {string} */ text) => [
  ...new Set(
    [
      ...text.matchAll(/\b((?:content|menu|media|schema|taxonomy|revision|settings|byline)_[a-z_]+)(\*)?/g)
    ].map((m) => (m[2] ? `${m[1]}*` : m[1].replace(/_+$/, '')))
  )
]
/** Whether EmDash 0.38 has the tool — or, for a `family_*` name, at least one tool of that family. */
const emdashHas = (/** @type {string} */ name) =>
  name.endsWith('*')
    ? [...EMDASH_TOOLS.keys()].some((t) => t.startsWith(name.slice(0, -1)))
    : EMDASH_TOOLS.has(name)

/** A site folder of one surface, as Add site and provision leave it (its seal marker beside it). */
function siteOf(surface) {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-consistency-'))
  const label = `c-${surface}`
  const folder = path.join(root, label)
  mkdirSync(path.join(folder, '.tracy'), { recursive: true })
  mkdirSync(path.join(folder, '.webroot'), { recursive: true })
  writeFileSync(
    path.join(folder, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: `${label}.tracy.test`, platform: platformOf(surface) })
  )
  writeFileSync(path.join(folder, 'AGENTS.md'), '# Site\n')
  if (sealedSurface(surface)) {
    mkdirSync(path.join(root, '.content-contracts'), { recursive: true })
    writeFileSync(
      path.join(root, '.content-contracts', `${label}.json`),
      JSON.stringify(
        surface === 'wordpress-contract'
          ? // What `provision/platform/wordpress.sh` writes for a release that pins a Claude Cowork plugin (#337).
            {
              contract: 'tracy-business/wp7/1.2.0',
              platform: 'wordpress',
              quickstart: 'tracy-business/wp7',
              coworkMinVersion: '0.12.1',
              coworkContractVersion: '0.13.2',
              policy: 1
            }
          : surface === 'wordpress-sealed'
            ? // …and for one that pins none: an empty coworkContractVersion.
              {
                contract: 'tracy-base/wp7/1.0.0',
                platform: 'wordpress',
                quickstart: 'tracy-base/wp7',
                coworkMinVersion: '0.8.0',
                coworkContractVersion: '',
                policy: 1
              }
            : { contract: 'tracy-business/j6/1.2.0' }
      )
    )
  }
  return { root, label, folder }
}

/** The site context each surface's agent reads. */
async function contexts() {
  /** @type {Record<string, string>} */
  const out = {}
  for (const surface of SURFACES) {
    const { label, folder } = siteOf(surface)
    const context = await siteContext(folder, label, async () => platformOf(surface), null)
    out[surface] = context?.text ?? ''
  }
  return out
}

test('every tracy_site action a rendered site context names is on that site’s surface', async () => {
  const all = await contexts()
  for (const surface of SURFACES) {
    assert.ok(all[surface].length > 0, surface)
    for (const named of actionsNamed(all[surface]))
      assert.ok(SURFACE_ACTIONS[surface].includes(named), `${surface} context names ${named}`)
  }
})

test('every next the r2 refusal corpus replays names only the actions of the surface it happened on', () => {
  // r2's stand: wp-dmlj6g (sealed WordPress), j-1ibzqi (sealed Joomla), ed-* (EmDash). The P3 suite
  // replays the same corpus on a copy of the lists; here they are the real SURFACE_ACTIONS.
  const { groups } = fixture('refusal-corpus-r2.json')
  let replayed = 0
  for (const g of groups) {
    if ((g.tool !== 'tracy_site' && g.tool !== 'tracy_emdash') || !g.answer || typeof g.answer !== 'object')
      continue
    const surface = g.site.startsWith('wp')
      ? 'wordpress-sealed'
      : g.site.startsWith('j')
        ? 'joomla-sealed'
        : 'emdash'
    const actions = SURFACE_ACTIONS[surface]
    const action = g.args?.action ?? null
    // A call this surface no longer offers is refused before the relay: its own test is below.
    if (g.tool === 'tracy_site' && action && !actions.includes(action)) continue
    const next =
      refusalNext(g.answer, {
        platform: platformOf(surface),
        action,
        actions,
        sealed: surface !== 'emdash',
        tool: g.args?.tool ?? null
      }) ?? ''
    replayed += 1
    for (const named of actionsNamed(next))
      assert.ok(actions.includes(named), `${g.code} on ${surface} names ${named}: ${next}`)
    for (const tool of emdashToolsNamed(next)) assert.ok(EMDASH_TOOLS.has(tool), `${g.code} names ${tool}`)
  }
  assert.ok(replayed >= 25, `replayed ${replayed}`)
})

test('an action a surface does not carry is refused before the relay, and its next names only that surface', () => {
  for (const surface of SURFACES) {
    const actions = SURFACE_ACTIONS[surface]
    for (const action of ACTIONS.filter((a) => !actions.includes(a))) {
      const plan = planCall({ action, params: {} }, { actions })
      assert.equal(plan.ok, false, `${surface} ${action}`)
      const answer = /** @type {Record<string, unknown>} */ (
        withNext(plan, {
          platform: platformOf(surface),
          sealed: sealedSurface(surface),
          actions,
          action
        })
      )
      assert.deepEqual(answer.actions, [...actions])
      // The refused action may be NAMED ("X is not on this site"); every road the next points to is
      // on the surface.
      for (const named of actionsNamed(String(answer.next ?? '')))
        assert.ok(named === action || actions.includes(named), `${surface} ${action}: next names ${named}`)
    }
  }
})

test('content.find’s refusals name only the surface’s own doors', async () => {
  for (const surface of ['joomla-sealed', 'wordpress-contract', 'wordpress-sealed', 'emdash']) {
    const { root, label } = siteOf(surface)
    const out = /** @type {Record<string, unknown>} */ (
      await contentFind(root, label, { text: 'Welcome' }, async () => platformOf(surface))
    )
    // A quickstart site's files are searched like any other's since ADR 0022; a refusal, when one
    // comes, still names only this surface's doors.
    if (out.ok !== false) continue
    const next = String(out.next ?? '')
    for (const named of actionsNamed(next))
      assert.ok(SURFACE_ACTIONS[surface].includes(named), `${surface}: ${named}`)
    for (const tool of emdashToolsNamed(next)) assert.ok(EMDASH_TOOLS.has(tool), tool)
  }
})

test('tracy_site on an EmDash site (EMDASH_SITE) points at tracy_emdash tools that exist, and at no action the site lacks', () => {
  for (const action of ACTIONS) {
    const next = refusalNext({ ok: false, code: 'EMDASH_SITE' }, { platform: 'emdash', action }) ?? ''
    assert.match(next, /tracy_emdash/, action)
    for (const named of actionsNamed(next))
      assert.ok(SURFACE_ACTIONS.emdash.includes(named), `${action}: ${named}`)
    for (const tool of emdashToolsNamed(next)) assert.ok(EMDASH_TOOLS.has(tool), `${action}: ${tool}`)
  }
})

test('every EmDash tool the EmDash texts name exists in EmDash 0.38', async () => {
  const all = await contexts()
  const texts = {
    description: EMDASH_DESCRIPTION,
    context: all.emdash,
    budgets: Object.values(EMDASH_BUDGETS)
      .flatMap((b) => [b.next ?? '', b.whole ?? ''])
      .join('\n')
  }
  for (const [where, text] of Object.entries(texts))
    for (const tool of emdashToolsNamed(text)) assert.ok(emdashHas(tool), `${where} names ${tool}`)
})

test('🔒 D29: no model-facing text says “{list: true} first”', async () => {
  const all = await contexts()
  const texts = {
    description: EMDASH_DESCRIPTION,
    parameters: JSON.stringify(EMDASH_PARAMETERS),
    context: all.emdash,
    // tracy_site's answer on an EmDash site, error and next as the model reads them (`index.ts`
    // answers `withNext({code:'EMDASH_SITE', error: EMDASH_ROAD}, {platform:'emdash', action})`) …
    road: ['content.update', 'content.get', 'apply.list']
      .map((action) => {
        const answer = /** @type {Record<string, unknown>} */ (
          withNext({ ok: false, code: 'EMDASH_SITE', error: EMDASH_ROAD }, { platform: 'emdash', action })
        )
        return `${answer.error}\n${answer.next}`
      })
      .join('\n'),
    // … and content.find's, where an EmDash site keeps no words in files.
    find: String(
      /** @type {Record<string, unknown>} */ (
        await (async () => {
          const { root, label } = siteOf('emdash')
          return contentFind(root, label, { text: 'x' }, async () => 'emdash')
        })()
      ).next
    )
  }
  assert.match(texts.road, /tracy_emdash/, 'the EMDASH_SITE answer names the EmDash door')
  const listFirst = [
    /\{\s*list\s*:\s*true\s*\}\)?\s*(first|before)/i,
    /(start with|first)[^.\n]{0,40}\{\s*list\s*:\s*true/i
  ]
  for (const [where, text] of Object.entries(texts))
    for (const pattern of listFirst) assert.doesNotMatch(text, pattern, where)
})

test('🔒 WP-27: no WordPress text asks for an apply_id per item — Tracy makes one per write', async () => {
  // Review, 25/09: the SEVERAL JOBS line told every open-door site "give each its own apply_id so
  // apply.revert undoes that item", while the WordPress tool text says the id is Tracy's, optional.
  const all = await contexts()
  const PER_ITEM =
    /its own `?apply_id|apply_id[^.]{0,60}(one per item|each item)|(one per item|each item)[^.]{0,60}apply_id/i
  for (const surface of /** @type {const} */ (['wordpress', 'wordpress-sealed'])) {
    assert.doesNotMatch(all[surface], PER_ITEM, `${surface} context`)
    for (const readBack of [false, true])
      assert.doesNotMatch(siteToolDescription(surface, { wordpressReadBack: readBack }), PER_ITEM, surface)
  }
  // Open Joomla, whose component requires an id on every write, keeps one per item.
  assert.match(all.joomla, PER_ITEM)
})

test('🔒 D9/T6: no text tells the model to choose a request_id — the only mention is T6, which says Tracy makes it', async () => {
  const all = await contexts()
  const texts = [
    fullSiteToolDescription(),
    ...SURFACES.flatMap((s) => [
      siteToolDescription(s),
      siteToolDescription(s, { wordpressReadBack: true }),
      all[s]
    ])
  ]
  for (const text of texts) {
    assert.doesNotMatch(text.replaceAll(CONTRACT_IDS_RULE, ''), /request_id/)
    assert.doesNotMatch(text, /request_id is any string/)
  }
})

// 09/10/2026: the rule was quoted by the context AND the CONTRACT block, the same constant twice on every step
// (178 characters on Joomla, 371 on WordPress). The context's WHERE row reaches every mode of a contract site,
// so it says the rule once and the block points at it.
test("🔒 T11: the contract language rule is ONE sentence, said once per step — by the contract site's context, which the CONTRACT block points at", async () => {
  const all = await contexts()
  assert.ok(all['joomla-sealed'].includes(CONTRACT_LANGUAGE_RULE))
  assert.ok(!CONTRACT_BLOCK.includes(CONTRACT_LANGUAGE_RULE))
  assert.ok(CONTRACT_BLOCK.includes("A slot's language: the site context's rule."))
  assert.ok(!siteToolDescription('joomla-sealed').includes(CONTRACT_LANGUAGE_RULE))
  // A bound WordPress site (#337) has its own sentence — one language listed, the others by edition
  // prefix — quoted verbatim by its context, pointed at by its CONTRACT block, and never Joomla's beside it.
  assert.ok(all['wordpress-contract'].includes(WORDPRESS_CONTRACT_LANGUAGE_RULE))
  assert.ok(!WORDPRESS_CONTRACT_BLOCK.includes(WORDPRESS_CONTRACT_LANGUAGE_RULE))
  assert.ok(
    WORDPRESS_CONTRACT_BLOCK.includes(
      "A slot's language and its other editions' keys: the site context's rule."
    )
  )
  assert.ok(!siteToolDescription('wordpress-contract').includes(WORDPRESS_CONTRACT_LANGUAGE_RULE))
  for (const text of [all['wordpress-contract'], siteToolDescription('wordpress-contract')])
    assert.ok(!text.includes(CONTRACT_LANGUAGE_RULE))
  for (const surface of SURFACES.filter((one) => one !== 'wordpress-contract'))
    assert.ok(!all[surface].includes(WORDPRESS_CONTRACT_LANGUAGE_RULE), surface)
})

/**
 * 🔒 J1 (26/09/2026): ONE FIRST STEP ON A CONTRACT SITE, SAID BY BOTH TEXTS. The door's block has sent
 * the agent content.read → ONE apply with no inspect since `753c6923c`, while the context row still
 * said "Find them with ONE inspect, then change them with ONE apply": two first steps in one prompt,
 * and the inspect is the 12–20 s one (19 inspects × 13.6 s on the 25/09 Joomla bench). Both texts now
 * name the read first and the inspect only for a slot the read does not show.
 */
test('🔒 J1: on both contract surfaces the site context and the CONTRACT block name the same first step — content.read, then ONE apply', async () => {
  const all = await contexts()
  for (const [surface, block] of /** @type {const} */ ([
    ['joomla-sealed', CONTRACT_BLOCK],
    ['wordpress-contract', WORDPRESS_CONTRACT_BLOCK]
  ])) {
    const row = all[surface].split('\n').find((line) => line.startsWith('- Where visible text lives:')) ?? ''
    // The contract part of the row (a replace road may stand before it, for words on a page).
    const from = row.indexOf("the content contract's slots")
    assert.ok(from >= 0, `${surface}: the row names the contract's slots`)
    const contract = row.slice(from)
    for (const [name, text, read, inspect] of [
      ['context', contract, '`content.read` shows them', 'Only when the read does not show the slot'],
      ['block', block, 'after content.read showed the slot', 'Only when content.read did not show the slot']
    ]) {
      const at = (/** @type {string} */ words) => text.indexOf(words)
      assert.ok(at(read) >= 0, `${surface} ${name}: names content.read as the first step`)
      assert.match(
        text,
        /ONE (?:apply|\{operation:"apply")[^.]*carrying every change/,
        `${surface} ${name}: ONE apply`
      )
      assert.ok(at(inspect) > at(read), `${surface} ${name}: the inspect is only the fallback`)
      assert.ok(at('operation:"inspect"') > at(inspect), `${surface} ${name}: no inspect before the read`)
    }
    assert.doesNotMatch(contract, /Find them with ONE|then change them with ONE apply/, surface)
  }
})

/**
 * 🔒 E1 (26/09/2026): EMDASH'S FACT RULE POINTS AT `content.replace`, AND SAYS WHAT THE ENGINE DOES.
 * The rule sent a fact down `content_translations` → get → update per language right after the
 * replace road said "FIRST, content.replace" (C21 + C22: 244 s, 170 of 408 calls, 25/09 bench). It
 * now names the replace first, and two of its claims are the engine's, not prose: which kinds need
 * no `all` (`isFact`) and past how many places `all` wants a dryRun (`REPLACE_CONFIRM_OVER`).
 */
test('🔒 E1: the EmDash fact rule sends a fact to content.replace first, with the engine’s own kinds and confirm count', async () => {
  const all = await contexts()
  assert.ok(all.emdash.includes(EMDASH_LANGUAGE_RULE), 'the EmDash context quotes the rule')
  assert.ok(SURFACE_ACTIONS.emdash.includes('content.replace'), 'content.replace is on the EmDash surface')
  assert.ok(
    EMDASH_LANGUAGE_RULE.indexOf('`content.replace') < EMDASH_LANGUAGE_RULE.indexOf('content_translations'),
    'the replace comes first; the per-language road is its fallback'
  )
  // The kinds said to need no `all` are facts by their own words; the ones the engine may miss take
  // `all` (review 26/09: hours or a legal line in another format, e.g. "Mon–Fri 9am–6pm" or a line
  // without ©, would otherwise change in the page's language only and answer ok).
  for (const sample of ['+1 (555) 010-7788', 'hello@example.com', 'https://x.com/acme'])
    assert.ok(isFact(sample), sample)
  for (const sample of ['12 Harbour Street, Springfield', '9am–6pm', 'Registered in England No. 0123456'])
    assert.ok(!isFact(sample), `${sample} is not a fact by its words, so the rule gives it all:true`)
  assert.match(
    EMDASH_LANGUAGE_RULE,
    /`all` reaches every place, and every language for opening hours, the legal or copyright line or an address; a phone, an e-mail or an https:\/\/ link reaches every language by itself/
  )
  // `all` rides on the call itself: places are not languages (27/09 A1 V4-words-01, top bar left behind).
  assert.ok(EMDASH_LANGUAGE_RULE.includes('`content.replace {find, replace, all:true}`'))
  // The number is the guard's: `all` over REPLACE_CONFIRM_OVER places is refused until a dryRun.
  assert.ok(EMDASH_LANGUAGE_RULE.includes(`over ${REPLACE_CONFIRM_OVER} places, \`dryRun:true\` first`))
  // The fallback is named by the two codes that send there, and both are codes the engine answers.
  // …and it agrees with NOT_FOUND's own next (page.text {match}, then the replace again) — review 26/09.
  assert.match(EMDASH_LANGUAGE_RULE, /Only on TOO_MANY, or NOT_FOUND again after its next:/)
})

/**
 * The parameters a `next` names: `word:` in a call shape, a word inside `{…}`, and the bare
 * narrowing words the budget sentences use (`limit sets how many`, `pass it as cursor`).
 */
function paramsNamed(/** @type {string} */ next) {
  // `word:` only where a value follows at once (`offset:25`, `name:"<slug>"`), never prose ("rows shown: …").
  const found = new Set([...next.matchAll(/\b([a-z][a-zA-Z_]*):(?=\S)/g)].map((m) => m[1]))
  for (const shape of next.matchAll(/\{([^}]*)\}/g))
    for (const part of shape[1].split(',')) {
      const key = /^\s*([a-z][a-zA-Z_]*)\??\s*(:|$)/.exec(part)?.[1]
      if (key) found.add(key)
    }
  for (const bare of ['limit', 'cursor', 'offset', 'maxChars', 'include_body'])
    if (new RegExp(`\\b${bare}\\b`).test(next)) found.add(bare)
  return [...found]
}

test('🔒 D26: every parameter a budget next names is one the door reads (V0 allowlist, or EmDash 0.38’s own inputSchema)', () => {
  // tracy_site's budgets (site-call.mjs `budgetFor`), both platforms, both list shapes.
  for (const platform of ['wordpress', 'joomla'])
    for (const [action, params] of [
      ['content.list', {}],
      ['content.list', { include_body: true }],
      ['db.dump', { table: 'posts' }]
    ]) {
      const rule = budgetFor(action, params, platform)
      assert.ok(rule !== null, `${platform} ${action}`)
      const allowed = ALLOWED_PARAMS[platform][action]
      for (const p of paramsNamed(rule.next(5)))
        assert.ok(allowed.includes(p), `${platform} ${action} next names ${p}`)
    }
  // content.read's listing cut (site-call.mjs `cutContentList`): the relay's own query keys
  // (`apps/tracy-web/src/sites/route.js` `contentQueryProblem`), not a CMS's.
  const contentKeys = ['id', 'type', 'locale', 'limit', 'cursor', 'blocksCursor', 'blockId', 'itemsCursor']
  const listing = /** @type {Record<string, any>} */ (
    cutContentList(
      {
        schemaVersion: 'tracy-content/v1',
        contents: Array.from({ length: 30 }, (_, i) => ({ id: `c-${i}`, title: 'x'.repeat(1_000) }))
      },
      { type: 'page' }
    )
  )
  assert.equal(listing.truncated, true, 'the fixture is over the listing budget')
  for (const p of paramsNamed(listing.next))
    assert.ok(contentKeys.includes(p), `content.read next names ${p}`)
  // The narrowed inspect's cut (site.mjs `narrowInspect`): match and offset, served from the snapshot.
  const slots = Array.from({ length: 800 }, (_, i) => ({
    key: `module-${i}.1`,
    entity: `module-${i}`,
    type: 'text',
    label: `Block ${i} / Title (en)`,
    current: 'Words '.repeat(12)
  }))
  const cut = /** @type {Record<string, any>} */ (
    narrowInspect({ ok: true, revision: 'r', slots, pages: [] }, { operation: 'inspect', slots: 'text' })
  )
  assert.ok(cut.truncated, 'the fixture is over the inspect budget')
  for (const p of paramsNamed(cut.next))
    assert.ok(ALLOWED_PARAMS.joomla['content.contract:inspect'].includes(p), `inspect next names ${p}`)
  // tracy_emdash's budgets (emdash.mjs `EMDASH_BUDGETS`): each call shape against its tool's schema.
  for (const [tool, rule] of Object.entries(EMDASH_BUDGETS))
    for (const text of [rule.next, rule.whole]) {
      if (!text || tool === 'list') continue
      for (const shape of text.matchAll(/\b([a-z_]+) \{([^}]*)\}/g)) {
        const schema = EMDASH_TOOLS.get(shape[1])
        assert.ok(schema, `${tool} names ${shape[1]}`)
        for (const p of paramsNamed(`{${shape[2]}}`))
          assert.ok(schema.has(p), `${tool}: ${shape[1]} has no ${p}`)
      }
      const own = EMDASH_TOOLS.get(tool)
      for (const bare of ['limit', 'cursor'])
        if (new RegExp(`\\b${bare}\\b`).test(text)) assert.ok(own?.has(bare), `${tool}: ${bare}`)
    }
  // page.text's own cut (T8): match and maxChars, both in T8's call shape.
  const long = pageAnswer(
    { lang: 'en', title: 'Home', text: 'A line of the page.\n'.repeat(400) },
    { url: 'http://x/', path: '/', params: {} }
  )
  const t8 = ['path', 'match', 'maxChars', 'outline', 'paths']
  for (const p of paramsNamed(String(long.next))) assert.ok(t8.includes(p), `page.text next names ${p}`)
})

test('🔒 content.list search (30/09/2026): every content.list call a refusal or a cut names is one the door reads, the road to search is one of them, and the refusal of an older plugin never offers it and never names a road that does not exist for the kind', () => {
  const list = (/** @type {string} */ platform) => [...ALLOWED_PARAMS[platform]['content.list']]
  for (const platform of ['joomla', 'wordpress'])
    for (const sealed of [true, false]) {
      const facts = { platform, sealed, action: 'content.list' }
      const stray = refusalNext(
        {
          ok: false,
          code: 'UNKNOWN_PARAM',
          action: 'content.list',
          platform,
          given: ['query'],
          allowed: list(platform)
        },
        facts
      )
      const language = refusalNext(
        {
          ok: false,
          code: 'UNKNOWN_PARAM',
          action: 'content.list',
          platform,
          given: ['language'],
          allowed: list(platform)
        },
        facts
      )
      const older = refusalNext({ ok: false, httpStatus: 501, code: 'LIST_SEARCH_UNSUPPORTED' }, facts)
      const cut = budgetFor('content.list', {}, platform)?.next(76)
      for (const next of [stray, language, older, cut]) {
        assert.equal(typeof next, 'string', platform)
        const shapes = [...String(next).matchAll(/content\.list \{([^}]*)\}/g)].map((m) => m[1])
        for (const shape of shapes)
          for (const p of paramsNamed(`{${shape}}`))
            assert.ok(list(platform).includes(p), `${platform}: ${next} names ${p}`)
      }
      assert.match(
        String(stray),
        /content\.list \{[^}]*\bsearch:"<part of the title>"/,
        `${platform}: the road to search`
      )
      assert.match(String(cut), /; search:"<part of the title>" finds one by its title\.$/, platform)
      assert.ok(list(platform).includes('search'), platform)
      // The plugin just said it does not read `search`: with no kind named (an article, a post) the roads left
      // are content.read and the words; `content.list` paged is the road for a kind content.read does not list.
      assert.doesNotMatch(String(older), /search:"/, platform)
      assert.match(String(older), /content\.read \{type:"article", locale, fields:"title,slug"\}/, platform)
    }

  // 🔒 A ROAD A REFUSAL NAMES EXISTS FOR THE KIND ASKED (review, 30/09/2026). `content.read` lists the Content
  // API's types, not the plugin's kinds: an article, a menu item (`page`) and a module (`shared`) are in it; a
  // category, a banner, a language… are not, and `content.read {type:"banner"}` is refused CONTENT_BAD_QUERY.
  // So for every kind the Joomla description offers: the refusal of an older plugin, and the road a stray key
  // is given, name `content.read` exactly where it lists the kind, and the same call paged everywhere else.
  const kinds = (/kind ∈ \{([^}]*)\}/.exec(siteToolDescription('joomla'))?.[1] ?? '')
    .split(',')
    .map((k) => k.trim())
  assert.ok(kinds.length >= 18 && kinds.includes('banner') && kinds.includes('article'), kinds.join(','))
  for (const [kind, type] of Object.entries(JOOMLA_READ_TYPES)) {
    assert.ok(kinds.includes(kind), `${kind} is a kind the description offers`)
    assert.ok(CONTENT_TYPES.includes(type), `${kind} is listed under ${type}: a type of the Content API`)
  }
  const joomlaList = (/** @type {string} */ platform) => [...ALLOWED_PARAMS[platform]['content.list']]
  for (const sealed of [true, false])
    for (const kind of kinds) {
      const facts = { platform: 'joomla', sealed, action: 'content.list' }
      const older = String(
        refusalNext(
          { ok: false, httpStatus: 501, code: 'LIST_SEARCH_UNSUPPORTED' },
          { ...facts, asked: { kind, search: 'x' } }
        )
      )
      const stray = String(
        refusalNext(
          {
            ok: false,
            code: 'UNKNOWN_PARAM',
            action: 'content.list',
            platform: 'joomla',
            given: ['query'],
            allowed: joomlaList('joomla')
          },
          { ...facts, asked: { kind, query: 'x' } }
        )
      )
      const listed = Object.hasOwn(JOOMLA_READ_TYPES, kind)
      for (const next of [older, stray]) {
        assert.ok(next.length <= 200, `${kind}: ${next.length} chars`)
        for (const shape of [...next.matchAll(/content\.list \{([^}]*)\}/g)].map((m) => m[1]))
          for (const p of paramsNamed(`{${shape}}`))
            assert.ok(joomlaList('joomla').includes(p), `${kind}: ${next} names ${p}`)
        assert.equal(/content\.read/.test(next), listed, `${kind}: ${next}`)
        assert.equal(/a page at a time/.test(next), !listed, `${kind}: ${next}`)
      }
      assert.doesNotMatch(older, /search:"/, kind)
    }
})

test('🔒 D34: CONFIRM_FIRST’s next names only ask_user_question and the call it refused', () => {
  const next =
    refusalNext({ ok: false, code: 'CONFIRM_FIRST', tool: 'content_delete', target: 'posts/about' }) ?? ''
  assert.match(next, /ask_user_question/)
  assert.deepEqual(actionsNamed(next), [])
  assert.deepEqual(emdashToolsNamed(next), [])
  assert.ok(next.length <= 200)
})

// 🔒 F3 (27/09/2026): an entry in several languages is one question. F3.2 (30/09/2026): and ONE call —
// the same call, confirmed, removes every language; the next no longer sends the agent down the rows.
test('🔒 D34: CONFIRM_FIRST for an entry in several languages says one answer and one call cover them', () => {
  const refusal = {
    ok: false,
    code: 'CONFIRM_FIRST',
    tool: 'content_delete',
    target: 'posts "hello-world" in all 3 languages',
    languages: 3
  }
  const next = refusalNext(refusal) ?? ''
  assert.match(next, /ask_user_question/)
  assert.match(next, /one answer covers every language/)
  assert.match(next, /the same call with confirm:true removes them all/)
  assert.doesNotMatch(next, /each id/)
  assert.deepEqual(actionsNamed(next), [])
  assert.deepEqual(emdashToolsNamed(next), [])
  assert.ok(next.length <= 200, `${next.length} chars`)
})

/**
 * 🔒 EVERY MODE'S RENDERING IS HELD TO THE SAME DOORS (28/09/2026). A mode without a shell or a plan
 * reads other roads (`toolReach`), and the SEO/GEO mode reads its search line (`SEO_EXTRA`): renderings
 * of their own, each checked against the surface — and EmDash's against EmDash's tools.
 */
test('the no-shell SEO/GEO rendering names only doors its site has, and no shell or plan tool', async () => {
  const noShell = [
    'ask_user_question',
    'edit',
    'glob',
    'grep',
    'read',
    'read_image',
    'skill',
    'tracy_site',
    'tracy_emdash',
    'web_fetch',
    'web_search',
    'write'
  ]
  for (const surface of SURFACES) {
    const { label, folder } = siteOf(surface)
    const platform = platformOf(surface)
    const context = await siteContext(folder, label, async () => platform, `seo-geo-${platform}`, {
      tools: noShell
    })
    const text = context?.text ?? ''
    assert.match(text, /- Search \(SEO\/GEO\): `tracy_site page\.text \{path, head:true\}`/, surface)
    assert.doesNotMatch(text, /\bbash\b|todo_write|grep -rn|wp-cli|php cli/, surface)
    for (const named of actionsNamed(text))
      assert.ok(SURFACE_ACTIONS[surface].includes(named), `${surface} context names ${named}`)
    if (platform === 'emdash')
      for (const tool of emdashToolsNamed(text)) assert.ok(emdashHas(tool), `${surface} names ${tool}`)
  }
})

/**
 * 🔒 FIX A OF perf/round7: THE CREATE RECIPE THE CONTEXT TEACHES IS A CALL THE DOOR TAKES. The row
 * (`ADD_RECORD`, site-context.mjs) is sent on every step of every session, so a field the door does not
 * know would misdirect every add of its platform — WordPress drops a leftover field silently beside a
 * valid one, Joomla's component whitelists its columns, EmDash validates against the collection. The
 * names are read OUT OF THE ROW's own text and held to the door's tables, and the example call the row
 * spells is planned and normalised the way `tracy_site` does, so a row edited into a call the door would
 * refuse turns this suite red instead of the customer's add.
 */
const addRecordRow = (/** @type {string} */ text) =>
  text.split('\n').find((line) => line.startsWith('- Adding a record:')) ?? ''

/** The comma-separated names of the `{…}` group that follows `opener`, top-level only, `name:value` cut to `name`. */
function namesAfter(/** @type {string} */ row, /** @type {string} */ opener) {
  const at = row.indexOf(opener)
  assert.ok(at >= 0, `the row has no ${opener}`)
  let depth = 0
  const parts = [/** @type {string} */ ('')]
  for (const ch of row.slice(at + opener.length)) {
    if (ch === '{') depth += 1
    if (ch === '}') {
      if (depth === 0) break
      depth -= 1
    }
    if (ch === ',' && depth === 0) parts.push('')
    else parts[parts.length - 1] += ch
  }
  return parts.map((part) => part.trim().split(':')[0]).filter((name) => name !== '')
}

/**
 * 🔒 FIRST CALL OF AN ADD (30/09/2026): the row names the read, and the CREATE it is answered with is the
 * skeleton of `page-lists.mjs`, not text in the row. That skeleton is a call the door takes — its field
 * names are held to the door's tables and it is planned and normalised the way `tracy_site` does, so a
 * skeleton edited into a call the door would refuse turns this suite red, not the customer's add. What
 * stays in the row (the fields it spells for a page whose lists could not be read) is held the same way.
 */
/** A value for each field a skeleton may hold: real data where the skeleton holds a placeholder. */
const ADD_VALUES = /** @type {Record<string, unknown>} */ ({
  title: 'A title',
  introtext: '<p>A paragraph.</p>',
  publish_up: '2026-09-15 00:00:00',
  post_title: 'A title',
  post_content: '<!-- wp:paragraph --><p>A paragraph.</p><!-- /wp:paragraph -->'
})
/**
 * The skeleton's call with every placeholder (a string that opens with `<`) replaced by a real value.
 * @param {any} create
 */
function filled(create) {
  const fields = Object.fromEntries(
    Object.entries(create.params.fields).map(([name, value]) => {
      if (typeof value !== 'string' || !value.startsWith('<')) return [name, value]
      assert.ok(
        name in ADD_VALUES,
        `the skeleton holds a placeholder for ${name}, which this test has no value for`
      )
      return [name, ADD_VALUES[name]]
    })
  )
  const params = { ...create.params, fields }
  if (typeof params.apply_id === 'string' && params.apply_id.startsWith('<')) params.apply_id = 'add-1'
  return { action: create.action, params }
}

test('🔒 first call of an add: what a WordPress page’s lists answer is a create the door takes, unchanged, whatever the page lists', () => {
  const shapes = /** @type {Array<[string, any[], string[]]>} */ ([
    ['every post', [{ query: { postType: 'post' } }], ['post_title', 'post_content', 'post_status']],
    [
      'one category by id',
      [{ query: { postType: 'post', taxQuery: { category: [12] } } }],
      ['post_title', 'post_content', 'post_status', 'post_category']
    ],
    [
      'one category by slug',
      [{ query: { postType: 'post', wpJaVegaCategory: 'blogs' } }],
      ['post_title', 'post_content', 'post_status', 'categories']
    ],
    ['pages', [{ query: { postType: 'page' } }], ['post_title', 'post_content', 'post_status']]
  ])
  for (const [label, queries, names] of shapes) {
    const lists = /** @type {any} */ (wordpressListsOf(queries))
    assert.deepEqual(Object.keys(lists.create.params.fields), names, label)
    for (const name of names) assert.ok(WP_POST_FIELDS.includes(name), `${label}: ${name} is no post field`)
    assert.equal(lists.create.params.fields.post_status, 'publish', label)
    assert.equal('id' in lists.create.params, false, `${label}: no id — the component reads that as a create`)
    const call = filled(lists.create)
    const plan = planCall(call)
    assert.ok(plan.ok, label)
    const answer = /** @type {any} */ (
      normalizeCall(plan.action, plan.params, {
        platform: 'wordpress',
        wpApplyId: 'wp-turn-1',
        mint: (/** @type {string} */ p) => `${p}-minted`
      })
    )
    assert.equal(answer.kind, 'relay', `${label}: ${JSON.stringify(answer.answer ?? null)}`)
    assert.equal(answer.params.id, undefined, label)
    // A page is written by the door as one: `kind:"page"` becomes the post record of type page (WP-21) — the
    // one thing the door does; nothing else the skeleton spells needed a correction.
    assert.equal(answer.params.kind, 'post', label)
    const expected =
      lists.postType === 'page' ? { ...call.params.fields, post_type: 'page' } : call.params.fields
    assert.deepEqual(answer.params.fields, expected, `${label}: nothing in the call needed a correction`)
  }
})

test('🔒 first call of an add: the note of a WordPress page whose listing the host cannot reduce names a read and two post fields, all the door’s', async () => {
  // A page that holds a query the module cannot read gets a note and no create; what the note tells the model to
  // read and to set are held to the door's tables, as the skeleton's fields are.
  const body = '<!-- wp:query {"queryId":2,"query":{"postType":"post","author":"3"}} -->\n<!-- /wp:query -->'
  const asked = {
    schemaVersion: 'tracy-content-pages/v1',
    link: '/news',
    truncated: false,
    pages: [{ type: 'page', native: [{ kind: 'post', id: 51 }] }]
  }
  const out = /** @type {any} */ (
    await withPageLists(asked, {
      platform: 'wordpress',
      read: async () => ({ ok: true, item: { post_content: body } })
    })
  )
  const { note } = out.pages[0].lists
  assert.ok(note.includes('content.get {kind:"post", id:51}'), 'the read of the page’s own post, by its id')
  const plan = planCall({ action: 'content.get', params: { kind: 'post', id: 51 } })
  assert.ok(plan.ok)
  const relayed = /** @type {any} */ (normalizeCall(plan.action, plan.params, { platform: 'wordpress' }))
  assert.equal(relayed.kind, 'relay', JSON.stringify(relayed.answer ?? null))
  for (const name of ['post_category', 'post_parent']) {
    assert.ok(note.includes(name), `the note names ${name}`)
    assert.ok(WP_POST_FIELDS.includes(name), `${name} is no post field`)
  }
})

test('🔒 first call of an add: what a Joomla page’s lists answer is a create the component takes, unchanged', () => {
  for (const language of ['en-GB', '*', '']) {
    const lists = /** @type {any} */ (joomlaListsOf({ catid: 12, language, subcategories: 0 }))
    const names = Object.keys(lists.create.params.fields)
    assert.deepEqual(
      names,
      ['title', 'catid', 'state', ...(language === '' ? [] : ['language']), 'publish_up', 'introtext'],
      language
    )
    for (const name of names)
      assert.ok(JOOMLA_WRITABLE.article.includes(name), `${language}: ${name} is no article column`)
    assert.equal(lists.create.params.fields.state, 1)
    assert.equal(lists.create.params.kind, 'article')
    assert.equal('id' in lists.create.params, false)
    const call = filled(lists.create)
    // Joomla's component refuses a write with no apply_id, and the skeleton still has a slot for the model's (J-6 mints one left out).
    assert.equal(typeof call.params.apply_id, 'string')
    const plan = planCall(call)
    assert.ok(plan.ok, language)
    const answer = /** @type {any} */ (normalizeCall(plan.action, plan.params, { platform: 'joomla' }))
    assert.equal(answer.kind, 'relay', `${language}: ${JSON.stringify(answer.answer ?? null)}`)
    assert.equal(answer.params.id, undefined, 'no id: the component reads that as a create')
    assert.deepEqual(
      answer.params.fields,
      call.params.fields,
      `${language}: nothing in the call needed a correction`
    )
  }
})

test('🔒 first call of an add: the WordPress row names the read and the fields it falls back to, all of them the door’s', async () => {
  const all = await contexts()
  for (const surface of ['wordpress', 'wordpress-sealed', 'wordpress-contract']) {
    const row = addRecordRow(all[surface])
    assert.ok(row.length > 0, `${surface} has the row`)
    assert.match(
      row,
      /`content\.read \{view:"pages", url:<the page>\}` answers `lists\.create`, the call to fill/,
      surface
    )
    // The read is an action of the surface, and the row spells the write it falls back to.
    assert.ok(
      SURFACE_ACTIONS[surface].includes('content.read'),
      `${surface}: the first call is on the surface`
    )
    const names = namesAfter(row, 'kind:"post", fields:{')
    assert.deepEqual(names, ['post_title', 'post_content', 'post_status'], surface)
    for (const name of names) assert.ok(WP_POST_FIELDS.includes(name), `${surface}: ${name} is no post field`)
    assert.match(row, /post_status:"publish"/)
    assert.match(row, /a page: `kind:"page"`/)
    // The formats it spells are the ones the skeleton sends.
    const lists = /** @type {any} */ (wordpressListsOf([{ query: { postType: 'post' } }]))
    assert.match(row, /post_date:"YYYY-MM-DD 00:00:00"/)
    assert.match(lists.create.params.fields.post_content, /^<!-- wp:paragraph -->/)
    assert.match(row, /`post_content` as `<!-- wp:paragraph -->` blocks/)
    // The category of a filtered page is the door's to fill now, not the row's to say.
    assert.doesNotMatch(row, /post_category|taxQuery/, surface)
  }
})

test('🔒 first call of an add: the Joomla row names the read, the fields it falls back to and the road to the category', async () => {
  const all = await contexts()
  for (const surface of ['joomla', 'joomla-sealed']) {
    const row = addRecordRow(all[surface])
    assert.ok(row.length > 0, `${surface} has the row`)
    assert.match(
      row,
      /`content\.read \{view:"pages", url:<the page>\}` answers `lists\.create`, the call to fill/,
      surface
    )
    assert.ok(
      SURFACE_ACTIONS[surface].includes('content.read'),
      `${surface}: the first call is on the surface`
    )
    const names = namesAfter(row, 'kind:"article", fields:{')
    assert.deepEqual(names, ['title', 'catid', 'state', 'language', 'publish_up', 'introtext'], surface)
    for (const name of names)
      assert.ok(JOOMLA_WRITABLE.article.includes(name), `${surface}: ${name} is no article column`)
    // Joomla's component refuses a write with no apply_id: the row says the model names it (J-6 mints one left out).
    assert.match(row, /fields:\{[^}]*\}, apply_id`/)
    assert.match(row, /publish_up:"YYYY-MM-DD 00:00:00"/)
    // Without lists, the category is where the page's menu item says: the same read the model would make.
    assert.match(
      row,
      /`catid` is `id=` in its `native` menuItem's `link` \(`content\.get \{kind:"menuItem", id\}`\)/
    )
    assert.ok(SURFACE_ACTIONS[surface].includes('content.get'), surface)
    // It no longer sends the model to a door that lists every category and cannot say which one a page lists.
    assert.doesNotMatch(row, /content\.list/, surface)
    // A new PAGE is an article AND its menu item: the row points at `page.create`, which makes both in one
    // call, rather than leave the modes without a Writer line an article no menu reaches.
    assert.match(row, /A new PAGE with its menu item: `page\.create`\.$/, surface)
    assert.ok(SURFACE_ACTIONS[surface].includes('page.create'), surface)
  }
})

test('🔒 fix A: the EmDash create recipe names only tools and arguments EmDash 0.38 has, and the call it spells needs no repair', async () => {
  const row = addRecordRow((await contexts()).emdash)
  assert.ok(row.length > 0, 'EmDash has the row')
  for (const tool of emdashToolsNamed(row)) assert.ok(emdashHas(tool), `the row names ${tool}`)
  assert.deepEqual(emdashToolsNamed(row).sort(), [
    'content_create',
    'schema_get_collection',
    'schema_list_collections'
  ])
  const names = namesAfter(row, 'content_create {')
  const args = EMDASH_TOOLS.get('content_create')
  assert.ok(args, 'content_create is an EmDash tool')
  for (const name of names) assert.ok(args.has(name), `content_create takes no ${name}`)
  assert.deepEqual(names, ['collection', 'slug', 'status', 'data'])
  assert.match(row, /status:"published"/)
  // …and `schema_get_collection {slug}`: its one argument is `slug`.
  assert.ok(EMDASH_TOOLS.get('schema_get_collection')?.has('slug'))
  const shape = /** @type {any} */ (
    normalizeEmdashShape({
      tool: 'content_create',
      arguments: {
        collection: 'posts',
        slug: 'a-title',
        status: 'published',
        data: { title: 'A title', date: '2026-09-15T09:00:00.000Z', content: 'A paragraph.' }
      }
    })
  )
  assert.equal(shape.ok, true)
  assert.equal(shape.tool, 'content_create')
  assert.deepEqual(shape.notes ?? [], [], 'the call the row spells needs no correction')
  // The list a listing page's entries are found in answers labels: the row says so, and the tool answers them.
  assert.match(row, /collection LABELLED like the listing page/)
  // F4: the key the row says the list answers is the key the door writes, and the read the row keeps as the
  // fallback is the one for a collection the list did not cover.
  assert.ok(row.includes(`\`${RECORD_FIELDS_KEY}\``), `the row names ${RECORD_FIELDS_KEY}`)
  assert.match(row, /\(else `schema_get_collection \{slug\}`\)/)
  assert.doesNotMatch(row, /its fields —/, 'the schema step is no longer the road')
})

test('🔒 fix A: every mode of a site reads the same create recipe, and it says to add only what the customer gave', async () => {
  const modes = ['designer', 'developer', 'writer', 'seo-geo']
  for (const surface of SURFACES) {
    const { label, folder } = siteOf(surface)
    const platform = platformOf(surface)
    /** @type {Set<string>} */
    const seen = new Set()
    for (const role of modes) {
      const context = await siteContext(folder, label, async () => platform, `${role}-${platform}`, {
        tools:
          role === 'designer' || role === 'developer' ? ['bash', 'todo_write', 'tracy_site'] : ['tracy_site']
      })
      const rows = (context?.text ?? '').split('\n').filter((line) => line.startsWith('- Adding a record:'))
      assert.equal(rows.length, 1, `${surface} ${role}`)
      seen.add(rows[0])
      // The same bytes on a second read: one copy per (site, mode), never re-decided.
      const again = await siteContext(folder, label, async () => platform, `${role}-${platform}`, {
        tools:
          role === 'designer' || role === 'developer' ? ['bash', 'todo_write', 'tracy_site'] : ['tracy_site']
      })
      assert.equal(again?.text, context?.text, `${surface} ${role}: byte-stable`)
    }
    assert.equal(seen.size, 1, `${surface}: one row for every mode`)
    const [row] = [...seen]
    assert.match(row, /Only what the customer gave: [^\n]*other-language copy unless named\./, surface)
    // Sent on every step. WordPress and Joomla were 418 and 476 before the first call was named (30/09/2026):
    // the named read (`content.read … lists.create`) replaced the category and field-list clauses, so their
    // rows are shorter than that, and a row that grows back is a step-cost decision for every conversation,
    // not a wording change. EmDash keeps the 420 it had.
    const room = platform === 'joomla' ? 475 : platform === 'wordpress' ? 417 : 420
    assert.ok(row.length <= room, `${surface}: ${row.length} characters, ${room} allowed`)
  }
})

/**
 * 🔒 THE EMDASH ROAD A PAGE REFUSAL NAMES IS MADE OF TOOLS EMDASH HAS, AND OF NONE THAT CANNOT FIND A PAGE'S
 * WORDS (adversarial review of round 7, RL-1 and RL-2). It named `search`, whose index holds only the
 * collections that opt in — a page's own copy is in none (`page.test.mjs` holds that against the template
 * seeds) — and, for a slow read, `content.replace`, whose own index read is the slow one on EmDash.
 */
test('the EmDash road a page refusal names uses only tools EmDash 0.38 has, and neither search nor content.replace', () => {
  const door = contentDoor({ platform: 'emdash' })
  const slow = pageRefusal(
    /** @type {any} */ ({ why: 'slow', url: 'http://127.0.0.1/', detail: 'longer than 8 s' }),
    '/services',
    door
  ).next

  for (const text of [door, slow]) {
    for (const tool of emdashToolsNamed(text)) assert.ok(emdashHas(tool), `names ${tool}`)
    assert.doesNotMatch(text, /\bsearch\b|content\.replace/)
  }
  assert.deepEqual(emdashToolsNamed(door).sort(), ['content_list', 'schema_list_collections'])
  assert.deepEqual(emdashToolsNamed(slow).sort(), ['content_get', 'content_list', 'schema_list_collections'])
  // The arguments the road spells are ones the tools read.
  assert.ok(EMDASH_TOOLS.get('content_list')?.has('collection'))
  assert.ok(EMDASH_TOOLS.get('content_get')?.has('collection') && EMDASH_TOOLS.get('content_get')?.has('id'))
})
