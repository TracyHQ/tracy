/**
 * The build's six steps across the Progress band's right pane (#537, option A "Full-width stepper, six columns"
 * chosen by the owner): six equal columns, each a node on one connecting line, the step name under it (always shown,
 * also once done) and a muted line with the step's time and cost (`progress-band-build-model.ts`). Done is green,
 * running terracotta, waiting grey. A narrow pane folds the six into two rows of three (`progress-band-css.ts`).
 */
import { Check, X } from 'lucide-react'
import type { JSX } from 'react'

import type { BuildColumn } from './progress-band-build-model.ts'
import type { Translate } from './strings.ts'

export function BuildColumns({ t, columns }: { t: Translate; columns: BuildColumn[] }): JSX.Element {
  return (
    <ol className="tracy-wo-band-cols" aria-label={t('band.build.steps')}>
      {columns.map((c) => {
        const state = t(`brief.job.state.${c.state}`)
        return (
          <li
            key={c.key}
            data-state={c.state}
            title={c.figure ? `${c.label}: ${c.figure}` : `${c.label}: ${state}`}
          >
            <span className="tracy-wo-band-col-node" data-node={c.state} aria-hidden="true">
              {c.state === 'done' ? <Check /> : c.state === 'failed' ? <X /> : null}
            </span>
            <span className="tracy-wo-band-col-name">{c.label}</span>
            {c.figure ? <span className="tracy-wo-band-col-fig">{c.figure}</span> : null}
            <span className="tracy-wo-band-sub-state">{state}</span>
          </li>
        )
      })}
    </ol>
  )
}
