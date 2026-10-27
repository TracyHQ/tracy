/**
 * #811 F-S5-004 — the public Design templates page speaks the visitor's language where the
 * repository has the words, and asks its doors for the same language.
 *
 * The page handed the gallery and the preview an English-only translator and wrote its own chrome
 * as English literals, while the doors it calls (`api/read`, `api/words`) already answer in the
 * asker's language: a German visitor read an English page with German errors. It also named itself
 * "Design inspirations" in the header and "Design inspiration" in its loading line.
 *
 * WHAT THIS FILE RUNS. The real `App`, bundled in memory and mounted with react-dom on a linkedom
 * document over a fixture `fetch`; the real `locale.ts`; tracy-web's real language rule, to compare.
 * WHAT IT DOES NOT. No browser, no tracy-web process and no edge: the address, the cookie and the
 * browser's languages are values set on the fixture, and the doors' answers are canned.
 *
 * NOT TRANSLATED, AND SAID SO. The page's own sentences (`PAGE_WORDS`) have no translation in the
 * repository; the last test pins that they are English in every language, so nobody reads this
 * file as proof that the page is fully translated.
 *
 *   node --test packages/web/tracy-design-page/test/public-locale.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  WEB_LANGUAGES,
  matchLanguage as webMatchLanguage,
  resolveLanguage as webResolveLanguage
} from '../../../../apps/tracy-web/src/lib/i18n/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const corePkg = path.resolve(repoRoot, 'packages', 'core', 'tracy-core')
const pluginPkg = path.resolve(repoRoot, 'packages', 'design', 'tracy-design-inspiration')
// esbuild is the plugin's tool; this package builds with Vite and has none of its own.
const pluginRequire = createRequire(path.join(pluginPkg, 'package.json'))
const coreRequire = createRequire(path.join(corePkg, 'package.json'))
const { parseHTML } = createRequire(path.join(repoRoot, 'package.json'))('linkedom')

const dictionary = (lang) =>
  JSON.parse(
    readFileSync(
      path.join(
        repoRoot,
        'packages',
        'locale',
        lang === 'vi' ? 'tracy-locale-vi/vi' : `tracy-locales/${lang}`,
        'tracy-design-inspiration.json'
      ),
      'utf8'
    )
  )

const ORIGIN = 'https://cowork.tracy.test'
const GLOBALS = [
  'window',
  'document',
  'location',
  'history',
  'navigator',
  'fetch',
  'DOMParser',
  'ResizeObserver',
  'MutationObserver',
  'IntersectionObserver',
  'HTMLElement',
  'Element',
  'Node',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'IS_REACT_ACT_ENVIRONMENT'
]
const saved = new Map()
/** @type {any} */
let dom
/** @type {(() => Promise<void>)[]} */
const cleanups = []
const set = (name, value) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

/** One in-memory bundle of an entry in `src/`, evaluated; React stays outside it. */
async function bundle(contents) {
  const built = await pluginRequire('esbuild').build({
    stdin: { contents, resolveDir: path.join(pkgRoot, 'src'), loader: 'tsx' },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  const mod = { exports: {} }
  const load = (id) => (id.startsWith('react-dom') ? coreRequire(id) : pluginRequire(id))
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(load, mod, mod.exports)
  return mod.exports
}

/** @type {Promise<any> | null} */
let appBundle = null
const appLib = () =>
  (appBundle ??= bundle(`
    export { createElement, act } from 'react'
    export { createRoot } from 'react-dom/client'
    export { TooltipProvider } from '@tracy/ui'
    export { setDoor } from '../../../design/tracy-design-inspiration/src/client/api'
    export { en } from '../../../design/tracy-design-inspiration/src/client/strings'
    export { publicDoor } from './doors'
    export { App } from './App'`))
/** @type {Promise<any> | null} */
let localeBundle = null
const localeLib = () => (localeBundle ??= bundle(`export * from './locale'`))

before(() => {
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html lang="en"><head></head><body></body></html>')
  const { window } = dom
  set('window', window)
  set('document', dom.document)
  set('DOMParser', window.DOMParser)
  set('MutationObserver', window.MutationObserver)
  set('HTMLElement', window.HTMLElement)
  set('Element', window.Element)
  set('Node', window.Node)
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  set('ResizeObserver', observer)
  set('IntersectionObserver', observer)
  const styles = () => new Proxy({ getPropertyValue: () => '' }, { get: (t, k) => (k in t ? t[k] : '') })
  set('getComputedStyle', styles)
  set('requestAnimationFrame', (fn) => setTimeout(() => fn(Date.now()), 0))
  set('cancelAnimationFrame', (id) => clearTimeout(id))
  for (const [name, value] of Object.entries({
    getComputedStyle: styles,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    ResizeObserver: observer,
    IntersectionObserver: observer,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  }))
    if (typeof window[name] !== 'function') window[name] = value
  set('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * Open the page as one visitor: `search` is the address's query, `cookie` the page's cookies,
 * `languages` what the browser prefers. `catalog: 'hold'` leaves the page on its loading line.
 * `read` and `words` are what the two doors answer.
 */
async function open({
  search = '',
  cookie = '',
  languages = ['en-US'],
  catalog = 'empty',
  read,
  words
} = {}) {
  const lib = await appLib()
  lib.setDoor(lib.publicDoor)
  const href = `${ORIGIN}/design-inspiration${search}`
  const location = { origin: ORIGIN, href, pathname: '/design-inspiration', search, hash: '', assign() {} }
  set('location', location)
  dom.window.location = location
  set('history', { state: null, replaceState() {}, pushState() {} })
  set('navigator', { languages, language: languages[0] ?? '', userAgent: 'node' })
  Object.defineProperty(dom.document, 'cookie', { value: cookie, configurable: true, writable: true })
  /** @type {{ method: string, url: URL, body: any }[]} */
  const calls = []
  let releaseCatalog = () => {}
  const held = new Promise((resolve) => {
    releaseCatalog = resolve
  })
  set('fetch', async (input, init = {}) => {
    const url = new URL(String(input), ORIGIN)
    const method = init.method ?? 'GET'
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : null })
    if (url.pathname === '/design-inspiration/data/catalog.json') {
      if (catalog === 'hold') await held
      return json(200, { systems: [], library: null })
    }
    if (url.pathname === '/design-inspiration/api/read')
      return read ? read(url) : json(502, { code: 'UNREACHABLE', message: 'unreachable (fixture)' })
    if (url.pathname === '/design-inspiration/api/words')
      return words ? words(url) : json(503, { code: 'MODEL_NOT_CONFIGURED', message: 'no model (fixture)' })
    if (url.pathname === '/api/templates') return json(200, { templates: [] })
    if (url.pathname === '/api/design-systems') return json(200, { shown: false })
    return json(404, { code: 'NOT_FOUND' })
  })
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  const quiet = console.warn
  console.warn = () => {}
  cleanups.push(async () => {
    releaseCatalog()
    await lib.act(async () => root.unmount())
    host.remove()
    console.warn = quiet
  })
  await lib.act(async () => {
    root.render(lib.createElement(lib.TooltipProvider, null, lib.createElement(lib.App)))
  })
  const settle = async (n = 4) => {
    for (let i = 0; i < n; i += 1) await lib.act(async () => tick(5))
  }
  await settle()
  const fire = (el, type) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }))
  return {
    lib,
    host,
    calls,
    settle,
    text: () => host.textContent.replace(/\s+/g, ' '),
    header: () => host.querySelector('header'),
    /** Type into the one box and submit it. */
    ask: async (value) => {
      const input = host.querySelector('header form input')
      assert.ok(input, 'the box is on screen')
      // The box is a controlled React input; the change goes to the handler React holds for it.
      const propsKey = Reflect.ownKeys(input).find((k) => String(k).startsWith('__reactProps$'))
      await lib.act(async () => {
        input[propsKey].onChange({ target: { value }, currentTarget: { value }, nativeEvent: {} })
        await tick(1)
      })
      await lib.act(async () => {
        fire(host.querySelector('header form'), 'submit')
        await tick(5)
      })
      await settle()
    }
  }
}

const TRANSLATED = ['vi', 'de', 'it', 'fr', 'nl', 'zh', 'es']

/** The languages whose tab title is the page's name (one form in Vietnamese, vocabulary.md). */
const SINGULAR_TITLE = ['vi']

test('class:plural-product-title the header names the product once, as its tab does: translated in Vietnamese, English otherwise', async () => {
  // The source of the Vietnamese name: vocabulary.md's row for "Design template".
  const vocabulary = readFileSync(path.join(repoRoot, 'docs', 'references', 'vocabulary.md'), 'utf8')
  assert.ok(
    vocabulary.includes(`| **Design template** | **${dictionary('vi')['tab.title']}** |`),
    'vocabulary.md gives the Vietnamese tab title as the product name'
  )
  for (const lang of TRANSLATED) {
    const ui = await open({ languages: [lang === 'zh' ? 'zh-CN' : `${lang}-XX`, 'en'] })
    const title = ui.header().querySelector('[data-page-title]').textContent
    const plural = dictionary(lang)['tab.title']
    if (SINGULAR_TITLE.includes(lang)) assert.equal(title, plural, `${lang}: its one form`)
    else {
      assert.equal(title, 'Design Template', `${lang}: the English name, not "${plural}"`)
      assert.ok(
        !ui.header().textContent.includes(plural),
        `${lang}: the plural tab name is not the page’s name`
      )
    }
    assert.ok(!ui.header().textContent.includes('Design inspiration'), `${lang}: not the retired name`)
    for (const cleanup of cleanups.splice(0)) await cleanup()
  }
})

test('F-S5-004: the loading line is in the visitor’s language', async () => {
  for (const lang of TRANSLATED) {
    const ui = await open({ search: `?lang=${lang}`, catalog: 'hold' })
    assert.ok(ui.text().includes(dictionary(lang)['state.reading']), `${lang}: ${ui.text()}`)
    assert.ok(!ui.text().includes('Loading Design template'), `${lang}: no English literal`)
    for (const cleanup of cleanups.splice(0)) await cleanup()
  }
})

test('F-S5-004: in English the page is "Design Template", once, in both places it names itself', async () => {
  const loading = await open({ catalog: 'hold' })
  assert.ok(!loading.text().includes('Design inspiration'), loading.text())
  assert.ok(loading.header().textContent.includes('Design Template'))
  for (const cleanup of cleanups.splice(0)) await cleanup()
  const loaded = await open()
  assert.ok(!loaded.header().textContent.includes('Design inspiration'))
  assert.ok(loaded.header().textContent.includes('Design Template'))
})

test('F-S5-004: the gallery reads in the picked language, not in English', async () => {
  const ui = await open({ languages: ['de-DE'] })
  const de = dictionary('de')
  const shown = Object.keys(de).filter((key) => ui.text().includes(de[key]) && de[key] !== ui.lib.en[key])
  assert.ok(shown.length > 0, `some German line of the gallery is on screen: ${ui.text()}`)
  // The same lines in English are not.
  for (const key of shown) assert.ok(!ui.text().includes(ui.lib.en[key]), `${key} is still English`)
})

test('F-S5-004: the read door is asked in the page’s language', async () => {
  for (const [visitor, lang] of [
    [{ search: '?lang=de' }, 'de'],
    [{ cookie: 'other=1; tracy_lang=fr; x=y', languages: ['es-ES'] }, 'fr'],
    [{ languages: ['ja-JP', 'nl-NL', 'en'] }, 'nl'],
    [{ languages: ['zh-CN'] }, 'zh'],
    [{ languages: ['ja-JP'] }, 'en']
  ]) {
    const ui = await open(visitor)
    await ui.ask('example.com')
    const reads = ui.calls.filter((c) => c.url.pathname === '/design-inspiration/api/read')
    assert.equal(reads.length, 1, lang)
    assert.equal(reads[0].url.searchParams.get('url'), 'example.com')
    assert.equal(reads[0].url.searchParams.get('lang'), lang)
    for (const cleanup of cleanups.splice(0)) await cleanup()
  }
})

test('F-S5-004: the words door is asked in the page’s language', async () => {
  const ui = await open({ search: '?lang=it' })
  await ui.ask('A small bakery that bakes at dawn')
  const posts = ui.calls.filter((c) => c.url.pathname === '/design-inspiration/api/words')
  assert.equal(posts.length, 1)
  assert.equal(posts[0].method, 'POST')
  assert.equal(posts[0].url.searchParams.get('lang'), 'it')
  assert.deepEqual(posts[0].body, { brief: 'A small bakery that bakes at dawn' })
})

test('F-S5-004: a door’s own sentence is shown as it answered, in the language it was asked in', async () => {
  const ui = await open({
    search: '?lang=de',
    read: (url) =>
      json(502, { code: 'BLOCKED', message: `fixture sentence in ${url.searchParams.get('lang')}` })
  })
  await ui.ask('example.com')
  assert.ok(ui.text().includes('fixture sentence in de'), ui.text())
})

test('the page’s language rule is tracy-web’s, tag for tag', async () => {
  const locale = await localeLib()
  assert.deepEqual([...locale.PAGE_LANGUAGES], [...WEB_LANGUAGES])
  const tags = [
    'en',
    'EN',
    'en-US',
    'en_GB',
    'vi',
    'vi-VN',
    'de',
    'de-AT',
    'de_CH',
    'it',
    'fr',
    'fr-CA',
    'nl',
    'nl-BE',
    'es',
    'es-419',
    'zh',
    'zh-CN',
    'zh-Hans',
    'zh-Hans-CN',
    'zh-SG',
    'zh-TW',
    'zh-HK',
    'zh-MO',
    'zh-Hant',
    'zh-Hant-TW',
    'zh_TW',
    'zh-hant-hk',
    'ja',
    'pt-BR',
    'klingon',
    'xx',
    '',
    '  ',
    ' de ',
    '*',
    '<script>',
    'de;q=0.9',
    'e',
    'x'.repeat(36),
    'en-' + 'a'.repeat(40),
    null,
    undefined,
    7,
    {},
    [],
    true
  ]
  for (const tag of tags)
    assert.equal(locale.matchLanguage(tag), webMatchLanguage(tag), `matchLanguage(${JSON.stringify(tag)})`)
  // The order: `?lang=`, the remembered pick, the browser's languages, English.
  for (const [query, cookie, browser, accept] of [
    ['de', 'fr', ['es'], 'es'],
    ['xx', 'fr', ['es'], 'es'],
    ['<script>', 'nl', [], ''],
    [null, 'it', ['es'], 'es'],
    [null, 'klingon', ['es-ES'], 'es-ES'],
    [null, null, ['ja', 'fr-CA', 'en'], 'ja,fr-CA;q=0.8,en;q=0.5'],
    [null, null, ['zh-TW', 'de'], 'zh-TW,de;q=0.5'],
    [null, null, ['zh-TW'], 'zh-TW'],
    [null, null, ['pt-BR'], 'pt-BR'],
    [null, null, [], ''],
    [undefined, undefined, undefined, undefined]
  ])
    assert.equal(
      locale.resolveLanguage({ query, cookie, browser }),
      webResolveLanguage({ query, cookie, acceptLanguage: accept }),
      JSON.stringify({ query, cookie, browser })
    )
  assert.equal(locale.resolveLanguage(), 'en')
  assert.equal(
    locale.resolveLanguage({ browser: 'de' }),
    'en',
    'a browser list that is not a list is no list'
  )
})

test('a malformed cookie, an unsupported language and Traditional Chinese fall through, never throw', async () => {
  const locale = await localeLib()
  assert.equal(locale.cookieValue('tracy_lang=de', 'tracy_lang'), 'de')
  assert.equal(locale.cookieValue('a=1; tracy_lang=fr ; b=2', 'tracy_lang'), 'fr')
  assert.equal(locale.cookieValue('xtracy_lang=de', 'tracy_lang'), null)
  assert.equal(locale.cookieValue('tracy_lang', 'tracy_lang'), null)
  assert.equal(locale.cookieValue('tracy_lang=%E0%A4%A', 'tracy_lang'), null, 'not decodable')
  assert.equal(locale.cookieValue('', 'tracy_lang'), null)
  for (const junk of [null, undefined, 7, {}]) assert.equal(locale.cookieValue(junk, 'tracy_lang'), null)
  for (const visitor of [
    { cookie: 'tracy_lang=%E0%A4%A', languages: ['de'] },
    { cookie: 'tracy_lang=klingon', languages: ['de'] },
    { search: '?lang=zh-TW', languages: ['de'] }
  ]) {
    const ui = await open(visitor)
    await ui.ask('example.com')
    assert.equal(
      ui.calls.find((c) => c.url.pathname.endsWith('/api/read')).url.searchParams.get('lang'),
      'de',
      JSON.stringify(visitor)
    )
    for (const cleanup of cleanups.splice(0)) await cleanup()
  }
  // Traditional Chinese alone: English, not Simplified.
  const ui = await open({ languages: ['zh-TW'] })
  assert.equal(ui.header().querySelector('[data-page-title]').textContent, 'Design Template')
  await ui.ask('example.com')
  assert.equal(ui.calls.find((c) => c.url.pathname.endsWith('/api/read')).url.searchParams.get('lang'), 'en')
})

test('a key a language does not have reads in English, and an unknown key never crashes', async () => {
  const locale = await localeLib()
  const en = (await appLib()).en
  for (const lang of [...TRANSLATED, 'en', 'xx', '__proto__', 'constructor']) {
    const t = locale.translatorFor(lang)
    for (const key of Object.keys(en)) {
      const said = t(key, {
        count: 3,
        total: 9,
        shown: 2,
        name: 'N',
        title: 'T',
        message: 'M',
        platform: 'P',
        id: 'I'
      })
      assert.equal(typeof said, 'string')
      assert.notEqual(said, '', `${lang} ${key}`)
      assert.notEqual(said, key, `${lang} ${key}: a raw key`)
    }
    assert.equal(t('no.such.key'), 'no.such.key')
    assert.equal(typeof t('toString'), 'string')
    assert.equal(typeof t('__proto__'), 'string')
  }
  // A key only English has is English in every language.
  const de = dictionary('de')
  const missing = Object.keys(en).filter((key) => !(key in de))
  for (const key of missing) assert.equal(locale.translatorFor('de')(key), en[key])
  // A value a parameter does not cover stays as written, as the plugin's `t` leaves it.
  assert.equal(
    locale.translatorFor('en')('filter.count', { shown: 1 }),
    en['filter.count'].replace('{shown}', '1')
  )
  assert.equal(locale.htmlLang('zh'), 'zh-CN')
  assert.equal(locale.htmlLang('de'), 'de')
})

test('NOT TRANSLATED: the page’s own sentences are English in every language', async () => {
  const locale = await localeLib()
  // The list this change leaves in English, pinned so a translation is a deliberate edit here too.
  assert.deepEqual(Object.keys(locale.PAGE_WORDS).sort(), [
    'adviceBlocked',
    'adviceUnreachable',
    'go',
    'partial',
    'placeholder',
    'readFailed',
    'reading',
    'sentenceAsIs',
    'title'
  ])
  const ui = await open({ search: '?lang=de' })
  const input = ui.host.querySelector('header form input')
  assert.equal(input.getAttribute('placeholder'), locale.PAGE_WORDS.placeholder)
  assert.equal(input.getAttribute('aria-label'), locale.PAGE_WORDS.placeholder)
  assert.ok(ui.header().textContent.includes(locale.PAGE_WORDS.go))
  await ui.ask('example.com')
  assert.ok(ui.text().includes(locale.PAGE_WORDS.adviceUnreachable))
  assert.equal(locale.pageWords('reading', { host: 'example.com' }), 'Reading example.com…')
  // The page's name is translated only in Vietnamese: English in every other language.
  for (const lang of ['en', 'xx', 'de', 'es', 'fr', 'it', 'nl', 'zh'])
    assert.equal(locale.pageTitle(lang), 'Design Template', lang)
  assert.equal(locale.pageTitle('vi'), dictionary('vi')['tab.title'])
})
