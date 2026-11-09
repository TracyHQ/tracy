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
  // The pinned version, whichever it is: the kit and the contract beside it name the same release.
  assert.equal(step.params.contract, `ja-diner/wp7/${step.params.version}`)
  assert.equal(step.params.kitQuickstartVersion, step.params.version)
  assert.ok(Number(step.params.pages) > 0, 'the kit lists pages')
  assert.ok(Number(step.params.blocks) > 0, 'the kit lists blocks')
  assert.ok(Number(step.params.images) > 0, 'the kit lists images')
})

test('JA Diner WP7: the committed kit is approved by a person and its self-checks are all explained', () => {
  const { release, world } = dinerWp7()
  const verdict = readinessVerdict(release, world)
  const step = stepOf(verdict, 'template-kit')
  assert.equal(step.state, 'done')
  assert.equal(step.code, 'kit-approved')
  assert.ok(step.params.approvedBy, 'a person approved the pack')
  assert.equal(pieceOf(verdict, 'template-kit').state, 'done')
})

test('a copy of JA Diner WP7 whose kit has a failing self-check is held as kit-incomplete', () => {
  const { release, world, done } = dinerWp7({
    edit: ({ readJson, writeJson }) => {
      const kit = readJson('template-kit.json')
      kit.checks.orphanTexts = 3
      writeJson('template-kit.json', kit)
    }
  })
  try {
    const verdict = readinessVerdict(release, world)
    const step = stepOf(verdict, 'template-kit')
    assert.deepEqual([step.state, step.code], ['todo', 'kit-incomplete'])
    assert.match(String(step.params.reason), /self-checks fail/)
    assert.equal(pieceOf(verdict, 'template-kit').state, 'todo')
  } finally {
    done()
  }
})

test('a copy of JA Diner WP7 whose kit no person approved is held as kit-not-approved', () => {
  const { release, world, done } = dinerWp7({
    edit: ({ readJson, writeJson }) => {
      const kit = readJson('template-kit.json')
      delete kit.approval
      writeJson('template-kit.json', kit)
    }
  })
  try {
    const step = stepOf(readinessVerdict(release, world), 'template-kit')
    assert.deepEqual([step.state, step.code], ['todo', 'kit-not-approved'])
  } finally {
    done()
  }
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
    assert.match(String(step.params.reason), /captured for 0\.0\.1, not \d+\.\d+\.\d+/)
  } finally {
    done()
  }
})

test('JA Diner WP7: the kit reads each page as its sections, and its accent as the brand colour', () => {
  const { release, world, dir } = dinerWp7()
  const kit = JSON.parse(readFileSync(path.join(dir, 'template-kit.json'), 'utf8'))
  // Every page lists header, its body and footer; the kit has a block for each page group and every id a page lists exists.
  const front = kit.pages.find((p) => p.path === '/')
  const shown = front.blocks['1440']
  assert.ok(shown.length >= 3, `the front page shows ${shown.length} blocks`)
  const ids = new Set(kit.blocks.map((b) => b.id))
  for (const id of shown) assert.ok(ids.has(id), `block ${id} of the front page exists in the kit`)
  // theme.json names the accent; a search badge reusing it does not make it a status colour.
  assert.equal(kit.site.brandColours.primary.value, '#c36349')
  const step = stepOf(readinessVerdict(release, world), 'template-kit')
  assert.ok(!(step.params.flowGaps ?? []).some((g) => g.code === 'kit-brand-colour-from-link'))
})

const flowCodes = (verdict) => (stepOf(verdict, 'template-kit').params.flowGaps ?? []).map((g) => g.code)

test('JA Diner WP7: the header logo is a Site Logo block set through the site_logo option, so no brand gap', () => {
  const { release, world } = dinerWp7()
  const codes = flowCodes(readinessVerdict(release, world))
  assert.ok(!codes.includes('kit-brand-unreadable'), codes.join(', '))
  assert.ok(!codes.includes('kit-logo-unsettable'), codes.join(', '))
})

test('a copy whose header logo is not a Site Logo block still raises kit-brand-unreadable', () => {
  const { release, world, done } = dinerWp7({
    edit: ({ readJson, writeJson }) => {
      const nav = readJson('navigation-source.json')
      for (const part of nav.templateParts)
        part.content = part.content.replaceAll(/<!-- wp:site-logo[^>]*\/-->/g, '<!-- wp:image /-->')
      writeJson('navigation-source.json', nav)
    }
  })
  try {
    assert.ok(flowCodes(readinessVerdict(release, world)).includes('kit-brand-unreadable'))
  } finally {
    done()
  }
})

test('a copy without the captured theme markup keeps the Joomla judgement: kit-brand-unreadable', () => {
  const { release, world, done } = dinerWp7({ edit: ({ remove }) => remove('navigation-source.json') })
  try {
    assert.ok(flowCodes(readinessVerdict(release, world)).includes('kit-brand-unreadable'))
  } finally {
    done()
  }
})
