/**
 * A WordPress block edit is made on the body it was read from (`rev`), the plugin checks it again inside
 * its lock when it can (`expected_body_revision`), and a registered pattern goes in by its name — all at
 * the `runSiteCall` seam, on a fake relay that holds one post and answers like the Claude Cowork plugin.
 *
 *   node --test packages/tools/tracy-site-tools/test/wp-block-rev.test.mjs
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { createCallMemory } from '../src/host/call-memory.mjs'
import { runSiteCall } from '../src/host/site-call.mjs'
import { planCall } from '../src/host/site.mjs'

const para = (/** @type {string} */ words) => `<!-- wp:paragraph -->\n<p>${words}</p>\n<!-- /wp:paragraph -->`
const HERO = para('Hero')
const SERVICES = para('Services')
const CONTACT = para('Contact')
const BODY = [HERO, SERVICES, CONTACT].join('\n\n')

/** The rev of a body, computed here the way the contract states it (§3.7): sha256 hex, first 12. */
const rev12 = (/** @type {string} */ body) =>
  createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 12)

/**
 * A WordPress plugin holding post 42, whose writes are kept. `revision`: it answers `body_revision` (the
 * full sha256 of the body) on reads and successful writes, and checks `expected_body_revision` — the
 * contract's new plugin; without it, the plugin of today, which ignores the key.
 * @param {{ body?: string, revision?: boolean, patterns?: Record<string, string> | 'refused' | 'unavailable' }} [o]
 */
function site({ body = BODY, revision = false, patterns = {} } = {}) {
  const post = { ID: 42, post_title: 'Home', post_type: 'page', post_content: body }
  const full = () => createHash('sha256').update(post.post_content, 'utf8').digest('hex')
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  /** Run before the plugin answers a write: the page changed by someone else in between. */
  let beforeWrite = () => {}
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    if (action === 'content.get' && params.kind === 'pattern') {
      if (patterns === 'refused')
        return {
          ok: false,
          error: 'bad_params',
          message: 'kind must be one of: post, postmeta, option, templatePart, term, menuItem'
        }
      if (patterns === 'unavailable')
        return { ok: false, error: 'unavailable', message: 'this plugin cannot read block patterns' }
      const content = patterns[params.key]
      if (content === undefined)
        return { ok: false, error: 'not_found', message: `no registered pattern named "${params.key}"` }
      return {
        ok: true,
        kind: 'pattern',
        id: 0,
        key: params.key,
        item: { id: 0, title: `Pattern ${params.key}`, content, source: 'registry' },
        stored: false
      }
    }
    if (action === 'content.get')
      return {
        ok: true,
        kind: 'post',
        id: 42,
        item: { ...post },
        ...(revision ? { body_revision: full() } : {})
      }
    if (action === 'content.update') {
      beforeWrite()
      if (
        revision &&
        typeof params.expected_body_revision === 'string' &&
        params.expected_body_revision !== full()
      )
        return {
          ok: false,
          error: 'revision_stale',
          message: 'the body changed since it was read',
          body_revision: full()
        }
      if (typeof params.fields?.post_content === 'string') post.post_content = params.fields.post_content
      return {
        ok: true,
        kind: 'post',
        id: 42,
        created: false,
        ...(revision ? { body_revision: full() } : {})
      }
    }
    return { ok: false, error: 'bad_action' }
  }
  return {
    post,
    sent,
    send,
    /** @param {() => void} fn */
    onWrite: (fn) => {
      beforeWrite = fn
    }
  }
}

const ctx = (/** @type {any} */ send) => ({
  memory: createCallMemory({ now: () => 1_000 }),
  sessionId: 'session-w',
  label: 'wp-dmlj6g',
  actorKey: 'ana@example.com',
  facts: { platform: 'wordpress', sealed: false },
  sleep: async () => {},
  send
})
/** One call as the model makes it. @param {Record<string, any>} c @param {Record<string, any>} args */
const call = async (c, args) => {
  const plan = planCall(args)
  assert.ok(plan.ok, JSON.stringify(plan))
  return /** @type {any} */ (await runSiteCall({ ...c, plan }))
}
const outline = { action: 'content.get', params: { kind: 'post', id: 42, outline: true } }
const writes = (/** @type {Array<[string, Record<string, any>]>} */ sent) =>
  sent.filter(([a]) => a === 'content.update').map(([, p]) => p)
const blocksWrite = (/** @type {Record<string, unknown>} */ params) => ({
  action: 'content.update',
  params: { kind: 'post', id: 42, ...params }
})

// ── Line A: `rev` ───────────────────────────────────────────────────────────────────────────────────

test('🔒 a page that changed between the outline read and the write is refused REVISION_STALE, nothing written', async () => {
  const wp = site()
  const c = ctx(wp.send)
  const read = await call(c, outline)
  // Someone adds a block on top in WordPress admin: every position moves by one.
  wp.post.post_content = `${para('New banner')}\n\n${BODY}`

  const out = await call(c, blocksWrite({ rev: read.rev, blocks: { 1: para('Services, new words') } }))

  assert.equal(out.code, 'REVISION_STALE')
  assert.equal(out.rev, rev12(wp.post.post_content), 'the rev of the body as it is now')
  assert.match(out.next, /content\.get \{kind:"post", id:42, outline:true\}/)
  assert.equal(writes(wp.sent).length, 0)
  assert.equal(
    wp.post.post_content,
    `${para('New banner')}\n\n${BODY}`,
    'the page is as the other edit left it'
  )
})

test('🔒 a write by position with no rev is refused BAD_PARAMS param:"rev" before anything is read or written', async () => {
  // Before 01/10/2026 this call replaced block 1 of whatever the body held at write time.
  const wp = site()

  const out = await call(ctx(wp.send), blocksWrite({ blocks: { 1: para('Services, new words') } }))

  assert.equal(out.code, 'BAD_PARAMS')
  assert.equal(out.param, 'rev')
  assert.match(out.next, /outline:true/)
  assert.equal(wp.sent.length, 0)
})

test('every body read carries the rev of the body as the plugin answered it: whole, outline, named blocks', async () => {
  const wp = site()
  const c = ctx(wp.send)

  const whole = await call(c, { action: 'content.get', params: { kind: 'post', id: 42 } })
  const listed = await call(c, outline)
  const named = await call(c, { action: 'content.get', params: { kind: 'post', id: 42, block: [1] } })

  assert.equal(whole.item.post_content, BODY, 'a short body is shown whole')
  assert.equal(whole.rev, rev12(BODY))
  assert.equal(listed.outline.length, 3)
  assert.equal(listed.rev, rev12(BODY))
  assert.equal(named.blocks[0].markup, SERVICES)
  assert.equal(named.rev, rev12(BODY))
  // The calls that follow name it, ready to send.
  assert.ok(listed.next.includes(`rev:"${rev12(BODY)}"`))
  assert.ok(named.next.includes(`rev:"${rev12(BODY)}"`))
})

test('a template part read carries its rev too, and a write by position to it is held to it', async () => {
  const part = `${para('Logo')}\n\n${para('Menu')}`
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const stored = { content: part }
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    if (action === 'content.get')
      return {
        ok: true,
        kind: 'templatePart',
        id: 7,
        key: 'header',
        item: { id: 7, title: 'Header', ...stored }
      }
    if (action === 'content.update') {
      stored.content = params.fields.content
      return { ok: true, kind: 'templatePart', id: 7, key: 'header', created: false }
    }
    return { ok: false, error: 'bad_action' }
  }
  const c = ctx(send)
  const read = await call(c, {
    action: 'content.get',
    params: { kind: 'templatePart', key: 'header', outline: true }
  })
  stored.content = `${para('Top bar')}\n\n${part}`

  const out = await call(c, {
    action: 'content.update',
    params: { kind: 'templatePart', key: 'header', rev: read.rev, blocks: { 1: para('Menu, new') } }
  })

  assert.equal(read.rev, rev12(part))
  assert.equal(out.code, 'REVISION_STALE')
  assert.match(out.next, /content\.get \{kind:"templatePart", key:"header", outline:true\}/)
  assert.equal(sent.filter(([a]) => a === 'content.update').length, 0)
})

test('a write made on the body it read lands, and answers the rev of the body READ BACK after it — not of the body sent', async () => {
  const wp = site()
  const c = ctx(wp.send)
  const read = await call(c, outline)
  // WordPress filters what it stores (KSES): the read-back is the truth, not what Tracy sent.
  wp.onWrite(() => {})
  const kses = wp.send
  const filtering = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    const got = await kses(action, params)
    if (action === 'content.update') wp.post.post_content = wp.post.post_content.replace(' onclick="x()"', '')
    return got
  }
  const c2 = { ...c, send: filtering }

  const out = await call(
    c2,
    blocksWrite({ rev: read.rev, blocks: { 1: para('<a onclick="x()">Services</a>') } })
  )

  assert.equal(out.ok, true)
  assert.equal(writes(wp.sent).length, 1)
  assert.equal(writes(wp.sent)[0].rev, undefined, 'rev is the host’s: never relayed')
  assert.equal(writes(wp.sent)[0].blocks, undefined)
  assert.equal(wp.post.post_content, [HERO, para('<a>Services</a>'), CONTACT].join('\n\n'))
  assert.equal(out.rev, rev12(wp.post.post_content))
})

test('no read-back after the write (the in-tool check is off) → no rev in the answer', async () => {
  const wp = site()
  const c = { ...ctx(wp.send), facts: { platform: 'wordpress', sealed: false, verifyBodyWrites: false } }
  const read = await call(c, outline)

  const out = await call(c, blocksWrite({ rev: read.rev, blocks: { 1: para('Services, new') } }))

  assert.equal(out.ok, true)
  assert.equal('rev' in out, false)
})

test('a call keyed only by metadata.name may leave rev out; sent stale, it is refused like any other', async () => {
  const named = `<!-- wp:paragraph {"metadata":{"name":"intro"}} -->\n<p>Intro</p>\n<!-- /wp:paragraph -->`
  const wp = site({ body: `${HERO}\n\n${named}` })
  const c = ctx(wp.send)
  const read = await call(c, outline)
  wp.post.post_content = `${para('New banner')}\n\n${wp.post.post_content}`

  const free = await call(c, blocksWrite({ blocks: { intro: { find: 'Intro', replace: 'Hello' } } }))
  const stale = await call(
    c,
    blocksWrite({ rev: read.rev, blocks: { intro: { find: 'Hello', replace: 'Hi' } } })
  )

  assert.equal(free.ok, true, 'found by what it holds, wherever it stands now')
  assert.match(wp.post.post_content, /<p>Hello<\/p>/)
  assert.equal(stale.code, 'REVISION_STALE')
  assert.equal(writes(wp.sent).length, 1)
})

test('a rev that is not one content.get answered is refused by name, nothing read', async () => {
  for (const rev of ['abc', 42, '', 'ZZZZZZZZZZZZ']) {
    const wp = site()

    const out = await call(ctx(wp.send), blocksWrite({ rev, blocks: { 1: para('x') } }))

    assert.equal(out.code, 'BAD_PARAMS', JSON.stringify(rev))
    assert.equal(out.param, 'rev')
    assert.equal(wp.sent.length, 0)
  }
})

test('expected_body_revision is the host’s word to the plugin: the model sending it is refused UNKNOWN_PARAM, nothing written', async () => {
  const cases = [
    {
      label: 'whole body',
      params: { fields: { post_content: BODY }, expected_body_revision: 'a'.repeat(64) }
    },
    {
      label: 'blocks',
      params: { rev: rev12(BODY), blocks: { 1: para('x') }, expected_body_revision: 'a'.repeat(64) }
    }
  ]
  for (const { label, params } of cases) {
    const wp = site({ revision: true })
    const c = ctx(wp.send)
    await call(c, { action: 'content.get', params: { kind: 'post', id: 42 } })

    const out = await call(c, blocksWrite(params))

    assert.equal(out.code, 'UNKNOWN_PARAM', label)
    assert.deepEqual(out.given, ['expected_body_revision'], label)
    assert.ok(out.allowed.includes('rev'), label)
    assert.equal(writes(wp.sent).length, 0, label)
  }
})

test('rev beside a whole body is Tracy’s and is never relayed', async () => {
  const wp = site()
  const c = ctx(wp.send)
  const read = await call(c, { action: 'content.get', params: { kind: 'post', id: 42 } })

  const out = await call(
    c,
    blocksWrite({ rev: read.rev, fields: { post_content: `${BODY}\n\n${para('More')}` } })
  )

  assert.equal(out.ok, true)
  assert.equal(writes(wp.sent)[0].rev, undefined)
})

// ── Line B (host half): the plugin's own check, inside its lock ───────────────────────────────────

const sha64 = (/** @type {string} */ body) => createHash('sha256').update(body, 'utf8').digest('hex')

test('a plugin whose read answers body_revision is sent it back as expected_body_revision; one that does not, never', async () => {
  for (const revision of [true, false]) {
    const wp = site({ revision })
    const c = ctx(wp.send)
    const read = await call(c, outline)

    const out = await call(c, blocksWrite({ rev: read.rev, blocks: { 1: para('Services, new') } }))

    assert.equal(out.ok, true, String(revision))
    const [sent] = writes(wp.sent)
    if (revision) assert.equal(sent.expected_body_revision, sha64(BODY), 'the read’s own value, as received')
    else assert.equal('expected_body_revision' in sent, false, 'an older plugin is written as before')
    assert.equal('unchecked' in out, false, String(revision))
  }
})

test('a whole-body write sends no expected_body_revision: the host read nothing for it', async () => {
  const wp = site({ revision: true })
  const c = ctx(wp.send)
  await call(c, { action: 'content.get', params: { kind: 'post', id: 42 } })

  const out = await call(c, blocksWrite({ fields: { post_content: `${BODY}\n\n${para('More')}` } }))

  assert.equal(out.ok, true)
  assert.equal('expected_body_revision' in writes(wp.sent)[0], false)
})

test('🔒 the page changed between the host’s read and the plugin’s lock: the plugin’s revision_stale is REVISION_STALE, nothing written', async () => {
  const wp = site({ revision: true })
  const c = ctx(wp.send)
  const read = await call(c, outline)
  // Another writer lands after the host read the body and before the plugin takes its lock.
  wp.onWrite(() => {
    wp.post.post_content = `${para('New banner')}\n\n${BODY}`
  })

  const out = await call(c, blocksWrite({ rev: read.rev, blocks: { 1: para('Services, new') } }))

  assert.equal(out.ok, false)
  assert.equal(out.code, 'REVISION_STALE')
  assert.match(out.next, /content\.get \{kind:"post", id:42, outline:true\}/)
  assert.equal(wp.post.post_content, `${para('New banner')}\n\n${BODY}`, 'the other writer’s page stands')
  assert.equal(writes(wp.sent).length, 1, 'sent once, refused by the plugin, not sent again')
})

test('🔒 the condition was sent and the write answer has no body_revision: the answer says the write landed UNCHECKED', async () => {
  const wp = site({ revision: true })
  const plugin = wp.send
  // A plugin that answers body_revision on reads but not on writes: it may not have checked anything.
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    const got = /** @type {any} */ (await plugin(action, params))
    if (action !== 'content.update') return got
    const { body_revision: _gone, ...rest } = got
    return rest
  }
  const c = ctx(send)
  const read = await call(c, outline)

  const out = await call(c, blocksWrite({ rev: read.rev, blocks: { 1: para('Services, new') } }))

  assert.equal(out.ok, true, 'it landed')
  assert.match(String(out.unchecked), /landed/)
  assert.match(String(out.unchecked), /not check/)
  assert.equal(writes(wp.sent)[0].expected_body_revision, sha64(BODY))
})

test('a block write whose answer was lost and that the receipt shows landed is not called unchecked: the plugin did check it', async () => {
  const wp = site({ revision: true })
  let updates = 0
  // The receipt of each apply id holds the steps of the writes that landed under it (one id per write since
  // 26/10/2026).
  const landed = new Map()
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    if (action === 'apply.list') {
      wp.sent.push([action, structuredClone(params)])
      const step = { op: 'content', created: false, kind: 'post', id: 42, key: null }
      return {
        ok: true,
        apply_id: params.apply_id,
        steps: Array(landed.get(params.apply_id) ?? 0).fill(step)
      }
    }
    if (action === 'content.update') landed.set(params.apply_id, (landed.get(params.apply_id) ?? 0) + 1)
    const got = await wp.send(action, params)
    if (action === 'content.update' && ++updates === 2)
      return { ok: false, code: 'COMPONENT_UNREACHABLE', error: 'the site did not answer' }
    return got
  }
  const c = ctx(send)
  const first = await call(c, outline)
  const one = await call(c, blocksWrite({ rev: first.rev, blocks: { 0: para('Hero, new') } }))

  const two = await call(c, blocksWrite({ rev: one.rev, blocks: { 1: para('Services, new') } }))

  assert.equal(two.ok, true)
  assert.equal(two.landed, true)
  assert.equal('unchecked' in two, false)
})

// ── Line C (host half): a registered pattern inserted by its name ─────────────────────────────────

const FAQ = `<!-- wp:group {"metadata":{"name":"FAQ"}} -->\n<div class="wp-block-group">${para('Questions')}</div>\n<!-- /wp:group -->`
const reads = (/** @type {Array<[string, Record<string, any>]>} */ sent) =>
  sent.filter(([a, p]) => a === 'content.get' && p.kind === 'pattern').map(([, p]) => p.key)

test('"+<i>":{pattern} inserts the registered pattern’s own markup, read at write time, through the same rev and guard', async () => {
  const wp = site({ patterns: { 'theme/faq': FAQ } })
  const c = ctx(wp.send)
  const read = await call(c, outline)

  const out = await call(c, blocksWrite({ rev: read.rev, blocks: { '+2': { pattern: 'theme/faq' } } }))

  assert.equal(out.ok, true)
  assert.deepEqual(reads(wp.sent), ['theme/faq'])
  assert.equal(wp.post.post_content, [HERO, SERVICES, FAQ, CONTACT].join('\n\n'))
  // An insert moves every position after it: no rev to pair with the old outline's numbers.
  assert.equal('rev' in out, false)
  assert.match(out.next, /outline:true/)
  assert.match(out.normalized.join(' '), /inserted before 2/)
})

test('an insert may mix markup and patterns, in the order given; "+<count>" adds them at the end', async () => {
  const wp = site({ patterns: { 'theme/faq': FAQ } })
  const c = ctx(wp.send)
  const read = await call(c, outline)

  const out = await call(
    c,
    blocksWrite({ rev: read.rev, blocks: { '+3': [para('Intro'), { pattern: 'theme/faq' }] } })
  )

  assert.equal(out.ok, true)
  assert.equal(wp.post.post_content, [HERO, SERVICES, CONTACT, para('Intro'), FAQ].join('\n\n'))
})

{
  const cases = [
    {
      label: 'no such pattern',
      patterns: {},
      code: 'PATTERN_NOT_FOUND',
      next: /content\.list \{kind:"pattern", search:/
    },
    {
      label: 'a plugin that refuses the pattern kind',
      patterns: /** @type {const} */ ('refused'),
      code: 'PATTERNS_UNSUPPORTED',
      next: /blocks:\{"\+<i>":"<markup>"\}/
    },
    {
      label: 'a plugin that cannot read patterns',
      patterns: /** @type {const} */ ('unavailable'),
      code: 'PATTERNS_UNSUPPORTED',
      next: /blocks:\{"\+<i>":"<markup>"\}/
    },
    {
      label: 'a pattern that is not whole blocks',
      patterns: { 'theme/faq': '<!-- wp:group -->\n<div>' },
      code: 'BLOCK_MARKUP',
      next: /./
    }
  ]
  for (const { label, patterns, code, next } of cases)
    test(`a pattern insert that cannot be made is refused by name, nothing written: ${label}`, async () => {
      const wp = site({ patterns })
      const c = ctx(wp.send)
      const read = await call(c, outline)

      const out = await call(c, blocksWrite({ rev: read.rev, blocks: { '+1': { pattern: 'theme/faq' } } }))

      assert.equal(out.code, code, label)
      assert.match(String(out.next), next, label)
      assert.equal(writes(wp.sent).length, 0, label)
      if (code === 'PATTERNS_UNSUPPORTED') assert.match(out.error, /cannot read patterns/, label)
      if (code === 'BLOCK_MARKUP') assert.equal(out.param, 'blocks.+1', label)
    })
}

test('a pattern value that is not {pattern:"<name>"} on an insert, or a pattern on a replace, is refused before anything is read', async () => {
  for (const blocks of [
    { '+1': { pattern: '' } },
    { '+1': { pattern: 'theme/faq', extra: 1 } },
    { '+1': { pattern: 'not a name!' } },
    { 1: { pattern: 'theme/faq' } }
  ]) {
    const wp = site({ patterns: { 'theme/faq': FAQ } })

    const out = await call(ctx(wp.send), blocksWrite({ rev: rev12(BODY), blocks }))

    assert.equal(out.code, 'BAD_PARAMS', JSON.stringify(blocks))
    assert.equal(reads(wp.sent).length, 0, JSON.stringify(blocks))
    assert.equal(writes(wp.sent).length, 0, JSON.stringify(blocks))
  }
})

test('a pattern insert on a page that changed since its read is REVISION_STALE before the pattern is read', async () => {
  const wp = site({ patterns: { 'theme/faq': FAQ } })
  const c = ctx(wp.send)
  const read = await call(c, outline)
  wp.post.post_content = `${para('New banner')}\n\n${BODY}`

  const out = await call(c, blocksWrite({ rev: read.rev, blocks: { '+1': { pattern: 'theme/faq' } } }))

  assert.equal(out.code, 'REVISION_STALE')
  assert.deepEqual(reads(wp.sent), [])
})

// ── Line C: the model lists and reads patterns ─────────────────────────────────────────────────────

const PATTERN_ROWS = [
  { name: 'theme/faq', title: 'FAQ', categories: ['text'], description: 'Questions and answers', chars: 812 },
  { name: 'theme/cta', title: 'Call to action', categories: ['call-to-action'], description: '', chars: 410 }
]
/** A relay answering one content.list / content.get, recording what it was sent. @param {(p: any) => unknown} answer */
const plugin = (answer) => {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  return {
    sent,
    send: async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
      sent.push([action, structuredClone(params)])
      return answer(params)
    }
  }
}
const noVersion = (/** @type {any} */ out) => assert.doesNotMatch(JSON.stringify(out), /\d+\.\d+\.\d+/)

test('content.list {kind:"pattern"} is relayed as asked, and a list that says kind:"pattern" is answered whole — its rows are not cut to post rows', async () => {
  const listed = {
    ok: true,
    kind: 'pattern',
    search: 'faq',
    items: PATTERN_ROWS,
    matched: 2,
    offset: 0,
    limit: 50
  }
  const p = plugin(() => listed)

  const out = await call(ctx(p.send), {
    action: 'content.list',
    params: { kind: 'pattern', search: 'faq', category: 'text', limit: 20 }
  })

  assert.deepEqual(p.sent, [
    ['content.list', { kind: 'pattern', search: 'faq', category: 'text', limit: 20 }]
  ])
  assert.deepEqual(out.items, PATTERN_ROWS)
  assert.equal(out.kind, 'pattern')
})

{
  const cases = [
    {
      label: 'a released plugin refuses the kind (the wordpress-v0.16.0 sentence)',
      answer: {
        ok: false,
        error: 'bad_params',
        message:
          'content.list serves kinds "post", "templatePart" and "template"; "pattern" is not listed here. Read one with content.get {kind, id or key}, and use post_type to narrow posts.'
      }
    },
    {
      label: 'a very old plugin lists its posts for any kind, ok:true',
      answer: { ok: true, kind: 'post', offset: 0, items: [{ id: 1, title: 'Home' }] }
    },
    {
      label: 'the relay found the search was not read',
      answer: { ok: false, code: 'LIST_SEARCH_UNSUPPORTED', error: 'not filtered' }
    }
  ]
  for (const { label, answer } of cases)
    test(`a pattern list is trusted only when it says kind:"pattern"; else the plugin cannot list patterns yet: ${label}`, async () => {
      const p = plugin(() => answer)

      const out = await call(ctx(p.send), {
        action: 'content.list',
        params: { kind: 'pattern', search: 'faq' }
      })

      assert.equal(out.code, 'PATTERNS_UNSUPPORTED', label)
      assert.match(out.error, /cannot list patterns/, label)
      assert.match(out.next, /blocks:\{"\+<i>":"<markup>"\}/, label)
      assert.equal('items' in out, false, label)
      noVersion(out)
    })
}

test('a pattern list takes kind, search, category, offset, limit — nothing a post list takes; category is no key of a post list', async () => {
  for (const [params, given] of [
    [{ kind: 'pattern', include_body: true }, 'include_body'],
    [{ kind: 'pattern', post_type: 'page' }, 'post_type'],
    [{ kind: 'post', category: 'text' }, 'category']
  ]) {
    const p = plugin(() => ({ ok: true }))

    const out = await call(ctx(p.send), { action: 'content.list', params })

    assert.equal(out.code, 'UNKNOWN_PARAM', JSON.stringify(params))
    assert.deepEqual(out.given, [given])
    assert.equal(p.sent.length, 0)
  }
})

test('content.get {kind:"pattern", key} reads one pattern; a plugin that has no pattern road says it cannot read patterns', async () => {
  const read = plugin(() => ({
    ok: true,
    kind: 'pattern',
    id: 0,
    key: 'theme/faq',
    item: { id: 0, title: 'FAQ', content: FAQ },
    stored: false
  }))
  const old = plugin(() => ({
    ok: false,
    error: 'bad_params',
    message: 'kind must be one of: post, postmeta, option, templatePart, term, menuItem'
  }))

  const one = await call(ctx(read.send), {
    action: 'content.get',
    params: { kind: 'pattern', key: 'theme/faq' }
  })
  const none = await call(ctx(old.send), {
    action: 'content.get',
    params: { kind: 'pattern', key: 'theme/faq' }
  })

  assert.equal(one.item.content, FAQ)
  assert.equal(none.code, 'PATTERNS_UNSUPPORTED')
  assert.match(none.error, /cannot read patterns/)
  noVersion(none)
})

// ── Contract amendment (integrator, 01/10/2026): a write never hands out a rev an older outline's positions
// can be paired with. Only a blocks write that inserted and dropped nothing, and whose body read back holds
// as many top-level blocks as before, answers `rev`; every other write says the positions may have moved.

test('🔒 after an insert the answer has no rev, so a write by the OLD outline’s positions is refused BAD_PARAMS param:"rev"', async () => {
  const wp = site()
  const c = ctx(wp.send)
  const read = await call(c, outline)
  const added = await call(c, blocksWrite({ rev: read.rev, blocks: { '+0': para('New banner') } }))

  const next = await call(c, blocksWrite({ rev: added.rev, blocks: { 1: para('Services, new') } }))

  assert.equal(added.ok, true)
  assert.equal('rev' in added, false)
  assert.match(added.next, /content\.get \{kind:"post", id:42, outline:true\}/)
  assert.equal(next.code, 'BAD_PARAMS')
  assert.equal(next.param, 'rev')
  assert.equal(writes(wp.sent).length, 1)
})

test('a replace-only write answers rev, and a second write by position with it lands on the right block', async () => {
  const wp = site()
  const c = ctx(wp.send)
  const read = await call(c, outline)
  const one = await call(c, blocksWrite({ rev: read.rev, blocks: { 0: para('Hero, new') } }))

  const two = await call(
    c,
    blocksWrite({ rev: one.rev, blocks: { 2: { find: 'Contact', replace: 'Reach us' } } })
  )

  assert.equal(one.rev, rev12([para('Hero, new'), SERVICES, CONTACT].join('\n\n')))
  assert.equal(two.ok, true)
  assert.equal(wp.post.post_content, [para('Hero, new'), SERVICES, para('Reach us')].join('\n\n'))
  assert.equal(two.rev, rev12(wp.post.post_content))
})

{
  const cases = [
    {
      label: 'one block replaced by markup of two',
      params: { blocks: { 1: `${para('A')}\n\n${para('B')}` } }
    },
    { label: 'a drop', params: { blocks: { 1: null } }, said: 'Remove the services section' },
    { label: 'an insert', params: { blocks: { '+3': para('More') } } },
    {
      label: 'a whole-body write',
      params: { fields: { post_content: `${BODY}\n\n${para('More')}` } },
      whole: true
    }
  ]
  for (const { label, params, said, whole } of cases)
    test(`a write whose positions may have moved answers no rev, and its next says to read the outline first: ${label}`, async () => {
      const wp = site()
      const c = {
        ...ctx(wp.send),
        ...(said
          ? {
              events: [
                {
                  type: 'user/message',
                  data: { source: { kind: 'user' }, content: [{ type: 'text', text: said }] }
                }
              ]
            }
          : {})
      }
      const read = await call(
        c,
        whole ? { action: 'content.get', params: { kind: 'post', id: 42 } } : outline
      )

      const out = await call(c, blocksWrite(whole ? params : { rev: read.rev, ...params }))

      assert.equal(out.ok, true, label)
      assert.equal('rev' in out, false, label)
      assert.match(
        out.next,
        /content\.get \{kind:"post", id:42, outline:true\} before a write by position/,
        label
      )
      assert.match(out.next, /nothing to read back/, label)
      assert.ok(out.next.length <= 200, label)
    })
}

// ── The integrator's TP-HOST cases not covered above (`tasks/ke-hoach-test-wordpress-block-editing.md`) ──

test('H05: a read of a kind with no body — option, postmeta, term, pattern — carries no rev', async () => {
  const answers = {
    option: { ok: true, kind: 'option', key: 'blogname', item: { key: 'blogname', value: 'Acme' } },
    postmeta: { ok: true, kind: 'postmeta', id: 42, key: 'x', item: { value: '1' } },
    term: { ok: true, kind: 'term', id: 3, key: 'category', item: { name: 'News' } },
    pattern: { ok: true, kind: 'pattern', key: 'theme/faq', item: { title: 'FAQ', content: FAQ } }
  }
  for (const [kind, answer] of Object.entries(answers)) {
    const p = plugin(() => answer)
    const params =
      kind === 'option'
        ? { kind, key: 'blogname' }
        : kind === 'pattern'
          ? { kind, key: 'theme/faq' }
          : { kind, id: 42, key: kind === 'term' ? 'category' : 'x' }

    const out = await call(ctx(p.send), { action: 'content.get', params })

    assert.equal(out.ok, true, kind)
    assert.equal('rev' in out, false, kind)
  }
})

test('H08: a rev of eleven characters or in capitals is not one content.get answered', async () => {
  for (const rev of [rev12(BODY).slice(0, 11), rev12(BODY).toUpperCase(), `${rev12(BODY)}0`]) {
    const wp = site()

    const out = await call(ctx(wp.send), blocksWrite({ rev, blocks: { 1: para('x') } }))

    assert.equal(out.code, 'BAD_PARAMS', rev)
    assert.equal(out.param, 'rev', rev)
    assert.equal(wp.sent.length, 0, rev)
  }
})

test('H12: a call mixing a metadata.name key and a position key without rev is refused BAD_PARAMS param:"rev"', async () => {
  const named = `<!-- wp:paragraph {"metadata":{"name":"intro"}} -->\n<p>Intro</p>\n<!-- /wp:paragraph -->`
  const wp = site({ body: `${HERO}\n\n${named}` })

  const out = await call(
    ctx(wp.send),
    blocksWrite({ blocks: { intro: { find: 'Intro', replace: 'Hi' }, 0: para('Hero, new') } })
  )

  assert.equal(out.code, 'BAD_PARAMS')
  assert.equal(out.param, 'rev')
  assert.equal(writes(wp.sent).length, 0)
})

test('H15: a create answers no rev — it has no outline to pair with — and keeps the create’s own receipt', async () => {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const row = {
    ID: 77,
    post_title: 'New',
    post_type: 'page',
    post_status: 'draft',
    post_content: BODY,
    post_name: 'new'
  }
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    if (action === 'content.update') return { ok: true, kind: 'post', id: 77, created: true }
    return { ok: true, kind: 'post', id: 77, item: { ...row } }
  }

  const out = await call(ctx(send), {
    action: 'content.update',
    params: { kind: 'post', fields: { post_title: 'New', post_content: BODY, post_type: 'page' } }
  })

  assert.equal(out.created, true)
  assert.equal('rev' in out, false)
  assert.doesNotMatch(out.next, /outline:true/)
})

test('H17: after an insert, a write by position with the OLD rev is REVISION_STALE', async () => {
  const wp = site()
  const c = ctx(wp.send)
  const read = await call(c, outline)
  await call(c, blocksWrite({ rev: read.rev, blocks: { '+0': para('New banner') } }))

  const out = await call(c, blocksWrite({ rev: read.rev, blocks: { 1: para('Services, new') } }))

  assert.equal(out.code, 'REVISION_STALE')
  assert.equal(out.rev, rev12(wp.post.post_content))
  assert.equal(writes(wp.sent).length, 1)
})

test('H26: the refusal of a pattern insert names no plugin version', async () => {
  for (const patterns of /** @type {const} */ (['refused', 'unavailable'])) {
    const wp = site({ patterns })
    const c = ctx(wp.send)
    const read = await call(c, outline)

    const out = await call(c, blocksWrite({ rev: read.rev, blocks: { '+1': { pattern: 'theme/faq' } } }))

    assert.equal(out.code, 'PATTERNS_UNSUPPORTED', patterns)
    noVersion(out)
  }
})

test('H32: Joomla has no pattern kind — refused before the relay, with where such a thing lives there', async () => {
  for (const action of ['content.list', 'content.get']) {
    const p = plugin(() => ({ ok: true }))
    const c = { ...ctx(p.send), facts: { platform: 'joomla', sealed: false } }

    const out = await call(c, { action, params: { kind: 'pattern', key: 'theme/faq' } })

    assert.equal(out.code, 'NOT_ON_THIS_PLATFORM', action)
    assert.equal(p.sent.length, 0, action)
  }
})

test('H35: a pattern insert is judged by the body guard like any block write — one that cuts the page is BODY_SHRINK', async () => {
  const long = para(`Hero ${'a'.repeat(6_000)}`)
  const wp = site({ body: [long, SERVICES, CONTACT].join('\n\n'), patterns: { 'theme/faq': FAQ } })
  const c = ctx(wp.send)
  const read = await call(c, outline)

  const out = await call(
    c,
    blocksWrite({ rev: read.rev, blocks: { 0: para('Hero'), '+1': { pattern: 'theme/faq' } } })
  )

  assert.equal(out.code, 'BODY_SHRINK')
  assert.equal(writes(wp.sent).length, 0)
})

test('H37: a template part written by position on the body it read answers the rev of the part read back', async () => {
  const part = `${para('Logo')}\n\n${para('Menu')}`
  const stored = { content: part }
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    if (action === 'content.get')
      return {
        ok: true,
        kind: 'templatePart',
        id: 7,
        key: 'header',
        item: { id: 7, title: 'Header', ...stored }
      }
    if (action === 'content.update') {
      stored.content = params.fields.content
      return { ok: true, kind: 'templatePart', id: 7, key: 'header', created: false }
    }
    return { ok: false, error: 'bad_action' }
  }
  const c = ctx(send)
  const read = await call(c, {
    action: 'content.get',
    params: { kind: 'templatePart', key: 'header', outline: true }
  })

  const out = await call(c, {
    action: 'content.update',
    params: { kind: 'templatePart', key: 'header', rev: read.rev, blocks: { 1: para('Menu, new') } }
  })

  assert.equal(out.ok, true)
  assert.equal(stored.content, `${para('Logo')}\n\n${para('Menu, new')}`)
  assert.equal(out.rev, rev12(stored.content))
})

test('H38: every refusal this line adds names its next in at most 200 characters, and refusalNext has a case for each code', async () => {
  const { refusalNext } = await import('../src/host/site.mjs')
  for (const code of ['REVISION_STALE', 'PATTERN_NOT_FOUND', 'PATTERNS_UNSUPPORTED', 'ATTRS_IN_HTML']) {
    const next = refusalNext({ ok: false, code, action: 'content.update' }, { platform: 'wordpress' })
    assert.ok(typeof next === 'string' && next.length > 0 && next.length <= 200, code)
    assert.doesNotMatch(next, /This site answered no/, code)
  }
  assert.match(
    String(refusalNext({ ok: false, error: 'revision_stale', message: 'x' }, { platform: 'wordpress' })),
    /outline:true/
  )
  const wp = site({ patterns: {} })
  const c = ctx(wp.send)
  const read = await call(c, outline)
  const answers = [
    await call(c, blocksWrite({ blocks: { 1: para('x') } })),
    await call(c, blocksWrite({ rev: 'abc', blocks: { 1: para('x') } })),
    await call(c, blocksWrite({ rev: read.rev, blocks: { '+1': { pattern: 'theme/none' } } })),
    await call(c, blocksWrite({ rev: read.rev, blocks: { 1: { pattern: 'theme/none' } } }))
  ]
  wp.post.post_content = `${para('New banner')}\n\n${BODY}`
  answers.push(await call(c, blocksWrite({ rev: read.rev, blocks: { 1: para('x') } })))
  for (const out of answers) {
    assert.equal(out.ok, false, out.code)
    assert.ok(typeof out.next === 'string' && out.next.length <= 200, `${out.code}: ${out.next}`)
    assert.ok(out.error.length <= 160, `${out.code}: ${out.error}`)
  }
})

// ── Follow-up (integrator, after the plugin branch landed at claude-cowork cb29b35) ─────────────────

test('the plugin answers body_revision:null when its read-back after the write failed: the KEY proves it checked — not unchecked', async () => {
  const wp = site({ revision: true })
  const plugin = wp.send
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    const got = /** @type {any} */ (await plugin(action, params))
    return action === 'content.update' && got.ok === true ? { ...got, body_revision: null } : got
  }
  const c = ctx(send)
  const read = await call(c, outline)

  const out = await call(c, blocksWrite({ rev: read.rev, blocks: { 1: para('Services, new') } }))

  assert.equal(out.ok, true)
  assert.equal('unchecked' in out, false)
  assert.equal(writes(wp.sent)[0].expected_body_revision, sha64(BODY))
})

test('🔒 the plugin’s body_revision is the host’s: no read or write answer shows it to the model, and the write still sends it back', async () => {
  const wp = site({ revision: true })
  const c = ctx(wp.send)

  const whole = await call(c, { action: 'content.get', params: { kind: 'post', id: 42 } })
  const listed = await call(c, outline)
  const named = await call(c, { action: 'content.get', params: { kind: 'post', id: 42, block: [1] } })
  const replaced = await call(c, blocksWrite({ rev: listed.rev, blocks: { 1: para('Services, new') } }))
  const inserted = await call(c, blocksWrite({ rev: replaced.rev, blocks: { '+3': para('More') } }))
  const bodyWrite = await call(
    c,
    blocksWrite({ fields: { post_content: `${wp.post.post_content}\n\n${para('Last')}` } })
  )

  for (const [name, out] of Object.entries({ whole, listed, named, replaced, inserted, bodyWrite })) {
    assert.equal(out.ok, true, name)
    assert.equal(JSON.stringify(out).includes('body_revision'), false, name)
  }
  assert.equal(whole.item.post_content, BODY, 'the whole-body path still answers the body')
  const sent = writes(wp.sent)
  assert.equal(sent[0].expected_body_revision, sha64(BODY), 'the host still used it')
  assert.equal(typeof sent[1].expected_body_revision, 'string')
  assert.equal('expected_body_revision' in sent[2], false, 'a whole-body write read nothing for it')
})

test('a template read (a body kind the host does not split into blocks) does not show body_revision either', async () => {
  const p = plugin(() => ({
    ok: true,
    kind: 'template',
    id: 0,
    key: 'home',
    item: { id: 0, title: 'Home', content: BODY },
    stored: false,
    body_revision: sha64(BODY)
  }))

  const out = await call(ctx(p.send), { action: 'content.get', params: { kind: 'template', key: 'home' } })

  assert.equal(out.ok, true)
  assert.equal('body_revision' in out, false)
  assert.equal(out.item.content, BODY)
})

// ── {attrs} on a block with saved HTML (E2E before pass, 01/10/2026) ───────────────────────────────

test('🔒 {attrs} changing what a block’s saved HTML holds is refused ATTRS_IN_HTML, nothing written, and the next names the block’s markup read', async () => {
  const heading =
    '<!-- wp:heading {"level":2} -->\n<h2 class="wp-block-heading">Features</h2>\n<!-- /wp:heading -->'
  const wp = site({ body: [HERO, heading, CONTACT].join('\n\n') })
  const c = ctx(wp.send)
  const read = await call(c, outline)

  const out = await call(
    c,
    blocksWrite({ rev: read.rev, blocks: { 1: { attrs: { level: 3, metadata: { name: 'features' } } } } })
  )

  assert.equal(out.code, 'ATTRS_IN_HTML')
  assert.deepEqual(out.keys, ['level'])
  assert.equal(out.param, 'blocks.1')
  assert.match(out.next, /content\.get \{kind:"post", id:42, block:1\}/)
  assert.match(out.next, /comment and its HTML/)
  assert.ok(out.next.length <= 200 && out.error.length <= 160)
  assert.equal(writes(wp.sent).length, 0)
  noVersion(out)
})

test('a long attribute name, or many, still makes a refusal within its limits', async () => {
  const wp = site()
  const c = ctx(wp.send)
  const read = await call(c, outline)
  const attrs = Object.fromEntries(
    ['aVeryLongAttributeNameThatGoesOn', 'anotherLongAttributeName', 'third', 'fourth'].map((k) => [k, 1])
  )

  const out = await call(c, blocksWrite({ rev: read.rev, blocks: { 0: { attrs } } }))

  assert.equal(out.code, 'ATTRS_IN_HTML')
  assert.equal(out.keys.length, 4)
  assert.ok(out.error.length <= 160, out.error)
  assert.ok(out.next.length <= 200, out.next)
})

// ── B1 (E2E after pass, compat H-new × 0.15.3 and × 0.16.0, case E31): the refusal sentences the released
// plugins really send for content.list {kind:"pattern"}, quoted verbatim from `contentList` in
// `wordpress/cowork/lib/Engine.php` at each tag (read with `gh api …/contents/…?ref=<tag>`, 02/10/2026).

const LIST_HINT = 'Read one with content.get {kind, id or key}, and use post_type to narrow posts.'
{
  const cases = [
    {
      tag: 'wordpress-v0.14.9',
      message: `content.list serves kind "post" only; "pattern" is not listed here. ${LIST_HINT}`
    },
    {
      tag: 'wordpress-v0.15.3',
      message: `content.list serves kinds "post", "templatePart" and "template"; "pattern" is not listed here. ${LIST_HINT}`
    },
    {
      tag: 'wordpress-v0.16.0',
      message: `content.list serves kinds "post", "templatePart" and "template"; "pattern" is not listed here. ${LIST_HINT}`
    },
    // The plugin branch's own word when its writer cannot list them (claude-cowork cb29b35 `patternList`).
    { tag: 'cb29b35, no lister', error: 'unavailable', message: 'this plugin cannot list block patterns' }
  ]
  for (const { tag, error = 'bad_params', message } of cases)
    test(`B1: a plugin that lists no patterns is PATTERNS_UNSUPPORTED, never its own bad_params: ${tag}`, async () => {
      const p = plugin(() => ({ ok: false, error, message }))

      const out = await call(ctx(p.send), {
        action: 'content.list',
        params: { kind: 'pattern', search: 'faq' }
      })

      assert.equal(out.code, 'PATTERNS_UNSUPPORTED', tag)
      assert.match(out.error, /cannot list patterns/, tag)
      assert.match(out.next, /blocks:\{"\+<i>":"<markup>"\}/, tag)
      noVersion(out)
    })
}

{
  // The new plugin's own refusals of a pattern list it CAN make (claude-cowork cb29b35 `patternList`,
  // `searchNeedle`): the call is wrong, not the plugin, so they reach the model as the plugin said them.
  const cases = [
    { params: { kind: 'pattern', category: '' }, message: 'category must be a category slug, e.g. "banner"' },
    { params: { kind: 'pattern', limit: 'ten' }, message: 'limit must be a whole number' },
    { params: { kind: 'pattern', offset: 'x' }, message: 'offset must be a whole number' },
    {
      params: { kind: 'pattern', search: 7 },
      message:
        "search must be a string: the words to look for in a pattern's name, title, description or keywords"
    }
  ]
  for (const { params, message } of cases)
    test(`B1: the new plugin's own refusal of a pattern list passes through as it said it: ${message.slice(0, 40)}`, async () => {
      const p = plugin(() => ({ ok: false, error: 'bad_params', message }))

      const out = await call(ctx(p.send), { action: 'content.list', params })

      assert.notEqual(out.code, 'PATTERNS_UNSUPPORTED', message)
      if (p.sent.length === 1) {
        assert.equal(out.error, 'bad_params', message)
        assert.equal(out.message, message)
      } else assert.equal(out.code, 'bad_params', 'refused before the relay, by the host itself')
    })
}

test('B1, same drift elsewhere: the next for content.list of another kind reads the 0.15.3/0.16.0 wording too, not only 0.14.9’s', async () => {
  const { refusalNext } = await import('../src/host/site.mjs')
  for (const [kind, road] of [
    ['menu', /post_type:"wp_navigation"/],
    ['option', /No door lists options/],
    ['page', /post_type:"page"\} lists the pages/]
  ]) {
    const message = `content.list serves kinds "post", "templatePart" and "template"; "${kind}" is not listed here. ${LIST_HINT}`
    const next = String(
      refusalNext(
        { ok: false, error: 'bad_params', message },
        { platform: 'wordpress', action: 'content.list' }
      )
    )
    assert.match(next, road, kind)
  }
})

// ── TP-MODEL follow-ups (48 runs, deepseek-flash, 02/10/2026) ─────────────────────────────────────

test('M5: rev copied onto a body read is dropped with a note — the read needs none — never refused', async () => {
  const wp = site()
  const c = ctx(wp.send)
  const read = await call(c, outline)

  const out = await call(c, {
    action: 'content.get',
    params: { kind: 'post', id: 42, rev: read.rev, block: 1 }
  })

  assert.equal(out.ok, true)
  assert.equal(out.blocks[0].markup, SERVICES)
  assert.equal('rev' in wp.sent.at(-1)[1], false, 'never relayed')
  assert.match(out.normalized.join(' '), /rev dropped/)
})

test('M5: rev on a read of a kind with no body, and any other unknown key on a body read, stay refused by name', async () => {
  for (const params of [
    { kind: 'option', key: 'blogname', rev: 'e736d493e941' },
    { kind: 'post', id: 42, revision: 'e736d493e941' }
  ]) {
    const p = plugin(() => ({ ok: true, item: {} }))

    const out = await call(ctx(p.send), { action: 'content.get', params })

    assert.equal(out.code, 'UNKNOWN_PARAM', JSON.stringify(params))
    assert.equal(p.sent.length, 0)
  }
})

// ── M2 rerun r1 (02/10/2026): the model read a pattern, then re-typed it. The answer says how to insert it. ──

test('a pattern read answers how to insert it by its own name, within a next’s 200 characters', async () => {
  const read = plugin(() => ({
    ok: true,
    kind: 'pattern',
    id: 0,
    key: 'twentytwentyfive/text-faqs',
    item: { id: 0, title: 'FAQs', content: FAQ },
    stored: false
  }))

  const out = await call(ctx(read.send), {
    action: 'content.get',
    params: { kind: 'pattern', key: 'twentytwentyfive/text-faqs' }
  })

  assert.equal(out.item.content, FAQ)
  assert.match(out.next, /blocks:\{"\+<i>":\{pattern:"twentytwentyfive\/text-faqs"\}\}/)
  assert.match(out.next, /\{find, replace\}/)
  assert.ok(out.next.length <= 200, out.next)
})

test('a pattern list with rows answers how to insert one by name; an empty list and a refusal do not', async () => {
  const listed = plugin(() => ({
    ok: true,
    kind: 'pattern',
    search: 'faq',
    items: PATTERN_ROWS,
    matched: 2,
    offset: 0,
    limit: 50
  }))
  const empty = plugin(() => ({ ok: true, kind: 'pattern', items: [], matched: 0, offset: 0, limit: 50 }))
  const old = plugin(() => ({
    ok: false,
    error: 'bad_params',
    message: 'kind must be one of: post, postmeta, option, templatePart, term, menuItem'
  }))

  const rows = await call(ctx(listed.send), {
    action: 'content.list',
    params: { kind: 'pattern', search: 'faq' }
  })
  const none = await call(ctx(empty.send), { action: 'content.list', params: { kind: 'pattern' } })
  const refused = await call(ctx(old.send), {
    action: 'content.get',
    params: { kind: 'pattern', key: 'theme/faq' }
  })

  assert.equal(rows.ok, true)
  assert.match(rows.next, /blocks:\{"\+<i>":\{pattern:"<name>"\}\}/)
  assert.match(rows.next, /never re-type/)
  assert.ok(rows.next.length <= 200, rows.next)
  assert.equal(none.ok, true)
  assert.doesNotMatch(String(none.next ?? ''), /never re-type/)
  assert.equal(refused.code, 'PATTERNS_UNSUPPORTED')
  assert.doesNotMatch(refused.next, /as the theme ships it/)
})
