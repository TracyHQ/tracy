/**
 * The template-kit piece of the readiness verdict on WordPress (ticket #453): JA Diner WP7, the WordPress reference,
 * carries a template kit built by the kit tool's `wordpress` site adapter, in the same schema as the Joomla kits, and
 * the verdict reads it the way it reads a Joomla kit. WordPress is a slot roles platform (`rolesPlatforms`), so a kit
 * is required: a copy of the release without one, or with one captured for another version, is held.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { readinessVerdict } from '../src/lib/template-readiness/verdict.js'
import { dinerWp7 } from './ja-diner-wp7-fixture.mjs'

const pieceOf = (verdict, piece) => verdict.pieces.find((p) => p.piece === piece)
const stepOf = (verdict, step) => verdict.steps.find((s) => s.step === step)

test('JA Diner WP7: the template-kit piece reads the WordPress kit beside the contract', () => {
  const { release, world } = dinerWp7()
  assert.equal(release.platform, 'wordpress')
  const verdict = readinessVerdict(release, world)
  const step = stepOf(verdict, 'template-kit')
  assert.notEqual(step.code, 'kit-missing', 'the kit beside the contract is read')
  assert.notEqual(step.code, 'kit-invalid', String(step.params.reason ?? ''))
  assert.notEqual(step.code, 'kit-stale', String(step.params.reason ?? ''))
  assert.equal(step.params.platform, 'wordpress')
  assert.equal(step.params.contract, 'ja-diner/wp7/1.0.1')
  assert.equal(step.params.kitQuickstartVersion, '1.0.1')
  assert.ok(Number(step.params.pages) > 0, 'the kit lists pages')
  assert.ok(Number(step.params.blocks) > 0, 'the kit lists blocks')
  assert.ok(Number(step.params.images) > 0, 'the kit lists images')
})

test('JA Diner WP7: the kit is held, as recorded, until its slot roles exist (#459) and a person approves it', () => {
  const { release, world } = dinerWp7()
  const verdict = readinessVerdict(release, world)
  const step = stepOf(verdict, 'template-kit')
  // Recorded as it is: the content map has no slot roles yet, so the kit's self-checks cannot all be 0.
  assert.equal(step.state, 'todo')
  assert.equal(step.code, 'kit-incomplete')
  assert.match(String(step.params.reason), /self-checks fail/)
  assert.equal(pieceOf(verdict, 'template-kit').state, 'todo')
})

test('a copy of JA Diner WP7 without its kit is held with kit-missing: WordPress requires a kit', () => {
  const { release, world, done } = dinerWp7({ edit: ({ remove }) => remove('template-kit.json') })
  try {
    const step = stepOf(readinessVerdict(release, world), 'template-kit')
    assert.deepEqual([step.state, step.code], ['todo', 'kit-missing'])
  } finally {
    done()
  }
})

test('a copy of JA Diner WP7 whose kit was captured for another quickstart version is stale', () => {
  const { release, world, done } = dinerWp7({
    edit: ({ readJson, writeJson }) => {
      const kit = readJson('template-kit.json')
      kit.quickstart.version = '0.0.1'
      writeJson('template-kit.json', kit)
    }
  })
  try {
    const step = stepOf(readinessVerdict(release, world), 'template-kit')
    assert.deepEqual([step.state, step.code], ['todo', 'kit-stale'])
    assert.match(String(step.params.reason), /captured for 0\.0\.1, not 1\.0\.1/)
  } finally {
    done()
  }
})

test('JA Diner WP7: the kit reads each page as its sections, and its accent as the brand colour', () => {
  const { release, world, dir } = dinerWp7()
  const kit = JSON.parse(readFileSync(path.join(dir, 'template-kit.json'), 'utf8'))
  // The front page is its sections (hero, features, tabs, news, subscribe), not one block of the whole post content.
  const front = kit.pages.find((p) => p.path === '/')
  const shown = front.blocks['1440']
  assert.ok(shown.length > 3, `the front page shows ${shown.length} blocks`)
  assert.ok(shown.includes('block-front-page-slideshow'))
  assert.ok(
    !shown.some((id) => id.startsWith('body-')),
    'no whole post content block on a page with sections'
  )
  assert.equal(kit.blocks.find((b) => b.id === 'block-front-page-slideshow').role, 'hero')
  // theme.json names the accent; a search badge reusing it does not make it a status colour.
  assert.equal(kit.site.brandColours.primary.value, '#c36349')
  const step = stepOf(readinessVerdict(release, world), 'template-kit')
  assert.ok(!(step.params.flowGaps ?? []).some((g) => g.code === 'kit-brand-colour-from-link'))
})
