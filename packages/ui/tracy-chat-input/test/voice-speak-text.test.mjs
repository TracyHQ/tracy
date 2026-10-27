// What a voice conversation reads of Tracy's words (`src/client/voice-speak-text.mjs`), and how it
// tells Tracy's voice coming back from the person's (`isEcho`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  firstSentence,
  endsLine,
  isEcho,
  plainSpoken,
  SPOKEN_WORDS,
  spokenReply,
  withoutEcho
} from '../src/client/voice-speak-text.mjs'

test('markdown read as speech: no marks, no code, no addresses, list items as sentences', () => {
  const reply = [
    '## Done',
    'I changed the **Contact** button to `green` — see [the home page](https://x.tracy.ai/).',
    '',
    '- Home page',
    '- Footer link',
    '',
    '```css',
    '.btn { color: green }',
    '```',
    '| a | b |',
    '|---|---|',
    '![logo](https://x/logo.png) More at https://x.tracy.ai/about'
  ].join('\n')
  assert.equal(
    plainSpoken(reply),
    'Done. I changed the Contact button to green — see the home page. Home page. Footer link. More at'
  )
  assert.equal(plainSpoken(''), '')
  assert.equal(plainSpoken('```\nonly code\n```'), '')
  assert.equal(plainSpoken(undefined), '')
})

test('a long reply is cut at a sentence, and the cut is said', () => {
  const sentence = 'Mình đã đổi màu nút liên hệ trên trang chủ sang xanh lá.'
  const reply = Array.from({ length: 20 }, () => sentence).join(' ')
  const said = spokenReply(reply, 200, 'The rest is in the chat.')
  assert.ok([...said].length <= 200, said)
  assert.ok(said.endsWith(`${sentence} The rest is in the chat.`))
  assert.equal(
    spokenReply(sentence, 200, 'The rest is in the chat.'),
    sentence,
    'a short reply is read whole'
  )
  // One sentence longer than the room is cut at a word.
  const long = spokenReply('word '.repeat(100).trim(), 50)
  assert.ok(long.endsWith('…') && [...long].length <= 50, long)
})

test('the first sentence of what Tracy wrote while working', () => {
  assert.equal(
    firstSentence("I'll look at the **home** page first. Then I change it."),
    "I'll look at the home page first."
  )
  assert.equal(firstSentence(''), '')
})

test('an echo is mostly words just said; the person repeating a word or two is not', () => {
  const said = ['Mình đã đổi nút liên hệ sang màu xanh lá.']
  assert.equal(isEcho('mình đã đổi nút liên hệ sang màu xanh lá', said), true)
  assert.equal(isEcho('Đổi nút liên hệ sang màu xanh lá', said), true)
  assert.equal(isEcho('Không, đổi sang màu đỏ và thêm logo vào đầu trang', said), false)
  assert.equal(isEcho('xanh', said), false, 'one word is never an echo')
  assert.equal(isEcho('mình đã đổi nút', []), false)
})

test('a run of a line just said at a phrase’s start is cut off; a word or two shared is the person’s', () => {
  const said = ['Mình đã đổi nút liên hệ sang màu xanh lá.']
  assert.equal(withoutEcho('đổi nút liên hệ khoan đã', said), 'khoan đã')
  assert.equal(
    withoutEcho('đổi nút sang màu đỏ', said),
    'đổi nút sang màu đỏ',
    'two words in the line’s order are not enough'
  )
  assert.equal(withoutEcho('mình đã đổi nút liên hệ sang màu xanh lá', said), '', 'all of it is the line')
  assert.equal(withoutEcho('thêm logo', said), 'thêm logo')
  assert.equal(withoutEcho('thêm logo', []), 'thêm logo')
})

test('Chinese, written without spaces, is compared character by character', () => {
  const said = ['我把联系按钮改成绿色了。']
  assert.equal(isEcho('我把联系按钮改成绿色了。', said), true, 'Tracy’s own line coming back')
  assert.equal(isEcho('联系按钮改成绿色', said), true)
  assert.equal(withoutEcho('联系按钮改成绿色等一下', said), '等一下')
  // A choice said back after Tracy read the choices is the person choosing; so is a request of their own.
  assert.equal(isEcho('红色', ['红色、绿色还是黄色？']), false)
  assert.equal(isEcho('我要红色的', ['红色、绿色还是黄色？']), false)
  assert.equal(withoutEcho('把标题改成红色', said), '把标题改成红色')
})

test('a long reply that ends by asking something: the question is read last, after “the rest”', () => {
  const reply =
    'Mình đã đổi tiêu đề trang chủ thành “Chào mừng đến với cửa hàng của tôi”. '.repeat(6) +
    'Bạn muốn dòng giới thiệu nằm trên hay dưới tiêu đề?'
  const said = spokenReply(reply, 320, 'Phần còn lại có trong chat.')
  assert.ok(
    said.endsWith('Phần còn lại có trong chat. Bạn muốn dòng giới thiệu nằm trên hay dưới tiêu đề?'),
    said
  )
  assert.ok([...said].length <= 320, `${[...said].length} characters`)
  // A reply that fits is read as it is; one that asks nothing ends on “the rest”.
  assert.equal(
    spokenReply('Xong rồi. Bạn xem thử nhé?', 320, 'Phần còn lại có trong chat.'),
    'Xong rồi. Bạn xem thử nhé?'
  )
  assert.ok(
    spokenReply('Một câu dài. '.repeat(40), 320, 'Phần còn lại có trong chat.').endsWith(
      'Phần còn lại có trong chat.'
    )
  )
})

test('a reply in Voice opens with a paragraph for the ear: that is what is read, then “the rest”', () => {
  const reply =
    'Đã đổi tiêu đề trang chủ thành Chào mừng đến với cửa hàng của tôi. Dòng giới thiệu chưa thêm vì bạn chưa nói nội dung.\n\n' +
    '## Chi tiết\n\n- Trang chủ: tiêu đề mới\n- Chân trang: không đổi\n\nBạn muốn dòng giới thiệu viết gì?'
  assert.equal(
    spokenReply(reply, 320, 'Phần còn lại có trong chat.'),
    'Đã đổi tiêu đề trang chủ thành Chào mừng đến với cửa hàng của tôi. Dòng giới thiệu chưa thêm vì bạn chưa nói nội dung. Phần còn lại có trong chat. Bạn muốn dòng giới thiệu viết gì?'
  )
  // An opening that is only a heading is read with the paragraph after it.
  assert.equal(
    spokenReply(
      '## Xong\n\nĐã đổi màu nút liên hệ sang xanh lá ở trang chủ và chân trang.\n\nChi tiết thêm ở đây, rất dài.',
      320,
      'Phần còn lại có trong chat.'
    ),
    'Xong. Đã đổi màu nút liên hệ sang xanh lá ở trang chủ và chân trang. Phần còn lại có trong chat.'
  )
  // An opening that already asks: the question is not read twice.
  assert.equal(
    spokenReply(
      'Mình đã đổi tiêu đề trang chủ rồi. Bạn muốn nút liên hệ màu đỏ hay xanh lá?\n\nChi tiết dài.\n\nBạn chọn màu nào?',
      320,
      'Phần còn lại có trong chat.'
    ),
    'Mình đã đổi tiêu đề trang chủ rồi. Bạn muốn nút liên hệ màu đỏ hay xanh lá? Phần còn lại có trong chat.'
  )
})

test('an opening longer than the voice should read is cut at a sentence; a short first one is read with the next', () => {
  // On the stand, 17/10/2026: one paragraph of 60 words, read whole.
  const reply =
    'Xong rồi. Tiêu đề lớn trên trang chủ giờ là “Chào mừng đến với cửa hàng của tôi”, chỉ viết hoa chữ đầu, và ngay bên dưới có thêm dòng giới thiệu ngắn về thiết kế, thi công nhà xưởng và hạ tầng khu công nghiệp tại Nga từ năm 2004. Nếu muốn đổi chữ nào, bạn cứ nói nhé.'
  const said = spokenReply(reply, 320, 'Phần còn lại có trong chat.')
  assert.equal(
    said,
    'Xong rồi. Tiêu đề lớn trên trang chủ giờ là “Chào mừng đến với cửa hàng của tôi”, chỉ viết hoa chữ đầu, và ngay bên dưới có thêm dòng giới thiệu ngắn về thiết kế, thi công nhà xưởng và hạ tầng khu công nghiệp tại Nga từ năm 2004. Phần còn lại có trong chat.'
  )
  // Short sentences within the words are all read, with nothing said about the chat.
  const short =
    'Đã đổi màu nút liên hệ sang xanh lá. Trang chủ và chân trang đều đã đổi. Bạn mở trang là thấy.'
  assert.equal(spokenReply(short, 320, 'Phần còn lại có trong chat.'), short)
  // Never cut inside a sentence: three sentences past the words keep the first two.
  const sentence = (n) => `Câu ${n} ${Array.from({ length: 20 }, () => 'chữ').join(' ')}.`
  assert.equal(
    spokenReply(['một', 'hai', 'ba'].map(sentence).join(' '), 1000, 'Phần còn lại có trong chat.'),
    `${sentence('một')} ${sentence('hai')} Phần còn lại có trong chat.`
  )
  assert.ok(SPOKEN_WORDS >= 40, 'room for the 40 words a turn in Voice is asked for')
})

test('the last word or words of a line just said, heard back, case and marks aside', () => {
  const said = ['I have a question for you on screen. Delete it? Yes or No. Please say yes or no.']
  for (const heard of ['no', 'No.', 'yes or no', 'Say yes or no!', 'please say yes or no'])
    assert.equal(endsLine(heard, said), true, heard)
  // A word of the line that is not its end, or more than the line, is the person.
  for (const heard of ['', 'Yes.', 'yes please', 'Yes or no, delete it', 'no no'])
    assert.equal(endsLine(heard, said), false, heard)
  assert.equal(endsLine('Không.', ['Bạn vui lòng nói có hoặc không.']), true)
  assert.equal(endsLine('不', ['请说“是”或“不”。']), true)
  assert.equal(endsLine('No.', []), false)
})
