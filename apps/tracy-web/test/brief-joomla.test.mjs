/**
 * The Joomla engine of "Apply", run over the REAL `tracy-business/j6` (two editions) and `tracy-base/j6`
 * (one) contracts, the seeder's real planner and door calls, a model double and a site double that holds
 * the contract's revision the way the Claude Cowork plugin does: a write at a stale revision, or naming a
 * slot the site does not carry, is refused.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import sharp from 'sharp'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { ownExcerpt, writeSteps } from '../src/sites/brief-engines/joomla-tidy.js'
import { MAX_PICTURES } from '../src/sites/brief-engines/pictures.js'
import { normalizeBrief } from '../src/sites/brief-normalize.js'
import { throughDoor } from './_apply-door.mjs'
import { preparePicturesBeforeApply } from '../src/sites/picture-preparation.js'
import { createQuickstartFirstEngine } from '../src/sites/brief-engines/quickstart-first.js'

const business = contractFor(defaultContracts(), 'tracy-business/j6', '1.2.0')
const base = contractFor(defaultContracts(), 'tracy-base/j6', '1.0.1')
assert.ok(business && base, 'the checkout ships both Joomla profiles')
const mapOf = (contract) => JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))

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

/**
 * A model that rewrites text slots, leaves links and evidence slots alone, and can misbehave on request. `say(slot)` answers a
 * planner slot itself when it gives a string (what a real model wrote on a real site).
 */
function fakeModel({
  down = false,
  invent = null,
  phone = null,
  translationsDown = false,
  meter = {},
  repair = null,
  judge = '{"relabel": {}}',
  say = /** @type {((slot: any) => string | null) | null} */ (null)
} = {}) {
  const calls = []
  const repairs = []
  const judged = []
  /** Every heading split into styled pieces that was asked as one phrase (`keep-words.js`). */
  const pieces = []
  return {
    calls,
    repairs,
    judged,
    pieces,
    models: async () => ({
      text: {
        usage: () => meter,
        chat: async ({ messages }) => {
          const input = JSON.parse(messages[1].content)
          // Which menu entries of the template's own company stay.
          if (messages[0].content.startsWith('You are tidying')) {
            judged.push(input)
            return typeof judge === 'function' ? judge(input, judged.length) : judge
          }
          // The seeder's button translator (`template-buttons.mjs`): each label, translated.
          if (messages[0].content.startsWith('Translate the labels'))
            return JSON.stringify({
              values: Object.fromEntries(input.labels.map((/** @type {any} */ l) => [l.key, `vi ${l.label}`]))
            })
          // A phrase split into styled pieces, translated as one: each piece answered in its place.
          if (messages[0].content.startsWith('You translate one phrase')) {
            pieces.push(input)
            if (down || translationsDown) throw new Error('translation model down')
            return JSON.stringify({ pieces: input.pieces.map((/** @type {string} */ p) => `vi ${p.trim()}`) })
          }
          // The second asking, for the lines the first pass left to the template.
          if (messages[0].content.startsWith('You finish the words')) {
            repairs.push(input)
            if (repair === 'throw') throw new Error('model gone')
            return typeof repair === 'function' ? repair(input) : (repair ?? '{"values": {}}')
          }
          calls.push(input)
          if (down) throw new Error('model down')
          // A translation turn: an array of {i, text, limit} in, the same array translated out.
          if (Array.isArray(input)) {
            if (translationsDown) throw new Error('translation model down')
            return JSON.stringify(
              input.map(({ i, text, limit }) => ({ i, text: `vi ${text}`.slice(0, limit) }))
            )
          }
          const body = { values: {}, pending: [], invented: [] }
          for (const s of input.slots) {
            const own = say?.(s)
            if (typeof own === 'string') body.values[s.key] = own
            else if (s.requiresEvidence) body.pending.push(s.key)
            else if (s.type === 'text')
              body.values[s.key] = s.sample.trim()
                ? `Golden ${withoutFacts(s.sample)}`.slice(0, s.maxCharacters)
                : ''
            else body.values[s.key] = s.sample
          }
          const text = input.slots.filter((s) => s.type === 'text' && !s.requiresEvidence && s.sample.trim())
          if (invent && text[0]) {
            body.values[text[0].key] = 'Our team of twelve'
            body.invented.push(text[0].key)
          }
          if (phone && text[1]) body.values[text[1].key] = 'Call +84 24 1111 2222'
          return JSON.stringify(body)
        }
      }
    })
  }
}

/** A bound Joomla site. It keeps its revision and remembers what it was asked. */
function fakeSite(
  contract,
  { retireRounds = 3, edited = {}, trim = { ok: true, status: 'completed', moved: 7 } } = {}
) {
  const map = mapOf(contract)
  const slots = map.slots.map((s) => ({ ...s, current: edited[s.key] ?? s.sample }))
  const keys = new Set(slots.map((s) => s.key))
  const languageOf = new Map(map.entities.map((e) => [e.key, e.identity?.language]))
  /** What the last contract write that named a slot left in it: its new value, or nothing for a link taken off. */
  const written = (/** @type {string} */ key) => {
    const last = site.applies.findLast((a) => key in (a.changes ?? {}) || (a.empty_links ?? []).includes(key))
    if (!last) return undefined
    return key in (last.changes ?? {}) ? last.changes[key] : ''
  }
  const site = {
    revision: 'rev-1',
    calls: [],
    applied: null,
    /** Every contract write the site took, in order (`applied` is the last). */
    applies: /** @type {any[]} */ ([]),
    /** The keys of every contract write the site was asked for, refused or taken. */
    attempts: /** @type {string[][]} */ ([]),
    /** What a person writes into slots after the first reading: every later reading holds it. */
    later: /** @type {Record<string, string>} */ ({}),
    inspected: 0,
    retire: [],
    /** Every `siteLanguage.set` the site was asked for; `noSiteLanguage`: a component older than that door. */
    siteLanguage: /** @type {any[]} */ ([]),
    noSiteLanguage: false,
    /** Every `sourceLanguage.*` call; `noWrittenSource`: a component that knows only the same-language relabel; `refuseWritten`: why a set is refused. */
    sourceLanguage: /** @type {any[]} */ ([]),
    noWrittenSource: false,
    refuseWritten: /** @type {string | null} */ (null),
    /** The headings the source shows, as `sourceLanguage.plan` with `written` names them. */
    headings: [
      { key: 'module-436.title', source: 'Services', maxCharacters: 100 },
      { key: 'module-437.title', source: 'Company', maxCharacters: 100 },
      { key: 'module-438.title', source: 'Contact', maxCharacters: 100 }
    ],
    uploads: [],
    languages: [],
    writing: false,
    /** Every module the site lists: the template's own and the copies a derived edition makes. */
    moduleRows: (() => {
      const rows = []
      const seen = new Set()
      for (const slot of map.slots) {
        const m = /^module-(\d+)$/.exec(String(slot.entity))
        if (!m || seen.has(slot.entity)) continue
        seen.add(slot.entity)
        const base = String(slot.label ?? '')
          .split(' / ')[0]
          .replace(/ \([a-z-]+\)$/i, '')
        for (const [lang, tag, offset] of [
          ['en', 'en-GB', 0],
          ['vi', 'vi-VN', 10000],
          ['ru', 'ru-RU', 20000]
        ])
          rows.push({ id: Number(m[1]) + offset, title: `${base} (${lang})`, language: tag, published: 1 })
      }
      return rows
    })(),
    hiddenModules: [],
    moduleLists: [],
    /** The site's menu entries and contact records, as `content.list` answers them. */
    menuRows: /** @type {any[]} */ ([]),
    contactRows: /** @type {any[]} */ ([]),
    /** The site's articles and categories, as `content.list` answers them whole. */
    articleRows: /** @type {any[]} */ ([]),
    categoryRows: /** @type {any[]} */ ([]),
    /** Every write to either, in order, and the batches that carried them. */
    recordWrites: /** @type {any[]} */ ([]),
    batches: /** @type {any[]} */ ([]),
    /** An older component has no `content.batch`. */
    noBatch: false,
    /** The content languages the site lists (`language`), each with the prefix it routes on; null: the door will not list them. */
    languageRows: /** @type {any[] | null} */ ([
      { lang_id: 1, lang_code: 'en-GB', sef: 'en', published: 1 },
      { lang_id: 2, lang_code: 'ru-RU', sef: 'ru', published: 1 }
    ]),
    /** The language filter plugin's row (`languageFilter`); every write to it, in order. */
    filterRow: /** @type {any} */ ({
      id: 9,
      enabled: 1,
      params: JSON.stringify({ detect_browser: '0', automatic_change: '1', remove_default_prefix: '0' })
    }),
    filterWrites: /** @type {any[]} */ ([]),
    /** The site's redirects (`redirect`, com_redirect's table): a path one of them answers is not a dead end. */
    redirectRows: /** @type {any[]} */ ([]),
    /** What a menu entry's whole row (`content.get`) says beyond its listing, by id; and the entries that cannot be read. */
    menuWhole: /** @type {Map<number, Record<string, unknown>>} */ (new Map()),
    unreadable: /** @type {Set<number>} */ (new Set()),
    /** The menu entries the site will not change: a transaction that names one is refused whole. */
    refuseMenu: /** @type {Set<number>} */ (new Set()),
    /** The extensions the site lists and the parameters each holds (`extensionParams`). */
    extensions: /** @type {any[]} */ ([]),
    extensionWrites: /** @type {any[]} */ ([]),
    refuse: new Set(),
    /** The link slots whose layout the plugin reviewed (0.24.4): inspect marks them `emptyLink`, and only they may be emptied. */
    emptiable: /** @type {Map<string, 'hidden' | 'plain'>} */ (new Map()),
    refuseModule: () => false,
    /** The component takes ONE write at a time: a second one while the first is in flight is refused, as the real one does. */
    apply: async (call) => {
      const writes =
        call.action === 'media.upload' ||
        call.action === 'content.update' ||
        call.action === 'content.batch' ||
        (call.action === 'content.contract' &&
          [
            'demoTrim.apply',
            'apply',
            'multilingual.retire',
            'siteLanguage.set',
            'sourceLanguage.set',
            'multilingual.package',
            'multilingual.apply'
          ].includes(call.params?.operation))
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
      site.calls.push(params?.operation ?? action)
      if (action === 'media.upload') {
        site.uploads.push(params)
        return { ok: true }
      }
      if (action === 'content.list' && params.kind === 'module') {
        site.moduleLists.push(params.search)
        return { ok: true, items: site.moduleRows.filter((r) => r.title.includes(params.search)) }
      }
      if (action === 'content.update' && params.kind === 'module') {
        if (site.refuseModule(params.id)) return { ok: false, message: 'the site would not take it' }
        site.hiddenModules.push(params.id)
        return { ok: true }
      }
      if (params.kind === 'extensionParams') {
        if (action === 'content.list')
          return {
            ok: true,
            items: site.extensions.map(({ params: _p, ...row }) => ({ ...row, id: row.extension_id }))
          }
        const row = site.extensions.find((e) => e.extension_id === params.id)
        if (action === 'content.get')
          return row ? { ok: true, item: { ...row } } : { ok: false, error: 'not_found' }
        if (action === 'content.update' && row) {
          site.extensionWrites.push(params)
          row.params = params.fields.params
          return { ok: true }
        }
      }
      if (action === 'content.list' && params.kind === 'language')
        return site.languageRows
          ? {
              ok: true,
              items: site.languageRows.slice(params.offset ?? 0, (params.offset ?? 0) + params.limit)
            }
          : { ok: false, error: 'read_failed', message: 'the languages could not be read' }
      if (params.kind === 'languageFilter') {
        if (action === 'content.list')
          return { ok: true, items: site.filterRow ? [{ ...site.filterRow }] : [] }
        if (action === 'content.update' && params.id === site.filterRow?.id) {
          site.filterWrites.push(params)
          Object.assign(site.filterRow, params.fields)
          return { ok: true }
        }
        return { ok: false, error: 'not_found' }
      }
      if (action === 'content.list' && params.kind === 'redirect')
        return {
          ok: true,
          items: site.redirectRows.slice(params.offset ?? 0, (params.offset ?? 0) + params.limit)
        }
      if (action === 'content.list' && (params.kind === 'article' || params.kind === 'category')) {
        const rows = params.kind === 'article' ? site.articleRows : site.categoryRows
        return { ok: true, items: rows.slice(params.offset ?? 0, (params.offset ?? 0) + params.limit) }
      }
      if (action === 'content.list' && (params.kind === 'menuItem' || params.kind === 'contact')) {
        const rows = params.kind === 'menuItem' ? site.menuRows : site.contactRows
        // A listing is the row's summary: a menu entry's `params` (where an alias leads) is in its full row only, which a
        // listing carries when it is asked for bodies (`include_body`, 25 rows a page at most, as the plugin's ceiling).
        const page = rows.slice(
          params.offset ?? 0,
          (params.offset ?? 0) + Math.min(params.limit, params.include_body ? 25 : 200)
        )
        return {
          ok: true,
          items: params.include_body
            ? page.map((row) => ({ ...row }))
            : page.map(({ params: _p, ...row }) => row)
        }
      }
      if (action === 'content.get' && params.kind === 'menuItem') {
        const row = site.menuRows.find((r) => r.id === params.id)
        if (!row || site.unreadable.has(row.id)) return { ok: false, error: 'not_found' }
        return { ok: true, item: { ...row, ...site.menuWhole.get(row.id) } }
      }
      const record = (/** @type {{ kind: string, id: number, fields: Record<string, unknown> }} */ step) => {
        const rows =
          step.kind === 'menuItem'
            ? site.menuRows
            : step.kind === 'article'
              ? site.articleRows
              : site.contactRows
        const row = rows.find((r) => r.id === step.id)
        if (!row) return false
        Object.assign(row, step.fields)
        site.recordWrites.push({
          kind: step.kind,
          id: step.id,
          fields: step.fields,
          applyId: params.apply_id
        })
        return true
      }
      const refused = (/** @type {{ kind: string, id: number }} */ step) =>
        step.kind === 'menuItem' && site.refuseMenu.has(step.id)
      if (action === 'content.get' && params.kind === 'article') {
        const row = site.articleRows.find((r) => r.id === params.id)
        return row ? { ok: true, item: { ...row } } : { ok: false, error: 'not_found' }
      }
      if (action === 'content.update' && params.kind === 'article')
        return record({ kind: 'article', id: params.id, fields: params.fields })
          ? { ok: true }
          : { ok: false, message: 'no such record' }
      if (action === 'content.update' && (params.kind === 'menuItem' || params.kind === 'contact'))
        return !refused(params) && record({ kind: params.kind, id: params.id, fields: params.fields })
          ? { ok: true }
          : { ok: false, message: 'no such record' }
      if (action === 'content.batch') {
        if (site.noBatch) return { ok: false, error: `unknown action: ${action}` }
        if (params.operations.some(refused))
          return { ok: false, error: 'batch_failed', message: 'the site would not take one of them' }
        site.batches.push(params)
        for (const step of params.operations) record(step)
        return { ok: true }
      }
      if (action !== 'content.contract') return { ok: false, error: `unknown action: ${action}` }
      switch (params.operation) {
        case 'demoTrim.apply':
          if (trim.ok) site.revision = 'rev-2'
          return trim
        case 'inspect': {
          site.inspected += 1
          // The first reading is the site as the template shipped it; a later one holds what was written since, and what a
          // person wrote in between.
          const held =
            site.inspected === 1
              ? slots
              : slots.map((s) => ({
                  ...s,
                  current: site.later[s.key] ?? written(s.key) ?? s.current
                }))
          return {
            ok: true,
            contract: contract.id,
            revision: site.revision,
            slots: held.map((s) =>
              site.emptiable.has(s.key) ? { ...s, emptyLink: site.emptiable.get(s.key) } : s
            ),
            pages: map.pages ?? [],
            job: null
          }
        }
        case 'apply': {
          const changed = Object.keys(params.changes ?? {})
          const emptied = params.empty_links ?? []
          site.attempts.push([...changed, ...emptied])
          if (params.expected_revision !== site.revision)
            return {
              ok: false,
              error: 'stale_revision',
              message: `the site is at ${site.revision}, not ${params.expected_revision}`
            }
          if (changed.length + emptied.length === 0)
            return { ok: false, error: 'CHANGES_INVALID', message: 'Expected 1–1500 scalar content changes' }
          for (const key of [...changed, ...emptied])
            if (!keys.has(key)) return { ok: false, message: `unknown slot ${key}` }
          // As the 0.24.4 component words it: a link whose layout nobody reviewed cannot be emptied.
          const notEmptiable = emptied.filter((key) => !site.emptiable.has(key))
          if (notEmptiable.length > 0)
            return {
              ok: false,
              error: 'SLOT_LINK_NOT_EMPTIABLE',
              message: notEmptiable
                .map(
                  (key) =>
                    `This link cannot be taken off: its layout is not known to draw nothing without it: ${key}`
                )
                .join('; ')
            }
          const refused = [...changed, ...emptied].filter((key) => site.refuse.has(key))
          if (refused.length > 0)
            return {
              ok: false,
              message: refused.map((key) => `Content cannot activate an empty slot: ${key}`).join('; ')
            }
          site.applied = params
          site.applies.push(params)
          site.revision = 'rev-3'
          return { ok: true, afterRevision: 'rev-3' }
        }
        case 'multilingual.plan': {
          // The words the site holds NOW: the template's, with what every contract apply wrote, the last one last.
          const now = (slot) => written(slot.key) ?? slot.current
          return {
            ok: true,
            revision: site.revision,
            contract: contract.id,
            locale: params.locale,
            creates: { menuItem: 3 },
            // The plugin hands over the SOURCE edition's strings: the other editions' are not what a new language is made of.
            slots: slots
              .filter(
                (s) => s.type === 'text' && [undefined, '*', 'en-GB'].includes(languageOf.get(s.entity))
              )
              .map((s) => ({ key: s.key, type: 'text', source: now(s), maxCharacters: s.maxCharacters }))
          }
        }
        case 'multilingual.package':
          site.languages.push({ step: 'package', locale: params.locale })
          return { ok: true, alreadyPresent: false, version: '5.4.1.1' }
        case 'multilingual.apply': {
          site.languages.push({
            step: 'apply',
            locale: params.locale,
            translations: params.translations,
            expectedRevision: params.expected_revision
          })
          const round = site.languages.filter((l) => l.step === 'apply').length
          return round < 2
            ? { ok: true, phase: 'rows', cursor: round, created: 10, status: 'working' }
            : { ok: true, phase: 'menus', cursor: round, created: 20, status: 'completed' }
        }
        case 'multilingual.verify':
          site.languages.push({ step: 'verify', locale: params.locale })
          return { ok: true }
        case 'siteLanguage.set':
          site.siteLanguage.push(params)
          if (site.noSiteLanguage)
            return { ok: false, error: 'unsupported', message: 'Unknown contract operation siteLanguage.set' }
          return { ok: true, status: 'completed', locale: params.locale, packVersion: '6.0.1.1' }
        case 'sourceLanguage.plan':
        case 'sourceLanguage.set':
          site.sourceLanguage.push(params)
          if (site.noWrittenSource)
            return {
              ok: false,
              error: 'bad_params',
              message: `${params.locale} is not a variant of en-GB; another language is added with multilingual.* or set with siteLanguage.*`
            }
          if (params.operation === 'sourceLanguage.plan')
            return {
              ok: true,
              published: 'en-GB',
              current: 'en-GB',
              locale: params.locale,
              written: true,
              titles: site.headings
            }
          if (site.refuseWritten) return { ok: false, error: 'conflict', message: site.refuseWritten }
          return { ok: true, status: 'completed', source: params.locale, written: true, swapped: true }
        case 'multilingual.retire':
          site.retire.push(params)
          return site.retire.length >= retireRounds
            ? { ok: true, status: 'completed', hidden: { language: 40 } }
            : { ok: true, status: 'working', hidden: { language: 10 } }
        default:
          return { ok: false, error: `Unknown contract operation ${params.operation}` }
      }
    }
  }
  return site
}

function context(contract, release, overrides = {}) {
  const times = {}
  const notes = []
  return {
    times,
    notes,
    ctx: {
      siteKey: 'jm-test',
      label: 'golden-crust',
      platform: 'joomla',
      quickstart: release,
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
  return {
    door: { url: 'https://pictures.test/v1/chat/completions', key: 'k', imageModel: 'picture-model' },
    fetchImpl: async () =>
      new Response(
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
      ),
    siteFile: () => async () => demo
  }
}

/** Supply whole fallback records from the sealed release, without changing the double's ordinary listings. */
function supplyBlankRows(site, contract, blanks) {
  if (!blanks?.length) return
  const lock = JSON.parse(readFileSync(path.join(contract.dir, 'presentation-lock.json'), 'utf8'))
  const rows = new Map()
  for (const slot of blanks) {
    const row = rows.get(slot.entity) ?? structuredClone(lock.entities[slot.entity])
    if (!row) continue
    row.id = Number(slot.entity.split('-')[1])
    // The SQL lock escapes nested JSON once more than a live Joomla row does.
    if (slot.nestedJson && typeof row[slot.column] === 'string') {
      const params = JSON.parse(row[slot.column])
      if (typeof params[slot.nestedJson] === 'string') {
        try {
          JSON.parse(params[slot.nestedJson])
        } catch {
          params[slot.nestedJson] = JSON.stringify(JSON.parse(params[slot.nestedJson].replace(/\\"/g, '"')))
        }
      }
      row[slot.column] = JSON.stringify(params)
    }
    rows.set(slot.entity, row)
  }
  const answer = site.answer
  site.answer = (call) => {
    const key = `${call.params?.kind}-${call.params?.id}`
    if (call.action === 'content.get' && rows.has(key)) return { ok: true, item: rows.get(key) }
    if (call.action === 'content.list' && call.params.kind === 'module' && !call.params.search) {
      const modules = site.moduleRows.map((row) => ({ ...row, ...rows.get(`module-${row.id}`) }))
      return {
        ok: true,
        items: modules.slice(call.params.offset ?? 0, (call.params.offset ?? 0) + call.params.limit)
      }
    }
    return answer(call)
  }
}

const run = async ({
  contract = business,
  release = 'tracy-business/j6',
  model = fakeModel(),
  site = fakeSite(contract),
  ctx: overrides,
  pictures = null,
  woContent = null,
  siteReader = null
} = {}) => {
  const { ctx, times, notes } = context(contract, release, overrides)
  const engine = createJoomlaEngine({
    models: pictures ? async () => ({ ...(await model.models()), image: pictures.door }) : model.models,
    applyFor: () => throughDoor(site.apply),
    woContent,
    siteReader,
    ...(pictures ? { siteFile: pictures.siteFile, fetchImpl: pictures.fetchImpl } : {})
  })
  const prepared = await engine.prepare(ctx)
  supplyBlankRows(site, contract, prepared.demoBlanks)
  const report = await engine.apply(ctx, prepared)
  return { prepared, report, site, model, times, notes, ctx }
}

test('a two-edition template: the words are planned before the site exists and written through one revision', async () => {
  const { prepared, report, site, model, times } = await run()
  const changes = site.applied.changes
  assert.ok(
    Object.keys(changes).length > 100,
    `a good part of the page text is written, got ${Object.keys(changes).length}`
  )
  assert.ok(
    Object.keys(changes).every((k) => !k.includes('::')),
    'no translated copy is written by a seed'
  )
  assert.equal(site.applied.expected_revision, 'rev-2', 'the revision the demo trim left, not the first one')
  assert.equal(report.wrote, Object.keys(changes).length)
  assert.ok(
    // The planner's batches; the second ask of the article titles carries lines, not slots.
    model.calls.length >= 2 && model.calls.every((c) => !c.slots || c.slots.length <= 35),
    `${model.calls.length} calls`
  )
  // The reads that pin the demo's article order come first (`pinArticleOrder`); the first writes are the trim, then the words.
  assert.deepEqual(site.calls.filter((c) => c !== 'content.list').slice(0, 3), [
    'demoTrim.apply',
    'inspect',
    'apply'
  ])
  assert.equal(
    site.calls.filter((c) => c === 'inspect').length,
    1,
    'the write is handed the reading already made'
  )
  for (const phase of ['planMs', 'trimMs', 'inspectMs', 'writeMs', 'retireMs'])
    assert.ok(phase in times, phase)
  assert.ok(prepared.planned > 0)
})

// L32 (05/10/2026, benchjoomlaapply01): the identity module took "hello@goldencrust.example · 12 Hang Bac, Hanoi" as its address
// and nothing as its email, so the top bar's `mailto:{contact.email}` link went out as `mailto:` with no text. The hours were
// dropped the same way. The brief is the one the bench site was made from, read by Apply's own normaliser, so the engine is
// handed exactly what an Apply hands it: the facts read apart, and the line they were joined into.
test('the site identity takes the email, the hours and the profiles the customer gave; the address holds only the address', async () => {
  const about =
    'Golden Crust Bakery, a family bakery at 12 Hang Bac, Hanoi. Fresh bread, croissants and cakes baked every morning. ' +
    'Call 0912 345 678 or email hello@goldencrust.example. Open 6am-8pm every day. instagram.com/goldencrust'
  const brief = { about, goal: 'contact', style: 'friendly' }
  const read = {
    name: 'Golden Crust Bakery',
    sector: 'family bakery',
    languages: ['en'],
    writtenIn: 'en',
    phone: '0912 345 678',
    email: 'hello@goldencrust.example',
    address: '12 Hang Bac, Hanoi',
    hours: 'Open 6am-8pm every day',
    pictures: []
  }
  const normalized = await normalizeBrief({
    brief,
    label: 'golden-crust',
    model: { chat: async () => JSON.stringify(read) }
  })
  assert.equal(normalized.contact, '0912 345 678 · hello@goldencrust.example · 12 Hang Bac, Hanoi')
  const { site } = await run({ ctx: { brief, normalized } })
  const written = Object.assign({}, ...site.applies.map((a) => a.changes))
  assert.equal(written['module-4369.4'], 'hello@goldencrust.example')
  assert.equal(written['module-4369.5'], '0912 345 678')
  assert.equal(written['module-4369.6'], '12 Hang Bac, Hanoi')
  assert.equal(written['module-4369.7'], 'Open 6am-8pm every day')
  assert.equal(written['module-4369.9'], 'https://instagram.com/goldencrust')
})

test('only the source edition stays in the switcher, hidden in rounds under ONE receipt', async () => {
  const { site } = await run()
  assert.equal(site.retire.length, 3)
  assert.ok(
    site.retire.every(
      (p) => p.operation === 'multilingual.retire' && p.keep.length === 1 && p.keep[0] === 'en-GB'
    )
  )
  assert.equal(new Set(site.retire.map((p) => p.apply_id)).size, 1, 'one apply id for the whole pass')
})

test('one language on a two-edition template (O2): the source edition is written in it, nothing is derived, every other edition is hidden', async () => {
  const model = fakeModel()
  const { site, prepared, notes } = await run({
    model,
    ctx: { normalized: { ...context(business, 'x').ctx.normalized, languages: ['de-de'] } }
  })
  assert.equal(prepared.written, 'de-DE')
  assert.deepEqual(prepared.keep, ['en-GB'])
  assert.deepEqual(prepared.derive, [], 'no German edition is made under a prefix')
  const languages = new Set(model.calls.flatMap((c) => (c.slots ?? []).map((s) => s.language)))
  assert.deepEqual([...languages], ['de-DE'], 'every slot planned is the source edition, told it is German')
  assert.ok(site.retire.length > 0 && site.retire.every((p) => p.keep.length === 1 && p.keep[0] === 'en-GB'))
  assert.ok(!site.calls.includes('multilingual.package'), 'nothing is derived')
  assert.ok(!notes.some((n) => /could not be added|one language/.test(n)), notes.join(' | '))
})

test('one language on a two-edition template is the language the site declares: the source is called by it and its headings are written in it (#1013)', async () => {
  const { site, prepared, notes } = await run({
    ctx: { normalized: { ...context(business, 'x').ctx.normalized, languages: ['vi-vn'] } }
  })
  const sets = site.sourceLanguage.filter((p) => p.operation === 'sourceLanguage.set')
  assert.equal(sets.length, 1, `asked ${JSON.stringify(site.sourceLanguage)}; notes: ${notes.join(' | ')}`)
  const [set] = sets
  assert.equal(set.locale, 'vi-VN')
  assert.equal(set.written, true)
  assert.match(set.apply_id, /^srclang-/)
  assert.equal(typeof set.request_id, 'string')
  assert.deepEqual(set.titles, {
    'module-436.title': 'vi Services',
    'module-437.title': 'vi Company',
    'module-438.title': 'vi Contact'
  })
  // The headings were translated while the site installed: the plan the site hands over finds every one answered.
  assert.equal(prepared.headings.get('vi-VN:100:Services'), 'vi Services')
  // After the words and after every other edition is hidden: the tag the source takes must be one no visitor still reaches.
  assert.ok(site.calls.lastIndexOf('sourceLanguage.set') > site.calls.lastIndexOf('multilingual.retire'))
  assert.ok(site.calls.indexOf('sourceLanguage.set') > site.calls.indexOf('apply'))
  assert.equal(
    site.siteLanguage.length,
    0,
    'a two-edition site is not given a default by the one-edition door'
  )
})

test('several languages, or English alone, leave the source edition its own tag', async () => {
  const english = await run()
  assert.equal(english.site.sourceLanguage.length, 0)
  const two = await run({
    ctx: { normalized: { ...context(business, 'x').ctx.normalized, languages: ['en', 'vi-vn'] } }
  })
  assert.equal(two.site.sourceLanguage.length, 0)
})

/** What the language filter holds now, as an object. */
const filterOf = (site) => JSON.parse(site.filterRow.params)

test('one language a visitor reads: the addresses lose the /en/ prefix, last, every other filter setting kept (D8)', async () => {
  const { site } = await run()
  assert.equal(site.filterWrites.length, 1)
  const [write] = site.filterWrites
  assert.equal(write.kind, 'languageFilter')
  assert.match(write.apply_id, /^prefix-/)
  assert.deepEqual(filterOf(site), { detect_browser: '0', automatic_change: '1', remove_default_prefix: 1 })
  // After the languages are hidden and the tidy-up wrote the menu: no language job is left to write the filter back.
  assert.equal(site.calls.at(-1), 'content.update')
  assert.ok(site.calls.lastIndexOf('content.update') > site.calls.lastIndexOf('multilingual.retire'))
})

test('one language other than the source: the prefix goes after the source is called by it (D8)', async () => {
  const { site } = await run({
    ctx: { normalized: { ...context(business, 'x').ctx.normalized, languages: ['vi-vn'] } }
  })
  assert.equal(filterOf(site).remove_default_prefix, 1)
  assert.ok(site.calls.lastIndexOf('content.update') > site.calls.lastIndexOf('sourceLanguage.set'))
})

test('a one-edition template drops the prefix too; two languages keep it (D8)', async () => {
  const one = await run({ contract: base, release: 'tracy-base/j6' })
  assert.equal(filterOf(one.site).remove_default_prefix, 1)
  const two = await run({
    ctx: { normalized: { ...context(business, 'x').ctx.normalized, languages: ['en', 'vi-vn'] } }
  })
  assert.equal(two.site.filterWrites.length, 0, 'a visitor still picks a language by its prefix')
})

test('a filter that is off, or already drops the prefix, is not written; one that cannot be read is said (D8)', async () => {
  const off = fakeSite(business)
  off.filterRow.enabled = 0
  assert.equal((await run({ site: off })).site.filterWrites.length, 0)
  const done = fakeSite(business)
  done.filterRow.params = JSON.stringify({ remove_default_prefix: '1' })
  assert.equal((await run({ site: done })).site.filterWrites.length, 0)
  const broken = fakeSite(business)
  broken.filterRow.params = '{not json'
  const { notes } = await run({ site: broken })
  assert.ok(
    notes.some((n) => /language prefix/.test(n)),
    notes.join(' | ')
  )
})

test('a component that cannot call the source by another language, or refuses to, is said and keeps the words', async () => {
  const older = fakeSite(business)
  older.noWrittenSource = true
  const { notes, site } = await run({
    site: older,
    ctx: { normalized: { ...context(business, 'x').ctx.normalized, languages: ['vi-vn'] } }
  })
  assert.ok(Object.keys(site.applied.changes).length > 100)
  assert.ok(!site.calls.includes('sourceLanguage.set'))
  assert.ok(
    notes.some((n) => /vi-VN/.test(n) && /en-GB/.test(n)),
    notes.join(' | ')
  )
  const governed = fakeSite(business)
  governed.refuseWritten =
    'The contract governs this site’s own ru-RU edition (module-456); its source cannot take that tag.'
  const refused = await run({
    site: governed,
    ctx: { normalized: { ...context(business, 'x').ctx.normalized, languages: ['ru-ru'] } }
  })
  assert.ok(
    refused.notes.some((n) => /ru-RU/.test(n) && /governs/.test(n)),
    refused.notes.join(' | ')
  )
})

test('one language the template ships as an edition (ru-RU) is still written into the source edition', async () => {
  const model = fakeModel()
  const { prepared } = await run({
    model,
    ctx: { normalized: { ...context(business, 'x').ctx.normalized, languages: ['ru-ru'] } }
  })
  assert.equal(prepared.written, 'ru-RU')
  assert.deepEqual(prepared.keep, ['en-GB'])
  const languages = new Set(model.calls.flatMap((c) => (c.slots ?? []).map((s) => s.language)))
  assert.deepEqual([...languages], ['ru-RU'])
})

test('what the words cost is recorded for the report: calls and tokens', async () => {
  const { times } = await run({
    model: fakeModel({ meter: { calls: 12, promptTokens: 52_000, completionTokens: 9_000 } })
  })
  assert.equal(times.modelCalls, 12)
  assert.equal(times.modelTokens, 61_000)
})

test('prepare touches no site at all', async () => {
  const site = fakeSite(business)
  const { ctx } = context(business, 'tracy-business/j6')
  const engine = createJoomlaEngine({ models: fakeModel().models, applyFor: () => throughDoor(site.apply) })
  await engine.prepare(ctx)
  assert.deepEqual(site.calls, [])
})

test('a template that ships one language is written in it and has nothing to hide', async () => {
  const { site, notes } = await run({
    contract: base,
    release: 'tracy-base/j6',
    ctx: { normalized: { ...context(base, 'x').ctx.normalized, languages: ['en', 'de'] } }
  })
  assert.equal(site.retire.length, 0)
  assert.ok(
    notes.some((n) => /one language/.test(n)),
    notes.join(' | ')
  )
  assert.ok(Object.keys(site.applied.changes).length > 50)
})

test('a one-edition template written in another language makes that language the site default: its pack, <html lang> (#1013)', async () => {
  const { site, notes } = await run({
    contract: base,
    release: 'tracy-base/j6',
    ctx: { normalized: { ...context(base, 'x').ctx.normalized, languages: ['vi-vn'] } }
  })
  assert.equal(
    site.siteLanguage.length,
    1,
    `asked ${JSON.stringify(site.siteLanguage)}; notes: ${notes.join(' | ')}`
  )
  assert.equal(site.siteLanguage[0].locale, 'vi-VN')
  assert.match(site.siteLanguage[0].apply_id, /^slang-/)
  assert.equal(typeof site.siteLanguage[0].request_id, 'string')
  // After the words: the default is switched once they are in, and nothing is hidden on a one-edition site.
  assert.ok(site.calls.indexOf('siteLanguage.set') > site.calls.indexOf('apply'))
  assert.equal(site.retire.length, 0)
})

test('a one-edition template left in English asks for no language switch; a component without the door is said', async () => {
  const english = await run({ contract: base, release: 'tracy-base/j6' })
  assert.equal(english.site.siteLanguage.length, 0)
  const site = fakeSite(base)
  site.noSiteLanguage = true
  const { notes } = await run({
    contract: base,
    release: 'tracy-base/j6',
    site,
    ctx: { normalized: { ...context(base, 'x').ctx.normalized, languages: ['vi-vn'] } }
  })
  assert.ok(
    notes.some((n) => /vi-VN/.test(n) && /default/.test(n)),
    notes.join(' | ')
  )
})

test('what the model says it made up, and what states a fact nobody gave, is not written', async () => {
  const { site, notes } = await run({ model: fakeModel({ invent: true, phone: true }) })
  const values = Object.values(site.applied.changes)
  assert.ok(!values.includes('Our team of twelve'), 'an invention the model owned up to')
  assert.ok(!values.some((v) => /\+84 24 1111 2222/.test(v)), 'a phone number the customer never gave')
  assert.ok(
    notes.some((n) => /facts you did not give/.test(n)),
    notes.join(' | ')
  )
})

test('a slot a person changed on the site since the template shipped is left with their words', async () => {
  const map = mapOf(business)
  const target = map.slots.find(
    (s) => s.type === 'text' && !s.requiresEvidence && s.sample.trim().length > 20
  )
  const first = await run()
  const written = Object.keys(first.site.applied.changes)
  const key = written.find((k) => map.slots.find((s) => s.key === k)?.type === 'text')
  assert.ok(key && target)
  const second = await run({ site: fakeSite(business, { edited: { [key]: 'Words a person typed' } }) })
  assert.ok(!(key in second.site.applied.changes), `${key} keeps the person's words`)
})

test('a model that is down still lets the site keep its own words and says so', async () => {
  const { notes, report } = await run({ model: fakeModel({ down: true }) })
  assert.ok(
    notes.some((n) => /did not answer/.test(n)),
    notes.join(' | ')
  )
  assert.ok(report.kept >= 0)
})

test('a site bound to another contract is refused before anything is written', async () => {
  const site = fakeSite(base)
  const { ctx } = context(business, 'tracy-business/j6')
  const engine = createJoomlaEngine({ models: fakeModel().models, applyFor: () => throughDoor(site.apply) })
  const prepared = await engine.prepare(ctx)
  await assert.rejects(engine.apply(ctx, prepared), /another content contract/)
  assert.equal(site.applied, null)
})

test('a site whose component carries no profile for the template says so in words a person can act on', async () => {
  const site = fakeSite(business)
  const apply = site.apply
  site.apply = async (call) =>
    call.params?.operation === 'inspect'
      ? {
          ok: false,
          message: 'No content contract is configured for this site; name one with the contract parameter'
        }
      : apply(call)
  const { ctx } = context(business, 'tracy-business/j6')
  const engine = createJoomlaEngine({ models: fakeModel().models, applyFor: () => throughDoor(site.apply) })
  const prepared = await engine.prepare(ctx)
  await assert.rejects(engine.apply(ctx, prepared), /not bound to its template.s content contract/)
  assert.equal(site.applied, null)
})

test('a site whose component cannot hide demo rows is written anyway, and the report says so', async () => {
  const { site, notes } = await run({
    site: fakeSite(business, { trim: { ok: false, message: 'Unknown contract operation demoTrim.apply' } })
  })
  assert.ok(site.applied, 'the words were still written')
  assert.equal(site.applied.expected_revision, 'rev-1')
  assert.ok(
    notes.some((n) => /demo posts stay visible/.test(n)),
    notes.join(' | ')
  )
})

test('a release nothing seals keeps its words, and prepare says so', async () => {
  const { ctx } = context(business, 'x', { contract: null })
  await assert.rejects(
    createJoomlaEngine({
      models: fakeModel().models,
      applyFor: () => throughDoor(fakeSite(business).apply)
    }).prepare(ctx),
    /not sealed/
  )
})

test('pictures: the hero and the first sections of the home page are replaced; a logo or a partner never is', async () => {
  const pictures = await withPictures()
  const { prepared, site, times } = await run({ pictures })
  // `tracy-business/j6` shows ten demo photographs across its pages; the most there is room for are drawn, the home page's first.
  assert.equal(prepared.pictures.length, MAX_PICTURES)
  assert.equal(site.uploads.length, MAX_PICTURES, 'one upload per demo picture')
  for (const u of site.uploads) assert.match(u.path, /^images\/tracy-content\/[0-9a-f]{64}\.jpg$/)
  const map = mapOf(business)
  const replaced = Object.entries(site.applied.changes)
    .filter(([, v]) => v.startsWith('images/tracy-content/'))
    .map(([k]) => map.slots.find((s) => s.key === k))
  assert.ok(replaced.length >= 2 && replaced.every((s) => s.type === 'image'))
  assert.ok(
    replaced.every((s) => !/logo|map|avatar/i.test(s.label)),
    replaced.map((s) => s.label).join(' | ')
  )
  assert.ok(
    replaced.some((s) => /Hero/.test(s.label)),
    'the hero is one of them'
  )
  assert.ok(
    replaced.every((s) => !/\(ru\)/.test(s.label)),
    'only the source edition'
  )
  assert.ok('picturesMs' in times)
  // The pictures went up while the demo rows were being hidden, before the one contract apply.
  assert.ok(site.calls.indexOf('apply') > site.calls.lastIndexOf('media.upload'))
})

test('pictures: without a picture model the template keeps its own, said; a refusal costs that picture only', async () => {
  const bare = await run()
  assert.equal(bare.site.uploads.length, 0)
  assert.ok(
    bare.notes.some((n) => /no picture model/.test(n)),
    bare.notes.join(' | ')
  )
  const pictures = await withPictures()
  const site = fakeSite(business)
  const apply = site.apply
  site.apply = async (call) =>
    call.action === 'media.upload' ? { ok: false, code: 'MEDIA_REFUSED' } : apply(call)
  const refused = await run({ pictures, site })
  assert.ok(Object.keys(refused.site.applied.changes).length > 100, 'the words were written')
  assert.ok(!Object.values(refused.site.applied.changes).some((v) => /tracy-content/.test(v)))
  assert.ok(
    refused.notes.some((n) => /MEDIA_REFUSED/.test(n)),
    refused.notes.join(' | ')
  )
})

test('a language the template does not ship is translated before the site exists, and added from those translations once it is up', async () => {
  const model = fakeModel()
  const site = fakeSite(business, { retireRounds: 2 })
  const { ctx, notes, times } = context(business, 'tracy-business/j6', {
    normalized: { ...context(business, 'x').ctx.normalized, languages: ['en', 'vi'] }
  })
  const engine = createJoomlaEngine({ models: model.models, applyFor: () => throughDoor(site.apply) })
  const prepared = await engine.prepare(ctx)
  const translated = model.calls.filter((c) => Array.isArray(c))
  assert.ok(
    // Several batches, none over 30: a generic menu label the planner keeps is answered by the shipped translation.
    translated.length >= 5 && translated.every((c) => c.length <= 30),
    `batches asked ahead: ${translated.length}`
  )
  assert.deepEqual(site.calls, [], 'and the site was not touched')
  assert.equal(prepared.derive.length, 1)
  assert.equal(prepared.derive[0].locale, 'vi-VN')
  assert.ok(prepared.derive[0].cache.size > 200, `strings answered ahead: ${prepared.derive[0].cache.size}`)
  const askedBeforeTheSite = model.calls.length

  await engine.apply(ctx, prepared)
  assert.equal(model.calls.length, askedBeforeTheSite, 'once the site is up the model is not asked again')
  const steps = site.languages.map((l) => l.step)
  assert.deepEqual(
    steps,
    ['package', 'apply', 'apply', 'verify'],
    'the pack, the phases until complete, the check'
  )
  const sent = site.languages.find((l) => l.step === 'apply')
  assert.equal(sent.locale, 'vi-VN')
  assert.equal(sent.expectedRevision, 'rev-3', 'the plan was read after the one write')
  const heroWords = site.applied.changes['module-441.0'] ?? Object.values(site.applied.changes)[0]
  assert.ok(
    Object.values(sent.translations).some((t) => t.startsWith('vi ')),
    'translations of our words'
  )
  assert.ok(
    Object.values(sent.translations).some(
      (t) => t === `vi ${heroWords}`.slice(0, t.length) || t.startsWith('vi ')
    )
  )
  // Hidden, derived, hidden again: the source and the new language are what stays.
  assert.ok(
    site.retire.length >= 3 && site.retire.every((p) => p.keep.includes('en-GB') && p.keep.includes('vi-VN'))
  )
  // The report says where a derived language's time went, and the two hidings are told apart.
  for (const phase of ['languagePackMs', 'languagePhasesMs', 'languageVerifyMs', 'retireMs', 'retireAfterMs'])
    assert.ok(phase in times, phase)
  // The links into the trimmed Projects and News are taken off since 10/10/2026 (TCH #1013); this double reviewed no
  // layout, so they are left and said — the subject of the take-off tests below, not of this one.
  // The demo itself titles a project and its news alike ("110 kV Obninsk-2 substation" · "… energised"): the double keeps
  // both, so the titles are told apart and said (`distinctArticleTitles`, POSTS). Every title is asked from its article's own
  // words and every intro checked against the About answer since 11/10/2026, and the blog planned as a whole and written one
  // story at a time since g64 (POSTS, `blog-plan.js`); this double knows no blog ask, and what it leaves is said.
  assert.deepEqual(
    notes.filter(
      (n) =>
        !/no picture model|link\(s\) to pages taken off cannot be taken off|article title\(s\) (keep the template’s title|repeated another article’s|were refused three times|have no words of their own|are a phrase|still read like)|article\(s\) say word for word|article\(s\) of the blog/.test(
          n
        )
    ),
    []
  )
})

test('a translation the model cannot make ahead is made when the site is up, and a language it cannot make at all is said', async () => {
  const bare = fakeModel({ translationsDown: true })
  const site = fakeSite(business)
  const { ctx, notes } = context(business, 'tracy-business/j6', {
    normalized: { ...context(business, 'x').ctx.normalized, languages: ['en', 'vi'] }
  })
  const engine = createJoomlaEngine({ models: bare.models, applyFor: () => throughDoor(site.apply) })
  const prepared = await engine.prepare(ctx)
  assert.ok(
    notes.some((n) => /vi-VN translation could not be made ahead/.test(n)),
    notes.join(' | ')
  )
  assert.equal(
    prepared.derive[0].cache.size > 0,
    true,
    'what the template ships translated is still answered'
  )
  await engine.apply(ctx, prepared)
  assert.ok(site.applied, 'the words were written')
  assert.deepEqual(site.languages, [], 'the language was not half-made')
  assert.ok(
    notes.some((n) => /Vietnamese version could not be added/.test(n)),
    notes.join(' | ')
  )
})

test('a two-letter language is the pack the template ships for it; one nobody ships is named and left out', async () => {
  const { ctx, notes } = context(business, 'tracy-business/j6', {
    normalized: { ...context(business, 'x').ctx.normalized, languages: ['en', 'pl', 'pt', 'zh', 'xx'] }
  })
  const engine = createJoomlaEngine({
    models: fakeModel().models,
    applyFor: () => throughDoor(fakeSite(business).apply)
  })
  const prepared = await engine.prepare(ctx)
  // `pl` is not in the seeder's alias table; the template ships `pl-PL.json`. `pt` and `zh` name no written form: the likelier one.
  assert.deepEqual(prepared.derive.map((d) => d.locale).sort(), ['pl-PL', 'pt-BR', 'zh-CN'])
  assert.ok(
    notes.some((n) => /xx is not a language this site can speak/.test(n)),
    notes.join(' | ')
  )
})

// ── Modules that state only another company's facts ───────────────────────────────────────────────────────────
/** Clients, About stats, Team, Certificates, Services stats, Careers stats, and (by field, #1326) the Investors share stats. */
const FACT_MODULES = [447, 837, 841, 842, 844, 849, 855]
/**
 * Lists of the demo company's places or prices under a heading (TCH #1367, `isFactList`): Contact's head office and branches,
 * About's places of work, Services' indicative pricing.
 */
const FACT_LISTS = [810, 812, 840, 847]
const HIDDEN = [...FACT_MODULES, ...FACT_LISTS].sort((a, b) => a - b)

test("the seven modules that are nothing but the template's facts, and the four lists of its places and prices, are unpublished, by id, when one language is written", async () => {
  const { site, times, prepared } = await run()
  assert.deepEqual(
    prepared.factModules.map((m) => m.id).sort((a, b) => a - b),
    HIDDEN
  )
  assert.deepEqual(
    [...site.hiddenModules].sort((a, b) => a - b),
    HIDDEN
  )
  assert.deepEqual(site.moduleLists, [], 'one language has no copies to look for')
  assert.equal(times.hiddenModules, HIDDEN.length)
  assert.ok('hideMs' in times)
})

test('a language beyond the source has its own copy of each module, found by title and hidden with it', async () => {
  const { site } = await run({
    ctx: { normalized: { ...context(business, 'tracy-business/j6').ctx.normalized, languages: ['en', 'vi'] } }
  })
  const viCopies = HIDDEN.map((id) => id + 10000)
  for (const id of [...HIDDEN, ...viCopies]) assert.ok(site.hiddenModules.includes(id), String(id))
  assert.ok(
    HIDDEN.every((id) => !site.hiddenModules.includes(id + 20000)),
    'the Russian edition is not one a visitor can reach: it is left'
  )
  assert.equal(site.moduleLists.length, HIDDEN.length, 'one look for the copies of each module')
  assert.ok(site.moduleLists.includes('Home - Clients'), "by the title without the template's prefix")
})

test("a quotation of the brief in one of their lines does not make one of those modules the customer's: it still goes, unwritten", async () => {
  const slot = mapOf(business).slots.find(
    (s) => s.entity === 'module-841' && s.requiresEvidence && s.type === 'text'
  )
  const said = 'a family bakery in Hanoi'
  const model = fakeModel()
  const ask = model.models
  model.models = async () => {
    const m = await ask()
    const chat = m.text.chat
    m.text.chat = async (call) => {
      const out = await chat(call)
      const input = JSON.parse(call.messages[1].content)
      if (!input.slots?.some((x) => x.key === slot.key)) return out
      const body = JSON.parse(out)
      body.pending = body.pending.filter((k) => k !== slot.key)
      body.values[slot.key] = said.slice(0, slot.maxCharacters)
      return JSON.stringify(body)
    }
    return m
  }
  const { site } = await run({ model })
  assert.ok(site.hiddenModules.includes(841), "the module of a team is nobody's evidence of a bakery")
  assert.ok(!(slot.key in site.applied.changes), 'and its lines are not written into a module nobody sees')
})

test('a long quotation of the brief is not evidence: an evidence slot keeps its words rather than say the whole description', async () => {
  const description =
    'Golden Crust Bakery, a family bakery in Hanoi. We bake fresh sourdough, croissants and custom cakes every day, from six in the morning.'
  const slot = mapOf(base).slots.find(
    (s) => s.requiresEvidence && s.type === 'text' && s.maxCharacters >= 130 && s.sample.trim()
  )
  assert.ok(slot, 'tracy-base has an evidence slot that could hold a long line')
  const model = fakeModel()
  const ask = model.models
  model.models = async () => {
    const m = await ask()
    const chat = m.text.chat
    m.text.chat = async (call) => {
      const out = await chat(call)
      const input = JSON.parse(call.messages[1].content)
      if (!input.slots?.some((x) => x.key === slot.key)) return out
      const body = JSON.parse(out)
      body.pending = body.pending.filter((k) => k !== slot.key)
      body.values[slot.key] = description
      return JSON.stringify(body)
    }
    return m
  }
  const { site } = await run({
    contract: base,
    release: 'tracy-base/j6',
    site: fakeSite(base),
    model,
    ctx: { brief: { about: description, goal: null, style: null } }
  })
  assert.ok(!(slot.key in site.applied.changes))
})

/** A model double that answers the given evidence slots with the given values, as a real model quoting the brief does. */
function quoting(values) {
  const model = fakeModel()
  const ask = model.models
  model.models = async () => {
    const m = await ask()
    const chat = m.text.chat
    m.text.chat = async (call) => {
      const out = await chat(call)
      const input = JSON.parse(call.messages[1].content)
      if (!Array.isArray(input.slots)) return out
      const body = JSON.parse(out)
      for (const slot of input.slots)
        if (slot.key in values) {
          body.pending = body.pending.filter((k) => k !== slot.key)
          body.values[slot.key] = values[slot.key]
        }
      return JSON.stringify(body)
    }
    return m
  }
  return model
}

// 14/10/2026, acceptance of #1331 on dev (g66-accept-tbjoomla): a description that mentions Dubai, no office answered, and the
// three Branches city cells came out "Dubai" beside the demo's addresses ("Dubai: Lipetsk SEZ, 6 Tekhnologichesky proezd").
const DUBAI = 'Tamarind Bakery, an artisan bakery in Dubai baking sourdough and date cakes every morning.'
/** The context of a customer who described the business in `about`, as Apply's normaliser hands it. */
const described = (about) => ({
  brief: { about, goal: 'contact', style: 'friendly' },
  normalized: { ...context(business, 'tracy-business/j6').ctx.normalized, name: 'Tamarind Bakery', about }
})
const branchCells = (field) =>
  mapOf(business).slots.filter(
    (s) => /Contact - Branches \(en\) \/ /.test(s.label) && s.label.endsWith(`/ ${field}`)
  )

test('one city in the description is not three branches: the Branches rows keep the demo, city and address alike', async () => {
  const cities = branchCells('city')
  assert.equal(cities.length, 3)
  const { site } = await run({
    model: quoting(Object.fromEntries(cities.map((s) => [s.key, 'Dubai']))),
    ctx: described(DUBAI)
  })
  for (const s of [...cities, ...branchCells('addr')])
    assert.ok(!(s.key in site.applied.changes), `${s.key} ${s.label}`)
})

test('the same place in every cell of the Branches rows is still one place: the rows keep the demo', async () => {
  const cells = [...branchCells('city'), ...branchCells('addr')]
  const { site } = await run({
    model: quoting(Object.fromEntries(cells.map((s) => [s.key, 'Dubai']))),
    ctx: described(DUBAI)
  })
  for (const s of cells) assert.ok(!(s.key in site.applied.changes), `${s.key} ${s.label}`)
})

test('a branch the description names whole is written as a row; the branches it does not name keep the demo', async () => {
  const [city0, city1] = branchCells('city')
  const [addr0] = branchCells('addr')
  // The demo's address cell carries a phone too (D12): the customer's own is given, or the cell stays the demo's anyway.
  const about =
    'Tamarind Bakery, an artisan bakery. Our shop: Dubai, Al Wasl Road Unit 4, +971 4 123 4567. Soon in Sharjah.'
  const { site } = await run({
    model: quoting({
      [city0.key]: 'Dubai',
      [addr0.key]: 'Al Wasl Road Unit 4, +971 4 123 4567',
      [city1.key]: 'Sharjah'
    }),
    ctx: described(about)
  })
  assert.equal(site.applied.changes[city0.key], 'Dubai')
  assert.equal(site.applied.changes[addr0.key], 'Al Wasl Road Unit 4, +971 4 123 4567')
  assert.ok(!(city1.key in site.applied.changes), 'a city with no address is half a branch')
})

test("Tracy Base is Tracy's own template: its evidence-gated sections are never taken off the page", async () => {
  const { site, prepared } = await run({ contract: base, release: 'tracy-base/j6', site: fakeSite(base) })
  assert.deepEqual(prepared.factModules, [])
  assert.deepEqual(site.hiddenModules, [])
})

// TCH #1013, ABOUT-3 (11/10/2026): a blank About keeps the template as it is, renamed. The team, certificates, clients and
// counters of the demo stay published, as in the demo; only a customer who described the business has them taken off.
// TCH #1367 (15/10/2026): the demo company's offices and prices are no placeholder for a business that has a name of its own.
test("About left blank, a name given: the seven modules of the template's facts stay published; its offices and prices go", async () => {
  const blank = context(business, 'tracy-business/j6').ctx
  const { site, prepared } = await run({
    ctx: {
      brief: { ...blank.brief, about: '' },
      normalized: { ...blank.normalized, about: '', nameFrom: 'answer' }
    }
  })
  assert.deepEqual(
    prepared.factModules.map((m) => m.id).sort((a, b) => a - b),
    FACT_LISTS
  )
  for (const id of FACT_MODULES) assert.ok(!site.hiddenModules.includes(id), `module ${id} stays published`)
})

test('a module the site will not hide costs that module only, and is said', async () => {
  const site = fakeSite(business)
  site.refuseModule = (id) => id === 841
  const { notes } = await run({ site })
  assert.ok(notes.some((n) => /module 841 could not be hidden: the site would not take it/.test(n)))
  assert.ok(FACT_MODULES.filter((id) => id !== 841).every((id) => site.hiddenModules.includes(id)))
})

test('a line the plugin refuses is set aside by name and the write is made again: one refusal never loses every word', async () => {
  const site = fakeSite(business)
  const text = mapOf(business).slots.filter(
    (s) => s.type === 'text' && s.sample.trim() !== '' && !s.requiresEvidence
  )
  const [one, two] = [text[3].key, text[40].key]
  site.refuse = new Set([one, two])
  // The records fallback reads whole rows. Supply the scalar paths this summary-only
  // double normally omits, with the same JSON structure as the sealed slots.
  for (const slot of [text[3], text[40]]) {
    const row = site.moduleRows.find((row) => `module-${row.id}` === slot.entity)
    const root = {}
    let parent = root
    for (const [index, part] of slot.jsonPath.entries()) {
      if (index === slot.jsonPath.length - 1) parent[part] = slot.sample
      else parent = parent[part] = typeof slot.jsonPath[index + 1] === 'number' ? [] : {}
    }
    row.params = JSON.stringify({ [slot.nestedJson]: JSON.stringify(root) })
  }
  const answer = site.answer
  site.answer = (call) =>
    call.action === 'content.list' && call.params.kind === 'module' && !call.params.search
      ? {
          ok: true,
          items: site.moduleRows.slice(call.params.offset ?? 0, (call.params.offset ?? 0) + call.params.limit)
        }
      : answer(call)
  const { site: used, notes, prepared } = await run({ site })
  assert.ok(used.applied, 'the write was made in the end')
  assert.ok(!(one in used.applied.changes) && !(two in used.applied.changes), 'without what was refused')
  assert.ok(Object.keys(used.applied.changes).length > 200)
  assert.ok(notes.some((n) => /2 line\(s\) were routed outside the contract write/.test(n)))
  // 🔒 A refused line is never emptied in a kept block (R12 group A, `settleKeptSlots`): its block comes off whole, or it
  // keeps the demo's words for the repair loop and is on the row as unwritten.
  const operations = used.batches.flatMap((batch) => batch.operations)
  const unwritten = new Set((prepared.copyLines?.unwritten ?? []).map((line) => line.key))
  for (const slot of [text[3], text[40]]) {
    const off = (prepared.factModules ?? []).some((m) => `module-${m.id}` === slot.entity)
    assert.ok(
      off || unwritten.has(slot.key),
      `${slot.key} comes off with its block or goes to the repair loop`
    )
    const write = operations.find((step) => `module-${step.id}` === slot.entity && step.fields.params)
    if (!write || off) continue
    let value = JSON.parse(JSON.parse(write.fields.params)[slot.nestedJson])
    for (const part of slot.jsonPath) value = value?.[part]
    assert.notEqual(value, '', `${slot.key} is never emptied in a kept block`)
  }
})

test('a line that ships a bare number (a JA module’s article id) only ever takes a number: words there broke the JA Podcast home page', async () => {
  // Measured 08/10/2026 on `tamq-7q-g-podcast`: module-121's `id-article` ("46") was written "Bánh mỗi sáng", the template
  // cast it to article 0, read no row and the home page answered HTTP 500 (Json::stringToObject(): null given).
  const podcast = contractFor(defaultContracts(), 'quickstart/ja-podcast/j6', '1.0.1')
  assert.ok(podcast, 'the checkout ships the JA Podcast profile')
  const numbers = mapOf(podcast).slots.filter(
    (s) => s.type === 'text' && /^\d+$/.test(String(s.sample).trim())
  )
  assert.ok(
    numbers.some((s) => s.key === 'module-121.3'),
    'the article id of the home page module is a slot'
  )
  const { site } = await run({ contract: podcast, release: 'quickstart/ja-podcast/j6' })
  assert.ok(site.applied, 'the words were written')
  const broken = numbers
    .filter((s) => s.key in site.applied.changes && !/^\d+$/.test(site.applied.changes[s.key].trim()))
    .map((s) => `${s.key}=${site.applied.changes[s.key]}`)
  assert.deepEqual(broken, [], 'no words go where the template reads a number')
})

test('a refusal that names nothing the write holds is still an error, said and not retried for ever', async () => {
  const site = fakeSite(business)
  const original = site.apply
  site.apply = async (call) =>
    call.params?.operation === 'apply' ? { ok: false, message: 'The site is on fire' } : original(call)
  await assert.rejects(() => run({ site }), /on fire/)
})

// ── What is left of the template's company: its menu entries and the contact form's mailbox ───────────────────
/** The menu of `tracy-business/j6` as a bakery's site holds it once the contract has written the words (measured 03/10/2026). */
const menuRows = () => [
  { id: 1, menutype: '', published: 1, title: 'Menu_Item_Root', language: '*' },
  { id: 596, menutype: 'tb-system', published: 1, title: 'Home', language: '*' },
  { id: 600, menutype: 'tb-main-en', published: 1, title: 'About', language: 'en-GB' },
  { id: 601, menutype: 'tb-main-en', published: 1, title: 'Services', language: 'en-GB' },
  { id: 602, menutype: 'tb-main-en', published: 0, title: 'Projects', language: 'en-GB' },
  { id: 604, menutype: 'tb-main-en', published: 1, title: 'Contact', language: 'en-GB' },
  { id: 605, menutype: 'tb-main-en', published: 1, title: 'Resources', language: 'en-GB' },
  { id: 607, menutype: 'tb-kit-en', published: 1, title: 'Newsletter', language: 'en-GB' },
  { id: 608, menutype: 'tb-main-en', published: 1, title: 'Newsletter', language: 'en-GB' },
  { id: 615, menutype: 'tb-kit-en', published: 1, title: 'Style guide', language: 'en-GB' },
  { id: 618, menutype: 'tb-top-en', published: 1, title: 'Careers', language: 'en-GB' },
  { id: 619, menutype: 'tb-top-en', published: 1, title: 'Investors', language: 'en-GB' },
  { id: 620, menutype: 'tb-footer-services-en', published: 1, title: 'Sourdough breads', language: 'en-GB' },
  { id: 621, menutype: 'tb-footer-services-en', published: 1, title: 'Fresh croissants', language: 'en-GB' },
  {
    id: 622,
    menutype: 'tb-footer-services-en',
    published: 1,
    title: 'Made-to-order cakes',
    language: 'en-GB'
  },
  { id: 623, menutype: 'tb-footer-services-en', published: 1, title: 'Buy online', language: 'en-GB' },
  { id: 625, menutype: 'tb-footer-company-en', published: 1, title: 'Our bakes', language: 'en-GB' },
  { id: 627, menutype: 'tb-footer-company-en', published: 1, title: 'Careers', language: 'en-GB' },
  { id: 628, menutype: 'tb-footer-company-en', published: 1, title: 'Investor relations', language: 'en-GB' },
  { id: 700, menutype: 'tb-top-ru', published: 1, title: 'Вакансии', language: 'ru-RU' }
]
const contactRows = () => [
  {
    id: 14,
    published: 1,
    language: 'en-GB',
    name: '{site.name}',
    email_to: 'sales@northgate-ind.ru',
    telephone: '8 800 550-67-90'
  },
  {
    id: 15,
    published: 1,
    language: 'ru-RU',
    name: '{site.name}',
    email_to: 'sales@northgate-ind.ru',
    telephone: '8 800 550-67-90'
  }
]
const OWNER = { email: 'hello@goldencrust.vn', phone: '0912 345 678' }
/** Every write the site took, as one string: what the tidy-up wrote anywhere, for what must appear nowhere. */
const everyWrite = (site) =>
  JSON.stringify([site.recordWrites, site.batches, site.extensionWrites, site.applies, site.hiddenModules])
/** What the Apply report says when the owner gave no mailbox: the form was set to hide (the page check says if it is gone). */
const FORM_OFF = /address was taken off the contact record/

// 🔒 A PAGE GOES ONLY WHEN THE CUSTOMER UNTICKED IT (product owner, 08/10/2026, TCH #1013): the model is asked about labels
// only, and the entries it would once have taken off (careers, investors, the marketing kit) stay published.
test('the menu entries a model would not want stay published, and the form mails the owner', async () => {
  const site = fakeSite(business)
  site.menuRows = menuRows()
  site.contactRows = contactRows()
  const model = fakeModel({
    judge:
      '{"hide": ["Careers", "Investors", "Investor relations", "Resources", "Newsletter", "Style guide", "Home", "About", "Gone"]}'
  })
  const { times, notes } = await run({
    site,
    model,
    ctx: { normalized: { ...context(business, 'tracy-business/j6').ctx.normalized, ...OWNER } }
  })
  const hidden = site.menuRows
    .filter((r) => r.published === 0)
    .map((r) => r.id)
    .sort((a, b) => a - b)
  assert.deepEqual(hidden, [602], 'only the entry that was unpublished already: the model takes nothing off')
  assert.equal(
    site.menuRows.find((r) => r.id === 700).published,
    1,
    'a language nobody can reach is not its business'
  )
  for (const id of [596, 600, 601, 604, 620])
    assert.equal(site.menuRows.find((r) => r.id === id).published, 1)
  assert.equal(site.batches.length, 1, 'one transaction')
  assert.deepEqual(
    site.batches[0].operations.map((o) => o.kind),
    ['contact'],
    'no menu entry is written'
  )
  assert.deepEqual(
    site.contactRows.map((r) => [r.id, r.email_to, r.telephone]),
    [
      [14, OWNER.email, OWNER.phone],
      [15, 'sales@northgate-ind.ru', '8 800 550-67-90']
    ],
    'the language that shows gets the owner, the one nobody reaches is left'
  )
  assert.equal('menuHidden' in times, false)
  assert.equal(times.contactsRouted, 1)
  assert.match(JSON.stringify(model.judged[0]), /Golden Crust Bakery/)
  // The answer above names entries to hide and carries no relabel: it is not the answer asked for, and is said.
  assert.equal(notes.filter((n) => /menu entries could not be judged/.test(n)).length, 1)
  assert.deepEqual(
    model.judged[0].entries.map((e) => e.title).sort(),
    [
      'Buy online',
      'Careers',
      'Fresh croissants',
      'Investor relations',
      'Investors',
      'Made-to-order cakes',
      'Newsletter',
      'Our bakes',
      'Resources',
      'Sourdough breads',
      'Style guide'
    ],
    'ordinary entries, unpublished ones and other languages are not put to the model'
  )
})

test("a collected address and the business name reach the contact record; a placeholder name is the site's own and stays", async () => {
  const site = fakeSite(base)
  site.menuRows = menuRows()
  site.contactRows = [
    { ...contactRows()[0], name: 'Tracy Studio — Demo enquiries', address: '1 Demo Way, Sample City' },
    contactRows()[1]
  ]
  const placeholderSite = fakeSite(base)
  placeholderSite.menuRows = menuRows()
  placeholderSite.contactRows = [{ ...contactRows()[0], address: '1 Demo Way, Sample City' }]
  const given = { ...OWNER, address: '42 Lantern Lane, Hoi An', name: 'The Moss Station' }
  for (const s of [site, placeholderSite])
    await run({
      contract: base,
      release: 'tracy-base/j6',
      site: s,
      model: fakeModel(),
      ctx: { normalized: { ...context(base, 'tracy-base/j6').ctx.normalized, ...given } }
    })
  assert.deepEqual(
    site.contactRows.map((r) => [r.id, r.name, r.address]),
    [
      [14, 'The Moss Station', '42 Lantern Lane, Hoi An'],
      [15, '{site.name}', undefined]
    ]
  )
  assert.equal(placeholderSite.contactRows[0].name, '{site.name}', 'the site fills its own name in')
  assert.equal(placeholderSite.contactRows[0].address, '42 Lantern Lane, Hoi An')
})

test("a design that is not another company's is not judged; without the owner's mailbox the template's address is taken off and the form is off, said; without a phone the template's number goes too (#1367)", async () => {
  const site = fakeSite(base)
  site.menuRows = menuRows()
  site.contactRows = contactRows()
  const model = fakeModel()
  const { times, notes, ctx } = await run({ contract: base, release: 'tracy-base/j6', site, model })
  assert.equal(model.judged.length, 0, "tracy-base is Tracy's own: its menu is its own")
  assert.deepEqual(
    site.contactRows.map((r) => [r.id, r.email_to, r.telephone]),
    [
      [14, '', ''],
      [15, 'sales@northgate-ind.ru', '8 800 550-67-90']
    ],
    "no visitor's message reaches the template's company, and no visitor calls it (#1367)"
  )
  const said = notes.filter((n) => FORM_OFF.test(n))
  assert.equal(said.length, 1, notes.join(' | '))
  assert.ok(said[0].length <= 200 && !said[0].includes('@'), said[0])
  assert.ok(
    !everyWrite(site).includes(ctx.email),
    'the account of the person who pressed Apply is written nowhere'
  )
  assert.equal(site.batches.length, 1)
  assert.deepEqual(
    site.batches[0].operations.map((o) => o.kind),
    ['contact']
  )
  assert.equal(times.contactsRouted, 1)
})

test('a component without transactions is written to one record at a time, and a model with no answer changes nothing and says so', async () => {
  const old = fakeSite(business)
  old.noBatch = true
  old.menuRows = menuRows()
  old.contactRows = contactRows()
  await run({
    site: old,
    model: fakeModel({ judge: '{"hide": ["Careers"]}' }),
    ctx: { normalized: { ...context(business, 'tracy-business/j6').ctx.normalized, ...OWNER } }
  })
  assert.deepEqual(
    old.recordWrites.map((w) => `${w.kind}:${w.id}`).sort(),
    ['contact:14'],
    'a "hide" in the answer takes nothing off'
  )

  const mute = fakeSite(business)
  mute.menuRows = menuRows()
  const { notes } = await run({ site: mute, model: fakeModel({ judge: 'I would rather not say' }) })
  assert.equal(
    mute.menuRows.filter((r) => r.published === 0).length,
    1,
    'only Projects, which was never published'
  )
  assert.equal(notes.filter((n) => /menu entries could not be judged/.test(n)).length, 1)
})

test('a model that would take the whole menu off takes nothing off, and is not asked about entries to hide', async () => {
  const site = fakeSite(business)
  site.menuRows = menuRows()
  const everything = menuRows().map((r) => r.title)
  const model = fakeModel({ judge: JSON.stringify({ hide: everything, relabel: {} }) })
  const { notes } = await run({ site, model })
  assert.equal(site.menuRows.filter((r) => r.published === 0).length, 1, 'only Projects, as it was')
  assert.equal(model.judged.length, 1)
  assert.deepEqual(
    notes.filter((n) => /could not|would take/.test(n)),
    []
  )
})

// ── The pages the customer picked (the questionnaire's `pages` question, feed `seed.pages`) ──────────────────
/** A workshop's menu, with the aliases and paths `content.list` gives each entry. */
const workshopMenu = () => [
  { id: 1, menutype: '', published: 1, title: 'Menu_Item_Root', language: '*' },
  {
    id: 599,
    menutype: 'tb-main-en',
    alias: 'home',
    path: 'home',
    link: 'index.php?option=com_content&view=featured',
    type: 'component',
    published: 1,
    title: 'Home',
    language: 'en-GB'
  },
  ...[
    [600, 'about', 'About'],
    [601, 'services', 'Services'],
    [603, 'news', 'News'],
    [604, 'contact', 'Contact']
  ].map(([id, alias, title]) => ({
    id,
    menutype: 'tb-main-en',
    alias,
    path: alias,
    type: 'component',
    published: 1,
    title,
    language: 'en-GB'
  })),
  {
    id: 626,
    menutype: 'tb-footer-company-en',
    alias: 'company-news',
    path: 'company-news',
    type: 'alias',
    published: 1,
    title: 'Workshop notes',
    language: 'en-GB',
    params: { aliasoptions: '603' }
  }
]
const workshopBrief = (...pages) => ({
  about: 'Spoke & Chain, a bicycle repair workshop in Leeds.',
  said: `Pages: ${pages.join(', ')}`,
  goal: null,
  style: null,
  answers: [{ id: 'pages', kind: 'multi', feeds: ['seed.pages'], label: 'Pages', value: pages }]
})

test('the menu entries of pages the customer did not pick go in the tidy-up, with the entries that only lead to them', async () => {
  for (const [contract, release] of [
    [business, 'tracy-business/j6'],
    [base, 'tracy-base/j6']
  ]) {
    const site = fakeSite(contract)
    site.menuRows = workshopMenu()
    const { notes, times } = await run({
      contract,
      release,
      site,
      ctx: { brief: workshopBrief('home', 'about', 'contact', 'pricing') }
    })
    const off = site.menuRows
      .filter((r) => r.published === 0)
      .map((r) => r.id)
      .sort((a, b) => a - b)
    assert.deepEqual(off, [601, 603, 626], `${release}: services, news and the footer alias of news`)
    assert.equal(times.menuUnpicked, 2, release)
    assert.ok(
      notes.some((n) => /this template has no pricing page/.test(n)),
      `${release}: ${notes.join(' | ')}`
    )
    assert.equal(site.batches.length, 1, `${release}: one transaction`)
  }
})

test('by id: exactly the menu entries of the pages the customer unticked go, the links into them with them; home stays', async () => {
  const site = fakeSite(business)
  site.menuRows = workshopMenu()
  const pages = {
    all: [
      { id: 'home', label: 'Home', home: true },
      ...['about', 'services', 'news', 'contact'].map((id) => ({ id, label: id }))
    ],
    // Home left out of the answer: it stays all the same.
    picked: ['about', 'contact']
  }
  const { times } = await run({
    contract: business,
    release: 'tracy-business/j6',
    site,
    ctx: { brief: { about: 'Spoke & Chain, a bicycle repair workshop in Leeds.', answers: [], pages } }
  })
  const off = site.menuRows
    .filter((r) => r.published === 0)
    .map((r) => r.id)
    .sort((a, b) => a - b)
  assert.deepEqual(off, [601, 603, 626], 'services, news and the footer alias that only led to news')
  assert.equal(times.menuUnpicked, 2)
})

test('a ticked page the demo trim took off is published again; the unticked one and its footer alias stay off', async () => {
  // Measured 08/10/2026 on dev (tamq-7q-tbusj): News unticked, yet /en/projects was 404 too. The release's demo trim
  // unpublishes Projects (602) and News (603) on every site; the Pages answer must decide (TCH #1013, U9).
  const site = fakeSite(business)
  site.menuRows = [
    ...workshopMenu(),
    {
      id: 602,
      menutype: 'tb-main-en',
      alias: 'projects',
      path: 'projects',
      type: 'component',
      published: 0,
      title: 'Projects',
      language: 'en-GB'
    },
    {
      id: 625,
      menutype: 'tb-footer-company-en',
      alias: 'company-projects',
      path: 'company-projects',
      type: 'alias',
      published: 1,
      title: 'Projects',
      language: 'en-GB',
      params: { aliasoptions: '602' }
    }
  ].map((row) => (row.id === 603 ? { ...row, published: 0 } : row))
  const pages = {
    all: [
      { id: 'home', label: 'Home', home: true },
      ...['about', 'services', 'projects', 'news', 'contact'].map((id) => ({ id, label: id }))
    ],
    picked: ['about', 'services', 'projects', 'contact']
  }
  const { times } = await run({
    contract: business,
    release: 'tracy-business/j6',
    site,
    ctx: { brief: { about: 'Spoke & Chain, a bicycle repair workshop in Leeds.', answers: [], pages } }
  })
  const state = (/** @type {number} */ id) => site.menuRows.find((r) => r.id === id)?.published
  assert.equal(state(602), 1, 'Projects, ticked, is published again')
  assert.equal(state(625), 1, "the footer's Projects alias leads to a live page and stays")
  assert.equal(state(603), 0, 'News, unticked, stays off')
  assert.equal(state(626), 0, "the footer's News alias goes with it")
  assert.equal(times.menuKept, 1)
})

test('a button into a ticked page the demo trim took off still leads to it after Apply, its label written for it (#1013)', async () => {
  // The words are planned before Apply publishes Projects again: planned as a page the trim hid, the About and Services
  // CTAs' "alt" buttons into Projects (module-843.5, module-848.5 → Itemid 602) were sent to Contact (604) and their labels
  // told so, and the ticked page came back with its buttons leading elsewhere (TCH #1013: links are never moved to Contact).
  const site = fakeSite(business)
  site.menuRows = [
    ...workshopMenu(),
    {
      id: 602,
      menutype: 'tb-main-en',
      alias: 'projects',
      path: 'projects',
      type: 'component',
      published: 0,
      title: 'Projects',
      language: 'en-GB'
    }
  ].map((row) => (row.id === 603 ? { ...row, published: 0 } : row))
  // Layouts the component reviewed: a link wrongly judged dead would be taken off here, and show.
  site.emptiable = new Map([
    ['module-843.5', 'hidden'],
    ['module-848.5', 'hidden']
  ])
  // Services unticked too, so the tidy-up takes a page off and looks for the links into pages gone (`takeLinksOff`).
  const pages = {
    all: [
      { id: 'home', label: 'Home', home: true },
      ...['about', 'services', 'projects', 'news', 'contact'].map((id) => ({ id, label: id }))
    ],
    picked: ['about', 'projects', 'contact']
  }
  const model = fakeModel()
  await run({
    contract: business,
    release: 'tracy-business/j6',
    site,
    model,
    ctx: { brief: { about: 'Spoke & Chain, a bicycle repair workshop in Leeds.', answers: [], pages } }
  })
  assert.equal(site.menuRows.find((r) => r.id === 602)?.published, 1, 'Projects, ticked, is published again')
  assert.equal(site.menuRows.find((r) => r.id === 601)?.published, 0, 'Services, unticked, goes')
  /** What the site's last contract write left in a slot: undefined when none named it, '' for a link taken off. */
  const last = (/** @type {string} */ key) => {
    const write = site.applies.findLast(
      (a) => key in (a.changes ?? {}) || (a.empty_links ?? []).includes(key)
    )
    return write ? (key in (write.changes ?? {}) ? write.changes[key] : '') : undefined
  }
  for (const key of ['module-843.5', 'module-848.5'])
    assert.equal(last(key), undefined, `${key} keeps index.php?Itemid=602: never moved, never taken off`)
  const told = model.calls
    .flatMap((input) => (Array.isArray(input?.slots) ? input.slots : []))
    .filter((slot) => /^module-8(43|48)\./.test(slot.key) && /alt-text/.test(String(slot.label)))
  // Every button's label is told where it leads (TCH #1013): the "alt" buttons the Projects page, never the contact page.
  assert.ok(told.length > 0, 'the alt labels are planned')
  for (const slot of told)
    assert.match(
      String(slot.leadsTo ?? ''),
      /"Projects"/,
      `${slot.key} is told it leads to Projects, not Contact`
    )
})

// Decided 10/10/2026 (TCH #1013, option a): a link into a page the demo trim hid that the customer did NOT tick — unticked, or
// not in the Pages list at all — is taken off like a link into a page the customer unticked, never sent to the contact page.
// Until then the planner moved the About and Services CTAs' "alt" buttons into the trimmed Projects (Itemid 602) to Contact
// (604) and told their labels so.
test('a button into a page the demo trim hid that the customer did not tick is taken off after Apply, never sent to Contact (#1013)', async () => {
  const CTA = ['module-843.5', 'module-848.5']
  const about = 'Spoke & Chain, a bicycle repair workshop in Leeds.'
  /** What the site's last contract write left in a slot: undefined when none named it, '' for a link taken off. */
  const last = (/** @type {any} */ site, /** @type {string} */ key) => {
    const write = site.applies.findLast(
      (/** @type {any} */ a) => key in (a.changes ?? {}) || (a.empty_links ?? []).includes(key)
    )
    return write ? (key in (write.changes ?? {}) ? write.changes[key] : '') : undefined
  }
  const trimmedMenu = () =>
    [
      ...workshopMenu(),
      {
        id: 602,
        menutype: 'tb-main-en',
        alias: 'projects',
        path: 'projects',
        type: 'component',
        published: 0,
        title: 'Projects',
        language: 'en-GB'
      }
    ].map((row) => (row.id === 603 ? { ...row, published: 0 } : row))
  const unticked = {
    all: [
      { id: 'home', label: 'Home', home: true },
      ...['about', 'services', 'projects', 'news', 'contact'].map((id) => ({ id, label: id }))
    ],
    picked: ['about', 'services', 'contact']
  }
  for (const [why, pages] of /** @type {Array<[string, any]>} */ ([
    ['Projects unticked', unticked],
    ['no Pages answer', null]
  ])) {
    const site = fakeSite(business)
    site.menuRows = trimmedMenu()
    site.emptiable = new Map(CTA.map((key) => [key, /** @type {'hidden'} */ ('hidden')]))
    const model = fakeModel()
    await run({
      contract: business,
      release: 'tracy-business/j6',
      site,
      model,
      ctx: { brief: { about, answers: [], ...(pages ? { pages } : {}) } }
    })
    assert.equal(site.menuRows.find((r) => r.id === 602)?.published, 0, `${why}: Projects stays off`)
    for (const key of CTA) {
      assert.equal(last(site, key), '', `${why}: ${key} is taken off`)
      assert.ok(
        site.applies.every((a) => a.changes?.[key] === undefined),
        `${why}: ${key} is never sent to the contact page`
      )
    }
    const told = model.calls
      .flatMap((input) => (Array.isArray(input?.slots) ? input.slots : []))
      .filter((slot) => slot.leadsTo !== undefined && /^module-8(43|48)\.4$/.test(slot.key))
    // The dead buttons' own labels ("See projects") are told nothing; every live button is told its page (TCH #1013).
    assert.deepEqual(told, [], `${why}: no label of a dead button is told a destination`)
  }
  // A trim that did not run on the site hid nothing: Projects answers, and its buttons are left as they are.
  const site = fakeSite(business, {
    trim: { ok: false, message: 'Unknown contract operation demoTrim.apply' }
  })
  site.menuRows = trimmedMenu().map((row) =>
    row.id === 602 || row.id === 603 ? { ...row, published: 1 } : row
  )
  site.emptiable = new Map(CTA.map((key) => [key, /** @type {'hidden'} */ ('hidden')]))
  await run({
    contract: business,
    release: 'tracy-business/j6',
    site,
    ctx: { brief: { about, answers: [] } }
  })
  for (const key of CTA) assert.equal(last(site, key), undefined, `untrimmed: ${key} is not touched`)
})

test('an entry taken off because its page was not picked is not also retitled in the same batch', async () => {
  const site = fakeSite(business)
  site.menuRows = [
    ...workshopMenu(),
    {
      id: 630,
      menutype: 'tb-main-en',
      alias: 'our-services',
      path: 'our-services',
      type: 'component',
      published: 1,
      title: 'What we fix',
      language: 'en-GB'
    }
  ]
  await run({
    site,
    model: fakeModel({ judge: '{"hide": [], "relabel": {"What we fix": "Repairs"}}' }),
    ctx: { brief: workshopBrief('home', 'about', 'contact') }
  })
  const steps = site.batches.flatMap((b) => b.operations).filter((o) => o.id === 630)
  assert.deepEqual(
    steps.map((o) => o.fields),
    [{ published: 0 }]
  )
})

test('a tidy-up of more than 100 records goes in transactions of at most 100, not one record at a time', async () => {
  const calls = []
  const apply = async (call) => (calls.push(call), { ok: true })
  const steps = Array.from({ length: 230 }, (_, i) => ({
    kind: 'menuItem',
    id: 1000 + i,
    fields: { published: 0 }
  }))
  const done = await writeSteps({ apply, siteKey: 'x', steps, applyId: 'tidy-test' })
  assert.equal(done.written, 230)
  assert.deepEqual(
    calls.map((c) => [c.action, c.params.operations?.length]),
    [
      ['content.batch', 100],
      ['content.batch', 100],
      ['content.batch', 30]
    ]
  )
  assert.ok(
    calls.every((c) => c.params.apply_id === 'tidy-test'),
    'one apply id: one undo'
  )
  assert.equal(new Set(calls.map((c) => c.params.request_id)).size, 3, 'each transaction its own request')
  // A batch the site refuses goes one record at a time; the others stay transactions.
  const mixed = []
  const refusing = async (call) => {
    mixed.push(call.action)
    return call.action === 'content.batch' && call.params.operations[0].id === 1100
      ? { ok: false }
      : { ok: true }
  }
  const again = await writeSteps({ apply: refusing, siteKey: 'x', steps, applyId: 'tidy-test' })
  assert.equal(again.written, 230)
  assert.equal(mixed.filter((a) => a === 'content.update').length, 100)
  assert.equal(mixed.filter((a) => a === 'content.batch').length, 3)
})

test('a write that only went with one the site refused is not sent: not one record at a time, not in a later transaction', async () => {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    if (call.action === 'content.batch' && call.params.operations.some((o) => o.id === 1))
      return { ok: false, error: 'batch_failed' }
    if (call.action === 'content.update' && call.params.id === 1) return { ok: false, message: 'locked' }
    return { ok: true }
  }
  const hide = (id) => ({ kind: 'menuItem', id, fields: { published: 0 } })
  const steps = [
    hide(1),
    hide(5),
    ...Array.from({ length: 98 }, (_, i) => ({ kind: 'contact', id: 100 + i, fields: { telephone: '' } })),
    hide(2),
    hide(3)
  ]
  /** @type {number[][]} */
  const asked = []
  const done = await writeSteps({
    apply,
    siteKey: 'x',
    steps,
    applyId: 'tidy-test',
    still: async (refused) => {
      asked.push(refused.map((step) => step.id))
      return (step) => ![2, 5].includes(step.id)
    }
  })
  assert.deepEqual(asked, [[1]])
  assert.equal(done.written, 99)
  assert.deepEqual(
    done.refused.map((step) => step.id),
    [1]
  )
  assert.deepEqual(
    done.skipped.map((step) => step.id),
    [5, 2]
  )
  assert.ok(!calls.some((c) => c.action === 'content.update' && c.params.id === 5))
  const later = calls.filter((c) => c.action === 'content.batch').at(-1)
  assert.deepEqual(
    later.params.operations.map((o) => o.id),
    [3]
  )
})

test('a menu that cannot be read is said, and the pages not picked stay', async () => {
  const site = fakeSite(base)
  site.menuRows = workshopMenu()
  const door = site.apply
  site.apply = async (call) =>
    call.action === 'content.list' && call.params?.kind === 'menuItem'
      ? { ok: false, message: 'the site is busy' }
      : door(call)
  const { notes } = await run({
    contract: base,
    release: 'tracy-base/j6',
    site,
    ctx: { brief: workshopBrief('home', 'about', 'contact') }
  })
  assert.equal(site.menuRows.find((r) => r.id === 601).published, 1)
  assert.ok(
    notes.some((n) => /pages you did not pick could not be taken off/.test(n)),
    notes.join(' | ')
  )
})

test('every apply id the site is written under is told to the run, so the whole Apply can be undone', async () => {
  const site = fakeSite(business)
  site.menuRows = workshopMenu()
  const named = []
  const door = site.apply
  site.apply = async (call) => {
    if (typeof call.params?.apply_id === 'string') named.push(call.params.apply_id)
    return door(call)
  }
  const ids = []
  await run({
    site,
    ctx: {
      applied: (id) => ids.push(id),
      brief: workshopBrief('home', 'about', 'contact'),
      normalized: { ...context(business, 'tracy-business/j6').ctx.normalized, languages: ['en', 'ru'] }
    }
  })
  for (const kind of ['contract-', 'tidy-', 'mlang-retire-'])
    assert.ok(
      named.some((id) => id.startsWith(kind)),
      `${kind}: ${named.join(' ')}`
    )
  assert.deepEqual([...new Set(ids)].sort(), [...new Set(named)].sort())
})

test('the planner reads the other answers beside the description, and the menu judge everything the customer said', async () => {
  const details = 'Sector: Bicycle repair\nWhat we do not offer: bike rental'
  const about = `Spoke & Chain repairs and services bicycles in Leeds, ${'from punctures to full rebuilds '.repeat(10)}`
  const site = fakeSite(business)
  site.menuRows = workshopMenu()
  const model = fakeModel()
  await run({
    site,
    model,
    ctx: {
      brief: { about, said: details, goal: null, style: null, answers: [] },
      normalized: { ...context(business, 'tracy-business/j6').ctx.normalized, about, details }
    }
  })
  const planned = model.calls.filter((c) => !Array.isArray(c) && c.brief)
  assert.ok(planned.length > 0)
  assert.ok(
    planned.every((c) => c.brief.details === details),
    'every planner call'
  )
  assert.ok(about.length > 300)
  assert.match(model.judged[0].business.about, /What we do not offer: bike rental$/, 'the menu judge')
})

test('the tidy-up comes before any language is made, so an edition made from the source copies a tidy one', async () => {
  const site = fakeSite(business)
  site.menuRows = menuRows()
  site.contactRows = contactRows()
  await run({
    site,
    model: fakeModel({ judge: '{"hide": ["Careers"]}' }),
    ctx: {
      normalized: {
        ...context(business, 'tracy-business/j6').ctx.normalized,
        ...OWNER,
        languages: ['en', 'vi']
      }
    }
  })
  const order = site.calls
  assert.ok(order.includes('content.batch'), 'the tidy-up was made')
  assert.ok(
    order.indexOf('content.batch') < order.indexOf('multilingual.package'),
    'and before the new language was made'
  )
})

// ── Relabels, a model that would hide entries, and the consent text ───────────────────────────────────────────
/** The footer's four demo service entries, as a site holds them when the contract left them as the template has them. */
const demoFooter = () => [
  {
    id: 620,
    menutype: 'tb-footer-services-en',
    published: 1,
    title: 'Industrial park infrastructure',
    language: 'en-GB'
  },
  {
    id: 621,
    menutype: 'tb-footer-services-en',
    published: 1,
    title: 'Pre-engineered buildings',
    language: 'en-GB'
  },
  { id: 622, menutype: 'tb-footer-services-en', published: 1, title: 'M&E engineering', language: 'en-GB' },
  {
    id: 623,
    menutype: 'tb-footer-services-en',
    published: 1,
    title: 'Maintenance & retrofit',
    language: 'en-GB'
  }
]
const kitAndCareers = ['Resources', 'Newsletter', 'Style guide', 'Careers', 'Investors', 'Investor relations']

test("an entry that names the template company's services is relabelled for the owner's own, not hidden; a label with a fact the owner did not give is dropped", async () => {
  const site = fakeSite(business)
  site.menuRows = [...menuRows().filter((r) => r.menutype !== 'tb-footer-services-en'), ...demoFooter()]
  const { times, notes } = await run({
    site,
    model: fakeModel({
      judge: JSON.stringify({
        hide: kitAndCareers,
        relabel: {
          'Industrial park infrastructure': 'Sourdough breads',
          'Pre-engineered buildings': 'Fresh croissants',
          'M&E engineering': 'Call 0912 345 678',
          'Maintenance & retrofit': 'Buy online'
        }
      })
    })
  })
  const titleOf = (id) => site.menuRows.find((r) => r.id === id).title
  assert.equal(titleOf(620), 'Sourdough breads')
  assert.equal(titleOf(621), 'Fresh croissants')
  assert.equal(titleOf(622), 'M&E engineering', 'a phone number the owner never gave is not a label')
  assert.equal(titleOf(623), 'Buy online')
  assert.equal(times.menuRelabelled, 3)
  assert.equal(
    site.menuRows.find((r) => r.id === 618).published,
    1,
    'careers stays: the model takes nothing off'
  )
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

test('a model that answers with entries to hide is asked once: its relabels count, and no entry goes', async () => {
  const site = fakeSite(business)
  site.menuRows = [...menuRows().filter((r) => r.menutype !== 'tb-footer-services-en'), ...demoFooter()]
  const everything = [...kitAndCareers, ...demoFooter().map((r) => r.title), 'Marketing Kit', 'Our bakes']
  const model = fakeModel({
    judge: JSON.stringify({
      hide: everything,
      relabel: { 'Industrial park infrastructure': 'Sourdough breads' }
    })
  })
  const { notes } = await run({ site, model })
  assert.equal(model.judged.length, 1)
  assert.equal(site.menuRows.find((r) => r.id === 618).published, 1)
  assert.equal(site.menuRows.find((r) => r.id === 620).title, 'Sourdough breads')
  assert.equal(site.menuRows.find((r) => r.id === 621).published, 1, 'the footer services were not hidden')
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

test("the consent box says a plain sentence where the template ships a law, by the plugin's own parameter; an owner's own text and another design are left", async () => {
  const withPlugin = (params) => [
    { extension_id: 1, name: 'com_x', element: 'x', folder: '', enabled: 1 },
    {
      extension_id: 482,
      name: 'plg_content_confirmconsent',
      element: 'confirmconsent',
      folder: 'content',
      enabled: 1,
      params
    }
  ]
  const site = fakeSite(business)
  site.extensions = withPlugin('{"privacy_article":560,"privacy_type":"menu_item","privacy_menu_item":630}')
  const { times } = await run({ site })
  assert.equal(site.extensionWrites.length, 1)
  assert.deepEqual(JSON.parse(site.extensions[1].params), {
    privacy_article: 560,
    privacy_type: 'menu_item',
    privacy_menu_item: 630,
    consentbox_text: 'I agree to my details being used to reply to this message.'
  })
  assert.equal(times.consentNote, 1)

  const owned = fakeSite(business)
  owned.extensions = withPlugin('{"consentbox_text":"Tick to agree to our terms."}')
  await run({ site: owned })
  assert.equal(owned.extensionWrites.length, 0, 'what the owner wrote is not overwritten')

  const other = fakeSite(base)
  other.extensions = withPlugin('{}')
  await run({ contract: base, release: 'tracy-base/j6', site: other })
  assert.equal(other.extensionWrites.length, 0, "tracy-base is Tracy's own: its consent text is its own")
})

// ── What leads to a page the tidy took off goes with it, or is sent somewhere that answers ─────────────────────
/** A yoga studio, nothing like the template's contractor or the bakery above. */
const studio = (languages = ['en']) => {
  const about = 'Lotus Flow Yoga, a yoga studio in Da Nang with morning and evening classes.'
  return {
    brief: { about, goal: 'contact', style: 'calm' },
    normalized: { name: 'Lotus Flow Yoga', about, tone: 'calm and welcoming', contact: '', languages }
  }
}
/** A footer entry that is an ALIAS of another entry: where it leads is `params.aliasoptions`, in its full row only. */
const aliasOf = (id, title, to, language = 'en-GB') => ({
  id,
  menutype: `tb-footer-company-${language.slice(0, 2)}`,
  type: 'alias',
  published: 1,
  title,
  language,
  link: 'index.php?Itemid=',
  params: JSON.stringify({ aliasoptions: String(to), alias_redirect: '0' })
})
/**
 * The yoga studio's `tracy-business/j6` menu once the words are in, in the shape measured 05/10/2026 on a j6 site made with
 * Apply: the demo trim has unpublished Projects (602) and News (603), and the footer's "Company" column is aliases of the
 * top bar's entries that the planner retitled, so no title says where an entry leads ("Our bakes" there led to Projects).
 */
const studioMenu = () => [
  { id: 600, menutype: 'tb-main-en', type: 'component', published: 1, title: 'About', language: 'en-GB' },
  { id: 602, menutype: 'tb-main-en', type: 'component', published: 0, title: 'Projects', language: 'en-GB' },
  { id: 603, menutype: 'tb-main-en', type: 'component', published: 0, title: 'News', language: 'en-GB' },
  { id: 604, menutype: 'tb-main-en', type: 'component', published: 1, title: 'Contact', language: 'en-GB' },
  {
    id: 613,
    menutype: 'tb-kit-en',
    type: 'component',
    published: 1,
    title: 'Slideshow',
    language: 'en-GB',
    alias: 'slideshow',
    path: 'slideshow'
  },
  {
    id: 617,
    menutype: 'tb-main-en',
    type: 'url',
    published: 1,
    title: 'Kit preview',
    language: 'en-GB',
    link: 'index.php?Itemid=613'
  },
  {
    id: 618,
    menutype: 'tb-top-en',
    type: 'component',
    published: 1,
    title: 'Careers',
    language: 'en-GB',
    alias: 'careers',
    path: 'careers'
  },
  {
    id: 619,
    menutype: 'tb-top-en',
    type: 'component',
    published: 1,
    title: 'Class passes',
    language: 'en-GB'
  },
  aliasOf(624, 'About us', 600),
  aliasOf(625, 'Our classes', 602),
  aliasOf(626, 'Studio journal', 603),
  aliasOf(627, 'Teach with us', 618),
  aliasOf(628, 'Buy a pass', 619),
  // An alias into the trimmed News that holds an entry of its own: hiding it would take the retreat out of the menu.
  aliasOf(629, 'Workshops', 603),
  {
    id: 630,
    menutype: 'tb-footer-company-en',
    type: 'component',
    published: 1,
    parent_id: 629,
    title: 'Weekend retreat',
    language: 'en-GB'
  },
  // A link item that names an article as well as the judged kit page: Joomla may still render it, so it is not judged here.
  {
    id: 631,
    menutype: 'tb-main-en',
    type: 'url',
    published: 1,
    title: 'Kit article',
    language: 'en-GB',
    link: 'index.php?option=com_content&view=article&id=566&Itemid=613'
  },
  { id: 635, menutype: 'tb-main-ru', type: 'component', published: 0, title: 'Объекты', language: 'ru-RU' },
  aliasOf(658, 'Объекты', 635, 'ru-RU')
]
/** The Pages answer of a customer who unticked the pages named (by their menu path) and kept none of the list. */
const untickedPages = (...ids) => ({ all: ids.map((id) => ({ id, label: id })), picked: [] })
/** The studio with Careers and the slide kit unticked: the only way a page leaves the site (TCH #1013, 08/10/2026). */
const studioUnticked = (languages = ['en']) => {
  const ctx = studio(languages)
  return { ...ctx, brief: { ...ctx.brief, pages: untickedPages('careers', 'slideshow') } }
}

test('a menu entry that only leads to a page the trim took off or the customer unticked goes with it, in the same transaction', async () => {
  const site = fakeSite(business)
  site.menuRows = studioMenu()
  const { times, notes } = await run({
    site,
    model: fakeModel(),
    ctx: studioUnticked()
  })
  const hidden = site.menuRows
    .filter((r) => r.published === 0)
    .map((r) => r.id)
    .sort((a, b) => a - b)
  assert.deepEqual(
    hidden,
    [602, 603, 613, 617, 618, 625, 626, 627, 635],
    'the aliases of the trimmed Projects and News, of the unticked Careers, and a link item to the unticked kit page'
  )
  for (const id of [600, 604, 619, 624, 628])
    assert.equal(site.menuRows.find((r) => r.id === id).published, 1, `${id} leads to a live page and stays`)
  assert.equal(
    site.menuRows.find((r) => r.id === 629).published,
    1,
    'an entry with a live entry under it stays'
  )
  assert.equal(site.menuRows.find((r) => r.id === 630).published, 1)
  assert.equal(
    site.menuRows.find((r) => r.id === 631).published,
    1,
    'a link that names more than a menu entry is not judged by the entry alone'
  )
  assert.equal(
    notes.filter((n) => /1 menu entry\(ies\) lead to pages taken off but hold entries that stay/.test(n))
      .length,
    1
  )
  assert.equal(
    site.menuRows.find((r) => r.id === 658).published,
    1,
    'an edition nobody can reach is not this tidy-up’s business'
  )
  assert.equal(site.batches.length, 1, 'one transaction')
  assert.match(site.batches[0].apply_id, /^tidy-/, 'under the tidy-up’s apply id, so one revert undoes it')
  assert.equal(times.menuStranded, 4)
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

// 🔒 AN UNTICKED PAGE'S ARTICLES GO WITH IT (product owner, 08/10/2026, TCH #1013): the list leaves its address with its menu
// entry, and its articles, which answered at their own addresses, are unpublished in the same transaction.
test("an unticked list page's articles are unpublished in the tidy-up's transaction; an article a page that stays shows is left", async () => {
  const site = fakeSite(business)
  site.menuRows = studioMenu().map((row) =>
    row.id === 618
      ? { ...row, link: 'index.php?option=com_content&view=category&layout=tb-vacancies&id=320' }
      : row.id === 619
        ? { ...row, link: 'index.php?option=com_content&view=category&id=330' }
        : row
  )
  site.categoryRows = [
    { id: 320, parent_id: 1 },
    { id: 321, parent_id: 320 },
    { id: 330, parent_id: 1 }
  ]
  site.articleRows = [
    { id: 701, catid: 320, state: 1, featured: 0 },
    { id: 702, catid: 321, state: 1, featured: 0 },
    { id: 703, catid: 321, state: 0, featured: 0 },
    { id: 704, catid: 330, state: 1, featured: 0 }
  ]
  const { times, notes } = await run({ site, model: fakeModel(), ctx: studioUnticked() })
  const state = (/** @type {number} */ id) => site.articleRows.find((a) => a.id === id).state
  assert.equal(state(701), 0, 'the Careers list’s own article')
  assert.equal(state(702), 0, 'and one of a category under it')
  assert.equal(state(704), 1, 'an article of a page that stays is left')
  assert.equal(
    site.recordWrites.some((w) => w.kind === 'article' && w.id === 703),
    false,
    'an article already off is not written again'
  )
  assert.equal(site.batches.length, 1, 'one transaction with the menu entries')
  assert.deepEqual(
    site.batches[0].operations.filter((op) => op.kind === 'article').map((op) => op.id),
    [701, 702]
  )
  assert.equal(times.articlesUnpicked, 2)
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

// An article a page that stays still shows keeps an address that opens (spec PAGE-4 and PAGE-7, measured 10/10/2026 on JA
// Essence j6 1.0.3): its only route went with the unticked page, so it gets an entry of its own in the same transaction.
test('a featured article of an unticked list gets an entry of its own in the tidy-up’s transaction, in a menu no module shows', async () => {
  const site = fakeSite(business)
  site.menuRows = studioMenu().map((row) =>
    row.id === 618
      ? { ...row, link: 'index.php?option=com_content&view=category&id=320', component_id: 22 }
      : row.id === 600
        ? { ...row, link: 'index.php?option=com_content&view=featured', component_id: 22 }
        : row
  )
  site.categoryRows = [{ id: 320, parent_id: 1 }]
  site.articleRows = [
    { id: 701, catid: 320, state: 1, featured: 0, alias: 'job-a', title: 'Job A' },
    { id: 705, catid: 320, state: 1, featured: 1, alias: 'open-day', title: 'Open day' }
  ]
  const { times } = await run({ site, model: fakeModel(), ctx: studioUnticked() })
  assert.equal(site.articleRows.find((a) => a.id === 701).state, 0, 'nothing that stays shows it')
  assert.equal(site.articleRows.find((a) => a.id === 705).state, 1, 'the front page still features it')
  assert.equal(site.batches.length, 1, 'one transaction, so one revert undoes it')
  const created = site.batches[0].operations.filter((op) => op.id === 0)
  assert.deepEqual(
    created.map((op) => op.kind),
    ['menutype', 'menuItem']
  )
  assert.equal(created[1].fields.link, 'index.php?option=com_content&view=article&id=705')
  assert.equal(created[1].fields.alias, 'open-day')
  assert.equal(created[1].fields.type, 'component')
  assert.equal(created[1].fields.menutype, created[0].fields.menutype)
  assert.equal(times.articlesRouted, 1)
})

// 🔒 A LINK INTO A PAGE THE CUSTOMER UNTICKED IS TAKEN OFF, NEVER SENT TO THE CONTACT PAGE (product owner, 08/10/2026,
// TCH #1013). Claude Cowork for Joomla 0.24.4 empties a link slot (`empty_links`) only where it reviewed the layout that
// draws it (inspect marks it `emptyLink`); any other link is left as it is and said.
/** The 404 page's "you may be looking for" rows into the slide kit and the careers page, both reviewed as plain words. */
const reviewedRows = () =>
  new Map(
    /** @type {Array<[string, 'hidden' | 'plain']>} */ ([
      ['module-816.11', 'plain'],
      ['module-816.14', 'plain']
    ])
  )

/**
 * The links of the English edition into the Projects (602) and News (603) the demo trim hides, as Tracy Business j6 1.2.0
 * ships them — the 404 page's row, the top newsletter's button, the About and Services CTAs' "alt" buttons — reviewed:
 * since 10/10/2026 a link into a page the trim hid that the customer did not tick is taken off like one into a page the
 * customer unticked (TCH #1013), never sent to the contact page.
 */
const TRIM_LINKS = Object.freeze(['module-674.7', 'module-816.12', 'module-843.5', 'module-848.5'])
const trimRows = () =>
  new Map(
    /** @type {Array<[string, 'hidden' | 'plain']>} */ ([
      ['module-674.7', 'hidden'],
      ['module-816.12', 'plain'],
      ['module-843.5', 'hidden'],
      ['module-848.5', 'hidden']
    ])
  )

test('a link in a page that leads to a page the customer unticked is taken off, before any language copies it', async () => {
  const site = fakeSite(business)
  site.menuRows = studioMenu()
  site.emptiable = new Map([...reviewedRows(), ...trimRows()])
  const { times, notes } = await run({
    site,
    model: fakeModel(),
    ctx: studioUnticked(['en', 'vi'])
  })
  assert.equal(site.applies.length, 2, 'the words, then the links')
  assert.deepEqual(
    [...site.applies[1].empty_links].sort(),
    ['module-816.11', 'module-816.14', ...TRIM_LINKS].sort(),
    'the links into the unticked pages and into the pages the trim hid that nobody ticked'
  )
  assert.equal(site.applies[1].changes, undefined, 'nothing is written into them, and nothing else is sent')
  assert.equal(
    site.applies.some((a) =>
      ['module-816.11', 'module-816.14', ...TRIM_LINKS].some((key) => a.changes?.[key] !== undefined)
    ),
    false,
    'none is sent to the contact page'
  )
  const order = site.calls
  const second = order.lastIndexOf('apply')
  assert.ok(order.indexOf('content.batch') < second, 'after the menu is tidied')
  assert.ok(second < order.indexOf('multilingual.package'), 'and before the new language copies the page')
  assert.equal(times.linksTakenOff, 6)
  assert.equal(times.linksMoved, undefined)
  assert.deepEqual(
    notes.filter((n) => /could not|still lead/.test(n)),
    []
  )
})

test('a link whose layout the site has not reviewed is left as it is and said, never sent to the contact page', async () => {
  // A component older than 0.24.4 marks nothing; neither does one that never reviewed the layout.
  const site = fakeSite(business)
  site.menuRows = studioMenu()
  const { times, notes } = await run({ site, model: fakeModel(), ctx: studioUnticked() })
  assert.equal(site.applies.length, 1, 'only the words are written')
  assert.equal(site.menuRows.find((r) => r.id === 627).published, 0, 'the menu is still tidied')
  // The two into the unticked pages, and the four into the Projects and News the trim hid (not in the Pages list).
  assert.equal(times.linksLeft, 6)
  assert.equal(times.linksTakenOff, undefined)
  assert.equal(
    notes.filter((n) =>
      /6 link\(s\) to pages taken off cannot be taken off on this site's layout, so they still lead there/.test(
        n
      )
    ).length,
    1
  )
  for (const key of TRIM_LINKS)
    assert.equal(
      site.applied.changes[key],
      undefined,
      `${key} is left as it is, never sent to the contact page`
    )
  assert.equal(
    site.calls.filter((c) => c === 'inspect').length,
    1,
    'no layout reviewed: the site is not asked again'
  )
})

test('only the reviewed links of a page are taken off; the others are left and said', async () => {
  const site = fakeSite(business)
  site.menuRows = studioMenu()
  site.emptiable = new Map([['module-816.11', 'hidden']])
  const { times, notes } = await run({ site, model: fakeModel(), ctx: studioUnticked() })
  assert.equal(site.applies.length, 2)
  assert.deepEqual(site.applies[1].empty_links, ['module-816.11'])
  assert.equal(
    site.attempts.filter((keys) => keys.includes('module-816.14')).length,
    0,
    'a link the site would refuse to empty is not asked for'
  )
  assert.equal(times.linksTakenOff, 1)
  // The careers row, and the four links into the Projects and News the trim hid, whose layouts are not reviewed here.
  assert.equal(times.linksLeft, 5)
  assert.equal(notes.filter((n) => /5 link\(s\) to pages taken off cannot be taken off/.test(n)).length, 1)
})

test('a link the site will not take off is set aside by name and the others still go; the rest of the tidy-up is not touched', async () => {
  const site = fakeSite(business)
  site.menuRows = studioMenu()
  site.emptiable = reviewedRows()
  site.refuse = new Set(['module-816.14'])
  const { notes, times } = await run({
    site,
    model: fakeModel(),
    ctx: studioUnticked()
  })
  assert.equal(site.applies.length, 2, 'the words, then the links the site took')
  assert.deepEqual(site.applies[1].empty_links, ['module-816.11'])
  assert.equal(site.menuRows.find((r) => r.id === 627).published, 0, 'the menu is still tidied')
  assert.equal(times.linksTakenOff, 1)
  assert.equal(times.linksRefused, 1)
  assert.equal(
    notes.filter((n) =>
      /1 link\(s\) to pages taken off were refused by the site and still lead there/.test(n)
    ).length,
    1
  )
})

test('a link the site refuses to take off is asked once, and one a person changed since is left to them', async () => {
  const site = fakeSite(business)
  site.menuRows = studioMenu()
  site.emptiable = new Map([...reviewedRows(), ['module-816.12', 'plain']])
  // The 404 page's row into the trimmed Projects is taken off with the others (TCH #1013); the site refuses it.
  site.refuse = new Set(['module-816.12'])
  // Between the words and the links, a person points the careers row somewhere of their own.
  site.later = { 'module-816.14': 'https://jobs.example.org/' }
  const { notes, times } = await run({
    site,
    model: fakeModel(),
    ctx: studioUnticked()
  })
  assert.equal(
    site.attempts.filter((keys) => keys.includes('module-816.12')).length,
    1,
    'the write of the words never names it, and the refused take-off is not asked again'
  )
  assert.equal(site.applies[0].changes['module-816.12'], undefined, 'never sent to the contact page')
  assert.deepEqual(site.applies.at(-1).empty_links, ['module-816.11'])
  assert.equal(times.linksTakenOff, 1)
  assert.equal(
    notes.filter((n) =>
      /1 link\(s\) to pages taken off changed on the site since they were read, and were left/.test(n)
    ).length,
    1
  )
})

// ── What sits under an entry taken off, and a link entry into a path of the site that nothing answers ─────────
const FEATURED = 'index.php?option=com_content&view=featured'
/** A menu entry's whole row as `readMenu` reads it: top level of the English top bar, an article, unless said otherwise. */
const menuRow = (id, title, more = {}) => {
  const alias = more.alias ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return {
    id,
    menutype: 'tb-main-en',
    type: 'component',
    published: 1,
    home: 0,
    parent_id: 1,
    alias,
    path: alias,
    link: `index.php?option=com_content&view=article&id=${id + 1000}`,
    title,
    language: 'en-GB',
    ...more
  }
}
/**
 * The marketing kit of `tracy-business/j6` as measured 05/10/2026 on a bakery's site made with Apply (ledger L30): the judge
 * took the kit's heading off, its pages stayed published under it, and the planner had already retitled one of them ("Slide"
 * became "Home"), so no title tied it to the kit. Joomla routes `/en/marketing-kit/slide` from the top of the menu through
 * published entries only: a 404, which the mega menu still offered.
 */
const kitMenu = () => [
  menuRow(596, 'Home', {
    menutype: 'tb-system',
    alias: 'northgate-home',
    home: 1,
    language: '*',
    link: FEATURED
  }),
  menuRow(599, 'Home', { alias: 'home', home: 1, link: FEATURED }),
  menuRow(600, 'About'),
  menuRow(604, 'Contact', { link: 'index.php?option=com_contact&view=contact&id=14' }),
  menuRow(606, 'Marketing Kit', { menutype: 'tb-kit-en', type: 'heading', link: '' }),
  menuRow(613, 'Home', {
    menutype: 'tb-kit-en',
    parent_id: 606,
    alias: 'slide',
    path: 'marketing-kit/slide'
  }),
  menuRow(615, 'Style guide', {
    menutype: 'tb-kit-en',
    parent_id: 606,
    alias: 'styleguide',
    path: 'marketing-kit/styleguide'
  }),
  // No template puts a home entry there: what is asked is that a home entry stays wherever it sits.
  menuRow(640, 'Start', {
    menutype: 'tb-kit-en',
    parent_id: 606,
    alias: 'start',
    path: 'marketing-kit/start',
    home: 1
  }),
  // An alias and a link entry under the heading lead by their own address, not through the heading: they stay.
  { ...aliasOf(643, 'Our story', 600), menutype: 'tb-kit-en', parent_id: 606 },
  menuRow(644, 'About us', {
    menutype: 'tb-kit-en',
    type: 'url',
    parent_id: 606,
    alias: 'about-us',
    path: 'marketing-kit/about-us',
    link: '/en/about'
  }),
  // A home entry is served at /en/ whatever sits above it, so an alias of it leads somewhere.
  aliasOf(645, 'Start here', 640),
  // The edition nobody asked for, its heading already off: not this tidy-up's business.
  menuRow(651, 'Маркетинг', {
    menutype: 'tb-kit-ru',
    type: 'heading',
    language: 'ru-RU',
    published: 0,
    alias: 'marketing-kit',
    link: ''
  }),
  menuRow(652, 'Слайд', {
    menutype: 'tb-kit-ru',
    language: 'ru-RU',
    parent_id: 651,
    alias: 'slide',
    path: 'marketing-kit/slide'
  })
]
/** The kit menu with its heading already off, as the demo trim leaves an entry before Apply. */
const kitMenuOff = () => kitMenu().map((row) => (row.id === 606 ? { ...row, published: 0 } : row))
/** The menu entries one tidy-up batch wrote, by id. */
const menuWrites = (batch) =>
  batch.operations
    .filter((o) => o.kind === 'menuItem')
    .map((o) => o.id)
    .sort((a, b) => a - b)

test('the pages under a menu heading that is off go with it, in one transaction, whatever the planner retitled them; a home entry never', async () => {
  const site = fakeSite(business)
  site.menuRows = kitMenuOff()
  const { times, notes } = await run({ site, model: fakeModel(), ctx: studio() })
  const off = site.menuRows
    .filter((r) => r.published === 0)
    .map((r) => r.id)
    .sort((a, b) => a - b)
  assert.deepEqual(off, [606, 613, 615, 651], 'the heading and both pages under it')
  for (const id of [596, 599, 640, 643, 644, 645, 652])
    assert.equal(site.menuRows.find((r) => r.id === id).published, 1, `${id} stays`)
  assert.equal(site.batches.length, 1, 'one transaction')
  assert.deepEqual(menuWrites(site.batches[0]), [613, 615], 'what was off already is not written')
  assert.equal(times.menuOrphaned, 2)
  // The 404 page's row into the slide kit goes like a link into any page the tidy-up took off, and so do the four links
  // into the Projects and News the trim hid (TCH #1013): here no layout is reviewed, so they are left and said, and
  // nothing is sent to the contact page.
  assert.equal(site.applies.length, 1, 'only the words are written')
  assert.equal(times.linksLeft, 5)
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

test('a page under an entry the demo trim took off before Apply goes too, and so does an alias that leads to it', async () => {
  const site = fakeSite(business)
  site.menuRows = [
    menuRow(599, 'Home', { alias: 'home', home: 1, link: FEATURED }),
    menuRow(604, 'Contact', { link: 'index.php?option=com_contact&view=contact&id=14' }),
    menuRow(618, 'Careers', { menutype: 'tb-top-en', published: 0 }),
    menuRow(695, 'Open roles', {
      menutype: 'tb-top-en',
      parent_id: 618,
      alias: 'vacancies',
      path: 'careers/vacancies'
    }),
    menuRow(696, 'Bakery', {
      menutype: 'tb-top-en',
      parent_id: 695,
      alias: 'site',
      path: 'careers/vacancies/site'
    }),
    menuRow(697, 'Office', {
      menutype: 'tb-top-en',
      parent_id: 695,
      alias: 'office',
      path: 'careers/vacancies/office',
      published: 0
    }),
    aliasOf(627, 'Visit us', 696)
  ]
  // A row that does not say whether it is the home entry is read whole for it.
  for (const row of site.menuRows) if (row.id === 695 || row.id === 696) delete row.home
  const { times, notes } = await run({ site, model: fakeModel(), ctx: studio() })
  const off = site.menuRows
    .filter((r) => r.published === 0)
    .map((r) => r.id)
    .sort((a, b) => a - b)
  assert.deepEqual(off, [618, 627, 695, 696, 697])
  assert.equal(site.batches.length, 1, 'one transaction')
  assert.deepEqual(menuWrites(site.batches[0]), [627, 695, 696], 'what was off already is not written')
  assert.equal(times.menuOrphaned, 2)
  assert.equal(times.menuStranded, 1)
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

test('a page under an entry taken off that its listing does not say is the home entry is read whole: the home stays, one that cannot be read stays and is said', async () => {
  const site = fakeSite(business)
  site.menuRows = [
    menuRow(599, 'Home', { alias: 'home', home: 1, link: FEATURED }),
    menuRow(618, 'Careers', { menutype: 'tb-top-en', published: 0 }),
    ...[
      [695, 'vacancies'],
      [698, 'start'],
      [699, 'office']
    ].map(([id, alias]) => {
      const { home: _home, ...summary } = menuRow(id, alias, {
        menutype: 'tb-top-en',
        parent_id: 618,
        path: `careers/${alias}`
      })
      return summary
    })
  ]
  site.menuWhole.set(698, { home: 1 })
  site.unreadable.add(699)
  const { times, notes } = await run({ site, model: fakeModel(), ctx: studio() })
  assert.deepEqual(
    site.menuRows.filter((r) => r.published === 0).map((r) => r.id),
    [618, 695]
  )
  assert.equal(times.menuOrphaned, 1)
  assert.equal(
    notes.filter((n) => /1 menu entry\(ies\) under entries taken off could not be read/.test(n)).length,
    1,
    notes.join(' | ')
  )
})

test('an alias under an entry taken off goes when everything under it goes too, and is not said to hold an entry that stays', async () => {
  const site = fakeSite(business)
  site.menuRows = [
    menuRow(599, 'Home', { alias: 'home', home: 1, link: FEATURED }),
    menuRow(660, 'Programmes', { menutype: 'tb-top-en', type: 'heading', published: 0, link: '' }),
    menuRow(662, 'Tenders', { menutype: 'tb-top-en', published: 0 }),
    {
      ...aliasOf(661, 'Supplier portal', 662),
      menutype: 'tb-top-en',
      parent_id: 660,
      alias: 'suppliers'
    },
    menuRow(663, 'Register', {
      menutype: 'tb-top-en',
      parent_id: 661,
      alias: 'register',
      path: 'programmes/suppliers/register'
    })
  ]
  const { times, notes } = await run({ site, model: fakeModel(), ctx: studio() })
  assert.deepEqual(
    site.menuRows
      .filter((r) => r.published === 0)
      .map((r) => r.id)
      .sort((a, b) => a - b),
    [660, 661, 662, 663]
  )
  assert.equal(times.menuStranded, 1)
  assert.equal(times.menuOrphaned, 1)
  assert.deepEqual(
    notes.filter((n) => /hold entries that stay/.test(n)),
    []
  )
})

test('an entry the site will not take off keeps what sits under it and the links through it, written one record at a time', async () => {
  const site = fakeSite(business)
  site.menuRows = [
    ...kitMenu(),
    // A link entry that is a dead end only because the heading it goes through is taken off.
    menuRow(633, 'Kit slide', { type: 'url', alias: 'kit-slide', link: '/en/marketing-kit/slide' })
  ]
  site.refuseMenu.add(606)
  // The customer unticked the kit's heading in the Pages question: its section goes with it, but the site refuses the heading.
  const ctx = { ...studio(), brief: { ...studio().brief, pages: untickedPages('marketing-kit') } }
  const { times, notes } = await run({ site, model: fakeModel(), ctx })
  for (const id of [606, 633])
    assert.equal(site.menuRows.find((r) => r.id === id).published, 1, `${id} stays`)
  assert.equal(site.batches.length, 0, 'the transaction was refused whole')
  assert.equal(
    site.recordWrites.some((w) => w.kind === 'menuItem' && w.id === 633),
    false,
    'the link that went only with the heading was not written'
  )
  assert.equal(times.menuDeadLinks, 1)
  assert.equal(notes.filter((n) => /menuItem 606 could not be changed/.test(n)).length, 1)
  assert.equal(
    notes.filter((n) =>
      /menu entry\(ies\) that went only with one the site would not change were left/.test(n)
    ).length,
    1,
    notes.join(' | ')
  )
})

/** A link entry under the Resources heading. */
const linkEntry = (id, title, to) =>
  menuRow(id, title, {
    type: 'url',
    parent_id: 605,
    alias: `link-${id}`,
    path: `resources/link-${id}`,
    link: to
  })

test('a link entry into a path of the site that no entry answers goes; one into a live page, another site or a file stays', async () => {
  const site = fakeSite(business)
  site.menuRows = [
    ...kitMenuOff(),
    menuRow(605, 'Resources', { type: 'heading', link: '' }),
    // The template's demo of its own error page, which the planner retitled "About".
    linkEntry(617, 'About', '/en/this-page-does-not-exist'),
    linkEntry(632, 'Our story', '/en/about'),
    linkEntry(633, 'Kit slide', '/en/marketing-kit/slide'),
    linkEntry(634, 'Flour we use', 'https://example.org/flour'),
    linkEntry(635, 'Price list', '/images/menu.pdf'),
    linkEntry(636, 'Find us', '#map'),
    // No language prefix: whether this site routes a path without one is not known here.
    linkEntry(637, 'Opening hours', '/hours')
  ]
  const { times, notes } = await run({ site, model: fakeModel(), ctx: studio() })
  const off = site.menuRows
    .filter((r) => r.published === 0)
    .map((r) => r.id)
    .sort((a, b) => a - b)
  assert.deepEqual(
    off,
    [606, 613, 615, 617, 633, 651],
    'the error-page demo, and a link through the heading that is off'
  )
  for (const id of [605, 632, 634, 635, 636, 637])
    assert.equal(site.menuRows.find((r) => r.id === id).published, 1, `${id} stays`)
  assert.equal(site.batches.length, 1, 'one transaction')
  assert.equal(times.menuDeadLinks, 2)
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

test("a link entry the site may still answer stays: a category or another component reached, an alias, Joomla's own routes, a slash, a query, a redirect", async () => {
  const site = fakeSite(business)
  site.menuRows = [
    menuRow(599, 'Home', { alias: 'home', home: 1, link: FEATURED }),
    menuRow(600, 'About'),
    menuRow(603, 'News', { link: 'index.php?option=com_content&view=category&layout=blog&id=9' }),
    menuRow(604, 'Contact', { link: 'index.php?option=com_contact&view=contact&id=14' }),
    { ...aliasOf(624, 'About us', 600), alias: 'company-about', parent_id: 1 },
    menuRow(605, 'Resources', { type: 'heading', link: '' }),
    linkEntry(701, 'Fresh loaves', '/en/news/fresh-loaves'),
    linkEntry(702, 'Write to us', '/en/contact/form'),
    linkEntry(703, 'Who we are', '/en/company-about'),
    linkEntry(704, 'Old address', '/index.php/en/nowhere'),
    linkEntry(705, 'An article', '/en/component/content/article/5'),
    linkEntry(706, 'About, slashed', '/en/about/'),
    linkEntry(707, 'About, asked', '/en/about?tab=team'),
    linkEntry(708, 'Front page', '/en/'),
    linkEntry(709, 'Old menu', '/en/old-menu'),
    linkEntry(710, 'Summer menu', '/en/summer-menu'),
    // An article routes nothing below it, and a slash or a query does not make a dead end answer.
    linkEntry(711, 'Our team', '/en/about/team'),
    linkEntry(712, 'Nowhere', '/en/nowhere/?ref=menu'),
    linkEntry(713, 'Winter menu', '/en/winter-menu')
  ]
  site.redirectRows = [
    { id: 1, old_url: '/en/old-menu', new_url: '/en/about', published: 1 },
    { id: 2, old_url: 'http://golden-crust.localhost/en/summer-menu', new_url: '/en/', published: 1 },
    { id: 3, old_url: '/en/winter-menu', new_url: '/en/', published: 0 }
  ]
  const { times, notes } = await run({ site, model: fakeModel(), ctx: studio() })
  assert.deepEqual(
    site.menuRows.filter((r) => r.published === 0).map((r) => r.id),
    [711, 712, 713]
  )
  assert.equal(times.menuDeadLinks, 3)
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

test('a link entry is left when the site will not say which prefixes its languages route on, and that is said', async () => {
  const site = fakeSite(business)
  site.languageRows = null
  site.menuRows = [
    menuRow(599, 'Home', { alias: 'home', home: 1, link: FEATURED }),
    menuRow(605, 'Resources', { type: 'heading', link: '' }),
    linkEntry(617, 'About', '/en/this-page-does-not-exist')
  ]
  const { notes } = await run({ site, model: fakeModel(), ctx: studio() })
  assert.equal(site.menuRows.find((r) => r.id === 617).published, 1)
  assert.equal(
    notes.filter((n) => /1 menu link\(s\) into this site could not be checked/.test(n)).length,
    1,
    notes.join(' | ')
  )
})

// ── The page titles and descriptions a template keeps in its menu entries ──────────────────────────────────────
/** A dental clinic's brief: a description longer than a meta description, in the owner's own words. */
const clinic = () => {
  const about =
    'Riverside Dental Care is a family dental clinic in Da Nang offering check-ups, cleaning, whitening and braces for children and adults. ' +
    'Book online or call us; we open six days a week.'
  return {
    brief: { about, goal: 'contact', style: 'calm' },
    normalized: { name: 'Riverside Dental Care', about, tone: 'calm', contact: '', languages: ['en'] }
  }
}
/** A menu param set as a template ships it: the page's title and description beside the settings that are no words. */
const menuParams = (fields) =>
  JSON.stringify({ menu_show: 1, show_page_heading: '1', page_heading: '', ...fields, pageclass_sfx: '' })
/**
 * A one-language template's menu as it installs: its home entry advertises the template itself (the title and the
 * description of the template's sales page), a few pages carry a title or a description of their own, and the rest are
 * entries that set neither. More than one page of a listing that carries whole rows.
 */
const templateMenu = () => [
  { id: 1, menutype: '', published: 1, title: 'Menu_Item_Root', language: '*', home: 0, params: '{}' },
  ...Array.from({ length: 30 }, (_, i) => ({
    id: 200 + i,
    menutype: 'mainmenu',
    type: 'component',
    published: 1,
    title: `Page ${i + 1}`,
    language: '*',
    home: 0,
    params: menuParams({})
  })),
  {
    id: 101,
    menutype: 'mainmenu',
    type: 'component',
    published: 1,
    title: 'Home',
    language: '*',
    home: 1,
    params: menuParams({
      page_title: 'Starter Pro - Modern Joomla Template for Corporate & Business Sites',
      'menu-meta_description':
        'Discover Starter Pro, the ultimate Joomla template for companies, built on a modern framework with page builders.'
    })
  },
  {
    id: 118,
    menutype: 'mainmenu',
    type: 'component',
    published: 1,
    title: 'About',
    language: '*',
    home: 0,
    params: menuParams({
      page_title: 'About Starter Pro',
      'menu-meta_description': 'A demo about page of the Starter Pro template.'
    })
  },
  {
    id: 119,
    menutype: 'mainmenu',
    type: 'component',
    published: 1,
    title: 'Services',
    language: '*',
    home: 0,
    params: menuParams({ page_title: 'Our services at Riverside Dental Care' })
  },
  {
    id: 120,
    menutype: 'mainmenu',
    type: 'component',
    published: 0,
    title: 'Portfolio',
    language: '*',
    home: 0,
    params: menuParams({ page_title: 'Starter Pro portfolio demo' })
  },
  {
    id: 121,
    menutype: 'mainmenu-fr',
    type: 'component',
    published: 1,
    title: 'Accueil',
    language: 'fr-FR',
    home: 1,
    params: menuParams({ page_title: 'Starter Pro - Modèle Joomla moderne' })
  }
]

/**
 * A copy of a release whose presentation lock also ships these menu entries, as the template's archive holds them: what a
 * template ships is read from its lock, and neither real profile sets a title or a description on its home entry. With
 * `entries` null the copy carries no lock at all.
 * @param {{ dir: string }} contract
 * @param {Array<{ id: number }> | null} entries
 */
function releasing(contract, entries) {
  const dir = mkdtempSync(path.join(tmpdir(), 'joomla-release-'))
  for (const name of readdirSync(contract.dir))
    if (name !== 'presentation-lock.json') symlinkSync(path.join(contract.dir, name), path.join(dir, name))
  if (entries) {
    const lock = JSON.parse(readFileSync(path.join(contract.dir, 'presentation-lock.json'), 'utf8'))
    for (const { id, ...row } of entries)
      lock.entities[`menuItem-${id}`] = {
        published: '1',
        ...row,
        home: String(row.home ?? 0),
        params: typeof row.params === 'string' ? row.params : JSON.stringify(row.params ?? {})
      }
    writeFileSync(path.join(dir, 'presentation-lock.json'), JSON.stringify(lock))
  }
  return { ...contract, dir }
}
/** The template's menu as its archive ships it: every entry but the one whose title the owner wrote (119). */
const shippedMenu = () => templateMenu().filter((r) => r.id > 1 && r.id !== 119)

test("a template's own title and description in its menu entries give way to the owner's name and words, in the tidy-up's transaction", async () => {
  const site = fakeSite(base)
  site.menuRows = templateMenu()
  const { times, notes } = await run({
    contract: releasing(base, shippedMenu()),
    release: 'tracy-base/j6',
    site,
    ctx: { ...clinic(), normalized: { ...clinic().normalized, email: 'desk@riverside-dental.test' } }
  })
  const params = (id) => JSON.parse(site.menuRows.find((r) => r.id === id).params)
  const home = params(101)
  assert.equal(home.page_title, 'Riverside Dental Care', "the home page's title is the owner's name")
  const description = home['menu-meta_description']
  assert.ok(description.length > 0 && description.length <= 160, `${description.length} characters`)
  assert.ok(
    clinic().brief.about.startsWith(description),
    `the description is the owner's own words, cut at a sentence: ${description}`
  )
  assert.equal(home.show_page_heading, '1', 'every other setting of the entry is kept')
  assert.equal(home.pageclass_sfx, '')
  assert.deepEqual(
    [params(118).page_title, params(118)['menu-meta_description']],
    ['', ''],
    "another page's template title and description are emptied, so Joomla shows the entry's own title"
  )
  assert.equal(
    params(119).page_title,
    'Our services at Riverside Dental Care',
    "a title of the owner's is kept"
  )
  assert.equal(params(120).page_title, 'Starter Pro portfolio demo', 'an entry nobody can reach is left')
  assert.equal(
    params(121).page_title,
    'Starter Pro - Modèle Joomla moderne',
    'a language nobody can reach is left'
  )
  const written = site.recordWrites.filter((w) => w.kind === 'menuItem').map((w) => w.id)
  assert.deepEqual(written.sort(), [101, 118], 'an entry that sets neither is not written')
  assert.equal(site.batches.length, 1, "one transaction, the tidy-up's own")
  assert.match(site.batches[0].apply_id, /^tidy-/)
  assert.equal(times.pagesRetitled, 2)
  assert.deepEqual(
    notes.filter((n) => /could not/.test(n)),
    []
  )
})

// 🔒 A NAME LEFT BLANK NAMES NO PAGE (TCH #1013, 14/10/2026). Measured on the local stand (run j2): JA Essence, JA Impact,
// JA Nova and JA Vega Joomla with About given and Name blank all titled their home page after the site address ("Sqj2 03j
// P"), because the page titles took the label name the brand step had already learnt to leave alone.
test('a Name left blank keeps the home entry title as the template ships it, whatever name stands in for it', async () => {
  const site = fakeSite(base)
  site.menuRows = templateMenu()
  await run({
    contract: releasing(base, shippedMenu()),
    release: 'tracy-base/j6',
    site,
    ctx: { ...clinic(), normalized: { ...clinic().normalized, name: 'Sqj2 03j P', nameFrom: 'label' } }
  })
  const home = JSON.parse(site.menuRows.find((r) => r.id === 101).params)
  assert.equal(
    home.page_title,
    'Starter Pro - Modern Joomla Template for Corporate & Business Sites',
    'never the name made from the site address'
  )
})

test('an entry the tidy-up takes off is not written a title, and an owner who wrote nothing keeps the template description (D9)', async () => {
  const site = fakeSite(business)
  site.menuRows = [
    ...menuRows(),
    {
      id: 599,
      menutype: 'tb-main-en',
      type: 'component',
      published: 1,
      title: 'Home',
      language: 'en-GB',
      home: 1,
      params: menuParams({
        page_title: 'Starter Pro - Joomla template',
        'menu-meta_description': 'Starter Pro demo'
      })
    },
    {
      id: 640,
      menutype: 'tb-top-en',
      type: 'component',
      published: 1,
      title: 'Shareholders',
      language: 'en-GB',
      alias: 'shareholders',
      path: 'shareholders',
      home: 0,
      params: menuParams({ page_title: 'Shareholder relations' })
    }
  ]
  await run({
    contract: releasing(business, site.menuRows.slice(-2)),
    site,
    model: fakeModel(),
    ctx: {
      brief: { about: '', goal: 'contact', style: 'calm', pages: untickedPages('shareholders') },
      normalized: { name: 'Spoke & Chain Bikes', about: '', tone: 'calm', contact: '', languages: ['en'] }
    }
  })
  const home = JSON.parse(site.menuRows.find((r) => r.id === 599).params)
  assert.equal(home.page_title, 'Spoke & Chain Bikes')
  // 🔒 BLANK keeps the demo but the name (D9, TCH #1013, g58-ess-j-blank 10/10/2026): no words of the owner, so the
  // template's description stays, its demo company renamed where the release declares one (none here).
  assert.equal(
    home['menu-meta_description'],
    'Starter Pro demo',
    'no words of the owner: the template’s, never made up'
  )
  const shareholders = site.menuRows.find((r) => r.id === 640)
  assert.equal(shareholders.published, 0)
  assert.equal(JSON.parse(shareholders.params).page_title, 'Shareholder relations', 'only taken off')
})

/** An entry of a one-language template's main menu, as it installs. */
const entry = (id, title, params, more = {}) => ({
  id,
  menutype: 'mainmenu',
  type: 'component',
  published: 1,
  title,
  language: '*',
  home: 0,
  params,
  ...more
})

test("only a value the release itself ships is the template's: one that names the owner inside the template's words still goes, one of somebody else's stays", async () => {
  const shipped = [
    entry(101, 'Home', menuParams({ page_title: 'Kinetic — Signal home' }), { home: 1 }),
    entry(130, 'Features', menuParams({ page_title: 'Starter Pro features' }), { type: 'heading' }),
    entry(131, 'Blog', menuParams({ page_title: 'Starter Pro blog' })),
    entry(132, 'Team', menuParams({ page_title: 'Starter Pro team' }))
  ]
  const site = fakeSite(base)
  site.menuRows = [
    ...shipped.slice(0, 2),
    // The door may hand `params` decoded; a value written back is still the column's JSON.
    { ...shipped[2], params: JSON.parse(shipped[2].params) },
    // A column no JSON reader can read is not written over.
    { ...shipped[3], params: '{"page_title": "Starter Pro team' },
    entry(133, 'Prices', menuParams({ page_title: 'Opening hours and prices' }))
  ]
  const signal = {
    brief: { about: 'Signal is a cycling club in Hue with group rides every weekend.', goal: 'contact' },
    normalized: {
      name: 'Signal',
      about: 'Signal is a cycling club in Hue with group rides every weekend.',
      tone: 'friendly',
      contact: '',
      languages: ['en']
    }
  }
  await run({ contract: releasing(base, shipped), release: 'tracy-base/j6', site, ctx: signal })
  const params = (id) => {
    const held = site.menuRows.find((r) => r.id === id).params
    return typeof held === 'string' ? JSON.parse(held) : held
  }
  assert.equal(params(101).page_title, 'Signal', "the release's own title, though it holds the owner's name")
  assert.equal(params(131).page_title, '', 'a decoded column is read and written back as JSON')
  assert.equal(typeof site.menuRows.find((r) => r.id === 131).params, 'string')
  const written = site.recordWrites.filter((w) => w.kind === 'menuItem').map((w) => w.id)
  assert.deepEqual(
    written.sort(),
    [101, 131],
    'a heading has no page, an unreadable column is not written over, and a title the release never shipped is left'
  )
})

test("a release that ships no lock tells the owner's words by their name as a word, not as letters inside another", async () => {
  const site = fakeSite(base)
  site.menuRows = [
    entry(101, 'Home', menuParams({ page_title: 'Planning your stay with us' }), { home: 1 }),
    entry(140, 'Classes', menuParams({ page_title: 'Morning classes at Ann' }))
  ]
  const about = 'Ann is a small yoga studio in Hoi An with morning classes.'
  const yoga = {
    brief: { about, goal: 'contact' },
    normalized: { name: 'Ann', about, tone: 'calm', contact: '', languages: ['en'] }
  }
  await run({ contract: releasing(base, null), release: 'tracy-base/j6', site, ctx: yoga })
  const params = (id) => JSON.parse(site.menuRows.find((r) => r.id === id).params)
  assert.equal(params(101).page_title, 'Ann', '"Planning" does not hold "Ann" as a word')
  assert.equal(params(140).page_title, 'Morning classes at Ann', "the owner's name as a word is theirs")
})

test('the menu is read once, whole: the judge, the entries that lead to a page that is off and the page titles share it', async () => {
  const site = fakeSite(business)
  site.menuRows = studioMenu()
  /** @type {string[]} */
  const asked = []
  const door = site.apply
  site.apply = async (call) => {
    if (call.params?.kind === 'menuItem' && /^content\.(list|get)$/.test(call.action))
      asked.push(`${call.action}${call.params.include_body ? ' whole' : ''}`)
    return door(call)
  }
  const { times } = await run({ site, model: fakeModel(), ctx: studio() })
  assert.equal(times.menuStranded, 2, 'where an alias leads is read from the row the menu gave')
  // Two passes: the article order is pinned before the demo trim writes (`pinArticleOrder`, its categories' sort options),
  // and the tidy-up reads the menu as the trim left it; neither reads an entry again.
  const pass = Math.floor(studioMenu().length / 25) + 1
  assert.deepEqual(
    asked,
    // The pin reads four pages at once (`listWhole`); the menu here fits in one round of them.
    Array.from({ length: 4 + pass }, () => 'content.list whole'),
    'two passes over the menu, whole rows, and no entry read again'
  )
})

test('a menu the site will not hand over is said once, and the rest of Apply goes on', async () => {
  const site = bikeShop()
  site.menuRows = templateMenu()
  const door = site.apply
  site.apply = async (call) =>
    call.action === 'content.list' && call.params?.kind === 'menuItem'
      ? { ok: false, message: 'the menu table is locked' }
      : door(call)
  const { notes, report } = await run({
    contract: releasing(base, shippedMenu()),
    release: 'tracy-base/j6',
    site,
    ctx: cyclist({ email: 'ride@spokechain.test' })
  })
  assert.ok(report.wrote > 0, 'the words were written')
  assert.equal(site.contactRows[0].email_to, 'ride@spokechain.test', 'the contact record is still tidied')
  assert.deepEqual(
    notes.filter((n) => /menu/.test(n)),
    [
      "the site's menu could not be read, so its entries and page titles were left as the template has them: the menu table is locked"
    ]
  )
})

test("a home page's description is the owner's own description, never their answers to the questions", async () => {
  const site = fakeSite(base)
  site.menuRows = templateMenu()
  const said =
    'Business name: Riverside Dental Care\nWhat do you offer: check-ups, cleaning and whitening for families in Da Nang.'
  await run({
    contract: releasing(base, shippedMenu()),
    release: 'tracy-base/j6',
    site,
    ctx: {
      brief: { about: '', said, goal: 'contact' },
      normalized: { name: 'Riverside Dental Care', about: said, tone: 'calm', contact: '', languages: ['en'] }
    }
  })
  const home = JSON.parse(site.menuRows.find((r) => r.id === 101).params)
  assert.equal(home.page_title, 'Riverside Dental Care')
  assert.equal(
    home['menu-meta_description'],
    'Discover Starter Pro, the ultimate Joomla template for companies, built on a modern framework with page builders.',
    'the "Label: answer" lines of the questions are no description: the template keeps its own (D9)'
  )
})

test('a description is cut whole: never inside a character, at a sentence that is one, else at a word', () => {
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
  const exact = `${'a'.repeat(150)} bcdefghi.`
  assert.equal(Array.from(exact).length, 160)
  assert.equal(ownExcerpt(exact), exact, 'exactly 160 characters is kept whole')

  const smiling = ownExcerpt(`${'a'.repeat(158)}😀😀😀 smile`)
  assert.ok(Array.from(smiling).length <= 160, `${Array.from(smiling).length} characters`)
  assert.ok(!lone.test(smiling), 'no half of a character')

  const clinicZh = `${'我们是一家位于岘港的家庭牙科诊所'.repeat(2)}。${'提供检查洗牙美白和牙套服务'.repeat(5)}。${'欢迎预约'.repeat(30)}。`
  const zh = ownExcerpt(clinicZh)
  assert.equal(Array.from(zh).length, 99, 'two whole sentences: the first alone is too short to stand as one')
  assert.ok(clinicZh.startsWith(zh) && zh.endsWith('。'))

  const doctor =
    'Visit Dr. Lan Pham and her team at Riverside Dental Care for gentle check-ups, cleaning, whitening and braces for children and adults in the heart of Da Nang, six days a week'
  const visit = ownExcerpt(doctor)
  assert.notEqual(visit, 'Visit Dr.', 'an abbreviation is no sentence')
  assert.ok(visit.startsWith('Visit Dr. Lan Pham') && visit.endsWith('…'), visit)
  assert.ok(Array.from(visit).length <= 160)

  const street =
    'Riverside Dental Care has cared for families since the clinic opened on Tran Phu St. Lan Pham and her team offer check-ups, cleaning and whitening for all ages, every single day of the week.'
  const opened = ownExcerpt(street)
  assert.ok(!opened.endsWith('St.'), `a street's abbreviation ends nothing: ${opened}`)
  assert.ok(opened.endsWith('…') && street.startsWith(opened.slice(0, -1)), opened)
})

test("the owner's words go on the home page of the language they wrote in and the one every language shares; another edition's home keeps no template description", async () => {
  const home = (id, menutype, language, params) => ({
    id,
    menutype,
    type: 'component',
    published: 1,
    title: 'Home',
    language,
    home: 1,
    params: menuParams(params)
  })
  const homes = () => [
    home(596, 'tb-system', '*', { 'menu-meta_description': 'Starter Pro demo home' }),
    home(599, 'tb-main-en', 'en-GB', {
      page_title: 'Starter Pro - Joomla template',
      'menu-meta_description': 'Discover Starter Pro'
    }),
    home(632, 'tb-main-ru', 'ru-RU', {
      page_title: 'Starter Pro - шаблон Joomla',
      'menu-meta_description': 'Откройте Starter Pro'
    })
  ]
  const release = releasing(business, homes())
  const described = async (about, writtenIn) => {
    const site = fakeSite(business)
    site.menuRows = homes()
    await run({
      contract: release,
      site,
      ctx: {
        brief: { about, goal: 'contact' },
        normalized: {
          name: 'Riverside Dental Care',
          about,
          tone: 'calm',
          contact: '',
          languages: ['en', 'ru'],
          writtenIn
        }
      }
    })
    const params = (id) => JSON.parse(site.menuRows.find((r) => r.id === id).params)
    return Object.fromEntries(
      [596, 599, 632].map((id) => [id, [params(id).page_title, params(id)['menu-meta_description']]])
    )
  }
  const english = 'Riverside Dental Care is a family dental clinic in Da Nang.'
  assert.deepEqual(await described(english, 'en'), {
    596: [undefined, english],
    599: ['Riverside Dental Care', english],
    632: ['Riverside Dental Care', '']
  })
  const vietnamese = 'Nha khoa Riverside là phòng khám gia đình ở Đà Nẵng.'
  assert.deepEqual(await described(vietnamese, 'vi'), {
    596: [undefined, vietnamese],
    599: ['Riverside Dental Care', ''],
    632: ['Riverside Dental Care', '']
  })
})

// ── The contact record when the owner gave no mailbox or no phone ─────────────────────────────────────────────
/** A bike shop's one-language site whose contact record is the template's company, as it installs. */
const bikeShop = ({ contact = {}, menu = [] } = {}) => {
  const site = fakeSite(base)
  site.contactRows = [
    {
      id: 31,
      published: 1,
      language: '*',
      name: 'Head office',
      email_to: 'office@demo-company.test',
      telephone: '+1 555 0100',
      mobile: '+1 555 0101',
      fax: '+1 555 0102',
      params: JSON.stringify({ show_email: '' }),
      ...contact
    }
  ]
  site.menuRows = menu
  return site
}
const cyclist = (given = {}) => {
  const about = 'Spoke & Chain Bikes repairs, sells and rents city and mountain bikes in Hue.'
  return {
    brief: { about, goal: 'contact', style: 'friendly' },
    normalized: {
      name: 'Spoke & Chain Bikes',
      about,
      tone: 'friendly',
      contact: '',
      languages: ['en'],
      ...given
    }
  }
}
const contactPage = (params) => ({
  id: 140,
  menutype: 'mainmenu',
  type: 'component',
  published: 1,
  title: 'Contact',
  language: '*',
  home: 0,
  link: 'index.php?option=com_contact&view=contact&id=31',
  params: JSON.stringify(params)
})

test("without the owner's mailbox the account's address is written nowhere, whatever the page shows: the template's goes and the form is off", async () => {
  const cases = [
    ['the record shows its address', bikeShop({ contact: { params: JSON.stringify({ show_email: '1' }) } })],
    ['its menu entry shows it', bikeShop({ menu: [contactPage({ show_email: '1' })] })],
    ['nothing shows it', bikeShop({ menu: [contactPage({ show_email: '0' })] })]
  ]
  for (const [why, site] of cases) {
    const { notes, ctx } = await run({ contract: base, release: 'tracy-base/j6', site, ctx: cyclist() })
    const [row] = site.contactRows
    assert.equal(row.email_to, '', `${why}: the template's company gets no visitor's message`)
    assert.equal(row.telephone, '', `${why}: the template's phone goes, no number of the owner's (#1367)`)
    assert.ok(!everyWrite(site).includes(ctx.email), `${why}: the account's address is written nowhere`)
    assert.equal(notes.filter((n) => FORM_OFF.test(n)).length, 1, `${why}: ${notes.join(' | ')}`)
  }
})

test("what the owner typed still wins, and the template's other numbers go with its own; a value the site fills in itself is left", async () => {
  const typed = bikeShop()
  await run({
    contract: base,
    release: 'tracy-base/j6',
    site: typed,
    ctx: cyclist({ email: 'ride@spokechain.test', phone: '0234 567 890' })
  })
  assert.deepEqual(
    (({ email_to, telephone, mobile, fax }) => ({ email_to, telephone, mobile, fax }))(typed.contactRows[0]),
    { email_to: 'ride@spokechain.test', telephone: '0234 567 890', mobile: '', fax: '' }
  )

  const wired = bikeShop({ contact: { telephone: '{site.phone}', mobile: '', fax: '' } })
  await run({ contract: base, release: 'tracy-base/j6', site: wired, ctx: cyclist() })
  assert.equal(wired.contactRows[0].telephone, '{site.phone}', 'a placeholder the site fills is its own')
  assert.equal(wired.contactRows[0].email_to, '', "no visitor's message reaches the template's company")
})

// ── The language a one-language template is written in ──────────────────────────────────────────────────────
test('a template that ships one language is written in the language the owner picked, not in English by default', async () => {
  const studioIn = (languages) => ({ ...studio(), normalized: { ...studio().normalized, languages } })
  const german = await run({ contract: base, release: 'tracy-base/j6', ctx: studioIn(['de']) })
  assert.equal(german.prepared.written, 'de-DE')
  const slots = german.model.calls.filter((c) => !Array.isArray(c)).flatMap((c) => c.slots ?? [])
  assert.ok(slots.length > 0)
  assert.deepEqual([...new Set(slots.map((s) => s.language))], ['de-DE'], 'every line is asked for in German')
  assert.deepEqual(
    german.notes.filter((n) => /one language/.test(n)),
    [],
    'one language was asked for, and it was the one written'
  )

  const first = await run({ contract: base, release: 'tracy-base/j6', ctx: studioIn(['vi', 'en']) })
  assert.equal(first.prepared.written, 'vi-VN', 'of two, the first one picked')
  assert.ok(
    first.notes.some((n) => /only vi-VN was written/.test(n)),
    first.notes.join(' | ')
  )
})

/** The keys of the kit sample pages of Tracy Business 1.2.0 that hold words (K3). */
const kitTextKeys = () => {
  const kit = /^(?:article-56[2-6]|module-(?:67[3-9]|68\d|817)|menuItem-6(?:06|07|09|11|13|15))$/
  return new Set(
    mapOf(business)
      .slots.filter((s) => kit.test(s.entity) && s.type === 'text')
      .map((s) => s.key)
  )
}

test('the kit sample pages keep the template content: the customer words never go there (K3)', async () => {
  const model = fakeModel()
  const { site } = await run({ model })
  const kit = kitTextKeys()
  assert.ok(kit.size > 200)
  const planned = new Set(model.calls.flatMap((c) => (c.slots ?? []).map((s) => s.key)))
  assert.ok(![...kit].some((key) => planned.has(key)), 'no kit line is handed to the model')
  assert.ok(![...kit].some((key) => key in site.applied.changes), 'an English site keeps the kit as shipped')
})

test('a site written in another language gets the kit sample pages in it, pictures and values untouched (K3)', async () => {
  const { site } = await run({
    ctx: { normalized: { ...context(business, 'x').ctx.normalized, languages: ['vi-vn'] } }
  })
  const { changes } = site.applied
  // The template's own Vietnamese where it ships one, the model's elsewhere.
  for (const key of ['article-562.1', 'menuItem-615.0', 'module-817.0']) {
    const sample = mapOf(business).slots.find((s) => s.key === key).sample
    assert.ok(changes[key] && changes[key] !== sample, `${key}: ${changes[key]}`)
  }
  assert.ok(!('module-674.2' in changes), 'a picture stays')
  assert.ok(!('module-687.5' in changes), 'a colour value is no word')
})

/** Tracy Business 1.2.0 with a copy file beside it that declares the demo company's names (D9). */
function withDemoNames(names) {
  const root = mkdtempSync(path.join(tmpdir(), 'tb-copy-'))
  const dir = path.join(root, path.basename(business.dir))
  symlinkSync(business.dir, dir)
  writeFileSync(`${dir}.copy.json`, JSON.stringify({ keptText: [], demoCompanyNames: names }))
  return { ...business, dir }
}

const nameOnly = (contract, normalized = {}) => ({
  brief: { about: '', goal: 'contact', style: 'friendly' },
  normalized: { ...context(contract, 'x').ctx.normalized, about: '', nameFrom: 'answer', ...normalized }
})

test('a name with no description renames the demo company in the words kept, never in an address (D9)', async () => {
  // A test spelling list: "Zavolzhye" stands for a demo name kept in a kit line, "northgate" for one inside file paths.
  const contract = withDemoNames(['Zavolzhye', 'Zavolzhye 2', 'northgate'])
  const { site } = await run({ contract, model: fakeModel({ down: true }), ctx: nameOnly(contract) })
  const { changes } = site.applied
  // The archive speaks in identity tokens, so the name is the token the site fills in; the longest spelling goes whole.
  assert.equal(changes['module-674.3'], '{site.name} wins the {site.name} infrastructure tender')
  for (const key of ['module-683.3', 'module-684.12'])
    assert.ok(!(key in changes), `${key}: a file path is never renamed (${changes[key]})`)
})

test('a description given renames the demo company too; a name taken from the site address, or no names declared, renames nothing (ABOUT-3)', async () => {
  const contract = withDemoNames(['Zavolzhye'])
  const given = await run({
    contract,
    model: fakeModel({ down: true }),
    ctx: {
      ...nameOnly(contract),
      brief: { about: 'A family bakery.', goal: 'contact', style: 'friendly' }
    }
  })
  assert.equal(
    given.site.applied?.changes?.['module-674.3'],
    '{site.name} wins the {site.name} 2 infrastructure tender'
  )
  const label = await run({
    contract,
    model: fakeModel({ down: true }),
    ctx: nameOnly(contract, { nameFrom: 'label' })
  })
  assert.equal(label.site.applied?.changes?.['module-674.3'], undefined)
  const none = await run({ model: fakeModel({ down: true }), ctx: nameOnly(business) })
  assert.equal(none.site.applied?.changes?.['module-674.3'], undefined)
})

// 🔒 ABOUT GIVEN, A NAME GIVEN: NO DEMO COMPANY NAME STAYS ON THE SITE, KEPT TEXT AND `keep` SLOTS INCLUDED (spec TCQR ABOUT-3,
// 25/10/2026). accept-boxing-1025.tracy.site (JA Boxing j6 1.0.3, "Saigon Iron Boxing Gym", About filled) still printed "We
// opened Studio Getfit in 2008" on four class pages, "Systems Training Center" on ten learning-center pages and "JA Boxing" in
// the search masthead: the rename ran only with About blank, never reached a `keep` slot, and the copy file missed a name.
const boxing = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.3')

test('JA Boxing, About and a name given: no demo company name survives in any line a visitor reads (ABOUT-3)', async () => {
  assert.ok(boxing, 'the checkout ships the JA Boxing j6 1.0.3 profile')
  const about = 'Saigon Iron Boxing Gym is a boxing gym in District 3, Saigon, for beginners and fighters.'
  const { site, prepared } = await run({
    contract: boxing,
    release: 'quickstart/ja-boxing/j6',
    // A model that keeps the demo's own words: what a real one does with a sentence it has no fact to replace.
    model: fakeModel({ say: (s) => (s.type === 'text' ? s.sample : null) }),
    ctx: {
      brief: { about, goal: 'contact', style: 'friendly' },
      normalized: {
        ...context(boxing, 'x').ctx.normalized,
        name: 'Saigon Iron Boxing Gym',
        about,
        nameFrom: 'answer'
      }
    }
  })
  const written = Object.assign({}, ...site.applies.map((a) => a.changes ?? {}))
  // #189: "We opened Studio Getfit in 2008" states a founding year; renamed it would put that year under the owner's name,
  // so it is never renamed but emptied after the write.
  // R12 group A (`settleKeptSlots`): never emptied silently either; the emptied line is on the row as "blanked", a blocker
  // of the final check until the repair loop or a person writes it.
  const emptied = new Set((prepared.demoBlanks ?? []).map((s) => s.key))
  const blanked = new Set(prepared.copyLines?.blanked ?? [])
  for (const key of ['article-2.3', 'article-14.3']) {
    assert.ok(emptied.has(key), `${key} is emptied`)
    assert.ok(blanked.has(key), `${key} is reported as blanked`)
    assert.doesNotMatch(String(written[key] ?? ''), /2008/)
  }
  const leaks = []
  // A block taken off whole shows none of its lines (R12 group A, `settleKeptSlots`).
  const off = new Set((prepared.factModules ?? []).map((m) => `module-${m.id}`))
  for (const slot of mapOf(boxing).slots) {
    if (slot.type !== 'text' || slot.requiresEvidence || emptied.has(slot.key) || off.has(slot.entity))
      continue
    const shown = String(written[slot.key] ?? slot.sample ?? '')
      // An address or a mailbox is the template's (K1), never a name a visitor reads.
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '')
    for (const demo of ['Studio Getfit', 'Getfit studio', 'JA Boxing', 'Systems Training Center'])
      if (shown.includes(demo)) leaks.push(`${slot.key} (${slot.customize ?? 'fill'}): ${demo}`)
  }
  assert.deepEqual(leaks, [])
})

// 🔒 A `keep` SLOT KEEPS ITS MEANING, NOT ITS LANGUAGE (LANG-2, 25/10/2026). accept-boxing-104-vi.tracy.site (JA Boxing j6 1.0.4,
// Vietnamese, "Saigon Iron Boxing Gym") still printed "THE WORKOUT", "Our Classes", "Join over 100k of inspiring creatives",
// "Sign up for the Boxing newsletter", "More Blogs", "Video Trainer"…: section headings the full-coverage capture declares
// `keep`, split into styled fragments ("THE" + "WORKOUT"), and Customize never wrote a keep slot but for the demo name.
const boxing104 = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.4')

test('JA Boxing 1.0.4 in Vietnamese: every keep line a visitor reads is written in Vietnamese, a split heading as one phrase', async () => {
  assert.ok(boxing104, 'the checkout ships the JA Boxing j6 1.0.4 profile')
  const about = 'Saigon Iron Boxing Gym is a boxing gym in District 3, Saigon, for beginners and fighters.'
  const model = fakeModel()
  const { site } = await run({
    contract: boxing104,
    release: 'quickstart/ja-boxing/j6',
    model,
    ctx: {
      brief: { about, goal: 'contact', style: 'friendly' },
      normalized: {
        ...context(boxing104, 'x').ctx.normalized,
        name: 'Saigon Iron Boxing Gym',
        about,
        nameFrom: 'answer',
        languages: ['vi']
      }
    }
  })
  const written = Object.assign({}, ...site.applies.map((a) => a.changes ?? {}))
  const english = []
  for (const slot of mapOf(boxing104).slots) {
    if (slot.customize !== 'keep' || slot.type !== 'text' || slot.requiresEvidence) continue
    // Template strings go through the site's language overrides; a person's name is the brand step's.
    if (/^(?:languageString|user|siteSetting)-/.test(slot.entity)) continue
    if (!/\p{L}/u.test(slot.sample)) continue
    if (written[slot.key] === undefined || written[slot.key] === slot.sample)
      english.push(`${slot.key}: ${slot.sample}`)
  }
  assert.deepEqual(english, [])
  // The fragments of one heading are translated together, so the phrase reads in Vietnamese order.
  const asked = model.pieces.map((p) => p.pieces.join('|'))
  for (const heading of [
    'THE|WORKOUT',
    'Our| Classes ',
    'Join over |100k| of inspiring creatives',
    'Sign up for the |Boxing| newsletter'
  ])
    assert.ok(asked.includes(heading), `asked as one phrase: ${heading}`)
  assert.equal(written['module-157.20'], 'vi THE')
  assert.equal(written['module-160.6'], ' vi of inspiring creatives')
})

// ABOUT LEFT BLANK: THE NAME CHANGES AND NOTHING ELSE, EVEN WITH A MODEL (spec TCQR ABOUT-3, K7). The D9 tests above run with the
// model down; this one gives the engine a working text model and a picture model.
test('About blank with a working model and a picture model: no line is written by a model, no picture is drawn', async () => {
  const contract = withDemoNames(['Zavolzhye', 'Zavolzhye 2'])
  const drawing = await withPictures()
  const asked = []
  const pictures = { ...drawing, fetchImpl: (url, init) => (asked.push(url), drawing.fetchImpl(url, init)) }
  const model = fakeModel()
  const { site } = await run({ contract, model, pictures, ctx: nameOnly(contract) })
  assert.deepEqual(model.calls, [], 'the planner is never asked to write the demo words')
  assert.deepEqual(model.repairs, [])
  assert.deepEqual(asked, [], 'no picture is drawn from the name')
  assert.equal(site.applied.changes['module-674.3'], '{site.name} wins the {site.name} infrastructure tender')
})

// THE DEMO COMPANY'S CONTACT DETAILS NEVER STAND FOR THE CUSTOMER'S (TCH #1367, 15/10/2026; it replaces D12 of 11/10/2026): the
// offices strip of Tracy Business is unpublished, nothing written into it, and the site identity's phone, mailbox, address
// and hours nobody gave are emptied, its legal name and slogan too, so the layout leaves those lines out.
test('About given, no phone or address: the offices strip goes unwritten and the identity keeps no detail of the demo company', async () => {
  const { site, prepared } = await run({ model: fakeModel() })
  for (const key of ['module-812.4', 'module-812.5', 'module-812.6'])
    assert.ok(!(key in site.applied.changes), `${key}: ${site.applied.changes[key]}`)
  assert.ok(
    prepared.factModules.some((m) => m.id === 812),
    'the offices strip is unpublished'
  )
  for (const key of [
    'module-4369.1',
    'module-4369.2',
    'module-4369.4',
    'module-4369.5',
    'module-4369.6',
    'module-4369.7'
  ])
    assert.equal(site.applied.changes[key], '', `${key} is emptied`)
  assert.ok(Object.keys(site.applied.changes).length > 100, 'the rest of the words are written')
})

// 🔒 A SOCIAL OR ICON LINK'S NAME IS NOT THE BUSINESS'S WORDS, AND A PLACEHOLDER IS NOT WORDS (sq-check mod-lad1..8, 13–14/10/2026,
// `guard.js`). JA Mood j6 1.0.2's Social List: four `<a title="Facebook">` icons over an invisible `<span>empty</span>`. A full
// Vietnamese brief wrote the bakery's phrases into the titles and "trống" into the spans; a translation made "Google cộng".
const mood = contractFor(defaultContracts(), 'quickstart/ja-mood/j6', '1.0.2')

test('JA Mood: the social icons keep their networks’ names and their blank lines, whatever the model or a translation writes', async () => {
  assert.ok(mood, 'the checkout ships the JA Mood j6 1.0.2 profile')
  const map = mapOf(mood)
  // The icons, read off the slots' own shape: a link's `title`, or a text inside a link that the template leaves "empty".
  const icons = map.slots.filter(
    (s) =>
      (s.xpath ?? '').endsWith('/a/@title') && /^(?:facebook|twitter|instagram|google plus)$/i.test(s.sample)
  )
  const blanks = map.slots.filter(
    (s) => /\/a\/span\[\d+\]\/text\(\)$/.test(s.xpath ?? '') && s.sample === 'empty'
  )
  assert.equal(icons.length, 8, 'two Social List modules of four icons')
  assert.equal(blanks.length, 8)
  const brief = 'Tiệm bánh gia đình ở Dubai, nướng bánh mì sourdough và bánh mì Việt mỗi sáng.'
  const { site } = await run({
    contract: mood,
    release: 'quickstart/ja-mood/j6',
    // What the model wrote on the stand: the business's phrases on every link's words, "trống" for "empty".
    model: fakeModel({
      say: (s) => (s.sample === 'empty' ? 'trống' : s.element === 'a' ? 'Bánh mì Việt' : null)
    }),
    ctx: {
      brief: { about: brief, goal: 'contact', style: 'friendly' },
      normalized: {
        name: 'Tiệm Bánh Tamarind',
        about: brief,
        tone: 'friendly',
        contact: '',
        languages: ['vi']
      }
    }
  })
  const written = Object.assign({}, ...site.applies.map((a) => a.changes ?? {}))
  for (const slot of [...icons, ...blanks])
    assert.ok(
      !(slot.key in written),
      `${slot.key} (${slot.sample}) keeps its words, got ${JSON.stringify(written[slot.key])}`
    )
  assert.ok(!Object.values(written).includes('trống'), 'no line is written with a placeholder')
  assert.ok(
    Object.keys(written).length > 20,
    `the rest of the page is written (${Object.keys(written).length})`
  )
})

/** A Tracy Base site whose Resources › Blog lists category 8, and an opportunity's build that fills it with two posts. */
function woBlogSite() {
  const site = fakeSite(base)
  site.menuRows = [
    { id: 1, menutype: '', published: 1, title: 'Menu_Item_Root', language: '*' },
    {
      id: 101,
      menutype: 'mainmenu',
      alias: 'home',
      path: 'home',
      link: 'index.php?option=com_content&view=featured',
      type: 'component',
      published: 1,
      home: 1,
      title: 'Home',
      language: '*'
    },
    {
      id: 110,
      menutype: 'mainmenu',
      alias: 'resources',
      path: 'resources',
      type: 'heading',
      published: 1,
      title: 'Resources',
      language: '*'
    },
    {
      id: 111,
      menutype: 'mainmenu',
      alias: 'blog',
      path: 'resources/blog',
      link: 'index.php?option=com_content&view=category&layout=blog&id=8',
      type: 'component',
      published: 1,
      title: 'Blog',
      language: '*',
      params: {}
    }
  ]
  site.categoryRows = [{ id: 8, parent_id: 1, title: 'Blog', published: 1 }]
  // Fictional blog rows must not reuse this release's bound Home Dark/Header article IDs.
  site.articleRows = [900030, 900031, 900032].map((id, i) => ({
    id,
    catid: 8,
    title: `Demo ${id}`,
    alias: `demo-${id}`,
    introtext: '<p>demo</p>',
    fulltext: '',
    state: 1,
    featured: 0,
    publish_up: `2024-0${i + 1}-01 00:00:00`
  }))
  return site
}
const woStore = () => {
  const store = {
    receipts: /** @type {Record<string, any>} */ ({}),
    forSite: async () => ({
      buildId: 'wo-b1',
      items: [
        { id: 'p1', title: 'Pho night', body: 'Every <Tuesday>.' },
        { id: 'p2', title: 'New chef', body: 'Welcome Linh.' }
      ],
      pagePlan: {
        pages: [{ id: 'resources/blog', role: 'blog', keep: true, fill: 'sourced', items: ['p1', 'p2'] }]
      },
      before: {},
      writes: {}
    }),
    recordBefore: async (_b, _k, fields) => fields,
    recordWrite: async (_b, key, receipt) => {
      store.receipts[key] = receipt
    }
  }
  return store
}

test('a build no opportunity made writes no article of the blog', async () => {
  const site = woBlogSite()
  await run({ contract: base, release: 'tracy-base/j6', site })
  assert.ok(site.articleRows.every((a) => a.title.startsWith('Demo ') && a.state === 1))
})

test("an opportunity's build writes the restaurant's posts into the blog's demo articles, newest first, and hides the rest", async () => {
  const site = woBlogSite()
  const store = woStore()
  const { times } = await run({ contract: base, release: 'tracy-base/j6', site, woContent: store })
  const byId = (id) => site.articleRows.find((a) => a.id === id)
  assert.equal(byId(900032).title, 'Pho night')
  assert.equal(byId(900032).introtext, '<p>Every &lt;Tuesday&gt;.</p>')
  assert.equal(byId(900032).alias, 'demo-900032')
  assert.equal(byId(900031).title, 'New chef')
  assert.equal(byId(900030).state, 0)
  assert.equal(store.receipts['article:900032'].state, 'written')
  assert.equal(times.woContentWritten, 2)
})

// Website Opportunities, sourced page words (tasks/plan-wo-contract-writer.md): pinned into the plan before the one apply.
const copyStore = (pinned) => {
  const store = {
    receipts: /** @type {Record<string, any>} */ ({}),
    asked: /** @type {any[]} */ ([]),
    forSite: async () => null,
    copyFor: async (who) => {
      store.asked.push(who)
      return { buildId: 'wo-b2', pinned, before: {}, writes: {} }
    },
    recordBefore: async (_b, _k, fields) => fields,
    recordWrite: async (_b, key, receipt) => {
      store.receipts[key] = receipt
    }
  }
  return store
}
const SOURCED = {
  'hero.title': { value: 'The Moss Station', source: 'business.name' },
  'hero.lead': { value: 'A Highland kitchen and wine bar in Hoi An.', source: 'profile.bio' },
  'hero.cta': { value: { label: 'Call', href: 'tel:+842355550188' }, source: 'business.phone' },
  'about.story': {
    value: { title: 'Our story', text: 'We opened in Sapa in 2015.' },
    source: 'post:facebook:1'
  },
  cards: [{ value: { title: 'Bun cha', text: 'Grilled pork with noodles.' }, source: 'post:instagram:1' }],
  contact: {}
}

test("an opportunity's sourced words go into the one contract write, and the model is never asked for those slots", async () => {
  const store = copyStore(SOURCED)
  const model = fakeModel()
  const { site } = await run({ model, woContent: store })
  const changes = site.applied.changes
  assert.equal(changes['module-441.1'], 'The Moss Station')
  assert.equal(changes['module-441.3'], 'A Highland kitchen and wine bar in Hoi An.')
  assert.deepEqual([changes['module-441.4'], changes['module-441.5']], ['Call', 'tel:+842355550188'])
  assert.deepEqual(
    [changes['module-838.0'], changes['module-838.1']],
    ['Our story', 'We opened in Sapa in 2015.']
  )
  assert.deepEqual(
    [changes['module-838.2'], changes['module-838.6']],
    ['Bun cha', 'Grilled pork with noodles.']
  )
  // The second card had no dish: the planner writes it, as it writes the slots no source names.
  assert.match(changes['module-838.3'], /^Golden /)
  const asked = new Set(model.calls.flatMap((c) => (c.slots ?? []).map((s) => s.key)))
  for (const key of ['module-441.1', 'module-441.3', 'module-441.4', 'module-838.0', 'module-838.2'])
    assert.equal(asked.has(key), false, key)
  assert.ok(asked.has('module-838.3'), 'an unpinned card is still the planner’s')
  assert.deepEqual(store.receipts['slot:module-441.1'], {
    state: 'written',
    role: 'hero.title',
    source: 'business.name'
  })
  assert.equal(store.receipts['slot:module-838.6'].role, 'cards[0]')
  assert.equal(store.asked[0].lang, 'en')
  assert.equal(store.asked[0].cards, 4)
})

test('a sourced slot a person already changed keeps their words, and its receipt says conflict', async () => {
  const store = copyStore(SOURCED)
  const site = fakeSite(business, { edited: { 'module-441.1': 'Our own heading' } })
  await run({ site, woContent: store })
  assert.equal('module-441.1' in site.applied.changes, false)
  assert.equal(store.receipts['slot:module-441.1'].state, 'conflict')
  assert.equal(store.receipts['slot:module-441.3'].state, 'written')
})

// Spec TracyHQ/tracy#189 item 18: a record the site plan pins (a reviewer's or a person's name) into a line that wants
// evidence is written with its own record as evidence, never skipped back to the demo's name.
test('#189 a pinned record in an evidence line is written, not left in the demo’s name', async () => {
  const store = copyStore(SOURCED)
  store.sitePlanFor = async () => ({
    honesty: {
      values: { 'module-183.3': { value: 'Ada Quill', reason: 'brief-person', evidence: 'Ada Quill' } }
    }
  })
  const { site } = await run({ contract: base, release: 'tracy-base/j6', woContent: store })
  assert.equal(site.applied.changes['module-183.3'], 'Ada Quill')
})

test('a site no opportunity built is planned as before: nothing pinned, no receipt', async () => {
  const store = copyStore(SOURCED)
  store.copyFor = async () => null
  const { site } = await run({ woContent: store })
  assert.match(site.applied.changes['module-441.1'], /^Golden /)
  assert.deepEqual(store.receipts, {})
})

// Spec TracyHQ/tracy#189 (C09): a brief build never leaves a line it gave the copy writer in the demo's words. The double echoes
// two long lines and writes the rest as before: one takes the site plan's fallback through the contract, the other (no
// neutral words for it) is not written and is emptied after the write.
test('#189 lines the writer echoed in the demo’s words take the plan’s fallback or are emptied, never the demo', async () => {
  const map = mapOf(business)
  const pageEntities = new Set()
  for (const page of map.pages ?? []) {
    if (page?.entity) pageEntities.add(page.entity)
    for (const m of page?.assignedModules ?? []) if (m?.entity) pageEntities.add(m.entity)
  }
  const [fallen, emptied] = map.slots.filter(
    (s) =>
      s.type === 'text' &&
      !s.requiresEvidence &&
      pageEntities.has(s.entity) &&
      !/[{}<>]|\(\(/.test(s.sample) &&
      String(s.sample).trim().split(/\s+/).length > 8 &&
      Number(s.maxCharacters) >= 80
  )
  assert.ok(fallen && emptied, 'the release has long lines on its pages')
  const fallback = 'Fresh bread from Golden Crust Bakery.'
  const plan = {
    slots: [fallen, emptied].map((s) => ({ key: s.key, decision: 'text' })),
    honesty: { fallbacks: { [fallen.key]: { value: fallback, reason: 'brief-offering-quote' } } }
  }
  const echo = new Set([fallen.key, emptied.key])
  const { prepared, site } = await run({
    model: fakeModel({ say: (s) => (echo.has(s.key) ? s.sample : null) }),
    woContent: { sitePlanFor: async () => plan }
  })
  assert.equal(prepared.changes[fallen.key], fallback)
  assert.equal(site.applied.changes[fallen.key], fallback)
  assert.ok(!(emptied.key in prepared.changes), 'the demo line is not written back')
  // 🔒 Never emptied in a kept block (R12 group A, `settleKeptSlots`): its block comes off whole, or the line goes to the
  // repair loop as unwritten.
  const off = (prepared.factModules ?? []).some((m) => `module-${m.id}` === emptied.entity)
  const unwritten = (prepared.copyLines?.unwritten ?? []).map((line) => line.key)
  assert.ok(off || unwritten.includes(emptied.key), `${emptied.key} comes off with its block or is unwritten`)
  assert.ok(
    off || !prepared.demoBlanks.some((s) => s.key === emptied.key),
    'it is not emptied in a kept block'
  )
})

// Spec TracyHQ/tracy#189 (COO rule 29/10/2026): a form block the site plan took off for want of a destination is unpublished
// with the fact modules, in every design, and none of its words is written, whatever the copy writer said.
test('#189 a sign-up block with no destination is unpublished and none of its lines is written', async () => {
  const map = mapOf(business)
  const slot = map.slots.find(
    (s) => s.type === 'text' && !s.requiresEvidence && /^module-\d+$/.test(s.entity)
  )
  assert.ok(slot, 'the release has a module line')
  const id = Number(slot.entity.slice('module-'.length))
  const plan = {
    slots: [{ key: slot.key, decision: 'text' }],
    honesty: {
      hide: [{ how: 'entity', entity: slot.entity, kind: 'module', reason: 'no-form-destination' }],
      records: []
    }
  }
  const { prepared, site } = await run({
    model: fakeModel(),
    woContent: { sitePlanFor: async () => plan }
  })
  assert.ok(
    prepared.factModules.some((m) => m.id === id),
    'the block is queued to be unpublished'
  )
  for (const s of map.slots.filter((x) => x.entity === slot.entity))
    assert.ok(!(s.key in prepared.changes), `${s.key} is not written`)
  assert.ok(site.hiddenModules.includes(id), 'and it is unpublished on the site')
})

// 🔒 A BROKEN SITE IS NEVER HANDED OVER (spec TracyHQ/tracy#189): after the menu tidy-up the home page and the kept pages are
// read; one that does not answer 200 takes the tidy-up's menu take-offs back, and the reason is in the report.
test('a site whose home page stops answering after the menu tidy-up gets its menu take-offs back, said in the report', async () => {
  const site = fakeSite(business)
  site.menuRows = studioMenu()
  const read = []
  const siteReader = async () => ({
    page: async (url) => {
      read.push(url)
      // The home page answers again once the unticked Careers entry is back.
      return { status: site.menuRows.find((r) => r.id === 618)?.published === 1 ? 200 : 404, html: '' }
    }
  })
  const { notes, times } = await run({ site, model: fakeModel(), ctx: studioUnticked(), siteReader })
  assert.ok(read.includes('/'), 'the home page is read after the tidy-up')
  assert.equal(site.menuRows.find((r) => r.id === 618).published, 1, 'the entry taken off is back')
  assert.ok(times.tidyMenuReverted > 0)
  assert.ok(
    notes.some((n) =>
      /after the menu tidy-up \/ answered 404, so its \d+ menu change\(s\) were taken back$/.test(n)
    ),
    notes.join(' | ')
  )
})

test('a site that answers after the menu tidy-up keeps its take-offs', async () => {
  const site = fakeSite(business)
  site.menuRows = studioMenu()
  const siteReader = async () => ({ page: async () => ({ status: 200, html: '' }) })
  const { notes, times } = await run({ site, model: fakeModel(), ctx: studioUnticked(), siteReader })
  assert.equal(site.menuRows.find((r) => r.id === 618).published, 0)
  assert.equal(times.tidyMenuReverted, undefined)
  assert.ok(!notes.some((n) => /taken back/.test(n)))
})

// Picture reads/drawing must finish on their own clock before the first CMS write (#189, round 8).
for (const trade of [
  { name: 'Copperleaf Bakery', about: 'A bakery making bread each morning.' },
  { name: 'Northgate Dental', about: 'A dental clinic providing routine dental care.' }
]) {
  test(`${trade.name}: stalled picture preparation leaves the full text write phase available`, async () => {
    const site = fakeSite(boxing104)
    const model = fakeModel()
    const identity = {
      id: 900080,
      title: 'Owner contact block',
      module: 'mod_custom',
      published: 1,
      language: '*',
      params: '{}',
      content:
        '<p><a href="tel:5550109000">5550109000</a></p>' +
        '<ul><li><a href="https://instagram.com/demo"><i class="fab fa-instagram"></i></a></li></ul>' +
        '<iframe src="https://www.google.com/maps/embed?pb=demo"></iframe>' +
        '<img src="images/demo/company-logo.png" alt="logo">'
    }
    site.moduleRows.push(identity)
    site.articleRows.push({
      id: 900081,
      catid: 900082,
      title: 'Template post',
      introtext: '<p>Demo</p>',
      state: 1,
      language: '*'
    })
    site.menuRows.push({
      id: 900083,
      type: 'component',
      title: 'Blog',
      alias: 'blog',
      path: 'blog',
      menutype: 'footer',
      link: 'index.php?option=com_content&view=article&id=900081',
      published: 1,
      home: 0,
      parent_id: 1,
      level: 1,
      language: '*',
      params: '{}'
    })
    const sitePlan = {
      contact: { phone: { value: '+1 555 010 0111', href: 'tel:+15550100111' } },
      socials: { decision: 'keep', keep: { instagram: 'https://instagram.com/fictional-owner' } },
      map: { decision: 'address', embed: 'https://www.google.com/maps?q=14%20Fictional%20Lane&output=embed' },
      logo: { decision: 'name-as-text', name: trade.name, demoFiles: ['images/demo/company-logo.png'] },
      posts: { decision: 'hide', demoArticles: [{ id: 900081 }] }
    }
    const originalAnswer = site.answer
    site.answer = async (call) => {
      const { action, params } = call
      if (action === 'content.list' && params.kind === 'module' && !params.search) {
        const rows = site.moduleRows
        return { ok: true, items: rows.slice(params.offset ?? 0, (params.offset ?? 0) + params.limit) }
      }
      if (action === 'content.get' && params.kind === 'module' && params.id === identity.id)
        return { ok: true, item: { ...identity } }
      const steps =
        action === 'content.batch' ? params.operations : action === 'content.update' ? [params] : []
      for (const step of steps)
        if (step.kind === 'module' && step.id === identity.id) Object.assign(identity, step.fields)
      return originalAnswer(call)
    }
    const { ctx, notes } = context(boxing104, 'quickstart/ja-boxing/j6', {
      brief: { about: trade.about, goal: 'contact', style: 'plain' },
      normalized: { name: trade.name, nameFrom: 'answer', about: trade.about, languages: ['en'], contact: '' }
    })
    let reads = 0
    const realPictures = { forSite: async () => null, recordPlan: async (_id, plan) => plan }
    const engine = createJoomlaEngine({
      models: model.models,
      applyFor: () => throughDoor(site.apply),
      siteFile: () => () => {
        reads++
        return new Promise(() => {})
      },
      realPictures,
      woContent: { sitePlanFor: async () => sitePlan }
    })
    const wrapped = createQuickstartFirstEngine({ legacy: engine, woContent: {} })
    const prepared = await wrapped.prepare(ctx)
    supplyBlankRows(site, boxing104, prepared.prepared.demoBlanks)
    prepared.prepared.real = {
      buildId: 'fictional-portrait-build',
      pictures: [
        {
          id: 'owner-phone',
          width: 1152,
          height: 2048,
          source: 'google',
          vision: { subject: 'interior', textPresence: 'absent', quality: 'high' }
        }
      ],
      bytes: async () => null
    }
    const started = Date.now()
    await preparePicturesBeforeApply(wrapped, ctx, prepared, 250, 10)
    assert.ok(Date.now() - started < 2000, 'a hung picture reader is bounded')
    assert.ok(reads > 0, `the real engine tried to measure its picture slots: ${notes.join('; ')}`)
    assert.equal(site.calls.length, 0, 'preparation must not even pin article order')
    const beforeApply = reads
    const result = await wrapped.apply(ctx, prepared)
    assert.ok(result.wrote > 0, 'the owner text still reaches the plugin-validated CMS')
    assert.equal(reads, beforeApply, 'apply never retries the unavailable pictures')
    assert.ok(notes.some((note) => /picture preparation/.test(note)))
    assert.ok(site.applies.length > 0, 'contract writes still run through the real plugin validator')
    assert.match(identity.content, /tel:\+15550100111/)
    assert.match(identity.content, /instagram.com\/fictional-owner/)
    assert.match(identity.content, /14%20Fictional%20Lane/)
    assert.ok(identity.content.includes(trade.name), 'the logo falls back to the owner name')
    assert.doesNotMatch(identity.content, /company-logo\.png|instagram.com\/demo/)
    assert.equal(site.menuRows.find((row) => row.id === 900083).published, 0, 'the demo blog menu is removed')
  })
}

test('completed picture preparation is consumed once, with fresh plugin validation before writing', async () => {
  const site = fakeSite(boxing104)
  const { ctx } = context(boxing104, 'quickstart/ja-boxing/j6')
  const model = fakeModel()
  const { siteFile } = await withPictures()
  let reads = 0
  const realPictures = {
    forSite: async () => null,
    recordPlan: async (_id, plan) => plan,
    recordOutcome: async () => {}
  }
  const engine = createJoomlaEngine({
    models: model.models,
    applyFor: () => throughDoor(site.apply),
    siteFile: (key) => async (file) => {
      reads++
      return siteFile(key)(file)
    },
    realPictures
  })
  const prepared = await engine.prepare(ctx)
  supplyBlankRows(site, boxing104, prepared.demoBlanks)
  prepared.real = { buildId: 'fictional-empty-photo-build', pictures: [], bytes: async () => null }
  await preparePicturesBeforeApply(engine, ctx, prepared, 10_000)
  assert.ok(prepared.realPictureShape?.shaped.length > 0)
  assert.equal(site.calls.length, 0, 'no CMS write before the write phase')
  const beforeApply = reads
  await engine.apply(ctx, prepared)
  assert.equal(reads, beforeApply, 'the completed shapes are not prepared again')
  assert.ok(site.uploads.length > 0, 'the prepared shapes reach the existing Apply media door')
  assert.ok(
    site.applies.some((call) =>
      Object.values(call.changes ?? {}).some((v) => String(v).includes('tracy-content/'))
    )
  )
})

for (const [trade, label, channel, href] of [
  ['bakery', 'Order a cake', 'whatsapp', 'https://wa.me/441234567890'],
  ['dental clinic', 'Book an appointment', 'contact', 'index.php?Itemid=168']
])
  test(`${trade}: declared header and shared button actions survive the Joomla writer`, async () => {
    const { planSite } = await import('website-opportunities/domain/site-plan.mjs')
    const map = mapOf(boxing104)
    const actions = {
      'module-176.1': { kind: 'primary-cta', urlKey: 'module-176.0' },
      'languageString-256948293.0': { kind: 'go-to-item' },
      'languageString-30910664.0': {
        kind: 'open-map',
        uses: [{ kind: 'open-map', destination: '#modalMap' }]
      }
    }
    for (const slot of map.slots)
      if (actions[slot.key]) {
        slot.role = 'editorial.button_label'
        slot.action = actions[slot.key]
      }
    const plan = planSite(
      {
        business: { name: 'Fictional business' },
        primaryAction: {
          label,
          channel,
          href: channel === 'contact' ? null : href,
          basis: 'sourced',
          evidence: []
        }
      },
      { questions: [] },
      { contentMap: map }
    )
    const { prepared, site } = await run({
      contract: boxing104,
      release: 'quickstart/ja-boxing/j6',
      model: fakeModel({ say: () => 'Contact' }),
      woContent: { sitePlanFor: async () => plan }
    })
    for (const [key, value] of Object.entries({
      'module-176.1': label,
      'module-176.0': href,
      'languageString-256948293.0': 'View details',
      'languageString-30910664.0': 'Get directions'
    })) {
      assert.equal(prepared.changes[key], value, key)
      assert.equal(
        site.applies.findLast((a) => key in a.changes)?.changes[key] ??
          map.slots.find((s) => s.key === key)?.sample,
        value,
        `${key} reaches the actual write`
      )
    }
    assert.ok(
      !site.applies.some((a) => Object.values(a.changes).includes('#modalMap')),
      'the modal trigger was never rewritten'
    )
  })

for (const trade of ['bakery', 'dental clinic']) {
  test(`${trade}: a role-mismatched team masthead is repaired in the actual Joomla contract write`, async () => {
    const key = 'module-162.29'
    const value = 'Meet the people behind our work.'
    const { prepared, site } = await run({
      contract: contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8'),
      ctx: {
        brief: { about: `Example business provides ${trade} services.`, goal: 'contact', style: 'friendly' }
      },
      release: 'quickstart/ja-boxing/j6',
      model: fakeModel({ say: () => 'Come on in, we are glad you are here.' }),
      woContent: {
        sitePlanFor: async () => ({
          slots: [
            {
              key,
              decision: 'value',
              reason: 'intro-role',
              pageRole: 'team',
              value,
              page: 'about-us/our-trainers'
            }
          ]
        })
      }
    })
    assert.equal(prepared.changes[key], value)
    assert.equal(site.applies.findLast((a) => key in a.changes)?.changes[key], value)
  })
}

for (const [trade, name, label, description] of [
  [
    'pottery studio',
    'Clayhouse Studio',
    'Book a class',
    'A small pottery studio teaching wheel throwing to beginners.'
  ],
  [
    'dental clinic',
    'Brightside Dental',
    'Book a check-up',
    'A family dental clinic for check-ups and cleaning.'
  ]
])
  test(`${trade}: the home call-to-action band of JA Boxing 1.0.8 is written with a message for its primary action`, async () => {
    const { planSite } = await import('website-opportunities/domain/site-plan.mjs')
    const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
    const plan = planSite(
      {
        business: { name, description },
        primaryAction: { label, channel: 'contact', href: null, basis: 'sourced', evidence: [] }
      },
      { questions: [] },
      { contentMap: mapOf(contract) }
    )
    const heading = `Ready to ${label.toLowerCase()}?`
    const line = `${name} welcomes you.`
    const { prepared, site } = await run({
      contract,
      ctx: { brief: { about: description, goal: 'contact', style: 'friendly' } },
      release: 'quickstart/ja-boxing/j6',
      // The copy writer keeps the band's demo claim; only the band step is asked for the action's message.
      model: fakeModel({
        say: (s) =>
          s.band
            ? s.part === 'heading'
              ? heading
              : line
            : s.key === 'module-161.0'
              ? 'Free 7-day trial'
              : null
      }),
      // The plan's button decisions and brand; the fake site cannot take other demo records off.
      woContent: {
        sitePlanFor: async () => ({
          slots: plan.slots.filter((s) => s.reason === 'button-action'),
          brand: { name: { value: name }, description: { value: description } }
        })
      }
    })
    for (const [key, value] of Object.entries({
      'module-161.0': heading,
      'module-161.1': line,
      'module-161.3': label
    })) {
      assert.equal(prepared.changes[key], value, key)
      assert.equal(
        site.applies.findLast((a) => key in a.changes)?.changes[key],
        value,
        `${key} reaches the write`
      )
    }
    assert.ok(!(prepared.demoBlanks ?? []).some((s) => String(s.key).startsWith('module-161.')))
    assert.ok(!(prepared.factModules ?? []).some((m) => m.id === 161), 'the band stays on the page')
  })

// Spec TracyHQ/tracy#189 item 30 (COO decision 30/10/2026): a band that loses its working parts comes off whole. On a local
// build of JA Boxing 1.0.8 the footer's sign-up box came off (no destination in the brief) and its band kept only the logo,
// alone in an empty strip. The release declares the band (`layoutBands`): the logo module goes with the sign-up box.
for (const [trade, name] of [
  ['florist', 'Willow Lane Flowers'],
  ['dental clinic', 'Brightside Dental']
])
  test(`${trade}: the footer logo of JA Boxing 1.0.8 comes off with the sign-up box beside it`, async () => {
    const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
    const map = mapOf(contract)
    const band = map.layoutBands.find((b) => b.parts.some((p) => p.part === 'decoration'))
    const working = band.parts.find((p) => p.part === 'working').entity
    const logo = band.parts.find((p) => p.part === 'decoration').entity
    const { prepared, site, times } = await run({
      contract,
      release: 'quickstart/ja-boxing/j6',
      woContent: {
        sitePlanFor: async () => ({
          slots: [],
          brand: { name: { value: name } },
          honesty: {
            hide: [{ how: 'entity', entity: working, kind: 'module', reason: 'no-form-destination' }],
            records: []
          }
        })
      }
    })
    const id = (entity) => Number(entity.slice('module-'.length))
    const off = (prepared.factModules ?? []).map((m) => m.id)
    assert.ok(off.includes(id(working)), 'the sign-up box is taken off')
    assert.ok(off.includes(id(logo)), 'the logo beside it goes with it')
    assert.ok(site.hiddenModules.includes(id(logo)), 'and it is unpublished on the site')
    assert.equal(times.bandDecorationRemoved, 1)
    for (const s of map.slots.filter((x) => x.entity === logo))
      assert.ok(!(s.key in prepared.changes), `${s.key} is not written`)
  })
