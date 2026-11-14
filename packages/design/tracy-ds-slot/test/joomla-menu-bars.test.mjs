import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseHTML } from 'linkedom'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SYSTEMS = ['refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0', 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671']

test('worn menu bars keep their fill without filling a Font Awesome glyph box', () => {
  for (const [template, band, toggle] of [
    ['vega', 'id="t4-header"', 't4-offcanvas-toggle'],
    ['fit', 'class="wrap navbar navbar-default t3-mainnav"', 'off-canvas-toggle'],
    ['donate', 'id="t3-header"', 'off-canvas-toggle'],
    ['stark', 'id="t4-header" class="t4-palette-primary"', 't4-offcanvas-toggle']
  ]) {
    const contract = loadContract(`joomla-ja-${template}`)
    for (const system of SYSTEMS) {
      const { css } = joomlaSlot(loadProfile(ROOT, system), contractBase(ROOT, contract), contract)
      const selectors = [...css.matchAll(/([^{}]+)\{background-color:currentColor\}/g)].map((m) => m[1])
      assert.ok(selectors.length, `${template}: worn bar fill exists`)
      const { document } = parseHTML(`<html><body><header ${band}><button class="${toggle}">
        <i id="glyph" class="fa fa-bars toggle-bars"></i>
        <span id="solid" class="toggle-bars"></span>
        <span id="first" class="bar-first"></span><span id="mid" class="bar-mid"></span>
        <span id="last" class="bar-last"></span><span id="bootstrap" class="icon-bar"></span>
        </button></header><span id="outside" class="toggle-bars"></span></body></html>`)
      for (const part of ['', '::before', '::after']) {
        const matching = selectors
          .flatMap((selector) => selector.split(/,(?=:root)/))
          .filter((selector) => (part ? selector.endsWith(part) : !/::(?:before|after)$/.test(selector)))
          .map((selector) => (part ? selector.slice(0, -part.length) : selector))
        const filled = (id) => matching.some((selector) => document.getElementById(id).matches(selector))
        assert.equal(filled('glyph'), false, `${template} ${system} glyph${part} stays transparent`)
        assert.equal(filled('solid'), true, `${template} ${system} CSS bar${part} keeps fill`)
        assert.equal(filled('outside'), false, 'unworn content is untouched')
        if (!part)
          for (const id of ['first', 'mid', 'last', 'bootstrap'])
            assert.equal(filled(id), true, `${template}: ${id} keeps fill`)
      }
    }
  }
})
