/**
 * THE QUESTION THIS MOCK EXISTS TO ANSWER (Brian, 02/10): when every row of Site changes reads
 * `Description · Time · Type · By` — one recorded event per row, the Type one of seven values,
 * By a Tracy seat, a CMS account, a service or Unknown — and opening a row says exactly what was
 * changed, what was asked and what an undo does and does NOT put back, does the tab read right
 * before anyone ports it (plan `tasks/todo-site-changes-v2.md` §2, §3, §4.3, P1)?
 *
 * One deliberate change from V1 needs its own look: V1 folded back-to-back CMS admin edits of one
 * user into one row; V2 gives each its own row unless a correlation id joins them (§4.3). The story
 * `Grouping · V1 folded beside V2 one event per row` puts both on the same data.
 *
 * Brian 03/10/2026: the third column and its filter read `Type` (were `Source`); the values are
 * unchanged; the value labels are the shipped ones (`Tracy update`, `Restore`).
 *
 * ⚠ MODE A. A proposal: nothing here ships. Port per DESIGN.md §0, then delete this file.
 *
 * ⚠ ILLUSTRATIVE DATA ONLY. Every person, site, account, path, commit and request below is made
 * up (`*.example` sites, `@example.com` people). No customer record was copied.
 *
 * Narrow: the `Narrow · 360px` / `600px` stories draw the tab in a pane of that width — the tab
 * lays out by its pane (container query), not by the window, because in dsh it is a side pane.
 * Dark: the toolbar's Theme switch, or the `· dark` stories.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { type Activity, type Turn, SiteChangesTurns } from './site-changes-turns'
import {
  type ActivityV2,
  type ChangeEvent,
  type FileChange,
  type SourceKind,
  SiteChangesV2,
  SOURCES
} from './site-changes-v2'

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

/** Unix seconds at a local wall-clock time, so "Oct 1 · 14:02" reads the same on any machine. */
const at = (month: number, day: number, h: number, m: number): number =>
  Math.floor(new Date(2026, month - 1, day, h, m).getTime() / 1000)
const NOW = at(10, 1, 16, 44) * 1000

const file = (
  path: string,
  zone: string,
  status: FileChange['status'] = 'modified',
  additions: number | null = 4,
  deletions: number | null = 2
): FileChange => ({ path, zone, status, additions, deletions })

const base = {
  content: [],
  settings: [],
  other: [],
  moments: [],
  technical: [],
  undo: { allowed: false, reason: 'not-tracy' as const }
} satisfies Partial<ChangeEvent>

/** Chat, full data: one page and two files, request saved in full. */
const CHAT_BOTH: ChangeEvent = {
  ...base,
  id: 'e-chat-both',
  source: 'chat',
  by: seat(MAI),
  appliedBy: 'Tracy',
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated 1 page and 2 files' },
  time: { basis: 'occurred', at: at(10, 1, 15, 10), finishedAt: at(10, 1, 15, 12) },
  request: {
    text: 'Make the About us heading say “Baked fresh since 1998” and tighten the hero spacing on phones',
    completeness: 'complete'
  },
  content: [{ op: 'Updated', type: 'page', id: '12', title: 'About us', fields: ['heading'], outcome: 'ok' }],
  moments: [
    {
      sha: '7c1e0a94d2b8',
      files: [
        file('wp-content/themes/bluegum/assets/css/hero.css', 'design', 'modified', 12, 5),
        file('wp-content/themes/bluegum/assets/css/header.css', 'design', 'modified', 3, 3)
      ]
    }
  ],
  technical: [
    { label: 'Turn', value: 'turn_8f2c41' },
    { label: 'Commit', value: '7c1e0a94d2b8' },
    { label: 'Session', value: 'session-0000-example' }
  ],
  undo: { allowed: true }
}

/** Comment: Jo wrote the comment, Sam pressed Send to Tracy. By is Sam (§2.2). */
const COMMENT: ChangeEvent = {
  ...base,
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
  content: [{ op: 'Updated', type: 'page', id: '31', title: 'Menu', fields: ['body'], outcome: 'ok' }],
  technical: [
    { label: 'Turn', value: 'turn_19ab07' },
    { label: 'Comment', value: 'cmt_482' }
  ],
  undo: { allowed: false, reason: 'no-files' }
}

/** Three CMS admin edits by one WordPress account, minutes apart, no correlation id. */
const MINH = { kind: 'cms' as const, cms: 'WordPress' as const, name: 'minh', id: '7' }
const CMS_1: ChangeEvent = {
  ...base,
  id: 'e-cms-1',
  source: 'cms-admin',
  by: MINH,
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated “About us”' },
  time: { basis: 'occurred', at: at(10, 1, 16, 40) },
  content: [{ op: 'Updated', type: 'page', id: '12', title: 'About us', outcome: 'ok' }],
  technical: [{ label: 'CMS log', value: 'wordpress-tracy-log #2291' }]
}
const CMS_2: ChangeEvent = {
  ...CMS_1,
  id: 'e-cms-2',
  description: { kind: 'result', text: 'Updated setting “Site tagline”' },
  time: { basis: 'occurred', at: at(10, 1, 16, 37) },
  content: [],
  settings: [{ op: 'Updated', type: 'setting', id: 'blogdescription', title: 'Site tagline', outcome: 'ok' }],
  technical: [{ label: 'CMS log', value: 'wordpress-tracy-log #2290' }]
}
const CMS_3: ChangeEvent = {
  ...CMS_1,
  id: 'e-cms-3',
  description: { kind: 'result', text: 'Deleted “Summer opening hours 2025”' },
  time: { basis: 'occurred', at: at(10, 1, 16, 31) },
  content: [{ op: 'Deleted', type: 'post', id: '88', title: 'Summer opening hours 2025', outcome: 'ok' }],
  technical: [{ label: 'CMS log', value: 'wordpress-tracy-log #2289' }]
}

/** WP-Cron: the hook contract records user 0 only under DOING_CRON, so this is Automatic (§2.1). */
const AUTOMATIC: ChangeEvent = {
  ...base,
  id: 'e-auto',
  source: 'automatic',
  by: { kind: 'service', name: 'WordPress', detail: 'automatic update (WP-Cron)' },
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated Contact Form 7: 5.9.8 → 5.9.9' },
  time: { basis: 'occurred', at: at(10, 1, 3, 12) },
  other: [
    {
      op: 'Updated',
      type: 'plugin',
      id: 'contact-form-7',
      title: 'Contact Form 7',
      fields: ['5.9.8 → 5.9.9'],
      outcome: 'ok'
    }
  ],
  technical: [
    { label: 'CMS log', value: 'wordpress-tracy-log #2270' },
    { label: 'Hook', value: 'tracy-access 0.2.0' }
  ]
}

/** Files changed with no proof of path or person: Unknown, Detected. */
const UNKNOWN: ChangeEvent = {
  ...base,
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
        file('wp-content/plugins/contact-form-7/wp-contact-form-7.php', 'addons', 'modified', 3, 3),
        file('wp-content/plugins/contact-form-7/readme.txt', 'addons', 'modified', 40, 12),
        file('wp-content/uploads/2026/10/team-photo.jpg', 'content', 'added', null, null)
      ]
    }
  ],
  technical: [{ label: 'Commit', value: 'b3b95427e1aa' }]
}

/** Tracy's own deploy, from the verified resync path: service known, starter Unknown (§4.2). */
const DEPLOY: ChangeEvent = {
  ...base,
  id: 'e-deploy',
  source: 'deployment',
  by: { kind: 'service', name: 'Tracy deploy' },
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated Claude Cowork: 0.20.0 → 0.20.2' },
  time: { basis: 'occurred', at: at(9, 30, 22, 15) },
  deployment: { cause: 'deploy', tag: 'manual', startedBy: null },
  moments: [
    {
      sha: 'e01d3c9a5577',
      files: [
        file('wp-content/plugins/claude-cowork/claude-cowork.php', 'addons', 'modified', 18, 7),
        file('wp-content/plugins/claude-cowork/src/Routes.php', 'addons', 'modified', 22, 4)
      ]
    }
  ],
  technical: [
    { label: 'Commit', value: 'e01d3c9a5577' },
    { label: 'Resync', value: 'cause=deploy tag=manual' }
  ]
}

/** Chat whose request was cut when it was saved — the record says so. */
const TRUNCATED: ChangeEvent = {
  ...base,
  id: 'e-truncated',
  source: 'chat',
  by: seat(JO),
  appliedBy: 'Tracy',
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated “Pricing”' },
  time: { basis: 'occurred', at: at(9, 30, 16, 20) },
  request: {
    text: 'On the pricing page, change the wholesale table so the 10 kg sourdough row says $48 and the rye row says $52, and add a note under the table that orders over 50 kg get free delivery inside the city — also make the note the same brown as',
    completeness: 'incomplete'
  },
  content: [
    { op: 'Updated', type: 'page', id: '44', title: 'Pricing', fields: ['table'], outcome: 'ok' },
    { op: 'Updated', type: 'page', id: '44', title: 'Pricing', fields: ['note'], outcome: 'unknown' }
  ],
  technical: [{ label: 'Turn', value: 'turn_5c0d11' }],
  undo: { allowed: false, reason: 'no-files' }
}

/** Legacy moment: only the request is known; whether it was saved in full is not (§2.3). */
const LEGACY: ChangeEvent = {
  ...base,
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
    {
      sha: '0f1e2d3c4b5a',
      files: [file('wp-content/themes/bluegum/templates/page-about.html', 'design', 'modified', 14, 9)]
    }
  ],
  technical: [{ label: 'Commit', value: '0f1e2d3c4b5a' }],
  undo: { allowed: true }
}

/** Chat with content + files whose files were undone: partly undone, never struck through. */
const PARTLY: ChangeEvent = {
  ...base,
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
  content: [
    { op: 'Updated', type: 'page', id: '9', title: 'Footer notice', fields: ['text'], outcome: 'ok' }
  ],
  moments: [
    {
      sha: '1a2b3c4d5e6f',
      files: [file('wp-content/themes/bluegum/assets/css/footer.css', 'design', 'modified', 2, 2)],
      undoneBy: 'e-undo-partly'
    }
  ],
  technical: [{ label: 'Commit', value: '1a2b3c4d5e6f' }],
  undo: { allowed: true }
}
const UNDO_PARTLY: ChangeEvent = {
  ...base,
  id: 'e-undo-partly',
  source: 'site-changes',
  by: seat(SAM),
  cms: 'WordPress',
  description: { kind: 'result', text: 'Undid changes to 1 file' },
  time: { basis: 'occurred', at: at(9, 30, 10, 31) },
  target: { eventId: 'e-partly', sha: '1a2b3c4d5e6f', files: 1 },
  moments: [
    {
      sha: '9d9e0f1a2b3c',
      files: [file('wp-content/themes/bluegum/assets/css/footer.css', 'design', 'modified', 2, 2)]
    }
  ],
  technical: [
    { label: 'Operation', value: 'op_51c2' },
    { label: 'Target commit', value: '1a2b3c4d5e6f' },
    { label: 'Resulting commit', value: '9d9e0f1a2b3c' }
  ]
}

/** Chat that only changed files, undone: "File changes undone". */
const FILES_UNDONE: ChangeEvent = {
  ...base,
  id: 'e-files-undone',
  source: 'chat',
  by: seat(SAM),
  appliedBy: 'Tracy',
  cms: 'WordPress',
  description: { kind: 'result', text: 'Updated 2 files' },
  time: { basis: 'occurred', at: at(9, 29, 15, 2) },
  request: { text: 'Make the contact form button match the brand brown', completeness: 'complete' },
  moments: [
    {
      sha: '6a7b8c9d0e1f',
      files: [
        file('wp-content/themes/bluegum/assets/css/forms.css', 'design', 'modified', 4, 4),
        file('wp-content/themes/bluegum/assets/css/buttons.css', 'design', 'modified', 2, 1)
      ],
      undoneBy: 'e-undo-files'
    }
  ],
  technical: [{ label: 'Commit', value: '6a7b8c9d0e1f' }],
  undo: { allowed: true }
}
const UNDO_FILES: ChangeEvent = {
  ...UNDO_PARTLY,
  id: 'e-undo-files',
  by: seat(JO),
  description: { kind: 'result', text: 'Undid changes to 2 files' },
  time: { basis: 'occurred', at: at(9, 29, 17, 20) },
  target: { eventId: 'e-files-undone', sha: '6a7b8c9d0e1f', files: 2 },
  moments: [{ sha: '2c3d4e5f6a7b', files: FILES_UNDONE.moments?.[0]?.files ?? [] }]
}

/** One turn, two commits touching different files: each commit has its own Undo and count (§3.3). */
const MULTI: ChangeEvent = {
  ...base,
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
    {
      sha: 'c1c1c1a0b0e0',
      files: [file('wp-content/themes/bluegum/assets/css/footer.css', 'design', 'modified', 7, 4)]
    },
    {
      sha: 'c2c2c2a0b0e0',
      files: [
        file('wp-content/themes/bluegum/assets/css/buttons.css', 'design', 'modified', 3, 1),
        file('wp-content/themes/bluegum/theme.json', 'design', 'modified', 2, 2)
      ]
    }
  ],
  technical: [
    { label: 'Turn', value: 'turn_77de10' },
    { label: 'Commits', value: 'c1c1c1a0b0e0, c2c2c2a0b0e0' }
  ],
  undo: { allowed: true },
  flags: { concurrent: true }
}

const WP_ITEMS = [
  CMS_1,
  CMS_2,
  CMS_3,
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

// EmDash: no file history; admin log without menus/settings/media.
const EM_CHAT: ChangeEvent = {
  ...base,
  id: 'e-em-chat',
  source: 'chat',
  by: seat(JO),
  appliedBy: 'Tracy',
  cms: 'EmDash',
  description: { kind: 'result', text: 'Updated “Contact”' },
  time: { basis: 'occurred', at: at(10, 1, 10, 22) },
  request: { text: 'Put the new opening hours on the contact page', completeness: 'complete' },
  content: [
    { op: 'Updated', type: 'page', id: 'contact', title: 'Contact', fields: ['hours'], outcome: 'ok' }
  ],
  moments: null,
  tracking: { files: 'untracked', settings: 'untracked', media: 'untracked' },
  technical: [{ label: 'Turn', value: 'turn_e1a2b3' }],
  undo: { allowed: false, reason: 'untracked' }
}
const EM_UNKNOWN: ChangeEvent = {
  ...base,
  id: 'e-em-unknown',
  source: 'unknown',
  by: { kind: 'unknown' },
  cms: 'EmDash',
  description: { kind: 'result', text: 'Content change recorded' },
  time: { basis: 'occurred', at: at(10, 1, 9, 5) },
  content: [{ op: 'Deleted', type: 'entry', id: null, title: null, outcome: 'ok' }],
  moments: null,
  tracking: { files: 'untracked' },
  technical: [{ label: 'CMS log', value: 'emdash-audit #311' }],
  undo: { allowed: false, reason: 'untracked' }
}
const EM_ADMIN: ChangeEvent = {
  ...base,
  id: 'e-em-admin',
  source: 'cms-admin',
  by: { kind: 'cms', cms: 'EmDash', name: 'lena', id: 'usr_3' },
  cms: 'EmDash',
  description: { kind: 'result', text: 'Published “Autumn retreat”' },
  time: { basis: 'occurred', at: at(9, 30, 18, 0) },
  content: [{ op: 'Published', type: 'post', id: 'autumn-retreat', title: 'Autumn retreat', outcome: 'ok' }],
  moments: null,
  tracking: { files: 'untracked' },
  technical: [{ label: 'CMS log', value: 'emdash-audit #305' }],
  undo: { allowed: false, reason: 'untracked' }
}

const countBySource = (items: ChangeEvent[]): Record<SourceKind, number> =>
  Object.fromEntries(SOURCES.map((s) => [s, items.filter((i) => i.source === s).length])) as Record<
    SourceKind,
    number
  >

const wp = (items: ChangeEvent[], over: Partial<ActivityV2> = {}): ActivityV2 => ({
  since: { version: 4 },
  counts: { bySource: countBySource(items), complete: true },
  items,
  coverage: { cms: 'WordPress', gitTruncated: false, cmsAdmin: { since: 'Sep 12, 2026' } },
  ...over
})

const em = (items: ChangeEvent[]): ActivityV2 => ({
  since: { version: 2 },
  counts: { bySource: countBySource(items), complete: true },
  items,
  coverage: { cms: 'EmDash', gitTruncated: false, emdashLimits: true, cmsAdmin: { since: 'Sep 20, 2026' } }
})

// ---------------------------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------------------------

function frame(node: ReactNode, width?: number) {
  return (
    <div className="h-screen overflow-auto bg-background text-foreground">
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

const tab = (data: ActivityV2, opts: { siteKey?: string; width?: number; open?: string[] } = {}) =>
  frame(
    <SiteChangesV2
      siteKey={opts.siteKey ?? WP_SITE}
      sites={SITES}
      activity={data}
      viewer={SAM}
      now={NOW}
      initialOpen={opts.open}
    />,
    opts.width
  )

const meta: Meta = {
  title: 'Mockups/Site changes V2',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

// ---------------------------------------------------------------------------------------------
// Play helpers. Menus and dialogs are portalled to <body>.
// ---------------------------------------------------------------------------------------------

const body = () => within(document.body)

function rowEl(canvasElement: HTMLElement, id: string): HTMLElement {
  const row = canvasElement.querySelector<HTMLElement>(`[data-event="${id}"]`)
  if (!row) throw new Error(`no row ${id}`)
  return row
}

const toggleOf = (row: HTMLElement): HTMLElement => {
  const b = row.querySelector<HTMLElement>('button[aria-expanded]')
  if (!b) throw new Error('row has no toggle')
  return b
}

async function openRow(canvasElement: HTMLElement, id: string) {
  const row = rowEl(canvasElement, id)
  await userEvent.click(toggleOf(row))
  await expect(toggleOf(row)).toHaveAttribute('aria-expanded', 'true')
  return within(row)
}

const box = (el: Element | null) => {
  if (!el) throw new Error('missing cell')
  const r = el.getBoundingClientRect()
  return { left: Math.round(r.left), top: Math.round(r.top) }
}
const cells = (row: HTMLElement) => ({
  time: box(row.querySelector('[data-cell="time"]')),
  source: box(row.querySelector('[data-cell="source"]')),
  by: box(row.querySelector('[data-cell="by"]'))
})

/**
 * Wait for a still layout before measuring. Measured 02/10: the whole story moves down 28px just
 * after play starts — the preview's kind banner mounts after its async `index.json` read.
 */
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
// 1. The main list
// ---------------------------------------------------------------------------------------------

/** Every Type in one WordPress list, by day, four columns, the total and the coverage foot. */
export const FullList: Story = {
  name: 'Main list · four columns, every Type',
  render: () => tab(wp(WP_ITEMS)),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('15 recorded events since v4')).toBeVisible()
    // The `source` column reads Type (Brian 03/10); its data attribute keeps the shipped enum name.
    for (const [id, col] of [
      ['description', 'Description'],
      ['time', 'Time'],
      ['source', 'Type'],
      ['by', 'By']
    ])
      await expect(canvasElement.querySelector(`[data-col="${id}"]`)).toHaveTextContent(col)
    await expect(canvas.getByRole('button', { name: /Create a backup/ })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'Type: All' })).toBeVisible()
    // Scope line under the Description, Detected time on the unknown row.
    await expect(within(rowEl(canvasElement, 'e-chat-both')).getByText('1 page · 2 files')).toBeVisible()
    await expect(within(rowEl(canvasElement, 'e-unknown')).getByText('Detected 2h ago')).toBeVisible()
    // Each Type is words, not just colour.
    const sources = new Set(
      [...canvasElement.querySelectorAll('[data-cell="source"]')].map((c) =>
        c.textContent?.replace(/^Type/, '')
      )
    )
    await expect([...sources].sort()).toEqual(
      ['Automatic', 'Chat', 'CMS admin', 'Comment', 'Tracy update', 'Restore', 'Unknown'].sort()
    )
    // Each Type cell carries an icon beside the word, never colour alone.
    for (const c of canvasElement.querySelectorAll('[data-cell="source"]'))
      await expect(c.querySelector('svg')).not.toBeNull()
    await expect(canvas.getByText('WordPress admin changes recorded since Sep 12, 2026')).toBeVisible()
  }
}

export const FullListDark: Story = {
  name: 'Main list · dark',
  globals: { theme: 'dark' },
  render: () => tab(wp(WP_ITEMS))
}

/** Opening a row in place: Time, Type and By keep their exact place; closing restores it. */
export const OpenInPlace: Story = {
  name: 'Main list · open and close a row, columns stay put',
  render: () => tab(wp(WP_ITEMS)),
  play: async ({ canvasElement }) => {
    const row = rowEl(canvasElement, 'e-chat-both')
    const neighbour = rowEl(canvasElement, 'e-unknown')
    const before = await settledCells(row)
    const header = {
      time: box(canvasElement.querySelector('[data-col="time"]')).left,
      source: box(canvasElement.querySelector('[data-col="source"]')).left,
      by: box(canvasElement.querySelector('[data-col="by"]')).left
    }
    // The row's cells sit under the header's columns.
    await expect(before.time.left).toBe(header.time)
    await expect(before.source.left).toBe(header.source)
    await expect(before.by.left).toBe(header.by)
    await userEvent.click(toggleOf(row))
    await expect(toggleOf(row)).toHaveAttribute('aria-expanded', 'true')
    const opened = await settledCells(row)
    await expect(opened).toEqual(before)
    // A neighbour row's columns line up with the opened one's.
    await expect(cells(neighbour).time.left).toBe(opened.time.left)
    // Detail order: result → identity → request → effects → technical → actions.
    const order = [...row.querySelectorAll('[data-block]')].map((b) => b.getAttribute('data-block'))
    await expect(order).toEqual(['result', 'identity', 'request', 'effects', 'technical', 'actions'])
    await userEvent.click(toggleOf(row))
    await expect(toggleOf(row)).toHaveAttribute('aria-expanded', 'false')
    await expect(await settledCells(row)).toEqual(before)
    await expect(row.querySelector('[data-detail]')).toBeNull()
  }
}

/** The Type filter: seven values with icon and count, and the total follows the filter. */
export const FilterBySource: Story = {
  name: 'Main list · Type filter',
  render: () => tab(wp(WP_ITEMS)),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Type: All' }))
    const menu = within(await body().findByRole('menu'))
    const items = menu.getAllByRole('menuitemradio')
    await expect(items.map((i) => i.textContent?.replace(/\d+\+?$/, '').trim())).toEqual([
      'All',
      'Chat',
      'Comment',
      'CMS admin',
      'Automatic',
      'Tracy update',
      'Restore',
      'Unknown'
    ])
    await expect(menu.getByRole('menuitemradio', { name: /CMS admin/ })).toHaveTextContent('3')
    await userEvent.click(menu.getByRole('menuitemradio', { name: /CMS admin/ }))
    await expect(canvas.getByRole('button', { name: 'Type: CMS admin' })).toBeVisible()
    await expect(canvas.getByText('3 recorded events since v4')).toBeVisible()
    await waitFor(() =>
      expect(
        [...canvasElement.querySelectorAll('[data-event]')].map((r) => r.getAttribute('data-source'))
      ).toEqual(['cms-admin', 'cms-admin', 'cms-admin'])
    )
  }
}

/** The total is a floor when the history was cut: "At least N", the reason on hover, and in the foot. */
export const AtLeastCount: Story = {
  name: 'Main list · At least N recorded events (counts incomplete)',
  render: () => {
    const bySource = countBySource(WP_ITEMS)
    return tab(
      wp(WP_ITEMS, {
        counts: {
          bySource: { ...bySource, chat: bySource.chat + 180, unknown: bySource.unknown + 31 },
          complete: false,
          incompleteReason: 'git-truncated'
        },
        coverage: { cms: 'WordPress', gitTruncated: true, cmsAdmin: { since: 'Sep 12, 2026' } }
      })
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('At least 226 recorded events since v4')).toBeVisible()
    await expect(canvas.getByText('Older history not shown')).toBeVisible()
  }
}

export const Empty: Story = {
  name: 'Main list · nothing recorded since v4',
  render: () => tab(wp([])),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nothing has been recorded since v4.')).toBeVisible()
    await expect(canvas.getByRole('button', { name: /Create a backup/ })).toBeDisabled()
    await expect(canvas.getByText('WordPress admin changes recorded since Sep 12, 2026')).toBeVisible()
  }
}

// ---------------------------------------------------------------------------------------------
// 2. The opened row, per Type
// ---------------------------------------------------------------------------------------------

export const DetailChat: Story = {
  name: 'Detail · Chat, full data',
  render: () => tab(wp([CHAT_BOTH]), { open: ['e-chat-both'] }),
  play: async ({ canvasElement }) => {
    const row = within(rowEl(canvasElement, 'e-chat-both'))
    await expect(row.getByText('Requested by', { exact: false })).toHaveTextContent(
      /Requested by Mai Tran · Applied by Tracy/
    )
    await expect(row.getByText(/Baked fresh since 1998/)).toBeVisible()
    await expect(row.getByText('page “About us”', { exact: false })).toBeVisible()
    await expect(row.getByText('wp-content/themes/bluegum/assets/css/hero.css')).toBeVisible()
    await expect(row.getByRole('button', { name: 'Undo file changes…' })).toBeEnabled()
  }
}

export const DetailComment: Story = {
  name: 'Detail · Comment, sent by another person',
  render: () => tab(wp([COMMENT]), { open: ['e-comment'] }),
  play: async ({ canvasElement }) => {
    const r = rowEl(canvasElement, 'e-comment')
    await expect(r.querySelector('[data-cell="by"]')).toHaveTextContent('Sam Ortiz')
    const row = within(r)
    await expect(row.getByText(/Comment by/)).toHaveTextContent('Comment by Jo Reyes on /menu/')
    await expect(row.getByRole('link', { name: /Open comment/ })).toBeVisible()
    // Content only: no Undo file button, and it says so.
    await expect(row.queryByRole('button', { name: 'Undo file changes…' })).toBeNull()
    await expect(row.getByText('Content changes can’t be undone from here yet.')).toBeVisible()
  }
}

export const DetailCmsAdmin: Story = {
  name: 'Detail · CMS admin',
  render: () => tab(wp([CMS_1, CMS_2]), { open: ['e-cms-2'] }),
  play: async ({ canvasElement }) => {
    const row = within(rowEl(canvasElement, 'e-cms-2'))
    await expect(row.getByText('WordPress account minh (ID 7)')).toBeVisible()
    await expect(row.getByText(/not linked to a seat on Tracy/)).toBeVisible()
    // A setting lands under Settings, never under Content.
    await expect(rowEl(canvasElement, 'e-cms-2').querySelector('[data-group="settings"]')).not.toBeNull()
    await expect(rowEl(canvasElement, 'e-cms-2').querySelector('[data-group="content"]')).toBeNull()
  }
}

export const DetailAutomatic: Story = {
  name: 'Detail · Automatic (WP-Cron)',
  render: () => tab(wp([AUTOMATIC]), { open: ['e-auto'] }),
  play: async ({ canvasElement }) => {
    const row = within(rowEl(canvasElement, 'e-auto'))
    await expect(row.getByText(/WP-Cron was running/)).toBeVisible()
    await expect(row.getByText('Other recorded actions')).toBeVisible()
  }
}

export const DetailDeployment: Story = {
  name: 'Detail · Deployment (Tracy deploy, starter Unknown)',
  render: () => tab(wp([DEPLOY]), { open: ['e-deploy'] }),
  play: async ({ canvasElement }) => {
    const r = rowEl(canvasElement, 'e-deploy')
    await expect(r.querySelector('[data-cell="by"]')).toHaveTextContent('Tracy deploy')
    await expect(within(r).getByText(/Started by/)).toHaveTextContent(/Started by Unknown/)
    await expect(within(r).queryByRole('button', { name: 'Undo file changes…' })).toBeNull()
  }
}

export const DetailUnknown: Story = {
  name: 'Detail · Unknown, Detected time',
  render: () => tab(wp([UNKNOWN]), { open: ['e-unknown'] }),
  play: async ({ canvasElement }) => {
    const row = within(rowEl(canvasElement, 'e-unknown'))
    await expect(row.getByText(/When it happened is not known/)).toBeVisible()
    await expect(row.getByText(/could not tell how this change was made/)).toBeVisible()
    await expect(row.getByText(/Undo isn’t offered for changes Tracy didn’t make/)).toBeVisible()
  }
}

export const DetailRequestIncomplete: Story = {
  name: 'Detail · request cut when saved, and legacy request',
  render: () => tab(wp([TRUNCATED, LEGACY]), { open: ['e-truncated', 'e-legacy'] }),
  play: async ({ canvasElement }) => {
    await expect(
      within(rowEl(canvasElement, 'e-truncated')).getByText('Original request incomplete')
    ).toBeVisible()
    await expect(within(rowEl(canvasElement, 'e-truncated')).getByText('Outcome unknown')).toBeVisible()
    const legacy = within(rowEl(canvasElement, 'e-legacy'))
    await expect(legacy.getByText('Full original request unavailable')).toBeVisible()
    // Only the request is known: the Description says so with the Request label.
    await expect(legacy.getByText('Request', { selector: 'span' })).toBeVisible()
  }
}

export const DetailDark: Story = {
  name: 'Detail · Chat and Comment, dark',
  globals: { theme: 'dark' },
  render: () => tab(wp([CHAT_BOTH, COMMENT, UNKNOWN]), { open: ['e-chat-both', 'e-comment'] })
}

// ---------------------------------------------------------------------------------------------
// 3. Undo
// ---------------------------------------------------------------------------------------------

/** The dialog counts the target commit's files and names what it does not put back; then the result. */
export const UndoPartial: Story = {
  name: 'Undo · content + files, files undone only',
  render: () => tab(wp([CHAT_BOTH, COMMENT])),
  play: async ({ canvasElement }) => {
    const row = await openRow(canvasElement, 'e-chat-both')
    await userEvent.click(row.getByRole('button', { name: 'Undo file changes…' }))
    const dialog = within(await body().findByRole('dialog'))
    await expect(dialog.getByText('Undo file changes?')).toBeVisible()
    await expect(dialog.getByText('2 files go back to how they were before commit 7c1e0a9.')).toBeVisible()
    await expect(dialog.getByText('Not undone by this action')).toBeVisible()
    await expect(dialog.getByText('Updated page “About us”')).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Undo 2 files' }))
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull())
    // The event reads partly undone; its Description is NOT struck through.
    const r = rowEl(canvasElement, 'e-chat-both')
    await expect(
      within(r).getAllByText('Files undone · Content changes not undone by this action')[0]
    ).toBeVisible()
    const desc = within(r).getByText('Updated 1 page and 2 files')
    await expect(getComputedStyle(desc).textDecorationLine).toBe('none')
    // A new Site changes event, By the person who pressed it, linked to the target.
    const undo = rowEl(canvasElement, 'undo-7c1e0a94d2b8')
    await expect(undo.querySelector('[data-cell="source"]')).toHaveTextContent('Restore')
    await expect(undo.querySelector('[data-cell="by"]')).toHaveTextContent('Sam Ortiz')
    await expect(within(canvasElement).getByText('3 recorded events since v4')).toBeVisible()
  }
}

/** Already undone: the partly undone row, the files-only undone row, and their Undo events. */
export const UndoStates: Story = {
  name: 'Undo · states after undo, and the Undo events',
  render: () =>
    tab(wp([UNDO_PARTLY, PARTLY, UNDO_FILES, FILES_UNDONE, COMMENT]), { open: ['e-undo-partly'] }),
  play: async ({ canvasElement }) => {
    await expect(
      within(rowEl(canvasElement, 'e-partly')).getByText(
        'Files undone · Content changes not undone by this action'
      )
    ).toBeVisible()
    // The status is never cut short: the second half is the part that matters.
    const status = rowEl(canvasElement, 'e-partly').querySelector<HTMLElement>('[data-scope]')
    await expect(status && status.scrollWidth <= status.clientWidth).toBe(true)
    await expect(status && getComputedStyle(status).textOverflow).not.toBe('ellipsis')
    await expect(
      within(rowEl(canvasElement, 'e-files-undone')).getByText('File changes undone')
    ).toBeVisible()
    const undo = within(rowEl(canvasElement, 'e-undo-partly'))
    await expect(undo.getByText(/Sam Ortiz pressed Undo file changes/)).toBeVisible()
    await userEvent.click(undo.getByRole('button', { name: 'Show the event' }))
    await expect(toggleOf(rowEl(canvasElement, 'e-partly'))).toHaveAttribute('aria-expanded', 'true')
    // No Undo offered again on what is already undone.
    await expect(
      within(rowEl(canvasElement, 'e-partly')).queryByRole('button', { name: 'Undo file changes…' })
    ).toBeNull()
  }
}

/** One turn, two commits: the dialog counts the chosen commit only, and names the other as not undone. */
export const UndoOneOfTwoCommits: Story = {
  name: 'Undo · one event, two commits, undo the second',
  render: () => tab(wp([MULTI]), { open: ['e-multi'] }),
  play: async ({ canvasElement }) => {
    const moment = rowEl(canvasElement, 'e-multi').querySelector<HTMLElement>('[data-moment="c2c2c2a0b0e0"]')
    if (!moment) throw new Error('no second commit')
    await userEvent.click(within(moment).getByRole('button', { name: 'Undo file changes…' }))
    const dialog = within(await body().findByRole('dialog'))
    await expect(dialog.getByText('2 files go back to how they were before commit c2c2c2a.')).toBeVisible()
    await expect(dialog.getByText('Commit c1c1c1a · 1 file')).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: 'Undo 2 files' }))
    await waitFor(() => expect(body().queryByRole('dialog')).toBeNull())
    // The first commit is not marked undone, so the event is not either.
    const r = rowEl(canvasElement, 'e-multi')
    await expect(within(r).queryByText('File changes undone')).toBeNull()
    await expect(
      within(r.querySelector<HTMLElement>('[data-moment="c1c1c1a0b0e0"]') as HTMLElement).queryByText(
        'Undone'
      )
    ).toBeNull()
  }
}

// ---------------------------------------------------------------------------------------------
// 4. EmDash coverage
// ---------------------------------------------------------------------------------------------

export const EmDashCoverage: Story = {
  name: 'EmDash · untracked areas, never “0 files”',
  render: () => tab(em([EM_CHAT, EM_UNKNOWN, EM_ADMIN]), { siteKey: EM_SITE, open: ['e-em-chat'] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/\b0 files?\b/)).toBeNull()
    const row = within(rowEl(canvasElement, 'e-em-chat'))
    await expect(row.getAllByText('Not tracked on EmDash').length).toBe(2)
    await expect(row.getByText(/Undo isn’t offered on EmDash/)).toBeVisible()
    await expect(within(rowEl(canvasElement, 'e-em-chat')).getByText('1 page')).toBeVisible()
    // Content action with no id counts as an action, not a page.
    await expect(within(rowEl(canvasElement, 'e-em-unknown')).getByText('1 content action')).toBeVisible()
    await expect(canvas.getByText('What this list cannot see on EmDash')).toBeVisible()
    await expect(canvas.getByText(/does not cover menus, settings or media/)).toBeVisible()
  }
}

// ---------------------------------------------------------------------------------------------
// 5. Narrow panes, light and dark
// ---------------------------------------------------------------------------------------------

const narrowPlay =
  (width: number) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const pane = canvasElement.querySelector<HTMLElement>('[data-pane]')
    if (!pane) throw new Error('no pane')
    await expect(Math.round(pane.getBoundingClientRect().width)).toBe(width)
    // No sideways scroll anywhere in the pane.
    await expect(pane.scrollWidth).toBeLessThanOrEqual(pane.clientWidth + 1)
    // No column header; each value carries its own label, below the Description.
    await expect(canvasElement.querySelector('[data-colheader]')).not.toBeVisible()
    const r = rowEl(canvasElement, 'e-comment')
    const desc = r.querySelector('[data-cell="description"]')?.getBoundingClientRect()
    const time = r.querySelector('[data-cell="time"]')?.getBoundingClientRect()
    if (!desc || !time) throw new Error('missing cells')
    await expect(time.top).toBeGreaterThanOrEqual(desc.bottom - 1)
    await expect(r.querySelector('[data-meta]')).toHaveTextContent(/Time.*Type.*Comment.*By.*Sam Ortiz/)
    await openRow(canvasElement, 'e-comment')
    await expect(pane.scrollWidth).toBeLessThanOrEqual(pane.clientWidth + 1)
  }

export const Narrow360: Story = {
  name: 'Narrow · 360px pane',
  render: () => tab(wp(WP_ITEMS), { width: 360 }),
  play: narrowPlay(360)
}
export const Narrow360Dark: Story = {
  name: 'Narrow · 360px pane, dark',
  globals: { theme: 'dark' },
  render: () => tab(wp(WP_ITEMS), { width: 360 }),
  play: narrowPlay(360)
}
export const Narrow600: Story = {
  name: 'Narrow · 600px pane',
  render: () => tab(wp(WP_ITEMS), { width: 600 }),
  play: narrowPlay(600)
}
export const Narrow600Dark: Story = {
  name: 'Narrow · 600px pane, dark',
  globals: { theme: 'dark' },
  render: () => tab(wp(WP_ITEMS), { width: 600 }),
  play: narrowPlay(600)
}

// ---------------------------------------------------------------------------------------------
// 6. Grouping: V1 folded vs V2 one event per row, on the same three CMS admin edits
// ---------------------------------------------------------------------------------------------

/** The V1 drawing's shape for the same data: one outside-cms row holding the three edits. */
const V1_SAME: Activity = {
  since: { version: 4 },
  counts: { chat: 1, outside: 1, files: 2 },
  items: [
    {
      kind: 'outside-cms',
      id: 'v1-cms',
      at: CMS_1.time.at,
      sha: null,
      files: [],
      cms: 'WordPress',
      user: 'minh',
      edits: [
        { verb: 'Edited', type: 'page', name: 'About us', at: CMS_1.time.at },
        { verb: 'Changed', type: 'setting', name: 'Site tagline', at: CMS_2.time.at },
        { verb: 'Deleted', type: 'post', name: 'Summer opening hours 2025', at: CMS_3.time.at }
      ]
    },
    {
      kind: 'chat',
      id: 'v1-chat',
      at: CHAT_BOTH.time.at,
      sha: '7c1e0a94d2',
      by: MAI,
      title: CHAT_BOTH.request?.text ?? '',
      source: { kind: 'panel' },
      files: (CHAT_BOTH.moments?.[0]?.files ?? []).map((f) => ({ ...f })),
      writes: [{ via: 'apply', label: 'Wrote page content', target: 'About us · heading', ok: true }]
    } satisfies Turn
  ],
  coverage: { gitTruncated: false, cmsAdmin: { cms: 'WordPress', since: 'Sep 12', hook: 'v0.2.0' } }
}

export const GroupingV1VsV2: Story = {
  name: 'Grouping · V1 folded beside V2 one event per row',
  render: () => (
    <div className="grid min-h-screen grid-cols-1 gap-4 bg-background p-4 text-foreground lg:grid-cols-2">
      <section data-side="v1" className="min-w-0">
        <h2 className="m-0 mb-1 font-semibold text-sm">
          V1 · today: back-to-back CMS admin edits fold into one row
        </h2>
        <p className="m-0 mb-2 text-muted-foreground text-xs">
          One Description and one Time stand for three actions; the last edit’s time names the row.
        </p>
        <div className="tracy-site-tabs rounded-lg border border-border text-sm">
          <SiteChangesTurns siteKey={WP_SITE} sites={SITES} activity={V1_SAME} diffOf={() => ''} now={NOW} />
        </div>
      </section>
      <section data-side="v2" className="min-w-0">
        <h2 className="m-0 mb-1 font-semibold text-sm">V2 · proposed: each recorded event on its own row</h2>
        <p className="m-0 mb-2 text-muted-foreground text-xs">
          No correlation id joins them, so each keeps its own Description, Time and By. Rows fold only when an
          operation id proves they are one action.
        </p>
        <div className="tracy-site-tabs rounded-lg border border-border text-sm">
          <SiteChangesV2
            siteKey={WP_SITE}
            sites={SITES}
            activity={wp([CMS_1, CMS_2, CMS_3, CHAT_BOTH])}
            viewer={SAM}
            now={NOW}
          />
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const v1 = canvasElement.querySelector<HTMLElement>('[data-side="v1"]')
    const v2 = canvasElement.querySelector<HTMLElement>('[data-side="v2"]')
    if (!v1 || !v2) throw new Error('missing side')
    await expect(v1.querySelectorAll('li[data-kind="outside-cms"]').length).toBe(1)
    await expect(v2.querySelectorAll('[data-event][data-source="cms-admin"]').length).toBe(3)
    await expect(within(v2).getByText('Updated setting “Site tagline”')).toBeVisible()
  }
}
