/**
 * `build/draft-release-notes.mjs` turns the ```release-note``` blocks of merged PRs into a
 * DRAFT of the changelog page a person then edits (tasks/todo-desktop-update-policy.md E4).
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { CHANGELOG_DIR, DraftError, writeDraft } from '../build/draft-release-notes.mjs'
import { pageProblems, releaseNotesFromPage } from '../build/release-notes-page.mjs'

const note = (number, title, line, mergedAt = `2026-10-1${number % 10}T00:00:00Z`) => ({
  number,
  title,
  url: `https://github.com/TracyHQ/tch/pull/${number}`,
  mergedAt,
  body: `Summary\n\n\`\`\`desktop-release-note\n${line}\n\`\`\`\n`
})

const PRS = [
  note(1, 'feat(desktop): getting started screen', 'A Getting started screen on first launch.'),
  note(2, 'fix(desktop): no keyring dialog on Linux', 'On Linux, the app opens straight to sign-in.'),
  note(3, 'chore(deps): bump the agent host', 'Faster sign-in.'),
  {
    number: 4,
    title: 'docs: evidence',
    url: 'u4',
    mergedAt: '2026-10-14T00:00:00Z',
    body: '```desktop-release-note\nNONE\n```'
  },
  { number: 5, title: 'feat: old PR', url: 'u5', mergedAt: '2026-10-15T00:00:00Z', body: 'no block' },
  note(6, 'fix(desktop): vendor bump', 'Bump dsh-passwords 2.7.7')
]

function repo(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'draft-notes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

test('a minor draft is a new page in the format: Highlights, then the changes grouped by kind', (t) => {
  const root = repo(t)
  const out = writeDraft({ root, version: '0.6', prs: PRS, today: '2026-10-20' })
  assert.equal(out.file, path.join(root, CHANGELOG_DIR, '0.6.md'))
  const page = readFileSync(out.file, 'utf8')
  assert.deepEqual(pageProblems(page, '0.6.md'), [])
  assert.match(
    page,
    /^---\ntitle: Tracy Cowork 0\.6\ndescription: .+\nversion: "0\.6"\nreleased: 2026-10-20\nslug: changelog\/desktop\/0\.6\n---\n/
  )
  assert.equal(
    releaseNotesFromPage(page, '0.6.0'),
    '- A Getting started screen on first launch.\n- On Linux, the app opens straight to sign-in.\n- Faster sign-in.'
  )
  assert.match(page, /### New\n- A Getting started screen on first launch\.\n/)
  assert.match(page, /### Fixed\n- On Linux, the app opens straight to sign-in\.\n/)
  assert.match(page, /### Other\n- Faster sign-in\.\n/)
  // What a person must look at: the PRs that wrote no note, wrote none, or wrote one that is refused.
  assert.deepEqual(out.none, [4])
  assert.deepEqual(out.missing, [5])
  assert.deepEqual(
    out.rejected.map((r) => r.pr),
    [6]
  )
})

test("a patch draft appends its own section to the minor page, which then ships it as that release's notes", (t) => {
  const root = repo(t)
  writeDraft({ root, version: '0.6', prs: PRS.slice(0, 1), today: '2026-10-20' })
  const out = writeDraft({ root, version: '0.6.1', prs: PRS.slice(1, 2), today: '2026-10-22' })
  const page = readFileSync(out.file, 'utf8')
  assert.deepEqual(pageProblems(page, '0.6.md'), [])
  assert.match(
    page,
    /\n## 0\.6\.1\nReleased 2026-10-22\.\n- On Linux, the app opens straight to sign-in\.\n$/
  )
  assert.equal(releaseNotesFromPage(page, '0.6.1'), '- On Linux, the app opens straight to sign-in.')
  assert.equal(releaseNotesFromPage(page, '0.6.0'), '- A Getting started screen on first launch.')
})

const fence = '```'
const labelled = (number, title, lines) => ({
  number,
  title,
  url: `https://github.com/TracyHQ/tch/pull/${number}`,
  mergedAt: `2026-10-1${number % 10}T00:00:00Z`,
  body: `${fence}release-note\n${lines.join('\n')}\n${fence}\n`
})

test('a desktop: line drafts as a Desktop only bullet, an unlabelled one as a plain bullet, and both ship as plain text', (t) => {
  const root = repo(t)
  const prs = [
    labelled(1, 'feat(desktop): restart reminder', ['Desktop: Restart reminders stop interrupting you.']),
    labelled(2, 'fix(web): faster sites', ['Sites open faster.'])
  ]
  const out = writeDraft({ root, version: '0.6', prs, today: '2026-10-20' })
  const page = readFileSync(out.file, 'utf8')
  assert.deepEqual(pageProblems(page, '0.6.md'), [])
  assert.match(
    page,
    /## Highlights\n- Restart reminders stop interrupting you\. _\(Desktop only\)_\n- Sites open faster\.\n/
  )
  assert.match(page, /### New\n- Restart reminders stop interrupting you\. _\(Desktop only\)_\n/)
  assert.match(page, /### Fixed\n- Sites open faster\.\n/)
  assert.equal(
    releaseNotesFromPage(page, '0.6.0'),
    '- Restart reminders stop interrupting you.\n- Sites open faster.'
  )
  // The page covers the whole product, the desktop version labelling it.
  assert.match(page, /\ndescription: .*web.*desktop app/)
})

test('a patch section drafts its Desktop only lines with the badge too', (t) => {
  const root = repo(t)
  writeDraft({ root, version: '0.6', prs: PRS.slice(0, 1), today: '2026-10-20' })
  const out = writeDraft({
    root,
    version: '0.6.1',
    prs: [
      labelled(7, 'fix(desktop): linux keyring', [
        '- desktop: On Linux, no keyring prompt.',
        'Sign-in links work again.'
      ])
    ],
    today: '2026-10-22'
  })
  const page = readFileSync(out.file, 'utf8')
  assert.deepEqual(pageProblems(page, '0.6.md'), [])
  assert.match(
    page,
    /\n## 0\.6\.1\nReleased 2026-10-22\.\n- On Linux, no keyring prompt\. _\(Desktop only\)_\n- Sign-in links work again\.\n$/
  )
  assert.equal(
    releaseNotesFromPage(page, '0.6.1'),
    '- On Linux, no keyring prompt.\n- Sign-in links work again.'
  )
})

test('a page or section already written is kept unless --force, and a patch needs its minor page', (t) => {
  const root = repo(t)
  assert.throws(
    () => writeDraft({ root, version: '0.6.1', prs: PRS, today: '2026-10-22' }),
    /0\.6\.md does not exist/
  )
  writeDraft({ root, version: '0.6', prs: PRS.slice(0, 1), today: '2026-10-20' })
  const file = path.join(root, CHANGELOG_DIR, '0.6.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace('first launch.', 'first launch, edited.'))
  assert.throws(() => writeDraft({ root, version: '0.6', prs: PRS, today: '2026-10-20' }), /exists.*--force/)
  assert.match(readFileSync(file, 'utf8'), /edited/)
  writeDraft({ root, version: '0.6.1', prs: PRS.slice(1, 2), today: '2026-10-22' })
  assert.throws(
    () => writeDraft({ root, version: '0.6.1', prs: PRS.slice(2, 3), today: '2026-10-23' }),
    /already has ## 0\.6\.1/
  )
  writeDraft({ root, version: '0.6.1', prs: PRS.slice(2, 3), today: '2026-10-23', force: true })
  const page = readFileSync(file, 'utf8')
  assert.equal(releaseNotesFromPage(page, '0.6.1'), '- Faster sign-in.')
  assert.equal((page.match(/## 0\.6\.1/g) ?? []).length, 1)
  assert.match(page, /edited/)
  writeDraft({ root, version: '0.6', prs: PRS.slice(1, 2), today: '2026-10-20', force: true })
  assert.doesNotMatch(readFileSync(file, 'utf8'), /edited/)
})

test('a window with no usable note writes nothing, and still names the PRs to look at', (t) => {
  const root = repo(t)
  assert.throws(
    () => writeDraft({ root, version: '0.6', prs: PRS.slice(3), today: '2026-10-20' }),
    (error) =>
      error instanceof DraftError &&
      /no PR in the window/.test(error.message) &&
      error.report.rejected[0].pr === 6
  )
  assert.equal(existsSync(path.join(root, CHANGELOG_DIR, '0.6.md')), false)
  assert.throws(
    () => writeDraft({ root, version: '0.6.1-dev.2', prs: PRS, today: '2026-10-20' }),
    /X\.Y or X\.Y\.Z/
  )
})
