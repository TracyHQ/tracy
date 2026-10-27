// 🔒 THE LANGUAGE THE COPY IS WRITTEN IN IS THE ONE THE CUSTOMER CHOSE, NAMED IN EVERY CALL, NEVER GUESSED.
//
// Measured 08/10/2026 on dev (TracyHQ/tch#1013): `tamq-7q-tone-wb`, JA Nova on WordPress (`ja-nova/wp7`), language
// English (`languages: ['en-us']`), tone "bold", about "A small family bakery in Dubai baking sourdough every morning".
// 30 of the 118 lines on `/` came out in ARABIC (hero, CTA, features, services, team roles, stats) under
// `<html lang="en-US">`; its twin with tone "plain" had none. JA Nova's contract labels no entity with a language, so
// the planner sent neither a batch `language` nor a slot one: the model was left to pick, and "Dubai" picked Arabic.
// The wrong-language check could not catch it either: it skips a slot whose language it does not know.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { planWordpressContract } from '../src/plan-wordpress-contract.mjs'

const NOVA = fileURLToPath(
  new URL('../../tracy-wordpress-quickstart/contracts/ja-nova/wp7/1.1.10/content-map.json', import.meta.url)
)
const contentMap = JSON.parse(readFileSync(NOVA, 'utf8'))
const BAKERY = {
  name: 'Tamarind Bakery',
  about: 'A small family bakery in Dubai baking sourdough every morning',
  tone: 'bold',
  languages: ['en-us']
}

test('the JA Nova wp7 contract labels no entity with a language (why the planner must name one itself)', () => {
  const labelled = contentMap.entities.filter((e) => e?.identity?.language ?? e?.language)
  assert.equal(labelled.length, 0)
})

test('🔒 every batch of JA Nova wp7 names the chosen language, on the batch and on every slot', async () => {
  const calls = []
  const generate = async ({ input }) => {
    calls.push(input)
    return JSON.stringify({ values: {}, pending: input.slots.map((s) => s.key) })
  }
  const out = await planWordpressContract({ contentMap, site: BAKERY, generate })
  assert.ok(out.planned > 0)
  assert.ok(calls.length > 0)
  for (const input of calls) {
    assert.equal(input.language, 'en-us')
    for (const s of input.slots) assert.equal(s.language, 'en-us', s.key)
  }
})

test('the samples JA Nova wp7 shows the model are in the source language: no Arabic, no other script', async () => {
  const shown = []
  const generate = async ({ input }) => {
    for (const s of input.slots) shown.push(s)
    return JSON.stringify({ values: {}, pending: input.slots.map((s) => s.key) })
  }
  await planWordpressContract({ contentMap, site: BAKERY, generate })
  const foreign = shown.filter((s) =>
    /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(String(s.sample ?? ''))
  )
  assert.deepEqual(
    foreign.map((s) => `${s.key}: ${s.sample}`),
    []
  )
})

test('🔒 a JA Nova batch written in Arabic for an English site is asked again, and never written', async () => {
  let call = 0
  const generate = async ({ input }) => {
    call += 1
    const values = Object.fromEntries(
      input.slots
        .filter((s) => typeof s.sample === 'string' && s.sample.trim() !== '' && s.type !== 'url')
        .map((s) => [s.key, 'خبز العجين المخمر كل صباح'])
    )
    return JSON.stringify({ values, pending: [] })
  }
  const hero = contentMap.slots.find((s) => s.type === 'text' && /\s/.test(String(s.sample ?? '')))
  const out = await planWordpressContract({
    contentMap: { entities: contentMap.entities, slots: [hero] },
    site: BAKERY,
    generate
  })
  assert.equal(out.changes[hero.key], undefined)
  assert.equal(out.reasons[hero.key], 'wrong-language')
  assert.ok(out.askedAgain > 0)
  assert.ok(call > 1)
})

test('the prompt says the language is never taken from the brief, a place it names or the tone', async () => {
  let system = ''
  await planWordpressContract({
    contentMap,
    site: BAKERY,
    generate: async (call) => {
      system = call.system
      return JSON.stringify({ values: {}, pending: [] })
    }
  })
  assert.match(system, /never (?:infer|guess|take)/i)
  assert.match(system, /place|city|country/i)
  assert.match(system, /tone/i)
})

test('a site with no language at all is written in the source language, English, and says so', async () => {
  const calls = []
  await planWordpressContract({
    contentMap: { entities: contentMap.entities, slots: contentMap.slots.slice(0, 5) },
    site: { ...BAKERY, languages: [] },
    generate: async ({ input }) => {
      calls.push(input)
      return JSON.stringify({ values: {}, pending: [] })
    }
  })
  for (const input of calls) assert.match(String(input.language), /^en(?:-|$)/)
})
