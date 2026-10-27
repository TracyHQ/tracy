/**
 * A Joomla create takes a JSON column as `{patch}` (round 7, 30/09/2026). Neutral fixtures: no page, title
 * or label of any bench site.
 *
 *   node --test packages/tools/tracy-site-tools/test/joomla-create-json.test.mjs
 *
 * Measured, before: `content.update {kind:"article", id:0, fields:{attribs:{patch:{…}}}}` was refused
 * ADDRESS_MISSING "changes an existing article: name its id" — though the same call with the id left out
 * CREATES, and a create has nothing stored to merge into. Two runs then sent `attribs` as JSON text, or
 * wrote the article without it and patched it in a second write (6 wasted calls).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCallMemory } from '../src/host/call-memory.mjs'
import { runSiteCall } from '../src/host/site-call.mjs'
import { planCall } from '../src/host/site.mjs'

/**
 * A relay that answers from a script and records every call.
 * @param {(action: string, params: Record<string, any>) => unknown} answer
 */
function relay(answer) {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    return answer(action, params)
  }
  return { sent, send }
}
/** An open Joomla site: `content.update` is the door for records. */
const joomla = (/** @type {Record<string, any>} */ over = {}) => ({
  memory: createCallMemory({ now: () => 1_000 }),
  sessionId: 'session-j',
  label: 'j-neutral',
  actorKey: 'ana@example.com',
  facts: { platform: 'joomla', sealed: false },
  sleep: async () => {},
  ...over
})
/** @param {unknown} args */
const plan = (args) => {
  const p = planCall(args)
  assert.ok(p.ok, JSON.stringify(p))
  return p
}
/**
 * A site whose write answers what the component answers: `{ok, kind, id, created}`, and no more. The
 * component reads `"0"` as 0 (a PHP int cast), so `created` counts the id as a number, not as a truthy string.
 */
const jSite = () =>
  relay((action, params) =>
    action === 'content.get'
      ? { ok: true, kind: params.kind, id: 90, item: { id: 90, title: 'Autumn open day', attribs: '{}' } }
      : { ok: true, kind: params.kind, id: 90, created: !Number(params.id) }
  )
const jCreate = (/** @type {Record<string, unknown>} */ fields, kind = 'article') =>
  plan({ action: 'content.update', params: { kind, apply_id: 'add-open-day', fields } })
/** The writes of a script's sent list. */
const writes = (/** @type {Array<[string, Record<string, any>]>} */ sent) =>
  sent.filter(([a]) => a === 'content.update')

test('🔒 Joomla: attribs {patch} on a create is the whole column — no read before it, no refusal, no second write', async () => {
  // Before: ADDRESS_MISSING "fields.attribs.patch changes an existing article: name its id", then a
  // retry with attribs as text, or a create without them and a second write to patch them.
  const site = jSite()
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: jCreate({
        title: 'Autumn open day',
        catid: 8,
        state: 1,
        attribs: { patch: { article_layout: 'tpl:news', show_author: null } }
      })
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(out.created, true)
  assert.equal(site.sent[0][0], 'content.update', 'nothing is read before the write: nothing is stored yet')
  assert.equal(writes(site.sent).length, 1)
  assert.equal(
    writes(site.sent)[0][1].fields.attribs,
    '{"article_layout":"tpl:news"}',
    'the patch is the column, a null key removing nothing'
  )
  assert.match(out.normalized.join(' '), /fields\.attribs\.patch: 1 key\(s\) written as the new attribs/)
})

test('Joomla: two patched columns on one create are both written whole', async () => {
  const site = jSite()
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: jCreate({
        title: 'Autumn open day',
        catid: 8,
        attribs: { patch: { article_layout: 'tpl:news' } },
        images: { patch: { image_intro: 'images/open-day.png', image_intro_alt: 'The hall' } }
      })
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(writes(site.sent).length, 1, 'one write carries both columns')
  const [write] = writes(site.sent)
  assert.equal(write[1].fields.attribs, '{"article_layout":"tpl:news"}')
  assert.deepEqual(JSON.parse(write[1].fields.images), {
    image_intro: 'images/open-day.png',
    image_intro_alt: 'The hall'
  })
})

test('Joomla: a patch on a record that exists still merges into what is stored (F1.2 is unchanged)', async () => {
  const site = relay((action, params) =>
    action === 'content.get'
      ? { ok: true, item: { id: 90, attribs: '{"show_author":"1","article_layout":"a:b"}' } }
      : { ok: true, kind: params.kind, id: 90, created: false }
  )
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: plan({
        action: 'content.update',
        params: {
          kind: 'article',
          id: 90,
          apply_id: 'x',
          fields: { attribs: { patch: { article_layout: 'tpl:news' } } }
        }
      })
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(site.sent[0][0], 'content.get', 'an edit reads the stored column first')
  assert.deepEqual(JSON.parse(writes(site.sent)[0][1].fields.attribs), {
    show_author: '1',
    article_layout: 'tpl:news'
  })
})

test('Joomla: the id left out or 0 is a create; an id the component would read as another record, or a kind it cannot create, still needs a real id', async () => {
  for (const id of [undefined, 0, '0']) {
    const site = jSite()
    const out = /** @type {any} */ (
      await runSiteCall({
        ...joomla({ send: site.send }),
        plan: plan({
          action: 'content.update',
          params: {
            kind: 'article',
            ...(id === undefined ? {} : { id }),
            apply_id: 'x',
            fields: { title: 'T', attribs: { patch: { a: 1 } } }
          }
        })
      })
    )
    assert.equal(out.ok, true, `id ${String(id)}`)
    assert.equal(writes(site.sent)[0][1].fields.attribs, '{"a":1}', `id ${String(id)}`)
  }
  for (const [name, params] of /** @type {const} */ ([
    ['"42abc" reads as 42 there', { kind: 'article', id: '42abc', fields: { attribs: { patch: { a: 1 } } } }],
    ['a template style is never created', { kind: 'templateStyle', fields: { params: { patch: { a: 1 } } } }],
    ['an extension is never created', { kind: 'extensionParams', fields: { params: { patch: { a: 1 } } } }]
  ])) {
    const site = jSite()
    const out = /** @type {any} */ (
      await runSiteCall({
        ...joomla({ send: site.send }),
        plan: plan({ action: 'content.update', params: { apply_id: 'x', ...params } })
      })
    )
    assert.equal(out.code, 'ADDRESS_MISSING', name)
    assert.equal(out.needs, 'id', name)
    assert.deepEqual(site.sent, [], `${name}: nothing is sent`)
  }
})

// ── F3 (round 7 follow-up, 30/09/2026): a plain object on a create is the whole column ──────────────────

test('🔒 Joomla: a plain object on a JSON column of a create IS the column — one write, nothing read, no refusal', async () => {
  // Before: PARAMS_WHOLE_COLUMN "the 1 key(s) sent would replace every other attribs of this article" —
  // for an article that does not exist yet, so there is nothing to replace. The model then sent the same
  // column as {patch}, or as JSON text: one wasted step.
  for (const id of [undefined, 0, '0']) {
    const site = jSite()
    const out = /** @type {any} */ (
      await runSiteCall({
        ...joomla({ send: site.send }),
        plan: plan({
          action: 'content.update',
          params: {
            kind: 'article',
            ...(id === undefined ? {} : { id }),
            apply_id: 'add-open-day',
            fields: {
              title: 'Autumn open day',
              catid: 8,
              attribs: { article_layout: 'tpl:news' },
              images: { image_intro: 'images/open-day.png', image_intro_alt: 'The hall' }
            }
          }
        })
      })
    )
    const at = `id ${String(id)}`
    assert.equal(out.ok, true, `${at}: ${JSON.stringify(out).slice(0, 300)}`)
    assert.equal(out.created, true, at)
    assert.equal(site.sent[0][0], 'content.update', `${at}: nothing is read before a create`)
    assert.equal(writes(site.sent).length, 1, at)
    const [write] = writes(site.sent)
    assert.equal(write[1].fields.attribs, '{"article_layout":"tpl:news"}', at)
    assert.deepEqual(JSON.parse(write[1].fields.images), {
      image_intro: 'images/open-day.png',
      image_intro_alt: 'The hall'
    })
    assert.match(out.normalized.join(' '), /fields\.attribs: an object, written as JSON text/, at)
  }
})

test('Joomla: a plain object on a module create is its whole params (a creatable kind other than an article)', async () => {
  const site = jSite()
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: jCreate(
        { title: 'Opening hours', position: 'sidebar-right', params: { cache: 0, style: 'none' } },
        'module'
      )
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(writes(site.sent).length, 1)
  assert.deepEqual(JSON.parse(writes(site.sent)[0][1].fields.params), { cache: 0, style: 'none' })
})

test('Joomla: a plain object on a record that exists is still refused PARAMS_WHOLE_COLUMN — nothing is sent', async () => {
  const site = jSite()
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: plan({
        action: 'content.update',
        params: {
          kind: 'article',
          id: 90,
          apply_id: 'x',
          fields: { attribs: { article_layout: 'tpl:news' } }
        }
      })
    })
  )
  assert.equal(out.code, 'PARAMS_WHOLE_COLUMN')
  assert.equal(out.id, 90)
  assert.deepEqual(out.keys, ['article_layout'])
  assert.match(out.error, /would replace every other attribs of this article/)
  assert.deepEqual(site.sent, [], 'nothing is sent')
})

test('Joomla: a kind the component cannot create, and an id it would read as another record, keep the whole-column refusal', async () => {
  for (const [name, params] of /** @type {const} */ ([
    ['"42abc" reads as 42 there', { kind: 'article', id: '42abc', fields: { attribs: { a: 1 } } }],
    ['a template style is never created', { kind: 'templateStyle', fields: { params: { a: 1 } } }],
    ['an extension is never created', { kind: 'extensionParams', fields: { params: { a: 1 } } }]
  ])) {
    const site = jSite()
    const out = /** @type {any} */ (
      await runSiteCall({
        ...joomla({ send: site.send }),
        plan: plan({ action: 'content.update', params: { apply_id: 'x', ...params } })
      })
    )
    assert.equal(out.code, 'PARAMS_WHOLE_COLUMN', name)
    assert.deepEqual(site.sent, [], `${name}: nothing is sent`)
  }
})

test('Joomla: on a create, a `patch` object beside other keys is neither form — refused, and the answer names the create, not a stored column', async () => {
  // `{patch:{…}, b:2}` would store a literal `patch` key and drop what the model meant as a patch.
  const site = jSite()
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: jCreate({
        title: 'Autumn open day',
        catid: 8,
        attribs: { patch: { article_layout: 'tpl:news' }, show_author: '0' }
      })
    })
  )
  assert.equal(out.code, 'PARAMS_WHOLE_COLUMN')
  assert.equal(out.create, true)
  assert.doesNotMatch(out.error, /replace every other/)
  assert.match(out.next, /\{patch:/)
  assert.doesNotMatch(out.next, /content\.get/, 'a create has no record to read')
  assert.ok(out.error.length <= 160 && out.next.length <= 200, `${out.error.length}/${out.next.length}`)
  assert.deepEqual(site.sent, [], 'nothing is sent')
})

test('Joomla: on a create, a lone `patch` that is not an object is neither form — refused, not stored as a literal `patch` key', async () => {
  // `{patch:"{…}"}` or `{patch:[…]}` is a model reaching for the patch form and missing it. Written as it
  // stands it stores `{"patch": …}` in the column and drops the settings the model meant.
  for (const patch of ['{"article_layout":"tpl:news"}', ['article_layout'], 3, null, true]) {
    const site = jSite()
    const out = /** @type {any} */ (
      await runSiteCall({
        ...joomla({ send: site.send }),
        plan: jCreate({ title: 'Autumn open day', catid: 8, attribs: { patch } })
      })
    )
    const at = JSON.stringify(patch)
    assert.equal(out.code, 'PARAMS_WHOLE_COLUMN', at)
    assert.equal(out.create, true, at)
    assert.deepEqual(out.keys, ['patch'], at)
    assert.doesNotMatch(out.error, /replace every other/, at)
    assert.doesNotMatch(out.error, /beside other keys/, `${at}: there is no other key`)
    assert.match(out.error, /"patch"/, at)
    assert.match(out.next, /\{patch:/, at)
    assert.doesNotMatch(out.next, /content\.get/, `${at}: a create has no record to read`)
    assert.ok(
      out.error.length <= 160 && out.next.length <= 200,
      `${at}: ${out.error.length}/${out.next.length}`
    )
    assert.deepEqual(site.sent, [], `${at}: nothing is sent`)
  }
})

test('Joomla: a `patch` key that is not an object BESIDE the column’s own keys, and the edit form, keep the rules they had', async () => {
  // Beside other keys it is one of the column's own keys: written whole, as before.
  const site = jSite()
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: jCreate({ title: 'Autumn open day', catid: 8, attribs: { patch: 'x', show_author: '0' } })
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.deepEqual(JSON.parse(writes(site.sent)[0][1].fields.attribs), { patch: 'x', show_author: '0' })
  // On a record that exists a lone `patch` string is still the whole-column refusal of an edit.
  const edit = jSite()
  const refused = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: edit.send }),
      plan: plan({
        action: 'content.update',
        params: { kind: 'article', id: 90, apply_id: 'x', fields: { attribs: { patch: 'x' } } }
      })
    })
  )
  assert.equal(refused.code, 'PARAMS_WHOLE_COLUMN')
  assert.equal('create' in refused, false)
  assert.deepEqual(edit.sent, [], 'nothing is sent')
})
