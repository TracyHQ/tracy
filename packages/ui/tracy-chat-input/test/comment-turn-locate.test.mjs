// The comment turn read against the REAL `content.locate` answer (comment → edit, 27/09/2026).
//
// The three pieces of the comment were built and tested apart: the resolver in `apps/tracy-web`, the
// popover in `dsh-better-sidebar`, this turn here — each against its own fixture. This turn's
// fixture was the mockup's `{name, ref}` levels, so it printed no id at all from the server's
// `{id, label}` levels, dropped the candidates and the person's choice, and called `unconfirmed`
// `unchecked`; every suite stayed green. Here the resolver runs on the provenance spike's raw Joomla
// data (the same inputs `apps/tracy-web/test/content-locate.test.mjs` reads), and its answer reaches
// the turn exactly as the Browser tab sends it: the answer untouched plus `chosen`
// (`commentSendDetail`), whose `level` counts the popover's crumbs outermost first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import {
  indexContents,
  locateElement,
  roadToolsets
} from '../../../../apps/tracy-web/src/sites/content-locate.js'
import { buildCommentTurn, chipLabel, parseCommentTurn } from '../src/client/comment-turn.mjs'

const INPUTS = new URL('./fixtures/provenance-spike/', import.meta.url)
const load = (name) => JSON.parse(gunzipSync(readFileSync(new URL(name, INPUTS))).toString('utf8'))
const details = load('j-detail.json.gz')
const dom = load('j-dom-stamped.json.gz')
const index = indexContents(details, { siteUrl: new URL(details[0].url).origin })
// An editor seat: `content` only (`apps/tracy-web/src/seats/roles.js`).
const KIND_TOOLSET = { article: 'content', menuItem: 'content', module: 'code', post: 'content' }
const mayWrite = (road) => roadToolsets(road, (kind) => KIND_TOOLSET[kind] ?? 'site').includes('content')

/** The picker's request for the element on `path` whose own text starts with `start`. */
function pick(path, start) {
  const bare = (url) => new URL(url).pathname.replace(/\/+$/, '') || '/'
  const page = Object.keys(dom).find((url) => bare(url) === path)
  const element = dom[page].find((one) => (one.text ?? '').startsWith(start))
  return { url: page.split('?')[0], marks: element.chain ?? [], text: element.text }
}

/** What the Browser tab sends for a pick, the popover settled on `crumb` (outermost = 0). */
function sent(path, start, choice = {}) {
  const query = pick(path, start)
  const answer = locateElement(index, query, { mayWrite, platform: 'joomla' })
  const crumbs = [...answer.levels].reverse()
  const at = choice.level ?? crumbs.length - 1
  return {
    answer,
    turn: buildCommentTurn({
      text: 'Make only this orange.',
      element: {
        url: query.url,
        selector: 'x',
        label: crumbs[at]?.label ?? query.text,
        text: query.text,
        marks: query.marks
      },
      locate: { ...answer, chosen: { level: at, candidate: choice.candidate ?? null, source: null } }
    })
  }
}

test('a resolved menu label: every level reaches the agent with its id, the settled crumb picked', () => {
  const { answer, turn } = sent('/en', 'Services')
  assert.equal(answer.status, 'resolved')
  for (const level of answer.levels) assert.ok(turn.includes(`id=${level.id}`), level.id)
  // The popover opens on the innermost crumb: the field.
  assert.ok(turn.includes(`id=${answer.levels[0].id} [picked]`))
  // ↑ to the record: the record is picked, and the head names it.
  const record = sent('/en', 'Services', { level: 0 })
  assert.ok(record.turn.includes(`id=${answer.levels.at(-1).id} [picked]`))
  assert.match(record.turn, /status="resolved" kind="record"/)
})

test('unconfirmed stays unconfirmed, and a module an editor cannot write says so', () => {
  const { answer, turn } = sent('/en', 'sales@northgate-ind.ru')
  assert.equal(answer.status, 'unconfirmed')
  assert.match(turn, /status="unconfirmed"/)
  assert.equal(parseCommentTurn(turn)?.element.status, 'unconfirmed')
  assert.match(turn, /id=\S+ — this seat cannot write it/)
})

test('candidates reach the agent with their ids, and the one the person chose is marked', () => {
  const { answer, turn } = sent('/en/news', 'Northgate Industrial wins', { candidate: 1 })
  assert.equal(answer.status, 'candidates')
  assert.equal(answer.candidates.length, 2)
  for (const one of answer.candidates) assert.ok(turn.includes(`id=${one.id}`), one.id)
  assert.ok(turn.includes(`id=${answer.candidates[1].id} [chosen]`))
})

test('a partial answer reaches the agent marked incomplete, and the chip does not name its record', () => {
  const query = pick('/en', 'Services')
  const answer = locateElement(index, query, { mayWrite, platform: 'joomla', incomplete: true })
  assert.equal(answer.status, 'resolved')
  assert.equal(answer.incomplete, true)
  const turn = buildCommentTurn({
    text: 'Make only this orange.',
    element: {
      url: query.url,
      selector: 'a',
      label: answer.levels[0].label,
      text: query.text,
      marks: query.marks
    },
    locate: answer
  })
  assert.match(turn, /status="resolved" incomplete="true"/)
  const parsed = parseCommentTurn(turn)
  assert.equal(parsed?.element.incomplete, true)
  assert.equal(chipLabel(parsed.element), '"Services"')
})

test('a picked container with no words: its marks name the owner, and the turn carries its id', () => {
  // The topbar module's own box (padding around its lines): the picker sends no text, only marks.
  const query = { ...pick('/en', 'Hotline'), text: '' }
  assert.deepEqual(query.marks, ['module:428 mod:mod_custom'])
  const answer = locateElement(index, query, { mayWrite, platform: 'joomla' })
  assert.equal(answer.status, 'resolved')
  assert.deepEqual(answer.sources, { value: 'none', mark: 'only' })
  const turn = buildCommentTurn({
    text: 'Give this bar more room.',
    element: { url: query.url, selector: 'div.custom', label: '', text: '', marks: query.marks },
    locate: answer
  })
  // A module is `code`; this editor seat is told so before the agent tries.
  assert.ok(turn.includes(`id=${answer.levels.at(-1).id} — this seat cannot write it [picked]`))
  assert.doesNotMatch(turn, /^text: /m, 'no words, no text line')
  assert.match(
    turn,
    /status="resolved" kind="record" name="shared &quot;\[Tracy Business\] Topbar - Contacts \(en\)&quot;"/
  )
})

test('28/09: a resolved Joomla label reaches the agent with its one write, and its twin in Russian', () => {
  // The site's contract names these slots text (a content seat applies them), and its head lists
  // two languages — what the Apply door hands the resolver (`route.js` `answerLocate`).
  const writes = (road) =>
    roadToolsets(
      road,
      (kind) => KIND_TOOLSET[kind] ?? 'site',
      () => 'content'
    ).includes('content')
  const answer = (path, start) =>
    locateElement(index, pick(path, start), {
      mayWrite: writes,
      platform: 'joomla',
      siteLocales: ['en-GB', 'ru-RU']
    })
  const turnOf = (path, start, text) => {
    const query = pick(path, start)
    return buildCommentTurn({
      text,
      element: { url: query.url, selector: 'a', label: '', text: query.text, marks: query.marks },
      locate: answer(path, start)
    })
  }
  const careers = turnOf('/en', 'Careers', 'Call it "Jobs".')
  const twin = answer('/en', 'Careers').levels.at(-1).alternates?.[0]
  assert.equal(twin?.locale, 'ru-RU')
  assert.match(careers, /^write: content\.replace \{find, replace, path, at:\["menuItem-618\.0"\]\}$/m)
  assert.ok(careers.includes(`\nalso in: ru-RU → ${twin.id}\n`))
  assert.doesNotMatch(careers, /^value/m, 'its words are the text line already')
  // A slot that prints the phone through a token: the stored words say so.
  const hotline = turnOf('/en', 'Hotline', 'Change the hotline number.')
  assert.match(hotline, /^value: Hotline: \{contact\.phone\}$/m)
  assert.match(hotline, /^write: content\.replace \{find, replace, path, at:\["module-428\.1"\]\}$/m)
})

test('words in no record of an imported site: the agent is told where to look; the chip shows only the words', () => {
  const imported = indexContents(
    [{ id: 'c-home', type: 'page', title: 'Home', slug: 'home', url: 'https://imported.test/', blocks: [] }],
    { siteUrl: 'https://imported.test' }
  )
  const query = { url: 'https://imported.test/', text: 'Designed by Northwind', marks: ['part:footer'] }
  const answer = locateElement(imported, query, { mayWrite, platform: 'wordpress' })
  assert.equal(answer.hint, 'not-in-content')
  const turn = buildCommentTurn({
    text: 'Say "Made by Northwind" here.',
    element: { url: query.url, selector: 'p', label: query.text, text: query.text, marks: query.marks },
    locate: answer
  })
  assert.match(turn, /status="unknown" hint="not-in-content"/)
  assert.ok(turn.includes(`not in content: ${answer.next}`), 'the sentence reaches the agent whole')
  // 30/09: theme words go through content.replace with this page's path; never a theme file.
  assert.ok(
    turn.includes(
      "not in content: What was picked is not in this site's stored content. Words the block theme holds"
    ),
    turn
  )
  assert.ok(turn.includes('tracy_site content.replace {find:"<its words>", replace, path:"/"}'))
  assert.doesNotMatch(turn, /grep|Look in the active theme/)
  const parsed = parseCommentTurn(turn)
  assert.equal(parsed?.request, 'Say "Made by Northwind" here.')
  assert.equal(chipLabel(parsed.element), '"Designed by Northwind"')
  // A hint the resolver did not give is never printed.
  const plain = buildCommentTurn({
    text: 'x',
    element: { url: query.url, selector: 'p', label: query.text, text: query.text },
    locate: { ...answer, hint: undefined, next: undefined }
  })
  assert.doesNotMatch(plain, /not-in-content|not in content:/)
})
