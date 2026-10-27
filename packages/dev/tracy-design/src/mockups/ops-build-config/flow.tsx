/**
 * M02 · Build stages — the six a CMS really runs, drawn once per CMS and never merged.
 *
 * 🔒 NO SHARED CHAIN ABOVE THE TWO DIAGRAMS (Lee, 12/09). An earlier draft laid a proposed
 * eight-step flow over both and mapped each step onto a stage. It read well, and it implied a model
 * nothing in the code has: `makeStages()` is written twice, the arrays differ at position two, and
 * the two `copy` stages are different functions that refuse for different reasons. So switching CMS
 * here replaces the whole diagram rather than re-colouring one.
 *
 * THE ONLY CROSS-CMS SENTENCE ON THE SCREEN NAMES A COLLISION, NOT A STRUCTURE: `style` exists on
 * both and does opposite work — it binds a lock on Joomla and switches on a style variation on
 * WordPress. Saying that is the point; drawing them as one step was the mistake.
 *
 * EMDASH GETS AN EMPTY STATE, NOT AN EMPTY DIAGRAM. There is no `stages.mjs`. Drawing six greyed
 * boxes would say "six stages, none finished"; the truth is nobody has decided what they are.
 */
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PlatformGlyph,
  Separator,
  cn
} from '@tracy/ui'
import { ArrowRight, CircleHelp, FlaskConical } from 'lucide-react'
import { useState } from 'react'

import { useOps } from './app'
import { CMS_LABEL, CMS_LIST, STATUS_LABEL } from './fixtures'
import { EMDASH_HAS, EXECUTOR_LABEL, STAGES, type Stage } from './screen-data'
import { Fact, Panel, ProvenanceTag, ScreenHead, Segmented, StatusChip } from './parts'

export function Flow() {
  const ops = useOps()
  const stages = STAGES[ops.cms]
  const [at, setAt] = useState(0)
  const current = stages[Math.min(at, Math.max(stages.length - 1, 0))]

  const picker = (
    <Segmented
      label="CMS"
      value={ops.cms}
      onChange={(id) => {
        ops.setCms(id)
        setAt(0)
      }}
      options={CMS_LIST.map((id) => ({ id, label: CMS_LABEL[id], icon: <PlatformGlyph platform={id} /> }))}
    />
  )

  if (stages.length === 0 || !current) {
    return (
      <div className="flex w-full flex-col gap-4 px-6 py-6">
        <ScreenHead
          title="Build stages"
          sub={`${CMS_LABEL[ops.cms]} has no stages module. Nothing runs, because nobody has decided what would.`}
        >
          {picker}
        </ScreenHead>
        <Empty className="rounded-xl border border-border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FlaskConical />
            </EmptyMedia>
            <EmptyTitle>No build stages for {CMS_LABEL[ops.cms]}</EmptyTitle>
            <EmptyDescription>
              There is no <span className="font-mono">src/host/stages.mjs</span> for EmDash — not an empty
              one, none at all. Six greyed boxes here would say &ldquo;six stages, none finished&rdquo;, which
              is the wrong problem.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <Panel title="What EmDash does have">
          <ul className="divide-y divide-border">
            {EMDASH_HAS.map((row) => (
              <li key={row.what} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium text-sm">{row.what}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{row.where}</span>
                </div>
                <p className="text-muted-foreground text-xs">{row.but}</p>
              </li>
            ))}
          </ul>
          <Separator />
          <p className="px-4 py-3 text-muted-foreground text-xs">
            Four presets that boot is the trap this screen exists to close: an agent that starts is not a
            build flow.
          </p>
        </Panel>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <ScreenHead
        title="Build stages"
        sub={
          <>
            The six stages {CMS_LABEL[ops.cms]} runs, in the order <span className="font-mono">STAGES</span>{' '}
            lists them. This is one CMS&rsquo;s own pipeline — the other is a different array of different
            functions, not a variant of this one.
          </>
        }
      >
        {picker}
      </ScreenHead>

      <Panel
        title={`${CMS_LABEL[ops.cms]} · ${stages.length} stages`}
        aside={
          <span className="font-mono text-muted-foreground text-xs">
            {stages.map((s) => s.id).join(' · ')}
          </span>
        }
      >
        <div className="flex flex-wrap items-stretch gap-1.5 px-4 py-4">
          {stages.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <StageChip
                index={i + 1}
                stage={s}
                active={i === at}
                onSelect={() => setAt(i)}
                cms={CMS_LABEL[ops.cms]}
              />
              {i < stages.length - 1 ? (
                <ArrowRight className="size-3.5 flex-none text-muted-foreground" aria-hidden />
              ) : null}
            </div>
          ))}
        </div>
        <Separator />
        {/* The one cross-CMS line on the screen, and it names a COLLISION rather than a structure. */}
        <p className="px-4 py-3 text-muted-foreground text-xs">
          Joomla&rsquo;s second stage is <span className="font-mono">template</span> and installs no template;
          WordPress&rsquo;s is <span className="font-mono">theme</span> and installs one. Both have a{' '}
          <span className="font-mono">style</span>, and it binds a lock on one and switches on a style
          variation on the other. Same words, unrelated code.
        </p>
      </Panel>

      <Panel
        title={
          <>
            <span className="font-mono">{current.id}</span> — {current.label}
          </>
        }
        aside={
          <>
            <StatusChip status={current.status} />
            <ProvenanceTag of={current.provenance} />
          </>
        }
      >
        <div className="grid gap-x-8 px-4 py-3 md:grid-cols-2">
          <div className="min-w-0">
            <Fact label="Runs where">{EXECUTOR_LABEL[current.executor]}</Fact>
            <Fact label="Input">{current.input}</Fact>
            <Fact label="Output">{current.output}</Fact>
            <Fact label="Implemented in">
              <span className="font-mono text-xs">{current.source}</span>
            </Fact>
          </div>
          <div className="min-w-0">
            <Fact label="Tools, skills and doors">
              {current.uses.length === 0 ? (
                <span className="text-muted-foreground">None</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {current.uses.map((u) => (
                    <Badge key={u} variant="secondary" className="font-mono font-normal">
                      {u}
                    </Badge>
                  ))}
                </span>
              )}
            </Fact>
            <Fact label="Contract">{current.contract}</Fact>
            <Fact label="Runs when, and what makes it refuse">{current.condition}</Fact>
            <Fact label="Note">{current.note}</Fact>
          </div>
        </div>

        {current.done ? (
          <>
            <Separator />
            <div className="px-4 py-3">
              <p className="font-medium text-sm">What it answers when it passes</p>
              <p className="mt-1 rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
                {current.done}
              </p>
            </div>
          </>
        ) : null}

        {current.waiting ? (
          <>
            <Separator />
            <div className="flex flex-wrap items-start gap-3 bg-muted/40 px-4 py-3">
              <CircleHelp className="mt-0.5 size-4 flex-none text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium text-sm">What the customer sees when it parks or fails</p>
                <p className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {current.waiting}
                </p>
              </div>
            </div>
          </>
        ) : null}

        <Separator />
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="text-muted-foreground text-xs">Go deeper, keeping {CMS_LABEL[ops.cms]}:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => ops.go('presets', { focus: `stage: ${current.id}`, from: 'flow' })}
          >
            Presets
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => ops.go('tools', { focus: `stage: ${current.id}`, from: 'flow' })}
          >
            Tools &amp; skills
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => ops.go('contracts', { focus: `stage: ${current.id}`, from: 'flow' })}
          >
            Contracts
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => ops.go('catalog', { focus: `stage: ${current.id}`, from: 'flow' })}
          >
            Quickstarts
          </Button>
        </div>
      </Panel>
    </div>
  )
}

function StageChip({
  index,
  stage,
  active,
  onSelect,
  cms
}: {
  index: number
  stage: Stage
  active: boolean
  onSelect: () => void
  cms: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${cms} stage ${index} ${stage.id} — ${STATUS_LABEL[stage.status]}`}
      className={cn(
        'flex min-w-0 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1',
        active ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-muted-foreground text-xs tabular-nums">{index}</span>
        <span className="font-medium font-mono text-sm">{stage.id}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[stage.status]}</span>
    </button>
  )
}
