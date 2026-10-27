import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  collectNotes,
  extractReleaseNote,
  previousTag,
  searchSince
} from '../build/collect-release-notes.mjs'

const fence = '```'
const body = (block) => `### What this PR does\n\nBefore this PR:\n\nx\n\n${block}\n\n### Regression\n`

test('a filled block gives its line', () => {
  const note = extractReleaseNote(
    body(`${fence}desktop-release-note\nSign-in now returns to the app.\n${fence}`)
  )
  assert.deepEqual(note, { state: 'note', lines: ['Sign-in now returns to the app.'] })
})

test('NONE, in any case and with blank lines around it, is no note', () => {
  for (const inner of ['NONE', 'none', '\n  NONE  \n'])
    assert.deepEqual(extractReleaseNote(body(`${fence}desktop-release-note\n${inner}\n${fence}`)), {
      state: 'none',
      lines: []
    })
})

test('a PR without the block (older template) is reported apart from NONE', () => {
  assert.deepEqual(extractReleaseNote(body('nothing here')), { state: 'missing', lines: [] })
  assert.deepEqual(extractReleaseNote(null), { state: 'missing', lines: [] })
})

test('another fenced block is not the release note', () => {
  const text = body(`${fence}js\nNot ours\n${fence}\n${fence}release-note\nOurs\n${fence}`)
  assert.deepEqual(extractReleaseNote(text).lines, ['Ours'])
})

test('the release-note block gives one line per change, web or desktop', () => {
  const note = extractReleaseNote(
    body(
      `${fence}release-note\nSites open faster.\ndesktop: Restart reminders stop interrupting you.\n${fence}`
    )
  )
  assert.deepEqual(note, {
    state: 'note',
    lines: ['Sites open faster.', 'desktop: Restart reminders stop interrupting you.']
  })
})

test('a PR carrying both the old desktop-release-note block and the new one gives the lines of both', () => {
  const text = body(
    `${fence}desktop-release-note\nThe app remembers its window.\n${fence}\n\n` +
      `${fence}release-note\nNONE\ndesktop: The app opens straight to sign-in.\n${fence}`
  )
  assert.deepEqual(extractReleaseNote(text), {
    state: 'note',
    lines: ['The app remembers its window.', 'desktop: The app opens straight to sign-in.']
  })
  assert.deepEqual(
    extractReleaseNote(
      body(`${fence}desktop-release-note\nNONE\n${fence}\n${fence}release-note\nNONE\n${fence}`)
    ),
    { state: 'none', lines: [] }
  )
})

test('the desktop: prefix is written one way whatever case or spacing the author used', () => {
  const note = extractReleaseNote(
    body(
      `${fence}release-note\nDesktop:   A notice when the agent finishes.\n- DESKTOP:Windows open larger.\n${fence}`
    )
  )
  assert.deepEqual(note.lines, [
    'desktop: A notice when the agent finishes.',
    '- desktop: Windows open larger.'
  ])
})

test('a label other than desktop: is refused, while a capitalised word before a colon is just prose', () => {
  const prs = [
    {
      number: 20,
      title: 'feat: a',
      url: 'u20',
      body: `${fence}release-note\nweb: The editor saves faster.\n${fence}`
    },
    {
      number: 21,
      title: 'feat: b',
      url: 'u21',
      body: `${fence}release-note\nMac: now needs macOS 13 or later.\n${fence}`
    }
  ]
  const out = collectNotes(prs)
  assert.deepEqual(out.rejected, [{ pr: 20, url: 'u20', lines: ['web: The editor saves faster.'] }])
  assert.deepEqual(
    out.notes.map((n) => n.note),
    ['Mac: now needs macOS 13 or later.']
  )
})

test('a block written with CRLF line ends (GitHub web editor) is read the same', () => {
  const text = `${fence}desktop-release-note\r\nWindow size is kept.\r\n${fence}\r\n`
  assert.deepEqual(extractReleaseNote(text), { state: 'note', lines: ['Window size is kept.'] })
})

test('the PR template ships the release-note block (not the old name), defaulting to NONE', () => {
  const template = readFileSync(
    new URL('../../../../.github/pull_request_template.md', import.meta.url),
    'utf8'
  )
  assert.deepEqual(extractReleaseNote(template), { state: 'none', lines: [] })
  assert.match(template, /^```release-note\nNONE\n```$/m)
  assert.doesNotMatch(template, /```desktop-release-note/)
  // The note tells the author the one label.
  assert.match(template, /`desktop:`/)
})

test('collecting keeps English notes with their PR, rejects Vietnamese, and lists the rest', () => {
  const prs = [
    {
      number: 10,
      title: 'feat(desktop): a',
      url: 'u10',
      body: `${fence}desktop-release-note\nThe app remembers its window.\n${fence}`
    },
    { number: 11, title: 'fix(web): b', url: 'u11', body: `${fence}desktop-release-note\nNONE\n${fence}` },
    { number: 12, title: 'docs: c', url: 'u12', body: 'no block' },
    {
      number: 13,
      title: 'feat(desktop): d',
      url: 'u13',
      body: `${fence}desktop-release-note\nỨng dụng nhớ cửa sổ\n${fence}`
    }
  ]
  const out = collectNotes(prs)
  assert.deepEqual(out.notes, [
    { pr: 10, title: 'feat(desktop): a', url: 'u10', note: 'The app remembers its window.' }
  ])
  assert.deepEqual(out.rejected, [{ pr: 13, url: 'u13', lines: ['Ứng dụng nhớ cửa sổ'] }])
  assert.deepEqual(out.none, [11])
  assert.deepEqual(out.missing, [12])
  assert.equal(out.ok, false)
  assert.equal(collectNotes(prs.slice(0, 3)).ok, true)
})

test('notes come out in merge order, oldest first', () => {
  const block = (text) => `${fence}desktop-release-note\n${text}\n${fence}`
  const out = collectNotes([
    { number: 2, title: 't', url: 'u', mergedAt: '2026-10-08T00:00:00Z', body: block('Second') },
    { number: 1, title: 't', url: 'u', mergedAt: '2026-10-07T00:00:00Z', body: block('First') }
  ])
  assert.deepEqual(
    out.notes.map((n) => n.note),
    ['First', 'Second']
  )
})

test('the search window starts at the previous desktop tag, or at --since, and never silently at nothing', () => {
  assert.deepEqual(searchSince({ tag: { name: 'desktop-v0.3.0', date: '2026-10-01T10:00:00+07:00' } }), {
    from: 'desktop-v0.3.0',
    merged: '>2026-10-01T10:00:00+07:00'
  })
  assert.deepEqual(searchSince({ tag: null, since: { input: '2026-10-07', date: '2026-10-07' } }), {
    from: '2026-10-07',
    merged: '>=2026-10-07'
  })
  // --since wins over the tag: someone asked for that window on purpose.
  assert.equal(
    searchSince({
      tag: { name: 'desktop-v0.3.0', date: '2026-10-01' },
      since: { input: 'abc', date: '2026-10-05T00:00:00Z' }
    }).from,
    'abc'
  )
  assert.throws(() => searchSince({ tag: null }), /no desktop-v\* tag/)
})

test('a NONE left above a written line is dropped, never published as a note', () => {
  assert.deepEqual(
    extractReleaseNote(`${fence}desktop-release-note\nNONE\nThe dock icon shows unread chats.\n${fence}`),
    {
      state: 'note',
      lines: ['The dock icon shows unread chats.']
    }
  )
})

test('the previous release is the newest stable desktop tag; dev tags never start the window', () => {
  assert.equal(
    previousTag(['desktop-v0.3.0', 'desktop-v0.3.1-dev.4', 'desktop-v0.10.0', 'desktop-v0.9.2']),
    'desktop-v0.10.0'
  )
  assert.equal(previousTag(['desktop-v0.3.1-dev.4']), null)
  assert.equal(previousTag([]), null)
})

test('collecting rejects a note that names a third party, with the line', () => {
  const out = collectNotes([
    {
      number: 20,
      title: 'chore(vendor): bump',
      url: 'u20',
      body: `${fence}desktop-release-note\nBump dsh-passwords 2.7.7\n${fence}`
    },
    {
      number: 21,
      title: 'feat(desktop): x',
      url: 'u21',
      body: `${fence}desktop-release-note\nFaster sign-in\n${fence}`
    }
  ])
  assert.deepEqual(out.rejected, [{ pr: 20, url: 'u20', lines: ['Bump dsh-passwords 2.7.7'] }])
  assert.deepEqual(
    out.notes.map((n) => n.note),
    ['Faster sign-in']
  )
  assert.equal(out.ok, false)
})
