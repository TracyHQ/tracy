import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markChains, CHAIN_BRANDS } from '../domain/chains.mjs'

const c = (name, over = {}) => ({ provider: 'google-places', providerId: name, name, ...over })
const names = (list) => list.filter((x) => x.chain).map((x) => x.name)
const suspects = (list) => list.filter((x) => x.chainSuspect).map((x) => x.name)

test('a name seen twice or more in one search is only a suspect, never a chain; branch words do not split it', () => {
  const out = markChains([
    c('Bánh Mì Sương'),
    c('Phở 77 - Chi nhánh 2'),
    c('Pho 77 chi nhanh Hội An'),
    c('PHỞ 77 (CN 3)'),
    c('Moon Lotus'),
    c('Moon Lotus Signature')
  ])
  assert.deepEqual(suspects(out), ['Phở 77 - Chi nhánh 2', 'Pho 77 chi nhanh Hội An', 'PHỞ 77 (CN 3)'])
  assert.deepEqual(names(out), [])
  assert.equal(out.length, 6)
  assert.ok(out.every((x) => typeof x.chain === 'boolean' && typeof x.chainSuspect === 'boolean'))
})

test('a known brand is a chain even when it appears once, by exact name or as a prefix', () => {
  const out = markChains([
    c('Highlands Coffee'),
    c("McDonald's Hội An"),
    c('Starbucks Reserve'),
    c('Domino’s Pizza - Trần Phú'),
    c('Cộng Cà Phê'),
    c('Pretty Good Cafe'),
    c('Phuc Long Tea Lovers')
  ])
  assert.deepEqual(names(out), [
    'Highlands Coffee',
    "McDonald's Hội An",
    'Starbucks Reserve',
    'Domino’s Pizza - Trần Phú',
    'Cộng Cà Phê',
    'Phuc Long Tea Lovers'
  ])
  assert.deepEqual(suspects(out), [])
  // Two outlets of a listed brand: both flags.
  const two = markChains([c('KFC - Chi nhánh Trần Phú'), c('KFC (CN Hội An)')])
  assert.deepEqual([names(two).length, suspects(two).length], [2, 2])
})

test('a trailing branch number goes only when two words precede it, so "Phở 77" keeps its name', () => {
  const out = markChains([c('Bún Chả Hương Mai 2'), c('Bún chả Hương Mai 3'), c('Phở 77'), c('Pho 12')])
  assert.deepEqual(suspects(out), ['Bún Chả Hương Mai 2', 'Bún chả Hương Mai 3'])
  assert.deepEqual(names(out), [])
})

test('independents stay unmarked and the input is not mutated', () => {
  const input = [c('Lá Bistro'), c('Quiet Leaf Tea House'), c('The Larch House')]
  const copy = structuredClone(input)
  const out = markChains(input)
  assert.deepEqual([names(out), suspects(out)], [[], []])
  assert.deepEqual(input, copy)
  assert.notEqual(out, input)
  assert.deepEqual(markChains([]), [])
  assert.deepEqual(markChains(undefined), [])
})

test('CHAIN_BRANDS is a frozen list of about forty brands', () => {
  assert.ok(Object.isFrozen(CHAIN_BRANDS))
  assert.ok(CHAIN_BRANDS.length >= 40, String(CHAIN_BRANDS.length))
  for (const b of [
    "McDonald's",
    'KFC',
    'Starbucks',
    'Highlands Coffee',
    'Phúc Long',
    'The Coffee House',
    'Trung Nguyên',
    'Lotteria',
    'Jollibee',
    "Pizza 4P's"
  ]) {
    assert.ok(CHAIN_BRANDS.includes(b), b)
  }
})
