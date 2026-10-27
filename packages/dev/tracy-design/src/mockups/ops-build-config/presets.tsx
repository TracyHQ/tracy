/**
 * M04 · Presets — the twelve agents a build can run as, and the rule that picks one.
 *
 * MOST OF THIS SCREEN IS NOT DRAWN, IT IS IMPORTED. `roles`, `platforms`, `resolve`, `presetYaml`
 * and `RowList` all come from `@tracy/harness-web`, so the rows, the counts and the YAML are the
 * real ones and cannot drift from the product while this drawing is being reviewed. What is new
 * here is the part that does not exist yet: the resolver bench and the expected-versus-actual
 * panel.
 *
 * THE RESOLVER RULE IS COPIED, NOT IMPORTED, AND THAT IS A KNOWN COST. It lives in
 * `packages/design/tracy-design-inspiration/src/client/preset-for.mjs`, a plugin this bench does
 * not depend on; adding a dependency to draw a picture is the wrong trade. Seven lines are copied
 * verbatim below and the source is named on screen, so a reviewer can check the copy in ten
 * seconds — and so whoever ports this screen knows to import rather than copy again.
 */
import {
  RowList,
  personas,
  platforms,
  presetYaml,
  resolve,
  roles,
  type PlatformId,
  type RoleId
} from '@tracy/harness-web'
import {
  Badge,
  Button,
  Card,
  NativeSelect,
  NativeSelectOption,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@tracy/ui'
import { ArrowRight, FileCode2, Layers, Wrench } from 'lucide-react'
import { useState } from 'react'

import { useOps } from './app'
import { CMS_LABEL, type Cms } from './fixtures'
import { Fact, Panel, ProvenanceTag, ScreenHead, StatusChip } from './parts'

/**
 * The rule, copied verbatim from `preset-for.mjs` on 12/09.
 *
 * Keep the role the session already had if it is one of the four; otherwise the build is design
 * work, so it becomes the designer. The platform always comes from the button.
 */
const ROLE_IDS: readonly string[] = ['designer', 'developer', 'writer', 'seo-geo']
const PLATFORM_IDS: readonly string[] = ['wordpress', 'joomla', 'emdash']

function presetFor(current: string, platform: string): string | null {
  if (!PLATFORM_IDS.includes(platform)) return null
  const role = ROLE_IDS.find((r) => PLATFORM_IDS.some((p) => current === `${r}-${p}`)) ?? 'designer'
  return `${role}-${platform}`
}

/** Every preset the session picker can be sitting on, plus two of dsh's own. */
const SOURCE_PRESETS: readonly string[] = [
  ...ROLE_IDS.flatMap((r) => PLATFORM_IDS.map((p) => `${r}-${p}`)),
  'standard',
  'plan'
]

export function Presets() {
  const ops = useOps()
  const [role, setRole] = useState<RoleId>('designer')
  const [source, setSource] = useState('developer-wordpress')
  const [target, setTarget] = useState<Cms>('joomla')

  const platform = ops.cms as PlatformId
  const { tools, skills } = resolve(role, platform)
  const id = `${role}-${platform}`
  const result = presetFor(source, target)

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <ScreenHead
        title="Presets"
        sub={
          <>
            Four roles × three CMS, generated from <span className="font-mono">config/mode-matrix.json</span>.
            The rows and the file below are read from the product&rsquo;s own matrix, so they are
            today&rsquo;s truth, not a drawing of it.
          </>
        }
      >
        <Badge variant="secondary">Read-only · generated</Badge>
      </ScreenHead>

      <Panel
        title="The twelve"
        aside={<span className="text-muted-foreground text-xs">Pick a row to read it below</span>}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>CMS</TableHead>
                <TableHead>Preset id</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead className="text-right">Tools</TableHead>
                <TableHead className="text-right">Skills</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) =>
                platforms.map((p) => {
                  const counts = resolve(r.id, p.id)
                  const selected = r.id === role && p.id === platform
                  return (
                    <TableRow
                      key={`${r.id}-${p.id}`}
                      className={selected ? 'bg-accent/60' : undefined}
                      onClick={() => {
                        setRole(r.id)
                        ops.setCms(p.id as Cms)
                      }}
                    >
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell>{p.label}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.id}-{p.id}
                      </TableCell>
                      <TableCell className="text-xs">
                        {personas[r.id]?.trim() ? (
                          'written'
                        ) : (
                          <span className="text-muted-foreground">no persona</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{counts.tools.length}</TableCell>
                      <TableCell className="text-right tabular-nums">{counts.skills.length}</TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        presets/{r.id}-{p.id}/
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-base tracking-tight">
          {roles.find((r) => r.id === role)?.label} for {CMS_LABEL[ops.cms]}
        </h2>
        <Badge variant="outline" className="font-mono">
          {id}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          className="ms-auto"
          onClick={() => ops.go('tools', { focus: id, from: 'presets' })}
        >
          Tools &amp; skills for this preset
          <ArrowRight />
        </Button>
      </div>

      <Tabs defaultValue="reading" className="gap-3">
        <TabsList>
          <TabsTrigger value="reading">
            <Layers />
            What it gives an agent
          </TabsTrigger>
          <TabsTrigger value="yaml">
            <FileCode2 />
            agent.cordis.yml
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reading">
          <div className="flex flex-col gap-3">
            <Card className="gap-0 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-sm">Persona</h3>
                <Badge variant="outline" className="font-normal">
                  In every system prompt
                </Badge>
              </div>
              {personas[role]?.trim() ? (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                  {personas[role]?.trim()}
                </p>
              ) : (
                <p className="mt-2 rounded-lg border border-border border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
                  No persona written for this agent yet. It runs on the deployment default.
                </p>
              )}
            </Card>
            <RowList title="Tools" icon={<Wrench />} rows={tools} kind="tool" platform={platform} />
            <RowList title="Skills" icon={<Layers />} rows={skills} kind="skill" platform={platform} />
          </div>
        </TabsContent>

        <TabsContent value="yaml">
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <FileCode2 className="size-3.5 flex-none text-muted-foreground" />
              <span className="min-w-0 truncate font-mono text-xs">
                packages/bundle/tracy-cowork/presets/{id}/agent.cordis.yml
              </span>
              <Badge variant="secondary" className="ms-auto flex-none font-normal">
                Read-only
              </Badge>
            </div>
            <Separator />
            <pre
              className="max-h-[26rem] overflow-auto px-4 py-3 font-mono text-xs leading-relaxed"
              tabIndex={0}
            >
              {presetYaml(role, platform)}
            </pre>
          </Card>
        </TabsContent>
      </Tabs>

      <Panel
        title="Try the rule"
        aside={
          <span className="font-mono text-muted-foreground text-xs">
            packages/design/tracy-design-inspiration/src/client/preset-for.mjs
          </span>
        }
      >
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <label className="flex flex-col gap-1 text-muted-foreground text-xs">
            Session is on
            <NativeSelect
              size="sm"
              className="w-[13rem]"
              aria-label="Source preset"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {SOURCE_PRESETS.map((p) => (
                <NativeSelectOption key={p} value={p}>
                  {p}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground text-xs">
            Build button pressed
            <NativeSelect
              size="sm"
              className="w-[10rem]"
              aria-label="Target CMS"
              value={target}
              onChange={(e) => setTarget(e.target.value as Cms)}
            >
              {PLATFORM_IDS.map((p) => (
                <NativeSelectOption key={p} value={p}>
                  {p}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <ArrowRight className="mb-2 size-4 text-muted-foreground" aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">New session runs as</span>
            <output
              aria-label="Resolved preset"
              className="rounded-lg border border-border bg-muted px-3 py-1.5 font-mono text-sm"
            >
              {result ?? 'null'}
            </output>
          </div>
        </div>
        <Separator />
        <p className="px-4 py-3 text-muted-foreground text-xs">
          The role is kept when the session is already on one of the twelve. A session on one of dsh&rsquo;s
          own presets — <span className="font-mono">standard</span>, <span className="font-mono">plan</span> —
          has no Tracy role, and a build is design work, so it becomes{' '}
          <span className="font-mono">designer</span>. This panel demonstrates the policy; it does not offer
          to change it.
        </p>
      </Panel>

      <MisPresetExample />
    </div>
  )
}

/**
 * A session that ran under the wrong preset.
 *
 * The session, its id and its site are INVENTED. The two row lists are not: they are what
 * `resolve()` returns for the two presets, so the difference a reviewer reads is the real
 * difference between a WordPress agent and a Joomla one.
 */
function MisPresetExample() {
  const expected = resolve('developer', 'joomla')
  const actual = resolve('developer', 'wordpress')
  const expectedIds = new Set([...expected.tools, ...expected.skills].map((r) => r.id))
  const actualIds = new Set([...actual.tools, ...actual.skills].map((r) => r.id))
  const carriedWrongly = [...actual.tools, ...actual.skills].filter((r) => !expectedIds.has(r.id))
  const missed = [...expected.tools, ...expected.skills].filter((r) => !actualIds.has(r.id))

  return (
    <Panel
      title="A session that ran under the wrong preset"
      aside={
        <>
          <StatusChip status="mismatch" />
          <ProvenanceTag of="simulated" />
        </>
      }
    >
      <div className="grid gap-x-8 px-4 py-3 md:grid-cols-2">
        <div>
          <Fact label="Session">
            <span className="font-mono">s-4821</span> on site <span className="font-mono">tchdemo9</span> ·
            Joomla
          </Fact>
          <Fact label="Expected">
            <span className="font-mono">developer-joomla</span>
          </Fact>
          <Fact label="Actually ran as">
            <span className="font-mono">developer-wordpress</span>
          </Fact>
        </div>
        <div>
          <Fact label="Carried that it should not have">
            {carriedWrongly.length === 0 ? (
              <span className="text-muted-foreground">Nothing</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {carriedWrongly.map((r) => (
                  <Badge key={r.id} variant="outline" className="font-mono font-normal">
                    {r.id}
                  </Badge>
                ))}
              </span>
            )}
          </Fact>
          <Fact label="Missed that it should have carried">
            {missed.length === 0 ? (
              <span className="text-muted-foreground">Nothing</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {missed.map((r) => (
                  <Badge key={r.id} variant="outline" className="font-mono font-normal">
                    {r.id}
                  </Badge>
                ))}
              </span>
            )}
          </Fact>
          <Fact label="What that means on the site">
            A WordPress reader on a Joomla site: the agent looks for{' '}
            <span className="font-mono">wp-content</span> and finds nothing, and the Joomla skill that would
            have told it about template overrides was never mounted.
          </Fact>
        </div>
      </div>
    </Panel>
  )
}
