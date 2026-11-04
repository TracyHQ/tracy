/**
 * The T4 page background (`joomla-t4-body-background.js`): the picture a T4 template paints behind the top of its pages
 * is one site setting, `body_bg_img`, written through `template.siteSettings` (`fields`, so every profile a site style
 * uses takes it). A picture already uploaded sets it, nothing clears it; a plugin older than the release that takes the
 * key is refused before any call, with a message naming the version. Fabricated tennis club template and paths.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BODY_BACKGROUND_SINCE,
  writeT4BodyBackground
} from '../src/sites/brief-engines/joomla-t4-body-background.js'

const PICTURE = 'images/tracy-pictures/court-at-dusk-3f2a9c1b-apply-7.jpg'

/** A Joomla site behind the Apply door: the plugin version `info` answers, and every write it was sent. */
function site({ component = BODY_BACKGROUND_SINCE, answer = { ok: true } } = {}) {
  const calls = []
  return {
    calls,
    read: async (action) => (action === 'info' ? { ok: true, info: { component } } : { ok: false }),
    write: async (action, params) => {
      calls.push({ action, params })
      if (answer.ok === false) throw Object.assign(new Error(answer.message ?? answer.error), { answer })
      return answer
    }
  }
}

test('a picture already on the site becomes the background of every profile, in one set', async () => {
  const s = site()
  const r = await writeT4BodyBackground({
    template: 'demo_court',
    path: `/${PICTURE}`,
    read: s.read,
    write: s.write
  })
  assert.deepEqual(r, { ok: true, value: PICTURE })
  assert.deepEqual(s.calls, [
    {
      action: 'template.siteSettings',
      params: { operation: 'set', template: 'demo_court', fields: { body_bg_img: PICTURE } }
    }
  ])
})

test('no picture clears the background, with the apply id when one is given', async () => {
  const s = site({ component: '0.25.0' })
  const r = await writeT4BodyBackground({
    template: 'demo_court',
    path: null,
    read: s.read,
    write: s.write,
    applyId: 'pictures-9'
  })
  assert.deepEqual(r, { ok: true, value: '' })
  assert.deepEqual(s.calls[0].params, {
    operation: 'set',
    template: 'demo_court',
    fields: { body_bg_img: '' },
    apply_id: 'pictures-9'
  })
})

test('an older plugin is refused before any write, and the message names the release that takes the key', async () => {
  const s = site({ component: '0.24.66' })
  const r = await writeT4BodyBackground({
    template: 'demo_court',
    path: PICTURE,
    read: s.read,
    write: s.write
  })
  assert.equal(r.ok, false)
  assert.equal(r.tooOld, true)
  assert.match(
    r.reason,
    new RegExp(`Claude Cowork for Joomla ${BODY_BACKGROUND_SINCE.replaceAll('.', '\\.')} or later`)
  )
  assert.match(r.reason, /0\.24\.66/)
  assert.deepEqual(s.calls, [])
})

test('a plugin whose version cannot be read is tried, and its refusal of the key reads as too old', async () => {
  const s = site({
    component: null,
    answer: {
      ok: false,
      error: 'unsupported',
      message: 'body_bg_img cannot be written through template.siteSettings'
    }
  })
  const r = await writeT4BodyBackground({
    template: 'demo_court',
    path: PICTURE,
    read: s.read,
    write: s.write
  })
  assert.equal(r.tooOld, true)
  assert.match(r.reason, /or later/)
  assert.equal(s.calls.length, 1)
})

test('a template without T4 refusing the key is said as such, not as an old plugin', async () => {
  const s = site({
    answer: {
      ok: false,
      error: 'unsupported',
      message:
        'body_bg_img cannot be written through template.siteSettings on a template without T4 (its logo is a template style param: templateStyle)'
    }
  })
  const r = await writeT4BodyBackground({
    template: 'demo_court',
    path: PICTURE,
    read: s.read,
    write: s.write
  })
  assert.equal(r.tooOld, undefined)
  assert.match(r.reason, /without T4/)
})

test('any other refusal is said as the site said it', async () => {
  const s = site({
    answer: {
      ok: false,
      error: 'bad_params',
      message: 'body_bg_img: images/x.jpg is not a file on this site'
    }
  })
  const r = await writeT4BodyBackground({
    template: 'demo_court',
    path: PICTURE,
    read: s.read,
    write: s.write
  })
  assert.equal(r.tooOld, undefined)
  assert.match(r.reason, /not a file on this site/)
})

test('a path that is not a picture under images/, or no template, is refused without a call', async () => {
  for (const [template, path] of [
    ['demo_court', 'templates/demo_court/css/template.css'],
    ['demo_court', 'images/../configuration.php'],
    ['demo_court', 'https://example.test/court.jpg'],
    ['', PICTURE]
  ]) {
    const s = site()
    const r = await writeT4BodyBackground({ template, path, read: s.read, write: s.write })
    assert.equal(r.ok, false, `${template} ${path}`)
    assert.deepEqual(s.calls, [])
  }
})
