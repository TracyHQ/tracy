/**
 * THROWAWAY MOCK — `harness.tracy.ai` → Host agents. Not shipped code.
 *
 * THE QUESTION: which words, and which columns, does the screen that replaced `Site agents` use —
 * without inventing a concept the fleet does not already have. 09/09: "stop inventing new
 * concepts, use the ones that already exist". The first draft said "Tracy packages"; there is no
 * such thing. What exists, and what each column is named after:
 *
 *   host        a fleet machine — `do`, `contabo`, `dev` (`FLEET_HOSTS`)
 *   container   the ONE process on it, `tracy-dsh` (`docker ps`)
 *   image       the file it runs from, `ghcr.io/tracyhq/tracy-dsh:<tag>` (`docker images`);
 *               tag = `<date>-<repo sha>`, chosen in `/etc/tracy/host-dsh.env`
 *   dsh core    `vendor/deepseek-harness` at `TRACY_DSH_COMMIT`, baked into the image
 *   profile     `native`, the image's only one; its plugins are the `@tracy/dsh-*` directories
 *               the Dockerfile copies in
 *
 * Image and container are two facts, and the screen carries both because they disagree exactly
 * when a deploy half-succeeded: `host-dsh.env` says which image was CHOSEN, `docker inspect
 * tracy-dsh` says which one is RUNNING. The Dockerfile's own words: the env file is what
 * "somebody MEANT to deploy".
 *
 * NO BUTTON. A host dsh is upgraded by `deploy-host-dsh.sh` on the machine, which rolls itself
 * back; this screen makes a bad deploy visible, it does not start one. NO ABSOLUTE "LATEST": the
 * private registry retired (ADR 0014 §6); both images are built from this repo, so two hosts
 * naming two versions of one plugin is the finding.
 *
 * ⚠ THIS IS MODE A — Tailwind, Tracy owns `<html>`. The harness SPA is mode A too, so this one
 * ports by moving, not rewriting. ⚠ DELETE WHEN DONE.
 */
import { Badge, Card, cn, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RefreshCw, Server } from 'lucide-react'
import { useState } from 'react'

type Plugin = { name: string; version: string | null }

type Host = {
  host: string
  ok: boolean
  error?: string
  container?: { status: string; health: string | null; startedAt: string; image: string }
  image?: { tag: string; previous: string | null; sourceCommit: string; dshCommit: string }
  plugins: Plugin[]
}

const HOST_LABEL: Record<string, string> = { do: 'DigitalOcean', contabo: 'contabo', dev: 'dev' }

const plugins = (bundle: string, addSite: string, extra: Plugin[] = []): Plugin[] => [
  { name: '@tracy/dsh-add-site', version: addSite },
  { name: '@tracy/dsh-brand', version: '0.4.2' },
  { name: '@tracy/dsh-chat-input', version: '0.3.0' },
  { name: '@tracy/dsh-my-sites', version: '0.6.1' },
  { name: '@tracy/dsh-native-bundle', version: bundle },
  { name: '@tracy/dsh-sandbox-docker', version: '0.1.4' },
  { name: '@tracy/dsh-subprocess-docker', version: '0.2.4' },
  { name: '@tracy/dsh-webroot-read', version: '0.3.1' },
  ...extra
]

const live = (host: string, tag: string, sourceCommit: string, dshCommit: string, list: Plugin[]): Host => ({
  host,
  ok: true,
  container: {
    status: 'running',
    health: 'healthy',
    startedAt: '2026-09-08 02:10',
    image: `ghcr.io/tracyhq/tracy-dsh:${tag}`
  },
  image: { tag, previous: '2026-09-06-9a8b7c6', sourceCommit, dshCommit },
  plugins: list
})

const dark = (host: string, error: string): Host => ({ host, ok: false, error, plugins: [] })

/** plugin → host → version, over hosts that answered. `null` = that image has no such directory. */
function driftOf(hosts: Host[]): Record<string, Record<string, string | null>> {
  const up = hosts.filter((h) => h.ok)
  if (up.length < 2) return {}
  const names = [...new Set(up.flatMap((h) => h.plugins.map((p) => p.name)))].sort()
  const out: Record<string, Record<string, string | null>> = {}
  for (const name of names) {
    const byHost = Object.fromEntries(
      up.map((h) => [h.host, h.plugins.find((p) => p.name === name)?.version ?? null])
    )
    if (new Set(Object.values(byHost).map(String)).size > 1) out[name] = byHost
  }
  return out
}

const short = (name: string) => name.replace('@tracy/dsh-', '')

function Screen({ hosts, error }: { hosts: Host[]; error?: string }) {
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        hosts
          .filter((h) => h.ok)
          .slice(0, 1)
          .map((h) => h.host)
      )
  )
  const up = hosts.filter((h) => h.ok)
  const down = hosts.filter((h) => !h.ok)
  const drift = driftOf(hosts)
  const driftNames = Object.keys(drift)
  const toggle = (h: string) =>
    setOpen((s) => {
      const n = new Set(s)
      n.has(h) ? n.delete(h) : n.add(h)
      return n
    })

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* The harness nav, as `App.tsx` draws it — here only to show where the row lands. */}
      <div className="flex w-60 flex-none flex-col border-border border-r bg-sidebar">
        <div className="flex h-11 items-center px-4 font-semibold text-sm">Tracy harness</div>
        <nav className="flex flex-col gap-0.5 px-2 text-sm">
          <p className="px-2 pt-3 pb-1 font-medium text-[11px] text-muted-foreground tracking-wide">Agents</p>
          <div className="rounded-md px-2 py-1.5">CMS agents</div>
          <div className="rounded-md px-2 py-1.5">Presets</div>
          <p className="px-2 pt-3 pb-1 font-medium text-[11px] text-muted-foreground tracking-wide">Fleet</p>
          <div className="rounded-md bg-muted px-2 py-1.5 font-medium">Host agents</div>
          <p className="px-2 pt-3 pb-1 font-medium text-[11px] text-muted-foreground tracking-wide">Tracy</p>
          <div className="rounded-md px-2 py-1.5">Team</div>
        </nav>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-semibold text-lg tracking-tight">
              <Server className="size-4.5" /> Host agents
            </h1>
            <p className="text-muted-foreground text-sm">
              {hosts.length} hosts · {up.length} answered{down.length ? ` · ${down.length} dark` : ''}
              {up.length > 1 ? (
                driftNames.length === 0 ? (
                  ' · same plugins on every host'
                ) : (
                  <span className="text-amber-700">
                    {' '}
                    · {driftNames.length} plugin{driftNames.length === 1 ? '' : 's'} differ
                  </span>
                )
              ) : null}
            </p>
          </div>
          <span className="flex items-center gap-2 text-muted-foreground text-xs">
            Measured just now <RefreshCw className="size-3.5" />
          </span>
        </div>

        {error ? (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive text-sm">
            <AlertTriangle className="mt-0.5 size-4 flex-none" />
            <span>
              {error}. Nothing was asked of any host. Set it with{' '}
              <span className="font-mono text-xs">wrangler secret put FLEET_RELAY_SECRET</span>.
            </span>
          </p>
        ) : null}

        {down.length ? (
          <p className="flex items-start gap-2 text-destructive text-sm">
            <AlertTriangle className="mt-0.5 size-4 flex-none" />
            <span>
              {down.map((h) => `${HOST_LABEL[h.host] ?? h.host} did not answer (${h.error})`).join(' · ')}
            </span>
          </p>
        ) : null}

        <Card className="gap-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Host</TableHead>
                <TableHead>Container</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>dsh core</TableHead>
                <TableHead>Plugins</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hosts.map((h) => {
                const halfDeployed =
                  h.ok && h.image && h.container && !h.container.image.endsWith(`:${h.image.tag}`)
                return (
                  <HostRow
                    key={h.host}
                    h={h}
                    open={open.has(h.host)}
                    onToggle={() => toggle(h.host)}
                    drift={drift}
                    halfDeployed={!!halfDeployed}
                  />
                )
              })}
            </TableBody>
          </Table>
        </Card>

        {driftNames.length ? (
          <Card className="gap-0 px-4 py-3">
            <h2 className="flex items-center gap-2 pb-1 font-medium text-sm">
              <AlertTriangle className="size-4 text-amber-600" />
              Plugins that differ between hosts
            </h2>
            <p className="pb-3 text-muted-foreground text-xs">
              Both images are built from this repo, so a difference means one host has not been redeployed —
              not that one of them is wrong. <span className="font-mono">—</span> means that image has no such
              plugin at all.
            </p>
            <table className="w-full text-xs">
              <tbody>
                {driftNames.map((name) => (
                  <tr key={name} className="border-border/60 border-b last:border-0">
                    <td className="py-1 pr-4 font-mono">{short(name)}</td>
                    {up.map((h) => (
                      <td key={h.host} className="py-1 pr-4 font-mono">
                        <span className="text-muted-foreground">{HOST_LABEL[h.host]}</span>{' '}
                        {drift[name][h.host] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : up.length > 1 ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <CheckCircle2 className="size-4 text-emerald-600" /> Every host that answered runs the same
            plugins.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function HostRow({
  h,
  open,
  onToggle,
  drift,
  halfDeployed
}: {
  h: Host
  open: boolean
  onToggle: () => void
  drift: Record<string, Record<string, string | null>>
  halfDeployed: boolean
}) {
  const c = h.container
  const i = h.image
  return (
    <>
      <TableRow className={cn('cursor-pointer', !h.ok && 'opacity-70')} onClick={onToggle}>
        <TableCell className="pe-0">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </TableCell>
        <TableCell className="font-medium">
          {HOST_LABEL[h.host] ?? h.host}{' '}
          <span className="ps-1 font-mono text-muted-foreground text-xs">{h.host}</span>
        </TableCell>
        <TableCell>
          {!h.ok ? (
            <Badge variant="outline" className="text-destructive">
              no answer
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  c?.health === 'healthy'
                    ? 'bg-emerald-500'
                    : c?.health
                      ? 'bg-amber-500'
                      : 'bg-muted-foreground/50'
                )}
              />
              {c?.status}
              {c?.health ? ` · ${c.health}` : ''}
            </Badge>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {i?.tag ?? '—'}
          {halfDeployed ? (
            <Badge variant="outline" className="ms-2 text-amber-700">
              container runs {c?.image.split(':').pop()}
            </Badge>
          ) : null}
        </TableCell>
        <TableCell className="font-mono text-xs">{i?.dshCommit ?? '—'}</TableCell>
        <TableCell className="text-sm">{h.ok ? h.plugins.length : '—'}</TableCell>
        <TableCell className="text-muted-foreground text-sm">{c?.startedAt ?? '—'}</TableCell>
      </TableRow>
      {open ? (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={7} className="px-6 py-4">
            {!h.ok ? (
              <p className="text-muted-foreground text-sm">
                This host did not answer, so nothing below it is known.{' '}
                <span className="font-mono text-xs">{h.error}</span>
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <Block title={`Profile native · ${h.plugins.length} plugins`}>
                  <table className="w-full table-fixed text-xs">
                    <tbody>
                      {h.plugins.map((p) => (
                        <tr key={p.name} className="border-border/60 border-b last:border-0">
                          <td className="truncate py-1 pr-3 font-mono">{short(p.name)}</td>
                          <td className={cn('py-1 font-mono', p.name in drift && 'text-amber-700')}>
                            {p.version ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Block>
                <Block title="Image">
                  <Fact label="Tag chosen in host-dsh.env" value={i?.tag} />
                  <Fact label="Previous tag" value={i?.previous} />
                  <Fact label="Repo commit" value={i?.sourceCommit} />
                  <Fact label="dsh core commit" value={i?.dshCommit} />
                </Block>
                <Block title="Container tracy-dsh">
                  <Fact label="Status" value={c?.status} />
                  <Fact label="Health" value={c?.health ?? 'no healthcheck'} />
                  <Fact label="Started" value={c?.startedAt} />
                  <Fact
                    label="Runs image"
                    value={
                      <span className={cn(halfDeployed && 'text-amber-700')}>
                        {c?.image.split(':').pop()}
                      </span>
                    }
                  />
                </Block>
              </div>
            )}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-2">
    <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</h3>
    {children}
  </div>
)
const Fact = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="truncate text-right font-mono text-xs">{value ?? '—'}</span>
  </div>
)

const meta: Meta = { title: 'Mockups/Host agents', parameters: { layout: 'fullscreen' } }
export default meta
type Story = StoryObj

const TAG = '2026-09-07-a1b2c3d'

/** A good day: both production hosts on one image, same plugins; dev off. */
export const InStep: Story = {
  render: () => (
    <Screen
      hosts={[
        live('do', TAG, 'a1b2c3d', 'f2af2af', plugins('0.9.6', '0.4.0')),
        live('contabo', TAG, 'a1b2c3d', 'f2af2af', plugins('0.9.6', '0.4.0')),
        dark('dev', 'fetch failed')
      ]}
    />
  )
}

/** contabo not redeployed: older tag, older bundle, and `site-build` missing from its image entirely. */
export const Drifted: Story = {
  render: () => (
    <Screen
      hosts={[
        live(
          'do',
          '2026-09-08-ffee001',
          'ffee001',
          'f2af2af',
          plugins('0.9.6', '0.4.0', [{ name: '@tracy/dsh-site-build', version: '0.3.0' }])
        ),
        live('contabo', '2026-09-05-1122334', '1122334', 'e1e1e1e', plugins('0.9.4', '0.3.9')),
        dark('dev', 'fetch failed')
      ]}
    />
  )
}

/** Image ≠ container: host-dsh.env was rewritten, `tracy-dsh` never restarted. Two facts, both shown. */
export const HalfDeployed: Story = {
  render: () => (
    <Screen
      hosts={[
        {
          ...live('do', '2026-09-08-ffee001', 'ffee001', 'f2af2af', plugins('0.9.6', '0.4.0')),
          container: {
            status: 'running',
            health: null,
            startedAt: '2026-09-05 02:10',
            image: 'ghcr.io/tracyhq/tracy-dsh:2026-09-05-1122334'
          }
        },
        dark('contabo', 'timed out after 20s'),
        dark('dev', 'fetch failed')
      ]}
    />
  )
}

/** The Worker has no relay secret — nothing was asked; not the same fact as "every host is dark". */
export const WorkerHasNoKey: Story = {
  render: () => <Screen hosts={[]} error="FLEET_RELAY_SECRET is not set on this Worker" />
}
