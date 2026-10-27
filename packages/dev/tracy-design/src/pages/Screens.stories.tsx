/**
 * EVERY PRODUCT SCREEN THAT HAS CODE, in one place.
 *
 * 🔒 THIS IS NOT A MOCKUP, AND THAT DIFFERENCE IS THE WHOLE POINT. Each story below **imports the running
 * component itself** from `views.tsx` — it cannot drift from the product, because it IS the product.
 * Screens with no code yet live in `src/mockups/`, labelled `Mockups/`, and redrawing by hand there is
 * within the rules. Mixing the two in one group makes the reviewer review the wrong thing.
 *
 * This is also where TCH does better than `tracy-desk`: there, all 6 screen-shape stories
 * **redraw** ("Rebuilds the real dialog…", "Not shipped code") and only point at the real file in
 * one comment line — so the drawing and the real code drift apart without anyone knowing. Here there is no
 * gap to drift in.
 *
 * ⚠ THE ROUTER IS REQUIRED, NOT DECORATION. `SettingsLayout` calls `useLocation` to highlight the open
 * section, `SiteSettingsShell` calls `useParams().siteKey` to know which site it is on, and both render
 * `<Link>`. Without a router they **throw at render time**, rather than showing something wrong. `preview.tsx`
 * deliberately does not wrap a router — it says "a story that needs a router wraps its own, because a spare router hides
 * real navigation bugs".
 *
 * ⚠ DO NOT WRAP `App`. `App` brings `KitBar` — the design bench's floating bar with its own theme
 * switch and a `<Link to="/">`. In Storybook it competes with the toolbar's switch, and
 * the Gallery button leads to a route that does not exist. The full app frame has its own story:
 * `pages/shell/TracyShell`.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AddSite } from './home/AddSite'
import { Home } from './home/Home'
import { InboxPage } from './home/InboxPage'
import { Launchpad } from './home/Launchpad'
import { NoSites } from './home/NoSites'
import { Appearance } from './settings/Appearance'
import { Mcp } from './settings/Mcp'
import { Notifications } from './settings/Notifications'
import { SettingsLayout } from './settings/SettingsLayout'
import { SkillsPage } from './settings/SkillsPage'
import { SiteConnection } from './settings/site/Connection'
import { SiteGeneral } from './settings/site/General'
import { SiteSettingsShell } from './settings/site/SiteSettingsShell'
import { Workspace } from './site/SiteScreen'

const meta: Meta = {
  title: 'Screens/App',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

/**
 * Wrap a view at its CORRECT path.
 *
 * `pattern` and `at` are two different things and both are needed: `pattern` is the route pattern (`:siteKey`)
 * so `useParams` has a value, `at` is the real address so `useLocation` highlights the right navigation item. Putting
 * the pattern into `initialEntries` makes `siteKey` the string `":siteKey"` — no error, just the wrong site
 * name, the kind of mistake nobody spots at a glance.
 */
function at(pattern: string, path: string, element: ReactElement) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
      </Routes>
    </MemoryRouter>
  )
}

const SITE = 'example.com'

// ── Site & Inbox ────────────────────────────────────────────────────────────────────────────

/** The three panes for working on a site — the heart of the product. */
export const Workspace3Panes: Story = {
  name: 'Sitespace — Chat | Changes | Preview',
  render: () => at('/workspace/:siteKey', `/workspace/${SITE}`, <Workspace />)
}

/**
 * Empty session: the composer in the middle, with prompt starters, no transcript yet.
 *
 * `hero` is dsh's own name for this phase (`ConversationRoot` sets `data-phase="hero"`), not
 * a word invented here — `vocabulary.md` §5 forbids inventing new names, not borrowing the host's.
 */
export const WorkspaceHero: Story = {
  name: 'Sitespace — empty session',
  render: () => at('/workspace/:siteKey/new', `/workspace/${SITE}/new`, <Workspace variant="hero" />)
}

export const Inbox: Story = {
  render: () => at('/inbox', '/inbox', <InboxPage />)
}

// ── Home & Launchpad ────────────────────────────────────────────────────────────────────────

export const YourWorkspace: Story = {
  name: 'Your workspace — site list',
  render: () => at('/home', '/home', <Home />)
}

export const LaunchpadScreen: Story = {
  name: 'Launchpad',
  render: () => at('/launchpad', '/launchpad', <Launchpad />)
}

/** URL → platform detection → admin sign-in → the running steps. */
export const AddSiteFlow: Story = {
  name: 'Add site flow',
  render: () => at('/add-site', '/add-site', <AddSite />)
}

// ── Auth & onboarding ───────────────────────────────────────────────────────────────────────

/**
 * What `/` shows a signed-in person who **has no seat anywhere**.
 *
 * This is the only screen in this group that has been carried by hand into `cowork-web` and is running for real. Its three
 * states (empty · with invitations · building) are in their own story, `pages/home/NoSites`.
 */
export const NoSitesYet: Story = {
  render: () => at('/no-sites', '/no-sites', <NoSites />)
}

// ── Settings ────────────────────────────────────────────────────────────────────────────────

const inSettings = (el: ReactElement) => <SettingsLayout>{el}</SettingsLayout>

export const SettingsAppearance: Story = {
  name: 'Settings — Appearance',
  render: () => at('/settings/appearance', '/settings/appearance', inSettings(<Appearance />))
}

export const SettingsNotifications: Story = {
  name: 'Settings — Notifications',
  render: () => at('/settings/notifications', '/settings/notifications', inSettings(<Notifications />))
}

export const SettingsMcp: Story = {
  name: 'Settings — MCP',
  render: () => at('/settings/mcp', '/settings/mcp', inSettings(<Mcp />))
}

export const SettingsSkills: Story = {
  name: 'Settings — Skills',
  render: () => at('/settings/skills', '/settings/skills', inSettings(<SkillsPage />))
}

// ── Site settings ───────────────────────────────────────────────────────────────────────────

const inSiteSettings = (el: ReactElement) => (
  <SettingsLayout>
    <SiteSettingsShell>{el}</SiteSettingsShell>
  </SettingsLayout>
)

export const SiteGeneralScreen: Story = {
  name: 'Site — General',
  render: () =>
    at('/settings/site/:siteKey/general', `/settings/site/${SITE}/general`, inSiteSettings(<SiteGeneral />))
}

export const SiteConnectionScreen: Story = {
  name: 'Site — Connection',
  render: () =>
    at(
      '/settings/site/:siteKey/connection',
      `/settings/site/${SITE}/connection`,
      inSiteSettings(<SiteConnection />)
    )
}
