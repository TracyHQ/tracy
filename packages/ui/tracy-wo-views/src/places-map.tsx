import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { clusterPins } from './map-clusters.ts'
import type { PinGroup } from './map-clusters.ts'
import { pinIcon, pinPalette, readPinTokens } from './map-pins.ts'
import { PlaceCard } from './place-card.tsx'
import type { CardOptions, MapPin, PlaceRow, RowActions, Translate } from './types.ts'

/**
 * The slice of the Google Maps JavaScript API this view calls, so the library needs neither the
 * SDK nor `@types/google.maps`; the loaded `google.maps` namespace satisfies it.
 */
export interface LatLngLiteral {
  lat: number
  lng: number
}
interface Listener {
  remove(): void
}
export interface MapsMapLike {
  setCenter(c: LatLngLiteral): void
  getZoom(): number | undefined
  setZoom(z: number): void
  fitBounds(bounds: unknown, padding?: number): void
  addListener(event: string, fn: () => void): Listener
}
interface ClassicMarkerLike {
  setMap(map: MapsMapLike | null): void
  addListener(event: string, fn: () => void): Listener
}
interface AdvancedMarkerLike {
  map?: unknown
  addListener(event: string, fn: () => void): Listener
}
export interface MapsApi {
  Map: new (
    el: HTMLElement,
    opts: {
      center: LatLngLiteral
      zoom: number
      mapId?: string
      clickableIcons?: boolean
      gestureHandling?: string
    }
  ) => MapsMapLike
  LatLngBounds: new () => { extend(p: LatLngLiteral): unknown }
  Point?: new (x: number, y: number) => unknown
  Size?: new (width: number, height: number) => unknown
  Marker?: new (opts: {
    position: LatLngLiteral
    map: MapsMapLike
    title?: string
    icon?: { url: string; anchor?: unknown; scaledSize?: unknown }
    zIndex?: number
  }) => ClassicMarkerLike
  marker?: {
    AdvancedMarkerElement: new (opts: {
      position: LatLngLiteral
      map: MapsMapLike
      content?: HTMLElement
      title?: string
      gmpClickable?: boolean
    }) => AdvancedMarkerLike
  }
}

export interface PlacesMapProps {
  t: Translate
  rows: PlaceRow[]
  selected: ReadonlySet<string>
  actions: RowActions
  /** The loaded SDK namespace, or null → `unavailableNote` instead of a map. */
  maps: MapsApi | null
  center: { lat: number; lon: number } | null
  unavailableNote: string
  /** A Cloud map ID; advanced markers (HTML grade pins) need one, else classic markers with SVG grade pins (map-pins.ts). */
  mapId?: string
  locale?: string
  /** A pin's own label and colour instead of its grade (My opportunities: its stage). */
  pin?(row: PlaceRow): MapPin
  /** Replaces the grade legend under the map. */
  legend?: ReactNode
  /** The card a pin opens (`PlaceCard.options`). */
  card?: CardOptions
}

const DEFAULT_ZOOM = 14
const toLatLng = (lat: number, lon: number): LatLngLiteral => ({ lat, lng: lon })

function pinElement(group: PinGroup, selected: ReadonlySet<string>, own: MapPin | null): HTMLElement {
  const el = document.createElement('span')
  el.className = 'tracy-wo-pin'
  const first = group.rows[0]
  if (group.rows.length > 1) {
    el.dataset.cluster = 'true'
    el.textContent = String(group.rows.length)
  } else if (first) {
    const tone = own ? own.tone : first.score.grade
    if (tone) el.dataset.grade = tone
    el.dataset.selected = String(selected.has(first.key))
    el.textContent = own ? own.label : first.score.grade
  }
  return el
}

/** Grade pins (A/B/C) that group when zoomed out; clicking a pin opens its card over the map. */
export function PlacesMap({
  t,
  rows,
  selected,
  actions,
  maps,
  center,
  unavailableNote,
  mapId,
  locale = 'en',
  pin,
  legend,
  card
}: PlacesMapProps) {
  const box = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapsMapLike | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [active, setActive] = useState<string | null>(null)

  // One map per SDK and container.
  useEffect(() => {
    if (!maps || !box.current) return
    const start = center ?? rows.find((r) => r.lat != null && r.lon != null)
    const m = new maps.Map(box.current, {
      center:
        start && start.lat != null && start.lon != null ? toLatLng(start.lat, start.lon) : { lat: 0, lng: 0 },
      zoom: start ? DEFAULT_ZOOM : 2,
      ...(mapId ? { mapId } : {}),
      clickableIcons: false,
      gestureHandling: 'cooperative'
    })
    const idle = m.addListener('idle', () => setZoom(m.getZoom() ?? DEFAULT_ZOOM))
    setMap(m)
    return () => {
      idle.remove()
      setMap(null)
    }
    // center and rows only seed the first view; later centers go through setCenter below.
  }, [maps, mapId])

  useEffect(() => {
    if (map && center) map.setCenter(toLatLng(center.lat, center.lon))
  }, [map, center?.lat, center?.lon])

  // Frame the places whenever the set of places changes.
  const placeKeys = rows.map((r) => r.key).join('|')
  useEffect(() => {
    if (!map || !maps) return
    const located = rows.filter((r) => r.lat != null && r.lon != null)
    if (located.length < 2) return
    const bounds = new maps.LatLngBounds()
    for (const r of located) if (r.lat != null && r.lon != null) bounds.extend(toLatLng(r.lat, r.lon))
    map.fitBounds(bounds, 48)
    // Keyed on the places, not the row objects, so a re-score does not re-frame the map.
  }, [map, maps, placeKeys])

  const groups = useMemo(() => clusterPins(rows, zoom), [rows, zoom])

  useEffect(() => {
    if (!map || !maps) return
    const advanced = mapId && maps.marker ? maps.marker.AdvancedMarkerElement : null
    // Read per render of the pins, so a theme switch repaints them with the next re-cluster.
    const tokens = readPinTokens(box.current ?? document.documentElement)
    const cleanups: Array<() => void> = []
    for (const g of groups) {
      const position = toLatLng(g.lat, g.lon)
      const first = g.rows[0]
      const own = first && g.rows.length === 1 && pin ? pin(first) : null
      const title =
        g.rows.length > 1
          ? t('results.map.cluster', { count: g.rows.length })
          : own
            ? own.title
            : first
              ? t('results.map.pin', { name: first.name, grade: first.score.grade })
              : ''
      const onClick = () => {
        if (g.rows.length > 1) {
          map.setCenter(position)
          map.setZoom((map.getZoom() ?? zoom) + 2)
        } else if (first) setActive(first.key)
      }
      if (advanced) {
        const marker = new advanced({
          position,
          map,
          content: pinElement(g, selected, own),
          title,
          gmpClickable: true
        })
        const l = marker.addListener('click', onClick)
        cleanups.push(() => {
          l.remove()
          marker.map = null
        })
      } else if (maps.Marker) {
        const cluster = g.rows.length > 1
        const grade = cluster ? null : own ? own.tone : (first?.score.grade ?? null)
        const icon = pinIcon({
          shape: cluster ? 'cluster' : 'pin',
          text: cluster ? String(g.rows.length) : own ? own.label : (grade ?? ''),
          ...pinPalette(tokens, grade, !cluster && first !== undefined && selected.has(first.key))
        })
        const marker = new maps.Marker({
          position,
          map,
          title,
          icon: {
            url: icon.url,
            ...(maps.Point ? { anchor: new maps.Point(icon.anchor.x, icon.anchor.y) } : {}),
            ...(maps.Size ? { scaledSize: new maps.Size(icon.width, icon.height) } : {})
          },
          // A above B above C; groups on top so their count stays readable.
          zIndex: cluster ? 4 : grade === 'A' ? 3 : grade === 'B' ? 2 : 1
        })
        const l = marker.addListener('click', onClick)
        cleanups.push(() => {
          l.remove()
          marker.setMap(null)
        })
      }
    }
    return () => {
      for (const c of cleanups) c()
    }
  }, [map, maps, mapId, groups, selected, t, zoom, pin])

  const activeRow = active ? rows.find((r) => r.key === active) : undefined

  if (!maps) {
    return (
      <div className="tracy-wo-map tracy-wo-map-empty">
        <p className="tracy-wo-muted">{unavailableNote}</p>
      </div>
    )
  }
  return (
    <div className="tracy-wo-map">
      <div ref={box} className="tracy-wo-map-canvas" role="region" aria-label={t('results.map.label')} />
      <div className="tracy-wo-map-legend">
        {legend ?? (
          <>
            {(['A', 'B', 'C'] as const).map((g) => (
              <span key={g} className="tracy-wo-line">
                <i className="tracy-wo-dot" data-grade={g} />
                {g}
              </span>
            ))}
            <span className="tracy-wo-muted">· {t('results.map.legend')}</span>
          </>
        )}
      </div>
      {activeRow ? (
        <PlaceCard
          t={t}
          row={activeRow}
          selected={selected.has(activeRow.key)}
          actions={actions}
          compact
          locale={locale}
          onClose={() => setActive(null)}
          className="tracy-wo-map-card"
          options={card}
        />
      ) : null}
    </div>
  )
}
