/**
 * The WordPress engine of "Apply", run over the REAL `tracy-business/wp7/1.3.2` contract and the seeder's real
 * planners and door calls, with a model double and a site double that holds the contract's revision the
 * way the plugin does (a write at a stale revision is refused, so a missed re-inspect fails here).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import sharp from 'sharp'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { createWordpressEngine } from '../src/sites/brief-engines/wordpress.js'
import { MAX_PICTURES } from '../src/sites/brief-engines/pictures.js'
import { throughDoor } from './_apply-door.mjs'

const contract = contractFor(defaultContracts(), 'tracy-business/wp7', '1.3.2')
assert.ok(contract, 'the checkout ships tracy-business/wp7 1.3.2')
const read = (name) => JSON.parse(readFileSync(path.join(contract.dir, name), 'utf8'))
const contentMap = read('content-map.json')
const editions = read('editions.json')

/**
 * What the model double keeps of a sample: its words without the template's facts (an address, digits), as FACT_RULES asks a
 * real model to. The guard refuses a fact the template's own sample carries (ledger L09), so a double that echoed one would
 * only be measuring the guard.
 */
const withoutFacts = (text) =>
  String(text)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, 'us')
    .replace(/\d/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

/** The model: English for the source edition, Vietnamese (with a `ở` the batch's own samples lack) for `vi`. */
function fakeModel({
  down = false,
  fail = () => false,
  invent = null,
  meter = {},
  judge = '{"hide": [], "relabel": {}}',
  pend = [],
  repair = null,
  lines = {},
  echo = [],
  say = () => undefined,
  translate = (text) => `[vi] ${text}`,
  categories = null,
  title = (/** @type {any} */ line) =>
    String(line.story[0] ?? '')
      .split(/\s+/)
      .slice(0, 5)
      .join(' ')
} = {}) {
  const calls = []
  const judged = []
  const repairs = []
  const translated = []
  /** Asks of the old title stage, kept to prove none is made: the demo posts are translated, never retitled. */
  const titled = []
  /** Asks of the old blog plan (briefs, then each post rewritten), kept to prove none is made. */
  const blogged = []
  /** The asks that name the blog categories for the business (`blog-categories.js`). */
  const named = []
  return {
    calls,
    named,
    blogged,
    judged,
    repairs,
    translated,
    titled,
    models: async () => ({
      text: {
        usage: () => meter,
        chat: async ({ messages }) => {
          const input = JSON.parse(messages[1].content)
          if (messages[0].content.startsWith('You are tidying')) {
            judged.push({ ...input, system: messages[0].content })
            return judge
          }
          // The seeder's translator (`plan-joomla-language`): an array of {i, text} in, the same array translated out.
          if (messages[0].content.startsWith('You are translating')) {
            translated.push(...input.map((item) => item.text))
            return JSON.stringify(input.map(({ i, text }) => ({ i, text: translate(text) })))
          }
          // One line asked alone (`translate-lines.js`), after its batch could not be used.
          if (messages[0].content.startsWith('You translate one line')) {
            translated.push(input.text)
            return JSON.stringify({ text: translate(input.text) })
          }
          // The seeder's button translator (`template-buttons.mjs`): the labels translated, never rewritten.
          if (messages[0].content.startsWith('Translate the labels')) {
            translated.push(...input.labels.map((/** @type {any} */ l) => l.label))
            return JSON.stringify({
              values: Object.fromEntries(
                input.labels.map((/** @type {any} */ l) => [l.key, translate(l.label)])
              )
            })
          }
          // The category namer: `categories(input, n)` answers the n-th ask; none set, the model gives no answer.
          if (messages[0].content.startsWith('You name the blog categories')) {
            named.push(input)
            if (!categories) throw new Error('no category answer')
            return JSON.stringify({ names: categories(input, named.length) })
          }
          if (
            messages[0].content.startsWith('You plan the blog') ||
            messages[0].content.startsWith('You write the articles')
          ) {
            blogged.push({ system: messages[0].content, input })
            return '{}'
          }
          if (messages[0].content.startsWith('You title the articles')) {
            titled.push(input)
            return JSON.stringify({
              values: Object.fromEntries(input.lines.map((/** @type {any} */ l) => [l.key, title(l)]))
            })
          }
          if (messages[0].content.startsWith('You finish the words')) {
            repairs.push(input)
            if (repair === 'throw') throw new Error('model gone')
            return typeof repair === 'function' ? repair(input) : (repair ?? '{"values": {}}')
          }
          calls.push(input)
          if (down || fail(input)) throw new Error('model down')
          const vi = input.slots[0]?.language === 'vi'
          // The keys the model leaves pending: a list, or a rule by language.
          const pended = (/** @type {string} */ key) =>
            Array.isArray(pend) ? pend.includes(key) : pend(key, input.slots[0]?.language)
          const values = {}
          for (const s of input.slots)
            if (!pended(s.key))
              // An empty sample stays empty, as the planner's prompt asks (the social links of a template).
              values[s.key] =
                say(s, input.slots[0]?.language) ??
                (s.key.startsWith('line.')
                  ? (lines[s.sample] ?? `Said again: ${s.sample}`.slice(0, s.maxCharacters))
                  : s.sample === ''
                    ? ''
                    : vi
                      ? 'phở ngon'
                      : `Crust ${withoutFacts(s.sample)}`.slice(0, s.maxCharacters))
          if (invent && invent in values) values[invent] = 'Call +84 24 1111 2222'
          // A model that keeps the template's own fact in its line (the founding year, the demo's hotline).
          for (const s of input.slots)
            if (echo.includes(s.key)) values[s.key] = `Crust ${s.sample}`.slice(0, s.maxCharacters)
          return JSON.stringify({
            values,
            pending: input.slots.filter((s) => pended(s.key)).map((s) => s.key)
          })
        }
      }
    })
  }
}

/** The text slots of the contract that sit in a page's blocks, in contract order. */
const blockSlots = contentMap.slots.filter((s) => s.target.block && s.type === 'text')
const lastBlockSlot = blockSlots.at(-1).key

/** The image slots of the contract that sit in a page's blocks. */
const imageSlots = contentMap.slots.filter((s) => s.target.block && s.type === 'image')

/** A page of an edition as the site stores it: one paragraph block per text slot (in that edition's words) and one figure per picture. */
function pageMarkup(entityKey, slug) {
  const words = blockSlots
    .filter((s) => s.entity === entityKey)
    .map((s) => {
      // Only one slot of the whole edition carries `ở`: the batch that does not hold it must still accept it.
      const text = slug === 'vi' ? (s.key === lastBlockSlot ? 'Phở ngon ơi' : 'Chúng tôi') : 'Text'
      return `<!-- wp:paragraph {"metadata":{"name":"${s.target.block}"}} -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`
    })
  const figures = imageSlots
    .filter((s) => s.entity === entityKey)
    .map(
      (s) =>
        `<!-- wp:image {"metadata":{"name":"${s.target.block}"}} -->\n<figure class="wp-block-image"><img src="${s.sample}" alt=""/></figure>\n<!-- /wp:image -->`
    )
  return [...words, ...figures].join('\n')
}

/** A bound site: it keeps its revision, refuses a write made at another one, and remembers what it was asked. */
function fakeSite() {
  const pageOf = new Map()
  for (const [slug, e] of Object.entries(editions.locales))
    for (const [entityKey, id] of Object.entries(e.ids)) pageOf.set(id, { slug, entityKey })
  const site = {
    revision: 'rev-1',
    calls: [],
    applied: null,
    retired: null,
    relabel: null,
    uploads: [],
    sweep: null,
    sweepWrites: [],
    writing: false,
    /** The component takes ONE write at a time: a second one while the first is in flight is refused, as the real one does. */
    apply: async (call) => {
      const writes =
        call.action === 'media.upload' ||
        (call.action === 'content.contract' &&
          ['demoTrim.apply', 'apply', 'multilingual.retire', 'sourceLanguage.set', 'blockWords.set'].includes(
            call.params?.operation
          )) ||
        call.action === 'content.update'
      if (!writes) return site.answer(call)
      if (site.writing)
        return { ok: false, error: 'writer_busy', message: 'another writer is changing this site' }
      site.writing = true
      try {
        await new Promise((resolve) => setTimeout(resolve, 2))
        return await site.answer(call)
      } finally {
        site.writing = false
      }
    },
    answer: async ({ action, params }) => {
      site.calls.push(`${action}${params?.operation ? `:${params.operation}` : ''}`)
      // The plugin's block-word door (after 0.18.7): the English attribute words of the pages and theme, and the ones WordPress
      // translates itself. `blockWords: false` is an older plugin.
      if (action === 'content.contract' && String(params?.operation).startsWith('blockWords.')) {
        if (site.blockWords === false)
          return {
            ok: false,
            error: 'bad_operation',
            message: `Unknown contract operation ${params.operation}`
          }
        if (params.operation === 'blockWords.read')
          return {
            ok: true,
            pairs: 3,
            found: [
              { source: 'Read more', pairs: ['core/post-excerpt moreText'], count: 8, core: 'Xem thêm' },
              { source: 'By ', pairs: ['core/post-author-name prefix'], count: 12, core: null },
              {
                source: 'Search the site',
                pairs: ['core/search placeholder'],
                count: 2,
                core: 'Search the site'
              }
            ],
            words: {}
          }
        site.blockWordsSet = params
        return { ok: true, apply_id: params.apply_id, locale: params.locale, words: params.words, written: 2 }
      }
      // A page of another language, as a site that runs Polylang answers it: never listed, read and written by its id.
      const copy = params?.kind === 'post' ? site.sweep?.copies?.[params.id] : undefined
      if (copy && action === 'content.get')
        return {
          ok: true,
          item: {
            ID: params.id,
            post_type: 'page',
            post_name: copy.slug,
            post_title: copy.slug,
            post_status: copy.status,
            post_content: copy.content,
            post_excerpt: ''
          }
        }
      if (copy && action === 'content.update') {
        if (site.sweep.refuse) return { ok: false, error: 'refused', message: 'the site would not take it' }
        site.sweepWrites.push(params)
        if (params.fields.post_content !== undefined) copy.content = params.fields.post_content
        if (params.fields.post_status !== undefined) copy.status = params.fields.post_status
        return { ok: true }
      }
      if (action === 'media.upload') {
        site.uploads.push(params)
        return { ok: true }
      }
      if (site.sweep && action === 'content.list' && params.post_type === 'wpcf7_contact_form')
        return {
          ok: true,
          items: Object.keys(site.sweep.mails ?? {}).map((id) => ({
            id: Number(id),
            slug: `form-${id}`,
            title: `Form ${id}`,
            status: site.sweep.draftForms?.includes(Number(id)) ? 'draft' : 'publish'
          }))
        }
      if (site.sweep && action === 'content.list') {
        // A site that has not started answering lists nothing for a moment.
        if (params.post_type === 'page' && site.sweep.emptyListings > 0) {
          site.sweep.emptyListings -= 1
          return { ok: true, items: [] }
        }
        // The blog's posts (`sweep.posts`, none unless a test gives them), with their excerpt, date and terms as the plugin lists them.
        const rows =
          params.post_type === 'page'
            ? site.sweep.pages
            : params.post_type === 'post'
              ? (site.sweep.posts ?? [])
              : site.sweep.navs
        return {
          ok: true,
          items: rows.slice(params.offset, params.offset + params.limit).map((r) => ({
            id: r.id,
            slug: r.slug,
            title: r.title,
            status: r.status,
            // The plugin lists each page's address (`get_permalink`); a row given one here carries it.
            ...(r.url ? { url: r.url } : {}),
            ...(r.created ? { created: r.created, categories: r.categories ?? [], tags: r.tags ?? [] } : {}),
            ...(params.include_body ? { content: r.content, excerpt: r.excerpt ?? '' } : {})
          }))
        }
      }
      // A category or a tag, by its id and taxonomy, as the plugin reads and renames one.
      if (site.sweep?.terms && params.kind === 'term') {
        const term = site.sweep.terms[params.key]?.[params.id]
        if (action === 'content.get')
          return term ? { ok: true, item: term } : { ok: false, error: 'not_found' }
        site.sweepWrites.push(params)
        Object.assign(term, params.fields)
        return { ok: true }
      }
      // An option, and the metas a theme keeps per page beside the ones Tracy's own sweep reads.
      if (site.sweep?.options && action === 'content.get' && params.kind === 'option')
        return params.key in site.sweep.options
          ? { ok: true, item: { value: site.sweep.options[params.key] } }
          : { ok: false, error: 'not_found', message: `no option "${params.key}"` }
      if (
        site.sweep?.postmeta &&
        params.kind === 'postmeta' &&
        !['_form', '_mail', 'tracy_page_heading'].includes(params.key)
      ) {
        const row = site.sweep.postmeta[params.id] ?? {}
        if (action === 'content.get')
          return params.key in row
            ? { ok: true, item: { value: row[params.key] } }
            : { ok: false, error: 'not_found', message: `no postmeta at id ${params.id}` }
        site.sweepWrites.push(params)
        site.sweep.postmeta[params.id] = { ...row, [params.key]: params.fields.value }
        return { ok: true }
      }
      if (site.sweep?.pageMeta && params.kind === 'postmeta' && params.key === 'tracy_page_heading') {
        const meta = site.sweep.pageMeta[params.id]
        if (action === 'content.get')
          return meta ? { ok: true, item: { value: meta.heading } } : { ok: false, error: 'not_found' }
        site.sweepWrites.push(params)
        meta.heading = params.fields.value
        return { ok: true }
      }
      // A blog post, read by its id (a post the site's update does not keep, `sweep.unkept`, reads back as it was).
      const post = params?.kind === 'post' ? site.sweep?.posts?.find((r) => r.id === params.id) : undefined
      if (post && action === 'content.get')
        return {
          ok: true,
          item: {
            ID: post.id,
            post_type: 'post',
            post_name: post.slug,
            post_title: post.title,
            post_status: post.status,
            post_excerpt: post.excerpt ?? '',
            post_content: post.content ?? ''
          }
        }
      if (post && action === 'content.update' && site.sweep.unkept?.includes(post.id)) {
        site.sweepWrites.push(params)
        return { ok: true }
      }
      if (site.sweep?.pageMeta && params.kind === 'post' && action === 'content.get')
        return { ok: true, item: { post_excerpt: site.sweep.pageMeta[params.id]?.excerpt ?? '' } }
      if (
        site.sweep?.pageMeta &&
        params.kind === 'post' &&
        action === 'content.update' &&
        params.fields.post_excerpt !== undefined
      ) {
        site.sweepWrites.push(params)
        site.sweep.pageMeta[params.id].excerpt = params.fields.post_excerpt
        return { ok: true }
      }
      if (site.sweep?.mails && params.kind === 'postmeta' && params.key === '_mail') {
        if (action === 'content.get')
          return params.id in site.sweep.mails
            ? { ok: true, item: { value: site.sweep.mails[params.id] } }
            : { ok: false, error: 'not found' }
        site.sweepWrites.push(params)
        site.sweep.mails[params.id] = params.fields.value
        return { ok: true }
      }
      if (site.sweep?.forms && action === 'content.get' && params.kind === 'postmeta')
        return params.id in site.sweep.forms
          ? { ok: true, item: { value: site.sweep.forms[params.id] } }
          : { ok: false, error: 'not found' }
      if (site.sweep?.forms && action === 'content.update' && params.kind === 'postmeta') {
        site.sweepWrites.push(params)
        site.sweep.forms[params.id] = params.fields.value
        return { ok: true }
      }
      if (site.sweep && action === 'content.get' && params.kind === 'templatePart')
        return {
          ok: true,
          item: { content: site.sweep.parts[params.key] },
          body_revision: `rev-${params.key}`
        }
      if (site.sweep && action === 'content.update') {
        if (site.sweep.refuse) return { ok: false, error: 'refused', message: 'the site would not take it' }
        site.sweepWrites.push(params)
        const { kind, id, key, fields } = params
        if (kind === 'templatePart') site.sweep.parts[key] = fields.content
        else {
          const row = [...site.sweep.pages, ...site.sweep.navs, ...(site.sweep.posts ?? [])].find(
            (r) => r.id === id
          )
          if (fields.post_content !== undefined) row.content = fields.post_content
          if (fields.post_excerpt !== undefined) row.excerpt = fields.post_excerpt
          if (fields.post_status !== undefined) row.status = fields.post_status
          if (fields.post_title !== undefined) row.title = fields.post_title
        }
        return { ok: true }
      }
      if (action === 'content.get') {
        const page = pageOf.get(params.id)
        return page
          ? { ok: true, item: { post_content: pageMarkup(page.entityKey, page.slug) } }
          : { ok: false, error: 'not_found' }
      }
      if (action !== 'content.contract') return { ok: false, error: `unknown action: ${action}` }
      switch (params.operation) {
        case 'inspect':
          return {
            ok: true,
            bound: true,
            contract: contract.id,
            revision: site.revision,
            multilingual: { applyId: null }
          }
        case 'demoTrim.apply':
          site.revision = 'rev-2'
          return { ok: true, status: 'completed', hidden: 5, skipped: 0 }
        case 'apply':
          // A value the site will not take is named, and the whole apply refused, as the plugin does.
          if (site.refuseSlot && site.refuseSlot in params.changes)
            return {
              ok: false,
              error: 'invalid_value',
              message: `the value of ${site.refuseSlot} was refused`
            }
          if (params.expected_revision !== site.revision)
            return {
              ok: false,
              error: 'stale_revision',
              message: `the site is at ${site.revision}, not ${params.expected_revision}`
            }
          // The first write is `applied`; a later one (the other languages' pictures) is merged into it.
          if (site.applied) Object.assign(site.applied.changes, params.changes)
          else site.applied = params
          // The plugin writes `<edition>::<slot>` into the FIRST block of that name on the edition's copy.
          for (const [key, value] of Object.entries(params.changes)) {
            const [locale, slotKey] = key.includes('::') ? key.split('::') : [null, key]
            const slot = contentMap.slots.find(
              (x) => x.key === slotKey && x.target.block && x.type === 'text'
            )
            const copy =
              locale && slot ? site.sweep?.copies?.[editions.locales[locale]?.ids?.[slot.entity]] : null
            if (copy)
              copy.content = copy.content.replace(
                new RegExp(
                  `(\\{"metadata":\\{"name":"${slot.target.block.replace(/\./g, '\\.')}"\\}\\} -->\\n<[a-z0-9]+>)[^<]*`
                ),
                (_, open) => `${open}${value}`
              )
          }
          site.revision = 'rev-3'
          return { ok: true, afterRevision: 'rev-3' }
        case 'multilingual.retire':
          site.retired = params
          return { ok: true, status: 'completed', retired: ['xx'], live: params.keep }
        case 'sourceLanguage.set':
          site.relabel = params
          return { ok: true }
        default:
          return { ok: false, error: `Unknown contract operation ${params.operation}` }
      }
    }
  }
  return site
}

function context(overrides = {}) {
  const times = {}
  const notes = []
  return {
    times,
    notes,
    ctx: {
      siteKey: 'wp-test',
      label: 'golden-crust',
      platform: 'wordpress',
      quickstart: 'tracy-business/wp7',
      contract,
      email: 'owner@example.com',
      brief: { about: 'Golden Crust Bakery, a family bakery in Hanoi.', goal: 'contact', style: 'friendly' },
      normalized: {
        name: 'Golden Crust Bakery',
        about: 'Golden Crust Bakery, a family bakery in Hanoi.',
        tone: 'friendly, warm and welcoming',
        contact: '',
        languages: ['en']
      },
      signal: new AbortController().signal,
      time: (name, ms) => {
        times[name] = ms
      },
      note: (n) => notes.push(n),
      deadlineAt: Date.now() + 60_000,
      ...overrides
    }
  }
}

/** The picture model's transport and the site's demo picture, for the tests that draw. */
async function withPictures() {
  const drawn = await sharp({ create: { width: 1376, height: 768, channels: 3, background: '#cc8844' } })
    .jpeg()
    .toBuffer()
  const demo = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#3355aa' } })
    .png()
    .toBuffer()
  const asked = []
  return {
    asked,
    door: { url: 'https://pictures.test/v1/chat/completions', key: 'k', imageModel: 'picture-model' },
    fetchImpl: async (url, init) => {
      asked.push(JSON.parse(init.body).messages[0].content)
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '',
                images: [{ image_url: { url: `data:image/jpeg;base64,${drawn.toString('base64')}` } }]
              }
            }
          ]
        }),
        { status: 200 }
      )
    },
    siteFile: () => async () => demo
  }
}

/** The Pages answer of a customer who unticked Careers: the only way a page leaves the site (TCH #1013, 08/10/2026). */
const careersUnticked = {
  all: [
    { id: 'home', label: 'Home', home: true },
    { id: 'careers', label: 'Careers' }
  ],
  picked: ['home']
}
/** The default brief with Careers unticked. */
const untickedCtx = (/** @type {any} */ base = {}) => ({
  ...base,
  brief: {
    ...(base.brief ?? {
      about: 'Golden Crust Bakery, a family bakery in Hanoi.',
      goal: 'contact',
      style: 'friendly'
    }),
    pages: careersUnticked
  }
})

const run = async ({
  model = fakeModel(),
  site = fakeSite(),
  ctx: overrides,
  pictures = null,
  woContent = null
} = {}) => {
  const { ctx, times, notes } = context(overrides)
  const engine = createWordpressEngine({
    woContent,
    models: pictures ? async () => ({ ...(await model.models()), image: pictures.door }) : model.models,
    // Through the Apply door's own allowlist, as a build reaches a real site (`_apply-door.mjs`).
    applyFor: () => throughDoor(site.apply),
    ...(pictures ? { siteFile: pictures.siteFile, fetchImpl: pictures.fetchImpl } : {})
  })
  const prepared = await engine.prepare(ctx)
  const report = await engine.apply(ctx, prepared)
  return { prepared, report, site, model, times, notes }
}

test('one language: the answers and the model’s words go in through ONE revision taken after the demo trim', async () => {
  const { prepared, report, site, model, times } = await run()
  const changes = site.applied.changes
  assert.equal(changes['site.name'], 'Golden Crust Bakery', 'the name is written as given')
  assert.equal(changes['identity.name'], 'Golden Crust Bakery')
  assert.ok(
    Object.keys(changes).length > 200,
    `most of the 267 text slots are written, got ${Object.keys(changes).length}`
  )
  assert.ok(!Object.keys(changes).some((k) => k.includes('::')), 'no extra language was asked for')
  assert.equal(
    site.applied.expected_revision,
    'rev-2',
    'written at the revision the trim left, not the first one'
  )
  assert.deepEqual(site.retired.keep, ['en-us'], 'only the source stays in the switcher')
  assert.equal(report.wrote, Object.keys(changes).length)
  // The seeder's own batching (35 slots a call), every call asked before the site exists.
  assert.equal(
    model.calls.length,
    Math.ceil(prepared.planned / 35),
    `calls: ${model.calls.length} for ${prepared.planned} slots`
  )
  assert.ok(model.calls.every((c) => c.slots.length <= 35))
  assert.ok(prepared.changes['home.hero.heading'].startsWith('Crust '), 'the model’s heading')
  for (const phase of ['planMs', 'inspectMs', 'trimMs', 'reinspectMs', 'writeMs', 'retireMs'])
    assert.ok(phase in times, phase)
  assert.deepEqual(
    site.calls.filter((c) => c.startsWith('content.contract')),
    [
      'content.contract:inspect',
      'content.contract:demoTrim.apply',
      'content.contract:inspect',
      'content.contract:apply',
      'content.contract:multilingual.retire'
    ]
  )
})

test('what the words cost is recorded for the report: calls and tokens', async () => {
  const { times } = await run({
    model: fakeModel({ meter: { calls: 9, promptTokens: 40_000, completionTokens: 6_000 } })
  })
  assert.equal(times.modelCalls, 9)
  assert.equal(times.modelTokens, 46_000)
})

test('one text model serves the whole build, and its words are counted per stage on the row', async () => {
  const base = fakeModel()
  let made = 0
  /** @type {Record<string, number>} */
  const asked = {}
  const meterOf = () => ({
    calls: Object.values(asked).reduce((a, b) => a + b, 0),
    promptTokens: 100,
    completionTokens: 20,
    reasoningTokens: 0,
    stages: Object.fromEntries(
      Object.entries(asked).map(([n, calls]) => [
        n,
        { calls, promptTokens: calls * 10, completionTokens: calls, reasoningTokens: 0 }
      ])
    )
  })
  const model = {
    ...base,
    models: async () => {
      made += 1
      const { text, ...rest } = await base.models()
      const view = (/** @type {string} */ name) => ({
        ...text,
        chat: (/** @type {any} */ r) => {
          asked[name] = (asked[name] ?? 0) + 1
          return text.chat(r)
        },
        stage: view,
        usage: meterOf
      })
      return { ...rest, text: { ...view('other'), usage: meterOf } }
    }
  }
  const { times } = await run({ model })
  assert.equal(made, 1, 'prepare and apply ask one model')
  assert.ok(asked.planner > 0, 'the slot planner is its own stage')
  assert.equal(times.textCalls, meterOf().calls)
  assert.equal(times.textIn, 100)
  assert.equal(times.textOut, 20)
  assert.equal(times['text.planner.calls'], asked.planner)
  assert.equal(times['text.planner.in'], asked.planner * 10)
  for (const [stage, calls] of Object.entries(asked)) assert.equal(times[`text.${stage}.calls`], calls, stage)
})

test('the model is asked before the site exists: prepare touches no site at all', async () => {
  const site = fakeSite()
  const { ctx } = context()
  const engine = createWordpressEngine({ models: fakeModel().models, applyFor: () => site.apply })
  await engine.prepare(ctx)
  assert.deepEqual(site.calls, [])
})

test('a fact the customer never gave is not written', async () => {
  const { site, report, notes } = await run({ model: fakeModel({ invent: 'home.hero.eyebrow' }) })
  assert.ok(!('home.hero.eyebrow' in site.applied.changes), 'the invented phone number stays out')
  assert.ok(report.kept >= 1)
  assert.ok(notes.some((n) => /facts you did not give/.test(n)))
})

test('a second language is read from its pages, planned in its own language, and keeps the whole edition’s letters', async () => {
  const model = fakeModel()
  const { site, notes } = await run({
    model,
    ctx: { normalized: { ...context().ctx.normalized, languages: ['en', 'vi'] } }
  })
  const vi = Object.keys(site.applied.changes).filter((k) => k.startsWith('vi::'))
  assert.ok(vi.length > 100, `the Vietnamese edition is written, got ${vi.length}`)
  // `phở` carries a `ở` that the first batch's own samples do not: a per-batch alphabet would have thrown every one of them away.
  assert.equal(site.applied.changes['vi::home.hero.heading'], 'phở ngon')
  assert.ok(
    vi.includes('vi::site.name') && site.applied.changes['vi::site.name'] === 'Golden Crust Bakery',
    'a name is a name in every language'
  )
  assert.deepEqual(site.retired.keep, ['en-us', 'vi'])
  assert.ok(
    model.calls.some((c) => c.slots[0]?.language === 'vi'),
    'the model was told the edition’s language'
  )
  assert.ok(site.calls.filter((c) => c === 'content.get').length >= 8, 'the edition’s pages were read')
  assert.ok(!notes.some((n) => /could not be written/.test(n)), notes.join(' | '))
})

test('a language the template does not ship is said and not written', async () => {
  const { site, notes } = await run({
    ctx: { normalized: { ...context().ctx.normalized, languages: ['en', 'sw'] } }
  })
  assert.ok(
    notes.some((n) => /sw/.test(n)),
    notes.join(' | ')
  )
  assert.ok(!Object.keys(site.applied.changes).some((k) => k.includes('::')))
  assert.deepEqual(site.retired.keep, ['en-us'])
})

// ── One language for the whole site (the single language question, TCH #1013 T13/T14) ──────────────────────
/** A site that also answers what WordPress's own language takes: a core translation, and the option WPLANG. */
function speakingSite({ polylang = true, installs = true } = {}) {
  const site = fakeSite()
  site.installed = []
  site.wplang = null
  const answer = site.answer
  site.answer = async (call) => {
    if (call.action === 'language.install') {
      site.calls.push('language.install')
      if (!installs) return { ok: false, error: 'bad_action', message: 'unknown action: language.install' }
      site.installed.push(call.params.locale)
      return { ok: true, locale: call.params.locale }
    }
    if (call.action === 'content.update' && call.params?.kind === 'option' && call.params.key === 'WPLANG') {
      site.calls.push('content.update:WPLANG')
      site.wplang = call.params
      return { ok: true }
    }
    if (
      call.action === 'content.update' &&
      call.params?.kind === 'option' &&
      call.params.key === 'tracy_source_locale'
    ) {
      site.sourceLocale = call.params
      return { ok: true }
    }
    if (!polylang && call.params?.operation === 'sourceLanguage.set')
      return {
        ok: false,
        error: 'unavailable',
        message: 'this site has no translation plugin, so its source language has no locale to respell'
      }
    return answer(call)
  }
  return site
}

test('one language that is not English: the source edition is written in it, no edition is added, WordPress speaks it', async () => {
  const model = fakeModel()
  const site = speakingSite()
  const { notes } = await run({
    model,
    site,
    ctx: { normalized: { ...context().ctx.normalized, languages: ['vi-vn'] } }
  })
  const languages = new Set(model.calls.flatMap((c) => c.slots.map((s) => s.language ?? null)))
  assert.deepEqual(
    [...languages],
    ['vi-vn'],
    'every slot planned is the source edition, told it is Vietnamese'
  )
  assert.ok(!Object.keys(site.applied.changes).some((k) => k.includes('::')), 'no second edition is written')
  assert.deepEqual(site.retired.keep, ['en-us'], 'every other edition is hidden, the shipped vi one too')
  assert.deepEqual(site.installed, ['vi'])
  assert.equal(site.wplang.fields.value, 'vi')
  assert.match(site.wplang.apply_id, /^lang-/)
  // Polylang prints the source edition's own locale (bizwp3: lang="en-US" over Vietnamese); the plugin reads this one.
  assert.equal(site.sourceLocale?.fields.value, 'vi')
  assert.equal(site.sourceLocale?.apply_id, site.wplang.apply_id)
  assert.ok(
    site.calls.indexOf('content.contract:multilingual.retire') < site.calls.indexOf('language.install'),
    'the language is set once the editions are settled'
  )
  assert.deepEqual(
    notes.filter((n) => /version|translation|language/.test(n)),
    [],
    notes.join(' | ')
  )
})

test('JA Vega, a template with one edition: picked vi-vn, the planner writes every slot in Vietnamese and nothing is said', async () => {
  const vega = contractFor(defaultContracts(), 'quickstart/ja-vega/wp7', '1.1.4')
  assert.ok(vega, 'the checkout ships ja-vega/wp7 1.1.4')
  const model = fakeModel()
  const { ctx, notes } = context({
    contract: vega,
    quickstart: 'quickstart/ja-vega/wp7',
    normalized: { ...context().ctx.normalized, languages: ['vi-vn'] }
  })
  const engine = createWordpressEngine({ models: model.models, applyFor: () => async () => ({ ok: true }) })
  const prepared = await engine.prepare(ctx)
  assert.equal(prepared.writtenIn, 'vi-vn')
  assert.deepEqual(
    prepared.passes.editions.map((e) => e.slug),
    ['en']
  )
  assert.ok(model.calls.length > 0)
  assert.ok(model.calls.every((c) => c.language === 'vi-vn' && c.slots.every((s) => s.language === 'vi-vn')))
  assert.ok(!notes.some((n) => /version/.test(n)), notes.join(' | '))
})

test('a plugin that cannot install a translation is said, and WPLANG is still set', async () => {
  const site = speakingSite({ installs: false })
  const { notes } = await run({
    site,
    ctx: { normalized: { ...context().ctx.normalized, languages: ['de-de'] } }
  })
  assert.equal(site.wplang.fields.value, 'de_DE')
  assert.ok(
    notes.some((n) => /de_DE translation of WordPress was not installed/.test(n)),
    notes.join(' | ')
  )
})

test('British English on a site with one language sets WPLANG en_GB instead of saying it could not', async () => {
  const site = speakingSite({ polylang: false })
  const { notes } = await run({
    site,
    ctx: { normalized: { ...context().ctx.normalized, languages: ['en-gb'] } }
  })
  assert.equal(site.wplang.fields.value, 'en_GB')
  assert.ok(!notes.some((n) => /could not take the variant/.test(n)), notes.join(' | '))
})

test('English as shipped, or several languages, leaves WordPress’s language alone', async () => {
  for (const languages of [['en'], ['en-us'], ['en', 'vi']]) {
    const site = speakingSite()
    await run({ site, ctx: { normalized: { ...context().ctx.normalized, languages } } })
    assert.equal(site.wplang, null, languages.join(','))
  }
})

test('a model that is down still writes what the customer said, and the report says why the rest stayed', async () => {
  const { site, report, notes } = await run({ model: fakeModel({ down: true }) })
  assert.deepEqual(Object.keys(site.applied.changes).sort(), ['identity.name', 'site.name'])
  assert.ok(report.kept >= 200)
  assert.ok(
    notes.some((n) => /did not answer/.test(n)),
    notes.join(' | ')
  )
})

test('no text model at all is the same road', async () => {
  const { site, notes } = await run({ model: { calls: [], models: async () => ({ text: null }) } })
  assert.deepEqual(Object.keys(site.applied.changes).sort(), ['identity.name', 'site.name'])
  assert.ok(notes.some((n) => /no text model/.test(n)))
})

test('contact lines the customer gave go to the contact slots, and only those', async () => {
  const { site } = await run({
    ctx: { normalized: { ...context().ctx.normalized, contact: '+84 24 3555 0144 · hello@goldencrust.vn' } }
  })
  assert.equal(site.applied.changes['identity.contact.email'], 'hello@goldencrust.vn')
  assert.equal(site.applied.changes['identity.contact.phone'], '+84 24 3555 0144')
})

test('a release nothing seals keeps its words, and prepare says so', async () => {
  const { ctx } = context({ contract: null })
  const engine = createWordpressEngine({ models: fakeModel().models, applyFor: () => fakeSite().apply })
  await assert.rejects(engine.prepare(ctx), /not sealed/)
})

test('a site whose plugin carries no profile for the template says so in words a person can act on', async () => {
  const site = fakeSite()
  const apply = site.apply
  site.apply = async (call) =>
    call.params?.operation === 'inspect'
      ? {
          ok: false,
          message: 'No content contract is configured for this site; name one with the contract parameter'
        }
      : apply(call)
  await assert.rejects(run({ site }), /not bound to its template.s content contract/)
  assert.ok(!site.applied, 'and nothing was written')
})

test('a site that is not bound is refused in plain words, not written to', async () => {
  const site = fakeSite()
  const unbound = async (call) =>
    call.params?.operation === 'inspect'
      ? { ok: false, error: 'contract_unbound', message: 'contract_unbound' }
      : site.apply(call)
  const { ctx } = context()
  const engine = createWordpressEngine({ models: fakeModel().models, applyFor: () => unbound })
  const prepared = await engine.prepare(ctx)
  await assert.rejects(engine.apply(ctx, prepared), /not bound/)
  assert.equal(site.applied, null)
})

test('pictures: six are drawn before the site exists, the demo hero and the other photographs are replaced, logos are not', async () => {
  const pictures = await withPictures()
  const { prepared, site, times } = await run({ pictures })
  assert.equal(pictures.asked.length, MAX_PICTURES, 'a hero and five more')
  assert.equal(prepared.pictures.length, MAX_PICTURES)
  assert.equal(site.uploads.length, MAX_PICTURES)
  for (const u of site.uploads) {
    assert.match(u.path, /^wp-content\/uploads\/tracy-content\/[0-9a-f]{64}\.jpg$/)
    // cut from 1376×768 to the demo's 1600×1000
    const { width, height } = await sharp(Buffer.from(u.content_b64, 'base64')).metadata()
    assert.ok(Math.abs(width / height - 1.6) < 0.01, `${width}×${height}`)
  }
  const changes = site.applied.changes
  assert.match(changes['home.hero.img'], /^wp-content\/uploads\/tracy-content\//)
  assert.ok(!('home.gallery.item.1.img' in changes), 'a logo is never drawn')
  assert.ok(Object.keys(changes).filter((k) => k.endsWith('.img')).length >= MAX_PICTURES)
  // The same factory on the About page as on the home page: one picture, replaced in both places.
  assert.equal(changes['about.text.img'], changes['home.projects.item.1.img'])
  assert.ok('picturesMs' in times)
})

test('pictures: a photograph has no language, so every language the customer asked for gets the same pictures', async () => {
  const pictures = await withPictures()
  const { site } = await run({
    pictures,
    ctx: { normalized: { ...context().ctx.normalized, languages: ['en', 'vi'] } }
  })
  const changes = site.applied.changes
  assert.match(changes['home.hero.img'], /^wp-content\/uploads\/tracy-content\//)
  assert.equal(
    changes['vi::home.hero.img'],
    changes['home.hero.img'],
    'the Vietnamese home shows the same hero'
  )
  assert.ok(!('vi::home.gallery.item.1.img' in changes), 'and still no logo is drawn')
  assert.equal(
    site.calls.filter((c) => c === 'content.contract:apply').length,
    2,
    'the words in one write, the other languages’ pictures in a second'
  )
})

test('pictures: a site that will not take the other languages’ pictures keeps the words it was just given', async () => {
  const pictures = await withPictures()
  const site = fakeSite()
  const apply = site.apply
  site.apply = async (call) => {
    const changes = Object.keys(call.params?.changes ?? {})
    const picturesOnly =
      call.params?.operation === 'apply' &&
      changes.length > 0 &&
      changes.every((k) => k.includes('::') && k.endsWith('.img'))
    return picturesOnly
      ? { ok: false, error: 'bad_value', message: 'the site refuses every one of these' }
      : apply(call)
  }
  const { site: used, notes } = await run({
    pictures,
    site,
    ctx: { normalized: { ...context().ctx.normalized, languages: ['en', 'vi'] } }
  })
  assert.ok(
    Object.keys(used.applied.changes).filter((k) => k.startsWith('vi::')).length > 100,
    'the words of both languages are in'
  )
  assert.ok(
    notes.some((n) => /pictures of the other languages could not be placed/.test(n)),
    notes.join(' | ')
  )
})

test('pictures: a deployment with no picture model keeps the template’s pictures and says so', async () => {
  const { site, notes, prepared } = await run()
  assert.equal(prepared.pictures.length, 0)
  assert.equal(site.uploads.length, 0)
  assert.ok(
    notes.some((n) => /no picture model/.test(n)),
    notes.join(' | ')
  )
})

test('pictures: a picture the site refuses costs that slot only; the words are written', async () => {
  const pictures = await withPictures()
  const site = fakeSite()
  const apply = site.apply
  site.apply = async (call) =>
    call.action === 'media.upload' ? { ok: false, code: 'MEDIA_REFUSED' } : apply(call)
  const { site: used, notes } = await run({ pictures, site })
  assert.ok(Object.keys(used.applied.changes).length > 200, 'the words were written')
  assert.ok(!('home.hero.img' in used.applied.changes))
  assert.ok(
    notes.some((n) => /MEDIA_REFUSED/.test(n)),
    notes.join(' | ')
  )
})

// ── What is left of the template's own company once the words are in ─────────────────────────────────────────
const para = (text) =>
  `<!-- wp:paragraph {"metadata":{"name":"p"}} -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`
const group = (...lines) =>
  `<!-- wp:group {"className":"wtb-section"} -->\n<div class="wp-block-group wtb-section">\n${lines.map(para).join('\n')}\n</div>\n<!-- /wp:group -->`
const rawHtml = (html) => `<!-- wp:html -->\n${html}\n<!-- /wp:html -->`

/** What the model's double writes into a slot of the About page that no other slot shares: the sweep must treat it as the customer's. */
const aboutHeading = (() => {
  const slot = contentMap.slots.find((s) => s.key === 'about.cta.heading')
  return `Crust ${withoutFacts(slot.sample)}`.slice(0, slot.maxCharacters)
})()

/** The pieces of the template that no slot of the contract reaches, as the real site stores them. */
function demoSweep() {
  return {
    refuse: false,
    pages: [
      {
        id: 37,
        slug: 'about',
        title: 'About',
        status: 'publish',
        content: [
          group(aboutHeading, 'Written line two'),
          rawHtml('<section><h2>History</h2><p>2004 Founded near Moscow.</p></section>'),
          group('Safety', 'Zero lost-time incidents over the last 36 months.'),
          rawHtml(
            '<section><h2>Northgate today</h2><p>Northgate Industrial JSC builds plants.</p></section>'
          ),
          group(aboutHeading + ' again')
        ].join('\n\n')
      },
      {
        id: 38,
        slug: 'careers',
        title: 'Careers',
        status: 'publish',
        content: group(aboutHeading, 'Open roles')
      },
      {
        id: 40,
        slug: 'email',
        title: 'Email',
        status: 'publish',
        content: group('Transactional emails', 'Welcome mail')
      },
      {
        id: 51,
        slug: 'news',
        title: 'News',
        status: 'publish',
        content: '<!-- wp:query -->\n<div></div>\n<!-- /wp:query -->'
      }
    ],
    parts: {
      header:
        '<!-- wp:group -->\n<div>\n<!-- wp:navigation /-->\n<!-- wp:columns -->\n<div class="wp-block-columns">\n' +
        '<!-- wp:column -->\n<div class="wp-block-column">\n' +
        ['Recent projects', 'Elektra plant', 'Vorsino IP'].map(para).join('\n') +
        '\n</div>\n<!-- /wp:column -->\n</div>\n<!-- /wp:columns -->\n</div>\n<!-- /wp:group -->',
      footer: group('{site.legalName}')
    },
    navs: [
      {
        id: 70,
        slug: 'footer-company',
        title: 'footer-company',
        status: 'publish',
        content:
          '<!-- wp:navigation-link {"label":"About us","type":"page","id":37,"url":"/about/"} /-->\n' +
          '<!-- wp:navigation-link {"label":"Careers","type":"page","id":38,"url":"/careers/"} /-->\n' +
          '<!-- wp:navigation-link {"label":"Book a site survey","url":"/contact/"} /-->'
      }
    ]
  }
}

// 🔒 A PAGE IS HIDDEN ONLY WHEN THE CUSTOMER UNTICKED IT (product owner, 08/10/2026, TCH #1013): the judge is asked about the
// menu labels only, and a "hide" in its answer is ignored; the template's showcase stays published as released.
// 🔒 TRACY BUSINESS IS ANOTHER COMPANY'S FACTS (TCH #1013, 11/10/2026, as `tracy-business/j6` on Joomla): with About given, a
// section the words never reached is that company's history, safety record or project list, and goes with its container.
test("once the words are in, the template's company sections and labels go and every page stays — judged before, cut after", async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const model = fakeModel({
    judge: '{"hide": ["careers"], "relabel": {"Book a site survey": "Contact us"}}'
  })
  const { report, times, notes } = await run({ site, model })
  const [about] = site.sweep.pages
  assert.ok(about.content.includes(aboutHeading), "the customer's section stays")
  assert.equal(
    about.content.includes('Northgate today'),
    false,
    "a section naming the template's company is cut"
  )
  assert.equal(about.content.includes('History'), false, 'a raw HTML section no slot reaches is cut')
  assert.equal(about.content.includes('Safety'), false, 'a section none of the written words reached is cut')
  assert.equal(
    site.sweep.parts.header.includes('Elektra'),
    false,
    "the header's list of the template's projects is cut, its column with it"
  )
  assert.equal(site.sweep.parts.header.includes('Recent projects'), false)
  assert.ok(site.sweep.parts.header.includes('wp:navigation'), 'its menu is not')
  assert.equal(
    site.sweep.pages.find((p) => p.slug === 'careers').status,
    'publish',
    'a page the model would not keep stays: the customer did not untick it'
  )
  assert.equal(
    site.sweep.pages.find((p) => p.slug === 'email').status,
    'publish',
    "the template's own showcase page stays as released"
  )
  assert.equal(
    site.sweep.pages.find((p) => p.slug === 'news').status,
    'publish',
    "the posts page is every site's"
  )
  const nav = site.sweep.navs[0].content
  assert.ok(
    nav.includes('"label":"Careers","type":"page","id":38,"url":"/careers/"'),
    'the link to a page that stays stays'
  )
  assert.ok(nav.includes('"label":"Contact us"') && !nav.includes('Book a site survey'))
  // The model was asked which labels to change with the facts of the business, from what the site showed; never about pages.
  assert.equal(model.judged.length, 1)
  assert.equal('pages' in model.judged[0], false, 'no page is put to it')
  assert.ok(model.judged[0].labels.includes('Book a site survey'))
  // Order: every word is written before anything is cut, and the languages are retired after.
  const calls = site.calls
  assert.ok(
    calls.indexOf('content.contract:apply') < calls.indexOf('content.update'),
    'words first, cutting after'
  )
  assert.ok(calls.lastIndexOf('content.update') < calls.indexOf('content.contract:multilingual.retire'))
  assert.ok(
    site.sweepWrites.every((w) => w.apply_id.startsWith('residue-')),
    'one undo for the whole cleanup'
  )
  // Four sections cut; the menu link to Careers is no longer one of the cuts.
  assert.ok(times.sweepMs >= 0 && times.residueCut >= 4 && times.residueHidden === 0)
  assert.equal('judgeHidden' in times, false)
  assert.equal(
    report.wrote,
    Object.keys(site.applied.changes).length,
    'the report counts the words, as before'
  )
  assert.deepEqual(
    notes.filter((n) => /template's own|could not/.test(n)),
    []
  )
})

// 🔒 ABOUT GIVEN KEEPS THE TEMPLATE'S BLOCKS ON EVERY OTHER DESIGN (TCH #1013, 11/10/2026, dev g57-ess-wp-full): a section the
// words never reached keeps its demo words; only one naming the template's own company (`identity.name`, Northgate) is cut.
test('a design that is no other company’s facts keeps the sections the words never reached; one naming its company goes', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  await run({ site, ctx: { quickstart: 'ja-essence/wp7' } })
  const [about] = site.sweep.pages
  assert.equal(
    about.content.includes('Northgate today'),
    false,
    "a section naming the template's company is cut"
  )
  assert.ok(about.content.includes('History'), 'a raw HTML section no slot reaches keeps its demo words')
  assert.ok(about.content.includes('Safety'), 'so does a section none of the written words reached')
  assert.ok(site.sweep.parts.header.includes('Elektra'), "the header's list stays")
})

test('About blank on the facts design cuts nothing: every section stays as in the demo', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const blank = { ...context().ctx.normalized, about: '' }
  await run({ site, ctx: { brief: { about: '' }, normalized: blank } })
  const [about] = site.sweep.pages
  for (const kept of ['History', 'Safety', 'Northgate today']) assert.ok(about.content.includes(kept), kept)
  assert.ok(site.sweep.parts.header.includes('Elektra'))
})

// 🔒 ONE LANGUAGE OTHER THAN THE SOURCE'S: THE MENUS ARE WRITTEN IN IT TOO (TCH #1013, measured 08/10/2026 on dev
// tamq-8w-bizwp: Vietnamese pages under "Home", "About", "Careers", "Book a site survey").
test('a site written in one language other than English gets its menu labels in that language, a menu inside a part too', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.parts.header = site.sweep.parts.header.replace(
    '<!-- wp:navigation /-->',
    '<!-- wp:navigation -->\n<!-- wp:navigation-link {"label":"Pricing","url":"/pricing/"} /-->\n<!-- /wp:navigation -->'
  )
  const model = fakeModel({
    judge:
      '{"relabel": {"About us": "Giới thiệu", "Careers": "Tuyển dụng", "Book a site survey": "Liên hệ", "Pricing": "Bảng giá"}}'
  })
  await run({ site, model, ctx: { normalized: { ...context().ctx.normalized, languages: ['vi-vn'] } } })
  assert.equal(model.judged.length, 1)
  assert.match(
    model.judged[0].system,
    /written in Vietnamese/,
    'the judge is told the language the site is written in'
  )
  assert.deepEqual(
    [...model.judged[0].labels].sort(),
    ['About us', 'Book a site survey', 'Careers', 'Pricing'],
    "every label of the source edition's menus, the part's too"
  )
  const nav = site.sweep.navs[0].content
  for (const label of ['Giới thiệu', 'Tuyển dụng', 'Liên hệ'])
    assert.ok(nav.includes(`"label":"${label}"`), label)
  assert.ok(site.sweep.parts.header.includes('"label":"Bảng giá"'), 'the menu written inside the header too')
  const relabels = site.sweepWrites.filter((w) => /Tuyển dụng|Bảng giá/.test(JSON.stringify(w.fields)))
  assert.ok(relabels.length >= 2)
  assert.ok(
    relabels.every((w) => w.apply_id.startsWith('residue-')),
    'under the cleanup apply id, taken back by its undo'
  )
})

// 🔒 A BUTTON OF A PART IS SAID IN THE SITE LANGUAGE TOO (LANG-2, measured 10/10/2026 on dev g56-ess-wp-full, JA Essence
// WordPress 1.0.10): the header's "Subscribe" button stayed English on every page of a Vietnamese site. Its block carries a
// name (`header.subscribe`) that no contract slot writes, since no slot ever writes a template part, and its one word is an
// interface label too short for the other words: nothing reached it. A label is said like a menu label instead.
test('a site written in one language other than English gets the buttons of its parts in that language, a named one too', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const subscribe =
    '<!-- wp:buttons {"className":"je-subscribe"} -->\n<div class="wp-block-buttons je-subscribe">\n' +
    '<!-- wp:button {"className":"je-btn-primary","metadata":{"name":"header.subscribe"}} -->\n' +
    '<div class="wp-block-button je-btn-primary"><a class="wp-block-button__link wp-element-button" href="/contact">Subscribe</a></div>\n' +
    '<!-- /wp:button -->\n</div>\n<!-- /wp:buttons -->'
  site.sweep.parts.header = site.sweep.parts.header.replace(
    '<!-- wp:navigation /-->',
    `<!-- wp:navigation /-->\n${subscribe}`
  )
  const model = fakeModel({
    judge:
      '{"relabel": {"About us": "Giới thiệu", "Careers": "Tuyển dụng", "Book a site survey": "Liên hệ", "Subscribe": "Đăng ký"}}'
  })
  await run({ site, model, ctx: { normalized: { ...context().ctx.normalized, languages: ['vi-vn'] } } })
  assert.ok(
    model.judged[0].labels.includes('Subscribe'),
    `the button is put to the judge: ${model.judged[0].labels}`
  )
  const header = site.sweep.parts.header
  assert.ok(header.includes('href="/contact">Đăng ký</a>'), header)
  assert.ok(header.includes('"metadata":{"name":"header.subscribe"}'), 'the block keeps its name')
})

test('a site in English keeps the buttons of its parts as the template wrote them', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.parts.header = site.sweep.parts.header.replace(
    '<!-- wp:navigation /-->',
    '<!-- wp:navigation /-->\n<!-- wp:button -->\n<div class="wp-block-button"><a class="wp-block-button__link" href="/contact">Subscribe</a></div>\n<!-- /wp:button -->'
  )
  const model = fakeModel({ judge: '{"relabel": {"Subscribe": "Contact us"}}' })
  await run({ site, model })
  assert.equal(model.judged[0].labels.includes('Subscribe'), false, 'only menu labels are judged in English')
  assert.ok(site.sweep.parts.header.includes('>Subscribe</a>'))
})

// 🔒 A NAMED LINE OF A PART IS SAID IN THE SITE LANGUAGE TOO, ITS TOKENS KEPT (LANG-2, measured 10/10/2026 on dev
// g56-ess-wp-full, JA Essence WordPress 1.0.10): the footer's `footer.copyright` still read "All Rights Reserved. WordPress is
// Free Software released under the GNU General Public License." on a Vietnamese site. Its block carries a name (no slot writes
// a part), an identity token (`{year}`, `{site.title}`) and two text runs, so neither the other words nor the button labels
// reached it. The footer below is the one the 1.0.10 release stores.
const essenceFooter = readFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'ja-essence-wp7-1.0.10-footer.html'),
  'utf8'
)
const COPYRIGHT_RUN = 'Copyright © {year} {site.title}. All Rights Reserved.'
/** The copyright run as the planner is given it: its tokens masked (`wp-runs.js`). */
const COPYRIGHT_MASKED = 'Copyright © ⟦1⟧ ⟦2⟧. All Rights Reserved.'
const LICENSE_RUN = 'WordPress is Free Software released under the GNU General Public License.'

test('a site written in one language other than English gets the named lines of its parts in it, identity tokens kept', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.parts.footer = essenceFooter
  const model = fakeModel({
    lines: {
      [COPYRIGHT_MASKED]: 'Bản quyền © ⟦1⟧ ⟦2⟧. Bảo lưu mọi quyền.',
      [LICENSE_RUN]: 'WordPress là phần mềm tự do phát hành theo Giấy phép Công cộng GNU.'
    }
  })
  await run({ site, model, ctx: { normalized: { ...context().ctx.normalized, languages: ['vi-vn'] } } })
  const footer = site.sweep.parts.footer
  assert.ok(
    footer.includes(
      '<p class="je-footer__copy has-text-align-center">Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.<br>' +
        'WordPress là phần mềm tự do phát hành theo Giấy phép Công cộng GNU.</p>'
    ),
    footer
  )
  assert.ok(footer.includes('"metadata":{"name":"footer.copyright"}'), 'the block keeps its name')
})

// 🔒 AN ANSWER THAT RESPELLS A TOKEN IS MENDED, NEVER DROPPED IN SILENCE (LANG-2, measured 10/10/2026 on dev g59-ess-wp-full,
// JA Essence WordPress 1.0.12): the footer kept "All Rights Reserved." because the answer wrote the name where `{site.title}`
// stood. Disobedient models below: each writes the name, a year or a respelled token in place of a mask.
const viFooter = async (lines, more = {}) => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.parts.footer = essenceFooter
  const model = fakeModel({ lines, ...more })
  const out = await run({
    site,
    model,
    ctx: { normalized: { ...context().ctx.normalized, name: 'Tiệm Bánh Vàng', languages: ['vi-vn'] } }
  })
  return { footer: site.sweep.parts.footer, notes: out.notes, model }
}

test('a run answered with the business name where a token stood gets the token back', async () => {
  const { footer, model } = await viFooter({
    [COPYRIGHT_MASKED]: 'Bản quyền © ⟦1⟧ tiệm bánh vàng. Bảo lưu mọi quyền.'
  })
  assert.ok(
    model.calls.some((c) => c.slots.some((s) => s.sample === COPYRIGHT_MASKED)),
    'the planner never sees a token'
  )
  assert.ok(footer.includes('Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.'), footer)
})

test('a run answered with a literal year or a respelled site token gets its tokens back: the year is never frozen', async () => {
  const year = await viFooter({ [COPYRIGHT_MASKED]: 'Bản quyền © 2026 {site.name}. Bảo lưu mọi quyền.' })
  assert.ok(year.footer.includes('Bản quyền © {year} {site.title}. Bảo lưu mọi quyền.'), year.footer)
  assert.equal(year.footer.includes('2026'), false)
})

test('a run whose answers keep losing a token is asked again, then translated from the template words, and said', async () => {
  // The planner and its second chance both drop the masks; the translator keeps them.
  const { footer, notes, model } = await viFooter(
    { [COPYRIGHT_MASKED]: 'Bản quyền. Bảo lưu mọi quyền.' },
    {
      repair: (input) =>
        JSON.stringify({
          values: Object.fromEntries(
            (input.slots ?? []).map((slot) => [slot.key, 'Bảo lưu mọi quyền, không mã nào.'])
          )
        })
    }
  )
  assert.ok(model.repairs.length > 0, 'asked once more')
  assert.ok(model.translated.includes(COPYRIGHT_MASKED), 'then translated, masked')
  assert.ok(footer.includes(`[vi] ${COPYRIGHT_RUN}`), footer)
  assert.equal(
    notes.some((n) => /keep the template’s words: no answer kept/.test(n)),
    false,
    notes.join(' | ')
  )
})

test('a run nothing can say with its tokens keeps the template words and is said in the report, never in silence', async () => {
  const { footer, notes } = await viFooter(
    { [COPYRIGHT_MASKED]: 'Bản quyền. Bảo lưu mọi quyền.' },
    { translate: (text) => (text === COPYRIGHT_MASKED ? 'Bản quyền, Bảo lưu mọi quyền.' : `[vi] ${text}`) }
  )
  assert.ok(footer.includes(COPYRIGHT_RUN), 'the year and the site name stay filled at the visit')
  assert.ok(
    notes.some((n) =>
      /header or footer keep the template’s words: no answer kept their \{year\} \{site\.title\}/.test(n)
    ),
    notes.join(' | ')
  )
})

test('a site in English keeps the named lines of its parts as the template wrote them', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.parts.footer = essenceFooter
  const model = fakeModel()
  await run({ site, model })
  const asked = model.calls.flatMap((c) => c.slots.map((s) => s.sample))
  assert.equal(asked.includes(COPYRIGHT_RUN), false, 'not put to the planner')
  assert.ok((site.sweep.parts.footer ?? essenceFooter).includes(`${COPYRIGHT_RUN}<br>${LICENSE_RUN}`))
})

// 🔒 A FORM THE SITE CANNOT SHOW ITS WORDS FOR COSTS ITS OWN LINES ONLY (LANG-2, measured 10/10/2026 on dev g55-ess-wp-full,
// JA Essence WordPress 1.0.10): the Contact page embeds `[contact-form-7 id="65" title="Contact"]`, Contact Form 7 draws the form
// by its title, and id 65 is a picture with no `_form` meta. The door answered not_found, and the whole judgement went with it:
// on a Vietnamese site the menus, the header and footer lines, the Contact intro and every page title stayed English.
test('a page embedding a form id that holds no form still gets its menus and its other words in the site language', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.pages.push({
    id: 39,
    slug: 'contact',
    title: 'Contact',
    status: 'publish',
    content: '<!-- wp:shortcode -->\n[contact-form-7 id="65" title="Contact"]\n<!-- /wp:shortcode -->'
  })
  const model = fakeModel({
    judge: '{"relabel": {"About us": "Giới thiệu", "Careers": "Tuyển dụng", "Book a site survey": "Liên hệ"}}'
  })
  const { notes } = await run({
    site,
    model,
    ctx: { normalized: { ...context().ctx.normalized, languages: ['vi-vn'] } }
  })
  assert.equal(model.judged.length, 1, 'the judge is asked')
  const nav = site.sweep.navs[0].content
  for (const label of ['Giới thiệu', 'Tuyển dụng', 'Liên hệ'])
    assert.ok(nav.includes(`"label":"${label}"`), `${label}: ${notes.join(' | ')}`)
  assert.ok(
    notes.some((n) => /form 65/.test(n)),
    `the form that could not be read is said: ${notes.join(' | ')}`
  )
})

// 🔒 A PAGE TITLED BY ITS MENU WORD IS TITLED IN THE SITE LANGUAGE TOO (LANG-2, measured 10/10/2026 on dev g55-ess-wp-full): the
// browser tabs of a Vietnamese site read "Login Form –", "Contact –". 34 of JA Essence's 35 pages are titled exactly as their
// menu entry, so the judge's labels title them; a page titled otherwise, and a site in English, keep their titles.
test('a site written in one language other than English titles its pages by the new menu words', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const model = fakeModel({
    judge: '{"relabel": {"About us": "Giới thiệu", "Careers": "Tuyển dụng", "Book a site survey": "Liên hệ"}}'
  })
  await run({ site, model, ctx: { normalized: { ...context().ctx.normalized, languages: ['vi-vn'] } } })
  const titles = site.sweepWrites.filter((w) => w.fields?.post_title !== undefined)
  assert.deepEqual(
    titles.map((w) => [w.id, w.fields.post_title]),
    [[38, 'Tuyển dụng']],
    'only the page titled exactly as a relabelled entry'
  )
  assert.ok(
    titles.every((w) => w.apply_id.startsWith('residue-')),
    'under the cleanup apply id'
  )
  assert.equal(
    site.sweep.pages.find((p) => p.id === 37).title,
    'About',
    'a title the menu does not say stays'
  )
})

test('a site in English keeps its page titles whatever the judge relabels', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const model = fakeModel({ judge: '{"relabel": {"Careers": "Jobs"}}' })
  await run({ site, model })
  assert.equal(site.sweepWrites.filter((w) => w.fields?.post_title !== undefined).length, 0)
})

test('a site in English keeps the judge asking only about labels the business would not want', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const model = fakeModel()
  await run({ site, model })
  assert.doesNotMatch(model.judged[0].system, /written in/)
})

test('a site that will not take the cutting still has all its words, and the report says so', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.refuse = true
  const { report, notes } = await run({ site, model: fakeModel({ judge: '{"hide": ["careers"]}' }) })
  assert.ok(Object.keys(site.applied.changes).length > 200, 'the words are written')
  assert.equal(report.wrote, Object.keys(site.applied.changes).length)
  assert.ok(notes.some((n) => /could not be changed: the site would not take it/.test(n)))
  assert.equal(site.sweepWrites.length, 0)
})

test('a model that cannot judge costs the relabelling only: the cut sections still go', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const { notes } = await run({ site, model: fakeModel({ judge: 'I would rather not say' }) })
  assert.equal(
    site.sweep.pages.find((p) => p.slug === 'careers').status,
    'publish',
    'nothing is hidden on a guess'
  )
  assert.equal(site.sweep.pages.find((p) => p.slug === 'email').status, 'publish')
  assert.equal(site.sweep.pages[0].content.includes('Northgate today'), false)
  assert.ok(site.sweep.navs[0].content.includes('Book a site survey'), 'no label changes unasked')
  assert.equal(
    notes.filter((n) => /could not be judged/.test(n)).length,
    1,
    'and it is said, so a site with its template labels still showing is not a silent one'
  )
})

test('with no text model nothing is asked of one, and the cutting still runs', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const { notes } = await run({ site, model: { models: async () => ({}), calls: [], judged: [] } })
  assert.equal(site.sweep.pages.find((p) => p.slug === 'email').status, 'publish', 'the showcase stays')
  assert.ok(notes.length >= 1)
})

// ── The pages the customer picked (the questionnaire's `pages` question, feed `seed.pages`) ──────────────────
/** A workshop's brief whose `pages` answer names the pages given. */
const pickedBrief = (...pages) => ({
  about: 'Spoke & Chain, a bicycle repair workshop in Leeds.',
  said: `Pages: ${pages.join(', ')}`,
  goal: null,
  style: null,
  answers: [
    { id: 'about', kind: 'longtext', feeds: ['copy.about'], label: 'About', value: 'x' },
    { id: 'pages', kind: 'multi', feeds: ['seed.pages'], label: 'Pages', value: pages }
  ]
})
const pagesOfSite = () => {
  const sweep = demoSweep()
  sweep.pages.push(
    ...['home', 'services', 'contact'].map((slug, i) => ({
      id: 60 + i,
      slug,
      title: slug,
      status: 'publish',
      content: group(aboutHeading)
    }))
  )
  return sweep
}

test('the pages of kinds the customer did not pick go; home and contact stay', async () => {
  const site = fakeSite()
  site.sweep = pagesOfSite()
  const { notes, times } = await run({
    site,
    ctx: { brief: pickedBrief('home', 'about', 'contact') }
  })
  const status = (slug) => site.sweep.pages.find((p) => p.slug === slug).status
  assert.equal(status('services'), 'draft', 'services were not picked')
  assert.equal(status('news'), 'draft', 'the posts page is the blog, and the blog was not picked')
  for (const slug of ['home', 'about', 'contact']) assert.equal(status(slug), 'publish', slug)
  assert.equal(status('careers'), 'publish', 'no kind names it, and the customer did not untick it')
  assert.equal(times.pagesUnpicked, 2)
  assert.deepEqual(
    notes.filter((n) => /this template has no/.test(n)),
    []
  )
})

test('products picked on a template that has services and no products: Services stays and nothing is said', async () => {
  const site = fakeSite()
  site.sweep = pagesOfSite()
  const { notes } = await run({
    site,
    ctx: { brief: pickedBrief('home', 'product', 'about', 'contact') }
  })
  const status = (slug) => site.sweep.pages.find((p) => p.slug === slug).status
  assert.equal(status('services'), 'publish', 'the services page stands in for the products picked')
  assert.equal(status('news'), 'draft')
  assert.deepEqual(
    notes.filter((n) => /this template has no/.test(n)),
    []
  )
})

// ── Everything the customer said reaches the writers and the judge ───────────────────────────────────────────
const SCHOOL_DETAILS = 'Sector: Language school\nWhat we do not offer: exam preparation'
const schoolAbout = `Habla Hall teaches evening Spanish classes for adults in small groups, ${'with plenty of conversation practice '.repeat(8)}`

test('the planners read the other answers beside the description, and the judge everything the customer said', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const model = fakeModel()
  await run({
    site,
    model,
    ctx: {
      brief: { about: schoolAbout, said: SCHOOL_DETAILS, goal: null, style: null, answers: [] },
      normalized: {
        ...context().ctx.normalized,
        name: 'Habla Hall',
        about: schoolAbout,
        details: SCHOOL_DETAILS
      }
    }
  })
  assert.equal(model.calls[0].brief.details, SCHOOL_DETAILS, 'the contract planner')
  assert.ok(
    model.calls.filter((c) => c.brief).every((c) => c.brief.details === SCHOOL_DETAILS),
    'every planner call'
  )
  assert.ok(schoolAbout.length > 300)
  assert.match(model.judged[0].business.about, /What we do not offer: exam preparation$/, 'the judge')
})

test('every apply id the site is written under is told to the run, so the whole Apply can be undone', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const named = []
  const door = site.apply
  site.apply = async (call) => {
    if (typeof call.params?.apply_id === 'string') named.push(call.params.apply_id)
    return door(call)
  }
  const ids = []
  await run({
    site,
    model: fakeModel({ judge: '{"hide": ["careers"]}' }),
    ctx: { applied: (id) => ids.push(id) }
  })
  assert.ok(
    named.some((id) => id.startsWith('contract-')) && named.some((id) => id.startsWith('residue-')),
    named.join(' ')
  )
  assert.deepEqual([...new Set(ids)].sort(), [...new Set(named)].sort())
})

test('the receipts this Apply reuses — the demo trim’s, the install’s language receipt — are told apart from its own', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const door = site.apply
  // The install retired the other editions under a receipt of its own: the site says so, and the retire reuses it.
  site.apply = async (call) => {
    const answer = await door(call)
    return call.params?.operation === 'inspect'
      ? { ...answer, multilingual: { applyId: 'mlang-install-1' } }
      : answer
  }
  const own = []
  const reused = []
  await run({
    site,
    ctx: { applied: (id, how) => (how?.reused ? reused : own).push(id) }
  })
  assert.deepEqual([...new Set(reused)].sort(), ['dtrim-seed', 'mlang-install-1'])
  assert.ok(own.some((id) => id.startsWith('contract-')))
  assert.ok(!own.includes('dtrim-seed') && !own.includes('mlang-install-1'))
})

test('the slots of a page the customer did not pick are not planned, and that page is taken off', async () => {
  const site = fakeSite()
  site.sweep = pagesOfSite()
  const model = fakeModel()
  await run({ site, model, ctx: { brief: pickedBrief('home', 'about', 'contact') } })
  const services = contentMap.entities.find((e) => e.identity?.slug === 'services').key
  const theirs = new Set(contentMap.slots.filter((s) => s.entity === services).map((s) => s.key))
  assert.ok(theirs.size > 0)
  const asked = model.calls.flatMap((c) => (c.slots ?? []).map((s) => s.key))
  assert.ok(asked.length > 0)
  assert.deepEqual(
    asked.filter((key) => theirs.has(key)),
    [],
    'no model call for words nobody will see'
  )
  assert.equal(site.sweep.pages.find((p) => p.slug === 'services').status, 'draft')
})

test('a brief with no `pages` answer hides no page for it', async () => {
  const site = fakeSite()
  site.sweep = pagesOfSite()
  await run({ site })
  for (const slug of ['services', 'news', 'home', 'contact'])
    assert.equal(site.sweep.pages.find((p) => p.slug === slug).status, 'publish', slug)
})

// ── The pages the customer unticked in the standard set (feed `site.pages`, `brief.pages`) ─────────────────────
/** The release's own page list, handed to the brief by the server, with the ids the customer kept ticked. */
const sitePages = (...picked) => ({
  all: [
    { id: 'home', label: 'Home', home: true },
    { id: 'about', label: 'About' },
    { id: 'services', label: 'Services' },
    { id: 'careers', label: 'Careers' },
    { id: 'news', label: 'News' },
    { id: 'contact', label: 'Contact' }
  ],
  picked
})

test('by id: exactly the pages the customer unticked are drafted and their menu links go; the others stay', async () => {
  const site = fakeSite()
  site.sweep = pagesOfSite()
  const model = fakeModel()
  const { times } = await run({
    site,
    model,
    ctx: { brief: { ...pickedBrief(), answers: [], pages: sitePages('home', 'about', 'news', 'contact') } }
  })
  const status = (slug) => site.sweep.pages.find((p) => p.slug === slug).status
  assert.equal(status('careers'), 'draft', 'a page no kind names goes when it is unticked')
  assert.equal(status('services'), 'draft')
  for (const slug of ['home', 'about', 'news', 'contact']) assert.equal(status(slug), 'publish', slug)
  assert.equal(site.sweep.navs[0].content.includes('Careers'), false, 'its menu link goes')
  assert.ok(site.sweep.navs[0].content.includes('About us'))
  assert.equal(times.pagesUnpicked, 2)
  const services = contentMap.entities.find((e) => e.identity?.slug === 'services').key
  const theirs = new Set(contentMap.slots.filter((s) => s.entity === services).map((s) => s.key))
  const asked = model.calls.flatMap((c) => (c.slots ?? []).map((s) => s.key))
  assert.deepEqual(
    asked.filter((key) => theirs.has(key)),
    [],
    'an unticked page’s words are not planned'
  )
})

test('by id: the home page stays even when the answer leaves it out; no page list keeps every page', async () => {
  const site = fakeSite()
  site.sweep = pagesOfSite()
  await run({ site, ctx: { brief: { ...pickedBrief(), answers: [], pages: sitePages('about') } } })
  assert.equal(site.sweep.pages.find((p) => p.slug === 'home').status, 'publish')
  assert.equal(site.sweep.pages.find((p) => p.slug === 'contact').status, 'draft')
  const kept = fakeSite()
  kept.sweep = pagesOfSite()
  await run({ site: kept, ctx: { brief: { ...pickedBrief(), answers: [], pages: null } } })
  for (const page of kept.sweep.pages.filter((p) => p.slug !== 'email'))
    assert.equal(page.status, 'publish', page.slug)
})

test('by id: a page the customer ticked stays, whatever the model says of it (tracy-base wp7, dev 08/10/2026)', async () => {
  const site = fakeSite()
  site.sweep = pagesOfSite()
  await run({
    site,
    model: fakeModel({ judge: '{"hide": ["careers"]}' }),
    ctx: {
      brief: {
        ...pickedBrief(),
        answers: [],
        pages: sitePages('home', 'about', 'careers', 'news', 'contact')
      }
    }
  })
  const status = (slug) => site.sweep.pages.find((p) => p.slug === slug).status
  assert.equal(status('careers'), 'publish', 'the customer ticked Careers')
  assert.equal(status('services'), 'draft', 'the customer unticked Services')
  assert.ok(site.sweep.navs[0].content.includes('Careers'), 'its menu link stays')
})

// ── Two blocks of one name, and the lines nobody could write ──────────────────────────────────────────────────
const namedHeading = (name, text) =>
  `<!-- wp:heading {"metadata":{"name":"${name}"}} -->\n<h2>${text}</h2>\n<!-- /wp:heading -->`
const namedPara = (name, text) =>
  `<!-- wp:paragraph {"metadata":{"name":"${name}"}} -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`

/** The About page as the template stores it: the page's own heading and two more sections sharing the block name. */
const aboutSlots = contentMap.slots.filter((s) => s.entity === 'page-about' && s.key === 'about.text.heading')
const aboutIntros = contentMap.slots.filter((s) => s.entity === 'page-about' && s.key === 'about.text.intro')
const aboutPage = () =>
  [
    group(
      namedHeading('text.heading', aboutSlots[0].sample) +
        '\n' +
        namedPara('text.intro', aboutIntros[0].sample)
    ),
    group(
      namedHeading('text.heading', aboutSlots[1].sample) +
        '\n' +
        namedPara('text.intro', aboutIntros[1].sample)
    ),
    group(
      namedHeading('text.heading', aboutSlots[2].sample) +
        '\n' +
        namedPara('text.intro', aboutIntros[2].sample)
    )
  ].join('\n\n')

test('a key the contract gives to three blocks is three slots to the planner, and each answer goes where it belongs', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.pages[0].content = aboutPage()
  const model = fakeModel()
  const { prepared } = await run({ site, model })
  const asked = model.calls.flatMap((c) => c.slots.map((s) => s.key))
  assert.ok(
    asked.includes('about.text2.heading') && asked.includes('about.text3.heading'),
    'each block has a key of its own'
  )
  assert.equal(
    prepared.changes['about.text.heading'],
    `Crust ${withoutFacts(aboutSlots[0].sample)}`.slice(0, aboutSlots[0].maxCharacters),
    'the contract door gets the answer for the FIRST block, not whichever batch spoke last'
  )
  assert.ok(!('about.text2.heading' in prepared.changes), 'the others never go to the contract door')
  assert.deepEqual(
    prepared.duplicates.filter((d) => d.slug === 'about' && d.block === 'text.heading').map((d) => d.nth),
    [2, 3]
  )
  // On the page, the second and third block carry their own words and the first the contract's.
  const [about] = site.sweep.pages
  assert.ok(
    about.content.includes(
      `Crust ${withoutFacts(aboutSlots[1].sample)}`.slice(0, aboutSlots[1].maxCharacters)
    )
  )
  assert.ok(
    about.content.includes(
      `Crust ${withoutFacts(aboutSlots[2].sample)}`.slice(0, aboutSlots[2].maxCharacters)
    )
  )
  assert.equal(
    about.content.includes(`<h2>${aboutSlots[1].sample}</h2>`),
    false,
    'the demo\'s "Where we work" is gone'
  )
})

// Measured 05/10/2026 (ledger L15) on a two-language site made with Apply: the Vietnamese About page kept a whole demo section
// (its heading, an industrial park and five cities). The second and third blocks of a name, and the lines no slot names, were
// said again in the source language only; the other language's copy was only swept. The words below are the template's own
// demo in Vietnamese (a construction firm) and a dental clinic's answers.
const wtbSection = (inner) =>
  `<!-- wp:group {"className":"wtb-section"} -->\n<div class="wp-block-group wtb-section">\n${inner}\n</div>\n<!-- /wp:group -->`
const ABOUT_VI = 1951
const unnamedVi = 'Mọi công trình đều có kỹ sư giám sát thường trực tại hiện trường.'
const aboutVi = () =>
  [
    wtbSection(
      `${namedHeading('text.heading', 'Hạ tầng công nghiệp trọn gói')}\n${namedPara('text.intro', 'Chúng tôi thiết kế và thi công nhà xưởng thép.')}`
    ),
    wtbSection(
      [
        namedHeading('text.heading', 'Phạm vi hoạt động'),
        namedPara('text.intro', 'Trụ sở và nhà máy ở khu công nghiệp ven sông, chi nhánh ở năm thành phố.'),
        namedPara('text.item.1.title', 'Khu công nghiệp ven sông'),
        `<!-- wp:paragraph -->\n<p>${unnamedVi}</p>\n<!-- /wp:paragraph -->`
      ].join('\n')
    ),
    // A section one written line reaches is kept whole by the sweep: what happens to its other blocks is this work's.
    wtbSection(
      [
        namedHeading('text.heading', 'An toàn lao động'),
        namedPara('text.intro', 'Không có sự cố mất ngày công trong ba mươi sáu tháng qua.'),
        namedPara('text.item.2.title', 'Chi nhánh miền Trung')
      ].join('\n')
    )
  ].join('\n\n')
const DEMO_VI = [
  'Phạm vi hoạt động',
  'Trụ sở và nhà máy',
  'An toàn lao động',
  'Không có sự cố',
  'Mọi công trình'
]
const clinic = {
  name: 'Lotus Smile Dental',
  about: 'Lotus Smile Dental, a family dental clinic in Hue: check-ups, cleaning and gentle fillings.',
  tone: 'calm and reassuring',
  contact: '',
  languages: ['en', 'vi']
}
/** A two-language site whose Vietnamese About page is the template's, read by id as Polylang answers it. */
function twoLanguageSite() {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.pages[0].content = aboutPage()
  site.sweep.copies = { [ABOUT_VI]: { slug: 'about-vi', status: 'publish', content: aboutVi() } }
  return site
}
/** The model: the Vietnamese edition's own values for the About page, and a second chance per language. */
const clinicModel = ({
  viSecondChance = 'answer',
  failViBatch = false,
  viPend = [],
  germanLeft = false,
  moreLines = {}
} = {}) =>
  fakeModel({
    // One batch of the Vietnamese first pass (not the About page's) that never answers.
    fail: (input) =>
      failViBatch &&
      input.slots[0]?.language === 'vi' &&
      input.slots.some((s) => s.key === 'home.hero.heading'),
    // In English the third heading is written at once and its intro on the second chance; in Vietnamese both are left.
    pend: (key, language) =>
      key === 'about.text3.intro' ||
      (language === 'vi' && (key === 'about.text3.heading' || viPend.includes(key))) ||
      (germanLeft && language === 'de' && key === 'line.about-de.2'),
    say: (slot, language) =>
      language === 'vi'
        ? {
            'about.text.heading': 'phở ngon 1',
            'about.text2.heading': 'phở ngon 2',
            'about.text2.intro': 'phở ngon ơi 2',
            'about.text.item.1.title': 'phở ngon 4',
            'about.text.item.2.title': 'phở ngon 5'
          }[slot.key]
        : undefined,
    lines: {
      [unnamedVi]: 'Có bác sĩ trực mọi ngày.',
      'Jede Baustelle hat einen ständigen Bauleiter vor Ort.': 'Sanfte Behandlung in jedem Alter.',
      ...moreLines
    },
    repair: (input) => {
      const vi = input.site.languages[0] === 'vi'
      if (vi && viSecondChance === 'throw') throw new Error('model gone')
      if (germanLeft && input.site.languages[0] === 'de-de') throw new Error('model gone')
      // A second chance that answers and says nothing about a line: neither a value nor a null.
      if (vi && viSecondChance === 'silent') return '{"values": {}}'
      const said = (/** @type {{ key: string, sample: string }} */ line) =>
        !vi
          ? `Gentle care: ${line.sample}`.slice(0, 60)
          : line.key === 'about.text3.intro'
            ? 'Chúng tôi ở đây'
            : null
      return JSON.stringify({ values: Object.fromEntries(input.lines.map((l) => [l.key, said(l)])) })
    }
  })

test("a second language is given the source's treatment in its own words: its second and third blocks of a name, its other lines, its second chance", async () => {
  const site = twoLanguageSite()
  const model = clinicModel()
  await run({ site, model, ctx: { brief: { about: clinic.about }, normalized: clinic } })
  const vi = site.sweep.copies[ABOUT_VI].content
  for (const demo of DEMO_VI) assert.equal(vi.includes(demo), false, `the demo's "${demo}" is gone`)
  assert.ok(vi.includes('<h2>phở ngon 1</h2>'), "the first block of a name is the contract door's, as before")
  assert.ok(vi.includes('<h2>phở ngon 2</h2>'), 'the second is written by block, in Vietnamese')
  assert.ok(vi.includes('<p>phở ngon ơi 2</p>'))
  assert.ok(vi.includes('<p>Chúng tôi ở đây</p>'), "the second chance, asked in the edition's own language")
  assert.ok(vi.includes('<p>Có bác sĩ trực mọi ngày.</p>'), 'a line no slot names, said again in Vietnamese')
  assert.ok(
    !Object.keys(site.applied.changes).some((k) => /^vi::about\.text[23]\./.test(k)),
    'a second block of a name never goes to the contract door'
  )
  // What it costs: one batch for the edition's other lines and one second chance, beside the writes; the edition's own
  // slots are the batches they always were.
  const viLines = model.calls.filter((c) =>
    c.slots.some((s) => s.key.startsWith('line.') && s.language === 'vi')
  )
  const viRepairs = model.repairs.filter((r) => r.site.languages[0] === 'vi')
  assert.equal(
    viLines.length + viRepairs.length,
    2,
    `${viLines.length} line batch(es), ${viRepairs.length} second chance(s)`
  )
  assert.deepEqual(
    viRepairs[0].lines.map((l) => [l.key, l.sample]),
    [
      ['about.text3.heading', 'An toàn lao động'],
      ['about.text3.intro', 'Không có sự cố mất ngày công trong ba mươi sáu tháng qua.']
    ],
    "the edition's second chance is shown the edition's own words of THAT block"
  )
})

test('a language whose second chance fails removes nothing: its demo blocks stay until somebody can say better, and it is said', async () => {
  const site = twoLanguageSite()
  const { notes } = await run({
    site,
    model: clinicModel({ viSecondChance: 'throw' }),
    ctx: { brief: { about: clinic.about }, normalized: clinic }
  })
  const vi = site.sweep.copies[ABOUT_VI].content
  assert.ok(vi.includes('<h2>An toàn lao động</h2>'), 'a timed-out or failed second chance takes nothing off')
  assert.ok(vi.includes('Không có sự cố'))
  assert.ok(vi.includes('<h2>phở ngon 2</h2>'), 'what the first pass wrote is still written')
  assert.ok(
    notes.some((n) => /vi .*could not be asked again/.test(n)),
    notes.join(' | ')
  )
})

test('a second chance that answers but says nothing of a line takes its block off when its source counterpart was rewritten', async () => {
  const site = twoLanguageSite()
  await run({
    site,
    model: clinicModel({ viSecondChance: 'silent' }),
    ctx: { brief: { about: clinic.about }, normalized: clinic }
  })
  const vi = site.sweep.copies[ABOUT_VI].content
  assert.equal(vi.includes('An toàn lao động'), false)
  assert.equal(vi.includes('Không có sự cố'), false)
})

test("a language with a batch of its first pass that failed removes nothing on the second chance's silence", async () => {
  const site = twoLanguageSite()
  const model = clinicModel({ viSecondChance: 'silent', failViBatch: true })
  await run({ site, model, ctx: { brief: { about: clinic.about }, normalized: clinic } })
  const vi = site.sweep.copies[ABOUT_VI].content
  assert.ok(
    model.repairs.some(
      (r) => r.site.languages[0] === 'vi' && r.lines.some((l) => l.key === 'about.text3.heading')
    ),
    "the About page's own batch answered: its line had its second chance"
  )
  assert.ok(
    vi.includes('<h2>An toàn lao động</h2>'),
    'one failed batch is a model gone wrong, and nothing is guessed'
  )
  assert.ok(vi.includes('Không có sự cố'))
})

test("a line the site refused in the source language keeps the other language's block too", async () => {
  const site = twoLanguageSite()
  site.refuseSlot = 'about.text.intro'
  const { notes } = await run({
    site,
    model: clinicModel({ viSecondChance: 'silent', viPend: ['about.text.intro'] }),
    ctx: { brief: { about: clinic.about }, normalized: clinic }
  })
  const vi = site.sweep.copies[ABOUT_VI].content
  assert.ok(!('about.text.intro' in site.applied.changes), 'the site refused the source line')
  assert.ok(
    notes.some((n) => /refused by the site/.test(n)),
    notes.join(' | ')
  )
  assert.ok(
    vi.includes('<p>Chúng tôi thiết kế và thi công nhà xưởng thép.</p>'),
    'the source kept its own words there, so the copy is not emptied of its'
  )
  assert.equal(
    vi.includes('An toàn lao động'),
    false,
    'a block whose source line went in still goes on silence'
  )
})

test('blocks with no honest line never empty a page: a copy that would lose most of what it says keeps them, and it is said', async () => {
  const site = twoLanguageSite()
  const contactVi =
    `${namedHeading('contact.heading', 'Liên hệ với đội ngũ kinh doanh')}\n\n` +
    namedPara('contact.intro', 'Gửi yêu cầu báo giá hoặc đặt lịch khảo sát công trường cho dự án của bạn.')
  site.sweep.copies[1949] = { slug: 'contact-vi', status: 'publish', content: contactVi }
  const { notes } = await run({
    site,
    model: clinicModel({ viPend: ['contact.contact.heading', 'contact.contact.intro'] }),
    ctx: { brief: { about: clinic.about }, normalized: clinic }
  })
  assert.equal(site.sweep.copies[1949].content, contactVi, 'both blocks stay: the page is not emptied')
  assert.ok(
    notes.some((n) => /contact-vi page keeps 2 block\(s\)/.test(n)),
    notes.join(' | ')
  )
  assert.equal(
    site.sweep.copies[ABOUT_VI].content.includes('An toàn lao động'),
    false,
    'a page that keeps most of what it says still loses its block'
  )
})

test("one language's failure never costs another language's lines, nor its own lines already answered", async () => {
  const site = twoLanguageSite()
  const ABOUT_DE = 555
  site.sweep.copies[ABOUT_DE] = {
    slug: 'about-de',
    status: 'publish',
    content: wtbSection(
      [
        namedHeading('text.heading', 'Industriebau aus einer Hand'),
        `<!-- wp:paragraph -->\n<p>Jede Baustelle hat einen ständigen Bauleiter vor Ort.</p>\n<!-- /wp:paragraph -->`,
        `<!-- wp:paragraph -->\n<p>Wir liefern Stahlhallen termingerecht in ganz Europa.</p>\n<!-- /wp:paragraph -->`
      ].join('\n')
    )
  }
  const { notes } = await run({
    site,
    model: clinicModel({ germanLeft: true }),
    ctx: { brief: { about: clinic.about }, normalized: { ...clinic, languages: ['en', 'vi', 'de'] } }
  })
  assert.ok(
    site.sweep.copies[ABOUT_VI].content.includes('<p>Có bác sĩ trực mọi ngày.</p>'),
    'the Vietnamese lines are written whatever became of the German ones'
  )
  const de = site.sweep.copies[ABOUT_DE].content
  assert.ok(
    de.includes('<p>Sanfte Behandlung in jedem Alter.</p>'),
    'the German line the first pass answered'
  )
  assert.ok(
    de.includes('Wir liefern Stahlhallen'),
    'the German line whose second chance failed keeps its words: nothing is taken off on a failure'
  )
  assert.ok(
    notes.some((n) => /de-de/.test(n) && /could not/.test(n)),
    notes.join(' | ')
  )
})

test("a line that is only an interface is never taken off a copy on the second chance's silence", async () => {
  const site = twoLanguageSite()
  site.sweep.copies[ABOUT_VI].content = site.sweep.copies[ABOUT_VI].content.replace(
    namedPara('text.item.2.title', 'Chi nhánh miền Trung'),
    `${namedPara('text.item.2.title', 'Chi nhánh miền Trung')}\n${namedPara('text.item.2.text', 'chi nhánh')}`
  )
  await run({
    site,
    model: clinicModel({ viSecondChance: 'silent', viPend: ['about.text.item.2.text'] }),
    ctx: { brief: { about: clinic.about }, normalized: clinic }
  })
  const vi = site.sweep.copies[ABOUT_VI].content
  assert.ok(vi.includes('<p>chi nhánh</p>'), "a two-word label is the template's interface, not its company")
  assert.equal(vi.includes('An toàn lao động'), false, 'a sentence-long line still goes')
})

test('more blocks of one language with no honest line than MAX_DROPS is a model gone wrong: none of them goes, and it is said', async () => {
  const site = twoLanguageSite()
  const homeKeys = [
    ...new Set(
      contentMap.slots
        .filter((x) => x.entity === 'page-home' && x.type === 'text' && x.target.block)
        .map((x) => x.key)
    )
  ].slice(0, 32)
  const blockOfKey = (key) => contentMap.slots.find((x) => x.key === key).target.block
  site.sweep.copies[1946] = {
    slug: 'vi',
    status: 'publish',
    content: homeKeys
      .map((key, i) => namedPara(blockOfKey(key), `Câu mẫu của công ty xây dựng số ${i + 1} trên trang chủ.`))
      .join('\n\n')
  }
  const { notes } = await run({
    site,
    model: clinicModel({ viPend: homeKeys }),
    ctx: { brief: { about: clinic.about }, normalized: clinic }
  })
  assert.ok(
    notes.some((n) => /33 lines of the vi version had no honest replacement/.test(n)),
    notes.join(' | ')
  )
  assert.ok(
    site.sweep.copies[ABOUT_VI].content.includes('<h2>An toàn lao động</h2>'),
    'not even the one on another page'
  )
  assert.ok(site.sweep.copies[1946].content.includes('số 32 trên trang chủ'))
})

test('a line the first pass left pending gets a second chance, and the contract door writes the answer', async () => {
  const pending = 'contact.contact.intro'
  const sample = contentMap.slots.find((s) => s.key === pending).sample
  const model = fakeModel({
    pend: [pending],
    repair: JSON.stringify({ values: { [pending]: 'Drop by for fresh bread, or ask about a cake.' } })
  })
  const { prepared, site } = await run({ model })
  assert.equal(model.repairs.length, 1)
  assert.deepEqual(
    model.repairs[0].lines.map((l) => l.key),
    [pending],
    "only the line that is still the template's"
  )
  assert.equal(model.repairs[0].lines[0].sample, sample)
  assert.equal(site.applied.changes[pending], 'Drop by for fresh bread, or ask about a cake.')
  assert.deepEqual(prepared.pending, [])
})

test('a line the model cannot write honestly even now is taken off its page; a line that is only an interface is not asked about', async () => {
  const person = contentMap.slots.find((s) => s.key === 'about.team.item.1.title')
  const numbering = contentMap.slots.find((s) => s.sample === '01')
  assert.ok(person && numbering)
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.pages[0].content = [
    group(
      namedPara('team.item.1.title', person.sample) +
        '\n' +
        namedPara(numbering.target.block, '01') +
        '\n' +
        namedPara('x', aboutHeading)
    ),
    group(namedPara('other', aboutHeading))
  ].join('\n\n')
  const model = fakeModel({
    pend: [person.key, numbering.key],
    repair: JSON.stringify({ values: { [person.key]: null } })
  })
  const { prepared } = await run({ site, model })
  assert.deepEqual(
    model.repairs[0].lines.map((l) => l.key),
    [person.key],
    'a "01" is the template\'s own interface and is not put to the model'
  )
  assert.deepEqual(
    prepared.drops.map((d) => [d.slug, d.block, d.nth]),
    [['about', 'team.item.1.title', 1]]
  )
  assert.equal(site.sweep.pages[0].content.includes(person.sample), false, 'the Russian site manager is gone')
  assert.ok(site.sweep.pages[0].content.includes('>01<'), 'the numbering stays')
})

// 🔒 L09 ON THE ENGINE: a line the model writes around the template's own fact is not written; it gets the second chance.
test("a line that keeps the template's own fact is not written: it is asked again, and the honest line goes in", async () => {
  const key = 'home.hero.eyebrow'
  const sample = contentMap.slots.find((s) => s.key === key).sample
  assert.match(sample, /\b(?:19|20)\d{2}\b/, 'the template ships a founding year there')
  const model = fakeModel({
    echo: [key],
    repair: (input) =>
      JSON.stringify({
        values: Object.fromEntries(
          input.lines.map((l) => [l.key, l.key === key ? 'Open six days a week' : null])
        )
      })
  })
  const { site, notes } = await run({ model })
  assert.ok(
    model.repairs.some((r) => r.lines.some((l) => l.key === key)),
    'the line was put to the second chance'
  )
  assert.equal(site.applied.changes[key], 'Open six days a week')
  assert.ok(notes.some((n) => /left out because they stated facts you did not give/.test(n)))
})

/** How many blocks of the contract share each key (a key the contract gives to two blocks is two slots to the planner). */
const keyCount = contentMap.slots.reduce((m, s) => m.set(s.key, (m.get(s.key) ?? 0) + 1), new Map())

test('more lines with no honest replacement than may be taken off: the ones naming the template’s company go first, never none', async () => {
  const single = blockSlots.filter((s) => keyCount.get(s.key) === 1)
  const named = single.filter((s) => /Northgate/.test(s.sample)).map((s) => s.key)
  const plain = single
    .filter((s) => !/Northgate|\d/.test(s.sample) && s.sample.split(/\s+/).length >= 3)
    .slice(0, 37)
    .map((s) => s.key)
  assert.ok(named.length >= 2 && plain.length === 37)
  // The lines naming the template's company come LAST in the plan: taking the first thirty would leave them all.
  const pend = [...plain, ...named]
  const model = fakeModel({
    pend,
    repair: (input) => JSON.stringify({ values: Object.fromEntries(input.lines.map((l) => [l.key, null])) })
  })
  const { prepared, notes } = await run({ model })
  assert.equal(prepared.drops.length, 30, 'the cap is the most taken off, not a reason to take none off')
  const dropped = new Set(prepared.drops.map((d) => `${d.slug}/${d.block}`))
  for (const key of named) {
    const slot = contentMap.slots.find((s) => s.key === key)
    const slug = contentMap.entities.find((e) => e.key === slot.entity).identity.slug
    assert.ok(dropped.has(`${slug}/${slot.target.block}`), `${key} names the template's company`)
  }
  assert.ok(
    notes.some((n) => /the other \d+ keep the template’s words/.test(n)),
    notes.join(' | ')
  )
})

test('a model that is down for the second chance costs nothing: no block is taken off, and the report says so', async () => {
  const person = contentMap.slots.find((s) => s.key === 'about.team.item.1.title')
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.pages[0].content = group(
    namedPara('team.item.1.title', person.sample) + '\n' + namedPara('x', aboutHeading)
  )
  const { prepared, notes } = await run({ site, model: fakeModel({ pend: [person.key], repair: 'throw' }) })
  assert.deepEqual(prepared.drops, [])
  assert.ok(
    site.sweep.pages[0].content.includes(person.sample),
    "the template's words stay until somebody can say better"
  )
  assert.ok(notes.some((n) => /could not be asked again/.test(n)))
})

test('a second-chance line longer than its slot is cut back to a sentence, or the block goes', async () => {
  const key = 'contact.contact.intro'
  const slot = contentMap.slots.find((s) => s.key === key)
  const long =
    'Fresh bread every morning. ' +
    'And a great many more words than this small slot can hold at all. '.repeat(6)
  const model = fakeModel({ pend: [key], repair: JSON.stringify({ values: { [key]: long } }) })
  const { site } = await run({ model })
  const written = site.applied.changes[key]
  assert.ok(long.startsWith(written) && written.endsWith('.'), 'cut at the end of a sentence')
  assert.ok(written.length <= slot.maxCharacters)
})

// ── The words no slot names ───────────────────────────────────────────────────────────────────────────────────
const newsHeading = 'News & engineering notes'
const contactForm = [
  '<label> Full name *\n    [text* full-name placeholder "Ivan Petrov"] </label>',
  '<label class="wtb-form__file"> Drag drawings here, or click to choose files\n    [file file-1] </label>',
  '[acceptance acceptance-1] I consent to the processing of data under Federal Law 152-FZ. [/acceptance]'
].join('\n')

/** A site whose News page and Contact page carry words no slot names, and whose Contact page has a form. */
function siteWithUnslottedWords() {
  const site = fakeSite()
  site.sweep = demoSweep()
  const news = site.sweep.pages.find((p) => p.slug === 'news')
  news.content = `<!-- wp:heading {"level":2} -->\n<h2>${newsHeading}</h2>\n<!-- /wp:heading -->\n\n${news.content}`
  site.sweep.pages.push({
    id: 60,
    slug: 'contact',
    title: 'Contact',
    status: 'publish',
    content: [
      group(aboutHeading),
      '<!-- wp:paragraph -->\n<p>Fields marked * are required. Attaching drawings lets us give you a far more accurate take-off.</p>\n<!-- /wp:paragraph -->',
      '<!-- wp:shortcode -->\n[contact-form-7 id="25" title="Contact"]\n<!-- /wp:shortcode -->'
    ].join('\n\n')
  })
  site.sweep.forms = { 25: contactForm }
  return site
}

test("the words no slot names are planned like slots and written where they stand: a page's heading, a form's sentences", async () => {
  const site = siteWithUnslottedWords()
  const model = fakeModel({
    lines: {
      [newsHeading]: 'News from the bakery',
      'Fields marked * are required. Attaching drawings lets us give you a far more accurate take-off.':
        'Fields marked * are required.',
      'I consent to the processing of data under Federal Law 152-FZ.':
        'I agree to my details being used to reply.',
      'Ivan Petrov': 'Your name'
    },
    pend: ['line.form-25.1'],
    repair: (input) => JSON.stringify({ values: Object.fromEntries(input.lines.map((l) => [l.key, null])) })
  })
  const { times } = await run({ site, model })
  const news = site.sweep.pages.find((p) => p.slug === 'news')
  assert.ok(news.content.includes('<h2>News from the bakery</h2>'))
  assert.equal(news.content.includes('engineering'), false)
  assert.ok(news.content.includes('wp:query'), 'the live query is as it was')
  const contact = site.sweep.pages.find((p) => p.slug === 'contact')
  assert.ok(contact.content.includes('<p>Fields marked * are required.</p>'))
  assert.ok(contact.content.includes('[contact-form-7 id="25"'), 'the form is still in its page')
  const form = site.sweep.forms[25]
  assert.ok(form.includes('placeholder "Your name"'))
  assert.ok(form.includes('I agree to my details being used to reply.'))
  assert.equal(
    form.includes('drawings') || form.includes('[file'),
    false,
    'the upload nobody can answer takes its field with it'
  )
  assert.ok(form.includes('[text* full-name') && form.includes('[acceptance acceptance-1]'))
  assert.ok(times.residuePlaced >= 3 && times.residueDropped >= 1)
})

test("a section whose only words were written by block is the customer's and is not cut with the template's", async () => {
  const site = siteWithUnslottedWords()
  const { notes } = await run({
    site,
    model: fakeModel({ lines: { [newsHeading]: 'News from the bakery' } })
  })
  const news = site.sweep.pages.find((p) => p.slug === 'news')
  assert.ok(
    news.content.includes('News from the bakery'),
    'a lone heading with nothing else written is kept: it was just said'
  )
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

test('a model that fails to plan the other words costs those words only', async () => {
  const site = siteWithUnslottedWords()
  const model = fakeModel()
  const ask = model.models
  model.models = async () => {
    const m = await ask()
    const chat = m.text.chat
    m.text.chat = async (call) => {
      if (JSON.parse(call.messages[1].content).slots?.some((s) => s.key.startsWith('line.')))
        throw new Error('model gone')
      return chat(call)
    }
    return m
  }
  const { notes } = await run({ site, model, ctx: untickedCtx() })
  assert.ok(Object.keys(site.applied.changes).length > 200, "the contract's words are all written")
  assert.equal(site.sweep.pages.find((p) => p.slug === 'careers').status, 'draft', 'and the sweep is done')
  assert.equal(site.sweep.forms[25], contactForm, 'the form is as the template has it')
  assert.ok(notes.some((n) => /other words of the pages could not be written/.test(n)))
})

test('the profiles the owner linked are written as they wrote them where the template keeps a link for that network, and nowhere else', async () => {
  const social = {
    instagram: 'https://instagram.com/goldencrustbakery',
    facebook: 'https://facebook.com/goldencrustbakery',
    x: 'https://twitter.com/golden'
  }
  const { site, prepared } = await run({
    ctx: { normalized: { ...context().ctx.normalized, social, languages: ['en', 'vi'] } }
  })
  assert.equal(site.applied.changes['identity.social.instagram'], social.instagram)
  assert.equal(site.applied.changes['identity.social.facebook'], social.facebook)
  assert.ok(
    !Object.keys(site.applied.changes).some((k) => k.endsWith('social.x') || k.endsWith('social.twitter')),
    'the template has no link for that network'
  )
  assert.ok(
    !Object.keys(site.applied.changes).some((k) => k.startsWith('vi::identity.social')),
    "the identity is the site's, written once"
  )
  assert.ok(
    !prepared.inputWrites.some((w) => w.slot === 'identity.social.youtube'),
    'a network nobody linked stays empty'
  )
})

test("a page's heading meta and excerpt, which no slot and no block holds, are said again where they stand; a hidden page's are not", async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.pageMeta = {
    51: {
      heading: 'News & engineering notes',
      excerpt: 'Project updates, corporate disclosures and field notes from the {site.name} engineering team.'
    },
    37: { heading: 'Building Russian industrial infrastructure since 2004', excerpt: '' },
    38: { heading: 'Careers at the plant', excerpt: 'Join the engineering team' }
  }
  await run({
    site,
    model: fakeModel({
      lines: {
        'News & engineering notes': 'News from the bakery',
        'Project updates, corporate disclosures and field notes from the {site.name} engineering team.':
          'Fresh bakes, seasonal specials and news from the ovens.',
        'Building Russian industrial infrastructure since 2004': 'A family bakery in Hanoi'
      }
    }),
    ctx: untickedCtx()
  })
  assert.equal(site.sweep.pageMeta[51].heading, 'News from the bakery')
  assert.equal(site.sweep.pageMeta[51].excerpt, 'Fresh bakes, seasonal specials and news from the ovens.')
  assert.equal(site.sweep.pageMeta[37].heading, 'A family bakery in Hanoi')
  assert.equal(site.sweep.pageMeta[37].excerpt, '', 'an empty excerpt is not a line')
  assert.equal(
    site.sweep.pageMeta[38].heading,
    'Careers at the plant',
    'a page the customer unticked is left as it is'
  )
})

// Measured 05/10/2026 (ledger L16) on a JA WordPress template made with Apply: every page's `<title>` and meta description
// still sold the demo company. The theme prints them from metas of its own, named after its stylesheet
// (`<stylesheet with - as _>_document_title`, `…_metadesc`); no slot of the contract holds them, and the plugin's SEO door
// knows Yoast, Rank Math and AIOSEO only. The theme below is made up; its convention is the one such themes follow.
const STUDIO = {
  name: 'Lotus Flow Yoga',
  about: 'Lotus Flow Yoga, a small yoga studio by the river in Da Nang, with gentle classes for every body.',
  tone: 'calm and kind',
  contact: '',
  email: '',
  languages: ['en']
}
const studioCtx = { brief: { about: STUDIO.about, goal: 'contact', style: 'calm' }, normalized: STUDIO }
const seoMetas = () => ({
  37: {
    wp_studio_lumen_document_title: 'About Orbitline — Observability for platform teams',
    wp_studio_lumen_metadesc:
      'Orbitline builds observability tooling trusted by platform teams in forty countries.'
  },
  51: { wp_studio_lumen_document_title: 'Orbitline Field Notes' },
  38: { wp_studio_lumen_document_title: 'Careers at Orbitline' }
})

test("the title and the description a theme keeps for each page in metas of its own are said again from the customer's words", async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.options = { stylesheet: 'wp-studio-lumen' }
  site.sweep.postmeta = seoMetas()
  const model = fakeModel({
    lines: {
      'About Orbitline — Observability for platform teams': 'About Lotus Flow Yoga',
      'Orbitline builds observability tooling trusted by platform teams in forty countries.':
        'A small yoga studio by the river in Da Nang, with gentle classes for every body.',
      'Orbitline Field Notes': 'News from the studio'
    }
  })
  const { notes } = await run({ site, model, ctx: untickedCtx(studioCtx) })
  assert.deepEqual(site.sweep.postmeta[37], {
    wp_studio_lumen_document_title: 'About Lotus Flow Yoga',
    wp_studio_lumen_metadesc:
      'A small yoga studio by the river in Da Nang, with gentle classes for every body.'
  })
  assert.deepEqual(
    site.sweep.postmeta[51],
    { wp_studio_lumen_document_title: 'News from the studio' },
    'a page with no description of its own gets none'
  )
  assert.equal(
    site.sweep.postmeta[38].wp_studio_lumen_document_title,
    'Careers at Orbitline',
    'a page the customer unticked is not worth a write'
  )
  const asked = model.calls.flatMap((c) => c.slots).filter((s) => s.key.startsWith('line.meta-'))
  assert.ok(
    asked.some((s) => s.sample.startsWith('About Orbitline') && /document title/.test(s.label)),
    'the model is told which line is a title'
  )
  // The theme prints the description as the page's visible sub-title too, so it is planned as one.
  assert.ok(asked.some((s) => s.sample.startsWith('Orbitline builds') && /page description/.test(s.label)))
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

test('a theme that keeps no such metas, or a site whose theme cannot be read, is left quietly', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.postmeta = seoMetas()
  const { notes } = await run({ site, ctx: studioCtx })
  assert.deepEqual(site.sweep.postmeta, seoMetas(), 'no theme, no key to read')
  assert.equal(
    site.sweepWrites.some((w) => String(w.key).startsWith('wp_studio_lumen')),
    false
  )
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

test("a child theme's pages are read under the parent's name too, the one whose code prints them", async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.options = { stylesheet: 'wp-studio-lumen-child', template: 'wp-studio-lumen' }
  site.sweep.postmeta = seoMetas()
  await run({
    site,
    model: fakeModel({
      judge: '{"hide": ["careers"], "relabel": {}}',
      lines: { 'About Orbitline — Observability for platform teams': 'About Lotus Flow Yoga' }
    }),
    ctx: studioCtx
  })
  assert.equal(site.sweep.postmeta[37].wp_studio_lumen_document_title, 'About Lotus Flow Yoga')
  assert.equal(
    Object.keys(site.sweep.postmeta[37]).some((k) => k.startsWith('wp_studio_lumen_child')),
    false,
    'a key the page does not have is not made'
  )
})

test("the other languages' copies have their title, description and heading said again in their own language", async () => {
  const site = twoLanguageSite()
  site.sweep.options = { stylesheet: 'wp-studio-lumen' }
  site.sweep.postmeta = { [ABOUT_VI]: { wp_studio_lumen_document_title: 'Giới thiệu công ty xây dựng' } }
  site.sweep.pageMeta = { [ABOUT_VI]: { heading: 'Về chúng tôi: tổng thầu công nghiệp', excerpt: '' } }
  const model = clinicModel({
    moreLines: {
      'Giới thiệu công ty xây dựng': 'Giới thiệu nha sĩ',
      'Về chúng tôi: tổng thầu công nghiệp': 'Về chúng tôi: nha sĩ gia đình'
    }
  })
  await run({ site, model, ctx: { brief: { about: clinic.about }, normalized: clinic } })
  assert.equal(site.sweep.postmeta[ABOUT_VI].wp_studio_lumen_document_title, 'Giới thiệu nha sĩ')
  assert.equal(site.sweep.pageMeta[ABOUT_VI].heading, 'Về chúng tôi: nha sĩ gia đình')
  assert.ok(
    model.calls.some((c) =>
      c.slots.some(
        (s) =>
          s.sample === 'Giới thiệu công ty xây dựng' && s.language === 'vi' && /document title/.test(s.label)
      )
    ),
    'planned with the other lines of that language, as its title'
  )
})

test('a site that lists no pages at first is asked again before its pages are read; one that still lists none is said out loud', async () => {
  const slow = fakeSite()
  slow.sweep = demoSweep()
  slow.sweep.emptyListings = 1
  const first = await run({
    site: slow,
    model: fakeModel({ judge: '{"relabel": {"Book a site survey": "Contact us"}}' })
  })
  assert.ok(slow.sweep.navs[0].content.includes('"label":"Contact us"'), 'judged on the second reading')
  assert.deepEqual(
    first.notes.filter((n) => /could not be judged/.test(n)),
    []
  )

  const deaf = fakeSite()
  deaf.sweep = demoSweep()
  deaf.sweep.emptyListings = 2
  const second = await run({
    site: deaf,
    model: fakeModel({ judge: '{"relabel": {"Book a site survey": "Contact us"}}' })
  })
  assert.ok(deaf.sweep.navs[0].content.includes('Book a site survey'), 'nothing is changed on a guess')
  assert.ok(second.notes.some((n) => /could not be judged: the site listed no pages/.test(n)))
})

test('every published form mails the address the owner gave, the ones a page shows and the ones none does, and nothing else of their mail changes', async () => {
  const site = siteWithUnslottedWords()
  const mail = {
    subject: '[_site_title] "Contact"',
    sender: '[_site_title] <[_site_admin_email]>',
    recipient: '[_site_admin_email]',
    body: 'From: [full-name]',
    use_html: 0
  }
  site.sweep.mails = { 25: { ...mail }, 99: { ...mail }, 100: { ...mail } }
  site.sweep.draftForms = [100]
  const { times } = await run({
    site,
    ctx: { normalized: { ...context().ctx.normalized, email: 'hello@goldencrust.vn' } }
  })
  assert.deepEqual(site.sweep.mails[25], { ...mail, recipient: 'hello@goldencrust.vn' })
  assert.equal(times.mailboxes, 2)
  assert.deepEqual(
    site.sweep.mails[99],
    { ...mail, recipient: 'hello@goldencrust.vn' },
    'a newsletter beside the news is in no page, and mails the owner too'
  )
  assert.deepEqual(site.sweep.mails[100], mail, 'a form that is not published is not touched')
})

// The owner's decision of 05/10/2026 (ledger L05): with no mailbox typed, a form's mail went to `[_site_admin_email]`, which on a
// site Tracy installs is Tracy's own mailbox, so a visitor's message reached nobody who runs the business.
test('with no mailbox typed, every published form mails the account of the person who pressed Apply, and no page shows it', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  const mail = {
    subject: '[_site_title] "Book a class"',
    sender: '[_site_title] <[_site_admin_email]>',
    recipient: '[_site_admin_email]',
    body: 'From: [your-name]'
  }
  site.sweep.mails = { 31: { ...mail }, 32: { ...mail } }
  site.sweep.draftForms = [32]
  const studio = {
    name: 'Lotus Flow Yoga',
    about: 'Lotus Flow Yoga, a small yoga studio by the river in Da Nang.',
    tone: 'calm and kind',
    contact: '',
    email: '',
    languages: ['en']
  }
  const { times } = await run({
    site,
    ctx: {
      email: 'lan.tran@example.org',
      brief: { about: studio.about, goal: 'contact', style: 'calm' },
      normalized: studio
    }
  })
  assert.deepEqual(site.sweep.mails[31], { ...mail, recipient: 'lan.tran@example.org' })
  assert.deepEqual(site.sweep.mails[32], mail, 'a form that is not published is not touched')
  assert.equal(times.mailboxes, 1)
  assert.equal(
    [...site.sweep.pages.map((p) => p.content), ...Object.values(site.sweep.parts)].some((body) =>
      body.includes('lan.tran@example.org')
    ),
    false,
    'the account mailbox receives the mail and is shown nowhere'
  )
})

// ── What the owner wrote must be on the site ──────────────────────────────────────────────────────────────────
/** A footer whose e-mail tile and phone line are the template company's, as a JA template's footer stores them. */
const footerWithMailbox = () =>
  '<!-- wp:html -->\n<a class="tile" href="mailto:hello@orbitline.example" aria-label="Email"><svg viewBox="0 0 24 24"></svg></a>\n<!-- /wp:html -->\n\n' +
  '<!-- wp:paragraph {"className":"phone"} -->\n<p class="phone"><a href="tel:+1-202-555-0160">+1-202-555-0160</a></p>\n<!-- /wp:paragraph -->'
const bikeShop = {
  name: 'Spoke & Chain Cycles',
  about:
    'Spoke & Chain Cycles, a bike repair shop in Hue. Call +84 234 555 0199 or write to ride@spokechain.example.',
  tone: 'plain and friendly',
  contact: '+84 234 555 0199 · ride@spokechain.example',
  email: 'ride@spokechain.example',
  phone: '+84 234 555 0199',
  languages: ['en']
}

test("the mailbox and phone the customer typed are where the template's company had its own, in every part the sweep reads", async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.parts.footer = footerWithMailbox()
  await run({
    site,
    ctx: { brief: { about: bikeShop.about, goal: 'contact', style: 'plain' }, normalized: bikeShop }
  })
  assert.ok(site.sweep.parts.footer.includes('href="mailto:ride@spokechain.example" aria-label="Email"'))
  assert.ok(site.sweep.parts.footer.includes('<a href="tel:+842345550199">+84 234 555 0199</a>'))
  assert.equal(
    site.sweep.parts.footer.includes('orbitline') || site.sweep.parts.footer.includes('202'),
    false
  )
})

// 🔒 Nothing typed keeps the demo's contact links as placeholders (Akemi, 11/10/2026).
test("with no mailbox typed, the demo's e-mail tile stays as the template has it, and the account that receives the forms' mail is not put in its place", async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.parts.footer = footerWithMailbox()
  const quiet = {
    ...bikeShop,
    about: 'Spoke & Chain Cycles, a bike repair shop in Hue.',
    contact: '',
    email: '',
    phone: ''
  }
  await run({
    site,
    ctx: { email: 'minh.le@example.org', brief: { about: quiet.about }, normalized: quiet }
  })
  assert.equal(site.sweep.parts.footer, footerWithMailbox())
  assert.equal(site.sweep.parts.footer.includes('minh.le@example.org'), false)
})
test('with no mailbox typed and no account mailbox known, no form has its mail changed', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.mails = { 31: { recipient: '[_site_admin_email]' } }
  const { times } = await run({
    site,
    ctx: { email: '', normalized: { ...context().ctx.normalized, email: '' } }
  })
  assert.deepEqual(site.sweep.mails[31], { recipient: '[_site_admin_email]' })
  assert.equal(times.mailboxes, 0)
  assert.equal(
    site.sweepWrites.some((w) => w.key === '_mail'),
    false
  )
})

test('opening hours the owner wrote in English are written as they wrote them in the source edition, and left to the model elsewhere', async () => {
  const hours = 'Open 6am-8pm every day'
  const { site, prepared } = await run({
    ctx: { normalized: { ...context().ctx.normalized, hours, languages: ['en', 'vi'] } }
  })
  assert.equal(site.applied.changes['identity.contact.hours'], hours)
  assert.ok(prepared.inputWrites.some((w) => w.slot === 'identity.contact.hours'))
  assert.ok(
    !('vi::identity.contact.hours' in site.applied.changes) ||
      site.applied.changes['vi::identity.contact.hours'] !== hours,
    "the Vietnamese edition says it in Vietnamese, not in the owner's English"
  )
})

test('opening hours written in another language are not forced into the English edition', async () => {
  const { site } = await run({
    ctx: { normalized: { ...context().ctx.normalized, hours: 'Mở cửa 6h-20h mỗi ngày' } }
  })
  assert.notEqual(site.applied.changes['identity.contact.hours'], 'Mở cửa 6h-20h mỗi ngày')
})

/** Tracy Business wp7 1.3.2 with a copy file beside it that declares the demo company's names (D9). */
function withDemoNames(names) {
  const root = mkdtempSync(path.join(tmpdir(), 'tbwp-copy-'))
  const dir = path.join(root, path.basename(contract.dir))
  symlinkSync(contract.dir, dir)
  writeFileSync(`${dir}.copy.json`, JSON.stringify({ keptText: [], demoCompanyNames: names }))
  return { ...contract, dir }
}

const nameOnly = (named, normalized = {}) => ({
  contract: named,
  brief: { about: '', goal: 'contact', style: 'friendly' },
  normalized: { ...context().ctx.normalized, about: '', nameFrom: 'answer', ...normalized }
})

test('a name with no description renames the demo company in the words kept (D9)', async () => {
  const named = withDemoNames(['Northgate', 'Northgate Industrial JSC'])
  const { site } = await run({ model: fakeModel({ down: true }), ctx: nameOnly(named) })
  const { changes } = site.applied
  assert.equal(changes['home.text.eyebrow'], 'Why Golden Crust Bakery')
  assert.match(changes['about.text.intro'], /^Golden Crust Bakery is a full-cycle general contractor/)
  assert.equal(
    changes['identity.name'],
    'Golden Crust Bakery',
    'what the customer gave is still written as given'
  )
})

test('a description given or a name from the site address renames nothing (D9)', async () => {
  const named = withDemoNames(['Northgate'])
  const given = await run({
    model: fakeModel({ down: true }),
    ctx: { ...nameOnly(named), brief: { about: 'A family bakery.', goal: 'contact', style: 'friendly' } }
  })
  assert.equal(given.site.applied.changes['home.text.eyebrow'], undefined)
  // A name from the site address is no answer (TCH #1013, 13/10/2026): with About blank too, nothing is written at all, the
  // site name included.
  const label = await run({ model: fakeModel({ down: true }), ctx: nameOnly(named, { nameFrom: 'label' }) })
  assert.equal(label.site.applied?.changes?.['home.text.eyebrow'], undefined)
  assert.equal(label.site.applied?.changes?.['identity.name'], undefined)
})

// 🔒 ABOUT LEFT BLANK: THE NAME CHANGES AND NOTHING ELSE, EVEN WITH A MODEL (spec TCQR ABOUT-3, K6, K7; dev g55-ess-wp-blank
// 10/10/2026: "@Grazia on instagram" became "Bakery gallery", six bakery photos replaced the demo's, a hidden heading read
// "Bakery features"). The D9 tests above run with the model down, which hid it.
test('About blank with a working model and a picture model: no line is written by a model, no picture is drawn', async () => {
  const named = withDemoNames(['Northgate', 'Northgate Industrial JSC'])
  const pictures = await withPictures()
  const model = fakeModel()
  const { site, notes } = await run({ model, pictures, ctx: nameOnly(named) })
  const { changes } = site.applied
  assert.deepEqual(model.calls, [], 'the planner is never asked to write the demo words')
  assert.deepEqual(model.repairs, [], 'nor asked a second time')
  assert.deepEqual(model.judged, [], 'nor are the menu labels judged from the name')
  assert.deepEqual(pictures.asked, [], 'no picture is drawn from the name')
  assert.equal(site.uploads.length, 0)
  assert.ok(
    !Object.values(changes).some((v) => typeof v === 'string' && v.startsWith('Crust ')),
    'no model line reaches the site'
  )
  assert.equal(
    changes['home.text.eyebrow'],
    'Why Golden Crust Bakery',
    'the demo company is still renamed (D9)'
  )
  assert.equal(changes['identity.name'], 'Golden Crust Bakery')
  assert.ok(
    notes.some((n) => /About was left blank/.test(n)),
    notes.join(' | ')
  )
})

// TCH #1013, ABOUT-3 (11/10/2026): with About blank no word is written, so every section of the template is one "the words
// never reached". The sweep cuts none of them: the site keeps the demo's history, safety, projects list, as in the demo.
test('About blank: no section of the template is cut, in the pages or the header; the demo stays, renamed', async () => {
  const named = withDemoNames(['Northgate'])
  const site = fakeSite()
  site.sweep = demoSweep()
  const before = {
    pages: site.sweep.pages.map((p) => [p.slug, p.content, p.status]),
    header: site.sweep.parts.header
  }
  const { times } = await run({ site, model: fakeModel(), ctx: nameOnly(named) })
  assert.equal(times.residueCut ?? 0, 0, 'nothing cut')
  const about = site.sweep.pages.find((p) => p.slug === 'about')
  assert.ok(about.content.includes('History'), 'the raw HTML history section stays')
  assert.ok(about.content.includes('Safety'), 'the safety section stays')
  assert.ok(site.sweep.parts.header.includes('Elektra'), "the header's list of the template's projects stays")
  for (const [slug, content, status] of before.pages) {
    const now = site.sweep.pages.find((p) => p.slug === slug)
    assert.equal(now.status, status, `${slug} keeps its status`)
    assert.equal(now.content, content, `${slug} keeps its sections`)
  }
  assert.equal(site.sweep.parts.header, before.header)
})

test('About blank on a site written in one other language: the source edition is still written in it', async () => {
  const named = withDemoNames(['Northgate'])
  const model = fakeModel()
  await run({ model, ctx: nameOnly(named, { languages: ['vi'] }) })
  assert.ok(model.calls.length > 0, 'a root with no demo words in its language still gets words in it')
})

// 🔒 NOTHING TYPED KEEPS THE DEMO'S CONTACT LINES (Akemi, 11/10/2026, BLANK and FULL alike): with About given and no phone,
// mailbox, address or opening hours, the contract's contact lines keep the template's words as placeholders. The model is not
// asked to write them (it would write a line with no contact detail in it), and none is taken off for lacking honest words.
const CONTACT_SLOTS = [
  'identity.contact.email',
  'identity.contact.phone',
  'identity.contact.tel',
  'identity.contact.address',
  'identity.contact.hours'
]

test('About given and no contact detail typed: the demo contact lines are neither rewritten nor taken off', async () => {
  const { site, prepared } = await run()
  const changes = site.applied.changes
  for (const key of CONTACT_SLOTS) assert.equal(key in changes, false, `${key} keeps the demo's words`)
  const blocks = new Set(
    contentMap.slots.filter((s) => CONTACT_SLOTS.includes(s.key)).map((s) => s.target.block)
  )
  assert.deepEqual(
    prepared.drops.filter((d) => blocks.has(d.block)),
    [],
    'no demo contact line is taken off'
  )
  assert.ok(Object.keys(changes).length > 200, 'the other words are still written')
})

test('a contact detail typed is written as typed; the kinds not typed keep the demo', async () => {
  const { site } = await run({
    ctx: {
      normalized: { ...context().ctx.normalized, phone: '+84 24 3555 0144', contact: '+84 24 3555 0144' }
    }
  })
  const changes = site.applied.changes
  assert.equal(changes['identity.contact.phone'], '+84 24 3555 0144')
  for (const key of ['identity.contact.email', 'identity.contact.address', 'identity.contact.hours'])
    assert.equal(key in changes, false, `${key} keeps the demo's words`)
})

// ── The demo blog posts (D10), the kit pages (K3), and a line answered with the bare name ─────────────────────────────
const essencePost = readFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'ja-essence-wp7-1.0.10-post.html'),
  'utf8'
)
const ESSENCE_FIRST =
  'Its sometimes her behaviour are contented. Do listening am eagerness oh objection collected. Together gay feelings continue juvenile had off one. Unknown may service subject her letters one bed. Child years noise ye in forty. Loud in this in both hold. My entrance me is disposal bachelor remember relation.'
/** Two JA Essence posts as the 1.0.10 release stores them: the same body, filed under a category and a tag. */
const essencePosts = () => [
  {
    id: 98,
    slug: 'drawing-with-elegance-the-art-of-line-work-2',
    title: 'Drawing with Elegance: The Art of Line Work',
    status: 'publish',
    created: '2023-06-09 07:23:01',
    excerpt: ESSENCE_FIRST,
    categories: ['blog-health'],
    tags: ['health'],
    content: essencePost
  },
  {
    id: 109,
    slug: 'abstract-wonders-exploring-line-art-composition',
    title: 'Abstract Wonders: Exploring Line Art Composition',
    status: 'publish',
    created: '2023-06-10 07:23:01',
    excerpt: ESSENCE_FIRST,
    categories: ['blog-health'],
    tags: [],
    content: essencePost
  }
]
const essenceTerms = () => ({
  category: { 5: { name: 'Health', slug: 'blog-health' } },
  post_tag: { 11: { name: 'Health', slug: 'health' } }
})

// 🔒 DEMO POSTS ON FULL ARE TRANSLATED ONLY, NEVER REWRITTEN (product owner, decision 1 after g65, 12/10/2026): the customer
// rewrites the posts anyway, and rewriting them ran the WordPress build out of time on dev g65-ess-wp-full (7 posts left English,
// "time for the build ran out"). The posts' titles, excerpts and words are translated into the site's language, once per distinct
// text (the demo's copies share one body); Latin filler stays as the demo has it; an English site keeps the demo's posts. The
// categories are still renamed for the trade (decision (3) of 12/10/2026), their descriptions only translated.
const LOREM_LINE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.'
/** A post body with a Latin filler paragraph, the way some demos ship one. */
const withLorem = (/** @type {string} */ content) =>
  `${content}\n<!-- wp:paragraph -->\n<p>${LOREM_LINE}</p>\n<!-- /wp:paragraph -->`
const VI = { normalized: { ...context().ctx.normalized, languages: ['vi-vn'] } }
/** The asks of the old blog plan and title stage: none may be made now. */
const rewriteAsks = (/** @type {any} */ model) => [...model.blogged, ...model.titled]

test('About given, a Vietnamese site: the demo posts are translated, never rewritten; copies keep one title as in the demo, lorem stays', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.posts = essencePosts().map((p) => ({
    ...p,
    title: 'Drawing with Elegance: The Art of Line Work',
    content: withLorem(p.content)
  }))
  site.sweep.terms = {
    category: { 5: { name: 'Health', slug: 'blog-health', description: 'Notes on staying well.' } },
    post_tag: { 11: { name: 'Health', slug: 'health', description: '' } }
  }
  const model = fakeModel({
    translate: (text) => `[vi] ${text}`,
    categories: (input) => ({ [input.categories[0].key]: 'Bánh mì tươi' })
  })
  const { times, notes } = await run({ site, model, ctx: VI })
  assert.deepEqual(rewriteAsks(model), [], 'nothing is planned or written for the business')
  for (const post of site.sweep.posts) {
    assert.equal(
      post.title,
      '[vi] Drawing with Elegance: The Art of Line Work',
      'the title translated, the demo copy kept'
    )
    assert.equal(post.excerpt, `[vi] ${ESSENCE_FIRST}`)
    assert.ok(post.content.includes(`<p>[vi] ${ESSENCE_FIRST}</p>`), 'the body translated where it stands')
    assert.ok(post.content.includes(`<p>${LOREM_LINE}</p>`), 'the Latin filler stays')
    for (const kept of [
      '/wp-content/uploads/2026/10/item-2-7.jpg',
      '<!-- wp:more -->',
      '<!-- wp:list {"className":"list-special"} -->'
    ])
      assert.ok(post.content.includes(kept), kept)
  }
  // One translation per distinct text: the two copies' title, excerpt and body were asked once.
  assert.equal(model.translated.filter((t) => t === ESSENCE_FIRST).length, 1)
  assert.equal(model.translated.filter((t) => t === 'Drawing with Elegance: The Art of Line Work').length, 1)
  assert.equal(model.translated.includes(LOREM_LINE), false, 'lorem is never asked')
  assert.ok(
    notes.some((n) => /Latin filler/.test(n)),
    notes.join('\n')
  )
  assert.equal(
    site.sweep.posts.map((p) => p.slug).join(),
    essencePosts()
      .map((p) => p.slug)
      .join(),
    'slugs stay'
  )
  // The category renamed for the trade, its description translated; the tag translated.
  assert.deepEqual(site.sweep.terms.category[5], {
    name: 'Bánh mì tươi',
    slug: 'blog-health',
    description: '[vi] Notes on staying well.'
  })
  assert.equal(site.sweep.terms.post_tag[11].name, '[vi] Health')
  assert.equal(times.postsTranslated, 2)
})

test('About given, an English site: the demo posts stay exactly as the template has them; the categories are still renamed', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.posts = essencePosts()
  site.sweep.terms = essenceTerms()
  const model = fakeModel({ categories: (input) => ({ [input.categories[0].key]: 'Sourdough Notes' }) })
  await run({ site, model })
  assert.deepEqual(rewriteAsks(model), [])
  assert.deepEqual(
    site.sweep.posts,
    essencePosts().map((p) => ({ ...p }))
  )
  assert.deepEqual(
    site.sweepWrites.filter((w) => w.kind === 'term').map((w) => [w.key, w.id, w.fields]),
    [['category', 5, { name: 'Sourdough Notes' }]]
  )
  assert.equal(model.named[0].topics.length, 0, 'no topics: the posts are the demo’s')
})

test('About blank: the demo posts stay exactly as the template has them, and the model is not asked about them', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.posts = essencePosts()
  const model = fakeModel()
  await run({
    site,
    model,
    ctx: {
      brief: { about: '' },
      normalized: { ...context().ctx.normalized, about: '', languages: ['vi-vn'] }
    }
  })
  assert.deepEqual(
    site.sweep.posts,
    essencePosts().map((p) => ({ ...p }))
  )
  assert.equal(model.translated.includes(ESSENCE_FIRST), false)
})

test('a disobedient translator (English back, then a short array, then English alone) is asked again, split, line by line; what stays English is said', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.posts = essencePosts()
  site.sweep.terms = essenceTerms()
  let batch = 0
  const model = fakeModel({ categories: (input) => ({ [input.categories[0].key]: 'Bánh mì tươi' }) })
  const models = model.models
  model.models = async () => {
    const own = await models()
    return {
      ...own,
      text: {
        ...own.text,
        chat: async (/** @type {any} */ request) => {
          const system = String(request.messages[0].content)
          const input = JSON.parse(request.messages[1].content)
          const post = (/** @type {string} */ t) => t === ESSENCE_FIRST || /Line Art|Line Work/.test(t)
          // A batch of post lines: English back the first time, one item short the second.
          if (
            system.startsWith('You are translating') &&
            input.some((/** @type {any} */ i) => post(i.text))
          ) {
            batch += 1
            if (batch === 1) return JSON.stringify(input.map(({ i, text }) => ({ i, text })))
            if (batch === 2)
              return JSON.stringify(input.slice(1).map(({ i, text }) => ({ i, text: `[vi] ${text}` })))
            // Then every batch but the excerpt's line, which comes back English each time.
            return JSON.stringify(
              input.map(({ i, text }) => ({ i, text: text === ESSENCE_FIRST ? text : `[vi] ${text}` }))
            )
          }
          // Alone, the excerpt line keeps its English every time.
          if (system.startsWith('You translate one line') && input.text === ESSENCE_FIRST)
            return JSON.stringify({ text: input.text })
          return own.text.chat(request)
        }
      }
    }
  }
  const { notes } = await run({ site, model, ctx: VI })
  const [one] = site.sweep.posts
  assert.match(one.title, /^\[vi\] /, 'the titles came through')
  assert.equal(one.excerpt, ESSENCE_FIRST, 'a line with no usable answer keeps its words')
  assert.ok(
    notes.some((n) => /line\(s\) of the demo blog posts were asked again/.test(n)),
    notes.join('\n')
  )
  assert.ok(
    notes.some((n) => /line\(s\) of the demo blog posts keep the template’s language/.test(n)),
    notes.join('\n')
  )
})

test('JA Essence’s 46 posts on a Vietnamese site: the blog costs at most ten model calls (dev g65 ran out of time rewriting them)', async (t) => {
  const { posts } = JSON.parse(
    readFileSync(
      path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'ja-essence-wp7-posts.json'),
      'utf8'
    )
  )
  const site = fakeSite()
  site.sweep = demoSweep()
  // Ids moved past the fake site's pages and menus (a post 70 would be its footer menu).
  site.sweep.posts = posts.map((/** @type {any} */ p) => ({
    ...p,
    id: p.id + 10000,
    status: 'publish',
    excerpt: ESSENCE_FIRST,
    content: essencePost
  }))
  site.sweep.terms = {}
  const model = fakeModel()
  const blogCalls = []
  const models = model.models
  const texts = new Set([ESSENCE_FIRST, ...posts.map((/** @type {any} */ p) => p.title)])
  model.models = async () => {
    const own = await models()
    return {
      ...own,
      text: {
        ...own.text,
        chat: async (/** @type {any} */ request) => {
          const input = JSON.parse(request.messages[1].content)
          const items = Array.isArray(input) ? input.map((/** @type {any} */ i) => i.text) : [input?.text]
          if (items.some((t) => texts.has(t))) blogCalls.push(items.length)
          return own.text.chat(request)
        }
      }
    }
  }
  const { times } = await run({ site, model, ctx: VI })
  assert.equal(times.postsTranslated, 46)
  t.diagnostic(`${blogCalls.length} model call(s) for the blog of 46 posts`)
  assert.ok(blogCalls.length <= 10, `${blogCalls.length} calls for the blog`)
  const left = site.sweep.posts.filter((/** @type {any} */ p) => !p.title.startsWith('[vi] '))
  assert.deepEqual(
    left.map((/** @type {any} */ p) => p.title),
    []
  )
})

// 🔒 L1 (product owner, after g65): a menu item that leads to a renamed category takes its new name. JA Essence WP's footer
// "category" navigation reads "Health", "Design", "Fashion" beside the categories it lists.
test('About given: a navigation label that names a renamed category takes its new name, under the sweep’s apply id', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.navs.push({
    id: 71,
    slug: 'footer-category',
    title: 'footer-category',
    status: 'publish',
    content:
      '<!-- wp:navigation-link {"label":"Health","type":"page","url":"/category/category-style-1/"} /-->\n' +
      '<!-- wp:navigation-link {"label":"Health","type":"category","id":5,"url":"/category/blog-health/","kind":"taxonomy"} /-->\n' +
      // A label of its own names its page, not the category: it stays.
      '<!-- wp:navigation-link {"label":"Category Style 1","type":"page","url":"/category/category-style-1/"} /-->'
  })
  site.sweep.posts = essencePosts()
  site.sweep.terms = essenceTerms()
  const model = fakeModel({ categories: (input) => ({ [input.categories[0].key]: 'Sourdough Notes' }) })
  await run({ site, model })
  const nav = site.sweep.navs.find((n) => n.id === 71)
  assert.match(nav.content, /"label":"Sourdough Notes","type":"page"/, 'the label that names the category')
  assert.match(
    nav.content,
    /"label":"Sourdough Notes","type":"category","id":5/,
    'the link to the category itself'
  )
  assert.match(nav.content, /"label":"Category Style 1"/, 'a label of its own stays')
  const write = site.sweepWrites.find((w) => w.id === 71)
  assert.ok(write?.apply_id?.startsWith('residue-'), 'recorded for undo with the sweep')
})

test('About given, two demo categories: a namer that repeats one name, then names the business, keeps the names, said; a third ask never happens', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.posts = essencePosts().map((p, i) => ({
    ...p,
    categories: [i === 0 ? 'blog-health' : 'blog-design']
  }))
  site.sweep.terms = {
    category: { 5: { name: 'Health', slug: 'blog-health' }, 6: { name: 'Design', slug: 'blog-design' } },
    post_tag: { 11: { name: 'Health', slug: 'health' } }
  }
  const model = fakeModel({
    categories: (input, n) =>
      Object.fromEntries(
        input.categories.map((c, i) => [
          c.key,
          n === 1 ? 'Fresh Bread' : `Golden Crust ${['Breads', 'Cakes'][i]}`
        ])
      )
  })
  const { notes } = await run({ site, model })
  assert.equal(model.named.length, 2)
  assert.match(JSON.stringify(model.named[1].refused), /same name/)
  assert.equal(
    site.sweepWrites.filter((w) => w.kind === 'term').length,
    0,
    'an English site keeps the demo names'
  )
  assert.ok(
    notes.some((n) => /2 blog category name\(s\) were NOT renamed.*business name/.test(n)),
    notes.join('\n')
  )
})

test('About given, an obedient second answer after a placeholder: both categories renamed, slugs and posts kept', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.posts = essencePosts().map((p, i) => ({
    ...p,
    categories: [i === 0 ? 'blog-health' : 'blog-design']
  }))
  site.sweep.terms = {
    category: { 5: { name: 'Health', slug: 'blog-health' }, 6: { name: 'Design', slug: 'blog-design' } },
    post_tag: {}
  }
  const model = fakeModel({
    categories: (input, n) =>
      Object.fromEntries(
        input.categories.map((c, i) => [c.key, n === 1 ? 'General' : ['Breads', 'Cakes'][i]])
      )
  })
  await run({ site, model })
  assert.match(JSON.stringify(model.named[1].refused), /placeholder/)
  assert.deepEqual(
    [site.sweep.terms.category[5], site.sweep.terms.category[6]],
    [
      { name: 'Breads', slug: 'blog-health' },
      { name: 'Cakes', slug: 'blog-design' }
    ]
  )
  assert.deepEqual(
    site.sweep.posts.map((p) => p.categories),
    [['blog-health'], ['blog-design']],
    'no post moves to another category'
  )
})

// 🔒 LANG-2 (measured 11/10/2026 on dev g58-ess-wp-full, JA Essence WordPress 1.0.11, Vietnamese): a badge, the "By" before an
// author and the runs a tag cuts stayed English, and so did the newsletter a theme pattern draws by its title (no id in any
// page) and the contact form's labels and button.
test('a site in one other language: the labels of a page and of every published form are translated where they stand', async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.pages.push({
    id: 126,
    slug: 'layout-1',
    title: 'Layout 1',
    status: 'publish',
    content: [
      '<!-- wp:paragraph {"className":"je-badge-static je-cat--health"} -->\n<p class="je-badge-static je-cat--health">Health</p>\n<!-- /wp:paragraph -->',
      '<!-- wp:paragraph {"className":"je-meta__author"} -->\n<p class="je-meta__author">By <strong>Faith Singleton</strong></p>\n<!-- /wp:paragraph -->',
      '<!-- wp:pattern {"slug":"wp-ja-essence/section-newsletter"} /-->'
    ].join('\n\n')
  })
  site.sweep.forms = {
    306: '<p class="je-nl__field"><label class="je-sr">Email</label>[email* your-email placeholder "Email"]</p>\n[acceptance terms] I agree with the <a href="/terms">Terms and conditions</a> and the <a href="/privacy">Privacy policy</a> [/acceptance]\n[submit "Sign up"]'
  }
  site.sweep.mails = { 306: { recipient: '[_site_admin_email]', subject: 'Newsletter' } }
  const model = fakeModel({ translate: (text) => (text === 'Faith Singleton' ? text : `vi: ${text}`) })
  await run({ site, model, ctx: { normalized: { ...context().ctx.normalized, languages: ['vi-vn'] } } })
  const page = site.sweep.pages.find((p) => p.slug === 'layout-1')
  assert.match(page.content, /<p class="je-badge-static je-cat--health">vi: Health<\/p>/)
  assert.match(page.content, /<p class="je-meta__author">vi: By <strong>Faith Singleton<\/strong><\/p>/)
  const form = site.sweep.forms[306]
  // Its sentences and placeholder are planned in the site's language like a page's; its labels and button translated.
  assert.doesNotMatch(form, /<label class="je-sr">Email<\/label>/)
  assert.match(form, /\[submit "vi: Sign up"\]/)
  assert.match(form, /<\/a> vi: and the <a/)
  assert.match(form, /\[email\* your-email /, 'the field and its name stay')
})

// 🔒 K3: the kit and system pages (typography, error, offline, login) keep the template's content; in another language they are
// translated, never said again for the business.
const typography = {
  id: 146,
  slug: 'typography',
  title: 'Typography',
  status: 'publish',
  content:
    '<!-- wp:group {"className":"je-card"} -->\n<div class="wp-block-group je-card">\n' +
    '<!-- wp:heading -->\n<h2>The quick brown fox jumps over the lazy dog</h2>\n<!-- /wp:heading -->\n' +
    '<!-- wp:paragraph -->\n<p>Each heading level shows the size and weight the theme gives it.</p>\n<!-- /wp:paragraph -->\n' +
    '</div>\n<!-- /wp:group -->'
}

/** JA Essence WordPress 1.0.10, whose contract names its typography page (`page-typography`): a kit page that is no showcase. */
const essence = contractFor(defaultContracts(), 'quickstart/ja-essence/wp7', '1.0.10')
const essenceCtx = (/** @type {any} */ more = {}) => ({
  contract: essence,
  quickstart: 'quickstart/ja-essence/wp7',
  ...more
})

test('About given, in the template’s language: a kit page keeps its words, and the model is never asked about them', async () => {
  assert.ok(essence, 'the checkout ships ja-essence/wp7 1.0.10')
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.pages.push({ ...typography })
  const model = fakeModel()
  await run({ site, model, ctx: essenceCtx() })
  const asked = model.calls.flatMap((c) => c.slots).map((s) => s.sample)
  assert.equal(asked.includes('The quick brown fox jumps over the lazy dog'), false)
  assert.equal(site.sweep.pages.find((p) => p.slug === 'typography').content, typography.content)
})

for (const [what, ctx] of [
  ['a kit page the contract names', () => essenceCtx()],
  ['a page of the showcase', () => ({})]
])
  test(`a site in one other language: ${what} is translated, never said again for the business`, async () => {
    const site = fakeSite()
    site.sweep = demoSweep()
    site.sweep.pages.push({ ...typography })
    const model = fakeModel()
    await run({
      site,
      model,
      ctx: { ...ctx(), normalized: { ...context().ctx.normalized, languages: ['vi-vn'] } }
    })
    const page = site.sweep.pages.find((p) => p.slug === 'typography').content
    assert.ok(page.includes('<h2>[vi] The quick brown fox jumps over the lazy dog</h2>'), page)
    assert.ok(page.includes('<p>[vi] Each heading level shows the size and weight the theme gives it.</p>'))
    const asked = model.calls.flatMap((c) => c.slots).map((s) => s.sample)
    assert.equal(
      asked.includes('The quick brown fox jumps over the lazy dog'),
      false,
      'not put to the planner'
    )
  })

// 🔒 Measured 11/10/2026 on dev g57-ess-wp-full (JA Essence WordPress 1.0.10, About given, Vietnamese): /detail/layout-1/ printed
// "Tiệm bánh Tamarind & Co" as its h1 and its tab, because the article heading it prints (`tracy_page_heading`) was answered
// with the bakery's name. Such an answer is asked again, and the heading keeps the template's words when that is all it gets.
test("a page heading answered with only the business's name keeps the template's heading", async () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.pageMeta = { 38: { heading: 'Abstract Wonders: Exploring Line Art Composition', excerpt: '' } }
  const model = fakeModel({
    lines: { 'Abstract Wonders: Exploring Line Art Composition': 'Golden  crust bakery' },
    repair: '{"values": {}}'
  })
  await run({ site, model })
  assert.equal(site.sweep.pageMeta[38].heading, 'Abstract Wonders: Exploring Line Art Composition')
  assert.ok(
    model.repairs.some((r) => JSON.stringify(r).includes('Abstract Wonders')),
    'it was asked again'
  )
})

// 🔒 A BUTTON'S LABEL NAMES WHERE IT LEADS (TCH #1013, measured 10/10/2026 on dev g59-ess-wp-full, JA Essence WordPress 1.0.12,
// a bakery, Vietnamese): the footer's "Become a subscriber" → /contact came back "Xem thực đơn", and "@Grazia on instagram" → `#`
// became an action label. Disobedient models below: each answers a label that names a page the button does not open.
const button = (label, href, extra = '') =>
  `<!-- wp:button${extra} -->\n<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="${href}">${label}</a></div>\n<!-- /wp:button -->`
const buttonsSite = (buttons) => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.pages.push({
    id: 60,
    slug: 'contact',
    title: 'Contact',
    status: 'publish',
    content: group('Write to us')
  })
  site.sweep.parts.header = site.sweep.parts.header.replace(
    '<!-- wp:navigation /-->',
    `<!-- wp:navigation /-->\n<!-- wp:buttons -->\n<div class="wp-block-buttons">\n${buttons.join('\n')}\n</div>\n<!-- /wp:buttons -->`
  )
  return site
}
const vi = { normalized: { ...context().ctx.normalized, languages: ['vi-vn'] } }

test('the part button judge is told the page each button opens; a label that names another page takes that page’s name', async () => {
  const site = buttonsSite([button('Subscribe', '/contact/')])
  const model = fakeModel({
    judge: '{"relabel": {"Subscribe": "Xem thực đơn", "Contact": "Liên hệ", "About us": "Giới thiệu"}}'
  })
  const { notes } = await run({ site, model, ctx: vi })
  const asked = model.judged[0]
  assert.deepEqual(asked.targets, { Subscribe: 'the "Contact" page' })
  assert.match(asked.system, /"targets" gives the page each of them opens/)
  assert.ok(asked.labels.includes('Contact'), 'the page it opens is named in the site language too')
  assert.ok(site.sweep.parts.header.includes('href="/contact/">Liên hệ</a>'), site.sweep.parts.header)
  assert.ok(
    notes.some((n) =>
      /named a page they do not open and take that page's name instead \(Subscribe\)/.test(n)
    ),
    notes.join(' | ')
  )
})

test('a part button the judge labels for the page it opens keeps the judge’s label', async () => {
  const site = buttonsSite([button('Subscribe', '/contact/')])
  const model = fakeModel({ judge: '{"relabel": {"Subscribe": "Liên hệ đặt bánh", "Contact": "Liên hệ"}}' })
  await run({ site, model, ctx: vi })
  assert.ok(site.sweep.parts.header.includes('>Liên hệ đặt bánh</a>'))
})

test('the line pass is told where a long button leads; an answer naming another page takes the page’s name', async () => {
  const site = buttonsSite([button('Become a subscriber', '/contact/')])
  const model = fakeModel({
    judge: '{"relabel": {"Contact": "Liên hệ"}}',
    lines: { 'Become a subscriber': 'Xem thực đơn' }
  })
  const { notes } = await run({ site, model, ctx: vi })
  const slot = model.calls.flatMap((c) => c.slots).find((s) => s.sample === 'Become a subscriber')
  assert.match(String(slot?.label), /button that opens the "Contact" page; its label names where it leads/)
  assert.ok(site.sweep.parts.header.includes('href="/contact/">Liên hệ</a>'), site.sweep.parts.header)
  assert.ok(notes.some((n) => /button label\(s\) of the pages named a page they do not open/.test(n)))
})

/** A customer who gave a name only (BLANK): the demo, renamed. */
const blankVi = {
  brief: { about: '', goal: 'contact', style: 'friendly' },
  normalized: { ...context().ctx.normalized, about: '', languages: ['vi-vn'] }
}

test('a social button is translated only, never rewritten (K6); on BLANK a button to `#` is too; in English they stay as the demo has them', async () => {
  const buttons = [button('@Grazia on instagram', '#'), button('Book a Consultation', '#')]
  const site = buttonsSite(buttons)
  const model = fakeModel({ lines: { 'Book a Consultation': 'Đặt bánh sinh nhật ngay' } })
  await run({ site, model, ctx: blankVi })
  const planned = model.calls.flatMap((c) => c.slots.map((s) => s.sample))
  for (const label of ['@Grazia on instagram', 'Book a Consultation'])
    assert.equal(planned.includes(label), false, `${label} is no line to rewrite`)
  const header = site.sweep.parts.header
  for (const label of ['@Grazia on instagram', 'Book a Consultation'])
    assert.ok(header.includes(`href="#">[vi] ${label}</a>`), `${label}: ${header}`)

  const en = buttonsSite(buttons)
  const enModel = fakeModel({ lines: { 'Book a Consultation': 'Order a birthday cake' } })
  await run({
    site: en,
    model: enModel,
    ctx: { brief: blankVi.brief, normalized: { ...blankVi.normalized, languages: ['en'] } }
  })
  assert.deepEqual(
    enModel.calls
      .flatMap((c) => c.slots.map((s) => s.sample))
      .filter((sample) => sample === '@Grazia on instagram' || sample === 'Book a Consultation'),
    []
  )
  assert.equal(JSON.stringify(en.sweep.parts.header ?? '').includes('Order a birthday cake'), false)
})

// 🔒 ON FULL A HEADER OR FOOTER BUTTON TO NOWHERE LEADS TO THE CONTACT PAGE UNDER THE TEMPLATE'S CONTACT LABEL (PAGE-5, decision of
// 11/10/2026, as the seeder does for the content slots, f7f57d8ad): no contract slot holds a part, so the cleanup moves it. A
// disobedient judge and line model below answer a bakery action for it; the contact label wins. Social and decor stay (K6).
test('FULL: a part button to `#` leads to the Contact page under the template’s contact label, in the site language', async () => {
  // (A tracy-business header group of three or more unreached lines is the demo company's and goes: two buttons a group here.)
  const site = buttonsSite([button('@Grazia on instagram', '#'), button('Book a Consultation', '#')])
  const model = fakeModel({
    judge: '{"relabel": {"Book a Consultation": "Đặt bánh sinh nhật ngay", "Contact": "Liên hệ"}}',
    lines: { 'Book a Consultation': 'Đặt bánh sinh nhật ngay' }
  })
  const { notes } = await run({ site, model, ctx: vi })
  const header = site.sweep.parts.header
  assert.equal(header.includes('Book a Consultation'), false, header)
  assert.equal(header.includes('Đặt bánh'), false, 'the action the model wrote is not the label')
  assert.ok(header.includes('href="/contact/">Liên hệ</a>'), header)
  assert.ok(header.includes('href="#">[vi] @Grazia on instagram</a>'), 'social stays, translated (K6)')
  assert.ok(
    notes.some((n) => /or to nowhere lead to the Contact page/.test(n)),
    notes.join(' | ')
  )

  // The template's own contact label (a button that already leads to Contact) wins over the page's title; decor stays.
  const told = buttonsSite([button('Get in touch', '/contact/'), button('Book now', '#')])
  await run({
    site: told,
    model: fakeModel({
      judge: '{"relabel": {"Book now": "Đặt bánh", "Contact": "Liên hệ"}}'
    }),
    ctx: vi
  })
  const toldHeader = told.sweep.parts.header
  assert.ok(toldHeader.includes('href="/contact/">[vi] Get in touch</a>'), toldHeader)
  assert.equal(toldHeader.includes('Book now'), false, toldHeader)
  const decor = buttonsSite([button('→', '#')])
  await run({ site: decor, model: fakeModel(), ctx: vi })
  assert.ok(decor.sweep.parts.header.includes('href="#">→</a>'), 'decor stays')

  // In the template's language: the template's own contact label, as it is.
  const en = buttonsSite([button('Get in touch', '/contact/'), button('Book now', '#')])
  await run({ site: en, model: fakeModel({ judge: '{"relabel": {"Book now": "Order a cake"}}' }) })
  assert.ok(en.sweep.parts.header.includes('href="/contact/">Get in touch</a>'), en.sweep.parts.header)
  assert.equal(/Book now|Order a cake/.test(en.sweep.parts.header), false, en.sweep.parts.header)

  // No Contact page: the label stays the demo's, translated, and it is said.
  const none = buttonsSite([button('Book a Consultation', '#')])
  none.sweep.pages = none.sweep.pages.filter((p) => p.slug !== 'contact')
  const noneRun = await run({ site: none, model: fakeModel(), ctx: vi })
  assert.ok(
    none.sweep.parts.header.includes('href="#">[vi] Book a Consultation</a>'),
    none.sweep.parts.header
  )
  assert.ok(
    noneRun.notes.some((n) => /no Contact page/.test(n)),
    noneRun.notes.join(' | ')
  )
})

test('a short part button to `#` is not put to the judge: on BLANK it keeps the demo label, translated', async () => {
  const site = buttonsSite([button('Donate', '#')])
  const model = fakeModel({ judge: '{"relabel": {"Donate": "Đặt bánh ngay"}}' })
  await run({ site, model, ctx: blankVi })
  assert.equal(model.judged[0].labels.includes('Donate'), false)
  assert.ok(site.sweep.parts.header.includes('href="#">[vi] Donate</a>'), site.sweep.parts.header)
})

test('a button to a document of the demo company leads to the Contact page and says contact, in the site language (DEMO FILE LINKS)', async () => {
  const pdf = button('Download our company profile', '/wp-content/uploads/2023/06/profile.pdf')
  const site = buttonsSite([pdf])
  const model = fakeModel({ judge: '{"relabel": {"Contact": "Liên hệ"}}' })
  await run({ site, model, ctx: vi })
  const planned = model.calls.flatMap((c) => c.slots.map((s) => s.sample))
  assert.equal(planned.includes('Download our company profile'), false, 'not rewritten into another offer')
  assert.ok(site.sweep.parts.header.includes('href="/contact/">Liên hệ</a>'), site.sweep.parts.header)
  assert.equal(site.sweep.parts.header.includes('.pdf'), false)

  const en = buttonsSite([pdf])
  await run({ site: en, model: fakeModel() })
  assert.ok(en.sweep.parts.header.includes('href="/contact/">Contact</a>'), en.sweep.parts.header)
})

// 🔒 THE WORDS THE BLOCKS CARRY AS ATTRIBUTES ("Read more", "By ", "Search the site") ARE THE PLUGIN'S TO DRAW AND TRACY'S TO
// TRANSLATE (LANG-2, measured 10/10/2026 on dev g59-ess-wp-full: "Read more" on nine pages of a Vietnamese site).
test('a site in another language has its block words translated through the plugin door, the ones WordPress lacks only', async () => {
  const site = fakeSite()
  const { notes } = await run({ site, ctx: vi })
  assert.ok(site.calls.includes('content.contract:blockWords.read'))
  const set = site.blockWordsSet
  assert.ok(set, notes.join(' | '))
  assert.equal(set.locale, 'vi')
  assert.match(set.apply_id, /^words-/)
  assert.deepEqual(set.words, { 'By ': '[vi] By ', 'Search the site': '[vi] Search the site' })
})

test('an older plugin that cannot list the block words is said, and the build goes on', async () => {
  const site = fakeSite()
  site.blockWords = false
  const { notes, report } = await run({ site, ctx: vi })
  assert.ok(report)
  assert.ok(notes.some((n) => /blocks carry \(Read more, By, Search\) keep the template's language/.test(n)))
})

test('a site in English asks nothing of the block word door', async () => {
  const site = fakeSite()
  await run({ site })
  assert.equal(
    site.calls.some((c) => c.includes('blockWords')),
    false
  )
})

// 🔒 THE AUTHORS' JOB AND BIO ARE SAID IN THE SITE LANGUAGE ON FULL, NEVER REWRITTEN; BLANK KEEPS THEM (LANG-2, TCH #1013,
// `author-words.js`). Measured 10/10/2026 on dev g60-ess-wp-full: "Collaborator & Editor" and the English bio on 17 pages, user
// meta no contract slot reaches. The plugin (0.18.9) lists and writes them as kind `usermeta`, through the real Apply door here.
test('FULL vi: the authors’ user meta is translated and written as kind usermeta; BLANK writes none', async () => {
  const withAuthors = () => {
    const site = fakeSite()
    const own = site.apply
    site.authorWrites = []
    site.apply = async (call) => {
      if (call.action === 'content.list' && call.params?.kind === 'usermeta')
        return {
          ok: true,
          items: [
            {
              id: 2,
              name: 'Alfonso Cortez',
              meta: { description: 'A short bio.', job_title: 'Collaborator & Editor' }
            }
          ]
        }
      if (call.action === 'content.update' && call.params?.kind === 'usermeta') {
        site.authorWrites.push(call.params)
        return { ok: true }
      }
      return own(call)
    }
    return site
  }
  const full = withAuthors()
  await run({ site: full, ctx: vi })
  assert.deepEqual(
    full.authorWrites.map((w) => [w.id, w.key, w.fields.value]),
    [
      [2, 'description', '[vi] A short bio.'],
      [2, 'job_title', '[vi] Collaborator & Editor']
    ]
  )
  const blank = withAuthors()
  await run({ site: blank, ctx: blankVi })
  assert.deepEqual(blank.authorWrites, [])
})

// ── The restaurant's own posts on a site a Website Opportunities build made (tasks/plan-wo-content-writer.md) ──────────
const WO_ITEMS = [
  { id: 'fb:1', title: 'Jazz on Thursday', body: 'Live music & dinner.\nFrom 7pm.\n\nBook a table.' },
  { id: 'fb:2', title: 'New spring menu', body: 'Fresh herbs from our garden.' }
]
/** Four demo posts: by date the news page shows 102, 103, 101 — and 104 first, as it is sticky. */
const woPosts = () =>
  [
    [101, '2023-01-01 10:00:00'],
    [102, '2023-03-01 10:00:00'],
    [103, '2023-02-01 10:00:00'],
    [104, '2022-12-01 10:00:00']
  ].map(([id, created]) => ({
    id,
    slug: `demo-${id}`,
    title: `Demo ${id}`,
    status: 'publish',
    created,
    excerpt: `Demo excerpt ${id}`,
    content: `<!-- wp:paragraph -->\n<p>Demo ${id}</p>\n<!-- /wp:paragraph -->`
  }))
const woSite = () => {
  const site = fakeSite()
  site.sweep = demoSweep()
  site.sweep.posts = woPosts()
  site.sweep.options = { page_for_posts: 51, sticky_posts: [104] }
  return site
}
/** The build's reader and recorder as `opportunities-build/site-content.js` answers them, kept in memory. */
const woBuild = ({ blogId = 'news', writes = {} } = {}) => {
  const before = {}
  const receipts = { ...writes }
  return {
    before,
    receipts,
    woContent: {
      forSite: async () => ({
        buildId: 'build-9',
        items: WO_ITEMS,
        pagePlan: {
          pages: [
            { id: 'home', path: '/', role: 'home', keep: true, why: 'the home page' },
            {
              id: blogId,
              path: `/${blogId}`,
              role: 'blog',
              keep: true,
              fill: 'sourced',
              items: ['fb:1', 'fb:2']
            }
          ]
        },
        before: {},
        writes
      }),
      recordBefore: async (_id, key, fields) => (before[key] ??= fields),
      recordWrite: async (_id, key, receipt) => {
        receipts[key] = receipt
      }
    }
  }
}
const postWrites = (site) =>
  site.sweepWrites.filter((w) => w.kind === 'post' && site.sweep.posts.some((p) => p.id === w.id))

// ja-restaurant wp7 1.0.1 (22/10/2026): an opportunity's build with no logo given showed the demo's picture on every page.
// Its header asks for the name as text where `site_logo` is empty (`inc/brand-logo.php`), so the build empties it.
const logoHeader =
  '<!-- wp:site-logo {"className":"jr-logo jr-logo--light"} /-->\n<!-- wp:site-logo {"className":"jr-logo jr-logo--dark"} /-->'
for (const by of ['opportunity', 'customer'])
  test(`${by === 'opportunity' ? 'an' : 'a'} ${by}'s build with no logo given ${by === 'opportunity' ? 'shows the name as text' : "keeps the template's logo"}`, async () => {
    const site = woSite()
    site.sweep.parts.header = logoHeader
    site.sweep.options.site_logo = 137
    await run({ site, woContent: by === 'opportunity' ? woBuild().woContent : null })
    const logoWrites = site.sweepWrites.filter((w) => w.kind === 'option' && w.key === 'site_logo')
    if (by === 'customer') return assert.deepEqual(logoWrites, [])
    assert.equal(logoWrites.length, 1)
    assert.deepEqual(logoWrites[0].fields, { value: '0' })
    assert.match(String(logoWrites[0].apply_id), /^wo-logo-/)
  })

// ja-restaurant wp7 1.0.1 (22/10/2026): Typography (`explore/j-pages/category-blog`) stayed in an opportunity's menu: its slug
// alone reads as a blog page, and the contract does not list it. Its path says it is the kit's sample page.
for (const by of ['opportunity', 'customer'])
  test(`${by === 'opportunity' ? "an opportunity's" : "a customer's"} build ${by === 'opportunity' ? 'hides' : 'keeps'} a sample page known by its path only`, async () => {
    const site = woSite()
    site.sweep.pages.push({
      id: 900,
      slug: 'category-blog',
      title: 'Typography',
      status: 'publish',
      url: 'http://site.test/explore/j-pages/category-blog/',
      content: '<!-- wp:paragraph -->\n<p>Typography</p>\n<!-- /wp:paragraph -->'
    })
    await run({ site, woContent: by === 'opportunity' ? woBuild().woContent : null })
    assert.equal(
      site.sweep.pages.find((p) => p.id === 900).status,
      by === 'opportunity' ? 'draft' : 'publish'
    )
  })

// JA Diner (22/10/2026): a release with no slot-role map gives an opportunity's build no pins. Its sweep still marked the
// sections without recording them, so the hand-off kept its old prompt, and filled the dish items with neutral names though
// the brief named dishes. A map with no dishes role (Tracy Business) asked for no dish at all.
const menuDishItem = (n) =>
  `<!-- wp:group {"metadata":{"name":"menu.item.${n}"}} -->\n<div class="wp-block-group">` +
  `<!-- wp:heading {"level":4,"metadata":{"name":"menu.dish-name.${n}"}} -->\n<h4 class="wp-block-heading">Demo dish ${n}</h4>\n<!-- /wp:heading -->\n` +
  `<!-- wp:paragraph {"metadata":{"name":"menu.dish-price.${n}"}} -->\n<p>$1${n}</p>\n<!-- /wp:paragraph -->` +
  '</div>\n<!-- /wp:group -->'
/** A site with a menu page of two demo dish items, and a build whose brief names one dish and that records its sections. */
const dinerBuild = () => {
  const site = woSite()
  site.sweep.pages.push({
    id: 901,
    slug: 'menu',
    title: 'Menu',
    status: 'publish',
    url: 'http://site.test/menu/',
    content: `<!-- wp:group {"metadata":{"name":"menu.root"}} -->\n<div class="wp-block-group">${menuDishItem(1)}${menuDishItem(2)}</div>\n<!-- /wp:group -->`
  })
  const build = woBuild()
  const recorded = []
  build.woContent.recordSections = async (id, sections) => {
    recorded.push([id, sections])
  }
  // As `pinnedCopy` answers: no more dishes than asked for.
  build.woContent.copyFor = async (/** @type {any} */ who) => ({
    buildId: 'build-9',
    pinned: {
      dishes: [{ value: { name: 'Pho bo', description: 'Beef noodle soup.' }, source: 'fb:7' }].slice(
        0,
        who.dishes
      )
    },
    before: {},
    writes: {}
  })
  return { site, woContent: build.woContent, recorded }
}
const filledMenu = (site, recorded) => {
  const menu = site.sweep.pages.find((p) => p.id === 901).content
  assert.equal(recorded.length, 1, 'the sections are recorded')
  assert.equal(recorded[0][0], 'build-9')
  assert.deepEqual(recorded[0][1].menu, ['menu'])
  assert.ok(menu.includes('tracy-sec-menu'), menu)
  assert.ok(menu.includes('Pho bo'), `the brief's dish: ${menu}`)
  assert.ok(menu.includes('Menu item'), menu)
  assert.ok(!/Chef(&#039;|')s selection|Coming soon/.test(menu), menu)
  assert.ok(!/Demo dish|\$1\d/.test(menu), menu)
}

test("an opportunity's build of a release whose map has no dishes role fills the dish items with the brief's", async () => {
  const { site, woContent, recorded } = dinerBuild()
  await run({ site, woContent })
  filledMenu(site, recorded)
})

test("an opportunity's build of a release with no slot-role map reads the brief's dishes", async () => {
  const vega = contractFor(defaultContracts(), 'quickstart/ja-vega/wp7', '1.1.4')
  const { woContent } = dinerBuild()
  const { ctx } = context({ contract: vega, quickstart: 'quickstart/ja-vega/wp7' })
  const engine = createWordpressEngine({
    woContent,
    models: fakeModel().models,
    applyFor: () => async () => ({ ok: true })
  })
  const prepared = await engine.prepare(ctx)
  assert.equal(prepared.copyPins, null, 'no map, no pins')
  assert.equal(prepared.wo?.buildId, 'build-9')
  assert.deepEqual(
    prepared.woDishes.map((d) => d.name),
    ['Pho bo']
  )
})

test("an opportunity's build with no pins records its sections and fills the dishes with the brief's", async () => {
  const { site, woContent, recorded } = dinerBuild()
  const { ctx } = context()
  const engine = createWordpressEngine({
    woContent,
    models: fakeModel().models,
    applyFor: () => throughDoor(site.apply)
  })
  const prepared = await engine.prepare(ctx)
  // What a release with no slot-role map prepares: the build read, no pins.
  await engine.apply(ctx, { ...prepared, copyPins: null })
  filledMenu(site, recorded)
})

test('a site no opportunity built: no demo post is written', async () => {
  const site = woSite()
  await run({ site })
  assert.deepEqual(postWrites(site), [])
})

test('an opportunity build: its posts take the news page’s first demo posts in page order, slugs kept, the rest drafted', async () => {
  const site = woSite()
  const build = woBuild()
  const { times } = await run({ site, woContent: build.woContent })
  const post = (id) => site.sweep.posts.find((p) => p.id === id)
  assert.equal(post(104).title, 'Jazz on Thursday', 'the sticky post is the first one the page shows')
  assert.equal(post(102).title, 'New spring menu', 'then the newest')
  assert.equal(
    post(104).content,
    '<!-- wp:paragraph -->\n<p>Live music &amp; dinner.<br>From 7pm.</p>\n<!-- /wp:paragraph -->\n\n' +
      '<!-- wp:paragraph -->\n<p>Book a table.</p>\n<!-- /wp:paragraph -->'
  )
  assert.equal(post(104).excerpt, 'Live music & dinner. From 7pm. Book a table.')
  assert.equal(post(104).slug, 'demo-104')
  assert.ok(
    postWrites(site).every((w) => !('post_name' in w.fields)),
    'a slug is never written'
  )
  assert.deepEqual(
    [101, 102, 103, 104].map((id) => post(id).status),
    ['draft', 'publish', 'draft', 'publish']
  )
  assert.deepEqual(build.before['post:104'], {
    post_title: 'Demo 104',
    post_excerpt: 'Demo excerpt 104',
    post_content: '<!-- wp:paragraph -->\n<p>Demo 104</p>\n<!-- /wp:paragraph -->',
    post_status: 'publish'
  })
  assert.deepEqual(
    Object.fromEntries(Object.entries(build.receipts).map(([k, r]) => [k, [r.state, r.itemId ?? null]])),
    {
      'post:104': ['written', 'fb:1'],
      'post:102': ['written', 'fb:2'],
      'post:103': ['hidden', null],
      'post:101': ['hidden', null]
    }
  )
  const ids = new Set(postWrites(site).map((w) => w.apply_id))
  assert.equal(ids.size, 4, 'one apply id per post')
  assert.ok([...ids].every((id) => /^wo-content-[0-9a-f]{24}$/.test(id)))
  assert.equal(times.woPostsWritten, 2)
  assert.equal(times.woPostsHidden, 2)
})

test('a post that does not read back as written: nothing is drafted, and it is said', async () => {
  const site = woSite()
  site.sweep.unkept = [102]
  const build = woBuild()
  const { notes } = await run({ site, woContent: build.woContent })
  assert.equal(build.receipts['post:104'].state, 'written')
  assert.equal(build.receipts['post:102'].state, 'failed')
  assert.ok(build.receipts['post:102'].reason)
  assert.deepEqual(
    site.sweep.posts.map((p) => p.status),
    ['publish', 'publish', 'publish', 'publish']
  )
  assert.ok(
    notes.some((n) => /restaurant's posts/.test(n)),
    notes.join(' | ')
  )
})

test('a retry: a post already written with the same item is not written again', async () => {
  const site = woSite()
  const build = woBuild({ writes: { 'post:104': { itemId: 'fb:1', state: 'written' } } })
  await run({ site, woContent: build.woContent })
  assert.ok(!postWrites(site).some((w) => w.id === 104), 'post 104 is left as written')
  assert.equal(site.sweep.posts.find((p) => p.id === 102).title, 'New spring menu')
  assert.equal(site.sweep.posts.find((p) => p.id === 103).status, 'draft')
})

test('the plan’s blog page is neither the posts page nor a page of the site: nothing is written, and it is said', async () => {
  const site = woSite()
  const build = woBuild({ blogId: 'journal' })
  const { notes } = await run({ site, woContent: build.woContent })
  assert.deepEqual(postWrites(site), [])
  assert.deepEqual(build.receipts, {})
  assert.ok(
    notes.some((n) => /blog page "journal".*left to the agent/.test(n)),
    notes.join(' | ')
  )
})

// Website Opportunities, sourced page words (tasks/plan-wo-contract-writer.md): written like an answer, never planned.
const copyStore = (pinned) => {
  const store = {
    receipts: /** @type {Record<string, any>} */ ({}),
    asked: /** @type {any[]} */ ([]),
    forSite: async () => null,
    copyFor: async (who) => {
      store.asked.push(who)
      return { buildId: 'wo-b3', pinned, before: {}, writes: {} }
    },
    recordBefore: async (_b, _k, fields) => fields,
    recordWrite: async (_b, key, receipt) => {
      store.receipts[key] = receipt
    }
  }
  return store
}

test("an opportunity's sourced words go into the one contract write, and the model is never asked for those slots", async () => {
  const store = copyStore({
    'hero.title': { value: 'The Moss Station', source: 'business.name' },
    'hero.lead': { value: 'A Highland kitchen & wine bar in Hoi An.', source: 'profile.bio' },
    'hero.cta': { value: { label: 'Call', href: 'tel:+842355550188' }, source: 'business.phone' },
    'about.story': {
      value: { title: 'Our story', text: 'We opened in Sapa in 2015.' },
      source: 'post:facebook:1'
    },
    cards: [{ value: { title: 'Bun cha', text: 'Grilled pork with noodles.' }, source: 'post:instagram:1' }],
    contact: {}
  })
  const model = fakeModel()
  const { site, notes } = await run({ model, woContent: store })
  const changes = site.applied.changes
  assert.equal(changes['home.hero.heading'], 'The Moss Station')
  assert.equal(changes['home.hero.intro'], 'A Highland kitchen & wine bar in Hoi An.')
  assert.deepEqual(
    [changes['about.text.heading'], changes['about.text.intro']],
    ['Our story', 'We opened in Sapa in 2015.']
  )
  assert.deepEqual(
    [changes['home.services.item.1.title'], changes['home.services.item.1.text']],
    ['Bun cha', 'Grilled pork with noodles.']
  )
  assert.match(changes['home.services.item.2.title'], /^Crust /, 'a card with no dish is still the planner’s')
  const asked = new Set(model.calls.flatMap((c) => (c.slots ?? []).map((s) => s.key)))
  for (const key of [
    'home.hero.heading',
    'home.hero.intro',
    'about.text.heading',
    'home.services.item.1.title'
  ])
    assert.equal(asked.has(key), false, key)
  // The About page's second and third "text" blocks are other sections: still the planner's.
  assert.ok(asked.has('about.text2.heading'))
  assert.deepEqual(store.receipts['slot:home.hero.heading'], {
    state: 'written',
    role: 'hero.title',
    source: 'business.name'
  })
  assert.equal(store.asked[0].lang, 'en')
  // tracy-business/wp7 1.3.2 has no link slot beside the hero's first button: nothing to pin it into, and it is said.
  assert.ok(notes.some((n) => /did not fit this release/.test(n)))
  assert.equal('slot:home.hero.cta.1' in store.receipts, false)
})

// JA Restaurant (WO pilot, 22/10/2026): what the build has nothing true for is hidden, and no model is asked to write it.
test("an opportunity's JA Restaurant build: dish items, prices and demo facts take placeholders, never planned; sample pages neither", async () => {
  const restaurant = contractFor(defaultContracts(), 'quickstart/ja-restaurant/wp7', '1.0.1')
  assert.ok(restaurant, 'the checkout ships ja-restaurant/wp7 1.0.1')
  const store = copyStore({
    'hero.title': { value: 'The Moss Station', source: 'business.name' },
    dishes: [
      { value: { name: 'Cao lau', description: 'Hoi An noodles with pork.' }, source: 'post:facebook:1' }
    ],
    contact: {}
  })
  const model = fakeModel()
  const { ctx, times } = context({ contract: restaurant, quickstart: 'quickstart/ja-restaurant/wp7' })
  const engine = createWordpressEngine({
    models: model.models,
    woContent: store,
    applyFor: () => {
      throw new Error('prepare touches no site')
    }
  })
  const prepared = await engine.prepare(ctx)
  assert.equal(store.asked[0].dishes, 11, 'as many dishes as the longest menu of the template has items')
  // The pages never planned go with the unticked ones: the Explore menu links the colour copies of the home page.
  for (const slug of ['blue-color', 'purple-color', 'login', 'your-profile'])
    assert.ok(prepared.skipPages.includes(slug), slug)
  assert.ok(!prepared.skipPages.includes('menu'))
  // 🔒 Replace, never remove (product owner, 22/10/2026): the restaurant's dish first, every other item kept under the neutral
  // name, its description and price empty (the sweep empties them: the door writes no empty value; plan §7, no filler).
  const menuWrites = Object.fromEntries(
    prepared.inputWrites.filter((w) => w.slot.startsWith('homepage.menu.')).map((w) => [w.slot, w.value])
  )
  assert.equal(menuWrites['homepage.menu.dish-name.1'], 'Cao lau')
  assert.equal(menuWrites['homepage.menu.dish-description.1'], 'Hoi An noodles with pork.')
  assert.equal(menuWrites['homepage.menu.dish-price.1'], '')
  assert.equal(menuWrites['homepage.menu.dish-name.2'], 'Menu item')
  assert.equal(menuWrites['homepage.menu.dish-description.2'], '')
  assert.equal(menuWrites['homepage.menu.dish-price.6'], '')
  const asked = new Set(model.calls.flatMap((c) => (c.slots ?? []).map((s) => s.key)))
  for (const key of [
    'homepage.menu.dish-price.1',
    'homepage.menu.dish-name.2',
    'homepage.menu.dish-description.2',
    'homepage.menu.dish-price.6',
    'homepage.menu.dish-name.7',
    'homepage.home-news.testimonial-text.1',
    'homepage.features-intro.title.3'
  ])
    assert.equal(asked.has(key), false, key)
  assert.equal(
    [...asked].some((k) => /^(blue|green|pink|purple)-color\.|^login\.|^your-profile\./.test(k)),
    false,
    'no sample page is planned'
  )
  assert.ok(asked.has('homepage.hero.hero-intro'), 'a line with no source is still the planner’s')
  assert.ok(times.woSampleSlotsSkipped >= 320, `colour pages alone hold 320: ${times.woSampleSlotsSkipped}`)
  assert.equal(times.woPlaceholderSlots, prepared.copyPins.placeholders.length)
  assert.deepEqual(prepared.hides, [], 'nothing is hidden')
  assert.deepEqual(prepared.copyPins.dishes, [
    { name: 'Cao lau', description: 'Hoi An noodles with pork.', price: '' }
  ])
})

test("an opportunity's JA Restaurant build in one other language skips the sample pages too", async () => {
  const restaurant = contractFor(defaultContracts(), 'quickstart/ja-restaurant/wp7', '1.0.1')
  const store = copyStore({
    'hero.title': { value: 'The Moss Station', source: 'business.name' },
    contact: {}
  })
  const model = fakeModel()
  const { ctx, times } = context({ contract: restaurant, quickstart: 'quickstart/ja-restaurant/wp7' })
  ctx.normalized = { ...ctx.normalized, languages: ['vi'] }
  const engine = createWordpressEngine({ models: model.models, woContent: store, applyFor: () => null })
  const prepared = await engine.prepare(ctx)
  assert.ok(prepared.writtenIn, 'the site is written in one language other than English')
  const asked = new Set(model.calls.flatMap((c) => (c.slots ?? []).map((s) => s.key)))
  assert.equal(
    [...asked].some((k) => /^(blue|green|pink|purple)-color\.|^login\./.test(k)),
    false
  )
  assert.ok(times.woSampleSlotsSkipped >= 320)
  assert.ok(prepared.skipPages.includes('pink-color'))
})

test('what the words cost is recorded when prepare fails after its planner, and when apply throws, never added twice', async () => {
  const meter = { calls: 4, promptTokens: 1000, completionTokens: 200, reasoningTokens: 0, stages: {} }
  const failing = context({
    time: (/** @type {string} */ name, /** @type {number} */ value) => {
      if (name === 'planMs') throw new Error('the row could not be written')
      failing.times[name] = value
    }
  })
  const engine = createWordpressEngine({
    models: fakeModel({ meter }).models,
    applyFor: () => async () => {
      throw new Error('the site is gone')
    }
  })
  await assert.rejects(engine.prepare(failing.ctx), /could not be written/)
  assert.equal(failing.times.textCalls, 4, 'the planner ran: its calls are on the row')
  assert.equal(failing.times.textIn, 1000)
  // A prepare that ends, then an apply that throws: the totals of the one model, written over, not summed.
  const { ctx, times } = context()
  const prepared = await engine.prepare(ctx)
  meter.calls = 6
  meter.promptTokens = 1500
  await assert.rejects(engine.apply(ctx, prepared))
  assert.equal(times.textCalls, 6)
  assert.equal(times.textIn, 1500)
})

test('an apply that asks its own model, prepare having none, records what that model spent', async () => {
  const { ctx, times } = context()
  const meter = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, stages: {} }
  let asked = 0
  // No text model while prepare runs; one by the time apply asks (a key set in between).
  const models = async () => {
    asked += 1
    if (asked === 1) return { text: null, image: null }
    meter.calls = 3
    meter.promptTokens = 900
    return { text: { ...(await fakeModel().models()).text, usage: () => meter }, image: null }
  }
  const engine = createWordpressEngine({ models, applyFor: () => throughDoor(fakeSite().apply) })
  const prepared = await engine.prepare(ctx)
  assert.equal(prepared.textModel, null)
  await engine.apply(ctx, { ...prepared, rewrites: true }).catch(() => {})
  assert.ok(asked >= 2, 'apply asked for a model of its own')
  assert.equal(times.textCalls, 3)
  assert.equal(times.textIn, 900)
})

for (const [trade, label] of [
  ['bakery', 'Order a cake'],
  ['dental clinic', 'Book an appointment']
])
  test(`${trade}: a declared action label wins after both WordPress writer passes`, async () => {
    const key = 'home.hero.cta.1'
    const plan = {
      slots: [{ key, decision: 'value', value: label, valueType: 'text', reason: 'button-action' }]
    }
    const { prepared, site } = await run({
      model: fakeModel({ say: () => 'Contact' }),
      woContent: { sitePlanFor: async () => plan }
    })
    assert.equal(prepared.changes[key], label)
    assert.equal(site.applied.changes[key], label)
  })
