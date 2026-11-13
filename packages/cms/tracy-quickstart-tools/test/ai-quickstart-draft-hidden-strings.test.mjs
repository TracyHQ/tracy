// The draft's hidden template strings and inline write forms (ticket #584), on invented kit entries.
import assert from 'node:assert/strict'
import test from 'node:test'
import { hiddenStringsOf } from '../ai-quickstart/lib/draft-hidden-strings.mjs'
import { writeFormOf } from '../ai-quickstart/lib/draft-inline-markup.mjs'

const kit = {
  site: {
    fixedTexts: [
      {
        block: 'block-9',
        text: 'Invented platform notice.',
        canHide: true,
        hiddenBy: {
          setting: 'cms language override',
          file: 'language/overrides/en-GB.override.ini',
          constant: ['TPL_EXAMPLE_NOTICE', 'MOD_EXAMPLE_NOTICE'],
          value: ''
        }
      },
      { block: 'block-9', text: 'Invented label', canHide: false, source: { constant: 'TPL_EXAMPLE_LABEL' } }
    ]
  }
}

test('a decided hidden string takes the kit way of hiding it, and an undecidable one stops the draft', () => {
  assert.deepEqual(hiddenStringsOf({ kit, decisions: {} }), [])
  assert.deepEqual(
    hiddenStringsOf({
      kit,
      decisions: { hiddenStrings: { MOD_EXAMPLE_NOTICE: { why: 'invented: a platform sentence' } } }
    }),
    [
      {
        constant: 'MOD_EXAMPLE_NOTICE',
        block: 'block-9',
        file: 'language/overrides/en-GB.override.ini',
        value: '',
        why: 'invented: a platform sentence'
      }
    ]
  )
  assert.throws(
    () => hiddenStringsOf({ kit, decisions: { hiddenStrings: { TPL_EXAMPLE_LABEL: { why: 'invented' } } } }),
    /no fixed text of the template kit is hidden by a language override of it/
  )
  assert.throws(
    () => hiddenStringsOf({ kit, decisions: { hiddenStrings: { TPL_EXAMPLE_NOTICE: {} } } }),
    /say why the build hides it/
  )
})

test('the inline write form of a slot: codes in ACM data, html in a stored HTML value', () => {
  assert.equal(writeFormOf({ nestedJson: 'jatools-config', jsonPath: ['heading'] }), 'codes')
  assert.equal(writeFormOf({ jsonPath: ['main-section'], xpath: '/html/body/span' }), 'html')
  assert.equal(writeFormOf({ xpath: '/html/body/a/@title' }), null)
  assert.equal(writeFormOf({ column: 'title' }), null)
})
