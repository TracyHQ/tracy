// Site plan checker, rule R21 (ADR 0041): a kept block may not hide a section that shows how the trade works for want
// of facts. Inputs: an invented one-page kit of an invented template and an invented brief; only R21 is read.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'

const BLOCK = 'body-lesson'

function kit() {
  return {
    pageGroups: [{ id: 'group-lesson' }],
    pages: [{ id: 'page-lesson', group: 'group-lesson', blocks: { 1440: [BLOCK] } }],
    blocks: [
      {
        id: BLOCK,
        role: 'body',
        slots: [
          { id: 'lesson.heading', role: 'editorial.heading' },
          { id: 'lesson.intro', role: 'editorial.paragraph' },
          { id: 'lesson.stage-1', role: 'editorial.paragraph' },
          { id: 'lesson.stage-2', role: 'editorial.paragraph' },
          { id: 'lesson.clip', role: 'media.video_id' }
        ],
        lists: [],
        frames: [{ id: 'lesson.frame-1', kind: 'photo', canHide: true }],
        links: [],
        fixedText: [],
        demoOwned: [
          { id: 'lesson.demo-1', role: 'offering.description' },
          { id: 'lesson.demo-2', role: 'offering.description' }
        ]
      }
    ],
    site: { nameSlots: [] }
  }
}

const brief = () => ({
  facts: [
    { id: 'fact_lessons', field: 'services', value: 'Rowing lessons', source: 'stated' },
    {
      id: 'fact_no_classes',
      field: 'services',
      value: 'One to one coaching only, no group classes',
      source: 'stated'
    }
  ],
  missing: []
})

function plan(hiddenSlots) {
  return {
    version: 'site-plan/3',
    pageGroups: [{ id: 'group-lesson', decision: 'keep', why: 'the business teaches' }],
    pages: [
      {
        id: 'page-lesson',
        decision: 'keep',
        why: 'the business teaches',
        blocks: [
          { block: BLOCK, seen: 'a heading and four cards', decision: 'keep', why: 'lessons', hiddenSlots }
        ]
      }
    ],
    sharedBlocks: []
  }
}

const r21 = (hiddenSlots) =>
  checkPlan({ plan: plan(hiddenSlots), kit: kit(), brief: brief() }).rules.find((r) => r.id === 'R21')
const INVENTED = "The brief holds no training routine for this business; the demo's drills would be invented."

test('R21 two slots hidden because the routine would be invented fail', () => {
  const rule = r21([
    { slot: 'lesson.heading', why: INVENTED },
    { slot: 'lesson.stage-1', why: 'Demo rowing routine.' }
  ])
  assert.equal(rule.status, 'fail')
  assert.equal(rule.failures.length, 1)
  assert.match(rule.failures[0].where, /page page-lesson \/ block body-lesson/)
  assert.match(
    rule.failures[0].detail,
    /2 slots hidden for want of facts \(lesson\.heading, lesson\.stage-1\)/
  )
  assert.match(rule.failures[0].detail, /without any number, duration, count or price/)
  assert.match(rule.failures[0].detail, /brief fact id that shows the business does not do this activity/)
})

test('R21 the same run passes when its reasons name the brief fact that shows the activity is absent', () => {
  const why = 'The business runs no group classes (fact_no_classes).'
  const rule = r21([
    { slot: 'lesson.heading', why },
    { slot: 'lesson.stage-1', why }
  ])
  assert.equal(rule.status, 'pass')
})

test('R21 a fact id the brief does not hold does not excuse the run', () => {
  const why = 'Not in the brief (fact_unknown).'
  const rule = r21([
    { slot: 'lesson.heading', why },
    { slot: 'lesson.stage-1', why }
  ])
  assert.equal(rule.status, 'fail')
})

test('R21 demoOwned slots hidden for want of facts pass', () => {
  const rule = r21([
    { slot: 'lesson.demo-1', why: INVENTED },
    { slot: 'lesson.demo-2', why: INVENTED }
  ])
  assert.equal(rule.status, 'pass')
})

test('R21 a single hidden slot passes', () => {
  assert.equal(r21([{ slot: 'lesson.stage-1', why: INVENTED }]).status, 'pass')
})

test('R21 a video id slot does not count toward the run', () => {
  const rule = r21([
    { slot: 'lesson.stage-1', why: INVENTED },
    { slot: 'lesson.clip', why: 'The brief holds no video.' }
  ])
  assert.equal(rule.status, 'pass')
})

test('R21 slots hidden for another reason pass', () => {
  const rule = r21([
    { slot: 'lesson.heading', why: 'the intro already says it' },
    { slot: 'lesson.stage-1', why: 'the block reads whole without it' }
  ])
  assert.equal(rule.status, 'pass')
})
