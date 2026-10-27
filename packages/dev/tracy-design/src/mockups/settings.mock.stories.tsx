/**
 * THROWAWAY MOCKS — the ten Settings screens that `views.tsx` marks `status: 'planned'`. Not shipped code.
 *
 * THE QUESTION THEY EXIST TO ANSWER: today those ten screens render a `<Placeholder>` — a bulleted
 * list saying *"what this page will contain"*. That list answers **what is there**, and
 * not **what shape**: an item "Provider list with API key + host" reads fine
 * for a table, a list of cards, and a two-column page alike. Those three cost three different amounts of
 * work and break in three different ways.
 *
 * The content of each screen is NOT made up: it is copied verbatim from the `items` array of the matching
 * `<Placeholder>` in `views.tsx`. The mockups here decide only **shape**, not scope.
 *
 * ⚠ THIS IS MODE A — Tailwind, Tracy owns `<html>`. The real surface is a plugin in the dsh page,
 * MODE B, plain CSS with the `tv-` prefix. Whichever screen is chosen must be **REWRITTEN**, not copied, and what
 * goes to review is the ported version. `DESIGN.md` §0.
 *
 * ⚠ DELETE WHEN DONE. Once a screen has real code, its story moves to `Screens/App` (importing the real
 * component) and the mockup here goes. Leaving it means two versions of one screen — exactly what `ui-workflow.md` step 1
 * forbids.
 */
import {
  Badge,
  Button,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Kbd,
  KbdGroup,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea
} from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Cloud,
  CreditCard,
  Download,
  MessageSquare,
  Plus,
  Search,
  Send
} from 'lucide-react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { currentUser, sites } from '../fixtures'
import { SettingsLayout, SettingsPage, SettingsRow, SettingsSection } from '../pages/settings/SettingsLayout'

const meta: Meta = {
  title: 'Mockups/Settings',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

/**
 * Wrapped in the REAL `SettingsLayout`, at the right path.
 *
 * Not for completeness: the left navigation column decides how much width the rest of the page
 * has, and a mockup drawn full-screen would promise space that does not exist. `SettingsLayout`
 * reads `useLocation` to highlight the open section, so it also needs the right path, not just a router.
 */
function inSettings(path: string, el: ReactElement) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={<SettingsLayout>{el}</SettingsLayout>} />
      </Routes>
    </MemoryRouter>
  )
}

// ── Model Provider ──────────────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { name: 'Anthropic', host: 'api.anthropic.com', key: 'sk-ant-••••••••••••4f2a', state: 'ok' as const },
  { name: 'OpenAI', host: 'api.openai.com', key: 'sk-••••••••••••9c11', state: 'ok' as const },
  { name: 'Google', host: 'generativelanguage.googleapis.com', key: '', state: 'empty' as const },
  { name: 'Self-hosted', host: 'llm.internal:8080', key: 'sk-••••••••••••0000', state: 'failed' as const }
]

/**
 * `items`: Provider list with API key + host · Connection check · Provider presets.
 *
 * PROPOSED SHAPE: a list of `Item`s, not a `Table`. The reason is the "Connection
 * check" column — it is not a data cell but an **action with three outcomes** (not tried · trying
 * · failed with a reason). Cramming those three states into a table cell is where every provider page gets
 * cramped, and the failure reason — the only thing that helps users fix it themselves — is cut down to a red dot.
 */
export const ModelProvider: Story = {
  name: 'Model Provider',
  render: () =>
    inSettings(
      '/settings/model-provider',
      <SettingsPage>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg tracking-tight">Model Provider</h1>
            <p className="mt-0.5 text-muted-foreground text-sm">
              Where Tracy sends a request. Keys stay on this machine.
            </p>
          </div>
          <Button>
            <Plus data-icon="inline-start" />
            Add provider
          </Button>
        </div>

        <ItemGroup className="rounded-xl border border-border bg-card">
          {PROVIDERS.map((p, i) => (
            <div key={p.name}>
              <Item className="px-5">
                <ItemMedia variant="icon">
                  <Cloud />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="flex items-center gap-2">
                    {p.name}
                    {p.state === 'ok' ? (
                      <Badge variant="secondary">
                        <CheckCircle2 data-icon="inline-start" />
                        Reachable
                      </Badge>
                    ) : null}
                    {p.state === 'failed' ? (
                      <Badge variant="destructive">
                        <CircleAlert data-icon="inline-start" />
                        401 from the host
                      </Badge>
                    ) : null}
                    {p.state === 'empty' ? <Badge variant="outline">No key</Badge> : null}
                  </ItemTitle>
                  <ItemDescription className="font-mono">
                    {p.host}
                    {p.key ? ` · ${p.key}` : ''}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button variant="outline" size="sm">
                    Test
                  </Button>
                  <Switch defaultChecked={p.state === 'ok'} />
                </ItemActions>
              </Item>
              {i < PROVIDERS.length - 1 ? <ItemSeparator /> : null}
            </div>
          ))}
        </ItemGroup>

        <SettingsSection title="Presets" badge={<Badge variant="outline">Shared with your team</Badge>}>
          <SettingsRow
            label="Fast and cheap"
            hint="Haiku for naming and translation, Sonnet for everything else."
          >
            <Button variant="outline" size="sm">
              Use
            </Button>
          </SettingsRow>
          <SettingsRow label="Best available" hint="Opus everywhere. Slower, and it costs more.">
            <Button variant="outline" size="sm">
              Use
            </Button>
          </SettingsRow>
        </SettingsSection>
      </SettingsPage>
    )
}

// ── Default Model ───────────────────────────────────────────────────────────────────────────

function ModelPicker({ value }: { value: string }) {
  return (
    <Select defaultValue={value}>
      <SelectTrigger className="w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="opus">Claude Opus 5</SelectItem>
        <SelectItem value="sonnet">Claude Sonnet 5</SelectItem>
        <SelectItem value="haiku">Claude Haiku 4.5</SelectItem>
      </SelectContent>
    </Select>
  )
}

/**
 * `items`: Default model selector · Topic naming model · Translate model.
 *
 * SHAPE: three `SettingsRow` rows, not three cards. These three choices differ in **importance,
 * not in kind** — one decides the quality of the work, the other two only name and
 * translate. Giving them three equal cards says they deserve equal weight.
 */
export const DefaultModel: Story = {
  name: 'Default Model',
  render: () =>
    inSettings(
      '/settings/default-model',
      <SettingsPage title="Default Model">
        <SettingsSection title="Working model">
          <SettingsRow label="Default model" hint="What every agent uses unless a site overrides it.">
            <ModelPicker value="opus" />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="Background work">
          <SettingsRow label="Topic naming" hint="Names a session from its first message.">
            <ModelPicker value="haiku" />
          </SettingsRow>
          <SettingsRow label="Translate" hint="Used by the Vietnamese and Chinese surfaces.">
            <ModelPicker value="haiku" />
          </SettingsRow>
        </SettingsSection>
      </SettingsPage>
    )
}

// ── Web Search ──────────────────────────────────────────────────────────────────────────────

/**
 * `items`: Search provider · Blocked domains.
 *
 * SHAPE: a select row + a `Textarea`, one domain per line — NOT a list of chips added
 * one by one. A block list is something people paste in bulk and edit in bulk; forcing them to type each domain
 * and press add turns one paste into twenty actions.
 */
export const WebSearch: Story = {
  name: 'Web Search',
  render: () =>
    inSettings(
      '/settings/web-search',
      <SettingsPage title="Web Search">
        <SettingsSection title="Provider">
          <SettingsRow label="Search provider" hint="Where a search request goes.">
            <Select defaultValue="brave">
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="brave">Brave Search</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="none">Off</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            label="Search from a site's agent"
            hint="Off means the agent works from the webroot alone."
          >
            <Switch defaultChecked />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Blocked domains">
          <div className="py-3">
            <Label htmlFor="blocked">One domain per line. Subdomains are blocked with the parent.</Label>
            <Textarea
              id="blocked"
              className="mt-2 font-mono"
              rows={6}
              defaultValue={'example.net\nads.example.org\ntracker.example.com'}
            />
            <p className="mt-2 text-muted-foreground text-xs">3 domains blocked.</p>
          </div>
        </SettingsSection>
      </SettingsPage>
    )
}

// ── Channels ────────────────────────────────────────────────────────────────────────────────

const CHANNELS = [
  { name: 'Telegram — #tracy-alerts', agent: 'example.com', state: 'Connected', events: 142 },
  { name: 'Slack — #website', agent: 'shop.acme.com', state: 'Connected', events: 38 },
  { name: 'Discord — Tracy bot', agent: '', state: 'Needs re-connect', events: 0 }
]

/**
 * `items`: Telegram / Discord / Slack instances · Bind an agent, notify Claude Cowork plugin, logs.
 *
 * SHAPE: each channel is a card carrying THREE things at once — where it connects, which agent speaks through it, and
 * when it last spoke. Splitting "logs" onto a separate page is where a channel dies silently:
 * the status stays green because the token is still valid, while nothing has been sent for three weeks.
 */
export const Channels: Story = {
  name: 'Channels',
  render: () =>
    inSettings(
      '/settings/channels',
      <SettingsPage>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg tracking-tight">Channels</h1>
            <p className="mt-0.5 text-muted-foreground text-sm">
              Where Tracy speaks when nobody has the app open.
            </p>
          </div>
          <Button>
            <Plus data-icon="inline-start" />
            Add channel
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {CHANNELS.map((c) => (
            <Card key={c.name}>
              <CardContent className="flex items-center gap-3 py-3">
                <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted">
                  <Send className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-sm">{c.name}</span>
                    <Badge variant={c.state === 'Connected' ? 'secondary' : 'destructive'}>{c.state}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-muted-foreground text-xs">
                    {c.agent ? `Speaks for ${c.agent}` : 'No agent bound'} ·{' '}
                    {c.events ? `${c.events} messages sent · last one 2 hours ago` : 'Nothing sent yet'}
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  {c.state === 'Connected' ? 'Logs' : 'Re-connect'}
                </Button>
                <Switch defaultChecked={c.state === 'Connected'} />
              </CardContent>
            </Card>
          ))}
        </div>
      </SettingsPage>
    )
}

// ── Scheduled Tasks ─────────────────────────────────────────────────────────────────────────

const SCHEDULED = [
  { name: 'Nightly Sync — example.com', when: 'Every day at 02:00', last: 'Found 3 changes', ok: true },
  { name: 'Weekly link check', when: 'Mondays at 07:00', last: 'Clean', ok: true },
  { name: 'Rebuild search index', when: 'Every 6 hours', last: 'Failed — webroot read-only', ok: false }
]

/**
 * `items`: Task list with filters · Create with agent / manually · Detail pane.
 *
 * SHAPE: **a list + a detail pane on the same screen**, split by `Tabs` for the filter. The real
 * question here is "which one just broke" — opening each task on a separate page to read its last
 * run makes people take three steps for a question that should be answered right in the row.
 */
export const ScheduledTasks: Story = {
  name: 'Scheduled Tasks',
  render: () =>
    inSettings(
      '/settings/scheduled-tasks',
      <SettingsPage>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg tracking-tight">Scheduled Tasks</h1>
            <p className="mt-0.5 text-muted-foreground text-sm">Work Tracy does without being asked.</p>
          </div>
          <Button>
            <Plus data-icon="inline-start" />
            New task
          </Button>
        </div>

        <Tabs defaultValue="all">
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="failing">Failing</TabsTrigger>
            <TabsTrigger value="paused">Paused</TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            <ItemGroup className="mt-3 rounded-xl border border-border bg-card">
              {SCHEDULED.map((t, i) => (
                <div key={t.name}>
                  <Item className="px-5">
                    <ItemMedia variant="icon">
                      <CalendarClock />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t.name}</ItemTitle>
                      <ItemDescription>
                        {t.when} · last run: {t.last}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {t.ok ? null : <Badge variant="destructive">Failing</Badge>}
                      <Button variant="outline" size="sm">
                        Run now
                      </Button>
                      <Switch defaultChecked />
                    </ItemActions>
                  </Item>
                  {i < SCHEDULED.length - 1 ? <ItemSeparator /> : null}
                </div>
              ))}
            </ItemGroup>
          </TabsContent>
          <TabsContent value="failing">
            <div className="mt-3">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleAlert />
                  </EmptyMedia>
                  <EmptyTitle>One task is failing</EmptyTitle>
                  <EmptyDescription>
                    Rebuild search index — the webroot is read-only. Grant write access on the site to fix it.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          </TabsContent>
          <TabsContent value="paused">
            <div className="mt-3">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CalendarClock />
                  </EmptyMedia>
                  <EmptyTitle>Nothing paused</EmptyTitle>
                  <EmptyDescription>Turn a task off with its switch and it lands here.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          </TabsContent>
        </Tabs>
      </SettingsPage>
    )
}

// ── Keyboard Shortcuts ──────────────────────────────────────────────────────────────────────

const SHORTCUTS = [
  ['Open the palette', ['⌘', 'K'], 'Global'],
  ['Add site', ['⌘', 'N'], 'Global'],
  ['Settings', ['⌘', ','], 'Global'],
  ['Send a message', ['⌘', '⏎'], 'Chat'],
  ['New line in a message', ['⇧', '⏎'], 'Chat'],
  ['Next pane', ['⌘', '⌥', '→'], 'Site'],
  ['Toggle the sidebar', ['⌘', 'B'], 'Site'],
  ['Approve the highlighted change', ['⌘', '⇧', 'A'], 'Changes']
] as const

/**
 * `items`: Shortcut table with rebinding · Reset to defaults.
 *
 * SHAPE: a real `Table` with a search box, NOT a list of cards. This is the only screen
 * in the group that users come to with a specific question — *"which key is X"* — so what must be fast
 * is **scanning and filtering**, not the look of each row.
 */
export const KeyboardShortcuts: Story = {
  name: 'Keyboard Shortcuts',
  render: () =>
    inSettings(
      '/settings/shortcuts',
      <SettingsPage>
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-semibold text-lg tracking-tight">Keyboard Shortcuts</h1>
          <div className="flex items-center gap-2">
            <InputGroup className="w-64">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput placeholder="Search shortcuts…" />
            </InputGroup>
            <Button variant="outline">Reset to defaults</Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Action</TableHead>
                <TableHead>Where</TableHead>
                <TableHead className="pr-5 text-right">Keys</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SHORTCUTS.map(([label, keys, scope]) => (
                <TableRow key={label}>
                  <TableCell className="pl-5 font-medium">{label}</TableCell>
                  <TableCell className="text-muted-foreground">{scope}</TableCell>
                  <TableCell className="pr-5 text-right">
                    <KbdGroup className="justify-end">
                      {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </KbdGroup>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-muted-foreground text-xs">
          Click a shortcut to rebind it. A key already in use is shown with what it would replace.
        </p>
      </SettingsPage>
    )
}

// ── System ──────────────────────────────────────────────────────────────────────────────────

/**
 * `items`: Launch on boot, tray behavior · Proxy · Hardware acceleration.
 *
 * SHAPE: three `SettingsSection`s, with the proxy given its own block rather than a row. It
 * is the only item here that **can take the product fully offline**, so it needs room for a test
 * button and an answer — a row only has room for the input, and users would only learn they mistyped
 * when everything else stops working.
 *
 * ⚠ This screen ONLY makes sense in the desktop shell. On the web, all three items belong to the browser.
 */
export const System: Story = {
  name: 'System',
  render: () =>
    inSettings(
      '/settings/system',
      <SettingsPage title="System">
        <SettingsSection title="Startup" badge={<Badge variant="outline">Desktop only</Badge>}>
          <SettingsRow label="Launch on boot" hint="Tracy starts with the machine, in the tray.">
            <Switch defaultChecked />
          </SettingsRow>
          <SettingsRow label="Closing the window" hint="Keeps agents running while the window is shut.">
            <Select defaultValue="tray">
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tray">Hide to the tray</SelectItem>
                <SelectItem value="quit">Quit Tracy</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Proxy">
          <div className="flex flex-col gap-3 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm">Use a proxy</div>
                <div className="mt-0.5 text-muted-foreground text-xs">
                  Every request Tracy makes goes through it — models, registry, fleet.
                </div>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center gap-2">
              <Input className="font-mono" defaultValue="http://127.0.0.1:7890" />
              <Button variant="outline">Test</Button>
            </div>
            <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <CheckCircle2 className="size-3.5" />
              Reachable — 41 ms to api.anthropic.com.
            </p>
          </div>
        </SettingsSection>

        <SettingsSection title="Rendering">
          <SettingsRow
            label="Hardware acceleration"
            hint="Turn it off if the window flickers. Takes a restart."
          >
            <Switch defaultChecked />
          </SettingsRow>
        </SettingsSection>
      </SettingsPage>
    )
}

// ── Account ─────────────────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer'
}

/**
 * `items`: Name + avatar · Email and sign-in methods · Your seats across sites.
 *
 * SHAPE: the third item — "your seats on sites" — gets a FULL list, not
 * a number. This is the only place in the product that answers *"what access do I hold
 * where"*, and that is the question people ask right before leaving an organisation.
 *
 * 🔒 There is EXACTLY ONE sign-in path left: the one-time code. Magic link retired 01/09/2026. This mockup must not
 * grow a "Magic link" row again — that is not decoration, it is an entrance that has
 * been closed.
 */
export const Account: Story = {
  name: 'Account',
  render: () =>
    inSettings(
      '/settings/account',
      <SettingsPage title="Account">
        <SettingsSection title="You">
          <div className="flex items-center gap-4 py-4">
            <span className="flex size-14 flex-none items-center justify-center rounded-full bg-primary/15 font-semibold text-lg text-primary">
              {currentUser.name[0]}
            </span>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="acc-name">Name</Label>
              <Input id="acc-name" className="max-w-sm" defaultValue={currentUser.name} />
            </div>
            <Button variant="outline">Change picture</Button>
          </div>
        </SettingsSection>

        <SettingsSection title="Signing in">
          <SettingsRow label="Email" hint={currentUser.email}>
            <Badge variant="secondary">
              <BadgeCheck data-icon="inline-start" />
              Verified
            </Badge>
          </SettingsRow>
          <SettingsRow label="One-time code" hint="Tracy emails a six-digit code. This is the only way in.">
            <Badge variant="secondary">On</Badge>
          </SettingsRow>
          <SettingsRow label="Continue with Google" hint="Same account, fewer steps.">
            <Switch defaultChecked />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Your seats" badge={<Badge variant="outline">{sites.length} sites</Badge>}>
          {sites.map((s) => (
            <SettingsRow key={s.key} label={s.name} hint={`Seat since March 2026`}>
              <Badge variant={s.role === 'owner' ? 'default' : 'outline'}>{ROLE_LABEL[s.role]}</Badge>
              <Button variant="ghost" size="sm">
                Leave
              </Button>
            </SettingsRow>
          ))}
        </SettingsSection>
      </SettingsPage>
    )
}

// ── Billing ─────────────────────────────────────────────────────────────────────────────────

/**
 * `items`: Plan and usage · Payment method · Invoices.
 *
 * SHAPE: usage drawn with `Progress` plus **the absolute number next to it**, not a percentage
 * on its own. "82%" does not say how much is left; "7 / 10 seats" does, and that is the number
 * people need before inviting one more person.
 */
export const Billing: Story = {
  name: 'Billing',
  render: () =>
    inSettings(
      '/settings/billing',
      <SettingsPage title="Billing">
        <SettingsSection title="Plan" badge={<Badge>Team</Badge>}>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-semibold text-2xl tracking-tight">$49 / month</p>
                <p className="mt-0.5 text-muted-foreground text-sm">Renews 1 October 2026.</p>
              </div>
              <Button variant="outline">Change plan</Button>
            </div>
            <Separator />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span>Seats in use</span>
                <span className="text-muted-foreground tabular-nums">7 / 10</span>
              </div>
              <Progress value={70} />
              <div className="flex items-center justify-between text-sm">
                <span>Sites</span>
                <span className="text-muted-foreground tabular-nums">{sites.length} / 25</span>
              </div>
              <Progress value={(sites.length / 25) * 100} />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Payment method">
          <SettingsRow label="Visa ending 4242" hint="Expires 04 / 2029">
            <CreditCard className="size-4 text-muted-foreground" />
            <Button variant="outline" size="sm">
              Replace
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Invoices">
          {[
            ['September 2026', '$49.00', 'Paid'],
            ['August 2026', '$49.00', 'Paid'],
            ['July 2026', '$29.00', 'Paid']
          ].map(([month, amount, state]) => (
            <SettingsRow key={month} label={month} hint={state}>
              <span className="text-sm tabular-nums">{amount}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Download the ${month} invoice`}>
                <Download />
              </Button>
            </SettingsRow>
          ))}
        </SettingsSection>
      </SettingsPage>
    )
}

// ── About & Feedback ────────────────────────────────────────────────────────────────────────

/**
 * `items`: Version + release notes · Send feedback.
 *
 * SHAPE: the version number and the **commit** side by side, both selectable. That is the only thing
 * that turns a bug report into a traceable one: `CLAUDE.md` §5 holds the rule "seeing `Message: -` means that build
 * went up outside the script and cannot be matched to any commit" — and the user is the only source
 * that tells us which build they are running.
 */
export const AboutAndFeedback: Story = {
  name: 'About & Feedback',
  render: () =>
    inSettings(
      '/settings/about',
      <SettingsPage title="About & Feedback">
        <SettingsSection title="This build">
          <SettingsRow label="Version" hint="Updates install themselves when Tracy is idle.">
            <span className="font-mono text-sm">1.4.0</span>
          </SettingsRow>
          <SettingsRow label="Commit" hint="Quote this in a bug report.">
            <span className="select-all font-mono text-muted-foreground text-sm">a65b583</span>
          </SettingsRow>
          <SettingsRow label="Release notes" hint="What changed in 1.4.0.">
            <Button variant="outline" size="sm">
              Read
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Send feedback">
          <div className="flex flex-col gap-3 py-3">
            <Label htmlFor="fb">What happened?</Label>
            <Textarea id="fb" rows={5} placeholder="What you expected, and what you got instead." />
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-muted-foreground text-xs">
                <Switch defaultChecked />
                Attach the version, the commit, and the last 200 log lines
              </label>
              <Button>
                <MessageSquare data-icon="inline-start" />
                Send
              </Button>
            </div>
          </div>
        </SettingsSection>
      </SettingsPage>
    )
}
