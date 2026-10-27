/**
 * The content of each section of the Settings dialog.
 *
 * 🔒 WHAT IS MEASURED, WHAT I BUILT — read before trusting this drawing:
 *
 *   MEASURED FROM THE REAL dsh (`51740`, native profile):
 *     · seven sections under the Workspace group, in EXACTLY this order — General · Models · Plugins ·
 *       Agent presets · Tracy UI · Side card · Password Gate
 *     · the General section's content: Agent preset, Permission, Language, Appearance (Light/Dark/System),
 *       Font size, Density
 *
 *   TAKEN FROM TRACY'S CODE (verbatim strings, not made up):
 *     · `Account` and `This site` — `packages/site/tracy-my-sites/src/client/strings.ts`
 *       ("Signed in as", "Your role", "Live address"…)
 *     · group names — `packages/ui/tracy-settings/src/client/strings.ts`
 *       (`User settings`, `Workspace`)
 *
 *   ONE LABEL HERE DIFFERS FROM THE MEASURED ONE: dsh calls that section "Agent presets"; the
 *     bench says "Provider presets", the name `docs/references/vocabulary.md` keeps for it (#807).
 *
 *   BUILT BY ME, NOT MEASURED: the content of Models · Plugins · Agent presets · Tracy UI · Side card ·
 *     Password Gate. The shape is inferred from what each plugin does, not copied from the real screen.
 *     This is a place to discuss and fix, not to read as documentation of dsh.
 *
 * ⚠ NO LOGIC. Every control is `defaultValue`/`defaultChecked` — clickable, saves nothing.
 */
import { ExternalLink, KeyRound, Plus } from 'lucide-react'

import { cn } from '@tracy/ui'
import { Badge } from '@tracy/ui'
import { Button } from '@tracy/ui'
import { Input } from '@tracy/ui'
import { Label } from '@tracy/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@tracy/ui'
import { Separator } from '@tracy/ui'
import { Switch } from '@tracy/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tracy/ui'

export interface Section {
  readonly id: string
  readonly label: string
  readonly group: 'User settings' | 'Sitespace'
}

/**
 * Groups and order.
 *
 * `User settings` comes before `Workspace` because that is the order `tracy-settings` declares. The seven sections after
 * `Account` keep the exact order dsh shows — reordering here makes the drawing impossible to compare.
 */
export const SECTIONS: readonly Section[] = [
  { id: 'account', label: 'Account', group: 'User settings' },
  { id: 'general', label: 'General', group: 'Sitespace' },
  { id: 'models', label: 'Models', group: 'Sitespace' },
  { id: 'plugins', label: 'Plugins', group: 'Sitespace' },
  { id: 'presets', label: 'Provider presets', group: 'Sitespace' },
  { id: 'site', label: 'This site', group: 'Sitespace' },
  { id: 'tracy-ui', label: 'Tracy UI', group: 'Sitespace' },
  { id: 'side-card', label: 'Side card', group: 'Sitespace' },
  { id: 'password-gate', label: 'Password Gate', group: 'Sitespace' }
]

/* ── Shared pieces ────────────────────────────────────────────────────────────────────────── */

/** One settings row: label on the left, control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 py-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint ? <div className="mt-0.5 text-muted-foreground text-xs">{hint}</div> : null}
      </div>
      {children ? <div className="flex-none">{children}</div> : null}
    </div>
  )
}

/** Section title + lead sentence. Every section opens with exactly one of these. */
function Head({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="pb-1">
      <h2 className="font-semibold text-base">{title}</h2>
      {hint ? <p className="mt-1 text-muted-foreground text-sm">{hint}</p> : null}
    </div>
  )
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>
}

/* ── Each section ─────────────────────────────────────────────────────────────────────────── */

function Account() {
  return (
    <>
      {/* The "Signed in as" / "Email" strings are verbatim from `tracy-my-sites`, not made up by me. */}
      <Head title="Signed in as" />
      <Rows>
        <Row label="Email">
          <span className="text-muted-foreground text-sm">owner@example.com</span>
        </Row>
        <Row label="Seat" hint="The seat book decides what you can reach.">
          <Badge variant="secondary">Owner</Badge>
        </Row>
        <Row label="Session" hint="Signing out ends this browser session only.">
          <Button variant="outline" size="sm">
            Sign out
          </Button>
        </Row>
      </Rows>
    </>
  )
}

function General() {
  return (
    <>
      <Head title="General" />
      <Rows>
        <Row label="Provider presets" hint="Applies to sessions you start from now on.">
          <Select defaultValue="standard">
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard mode</SelectItem>
              <SelectItem value="review">Review only</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Permission" hint="Default permission mode for new sessions.">
          <Select defaultValue="write">
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="write">Accept edits automatically</SelectItem>
              <SelectItem value="read">Read only</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Language">
          <Select defaultValue="en">
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="vi">Tiếng Việt</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Rows>

      <Separator className="my-5" />

      <div className="mb-3 text-sm">Appearance</div>
      <div className="grid grid-cols-3 gap-3">
        {['Light', 'Dark', 'System'].map((mode) => (
          <button
            key={mode}
            type="button"
            className={cn(
              'rounded-lg border border-border py-6 text-sm hover:bg-accent',
              mode === 'Dark' && 'ring-1 ring-ring'
            )}
          >
            {mode}
          </button>
        ))}
      </div>

      <Rows>
        <Row label="Font size">
          <div className="flex items-center gap-2">
            <Input defaultValue="12" className="w-16 text-center" />
            <span className="text-muted-foreground text-sm">px</span>
          </div>
        </Row>
        <Row label="Density">
          <Select defaultValue="compact">
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="comfortable">Comfortable</SelectItem>
              <SelectItem value="compact">Compact</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Rows>
    </>
  )
}

const PROVIDERS = [
  { name: 'Anthropic', model: 'claude-opus-5', state: 'Connected' },
  { name: 'DeepSeek', model: 'deepseek-chat', state: 'Connected' },
  { name: 'OpenAI', model: '—', state: 'No key' }
]

function Models() {
  return (
    <>
      <Head title="Models" hint="Providers this workspace can reach, and the model each one answers with." />
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Provider</TableHead>
              <TableHead>Default model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20 text-end">Key</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PROVIDERS.map((provider) => (
              <TableRow key={provider.name}>
                <TableCell className="font-medium">{provider.name}</TableCell>
                <TableCell className="text-muted-foreground">{provider.model}</TableCell>
                <TableCell>
                  <Badge variant={provider.state === 'Connected' ? 'secondary' : 'outline'}>
                    {provider.state}
                  </Badge>
                </TableCell>
                <TableCell className="text-end">
                  {/* The key shows masked, and there is NO "show" button. A drawing that displays a readable key field
                      teaches viewers that the real screen should do the same. */}
                  <span className="font-mono text-muted-foreground text-xs">
                    {provider.state === 'Connected' ? '••••••••' : '—'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" className="mt-4 gap-2">
        <Plus className="size-3.5" />
        Add provider
      </Button>
    </>
  )
}

const PLUGINS = [
  { name: 'Tracy brand', hint: 'Replaces the DeepSeek mark on every shipped brand slot.', on: true },
  { name: 'Tracy chat input', hint: 'The composer in the conversation column.', on: true },
  { name: 'Tracy settings', hint: 'This dialog, and the sections other plugins fill.', on: true },
  { name: 'Tracy locale (vi)', hint: 'Vietnamese for namespaces Tracy owns.', on: true },
  { name: 'Tracy UI gallery', hint: 'Component reference. Development surface.', on: true },
  { name: 'My Sites', hint: 'Sites you hold a seat on.', on: true },
  { name: 'Add site', hint: 'Creates a new site from a template.', on: false }
]

function Plugins() {
  return (
    <>
      <Head
        title="Plugins"
        hint="What this distribution loads. Turning one off takes effect on the next reload."
      />
      <Rows>
        {PLUGINS.map((plugin) => (
          <Row key={plugin.name} label={plugin.name} hint={plugin.hint}>
            <Switch defaultChecked={plugin.on} />
          </Row>
        ))}
      </Rows>
    </>
  )
}

const PRESETS = [
  { name: 'Standard mode', hint: 'Reads, edits, and runs commands in the workspace.', current: true },
  { name: 'Review only', hint: 'Reads and proposes. Never writes.', current: false },
  { name: 'Content editor', hint: 'Articles, products, and media. No code.', current: false }
]

function Presets() {
  return (
    <>
      <Head title="Provider presets" hint="Each preset is a set of tools and a permission mode." />
      <div className="flex flex-col gap-3">
        {PRESETS.map((preset) => (
          <div
            key={preset.name}
            className={cn(
              'flex items-center justify-between gap-4 rounded-lg border border-border p-4',
              preset.current && 'ring-1 ring-ring'
            )}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{preset.name}</span>
                {preset.current ? <Badge variant="secondary">Default</Badge> : null}
              </div>
              <p className="mt-0.5 text-muted-foreground text-xs">{preset.hint}</p>
            </div>
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          </div>
        ))}
      </div>
    </>
  )
}

function Site() {
  return (
    <>
      {/* Verbatim strings from `tracy-my-sites`: "The site this surface is open on", "Your role",
          "Live address". */}
      <Head title="The site this surface is open on" />
      <Rows>
        <Row label="Site">
          <span className="text-sm">northwind.tracy.ai</span>
        </Row>
        <Row label="Your role">
          <Badge variant="secondary">Admin</Badge>
        </Row>
        <Row label="Live address">
          <Button variant="link" size="sm" className="h-auto gap-1 p-0">
            https://northwind.tracy.ai
            <ExternalLink className="size-3" />
          </Button>
        </Row>
        <Row label="Coworkers" hint="Anyone with GitHub push access can work here too, listed or not.">
          <Button variant="outline" size="sm">
            Manage team
          </Button>
        </Row>
      </Rows>
    </>
  )
}

function TracyUi() {
  return (
    <>
      <Head
        title="Tracy UI"
        hint="Every component in the shared library, rendered on this theme. A reference surface for the people building Tracy."
      />
      <Rows>
        <Row label="Open the gallery" hint="Shows all components on the theme this session uses.">
          <Button variant="outline" size="sm" className="gap-2">
            Open
            <ExternalLink className="size-3.5" />
          </Button>
        </Row>
        <Row label="Show to everyone" hint="Off means only people in the Tracy workspace see the entry.">
          <Switch defaultChecked />
        </Row>
      </Rows>
    </>
  )
}

function SideCard() {
  return (
    <>
      <Head title="Side card" hint="The panel on the right of the conversation." />
      <Rows>
        <Row label="Show the side card">
          <Switch defaultChecked />
        </Row>
        <Row label="Width" hint="Measured at 534px on the running surface.">
          <div className="flex items-center gap-2">
            <Input defaultValue="534" className="w-20 text-center" />
            <span className="text-muted-foreground text-sm">px</span>
          </div>
        </Row>
        <Row label="Open on start" hint="Which tool the card shows when a session opens.">
          <Select defaultValue="files">
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="files">Files</SelectItem>
              <SelectItem value="browser">Browser</SelectItem>
              <SelectItem value="terminal">Terminal</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Rows>
    </>
  )
}

function PasswordGate() {
  return (
    <>
      <Head
        title="Password Gate"
        hint="The door in front of every lane. It runs beside the seat door, not instead of it."
      />
      <Rows>
        <Row label="Status">
          <Badge variant="secondary">Running</Badge>
        </Row>
        <Row
          label="Gateway port"
          hint="One port per profile. Two profiles on one port is how the second one dies silently."
        >
          <Input defaultValue="51731" className="w-24 text-center" />
        </Row>
        <Row label="Accounts" hint="Subusers of the gate, not seats in the seat book.">
          <span className="text-muted-foreground text-sm">3 accounts</span>
        </Row>
        <Row label="Rotate the master password">
          <Button variant="outline" size="sm" className="gap-2">
            <KeyRound className="size-3.5" />
            Rotate
          </Button>
        </Row>
      </Rows>

      {/*
        The password field is deliberately READ-ONLY and has no "show" button.
        A drawing that displays a readable password field suggests the real screen should do the same —
        and drawings tend to be carried straight into code.
      */}
      <div className="mt-5 rounded-lg border border-border p-4">
        <Label className="text-muted-foreground text-xs">Master password</Label>
        <div className="mt-1 font-mono text-sm">••••••••••••</div>
        <p className="mt-2 text-muted-foreground text-xs">
          Never shown after it is set. Rotating it signs everyone out.
        </p>
      </div>
    </>
  )
}

/** Content of the selected section. */
export function SectionBody({ id }: { id: string }) {
  switch (id) {
    case 'account':
      return <Account />
    case 'general':
      return <General />
    case 'models':
      return <Models />
    case 'plugins':
      return <Plugins />
    case 'presets':
      return <Presets />
    case 'site':
      return <Site />
    case 'tracy-ui':
      return <TracyUi />
    case 'side-card':
      return <SideCard />
    case 'password-gate':
      return <PasswordGate />
    default:
      // Verbatim strings from `tracy-settings`.
      return <p className="text-muted-foreground text-sm">Choose a section on the left.</p>
  }
}
