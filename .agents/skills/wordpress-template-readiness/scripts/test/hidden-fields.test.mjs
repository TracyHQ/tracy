import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wordpressCommandsOf } from '../hidden-fields.mjs'

const KIT = 'kit/template-kit.json'
const ROOT = 'webroot'

test('a legal layout naming a block template is replayed with the webroot that holds the theme', () => {
  const saved = {
    createdPageHide: [{ selector: '.wp-block-post-terms', why: 'every single post prints its tags' }],
    legal: { articleLayout: 'page-plain', why: 'prints the page content alone' }
  }
  assert.deepEqual(wordpressCommandsOf(saved, KIT, ROOT), [
    [
      'created-page-hide',
      '--kit',
      KIT,
      '--selector',
      '.wp-block-post-terms',
      '--why',
      'every single post prints its tags'
    ],
    [
      'legal-layout',
      '--kit',
      KIT,
      '--layout',
      'page-plain',
      '--why',
      'prints the page content alone',
      '--webroot',
      ROOT
    ]
  ])
})

test('a legal layout said none needs no webroot', () => {
  const saved = { legal: { articleLayout: null, why: 'the default page template is plain' } }
  assert.deepEqual(wordpressCommandsOf(saved, KIT, ROOT), [
    ['legal-layout', '--kit', KIT, '--none', '--why', 'the default page template is plain']
  ])
})
