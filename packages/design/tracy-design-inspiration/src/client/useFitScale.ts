/**
 * The scale that fits a `width`-px document into the element the ref points at, kept current as
 * the element resizes. `FixtureThumb` (a 1280-px fixture) and `DemoThumb` (a 1440-px demo) both
 * draw a full-size document and shrink it to the card with `transform: scale()`; this is the one
 * place that arithmetic lives.
 */
import { type RefObject, useEffect, useState } from 'react'

export function useFitScale(ref: RefObject<HTMLElement | null>, width: number): number {
  const [scale, setScale] = useState(0.25)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = (): void => setScale(el.clientWidth / width)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, width])
  return scale
}
