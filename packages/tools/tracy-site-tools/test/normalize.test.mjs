/**
 * `normalize.mjs`: one call corrected where its intent is unambiguous, refused where the door would
 * certainly refuse it, and checked against the component's own reader. Every input below is a call
 * measured on r2 (25/09/2026) or earlier, named by its source.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  ALLOWED_PARAMS,
  EVIDENCE_BYTES,
  WP_POST_FIELDS,
  WP_SHOWN_OPTIONS,
  checkParams,
  customerSentence,
  normalizeCall,
  prepareContractApply,
  requestIdOf,
  resolveCall
} from '../src/host/normalize.mjs'
import { planCall, refusalNext } from '../src/host/site.mjs'

/** @param {string} name */
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

const WP = { platform: 'wordpress', wpApplyId: 'wp-turn-1', mint: (/** @type {string} */ p) => `${p}-minted` }
const J = { platform: 'joomla', mint: (/** @type {string} */ p) => `${p}-minted` }

test('media.delete normalizes WordPress and Joomla target shapes and relays dry_run to the plugin', () => {
  const wp = run({ action: 'media.delete', params: { apply_id: 'delete-wp-1', id: 42, dry_run: true } }, WP)
  const wpUrl = run(
    { action: 'media.delete', params: { apply_id: 'delete-wp-2', url: 'https://site.test/p.jpg' } },
    WP
  )
  const jo = run(
    { action: 'media.delete', params: { apply_id: 'delete-jo-1', path: 'banners/p.jpg', dry_run: true } },
    J
  )

  assert.deepEqual(
    [wp.kind, wp.action, wp.params, wp.host],
    ['relay', 'media.delete', { apply_id: 'delete-wp-1', id: 42, dry_run: true }, {}]
  )
  assert.deepEqual(wpUrl.kind === 'relay' && wpUrl.params, {
    apply_id: 'delete-wp-2',
    url: 'https://site.test/p.jpg'
  })
  assert.deepEqual(
    [jo.kind, jo.action, jo.params, jo.host],
    ['relay', 'media.delete', { apply_id: 'delete-jo-1', path: 'banners/p.jpg', dry_run: true }, {}]
  )
})

test('media.delete refuses a missing apply_id or platform-specific target before relay', () => {
  for (const [facts, params, message] of [
    [WP, { id: 42 }, /requires apply_id/],
    [WP, { apply_id: 'delete-wp' }, /attachment id or URL/],
    [WP, { apply_id: 'delete-wp', id: 42, url: 'https://site.test/p.jpg' }, /attachment id or URL/],
    [J, { apply_id: 'delete-jo' }, /path relative to images\//]
  ]) {
    const refused = normalizeCall('media.delete', params, /** @type {any} */ (facts))
    assert.equal(refused.kind, 'refuse')
    assert.match(String(refused.answer.error), message)
  }
})

/** @param {unknown} args @param {Record<string, unknown>} facts */
const run = (args, facts) => {
  const plan = planCall(args)
  assert.ok(plan.ok, JSON.stringify(plan))
  return normalizeCall(plan.action, plan.params, /** @type {any} */ (facts))
}

test('corpus: every measured refusal F4 owns gets the disposition this package promises', () => {
  const corpus = fixture('refusal-corpus.json')
  assert.ok(corpus.length >= 290)
  for (const e of corpus) {
    const plan = planCall(e.args)
    /** @type {{ disposition: string, code?: string }} */
    let got
    if (e.platform === 'emdash') got = { disposition: 'refuse', code: 'EMDASH_SITE' }
    else if (!plan.ok) got = { disposition: 'refuse', code: plan.code }
    else {
      const n = normalizeCall(plan.action, plan.params, {
        platform: e.platform,
        applyIds: e.facts?.applyIds ?? [],
        wpApplyId: 'wp-t',
        mint: (p) => `${p}-t`
      })
      got =
        n.kind === 'refuse'
          ? { disposition: 'refuse', code: /** @type {string} */ (n.answer.code) }
          : n.resolve
            ? { disposition: 'resolve' }
            : { disposition: 'relay' }
    }
    assert.deepEqual(got, e.expect, `${e.src} (${e.class})`)
    if (got.disposition === 'refuse' && plan.ok && e.platform !== 'emdash') {
      const refused = /** @type {any} */ (normalizeCall(plan.action, plan.params, { platform: e.platform }))
      if (refused.kind === 'refuse')
        assert.ok(String(refused.answer.error).length <= 160, `${e.src}: error over 160 chars`)
    }
    // Every refusal made here has a next that is not the default.
    if (got.disposition === 'refuse' && e.platform !== 'emdash') {
      const answer = plan.ok
        ? /** @type {any} */ (
            normalizeCall(plan.action, plan.params, {
              platform: e.platform,
              applyIds: e.facts?.applyIds ?? []
            })
          ).answer
        : plan
      const next = refusalNext(answer, { platform: e.platform, action: plan.ok ? plan.action : null })
      assert.ok(next && !/answered no, and that is an answer/.test(next), `${e.src}: ${next}`)
    }
  }
})

test('🔒 WP-20: a kindless write with no id is refused, never sent — it would have CREATED a draft', () => {
  // r2 wp C02 step 11, verbatim but for the body: `{apply_id, fields:{post_content: 27 KB}}`.
  const n = run(
    {
      action: 'content.update',
      params: { apply_id: 'restore-home-page', fields: { post_content: '<!-- wp:group -->…' } }
    },
    { ...WP, postsRead: [{ id: 42, title: 'Home' }] }
  )
  assert.equal(n.kind, 'refuse')
  const a = /** @type {any} */ (n).answer
  assert.equal(a.code, 'ADDRESS_MISSING')
  assert.match(a.error, /would have CREATED a new draft/)
  assert.deepEqual(a.candidates, [{ id: 42, title: 'Home' }])
  assert.match(refusalNext(a, { platform: 'wordpress' }) ?? '', /kind:"post" and id:42 \(Home\)/)
})

test('🔒 WP-23: leftover fields on a post write are refused — the component would write the rest and drop them', () => {
  for (const [fields, hint] of [
    [{ 'hero.cta.1': 'Get a free quote' }, 'slot'],
    [{ post_content_find: '8 800', post_content_replace: '0909' }, 'replace'],
    [{ __probe__: '' }, 'probe'],
    [{ post_title: 'Home', nope: 'x' }, 'probe']
  ]) {
    const n = /** @type {any} */ (
      run({ action: 'content.update', params: { kind: 'post', id: 42, fields } }, WP)
    )
    assert.equal(n.kind, 'refuse', JSON.stringify(fields))
    assert.equal(n.answer.code, 'NO_WRITABLE_FIELD')
    assert.equal(n.answer.hint, hint)
    assert.deepEqual(n.answer.allowed, [...WP_POST_FIELDS])
  }
})

test('WP-22: the read shape’s names become the write’s, and the answer says so; both spellings disagreeing is refused', () => {
  const n = /** @type {any} */ (
    run(
      {
        action: 'content.update',
        params: { kind: 'post', id: 9, fields: { title: 'T', content: 'C', status: 'published' } }
      },
      WP
    )
  )
  assert.equal(n.kind, 'relay')
  assert.deepEqual(n.params.fields, { post_title: 'T', post_content: 'C', post_status: 'publish' })
  assert.ok(n.notes.includes('fields.content → post_content'))
  assert.ok(n.notes.includes('post_status "published" → "publish"'))
  const clash = /** @type {any} */ (
    run(
      { action: 'content.update', params: { kind: 'post', id: 9, fields: { title: 'A', post_title: 'B' } } },
      WP
    )
  )
  assert.equal(clash.answer.code, 'NO_WRITABLE_FIELD')
  assert.match(refusalNext(clash.answer) ?? '', /fields\.post_title only/)
  // `categories` and `tags` are real fields (slugs), not aliases of the id lists.
  const tags = /** @type {any} */ (
    run(
      {
        action: 'content.update',
        params: { kind: 'post', id: 9, fields: { categories: ['news'], tags: ['a'] } }
      },
      WP
    )
  )
  assert.deepEqual(tags.params.fields, { categories: ['news'], tags: ['a'] })
})

test('the post fields are the component’s, word for word (fixture from class-claude-cowork-writers.php)', () => {
  const f = fixture('wp-post-fields.json')
  assert.deepEqual([...WP_POST_FIELDS], [...f.columns.fields, ...f.beside.fields])
})

test('WP-1/WP-2: the contract and the batch are refused on WordPress before the relay', () => {
  for (const action of ['content.contract', 'contract.inspect', 'content.batch']) {
    const n = /** @type {any} */ (run({ action, params: {} }, WP))
    assert.equal(n.answer.code, 'NOT_ON_THIS_PLATFORM', action)
    const next = refusalNext(n.answer, { platform: 'wordpress' }) ?? ''
    assert.doesNotMatch(next, /content\.contract/, 'the next never sends WordPress back to the contract')
    assert.match(next, /content\.update/)
  }
})

test('WP-4…9: content.list kinds become posts of a type, a read of options, or a refusal naming the door', () => {
  const page = /** @type {any} */ (run({ action: 'content.list', params: { kind: 'page', limit: 50 } }, WP))
  assert.deepEqual(page.params, { kind: 'post', post_type: 'page', limit: 50 })
  const part = /** @type {any} */ (run({ action: 'content.list', params: { kind: 'wp_template_part' } }, WP))
  assert.equal(part.params.post_type, 'wp_template_part')
  const nav = /** @type {any} */ (run({ action: 'content.list', params: { kind: 'menuItem' } }, WP))
  assert.equal(nav.params.post_type, 'wp_navigation')
  assert.deepEqual(nav.resolve, { type: 'wpNavFallback' })
  const options = /** @type {any} */ (run({ action: 'content.list', params: { kind: 'option' } }, WP))
  assert.deepEqual(options.resolve, { type: 'wpOptions', keys: [...WP_SHOWN_OPTIONS] })
  assert.equal(
    /** @type {any} */ (run({ action: 'content.list', params: { kind: 'postmeta' } }, WP)).answer.code,
    'NOT_LISTABLE'
  )
  const style = /** @type {any} */ (run({ action: 'content.list', params: { kind: 'templateStyle' } }, WP))
  assert.equal(style.answer.code, 'NOT_ON_THIS_PLATFORM')
  assert.match(refusalNext(style.answer, { platform: 'wordpress' }) ?? '', /blogname/)
})

test('WP-10/13/16/17/18: a get is addressed the way the component reads it', () => {
  assert.equal(
    /** @type {any} */ (run({ action: 'content.get', params: { kind: 'page', id: 7 } }, WP)).params.kind,
    'post'
  )
  // r2 wp C06: `id:"wp-tracy-business//footer"` — a template part is named by its slug.
  const part = /** @type {any} */ (
    run({ action: 'content.get', params: { kind: 'templatePart', id: 'wp-tracy-business//footer' } }, WP)
  )
  assert.deepEqual(part.params, { kind: 'templatePart', key: 'footer' })
  assert.match(part.notes.join(' '), /key "footer"/)
  const type = /** @type {any} */ (
    run({ action: 'content.get', params: { kind: 'post', key: 'wp_navigation' } }, WP)
  )
  assert.equal(type.action, 'content.list')
  const slug = /** @type {any} */ (
    run({ action: 'content.get', params: { kind: 'post', key: 'contact-vi' } }, WP)
  )
  assert.deepEqual(slug.resolve, { type: 'wpSlug', slug: 'contact-vi' })
  const meta = /** @type {any} */ (run({ action: 'content.get', params: { kind: 'postmeta', id: 42 } }, WP))
  assert.equal(meta.answer.code, 'ADDRESS_MISSING')
  assert.match(
    refusalNext(meta.answer, { platform: 'wordpress', action: 'content.get' }) ?? '',
    /key:"<meta key>"/
  )
})

test('WP-24: a template part write keeps its title, read once, or from what this conversation read', async () => {
  const n = /** @type {any} */ (
    run(
      {
        action: 'content.update',
        params: { kind: 'templatePart', key: 'footer', fields: { post_content: '<p>x</p>' } }
      },
      WP
    )
  )
  assert.deepEqual(n.params.fields, { content: '<p>x</p>' })
  assert.deepEqual(n.resolve, { type: 'wpPartTitle', key: 'footer' })
  const reads = []
  const done = /** @type {any} */ (
    await resolveCall(n, async (action, params) => {
      reads.push([action, params])
      return { ok: true, item: { id: 81, title: 'Footer', content: '…' } }
    })
  )
  assert.deepEqual(done.params.fields, { content: '<p>x</p>', title: 'Footer' })
  assert.equal(reads.length, 1)
  const known = /** @type {any} */ (
    await resolveCall(n, async () => assert.fail('no read'), { partTitle: () => 'Footer' })
  )
  assert.equal(known.params.fields.title, 'Footer')
  // No content: the component would refuse "templatePart needs a content field".
  const empty = /** @type {any} */ (
    run(
      { action: 'content.update', params: { kind: 'templatePart', key: 'footer', fields: { bogus: 'x' } } },
      WP
    )
  )
  assert.equal(empty.answer.code, 'NO_WRITABLE_FIELD')
})

test('WP-27: a WordPress write without apply_id gets the id Tracy makes for that write; a given one is kept', () => {
  const n = /** @type {any} */ (
    run({ action: 'content.update', params: { kind: 'option', key: 'blogname', fields: { value: 'X' } } }, WP)
  )
  assert.equal(n.params.apply_id, 'wp-turn-1')
  const lazy = /** @type {any} */ (
    run({ action: 'content.delete', params: { kind: 'post', id: 5 } }, { ...WP, wpApplyId: () => 'wp-lazy' })
  )
  assert.equal(lazy.params.apply_id, 'wp-lazy')
  const own = /** @type {any} */ (
    run(
      {
        action: 'content.update',
        params: { kind: 'option', key: 'blogname', fields: { value: 'X' }, apply_id: 'mine' }
      },
      WP
    )
  )
  assert.equal(own.params.apply_id, 'mine')
})

test('WP-27 / J-6 (26/10/2026): two writes of one request get two ids, in order; an id the call sets is kept', () => {
  let n = 0
  const perWrite = (/** @type {string} */ prefix = 'wp') => `${prefix}-turn-${++n}`
  const post = { kind: 'post', id: 42, fields: { post_title: 'x' } }
  const article = { kind: 'article', id: 4, fields: { title: 'x' } }
  const id = (/** @type {unknown} */ args, /** @type {Record<string, unknown>} */ facts) =>
    /** @type {any} */ (run(args, facts)).params.apply_id
  const wp = { ...WP, wpApplyId: perWrite }
  assert.deepEqual(
    [id({ action: 'content.update', params: post }, wp), id({ action: 'content.update', params: post }, wp)],
    ['wp-turn-1', 'wp-turn-2']
  )
  assert.equal(id({ action: 'content.update', params: { ...post, apply_id: 'mine' } }, wp), 'mine')
  assert.equal(n, 2, 'a given id takes no number')
  const jo = { ...J, wpApplyId: perWrite }
  assert.deepEqual(
    [
      id({ action: 'content.update', params: article }, jo),
      id({ action: 'media.upload', params: { path: 'images/a.png', content_b64: 'AA==' } }, jo)
    ],
    ['jo-turn-3', 'jo-turn-4']
  )
  assert.equal(id({ action: 'content.update', params: { ...article, apply_id: 'hero-1' } }, jo), 'hero-1')
  // No conversation memory: each Joomla write still gets one, minted.
  assert.equal(id({ action: 'content.update', params: article }, J), 'jo-minted')
})

test('WP-28/WP-29: a language call names its page and language; a write names what changes', () => {
  assert.equal(
    /** @type {any} */ (run({ action: 'content.language', params: { lang: 'vi' } }, WP)).answer.code,
    'ADDRESS_MISSING'
  )
  const empty = /** @type {any} */ (
    run({ action: 'content.update', params: { kind: 'templatePart', key: 'footer', fields: {} } }, WP)
  )
  assert.equal(empty.answer.code, 'NO_WRITABLE_FIELD')
})

test('J-1/J-2/J-3: WordPress kinds, a named extension, and a sealed site’s structural write are refused on Joomla', () => {
  assert.equal(
    /** @type {any} */ (run({ action: 'content.list', params: { kind: 'option' } }, J)).answer.code,
    'NOT_ON_THIS_PLATFORM'
  )
  const ext = /** @type {any} */ (
    run({ action: 'content.get', params: { kind: 'extensionParams', id: 'com_config' } }, J)
  )
  assert.equal(ext.answer.code, 'ADDRESS_MISSING')
  assert.match(
    refusalNext(ext.answer, { platform: 'joomla', action: 'content.get' }) ?? '',
    /extension\.list/
  )
  const sealed = /** @type {any} */ (
    run(
      { action: 'content.update', params: { kind: 'article', id: 0, fields: { title: 'x' } } },
      { ...J, contractBound: true }
    )
  )
  // Tracy ADR 0022: the component takes it since Joomla 0.18.0-rc.6; an older one answers for itself.
  assert.equal(sealed.kind, 'relay')
})

test('🔒 CC-1: content.contract with no operation is an inspect, so the door takes no write lease', () => {
  const n = /** @type {any} */ (run({ action: 'content.contract', params: {} }, J))
  assert.equal(n.kind, 'relay')
  assert.deepEqual(n.params, { operation: 'inspect' })
  // With changes and no operation the component would answer an inspect and write NOTHING.
  const silent = /** @type {any} */ (
    run({ action: 'content.contract', params: { changes: { 'module-441.1': 'x' } } }, J)
  )
  assert.equal(silent.answer.code, 'UNKNOWN_OPERATION')
  assert.match(refusalNext(silent.answer) ?? '', /operation:"apply"/)
  // CC-2 (P12): "list" is the component's inspect, said so — no longer refused (r1 C04, C08).
  const listed = /** @type {any} */ (run({ action: 'content.contract', params: { operation: 'list' } }, J))
  assert.equal(listed.kind, 'relay')
  assert.deepEqual(listed.params, { operation: 'inspect' })
  const unknown = /** @type {any} */ (run({ action: 'content.contract', params: { operation: 'help' } }, J))
  assert.equal(unknown.answer.code, 'UNKNOWN_OPERATION')
  assert.equal(
    /** @type {any} */ (run({ action: 'content.contract', params: { operation: 'apply' } }, J)).answer.code,
    'CONTRACT_RULE'
  )
  // The language and trim operations pass as they came.
  const retire = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: { operation: 'multilingual.retire', keep: ['en-GB'], apply_id: 'mlang-1' }
      },
      J
    )
  )
  assert.deepEqual(retire.params, { operation: 'multilingual.retire', keep: ['en-GB'], apply_id: 'mlang-1' })
})

test('the inspect’s own filters are Tracy’s: checked, then taken off the call before it is sent', () => {
  const n = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: { operation: 'inspect', page: 'home', slots: 'text', match: 'Quote', offset: 40 }
      },
      J
    )
  )
  assert.deepEqual(n.params, { operation: 'inspect' })
  assert.deepEqual(n.host, { page: 'home', slots: 'text', match: 'Quote', offset: 40 })
  const bad = /** @type {any} */ (
    run({ action: 'content.contract', params: { operation: 'inspect', limit: 10 } }, J)
  )
  assert.equal(bad.answer.code, 'UNKNOWN_PARAM')
})

test('🔒 D9: a contract apply gets a new contract- apply_id, and one this conversation saw answered is never reused', () => {
  const made = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: { operation: 'apply', expected_revision: 'r1', changes: { 'module-441.1': 'Hi' } }
      },
      J
    )
  )
  assert.equal(made.params.apply_id, 'contract-minted')
  assert.equal(made.meta.askedApplyId, null)
  const prefixed = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: {
          operation: 'apply',
          apply_id: 'h1 toyota',
          expected_revision: 'r1',
          changes: { 'module-441.1': 'Hi' }
        }
      },
      J
    )
  )
  assert.equal(prefixed.params.apply_id, 'contract-h1-toyota')
  assert.equal(prefixed.meta.askedApplyId, 'h1 toyota')
  const used = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: {
          operation: 'apply',
          apply_id: 'contract-a',
          expected_revision: 'r1',
          changes: { 'module-441.1': 'Hi' }
        }
      },
      { ...J, okIds: ['contract-a'] }
    )
  )
  assert.equal(used.params.apply_id, 'contract-minted')
  // An id whose last send never answered is kept: the component then replays instead of applying twice.
  const unknown = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: {
          operation: 'apply',
          apply_id: 'contract-a',
          expected_revision: 'r1',
          changes: { 'module-441.1': 'Hi' }
        }
      },
      { ...J, okIds: ['contract-a'], unknownIds: ['contract-a'] }
    )
  )
  assert.equal(unknown.params.apply_id, 'contract-a')
})

test('request_id is made from the changes: the same apply is the same request, another apply another', () => {
  const a = requestIdOf({ 'module-441.1': 'Hi' }, undefined, 'r1')
  assert.match(a, /^r-[0-9a-f]{16}$/)
  assert.equal(requestIdOf({ 'module-441.1': 'Hi' }, {}, 'r1'), a)
  assert.notEqual(requestIdOf({ 'module-441.1': 'Hello' }, {}, 'r1'), a)
  assert.notEqual(requestIdOf({ 'module-441.1': 'Hi' }, {}, 'r2'), a)
  const n = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: {
          operation: 'apply',
          request_id: 'mine',
          expected_revision: 'r1',
          changes: { 'module-441.1': 'Hi' }
        }
      },
      J
    )
  )
  assert.equal(n.params.request_id, a)
  assert.ok(n.notes.some((/** @type {string} */ x) => x.startsWith('request_id →')))
})

test('AL-1/AL-2: apply.list without an id reads this conversation’s latest; a rewritten id is mapped back', () => {
  const latest = /** @type {any} */ (
    run({ action: 'apply.list', params: {} }, { ...J, applyIds: ['contract-1', 'contract-2'] })
  )
  assert.equal(latest.params.apply_id, 'contract-2')
  const mapped = /** @type {any} */ (
    run({ action: 'apply.revert', params: { apply_id: 'hero' } }, { ...J, idMap: { hero: 'contract-hero' } })
  )
  assert.equal(mapped.params.apply_id, 'contract-hero')
})

/**
 * 🔒 AL-4 (ladder DL15 on dsl2jo, 14/10/2026): in a NEW conversation the customer asked to undo the site-name
 * change of the one before; `apply.list {}` was refused NOTHING_TO_LIST and the agent undid two articles.
 * With no id and no write here, the list leaves with no id, and the Apply door answers the site's recent
 * changes from every conversation. An undo with no id is still never guessed (AL-3), on either platform.
 */
test('🔒 AL-4: apply.list with no id in a conversation that wrote nothing asks the door for the site’s recent changes', () => {
  for (const facts of [J, WP]) {
    const recent = /** @type {any} */ (run({ action: 'apply.list', params: {} }, facts))
    assert.equal(recent.kind, 'relay', facts.platform)
    assert.equal(recent.action, 'apply.list')
    assert.equal('apply_id' in recent.params, false, 'no id is sent: the door lists, it does not look one up')
    assert.ok(recent.notes.some((/** @type {string} */ n) => /recent changes/.test(n)))
    // An empty id is the same as none.
    const blank = /** @type {any} */ (run({ action: 'apply.list', params: { apply_id: ' ' } }, facts))
    assert.equal(blank.kind, 'relay')
    assert.equal('apply_id' in blank.params, false)
    const undo = /** @type {any} */ (run({ action: 'apply.revert', params: {} }, facts))
    assert.equal(undo.kind, 'refuse')
    assert.equal(undo.answer.code, 'ADDRESS_MISSING')
    // …and its next names the list that has the earlier conversations' ids.
    assert.match(
      refusalNext(undo.answer, { action: 'apply.revert' }),
      /apply\.list \{\} lists this site's recent changes/
    )
  }
})

/**
 * 🔒 J-5 (ladder DL14, 14/10/2026): the site name's recorded door. New fields with no operation are a set
 * (the plugin's default operation is a read, which would answer ok and change nothing), and a set with no
 * receipt name gets Tracy's, as a delete does (J-4); a read is relayed as it is, with nothing minted.
 */
test('🔒 J-5: site.identity — new fields are a set with a receipt Tracy names; a read stays a read', () => {
  const set = /** @type {any} */ (
    run({ action: 'site.identity', params: { fields: { sitename: 'Street Bakery' } } }, J)
  )
  assert.equal(set.kind, 'relay')
  assert.equal(set.params.operation, 'set')
  assert.equal(set.params.apply_id, 'identity-minted')
  assert.deepEqual(set.params.fields, { sitename: 'Street Bakery' })
  assert.deepEqual(set.meta?.mintedIds, ['apply_id'])
  const named = /** @type {any} */ (
    run(
      {
        action: 'site.identity',
        params: { operation: 'set', fields: { MetaDesc: 'x' }, apply_id: 'shop-name' }
      },
      J
    )
  )
  assert.equal(named.params.apply_id, 'shop-name')
  const read = /** @type {any} */ (run({ action: 'site.identity', params: { operation: 'read' } }, J))
  assert.equal(read.kind, 'relay')
  assert.equal(read.params.apply_id, undefined)
  const bare = /** @type {any} */ (run({ action: 'site.identity', params: {} }, J))
  assert.equal(bare.params.operation, undefined, 'no fields, no operation: the plugin reads')
  // Only the door's own keys: anything else is refused before it leaves.
  const stray = /** @type {any} */ (
    run({ action: 'site.identity', params: { operation: 'set', fields: { sitename: 'x' }, value: 'x' } }, J)
  )
  assert.equal(stray.kind, 'refuse')
  assert.equal(stray.answer.code, 'UNKNOWN_PARAM')
})

test('V0: the closed-params allowlist is the component’s readers, row for row, both ways', () => {
  const { rows } = fixture('closed-params/readers.json')
  const fromFixture = {}
  // `guarded` (30/09/2026): keys the host takes that a plugin older than the release that added them
  // ignores — `search`, read since Joomla 0.20.0 / WordPress 0.16.0 — so the relay refuses an answer to
  // one unless the plugin echoes it.
  for (const r of rows)
    (fromFixture[r.platform] ??= {})[r.action] = [...r.params, ...(r.host ?? []), ...(r.guarded ?? [])].sort()
  const fromCode = Object.fromEntries(
    Object.entries(ALLOWED_PARAMS).map(([p, t]) => [
      p,
      Object.fromEntries(Object.entries(t).map(([a, k]) => [a, [...k].sort()]))
    ])
  )
  assert.deepEqual(fromCode, fromFixture)
})

test('🔒 V0: the 9 r2 calls that carried a key nobody reads — 4 refused by name, the benign one dropped with a note, the 4 `search` ones relayed (30/09: the relay guards them)', () => {
  const calls = fixture('closed-params/r2-calls.json')
  assert.equal(calls.length, 9)
  let refused = 0
  let searched = 0
  for (const c of calls) {
    const n = /** @type {any} */ (run({ action: c.action, params: c.params }, WP))
    if (c.params.context !== undefined) {
      assert.equal(n.kind, 'relay', c.src)
      assert.equal(n.params.context, undefined)
      assert.ok(n.notes.some((/** @type {string} */ x) => /context dropped/.test(x)))
      continue
    }
    // `search` is a key of content.list since 30/09/2026: the host takes it and the relay refuses the
    // answer of a plugin that did not read it, so it is no longer refused by name here.
    if (c.params.search !== undefined) {
      assert.equal(n.kind, 'relay', c.src)
      assert.equal(n.params.search, c.params.search, c.src)
      searched += 1
      continue
    }
    assert.equal(n.answer.code, 'UNKNOWN_PARAM', c.src)
    assert.ok(n.answer.error.length <= 160, c.src)
    const next = refusalNext(n.answer, { platform: 'wordpress', action: c.action }) ?? ''
    assert.ok(next.length <= 200 && next !== '', c.src)
    refused += 1
  }
  assert.deepEqual([refused, searched], [4, 4])
  // The key a model reaches for next is still refused by name — and since `search` is advertised (30/09/2026,
  // the plugin releases exist) the refusal names it among the allowed keys and points at it.
  const query = /** @type {any} */ (
    run({ action: 'content.list', params: { kind: 'post', query: '550-67-89' } }, WP)
  )
  assert.equal(
    query.answer.error,
    '"query" is not a parameter of content.list here; allowed: kind, post_type, name, limit, offset, include_body, search'
  )
  assert.deepEqual(query.answer.allowed, [
    'kind',
    'post_type',
    'name',
    'limit',
    'offset',
    'include_body',
    'search'
  ])
  const queryNext = refusalNext(query.answer, { platform: 'wordpress', action: 'content.list' }) ?? ''
  assert.match(queryNext, /content\.list \{search:"<part of the title>"\}/)
  assert.match(queryNext, /page\.text \{path, match\}/)
})

// ── content.list {search} (30/09/2026): taken here, guarded by the relay, learned per site ─────────────

{
  for (const [platform, facts, kind] of [
    ['wordpress', WP, 'post'],
    ['joomla', J, 'article']
  ])
    test(`content.list search: a text is relayed trimmed and nothing else about the call changes: ${platform}`, () => {
      const n = /** @type {any} */ (
        run({ action: 'content.list', params: { kind, search: '  Roof repair ', limit: 20 } }, facts)
      )
      assert.equal(n.kind, 'relay')
      assert.deepEqual(n.params, { kind, search: 'Roof repair', limit: 20 })
      assert.deepEqual(n.notes, [])
    })
}

test('content.list search: a top-level search beside action moves into params and is kept', () => {
  const plan = planCall({ action: 'content.list', search: 'Hotline', params: { kind: 'post' } })
  assert.ok(plan.ok)
  const n = /** @type {any} */ (normalizeCall(plan.action, plan.params, /** @type {any} */ (WP)))
  assert.deepEqual([n.kind, n.params.search], ['relay', 'Hotline'])
})

test('content.list search: an empty or null one is dropped with a note; the list is asked as if it had none', () => {
  for (const [platform, facts, kind] of [
    ['wordpress', WP, 'post'],
    ['joomla', J, 'article']
  ])
    for (const empty of ['', '   ', '\n\t', null]) {
      const n = /** @type {any} */ (run({ action: 'content.list', params: { kind, search: empty } }, facts))
      assert.equal(n.kind, 'relay', `${platform} ${JSON.stringify(empty)}`)
      assert.equal('search' in n.params, false, `${platform} ${JSON.stringify(empty)}`)
      assert.deepEqual(n.notes, ['params.search dropped: it is empty, so it filters nothing'])
    }
})

test('content.list search: a list, a number or an object is refused bad_params; so is a text over 200 characters', () => {
  for (const [platform, facts, kind] of [
    ['wordpress', WP, 'post'],
    ['joomla', J, 'article']
  ]) {
    for (const bad of [['roof'], 42, true, { q: 'roof' }]) {
      const n = /** @type {any} */ (run({ action: 'content.list', params: { kind, search: bad } }, facts))
      assert.equal(n.kind, 'refuse', `${platform} ${JSON.stringify(bad)}`)
      assert.equal(n.answer.code, 'bad_params')
      assert.match(n.answer.error, /^search must be text of at most 200 characters, not /)
      assert.ok(n.answer.error.length <= 160)
      const next = refusalNext(n.answer, { platform, action: 'content.list' }) ?? ''
      assert.match(next, /search as one piece of text of at most 200 characters/)
      assert.ok(next.length <= 200)
    }
    const edge = /** @type {any} */ (
      run({ action: 'content.list', params: { kind, search: `${'a'.repeat(199)}é` } }, facts)
    )
    assert.equal(edge.kind, 'relay', `${platform}: 200 characters is the most it takes`)
    // Characters, not UTF-16 units: 200 emoji are 400 units and still fit; the 201st does not.
    assert.equal(
      /** @type {any} */ (run({ action: 'content.list', params: { kind, search: '😀'.repeat(200) } }, facts))
        .kind,
      'relay'
    )
    const long = /** @type {any} */ (
      run({ action: 'content.list', params: { kind, search: 'a'.repeat(201) } }, facts)
    )
    assert.equal(long.kind, 'refuse', platform)
    assert.equal(long.answer.code, 'bad_params')
    assert.match(long.answer.error, /^search is 201 characters; the most it takes is 200/)
    // Spaces around the text are not part of it: 200 characters and a margin still fit.
    assert.equal(
      /** @type {any} */ (
        run({ action: 'content.list', params: { kind, search: `  ${'a'.repeat(200)}  ` } }, facts)
      ).kind,
      'relay'
    )
  }
})

test('content.list search: an UNKNOWN_PARAM refusal names it among the allowed keys — except for a site that learned its plugin ignores it — and other actions still refuse it', () => {
  for (const [platform, facts, kind] of [
    ['wordpress', WP, 'post'],
    ['joomla', J, 'article']
  ]) {
    const stray = /** @type {any} */ (
      run({ action: 'content.list', params: { kind, search: 'roof', q: 'roof' } }, facts)
    )
    assert.equal(stray.kind, 'refuse', platform)
    assert.deepEqual(stray.answer.given, ['q'], 'search is a key here; q is not')
    assert.equal(stray.answer.allowed.at(-1), 'search', `${platform}: ${stray.answer.allowed}`)
    assert.match(stray.answer.error, /; allowed: .*, search$/)
    assert.ok(stray.answer.error.length <= 160)
    // …and so does the sentence built from the allowed keys, for a stray key that has no road of its own.
    const foo = /** @type {any} */ (
      run({ action: 'content.list', params: { kind, search: 'roof', foo: 1 } }, facts)
    )
    const fooNext = refusalNext(foo.answer, { platform, action: 'content.list' }) ?? ''
    assert.match(
      fooNext,
      /^Same call without foo: content\.list takes kind, .*, search here\.$/,
      `${platform}: ${fooNext}`
    )
    // A site that found its plugin ignoring `search` (15 minutes, call-memory `noListSearch`) is not told
    // to use it: the refusal's own words would contradict the next.
    const closed = /** @type {any} */ (
      run({ action: 'content.list', params: { kind, foo: 1 } }, { ...facts, noListSearch: true })
    )
    assert.equal(closed.kind, 'refuse', platform)
    assert.ok(!closed.answer.allowed.includes('search'), `${platform}: ${closed.answer.allowed}`)
    assert.doesNotMatch(closed.answer.error, /\bsearch\b/)
    // Another action's `content.get {search}` is still an unknown key: only the list has one.
    const other = /** @type {any} */ (
      run({ action: 'content.get', params: { kind, id: 1, search: 'x' } }, facts)
    )
    assert.deepEqual(
      [other.kind, other.answer.code, other.answer.given],
      ['refuse', 'UNKNOWN_PARAM', ['search']]
    )
    assert.ok(!other.answer.allowed.includes('search'), `${platform}: content.get ${other.answer.allowed}`)
  }
  // An unknown platform passes as it came, as every key does.
  assert.equal(checkParams('unknown', 'content.list', { search: 'x' }), null)
  assert.equal(checkParams('wordpress', 'content.list', { search: 'x' }), null)
  assert.equal(checkParams('joomla', 'content.list', { kind: 'article', search: 'x' }), null)
})

{
  for (const [platform, facts, kind] of [
    ['wordpress', { ...WP, noListSearch: true }, 'post'],
    ['joomla', { ...J, noListSearch: true }, 'article']
  ])
    test(`content.list search: a site learned to ignore it refuses it before the relay, and says why: ${platform}`, () => {
      const n = /** @type {any} */ (
        run({ action: 'content.list', params: { kind, search: 'roof', limit: 50 } }, facts)
      )
      assert.equal(n.kind, 'refuse')
      assert.deepEqual([n.answer.code, n.answer.learned], ['LIST_SEARCH_UNSUPPORTED', true])
      assert.ok(n.answer.error.length <= 160)
      const next = refusalNext(n.answer, { platform, action: 'content.list' }) ?? ''
      assert.match(next, /content\.read \{type:"article", locale, fields:"title,slug"\}/)
      // The same list without a search, and one whose search is empty, still go.
      assert.equal(run({ action: 'content.list', params: { kind, limit: 50 } }, facts).kind, 'relay')
      const empty = /** @type {any} */ (run({ action: 'content.list', params: { kind, search: '' } }, facts))
      assert.equal(empty.kind, 'relay')
      // Another action is not this dead road.
      assert.equal(run({ action: 'content.get', params: { kind, id: 1 } }, facts).kind, 'relay')
    })
  test('content.list search: only a site that learned it is refused before the relay', () => {
    assert.equal(
      run(
        { action: 'content.list', params: { kind: 'post', search: 'roof' } },
        { ...WP, noListSearch: false }
      ).kind,
      'relay'
    )
    assert.equal(run({ action: 'content.list', params: { kind: 'post', search: 'roof' } }, WP).kind, 'relay')
  })
}

test('content.list search: WordPress options are listed whole by the host, so a search on them is dropped and said', () => {
  const n = /** @type {any} */ (
    run({ action: 'content.list', params: { kind: 'option', search: 'blog' } }, WP)
  )
  assert.equal(n.kind, 'relay')
  assert.deepEqual(n.resolve, { type: 'wpOptions', keys: [...WP_SHOWN_OPTIONS] })
  assert.equal('search' in n.params, false)
  assert.ok(
    n.notes.some((/** @type {string} */ x) => x.startsWith('params.search dropped: options are listed whole'))
  )
})

test('V0 checks the call AFTER corrections (a corrected alias is never refused) and passes what it cannot judge', () => {
  // `title` is corrected into `post_title` inside fields; the top-level keys are all readers' keys.
  assert.equal(
    run({ action: 'content.update', params: { kind: 'post', id: 1, fields: { title: 'x' } } }, WP).kind,
    'relay'
  )
  // An unknown platform, or an action whose reader was not read, passes as it came.
  assert.equal(checkParams('unknown', 'content.list', { search: 'x' }), null)
  assert.equal(checkParams('wordpress', 'theme.style', { anything: 1 }), null)
  assert.equal(
    checkParams('joomla', 'content.contract', { operation: 'multilingual.retire', keep: [] }),
    null
  )
  // A siteKey inside params is never a parameter: dropped, and said.
  const n = /** @type {any} */ (
    run({ action: 'content.list', params: { kind: 'post', siteKey: 'x.tracy.test' } }, WP)
  )
  assert.equal(n.params.siteKey, undefined)
})

test('resolveCall: a slug is found by content.list {name}, then read by its id; none and two are said', async () => {
  const n = /** @type {any} */ (run({ action: 'content.get', params: { kind: 'post', key: 'contact' } }, WP))
  const one = /** @type {any} */ (
    await resolveCall(n, async () => ({ ok: true, items: [{ id: 39, title: 'Contact' }] }))
  )
  assert.deepEqual(one.params, { kind: 'post', id: 39 })
  const none = /** @type {any} */ (await resolveCall(n, async () => ({ ok: true, items: [] })))
  assert.equal(none.answer.error, 'not_found')
  const two = /** @type {any} */ (
    await resolveCall(n, async () => ({ ok: true, items: [{ id: 1 }, { id: 2 }] }))
  )
  assert.equal(two.answer.code, 'ADDRESS_MISSING')
  const options = /** @type {any} */ (run({ action: 'content.list', params: { kind: 'option' } }, WP))
  const read = /** @type {any} */ (
    await resolveCall(options, async (_a, p) => ({ ok: true, item: { value: `v:${p.key}` } }))
  )
  assert.equal(read.answer.items.length, 5)
  assert.deepEqual(read.answer.items[0], { key: 'blogname', value: 'v:blogname' })
})

// ── Review round (25/09/2026) ─────────────────────────────────────────────────────────────────────────

test('🔒 WP-20: an id the call carries is kept — its next never names another post, for update or delete', () => {
  // Verified before the fix: {id:42} after reading Home (42) then Contact (39) was told id:39 (Contact),
  // which writes Home's body over Contact (longer than Contact's, so BODY_SHRINK passes it).
  const read = {
    ...WP,
    postsRead: [
      { id: 42, title: 'Home' },
      { id: 39, title: 'Contact' }
    ]
  }
  // An update whose every field is a post field is WP-19's since P12 (a read decides, id 42 kept, see
  // the WP-19 test); one carrying another field still names no kind.
  for (const action of ['content.update', 'content.delete']) {
    const params =
      action === 'content.update' ? { id: 42, fields: { post_content: '<p>x</p>', hero: 'x' } } : { id: 42 }
    const n = /** @type {any} */ (run({ action, params }, read))
    assert.equal(n.answer.code, 'ADDRESS_MISSING', action)
    assert.equal(n.answer.id, 42)
    assert.equal(n.answer.candidates, undefined, `${action}: no other post is offered`)
    const next = refusalNext(n.answer, { platform: 'wordpress', action }) ?? ''
    assert.match(next, /keep id:42/, action)
    assert.deepEqual(
      [...next.matchAll(/id:(\d+)/g)].map((m) => m[1]),
      ['42'],
      `${action}: ${next}`
    )
  }
})

test('WP-20: with no id, one read post is named; several are listed to choose from, never chosen', () => {
  const body = { fields: { post_content: '<p>x</p>' } }
  const one = /** @type {any} */ (
    run({ action: 'content.update', params: body }, { ...WP, postsRead: [{ id: 39, title: 'Contact' }] })
  )
  assert.match(
    refusalNext(one.answer, { platform: 'wordpress', action: 'content.update' }) ?? '',
    /id:39 \(Contact\) if that is the page meant/
  )
  const two = /** @type {any} */ (
    run(
      { action: 'content.delete', params: {} },
      {
        ...WP,
        postsRead: [
          { id: 42, title: 'Home' },
          { id: 39, title: 'Contact' }
        ]
      }
    )
  )
  const next = refusalNext(two.answer, { platform: 'wordpress', action: 'content.delete' }) ?? ''
  assert.match(next, /the id of the page meant; this conversation read 42 \(Home\), 39 \(Contact\)/)
  assert.doesNotMatch(next, /id:\d/, 'no id is picked for the model')
  assert.ok(next.length <= 200)
  // Many long titles still fit T10's 200 characters, the rest counted.
  const many = /** @type {any} */ (
    run(
      { action: 'content.update', params: body },
      {
        ...WP,
        postsRead: [1, 2, 3, 4, 5].map((i) => ({ id: 100 + i, title: `A rather long page title ${i}` }))
      }
    )
  )
  const long = refusalNext(many.answer, { platform: 'wordpress', action: 'content.update' }) ?? ''
  assert.ok(long.length <= 200, long)
  assert.match(long, /more in candidates/)
})

test('🔒 WP writes: a present id that is not a whole number is refused; 0, "0" and a missing id still create', () => {
  for (const id of ['42abc', 42.5, true, -3, '42.0'])
    for (const action of ['content.update', 'content.delete']) {
      const params = {
        kind: 'post',
        id,
        ...(action === 'content.update' ? { fields: { post_content: 'x' } } : {})
      }
      const n = /** @type {any} */ (run({ action, params }, WP))
      assert.equal(n.kind, 'refuse', `${action} ${JSON.stringify(id)}`)
      assert.equal(n.answer.code, 'ADDRESS_MISSING')
      assert.equal(n.answer.needs, 'id')
    }
  for (const id of [0, '0', undefined, null, '']) {
    const n = /** @type {any} */ (
      run({ action: 'content.update', params: { kind: 'post', id, fields: { post_title: 'New' } } }, WP)
    )
    assert.equal(n.kind, 'relay', `create with id ${JSON.stringify(id)}`)
  }
  // A template part's string id is its slug (WP-13); an option reads no id at all.
  const part = /** @type {any} */ (
    run(
      {
        action: 'content.update',
        params: { kind: 'templatePart', id: 'twentyfive//header', fields: { content: 'x' } }
      },
      WP
    )
  )
  assert.equal(part.params.key, 'header')
  const option = /** @type {any} */ (
    run(
      {
        action: 'content.update',
        params: { kind: 'option', key: 'blogname', id: 'blogname', fields: { value: 'x' } }
      },
      WP
    )
  )
  assert.equal(option.kind, 'relay')
})

test('AL-3: apply.revert without an apply_id is refused with this conversation’s ids, on every platform', () => {
  for (const facts of [J, WP, { platform: 'unknown' }]) {
    const n = /** @type {any} */ (
      run(
        { action: 'apply.revert', params: {} },
        { ...facts, applyIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] }
      )
    )
    assert.equal(n.kind, 'refuse', facts.platform)
    assert.equal(n.answer.code, 'ADDRESS_MISSING')
    assert.deepEqual(n.answer.candidates, ['a2', 'a3', 'a4', 'a5', 'a6'], 'the five newest')
  }
  // The component's own answer, where it still arrives, names the receipt — never a new name.
  const next =
    refusalNext(
      { ok: false, error: 'bad_params', message: 'apply_id required' },
      { action: 'apply.revert' }
    ) ?? ''
  assert.match(next, /apply_id a write of this conversation answered/)
  assert.doesNotMatch(next, /short name/)
})

test('🔒 CC-1 and D9 run on content.contract whatever the platform reads — it exists on Joomla alone', () => {
  const unknown = { platform: 'unknown', mint: (/** @type {string} */ p) => `${p}-minted` }
  // No operation and no changes is the inspect it is, not a write lease.
  const inspect = /** @type {any} */ (run({ action: 'content.contract', params: {} }, unknown))
  assert.equal(inspect.params.operation, 'inspect')
  const apply = /** @type {any} */ (
    run(
      { action: 'content.contract', params: { operation: 'apply', changes: { 'module-441.1': 'Hi' } } },
      unknown
    )
  )
  assert.equal(apply.params.apply_id, 'contract-minted')
  assert.match(apply.params.request_id, /^r-[0-9a-f]{16}$/)
  const bare = /** @type {any} */ (
    run({ action: 'content.contract', params: { changes: { 'module-441.1': 'Hi' } } }, unknown)
  )
  assert.equal(bare.answer.code, 'UNKNOWN_OPERATION')
})

// ── P12 (PR2): the rows P3 dropped (0 in r2), CC-12, CC-15, CC-16, and the learned dead road ─────────

/** @param {unknown} n */
const relayed = (n) => {
  const r = /** @type {any} */ (n)
  assert.equal(r.kind, 'relay', JSON.stringify(r))
  return r
}

test('WP-11/12/25/26: a category or tag is a term by its taxonomy; an option is named by key and takes value', () => {
  const cat = relayed(run({ action: 'content.get', params: { kind: 'category', id: 5 } }, WP))
  assert.deepEqual(cat.params, { kind: 'term', id: 5, key: 'category' })
  const tag = relayed(
    run({ action: 'content.update', params: { kind: 'tags', id: 5, fields: { title: 'News' } } }, WP)
  )
  assert.deepEqual(
    [tag.params.kind, tag.params.key, tag.params.fields],
    ['term', 'post_tag', { name: 'News' }]
  )
  // WP-12 (hist demowpnam 19/09 `{kind:"option", id:"blogname"}`): the name given as id is the key.
  assert.deepEqual(
    relayed(run({ action: 'content.get', params: { kind: 'option', id: 'blogname' } }, WP)).params,
    {
      kind: 'option',
      key: 'blogname'
    }
  )
  for (const field of ['option_value', 'blogname'])
    assert.deepEqual(
      relayed(
        run(
          {
            action: 'content.update',
            params: { kind: 'option', key: 'blogname', fields: { [field]: 'Acme' } }
          },
          WP
        )
      ).params.fields,
      { value: 'Acme' },
      field
    )
  const two = /** @type {any} */ (
    run(
      {
        action: 'content.update',
        params: { kind: 'option', key: 'blogname', fields: { value: 'Acme', x: 1 } }
      },
      WP
    )
  )
  assert.equal(two.answer.code, 'NO_WRITABLE_FIELD')
  assert.match(two.answer.error, /^an option takes one field/)
})

test('WP-14/15/19/21/24: a part by its row is a post; "home" is the front page; a page is created as one', async () => {
  assert.deepEqual(
    relayed(run({ action: 'content.get', params: { kind: 'templatePart', id: 80 } }, WP)).params,
    {
      kind: 'post',
      id: 80
    }
  )
  // WP-21: a NEW page says its post type, or WordPress makes it a post.
  const page = relayed(
    run({ action: 'content.update', params: { kind: 'page', fields: { post_title: 'About' } } }, WP)
  )
  assert.deepEqual(page.params.fields, { post_title: 'About', post_type: 'page' })
  // WP-15: the page on the front is whichever option page_on_front names.
  /** @type {Array<[string, Record<string, unknown>]>} */
  const reads = []
  /** @param {unknown} answer */
  const reader =
    (answer) => async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) => {
      reads.push([action, params])
      return answer
    }
  const home = relayed(run({ action: 'content.get', params: { kind: 'post', key: 'home' } }, WP))
  assert.equal(home.resolve.type, 'wpFront')
  const front = /** @type {any} */ (await resolveCall(home, reader({ ok: true, item: { value: '42' } })))
  assert.deepEqual(front.params, { kind: 'post', id: 42 })
  assert.deepEqual(reads[0], ['content.get', { kind: 'option', key: 'page_on_front' }])
  const posts = /** @type {any} */ (await resolveCall(home, reader({ ok: true, item: { value: '0' } })))
  assert.equal(posts.answer.error, 'not_found')
  // WP-19: an edit by id with only post fields is a post — once a read says the row is one.
  const byId = relayed(run({ action: 'content.update', params: { id: 42, fields: { post_title: 'x' } } }, WP))
  assert.equal(byId.resolve.type, 'wpKindOfId')
  assert.equal(
    /** @type {any} */ (await resolveCall(byId, reader({ ok: true, item: { post_type: 'page' } }))).kind,
    'relay'
  )
  const part = /** @type {any} */ (
    await resolveCall(
      byId,
      reader({ ok: true, item: { post_type: 'wp_template_part', post_name: 'header' } })
    )
  )
  assert.equal(part.answer.code, 'ADDRESS_MISSING')
  assert.match(part.answer.error, /key:"header"/)
  // WP-24: a part named by its row's number is written by the slug that read names, its title kept.
  const byRow = relayed(
    run(
      { action: 'content.update', params: { kind: 'templatePart', id: 80, fields: { content: '<p>x</p>' } } },
      WP
    )
  )
  const slug = /** @type {any} */ (
    await resolveCall(
      byRow,
      reader({ ok: true, item: { post_type: 'wp_template_part', post_name: 'header', post_title: 'Header' } })
    )
  )
  assert.equal(slug.params.key, 'header')
  assert.equal(slug.params.id, undefined)
  assert.deepEqual(slug.params.fields, { content: '<p>x</p>', title: 'Header' })
})

test('CC-2/3/5/6/9/10: read words are an inspect, write words an apply, the ids hoisted, values made text', () => {
  assert.deepEqual(relayed(run({ action: 'content.contract', params: { operation: 'slots' } }, J)).params, {
    operation: 'inspect'
  })
  const update = relayed(
    run(
      {
        action: 'content.contract',
        params: { operation: 'update', changes: { 'module-1.0': 'x' }, expected_revision: 'r1' }
      },
      J
    )
  )
  assert.equal(update.params.operation, 'apply')
  // A write word with nothing to write writes nothing: said before the lock, never relayed.
  assert.equal(
    /** @type {any} */ (run({ action: 'content.contract', params: { operation: 'update' } }, J)).answer.code,
    'UNKNOWN_OPERATION'
  )
  // CC-5: the spellings measured on j-1ibzqi (23/09), wherever they sat.
  const ids = relayed(
    run(
      {
        action: 'content.contract',
        params: {
          operation: 'apply',
          applyId: 'contract-a',
          meta: { requestId: 'q' },
          revision: 'r1',
          changes: { 'module-1.0': 'x' }
        }
      },
      J
    )
  )
  assert.deepEqual(
    [ids.params.apply_id, ids.params.expected_revision, ids.params.meta],
    ['contract-a', 'r1', undefined]
  )
  assert.equal(
    ids.params.request_id,
    requestIdOf({ 'module-1.0': 'x' }, undefined, 'r1'),
    'Tracy makes it from the content'
  )
  // CC-6: slot values sent as `slots` after an apply are the changes — only when every key is a slot.
  const slots = relayed(
    run(
      {
        action: 'content.contract',
        params: { operation: 'apply', slots: { 'module-1.0': 'x' }, expected_revision: 'r1' }
      },
      J
    )
  )
  assert.deepEqual(slots.params.changes, { 'module-1.0': 'x' })
  // CC-9: a number is written as its text; null is not a slot's value.
  const text = relayed(
    run(
      {
        action: 'content.contract',
        params: { operation: 'apply', changes: { 'module-1.0': 123 }, expected_revision: 'r1' }
      },
      J
    )
  )
  assert.equal(text.params.changes['module-1.0'], '123')
  const nul = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: { operation: 'apply', changes: { 'module-1.0': null }, expected_revision: 'r1' }
      },
      J
    )
  )
  assert.deepEqual([nul.answer.code, nul.answer.rule], ['CONTRACT_RULE', 'not_text'])
  // CC-10: evidence as {slots:{…}}, or one sentence for the one change.
  for (const evidence of [{ slots: { 'module-1.0': 'Customer said x' } }, 'Customer said x'])
    assert.deepEqual(
      relayed(
        run(
          {
            action: 'content.contract',
            params: { operation: 'apply', changes: { 'module-1.0': 'x' }, evidence, expected_revision: 'r1' }
          },
          J
        )
      ).params.evidence,
      { 'module-1.0': 'Customer said x' }
    )
})

test('🔒 CC-12: an apply with no revision takes the one this conversation read; with none read, the host asks for one', () => {
  const apply = { action: 'content.contract', params: { operation: 'apply', changes: { 'module-1.0': 'x' } } }
  const filled = relayed(run(apply, { ...J, lastRevision: 'r9' }))
  assert.equal(filled.params.expected_revision, 'r9')
  assert.ok(filled.notes.some((/** @type {string} */ n) => /last read/.test(n)))
  const none = relayed(run(apply, J))
  assert.equal(none.params.expected_revision, undefined, 'never guessed')
  assert.equal(none.meta.needsRevision, true, 'site-call.mjs inspects once and answers INSPECT_FIRST')
  // A revision the call names wins over the remembered one.
  const named = relayed(
    run({ ...apply, params: { ...apply.params, expected_revision: 'r1' } }, { ...J, lastRevision: 'r9' })
  )
  assert.equal(named.params.expected_revision, 'r1')
})

test('🔒 WP-3 / E3.3: an action this site’s component lacks is refused before the relay, and says it was learned', () => {
  const n = /** @type {any} */ (
    run({ action: 'core.manifest', params: {} }, { ...WP, missing: ['core.manifest'] })
  )
  assert.equal(n.answer.code, 'NOT_ON_THIS_PLATFORM')
  assert.equal(n.answer.learned, true)
  assert.match(refusalNext(n.answer, { platform: 'wordpress', action: 'core.manifest' }) ?? '', /page\.text/)
  assert.equal(
    relayed(run({ action: 'core.manifest', params: {} }, { ...WP, missing: ['info'] })).action,
    'core.manifest'
  )
})

test('CC-15: a bare phone into a tel: link becomes tel:<digits> — a + only when one was written', () => {
  const slots = [
    { key: 'module-428.0', type: 'url', current: 'tel:88005506790', sample: 'tel:88005506790' },
    {
      key: 'module-428.2',
      type: 'url',
      current: 'mailto:info@northgate-ind.ru',
      sample: 'mailto:info@northgate-ind.ru'
    },
    { key: 'module-428.9', type: 'url', current: 'https://example.com', sample: 'https://example.com' }
  ]
  const base = { operation: 'apply', expected_revision: 'r1', apply_id: 'contract-a', request_id: 'r-old' }
  const out = prepareContractApply(
    {
      ...base,
      changes: {
        'module-428.0': '0909 123 456',
        'module-428.2': 'hello@acme.vn',
        'module-428.9': '+84 909 123 456'
      }
    },
    { slots }
  )
  assert.deepEqual(out.params.changes, {
    'module-428.0': 'tel:0909123456',
    'module-428.2': 'mailto:hello@acme.vn',
    'module-428.9': '+84 909 123 456'
  })
  assert.equal(
    prepareContractApply({ ...base, changes: { 'module-428.0': '+84 909 123 456' } }, { slots }).params
      .changes['module-428.0'],
    'tel:+84909123456'
  )
  // The request id is made again from what is now sent (D9).
  assert.equal(out.params.request_id, requestIdOf(out.params.changes, undefined, 'r1'))
  // No snapshot → nothing changes: the component decides, as before.
  const blind = { ...base, changes: { 'module-428.0': '0909 123 456' } }
  assert.equal(prepareContractApply(blind, {}).params, blind)
})

test('🔒 CC-16: evidence is the customer’s own sentence holding the value — never an invented one', () => {
  const slots = [
    {
      key: 'module-447.0',
      type: 'text',
      current: 'Clients we have built for',
      sample: 'Clients we have built for',
      requiresEvidence: true
    },
    {
      key: 'module-428.0',
      type: 'url',
      current: 'tel:88005506790',
      sample: 'tel:88005506790',
      requiresEvidence: true
    }
  ]
  const words = 'Our new hotline is 0909 123 456. Also rename the clients title to Clients we trust!'
  const out = prepareContractApply(
    {
      operation: 'apply',
      expected_revision: 'r1',
      changes: { 'module-447.0': 'Clients we trust', 'module-428.0': 'tel:0909123456' }
    },
    { slots, customerWords: words }
  )
  assert.deepEqual(out.params.evidence, {
    'module-447.0': 'Also rename the clients title to Clients we trust!',
    'module-428.0': 'Our new hotline is 0909 123 456.'
  })
  // Words the customer did not write get nothing: the component then asks, and the model declares.
  const invented = prepareContractApply(
    {
      operation: 'apply',
      expected_revision: 'r1',
      changes: { 'module-447.0': 'Trusted by industry leaders' }
    },
    { slots, customerWords: words }
  )
  assert.equal(invented.params.evidence, undefined)
  assert.doesNotMatch(JSON.stringify(invented.params), /Invented by Tracy/)
  // A part of a word is not the word; case, spacing and composition are set aside.
  assert.equal(customerSentence('Rename it to Trustworthy partners', 'trust'), null)
  assert.equal(
    customerSentence('rename it to  CLIENTS   we TRUST', 'Clients we trust'),
    'rename it to  CLIENTS   we TRUST'
  )
  assert.equal(customerSentence('call 0909 123', 'tel:0909123'), 'call 0909 123')
  // Cut to the component's 8,000 bytes on a character boundary.
  const long = `${'\u0111'.repeat(5_000)} Clients we trust`
  const cut = /** @type {string} */ (customerSentence(long, 'Clients we trust'))
  assert.ok(Buffer.byteLength(cut, 'utf8') <= EVIDENCE_BYTES)
  assert.ok(!cut.endsWith('�'))
})

// ── P12 review round (25/09/2026) ────────────────────────────────────────────────────────────────────

test('🔒 CC-15: the customer’s words decide the +, not the model’s value — and CC-16 then finds their sentence', () => {
  // Review 25/09: the customer writes 0909 123 456, the model sends +0909 123 456, and the value's own
  // `+` was kept — `tel:+0909123456` is another number, and no evidence matched the customer's digits.
  const slots = [
    {
      key: 'module-428.0',
      type: 'url',
      current: 'tel:88005506790',
      sample: 'tel:88005506790',
      requiresEvidence: true
    }
  ]
  const base = { operation: 'apply', expected_revision: 'r1', apply_id: 'contract-a' }
  /** @param {string} value @param {string} [words] */
  const phone = (value, words) =>
    prepareContractApply({ ...base, changes: { 'module-428.0': value } }, { slots, customerWords: words })
      .params
  const local = phone('+0909 123 456', 'Our new hotline is 0909 123 456.')
  assert.equal(/** @type {any} */ (local.changes)['module-428.0'], 'tel:0909123456')
  assert.deepEqual(local.evidence, { 'module-428.0': 'Our new hotline is 0909 123 456.' })
  // The customer wrote the +: kept.
  const intl = phone('+84 909 123 456', 'Hotline: +84 909 123 456 please.')
  assert.equal(/** @type {any} */ (intl.changes)['module-428.0'], 'tel:+84909123456')
  // The customer wrote the same digits without one: none.
  assert.equal(
    /** @type {any} */ (phone('+84 909 123 456', 'Hotline 84 909 123 456').changes)['module-428.0'],
    'tel:84909123456'
  )
  // Digits their latest message does not hold (given a turn earlier): a + before a 0 is never a
  // country code (E.164) and goes; a + before a country code stays — dropped, it too is another number.
  assert.equal(
    /** @type {any} */ (phone('+0909 123 456', 'use the number I gave you').changes)['module-428.0'],
    'tel:0909123456'
  )
  assert.equal(
    /** @type {any} */ (phone('+84 909 123 456', 'use the number I gave you').changes)['module-428.0'],
    'tel:+84909123456'
  )
  // A + is never added.
  assert.equal(
    /** @type {any} */ (phone('0909 123 456', 'Hotline +84 909 123 456').changes)['module-428.0'],
    'tel:0909123456'
  )
})

test('E3.2: meta.mintedIds names only the ids Tracy made for the call — never one the model gave', () => {
  /** @param {unknown} args @param {Record<string, unknown>} facts */
  const minted = (args, facts) => /** @type {any} */ (run(args, facts)).meta?.mintedIds ?? []
  const post = { kind: 'post', id: 42, fields: { post_title: 'x' } }
  // WP-27: the write's own wp- id when none is given; a given id is the model's.
  assert.deepEqual(minted({ action: 'content.update', params: post }, WP), ['apply_id'])
  assert.deepEqual(minted({ action: 'content.update', params: { ...post, apply_id: 'mine' } }, WP), [])
  // J-6: Joomla's write id is Tracy's when none is given; the one the model gives is part of the call.
  assert.deepEqual(
    minted(
      {
        action: 'content.update',
        params: { kind: 'article', id: 4, apply_id: 'a-1', fields: { title: 'x' } }
      },
      J
    ),
    []
  )
  // A contract apply: the request id is always Tracy's (made from the content the key holds anyway);
  // the apply id only when Tracy made it — absent, or already answered ok (D9).
  const apply = { operation: 'apply', expected_revision: 'r1', changes: { 'module-441.1': 'Hi' } }
  assert.deepEqual(minted({ action: 'content.contract', params: apply }, J), ['apply_id', 'request_id'])
  assert.deepEqual(minted({ action: 'content.contract', params: { ...apply, apply_id: 'contract-a' } }, J), [
    'request_id'
  ])
  assert.deepEqual(
    minted(
      { action: 'content.contract', params: { ...apply, apply_id: 'contract-a' } },
      { ...J, okIds: ['contract-a'] }
    ),
    ['apply_id', 'request_id']
  )
  // A receipt call's id IS its address, and a language job's id is the model's.
  assert.deepEqual(minted({ action: 'apply.revert', params: { apply_id: 'dtrim-1' } }, J), [])
  assert.deepEqual(
    minted(
      {
        action: 'content.contract',
        params: { operation: 'multilingual.retire', apply_id: 'mlang-1', keep: ['en-GB'] }
      },
      J
    ),
    []
  )
})

/**
 * 🔒 WP-1 STANDS ASIDE ON A WORDPRESS SITE PROVISION BOUND (#337). The Claude Cowork plugin 0.12+ has the contract door
 * and refuses every record write there, so a bound site's `content.contract` runs the contract's own
 * rules — CC-1 (no operation is an inspect), D9 (Tracy's `contract-` apply id and `r-` request id) —
 * and the closed-params check against the WordPress reader. A marker that could not say (`null`) lets
 * the call through: the Claude Cowork plugin's answer decides. Only a site known to be unbound is refused.
 */
test('🔒 WP-1: a bound WordPress site takes content.contract with the contract rules; an unbound one is refused', () => {
  const bound = { ...WP, contractDoor: true }
  const inspect = /** @type {any} */ (run({ action: 'content.contract', params: {} }, bound))
  assert.equal(inspect.kind, 'relay')
  assert.equal(inspect.params.operation, 'inspect')
  // Tracy's own filters are taken off the call, as on Joomla.
  const narrowed = /** @type {any} */ (
    run({ action: 'content.contract', params: { operation: 'inspect', page: 'home', match: 'Hi' } }, bound)
  )
  assert.deepEqual(narrowed.params, { operation: 'inspect' })
  assert.deepEqual(narrowed.host, { page: 'home', match: 'Hi' })
  const apply = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: {
          operation: 'apply',
          expected_revision: 'r1',
          changes: { 'home.hero.heading': 'Hi', 'vi::home.hero.heading': 'Chào' }
        }
      },
      bound
    )
  )
  assert.equal(apply.kind, 'relay')
  assert.equal(apply.params.apply_id, 'contract-minted')
  assert.match(apply.params.request_id, /^r-[0-9a-f]{16}$/)
  // The WordPress contract reader reads what Joomla's does: an unknown key is refused by name.
  const stray = /** @type {any} */ (
    run(
      { action: 'content.contract', params: { operation: 'apply', changes: { 'home.x': 'Hi' }, lang: 'vi' } },
      bound
    )
  )
  assert.equal(stray.answer.code, 'UNKNOWN_PARAM')
  assert.equal(stray.answer.platform, 'wordpress')
  // A marker that could not say: through, with the same rules.
  const unsure = /** @type {any} */ (
    run({ action: 'content.contract', params: {} }, { ...WP, contractDoor: null })
  )
  assert.equal(unsure.kind, 'relay')
  // Unbound (false), or a caller that never asked: WP-1 as before.
  for (const facts of [WP, { ...WP, contractDoor: false }]) {
    const refused = /** @type {any} */ (run({ action: 'content.contract', params: {} }, facts))
    assert.equal(refused.answer.code, 'NOT_ON_THIS_PLATFORM')
    assert.doesNotMatch(refused.answer.error, /Joomla-only/, 'a bound WordPress site has the door since #337')
  }
})

/**
 * 🔒 01/10/2026: AN IMPORTED WORDPRESS COPY WITH A DERIVED CONTRACT takes content.contract under the contract's
 * rules — the apply `content.read` and a pick name for a derived slot, with Tracy's ids and the content
 * revisions read — while its record writes stay open. A WordPress site that is neither bound nor derived
 * is still refused (WP-1).
 */
test('🔒 a derived WordPress copy takes content.contract with the contract rules; its records stay open', () => {
  const derived = { ...WP, derived: true }
  const apply = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: {
          operation: 'apply',
          changes: { 'post-12.post_content.0bfa07e1cb': 'Hi' },
          expected_content_revisions: { 'post:12': 'rev-1' }
        }
      },
      derived
    )
  )
  assert.equal(apply.kind, 'relay')
  assert.equal(apply.params.apply_id, 'contract-minted')
  assert.match(apply.params.request_id, /^r-[0-9a-f]{16}$/)
  assert.deepEqual(apply.params.expected_content_revisions, { 'post:12': 'rev-1' })
  const inspect = /** @type {any} */ (run({ action: 'content.contract', params: { match: 'Hi' } }, derived))
  assert.equal(inspect.kind, 'relay')
  assert.equal(inspect.params.operation, 'inspect')
  // A record write on the same copy is the open WordPress write, untouched by the flag.
  const write = /** @type {any} */ (
    run({ action: 'content.update', params: { kind: 'post', id: 12, fields: { post_title: 'Hi' } } }, derived)
  )
  assert.equal(write.kind, 'relay')
  assert.equal(write.params.apply_id, 'wp-turn-1')
  for (const facts of [WP, { ...WP, derived: false }]) {
    const refused = /** @type {any} */ (run({ action: 'content.contract', params: {} }, facts))
    assert.equal(refused.answer.code, 'NOT_ON_THIS_PLATFORM')
  }
})

/**
 * 🔒 01/10/2026: THE WORDPRESS STRING OVERRIDE IS A CONTRACT OPERATION TRACY KNOWS. `content.locate` names
 * `content.contract {operation:"string", …}` for words a theme or plugin prints (`notInContentNext`); it was
 * refused here as an unknown operation. The plugin takes the receipt's id from the caller and refuses a
 * missing or `contract-` one, so Tracy makes it; on Joomla it is not an operation at all.
 */
for (const [name, given, expected] of /** @type {const} */ ([
  ['no apply_id: Tracy makes one', undefined, 'string-minted'],
  ['a contract- id names an apply, not an override: replaced', 'contract-1', 'string-minted'],
  ['an override id of the caller is kept', 'str-7', 'str-7']
])) {
  test(`string override on WordPress — ${name}`, () => {
    const params = {
      operation: 'string',
      domain: 'woocommerce',
      msgid: 'Add to cart',
      locale: 'en_US',
      value: 'Book now',
      ...(given === undefined ? {} : { apply_id: given })
    }
    const out = /** @type {any} */ (
      run({ action: 'content.contract', params: { ...params } }, { ...WP, derived: true })
    )
    assert.equal(out.kind, 'relay', name)
    assert.equal(out.params.apply_id, expected, name)
    assert.equal(out.params.operation, 'string')
    assert.equal(out.params.msgid, 'Add to cart')
  })
}

// Review of 02/10/2026: the operation was meant for an IMPORTED copy, and a quickstart's contract door (Add site)
// took it too, a new write road for another flow. The door that existed before answers what it always answered.
// Local round 35 (26/10/2026): a build fenced out of the theme's files had no road for the words its PHP patterns print
// through gettext; the plugin takes the override on a quickstart site as on a derived one.
test('string override reaches a quickstart WordPress site too; on Joomla it is refused with the Joomla road', () => {
  const out = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: { operation: 'string', domain: 'x', msgid: 'y', locale: 'en_US', value: 'z' }
      },
      { ...WP, contractDoor: true }
    )
  )
  assert.equal(out.kind, 'relay')
  assert.equal(out.params.operation, 'string')
  const joomla = /** @type {any} */ (
    run(
      { action: 'content.contract', params: { operation: 'string', domain: 'x', msgid: 'y', value: 'z' } },
      { ...WP, platform: 'joomla', derived: true }
    )
  )
  assert.equal(joomla.kind, 'refuse')
  assert.equal(joomla.answer.code, 'NOT_ON_THIS_PLATFORM')
})

test('string override reaches the relay with the operation spelled as the plugin takes it', () => {
  const out = /** @type {any} */ (
    run(
      {
        action: 'content.contract',
        params: { operation: ' string ', domain: 'x', msgid: 'y', locale: 'en_US', value: 'z' }
      },
      { ...WP, derived: true }
    )
  )
  assert.equal(out.kind, 'relay')
  assert.equal(out.params.operation, 'string')
})

test('string override is refused on Joomla, before the relay, with the road that exists there', () => {
  const call = {
    action: 'content.contract',
    params: { operation: 'string', domain: 'x', msgid: 'y', locale: 'en', value: 'z' }
  }
  const imported = /** @type {any} */ (run(call, { ...J, derived: true }))
  assert.equal(imported.kind, 'refuse')
  assert.equal(imported.answer.code, 'NOT_ON_THIS_PLATFORM')
  assert.match(imported.answer.error, /content\.find/)
  // A sealed Joomla site (Add site) answers what it always answered.
  const sealed = /** @type {any} */ (run({ ...call, params: { ...call.params } }, J))
  assert.equal(sealed.kind, 'refuse')
  assert.equal(sealed.answer.code, 'UNKNOWN_OPERATION')
})

// ── Content API v2 (D2): an apply based on the content revisions this conversation read ─────────────

test('🔒 D2: an apply with no revision takes the content revisions content.read showed — no inspect needed', () => {
  const apply = {
    action: 'content.contract',
    params: { operation: 'apply', changes: { 'module-1.0': 'x', 'module-1.1': 'y' } }
  }
  /** @type {unknown[]} */
  const asked = []
  const read = (/** @type {string[]} */ keys) => {
    asked.push(keys)
    return { content_aaaa: 'rev-a1' }
  }
  const n = relayed(run(apply, { ...J, lastRevision: 'r9', contentRevisions: read }))
  assert.deepEqual(asked, [['module-1.0', 'module-1.1']])
  assert.deepEqual(n.params.expected_content_revisions, { content_aaaa: 'rev-a1' })
  assert.equal(n.params.expected_revision, undefined, 'the site-wide revision is not added: it is stricter')
  assert.equal(n.meta.needsRevision, undefined)
  assert.equal(
    n.params.request_id,
    requestIdOf(n.params.changes, n.params.evidence, undefined, { content_aaaa: 'rev-a1' })
  )
  // A slot content.read did not show: the old road (CC-12).
  const none = relayed(run(apply, { ...J, contentRevisions: () => null }))
  assert.equal(none.params.expected_content_revisions, undefined)
  assert.equal(none.meta.needsRevision, true)
})

test('D2: a revision the model named is kept, and the content revisions ride along — the Claude Cowork plugin checks both', () => {
  const n = relayed(
    run(
      {
        action: 'content.contract',
        params: { operation: 'apply', expected_revision: 'r1', changes: { 'module-1.0': 'x' } }
      },
      { ...J, contentRevisions: () => ({ content_aaaa: 'rev-a1' }) }
    )
  )
  assert.equal(n.params.expected_revision, 'r1')
  assert.deepEqual(n.params.expected_content_revisions, { content_aaaa: 'rev-a1' })
})

test('D2: expected_content_revisions is a parameter of both Claude Cowork plugins; a malformed one is dropped, never sent', () => {
  for (const platform of ['joomla', 'wordpress'])
    assert.ok(ALLOWED_PARAMS[platform]['content.contract:apply'].includes('expected_content_revisions'))
  const given = relayed(
    run(
      {
        action: 'content.contract',
        params: {
          operation: 'apply',
          changes: { 'module-1.0': 'x' },
          expected_content_revisions: { content_a: 'r' }
        }
      },
      J
    )
  )
  assert.deepEqual(given.params.expected_content_revisions, { content_a: 'r' })
  assert.equal(
    given.meta.needsRevision,
    undefined,
    'a map the model gave is a base; the Claude Cowork plugin judges it'
  )
  const bad = relayed(
    run(
      {
        action: 'content.contract',
        params: {
          operation: 'apply',
          changes: { 'module-1.0': 'x' },
          expected_content_revisions: { content_a: 3 }
        }
      },
      { ...J, lastRevision: 'r9' }
    )
  )
  assert.equal(bad.params.expected_content_revisions, undefined)
  assert.equal(bad.params.expected_revision, 'r9')
})

test('🔒 D2: another map is another request — the request id hashes the content revisions too', () => {
  const changes = { 'module-1.0': 'x' }
  const a = requestIdOf(changes, {}, undefined, { content_a: 'r1' })
  assert.notEqual(requestIdOf(changes, {}, undefined, { content_a: 'r2' }), a)
  assert.notEqual(requestIdOf(changes, {}, undefined), a)
  assert.equal(
    requestIdOf(changes, {}, 'r1', {}),
    requestIdOf(changes, {}, 'r1'),
    'no map: the id it always was'
  )
})

test('🔒 W1 (c): C47’s four NO_WRITABLE_FIELD calls each get the corrected call, within T10', () => {
  // Steps 6 and 7 of the after-final bench C47 (benchwp01, 25/09), as the model sent them, on menus
  // 69 and 70.
  const alone = /** @type {any} */ (
    run({ action: 'content.update', params: { kind: 'post', id: 69, removes: 'Careers' } }, WP)
  )
  assert.equal(alone.answer.code, 'NO_WRITABLE_FIELD')
  assert.equal(alone.answer.hint, 'removes')
  const aloneNext = refusalNext(alone.answer, { platform: 'wordpress' }) ?? ''
  assert.equal(
    aloneNext,
    'removes writes nothing: it lets a shorter body through. Same call with fields:{post_content:"<every block kept>"} beside it.'
  )
  const inside = /** @type {any} */ (
    run({ action: 'content.update', params: { kind: 'post', id: 69, fields: { removes: 'Careers' } } }, WP)
  )
  assert.equal(inside.answer.code, 'NO_WRITABLE_FIELD')
  assert.equal(inside.answer.hint, 'removes')
  const insideNext = refusalNext(inside.answer, { platform: 'wordpress' }) ?? ''
  assert.equal(
    insideNext,
    'removes goes beside fields, never in them: content.update {kind:"post", id, removes:"<3+ customer words verbatim, verb included>", fields:{post_content}}.'
  )
  // A template part's own spelling.
  const part = /** @type {any} */ (
    run(
      {
        action: 'content.update',
        params: { kind: 'templatePart', key: 'header', fields: { content: '<p>x</p>', removes: 'x y z' } }
      },
      WP
    )
  )
  assert.equal(part.answer.hint, 'removes')
  assert.match(
    refusalNext(part.answer, { platform: 'wordpress' }) ?? '',
    /\{kind:"templatePart", key, removes:/
  )
  // Empty fields without removes: the corrected call, not only "fields holding what changes".
  const empty = /** @type {any} */ (
    run({ action: 'content.update', params: { kind: 'post', id: 9, fields: {} } }, WP)
  )
  assert.equal(empty.answer.hint, undefined)
  assert.match(
    refusalNext(empty.answer, { platform: 'wordpress' }) ?? '',
    /content\.update \{kind:"post", id, fields:\{post_content:"<every block>"\}\}/
  )
  // An option takes `value` alone — no longer told a page's words are in post_content.
  const two = /** @type {any} */ (
    run(
      {
        action: 'content.update',
        params: { kind: 'option', key: 'blogname', fields: { value: 'A', x: 'B' } }
      },
      WP
    )
  )
  assert.equal(two.answer.code, 'NO_WRITABLE_FIELD')
  const optionNext = refusalNext(two.answer, { platform: 'wordpress' }) ?? ''
  assert.equal(optionNext, 'An option takes one field: the same call with fields:{value:"<text>"} only.')
  for (const next of [aloneNext, insideNext, optionNext]) assert.ok(next.length <= 200, next)
})

test('🔒 W1 (c): an empty-fields update of a term is never told to write a post (review 26/09)', () => {
  for (const params of [
    { kind: 'term', key: 'category', id: 7, fields: {} },
    { kind: 'term', key: 'category', id: 7, removes: 'drop it' }
  ]) {
    const r = /** @type {any} */ (normalizeCall('content.update', params, { platform: 'wordpress' }))
    const a = r?.refuse ?? r?.answer ?? r
    const next = String(
      refusalNext(
        { ok: false, ...a, code: a.code ?? 'NO_WRITABLE_FIELD' },
        { platform: 'wordpress', action: 'content.update' }
      )
    )
    assert.doesNotMatch(next, /kind:"post"|post_content/, JSON.stringify(params))
  }
  const post = /** @type {any} */ (
    normalizeCall('content.update', { kind: 'post', id: 7, fields: {} }, { platform: 'wordpress' })
  )
  const a = post?.refuse ?? post?.answer ?? post
  assert.match(
    String(
      refusalNext(
        { ok: false, ...a, code: a.code ?? 'NO_WRITABLE_FIELD' },
        { platform: 'wordpress', action: 'content.update' }
      )
    ),
    /post_content/
  )
})

// ── a page's own search title and description on WordPress (review of the where.seo fix, 05/10/2026) ──

/**
 * A fake site for the reads `wpSeoMeta` / `wpSeoField` make: its plugin list, Claude Cowork version,
 * Jetpack modules and site name. Records every read, and fails on anything else.
 * @param {{ plugins?: string[], component?: string | null, modules?: string[], blogname?: string, infoFails?: boolean }} site
 */
const seoSite = (site) => {
  /** @type {string[]} */
  const reads = []
  /** @param {string} action @param {Record<string, any>} params */
  const read = async (action, params) => {
    reads.push(action === 'content.get' ? `option:${params.key}` : action)
    if (action === 'plugin.list')
      return {
        ok: true,
        plugins: (site.plugins ?? []).map((file) => ({ file, name: file, version: '1.0', active: true }))
      }
    if (action === 'info')
      return site.infoFails
        ? { ok: false, error: 'unreachable' }
        : { ok: true, info: { php: '8.3', wordpress: '6.9', component: site.component ?? null } }
    if (action === 'content.get' && params.kind === 'option' && params.key === 'jetpack_active_modules')
      return { ok: true, item: { value: site.modules ?? [] } }
    if (action === 'content.get' && params.kind === 'option' && params.key === 'blogname')
      return { ok: true, item: { value: site.blogname ?? 'Northgate' } }
    assert.fail(`unexpected read ${action} ${JSON.stringify(params)}`)
  }
  return { read, reads }
}
/** @param {string} key @param {string} value */
const seoMetaCall = (key, value) =>
  run({ action: 'content.update', params: { kind: 'postmeta', id: 42, key, fields: { value } } }, WP)

test('seo: a WordPress write of the plugin’s own search title or description reads the site before it is sent', () => {
  const title = /** @type {any} */ (seoMetaCall('_claude_cowork_seo_title', 'About – Northgate'))
  assert.equal(title.kind, 'relay')
  assert.deepEqual(title.resolve, { type: 'wpSeoMeta', field: 'title' })
  const description = /** @type {any} */ (seoMetaCall('_claude_cowork_seo_description', 'Who we are.'))
  assert.deepEqual(description.resolve, { type: 'wpSeoMeta', field: 'description' })
  const other = /** @type {any} */ (seoMetaCall('_yoast_wpseo_metadesc', 'x'))
  assert.equal(other.resolve, undefined, 'any other meta key is sent as before')
  const post = /** @type {any} */ (
    run(
      {
        action: 'content.update',
        params: { kind: 'post', id: 42, fields: { post_excerpt: 'x', seo: { title: 'T' } } }
      },
      WP
    )
  )
  assert.deepEqual(post.resolve, { type: 'wpSeoField' })
})

test('seo: a plugin older than the one that prints it never gets the key — the refusal says the page title is the only title', async () => {
  const site = seoSite({ component: '0.17.4' })
  const r = /** @type {any} */ (
    await resolveCall(
      /** @type {any} */ (seoMetaCall('_claude_cowork_seo_title', 'About – Northgate')),
      site.read
    )
  )
  assert.equal(r.kind, 'refuse')
  assert.equal(r.answer.code, 'SEO_TITLE_UNSUPPORTED')
  assert.equal(r.answer.action, 'content.update')
  assert.match(r.answer.error, /0\.17\.4/)
  assert.match(r.answer.error, /0\.18\.0/)
  assert.match(r.answer.next, /breadcrumb/)
  assert.equal(refusalNext(r.answer, { platform: 'wordpress' }), r.answer.next)
  assert.deepEqual(site.reads, ['plugin.list', 'info'])
  const unknown = /** @type {any} */ (
    await resolveCall(
      /** @type {any} */ (seoMetaCall('_claude_cowork_seo_title', 'x')),
      seoSite({ component: null }).read
    )
  )
  assert.equal(
    unknown.answer.code,
    'SEO_TITLE_UNSUPPORTED',
    'a version it cannot read is not a version that prints it'
  )
  const lost = /** @type {any} */ (
    await resolveCall(
      /** @type {any} */ (seoMetaCall('_claude_cowork_seo_title', 'x')),
      seoSite({ infoFails: true }).read
    )
  )
  assert.equal(lost.kind, 'answer', 'a read that failed is passed on, never read as an old plugin')
})

test('seo: a plugin that prints it gets the key, and a title without the site name is pointed out', async () => {
  const site = seoSite({ component: '0.18.0', blogname: 'Northgate' })
  const kept = /** @type {any} */ (
    await resolveCall(
      /** @type {any} */ (seoMetaCall('_claude_cowork_seo_title', 'About us – Northgate')),
      site.read
    )
  )
  assert.equal(kept.kind, 'relay')
  assert.equal(kept.resolve, undefined)
  assert.equal(kept.params.key, '_claude_cowork_seo_title')
  assert.ok(!kept.notes.some((/** @type {string} */ n) => /site name/.test(n)))
  const bare = /** @type {any} */ (
    await resolveCall(
      /** @type {any} */ (seoMetaCall('_claude_cowork_seo_title', 'About us')),
      seoSite({ component: '0.19.2' }).read
    )
  )
  assert.equal(bare.kind, 'relay')
  assert.ok(
    bare.notes.some(
      (/** @type {string} */ n) => n.includes('" – Northgate"') && /unless the customer asked/.test(n)
    ),
    bare.notes.join(' | ')
  )
  const description = seoSite({ component: '0.18.0' })
  await resolveCall(
    /** @type {any} */ (seoMetaCall('_claude_cowork_seo_description', 'Who we are.')),
    description.read
  )
  assert.deepEqual(description.reads, ['plugin.list', 'info'], 'a description has no site name to keep')
})

test('seo: with Yoast or Rank Math running, their own keys are written instead, on any plugin version', async () => {
  for (const [file, title, description] of [
    ['wordpress-seo/wp-seo.php', '_yoast_wpseo_title', '_yoast_wpseo_metadesc'],
    ['seo-by-rank-math/rank-math.php', 'rank_math_title', 'rank_math_description']
  ]) {
    const site = seoSite({ plugins: ['polylang/polylang.php', file], component: '0.17.4' })
    const t = /** @type {any} */ (
      await resolveCall(/** @type {any} */ (seoMetaCall('_claude_cowork_seo_title', 'T')), site.read)
    )
    assert.equal(t.kind, 'relay', file)
    assert.equal(t.params.key, title)
    assert.ok(
      t.notes.some((/** @type {string} */ n) => n.includes(`→ ${title}`)),
      t.notes.join(' | ')
    )
    assert.deepEqual(
      site.reads,
      ['plugin.list'],
      'their keys hold on every Claude Cowork version: no version read'
    )
    const d = /** @type {any} */ (
      await resolveCall(
        /** @type {any} */ (seoMetaCall('_claude_cowork_seo_description', 'D')),
        seoSite({ plugins: [file] }).read
      )
    )
    assert.equal(d.params.key, description)
  }
})

test('seo: another SEO plugin keeps its fields where this door cannot write: said, not written', async () => {
  for (const [plugins, modules, name] of [
    [['all-in-one-seo-pack/all_in_one_seo_pack.php'], [], 'All in One SEO'],
    [['smartcrawl-seo/wpmu-dev-seo.php'], [], 'SmartCrawl'],
    [['surerank/surerank.php'], [], 'SureRank'],
    [['jetpack/jetpack.php'], ['stats', 'seo-tools'], 'Jetpack SEO']
  ]) {
    const r = /** @type {any} */ (
      await resolveCall(
        /** @type {any} */ (seoMetaCall('_claude_cowork_seo_title', 'T')),
        seoSite({
          plugins: /** @type {string[]} */ (plugins),
          modules: /** @type {string[]} */ (modules),
          component: '0.18.0'
        }).read
      )
    )
    assert.equal(r.kind, 'refuse', String(name))
    assert.equal(r.answer.code, 'SEO_PLUGIN_FIELDS')
    assert.ok(r.answer.error.includes(String(name)), r.answer.error)
  }
  const jetpackOff = /** @type {any} */ (
    await resolveCall(
      /** @type {any} */ (seoMetaCall('_claude_cowork_seo_title', 'T – Northgate')),
      seoSite({ plugins: ['jetpack/jetpack.php'], modules: ['stats'], component: '0.18.0' }).read
    )
  )
  assert.equal(
    jetpackOff.kind,
    'relay',
    'Jetpack without SEO Tools prints no title: the plugin’s own key holds'
  )
})

test('seo: a post write’s seo is held to the same rules — never dropped by an older plugin without a word', async () => {
  /** @param {Record<string, unknown>} seo */
  const postSeo = (seo) =>
    run(
      { action: 'content.update', params: { kind: 'post', id: 42, fields: { post_excerpt: 'x', seo } } },
      WP
    )
  const old = /** @type {any} */ (
    await resolveCall(/** @type {any} */ (postSeo({ title: 'T' })), seoSite({ component: '0.17.4' }).read)
  )
  assert.equal(old.answer.code, 'SEO_TITLE_UNSUPPORTED')
  const oldYoast = /** @type {any} */ (
    await resolveCall(
      /** @type {any} */ (postSeo({ title: 'T' })),
      seoSite({ plugins: ['wordpress-seo/wp-seo.php'], component: '0.17.4' }).read
    )
  )
  assert.equal(oldYoast.answer.code, 'SEO_FIELD_DROPPED')
  assert.match(oldYoast.answer.error, /_yoast_wpseo_title/)
  const fresh = /** @type {any} */ (
    await resolveCall(
      /** @type {any} */ (postSeo({ title: 'T – Northgate' })),
      seoSite({ component: '0.18.0' }).read
    )
  )
  assert.equal(fresh.kind, 'relay')
  assert.deepEqual(fresh.params.fields.seo, { title: 'T – Northgate' })
})

// 🔒 09/10/2026 (bench hb, WordPress delete): `content.read {view:"pages"}` prints a page's record as "post:26",
// the model sent it as the id, and each copy was a refused step (ADDRESS_MISSING on the delete, the component's
// bad_params on the read). The record as Tracy's own list prints it is read as kind + id, and said.
test('a record named as the page list prints it ("post:26") is read as kind and id, and said; a prefix that disagrees with kind is left to its refusal', () => {
  const said = (/** @type {string} */ ref, /** @type {string} */ kind, /** @type {number} */ id) =>
    `id "${ref}" → kind ${kind}, id ${id} (the record as content.read lists it)`
  for (const [
    facts,
    action,
    params,
    kind,
    id
  ] of /** @type {[any, string, Record<string, unknown>, string, number][]} */ ([
    [WP, 'content.delete', { kind: 'post', id: 'post:26' }, 'post', 26],
    [WP, 'content.get', { id: 'post:26' }, 'post', 26],
    [WP, 'content.get', { kind: 'page', id: 'post:37' }, 'post', 37],
    [WP, 'content.update', { kind: 'post', id: 'post:26', fields: { post_title: 'T' } }, 'post', 26],
    [J, 'content.get', { id: 'article:552' }, 'article', 552],
    [J, 'content.delete', { kind: 'article', id: ' article:552 ' }, 'article', 552],
    [J, 'content.get', { kind: 'menuItem', id: 'menuItem:603' }, 'menuItem', 603]
  ])) {
    const n = /** @type {any} */ (normalizeCall(action, params, facts))
    assert.equal(n.kind, 'relay', `${action} ${JSON.stringify(params)}: ${JSON.stringify(n)}`)
    assert.equal(n.params.kind, kind)
    assert.equal(n.params.id, id)
    const ref = String(params.id).trim()
    assert.ok(n.notes.includes(said(ref, ref.split(':')[0], id)), JSON.stringify(n.notes))
  }
  // A prefix that names another kind than the call's, a number past what an id holds, a string that is no
  // record: the call is left as asked, and its own refusal (or the component's) words the fault.
  for (const [facts, params] of /** @type {[any, Record<string, unknown>][]} */ ([
    [WP, { kind: 'term', id: 'post:26' }],
    [J, { kind: 'module', id: 'article:552' }],
    [WP, { kind: 'post', id: 'post:0' }],
    [WP, { kind: 'post', id: 'post:26:2' }],
    [WP, { kind: 'post', id: 'about-us' }]
  ])) {
    const n = /** @type {any} */ (normalizeCall('content.delete', params, facts))
    assert.ok(
      n.kind === 'refuse' || n.params.id === params.id,
      `${JSON.stringify(params)} left as asked: ${JSON.stringify(n)}`
    )
    assert.ok(
      !(n.notes ?? []).some((x) => /the record as content\.read lists it/.test(x)),
      JSON.stringify(params)
    )
  }
  // EmDash and a platform not known never read it: their ids are not CMS numbers.
  const em = /** @type {any} */ (normalizeCall('content.get', { id: 'post:26' }, { platform: 'emdash' }))
  assert.equal(em.params?.id, 'post:26')
})
