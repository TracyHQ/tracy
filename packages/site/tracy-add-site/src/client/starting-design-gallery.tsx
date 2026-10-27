/** The platform's starting designs, using the design system gallery's card and toolbar. */
import { type JSX, useMemo, useRef, useState } from 'react'

import { DesignSystemFilter } from './design-system-filter'
import { NO_FILTER, type SystemFilter } from './design-system-filter.mjs'
import { GalleryCard } from './design-system-grid-card'
import { buildsOn, previewOf } from './start-template.mjs'
import { startingDesignImage } from './starting-design-image.mjs'
import { StartingDesignPreview } from './starting-design-preview'
import type { Translate } from './strings'

export function StartingDesignGallery({
  t,
  templates,
  platform,
  selected,
  onSelect,
  onUse
}: {
  t: Translate
  templates: any[]
  platform: string
  selected: string
  onSelect: (id: string) => void
  /** The preview's explicit confirmation selects the design and continues the wizard. */
  onUse: (id: string) => void
}): JSX.Element {
  const [filter, setFilter] = useState<SystemFilter>(NO_FILTER)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  // A stable partition keeps catalogue order behind the incoming or default selection.
  const [first] = useState(selected)
  const rows = useMemo(
    () =>
      templates
        .filter((card) => buildsOn(card, platform))
        .map((card) => ({
          card,
          name: previewOf(card)!.name,
          group: typeof card.card?.category === 'string' ? card.card.category.trim() : ''
        }))
        .sort((a, b) => Number(b.card.id === first) - Number(a.card.id === first)),
    [templates, platform, first]
  )
  const categories = useMemo(
    () =>
      [...new Set(rows.map((row) => row.group).filter(Boolean))].map((key) => ({
        key,
        count: rows.filter((row) => row.group === key).length
      })),
    [rows]
  )
  const query = filter.query.trim().toLowerCase()
  const shown = rows.filter(
    (row) =>
      (!query || row.name.toLowerCase().includes(query)) &&
      (!filter.categories.size || filter.categories.has(row.group))
  )
  const previewIndex = shown.findIndex(({ card }) => card.id === previewId)
  const preview = shown[previewIndex]
  return (
    <div data-start-template-gallery="1">
      <div className="tas-ds-tools">
        <DesignSystemFilter
          t={t}
          rows={rows}
          value={filter}
          onChange={setFilter}
          shown={shown.length}
          categories={categories}
          categoryLabel={(key) => key}
          searchPlaceholder={t('start_filter_search')}
          countText={t(shown.length === rows.length ? 'start_filter_count_all' : 'start_filter_count', {
            shown: shown.length,
            total: rows.length
          })}
        />
      </div>
      <div className="tas-ds-body">
        {!shown.length ? (
          <p className="m-0 py-6 text-center text-muted-foreground text-xs">{t('start_filter_empty')}</p>
        ) : null}
        <div className="tas-ds-grid">
          {shown.map(({ card, name, group }) => (
            <GalleryCard
              key={card.id}
              t={t}
              name={name}
              description={group || card.card?.blurb || ''}
              image={startingDesignImage(card)}
              imageAspect
              selected={card.id === selected}
              marker={{ 'data-start-template': card.id }}
              onPick={() => onSelect(card.id)}
              onPreview={(button) => {
                returnTo.current = button
                setPreviewId(card.id)
              }}
            />
          ))}
        </div>
      </div>
      {preview ? (
        <StartingDesignPreview
          t={t}
          card={preview.card}
          platform={platform}
          returnTo={returnTo}
          onUse={() => {
            onUse(preview.card.id)
            setPreviewId(null)
          }}
          onBack={() => setPreviewId(null)}
          position={{ index: previewIndex, total: shown.length }}
          onStep={(dir) => setPreviewId(shown[(previewIndex + dir + shown.length) % shown.length].card.id)}
        />
      ) : null}
    </div>
  )
}
