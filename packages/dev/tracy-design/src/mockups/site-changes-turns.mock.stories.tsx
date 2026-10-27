/**
 * THE QUESTION THIS MOCK EXISTS TO ANSWER (Brian, 01/10): when every row of Site changes is one
 * CHAT TURN of one person — with the files Tracy changed and the content Tracy wrote in that turn
 * underneath, and "outside Tracy" rows in between (files changed outside Tracy, edits a CMS admin
 * reported) that name no Tracy seat — does the tab read right, before anyone builds it (plan `tasks/todo-site-changes.md` v4: §0, §1, §4, §8 P1)?
 *
 * Option A's layout is kept as it runs today (header with the site picker and Create a backup,
 * summary line, filter, day groups, rows that open in place, the "…" menu). What changed and why
 * lives at the top of `./site-changes-turns.tsx`. Every person, address and path here is made up.
 *
 * Brian's calls of 01/10 already applied: no separate "Tracy update" row (a deploy is an outside
 * row that says so), turns that changed nothing never appear, and CMS admin edits are detected.
 *
 * ⚠ MODE A. A proposal: nothing here ships. Once the real `ChangesView` takes this shape, this
 * file goes (mockups README, rule 4) and `Pages/In dsh/Site tabs` shows the real thing.
 *
 * Narrow: the toolbar's Viewport menu, "Mobile — under the 768 breakpoint" (390px, the nearest
 * preset to the ~360px side card). Dark: the toolbar's Theme switch. The two `Full list · narrow`
 * stories preset both.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { type Activity, type FileChange, SiteChangesTurns, type Turn } from './site-changes-turns'

// ---------------------------------------------------------------------------------------------
// Fixtures — fake people, fake sites, a fixed clock so day groups never move.
// ---------------------------------------------------------------------------------------------

const SITE = 'bluegum-bakery.example'
const EMDASH_SITE = 'harbour-yoga.example'
const SITES = [
  { siteKey: SITE, role: 'owner' },
  { siteKey: 'harbour-yoga.example', role: 'editor' }
]
const MAI = { name: 'Mai Tran', email: 'mai.tran@example.com' }
const SAM = { name: 'Sam Ortiz', email: 'sam.ortiz@example.com' }
const JO = { name: 'Jo Reyes', email: 'jo.reyes@example.com' }

/** Unix seconds at a local wall-clock time, so "Oct 1 · 14:02" reads the same on any machine. */
const at = (month: number, day: number, h: number, m: number): number =>
  Math.floor(new Date(2026, month - 1, day, h, m).getTime() / 1000)

/** The pinned "now" every "ago" is measured against: Oct 1, 2026, 16:44 (4 min after the newest row). */
const NOW = at(10, 1, 16, 44) * 1000

const file = (
  path: string,
  zone: string,
  status: FileChange['status'] = 'modified',
  additions: number | null = 4,
  deletions: number | null = 2
): FileChange => ({ path, zone, status, additions, deletions })

const FILES_ONLY: Turn = {
  kind: 'chat',
  id: 't-files',
  at: at(10, 1, 15, 10),
  sha: '7c1e0a94d2',
  by: MAI,
  title: 'Make the hero heading bigger on phones and tighten the gap under the menu bar a little',
  source: { kind: 'panel' },
  files: [
    file('wp-content/themes/bluegum/assets/css/hero.css', 'design', 'modified', 12, 5),
    file('wp-content/themes/bluegum/assets/css/header.css', 'design', 'modified', 3, 3),
    file('wp-content/themes/bluegum/parts/hero.html', 'design', 'modified', 2, 1),
    file('wp-content/themes/bluegum/theme.json', 'design', 'modified', 6, 2),
    file('wp-content/themes/bluegum/functions.php', 'function', 'modified', 9, 0),
    file('wp-includes/version.php', 'core', 'modified', 1, 1)
  ],
  writes: []
}

const CONTENT_ONLY: Turn = {
  kind: 'chat',
  id: 't-content',
  at: at(10, 1, 14, 31),
  sha: null,
  by: SAM,
  title: 'Change the badge text on the home page to “Fresh every morning”',
  source: { kind: 'panel' },
  files: [],
  writes: [
    { via: 'apply', label: 'Wrote page content', target: 'Home · Hero badge', ok: true },
    { via: 'apply', label: 'Updated menu', ok: true }
  ]
}

const BOTH: Turn = {
  kind: 'chat',
  id: 't-both',
  at: at(10, 1, 11, 48),
  sha: '3fa29b01c7',
  by: MAI,
  title: 'Add a gluten-free section to the menu page with the three new loaves and a photo',
  source: { kind: 'comment', where: '/menu', href: '#comment-482' },
  files: [
    file('wp-content/uploads/2026/10/gf-loaves.webp', 'content', 'added', null, null),
    file('wp-content/themes/bluegum/patterns/menu-section.php', 'design', 'added', 38, 0)
  ],
  writes: [
    { via: 'apply', label: 'Wrote page content', target: 'Menu · Body', ok: true },
    { via: 'apply', label: 'Uploaded an image', target: 'gf-loaves.webp', ok: true },
    { via: 'apply', label: 'Updated menu', target: 'Main menu', ok: false }
  ]
}

const EMDASH: Turn = {
  kind: 'chat',
  id: 't-emdash',
  at: at(10, 1, 10, 22),
  sha: null,
  by: JO,
  title: 'Put the new opening hours on the contact page',
  source: { kind: 'panel' },
  files: [],
  writes: [
    { via: 'emdash', tool: 'content_update' },
    { via: 'emdash', tool: 'content_publish' }
  ]
}

const OUTSIDE: Turn = {
  kind: 'outside',
  id: 'o-1',
  at: at(10, 1, 14, 2),
  sha: 'b3b95427e1',
  files: [
    file('wp-content/plugins/contact-form-7/wp-contact-form-7.php', 'addons', 'modified', 3, 3),
    file('wp-content/plugins/contact-form-7/readme.txt', 'addons', 'modified', 40, 12),
    file('wp-content/uploads/2026/10/team-photo.jpg', 'content', 'added', null, null)
  ]
}

const DEPLOY: Turn = {
  kind: 'outside',
  id: 'o-deploy',
  at: at(9, 30, 22, 15),
  sha: 'e01d3c9a55',
  byDeploy: true,
  files: [file('wp-content/mu-plugins/tracy-access.php', 'system', 'modified', 18, 7)]
}

const CMS_EDIT: Turn = {
  kind: 'outside-cms',
  id: 'c-1',
  at: at(10, 1, 16, 40),
  sha: null,
  files: [],
  cms: 'WordPress',
  user: 'Minh',
  edits: [
    { verb: 'Edited', type: 'page', name: 'About us', at: at(10, 1, 16, 40) },
    { verb: 'Changed', type: 'menu', name: 'Main', at: at(10, 1, 16, 37) },
    { verb: 'Deleted', type: 'post', name: 'Summer opening hours 2025', at: at(10, 1, 16, 31) }
  ]
}

const CMS_EDIT_2: Turn = {
  kind: 'outside-cms',
  id: 'c-2',
  at: at(9, 30, 8, 55),
  sha: null,
  files: [],
  cms: 'WordPress',
  user: 'admin',
  edits: [{ verb: 'Created', type: 'post', name: 'New sourdough class on Saturdays', at: at(9, 30, 8, 55) }]
}

const UNSEALED: Turn = {
  kind: 'chat',
  id: 't-unsealed',
  at: at(9, 30, 16, 20),
  sha: '5d8e7f2b10',
  by: SAM,
  title: 'Fix the footer wrapping at 1100px',
  source: { kind: 'panel' },
  unsealedStart: true,
  files: [
    file('wp-content/themes/bluegum/assets/css/footer.css', 'design', 'modified', 7, 4),
    file('wp-content/plugins/wpforms-lite/wpforms.php', 'addons', 'modified', 1, 1)
  ],
  writes: []
}

const CONCURRENT: Turn = {
  kind: 'chat',
  id: 't-concurrent',
  at: at(9, 30, 15, 2),
  sha: '6a7b8c9d0e',
  by: JO,
  title: 'Make the contact form button match the brand brown',
  source: { kind: 'panel' },
  concurrent: true,
  files: [
    file('wp-content/themes/bluegum/assets/css/forms.css', 'design', 'modified', 4, 4),
    file('wp-content/themes/bluegum/assets/css/buttons.css', 'design', 'modified', 2, 1)
  ],
  writes: []
}

const STALE: Turn = {
  kind: 'chat',
  id: 't-stale',
  at: at(9, 30, 13, 44),
  sha: null,
  by: MAI,
  title: 'Translate the about page into Vietnamese',
  source: { kind: 'panel' },
  state: 'stale',
  files: [],
  writes: [{ via: 'apply', label: 'Wrote page content', target: 'About (vi) · Body', ok: true }]
}

const UNKNOWN: Turn = {
  kind: 'unknown',
  id: 'x-1',
  at: at(9, 30, 12, 30),
  sha: null,
  by: SAM,
  files: [],
  writes: [
    { via: 'apply', label: 'Wrote page content', target: 'Pricing · Body', ok: true },
    { via: 'apply', label: 'Changed a site setting', ok: false }
  ]
}

const CONFLICT: Turn = {
  ...FILES_ONLY,
  id: 't-conflict',
  at: at(9, 30, 10, 5),
  sha: '1a2b3c4d5e',
  title: 'Use the darker brown for every button',
  files: [
    file('wp-content/themes/bluegum/assets/css/buttons.css', 'design', 'modified', 5, 5),
    file('wp-content/themes/bluegum/theme.json', 'design', 'modified', 2, 2)
  ],
  undoRefusal: {
    code: 'CONFLICT',
    files: ['wp-content/themes/bluegum/assets/css/buttons.css', 'wp-content/themes/bluegum/theme.json']
  }
}

const FORBIDDEN: Turn = { ...CONFLICT, id: 't-forbidden', undoRefusal: { code: 'FORBIDDEN' } }

const LEGACY: Turn = {
  kind: 'legacy',
  id: 'l-1',
  at: at(9, 28, 9, 40),
  sha: '0f1e2d3c4b',
  by: { kind: 'agent' },
  title: 'Rewrite the about page intro',
  files: [file('wp-content/themes/bluegum/templates/page-about.html', 'design', 'modified', 14, 9)]
}

const LEGACY_PERSON: Turn = {
  kind: 'legacy',
  id: 'l-2',
  at: at(9, 28, 9, 12),
  sha: '9e8d7c6b5a',
  by: { kind: 'person', ...SAM },
  title: 'Swap the opening hours in the footer',
  files: [file('wp-content/themes/bluegum/parts/footer.html', 'design', 'modified', 2, 2)]
}

/** Fake host: the file's diff in that one moment, `SHA^ → SHA`. Binary files have none. */
const diffOf = (_sha: string, path: string): string =>
  /\.(webp|jpe?g|png)$/.test(path)
    ? ''
    : [
        `--- a/${path}`,
        `+++ b/${path}`,
        '@@ -12,9 +12,16 @@',
        ' .hero {',
        '-  padding: 48px 0 32px;',
        '+  padding: 40px 0 24px;',
        ' }',
        ' .hero__title {',
        '-  font-size: 2rem;',
        '+  font-size: clamp(2.25rem, 7vw, 3.5rem);',
        '+  line-height: 1.05;',
        ' }',
        '+@media (max-width: 600px) {',
        '+  .site-header + .hero {',
        '+    margin-top: 8px;',
        '+  }',
        '+}'
      ].join('\n')

const WP_TRACKED: Activity['coverage']['cmsAdmin'] = { cms: 'WordPress', since: 'Oct 1', hook: 'v1.2' }
const EMDASH_UNTRACKED: Activity['coverage']['cmsAdmin'] = { cms: 'EmDash', since: null }

const activity = (items: Turn[], coverage: Partial<Activity['coverage']> = {}): Activity => ({
  since: { version: 4 },
  counts: {
    chat: items.filter((i) => i.kind === 'chat' || i.kind === 'legacy' || i.kind === 'unknown').length,
    outside: items.filter((i) => i.kind === 'outside' || i.kind === 'outside-cms').length,
    files: new Set(items.flatMap((i) => i.files.map((f) => f.path))).size
  },
  items,
  coverage: { gitTruncated: false, cmsAdmin: WP_TRACKED, ...coverage }
})

const EVERYTHING = activity([
  CMS_EDIT,
  FILES_ONLY,
  CONTENT_ONLY,
  OUTSIDE,
  BOTH,
  DEPLOY,
  UNSEALED,
  CONCURRENT,
  STALE,
  UNKNOWN,
  CONFLICT,
  LEGACY,
  CMS_EDIT_2,
  LEGACY_PERSON
])

// ---------------------------------------------------------------------------------------------
// Frame — the same frame `Pages/In dsh/Site tabs` uses, so the two can be compared side by side.
// ---------------------------------------------------------------------------------------------

function frame(node: ReactNode) {
  return (
    <div className="h-screen overflow-auto bg-background text-foreground">
      <div className="mx-auto max-w-3xl border-border border-x">
        <div className="tracy-site-tabs text-sm">{node}</div>
      </div>
    </div>
  )
}

const tab = (data: Activity, siteKey = SITE) =>
  frame(<SiteChangesTurns siteKey={siteKey} sites={SITES} activity={data} diffOf={diffOf} now={NOW} />)

const meta: Meta = {
  title: 'Mockups/Site changes by chat turn',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

// ---------------------------------------------------------------------------------------------
// Play helpers. Menus and dialogs are portalled to <body>, so they are found there.
// ---------------------------------------------------------------------------------------------

const body = () => within(document.body)

function rowOf(canvasElement: HTMLElement, text: RegExp): HTMLElement {
  const row = within(canvasElement).getByText(text).closest('li')
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${text}`)
  return row
}

async function openRow(canvasElement: HTMLElement, text: RegExp) {
  const row = rowOf(canvasElement, text)
  const toggle = within(row).getAllByRole('button')[0]
  if (!toggle) throw new Error('row has no toggle')
  await userEvent.click(toggle)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  return within(row)
}

async function openMenu(canvasElement: HTMLElement, text: RegExp) {
  await userEvent.click(within(rowOf(canvasElement, text)).getByRole('button', { name: 'More actions' }))
  return body().findByRole('menu')
}

/** Open a row, press its Undo, confirm, and return the dialog once the host's refusal is in. */
async function refusedUndo(canvasElement: HTMLElement, text: RegExp) {
  const row = await openRow(canvasElement, text)
  await userEvent.click(row.getByRole('button', { name: /Undo this moment/ }))
  const dialog = await body().findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: /Undo the moment/ }))
  // Wait for the refusal itself: first "Undoing…", then neither confirm nor working button.
  await waitFor(() =>
    expect(within(dialog).queryByRole('button', { name: /Undo the moment|Undoing/ })).toBeNull()
  )
  return within(dialog)
}

// ---------------------------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------------------------

/** Every kind of row in one list, grouped by day, newest first; the coverage line at the foot. */
export const FullList: Story = {
  name: 'Full list · every kind, by day',
  render: () => tab(EVERYTHING),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const day of ['Oct 1', 'Sep 30', 'Sep 28']) await expect(canvas.getByText(day)).toBeVisible()
    await expect(canvas.getByText('Changes made outside Tracy')).toBeVisible()
    await expect(canvas.getByText('Tracy deploy updated tracy-access.php')).toBeVisible()
    await expect(canvas.getByText('Minh · in WordPress admin')).toBeVisible()
    await expect(canvas.getByText('WordPress admin edits tracked since Oct 1 (hook v1.2)')).toBeVisible()
    // The filter counts come from the server's `counts`; Outside holds both outside forms.
    await userEvent.click(canvas.getByRole('button', { name: /^All/ }))
    const menu = await body().findByRole('menu')
    await expect(within(menu).getByRole('menuitemradio', { name: /Chat/ })).toHaveTextContent('10')
    await expect(within(menu).getByRole('menuitemradio', { name: /Outside/ })).toHaveTextContent('4')
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /Outside/ }))
    await waitFor(() => expect(canvas.queryByText(/Make the hero heading bigger/)).toBeNull())
    await expect(canvas.getByText('Minh · in WordPress admin')).toBeVisible()
    await expect(canvas.getByText('Tracy deploy updated tracy-access.php')).toBeVisible()
  }
}

export const FullListNarrow: Story = {
  name: 'Full list · narrow',
  globals: { viewport: { value: 'mobile', isRotated: false } },
  render: () => tab(EVERYTHING),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /Add a gluten-free section/)
    await expect(row.getByText('Content Tracy wrote')).toBeVisible()
  }
}

export const FullListNarrowDark: Story = {
  name: 'Full list · narrow, dark',
  globals: { theme: 'dark', viewport: { value: 'mobile', isRotated: false } },
  render: () => tab(EVERYTHING),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /Add a gluten-free section/)
    await expect(row.getByText('Files Tracy changed')).toBeVisible()
  }
}

/** Nothing since the last backup: one sentence, Create a backup off, no filter — coverage stays. */
export const Empty: Story = {
  name: 'Empty · nothing since v4',
  render: () => tab(activity([])),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nothing has changed since v4.')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Create a backup/ })).toBeDisabled()
    await expect(canvas.queryByRole('button', { name: /^All/ })).toBeNull()
    await expect(canvas.getByText('WordPress admin edits tracked since Oct 1 (hook v1.2)')).toBeVisible()
  }
}

/** A turn that only changed files: Undo, then the files by zone, 4 first then "+ N more". */
export const FilesOnly: Story = {
  name: 'Chat turn · files only',
  render: () => tab(activity([FILES_ONLY])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /Make the hero heading bigger/)
    await expect(row.getByText('Mai Tran')).toBeVisible()
    await expect(row.getByRole('button', { name: /Undo this moment/ })).toBeEnabled()
    await expect(row.getByText('Files Tracy changed')).toBeVisible()
    await expect(row.queryByText('Content Tracy wrote')).toBeNull()
    await userEvent.click(row.getByRole('button', { name: '+ 2 more' }))
    await expect(row.getByText('wp-includes/version.php')).toBeVisible()
  }
}

/**
 * Pressing a file opens the side card's Diff tab — drawn here as a tab strip, "hero.css · <site>"
 * beside Site changes — with the diff IN THAT MOMENT, labelled "This moment", not "since v4".
 */
export const FileDiffOfTheMoment: Story = {
  name: 'Chat turn · a file opens the Diff tab for that moment',
  render: () => tab(activity([FILES_ONLY])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /Make the hero heading bigger/)
    await userEvent.click(row.getByRole('button', { name: /assets\/css\/hero\.css/ }))
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('tab', { name: /hero\.css · bluegum-bakery/ })).toBeVisible()
    await expect(canvas.getByText('This moment')).toBeVisible()
    await expect(canvas.getByText(/font-size: clamp\(2\.25rem/)).toBeVisible()
    await expect(canvas.queryByText(/since v4/i)).toBeNull()
  }
}

/** A turn that only wrote content: no file block, no Undo, the writes listed. */
export const ContentOnly: Story = {
  name: 'Chat turn · content only',
  render: () => tab(activity([CONTENT_ONLY])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /Change the badge text/)
    await expect(row.getByText('Content Tracy wrote')).toBeVisible()
    await expect(row.getByText('· Home · Hero badge')).toBeVisible()
    await expect(row.queryByRole('button', { name: /Undo this moment/ })).toBeNull()
    await expect(row.queryByText('Files Tracy changed')).toBeNull()
    // The menu keeps Undo in its place, off, and says why.
    const menu = await openMenu(canvasElement, /Change the badge text/)
    await expect(within(menu).getByRole('menuitem', { name: /Undo this moment/ })).toBeDisabled()
  }
}

/** A comment turn that did both, with one write whose outcome is unknown. */
export const FilesAndContent: Story = {
  name: 'Chat turn · files and content (from a comment)',
  render: () => tab(activity([BOTH])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /Add a gluten-free section/)
    await expect(row.getByText(/in a comment on \/menu/)).toBeVisible()
    await expect(row.getByRole('link', { name: /Open comment/ })).toBeVisible()
    await expect(row.getByText('Files Tracy changed')).toBeVisible()
    await expect(row.getByText('Content Tracy wrote')).toBeVisible()
    // `ok: false` is "Outcome unknown" — never "Failed".
    await expect(row.getByText('Outcome unknown')).toBeVisible()
    await expect(row.queryByText(/failed/i)).toBeNull()
  }
}

/** EmDash content changes, reported on `/changed` with the tool's name only, in the same block. */
export const EmDashContent: Story = {
  name: 'Chat turn · EmDash content (tool names only)',
  render: () => tab(activity([EMDASH], { cmsAdmin: EMDASH_UNTRACKED }), EMDASH_SITE),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /new opening hours/)
    await expect(row.getByText('Content Tracy wrote')).toBeVisible()
    await expect(row.getByText('content_update')).toBeVisible()
    await expect(row.getAllByText('EmDash reported a change')).toHaveLength(2)
  }
}

/** The "…" menu of a comment turn: copy the id, open the comment, undo. */
export const RowMenu: Story = {
  name: 'Chat turn · the … menu',
  render: () => tab(activity([BOTH, FILES_ONLY])),
  play: async ({ canvasElement }) => {
    const menu = within(await openMenu(canvasElement, /Add a gluten-free section/))
    await expect(menu.getByRole('menuitem', { name: /Copy the moment id/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Open comment/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Undo this moment/ })).toBeEnabled()
  }
}

/** Outside Tracy, files: no person, the time it was detected, the files when opened, no Undo. */
export const OutsideTracy: Story = {
  name: 'Outside Tracy · files',
  render: () => tab(activity([OUTSIDE])),
  play: async ({ canvasElement }) => {
    // Relative like the running tab; the absolute time is the title a hover reads.
    const when = within(canvasElement).getByText('detected 2h ago')
    await expect(when).toBeVisible()
    await expect(when).toHaveAttribute('title', expect.stringMatching(/Oct 1, 2026/))
    const row = await openRow(canvasElement, /Changes made outside Tracy/)
    await expect(row.getByText(/Tracy can’t tell who/)).toBeVisible()
    await expect(row.getByText('Files changed')).toBeVisible()
    // Tracy did not make this change, so it cannot be undone from here (Brian, 01/10).
    await expect(row.getByText(/Undo isn’t offered/)).toBeVisible()
    await expect(row.queryByRole('button', { name: /Undo this moment/ })).toBeNull()
    const menu = await openMenu(canvasElement, /Changes made outside Tracy/)
    await expect(within(menu).queryByRole('menuitem', { name: /Undo/ })).toBeNull()
  }
}

/** Outside Tracy, files, from Tracy's own deploy: the title says so, no customer name, no Undo. */
export const OutsideTracyDeploy: Story = {
  name: 'Outside Tracy · files from a Tracy deploy',
  render: () => tab(activity([DEPLOY])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /Tracy deploy updated tracy-access\.php/)
    await expect(row.getByText('wp-content/mu-plugins/tracy-access.php')).toBeVisible()
    await expect(row.getByText(/Undo isn’t offered/)).toBeVisible()
    await expect(row.queryByRole('button', { name: /Undo this moment/ })).toBeNull()
    const menu = await openMenu(canvasElement, /Tracy deploy updated/)
    await expect(within(menu).queryByRole('menuitem', { name: /Undo/ })).toBeNull()
  }
}

/** Outside Tracy, CMS admin: the CMS's user (not a Tracy seat), the resources, the CMS's times. */
export const OutsideCmsAdmin: Story = {
  name: 'Outside Tracy · edits in WordPress admin',
  render: () => tab(activity([CMS_EDIT, CMS_EDIT_2])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /Minh · in WordPress admin/)
    await expect(row.getByText('Edits in WordPress admin')).toBeVisible()
    await expect(row.getByText('About us')).toBeVisible()
    await expect(row.getByText(/Minh is a WordPress user, not a member of this site on Tracy/)).toBeVisible()
    await expect(row.queryByRole('button', { name: /Undo/ })).toBeNull()
    await expect(row.queryByRole('button', { name: 'More actions' })).toBeNull()
  }
}

/** Sealing at the start of the turn failed: the files may include earlier edits, and it says so. */
export const UnsealedStart: Story = {
  name: 'Chat turn · may include files from before (unsealedStart)',
  render: () => tab(activity([UNSEALED])),
  play: async ({ canvasElement }) => {
    await expect(
      within(rowOf(canvasElement, /Fix the footer wrapping/)).getByLabelText('Check this turn')
    ).toBeVisible()
    const row = await openRow(canvasElement, /Fix the footer wrapping/)
    await expect(row.getByText('May include files changed before this turn.')).toBeVisible()
  }
}

/** Another conversation had a turn open on the site at the same time. */
export const Concurrent: Story = {
  name: 'Chat turn · another conversation open at the same time (concurrent)',
  render: () => tab(activity([CONCURRENT])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /contact form button/)
    await expect(row.getByText(/Another conversation was open on this site during this turn/)).toBeVisible()
  }
}

/** dsh died mid-turn: the turn opened and never closed. */
export const Stale: Story = {
  name: 'Chat turn · did not finish recording (stale)',
  render: () => tab(activity([STALE])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /Translate the about page/)
    await expect(row.getByText(/This turn did not finish recording/)).toBeVisible()
  }
}

/** Content writes with an actor and no turn record: titled by the action, no typed words. */
export const UnknownTurn: Story = {
  name: 'Unknown turn · writes with no turn record',
  render: () => tab(activity([UNKNOWN])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /^Wrote page content$/)
    await expect(row.getByText(/Tracy has no record of what was typed/)).toBeVisible()
    await expect(row.getByText('Outcome unknown')).toBeVisible()
  }
}

/** Undo refused with 409: a file of the moment changed after it, so nothing was written. */
export const UndoRefusedConflict: Story = {
  name: 'Undo refused · 409, files changed since',
  render: () => tab(activity([CONFLICT])),
  play: async ({ canvasElement }) => {
    const dialog = await refusedUndo(canvasElement, /Use the darker brown/)
    await expect(dialog.getByText(/Can’t undo/)).toBeVisible()
    await expect(dialog.getByText('wp-content/themes/bluegum/theme.json')).toBeVisible()
    // The footer's Close (the dialog's own × is also named Close, hence the selector).
    await expect(dialog.getByText('Close', { selector: 'button' })).toBeVisible()
  }
}

/** Undo refused with 403: the viewer's seat cannot change files on this site. */
export const UndoRefusedForbidden: Story = {
  name: 'Undo refused · 403, no right to change files',
  render: () => tab(activity([FORBIDDEN])),
  play: async ({ canvasElement }) => {
    const dialog = await refusedUndo(canvasElement, /Use the darker brown/)
    await expect(dialog.getByText('You can’t undo changes on this site')).toBeVisible()
    await expect(dialog.queryByRole('list')).toBeNull()
  }
}

/** The Git cap was hit: the foot says older history is not shown, beside the admin line. */
export const OlderNotShown: Story = {
  name: 'Coverage · older history not shown (cap reached)',
  render: () => tab(activity([FILES_ONLY, OUTSIDE, LEGACY], { gitTruncated: true })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Older history not shown')).toBeVisible()
    await expect(canvas.getByText('WordPress admin edits tracked since Oct 1 (hook v1.2)')).toBeVisible()
  }
}

/** A site whose CMS has no admin hook yet: the foot says its admin edits are not tracked. */
export const CoverageNotTracked: Story = {
  name: 'Coverage · EmDash admin edits not tracked yet',
  render: () => tab(activity([EMDASH], { cmsAdmin: EMDASH_UNTRACKED }), EMDASH_SITE),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('EmDash admin edits not tracked yet on this site')
    ).toBeVisible()
  }
}

/** Moments from before turns existed: drawn as today, with their old author. */
export const Legacy: Story = {
  name: 'Legacy moments · before chat turns',
  render: () => tab(activity([LEGACY, LEGACY_PERSON])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, /Rewrite the about page intro/)
    await expect(row.getByText(/content writes aren’t listed/)).toBeVisible()
    await expect(row.getByText('Files changed')).toBeVisible()
  }
}
