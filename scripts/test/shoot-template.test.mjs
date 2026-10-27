/**
 * What `shoot-template.mjs` decides before it opens a browser: which layouts it was asked for, and
 * what each picture will be called.
 *
 *   node --test scripts/test/shoot-template.test.mjs
 *
 * These two are the half that can be wrong in silence. A misparsed `--layouts` shoots the wrong
 * pages and every one of them uploads fine; a name outside the store's shape is refused by the door
 * after the browser work is already done, which is the expensive way to find out.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseShoot, shotName, VIEWPORTS } from '../shoot-template.mjs'

test('the base, the template and the layouts are read off the command line', () => {
  const asked = parseShoot([
    'https://business-emdash.tracy.site',
    '--template',
    'tracy-business',
    '--layouts',
    'home=/,services=/services,contact=/contact'
  ])
  assert.equal(asked.error, null)
  assert.equal(asked.base, 'https://business-emdash.tracy.site')
  assert.equal(asked.template, 'tracy-business')
  assert.deepEqual(asked.layouts, [
    { key: 'home', path: '/' },
    { key: 'services', path: '/services' },
    { key: 'contact', path: '/contact' }
  ])
  assert.equal(asked.api, null, 'without --api the pictures are written nowhere but the out directory')
  assert.equal(
    asked.cdp,
    null,
    'without --cdp the script launches the machine’s own Chrome, as it always did'
  )
})

test('--cdp names a browser that is already running, so the script attaches instead of launching', () => {
  const asked = parseShoot([
    'https://business-emdash.tracy.site',
    '--template',
    't',
    '--layouts',
    'home=/',
    '--cdp',
    'http://127.0.0.1:9222'
  ])
  assert.equal(asked.error, null)
  assert.equal(asked.cdp, 'http://127.0.0.1:9222')
})

test('a trailing slash on --cdp is dropped, the way it is on the base', () => {
  const at = (cdp) =>
    parseShoot(['https://demo.test', '--template', 't', '--layouts', 'home=/', '--cdp', cdp]).cdp
  assert.equal(at('http://127.0.0.1:9222/'), 'http://127.0.0.1:9222')
  assert.equal(at('http://tracy-dsh:9222///'), 'http://tracy-dsh:9222')
})

test('a trailing slash on the base is dropped, so a path is never joined onto one', () => {
  assert.equal(
    parseShoot(['https://demo.tracy.site/', '--template', 't', '--layouts', 'home=/']).base,
    'https://demo.tracy.site'
  )
})

test('every way the command line can be wrong is a sentence, not a stack trace', () => {
  const wrong = (argv) => parseShoot(argv).error
  assert.match(wrong([]), /base address/)
  assert.match(wrong(['https://demo.test']), /--template/)
  assert.match(wrong(['ftp://demo.test', '--template', 't', '--layouts', 'home=/']), /http/)
  assert.match(wrong(['https://demo.test', '--template', 'Tracy Business', '--layouts', 'home=/']), /id/)
  assert.match(wrong(['https://demo.test', '--template', 't']), /--layouts/)
  assert.match(wrong(['https://demo.test', '--template', 't', '--layouts', 'home']), /key=\/path/)
  assert.match(wrong(['https://demo.test', '--template', 't', '--layouts', 'Home=/']), /key/)
  assert.match(wrong(['https://demo.test', '--template', 't', '--layouts', 'home=about']), /^.*\//)
  assert.match(
    wrong(['https://demo.test', '--template', 't', '--layouts', 'home=/,home=/again']),
    /twice/,
    'two layouts under one key would overwrite each other’s pictures'
  )
  // A CDP endpoint is an ADDRESS, not an executable path: the commonest way to get this wrong is
  // to pass the browser binary, and that must be a sentence rather than a fetch of "undefined".
  assert.match(
    wrong([
      'https://demo.test',
      '--template',
      't',
      '--layouts',
      'home=/',
      '--cdp',
      '/usr/local/bin/tracy-chrome'
    ]),
    /--cdp/
  )
  assert.match(
    wrong(['https://demo.test', '--template', 't', '--layouts', 'home=/', '--cdp', 'ws://127.0.0.1:9222']),
    /http/,
    'the CDP door this script knocks on is the HTTP one (/json/list), not the socket'
  )
})

test('a picture is named for the template, the layout and the width it was taken at', () => {
  assert.equal(shotName('tracy-business', 'home', 1440), 'tracy-business-home-1440.png')
  assert.equal(shotName('tracy-business', 'contact', 390), 'tracy-business-contact-390.png')
})

test('the two viewports are the ones a card frames, desktop first', () => {
  assert.deepEqual(
    VIEWPORTS.map((v) => [v.width, v.height]),
    [
      [1440, 900],
      [390, 844]
    ]
  )
})
