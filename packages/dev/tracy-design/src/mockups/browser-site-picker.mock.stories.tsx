/**
 * THROWAWAY MOCK — Where should a person switch the Browser site, and what CMS settings should its owner see?
 *
 * This answers Lee's correction (27/09/2026): the picker belongs on the globe control in
 * better-sidebar's Browser tab strip, not inside the Browser page. Keep the Browser tab title as
 * the current siteKey while active or inactive. Choosing Live Edit changes the view header while
 * the tab itself remains the siteKey with its globe site-picker control.
 *
 * The strip uses better-sidebar's own CSS and site tabs' DropdownMenu from @tracy/ui. This is a
 * design proposal only; wait for Lee's approval before changing product code.
 *
 * 03/10/2026 (ADR 0024 amendment 2): each site's submenu ends with Site changes, not History — the
 * History tab and its release timeline are gone, and the fork's menu opens `tracy:changes`
 * (better-sidebar `-tracy.65`). Story 3 draws that row; the History drawing it replaced is deleted.
 */
import {
  Badge,
  Button,
  Input,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  PlatformGlyph
} from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Check,
  ChevronDown,
  ExternalLink,
  Files,
  Globe,
  Layers2,
  ListChecks,
  PencilLine,
  Settings2,
  Users,
  X
} from 'lucide-react'
import { useState } from 'react'

import css from '../../../../../vendor/tracy/dsh-better-sidebar/src/client/sidebar.module.css'

const meta: Meta = {
  title: 'Mockups/Browser site picker',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

const SITES = ['pvdriling.tracy.test', 'tracy.ai', 'joomlart.com', 'fijitrips.example']
type Cms = 'wordpress' | 'joomla' | 'emdash'
type CmsRow = { label: string; value: string; path?: string }

/** Storybook samples, not reads from these domains. Paths follow each CMS's own admin. */
const CMS_SAMPLES: Record<
  string,
  { cms: Cms; name: string; version: string; quickstart: string; rows: CmsRow[] }
> = {
  'pvdriling.tracy.test': {
    cms: 'wordpress',
    name: 'WordPress',
    version: '7.1',
    quickstart: 'Tracy Business · 1.2.0',
    rows: [
      { label: 'Site title', value: 'PVD Riling', path: 'wp-admin/options-general.php' },
      { label: 'Site language', value: 'English (en_US)', path: 'wp-admin/options-general.php' },
      { label: 'Active theme', value: 'wp-tracy-business · Block theme', path: 'wp-admin/themes.php' },
      { label: 'Homepage', value: 'Static page', path: 'wp-admin/options-reading.php' },
      { label: 'Permalinks', value: 'Post name', path: 'wp-admin/options-permalink.php' }
    ]
  },
  'tracy.ai': {
    cms: 'wordpress',
    name: 'WordPress',
    version: '7.1',
    quickstart: 'Tracy Business · 1.2.0',
    rows: [
      { label: 'Site title', value: 'Tracy', path: 'wp-admin/options-general.php' },
      { label: 'Site language', value: 'English (en_US)', path: 'wp-admin/options-general.php' },
      { label: 'Active theme', value: 'wp-tracy-business · Block theme', path: 'wp-admin/themes.php' },
      { label: 'Homepage', value: 'Static page', path: 'wp-admin/options-reading.php' },
      { label: 'Permalinks', value: 'Post name', path: 'wp-admin/options-permalink.php' }
    ]
  },
  'joomlart.com': {
    cms: 'joomla',
    name: 'Joomla',
    version: '6.1.1',
    quickstart: 'Tracy Business · 1.2.0',
    rows: [
      { label: 'Site name', value: 'JoomlArt', path: 'administrator/index.php?option=com_config' },
      { label: 'Default language', value: 'English (en-GB)', path: 'administrator/' },
      { label: 'Published languages', value: '43 languages', path: 'administrator/' },
      { label: 'Default template style', value: 'tracy_business', path: 'administrator/' },
      { label: 'Search-friendly URLs', value: 'Enabled', path: 'administrator/index.php?option=com_config' }
    ]
  },
  'fijitrips.example': {
    cms: 'emdash',
    name: 'EmDash',
    version: '0.38.0',
    quickstart: 'Tracy Business · 1.4.5',
    rows: [
      { label: 'Site title', value: 'Fiji Trips', path: '_emdash/admin/settings/general' },
      { label: 'Tagline', value: 'Explore Fiji', path: '_emdash/admin/settings/general' },
      { label: 'Template', value: 'Tracy Business', path: '_emdash/admin/' },
      { label: 'Homepage language', value: 'English (en)', path: '_emdash/admin/' },
      { label: 'Posts per page', value: '12', path: '_emdash/admin/settings/general' },
      { label: 'SEO defaults', value: 'Title separator · Social image', path: '_emdash/admin/settings/seo' }
    ]
  }
}

/** The mock has no favicon API; the first site's WordPress glyph illustrates the product fallback. */
function SiteIcon({ site }: { site: string }) {
  return (
    <PlatformGlyph platform={CMS_SAMPLES[site]?.cms ?? null} letter={site[0]} className="size-4 text-[9px]" />
  )
}

const ALIASES = {
  '--dsw-alias-bg-layer-1': 'var(--card)',
  '--dsw-alias-border-l1': 'var(--border)',
  '--dsw-alias-label-primary': 'var(--foreground)',
  '--dsw-alias-label-secondary': 'var(--muted-foreground)',
  '--dsw-alias-label-tertiary': 'var(--muted-foreground)',
  '--dsw-alias-interactive-bg-active': 'var(--muted)',
  '--dsw-alias-interactive-bg-hover': 'var(--accent)',
  '--dsw-font-xxs-12': '400 12px/16px ui-sans-serif, system-ui, sans-serif',
  '--dsw-font-xxxs-strong-11': '600 11px/14px ui-sans-serif, system-ui, sans-serif'
} as React.CSSProperties

function SitePicker({
  menuInitiallyOpen = false,
  showChanges = false,
  liveEditInitiallySelected = false,
  settingsInitiallySelected = false,
  browserInitiallyInactive = false,
  initialSite = SITES[0]
}: {
  menuInitiallyOpen?: boolean
  showChanges?: boolean
  liveEditInitiallySelected?: boolean
  settingsInitiallySelected?: boolean
  browserInitiallyInactive?: boolean
  initialSite?: string
}) {
  const [site, setSite] = useState(initialSite)
  const [open, setOpen] = useState(menuInitiallyOpen)
  const [view, setView] = useState<'Browser' | 'Team' | 'Site changes' | 'Settings'>(
    settingsInitiallySelected ? 'Settings' : showChanges ? 'Site changes' : 'Browser'
  )
  const [hoveredSite, setHoveredSite] = useState(SITES[1])
  const [liveEdit, setLiveEdit] = useState(liveEditInitiallySelected)
  const [activeTab, setActiveTab] = useState<'Files' | 'Browser' | 'My Sites'>(
    browserInitiallyInactive ? 'Files' : 'Browser'
  )
  const [browserTabOpen, setBrowserTabOpen] = useState(true)
  const openLiveEdit = (key: string) => {
    setSite(key)
    setView('Browser')
    setLiveEdit(true)
    setActiveTab('Browser')
    setOpen(false)
  }
  return (
    <main className="min-h-dvh bg-muted/30 p-10 text-foreground">
      <p className="mx-auto mb-3 max-w-[760px] text-sm text-muted-foreground">
        Mockup · Browser tab site picker · choosing a site also switches the workspace
      </p>
      <section
        className={`mx-auto flex ${settingsInitiallySelected ? 'h-[680px]' : 'h-[520px]'} max-w-[760px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm`}
        style={ALIASES}
      >
        <div className={css.tabBar}>
          <div className={css.tabList}>
            <div
              className={`${css.tab} ${activeTab === 'Files' ? css.tabActive : ''}`}
              onClick={() => setActiveTab('Files')}
            >
              <Files size={14} />
              <span className={css.tabTitle}>Files</span>
              <button className={css.tabClose} aria-label="Close Files">
                <X size={12} />
              </button>
            </div>
            {browserTabOpen && (
              <div
                className={`${css.tab} ${activeTab === 'Browser' ? css.tabActive : ''}`}
                onClick={() => setActiveTab('Browser')}
              >
                <DropdownMenu open={open} onOpenChange={setOpen}>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="-ml-1 size-6 shrink-0 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                        aria-label={`Choose site, current site ${site}`}
                        title="Choose site and workspace"
                      />
                    }
                  >
                    <span className="relative inline-flex size-4 items-center justify-center">
                      <Globe className="size-3.5" />
                      <ChevronDown className="absolute -right-1.5 -bottom-1 size-2.5 rounded-full bg-card" />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={6} className="w-64">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Choose a site action
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {SITES.map((key) => (
                      <DropdownMenuSub key={key} defaultOpen={menuInitiallyOpen && key === hoveredSite}>
                        <DropdownMenuSubTrigger
                          className="gap-2"
                          onPointerMove={() => setHoveredSite(key)}
                          onClick={() => openLiveEdit(key)}
                        >
                          <Check
                            className={`size-3.5 shrink-0 ${site === key ? 'opacity-100' : 'opacity-0'}`}
                          />
                          <SiteIcon site={key} />
                          <span className="truncate">{key}</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-52">
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              openLiveEdit(key)
                            }}
                          >
                            <PencilLine className="size-4" />
                            Live Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              setSite(key)
                              setView('Settings')
                              setLiveEdit(false)
                              setActiveTab('Browser')
                            }}
                          >
                            <Settings2 className="size-4" />
                            Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              setSite(key)
                              setView('Team')
                              setLiveEdit(false)
                              setActiveTab('Browser')
                            }}
                          >
                            <Users className="size-4" />
                            Team
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation()
                              setSite(key)
                              setView('Site changes')
                              setLiveEdit(false)
                              setActiveTab('Browser')
                            }}
                          >
                            <ListChecks className="size-4" />
                            Site changes
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <SiteIcon site={site} />
                <span className={css.tabTitle} title={site}>
                  {site}
                </span>
                <button
                  className={css.tabClose}
                  aria-label="Close Browser"
                  onClick={(event) => {
                    event.stopPropagation()
                    setBrowserTabOpen(false)
                    setActiveTab('Files')
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <div
              className={`${css.tab} ${activeTab === 'My Sites' ? css.tabActive : ''}`}
              onClick={() => setActiveTab('My Sites')}
            >
              <Layers2 size={14} />
              <span className={css.tabTitle}>My Sites</span>
              <button className={css.tabClose} aria-label="Close My Sites">
                <X size={12} />
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          {activeTab !== 'Browser' ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {activeTab}
            </div>
          ) : view === 'Settings' ? (
            <SiteSettingsView site={site} />
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
                {view === 'Team' ? (
                  <Users className="size-4" />
                ) : view === 'Site changes' ? (
                  <ListChecks className="size-4" />
                ) : liveEdit ? (
                  <PencilLine className="size-4" />
                ) : (
                  <Globe className="size-4" />
                )}
                {view === 'Team' || view === 'Site changes' ? view : liveEdit ? 'Live Edit' : view} · {site}
              </div>
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {view === 'Team'
                  ? `Team for ${site}`
                  : view === 'Site changes'
                    ? `Site changes for ${site}: chat turns, outside edits and backups (Mockups/Site changes · Backup)`
                    : `Live site preview for ${site}`}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

/** Proposal for site-scoped Settings. This is a visual mockup; controls do not write to the site. */
function SiteSettingsView({ site }: { site: string }) {
  const [urlEditing, setUrlEditing] = useState(false)
  const sample = CMS_SAMPLES[site]
  const adminRoot =
    sample.cms === 'wordpress' ? 'wp-admin/' : sample.cms === 'joomla' ? 'administrator/' : '_emdash/admin/'
  const adminUrl = `https://${site}/${adminRoot}`
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Settings2 className="size-4" />
        <span className="font-medium text-sm">Settings</span>
      </div>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <SiteIcon site={site} />
          <span className="font-medium text-sm">{site}</span>
          <Badge variant="outline">Published</Badge>
          <span className="ml-auto text-xs text-muted-foreground">Illustrative CMS values</span>
        </div>
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="m-0 text-sm font-semibold">Site URL</h2>
          </div>
          {urlEditing ? (
            <div className="px-4 py-4">
              <label htmlFor="site-url" className="text-xs text-muted-foreground">
                New site URL
              </label>
              <Input id="site-url" defaultValue={`https://${site}`} className="mt-1 font-mono text-sm" />
              <p className="m-0 mt-1 text-xs text-muted-foreground">
                Choose an unused URL that follows the existing SiteKey rules.
              </p>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setUrlEditing(false)}>
                  Cancel
                </Button>
                <Button variant="outline" size="sm">
                  Check availability
                </Button>
                <Button size="sm" disabled>
                  Save URL
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <span className="truncate font-mono text-sm text-muted-foreground">https://{site}</span>
              <Button variant="outline" size="sm" onClick={() => setUrlEditing(true)}>
                Change
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <PlatformGlyph platform={sample.cms} className="size-5" />
              <h2 className="m-0 text-sm font-semibold">{sample.name} settings</h2>
            </div>
          </div>
          <div className="divide-y divide-border px-4">
            <SettingRow label={`${sample.name} version`} value={sample.version} />
            <SettingRow label="Built from" value={sample.quickstart} />
            {sample.rows.map((row) => (
              <SettingRow
                key={row.label}
                label={row.label}
                value={row.value}
                href={row.path ? `https://${site}/${row.path}` : undefined}
              />
            ))}
            <SettingRow label="CMS admin" value={adminUrl} href={adminUrl} />
          </div>
        </section>
      </div>
    </div>
  )
}

function SettingRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-xs text-muted-foreground">{value}</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${label} in CMS admin`}
            title={href}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  )
}

export const GlobeControlClosed: Story = {
  name: '1 · Globe control on Browser tab',
  render: () => <SitePicker />
}

export const GlobeControlMenuOpen: Story = {
  name: '2 · Site and workspace menu open',
  render: () => <SitePicker menuInitiallyOpen />
}

export const BrowserTabInactive: Story = {
  name: '2a · SiteKey stays on the inactive Browser tab',
  render: () => <SitePicker browserInitiallyInactive />
}

export const SiteChangesFromTheMenu: Story = {
  name: '3 · Site changes from the site menu',
  render: () => <SitePicker showChanges />
}

export const LiveEditSelected: Story = {
  name: '4 · Live Edit selected: content header updates',
  render: () => <SitePicker liveEditInitiallySelected />
}

export const SiteSettings: Story = {
  name: '5 · WordPress settings',
  render: () => <SitePicker settingsInitiallySelected />
}

export const JoomlaSettings: Story = {
  name: '6 · Joomla settings',
  render: () => <SitePicker settingsInitiallySelected initialSite="joomlart.com" />
}

export const EmDashSettings: Story = {
  name: '7 · EmDash settings',
  render: () => <SitePicker settingsInitiallySelected initialSite="fijitrips.example" />
}
