// A question asked and answered out loud (`src/client/voice-answer.mjs`): the line that asks it, and
// the answer the spoken words give dsh's question card — every word said kept.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  askedLine,
  BESIDE_CHOICE,
  CHOICES_READ,
  choiceList,
  choicesOf,
  exactChoice,
  isConfirm,
  namedChoices,
  takesYesOrNo,
  pendingPlan,
  spokenAnswer
} from '../src/client/voice-answer.mjs'

const colours = {
  id: 'q1',
  question: 'Which colour?',
  options: [{ label: 'Red' }, { label: 'Dark red' }, { label: 'Green' }]
}

test('the question is asked with its choices, as a list in the language of the question', () => {
  assert.equal(
    askedLine('I have a question for you on screen.', 'Which colour', ['Red', 'Green'], 'en'),
    'I have a question for you on screen. Which colour? Red or Green.'
  )
  assert.equal(
    askedLine('Có một câu hỏi cho bạn trên màn hình.', 'Màu nào?', ['Đỏ', 'Xanh', 'Vàng'], 'vi'),
    'Có một câu hỏi cho bạn trên màn hình. Màu nào? Đỏ, Xanh hoặc Vàng.'
  )
  assert.equal(askedLine('Lead.', '', [], 'en'), 'Lead.')
  const many = Array.from({ length: CHOICES_READ + 3 }, (_, i) => `C${i}`)
  assert.equal(choiceList(many, 'en').split(/, | or /).length, CHOICES_READ, 'the rest are on the card')
})

test('a choice is named when its label is heard whole; the longer of two labels heard wins', () => {
  assert.deepEqual(namedChoices(['Red', 'Dark red', 'Green'], 'Dark red please'), ['Dark red'])
  assert.deepEqual(namedChoices(['Red', 'Green'], 'red'), ['Red'])
  assert.deepEqual(namedChoices(['Đỏ', 'Xanh'], 'Màu đỏ nhé.'), ['Đỏ'])
  assert.deepEqual(namedChoices(['Red', 'Green'], 'Reddish'), [], 'part of a word is not the label')
})

test('one question: the choice named when that is all that was said, else the person’s own words', () => {
  assert.deepEqual(spokenAnswer([colours], 'Green, please.'), {
    answers: [{ id: 'q1', selected: ['Green'] }]
  })
  const said = 'Green, but a bit lighter than the logo on the home page'
  assert.ok(said.split(' ').length - 1 > BESIDE_CHOICE)
  assert.deepEqual(spokenAnswer([colours], said), { answers: [{ id: 'q1', selected: [], custom: said }] })
  assert.deepEqual(spokenAnswer([colours], 'Red or green, I am not sure'), {
    answers: [{ id: 'q1', selected: [], custom: 'Red or green, I am not sure' }]
  })
  assert.deepEqual(spokenAnswer([{ id: 'q2', question: 'Which page?' }], 'The about page.'), {
    answers: [{ id: 'q2', selected: [], custom: 'The about page.' }]
  })
})

test('a multi-select keeps the choices named beside the words', () => {
  const pages = {
    id: 'p',
    question: 'Which pages?',
    multiSelect: true,
    options: ['Home', 'About', 'Contact']
  }
  assert.deepEqual(spokenAnswer([pages], 'Home and contact'), {
    answers: [{ id: 'p', selected: ['Home', 'Contact'] }]
  })
  const said = 'Home and contact, and also the blog when it exists'
  assert.deepEqual(spokenAnswer([pages], said), {
    answers: [{ id: 'p', selected: ['Home', 'Contact'], custom: said }]
  })
})

test('several questions: each takes the choice named for it, and every word goes as the note', () => {
  const publish = { id: 'q2', question: 'Publish now?', options: [{ label: 'Yes' }, { label: 'Later' }] }
  const said = 'Green, and publish it later'
  assert.deepEqual(spokenAnswer([colours, publish], said), {
    answers: [
      { id: 'q1', selected: ['Green'] },
      { id: 'q2', selected: ['Later'] }
    ],
    note: said
  })
})

test('a choice marked “(Recommended)” is read and named as the card shows it, and answered as written', () => {
  const item = {
    id: 'q1',
    question: 'Nút liên hệ nên màu gì?',
    options: [{ label: 'Đỏ (Recommended)' }, { label: 'Xanh lá' }, { label: 'Vàng （推荐）' }]
  }
  assert.equal(
    askedLine('Có một câu hỏi cho bạn trên màn hình.', item.question, choicesOf(item), 'vi'),
    'Có một câu hỏi cho bạn trên màn hình. Nút liên hệ nên màu gì? Đỏ, Xanh lá hoặc Vàng.'
  )
  // On the stand, 17/10/2026, the marker was read out in a Vietnamese line, and "Đỏ" could not pick it.
  assert.deepEqual(spokenAnswer([item], 'Đỏ nhé.'), {
    answers: [{ id: 'q1', selected: ['Đỏ (Recommended)'] }]
  })
  assert.deepEqual(namedChoices(choicesOf(item), 'chọn vàng'), ['Vàng （推荐）'])
})

test('a choice said in the other Vietnamese spelling of its tone mark is that choice ("Huỷ" / "Hủy", "Xoá" / "Xóa")', () => {
  assert.equal(exactChoice(['Xoá', 'Huỷ'], 'Hủy.'), 'Huỷ')
  assert.equal(exactChoice(['Xóa', 'Hủy'], 'Huỷ.'), 'Hủy')
  assert.deepEqual(namedChoices(['Xoá trang', 'Giữ lại'], 'xóa trang nhé'), ['Xoá trang'])
  // Marks that make another word still tell words apart.
  assert.equal(exactChoice(['Mua', 'Múa'], 'Múa.'), 'Múa')
  assert.equal(exactChoice(['Hơ', 'Hô'], 'hô'), 'Hô')
})

/** Tracy's own confirmation card (D34): the go-ahead first, the keep second, in the card's language. */
const confirm = (go = 'Yes, go ahead', keep = 'No, keep it', id = 'confirm-3f9a') => ({
  id,
  question: 'Delete the post “Yêu chính mình”?',
  options: [{ label: go }, { label: keep }]
})
const picked = (item, label) => ({ answers: [{ id: item.id, selected: [label] }] })

test('a confirm card answered "Đồng ý." in English options: the go-ahead, as on the stand (20/10/2026)', () => {
  const card = confirm()
  assert.ok(isConfirm(card))
  assert.deepEqual(spokenAnswer([card], 'Đồng ý.'), picked(card, 'Yes, go ahead'))
  assert.deepEqual(spokenAnswer([card], 'Không.'), picked(card, 'No, keep it'))
})

test('a confirm card: a clear yes in any of the eight languages picks the first option, a clear no the second', () => {
  const card = confirm('Ja, löschen', 'Nein, behalten')
  for (const said of [
    'Yes.',
    'Đồng ý.',
    'Ja, bitte.',
    'Oui.',
    'Sì.',
    'Sí.',
    'Ja graag.',
    '是的。',
    'Go ahead.'
  ])
    assert.deepEqual(spokenAnswer([card], said), picked(card, 'Ja, löschen'), said)
  for (const said of ['No.', 'Không, giữ lại.', 'Nein.', 'Non.', 'No, grazie.', 'Nee.', '不要。', 'Keep it.'])
    assert.deepEqual(spokenAnswer([card], said), picked(card, 'Nein, behalten'), said)
})

test('a cancel word to a confirm card keeps it: its second option, in any of the eight languages', () => {
  const card = confirm()
  for (const said of [
    'Huỷ.',
    'Hủy.',
    'Cancel.',
    'Abbrechen.',
    'Annuler.',
    'Annulla.',
    'Cancelar.',
    'Annuleer.',
    '取消。'
  ])
    assert.deepEqual(spokenAnswer([card], said), picked(card, 'No, keep it'), said)
  // A card whose own label is the cancel word takes it as that label, as before.
  const own = confirm('Xoá', 'Huỷ')
  assert.deepEqual(spokenAnswer([own], 'Hủy.'), picked(own, 'Huỷ'))
})

test('only one confirm card of two options in their order takes a spoken yes or no', () => {
  assert.equal(takesYesOrNo([confirm()]), true)
  assert.equal(takesYesOrNo([confirm('No, keep it', 'Yes, go ahead')]), false, 'the other way round')
  assert.equal(takesYesOrNo([confirm('Yes', 'No', 'pick-colour')]), false, 'not Tracy’s')
  assert.equal(takesYesOrNo([confirm(), colours]), false, 'beside another question')
  assert.equal(
    takesYesOrNo([{ ...confirm(), options: [{ label: 'Delete' }, { label: 'Hide' }, { label: 'Keep' }] }]),
    false
  )
  assert.equal(takesYesOrNo([{ ...confirm(), multiSelect: true }]), false)
})

test('a confirm card: a choice named comes first, as for any card; words beside it never turn it round', () => {
  const card = confirm('Delete', 'Keep')
  assert.deepEqual(spokenAnswer([card], 'Keep.'), picked(card, 'Keep'))
  assert.deepEqual(spokenAnswer([card], 'Delete, please.'), picked(card, 'Delete'))
  assert.deepEqual(spokenAnswer([card], 'Yes, delete.'), picked(card, 'Delete'))
  assert.deepEqual(spokenAnswer([card], 'No, keep.'), picked(card, 'Keep'))
  // A negation beside the go-ahead's label is no go-ahead: asked again.
  assert.equal(spokenAnswer([card], 'Don’t delete.'), null)
  assert.equal(spokenAnswer([card], 'No, delete.'), null)
  const vi = confirm('Đồng ý', 'Giữ lại')
  assert.equal(spokenAnswer([vi], 'Không đồng ý.'), null, 'never "Đồng ý" out of "không đồng ý"')
  assert.deepEqual(spokenAnswer([vi], 'Đồng ý.'), picked(vi, 'Đồng ý'))
})

test('a confirm card: anything else is no answer (asked again), never the words sent as one', () => {
  const card = confirm()
  for (const said of [
    'Ừ.',
    'Ok.',
    '好的',
    'Uh',
    'Hmm, which post is that?',
    'Yes, but change the title first.',
    'Đồng ý?',
    'Không giữ lại.',
    'Hide it instead.'
  ])
    assert.equal(spokenAnswer([card], said), null, said)
})

test('a confirm card whose labels say the other way round, or not two of them, takes only a choice named', () => {
  const flipped = confirm('No, keep it', 'Yes, go ahead')
  assert.equal(spokenAnswer([flipped], 'Đồng ý.'), null)
  assert.equal(spokenAnswer([flipped], 'Không.'), null)
  assert.deepEqual(spokenAnswer([flipped], 'No, keep it.'), picked(flipped, 'No, keep it'))
  const three = { ...confirm(), options: [{ label: 'Delete' }, { label: 'Hide' }, { label: 'Keep' }] }
  assert.equal(spokenAnswer([three], 'Yes.'), null)
  assert.deepEqual(spokenAnswer([three], 'Hide.'), picked(three, 'Hide'))
  // Beside another question in one request: never answered by voice, never with a note of words.
  assert.equal(spokenAnswer([confirm(), colours], 'Yes, red.'), null)
})

test('a yes or a no is never read for a card the agent wrote (its id not confirm-…): its own words go', () => {
  const own = confirm('Yes, go ahead', 'No, keep it', 'delete-post')
  assert.equal(isConfirm(own), false)
  assert.deepEqual(spokenAnswer([own], 'Đồng ý.'), {
    answers: [{ id: 'delete-post', selected: [], custom: 'Đồng ý.' }]
  })
  assert.equal(isConfirm({ id: 'plan-review' }), false)
})

/** dsh's session status with one pending interaction for `ses-1`, as cordis's probe hands it. */
const ctxWith = (pending) => ({
  get: (name) =>
    name === 'uiSession'
      ? { sessionStatus: { getSnapshot: () => new Map([['ses-1', { pendingInteraction: pending }]]) } }
      : undefined
})
/** dsh's pending plan review (`exit_plan_mode`): one question, the plan as its detail, its approve option named. */
const review = (overrides = {}, item = {}) => {
  const given = []
  return {
    given,
    kind: 'plan-review',
    callId: 'call-7',
    questions: [
      {
        id: 'plan-review',
        question: 'Approve this plan and leave plan mode?',
        detail: '# Plan\n\nDo it.',
        options: [{ label: 'Approve' }, { label: 'Keep planning' }],
        intent: { kind: 'plan-review', approve: 'Approve', callId: 'call-7' },
        ...item
      }
    ],
    answer(value) {
      given.push(value)
      return Promise.resolve()
    },
    ...overrides
  }
}

test('the plan under review, as Voice may answer it: its call, its text, its two options, and its own verb', async () => {
  const pending = review()
  const plan = pendingPlan(ctxWith(pending), 'ses-1')
  assert.equal(plan.callId, 'call-7')
  assert.equal(plan.questionId, 'plan-review')
  assert.equal(plan.plan, '# Plan\n\nDo it.')
  assert.equal(plan.approve, 'Approve')
  assert.equal(plan.decline, 'Keep planning')
  await plan.answer({ answers: [{ id: 'plan-review', selected: ['Approve'] }] })
  assert.deepEqual(pending.given, [{ answers: [{ id: 'plan-review', selected: ['Approve'] }] }])
})

test('anything but that one shape is not Voice’s to answer: a question card, two questions, a third option, no call', () => {
  assert.equal(
    pendingPlan(ctxWith(review({ kind: 'question' })), 'ses-1'),
    null,
    'a question card (D34 asks there)'
  )
  assert.equal(pendingPlan(ctxWith(undefined), 'ses-1'), null)
  assert.equal(pendingPlan(ctxWith(review({ questions: [] })), 'ses-1'), null)
  const two = review()
  two.questions = [two.questions[0], { ...two.questions[0], id: 'other' }]
  assert.equal(pendingPlan(ctxWith(two), 'ses-1'), null)
  assert.equal(
    pendingPlan(
      ctxWith(review({}, { options: [{ label: 'Approve' }, { label: 'A' }, { label: 'B' }] })),
      'ses-1'
    ),
    null
  )
  assert.equal(
    pendingPlan(ctxWith(review({}, { intent: { kind: 'other', approve: 'Approve' } })), 'ses-1'),
    null
  )
  assert.equal(pendingPlan(ctxWith(review({}, { detail: undefined })), 'ses-1'), null)
  assert.equal(pendingPlan(ctxWith(review({}, { multiSelect: true })), 'ses-1'), null)
  assert.equal(
    pendingPlan(
      ctxWith(review({ callId: undefined }, { intent: { kind: 'plan-review', approve: 'Approve' } })),
      'ses-1'
    ),
    null
  )
  assert.equal(
    pendingPlan(
      {
        get: () => {
          throw new Error('no probe')
        }
      },
      'ses-1'
    ),
    null
  )
  // Only an approve option: no way to give feedback, but still the plan to approve.
  assert.equal(pendingPlan(ctxWith(review({}, { options: [{ label: 'Approve' }] })), 'ses-1').decline, null)
})
