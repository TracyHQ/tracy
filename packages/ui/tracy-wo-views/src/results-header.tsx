import { Spinner } from '@tracy/ui'
import type { ReactNode } from 'react'

import type { Kind, Provider, Translate } from './types.ts'

export interface ResultsHeaderProps {
  t: Translate
  found: number
  shown: number
  hiddenChains: number
  /** Already translated, e.g. `t('results.sort.score')`. */
  sortLabel: string
  provider: Provider | null
  checking?: { done: number; total: number } | null
  /** Social pages with settled stats, of all linked pages; null/absent = no social stats line. */
  social?: { done: number; total: number } | null
  /** The kind tab in use, named in "5 Restaurants shown". */
  kind?: Kind | null
  /** Tools on the right: ViewSwitch, ColumnsMenu, SortSelect, the consumer's own buttons. */
  children?: ReactNode
}

/** "47 found · 3 chains hidden · sorted by Opportunity" over "From Google Maps · Website checks: 31 of 47 done". */
export function ResultsHeader({
  t,
  found,
  shown,
  hiddenChains,
  sortLabel,
  provider,
  checking,
  social,
  kind,
  children
}: ResultsHeaderProps) {
  const running = checking != null && checking.done < checking.total
  const facts = [
    shown === found
      ? null
      : kind
        ? t('results.shownOfKind', { count: shown, kind: t(`kind.${kind}`) })
        : t('results.shown', { count: shown }),
    hiddenChains > 0 ? t('results.chainsHidden', { count: hiddenChains }) : null,
    t('results.sortedBy', { sort: sortLabel })
  ].filter(Boolean)
  return (
    <div className="tracy-wo-res-head">
      <div className="tracy-wo-res-title">
        <p className="tracy-wo-count">
          <b>{t('results.found', { count: found })}</b>
          <span className="tracy-wo-muted">{facts.map((f) => ` · ${f}`).join('')}</span>
        </p>
        {provider || checking || social ? (
          <p className="tracy-wo-note">
            {provider ? <span>{t(`results.provider.${provider}`)}</span> : null}
            {provider && checking ? <span aria-hidden>·</span> : null}
            {running ? <Spinner label={t('results.checkingLabel')} className="size-3.5" /> : null}
            {checking ? (
              <span>
                {t(running ? 'results.checking' : 'results.checked', {
                  done: checking.done,
                  total: checking.total
                })}
              </span>
            ) : null}
            {social ? (
              <>
                {provider || checking ? <span aria-hidden>·</span> : null}
                <span>{t('results.socialChecked', { done: social.done, total: social.total })}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      {children ? <div className="tracy-wo-tools">{children}</div> : null}
    </div>
  )
}
