/**
 * The desktop changelog page (apps/tracy-docs/src/content/docs/changelog/desktop/<X.Y>.md) is the one
 * source of a release's notes (tasks/todo-desktop-update-policy.md "One-source changelog — rule (E)"):
 * a minor release ships the page's Highlights, a patch release its own `## X.Y.Z` section.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  bundleNotesProblems,
  docsServeNotes,
  highlightMedia,
  notesForRelease,
  notesSha256,
  pageProblems,
  releaseNotesFromPage,
  writeBundleNotes
} from '../build/release-notes-page.mjs'

const PAGE = `---
title: Tracy Cowork 0.5
description: What changed in the 0.5 releases of the desktop app.
version: "0.5"
released: 2026-10-10
slug: changelog/desktop/0.5
---

## Highlights
- Getting started on first launch.
- Settings › AI accounts can now connect two more vendors.

## Changes
### New
- Getting started on first launch.
### Fixed
- Windows open larger by default.

## 0.5.1
Released 2026-10-10.
- On Linux, the app opens straight to sign-in.
- The Getting started screen remembers your look.
`

test('a minor release ships the Highlights of its page', () => {
  assert.equal(
    releaseNotesFromPage(PAGE, '0.5.0'),
    '- Getting started on first launch.\n- Settings › AI accounts can now connect two more vendors.'
  )
})

test('a patch release ships its own section, without the minor launch text or its "Released" line', () => {
  assert.equal(
    releaseNotesFromPage(PAGE, '0.5.1'),
    '- On Linux, the app opens straight to sign-in.\n- The Getting started screen remembers your look.'
  )
})

test('no notes for the version is null: a patch with no section, a page of another minor, an empty section', () => {
  assert.equal(releaseNotesFromPage(PAGE, '0.5.2'), null)
  assert.equal(releaseNotesFromPage(PAGE, '0.6.0'), null)
  assert.equal(
    releaseNotesFromPage(PAGE.replace(/## Highlights\n(- .*\n)+/, '## Highlights\n\n'), '0.5.0'),
    null
  )
  assert.equal(
    releaseNotesFromPage(PAGE.replace(/(## 0\.5\.1\n)[\s\S]*$/, '$1Released 2026-10-10.\n'), '0.5.1'),
    null
  )
})

test('the page as the docs host serves it (no front matter) gives the same notes', () => {
  const served = PAGE.replace(/^---\n[\s\S]*?\n---\n/, '')
  assert.equal(releaseNotesFromPage(served, '0.5.1'), releaseNotesFromPage(PAGE, '0.5.1'))
  assert.equal(
    releaseNotesFromPage(served.replace(/\n/g, '\r\n'), '0.5.0'),
    releaseNotesFromPage(PAGE, '0.5.0')
  )
})

// ── one label: Desktop only (E9) ───────────────────────────────────────────────────────────────

const LABELLED = PAGE.replace(
  '- Getting started on first launch.\n- Settings',
  '- Getting started on first launch. _(Desktop only)_\n- Settings'
).replace(
  '- On Linux, the app opens straight to sign-in.',
  '- On Linux, the app opens straight to sign-in. _(Desktop only)_'
)

test('a Desktop only line ships as plain text: the label is for the web page only, never in the notes an app shows', () => {
  assert.equal(
    releaseNotesFromPage(LABELLED, '0.5.0'),
    '- Getting started on first launch.\n- Settings › AI accounts can now connect two more vendors.'
  )
  assert.equal(
    releaseNotesFromPage(LABELLED, '0.5.1'),
    '- On Linux, the app opens straight to sign-in.\n- The Getting started screen remembers your look.'
  )
})

test('the docs host serving a labelled page matches the hash of the clean notes the candidate froze', async () => {
  const served = LABELLED.replace(/^---\n[\s\S]*?\n---\n/, '')
  const frozen =
    '- Getting started on first launch.\n- Settings › AI accounts can now connect two more vendors.'
  const fetchDocs = async () => ({ status: 200, text: served })
  assert.equal(
    await docsServeNotes({
      origin: 'https://docs.tracy.test',
      version: '0.5.0',
      contentSha256: notesSha256(frozen),
      fetchDocs
    }),
    null
  )
  const withBadge = notesSha256(
    frozen.replace(
      '- Getting started on first launch.',
      '- Getting started on first launch. _(Desktop only)_'
    )
  )
  assert.match(
    await docsServeNotes({
      origin: 'https://docs.tracy.test',
      version: '0.5.0',
      contentSha256: withBadge,
      fetchDocs
    }),
    /another text/
  )
})

test('a labelled page in the format has no problem', () => {
  assert.deepEqual(pageProblems(LABELLED, '0.5.md'), [])
})

test('the page carries one label, as the badge at the end of a bullet: no prefix, no other label', () => {
  const problemsOf = (from, to) => pageProblems(PAGE.replace(from, to), '0.5.md').join('\n')
  assert.match(
    problemsOf('- Windows open larger by default.', '- web: Windows open larger by default.'),
    /label.*web:.*one label/
  )
  assert.match(
    problemsOf('- Windows open larger by default.', '- mobile: Windows open larger by default.'),
    /label.*mobile:/
  )
  assert.match(
    problemsOf('- Windows open larger by default.', '- desktop: Windows open larger by default.'),
    /desktop:.*_\(Desktop only\)_/
  )
  assert.match(
    problemsOf('- Windows open larger by default.', '- Windows open larger by default. _(Web only)_'),
    /Web only.*one label/
  )
  assert.match(
    problemsOf('- Windows open larger by default.', '- _(Desktop only)_ Windows open larger by default.'),
    /end of the bullet/
  )
  // Prose with a capitalised word before a colon is not a label.
  assert.equal(problemsOf('- Windows open larger by default.', '- Mac: now needs macOS 13 or later.'), '')
})

test('a page in the format has no problem', () => {
  assert.deepEqual(pageProblems(PAGE, '0.5.md'), [])
})

test('a line that names a third party or is not English is a problem, wherever it sits on the page', () => {
  const problems = pageProblems(
    PAGE.replace('- Windows open larger by default.', '- Bump dsh-passwords 2.7.7'),
    '0.5.md'
  )
  assert.equal(problems.length, 1)
  assert.match(problems[0], /third party.*Bump dsh-passwords 2\.7\.7/)
  const vietnamese = pageProblems(
    PAGE.replace('- Windows open larger by default.', '- Cửa sổ mở to hơn.'),
    '0.5.md'
  )
  assert.equal(vietnamese.length, 1)
  assert.match(vietnamese[0], /English.*Cửa sổ mở to hơn/)
})

test('the front matter names the page: a title, a description, the version as a string of the file name, the day', () => {
  const problemsOf = (from, to, file = '0.5.md') => pageProblems(PAGE.replace(from, to), file)
  assert.match(problemsOf('title: Tracy Cowork 0.5\n', '').join('\n'), /front matter.*title/)
  assert.match(
    problemsOf('description: What changed in the 0.5 releases of the desktop app.\n', '').join('\n'),
    /front matter.*description/
  )
  assert.match(problemsOf('version: "0.5"', 'version: 0.5').join('\n'), /version.*string/)
  assert.match(problemsOf('version: "0.5"', 'version: "0.4"').join('\n'), /version "0\.4".*0\.5\.md/)
  assert.match(pageProblems(PAGE, '0.6.md').join('\n'), /version "0\.5".*0\.6\.md/)
  assert.match(problemsOf('released: 2026-10-10', 'released: soon').join('\n'), /released.*YYYY-MM-DD/)
  assert.match(
    pageProblems(PAGE.replace(/^---\n[\s\S]*?\n---\n/, ''), '0.5.md').join('\n'),
    /no front matter/
  )
  // The docs build drops the dot from a file named 0.5.md (/changelog/desktop/05/): the slug keeps the
  // address the app, publish and the index link to.
  assert.match(problemsOf('slug: changelog/desktop/0.5\n', '').join('\n'), /slug: changelog\/desktop\/0\.5/)
  assert.match(
    problemsOf('slug: changelog/desktop/0.5', 'slug: changelog/desktop/05').join('\n'),
    /slug: changelog\/desktop\/0\.5/
  )
})

test('Highlights come first, as one to five bullets; Changes follow', () => {
  const six = Array.from({ length: 6 }, (_, i) => `- Highlight ${i + 1}.`).join('\n')
  assert.match(
    pageProblems(PAGE.replace(/(## Highlights\n)(- .*\n)+/, `$1${six}\n`), '0.5.md').join('\n'),
    /Highlights.*6.*at most 5/
  )
  assert.match(
    pageProblems(PAGE.replace('## Highlights\n', '## Highlights\nSome prose.\n'), '0.5.md').join('\n'),
    /Highlights.*bullet.*Some prose\./
  )
  assert.match(
    pageProblems(PAGE.replace(/## Highlights\n(- .*\n)+/, '## Highlights\n'), '0.5.md').join('\n'),
    /Highlights.*empty/
  )
  assert.match(
    pageProblems(PAGE.replace('## Highlights', '## Summary'), '0.5.md').join('\n'),
    /first section.*## Highlights/
  )
  assert.match(pageProblems(PAGE.replace('## Changes', '## Details'), '0.5.md').join('\n'), /no ## Changes/)
})

test('each patch section is X.Y.Z of this page, once, opening with the day it shipped and holding a line', () => {
  const problemsOf = (from, to) => pageProblems(PAGE.replace(from, to), '0.5.md').join('\n')
  assert.match(problemsOf('## 0.5.1', '## 0.4.1'), /## 0\.4\.1.*not a patch of 0\.5/)
  assert.match(problemsOf('## 0.5.1', '## 0.5.0'), /## 0\.5\.0.*not a patch of 0\.5/)
  assert.match(problemsOf('Released 2026-10-10.\n', ''), /## 0\.5\.1.*Released YYYY-MM-DD\./)
  assert.match(
    pageProblems(PAGE.replace(/(## 0\.5\.1\n)[\s\S]*$/, '$1Released 2026-10-10.\n'), '0.5.md').join('\n'),
    /## 0\.5\.1.*empty/
  )
  assert.match(
    pageProblems(`${PAGE}\n## 0.5.1\nReleased 2026-10-11.\n- Again.\n`, '0.5.md').join('\n'),
    /## 0\.5\.1.*twice/
  )
})

// ── the notes inside the app bundle (D1, build half) ────────────────────────────────────────────

function resourcesDir(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bundle-notes-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('a feed build carries its own notes and where its changelog page is, next to the feed file', (t) => {
  const dir = resourcesDir(t)
  writeBundleNotes(dir, { version: '0.5.1', channel: 'stable', notes: '- On Linux, sign-in first.\n' })
  assert.equal(readFileSync(path.join(dir, 'release-notes.txt'), 'utf8'), '- On Linux, sign-in first.\n')
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'release-notes.json'), 'utf8')), {
    version: '0.5.1',
    page: '0.5',
    docsOrigin: 'https://docs.tracy.ai'
  })
  const dev = resourcesDir(t)
  writeBundleNotes(dev, { version: '0.6.0-dev.3', channel: 'dev' })
  assert.deepEqual(JSON.parse(readFileSync(path.join(dev, 'release-notes.json'), 'utf8')), {
    version: '0.6.0-dev.3',
    page: '0.6',
    docsOrigin: 'https://docs.tracy.site'
  })
})

test('a bundle without its notes, or with other notes than the release froze, is named as such', (t) => {
  const dir = resourcesDir(t)
  const want = { version: '0.5.1', channel: 'stable', notes: '- On Linux, sign-in first.' }
  writeBundleNotes(dir, want)
  assert.deepEqual(bundleNotesProblems(dir, want), [])
  assert.match(
    bundleNotesProblems(dir, { ...want, notes: '- Something else.' }).join('\n'),
    /release-notes\.txt.*not the notes/
  )
  assert.match(bundleNotesProblems(dir, { ...want, version: '0.5.2' }).join('\n'), /release-notes\.json/)
  unlinkSync(path.join(dir, 'release-notes.txt'))
  assert.match(bundleNotesProblems(dir, want).join('\n'), /no release-notes\.txt/)
})

test('package.sh writes the bundle notes through the command line of the same module', (t) => {
  const dir = resourcesDir(t)
  const notes = path.join(dir, 'in.txt')
  writeFileSync(notes, '- From a file.\n')
  const script = fileURLToPath(new URL('../build/release-notes-page.mjs', import.meta.url))
  execFileSync(process.execPath, [
    script,
    'bundle',
    dir,
    '--version',
    '0.5.0',
    '--channel',
    'dev',
    '--notes-file',
    notes
  ])
  assert.equal(readFileSync(path.join(dir, 'release-notes.txt'), 'utf8'), '- From a file.\n')
  assert.equal(
    JSON.parse(readFileSync(path.join(dir, 'release-notes.json'), 'utf8')).docsOrigin,
    'https://docs.tracy.site'
  )
})

// ── media under a Highlight: the web page shows it, the notes a release ships stay text ──────────

const WITH_MEDIA = LABELLED.replace(
  '- Getting started on first launch. _(Desktop only)_\n',
  '- Getting started on first launch. _(Desktop only)_\n' +
    '  ![Getting started screen: pick your default agent](/changelog/0.5/getting-started.webp)\n'
).replace(
  '- Settings › AI accounts can now connect two more vendors.\n',
  '- Settings › AI accounts can now connect two more vendors.\n' +
    '  <video src="/changelog/0.5/ai-accounts.mp4" poster="/changelog/0.5/posters/ai-accounts.jpg" aria-label="Connecting a new AI account in Settings" autoplay muted loop playsinline controls></video>\n'
)

test('a Highlight with an image or a video under it ships as the same text: media is for the web page only', () => {
  assert.equal(
    releaseNotesFromPage(WITH_MEDIA, '0.5.0'),
    '- Getting started on first launch.\n- Settings › AI accounts can now connect two more vendors.'
  )
})

test('a page with one image or video under a Highlight is in the format', () => {
  assert.deepEqual(pageProblems(WITH_MEDIA, '0.5.md'), [])
})

test('media under a Highlight is one indented line in the one shape, with English alt text, under this page', () => {
  const image = '  ![Getting started screen: pick your default agent](/changelog/0.5/getting-started.webp)'
  const at = (extra) =>
    pageProblems(
      PAGE.replace(
        '- Getting started on first launch.\n- Settings',
        `- Getting started on first launch.\n${extra}\n- Settings`
      ),
      '0.5.md'
    ).join('\n')
  assert.match(at('  ![](/changelog/0.5/getting-started.webp)'), /no text alternative/)
  assert.match(at('  ![Màn hình bắt đầu](/changelog/0.5/getting-started.webp)'), /not English/)
  assert.match(at('  ![Getting started](/changelog/0.4/getting-started.webp)'), /under \/changelog\/0\.5\//)
  assert.match(
    at('  ![Getting started](/changelog/0.5/getting-started.gif)'),
    /not an image or a video in the one shape/
  )
  assert.match(
    at('  ![Getting started](https://example.test/x.webp)'),
    /not an image or a video in the one shape/
  )
  assert.match(
    at('![Getting started](/changelog/0.5/getting-started.webp)'),
    /not an image or a video in the one shape/
  )
  const video = (src, poster, label) =>
    `  <video src="${src}" poster="${poster}" aria-label="${label}" autoplay muted loop playsinline controls></video>`
  assert.match(at(video('/changelog/0.5/x.mp4', '/changelog/0.5/posters/x.jpg', '')), /no text alternative/)
  assert.match(
    at('  <video src="/changelog/0.5/x.mp4" aria-label="A clip" controls muted playsinline></video>'),
    /not an image or a video in the one shape/
  )
  // The poster is the still of the same clip: posters/<the clip's name>.jpg next to it.
  assert.match(
    at(video('/changelog/0.5/x.mp4', '/changelog/0.5/posters/y.jpg', 'A clip')),
    /poster of \/changelog\/0\.5\/x\.mp4 is \/changelog\/0\.5\/posters\/x\.jpg/
  )
  assert.equal(at(video('/changelog/0.5/x.mp4', '/changelog/0.5/posters/x.jpg', 'A clip')), '')
  assert.match(at(`${image}\n${image}`), /one image or video per bullet/)
  // A media line opening the section belongs to no bullet.
  assert.match(
    pageProblems(PAGE.replace('## Highlights\n', `## Highlights\n${image}\n`), '0.5.md').join('\n'),
    /belongs to no bullet/
  )
})

test('media sits under a Highlight only: Changes and patch sections stay text', () => {
  const image = '  ![Windows open larger](/changelog/0.5/windows.webp)'
  const inChanges = PAGE.replace(
    '- Windows open larger by default.\n',
    `- Windows open larger by default.\n${image}\n`
  )
  assert.match(pageProblems(inChanges, '0.5.md').join('\n'), /only under a ## Highlights bullet/)
})

test('six media lines do not count as Highlights: the limit of five is on bullets', () => {
  const bullets = Array.from(
    { length: 5 },
    (_, i) => `- Change number ${i + 1}.\n  ![Change number ${i + 1}](/changelog/0.5/change-${i + 1}.webp)`
  ).join('\n')
  const page = PAGE.replace(
    /## Highlights\n[\s\S]*?\n\n## Changes/,
    `## Highlights\n${bullets}\n\n## Changes`
  )
  assert.deepEqual(pageProblems(page, '0.5.md'), [])
})

// ── every Highlight has a picture or a clip, or says why not (11/10/2026) ────────────────────

const NO_MEDIA = WITH_MEDIA.replace(
  '- Settings › AI accounts can now connect two more vendors.\n  <video',
  '- Settings › AI accounts can now connect two more vendors.\n  <!-- no-media: a list of account names, nothing to show -->\n  <video'
).replace(/\n {2}<video[^\n]*\n/, '\n')

test('each Highlight is covered by its media line or by a no-media comment that says why', () => {
  assert.deepEqual(highlightMedia(WITH_MEDIA), { missing: [], noMedia: [] })
  assert.deepEqual(highlightMedia(NO_MEDIA), {
    missing: [],
    noMedia: [
      {
        highlight: 'Settings › AI accounts can now connect two more vendors.',
        reason: 'a list of account names, nothing to show'
      }
    ]
  })
  // A Highlight with neither, named by its first words; Changes and patch sections need nothing.
  assert.deepEqual(highlightMedia(LABELLED), {
    missing: ['Getting started on first launch.', 'Settings › AI accounts can now connect two…'],
    noMedia: []
  })
  assert.deepEqual(pageProblems(NO_MEDIA, '0.5.md'), [])
})

test('a no-media comment sits under a Highlight, alone, with an English reason', () => {
  const at = (extra) =>
    pageProblems(
      PAGE.replace(
        '- Getting started on first launch.\n- Settings',
        `- Getting started on first launch.\n${extra}\n- Settings`
      ),
      '0.5.md'
    ).join('\n')
  assert.match(at('  <!-- no-media: -->'), /no-media needs a reason/)
  assert.match(at('  <!-- no-media: không có gì để xem -->'), /not English/)
  assert.match(
    at('  <!-- no-media: nothing to show -->\n  ![Getting started](/changelog/0.5/getting-started.webp)'),
    /both an image or a video and a no-media comment/
  )
  assert.match(
    pageProblems(
      PAGE.replace(
        '- Windows open larger by default.\n',
        '- Windows open larger by default.\n  <!-- no-media: text -->\n'
      ),
      '0.5.md'
    ).join('\n'),
    /no-media: … --> goes only under a ## Highlights bullet/
  )
})

test('a no-media comment never reaches the notes a release ships: the 0.5 hashes stay as they are', () => {
  const real = readFileSync(
    fileURLToPath(
      new URL('../../../../apps/tracy-docs/src/content/docs/changelog/desktop/0.5.md', import.meta.url)
    ),
    'utf8'
  )
  const commented = real.replace(
    /(- Windows open larger by default, [^\n]*\n)/,
    '$1  <!-- no-media: a window size and a settings fix, nothing a still would show -->\n'
  )
  assert.notEqual(commented, real)
  assert.deepEqual(pageProblems(commented, '0.5.md'), [])
  for (const version of ['0.5.0', '0.5.1']) {
    assert.equal(releaseNotesFromPage(commented, version), releaseNotesFromPage(real, version))
    assert.equal(
      notesSha256(releaseNotesFromPage(commented, version)),
      notesSha256(releaseNotesFromPage(real, version))
    )
  }
  assert.doesNotMatch(releaseNotesFromPage(commented, '0.5.0'), /no-media|<!--/)
})

const FILE_05 = 'apps/tracy-docs/src/content/docs/changelog/desktop/0.5.md'
const release = (variant, version, page, log = () => {}) =>
  notesForRelease({
    variant,
    version,
    sha: 'a'.repeat(40),
    readPage: (_sha, file) => (file === FILE_05 ? page : null),
    collect: () => ({ text: 'From PRs.', prs: [], source: 'PRs' }),
    log
  })

test('stable X.Y.0 is refused while a Highlight has no image, no clip and no no-media comment, naming each', () => {
  assert.throws(
    () => release('stable', '0.5.0', LABELLED),
    (error) => {
      assert.equal(
        error.message,
        `stable 0.5.0 ships the Highlights of ${FILE_05} at aaaaaaaaaa, but 2 of them have no image or clip and no ` +
          '"<!-- no-media: <reason> -->" line under them: "Getting started on first launch." | ' +
          '"Settings › AI accounts can now connect two…" — put one under each ' +
          '(docs/references/phat-hanh-app-desktop.md §6.1), merge it, and prepare from a sha that has it'
      )
      return true
    }
  )
})

test('a dev build of X.Y.0 warns with the same list and ships the page notes', () => {
  const lines = []
  const notes = release('dev', '0.5.0-dev.3', LABELLED, (line) => lines.push(line))
  assert.equal(notes.text, releaseNotesFromPage(LABELLED, '0.5.0'))
  assert.deepEqual(notes.noMedia, [])
  assert.equal(lines.length, 1)
  assert.match(
    lines[0],
    /^prepare: WARNING .*0\.5\.md.*2 Highlights have no image or clip.*"Getting started on first launch\." \| "Settings › AI accounts can now connect two…" — a stable 0\.5\.0 refuses this$/
  )
})

test('a no-media Highlight passes and is listed with its reason for the person releasing', () => {
  const notes = release('stable', '0.5.0', NO_MEDIA)
  assert.equal(notes.text, releaseNotesFromPage(WITH_MEDIA, '0.5.0'))
  assert.deepEqual(notes.noMedia, [
    {
      highlight: 'Settings › AI accounts can now connect two more vendors.',
      reason: 'a list of account names, nothing to show'
    }
  ])
})

test('a patch release does not look at the Highlights again: the shipped 0.5 page releases 0.5.1 as it is', () => {
  const real = readFileSync(fileURLToPath(new URL(`../../../../${FILE_05}`, import.meta.url)), 'utf8')
  const notes = release('stable', '0.5.1', real)
  assert.equal(notes.text, releaseNotesFromPage(real, '0.5.1'))
  assert.deepEqual(notes.noMedia, [])
  assert.deepEqual(release('stable', '0.5.1', LABELLED).noMedia, [])
})

test('a markdown link in the notes ships as its text: the app shows the notes as plain text', () => {
  const page = [
    '---',
    'version: 0.6',
    '---',
    '## Highlights',
    '- Documentation now lives at [docs.tracy.ai](https://docs.tracy.ai/), written for people first.',
    '  ![The docs home](/changelog/0.6/docs-home.webp)',
    '- Plain line. _(Desktop only)_',
    ''
  ].join('\n')
  assert.equal(
    releaseNotesFromPage(page, '0.6.0'),
    '- Documentation now lives at docs.tracy.ai, written for people first.\n- Plain line.'
  )
})
