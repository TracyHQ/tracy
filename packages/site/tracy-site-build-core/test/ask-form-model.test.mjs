/**
 * The ask form's data contract (`src/client/ask-form/model.ts`): how a dsh request and a Tracy
 * questionnaire become one form, and how a draft goes back to each source.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fromDsh,
  fromTracy,
  LONGTEXT_MAX,
  toDshAnswer,
  toTracyAnswers,
  visibleItems
} from '../src/client/ask-form/model.ts'

const opts = (...labels) => labels.map((label) => ({ label }))
const recommendedOf = (form, i = 0) => form.items[i].options.filter((o) => o.recommended).map((o) => o.value)

test('recommended: the first option carrying the suffix', () => {
  const form = fromDsh([{ id: 'a', question: 'Q?', options: opts('Stripe (Recommended)', 'PayPal') }])
  assert.deepEqual(recommendedOf(form), ['Stripe (Recommended)'])
})

test('recommended: an option in the middle, named explicitly', () => {
  const form = fromDsh([{ id: 'a', question: 'Q?', options: opts('A', 'B', 'C'), recommended: 'B' }])
  assert.deepEqual(recommendedOf(form), ['B'])
})

test('recommended: none declared, none marked', () => {
  const form = fromDsh([{ id: 'a', question: 'Q?', options: opts('A', 'B') }])
  assert.deepEqual(recommendedOf(form), [])
})

test('recommended: an explicit value that names no option is ignored (the suffix still counts)', () => {
  const none = fromDsh([{ id: 'a', question: 'Q?', options: opts('A', 'B'), recommended: 'Z' }])
  assert.deepEqual(recommendedOf(none), [])
  const suffix = fromDsh([
    { id: 'a', question: 'Q?', options: opts('A', 'B (Recommended)'), recommended: 'Z' }
  ])
  assert.deepEqual(recommendedOf(suffix), ['B (Recommended)'])
})

test('recommended: the explicit field wins over a different suffixed option', () => {
  const form = fromDsh([{ id: 'a', question: 'Q?', options: opts('A (Recommended)', 'B'), recommended: 'B' }])
  assert.deepEqual(recommendedOf(form), ['B'])
})

test('dsh: the value is the raw label, the display label drops the suffix; answering sends the raw label', () => {
  const form = fromDsh([
    {
      id: 'pay',
      header: 'Payments',
      question: 'Which provider?',
      options: opts('Stripe (Recommended)', 'PayPal')
    }
  ])
  assert.equal(form.title, 'Payments')
  assert.equal(form.items[0].label, 'Which provider?')
  assert.equal(form.items[0].allowOther, true)
  assert.deepEqual(form.items[0].options[0], {
    value: 'Stripe (Recommended)',
    label: 'Stripe',
    recommended: true
  })
  const answer = toDshAnswer(form, { pay: { selected: ['Stripe (Recommended)'] } }, 'submit')
  assert.deepEqual(answer, { answers: [{ id: 'pay', selected: ['Stripe (Recommended)'] }] })

  const tracy = fromTracy(
    [
      {
        id: 'tone',
        label: 'Tone',
        kind: 'choice',
        options: ['warm', 'formal'],
        optionLabels: { warm: 'Warm' }
      }
    ],
    'en'
  )
  assert.deepEqual(tracy.items[0].options, [
    { value: 'warm', label: 'Warm' },
    { value: 'formal', label: 'formal' }
  ])
  assert.deepEqual(toTracyAnswers(tracy, { tone: { selected: ['warm'] } }), { tone: 'warm' })
})

test('Other: a single choice sends the text alone, a multi sends both', () => {
  const form = fromDsh([
    { id: 'one', question: 'One?', options: opts('A', 'B') },
    { id: 'many', question: 'Many?', options: opts('A', 'B'), multiSelect: true }
  ])
  const answer = toDshAnswer(
    form,
    { one: { selected: ['A'], custom: ' Mine ' }, many: { selected: ['B'], custom: 'Also this' } },
    'submit'
  )
  assert.deepEqual(answer.answers, [
    { id: 'one', selected: [], custom: 'Mine' },
    { id: 'many', selected: ['B'], custom: 'Also this' }
  ])
})

test('submit: a half-filled draft sends exactly what was entered, never the first option', () => {
  const form = fromDsh([
    { id: 'a', question: 'A?', options: opts('X (Recommended)', 'Y') },
    { id: 'b', question: 'B?', options: opts('P', 'Q') },
    { id: 'c', question: 'Free text?' }
  ])
  assert.equal(form.items[2].kind, 'longtext')
  assert.equal(form.items[2].allowOther, false)
  const answer = toDshAnswer(form, { b: { selected: ['Q'] }, c: { selected: [], custom: 'hello' } }, 'submit')
  assert.deepEqual(answer, {
    answers: [
      { id: 'a', selected: [] },
      { id: 'b', selected: ['Q'] },
      { id: 'c', selected: [], custom: 'hello' }
    ]
  })
  assert.equal('action' in answer, false)
})

test('showWhen: visibility follows the draft, and a hidden answer is not sent', () => {
  const form = fromTracy(
    [
      { id: 'shop', label: 'Sell online?', kind: 'choice', options: ['yes', 'no'] },
      {
        id: 'products',
        label: 'What do you sell?',
        kind: 'longtext',
        showWhen: { all: [{ question: 'shop', is: 'yes' }] }
      }
    ],
    'en'
  )
  assert.deepEqual(
    visibleItems(form, {}).map((i) => i.id),
    ['shop']
  )
  const yes = { shop: { selected: ['yes'] }, products: { selected: [], custom: 'Books' } }
  assert.deepEqual(
    visibleItems(form, yes).map((i) => i.id),
    ['shop', 'products']
  )
  assert.deepEqual(toTracyAnswers(form, yes), { shop: 'yes', products: 'Books' })
  const no = { ...yes, shop: { selected: ['no'] } }
  assert.deepEqual(toTracyAnswers(form, no), { shop: 'no' })
  assert.deepEqual(
    toDshAnswer(form, no, 'submit').answers.map((a) => a.id),
    ['shop']
  )
  // dsh requests carry no conditions: every item is shown.
  const dsh = fromDsh([{ id: 'x', question: 'X?' }])
  assert.deepEqual(visibleItems(dsh, {}), dsh.items)
})

test('decide: keeps answers, fills the recommendation, leaves a question with none empty', () => {
  const form = fromDsh([
    { id: 'a', question: 'A?', options: opts('X', 'Y'), recommended: 'Y' },
    { id: 'b', question: 'B?', options: opts('P', 'Q') },
    { id: 'c', question: 'C?', options: opts('M (Recommended)', 'N') },
    { id: 'd', question: 'D?', options: opts('S', 'T (Recommended)'), multiSelect: true }
  ])
  const answer = toDshAnswer(form, { c: { selected: ['N'] } }, 'decide')
  assert.deepEqual(answer, {
    answers: [
      { id: 'a', selected: ['Y'] },
      { id: 'b', selected: [] },
      { id: 'c', selected: ['N'] },
      { id: 'd', selected: ['T (Recommended)'] }
    ],
    action: 'decide'
  })
})

test('follow_up: keeps what was entered and says so, filling nothing', () => {
  const form = fromDsh([
    { id: 'a', question: 'A?', options: opts('X (Recommended)', 'Y') },
    { id: 'b', question: 'B?', options: opts('P', 'Q') }
  ])
  const answer = toDshAnswer(form, { b: { selected: ['P'], custom: 'but cheaper' } }, 'follow_up')
  assert.deepEqual(answer, {
    answers: [
      { id: 'a', selected: [] },
      { id: 'b', selected: [], custom: 'but cheaper' }
    ],
    action: 'follow_up'
  })
})

test('tracy: limits, languages and the answers shape toBrief takes', () => {
  const form = fromTracy(
    [
      { id: 'name', label: 'Name', kind: 'text' },
      { id: 'about', label: 'About', kind: 'longtext', hint: 'One line' },
      { id: 'pages', label: 'Pages', kind: 'multi', options: ['home', 'blog'] },
      { id: 'languages', label: 'Languages', kind: 'languages', options: ['en', 'vi'] }
    ],
    'en',
    { oneLanguage: true }
  )
  assert.equal(form.source, 'tracy')
  assert.equal(form.items[0].maxLength, 200)
  assert.equal(form.items[1].maxLength, LONGTEXT_MAX)
  assert.equal(form.items[1].description, 'One line')
  assert.equal(form.items[3].oneLanguage, true)
  assert.equal(
    form.items.every((i) => i.allowOther === false),
    true
  )
  const answers = toTracyAnswers(form, {
    name: { selected: [], custom: '  Acme  ' },
    about: { selected: [], custom: 'x'.repeat(400) },
    pages: { selected: [] },
    languages: { selected: ['vi', 'en'] }
  })
  assert.deepEqual(answers, { name: 'Acme', about: 'x'.repeat(300), languages: ['vi'] })
})
