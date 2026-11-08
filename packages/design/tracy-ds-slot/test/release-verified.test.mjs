/**
 * When `release-batch.mjs verify` may call a rebuilt quickstart verified. A run whose two stands both came up empty
 * (the Joomla installer, no menu link) compared equal on every count and was written as verified.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isInstallerPage, verifiedOf } from '../src/release-verified.mjs'

const SITE_HOME =
  '<html><head><title>Home - Example Travel</title></head><body><a href="/index.php/tours">Tours</a></body></html>'
const INSTALLER_HOME =
  '<html><head><title>Joomla Installer</title></head><body><form action="/installation/index.php"></form></body></html>'
const fine = {
  computedDifferences: { desktop: 0, phone: 0 },
  pages: { checked: 12, differ: [] },
  fonts: { ok: true },
  homes: { now: SITE_HOME, released: SITE_HOME }
}

test('a run that read the site on both stands is verified', () => {
  assert.deepEqual(verifiedOf(fine), { verified: true, problems: [] })
})

test('two empty stands that compare equal are not verified: installer and no menu page', () => {
  const empty = {
    computedDifferences: { desktop: 0, phone: 0 },
    pages: { checked: 0, differ: [] },
    fonts: { ok: true },
    homes: { now: INSTALLER_HOME, released: INSTALLER_HOME }
  }
  const r = verifiedOf(empty)
  assert.equal(r.verified, false)
  assert.deepEqual(r.problems, [
    'the restored version shows the CMS installer, not the site',
    'the released version shows the CMS installer, not the site',
    'the home page links no menu page: nothing was checked'
  ])
})

test('the installer is told from a site page', () => {
  assert.equal(isInstallerPage(INSTALLER_HOME), true)
  assert.equal(isInstallerPage(SITE_HOME), false)
})
