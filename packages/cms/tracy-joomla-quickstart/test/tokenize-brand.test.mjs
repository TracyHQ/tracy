/**
 * `tokenize-brand` — turns a quickstart's demo brand into identity tokens (`{site.name}`…) in the
 * archive, so `plg_system_tracyidentity` can show the customer's own values on every page.
 *
 * The rules are data (one file per quickstart); these tests pin how any rule table is applied.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  planUpdates,
  remapTranslations,
  toSql,
  tokenizeParams,
  tokenizeText
} from '../scripts/tokenize-brand.mjs'

const RULES = {
  replace: [
    { from: 'Northgate', to: '{site.name}' },
    { from: 'Northgate Industrial JSC', to: '{site.name}' },
    { from: 'Northgate Industrial', to: '{site.name}' }
  ]
}

test('the longest demo name wins, whatever order the rules are written in', () => {
  assert.equal(
    tokenizeText('© 2026 Northgate Industrial JSC. Northgate Industrial builds. Why Northgate?', RULES),
    '© 2026 {site.name}. {site.name} builds. Why {site.name}?'
  )
})

test('module params are tokenized down to the strings inside the nested ACM config', () => {
  const params = JSON.stringify({
    'jatools-config': JSON.stringify({
      ':type': 'tracy:tb-footer',
      'tb-footer': { lede: 'Northgate Industrial JSC. Since 2004.', image: 'images/northgate/map-ru.png' }
    }),
    cache: 0
  })
  const out = JSON.parse(tokenizeParams(params, RULES))
  assert.deepEqual(JSON.parse(out['jatools-config']), {
    ':type': 'tracy:tb-footer',
    'tb-footer': { lede: '{site.name}. Since 2004.', image: 'images/northgate/map-ru.png' }
  })
  assert.equal(out.cache, 0)
})

test('params with no demo name come back byte for byte', () => {
  const params = '{"jatools-config":"{\\"a\\":\\"b\\"}","x":"caf\\u00e9\\/"}'
  assert.equal(tokenizeParams(params, RULES), params)
})

test('only the columns a visitor reads are planned, and the identity module is never rewritten', () => {
  const rows = [
    {
      table: 'modules',
      id: 7,
      note: '',
      content: '<p>Northgate</p>',
      params: '{}',
      title: 'Northgate footer'
    },
    { table: 'modules', id: 9, note: 'tracy:identity', content: '', params: '{"a":"Northgate"}', title: 'x' },
    {
      table: 'content',
      id: 3,
      title: 'Working at Northgate',
      introtext: '<p>ok</p>',
      fulltext: '',
      alias: 'northgate'
    },
    { table: 'assets', id: 1, title: 'Northgate asset' }
  ]
  assert.deepEqual(planUpdates(rows, RULES), [
    { table: 'modules', id: 7, column: 'content', before: '<p>Northgate</p>', after: '<p>{site.name}</p>' },
    {
      table: 'content',
      id: 3,
      column: 'title',
      before: 'Working at Northgate',
      after: 'Working at {site.name}'
    }
  ])
})

test('the SQL writes each value back exactly, quotes and backslashes included', () => {
  // MariaDB string literals: a backslash and a single quote are each escaped with a backslash.
  const after = String.raw`{"a":"it's \"{site.name}\" \\ ok"}`
  const sql = toSql([{ table: 'modules', id: 7, column: 'params', before: 'x', after }], 'ng_')
  assert.equal(
    sql,
    String.raw`UPDATE ` +
      '`ng_modules` SET `params` = ' +
      String.raw`'{"a":"it\'s \\"{site.name}\\" \\\\ ok"}'` +
      ' WHERE `id` = 7;\n'
  )
})

test('text a longer rule produced is never rewritten by a shorter one, so a rule can keep a URL whole', () => {
  const rules = {
    replace: [
      { from: 'Northgate', to: '{site.name}' },
      { from: 'youtube.com/@NorthgateIndustrial', to: 'youtube.com/@NorthgateIndustrial' }
    ]
  }
  assert.equal(
    tokenizeText('Northgate on youtube.com/@NorthgateIndustrial', rules),
    '{site.name} on youtube.com/@NorthgateIndustrial'
  )
})

test('a contact form recipient is never tokenized: mail is sent to it, and a token is not an address', () => {
  const rules = { replace: [{ from: 'sales@northgate-ind.ru', to: '{contact.email}' }] }
  const rows = [
    {
      table: 'contact_details',
      id: 1,
      name: 'x',
      email_to: 'sales@northgate-ind.ru',
      misc: 'sales@northgate-ind.ru'
    }
  ]
  assert.deepEqual(
    planUpdates(rows, rules).map((u) => u.column),
    ['misc']
  )
})

test("an article image's alt text is read aloud and shown when the image fails, so it is tokenized too", () => {
  const images = JSON.stringify({
    image_fulltext: 'images/northgate/team-crew.png',
    image_fulltext_alt: 'Working at Northgate'
  })
  const [update] = planUpdates([{ table: 'content', id: 557, title: '', images }], RULES)
  assert.equal(update.column, 'images')
  assert.deepEqual(JSON.parse(update.after), {
    image_fulltext: 'images/northgate/team-crew.png',
    image_fulltext_alt: 'Working at {site.name}'
  })
})

test('an ACM override replaces the listed fields of every module of that block type, in every language', () => {
  const block = (type, fields) =>
    JSON.stringify({
      'jatools-config': JSON.stringify({ ':type': `tracy_business:${type}`, [type]: fields })
    })
  const rules = {
    replace: [],
    acm: {
      'tracy_business:tb-sys-social': {
        'tb-sys-social[name]': ['Facebook', 'YouTube'],
        'tb-sys-social[url]': ['{social.facebook}', '{social.youtube}']
      }
    }
  }
  const rows = [
    {
      table: 'modules',
      id: 1,
      note: '',
      content: '',
      params: block('tb-sys-social', {
        'tb-sys-social[title]': ['Социальные сети'],
        'tb-sys-social[name]': ['VK'],
        'tb-sys-social[url]': ['']
      })
    },
    { table: 'modules', id: 2, note: '', content: '', params: block('tb-hero', { 'tb-hero[name]': ['VK'] }) }
  ]
  const updates = planUpdates(rows, rules)
  assert.deepEqual(
    updates.map((u) => u.id),
    [1]
  )
  assert.deepEqual(JSON.parse(JSON.parse(updates[0].after)['jatools-config'])['tb-sys-social'], {
    'tb-sys-social[title]': ['Социальные сети'],
    'tb-sys-social[name]': ['Facebook', 'YouTube'],
    'tb-sys-social[url]': ['{social.facebook}', '{social.youtube}']
  })
})

// Translations are keyed by slot key, and a key is a position counter inside its entity: when the
// demo's structure changes (six networks become five) the keys after it shift. They are matched by
// what the slot IS — entity, column, JSON path or XPath — never by key.
const slot = (key, entity, jsonPath, sample) => ({ key, entity, column: 'params', jsonPath, sample })

test('a translation follows its slot to a new key, tokenized with the same rules', () => {
  const oldSlots = [slot('module-1.0', 'module-1', ['b', 'title'], 'Why Northgate')]
  const newSlots = [
    slot('module-1.0', 'module-1', ['b', 'intro'], 'Plain intro'),
    slot('module-1.1', 'module-1', ['b', 'title'], 'Why {site.name}')
  ]
  const out = remapTranslations({
    oldSlots,
    newSlots,
    translations: { 'module-1.0': 'Warum Northgate' },
    rules: RULES
  })
  assert.deepEqual(out.translations, { 'module-1.1': 'Warum {site.name}' })
  assert.deepEqual(out.missing, ['module-1.0'])
})

test('a source that became language-neutral is its own translation; one that dropped a token is missing', () => {
  const oldSlots = [
    slot('m.0', 'm', ['s', 'name', 0], 'Telegram'),
    slot('m.1', 'm', ['s', 'url', 0], ''),
    slot('m.2', 'm', ['s', 'intro', 0], 'Hotline: 8 800'),
    slot('m.3', 'm', ['s', 'lede', 0], 'Northgate builds plants')
  ]
  const newSlots = [
    slot('m.0', 'm', ['s', 'name', 0], 'Facebook'),
    slot('m.1', 'm', ['s', 'url', 0], '{social.facebook}'),
    slot('m.2', 'm', ['s', 'intro', 0], 'Call us today'),
    slot('m.3', 'm', ['s', 'lede', 0], '{site.name} builds plants')
  ]
  const translations = { 'm.0': 'Telegram', 'm.1': '', 'm.2': 'Горячая линия', 'm.3': 'Строим заводы' }
  const out = remapTranslations({ oldSlots, newSlots, translations, rules: RULES })
  assert.deepEqual(out.translations, { 'm.0': 'Facebook', 'm.1': '{social.facebook}' })
  assert.deepEqual(out.missing, ['m.2', 'm.3'])
})
