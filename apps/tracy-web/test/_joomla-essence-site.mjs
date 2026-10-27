/**
 * A bound JA Essence j6 1.0.4 site (the release dev g58-ess-j-full was made from, 10/10/2026) and a model double, for the
 * tests of a Joomla Apply on it: the contract's slots as shipped, the release's categories and tags, every write remembered.
 */
import { readFileSync } from 'node:fs'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { throughDoor } from './_apply-door.mjs'

export const essence = contractFor(defaultContracts(), 'quickstart/ja-essence/j6', '1.0.4')
export const map = JSON.parse(readFileSync(`${essence.dir}/content-map.json`, 'utf8'))
const lock = JSON.parse(readFileSync(`${essence.dir}/presentation-lock.json`, 'utf8'))

/** The release's rows of one kind (`category`, `tag`), as the site lists them. */
const rowsOf = (/** @type {string} */ kind) =>
  Object.entries(lock.entities)
    .filter(([key]) => key.startsWith(`${kind}-`))
    .map(([key, row]) => ({
      id: Number(key.slice(kind.length + 1)),
      language: '*',
      .../** @type {any} */ (row)
    }))

/** The release's articles, as a site lists them whole (`content.list` `include_body`). */
export const essenceArticles = () => rowsOf('article').map((a) => ({ ...a }))

/**
 * A model double. A planner batch gets `say(slot)` for every text line (else "Bakery <key>"); a translation batch (an array)
 * and a line asked alone (`You translate one line`) get `translate(text)`; `lookup(input)` answers first when it gives a string.
 * @param {{ say?: (slot: any) => string | null, translate?: (text: string) => string, lookup?: (input: any) => string | null }} [hooks]
 */
export function essenceModel({ say = () => null, translate = (text) => text, lookup = () => null } = {}) {
  /** @type {Array<{ system: string, input: any }>} */
  const calls = []
  return {
    calls,
    models: async () => ({
      text: {
        usage: () => ({}),
        chat: async ({ messages }) => {
          const system = String(messages[0].content)
          const input = JSON.parse(messages[1].content)
          calls.push({ system, input })
          const own = lookup(input)
          if (own !== null) return own
          if (system.startsWith('You are tidying')) return '{"relabel": {}}'
          if (system.startsWith('You finish the words')) return '{"values": {}}'
          // The seeder's button translator (`template-buttons.mjs`): each label through `translate`.
          if (system.startsWith('Translate the labels'))
            return JSON.stringify({
              values: Object.fromEntries((input.labels ?? []).map((l) => [l.key, translate(l.label)]))
            })
          // One line asked alone after its batch could not be used (`translate-lines.js`).
          if (system.startsWith('You translate one line'))
            return JSON.stringify({ text: translate(input.text) })
          if (Array.isArray(input))
            return JSON.stringify(input.map(({ i, text }) => ({ i, text: translate(text) })))
          const values = {}
          for (const s of input.slots ?? []) {
            if (s.requiresEvidence) continue
            values[s.key] =
              s.type === 'text' && s.sample.trim()
                ? (say(s) ?? `Bakery ${s.key}`).slice(0, s.maxCharacters)
                : s.sample
          }
          return JSON.stringify({ values, pending: [], invented: [] })
        }
      }
    })
  }
}

/** A bound JA Essence site: it hands over the contract's slots as shipped and remembers every contract and record write. */
export function essenceSite() {
  const site = {
    revision: 'rev-1',
    /** @type {Record<string, string>[]} */
    writes: [],
    /** @type {any[]} */
    records: [],
    /** @type {any[]} every call that is not a read */
    calls: [],
    /** The site's tags, as `content.list` gives them (the release's lock carries none). */
    tags: [
      { id: 1, title: 'ROOT', alias: 'root', path: '', parent_id: 0, level: 0, published: 1, language: '*' },
      {
        id: 2,
        title: 'Lifestyle',
        alias: 'lifestyle',
        path: 'lifestyle',
        parent_id: 1,
        level: 1,
        published: 1,
        language: '*'
      },
      {
        id: 3,
        title: 'Line art',
        alias: 'line-art',
        path: 'line-art',
        parent_id: 1,
        level: 1,
        published: 1,
        language: '*'
      },
      { id: 4, title: 'Old', alias: 'old', path: 'old', parent_id: 1, level: 1, published: 0, language: '*' }
    ],
    /** @type {any[] | null} the site's articles, as `content.list` gives them whole; null lists none */
    articles: null,
    apply: async (/** @type {any} */ { action, params }) => {
      if (action === 'content.list' && params.kind === 'article')
        return {
          ok: true,
          items: (site.articles ?? []).slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 25))
        }
      if (action === 'content.list')
        return {
          ok: true,
          items: params.offset
            ? []
            : params.kind === 'category'
              ? rowsOf('category')
              : params.kind === 'tag'
                ? site.tags
                : []
        }
      if (action === 'content.get') return { ok: false, error: 'not_found' }
      site.calls.push({ action, params })
      if (action === 'content.update') return site.records.push(params), { ok: true }
      if (action === 'content.batch') return site.records.push(...params.operations), { ok: true }
      if (action === 'media.upload') return { ok: true }
      if (action === 'template.languageOverrides') return site.overrides(params)
      if (action !== 'content.contract') return { ok: false, error: `unknown action: ${action}` }
      switch (params.operation) {
        case 'inspect':
          return {
            ok: true,
            contract: essence.id,
            revision: site.revision,
            slots: map.slots.map((/** @type {any} */ s) => ({ ...s, current: s.sample })),
            pages: map.pages,
            job: null
          }
        case 'apply':
          site.writes.push(params.changes ?? {})
          site.revision = 'rev-2'
          return { ok: true, afterRevision: 'rev-2' }
        case 'demoTrim.apply':
          return { ok: true, status: 'completed', moved: 0 }
        case 'siteLanguage.plan':
          return site.languagePlan(params)
        case 'siteLanguage.set':
          return { ok: true, status: 'completed', locale: params.locale }
        default:
          return {
            ok: false,
            error: 'unsupported',
            message: `Unknown contract operation ${params.operation}`
          }
      }
    },
    /** `siteLanguage.plan`: an older plugin names no headings. Replaced by a test that needs it. */
    languagePlan: (/** @type {any} */ params) => ({ ok: true, locale: params.locale, titles: undefined }),
    /** `template.languageOverrides`: an older plugin knows no such action. Replaced by a test that needs it. */
    overrides: (/** @type {any} */ _params) => ({ ok: false, error: 'bad_action', message: 'unknown action' })
  }
  return site
}

export const ABOUT = 'Tiệm bánh gia đình ở Dubai, nướng bánh mì sourdough và bánh mì Việt mỗi sáng.'
export const NAME = 'Tiệm Bánh Tamarind & Co'

/** A JA Essence Apply: About given (`about`), or the name alone (`about: ''`); `siteReader` reads the site as a visitor does. */
export async function runEssence({
  about = ABOUT,
  model = essenceModel(),
  languages = ['vi'],
  site = essenceSite(),
  siteReader = null
} = {}) {
  const notes = []
  const times = {}
  const ctx = {
    siteKey: 'ess-test',
    label: 'tamarind',
    platform: 'joomla',
    quickstart: 'quickstart/ja-essence/j6',
    contract: essence,
    email: 'owner@example.com',
    brief: { about, goal: 'contact', style: 'plain' },
    normalized: { name: NAME, nameFrom: 'answer', about, tone: 'plain', contact: '', languages },
    signal: new AbortController().signal,
    time: (/** @type {string} */ name, /** @type {number} */ ms) => {
      times[name] = ms
    },
    note: (/** @type {string} */ n) => notes.push(n),
    deadlineAt: Date.now() + 60_000
  }
  // Through the Apply door's allowlist, as `applyAs` reaches a real site: a call the door refuses never reaches this one.
  const engine = createJoomlaEngine({
    models: model.models,
    applyFor: () => throughDoor(site.apply),
    siteReader
  })
  const prepared = await engine.prepare(ctx)
  await engine.apply(ctx, prepared)
  const written = Object.assign({}, ...site.writes)
  return { site, written, notes, times, model, prepared }
}
