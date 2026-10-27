/**
 * What one rule of the Design system step says once its line is opened (inside "Details"): what was
 * seen, the systems by name, the pages, the elements behind a closed disclosure, and the fix in its
 * own box. A rule with no detector finding says the check's own words and its fix.
 */
import { cn } from '@tracy/ui'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { countedOf, type DsRun, firstOf, rowStamp, sentence, systemsSeen } from './ds-rule-display'
import { type CustomizeRule, type RuleFinding, ruleWhere } from './problem-guides'
import type { RuleRow } from './rule-rows'
import { useT } from '../i18n'

/** How many systems and pages a finding names before "+N more". */
const SHOWN = 4

/** The look of a disclosure's summary line: no marker, a 1px focus border (DESIGN.md §5). */
export const SUMMARY =
  'cursor-pointer list-none rounded-sm border border-transparent outline-none hover:text-foreground focus-visible:border-ring [&::-webkit-details-marker]:hidden'

/** One labelled line: a fixed-width label, then its content (the data attribute sits on the content). */
function Fact({
  label,
  children,
  ...rest
}: {
  label: string
  children: ReactNode
  [k: `data-${string}`]: string
}) {
  return (
    <div className="flex flex-col gap-x-2 sm:flex-row">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words" {...rest}>
        {children}
      </span>
    </div>
  )
}

/** "+3 more", when a list was cut. */
function More({ n }: { n: number }) {
  const t = useT()
  return n > 0 ? (
    <span className="text-muted-foreground">{t('cms-design.rule.more', { count: n })}</span>
  ) : null
}

/** The systems a finding was seen on, one per system: "Figma light ×2, dark ×2". */
function SeenOnList({ on }: { on: string[] }) {
  const { shown, more } = firstOf(systemsSeen(on), SHOWN)
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-0.5">
      {shown.map((s) => (
        <span key={s.system} title={s.raw.join(', ')}>
          {s.system}
          {s.schemes.map((x, i) => (
            <span key={`${x.scheme}${i}`} className="text-muted-foreground">
              {i ? ',' : ''} {x.scheme ?? ''}
              {x.count !== null ? <span className="tabular-nums"> ×{x.count}</span> : null}
            </span>
          ))}
        </span>
      ))}
      <More n={more} />
    </span>
  )
}

/** Pages (or site-wide elements): the path in monospace, the count beside it. */
function CountedList({ items }: { items: string[] }) {
  const { shown, more } = firstOf(items, SHOWN)
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {shown.map((raw) => {
        const c = countedOf(raw)
        return (
          <span key={raw} className="break-all">
            <span className="font-mono text-[11px]">{c.label}</span>
            {c.count !== null ? (
              <span className="text-muted-foreground tabular-nums"> ×{c.count}</span>
            ) : null}
          </span>
        )
      })}
      <More n={more} />
    </span>
  )
}

/** The fix, in its own quiet box. */
function FixBox({ fix }: { fix: string }) {
  const t = useT()
  return (
    <p className="rounded-md bg-muted/70 px-2.5 py-1.5 text-foreground" data-road-rule-fix="">
      <span className="font-semibold">{t('cms-design.rule.fix')} </span>
      {fix}
    </p>
  )
}

/** The elements (selectors) a finding names, behind a closed disclosure. */
function Elements({ where }: { where: string[] }) {
  const t = useT()
  if (where.length === 0) return null
  return (
    <details className="group/el" data-road-rule-where={where.join(', ')}>
      <summary className={cn(SUMMARY, 'inline-flex items-center gap-1 text-muted-foreground')}>
        <ChevronRight className="size-3 transition-transform group-open/el:rotate-90" aria-hidden="true" />
        {t('cms-design.rule.elements', { count: where.length })}
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5 ps-4 font-mono text-[11px] text-muted-foreground">
        {where.map((w) => (
          <li key={w} className="break-all">
            {w}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** One preview detector's finding: what, on which systems, where, and its fix. */
function Finding({ k }: { k: RuleFinding }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1" data-road-rule-finding={k.kind}>
      <Fact label={t('cms-design.rule.seen')} data-road-rule-what="">
        {sentence(k.what)}
      </Fact>
      {k.on.length ? (
        <Fact label={t('cms-design.rule.systems')} data-road-rule-on="">
          <SeenOnList on={k.on} />
        </Fact>
      ) : null}
      {k.sitewide?.length ? (
        <Fact label={t('cms-design.rule.sitewide')} data-road-rule-sitewide="">
          <CountedList items={k.sitewide} />
        </Fact>
      ) : null}
      {k.pages.length ? (
        <Fact label={t('cms-design.rule.pages')} data-road-rule-pages="">
          <CountedList items={k.pages} />
        </Fact>
      ) : null}
      <Elements where={k.where} />
      {k.fix ? <FixBox fix={k.fix} /> : null}
    </div>
  )
}

/** The body of one failing rule: its source, then findings, or the check's words; the fix; a stray run. */
export function RuleBody({ r, runs }: { r: CustomizeRule; runs: DsRun[] }) {
  const findings = r.findings ?? []
  const where = findings.length ? null : ruleWhere(r)
  const stamp = rowStamp(r, runs)
  const fix = r.fix && !findings.some((k) => k.fix) ? r.fix : null
  const t = useT()
  return (
    <>
      <Fact label={t('cms-design.rule.source')}>{r.question}</Fact>
      {findings.map((k) => (
        <Finding key={k.kind || k.what} k={k} />
      ))}
      {where ? (
        <Fact label={t('cms-design.rule.seen')} data-road-rule-where="">
          {where}
        </Fact>
      ) : null}
      {fix ? <FixBox fix={fix} /> : null}
      {stamp ? (
        <span className="text-muted-foreground" data-road-rule-measured="">
          {t('cms-design.rules.measuredOn', { stamp })}
        </span>
      ) : null}
    </>
  )
}

/** The body of rules waiting for the same measurement: every id, the reason and the fix once. */
export function FoldedBody({ row }: { row: Extract<RuleRow, { kind: 'folded' }> }) {
  const t = useT()
  return (
    <>
      <Fact label={t('cms-design.rule.rules')}>
        <span className="font-mono text-[11px] text-muted-foreground">
          {row.rules.map((r, i) => (
            <span key={r.rule} data-road-rule={r.rule}>
              {i ? ', ' : ''}
              {r.rule}
            </span>
          ))}
        </span>
      </Fact>
      <Fact label={t('cms-design.rule.why')} data-road-rule-where="">
        {row.reason}
      </Fact>
      {row.fix ? <FixBox fix={row.fix} /> : null}
    </>
  )
}
