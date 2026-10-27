/**
 * `readDictionaryVariable` (`scripts/lib/dictionary-variables.mjs`, issue #755): the two bundle
 * shapes the first reader skipped (a spread dictionary, a minified comma declaration) are read in
 * full; anything that is not all strings stays unreadable instead of half read. Issue #765: the
 * wrapper shape (`addLocale('en', en)`, `dsh-subscriptions`) is read, and a bundle that registers a
 * namespace no reader sees is named instead of passing in silence.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseUnreadWarning,
  readDictionaryVariable,
  readWrappedRegistrations,
  silentRegistrations
} from '../lib/dictionary-variables.mjs'

test('a dictionary that spreads another one is read with the spread keys', () => {
  const bundle = `
    const zoomEn = { zoomIn: "Zoom in", zoomOut: "Zoom out" };
    /** English. */
    const en$4 = {
      ...zoomEn,
      title: "Image",
      preview: "Image preview: {name}"
    };`
  assert.deepEqual(readDictionaryVariable(bundle, 'en$4'), {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    title: 'Image',
    preview: 'Image preview: {name}'
  })
})

test('an ellipsis inside a string is text, not a spread', () => {
  // dsh-subscriptions 0.6.60: "Paste DSHE... encrypted string here" left the whole card unmeasured.
  const bundle = `const en = { paste: "Paste DSHE... encrypted string here", wait: 'Loading ...done' };`
  assert.deepEqual(readDictionaryVariable(bundle, 'en'), {
    paste: 'Paste DSHE... encrypted string here',
    wait: 'Loading ...done'
  })
})

test('a minified comma declaration is read', () => {
  const bundle = `var ta={owner:"\\u4E3B\\u7528\\u6237"},sa={owner:"Owner","err.INTERNAL":"Internal error"};x.register("dshpw",{zh:ta,en:sa})`
  assert.deepEqual(readDictionaryVariable(bundle, 'sa'), { owner: 'Owner', 'err.INTERNAL': 'Internal error' })
  assert.deepEqual(readDictionaryVariable(bundle, 'ta'), { owner: '主用户' })
})

test('a value that is not a string, an unknown spread or a missing variable stays unreadable', () => {
  assert.equal(readDictionaryVariable('const en = { a: "A", b: fn() };', 'en'), undefined)
  assert.equal(readDictionaryVariable('const en = { ...missing, a: "A" };', 'en'), undefined)
  assert.equal(readDictionaryVariable('const zh = { a: "A" };', 'en'), undefined)
  assert.equal(readDictionaryVariable('const en = { ...en, a: "A" };', 'en'), undefined)
})

test('the first reader warning is parsed, other warnings are not', () => {
  assert.deepEqual(
    parseUnreadWarning('ui-sidebar-documentpreview/sidebarImage: no en dictionary variable en$4'),
    {
      label: 'ui-sidebar-documentpreview',
      ns: 'sidebarImage',
      locale: 'en',
      variable: 'en$4'
    }
  )
  assert.equal(parseUnreadWarning('x: unresolved namespace NS'), undefined)
})

/** The `dsh-subscriptions` bundle shape: single-quoted NS, a try/catch wrapper, one call per language. */
const WRAPPED = `
    const NS = 'dsh-subscriptions'
    const en = { "title": "Subscriptions", "addAccount": "Add account" };
    const zh = { "title": "个人订阅管理", "addAccount": "添加账户" };
    function registerSettings(ctx) {
      const addLocale = (locale, dictionary) => {
        try {
          return ctx.locale.register(NS, locale, dictionary)
        } catch (alreadyTaken) {
          return () => {}
        }
      }
      ctx.effect(() => {
        const undo = [addLocale('en', en), addLocale('zh', zh)]
        return () => { for (const off of undo) off() }
      })
    }`

test('a wrapper called once per language is read for each locale', () => {
  assert.deepEqual(readWrappedRegistrations(WRAPPED, 'en'), {
    dicts: { 'dsh-subscriptions': { title: 'Subscriptions', addAccount: 'Add account' } },
    warnings: []
  })
  assert.deepEqual(readWrappedRegistrations(WRAPPED, 'zh').dicts, {
    'dsh-subscriptions': { title: '个人订阅管理', addAccount: '添加账户' }
  })
  assert.deepEqual(readWrappedRegistrations(WRAPPED, 'vi'), { dicts: {}, warnings: [] })
})

test('a function wrapper and a literal namespace are read too', () => {
  const bundle = `const de = { a: "A" }; function add(l, d) { ctx.locale.register("ns", l, d) } add("en", de)`
  assert.deepEqual(readWrappedRegistrations(bundle, 'en').dicts, { ns: { a: 'A' } })
})

test('what the wrapper reader cannot follow is a warning, never a guess', () => {
  const noWrapper = `const NS = "ns"; for (const [l, d] of pairs) ctx.locale.register(NS, l, d)`
  assert.deepEqual(readWrappedRegistrations(noWrapper, 'en'), {
    dicts: {},
    warnings: ['ns: locale.register with a variable locale outside a (l, d) wrapper']
  })
  const badDict = WRAPPED.replace('"Add account" }', '"Add account", n: 1 }')
  assert.deepEqual(readWrappedRegistrations(badDict, 'en').warnings, [
    'dsh-subscriptions: no en dictionary variable en'
  ])
  const unknownNs = `const add = (l, d) => ctx.locale.register(cfg.ns, l, d); add('en', en)`
  assert.equal(readWrappedRegistrations(unknownNs, 'en').warnings.length, 1)
})

test('a bundle registering a namespace no reader saw is named, unless kept with a reason', () => {
  const bundles = [
    { label: 'read', text: 'ctx.locale.register("a", { en })' },
    { label: 'unread', text: 'ctx.locale.register(NS, pickLocale(), dict)' },
    { label: 'pack', text: 'ctx.locale.register(ns, LOCALE_ID, dict)' },
    { label: 'no-locale', text: 'console.log(1)' }
  ]
  const kept = new Map([['pack', 'language pack']])
  assert.deepEqual(silentRegistrations(bundles, new Set(['read']), kept), ['unread'])
  assert.deepEqual(silentRegistrations(bundles, new Set(['read', 'unread']), kept), [])
})
