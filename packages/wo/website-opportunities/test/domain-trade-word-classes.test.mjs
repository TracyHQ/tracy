// The rules that tell what a word names read ONE dictionary of trade words by class (TracyHQ/tracy#242, audit S4), so a
// law firm, a dental clinic and a bakery are read like the coaching club the first lists were written for. Fabricated
// businesses only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  OFFERING_KIND_NOUNS,
  PERSON_ROLE_NOUNS,
  alternationOf,
  formsOf
} from '../domain/trade-word-classes.mjs'

test('the dictionary is the one list: no rule file keeps a hand-written list of offering or role nouns', () => {
  const OWN_LIST = /'lesson',\s*'lessons'|lessons\?\|classes|coach\(?:es\)\?\|trainers\?|coach\(es\)\?/
  for (const file of ['business-reading.mjs', 'post-offerings.mjs'])
    assert.doesNotMatch(readFileSync(new URL(`../domain/${file}`, import.meta.url), 'utf8'), OWN_LIST, file)
  assert.ok(formsOf(OFFERING_KIND_NOUNS).includes('consultations'))
  assert.ok(formsOf(PERSON_ROLE_NOUNS).includes('attorneys'))
  assert.match('practice areas', new RegExp(`^(?:${alternationOf(['practice-areas'])})$`))
})

test('an alternation puts the longer form first, so "classes" wins over "class"', () => {
  const re = new RegExp(`^(?:${alternationOf(formsOf(OFFERING_KIND_NOUNS))})`, 'u')
  assert.equal('classes'.match(re)?.[0], 'classes')
  assert.equal(
    new Set(
      formsOf([
        ['a', 'b'],
        ['b', 'c']
      ])
    ).size,
    3
  )
})
