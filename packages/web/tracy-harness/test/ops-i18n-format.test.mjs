/**
 * Numbers, dates and times follow the language on screen, English keeps today's shapes.
 *
 *   node --test packages/web/tracy-harness/test/ops-i18n-format.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import {
  dateLocale,
  formatDate,
  formatDateTime,
  formatFixed,
  formatNumber,
  formatTime,
  formatWith,
  numberLocale,
  useFormat
} from '../src/i18n/format.ts'
import { I18nProvider } from '../src/i18n/react.ts'
import { createLanguageStore } from '../src/i18n/language-store.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const AT = '2026-10-09T08:25:07.000Z'
const flat = (s) => s.replace(/[  ]/g, ' ')
const UTC = { timeZone: 'UTC' }

test('numbers group and mark decimals by language', () => {
  assert.equal(formatNumber(1234567.5, undefined, 'en'), '1,234,567.5')
  assert.equal(flat(formatNumber(1234567.5, undefined, 'de')), '1.234.567,5')
  assert.equal(flat(formatNumber(1234567.5, undefined, 'fr')), '1 234 567,5')
  assert.equal(formatNumber(1234567.5, undefined, 'zh'), '1,234,567.5')
  assert.equal(flat(formatNumber(1234567.5, undefined, 'es')), '1.234.567,5')
})

test('fixed decimals stay ungrouped and keep the English toFixed shape', () => {
  assert.equal(formatFixed(1234.5, 1, 'en'), (1234.5).toFixed(1))
  assert.equal(formatFixed(0.5, 2, 'en'), '0.50')
  assert.equal(formatFixed(1234.5, 1, 'de'), '1234,5')
})

test('dates, times and date-times in five languages (UTC)', () => {
  const expect = {
    en: ['9 Oct 2026', '08:25', '9 Oct 2026, 08:25'],
    de: ['09.10.2026', '08:25', '09.10.2026, 08:25'],
    fr: ['9 oct. 2026', '08:25', '9 oct. 2026, 08:25'],
    zh: ['2026年10月9日', '08:25', '2026年10月9日 08:25'],
    es: ['9 oct 2026', '8:25', '9 oct 2026, 8:25']
  }
  for (const [lang, [d, t, dt]] of Object.entries(expect)) {
    assert.equal(flat(formatDate(AT, 'medium', { lang, ...UTC })), d, `${lang} date`)
    assert.equal(flat(formatTime(AT, 'short', { lang, ...UTC })), t, `${lang} time`)
    assert.equal(flat(formatDateTime(AT, 'medium', { lang, ...UTC })), dt, `${lang} datetime`)
  }
})

test('an explicit time zone moves the clock, not the language', () => {
  assert.equal(formatTime(AT, 'short', { lang: 'de', timeZone: 'Asia/Ho_Chi_Minh' }), '15:25')
  assert.equal(formatWith(AT, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }, 'en'), '12:25')
})

test('English keeps the shapes the screens had', () => {
  assert.equal(dateLocale('en'), 'en-GB')
  assert.equal(numberLocale('en'), 'en')
  assert.equal(numberLocale('zh'), 'zh-CN')
  // the former new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'long' })
  assert.equal(
    formatWith(AT, { dateStyle: 'medium', timeStyle: 'long', timeZone: 'Asia/Ho_Chi_Minh' }, 'en'),
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'long',
      timeZone: 'Asia/Ho_Chi_Minh'
    }).format(new Date(AT))
  )
  assert.equal(formatNumber(1234567, undefined, 'en'), (1234567).toLocaleString('en-US'))
})

test('formatters are cached per locale and options', () => {
  const made = []
  const Real = Intl.NumberFormat
  Intl.NumberFormat = new Proxy(Real, { construct: (t, a) => (made.push(a), new t(...a)) })
  try {
    formatNumber(1, { maximumFractionDigits: 7 }, 'it')
    formatNumber(2, { maximumFractionDigits: 7 }, 'it')
    formatNumber(3, { maximumFractionDigits: 7 }, 'nl')
    assert.equal(made.length, 2)
  } finally {
    Intl.NumberFormat = Real
  }
})

test('the hook and the imperative functions follow a language change on the next render', async () => {
  const store = createLanguageStore({ initial: 'de', load: () => Promise.resolve({}) })
  await store.ready
  const language = { store, setLanguage: () => Promise.resolve(), followsDevice: () => false }
  function Probe() {
    const f = useFormat()
    return React.createElement('span', null, `${f.lang}|${f.number(1234.5)}|${formatNumber(1234.5)}`)
  }
  const render = () =>
    renderToStaticMarkup(React.createElement(I18nProvider, { language }, React.createElement(Probe)))
  assert.match(flat(render()), />de\|1\.234,5\|1\.234,5</)
  await store.select('fr')
  assert.match(flat(render()), />fr\|1 234,5\|1 234,5</)
  await store.select('en')
  assert.match(render(), />en\|1,234\.5\|1,234\.5</)
})
