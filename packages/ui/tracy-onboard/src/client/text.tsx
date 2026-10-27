/** Small helpers every step shares: the translate function's shape, and placeholders drawn in bold. */
import { Fragment, type JSX } from 'react'

/** The namespace's translate function, as dsh's slot runtime hands it (`locale: NS`). */
export type T = (key: string, params?: Record<string, unknown>) => string

/** Markers no translation contains, standing for the bold parts while the sentence is translated. */
const SLOT = '\u0000'

/**
 * A sentence with placeholders drawn in bold (`This computer uses <b>{system}</b>…`): the whole
 * sentence is translated, so each language places the names where its grammar wants them.
 * @param values - each placeholder's text, drawn in bold.
 */
export function Strong({ t, k, values }: { t: T; k: string; values: Record<string, string> }): JSX.Element {
  const names = Object.keys(values)
  const marked = Object.fromEntries(names.map((name, i) => [name, `${SLOT}${i}${SLOT}`]))
  const parts = t(k, marked).split(SLOT)
  // parts alternate: text, index, text, index, …
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <b key={i}>{values[names[Number(part)]] ?? ''}</b> : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  )
}

/** One placeholder in bold (`<b>{vendor}</b> isn't on this computer yet…`). */
export function Bold({ t, k, param, value }: { t: T; k: string; param: string; value: string }): JSX.Element {
  return <Strong t={t} k={k} values={{ [param]: value }} />
}
