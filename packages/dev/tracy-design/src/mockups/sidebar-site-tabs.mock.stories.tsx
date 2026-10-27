/**
 * THROWAWAY MOCK — Phase A: Team · Changes · History as three TAB TYPES of better-sidebar. Not
 * shipped code.
 *
 * THE QUESTION IT EXISTS TO ANSWER (Lee, 04/09 evening): what does the side card look like once a
 * site's team, its unrecorded changes and its history are tabs of their own — opened from the
 * `+` menu, from the Team cluster on a My Sites row, or from the `…` menu — instead of a drawer
 * under the row? And what does "Open live site" look like when it is simply the Browser tab with
 * the address filled in?
 *
 * DRAWN FROM THE CODE, NOT FROM MEMORY. The tab strip below uses better-sidebar's OWN stylesheet
 * (`vendor/tracy/dsh-better-sidebar/src/client/sidebar.module.css`: `.tabBar`, `.tab`, `.tabActive`,
 * `.tabTitle`, `.tabClose`, `.tabBarPlus`) on the same markup `TabBar.tsx` renders, so the strip
 * is the strip. The real `TabBar` component itself cannot be mounted here: it imports `Menu` from
 * `@deepseek-ai/dsh-client-ui-primitives`, a package that only exists inside a dsh profile. The
 * Team tab's table is the real `Roster` from `tracy-my-sites` (the code Phase A moves into its
 * own package); Changes and History are hand-drawn, since no plugin exists for them yet.
 *
 * The stylesheet reads `--dsw-alias-*`, which dsh sets on `<body>` and this bench does not; the
 * frame below maps the six it needs onto `tokens.css` so the strip has colour. Inside dsh the
 * aliases are present and win (`DESIGN.md` §1.1).
 *
 * WHAT IS NOT BEING ASKED: registration mechanics. `registerTab({ id, title, icon, order,
 * component })` is what `tracy-my-sites` already does; a tab per site is `openTab({ type, id:
 * \`tracy:team:<siteKey>\`, meta: { siteKey } })` — `meta` is persisted and restored by the sidebar
 * (`OpenTabSeed.meta`, v0.12+).
 *
 * ⚠ MODE A. PORTED 04/09 evening: the real tabs live in `@tracy/dsh-site-tabs` on
 * `@tracy/core/site-tabs`, and `Pages/In dsh/Site tabs` mounts them. Kept for the team as the
 * reviewed reference of the strip and the `+` menu, like `my-team.mock`.
 *
 * SUPERSEDED IN PART (03/10/2026, ADR 0024 amendment 2): the History tab (titled Releases), its
 * Create release dialog and the stories that drew them are gone with the tab itself. A good point
 * is kept as a Backup in Site changes now (`Mockups/Site changes · Backup`), so the Changes tab
 * below says Create a backup.
 */
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Archive,
  Bot,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Globe,
  Layers2,
  ListChecks,
  ListTodo,
  LogOut,
  Plus,
  Puzzle,
  SquareTerminal,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users,
  X
} from 'lucide-react'
import type { ReactNode } from 'react'

import { addressFace, Face, Roster } from '@tracy/core/team'
import { en as siteTabsEn } from '../../../../site/tracy-site-tabs/src/client/strings'
import { releases } from '../fixtures'
import css from '../../../../../vendor/tracy/dsh-better-sidebar/src/client/sidebar.module.css'

const meta: Meta = {
  title: 'Mockups/Sidebar site tabs',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

// ── The side card frame, on better-sidebar's stylesheet ──────────────────────────────────────

/** The aliases the strip reads, mapped onto the bench's tokens. Inside dsh these come from dsh. */
const ALIASES = {
  '--dsw-alias-bg-layer-1': 'var(--card)',
  '--dsw-alias-border-l1': 'var(--border)',
  '--dsw-alias-label-primary': 'var(--foreground)',
  '--dsw-alias-label-secondary': 'var(--muted-foreground)',
  '--dsw-alias-label-tertiary': 'var(--muted-foreground)',
  '--dsw-alias-interactive-bg-active': 'var(--muted)',
  '--dsw-alias-interactive-bg-hover': 'var(--accent)',
  '--dsw-alias-brand-primary': 'var(--primary)',
  '--dsw-font-xxs-12': '400 12px/16px ui-sans-serif, system-ui, sans-serif',
  '--dsw-font-xxxs-strong-11': '600 11px/14px ui-sans-serif, system-ui, sans-serif'
} as Record<string, string>

interface Tab {
  id: string
  type: string
  title: string
  icon: ReactNode
}

/** What the strip holds today on a lane, before Phase A. */
const TODAY: Tab[] = [
  { id: 'editor', type: 'editor', title: 'Files', icon: <FolderOpen size={14} /> },
  { id: 'browser', type: 'browser', title: 'Browser', icon: <Globe size={14} /> },
  {
    id: 'tracy:my-sites',
    type: 'tracy:my-sites',
    title: 'My Sites',
    icon: <Layers2 size={14} strokeWidth={1.8} />
  }
]

const TEAM: Tab = {
  id: 'tracy:team:tracy.ai',
  type: 'tracy:team',
  title: 'Team · tracy.ai',
  icon: <Users size={14} />
}
const CHANGES: Tab = {
  id: 'tracy:changes:tracy.ai',
  type: 'tracy:changes',
  title: 'Changes · tracy.ai',
  icon: <ListChecks size={14} />
}
const LIVE: Tab = {
  id: 'tracy:site-live',
  type: 'browser',
  title: 'fijitrips.example',
  icon: <Globe size={14} />
}

/**
 * The `+` menu as the registry orders it: Tracy's tabs lead (Add site 1, My Sites 2, then the
 * new ones), the built-ins keep their order. Labels are the descriptors' `title()`.
 */
const NEW_TAB_OPTIONS: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'tracy:add-site', label: 'Add site', icon: <Plus size={14} /> },
  { id: 'tracy:my-sites', label: 'My Sites', icon: <Layers2 size={14} strokeWidth={1.8} /> },
  { id: 'tracy:team', label: 'Team', icon: <Users size={14} /> },
  { id: 'tracy:changes', label: 'Changes', icon: <ListChecks size={14} /> },
  { id: 'editor', label: 'Files', icon: <FolderOpen size={14} /> },
  { id: 'browser', label: 'Browser', icon: <Globe size={14} /> },
  { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={14} /> },
  { id: 'git', label: 'Source Control', icon: <GitBranch size={14} /> },
  { id: 'subagent', label: 'Tasks', icon: <ListTodo size={14} /> },
  { id: 'diff', label: 'Diff', icon: <Puzzle size={14} /> }
]

function SideCard({
  tabs,
  active,
  plusOpen = false,
  children
}: {
  tabs: Tab[]
  active: string
  plusOpen?: boolean
  children: ReactNode
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card"
      style={ALIASES as React.CSSProperties}
    >
      <div className={css.tabBar}>
        <div className={css.tabList}>
          {tabs.map((tab) => (
            <div key={tab.id} className={cn(css.tab, active === tab.id && css.tabActive)}>
              {tab.icon}
              <span className={css.tabTitle}>{tab.title}</span>
              <button type="button" className={css.tabClose} aria-label="Close">
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={cn(css.tabBarPlus, plusOpen && css.tabActive)}
            aria-label="New tab"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      {/* The + menu is a portal in the real TabBar; here it sits under the bar, outside `.tabList`
          (a scroll container that would clip it). */}
      {plusOpen ? (
        <div className="relative">
          <ul className="absolute top-1 left-[26rem] z-10 m-0 w-52 list-none rounded-md border border-border bg-popover p-1 text-popover-foreground text-sm shadow-md">
            {NEW_TAB_OPTIONS.map((o, i) => (
              <li key={o.id}>
                {i === 5 ? (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <div className="px-2 pt-1 pb-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      Dev tools
                    </div>
                  </>
                ) : null}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                >
                  {o.icon}
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}

function Frame({ note, children }: { note: string; children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <p className="m-0 px-6 pt-4 pb-2 text-muted-foreground text-xs">{note}</p>
      {/* The lane's page: the conversation column dsh owns on the left, the side card on the right. */}
      <div className="flex min-h-0 flex-1 gap-3 px-6 pb-6">
        <div className="hidden w-72 flex-none items-center justify-center rounded-lg border border-border border-dashed text-muted-foreground text-xs lg:flex">
          dsh conversation column
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

/**
 * The sites the viewer holds a seat on — what `/api/sites` answers, which is also what My Sites
 * lists. The picker in every site tab's header is this list.
 */
const MY_SITES = [
  { key: 'beta.tracy.ai', role: 'owner' },
  { key: 'gymshark.com', role: 'owner' },
  { key: 'joomlart.com', role: 'owner' },
  { key: 'tracy.ai', role: 'owner' },
  { key: 'juneflower.tracy.ai', role: 'owner' },
  { key: 'demo-tracy.myshopify.com', role: 'editor' },
  { key: 'fijitrips.example', role: 'owner' },
  { key: 'shop.acme.com', role: 'viewer' }
]

/**
 * A header every site tab opens with: WHICH site — as a picker, because the tab type is one and
 * the sites are many (Lee, 04/09 19:24) — your role there, and the tab's one action. Picking
 * another site re-reads the tab for it and renames the tab (`Team · joomlart.com`); the tab's
 * `meta.siteKey` follows, so a reload lands on the same site.
 */
function TabHeader({
  site,
  role,
  hint,
  action,
  pickerOpen = false
}: {
  site: string
  role: string
  hint: string
  action?: ReactNode
  pickerOpen?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-border border-b px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <DropdownMenu open={pickerOpen || undefined}>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="sm" className="-ml-1 gap-1.5 px-2 font-semibold" />}
          >
            {site}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="text-muted-foreground text-xs">Show this tab for</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MY_SITES.map((s) => (
              <DropdownMenuItem key={s.key} className="justify-between">
                <span className="flex items-center gap-2">
                  <Check className={cn('size-3.5', s.key === site ? 'opacity-100' : 'opacity-0')} />
                  {s.key}
                </span>
                <span className="text-muted-foreground text-xs">{s.role}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="shrink-0 text-muted-foreground text-xs">{role}</span>
        <span className="hidden truncate text-muted-foreground text-xs sm:inline">· {hint}</span>
      </div>
      {action}
    </div>
  )
}

// ── Tab contents ─────────────────────────────────────────────────────────────────────────────

const lookup =
  (dict: Record<string, string>) =>
  (key: string, params?: Record<string, string | number>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
      params && name in params ? String(params[name]) : m
    )
const t = lookup(siteTabsEn as Record<string, string>)

const ME = 'patowner@example.com'
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const seat = (
  id: string,
  email: string,
  role: 'owner' | 'editor' | 'viewer',
  extra: Record<string, unknown> = {}
) =>
  ({
    id,
    email,
    displayName: null,
    avatarUrl: null,
    role,
    status: 'active',
    grantedAt: ago(21),
    grantedBy: ME,
    revokedAt: null,
    requestedAt: null,
    scope: 'site',
    ...extra
  }) as never

const teamSite = {
  siteKey: 'tracy.ai',
  platform: 'wordpress',
  myRole: 'owner' as const,
  status: 'accepted',
  seats: [
    seat('s0', ME, 'owner', { grantedAt: ago(30) }),
    seat('s1', 'alexshop@example.com', 'editor', { grantedAt: ago(2) }),
    seat('s2', 'victorl@example.com', 'viewer', {
      displayName: 'Vincent',
      status: 'revoked',
      revokedAt: ago(5)
    }),
    seat('s3', 'maibuilds@example.com', 'editor', {
      displayName: 'Mai',
      status: 'invited',
      grantedAt: ago(1)
    }),
    seat('s4', 'samfounder@example.com', 'editor', {
      status: 'invited',
      requestedAt: ago(0.02),
      grantedAt: ago(0.02),
      grantedBy: 'samfounder@example.com'
    })
  ]
}

function TeamTabBody() {
  return (
    <>
      <TabHeader
        site="tracy.ai"
        role="owner"
        hint="5 people"
        action={
          <Button size="sm" variant="outline">
            <UserPlus />
            Invite member
          </Button>
        }
      />
      <div className="p-4">
        <Roster
          site={teamSite}
          viewer={{ email: ME, role: 'owner' }}
          busy={false}
          onChangeRole={() => {}}
          onRemove={() => {}}
          onReinvite={() => {}}
          onApprove={() => {}}
          onAnswerEdit={() => {}}
          t={t as never}
        />
      </div>
    </>
  )
}

const STATUS_STYLE: Record<string, string> = {
  M: 'text-amber-600 dark:text-amber-400',
  A: 'text-green-600 dark:text-green-400',
  D: 'text-red-600 dark:text-red-400'
}

/**
 * Who did what (Lee, 04/09 evening): every row names its actor. Moments are written by the
 * MACHINE — the agent's writes land as one commit each (`webroot-edit.sh`), and edits made on the
 * site itself are sealed into one "outside Tracy" commit.
 */
type Actor =
  | { kind: 'agent' }
  | { kind: 'outside' }
  | {
      kind: 'person'
      email: string
      name: string
      face?: { initial: string; color: string; avatarUrl: string | null } | null
    }
const AGENT: Actor = { kind: 'agent' }
const OUTSIDE: Actor = { kind: 'outside' }
/** A seat the server sent a face for (`personFace`): the colour the Team tab shows for her. */
const MAI: Actor = {
  kind: 'person',
  email: 'mai@example.test',
  name: 'Mai Tran',
  face: { initial: 'M', color: '#db2777', avatarUrl: null }
}
/** A person with no face from the server (an older server, no account match): the letter on grey. */
const SAM: Actor = { kind: 'person', email: 'sam@example.test', name: 'Sam', face: null }

type Moment = {
  id: string
  kind: 'checkpoint' | 'outside'
  title: string
  ago: string
  files: number
  by: Actor
}

/** The moments since the latest backup: what Changes lists above its files. */
const moments: Moment[] = [
  {
    id: 'm1',
    kind: 'outside',
    title: 'Changes made outside Tracy',
    ago: '20 minutes ago',
    files: 3,
    by: OUTSIDE
  },
  {
    id: 'm2',
    kind: 'checkpoint',
    title: 'Tighten the footer wrap at 1100px',
    ago: '2 hours ago',
    files: 2,
    by: AGENT
  },
  {
    id: 'm3',
    kind: 'checkpoint',
    title: 'Swap the hero picture',
    ago: '3 hours ago',
    files: 1,
    by: MAI
  }
]

/**
 * Changes = everything since the latest backup (Lee, 04/09; Backup since 03/10): the moments the
 * machine wrote since Backup 4, and the files they add up to — the same six files, seen two ways.
 * Each file shows who touched it. Create a backup keeps exactly this as Backup 5.
 */
const CHANGED: {
  group: string
  files: { path: string; status: 'M' | 'A' | 'D'; additions?: number; deletions?: number; by: Actor }[]
}[] = [
  {
    group: 'Design',
    files: [
      { path: 'templates/ja_v5/css/custom.css', status: 'M', additions: 31, deletions: 32, by: AGENT },
      { path: 'templates/ja_v5/tpls/blocks/head.php', status: 'M', additions: 2, deletions: 4, by: AGENT }
    ]
  },
  {
    group: 'Add-ons',
    files: [
      { path: 'plugins/system/jce/jce.xml', status: 'M', additions: 1, deletions: 1, by: OUTSIDE },
      { path: 'plugins/system/jce/jce.php', status: 'M', additions: 12, deletions: 3, by: OUTSIDE }
    ]
  },
  {
    group: 'Content',
    files: [
      { path: 'images/home/masthead-hero.webp', status: 'A', by: MAI },
      { path: 'images/home/masthead-old.webp', status: 'D', by: SAM }
    ]
  }
]

function ChangesTabBody({ pickerOpen = false }: { pickerOpen?: boolean }) {
  const since = moments
  const total = CHANGED.reduce((n, g) => n + g.files.length, 0)
  const latest = releases[0].version
  return (
    <>
      <TabHeader
        pickerOpen={pickerOpen}
        site="tracy.ai"
        role="owner"
        hint={`since Backup ${latest} · ${since.length} moments · ${total} files`}
        action={
          <Button size="sm">
            <Archive />
            Create a backup
          </Button>
        }
      />
      <div className="px-4 py-3">
        <div className="mb-1.5 font-medium text-muted-foreground text-xs">Since Backup {latest}</div>
        <ol className="m-0 mb-4 list-none">
          {since.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60"
            >
              <ActorFace by={m.by} />
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              <span className="flex-none text-muted-foreground text-xs">
                {actorName(m.by)} · {m.ago} · {m.files} files
              </span>
            </li>
          ))}
        </ol>
        <div className="mb-1.5 font-medium text-muted-foreground text-xs">Files</div>
        {CHANGED.map((g) => (
          <div key={g.group} className="mb-3 last:mb-0">
            <div className="mb-1 flex items-center gap-1.5 text-muted-foreground text-xs">
              {g.group === 'Core' ? <TriangleAlert className="size-3 text-amber-500" /> : null}
              {g.group}
            </div>
            {g.files.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60"
              >
                <span className={cn('w-3 flex-none font-bold font-mono text-[11px]', STATUS_STYLE[f.status])}>
                  {f.status}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{f.path}</span>
                <span className="flex-none font-mono text-[11px]">
                  {f.additions ? (
                    <span className="text-green-600 dark:text-green-400">+{f.additions}</span>
                  ) : null}{' '}
                  {f.deletions ? (
                    <span className="text-red-600 dark:text-red-400">−{f.deletions}</span>
                  ) : null}
                </span>
                <span className="flex-none scale-75" title={actorName(f.by)}>
                  <ActorFace by={f.by} />
                </span>
              </div>
            ))}
          </div>
        ))}
        <p className="m-0 mt-3 text-muted-foreground text-xs">
          Create a backup keeps all of this, with the site's database, as Backup {latest + 1}; its notes are
          drafted from the moments above.
        </p>
      </div>
    </>
  )
}

/** The face on a row: the person's avatar, the agent's mark, or the site itself for outside edits. */
function ActorFace({ by }: { by: Actor }) {
  if (by.kind === 'person') {
    // The server's face when it sent one, else `addressFace` — as `ActorFace` in `@tracy/core`.
    return <Face face={by.face ?? addressFace(by.name || by.email)} size={24} />
  }
  return (
    <span
      className={cn(
        'flex size-6 flex-none items-center justify-center rounded-full border',
        by.kind === 'agent'
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {by.kind === 'agent' ? <Bot className="size-3.5" /> : <Globe className="size-3.5" />}
    </span>
  )
}

const actorName = (by: Actor) =>
  by.kind === 'person' ? by.name : by.kind === 'agent' ? 'Agent' : 'On the site'

function BrowserTabBody() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-border border-b px-3 py-2">
        <input
          readOnly
          value="https://fijitrips-example-5254d120.tracy.ai/"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
        />
        <Button size="sm" variant="ghost" title="Open in a new window">
          <ExternalLink />
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center bg-muted/30 text-muted-foreground text-sm">
        the site, framed — better-sidebar's Browser tab as it already ships
      </div>
    </div>
  )
}

function MySitesRowsBody({ menu = false }: { menu?: boolean }) {
  const rowsList = [
    { key: 'joomlart.com', role: 'owner', people: 2 },
    { key: 'tracy.ai', role: 'owner', people: 21 },
    { key: 'fijitrips.example', role: 'owner', people: 4 }
  ]
  return (
    <div className="p-4 text-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_8rem_7rem_3rem] items-center gap-3 border-border border-b pb-2 text-muted-foreground text-xs">
        <span>Site</span>
        <span>Team</span>
        <span className="text-right">Agent</span>
        <span className="text-right">More</span>
      </div>
      <ul className="m-0 list-none divide-y divide-border p-0">
        {rowsList.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_8rem_7rem_3rem] items-center gap-3 py-2.5">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-semibold">{r.key}</span>
              <span className="text-muted-foreground text-xs">{r.role}</span>
            </span>
            <button
              type="button"
              className={cn(
                'flex w-fit items-center gap-2 rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-muted hover:text-foreground',
                r.key === 'tracy.ai' && 'bg-muted text-foreground'
              )}
              title="Open the Team tab"
            >
              <Users className="size-3.5" />
              {r.people}
            </button>
            <span className="flex justify-end">
              <Button variant="outline" size="sm">
                Chat
              </Button>
            </span>
            <span className="relative flex justify-end">
              <Button variant="ghost" size="icon-sm" aria-label="More">
                ⋯
              </Button>
              {menu && r.key === 'tracy.ai' ? (
                <ul className="absolute top-full right-0 z-10 m-0 mt-1 w-52 list-none rounded-md border border-border bg-popover p-1 text-popover-foreground text-sm shadow-md">
                  {(
                    [
                      { label: 'Open live site', icon: <ExternalLink className="size-4" /> },
                      { label: 'Open admin', icon: <ExternalLink className="size-4" /> },
                      { label: 'Copy address', icon: <Copy className="size-4" /> },
                      null,
                      { label: 'Team', icon: <Users className="size-4" /> },
                      { label: 'Changes', icon: <ListChecks className="size-4" /> },
                      null,
                      { label: 'Leave site', icon: <LogOut className="size-4" /> },
                      { label: 'Delete site…', icon: <Trash2 className="size-4" />, danger: true }
                    ] as ({ label: string; icon: ReactNode; danger?: boolean } | null)[]
                  ).map((item, i) =>
                    item === null ? (
                      <li key={i} className="my-1 h-px bg-border" />
                    ) : (
                      <li
                        key={item.label}
                        className={cn(
                          'flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent',
                          item.danger && 'text-destructive'
                        )}
                      >
                        {item.icon}
                        {item.label}
                      </li>
                    )
                  )}
                </ul>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Stories ──────────────────────────────────────────────────────────────────────────────────

export const StripToday: Story = {
  name: '0 · The side card today',
  render: () => (
    <Frame note="What a lane's side card holds today: Files, Browser, My Sites. The strip is drawn on better-sidebar's own stylesheet.">
      <SideCard tabs={TODAY} active="tracy:my-sites">
        <MySitesRowsBody />
      </SideCard>
    </Frame>
  )
}

export const PlusMenu: Story = {
  name: '1 · The + menu with the new tab types',
  render: () => (
    <Frame note="Every tab type the registry knows, Tracy's first. Team and Changes are registered like My Sites and appear here on their own — nothing to wire in the menu itself.">
      <SideCard tabs={TODAY} active="tracy:my-sites" plusOpen>
        <MySitesRowsBody />
      </SideCard>
    </Frame>
  )
}

export const TeamTab: Story = {
  name: '2 · Team · tracy.ai — a tab of its own',
  render: () => (
    <Frame note="Opened from the Team cluster on the row, from the … menu, or from +. The title carries the site; a second site opens a second tab. The table is the real Roster from tracy-my-sites.">
      <SideCard tabs={[...TODAY, TEAM]} active={TEAM.id}>
        <TeamTabBody />
      </SideCard>
    </Frame>
  )
}

export const ChangesTab: Story = {
  name: '3 · Changes · tracy.ai',
  render: () => (
    <Frame note="What changed since the latest backup, grouped by zone (Core flagged). One button, Create a backup (Create release until ADR 0024): files and the database kept as one point. Backend: GET /api/sites/:key/changes, POST …/backup.">
      <SideCard tabs={[...TODAY, TEAM, CHANGES]} active={CHANGES.id}>
        <ChangesTabBody />
      </SideCard>
    </Frame>
  )
}

export const SwitchSite: Story = {
  name: '3b · The site picker in the tab header',
  render: () => (
    <Frame note="The tab type is one, the sites are many: the name at the top left is a picker over the sites you hold a seat on (the same list as My Sites). Picking one re-reads the tab and renames it.">
      <SideCard tabs={[...TODAY, TEAM, CHANGES]} active={CHANGES.id}>
        <ChangesTabBody pickerOpen />
      </SideCard>
    </Frame>
  )
}

export const OpenLive: Story = {
  name: '5 · Open live site → the Browser tab, address filled',
  render: () => (
    <Frame note="No new plugin: openTab({ type: 'browser', url }) as tracy-my-sites already does for the live site. Open admin stays a new window (third-party cookies never reach an iframe, measured 02/09).">
      <SideCard tabs={[...TODAY, LIVE]} active={LIVE.id}>
        <BrowserTabBody />
      </SideCard>
    </Frame>
  )
}

export const FromTheRow: Story = {
  name: '6 · From My Sites: the … menu opens tabs (Phase B)',
  render: () => (
    <Frame note="The Phase B menu on a row, every item with its icon. Team and Changes open a tab; the rest open a window, copy, or ask.">
      <SideCard tabs={TODAY} active="tracy:my-sites">
        <MySitesRowsBody menu />
      </SideCard>
    </Frame>
  )
}
