/**
 * M05 · Tools & skills — three layers that a single green tick usually flattens.
 *
 * DECLARED, LOADED, ALLOWED HERE. A tool named in a preset is declared. A tool dsh mounted at boot
 * is loaded. Whether this particular site lets the call through is a third question, answered by
 * the content contract, the sandbox mode and the path fence — and the first two can be true while
 * the third is false. `bash` on a quickstart site is exactly that row, and it is the reason this
 * screen has three columns instead of one.
 *
 * A SKILL IS NOT A TOOL, AND THE SCREEN REFUSES TO MIX THEM. A tool enforces; a skill is a
 * paragraph the agent may read and may ignore. Every skill row therefore carries a line saying
 * what, if anything, machine-enforces it — usually nothing, and saying so is the point.
 */
import {
  Badge,
  Button,
  NativeSelect,
  NativeSelectOption,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { Ban, Check, Layers, Lock, Search, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useOps } from './app'
import { CMS_LABEL } from './fixtures'
import { SAMPLE_SITE, SKILLS, STAGES, TOOLS, type Tool } from './screen-data'
import { Code, Fact, NoResults, Panel, ProvenanceTag, ScreenHead, TextField } from './parts'

const ROLE_OPTIONS = ['all', 'designer', 'developer', 'writer', 'seo-geo'] as const

export function Tools() {
  const ops = useOps()
  const [term, setTerm] = useState('')
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>('all')
  const [stage, setStage] = useState<string>('all')
  const [open, setOpen] = useState<string | null>(null)

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase()
    return TOOLS.filter(
      (t) =>
        t.cms.includes(ops.cms) &&
        (role === 'all' || t.roles.includes(role)) &&
        (stage === 'all' || (stage === 'none' ? t.stages.length === 0 : t.stages.includes(stage))) &&
        (needle === '' || t.name.includes(needle) || t.source.toLowerCase().includes(needle))
    )
  }, [term, role, stage, ops.cms])

  const skills = SKILLS.filter((s) => s.cms.includes(ops.cms))

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <ScreenHead
        title="Tools &amp; skills"
        sub={
          <>
            What an agent can call, where each one comes from, and which of the three layers it clears. The
            &ldquo;Allowed here&rdquo; column answers for one site, named below — permission is never a
            property of a tool alone.
          </>
        }
      />

      <Panel title="Answering for one site" icon={<Lock />}>
        <div className="grid gap-x-8 px-4 py-3 md:grid-cols-2">
          <div>
            <Fact label="Site">
              <span className="font-mono">{SAMPLE_SITE.label}</span> · {CMS_LABEL[SAMPLE_SITE.cms]} (invented
              label)
            </Fact>
            <Fact label="Contract">
              <span className="font-mono">{SAMPLE_SITE.contract}</span>
            </Fact>
          </div>
          <div>
            <Fact label="Policy file">
              <span className="font-mono">{SAMPLE_SITE.policyFile}</span>
            </Fact>
            <Fact label="Agent root">
              <span className="font-mono">{SAMPLE_SITE.root}</span>
            </Fact>
          </div>
        </div>
        <Separator />
        <p className="px-4 py-3 text-muted-foreground text-xs">
          The policy file existing is the whole switch — nothing logs it, and nothing on a running site
          announces it. That is why it belongs on a configuration screen rather than being discovered from a
          refusal.
        </p>
      </Panel>

      <Panel
        title="Tools"
        icon={<Wrench />}
        aside={
          <>
            <label className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Search className="size-3.5" aria-hidden />
              <TextField
                className="h-8 w-[11rem]"
                placeholder="Search tools"
                aria-label="Search tools"
                value={term}
                onValue={setTerm}
              />
            </label>
            <NativeSelect
              size="sm"
              className="w-[9rem]"
              aria-label="Filter by role"
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ROLE_OPTIONS)[number])}
            >
              {ROLE_OPTIONS.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {r === 'all' ? 'Every role' : r}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {/* The stage list is THIS CMS's own. There is no shared set to fall back on, so the
                options change when the CMS does — and on EmDash there are none. */}
            <NativeSelect
              size="sm"
              className="w-[12rem]"
              aria-label="Filter by build stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <NativeSelectOption value="all">Every build stage</NativeSelectOption>
              <NativeSelectOption value="none">Not tied to a stage</NativeSelectOption>
              {STAGES[ops.cms].map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {CMS_LABEL[ops.cms]} · {s.id}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <span className="text-muted-foreground text-xs tabular-nums">
              {rows.length} of {TOOLS.filter((t) => t.cms.includes(ops.cms)).length} on {CMS_LABEL[ops.cms]}
            </span>
          </>
        }
      >
        {rows.length === 0 ? (
          <NoResults
            term={term || `${role} · ${stage}`}
            onClear={() => {
              setTerm('')
              setRole('all')
              setStage('all')
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool the agent sees</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Declared</TableHead>
                  <TableHead>Loaded</TableHead>
                  <TableHead>Allowed here</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="font-mono text-sm">{t.name}</TableCell>
                    <TableCell className="max-w-[18rem] whitespace-normal text-xs">{t.purpose}</TableCell>
                    <TableCell className="whitespace-normal font-mono text-[11px] text-muted-foreground">
                      {t.source}
                    </TableCell>
                    <TableCell>
                      <Layer on={t.declared} />
                    </TableCell>
                    <TableCell>
                      <Layer on={t.loaded} />
                    </TableCell>
                    <TableCell>
                      <Layer on={t.allowed} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpen(open === t.name ? null : t.name)}
                        aria-label={`Limits on ${t.name}`}
                        aria-expanded={open === t.name}
                      >
                        Limits
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {open && rows.some((t) => t.name === open) ? (
          <>
            <Separator />
            <ToolLimits tool={rows.find((t) => t.name === open) as Tool} />
          </>
        ) : null}
      </Panel>

      <Panel
        title="Skills"
        icon={<Layers />}
        aside={
          <span className="text-muted-foreground text-xs">
            Mounted from <span className="font-mono">/opt/tracy/skills</span> at rank 300
          </span>
        }
      >
        <ul className="divide-y divide-border">
          {skills.length === 0 ? (
            <li className="px-4 py-6 text-center text-muted-foreground text-sm">
              No skill in this library names {CMS_LABEL[ops.cms]}.
            </li>
          ) : (
            skills.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{s.id}</span>
                  <Badge variant="secondary" className="font-normal">
                    {s.version ?? 'no version declared'}
                  </Badge>
                  <ProvenanceTag of={s.provenance} />
                  <span className="ms-auto font-mono text-[11px] text-muted-foreground">{s.path}</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {s.source} · {s.condition}
                </p>
                <Code path={`${s.path}/SKILL.md`} body={s.excerpt} excerpt maxHeight="8rem" />
                {/* 🔒 GUIDANCE AND ENFORCEMENT, NEVER THE SAME SENTENCE. A screen that lists a
                    skill next to a tool implies both are rules the machine keeps. Only one is. */}
                <p className="flex items-start gap-2 text-xs">
                  <Lock className="mt-0.5 size-3.5 flex-none text-muted-foreground" aria-hidden />
                  <span>
                    <span className="font-medium">Enforced by: </span>
                    <span className="text-muted-foreground">{s.enforced}</span>
                  </span>
                </p>
              </li>
            ))
          )}
        </ul>
      </Panel>

      <Panel title="What actually stands in the way" icon={<Ban />}>
        <ul className="divide-y divide-border">
          {[
            {
              gate: 'Content contract',
              where: 'packages/tools/tracy-subprocess-docker/src/content-contract.mjs',
              what: 'A site with a policy file may call file tools and the two door tools only. Shell and terminal are refused, and the writable area narrows to docs/agents.'
            },
            {
              gate: 'Sandbox mode',
              where: 'packages/tools/tracy-sandbox-docker/src/stamp.mjs',
              what: 'Read-only runs as nobody, write modes run as www-data. The mode is stamped onto the call before it leaves dsh.'
            },
            {
              gate: 'Path fence',
              where: 'packages/tools/tracy-subprocess-docker/src/route.mjs · FS_TOOL_ARGS',
              what: "Arguments named as paths are resolved and must land inside the session's site. Arguments named as content are never read as paths."
            },
            {
              gate: 'Workdir check',
              where: 'packages/tools/tracy-subprocess-docker/src/route.mjs · workdirDecision',
              what: 'A bash workdir belonging to another site is refused by label, before any filesystem call.'
            }
          ].map((g) => (
            <li key={g.gate} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-sm">{g.gate}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{g.where}</span>
              </div>
              <p className="text-muted-foreground text-xs">{g.what}</p>
            </li>
          ))}
        </ul>
        <Separator />
        <p className="px-4 py-3 text-muted-foreground text-xs">
          Four independent gates: any one of them refusing stops the call. Nothing here promises that every
          sentence written in a skill is also enforced — most are not.
        </p>
      </Panel>

      <p className="text-muted-foreground text-xs">
        Filtering for {CMS_LABEL[ops.cms]}
        {ops.focus ? ` · arrived with ${ops.focus}` : ''}.
      </p>
    </div>
  )
}

function Layer({ on }: { on: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {on ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <Ban className="size-3.5 text-destructive" aria-hidden />
      )}
      {on ? 'Yes' : 'No'}
    </span>
  )
}

function ToolLimits({ tool }: { tool: Tool }) {
  return (
    <div className="flex flex-col gap-3 bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{tool.name}</span>
        <Badge variant="outline" className="font-normal">
          Declared in {tool.declaredIn}
        </Badge>
      </div>
      <Fact label="Fence on its arguments">{tool.fence}</Fact>
      {tool.refusal ? (
        <div>
          <p className="font-medium text-muted-foreground text-xs">
            {tool.allowed
              ? 'What the customer sees when a path falls outside the allowed area'
              : `What the agent gets back on ${SAMPLE_SITE.label}`}
          </p>
          <p className="mt-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
            {tool.refusal}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Verbatim from <span className="font-mono">content-contract.mjs</span>. The refusal names the way
            out —<span className="font-mono"> tracy_site</span> — rather than only saying no.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No refusal path recorded for this tool on this site.</p>
      )}
    </div>
  )
}
