// /ops/wo › Chain builds: one row per site the step chain built, with what it took and cost; a row opens to its steps.
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react'
import { Fragment, useCallback, useEffect, useState } from 'react'

import { formatDateTime } from './i18n/format.ts'
import { type T, useT } from './i18n/index.ts'
import {
  CHAIN_OUTCOMES,
  CHAIN_STEPS,
  type ChainBuild,
  type ChainBuildsDocument,
  fetchChainBuilds,
  formatMinutes,
  formatUsd
} from './wo-chain-builds-api.ts'

const STEP_KEYS: Record<string, string> = {
  site: 'wo-builds.step.site',
  kit: 'wo-builds.step.kit',
  brand: 'wo-builds.step.brand',
  plan: 'wo-builds.step.plan',
  copy: 'wo-builds.step.copy',
  pictures: 'wo-builds.step.pictures',
  write: 'wo-builds.step.write'
}
const OUTCOME_KEYS: Record<(typeof CHAIN_OUTCOMES)[number], string> = {
  done: 'wo-builds.outcome.done',
  failed: 'wo-builds.outcome.failed',
  'failed, best version used': 'wo-builds.outcome.bestVersion',
  skipped: 'wo-builds.outcome.skipped',
  stopped: 'wo-builds.outcome.stopped'
}

/** A step's name in the operator's language; a step this screen does not know is shown as the run named it. */
const stepName = (t: T, step: string) =>
  (CHAIN_STEPS as readonly string[]).includes(step) ? t(STEP_KEYS[step]) : step
const outcomeName = (t: T, outcome: string) =>
  outcome in OUTCOME_KEYS ? t(OUTCOME_KEYS[outcome as keyof typeof OUTCOME_KEYS]) : outcome

function EndingBadge({ build }: { build: ChainBuild }) {
  const t = useT()
  if (build.ending === 'complete') {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        {t('wo-builds.ending.complete')}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    >
      {build.failedStep
        ? t('wo-builds.ending.softFailure', { step: stepName(t, build.failedStep) })
        : t('wo-builds.ending.softFailureUnknown')}
    </Badge>
  )
}

function StepsTable({ build }: { build: ChainBuild }) {
  const t = useT()
  if (build.steps.length === 0)
    return <p className="text-muted-foreground text-xs">{t('wo-builds.noSteps')}</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-7 text-[11px]">{t('wo-builds.col.step')}</TableHead>
          <TableHead className="h-7 text-right text-[11px]">{t('wo-builds.col.minutes')}</TableHead>
          <TableHead className="h-7 text-right text-[11px]">{t('wo-builds.col.usd')}</TableHead>
          <TableHead className="h-7 text-[11px]">{t('wo-builds.col.result')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {build.steps.map((s) => (
          <TableRow key={s.step}>
            <TableCell className="py-1 text-xs">{stepName(t, s.step)}</TableCell>
            <TableCell className="py-1 text-right text-xs tabular-nums">{formatMinutes(s.minutes)}</TableCell>
            <TableCell className="py-1 text-right text-xs tabular-nums">{formatUsd(s.usd)}</TableCell>
            <TableCell className="py-1 text-xs">
              {outcomeName(t, s.outcome)}
              {s.error ? <span className="ml-2 text-muted-foreground">{s.error}</span> : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function WoChainBuildsPanel() {
  const t = useT()
  const [doc, setDoc] = useState<ChainBuildsDocument | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setFailure(null)
    try {
      setDoc(await fetchChainBuilds())
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })

  return (
    <Card className="py-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-5 py-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle className="text-base">{t('wo-builds.title')}</CardTitle>
          <CardDescription className="text-sm">{t('wo-builds.description')}</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          {t('wo-builds.refresh')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 px-5 py-0 text-sm">
        {failure ? (
          <Alert variant="destructive">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}
        {!doc && loading ? <p className="text-muted-foreground text-xs">{t('wo-builds.loading')}</p> : null}
        {doc && doc.builds.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('wo-builds.empty')}</p>
        ) : null}
        {doc && doc.slowAfterMinutes !== null ? (
          <p className="text-muted-foreground text-xs">
            {t('wo-builds.usual', {
              minutes: formatMinutes(doc.medianMinutes),
              limit: formatMinutes(doc.slowAfterMinutes)
            })}
          </p>
        ) : null}
        {doc && doc.builds.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{t('wo-builds.col.site')}</TableHead>
                <TableHead>{t('wo-builds.col.template')}</TableHead>
                <TableHead>{t('wo-builds.col.started')}</TableHead>
                <TableHead className="text-right">{t('wo-builds.col.minutes')}</TableHead>
                <TableHead className="text-right">{t('wo-builds.col.usd')}</TableHead>
                <TableHead>{t('wo-builds.col.ending')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.builds.map((b) => {
                const isOpen = open.has(b.siteKey)
                const name = b.label ?? b.siteKey
                return (
                  <Fragment key={b.siteKey}>
                    <TableRow
                      data-slow={b.slow ? 'true' : undefined}
                      className={cn(b.slow && 'bg-amber-500/15 hover:bg-amber-500/20')}
                    >
                      <TableCell className="py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-expanded={isOpen}
                          aria-label={t(isOpen ? 'wo-builds.collapse' : 'wo-builds.expand', { site: name })}
                          onClick={() => toggle(b.siteKey)}
                        >
                          {isOpen ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <ChevronRight className="size-3.5" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="py-1.5 text-xs">
                        {b.address ? (
                          <a
                            href={b.address}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t('wo-builds.openSite', { site: name })}
                            className="inline-flex items-center gap-1 font-medium hover:underline"
                          >
                            {name}
                            <ExternalLink className="size-3 opacity-60" />
                          </a>
                        ) : (
                          <span className="font-medium">{name}</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs">{b.template ?? ''}</TableCell>
                      <TableCell className="py-1.5 text-xs">{formatDateTime(b.startedAt, 'short')}</TableCell>
                      <TableCell className="py-1.5 text-right text-xs tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1.5">
                          {b.slow ? (
                            <AlertTriangle
                              className="size-3.5 text-amber-600 dark:text-amber-400"
                              aria-label={t('wo-builds.slow')}
                            />
                          ) : null}
                          {formatMinutes(b.totalMinutes)}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-xs tabular-nums">
                        {formatUsd(b.totalUsd)}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <EndingBadge build={b} />
                      </TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell />
                        <TableCell colSpan={6} className="pt-0 pb-3">
                          <StepsTable build={b} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  )
}
