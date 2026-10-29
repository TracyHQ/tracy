// The packing rules of link targets and videos (spec TracyHQ/tracy#189 round 9, class C), on trimmed maps of two invented
// templates: a florist's and a yoga studio's.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lintContentMap } from '../src/lib/content-map-lint.js'

const map = (slots) => ({ roleVocabularyVersion: 3, entities: [], slots })
const rules = (m) => lintContentMap(m).findings.filter((f) => /^(?:link-target|video-slot)/.test(f.rule))

test('a link target declared as a button label is an error; declared as a url role it passes', () => {
  const wrong = map([
    { key: 'article-4.8', entity: 'article-4', type: 'text', sample: '#', role: 'editorial.button_label' },
    {
      key: 'article-4.9',
      entity: 'article-4',
      type: 'text',
      sample: 'index.php?Itemid=12',
      role: 'editorial.heading'
    }
  ])
  assert.deepEqual(
    rules(wrong).map((f) => [f.rule, f.key, f.severity]),
    [
      ['link-target-wrong-role', 'article-4.8', 'error'],
      ['link-target-wrong-role', 'article-4.9', 'error']
    ]
  )
  const right = map([
    { key: 'article-4.8', entity: 'article-4', type: 'url', sample: '#', role: 'editorial.navigation_url' },
    {
      key: 'article-4.10',
      entity: 'article-4',
      type: 'text',
      sample: 'Fresh bouquets',
      role: 'editorial.heading'
    }
  ])
  assert.deepEqual(rules(right), [])
})

test('a video slot that names no video is an error; an id or a link passes', () => {
  const m = map([
    { key: 'article-7.12', entity: 'article-7', type: 'text', sample: 'Ab3dE5gH7jK', role: 'business.video' },
    {
      key: 'module-30.6',
      entity: 'module-30',
      type: 'url',
      sample: 'https://youtu.be/Zz9yX8wV7uT',
      role: 'business.video'
    },
    { key: 'module-30.7', entity: 'module-30', type: 'url', sample: '', role: 'business.video' }
  ])
  assert.deepEqual(
    rules(m).map((f) => [f.rule, f.key]),
    [['video-slot-names-no-video', 'module-30.7']]
  )
})
