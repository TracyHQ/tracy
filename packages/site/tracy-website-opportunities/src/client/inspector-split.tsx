import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@tracy/ui'
import type { Translate } from './strings.ts'

const WIDTH_KEY = 'tracy-wo-inspector-width'
const readWidth = () => {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(n) && n >= 360 ? n : 440
  } catch {
    return 440
  }
}
export function InspectorSplit({
  t,
  list,
  inspector
}: {
  t: Translate
  list: ReactNode
  inspector: ReactNode | null
}) {
  const container = useRef<HTMLDivElement>(null)
  const panel = useRef<{
    resize: (size: number | string) => void
    getSize: () => { inPixels: number; asPercentage: number }
    collapse: () => void
    expand: () => void
    isCollapsed: () => boolean
  } | null>(null)
  const [narrow, setNarrow] = useState(false)
  const [width, setWidth] = useState(readWidth)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width <= 900))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={container}
      className="tracy-wo-split"
      data-open={inspector !== null || undefined}
      data-narrow={narrow || undefined}
    >
      {inspector === null ? (
        list
      ) : narrow ? (
        inspector
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          onLayoutChanged={() =>
            requestAnimationFrame(() => {
              const size = panel.current?.getSize().inPixels
              if (size)
                try {
                  setWidth(Math.round(size))
                  localStorage.setItem(WIDTH_KEY, String(Math.round(size)))
                } catch {
                  /* Storage can be unavailable. */
                }
            })
          }
        >
          <ResizablePanel id="wo-list" minSize="40%">
            {list}
          </ResizablePanel>
          <ResizableHandle
            className="tracy-wo-resize"
            aria-label={t('v3.resize')}
            onDoubleClick={() => panel.current?.resize(440)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              event.stopPropagation()
              const current = panel.current?.getSize().inPixels ?? 440
              panel.current?.resize(current + (event.key === 'ArrowLeft' ? 30 : -30))
            }}
          />
          <ResizablePanel
            id="wo-inspector"
            panelRef={panel}
            defaultSize={width}
            minSize="360px"
            maxSize="60%"
          >
            {inspector}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}
