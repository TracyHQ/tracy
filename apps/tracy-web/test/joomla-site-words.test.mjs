/**
 * The words of a Joomla site that are not the contract's (LANG-2, TCH #1013): measured 10/10/2026 on dev g58-ess-j-full
 * (JA Essence j6 1.0.4, FULL, Vietnamese), the tag names stayed English ("Lifestyle", "Line art") beside translated
 * categories. A site written in another language calls its tags in it, aliases kept, as its categories are.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { writeLanguageOverrides } from '../src/sites/brief-engines/joomla-site-strings.js'
import { essenceModel, runEssence } from './_joomla-essence-site.mjs'
import { throughDoor } from './_apply-door.mjs'

const toVi = (/** @type {string} */ text) => `VI ${text}`

test('a Vietnamese site calls its published tags in Vietnamese, aliases kept, the root tag untouched', async () => {
  const { site } = await runEssence({ model: essenceModel({ translate: toVi }) })
  const tags = site.records.filter((r) => r.kind === 'tag')
  assert.deepEqual(tags.map((r) => [r.id, r.fields]).sort(), [
    [2, { title: 'VI Lifestyle' }],
    [3, { title: 'VI Line art' }]
  ])
})

test('an English site renames no tag', async () => {
  const { site } = await runEssence({ model: essenceModel({ translate: toVi }), languages: ['en'] })
  assert.deepEqual(
    site.records.filter((r) => r.kind === 'tag'),
    []
  )
})

/** A plugin that knows `template.languageOverrides`: JA Essence's strings that read in en-GB in vi-VN, as it names them. */
function withOverrides(/** @type {any} */ site) {
  const sets = []
  site.overrides = (/** @type {any} */ params) => {
    if (params.operation === 'read')
      return {
        ok: true,
        template: params.template,
        locale: params.locale,
        strings: [
          { key: 'TPL_SHARE_ARTICLE', source: 'Share article:', reason: 'missing' },
          { key: 'TPL_TAGS_IN', source: 'Tags in: ', reason: 'missing' },
          { key: 'COM_CONTENT_ARTICLE_INFO', source: 'Details', reason: 'suspect' },
          { key: 'MY_OWN', source: 'Mine', reason: 'missing' }
        ],
        overrides: { MY_OWN: 'Của tôi' }
      }
    sets.push(params)
    return { ok: true, written: Object.keys(params.strings).length }
  }
  return sets
}

test('the template’s own strings become Vietnamese overrides, the site’s own override left alone', async () => {
  const { essenceSite } = await import('./_joomla-essence-site.mjs')
  const site = essenceSite()
  const sets = withOverrides(site)
  const { times } = await runEssence({ site, model: essenceModel({ translate: toVi }) })
  assert.equal(sets.length, 1)
  assert.equal(sets[0].template, 'ja_essence', 'the template is named from the release')
  assert.match(sets[0].apply_id, /^lover-/)
  assert.deepEqual(sets[0].strings, {
    TPL_SHARE_ARTICLE: 'VI Share article:',
    TPL_TAGS_IN: 'VI Tags in: ',
    COM_CONTENT_ARTICLE_INFO: 'VI Details'
  })
  assert.equal(times.languageOverrides, 3)
})

test('an English site writes no override; an older plugin is said, not failed', async () => {
  const { essenceSite } = await import('./_joomla-essence-site.mjs')
  const en = essenceSite()
  const sets = withOverrides(en)
  await runEssence({ site: en, model: essenceModel({ translate: toVi }), languages: ['en'] })
  assert.deepEqual(sets, [])
  const { notes } = await runEssence({ model: essenceModel({ translate: toVi }) })
  assert.ok(
    notes.some((n) => /cannot write language overrides/.test(n)),
    notes.join(' | ')
  )
})

test('the module headings are given in Vietnamese with the site language', async () => {
  const { essenceSite } = await import('./_joomla-essence-site.mjs')
  const site = essenceSite()
  site.languagePlan = (params) => ({
    ok: true,
    locale: params.locale,
    titles: [
      { key: 'module-114.title', source: 'Tags cloud', maxCharacters: 100 },
      { key: 'module-115.title', source: 'Newsletter', maxCharacters: 100 }
    ]
  })
  await runEssence({ site, model: essenceModel({ translate: toVi }) })
  const set = site.calls.find(
    (c) => c.action === 'content.contract' && c.params.operation === 'siteLanguage.set'
  )
  assert.deepEqual(set?.params.titles, {
    'module-114.title': 'VI Tags cloud',
    'module-115.title': 'VI Newsletter'
  })
})

// The words an AcyMailing form keeps in its params, not in a language file: "Join 70,000 subscribers!" and "Sign up" stayed
// English on g58-ess-j-full after the headings were given (10/10/2026). The plugin names them beside the headings.
test('the words a module keeps in its params are given in Vietnamese with the site language', async () => {
  const { essenceSite } = await import('./_joomla-essence-site.mjs')
  const site = essenceSite()
  site.languagePlan = (params) => ({
    ok: true,
    locale: params.locale,
    titles: [
      { key: 'module-115.title', source: 'Newsletter', maxCharacters: 100 },
      { key: 'module-115.params.introtext', source: 'Join 70,000 subscribers!', maxCharacters: 400 },
      { key: 'module-115.params.subtext', source: 'Sign up', maxCharacters: 400 }
    ]
  })
  await runEssence({ site, model: essenceModel({ translate: toVi }) })
  const set = site.calls.find(
    (c) => c.action === 'content.contract' && c.params.operation === 'siteLanguage.set'
  )
  assert.deepEqual(set?.params.titles, {
    'module-115.title': 'VI Newsletter',
    'module-115.params.introtext': 'VI Join 70,000 subscribers!',
    'module-115.params.subtext': 'VI Sign up'
  })
})

test('the module words are translated ahead from the contract, keyed and limited as the plugin names them', async () => {
  const { sourceHeadings } = await import('../src/sites/brief-engines/joomla-languages.js')
  const dir = new URL(
    '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-essence/j6/1.0.4',
    import.meta.url
  ).pathname
  const slots = sourceHeadings({ id: 'ja-essence/j6/1.0.4', dir }, 'en-GB')
  const words = slots.filter((s) => s.key.includes('.params.'))
  assert.deepEqual(words.map((s) => [s.key, s.sample, s.maxCharacters]).sort(), [
    ['module-115.params.introtext', 'Join 70,000 subscribers!', 400],
    ['module-115.params.subtext', 'Sign up', 400],
    ['module-135.params.introtext', 'Join 70,000 subscribers!', 400],
    ['module-135.params.subtext', 'Sign up', 400]
  ])
  assert.ok(slots.some((s) => s.key === 'module-115.title'))
})

// The build calls `template.languageOverrides` through the Apply door (`applyAs`): on dev g59-ess-j-full (10/10/2026) the door
// did not name it, refused it with ACTION_NOT_ALLOWED, and every template string stayed English. These call the engine's own
// writer through the door's allowlist (`throughDoor`), with a plugin that offers more strings than one Apply used to translate.
describe('every string the site offers is written, through the door', () => {
  /** A plugin offering `count` strings, `size` per page when it pages them (`next`), or cut at `size` (`truncated`). */
  // Each site's words are its own (`tag`): translations are kept in the process by words, across tests too.
  let sites = 0
  function pluginSite({ count, size = count, pages = true }) {
    const tag = `s${(sites += 1)}`
    const strings = Array.from({ length: count }, (_, i) => ({
      key: `KEY_${i}`,
      source: i % 7 === 0 ? `By %s, item ${i} ${tag}` : `Line ${i} ${tag}`,
      reason: 'missing'
    }))
    const reads = []
    const sets = []
    const apply = async (/** @type {any} */ { action, params }) => {
      assert.equal(action, 'template.languageOverrides')
      if (params.operation === 'read') {
        reads.push(params)
        const from = Number(params.offset ?? 0)
        const page = strings.slice(from, from + size)
        const more = from + size < count
        return {
          ok: true,
          strings: page,
          overrides: {},
          truncated: more,
          ...(pages && more ? { next: from + size, total: count } : {})
        }
      }
      sets.push(params)
      return { ok: true, written: Object.keys(params.strings).length }
    }
    return { apply: throughDoor(apply), reads, sets, strings }
  }
  const translator = () => {
    let calls = 0
    return {
      get calls() {
        return calls
      },
      chat: async ({ messages }) => {
        calls += 1
        const input = JSON.parse(messages[1].content)
        if (Array.isArray(input)) return JSON.stringify(input.map(({ i, text }) => ({ i, text: toVi(text) })))
        return JSON.stringify({ text: toVi(input.text) })
      }
    }
  }

  test('1500 strings: every one is translated and written, none cut at 600', async () => {
    const site = pluginSite({ count: 1500 })
    const notes = []
    const done = await writeLanguageOverrides({
      apply: site.apply,
      siteKey: 's',
      template: 'ja_essence',
      locale: 'vi-VN',
      model: translator(),
      note: (n) => notes.push(n)
    })
    const written = Object.assign({}, ...site.sets.map((s) => s.strings))
    assert.equal(Object.keys(written).length, 1500, notes.join(' | '))
    assert.equal(written.KEY_1499, 'VI Line 1499 s1')
    assert.equal(done.offered, 1500)
    assert.ok(!notes.some((n) => /keep their English/.test(n)), notes.join(' | '))
  })

  test('a plugin that pages its list is read page by page, each page written with its offset', async () => {
    const site = pluginSite({ count: 70, size: 30 })
    const notes = []
    await writeLanguageOverrides({
      apply: site.apply,
      siteKey: 's',
      template: 'ja_essence',
      locale: 'vi-VN',
      model: translator(),
      note: (n) => notes.push(n)
    })
    assert.deepEqual(
      site.reads.map((r) => r.offset),
      [undefined, 30, 60]
    )
    assert.deepEqual(
      site.sets.map((s) => [s.offset, Object.keys(s.strings).length]),
      [
        [undefined, 30],
        [30, 30],
        [60, 10]
      ]
    )
    assert.deepEqual(notes, [])
  })

  test('a plugin that cuts its list without a next page is said, not silent', async () => {
    const site = pluginSite({ count: 50, size: 20, pages: false })
    const notes = []
    await writeLanguageOverrides({
      apply: site.apply,
      siteKey: 's',
      template: 'ja_essence',
      locale: 'vi-VN',
      model: translator(),
      note: (n) => notes.push(n)
    })
    assert.equal(Object.keys(site.sets[0].strings).length, 20)
    assert.ok(
      notes.some((n) => /offered 20 of its strings/.test(n)),
      notes.join(' | ')
    )
  })

  test('a refusal by the door is said with its code', async () => {
    const notes = []
    const refuse = throughDoor(async () => ({
      ok: false,
      code: 'ACTION_NOT_ALLOWED',
      message: 'ACTION_NOT_ALLOWED'
    }))
    await writeLanguageOverrides({
      apply: refuse,
      siteKey: 's',
      template: 'ja_essence',
      locale: 'vi-VN',
      model: translator(),
      note: (n) => notes.push(n)
    })
    assert.ok(
      notes.some((n) => /Apply door refused template\.languageOverrides \(ACTION_NOT_ALLOWED\)/.test(n)),
      notes.join(' | ')
    )
  })

  test('a model that answers a batch in English and drops a placeholder still gets every string written', async () => {
    const site = pluginSite({ count: 40 })
    const model = {
      chat: async ({ messages }) => {
        const input = JSON.parse(messages[1].content)
        // A batch: English back for every other line, and "%s" dropped.
        if (Array.isArray(input))
          return JSON.stringify(
            input.map(({ i, text }) => ({ i, text: i % 2 ? text : toVi(text).replace('%s', '') }))
          )
        return JSON.stringify({ text: toVi(input.text) })
      }
    }
    const notes = []
    await writeLanguageOverrides({
      apply: site.apply,
      siteKey: 's',
      template: 'ja_essence',
      locale: 'vi-VN',
      model,
      note: (n) => notes.push(n)
    })
    const written = Object.assign({}, ...site.sets.map((s) => s.strings))
    for (const row of site.strings) assert.equal(written[row.key], toVi(row.source), row.key)
    assert.ok(
      notes.some((n) => /one by one/.test(n)),
      notes.join(' | ')
    )
  })
})

/**
 * A date format a layout passes through Text::_ (LANG-6, TCH #1013). Measured 10/10/2026 on dev g60-ess-j-full: JA Essence's
 * article meta, latest-articles sidebar and home list printed "Tháng sáu 9, 2023" (`Text::_('F j, Y')`) beside the pack's
 * "09 Tháng sáu 2023". The plugin offers the literal with the language's own format as `value`: written as it is, never
 * handed to the model, which would "translate" a format into anything (here a disobedient one turns it into words).
 */
test('g60: a date format the plugin offers is written with the language’s own format, never translated', async () => {
  const sets = []
  const asked = []
  const apply = throughDoor(async (/** @type {any} */ { params }) => {
    if (params.operation === 'read')
      return {
        ok: true,
        strings: [
          { key: 'F J, Y', source: 'F j, Y', reason: 'date-format', value: 'd F Y' },
          { key: 'TPL_SHARE_ARTICLE', source: 'Share article:', reason: 'missing' }
        ],
        overrides: {}
      }
    sets.push(params)
    return { ok: true, written: Object.keys(params.strings).length }
  })
  const model = {
    chat: async (/** @type {any} */ { messages }) => {
      const input = JSON.parse(messages[1].content)
      if (Array.isArray(input)) {
        asked.push(...input.map((/** @type {any} */ x) => x.text))
        return JSON.stringify(
          input.map(({ i, text }) => ({ i, text: text === 'F j, Y' ? 'Tháng F ngày j' : toVi(text) }))
        )
      }
      asked.push(input.text)
      return JSON.stringify({ text: toVi(input.text) })
    }
  }
  const notes = []
  const out = await writeLanguageOverrides({
    apply,
    siteKey: 's',
    template: 'ja_essence',
    locale: 'vi-VN',
    model,
    note: (/** @type {string} */ n) => notes.push(n)
  })
  assert.deepEqual(
    sets.map((s) => s.strings),
    [{ 'F J, Y': 'd F Y', TPL_SHARE_ARTICLE: 'VI Share article:' }]
  )
  assert.ok(!asked.includes('F j, Y'), 'the model is never asked about a date format')
  assert.equal(out.written, 2)
})

/**
 * A layout's literal words, with no language key (LANG-2, TCH #1013). Measured 10/10/2026 on dev g60-ess-j-full: Joomla 6.1's own
 * mod_finder prints `aria-label="search"` on every page and JA Essence's video layout `<span class="sr-only">Watch the video</span>`,
 * written into the PHP. The plugin (0.24.13) offers each under a `TRACY_LITERAL_` key with `reason: literal`, and its output
 * filter prints the override's words in their place: here they are translated like any string. A disobedient model gives the
 * English back in the batch; they are asked again, never written in English.
 */
test('g60: a layout literal the plugin offers is translated and written; an English echo is asked again', async () => {
  const sets = []
  const apply = throughDoor(async (/** @type {any} */ { params }) => {
    if (params.operation === 'read')
      return {
        ok: true,
        strings: [
          {
            key: 'TRACY_LITERAL_SEARCH',
            source: 'search',
            reason: 'literal',
            file: 'modules/mod_finder/tmpl/default.php'
          },
          {
            key: 'TRACY_LITERAL_WATCH_THE_VIDEO',
            source: 'Watch the video',
            reason: 'literal',
            file: 'templates/ja_essence/html/layouts/joomla/content/video_play.php'
          }
        ],
        overrides: {}
      }
    sets.push(params)
    return { ok: true, written: Object.keys(params.strings).length }
  })
  const model = {
    chat: async (/** @type {any} */ { messages }) => {
      const input = JSON.parse(messages[1].content)
      // The batch: every literal given back in English.
      if (Array.isArray(input)) return JSON.stringify(input.map(({ i, text }) => ({ i, text })))
      return JSON.stringify({ text: toVi(input.text) })
    }
  }
  const notes = []
  await writeLanguageOverrides({
    apply,
    siteKey: 's',
    template: 'ja_essence',
    locale: 'vi-VN',
    model,
    note: (/** @type {string} */ n) => notes.push(n)
  })
  assert.deepEqual(Object.assign({}, ...sets.map((s) => s.strings)), {
    TRACY_LITERAL_SEARCH: toVi('search'),
    TRACY_LITERAL_WATCH_THE_VIDEO: toVi('Watch the video')
  })
})
