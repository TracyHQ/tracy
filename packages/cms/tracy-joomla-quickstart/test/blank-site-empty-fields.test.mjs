/**
 * The blank site step `empty-declared-fields` (ticket #584) on an invented bakery: every place a mapping file says a
 * build writes becomes empty (a whole column, a JSON path, a nested JSON value, a node of an HTML value, in angle
 * brackets or in the ACM marker notation), an UPDATE that sets such a row is folded in first, a design line keeps its
 * value, a record the blank site deletes is left alone, and the template and language files it writes come out the
 * same byte for byte on every run.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

import { emptyDeclaredFieldsStep, placesToEmpty } from '../scripts/blank-site-empty-fields.mjs'
import { BLANK_SITE_STEPS, produceBlankSite } from '../scripts/blank-site.mjs'
import { parseDump, records, sqlQuote } from '../scripts/joomla-sql-dump.mjs'

// empty-html-places.php runs under `php`: fail on CI, skip with the reason on a laptop (as capture-contract.test.mjs).
const needsPhp = {
  skip:
    spawnSync('php', ['-v']).status === 0
      ? false
      : process.env.CI
        ? assert.fail('empty-html-places.php runs under `php`, and this CI host has none on PATH')
        : 'empty-html-places.php runs under `php`, and this host has none on PATH'
}

const ACM = JSON.stringify({
  ':type': 'tpl:hero',
  hero: {
    title: ['Bread, slowly'],
    columns: ['3'],
    social: ['((div))((a href="#"))((i class="fa fa-x"))((/i))((/a))((/div))']
  }
})
const FOOTER = '<a href="#" class="lead">(555) 010-0000</a>\n<p>1 Invented Lane</p>'
const SQL = [
  'INSERT INTO `#__modules` (`id`, `title`, `content`, `params`, `client_id`) VALUES ',
  `(90,'Hero','',${sqlQuote(JSON.stringify({ 'jatools-config': ACM, 'bg-color': 'dark' }))},0)`,
  `,(91,'Visit us',${sqlQuote(FOOTER)},${sqlQuote(JSON.stringify({ 'default-title': 'Crumb & Co' }))},0);`,
  "UPDATE `#__modules` SET `title` = 'Visit the bakery' WHERE `id` = 91;",
  "INSERT INTO `#__acym_configuration` (`name`, `value`) VALUES ('from_name','Crumb & Co'),('cron_frequency','900');",
  "INSERT INTO `#__content` (`id`, `title`) VALUES (5,'Rye');",
  ''
].join('\n')

const loc = (entity, column, extra = {}) => ({ entity, column, ...extra })
const MAPPING = {
  entities: {
    'module-90': { kind: 'module', identity: {}, sourceId: 90 },
    'module-91': { kind: 'module', identity: {}, sourceId: 91 },
    'article-5': { kind: 'article', identity: {}, sourceId: 5, created: true },
    'acym-from': { kind: 'acymConfiguration', identity: { name: 'from_name' } },
    'logo-light': {
      kind: 'siteSetting',
      identity: { template: 'tpl', profile: 'default', key: 'site_logo' }
    },
    'string-try': { kind: 'languageString', identity: { key: 'TPL_TRY', language: 'en-GB' } },
    'tpl-global': { kind: 'templateGlobal', identity: { template: 'tpl' } }
  },
  blocks: {
    hero: {
      fields: {
        title: loc('module-90', 'params', { nestedJson: 'jatools-config', jsonPath: ['hero', 'title', 0] }),
        columns: loc('module-90', 'params', {
          nestedJson: 'jatools-config',
          jsonPath: ['hero', 'columns', 0]
        }),
        link: loc('module-90', 'params', {
          nestedJson: 'jatools-config',
          jsonPath: ['hero', 'social', 0],
          xpath: '/html/body/div/div/a[1]/@href',
          piece: true
        }),
        heading: loc('module-91', 'title'),
        cta: loc('string-try', 'value'),
        post: loc('article-5', 'title'),
        name: { fact: 'name' }
      },
      designLines: [
        loc('module-90', 'params', { nestedJson: 'jatools-config', jsonPath: ['hero', 'columns', 0] })
      ]
    }
  },
  facts: {
    name: [loc('module-91', 'params', { jsonPath: ['default-title'] }), loc('acym-from', 'value')],
    phone: [
      loc('module-91', 'content', { xpath: '/html/body/div/a[1]' }),
      loc('module-91', 'content', { xpath: '/html/body/div/a[1]/@href', as: 'tel' })
    ],
    address: [loc('module-91', 'content', { xpath: '/html/body/div/p' })],
    logoLight: [loc('logo-light', 'value')]
  },
  overrides: {
    settings: [{ location: loc('tpl-global', 'value', { jsonPath: ['system_opengraph'] }), value: '1' }],
    language: [
      { key: 'MOD_FOOTER_LINE2', language: 'en-GB', value: '' },
      { key: 'TPL_KEEP', keep: 'interface text' }
    ]
  }
}
const SHIPPED = {
  'templates/tpl/etc/site/default.json': JSON.stringify({
    site_logo: 'images/logo.png',
    body_font_family: 'Inter'
  }),
  'templates/tpl/etc/global.json': JSON.stringify({ layout: 'default' })
}
const readFile = (name) => (SHIPPED[name] ? Buffer.from(SHIPPED[name]) : null)
const blank = () =>
  produceBlankSite(SQL, {
    steps: [...BLANK_SITE_STEPS, emptyDeclaredFieldsStep({ mapping: MAPPING, readFile })]
  })

test('the places to empty skip design lines, created records and fact entries', () => {
  const places = placesToEmpty(MAPPING)
  assert.ok(!places.some((p) => p.entity === 'article-5'))
  assert.ok(!places.some((p) => JSON.stringify(p.jsonPath) === '["hero","columns",0]'))
  assert.equal(places.filter((p) => p.entity === 'module-91').length, 5)
})

test('every declared place of a surviving row is empty, a design line keeps its value', needsPhp, () => {
  const { sql, report } = blank()
  const dump = parseDump(sql)
  const [hero, visit] = records(dump, 'modules')
  const params = JSON.parse(hero.params)
  const acm = JSON.parse(params['jatools-config'])
  assert.deepEqual(acm.hero.title, [''])
  assert.deepEqual(acm.hero.columns, ['3'])
  assert.equal(acm.hero.social[0], '((div))((a href=""))((i class="fa fa-x"))((/i))((/a))((/div))')
  assert.equal(params['bg-color'], 'dark')
  assert.equal(visit.title, '', 'the UPDATE is folded into the row, then the row is emptied')
  assert.ok(!sql.includes("SET `title` = 'Visit the bakery'"))
  assert.equal(visit.content, '<a href="" class="lead"></a>\n<p></p>')
  assert.equal(JSON.parse(visit.params)['default-title'], '')
  assert.equal(records(dump, 'acym_configuration').find((r) => r.name === 'from_name').value, '')
  assert.equal(report.steps['empty-declared-fields'].folded, 1)
})

test('the step writes the local template files and the language overrides', needsPhp, () => {
  const { files } = blank()
  assert.deepEqual(
    [...files.keys()],
    [
      'language/overrides/en-GB.override.ini',
      'templates/tpl/local/etc/global.json',
      'templates/tpl/local/etc/site/default.json'
    ]
  )
  assert.equal(
    files.get('language/overrides/en-GB.override.ini').toString(),
    'TPL_TRY=""\nMOD_FOOTER_LINE2=""\n'
  )
  assert.deepEqual(JSON.parse(files.get('templates/tpl/local/etc/site/default.json')), {
    site_logo: '',
    body_font_family: 'Inter'
  })
  assert.deepEqual(JSON.parse(files.get('templates/tpl/local/etc/global.json')), {
    layout: 'default',
    system_opengraph: '1'
  })
})

test('two runs give the same bytes', needsPhp, () => {
  const a = blank()
  const b = blank()
  assert.equal(a.sql, b.sql)
  for (const [name, buf] of a.files) assert.ok(buf.equals(b.files.get(name)), name)
})

test('a place the demo data does not hold fails the step instead of being skipped', needsPhp, () => {
  const mapping = structuredClone(MAPPING)
  mapping.blocks.hero.fields.title.jsonPath = ['hero', 'subtitle', 0]
  assert.throws(
    () => produceBlankSite(SQL, { steps: [emptyDeclaredFieldsStep({ mapping, readFile })] }),
    /no text at/
  )
})
