/**
 * THE QUESTION THIS MOCK EXISTS TO ANSWER (Brian, 02/10, ADR 0024): with backups as the milestones
 * of Site changes, does each point say plainly what it can put back (`Full backup`, `File backup
 * (no database)`, `Content backup`, `DB ✗`), do the two restore scopes read as two different risks,
 * does `Create a backup` stay short, and does the first point read as the site as built — while the
 * four columns never move and a backup is counted under no Type?
 *
 * Brian 03/10/2026 changed three things, drawn here as the product now ships them:
 *   - ONE `Restore…` per backup (was `Restore files…` beside a heavy `Restore everything…`). Its
 *     dialog chooses the scope: `Everything` (selected first; the heavy content — what is deleted,
 *     a "Before restore" backup first, type the site name) or `Files only` (with the warning that
 *     images uploaded since are removed). A point that can only put files back shows
 *     `Restore: Files only`, the warning and why. EmDash keeps one `Restore content…`.
 *   - `Create a backup` lost its description, its "files and database are both kept" line, the
 *     title placeholder and hint: the title is suggested as text with a small `Change`.
 *   - The `Source` column and filter read `Type`; a backup's Type cell reads `Backup`.
 *
 * Grown from `Mockups/Site changes V2` (`./site-changes-v2.tsx`), which this file does not change.
 *
 * ⚠ MODE A. A proposal: nothing here ships. Port per DESIGN.md §0, then delete this file.
 *
 * ⚠ ILLUSTRATIVE DATA ONLY. Every person, site, account, path, commit, backup and request below
 * is made up (`*.example` sites, `@example.com` people), continuing the V2 fixtures. No customer
 * record was copied.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import {
  type ActivityMerged,
  type BackupMark,
  isBackup,
  SiteChangesBackup,
  type TimelineItem
} from './site-changes-backup'
import { type ChangeEvent, type FileChange, type SourceKind, SOURCES } from './site-changes-v2'
// ---------------------------------------------------------------------------------------------
// Fixtures — illustrative only. A fixed clock so day groups and "ago" never move.
// ---------------------------------------------------------------------------------------------

const WP_SITE = 'bluegum-bakery.example'
const EM_SITE = 'harbour-yoga.example'
const SITES = [
  { siteKey: WP_SITE, role: 'owner' },
  { siteKey: EM_SITE, role: 'editor' }
]
const MAI = { name: 'Mai Tran', email: 'mai.tran@example.com' }
const SAM = { name: 'Sam Ortiz', email: 'sam.ortiz@example.com' }
const JO = { name: 'Jo Reyes', email: 'jo.reyes@example.com' }
const seat = (p: { name: string; email: string }) => ({ kind: 'seat' as const, ...p })

const at = (month: number, day: number, h: number, m: number): number =>
  Math.floor(new Date(2026, month - 1, day, h, m).getTime() / 1000)
const NOW = at(10, 1, 16, 44) * 1000

const file = (path: string, zone: string, status: FileChange['status'] = 'modified'): FileChange => ({
  path,
  zone,
  status,
  additions: 4,
  deletions: 2
})
const css = (name: string) => file(`wp-content/themes/bluegum/assets/css/${name}.css`, 'design')

const base = {
  content: [],
  settings: [],
  other: [],
  moments: [],
  technical: [],
  undo: { allowed: false, reason: 'not-tracy' as const }
} satisfies Partial<ChangeEvent>

const ev = (e: Omit<ChangeEvent, keyof typeof base> & Partial<ChangeEvent>): ChangeEvent => ({
  ...base,
  ...e
})

const MINH = { kind: 'cms' as const, cms: 'WordPress' as const, name: 'minh', id: '7' }

// After v3 (Oct 1, 12:30).
const CMS_1 = ev({
  id: 'e-cms-1',
  source: 'cms-admin',
  by: MINH,
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated “About us”' },
  time: { basis: 'occurred', at: at(10, 1, 16, 40) },
  content: [{ op: 'Updated', type: 'page', id: '12', title: 'About us', outcome: 'ok' }]
})
const CMS_2 = ev({
  id: 'e-cms-2',
  source: 'cms-admin',
  by: MINH,
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated setting “Site tagline”' },
  time: { basis: 'occurred', at: at(10, 1, 16, 37) },
  settings: [{ op: 'Updated', type: 'setting', id: 'blogdescription', title: 'Site tagline', outcome: 'ok' }]
})
const CHAT_BOTH = ev({
  id: 'e-chat-both',
  source: 'chat',
  by: seat(MAI),
  appliedBy: 'Tracy',
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated 1 page and 2 files' },
  time: { basis: 'occurred', at: at(10, 1, 15, 10) },
  request: {
    text: 'Make the About us heading say “Baked fresh since 1998” and tighten the hero spacing on phones',
    completeness: 'complete'
  },
  content: [{ op: 'Updated', type: 'page', id: '12', title: 'About us', outcome: 'ok' }],
  moments: [{ sha: '7c1e0a94d2b8', files: [css('hero'), css('header')] }],
  undo: { allowed: true }
})
const UNKNOWN = ev({
  id: 'e-unknown',
  source: 'unknown',
  by: { kind: 'unknown' },
  cms: 'WordPress',
  description: { kind: 'result', text: 'Files changed; source unknown' },
  time: { basis: 'detected', at: at(10, 1, 14, 2) },
  moments: [
    {
      sha: 'b3b95427e1aa',
      files: [
        file('wp-content/plugins/contact-form-7/wp-contact-form-7.php', 'addons'),
        file('wp-content/uploads/2026/10/team-photo.jpg', 'content', 'added')
      ]
    }
  ]
})
// Between v2 (Sep 29, 18:00) and v3.
const COMMENT = ev({
  id: 'e-comment',
  source: 'comment',
  by: seat(SAM),
  appliedBy: 'Tracy',
  cms: 'WordPress',
  comment: { where: '/menu/', href: '#comment-482', author: JO },
  description: { kind: 'result', text: 'Updated “Menu”' },
  time: { basis: 'occurred', at: at(10, 1, 11, 48) },
  request: {
    text: 'Add the three new gluten-free loaves under “Breads”, with prices',
    completeness: 'complete'
  },
  content: [{ op: 'Updated', type: 'page', id: '31', title: 'Menu', outcome: 'ok' }],
  undo: { allowed: false, reason: 'no-files' }
})
const AUTOMATIC = ev({
  id: 'e-auto',
  source: 'automatic',
  by: { kind: 'service', name: 'WordPress', detail: 'automatic update (WP-Cron)' },
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated Contact Form 7: 5.9.8 → 5.9.9' },
  time: { basis: 'occurred', at: at(10, 1, 3, 12) },
  other: [{ op: 'Updated', type: 'plugin', id: 'contact-form-7', title: 'Contact Form 7', outcome: 'ok' }]
})
const DEPLOY = ev({
  id: 'e-deploy',
  source: 'deployment',
  by: { kind: 'service', name: 'Tracy deploy' },
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated Claude Cowork: 0.20.0 → 0.20.2' },
  time: { basis: 'occurred', at: at(9, 30, 22, 15) },
  moments: [
    { sha: 'e01d3c9a5577', files: [file('wp-content/plugins/claude-cowork/claude-cowork.php', 'addons')] }
  ]
})
const TRUNCATED = ev({
  id: 'e-truncated',
  source: 'chat',
  by: seat(JO),
  appliedBy: 'Tracy',
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated “Pricing”' },
  time: { basis: 'occurred', at: at(9, 30, 16, 20) },
  request: {
    text: 'On the pricing page, change the wholesale table so the 10 kg sourdough row says $48',
    completeness: 'incomplete'
  },
  content: [{ op: 'Updated', type: 'page', id: '44', title: 'Pricing', outcome: 'ok' }],
  undo: { allowed: false, reason: 'no-files' }
})
const PARTLY = ev({
  id: 'e-partly',
  source: 'chat',
  by: seat(MAI),
  appliedBy: 'Tracy',
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated 1 page and 1 file' },
  time: { basis: 'occurred', at: at(9, 30, 10, 5) },
  request: {
    text: 'Put “Closed on Mondays” in the footer and make the footer text darker',
    completeness: 'complete'
  },
  content: [{ op: 'Updated', type: 'page', id: '9', title: 'Footer notice', outcome: 'ok' }],
  moments: [{ sha: '1a2b3c4d5e6f', files: [css('footer')], undoneBy: 'e-undo-partly' }],
  undo: { allowed: true }
})
const UNDO_PARTLY = ev({
  id: 'e-undo-partly',
  source: 'site-changes',
  by: seat(SAM),
  cms: 'WordPress',
  description: { kind: 'result', text: 'Undid changes to 1 file' },
  time: { basis: 'occurred', at: at(9, 30, 10, 31) },
  target: { eventId: 'e-partly', sha: '1a2b3c4d5e6f', files: 1 },
  moments: [{ sha: '9d9e0f1a2b3c', files: [css('footer')] }]
})
// Between v1 (Sep 28, 08:30) and v2.
const UNDO_FILES = ev({
  ...UNDO_PARTLY,
  id: 'e-undo-files',
  by: seat(JO),
  description: { kind: 'result', text: 'Undid changes to 2 files' },
  time: { basis: 'occurred', at: at(9, 29, 17, 20) },
  target: { eventId: 'e-files-undone', sha: '6a7b8c9d0e1f', files: 2 },
  moments: [{ sha: '2c3d4e5f6a7b', files: [css('forms'), css('buttons')] }]
})
const FILES_UNDONE = ev({
  id: 'e-files-undone',
  source: 'chat',
  by: seat(SAM),
  appliedBy: 'Tracy',
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated 2 files' },
  time: { basis: 'occurred', at: at(9, 29, 15, 2) },
  request: { text: 'Make the contact form button match the brand brown', completeness: 'complete' },
  moments: [{ sha: '6a7b8c9d0e1f', files: [css('forms'), css('buttons')], undoneBy: 'e-undo-files' }],
  undo: { allowed: true }
})
const MULTI = ev({
  id: 'e-multi',
  source: 'chat',
  by: seat(MAI),
  appliedBy: 'Tracy',
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated 3 files' },
  time: { basis: 'occurred', at: at(9, 29, 11, 15) },
  request: {
    text: 'Fix the footer wrapping at 1100px, then make the buttons rounder',
    completeness: 'complete'
  },
  moments: [
    { sha: 'c1c1c1a0b0e0', files: [css('footer')] },
    { sha: 'c2c2c2a0b0e0', files: [css('buttons'), file('wp-content/themes/bluegum/theme.json', 'design')] }
  ],
  undo: { allowed: true }
})
const LEGACY = ev({
  id: 'e-legacy',
  source: 'chat',
  by: { kind: 'unknown' },
  cms: 'WordPress',
  description: {
    kind: 'request',
    text: 'Rewrite the about page intro so it mentions the morning bake and the family'
  },
  time: { basis: 'occurred', at: at(9, 28, 9, 40) },
  request: {
    text: 'Rewrite the about page intro so it mentions the morning bake and the family',
    completeness: 'unknown'
  },
  moments: [
    { sha: '0f1e2d3c4b5a', files: [file('wp-content/themes/bluegum/templates/page-about.html', 'design')] }
  ],
  undo: { allowed: true }
})

const backup = (
  b: Omit<BackupMark, 'kind' | 'id' | 'cms' | 'capability'> & Partial<BackupMark>
): BackupMark => ({
  kind: 'backup',
  id: `b-${b.number}`,
  cms: 'WordPress',
  capability: 'full',
  ...b
})

const DB = (sha: string) => ({
  engine: 'mariadb',
  size: '1.9 MB',
  sha256: `${sha}${'0'.repeat(64 - sha.length)}`
})

/**
 * bluegum-bakery was built before ADR 0024: its first two points keep files only. Backup 3 was made
 * after, so it is a Full backup.
 */
const B3 = backup({
  number: 3,
  title: 'Menu and About us refresh',
  notes:
    'New gluten-free loaves on the Menu, with prices.\nPricing table updated for wholesale.\nFooter says “Closed on Mondays”.\nClaude Cowork updated to 0.20.2.',
  sha: 'a3f09b1c77d2',
  at: at(10, 1, 12, 30),
  by: seat(MAI),
  since: { number: 2, files: 9 },
  database: DB('9be41c07d5aa')
})
const B2 = backup({
  number: 2,
  title: 'Footer and buttons',
  notes: 'Footer no longer wraps at 1100px. Rounder buttons; contact button back to its old colour.',
  sha: '5e6d7c8b9a01',
  at: at(9, 29, 18, 0),
  by: seat(SAM),
  capability: 'files-only',
  since: { number: 1, files: 5 }
})
const B1_OLD = backup({
  number: 1,
  title: null,
  notes: null,
  sha: '0a0b0c0d0e0f',
  at: at(9, 28, 8, 30),
  by: { kind: 'service', name: 'Tracy', detail: 'site setup' },
  capability: 'files-only',
  initial: true,
  since: { number: null, files: 214 }
})
/** Backup 3 again, but its database copy is gone (or its hash does not match). */
const B3_MISSING: BackupMark = { ...B3, capability: 'db-missing' }

const WP_EVENTS: TimelineItem[] = [
  CMS_1,
  CMS_2,
  CHAT_BOTH,
  UNKNOWN,
  COMMENT,
  AUTOMATIC,
  DEPLOY,
  TRUNCATED,
  UNDO_PARTLY,
  PARTLY,
  UNDO_FILES,
  FILES_UNDONE,
  MULTI,
  LEGACY
]
const WP_ITEMS: TimelineItem[] = [...WP_EVENTS, B3, B2, B1_OLD]

/** A site built after ADR 0024: its first point is a Full backup — the site as handed over. */
const NEW_SITE = 'fernhill-books.example'
const NB1 = backup({
  number: 1,
  title: null,
  notes: null,
  sha: '11aa22bb33cc',
  at: at(9, 30, 11, 2),
  by: { kind: 'service', name: 'Tracy', detail: 'site setup' },
  initial: true,
  since: { number: null, files: 1840 },
  database: DB('4c1d9e0f7a21')
})
const NEW_EVENTS: TimelineItem[] = [
  ev({
    id: 'n-chat',
    source: 'chat',
    by: seat(MAI),
    appliedBy: 'Tracy',
    cms: 'WordPress',
    description: { kind: 'result', text: 'Updated “Home”' },
    time: { basis: 'occurred', at: at(10, 1, 9, 15) },
    request: { text: 'Put this week’s author reading at the top of the home page', completeness: 'complete' },
    content: [{ op: 'Updated', type: 'page', id: '2', title: 'Home', outcome: 'ok' }]
  }),
  ev({
    id: 'n-admin',
    source: 'cms-admin',
    by: { kind: 'cms', cms: 'WordPress', name: 'ana', id: '3' },
    cms: 'WordPress',
    description: { kind: 'result', text: 'Created “Events”' },
    time: { basis: 'occurred', at: at(9, 30, 15, 40) },
    content: [{ op: 'Created', type: 'page', id: '18', title: 'Events', outcome: 'ok' }]
  }),
  NB1
]

// EmDash: database + media, no file history.
const EM_CHAT = ev({
  id: 'e-em-chat',
  source: 'chat',
  by: seat(JO),
  appliedBy: 'Tracy',
  cms: 'EmDash',
  description: { kind: 'result', text: 'Updated “Contact”' },
  time: { basis: 'occurred', at: at(10, 1, 10, 22) },
  request: { text: 'Put the new opening hours on the contact page', completeness: 'complete' },
  content: [{ op: 'Updated', type: 'page', id: 'contact', title: 'Contact', outcome: 'ok' }],
  moments: null,
  tracking: { files: 'untracked', settings: 'untracked', media: 'untracked' },
  undo: { allowed: false, reason: 'untracked' }
})
const EM_ADMIN = ev({
  id: 'e-em-admin',
  source: 'cms-admin',
  by: { kind: 'cms', cms: 'EmDash', name: 'lena', id: 'usr_3' },
  cms: 'EmDash',
  description: { kind: 'result', text: 'Published “Autumn retreat”' },
  time: { basis: 'occurred', at: at(9, 30, 18, 0) },
  content: [{ op: 'Published', type: 'post', id: 'autumn-retreat', title: 'Autumn retreat', outcome: 'ok' }],
  moments: null,
  tracking: { files: 'untracked' },
  undo: { allowed: false, reason: 'untracked' }
})
const EM_B2 = backup({
  number: 2,
  title: 'Autumn timetable',
  notes: 'Autumn retreat published.\nClass times moved to the new studio hours.',
  sha: 'em0000000002',
  at: at(9, 30, 19, 10),
  by: seat(JO),
  cms: 'EmDash',
  capability: 'content',
  since: { number: 1, files: null },
  database: { engine: 'sqlite', size: '5.5 MB', sha256: 'e5d4c3b2a190'.padEnd(64, '0') }
})
const EM_B1 = backup({
  number: 1,
  title: null,
  notes: null,
  sha: 'em0000000001',
  at: at(9, 20, 9, 0),
  by: { kind: 'service', name: 'Tracy', detail: 'site setup' },
  cms: 'EmDash',
  capability: 'content',
  initial: true,
  since: { number: null, files: null }
})

/** Events per Type. A backup is counted under no Type, so it is in no count and not in the total. */
const countBySource = (items: TimelineItem[]): Record<SourceKind, number> =>
  Object.fromEntries(
    SOURCES.map((s) => [s, items.filter((i) => !isBackup(i) && i.source === s).length])
  ) as Record<SourceKind, number>

const wp = (items: TimelineItem[]): ActivityMerged => ({
  counts: { bySource: countBySource(items), complete: true },
  items,
  coverage: { cms: 'WordPress', gitTruncated: false, cmsAdmin: { since: 'Sep 12, 2026' } }
})
const em = (items: TimelineItem[]): ActivityMerged => ({
  counts: { bySource: countBySource(items), complete: true },
  items,
  coverage: { cms: 'EmDash', gitTruncated: false, emdashLimits: true, cmsAdmin: { since: 'Sep 20, 2026' } }
})

/** What the tab drafts for the next backup: Tracy's turns by title, then site edits by zone. */
const DRAFT = [
  '· Make the About us heading say “Baked fresh since 1998” and tighten the hero spacing on phones',
  'Design',
  '· 2 files changed on the site outside Tracy',
  'Media & language files',
  '· 3 files changed on the site outside Tracy'
].join('\n')

// ---------------------------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------------------------

function frame(node: ReactNode, width?: number) {
  return (
    <div className="h-screen overflow-auto bg-background text-foreground" data-scroller>
      <div
        className={width ? 'border-border border-x' : 'mx-auto max-w-3xl border-border border-x'}
        style={width ? { width } : undefined}
        data-pane
      >
        <div className="tracy-site-tabs text-sm">{node}</div>
      </div>
    </div>
  )
}

const tab = (
  data: ActivityMerged,
  opts: { siteKey?: string; width?: number; open?: string[]; filter?: SourceKind | 'all' } = {}
) =>
  frame(
    <SiteChangesBackup
      siteKey={opts.siteKey ?? WP_SITE}
      sites={[...SITES, { siteKey: NEW_SITE, role: 'owner' }]}
      activity={data}
      viewer={SAM}
      now={NOW}
      initialOpen={opts.open}
      initialFilter={opts.filter}
      draft={DRAFT}
    />,
    opts.width
  )

const meta: Meta = {
  title: 'Mockups/Site changes Backup',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

// ---------------------------------------------------------------------------------------------
// Play helpers. Menus and dialogs are portalled to <body>.
// ---------------------------------------------------------------------------------------------

const body = () => within(document.body)

function el(root: HTMLElement, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector)
  if (!found) throw new Error(`nothing at ${selector}`)
  return found
}
const toggleOf = (row: HTMLElement): HTMLElement => el(row, 'button[aria-expanded]')
const box = (node: Element | null) => {
  if (!node) throw new Error('missing cell')
  const r = node.getBoundingClientRect()
  return { left: Math.round(r.left), top: Math.round(r.top) }
}
/** The cells, and the visible things inside them: a cell can keep its box while its text moves. */
const cells = (row: HTMLElement) => ({
  description: box(row.querySelector('[data-cell="description"]')).left,
  time: box(row.querySelector('[data-cell="time"]')),
  source: box(row.querySelector('[data-cell="source"]')),
  by: box(row.querySelector('[data-cell="by"]')),
  timeText: box(row.querySelector('[data-cell="time"] time')),
  sourceIcon: box(row.querySelector('[data-cell="source"] svg')),
  byText: box(row.querySelector('[data-cell="by"] > span:last-child'))
})
/** The preview's kind banner mounts late and moves everything 28px: measure a still layout. */
async function settledCells(row: HTMLElement) {
  let last = JSON.stringify(cells(row))
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 100))
    const now = JSON.stringify(cells(row))
    if (now === last) return cells(row)
    last = now
  }
  throw new Error('layout never settled')
}

// ---------------------------------------------------------------------------------------------
// 1. The list
// ---------------------------------------------------------------------------------------------

/** Three backups among the events: two old file-only points, one Full; none is counted under a Type. */
export const MergedList: Story = {
  name: 'List · three backups among the events',
  render: () => tab(wp(WP_ITEMS)),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('14 recorded events')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Create a backup/ })).toBeEnabled()
    await expect(canvasElement.querySelectorAll('[data-backup]').length).toBe(3)
    const b3 = el(canvasElement, '[data-backup="3"]')
    await expect(el(b3, '[data-name]')).toHaveTextContent('Backup 3 · Menu and About us refresh')
    await expect(el(b3, '[data-capability]')).toHaveTextContent('Full backup')
    // Every change recorded since Backup 2, not only files (Brian 03/10); the file count is in the detail.
    await expect(el(b3, '[data-scope]')).toHaveTextContent('Full backup6 changes since Backup 2')
    await expect(el(canvasElement, '[data-backup="2"] [data-capability]')).toHaveTextContent(
      'File backup (no database)'
    )
    const b1 = el(canvasElement, '[data-backup="1"]')
    await expect(el(b1, '[data-name]')).toHaveTextContent('Initial backup — site as built')
    await expect(el(b1, '[data-capability]')).toHaveTextContent('File backup (no database)')
    // A milestone's Type cell: the archive mark and the word Backup (its label is for narrow panes).
    const src = el(b3, '[data-cell="source"]')
    await expect(src.textContent).toBe('TypeBackup')
    await expect(src.querySelector('svg')).not.toBeNull()
    // No word "release" anywhere a customer reads.
    await expect(canvasElement.textContent).not.toMatch(/release/i)
    // Restore counts the 2 undos only, never a backup.
    await userEvent.click(canvas.getByRole('button', { name: 'Type: All' }))
    const menu = within(await body().findByRole('menu'))
    await expect(menu.getByRole('menuitemradio', { name: /Restore/ })).toHaveTextContent('2')
    await expect(menu.getByRole('menuitemradio', { name: /^All/ })).toHaveTextContent('14')
    await userEvent.keyboard('{Escape}')
  }
}

export const MergedListDark: Story = {
  name: 'List · dark',
  globals: { theme: 'dark' },
  render: () => tab(wp(WP_ITEMS))
}

/** Opening and closing a milestone moves none of its cells, nor the text and icons inside them. */
export const MilestoneColumnsStayPut: Story = {
  name: 'List · open and close a backup, columns stay put',
  render: () => tab(wp(WP_ITEMS)),
  play: async ({ canvasElement }) => {
    const b3 = el(canvasElement, '[data-backup="3"]')
    const event = el(canvasElement, '[data-event="e-comment"]')
    const before = await settledCells(b3)
    await expect(before.time.left).toBe(box(canvasElement.querySelector('[data-col="time"]')).left)
    await expect(before.source.left).toBe(box(canvasElement.querySelector('[data-col="source"]')).left)
    await expect(before.by.left).toBe(box(canvasElement.querySelector('[data-col="by"]')).left)
    const ev = cells(event)
    await expect(before.description).toBe(ev.description)
    await expect(before.time.left).toBe(ev.time.left)
    await userEvent.click(toggleOf(b3))
    await expect(toggleOf(b3)).toHaveAttribute('aria-expanded', 'true')
    await expect(await settledCells(b3)).toEqual(before)
    const order = [...b3.querySelectorAll('[data-block]')].map((b) => b.getAttribute('data-block'))
    await expect(order).toEqual(['notes', 'identity', 'keeps', 'files', 'technical', 'actions'])
    await userEvent.click(toggleOf(b3))
    await expect(await settledCells(b3)).toEqual(before)
    await expect(b3.querySelector('[data-detail]')).toBeNull()
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Create a backup
// ---------------------------------------------------------------------------------------------

/**
 * The dialog: number and site, the title field holding the date and time behind a fixed "Backup 4 ·",
 * drafted notes by zone. Since Brian 03/10 there is no description, no "what is kept" line, no title
 * placeholder and no hint.
 */
export const CreateBackup: Story = {
  name: 'Create · dialog open, suggested title',
  render: () => tab(wp(WP_ITEMS)),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Create a backup/ }))
    const dialog = within(await body().findByRole('dialog'))
    await expect(dialog.getByText('Create backup 4 of bluegum-bakery.example')).toBeVisible()
    await expect(dialog.getByText('Backup title')).toBeVisible()
    await expect(el(document.body, '[role="dialog"] [data-title-prefix]')).toHaveTextContent('Backup 4 ·')
    await expect(dialog.getByRole('textbox', { name: 'Backup title' })).toHaveValue('Oct 1, 2026, 16:44')
    await expect(dialog.queryByRole('button', { name: 'Edit' })).toBeNull()
    await expect(dialog.queryByText(/Saves the site|both kept|Left blank/)).toBeNull()
    // ADR §4: the files zone reads "Media & language files"; "Content" is never a zone label.
    const notes = dialog.getByLabelText('Backup notes') as HTMLTextAreaElement
    await expect(notes.value).toMatch(/^Media & language files$/m)
    await expect(notes.value).not.toMatch(/^Content$/m)
    await expect(dialog.getByText('Drafted from the 4 changes since Backup 3. Edit freely.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Create backup' })).toBeEnabled()
  }
}

/** Pressing Create with the suggested title: a new Full backup lands on top, named by its date and time. */
export const CreateBackupDone: Story = {
  name: 'Create · suggested title kept, named by date and time',
  render: () => tab(wp(WP_ITEMS)),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Create a backup/ }))
    const dialog = within(await body().findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Create backup' }))
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull())
    const b4 = el(canvasElement, '[data-backup="4"]')
    await expect(el(b4, '[data-name]')).toHaveTextContent(/^Backup 4 · Oct 1, 2026, 16:44$/)
    await expect(el(b4, '[data-capability]')).toHaveTextContent('Full backup')
    // Nothing recorded since Backup 4, and Create stays live (the database changes without a row).
    await expect(within(canvasElement).getByRole('button', { name: /Create a backup/ })).toBeEnabled()
    await expect(within(canvasElement).getByText('14 recorded events')).toBeVisible()
  }
}

/** A typed title: stored once, after the fixed number — the list reads "Backup 4 · <title>", never twice. */
export const CreateBackupTitled: Story = {
  name: 'Create · a title typed',
  render: () => tab(wp(WP_ITEMS)),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Create a backup/ }))
    const dialog = within(await body().findByRole('dialog'))
    const field = dialog.getByRole('textbox', { name: 'Backup title' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Before the winter menu')
    await userEvent.click(dialog.getByRole('button', { name: 'Create backup' }))
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull())
    await expect(el(canvasElement, '[data-backup="4"] [data-name]')).toHaveTextContent(
      /^Backup 4 · Before the winter menu$/
    )
  }
}

// ---------------------------------------------------------------------------------------------
// 3. An opened backup and its one Restore…
// ---------------------------------------------------------------------------------------------

/**
 * Backup 3 open: what it keeps, files since Backup 2, ONE Restore…. Its dialog opens on Everything;
 * choosing Files only swaps in the files content, with the uploads warning, in the same window.
 */
export const BackupOpen: Story = {
  name: 'Backup · Full backup opened, one Restore…',
  render: () => tab(wp(WP_ITEMS), { open: ['b-3'] }),
  play: async ({ canvasElement }) => {
    const b3 = el(canvasElement, '[data-backup="3"]')
    const row = within(b3)
    await expect(row.getByText(/Claude Cowork updated to 0\.20\.2/)).toBeVisible()
    await expect(row.getByText(/Backed up by/)).toHaveTextContent('Backed up by Mai Tran')
    await expect(el(b3, '[data-keeps]')).toHaveTextContent(/Files and the site’s database/)
    await expect(el(b3, '[data-files-since]')).toHaveTextContent('9 files changed since Backup 2')
    await expect(row.getByRole('button', { name: 'Restore…' })).toHaveAttribute('data-restore', 'backup')
    await expect(row.queryByRole('button', { name: /Restore files|Restore everything/ })).toBeNull()
    // The machine tag lives in Technical details only.
    await expect(el(b3, '[data-block="technical"]')).toHaveTextContent('tracy-release/v3')
    await expect(el(b3, '[data-block="actions"]')).not.toHaveTextContent(/tag/i)
    await userEvent.click(row.getByRole('button', { name: 'Restore…' }))
    const dialog = within(await body().findByRole('dialog'))
    const scopes = within(dialog.getByRole('radiogroup', { name: 'Restore' }))
    await expect(scopes.getByRole('radio', { name: 'Everything' })).toBeChecked()
    // Files only says what it breaks.
    const files = scopes.getByRole('radio', { name: /Files only/ })
    await expect(files).not.toBeChecked()
    await expect(el(document.body, '[data-scope-option="files"] [data-scope-warning]')).toHaveTextContent(
      'Images uploaded after this backup are removed; posts that use them will show broken images.'
    )
    // Files only: the files-only words, "release" now "backup", in the same dialog.
    await userEvent.click(files)
    // The content (and the scope step inside it) is swapped, so read the dialog again.
    const swapped = within(await body().findByRole('dialog'))
    await waitFor(() => expect(swapped.getByRole('radio', { name: /Files only/ })).toBeChecked())
    await expect(
      swapped.getByText(
        'Put the files of bluegum-bakery.example back to Backup 3 · Menu and About us refresh?'
      )
    ).toBeVisible()
    await expect(swapped.getByText(/Content and settings kept in the database are not changed/)).toBeVisible()
    await expect(swapped.getByRole('button', { name: 'Restore the files' })).toBeEnabled()
    await expect(swapped.queryByLabelText(/to confirm/)).toBeNull()
    await expect(body().getAllByRole('dialog').length).toBe(1)
    await userEvent.click(swapped.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull())
  }
}

const openEverything = async (canvasElement: HTMLElement) => {
  const b3 = el(canvasElement, '[data-backup="3"]')
  await userEvent.click(within(b3).getByRole('button', { name: 'Restore…' }))
  return within(await body().findByRole('dialog'))
}

/** Everything, selected first: what is deleted, the Before restore backup, no press until the word Restore is typed. */
export const RestoreEverything: Story = {
  name: 'Restore everything · dialog, locked until Restore is typed',
  render: () => tab(wp(WP_ITEMS), { open: ['b-3'] }),
  play: async ({ canvasElement }) => {
    const dialog = await openEverything(canvasElement)
    await expect(dialog.getByRole('radio', { name: 'Everything' })).toBeChecked()
    await expect(
      dialog.getByText(
        'Restore everything on bluegum-bakery.example to Backup 3 · Menu and About us refresh?'
      )
    ).toBeVisible()
    await expect(dialog.getByText(/Everything saved on the site after .* is deleted:/)).toBeVisible()
    for (const lost of ['Posts and pages', 'Orders', 'Form entries', 'Users', 'Comments', 'Settings'])
      await expect(dialog.getByText(lost)).toBeVisible()
    await expect(dialog.getByText(/“Before restore” backup first/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    const confirm = dialog.getByRole('button', { name: 'Restore everything' })
    const field = dialog.getByLabelText('Type “Restore” to confirm')
    await expect(field).toHaveAttribute('placeholder', 'Restore')
    // Locked: empty, then the site address (no longer the word), then a near miss; any case opens it.
    await expect(confirm).toBeDisabled()
    await userEvent.type(field, 'bluegum-bakery.example')
    await expect(confirm).toBeDisabled()
    await userEvent.clear(field)
    await userEvent.type(field, 'Restor')
    await expect(confirm).toBeDisabled()
    await userEvent.clear(field)
    await userEvent.type(field, 'restore')
    await expect(confirm).toBeEnabled()
  }
}

/**
 * Confirmed: the restore event, By the person who pressed, carries its own Before-restore backup —
 * "Return point: Backup 4" — instead of a Backup 4 row above it (Brian 03/10: drawn by time it read as
 * "backed up after restoring"). Its Restore Backup 4… opens the normal restore dialog: undoing the
 * restore is one press away. Jump to backup still lists Backup 4 and lands on the restore row.
 */
export const RestoreEverythingDone: Story = {
  name: 'Restore everything · done, the return point on the restore row',
  render: () => tab(wp(WP_ITEMS), { open: ['b-3'] }),
  play: async ({ canvasElement }) => {
    const dialog = await openEverything(canvasElement)
    await userEvent.type(dialog.getByLabelText(/to confirm/), 'Restore')
    await userEvent.click(dialog.getByRole('button', { name: 'Restore everything' }))
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull())
    const order = [...canvasElement.querySelectorAll('[data-event]')].map((r) => r.getAttribute('data-event'))
    await expect(order[0]).toMatch(/^restore-everything-3/)
    await expect(canvasElement.querySelector('[data-backup="4"]')).toBeNull()
    const restored = el(canvasElement, `[data-event="${order[0]}"]`)
    await expect(restored).toHaveTextContent('Restored everything to Backup 3 · Return point: Backup 4')
    await expect(el(restored, '[data-cell="source"]')).toHaveTextContent('Restore')
    await expect(el(restored, '[data-cell="by"]')).toHaveTextContent('Sam Ortiz')
    await userEvent.click(within(restored).getAllByRole('button')[0] as HTMLElement)
    await userEvent.click(within(restored).getByRole('button', { name: 'Restore Backup 4…' }))
    const back = within(await body().findByRole('dialog'))
    await expect(back.getByText(/to Backup 4 · Before restore to Backup 3\?/)).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull())
    await expect(within(canvasElement).getByText('15 recorded events')).toBeVisible()
  }
}

/** One scope only: no radios, `Restore: Files only`, the uploads warning and why, then the files content. */
const filesOnlyDialog = async (row: HTMLElement, why: RegExp) => {
  await userEvent.click(within(row).getByRole('button', { name: 'Restore…' }))
  const dialog = within(await body().findByRole('dialog'))
  await expect(dialog.queryByRole('radiogroup')).toBeNull()
  const only = el(document.body, '[role="dialog"] [data-scope-only="files"]')
  await expect(only).toHaveTextContent(/^Restore: Files only/)
  await expect(el(only, '[data-scope-warning]')).toHaveTextContent(
    /Images uploaded after this backup are removed/
  )
  await expect(el(only, '[data-scope-why]')).toHaveTextContent(why)
  await expect(dialog.getByRole('button', { name: 'Restore the files' })).toBeEnabled()
  await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(body().queryByRole('dialog')).toBeNull())
}

/** A point whose database copy is missing: DB ✗ said plainly; Restore… offers Files only and says why. */
export const BackupDbMissing: Story = {
  name: 'Backup · DB ✗, database copy missing',
  render: () => tab(wp([...WP_EVENTS, B3_MISSING, B2, B1_OLD]), { open: ['b-3'] }),
  play: async ({ canvasElement }) => {
    const b3 = el(canvasElement, '[data-backup="3"]')
    await expect(el(b3, '[data-capability]')).toHaveTextContent('DB ✗')
    await expect(el(b3, '[data-scope]')).toHaveTextContent(
      'Database copy missing · only the files can go back'
    )
    await expect(el(b3, '[data-keeps]')).toHaveTextContent(/missing or does not match/)
    const row = within(b3)
    await expect(row.getByRole('button', { name: 'Restore…' })).toBeVisible()
    await expect(row.queryByRole('button', { name: /Restore everything/ })).toBeNull()
    await expect(el(b3, '[data-no-everything]')).toHaveTextContent(/can’t be trusted/)
    // Never called a Full backup when it cannot prove it has the database.
    await expect(b3).not.toHaveTextContent('Full backup')
    await filesOnlyDialog(b3, /can’t be trusted/)
    // The row's … menu holds the same one item.
    await userEvent.click(row.getByRole('button', { name: 'More actions' }))
    const menu = within(await body().findByRole('menu'))
    await expect(menu.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Restore…'])
    await userEvent.keyboard('{Escape}')
  }
}

/** A point made before the database was kept: Restore… offers Files only, and it says why. */
export const BackupFileOnly: Story = {
  name: 'Backup · File backup (no database), an older point',
  render: () => tab(wp(WP_ITEMS), { open: ['b-2'] }),
  play: async ({ canvasElement }) => {
    const b2 = el(canvasElement, '[data-backup="2"]')
    await expect(el(b2, '[data-keeps]')).toHaveTextContent(/made before Tracy kept the database/)
    await expect(within(b2).getByRole('button', { name: 'Restore…' })).toBeVisible()
    await expect(within(b2).queryByRole('button', { name: /Restore everything/ })).toBeNull()
    await expect(el(b2, '[data-no-everything]')).toHaveTextContent(/no copy of the database/)
    await filesOnlyDialog(b2, /no copy of the database/)
  }
}

/** A new site's first point: Full, the site as handed over — Restore everything is a factory reset. */
export const InitialBackup: Story = {
  name: 'Initial backup · new site, Full, factory reset',
  render: () => tab(wp(NEW_EVENTS), { siteKey: NEW_SITE, open: ['b-1'] }),
  play: async ({ canvasElement }) => {
    const b1 = el(canvasElement, '[data-backup="1"]')
    await expect(el(b1, '[data-name]')).toHaveTextContent('Initial backup — site as built')
    await expect(el(b1, '[data-capability]')).toHaveTextContent('Full backup')
    await expect(el(b1, '[data-scope]')).toHaveTextContent('The site as it was handed over')
    await expect(el(b1, '[data-keeps]')).toHaveTextContent(/factory reset: the site goes back to day one/)
    await expect(el(b1, '[data-cell="by"]')).toHaveTextContent('Tracy')
    await expect(within(b1).getByRole('button', { name: 'Restore…' })).toBeVisible()
    await expect(b1.querySelector('[data-block="files"]')).toBeNull()
  }
}

/** EmDash: a Content backup — database and media; one verb, Restore content, with the same heavy dialog. */
export const BackupEmdash: Story = {
  name: 'Backup · EmDash, Content backup, Restore content only',
  render: () => tab(em([EM_CHAT, EM_B2, EM_ADMIN, EM_B1]), { siteKey: EM_SITE, open: ['b-2'] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/\b0 files?\b/)).toBeNull()
    const b2 = el(canvasElement, '[data-backup="2"]')
    await expect(el(b2, '[data-capability]')).toHaveTextContent('Content backup')
    await expect(el(b2, '[data-scope]')).toHaveTextContent('Content backup1 change since Backup 1')
    await expect(el(b2, '[data-keeps]')).toHaveTextContent(/template code is not part of it/)
    const row = within(b2)
    await expect(row.queryByRole('button', { name: 'Restore…' })).toBeNull()
    await expect(row.getByRole('button', { name: 'Restore content…' })).toHaveAttribute(
      'data-restore',
      'content'
    )
    await expect(el(b2, '[data-no-files]')).toHaveTextContent(/files are not tracked/)
    await userEvent.click(row.getByRole('button', { name: 'Restore content…' }))
    const dialog = within(await body().findByRole('dialog'))
    // No scope step on EmDash.
    await expect(dialog.queryByRole('radiogroup')).toBeNull()
    await expect(document.body.querySelector('[role="dialog"] [data-scope-only]')).toBeNull()
    await expect(
      dialog.getByText('Restore the content of harbour-yoga.example to Backup 2 · Autumn timetable?')
    ).toBeVisible()
    await expect(dialog.getByText(/offline for a few seconds/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Restore content' })).toBeDisabled()
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull())
    await expect(canvas.getByText('2 recorded events')).toBeVisible()
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Filter and jump
// ---------------------------------------------------------------------------------------------

/** Filtered to Chat, then Restore: backups stay as thin dividers under any Type; All opens them. */
export const FilteredKeepsMilestones: Story = {
  name: 'Filter · Chat, backups fold into dividers',
  render: () => tab(wp(WP_ITEMS), { filter: 'chat' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Type: Chat' })).toBeVisible()
    await expect(canvas.getByText('6 recorded events')).toBeVisible()
    await expect(canvasElement.querySelectorAll('[data-backup]').length).toBe(0)
    const dividers = [...canvasElement.querySelectorAll('[data-backup-divider]')]
    await expect(dividers.map((d) => d.textContent)).toEqual([
      'Backup 3 · Oct 1',
      'Backup 2 · Sep 29',
      'Initial backup · Sep 28'
    ])
    const seq = [...canvasElement.querySelectorAll('[data-event], [data-backup-divider]')].map(
      (r) => r.getAttribute('data-event') ?? `b${r.getAttribute('data-backup-divider')}`
    )
    await expect(seq).toEqual([
      'e-chat-both',
      'b3',
      'e-truncated',
      'e-partly',
      'b2',
      'e-files-undone',
      'e-multi',
      'e-legacy',
      'b1'
    ])
    const d = dividers[0]?.getBoundingClientRect().height ?? 0
    const r = el(canvasElement, '[data-event="e-chat-both"]').getBoundingClientRect().height
    await expect(d).toBeLessThan(r / 2)
    await userEvent.click(canvas.getByRole('button', { name: 'Type: Chat' }))
    await userEvent.click(
      within(await body().findByRole('menu')).getByRole('menuitemradio', { name: /Restore/ })
    )
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-backup-divider]').length).toBe(3))
    await expect(canvas.getByText('2 recorded events')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Type: Restore' }))
    await userEvent.click(
      within(await body().findByRole('menu')).getByRole('menuitemradio', { name: /^All/ })
    )
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-backup]').length).toBe(3))
    // End where the story starts, so the canvas shows what its name says.
    await userEvent.click(canvas.getByRole('button', { name: 'Type: All' }))
    await userEvent.click(
      within(await body().findByRole('menu')).getByRole('menuitemradio', { name: /Chat/ })
    )
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-backup-divider]').length).toBe(3))
  }
}

/** The Jump to backup menu, open. */
export const JumpToBackup: Story = {
  name: 'Jump · menu open',
  render: () => tab(wp(WP_ITEMS)),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Jump to backup/ }))
    const menu = within(await body().findByRole('menu'))
    await expect(menu.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      '3Menu and About us refreshOct 1',
      '2Footer and buttonsSep 29',
      '1Initial backup — site as builtSep 28'
    ])
  }
}

const inView = (node: HTMLElement, scroller: HTMLElement): boolean => {
  const r = node.getBoundingClientRect()
  const s = scroller.getBoundingClientRect()
  return r.top >= s.top && r.bottom <= s.bottom
}

/** Picking the initial backup scrolls to it and flashes it once; under a filter it lands on the divider. */
export const JumpScrolls: Story = {
  name: 'Jump · pick a backup, it scrolls into view and flashes once',
  render: () => tab(wp(WP_ITEMS)),
  play: async ({ canvasElement }) => {
    const scroller = el(canvasElement, '[data-scroller]')
    const b1 = el(canvasElement, '[data-backup="1"]')
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Jump to backup/ }))
    await userEvent.click(within(await body().findByRole('menu')).getByRole('menuitem', { name: /^1/ }))
    await waitFor(() => expect(inView(b1, scroller)).toBe(true), { timeout: 2000 })
    await expect(b1).toHaveAttribute('data-flash', 'true')
    await waitFor(() => expect(b1).not.toHaveAttribute('data-flash'), { timeout: 2500 })
    scroller.scrollTop = 0
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Type: All' }))
    await userEvent.click(
      within(await body().findByRole('menu')).getByRole('menuitemradio', { name: /CMS admin/ })
    )
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Jump to backup/ }))
    await userEvent.click(within(await body().findByRole('menu')).getByRole('menuitem', { name: /^2/ }))
    const divider = el(canvasElement, '[data-backup-divider="2"]')
    await waitFor(() => expect(inView(divider, scroller)).toBe(true), { timeout: 2000 })
    await expect(divider).toHaveAttribute('data-flash', 'true')
  }
}

// ---------------------------------------------------------------------------------------------
// 5. Narrow pane
// ---------------------------------------------------------------------------------------------

const narrowPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const pane = el(canvasElement, '[data-pane]')
  await expect(Math.round(pane.getBoundingClientRect().width)).toBe(360)
  await expect(pane.scrollWidth).toBeLessThanOrEqual(pane.clientWidth + 1)
  await expect(canvasElement.querySelector('[data-colheader]')).not.toBeVisible()
  const b3 = el(canvasElement, '[data-backup="3"]')
  const desc = el(b3, '[data-cell="description"]').getBoundingClientRect()
  const time = el(b3, '[data-cell="time"]').getBoundingClientRect()
  await expect(time.top).toBeGreaterThanOrEqual(desc.bottom - 1)
  // The badge stays readable beside a cut name.
  await expect(el(b3, '[data-capability]')).toBeVisible()
  await expect(el(b3, '[data-meta]')).toHaveTextContent(/^Time.*Type.*Backup.*By.*Mai Tran$/)
  await expect(el(b3, '[data-meta]')).not.toHaveTextContent('Source')
  await expect(el(canvasElement, '[data-event="e-undo-partly"] [data-meta]')).toHaveTextContent(
    /Type.*Restore/
  )
  await expect(pane.scrollWidth).toBeLessThanOrEqual(pane.clientWidth + 1)
}

export const Narrow360: Story = {
  name: 'Narrow · 360px pane, Backup 3 open',
  render: () => tab(wp(WP_ITEMS), { width: 360, open: ['b-3'] }),
  play: narrowPlay
}
export const Narrow360Dark: Story = {
  name: 'Narrow · 360px pane, Backup 3 open, dark',
  globals: { theme: 'dark' },
  render: () => tab(wp(WP_ITEMS), { width: 360, open: ['b-3'] }),
  play: narrowPlay
}
