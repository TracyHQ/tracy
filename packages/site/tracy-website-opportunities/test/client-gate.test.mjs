/**
 * The operator's switch decides whether the feature exists on the page: off, unknown or unreadable
 * all mean off. The Default CMS picker shows the three CMS in a fixed order and never offers one the
 * server says it cannot build.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SWITCH_ID, desktopOpenHook, featureOn, settingsView } from '../src/client/gate.ts'

const ui = (answer) => ({ isShown: (id) => answer(id) })

test('the switch id is the one the catalogue and the Settings section share', () => {
  assert.equal(SWITCH_ID, 'website-opportunities')
})

test('on only when the catalogue lists the switch and it is on', () => {
  assert.equal(featureOn(ui((id) => id === 'website-opportunities')), true)
  assert.equal(featureOn(ui(() => false)), false)
  // A catalogue without the switch throws in isShown: fail closed, never a crash.
  assert.equal(
    featureOn(
      ui(() => {
        throw new Error('not in catalogue.json')
      })
    ),
    false
  )
})

test('the picker lists Joomla, WordPress and EmDash in that order, with what the server allows', () => {
  const view = settingsView({
    cms: 'wordpress',
    cmsSource: 'account',
    options: [
      { cms: 'emdash', available: false, reason: 'adapter_missing' },
      { cms: 'joomla', available: true },
      { cms: 'wordpress', available: true },
      { cms: 'drupal', available: true }
    ]
  })
  assert.deepEqual(view, {
    cms: 'wordpress',
    fromDefault: false,
    options: [
      { cms: 'joomla', available: true, reasonKey: null },
      { cms: 'wordpress', available: true, reasonKey: null },
      { cms: 'emdash', available: false, reasonKey: 'reason.other' }
    ]
  })
})

test('an answer without options or with a bad cms falls back to Joomla, the code default', () => {
  const view = settingsView({ cms: 'drupal', options: [] })
  assert.equal(view.cms, 'joomla')
  assert.equal(view.fromDefault, true)
  // A CMS the server did not mention is not offered.
  assert.ok(view.options.every((o) => o.available === false))
  assert.equal(settingsView(null), null)
})

test('the desktop Help menu is heard only when the app offers it', () => {
  assert.equal(desktopOpenHook(undefined), null)
  assert.equal(desktopOpenHook({ tracyDesktop: { app: {} } }), null)
  assert.equal(desktopOpenHook({ tracyDesktop: { app: { websiteOpportunities: { onOpen: 'x' } } } }), null)
  const heard = []
  const hook = desktopOpenHook({
    tracyDesktop: {
      app: {
        websiteOpportunities: {
          onOpen: (fn) => {
            heard.push(fn)
            return () => heard.pop()
          }
        }
      }
    }
  })
  const stop = hook(() => 'opened')
  assert.equal(heard.length, 1)
  assert.equal(heard[0](), 'opened')
  stop()
  assert.equal(heard.length, 0)
})

test('a hook whose onOpen throws or returns no disposer is still safe to stop', () => {
  const throwing = desktopOpenHook({
    tracyDesktop: {
      app: {
        websiteOpportunities: {
          onOpen: () => {
            throw new Error('x')
          }
        }
      }
    }
  })
  assert.doesNotThrow(() => throwing(() => {})())
  const bare = desktopOpenHook({
    tracyDesktop: { app: { websiteOpportunities: { onOpen: () => undefined } } }
  })
  assert.doesNotThrow(() => bare(() => {})())
})
