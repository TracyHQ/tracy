import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DEFAULT_NEUTRAL_BY_ROLE } from '../domain/place-content-roles.mjs'
import { neutralFor } from '../domain/neutral-copy.mjs'
import { forbiddenFillerText } from '../domain/slot-fill-manifest.mjs'

const locales = ['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es', 'ja', 'ar']
const empty = { state: 'empty', text: '' }
const contact = { state: 'neutral', text: 'Contact', neutralKey: 'neutral.cta.contact' }
const call = { policy: 'neutral_key', key: 'neutral.cta.call', requires: 'phone' }
const fact = (value) => ({ id: 'fact:contact', value, evidenceRefs: ['evidence:contact'] })

test('neutral wording follows the site language, including regional tags and English fallback', () => {
  const words = [
    'Service',
    'Dịch vụ',
    'Dienstleistung',
    'Servizio',
    'Service',
    'Dienst',
    '服务',
    'Servicio',
    'サービス',
    'خدمة'
  ]
  for (const [i, locale] of locales.entries()) {
    assert.deepEqual(neutralFor({ role: 'offering.name', kind: 'service', locale }), {
      state: 'neutral',
      text: words[i],
      neutralKey: 'neutral.offering.service'
    })
  }
  for (const locale of ['EN-gb', 'xx', '', undefined, null, '../../vi', 'constructor']) {
    assert.equal(neutralFor({ role: 'offering.name', kind: 'dish', locale }).text, 'Menu item')
  }
  assert.equal(neutralFor({ role: 'offering.name', kind: 'product', locale: 'fr-CA' }).text, 'Produit')
  assert.equal(neutralFor({ role: 'offering.name', kind: 'service', locale: 'zh-Hans-CN' }).text, '服务')
})

test('every vocabulary key has nonempty wording in all ten language files', () => {
  const rules = Object.entries(DEFAULT_NEUTRAL_BY_ROLE)
  rules.push(['contact.cta_label', call])
  for (const locale of locales) {
    const words = JSON.parse(
      readFileSync(new URL(`../domain/neutral-copy/${locale}.json`, import.meta.url), 'utf8')
    )
    for (const [role, policy] of rules) {
      const keys = policy.key ? [[undefined, policy.key]] : Object.entries(policy.keysByKind ?? {})
      for (const [kind, key] of keys) {
        assert.ok(typeof words[key] === 'string' && words[key].trim(), `${locale}: ${key}`)
        assert.deepEqual(neutralFor({ role, policy, kind, locale, business: { phone: '+442079460123' } }), {
          state: 'neutral',
          text: words[key],
          neutralKey: key
        })
      }
    }
    for (const role of Object.keys(DEFAULT_NEUTRAL_BY_ROLE)) {
      for (const kind of ['dish', 'drink', 'menu_item', 'service', 'product', 'unknown']) {
        const result = neutralFor({ role, kind, locale, index: 0, business: { phone: '+442079460123' } })
        assert.equal(forbiddenFillerText(result.text), false, `${locale}: ${role}`)
      }
    }
  }
})

test('offering names follow the known kind; missing or unknown kinds stay empty', () => {
  for (const kind of ['dish', 'drink', 'menu_item']) {
    assert.equal(neutralFor({ role: 'offering.name', kind }).text, 'Menu item')
  }
  assert.equal(neutralFor({ role: 'offering.name', kind: 'product' }).text, 'Product')
  for (const kind of [undefined, '', 'unknown', 'room', 'class', 'membership', 'constructor', '__proto__']) {
    assert.deepEqual(neutralFor({ role: 'offering.name', kind }), empty)
  }
})

test('contact CTA requires a usable contact page, email or phone, including fact values', () => {
  for (const role of ['contact.cta_label', 'offering.cta_label', 'package.cta_label']) {
    for (const business of [
      { phone: '+442079460123' },
      { email: 'hello@example.test' },
      { contactPage: '/contact' },
      { contactPage: 'https://example.test/contact' },
      { phone: fact('+442079460123') },
      { email: fact('hello@example.test') },
      { contactPage: fact('/contact') }
    ]) {
      assert.deepEqual(neutralFor({ role, business }), contact)
    }
    for (const business of [
      undefined,
      null,
      {},
      { website: 'https://example.test' },
      { phone: ' ', email: '' },
      { phone: fact('') },
      { email: {} },
      { contactPage: '#' },
      { contactPage: 'javascript:void(0)' },
      { contactPage: true }
    ]) {
      assert.deepEqual(neutralFor({ role, business }), empty)
    }
  }
})

test('call needs a phone even if its policy omits or weakens requires', () => {
  for (const policy of [call, { ...call, requires: undefined }, { ...call, requires: 'contact-target' }]) {
    for (const business of [
      {},
      { email: 'hello@example.test' },
      { contactPage: '/contact' },
      { phone: fact(' ') },
      { phone: {} }
    ]) {
      assert.deepEqual(neutralFor({ role: 'contact.cta_label', policy, business }), empty)
    }
    assert.deepEqual(
      neutralFor({ role: 'contact.cta_label', policy, business: { phone: fact('+442079460123') } }),
      {
        state: 'neutral',
        text: 'Call',
        neutralKey: 'neutral.cta.call'
      }
    )
  }
  assert.deepEqual(
    neutralFor({ role: 'contact.cta_label', policy: { policy: 'neutral_key', key: 'neutral.cta.contact' } }),
    empty
  )
  assert.deepEqual(
    neutralFor({
      role: 'contact.cta_label',
      policy: { ...call, requires: 'booking' },
      business: { phone: '+442079460123' }
    }),
    empty
  )
})

test('step indices are zero-based and padded without truncating larger numbers', () => {
  for (const [index, text] of [
    [0, '01'],
    [1, '02'],
    [8, '09'],
    [9, '10'],
    [99, '100']
  ]) {
    assert.deepEqual(neutralFor({ role: 'step.index', index }), { state: 'neutral', text })
  }
  for (const index of [undefined, -1, 1.5, '0', NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(neutralFor({ role: 'step.index', index }), empty)
  }
})

test('empty policies and unknown rules cannot invent content; the only stat literal is N/A', () => {
  for (const role of [
    'person.name',
    'person.role',
    'person.bio',
    'person.image',
    'stat.label',
    'stat.unit',
    'offering.price',
    'offering.price_note',
    'offering.description',
    'package.period',
    'quote.text',
    'faq.question',
    'step.description',
    'unknown',
    'constructor'
  ]) {
    assert.deepEqual(neutralFor({ role }), empty)
  }
  assert.deepEqual(neutralFor({ role: 'stat.value' }), {
    state: 'neutral',
    text: 'N/A',
    neutralKey: 'neutral.stat.dash'
  })
  assert.deepEqual(neutralFor({ role: 'stat.value', policy: { policy: 'literal', value: 'N/A' } }), {
    state: 'neutral',
    text: 'N/A'
  })
  assert.deepEqual(neutralFor({ role: 'stat.value', policy: { policy: 'empty' } }), empty)
  for (const value of [
    '0',
    '100%',
    'Coming soon',
    'Chef’s selection',
    'Seasonal special',
    'House favourite',
    'Market price'
  ]) {
    assert.deepEqual(neutralFor({ role: 'stat.value', policy: { policy: 'literal', value } }), empty)
  }
  for (const policy of [
    null,
    {},
    'empty',
    { policy: 'invent' },
    { policy: 'neutral_key', key: 'missing' },
    { policy: 'neutral_key', key: 'constructor' },
    { policy: 'neutral_by_kind' }
  ]) {
    assert.deepEqual(neutralFor({ role: 'offering.name', policy, kind: 'dish' }), empty)
  }
})

test('Team and Overview are block headings, never people or statistics', () => {
  for (const [key, text] of [
    ['neutral.heading.team', 'Team'],
    ['neutral.heading.overview', 'Overview']
  ]) {
    const policy = { policy: 'neutral_key', key }
    assert.deepEqual(neutralFor({ role: 'editorial.heading', policy }), {
      state: 'neutral',
      text,
      neutralKey: key
    })
    for (const role of ['person.name', 'stat.label', 'offering.name']) {
      assert.deepEqual(neutralFor({ role, policy, kind: 'service' }), empty)
    }
    for (const locale of locales) {
      assert.equal(neutralFor({ role: 'editorial.heading', policy, locale }).state, 'neutral')
    }
  }
})
