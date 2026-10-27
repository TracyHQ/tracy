#!/usr/bin/env node
/**
 * The Add site wizard keeps the person's picks while its tab is off screen (walkthrough 11/10/2026,
 * bug 6): WordPress picked, "Change design" opened Design inspiration in the same column, and coming
 * back without a design mounted a fresh wizard on Joomla. The draft comes back under the same press;
 * a new press (a design picked in the gallery) still moves the pill.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_CREATE_PLATFORM } from '../src/client/platforms.ts'
import { initialPress } from '../src/client/press-state.mjs'
import { draftOf, forgetDraft, keepDraft } from '../src/client/wizard-draft.mjs'

/** What a wizard mounting under `scope` with the tab's press starts on — `wizard.tsx`'s two reads. */
function mount(scope, press = {}) {
  const kept = draftOf(scope, press.pressKey)
  return {
    ...initialPress({ ...press, defaultPlatform: DEFAULT_CREATE_PLATFORM, kept }),
    name: kept?.name ?? ''
  }
}

test('a return from Change design without a pick lands on the CMS and address picked by hand', () => {
  const scope = 's1:'
  // "Create a new site" on the start screen: a press naming only the origin card.
  const press = { pressedOrigin: 'create', pressKey: '1700:::create' }
  const first = mount(scope, press)
  assert.equal(first.platform, 'joomla')
  // The person picks WordPress and types an address; the wizard keeps it as it changes.
  keepDraft(scope, { pressKey: press.pressKey, platform: 'wordpress', origin: 'create', name: 'dswalkwp01' })
  // Change design → the tab unmounts; back on Add site with the same press → a fresh mount.
  assert.deepEqual(mount(scope, press), {
    platform: 'wordpress',
    design: undefined,
    origin: 'create',
    name: 'dswalkwp01'
  })
})

test('a bare tab (no press at all) resumes too', () => {
  keepDraft('s2:', { pressKey: undefined, platform: 'emdash', origin: 'create', name: '' })
  assert.equal(mount('s2:').platform, 'emdash')
})

test('a new press wins over the draft: a design picked in the gallery moves the pill', () => {
  const scope = 's3:'
  keepDraft(scope, { pressKey: 'old', platform: 'wordpress', origin: 'create', name: 'mine' })
  const next = mount(scope, {
    pressedPlatform: 'emdash',
    pressedDesign: 'tracy-business',
    pressKey: '1800:emdash:tracy-business'
  })
  assert.deepEqual(next, { platform: 'emdash', design: 'tracy-business', origin: 'create', name: '' })
})

test('the draft keeps the press design on a resume (the card is the press, the pill is the person)', () => {
  const scope = 's4:'
  const press = { pressedPlatform: 'joomla', pressedDesign: 'ja-impact', pressKey: '1900:joomla:ja-impact' }
  keepDraft(scope, { pressKey: press.pressKey, platform: 'wordpress', origin: 'create', name: '' })
  assert.deepEqual(mount(scope, press), {
    platform: 'wordpress',
    design: 'ja-impact',
    origin: 'create',
    name: ''
  })
})

test('drafts are per scope: another conversation starts clean', () => {
  keepDraft('s5:', { pressKey: undefined, platform: 'wordpress', origin: 'import', name: 'a' })
  assert.deepEqual(mount('s6:'), { platform: 'joomla', design: undefined, origin: 'create', name: '' })
  assert.equal(mount('s5:').origin, 'import')
})

test('a created site forgets the draft: the next Add site is a clean form', () => {
  keepDraft('s7:', { pressKey: undefined, platform: 'wordpress', origin: 'create', name: 'made' })
  forgetDraft('s7:')
  assert.deepEqual(mount('s7:'), { platform: 'joomla', design: undefined, origin: 'create', name: '' })
})

test('the memory is bounded: the oldest scope goes first', () => {
  for (let i = 0; i < 25; i++)
    keepDraft(`bound-${i}:`, { pressKey: undefined, platform: 'wordpress', origin: 'create', name: '' })
  assert.equal(draftOf('bound-0:', undefined), undefined)
  assert.equal(draftOf('bound-24:', undefined)?.platform, 'wordpress')
})

test('a draft handed back is a copy: changing it does not change what is kept', () => {
  keepDraft('s8:', { pressKey: undefined, platform: 'wordpress', origin: 'create', name: 'x' })
  const got = draftOf('s8:', undefined)
  got.platform = 'joomla'
  assert.equal(draftOf('s8:', undefined)?.platform, 'wordpress')
})

test('a gallery selection saved in the draft wins over the original entry design on remount', () => {
  const scope = 'gallery-selection:'
  const press = { pressedPlatform: 'joomla', pressedDesign: 'tracy-business', pressKey: 'gallery-entry' }
  keepDraft(scope, {
    pressKey: press.pressKey,
    platform: 'joomla',
    design: 'ja-impact',
    origin: 'create',
    name: 'chosen-design'
  })
  assert.deepEqual(mount(scope, press), {
    platform: 'joomla',
    design: 'ja-impact',
    origin: 'create',
    name: 'chosen-design'
  })
})
