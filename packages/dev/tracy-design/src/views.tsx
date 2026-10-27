import type { ReactElement } from 'react'

import { Placeholder } from './components/Placeholder'
import { AddSite } from './pages/home/AddSite'
import { Home } from './pages/home/Home'
import { InboxPage } from './pages/home/InboxPage'
import { Launchpad } from './pages/home/Launchpad'
import { NoSites } from './pages/home/NoSites'
import { Appearance } from './pages/settings/Appearance'
import { Mcp } from './pages/settings/Mcp'
import { Notifications } from './pages/settings/Notifications'
import { SettingsLayout } from './pages/settings/SettingsLayout'
import { SkillsPage } from './pages/settings/SkillsPage'
import { SiteConnection } from './pages/settings/site/Connection'
import { SiteGeneral } from './pages/settings/site/General'
import { SiteSettingsShell } from './pages/settings/site/SiteSettingsShell'
import { Workspace } from './pages/site/SiteScreen'

/**
 * Central registry: the router and the Gallery both read from here.
 * Adding a view = adding one entry (element points at the real component, status 'built').
 * `standalone: true` for views that stand alone (auth…); by default a view gets the app frame.
 *
 * 🔒 THREE NAMES HERE WERE CHANGED TO FOLLOW `docs/references/vocabulary.md`; do not change them back.
 *
 * - `group: 'Workbench'` → `'Site & Inbox'`. "Workbench" is on the DO-NOT-USE list; the
 *   doc says the screen for working on a site **has no proper noun yet, and that is fine** —
 *   describe it when you need to name it. `Site` and `Inbox` are both nouns in the table.
 * - `shell?: 'bare'` → `standalone?: true`. `shell` is still valid for the CONTAINER (web /
 *   desktop — the repo has exactly two), but this flag is about the APP FRAME, and using `shell` for the frame
 *   overloads a word that already has a meaning. `standalone` competes with no product noun.
 * - `AppFrame` → `App`. "Frame" is also on the DO-NOT-USE list, and the doc assigns the
 *   app frame to `app.*`.
 *
 * The 28/08 UI kit spec still says "Workbench" and "Frame": it is a record of one moment, written
 * before those two words were dropped on 29/08. Read them there as the screen for working on a site.
 */
export interface ViewDef {
  path: string
  title: string
  group: 'Site & Inbox' | 'Home & Launchpad' | 'Auth & onboarding' | 'Settings' | 'Site settings'
  status: 'built' | 'planned'
  note?: string
  standalone?: true
  element: ReactElement
}

const inSettings = (el: ReactElement) => <SettingsLayout>{el}</SettingsLayout>
const inSiteSettings = (el: ReactElement) => (
  <SettingsLayout>
    <SiteSettingsShell>{el}</SiteSettingsShell>
  </SettingsLayout>
)

export const views: ViewDef[] = [
  // ---- Site & Inbox ----
  {
    path: '/workspace/:siteKey',
    title: 'Sitespace — Chat | Changes | Preview',
    group: 'Site & Inbox',
    status: 'built',
    note: 'The heart of the product: three working panes over one site.',
    element: <Workspace />
  },
  {
    // `hero` is dsh's own name for this phase (`ConversationRoot` sets `data-phase="hero"` and
    // hands the composer slot `variant: 'hero'`), not a name invented here — §5 of the
    // vocabulary reference is about coining names, and this one is borrowed from the host.
    path: '/workspace/:siteKey/new',
    title: 'Sitespace — empty session (centered composer)',
    group: 'Site & Inbox',
    status: 'built',
    note: 'The state before the first message: prompt starters shown, no transcript, no stats line.',
    element: <Workspace variant="hero" />
  },
  {
    path: '/inbox',
    title: 'Inbox',
    group: 'Site & Inbox',
    status: 'built',
    element: <InboxPage />
  },

  // ---- Home & Launchpad ----
  {
    path: '/home',
    title: 'Your workspace — site list',
    group: 'Home & Launchpad',
    status: 'built',
    element: <Home />
  },
  {
    path: '/launchpad',
    title: 'Launchpad',
    group: 'Home & Launchpad',
    status: 'built',
    element: <Launchpad />
  },
  {
    path: '/add-site',
    title: 'Add site flow',
    group: 'Home & Launchpad',
    status: 'built',
    note: 'URL → identify platform → admin login → progress steps.',
    element: <AddSite />
  },

  // ---- Auth & onboarding ----
  {
    path: '/no-sites',
    title: 'No sites yet',
    group: 'Auth & onboarding',
    status: 'built',
    standalone: true,
    note: 'What `/` shows a signed-in person with no seat anywhere. Hand-ported into cowork-web.',
    element: <NoSites />
  },

  // ---- Settings (app) ----
  {
    path: '/settings/appearance',
    title: 'Settings — Appearance',
    group: 'Settings',
    status: 'built',
    element: inSettings(<Appearance />)
  },
  {
    path: '/settings/notifications',
    title: 'Settings — Notifications',
    group: 'Settings',
    status: 'built',
    element: inSettings(<Notifications />)
  },
  {
    path: '/settings/mcp',
    title: 'Settings — MCP',
    group: 'Settings',
    status: 'built',
    element: inSettings(<Mcp />)
  },
  {
    path: '/settings/skills',
    title: 'Settings — Skills',
    group: 'Settings',
    status: 'built',
    element: inSettings(<SkillsPage />)
  },
  {
    path: '/settings/model-provider',
    title: 'Settings — Model Provider',
    group: 'Settings',
    status: 'planned',
    element: inSettings(
      <Placeholder
        title="Model Provider"
        items={['Provider list with API key + host', 'Connection check', 'Provider presets']}
      />
    )
  },
  {
    path: '/settings/default-model',
    title: 'Settings — Default Model',
    group: 'Settings',
    status: 'planned',
    element: inSettings(
      <Placeholder
        title="Default Model"
        items={['Default model selector', 'Topic naming model', 'Translate model']}
      />
    )
  },
  {
    path: '/settings/web-search',
    title: 'Settings — Web Search',
    group: 'Settings',
    status: 'planned',
    element: inSettings(<Placeholder title="Web Search" items={['Search provider', 'Blocked domains']} />)
  },
  {
    path: '/settings/channels',
    title: 'Settings — Channels',
    group: 'Settings',
    status: 'planned',
    element: inSettings(
      <Placeholder
        title="Channels"
        items={['Telegram / Discord / Slack instances', 'Bind an agent, notify Claude Cowork plugin, logs']}
      />
    )
  },
  {
    path: '/settings/scheduled-tasks',
    title: 'Settings — Scheduled Tasks',
    group: 'Settings',
    status: 'planned',
    element: inSettings(
      <Placeholder
        title="Scheduled Tasks"
        items={['Task list with filters', 'Create with agent / manually', 'Detail pane']}
      />
    )
  },
  {
    path: '/settings/shortcuts',
    title: 'Settings — Keyboard Shortcuts',
    group: 'Settings',
    status: 'planned',
    element: inSettings(
      <Placeholder
        title="Keyboard Shortcuts"
        items={['Shortcut table with rebinding', 'Reset to defaults']}
      />
    )
  },
  {
    path: '/settings/system',
    title: 'Settings — System',
    group: 'Settings',
    status: 'planned',
    element: inSettings(
      <Placeholder
        title="System"
        items={['Launch on boot, tray behavior', 'Proxy', 'Hardware acceleration']}
      />
    )
  },
  {
    path: '/settings/account',
    title: 'Settings — Account',
    group: 'Settings',
    status: 'planned',
    element: inSettings(
      <Placeholder
        title="Account"
        items={['Name + avatar', 'Email and sign-in methods', 'Your seats across sites']}
      />
    )
  },
  {
    path: '/settings/billing',
    title: 'Settings — Billing',
    group: 'Settings',
    status: 'planned',
    element: inSettings(
      <Placeholder title="Billing" items={['Plan and usage', 'Payment method', 'Invoices']} />
    )
  },
  {
    path: '/settings/about',
    title: 'Settings — About & Feedback',
    group: 'Settings',
    status: 'planned',
    element: inSettings(
      <Placeholder title="About & Feedback" items={['Version + release notes', 'Send feedback']} />
    )
  },

  // ---- Site settings ----
  {
    path: '/settings/site/:siteKey/general',
    title: 'Site — General',
    group: 'Site settings',
    status: 'built',
    element: inSiteSettings(<SiteGeneral />)
  },
  {
    path: '/settings/site/:siteKey/connection',
    title: 'Site — Connection',
    group: 'Site settings',
    status: 'built',
    element: inSiteSettings(<SiteConnection />)
  },
  {
    path: '/settings/site/:siteKey/reskins',
    title: 'Site — Reskins',
    group: 'Site settings',
    status: 'planned',
    element: inSiteSettings(
      <Placeholder
        title="Reskins"
        items={['Templates this website is currently offering, and where each one is read', 'Open a reskin']}
      />
    )
  },
  {
    path: '/settings/site/:siteKey/github',
    title: 'Site — GitHub',
    group: 'Site settings',
    status: 'planned',
    element: inSiteSettings(
      <Placeholder
        title="GitHub"
        items={[
          'Sign-in state + device code',
          'Team GitHub sync repo',
          'Three doors: free repo / your repo / install app'
        ]}
      />
    )
  },
  {
    path: '/settings/site/:siteKey/mcp',
    title: 'Site — MCP',
    group: 'Site settings',
    status: 'planned',
    element: inSiteSettings(<Placeholder title="Site MCP" items={['Per-site MCP servers and toggles']} />)
  },
  {
    path: '/settings/site/:siteKey/skills',
    title: 'Site — Skills',
    group: 'Site settings',
    status: 'planned',
    element: inSiteSettings(
      <Placeholder
        title="Site Skills"
        items={['“This site’s own” vs “From your workspace”', 'Per-skill toggles']}
      />
    )
  },
  {
    path: '/settings/site/:siteKey/data-sources',
    title: 'Site — Data sources',
    group: 'Site settings',
    status: 'planned',
    element: inSiteSettings(
      <Placeholder
        title="Data sources"
        items={[
          'Platform API (Primary)',
          'Search Console / GA4 / PageSpeed',
          'Server access logs, Uptime monitor'
        ]}
      />
    )
  },
  {
    path: '/settings/site/:siteKey/scans',
    title: 'Site — Scans',
    group: 'Site settings',
    status: 'planned',
    element: inSiteSettings(<Placeholder title="Scans" items={['Nightly Sync toggle + time', 'Scan now']} />)
  },
  {
    path: '/settings/site/:siteKey/advanced',
    title: 'Site — Advanced',
    group: 'Site settings',
    status: 'planned',
    element: inSiteSettings(
      <Placeholder
        title="Advanced"
        items={[
          'Your access',
          'Hosting (Live site / Tracy’s copy / Repository)',
          'Danger zone: remove this site (3 levels)'
        ]}
      />
    )
  }
]
