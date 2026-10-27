/**
 * The running card of one Build tool call (todo-build-with-experience.md §D2), rendered
 * through dsh's keyed `tool.call.toolview` slot. While the call is in flight (`block` has no
 * `kind`) it polls the host's `GET job`; once settled it shows the outcome in one line — dsh then
 * folds it into "1 tool call", and the picture card takes over in the turn tail (`BuiltRow`).
 * Measured on lucaswp 07/09 16:08: the slot fires while the tool runs, the stages tick in place.
 */
import { Skeleton, cn } from '@tracy/ui'
import { AlertCircle, Check, CircleDashed, Loader2, MessageSquare } from 'lucide-react'
import { type JSX, useEffect, useState } from 'react'

import { type BuildApi, type Job, type Stage } from './api'
import { cardWords, nextReadIn, readsJob } from './card-poll.mjs'
import { stageDetail } from './host-text'
import type { Translate } from './strings'

/** dsh's ToolCallBlock, duck-typed: a settled node carries `kind`, a running call does not. */
export interface BlockLike {
  kind?: string
  argsRaw?: string
  isError?: boolean
  content?: readonly { type: string; text?: string }[]
}

/** The tool's own one-line answer — `error` or `next` out of its JSON result, else the text's first line. */
function resultLine(block: BlockLike): string | null {
  const text = block.content?.find((c) => c.type === 'text')?.text
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as { error?: unknown; next?: unknown }
    if (typeof parsed.error === 'string') return parsed.error
    if (typeof parsed.next === 'string') return parsed.next
  } catch {
    // plain text
  }
  return text.split('\n')[0]?.slice(0, 160) ?? null
}

function argsOf(block: BlockLike): { action?: string; stage?: string } {
  try {
    const parsed = JSON.parse(block.argsRaw ?? '{}') as { action?: string; stage?: string }
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function StageRow({ stage, t }: { stage: Stage; t: Translate }): JSX.Element {
  const icon =
    stage.status === 'done' ? (
      <Check size={14} className="text-primary" />
    ) : stage.status === 'running' ? (
      <Loader2 size={14} className="animate-spin text-primary" />
    ) : stage.status === 'failed' ? (
      <AlertCircle size={14} className="text-destructive" />
    ) : stage.status === 'waiting' ? (
      <MessageSquare size={14} className="text-primary" />
    ) : (
      <CircleDashed size={14} className="text-muted-foreground" />
    )
  const words =
    stage.status === 'done' ? t(`stage.${stage.name}.done` as never) : t(`stage.${stage.name}.run` as never)
  // A stage the build could not do ITSELF but handed to the agent in the chat is still being
  // done, so it reads as such and keeps its words upright. Struck through and "skipped" is what
  // a customer saw on 19/09 while their business name was still waiting to be written in.
  const byAgent = stage.status === 'skipped' && stage.code === 'PERSONALIZE_BY_AGENT'
  const note =
    stage.status === 'waiting' && stage.detail?.startsWith('form:')
      ? t('card.answerInTab')
      : byAgent
        ? t('stage.byAgent')
        : stage.status === 'skipped'
          ? t('stage.skipped')
          : stage.status === 'failed'
            ? stageDetail(t, stage)
            : stage.status === 'done' && (stage.facts?.generated ?? 0) > 0
              ? `${t('stage.generated', { count: String(stage.facts?.generated) })}${stage.facts?.model ? ` · ${stage.facts.model}` : ''}`
              : null
  return (
    <li className="flex items-center gap-2" data-status={stage.status}>
      {icon}
      <span
        className={cn(
          stage.status === 'pending' && 'text-muted-foreground',
          stage.status === 'skipped' && !byAgent && 'text-muted-foreground line-through'
        )}
      >
        {words}
      </span>
      {stage.status === 'running' ? <Skeleton className="h-3 w-20" /> : null}
      {note ? <span className="text-muted-foreground text-xs">· {note}</span> : null}
    </li>
  )
}

export function BuildCard({ api, block, t }: { api: BuildApi; block: BlockLike; t: Translate }): JSX.Element {
  const settled = 'kind' in block
  const [job, setJob] = useState<Job | null>(null)
  const args = argsOf(block)

  useEffect(() => {
    if (!readsJob(args.action)) return
    let alive = true
    let timer: number | undefined
    let followed = false
    // Read, then decide when to read again (`card-poll.mjs`): the host's own "no job" before any job
    // was found stays no job for this call (asking again every 1.5 s only logged a 404 each time),
    // while a read that could not be made is no answer and is asked again, more slowly.
    const poll = async () => {
      const read = await api.readJob()
      if (!alive) return
      if (read.state === 'job') {
        followed = true
        setJob(read.job as Job)
      }
      const delay = nextReadIn({ settled, read, followed })
      if (delay !== null) timer = window.setTimeout(() => void poll(), delay)
    }
    void poll()
    return () => {
      alive = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [api, settled, args.action])

  if (args.action === 'ask') {
    return (
      <div className="tracy-site-build my-2 flex items-center gap-2 text-sm">
        <MessageSquare size={14} className="text-primary" />
        <span>{t('card.formSent')}</span>
      </div>
    )
  }
  // No job on the site: nothing to tick. Running, the engine is about to write it; settled, the
  // tool said why (a refused start, a status with nothing to read) — show that line, not six
  // pending rows that read as a build in progress (Lee, 07/09 17:55).
  if (!job || (args.action === 'status' && settled)) {
    const said = settled ? resultLine(block) : null
    return (
      <div className="tracy-site-build my-2 flex items-center gap-2 text-muted-foreground text-sm">
        {settled ? <CircleDashed size={14} /> : <Loader2 size={14} className="animate-spin text-primary" />}
        <span>{said ?? t(cardWords({ action: args.action, settled }))}</span>
      </div>
    )
  }
  const stages: Stage[] = job.stages
  const title =
    job?.status === 'failed'
      ? t('card.stopped')
      : job?.status === 'waiting'
        ? job.waiting?.startsWith('agent:')
          ? t('card.waitingAgent')
          : t('card.waiting')
        : job?.status === 'done'
          ? t('card.done')
          : job?.status === 'paused'
            ? t('card.paused')
            : args.action === 'rerun'
              ? t('card.updating')
              : t('card.building')
  return (
    <div className="tracy-site-build my-2 rounded-lg border border-border bg-card p-3 text-foreground text-sm">
      <div className="mb-2 font-medium">{title}</div>
      <ul className="flex flex-col gap-1.5">
        {stages.map((s) => (
          <StageRow key={s.name} stage={s} t={t} />
        ))}
      </ul>
    </div>
  )
}
