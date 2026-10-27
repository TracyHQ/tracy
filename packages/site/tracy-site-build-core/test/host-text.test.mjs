/**
 * The Build tab reads a host sentence by its code (`host.<code>`) in the interface language, and
 * falls back to the English the host wrote whenever that is not possible. The translate here
 * behaves like dsh's: a key no dictionary holds answers the key itself.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hostText, refusalText, stageDetail } from '../src/client/host-text.ts'
import { baseEn } from '../src/client/strings.ts'
import { en as wordpressEn } from '../../tracy-site-build-wordpress/src/client/strings.ts'

/** A dsh-like translate over one dictionary. */
const translator =
  (dict) =>
  (key, params = {}) => {
    const template = dict[key] ?? key
    return template.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
  }

const german = translator({
  'host.SITE_SILENT': '{site} hat nicht geantwortet.',
  'host.NO_DOOR': 'Dieser Arbeitsbereich erreicht die Website nicht.'
})

test('a known code reads in the interface language, with its values filled in', () => {
  assert.equal(
    hostText(german, 'SITE_SILENT', { site: 'wp-demo' }, 'wp-demo did not answer.'),
    'wp-demo hat nicht geantwortet.'
  )
})

test('a code the catalogue does not carry falls back to the English the host wrote', () => {
  assert.equal(hostText(german, 'FROM_A_NEWER_HOST', {}, 'Some new sentence.'), 'Some new sentence.')
})

test('no code, or something that is not a code, is shown as written', () => {
  assert.equal(
    hostText(german, undefined, undefined, 'install_failed: disk full'),
    'install_failed: disk full'
  )
  assert.equal(hostText(german, 'stage.check.run', {}, 'as written'), 'as written')
  assert.equal(hostText(german, '', {}, 'as written'), 'as written')
})

test('stageDetail: the detail in the reader’s language, or nothing when the stage has none', () => {
  assert.equal(
    stageDetail(german, { detail: 'This lane cannot reach the site.', detailCode: 'NO_DOOR' }),
    'Dieser Arbeitsbereich erreicht die Website nicht.'
  )
  assert.equal(
    stageDetail(german, { detail: 'personalize failed (exit 2): boom' }),
    'personalize failed (exit 2): boom'
  )
  assert.equal(stageDetail(german, {}), undefined)
})

test('refusalText: a refused start reads by its message code', () => {
  assert.equal(
    refusalText(
      translator({ 'host.START_BUILD_BUSY': 'Eine andere Sitzung baut diese Website bereits auf.' }),
      {
        message: 'Another session is already building this site.',
        messageCode: 'START_BUILD_BUSY'
      }
    ),
    'Eine andere Sitzung baut diese Website bereits auf.'
  )
})

test('in English the code reads the same sentence the host filled, because both read one table', () => {
  const english = translator(wordpressEn)
  assert.equal(hostText(english, 'SITE_SILENT', { site: 's' }, 'unused'), 's did not answer.')
  assert.equal(
    hostText(english, 'WP_THEME_MISSING', { theme: 'tracy' }, 'unused'),
    'The restored site does not carry the tracy theme.'
  )
  // The shared codes are in every plugin's English, through the base table.
  assert.equal(typeof baseEn['host.NOT_SIGNED_IN'], 'string')
})
