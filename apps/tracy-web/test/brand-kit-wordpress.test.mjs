// The brand bench reads a WordPress kit the way the Template kit gate does (#452): a header logo that is a Site Logo
// block is set through the site_logo option, so the kit needs no frame for it. Joomla kits are judged as before.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { brandProblemOfOpenedKit } from '../src/brand-step/brand-control.js'
import { defaultContracts } from '../src/lib/contracts.js'
import { openKit } from '../src/lib/template-kit-source.js'
import { dinerWp7 } from './ja-diner-wp7-fixture.mjs'

test('the brand bench accepts the JA Diner WP7 kit: the logo problem is gone', () => {
  const index = defaultContracts()
  const opened = openKit('ja-diner/wp7/1.0.1', { index })
  assert.ok(opened, 'the Diner kit is readable')
  const problem = brandProblemOfOpenedKit(opened, { index })
  assert.doesNotMatch(String(problem), /logo spots/)
  assert.equal(problem, null)
})

test('a Diner copy whose header logo is not a Site Logo block is still refused', () => {
  const { dir, done } = dinerWp7({
    edit: ({ readJson, writeJson }) => {
      const nav = readJson('navigation-source.json')
      for (const part of nav.templateParts)
        part.content = part.content.replaceAll(/<!-- wp:site-logo[^>]*\/-->/g, '<!-- wp:image /-->')
      writeJson('navigation-source.json', nav)
    }
  })
  try {
    const index = new Map([['ja-diner@1.0.1', { id: 'ja-diner/wp7/1.0.1', dir, platform: 'wordpress' }]])
    const opened = { ref: 'ja-diner/wp7/1.0.1', doc: openKit('ja-diner/wp7/1.0.1')?.doc }
    assert.match(String(brandProblemOfOpenedKit(opened, { index })), /no frame to write them: logo-header-1/)
  } finally {
    done()
  }
})
