/**
 * The visual check (`visual-check.mjs`): a turn that wrote the site has the page its customer had open
 * drawn again and compared with the picture from before the turn; only a confident "does not show" or
 * "broke" makes a notice, every other way out is `skipped` with its reason and makes no claim.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import jpeg from 'jpeg-js'

import { buildCommentTurn } from '../../../ui/tracy-chat-input/src/client/comment-turn.mjs'
import {
  JUDGE_ELSEWHERE,
  JUDGE_SYSTEM,
  VISUAL_CHECK_PLUGIN,
  checkNotice,
  checkReportOf,
  commentPage,
  judgeMessage,
  pageOf,
  parseVerdict,
  pickEyes,
  runVisualCheck,
  turnWrites,
  visualCheckMode,
  writesShownInTurn
} from '../src/host/visual-check.mjs'

const VIEW = { path: '/about', y: 0, w: 1280, h: 800, dark: false }
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const ROUTE = { provider: 'deepseek', model: 'deepseek-flash' }

/** A turn's log: its start, the calls it made, the assistant's last words. */
function log({
  calls = [{ name: 'bash', arguments: { command: 'wp option update blogname X' } }],
  reply = 'Done.'
} = {}) {
  return [
    { type: 'turn/start', data: { turn: 3 } },
    ...calls.map((c, i) => ({ type: 'tool/call', data: { ...c, callId: `c${i}` } })),
    {
      type: 'assistant/message',
      data: { turn: 3, message: { role: 'assistant', content: [{ type: 'text', text: reply }] } }
    }
  ]
}

/** The ask the turn's first step froze. */
function ask(over = {}) {
  return {
    turn: 3,
    text: 'Change the heading to "Our story"',
    comment: false,
    at: 1000,
    before: { view: VIEW, jpeg: JPEG, y: 0, loaded: true, takenAt: 900 },
    checked: true,
    ...over
  }
}

/** A model runtime whose one answer is `answer`; it records what it was asked. */
function llm(answer, { sees = true } = {}) {
  const asked = []
  return {
    asked,
    resolveModelInfo: async () => ({ inputModalities: sees ? ['text', 'image'] : ['text'] }),
    listModels: async () => [{ id: 'vision-x', inputModalities: ['image'] }],
    stream: (options) => {
      asked.push(options)
      return (async function* () {
        yield { type: 'text-delta', text: answer }
        yield { type: 'usage', usage: { inputTokens: 900, outputTokens: 40 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    }
  }
}

function job(over = {}) {
  const runtime = over.llm ?? llm('{"verdict":"shown","target":"the main heading","seen":"Our story"}')
  return {
    mode: 'on',
    ask: ask(),
    turn: 3,
    events: log(),
    eyes: () => pickEyes(runtime, ROUTE, undefined),
    capture: async () => ({ ok: true, jpeg: JPEG, y: 0, loaded: true }),
    store: async () => ({ id: 'img-1' }),
    llm: runtime,
    ...over
  }
}

test('visualCheckMode: on unless false or shadow', () => {
  assert.equal(visualCheckMode(undefined), 'on')
  assert.equal(visualCheckMode(true), 'on')
  assert.equal(visualCheckMode(false), 'off')
  assert.equal(visualCheckMode('shadow'), 'shadow')
})

test('pageOf: one page per address — trailing slash, fragment and origin do not make another', () => {
  assert.equal(pageOf('https://s.test/about/'), '/about')
  assert.equal(pageOf('/about#team'), '/about')
  assert.equal(pageOf('/'), '/')
  assert.equal(pageOf('/?p=12'), '/?p=12')
  assert.equal(pageOf(''), null)
})

test('commentPage: the page a comment turn was pinned on, read with the chat input’s own parser', () => {
  const element = {
    url: 'https://s.test/about/',
    selector: 'h2',
    label: 'heading',
    text: 'Our story',
    marks: []
  }
  assert.equal(commentPage(buildCommentTurn({ text: 'Make this bigger', element, locate: null })), '/about')
  const twoPages = buildCommentTurn({
    items: [
      { n: 1, text: 'Red', element, locate: null },
      { n: 2, text: 'New phone', element: null, locate: null, url: 'https://s.test/contact' }
    ]
  })
  assert.equal(commentPage(twoPages), null, 'pins on two pages: no one page to judge')
  assert.equal(commentPage('just words'), null)
})

test('turnWrites: only the calls of the last turn that changed the site', () => {
  const events = [
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'tool/call', data: { name: 'bash', arguments: { command: 'old turn' } } },
    ...log({
      calls: [
        { name: 'read', arguments: { path: 'x' } },
        { name: 'bash', arguments: { command: 'wp post update 7' } }
      ]
    })
  ]
  const said = turnWrites(events)
  assert.match(said, /wp post update 7/)
  assert.doesNotMatch(said, /old turn/)
  assert.doesNotMatch(said, /"path":"x"/)
})

test('parseVerdict: the one JSON object, or nothing; a failure that points at nothing is cannot_tell', () => {
  assert.deepEqual(parseVerdict('ok {"verdict":"not_shown","target":"the heading","seen":"Welcome"}'), {
    verdict: 'not_shown',
    target: 'the heading',
    seen: 'Welcome'
  })
  assert.equal(parseVerdict('{"verdict":"not_shown","target":"","seen":"x"}')?.verdict, 'cannot_tell')
  assert.equal(parseVerdict('{"verdict":"maybe"}'), null)
  assert.equal(parseVerdict('no json'), null)
})

test('judgeMessage: both pictures, each named, and the reply given as a claim', () => {
  const m = judgeMessage({
    before: 'B',
    after: 'A',
    view: VIEW,
    request: 'Do it',
    writes: '- bash x',
    reply: 'Done.'
  })
  const kinds = m.content.map((b) => b.type)
  assert.deepEqual(kinds, ['text', 'image', 'text', 'image', 'text'])
  assert.equal(m.content[1].attachment, 'B')
  assert.equal(m.content[3].attachment, 'A')
  assert.match(m.content[4].text, /a claim/)
})

test('checkNotice: a guess said as one, read before writing, honest even after "done"', () => {
  const { text, summary } = checkNotice(
    { verdict: 'not_shown', target: 'the heading', seen: 'Welcome' },
    { path: '/about', picture: true }
  )
  assert.match(text, /can be wrong/)
  assert.match(text, /read the page as it is served now/)
  assert.match(text, /do not repeat a write whose answer already went through/)
  assert.match(text, /even if you said before that it was done/)
  assert.match(text, /picture after this line/)
  assert.ok(summary.length <= 120)
})

test('🔒 a confident "does not show" steers ONE notice from this plugin, with the page now when the agent sees pictures', async () => {
  const runtime = llm('{"verdict":"not_shown","target":"the main heading","seen":"Welcome to our site"}')
  const result = await runVisualCheck(job({ llm: runtime }))
  assert.equal(result.status, 'judged')
  assert.equal(result.verdict, 'not_shown')
  assert.equal(result.source, undefined)
  const steer = /** @type {any} */ (result.steer)
  assert.equal(steer.source.producer, VISUAL_CHECK_PLUGIN)
  assert.equal(steer.source.form, 'notice')
  assert.deepEqual(
    steer.content.map((b) => b.type),
    ['text', 'image']
  )
  // The comparison ran thinking off, on the session's own route, with both pictures.
  assert.equal(runtime.asked.length, 1)
  assert.equal(runtime.asked[0].reasoningEffort, 'off')
  assert.equal(runtime.asked[0].model, 'deepseek-flash')
  assert.equal(runtime.asked[0].messages[0].content.filter((b) => b.type === 'image').length, 2)
})

test('a text-only session is compared by the image model, and its notice carries no picture', async () => {
  const runtime = llm('{"verdict":"broken","target":"the hero","seen":"Fatal error"}', { sees: false })
  const result = await runVisualCheck(job({ llm: runtime }))
  assert.equal(result.verdict, 'broken')
  assert.equal(runtime.asked[0].model, 'vision-x')
  assert.deepEqual(
    /** @type {any} */ (result.steer).content.map((b) => b.type),
    ['text']
  )
})

test('shown, cannot tell, an unreadable answer and shadow mode: judged, no notice', async () => {
  for (const [answer, mode] of [
    ['{"verdict":"shown","target":"the heading","seen":"Our story"}', 'on'],
    ['{"verdict":"cannot_tell","target":"","seen":""}', 'on'],
    ['I think it changed', 'on'],
    ['{"verdict":"not_shown","target":"the heading","seen":"Welcome"}', 'shadow']
  ]) {
    const result = await runVisualCheck(job({ llm: llm(answer), mode }))
    assert.equal(result.status, 'judged', answer)
    assert.equal(result.steer, null, answer)
  }
})

test('🔒 no claim without both pictures of the right page, a write, a model or a picture now', async () => {
  const cases = [
    [{ mode: 'off' }, 'off'],
    [{ ask: undefined }, 'no-ask'],
    [{ turn: 4 }, 'no-ask'],
    [{ events: log({ calls: [{ name: 'read', arguments: { path: 'a' } }] }) }, 'no-write'],
    // A missing "before" always says why (beta report 28/10/2026): no write held, the hold's own reason.
    [{ ask: ask({ before: null }) }, 'no-before: not-held'],
    [{ ask: { ...ask({ before: null }), hold: { spentMs: 0 } } }, 'no-before: none'],
    [{ ask: { ...ask({ before: null }), missing: 'no-site' } }, 'no-before: no-site'],
    [
      { ask: ask({ before: { view: VIEW, jpeg: JPEG, y: 0, loaded: false, takenAt: 900 } }) },
      'before-not-loaded'
    ],
    [
      {
        ask: ask({
          comment: true,
          text: buildCommentTurn({
            text: 'Bigger',
            element: {
              url: 'https://s.test/contact',
              selector: 'h1',
              label: 'heading',
              text: 'Hi',
              marks: []
            },
            locate: null
          })
        })
      },
      'comment-elsewhere'
    ],
    [{ eyes: async () => null }, 'no-image-model'],
    [{ capture: async () => ({ ok: false, code: 'NO_BROWSER' }) }, 'capture-NO_BROWSER'],
    [{ capture: async () => ({ ok: true, jpeg: JPEG, y: 0, loaded: false }) }, 'after-not-loaded'],
    [{ store: async () => null }, 'no-store']
  ]
  for (const [over, reason] of cases) {
    const result = await runVisualCheck(job(over))
    assert.equal(result.status, 'skipped', reason)
    assert.equal(/** @type {any} */ (result).reason, reason)
  }
})

test('the budget bounds the drawing: a page that does not draw in time is skipped, not waited for', async () => {
  const result = await runVisualCheck(
    job({
      budgetMs: 30,
      capture: () =>
        new Promise((resolve) => setTimeout(() => resolve({ ok: true, jpeg: JPEG, y: 0, loaded: true }), 500))
    })
  )
  assert.equal(/** @type {any} */ (result).reason, 'capture-BUDGET')
})

test('🔒 never throws: a capture that throws is a skipped check', async () => {
  const result = await runVisualCheck(
    job({
      capture: async () => {
        throw new Error('docker gone')
      }
    })
  )
  assert.equal(result.status, 'skipped')
  assert.match(/** @type {any} */ (result).reason, /docker gone/)
})

// 20/10/2026, the product owner: only the targeted spot changes, never more. A visible change outside the target
// that the request, the writes and the reply do not account for is named in `also`, and steers one notice.
test('parseVerdict: also rides on shown or cannot_tell only (broken > not_shown > also > shown), as words', () => {
  assert.deepEqual(
    parseVerdict(
      '{"verdict":"shown","target":"the heading","seen":"Our story","also":"the footer now reads \\"Call 0909\\""}'
    ),
    { verdict: 'shown', target: 'the heading', seen: 'Our story', also: 'the footer now reads "Call 0909"' }
  )
  assert.equal(
    parseVerdict('{"verdict":"cannot_tell","target":"","seen":"","also":"the menu lost About"}')?.also,
    'the menu lost About'
  )
  // a fault or a missing change wins: the also is dropped
  for (const verdict of ['broken', 'not_shown'])
    assert.deepEqual(
      parseVerdict(`{"verdict":"${verdict}","target":"the hero","seen":"x","also":"the menu changed"}`),
      { verdict, target: 'the hero', seen: 'x' }
    )
  // blank, missing or not words: no claim, and the shape is the old one
  for (const also of ['""', '"   "', '42', 'null', '{"a":1}'])
    assert.deepEqual(parseVerdict(`{"verdict":"shown","target":"t","seen":"s","also":${also}}`), {
      verdict: 'shown',
      target: 't',
      seen: 's'
    })
})

test('JUDGE_SYSTEM: also is a sure, specific difference outside target; what moves by itself is never one', () => {
  assert.match(JUDGE_SYSTEM, /"also": "\.\.\."/)
  assert.match(JUDGE_SYSTEM, /OUTSIDE target/)
  assert.match(JUDGE_SYSTEM, /quoting visible words exactly/)
  for (const moving of [/scrolled/, /still loading/, /animation/, /carousel/, /ads/, /changes with time/])
    assert.match(JUDGE_SYSTEM, moving)
})

// Council 20/10/2026 (Q3): an also is a suspicion; only a clearly unasked, separable part is put back.
test('checkNotice for an also: a suspicion checked against the ask; put back only a separable part, else ask', () => {
  const { text } = checkNotice(
    { verdict: 'shown', target: 'the heading', seen: 'Our story', also: 'the footer reads "Call 0909"' },
    { path: '/about', picture: false }
  )
  assert.match(text, /can be wrong/)
  assert.match(
    text,
    /something may have changed that the customer did not ask for: the footer reads "Call 0909"/
  )
  assert.match(text, /a suspicion, not a fact/)
  assert.match(text, /against what the customer asked for or agreed to/)
  assert.match(text, /Put back only a part that is clearly outside that, that can be put back on its own/)
  assert.match(text, /never put back a whole page, template or shared block because of one doubtful part/)
  assert.match(text, /tell them concretely what changed and where, and ask/)
  assert.match(
    text,
    /name at most the pages looked at \(\/about\); never say the rest of the site is unaffected/
  )
  assert.doesNotMatch(text, /put just that back as it was/)
  assert.match(text, /Never rewrite the change they asked for/)
  assert.match(text, /do not repeat a write whose answer already went through/)
  assert.match(text, /read the page as it is served now/)
  assert.doesNotMatch(text, /does not show/)
  // a failure keeps its own notice
  assert.match(
    checkNotice({ verdict: 'not_shown', target: 't', seen: 's' }, { path: '/', picture: false }).text,
    /the change asked does not show/
  )
})

test('🔒 a judge naming an unasked change steers ONE notice; cannot_tell or shown without it steers none', async () => {
  const unasked = await runVisualCheck(
    job({
      llm: llm(
        '{"verdict":"shown","target":"the main heading","seen":"Our story","also":"the footer phone now reads 0909"}'
      )
    })
  )
  assert.equal(unasked.status, 'judged')
  assert.equal(/** @type {any} */ (unasked).also, 'the footer phone now reads 0909')
  const steer = /** @type {any} */ (unasked.steer)
  assert.equal(steer.source.producer, VISUAL_CHECK_PLUGIN)
  assert.match(steer.content[0].text, /did not ask for: the footer phone now reads 0909/)
  assert.deepEqual(checkReportOf(/** @type {any} */ (unasked)), { visual: 'shown', note: 'unasked' })
  for (const answer of [
    '{"verdict":"cannot_tell","target":"","seen":""}',
    '{"verdict":"cannot_tell","target":"","seen":"","also":""}',
    '{"verdict":"shown","target":"the heading","seen":"Our story"}'
  ]) {
    const result = await runVisualCheck(job({ llm: llm(answer) }))
    assert.equal(result.steer, null, answer)
    assert.equal(checkReportOf(/** @type {any} */ (result)).note, null, answer)
  }
  // shadow mode compares and keeps the note, but sends nothing
  const shadow = await runVisualCheck(
    job({
      mode: 'shadow',
      llm: llm('{"verdict":"shown","target":"t","seen":"s","also":"the menu lost About"}')
    })
  )
  assert.equal(shadow.steer, null)
})

// Council 20/10/2026 (Q2): a shared element is looked at on other pages too, in ONE comparison.
const OTHER = (path) => ({
  view: { path, y: 0, w: 1280, h: 800, dark: false },
  jpeg: JPEG,
  y: 0,
  loaded: true,
  takenAt: 900
})
const HEADER = 'This changes the "Header" part every page of your site shows, not this page alone.'

test('🔒 other pages of a shared element: drawn again, and ONE comparison carries every pair, named by address', async () => {
  const runtime = llm('{"verdict":"shown","target":"the header","seen":"Blue header","elsewhere":[]}')
  const drawn = []
  const result = await runVisualCheck(
    job({
      llm: runtime,
      ask: ask({ extras: [OTHER('/'), OTHER('/services')], agreed: [HEADER] }),
      capture: async (view) => {
        drawn.push(view.path)
        return { ok: true, jpeg: JPEG, y: 0, loaded: true }
      }
    })
  )
  assert.deepEqual(drawn, ['/about', '/', '/services'])
  assert.equal(runtime.asked.length, 1, 'one model call')
  const content = runtime.asked[0].messages[0].content
  assert.equal(content.filter((b) => b.type === 'image').length, 6)
  const words = content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  assert.match(words, /OTHER PAGE \/, BEFORE/)
  assert.match(words, /OTHER PAGE \/services, AFTER/)
  assert.match(words, /agreed to before these writes[\s\S]*"Header" part every page/)
  assert.ok(runtime.asked[0].system.endsWith(JUDGE_ELSEWHERE))
  assert.equal(result.status, 'judged')
  assert.deepEqual(/** @type {any} */ (result).pages, ['/about', '/', '/services'])
  assert.equal(result.steer, null, 'nothing outside the ask: no notice')
})

test('🔒 another page changed outside the ask: ONE notice naming that page, and the pages looked at', async () => {
  const runtime = llm(
    '{"verdict":"shown","target":"the header","seen":"Blue header","elsewhere":[{"page":"/services","also":"the price table lost its Pro column","broken":""}]}'
  )
  const result = await runVisualCheck(
    job({ llm: runtime, ask: ask({ extras: [OTHER('/'), OTHER('/services')], agreed: [HEADER] }) })
  )
  const steer = /** @type {any} */ (result.steer)
  assert.ok(steer)
  const text = steer.content[0].text
  assert.match(text, /did not ask for: on \/services: the price table lost its Pro column/)
  assert.match(text, /Tracy drew \/about \(and \/, \/services\) again/)
  assert.match(text, /name at most the pages looked at \(\/about, \/, \/services\)/)
  assert.deepEqual(/** @type {any} */ (result).elsewhere, [
    { path: '/services', also: 'the price table lost its Pro column' }
  ])
  assert.deepEqual(checkReportOf(/** @type {any} */ (result)), { visual: 'shown', note: 'unasked' })
})

test('🔒 a header change asked on a shared header: the judge is told it is expected elsewhere, and its no is kept', async () => {
  // The rule the comparison reads: the requested change showing on other pages is not an `also`.
  assert.match(JUDGE_ELSEWHERE, /do not judge whether the request shows/)
  assert.match(
    JUDGE_ELSEWHERE,
    /appearing there because that part is shared is expected and never a difference/
  )
  assert.match(
    JUDGE_ELSEWHERE,
    /shared header in another colour, that header in that colour on every page is what they asked/
  )
  const runtime = llm('{"verdict":"shown","target":"the header","seen":"Blue header","elsewhere":[]}')
  const result = await runVisualCheck(
    job({
      llm: runtime,
      ask: ask({ text: 'Make the header blue on every page', extras: [OTHER('/')], agreed: [HEADER] })
    })
  )
  assert.match(runtime.asked[0].messages[0].content.at(-1).text, /Make the header blue on every page/)
  assert.equal(result.steer, null)
  assert.equal(checkReportOf(/** @type {any} */ (result)).note, null)
})

test('parseVerdict elsewhere: only the pages given, a fault beside any verdict, a change only beside shown or cannot_tell', () => {
  const pages = ['/', '/services']
  const said = parseVerdict(
    JSON.stringify({
      verdict: 'shown',
      target: 't',
      seen: 's',
      elsewhere: [
        { page: '/services/', also: 'the menu lost About' },
        { page: '/nowhere', also: 'x' },
        { page: '/', broken: 'Fatal error at the top', also: 'y' },
        { page: '/', also: 'second entry for one page' },
        'not an entry'
      ]
    }),
    { pages }
  )
  assert.deepEqual(said?.elsewhere, [
    { path: '/services', also: 'the menu lost About' },
    { path: '/', broken: 'Fatal error at the top' }
  ])
  const failed = parseVerdict(
    JSON.stringify({
      verdict: 'not_shown',
      target: 'the header',
      seen: 'Red',
      elsewhere: [
        { page: '/', also: 'x' },
        { page: '/services', broken: 'blank page' }
      ]
    }),
    { pages }
  )
  assert.deepEqual(failed?.elsewhere, [{ path: '/services', broken: 'blank page' }])
  // without pages given, nothing of it is read; the old shape stays
  assert.deepEqual(
    parseVerdict('{"verdict":"shown","target":"t","seen":"s","elsewhere":[{"page":"/","also":"x"}]}'),
    {
      verdict: 'shown',
      target: 't',
      seen: 's'
    }
  )
  assert.deepEqual(
    checkReportOf({ status: 'judged', verdict: 'shown', elsewhere: [{ path: '/', broken: 'x' }] }),
    { visual: 'shown', note: 'broken-elsewhere' }
  )
})

test('another page that would not draw again is left out of the comparison, never judged from one picture', async () => {
  const runtime = llm('{"verdict":"shown","target":"t","seen":"s"}')
  const result = await runVisualCheck(
    job({
      llm: runtime,
      ask: ask({ extras: [OTHER('/')] }),
      capture: async (view) =>
        view.path === '/' ? { ok: false, code: 'LOOK_FAILED' } : { ok: true, jpeg: JPEG, y: 0, loaded: true }
    })
  )
  assert.equal(runtime.asked[0].messages[0].content.filter((b) => b.type === 'image').length, 2)
  assert.equal(runtime.asked[0].system, JUDGE_SYSTEM)
  assert.deepEqual(/** @type {any} */ (result).pages, ['/about'])
})

/**
 * A small JPEG window: a dark ground with a "link" of the given colour (B1, the recoloured menu link).
 * @param {number[]} rgb
 */
function windowWith(rgb) {
  const [w, h] = [320, 200]
  const data = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i += 1) data.set([18, 17, 17, 255], i * 4)
  for (let y = 40; y < 54; y += 1) for (let x = 140; x < 190; x += 1) data.set([...rgb, 255], (y * w + x) * 4)
  return Buffer.from(jpeg.encode({ width: w, height: h, data }, 80).data)
}

test('parseVerdict: a not_shown whose target is outside the window is no claim (B1, 26/10/2026)', () => {
  const below = parseVerdict(
    '{"verdict":"not_shown","target":"the end of the article","inWindow":false,"seen":"no new paragraph in view"}'
  )
  assert.equal(below?.verdict, 'cannot_tell')
  assert.equal(
    parseVerdict('{"verdict":"not_shown","target":"the ABOUT link","inWindow":true,"seen":"white"}')?.verdict,
    'not_shown'
  )
  // An answer without the field keeps its verdict; the field never turns another verdict into a claim.
  assert.equal(
    parseVerdict('{"verdict":"not_shown","target":"the ABOUT link","seen":"white"}')?.verdict,
    'not_shown'
  )
  assert.equal(parseVerdict('{"verdict":"shown","target":"t","inWindow":false,"seen":"s"}')?.verdict, 'shown')
  assert.match(JUDGE_SYSTEM, /"inWindow": true \| false/)
  assert.match(JUDGE_SYSTEM, /not_shown: inWindow is true/)
  assert.match(JUDGE_SYSTEM, /MEASURED line is counted from the pixels/)
})

test('judgeMessage: what the pixels say rides right after the main pair — nothing changed, or each place and its larger cut', () => {
  const same = judgeMessage({
    before: 'B',
    after: 'A',
    view: VIEW,
    request: 'r',
    writes: '',
    reply: '',
    measured: { share: 0, places: [], more: 0, zooms: [] }
  })
  assert.deepEqual(
    same.content.map((b) => b.type),
    ['text', 'image', 'text', 'image', 'text', 'text']
  )
  assert.match(same.content[4].text, /^MEASURED .*nothing in it changed/)
  const place = { x: 136, y: 40, w: 56, h: 16 }
  const m = judgeMessage({
    before: 'B',
    after: 'A',
    view: VIEW,
    request: 'r',
    writes: '',
    reply: '',
    measured: {
      share: 0.01,
      places: [place, { x: 0, y: 150, w: 320, h: 50 }],
      more: 1,
      zooms: [{ place, scale: 4, before: 'ZB', after: 'ZA' }]
    },
    extra: [{ path: '/', before: 'OB', after: 'OA' }]
  })
  const said = m.content[4].text
  assert.match(
    said,
    /differ only at x 136–192, y 40–56; x 0–320, y 150–200 \(px from the window's top left\), and 1 more small places/
  )
  assert.match(said, /The small place follows, cut from both pictures and drawn larger\./)
  assert.match(m.content[5].text, /^PLACE 1 \(x 136–192, y 40–56\), BEFORE, 4 times larger/)
  assert.equal(m.content[6].attachment, 'ZB')
  assert.match(m.content[7].text, /^PLACE 1, AFTER/)
  assert.equal(m.content[8].attachment, 'ZA')
  // Other pages come after the measured cut, as before.
  assert.match(m.content[9].text, /^OTHER PAGE \/, BEFORE/)
  // Without a measurement the message is what it was.
  assert.equal(
    judgeMessage({ before: 'B', after: 'A', view: VIEW, request: 'r', writes: '', reply: '' }).content.length,
    5
  )
})

test('🔒 a recoloured link: the check measures the two pictures and sends the changed place enlarged; the log line says so', async () => {
  const runtime = llm('{"verdict":"shown","target":"the ABOUT link","inWindow":true,"seen":"ABOUT in blue"}')
  const stored = []
  const result = await runVisualCheck(
    job({
      llm: runtime,
      ask: ask({
        before: { view: VIEW, jpeg: windowWith([255, 255, 255]), y: 0, loaded: true, takenAt: 900 }
      }),
      capture: async () => ({ ok: true, jpeg: windowWith([46, 134, 222]), y: 0, loaded: true }),
      store: async (bytes) => {
        stored.push(bytes)
        return { id: `img-${stored.length}` }
      }
    })
  )
  assert.equal(result.status, 'judged')
  assert.deepEqual(/** @type {any} */ (result).measured, {
    places: 1,
    zoomed: 1,
    share: /** @type {any} */ (result).measured.share
  })
  assert.ok(/** @type {any} */ (result).measured.share > 0)
  assert.equal(stored.length, 4, 'both pictures, then the place cut from each')
  const content = runtime.asked[0].messages[0].content
  assert.equal(content.filter((b) => b.type === 'image').length, 4)
  assert.match(content[4].text, /^MEASURED .*differ only at/)
})

test('a picture drawn back at another scroll is not measured: the comparison runs as before', async () => {
  const runtime = llm('{"verdict":"shown","target":"t","seen":"s"}')
  const result = await runVisualCheck(
    job({
      llm: runtime,
      ask: ask({
        before: { view: VIEW, jpeg: windowWith([255, 255, 255]), y: 0, loaded: true, takenAt: 900 }
      }),
      capture: async () => ({ ok: true, jpeg: windowWith([46, 134, 222]), y: 120, loaded: true })
    })
  )
  assert.equal(/** @type {any} */ (result).measured, null)
  const content = runtime.asked[0].messages[0].content
  assert.equal(content.filter((b) => b.type === 'image').length, 2)
  assert.ok(!content.some((b) => b.type === 'text' && /MEASURED/.test(b.text)))
})

// ── #209: a write that read its own words back on the page ─────────────────────────────────────────

/** A turn whose writes are `content.replace` calls answered with `answers` (one receipt each). */
function replaceTurn(answers) {
  const events = [{ type: 'turn/start', data: { turn: 3 } }]
  answers.forEach((answer, i) => {
    events.push({
      type: 'tool/call',
      data: {
        name: 'tracy_site',
        callId: `r${i}`,
        arguments: {
          action: 'content.replace',
          params: { find: 'Tacos', replace: 'Tacos made fresh every day' }
        }
      }
    })
    events.push({
      type: 'tool/result',
      data: {
        message: { source: { callId: `r${i}` }, content: [{ type: 'text', text: JSON.stringify(answer) }] }
      }
    })
  })
  events.push({
    type: 'assistant/message',
    data: { turn: 3, message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } }
  })
  return events
}

const SHOWN = {
  ok: true,
  platform: 'wordpress',
  changed: [{ at: 'post:2.post_title' }],
  verified: 'shown on /'
}

test('a turn whose every write read its words back on the page is not redrawn or judged (#209)', async () => {
  let drawn = 0
  const runtime = llm('{"verdict":"shown","target":"the heading","seen":"x"}')
  const result = await runVisualCheck(
    job({
      llm: runtime,
      events: replaceTurn([SHOWN]),
      capture: async () => {
        drawn += 1
        return { ok: true, jpeg: JPEG, y: 0, loaded: true }
      }
    })
  )
  assert.deepEqual([result.status, result.reason], ['skipped', 'verified-on-page'])
  assert.equal(drawn, 0, 'no new browser drew the page')
  assert.equal(runtime.asked.length, 0, 'no image model was asked')
  assert.deepEqual(checkReportOf(result), { visual: 'skipped', note: 'verified-on-page' })
})

test('the check still runs when a write did not prove itself, or touched more than its words (#209)', () => {
  assert.equal(writesShownInTurn(replaceTurn([SHOWN, SHOWN])), true)
  for (const other of [
    { ...SHOWN, verified: 'not shown on / yet: a page cache may still hold the old words' },
    { ...SHOWN, verified: undefined },
    { ...SHOWN, companions: [{ at: 'module-90.2' }] },
    { ok: false, code: 'COWORK_WEB_UNREACHABLE' }
  ])
    assert.equal(writesShownInTurn(replaceTurn([SHOWN, other])), false, JSON.stringify(other))
  // Another kind of write in the same turn (a shell command): checked as before.
  const mixed = replaceTurn([SHOWN])
  mixed.splice(1, 0, {
    type: 'tool/call',
    data: { name: 'bash', callId: 'b1', arguments: { command: 'wp option update x y' } }
  })
  assert.equal(writesShownInTurn(mixed), false)
  assert.equal(writesShownInTurn(log()), false, 'a shell write alone')
})

test('a verified write to a shared part (pages of it held as extras) is still checked (#209)', async () => {
  let drawn = 0
  const result = await runVisualCheck(
    job({
      events: replaceTurn([SHOWN]),
      ask: ask({ extras: [{ view: { ...VIEW, path: '/about' }, jpeg: JPEG }] }),
      capture: async () => {
        drawn += 1
        return { ok: true, jpeg: JPEG, y: 0, loaded: true }
      }
    })
  )
  assert.notEqual(result.reason, 'verified-on-page')
  assert.ok(drawn >= 1)
})
