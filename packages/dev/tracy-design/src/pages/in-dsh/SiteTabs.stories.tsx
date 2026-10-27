/**
 * The site tabs of `@tracy/dsh-site-tabs` — Team and Site changes — as the plugin
 * mounts them, on the real components from `@tracy/core/site-tabs`. Reviewed as
 * `Mockups/Sidebar site tabs` on 04/09; this is the port, so what shows here is what a lane
 * renders (minus dsh's tab strip, which only exists inside dsh).
 *
 * Storybook has no tracy-web behind it, so `fetch` is answered here with the shapes it returns:
 * `/activity?version=2` as `apps/tracy-web/test/site-activity-v2.test.mjs` asserts it, and
 * `/changes`, `/backups` as `packages/fleet/tracy-fleet-operation/test/webroot-git.test.mjs`
 * asserts them against the real fleet script.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'
import { type ActivityV2, type Backups, ChangesView, type Changes, TeamView } from '@tracy/core/site-tabs'

// The plugin's own `tv-*` rules. Without them every row of these tabs rendered unstyled here (the
// header stuck nowhere, rows had no layout): the plugin injects them from its bundle, which Storybook
// does not run. The other states of Site changes are drawn in `Mockups/Site changes V2` and
// `Mockups/Site changes backup`, and driven in the plugin's e2e tests.
import '../../../../../site/tracy-site-tabs/src/client/site-tabs-rules.css'
import { en as siteTabsEn } from '../../../../../site/tracy-site-tabs/src/client/strings'
import viSiteTabs from '../../../../../locale/tracy-locale-vi/vi/tracy-site-tabs.json'

const meta: Meta = {
  title: 'Pages/In dsh/Site tabs',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

const lookup =
  (dict: Record<string, string>) =>
  (key: string, params?: Record<string, string | number>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
      params && name in params ? String(params[name]) : m
    )
const en = lookup(siteTabsEn as Record<string, string>)
const vi = lookup(viSiteTabs as Record<string, string>)

const ME = 'patowner@example.com'
const SITE = 'fijitrips.example'
const SITES = [
  { siteKey: 'joomlart.com', role: 'owner' },
  { siteKey: 'tracy.ai', role: 'owner' },
  { siteKey: SITE, role: 'owner' },
  { siteKey: 'gymshark.com', role: 'editor' }
]

const hoursAgo = (h: number): number => Math.floor(Date.now() / 1000) - h * 3600
const LEE = { kind: 'person', name: 'Lee', email: ME } as const
const HANA = { kind: 'person', name: 'Hana', email: 'hanaops@example.com' } as const

const CHANGES: Changes = {
  since: { version: 4, sha: 'f9c21ab' },
  moments: [
    {
      sha: 'b3b9542',
      at: hoursAgo(0.3),
      by: { kind: 'outside' },
      kind: 'outside',
      title: 'changes made to the site outside Tracy',
      files: 3
    },
    {
      sha: 'a1c2d3e',
      at: hoursAgo(2),
      by: { kind: 'agent' },
      kind: 'moment',
      title: 'Tighten the footer wrap at 1100px',
      files: 2
    }
  ],
  files: [
    {
      path: 'templates/ja_v5/css/custom.css',
      status: 'modified',
      additions: 31,
      deletions: 32,
      zone: 'design',
      by: { kind: 'agent' }
    },
    {
      path: 'templates/ja_v5/tpls/blocks/head.php',
      status: 'modified',
      additions: 2,
      deletions: 4,
      zone: 'design',
      by: { kind: 'agent' }
    },
    {
      path: 'plugins/system/jce/jce.xml',
      status: 'modified',
      additions: 1,
      deletions: 1,
      zone: 'addons',
      by: { kind: 'outside' }
    },
    {
      path: 'plugins/system/jce/jce.php',
      status: 'modified',
      additions: 12,
      deletions: 3,
      zone: 'addons',
      by: { kind: 'outside' }
    },
    {
      path: 'images/home/masthead-hero.webp',
      status: 'added',
      additions: null,
      deletions: null,
      zone: 'content',
      by: { kind: 'outside' }
    }
  ]
}

const iso = (h: number): string => new Date(hoursAgo(h) * 1000).toISOString()
const none = { resources: [], operations: 0 }
const OUTSIDE_SHA = 'b3b9542'.padEnd(40, '0')
const TURN_SHA = 'a1c2d3e'.padEnd(40, '0')

/** What `GET …/activity?version=2` answers for this site: files changed outside Tracy, and one chat turn. */
const ACTIVITY: ActivityV2 = {
  schemaVersion: 2,
  items: [
    {
      id: OUTSIDE_SHA,
      kind: 'outside-files',
      origin: { source: 'unknown', evidence: 'unknown' },
      actor: { type: 'unknown', role: 'executor' },
      description: { key: 'files.changed-source-unknown', params: { files: 3 }, isRequestOnly: false },
      occurredAt: null,
      detectedAt: iso(0.3),
      timeBasis: 'detected',
      effects: {
        content: none,
        settings: none,
        files: { count: 3, sha: OUTSIDE_SHA, state: 'recorded' },
        other: { operations: 0, actions: [] },
        coverage: { files: 'recorded', content: 'recorded' }
      },
      request: { state: 'none' },
      reversal: { state: 'none' },
      capabilities: { canDiff: true, canUndoFiles: false, reasons: ['outside'] },
      evidence: { commitSha: OUTSIDE_SHA },
      reply: null,
      conversation: null
    },
    {
      id: 'session-1:2',
      kind: 'turn',
      origin: { source: 'chat', evidence: 'confirmed' },
      actor: { type: 'person', id: `tracy:${ME}`, name: 'Lee', role: 'requester' },
      executor: { type: 'system', id: 'service:tracy', name: 'Tracy', role: 'executor' },
      description: { key: 'files.changed', params: { files: 2 }, isRequestOnly: false },
      occurredAt: iso(2),
      detectedAt: null,
      timeBasis: 'occurred',
      endedAt: iso(1.9),
      state: 'closed',
      flags: { unsealedStart: false, concurrent: false, steered: false },
      effects: {
        content: none,
        settings: none,
        files: { count: 2, sha: TURN_SHA, state: 'recorded' },
        other: { operations: 0, actions: [] },
        coverage: { files: 'recorded', content: 'recorded' }
      },
      request: { text: 'Tighten the footer wrap at 1100px', state: 'full' },
      reversal: { state: 'none' },
      capabilities: { canDiff: true, canUndoFiles: true, reasons: [] },
      evidence: { turnId: 'session-1:2', commitSha: TURN_SHA },
      reply: null,
      conversation: { sessionId: 'session-1', turn: 2, promptMessageId: null, mine: true }
    }
  ],
  nextCursor: null,
  counts: {
    all: 2,
    chat: 1,
    comment: 0,
    'design-system': 0,
    setup: 0,
    api: 0,
    'cms-admin': 0,
    automatic: 0,
    deployment: 0,
    'site-changes': 0,
    unknown: 1,
    complete: true,
    reasons: []
  },
  coverage: { git: 'read', gitTruncated: false, since: null, fileHistory: true, cmsLog: null }
}

const FULL = { state: 'full', engine: 'mariadb', sha256: 'ab'.repeat(32), size: 1_880_000 } as const

/** What `GET …/backups` answers: the backup points, and the moments between them. */
const BACKUPS: Backups = {
  latest: { version: 4, sha: 'f9c21ab' },
  rows: [
    {
      sha: 'b3b9542',
      at: hoursAgo(0.3),
      by: { kind: 'outside' },
      kind: 'outside',
      title: 'changes made to the site outside Tracy',
      files: 3
    },
    {
      sha: 'a1c2d3e',
      at: hoursAgo(2),
      by: { kind: 'agent' },
      kind: 'moment',
      title: 'Tighten the footer wrap at 1100px',
      files: 2
    },
    {
      kind: 'backup',
      version: 4,
      sha: 'f9c21ab',
      title: 'Masthead tagline rewrite',
      notes: '· Rewrite the masthead tagline\nAdd-ons\n· 2 files changed on the site outside Tracy',
      at: hoursAgo(2),
      by: LEE,
      files: 5,
      database: FULL
    },
    {
      sha: '0f1e2d3',
      at: hoursAgo(26),
      by: { kind: 'agent' },
      kind: 'moment',
      title: 'Rewrite the masthead tagline',
      files: 1
    },
    {
      kind: 'backup',
      version: 3,
      sha: 'a17d930',
      title: 'Footer wrap fix at 1100px',
      notes: null,
      at: hoursAgo(28),
      by: HANA,
      files: 4
    },
    {
      kind: 'backup',
      version: 2,
      sha: '8b40c1e',
      title: 'New pricing table',
      notes: null,
      at: hoursAgo(72),
      by: LEE,
      files: 9
    },
    {
      kind: 'backup',
      version: 1,
      sha: '2f91d05',
      title: 'Initial release',
      notes: null,
      at: hoursAgo(168),
      by: { kind: 'agent' },
      files: 1240,
      database: FULL
    }
  ]
}

const seat = (
  id: string,
  email: string,
  name: string | null,
  role: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  email,
  displayName: name,
  avatarUrl: null,
  role,
  status: 'active',
  grantedAt: new Date(Date.now() - 21 * 86_400_000).toISOString(),
  grantedBy: ME,
  revokedAt: null,
  requestedAt: null,
  scope: 'site',
  ...extra
})
const TEAM = {
  sites: [
    {
      siteKey: SITE,
      platform: 'wordpress',
      myRole: 'owner',
      status: 'accepted',
      seats: [
        seat('g1', ME, 'Lee', 'owner'),
        seat('g2', 'hanaops@example.com', 'Hana', 'editor'),
        seat('g3', 'dev@studio.example', null, 'viewer', {
          status: 'invited',
          grantedAt: new Date(Date.now() - 3600_000).toISOString()
        }),
        seat('g4', 'samfounder@example.com', null, 'editor', {
          status: 'invited',
          requestedAt: new Date(Date.now() - 1200_000).toISOString(),
          grantedBy: null
        })
      ]
    }
  ]
}

/** Answers every door the tabs open. */
function WithSite({ children }: { children: ReactNode }) {
  const [real] = useState(() => {
    const original = window.fetch
    const answer = (body: unknown) =>
      Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }))
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('/changes')) return answer(CHANGES)
      if (url.includes('/activity')) return answer(ACTIVITY)
      if (url.endsWith('/backups')) return answer(BACKUPS)
      if (url.endsWith('/backup'))
        return answer({ ok: true, version: 5, title: 'x', sha: 'c0ffee', database: FULL })
      if (url.startsWith('/api/sites'))
        return answer({ sites: SITES.map((s) => ({ ...s, status: 'accepted', agent: '/', copyUrl: null })) })
      if (url.startsWith('/api/team')) return answer(TEAM)
      if (url.startsWith('/auth/me')) return answer({ email: ME })
      return original(input, init)
    }
    return original
  })
  useEffect(
    () => () => {
      window.fetch = real
    },
    [real]
  )
  return children
}

function frame(node: ReactNode) {
  return (
    <div className="h-screen overflow-auto bg-background text-foreground">
      <div className="mx-auto max-w-3xl border-border border-x">
        <div className="tracy-site-tabs text-sm">{node}</div>
      </div>
    </div>
  )
}

const shared = { siteKey: SITE, role: 'owner', sites: SITES, onPick: () => {} }

export const Team: Story = {
  name: 'Team · one site (en)',
  render: () =>
    frame(
      <WithSite>
        <TeamView {...shared} t={en} />
      </WithSite>
    )
}

export const TeamHighlight: Story = {
  name: 'Team · arrived from the join-request mail',
  render: () =>
    frame(
      <WithSite>
        <TeamView {...shared} highlight="samfounder@example.com" t={en} />
      </WithSite>
    )
}

export const ChangesTab: Story = {
  name: 'Site changes (en)',
  render: () =>
    frame(
      <WithSite>
        <ChangesView {...shared} t={en} />
      </WithSite>
    )
}

export const ChangesVietnamese: Story = {
  name: 'Site changes (vi)',
  render: () =>
    frame(
      <WithSite>
        <ChangesView {...shared} t={vi} />
      </WithSite>
    )
}
