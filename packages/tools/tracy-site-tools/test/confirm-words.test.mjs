// What a confirm card says, read by its meaning (`src/host/confirm-words.mjs`, council 20/10/2026, D5.2):
// the first option says yes, the second no, and a delete is called a delete, a hide a hide.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cardMeaningProblem } from '../src/host/confirm-words.mjs'

const card = (question, yes, no) => ({ question, options: [{ label: yes }, { label: no }] })

test('a card that says yes, no and the call’s own verb passes, in every language the rows read', () => {
  const ok = [
    [
      'English',
      card('This deletes "Hello" from your site. Go ahead?', 'Yes, go ahead', 'No, keep it'),
      'delete'
    ],
    [
      'Vietnamese',
      card('Xoá bài "Yêu chính mình" khỏi trang web nhé?', 'Đồng ý, xoá đi', 'Không, giữ lại'),
      'delete'
    ],
    [
      'Vietnamese',
      card('Ẩn bài "Yêu chính mình" khỏi trang web nhé?', 'Đồng ý, ẩn đi', 'Không, giữ lại'),
      'hide'
    ],
    ['German', card('„Hallo“ von der Website löschen?', 'Ja, löschen', 'Nein, behalten'), 'delete'],
    ['French', card('Masquer « Bonjour » du site ?', 'Oui, masquer', 'Non, garder'), 'hide'],
    ['Italian', card('Eliminare «Ciao» dal sito?', 'Sì, elimina', 'No, mantieni'), 'delete'],
    ['Spanish', card('¿Ocultar «Hola» del sitio?', 'Sí, ocultar', 'No, mantener'), 'hide'],
    ['Dutch', card('"Hallo" van de site verwijderen?', 'Ja, verwijder', 'Nee, behoud'), 'delete'],
    ['Chinese', card('从网站删除《你好》吗？', '确定删除', '不，保留'), 'delete'],
    ['Vietnamese', card('Đổi giá từ 120.000đ thành 150.000đ nhé?', 'Đồng ý', 'Không'), null]
  ]
  for (const [language, q, intent] of ok)
    assert.equal(
      cardMeaningProblem(q, language, /** @type {any} */ (intent)),
      null,
      `${language}: ${q.question}`
    )
})

test('swapped buttons, a delete called a hide, or a hide called a delete are refused', () => {
  const swapped = cardMeaningProblem(
    card('Xoá bài "A" nhé?', 'Không, giữ lại', 'Đồng ý, xoá'),
    'Vietnamese',
    'delete'
  )
  const soft = cardMeaningProblem(
    card('Ẩn bài "A" khỏi trang web nhé?', 'Đồng ý', 'Không'),
    'Vietnamese',
    'delete'
  )
  const hard = cardMeaningProblem(
    card('Xoá bài "A" khỏi trang web nhé?', 'Đồng ý', 'Không'),
    'Vietnamese',
    'hide'
  )
  const one = cardMeaningProblem(
    { question: 'Xoá bài "A"?', options: [{ label: 'Đồng ý' }] },
    'Vietnamese',
    'delete'
  )

  assert.match(String(swapped), /first option must say yes/)
  assert.match(String(soft), /the call deletes, and the question must say so/)
  assert.match(String(hard), /without deleting it/)
  assert.match(String(one), /two options/)
})

test('a language the rows do not read is never refused', () => {
  assert.equal(cardMeaningProblem(card('Удалить «A»?', 'Да', 'Нет'), 'Russian', 'delete'), null)
  assert.equal(cardMeaningProblem(card('x', 'y', 'z'), '', 'delete'), null)
})
