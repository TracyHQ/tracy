/**
 * THROWAWAY MOCKS — the seven Site settings screens that `views.tsx` marks `status: 'planned'`. Not shipped code.
 *
 * THE QUESTION THEY EXIST TO ANSWER: same as the ten Settings screens next door — today they are
 * `<Placeholder>`s, i.e. a list that says **what is there**, not **what shape**. But this group
 * has one more question of its own, and it weighs more:
 *
 * 🔒 **THREE SCREENS HERE TOUCH THE CUSTOMER'S SITE, NOT TRACY'S SETTINGS.** `Data sources`
 * asks for third-party keys, `Scans` lets a task run overnight on the real webroot, and `Advanced`
 * holds the delete-site button. Their shape must make the consequences **visible before the click** — that is why
 * `Advanced` below splits into three levels instead of one "Delete" button, and `Scans` says exactly what it reads.
 *
 * The content of each screen is copied from the `items` array of the matching `<Placeholder>` in `views.tsx`. The mockup
 * decides only shape, not scope.
 *
 * ⚠ MODE A — must be REWRITTEN in `tv-*` CSS for real; ⚠ DELETE WHEN DONE. `DESIGN.md` §0 and
 * `ui-workflow.md` step 1b.
 */
import {
  AspectRatio,
  Badge,
  Button,
  Card,
  CardContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch
} from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  Gauge,
  Github,
  Palette,
  Plug,
  Plus,
  ScanSearch,
  Search,
  ServerCog,
  Wrench
} from 'lucide-react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { sites, skills } from '../fixtures'
import { SettingsLayout, SettingsPage, SettingsRow, SettingsSection } from '../pages/settings/SettingsLayout'
import { SiteSettingsShell } from '../pages/settings/site/SiteSettingsShell'

const meta: Meta = {
  title: 'Mockups/Site settings',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

const SITE = sites[0]

/**
 * Wrapped in BOTH real shells: `SettingsLayout` (the app's left column) and `SiteSettingsShell` (the site's tab
 * column). Those are two columns, and a mockup drawn full-screen would promise nearly twice the real width.
 *
 * `SiteSettingsShell` reads `useParams().siteKey` to print the site name at the top, so `pattern` must keep
 * `:siteKey` while `path` must be the real address — putting the pattern in both makes the title show the string
 * `":siteKey"`, no error, just wrong.
 */
function inSiteSettings(slug: string, el: ReactElement) {
  return (
    <MemoryRouter initialEntries={[`/settings/site/${SITE.key}/${slug}`]}>
      <Routes>
        <Route
          path="/settings/site/:siteKey/:tab"
          element={
            <SettingsLayout>
              <SiteSettingsShell>{el}</SiteSettingsShell>
            </SettingsLayout>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

// ── Reskins ─────────────────────────────────────────────────────────────────────────────────

const RESKINS = [
  { name: 'Autumn 2026', where: 'Live on the site', ok: true },
  { name: 'Black Friday', where: "Tracy's copy — not published", ok: true },
  { name: 'Original theme', where: 'Read from the webroot', ok: true }
]

/**
 * `items`: Templates this website is currently offering, and where each one is read · Open a reskin.
 *
 * SHAPE: a grid of cards with a preview image, and **the "read where" line right under the name**, not hidden
 * in a detail page. That is the spec's first item, which in full reads *"and where each one is
 * read"* — meaning the main question is not "how many copies" but **"which copy is what
 * customers see"**. An image grid without that line answers the wrong question.
 */
export const Reskins: Story = {
  name: 'Reskins',
  render: () =>
    inSiteSettings(
      'reskins',
      <SettingsPage>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg tracking-tight">Reskins</h1>
            <p className="mt-0.5 text-muted-foreground text-sm">
              Looks this site can wear. Only one is live at a time.
            </p>
          </div>
          <Button>
            <Plus data-icon="inline-start" />
            New reskin
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {RESKINS.map((r, i) => (
            <Card key={r.name} className="overflow-hidden">
              <AspectRatio ratio={16 / 10}>
                <div className="flex size-full items-center justify-center bg-muted">
                  <Palette className="size-6 text-muted-foreground" />
                </div>
              </AspectRatio>
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-sm">{r.name}</span>
                  {i === 0 ? <Badge>Live</Badge> : null}
                </div>
                <p className="mt-0.5 truncate text-muted-foreground text-xs">{r.where}</p>
                <Button variant="outline" size="sm" className="mt-3 w-full">
                  Open
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </SettingsPage>
    )
}

// ── GitHub ──────────────────────────────────────────────────────────────────────────────────

/**
 * `items`: Sign-in state + device code · Team GitHub sync repo · Three doors: free repo / your
 * repo / install app.
 *
 * SHAPE: the three doors are **three cards side by side**, not a `Select`. They differ in what
 * the user must give and what they get back — one costs nothing but the repo belongs to Tracy, one
 * is their own repo but needs a permission grant, one installs an app for the whole organisation. Stuffing those three into
 * a dropdown hides the very thing to weigh.
 *
 * The device code uses `InputOTP`, not `Input`: it is a GitHub code read here and typed there, and separate boxes
 * force the right number of characters.
 */
export const GitHub: Story = {
  name: 'GitHub',
  render: () =>
    inSiteSettings(
      'github',
      <SettingsPage title="GitHub">
        <SettingsSection title="Signed in" badge={<Badge variant="secondary">Connected</Badge>}>
          <SettingsRow label="Account" hint="Used for every repo on this site.">
            <Github className="size-4 text-muted-foreground" />
            <span className="font-mono text-sm">@octopal</span>
            <Button variant="ghost" size="sm">
              Sign out
            </Button>
          </SettingsRow>
          <SettingsRow label="Team sync repo" hint="Where everyone's work meets. Only an Admin merges.">
            <span className="font-mono text-sm">TracyHQ/example-com</span>
            <Button variant="ghost" size="icon-sm" aria-label="Open on GitHub">
              <ExternalLink />
            </Button>
          </SettingsRow>
        </SettingsSection>

        <div>
          <h2 className="font-semibold text-sm tracking-tight">If you are not signed in</h2>
          <p className="mt-0.5 text-muted-foreground text-sm">
            Three ways in. They differ in who ends up owning the repository.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['A free repo', 'Tracy creates and owns it. Nothing to set up.', 'Recommended'],
              ['Your own repo', 'You keep ownership. Tracy needs push access.', ''],
              ['Install the app', 'For a whole organisation. An admin approves once.', '']
            ].map(([title, note, badge]) => (
              <Card key={title}>
                <CardContent className="flex flex-col gap-2 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{title}</span>
                    {badge ? <Badge variant="secondary">{badge}</Badge> : null}
                  </div>
                  <p className="min-h-10 text-muted-foreground text-xs">{note}</p>
                  <Button variant={badge ? 'default' : 'outline'} size="sm">
                    Choose
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <SettingsSection title="Device code">
          <div className="flex flex-col items-start gap-3 py-4">
            <p className="text-muted-foreground text-sm">
              Open <span className="font-mono text-foreground">github.com/login/device</span> and enter this
              code. It expires in 15 minutes.
            </p>
            <InputOTP maxLength={8} defaultValue="WDJB4MJH">
              <InputOTPGroup>
                {[0, 1, 2, 3].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
              <InputOTPGroup>
                {[4, 5, 6, 7].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        </SettingsSection>
      </SettingsPage>
    )
}

// ── Site MCP ────────────────────────────────────────────────────────────────────────────────

const SITE_MCP = [
  { name: 'WordPress webroot', note: 'Read-only until you grant write access.', from: 'site', on: true },
  { name: 'Search Console', note: 'Queries and impressions for this domain.', from: 'site', on: true },
  { name: 'Filesystem', note: 'Available on every site you own.', from: 'workspace', on: true },
  { name: 'Fetch', note: 'Available on every site you own.', from: 'workspace', on: false }
]

/**
 * `items`: Per-site MCP servers and toggles.
 *
 * SHAPE: two groups — **"this site's own"** and **"inherited from the workspace"** — not
 * a flat list. The spec only says "per-site servers and toggles", but a flat list
 * cannot answer what users actually ask: *"does turning this off turn it off here or everywhere?"*
 * Same reason the `Skills` screen below is also split in two groups — and there the spec says so outright.
 */
export const SiteMcp: Story = {
  name: 'MCP',
  render: () =>
    inSiteSettings(
      'mcp',
      <SettingsPage>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg tracking-tight">MCP</h1>
            <p className="mt-0.5 text-muted-foreground text-sm">
              What this site's agent can reach, on top of what it inherits.
            </p>
          </div>
          <Button>
            <Plus data-icon="inline-start" />
            Add server
          </Button>
        </div>

        {(['site', 'workspace'] as const).map((from) => (
          <SettingsSection
            key={from}
            title={from === 'site' ? "This site's own" : 'From your workspace'}
            badge={
              from === 'workspace' ? (
                <Badge variant="outline">Turning one off here only affects this site</Badge>
              ) : undefined
            }
          >
            {SITE_MCP.filter((s) => s.from === from).map((s) => (
              <SettingsRow key={s.name} label={s.name} hint={s.note}>
                <Plug className="size-4 text-muted-foreground" />
                <Switch defaultChecked={s.on} />
              </SettingsRow>
            ))}
          </SettingsSection>
        ))}
      </SettingsPage>
    )
}

// ── Site Skills ─────────────────────────────────────────────────────────────────────────────

/**
 * `items`: "This site's own" vs "From your workspace" · Per-skill toggles.
 *
 * SHAPE: two groups, exactly as the spec says — and the inherited group carries a line saying how far turning
 * it off here reaches. Without that line the toggles look the same in both groups, and users
 * have to guess whether they just turned something off for one site or for all.
 */
export const SiteSkills: Story = {
  name: 'Skills',
  render: () =>
    inSiteSettings(
      'skills',
      <SettingsPage>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg tracking-tight">Skills</h1>
            <p className="mt-0.5 text-muted-foreground text-sm">What this site's agent knows how to do.</p>
          </div>
          <Button>
            <Plus data-icon="inline-start" />
            Add skill
          </Button>
        </div>

        <SettingsSection title="This site's own">
          <SettingsRow label="Joomla article rewrite" hint="Written for this site. Nobody else sees it.">
            <Switch defaultChecked />
          </SettingsRow>
          <SettingsRow label="Product photo alt text" hint="Written for this site.">
            <Switch defaultChecked />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title="From your workspace"
          badge={<Badge variant="outline">Turning one off here only affects this site</Badge>}
        >
          {skills.slice(0, 4).map((s: { name: string; description?: string }, i: number) => (
            <SettingsRow key={s.name} label={s.name} hint={s.description}>
              <Wrench className="size-4 text-muted-foreground" />
              <Switch defaultChecked={i < 3} />
            </SettingsRow>
          ))}
        </SettingsSection>
      </SettingsPage>
    )
}

// ── Data sources ────────────────────────────────────────────────────────────────────────────

const SOURCES = [
  {
    group: 'Primary',
    items: [
      {
        name: 'Platform API',
        note: 'The site itself — pages, posts, media. Everything else is context on top of this.',
        state: 'Connected',
        icon: <ServerCog />
      }
    ]
  },
  {
    group: 'How people find this site',
    items: [
      {
        name: 'Search Console',
        note: 'Queries, impressions, position.',
        state: 'Connected',
        icon: <Search />
      },
      {
        name: 'Google Analytics 4',
        note: 'Sessions and conversions.',
        state: 'Not connected',
        icon: <BarChart3 />
      },
      { name: 'PageSpeed', note: 'Core Web Vitals, sampled weekly.', state: 'Connected', icon: <Gauge /> }
    ]
  },
  {
    group: 'How the site is behaving',
    items: [
      {
        name: 'Server access logs',
        note: 'Read from the fleet host.',
        state: 'Connected',
        icon: <Database />
      },
      {
        name: 'Uptime monitor',
        note: 'One request a minute from three regions.',
        state: 'Not connected',
        icon: <CheckCircle2 />
      }
    ]
  }
]

/**
 * `items`: Platform API (Primary) · Search Console / GA4 / PageSpeed · Server access logs, Uptime monitor.
 *
 * SHAPE: three NAMED groups, with Platform API standing alone on top. The spec already implies that by
 * writing "(Primary)" — it is not in the same rank as the other five: without it the agent can do nothing,
 * without GA4 the agent just knows one thing less. Putting all six in a flat list erases that
 * ranking, and users will connect GA4 first and then wonder why it does not work yet.
 *
 * 🔒 The button is **"Connect"**, not a key-paste box. Every source here is third-party OAuth;
 * a key input on this screen teaches users to paste secrets where they do not belong.
 */
export const DataSources: Story = {
  name: 'Data sources',
  render: () =>
    inSiteSettings(
      'data-sources',
      <SettingsPage>
        <div>
          <h1 className="font-semibold text-lg tracking-tight">Data sources</h1>
          <p className="mt-0.5 text-muted-foreground text-sm">
            What the agent may read about {SITE.name}. Nothing here lets it write.
          </p>
        </div>

        {SOURCES.map((g) => (
          <SettingsSection
            key={g.group}
            title={g.group}
            badge={g.group === 'Primary' ? <Badge>Required</Badge> : undefined}
          >
            {g.items.map((s) => (
              <SettingsRow key={s.name} label={s.name} hint={s.note}>
                <span className="text-muted-foreground [&_svg]:size-4">{s.icon}</span>
                {s.state === 'Connected' ? (
                  <>
                    <Badge variant="secondary">Connected</Badge>
                    <Switch defaultChecked />
                  </>
                ) : (
                  <Button variant="outline" size="sm">
                    Connect
                  </Button>
                )}
              </SettingsRow>
            ))}
          </SettingsSection>
        ))}
      </SettingsPage>
    )
}

// ── Scans ───────────────────────────────────────────────────────────────────────────────────

/**
 * `items`: Nightly Sync toggle + time · Scan now.
 *
 * SHAPE: the toggle and the time sit in one block with **the list of what it reads**, plus the result of the last
 * run. The spec has only two bullets, but both are about a task that **runs by itself on the
 * real site when nobody is there** — so the shape must answer *"what did it do last night"*
 * before the user agrees to let it keep running.
 */
export const Scans: Story = {
  name: 'Scans',
  render: () =>
    inSiteSettings(
      'scans',
      <SettingsPage title="Scans">
        <SettingsSection title="Nightly Sync" badge={<Badge variant="secondary">On</Badge>}>
          <SettingsRow
            label="Run every night"
            hint="Reads the site while nobody is working on it. It never writes."
          >
            <Switch defaultChecked />
          </SettingsRow>
          <SettingsRow label="At" hint="In the site's timezone — Asia/Ho_Chi_Minh.">
            <Select defaultValue="02">
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['00', '02', '04', '06'].map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          <div className="py-3">
            <Collapsible>
              <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
                What it reads
                <ChevronDown data-icon="inline-end" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-xs">
                  <li>Every page and post through the Platform API</li>
                  <li>Search Console queries for the last 7 days</li>
                  <li>Server access logs since the previous run</li>
                  <li>One PageSpeed sample for the home page</li>
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Last run"
          badge={<Badge variant="outline">3 September, 02:00 — 4 min 12 s</Badge>}
        >
          <SettingsRow label="18 pages read" hint="Nothing changed on the site." />
          <SettingsRow label="3 findings" hint="Placeholder text on three pages, still from the theme.">
            <Button variant="outline" size="sm">
              Open
            </Button>
          </SettingsRow>
          <SettingsRow label="Run one now" hint="Takes about four minutes. You can keep working.">
            <Button>
              <ScanSearch data-icon="inline-start" />
              Scan now
            </Button>
          </SettingsRow>
        </SettingsSection>
      </SettingsPage>
    )
}

// ── Advanced ────────────────────────────────────────────────────────────────────────────────

/**
 * `items`: Your access · Hosting (Live site / Tracy's copy / Repository) · Danger zone: remove
 * this site (3 levels).
 *
 * SHAPE, and this is the most carefully thought-out screen of the seven:
 *
 * 🔒 **THE THREE DELETE LEVELS ARE THREE SEPARATE ROWS, NOT ONE BUTTON + A DIALOG WITH THREE CHOICES.** The spec
 * says "remove this site (3 levels)", and the three levels differ in what **cannot be taken back**: leaving the
 * seat only loses your own access; removing from Tracy keeps the customer's site alive; deleting the copy
 * takes the container, database and webroot away. Merging all three into one dialog makes users read the
 * consequences EXACTLY WHEN THEY HAVE ALREADY DECIDED TO CLICK — one beat too late.
 *
 * `Field orientation="horizontal"` for those three rows: it gives the description real room, instead of being
 * squeezed into a small `hint` line under the label.
 */
export const Advanced: Story = {
  name: 'Advanced',
  render: () =>
    inSiteSettings(
      'advanced',
      <SettingsPage title="Advanced">
        <SettingsSection title="Your access">
          <SettingsRow label="Your role" hint="What you may do on this site.">
            <Badge>Owner</Badge>
          </SettingsRow>
          <SettingsRow label="Write access" hint="Off means every change waits for your approval.">
            <Switch />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Hosting">
          <SettingsRow label="Live site" hint="What visitors see.">
            <span className="font-mono text-sm">{SITE.liveUrl}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Open the live site">
              <ExternalLink />
            </Button>
          </SettingsRow>
          <SettingsRow label="Tracy's copy" hint="Where proposals are built. Not indexed.">
            <span className="font-mono text-sm">{SITE.previewUrl}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Open Tracy's copy">
              <ExternalLink />
            </Button>
          </SettingsRow>
          <SettingsRow label="Repository" hint="Every change lands here first.">
            <Github className="size-4 text-muted-foreground" />
            <span className="font-mono text-sm">TracyHQ/example-com</span>
          </SettingsRow>
        </SettingsSection>

        <section className="rounded-xl border border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-2 border-destructive/20 border-b px-5 py-3.5">
            <AlertTriangle className="size-4 text-destructive" />
            <h2 className="font-semibold text-sm tracking-tight">Danger zone</h2>
          </div>
          <div className="flex flex-col gap-4 px-5 py-4">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Leave this site</FieldTitle>
                <FieldDescription>
                  You lose your seat. The site keeps running and everyone else keeps theirs. You can be
                  invited back.
                </FieldDescription>
              </FieldContent>
              <Button variant="outline" size="sm">
                Leave
              </Button>
            </Field>
            <Separator />
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Remove from Tracy</FieldTitle>
                <FieldDescription>
                  Tracy forgets this site — proposals, history, seats. The live site is untouched and stays
                  online. You can connect it again later.
                </FieldDescription>
              </FieldContent>
              <Button variant="outline" size="sm">
                Remove
              </Button>
            </Field>
            <Separator />
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Delete the copy on the fleet</FieldTitle>
                <FieldDescription>
                  The container, the database and the webroot go away. This cannot be undone from here — only
                  from a fleet backup, if one exists.
                </FieldDescription>
              </FieldContent>
              <Button variant="destructive" size="sm">
                Delete
              </Button>
            </Field>
          </div>
        </section>
      </SettingsPage>
    )
}
