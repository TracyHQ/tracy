/**
 * One extracted brand as a card: logo, name, seven colour roles, the two faces, the corrections Tracy
 * applied and why, and the way into Design inspirations where the same brand is the first card. The
 * kit itself is not drawn here — Design inspirations already draws it, with the customer's words in it.
 */
import type { JSX } from 'react'
import { Badge, Button, Card } from '@tracy/ui'
import { ExternalLink, Trash2 } from 'lucide-react'

import { type BrandRow, imageryUrl, logoUrl } from './api'
import type { Translate } from './strings'
import { interfaceLocale } from '@tracy/core/interface-languages'

const ROLES = ['background', 'surface', 'foreground', 'muted', 'border', 'accent', 'accent-secondary']

function when(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(interfaceLocale())
}

export function BrandCard({
  row,
  onOpen,
  onExtractAgain,
  onRemove,
  t
}: {
  row: BrandRow
  onOpen: (() => void) | null
  onExtractAgain: () => void
  onRemove: (() => void) | null
  t: Translate
}): JSX.Element {
  const b = row.brand
  const colors = (b?.colors ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex))
  const ordered = ROLES.map((r) => colors.find((c) => c.role === r)).filter((c) => c !== undefined)
  return (
    <Card data-brand={row.id} className="gap-0 overflow-hidden p-0">
      <div className="flex items-start gap-3 p-3">
        {b?.logo ? (
          <img
            src={logoUrl(row.host, b.logo)}
            alt=""
            className="size-12 shrink-0 rounded-md border border-border bg-background object-contain p-1"
          />
        ) : (
          <div
            className="size-12 shrink-0 rounded-md border border-border"
            style={{ background: ordered.find((c) => c.role === 'accent')?.hex ?? 'var(--muted)' }}
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-sm leading-tight">{row.name}</span>
            <Badge variant={row.kind === 'own' ? 'default' : 'secondary'} className="shrink-0">
              {row.kind === 'own' ? t('brand.yours') : t('builder.reference')}
            </Badge>
          </div>
          {row.host !== row.name ? (
            <div className="mt-0.5 truncate text-muted-foreground text-xs">{row.host}</div>
          ) : null}
          {b?.tagline ? <p className="m-0 mt-1.5 line-clamp-2 text-xs leading-snug">{b.tagline}</p> : null}
        </div>
      </div>

      {ordered.length > 0 ? (
        <div className="flex gap-1 px-3">
          {ordered.map((c) => (
            <span
              key={c.role}
              title={`${t(`role.${c.role}`)} ${c.hex}`}
              className="h-6 flex-1 rounded-sm border border-border"
              style={{ background: c.hex }}
            />
          ))}
        </div>
      ) : null}

      {b && b.imagery.length > 0 ? (
        <div className="mt-2 flex gap-1 overflow-hidden px-3" aria-label={t('card.imagery')}>
          {b.imagery.slice(0, 4).map((file) => (
            <img
              key={file}
              src={imageryUrl(row.host, file)}
              alt=""
              loading="lazy"
              className="h-14 min-w-0 flex-1 rounded-sm border border-border bg-muted object-cover"
            />
          ))}
        </div>
      ) : null}

      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 pt-2.5 text-xs">
        <dt className="text-muted-foreground">{t('card.fonts')}</dt>
        <dd className="m-0 truncate">
          {b?.display && b.body && b.display !== b.body
            ? t('card.font.two', { display: b.display, body: b.body })
            : t('card.font.same', { display: b?.display ?? b?.body ?? '—' })}
        </dd>
      </dl>

      {row.refined.length > 0 ? (
        <details className="px-3 pt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {row.refined.length === 1
              ? t('card.refinedOne')
              : t('card.refined', { count: row.refined.length })}
          </summary>
          <ul className="m-0 mt-1 list-disc pl-4 text-muted-foreground">
            {row.refined.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {row.source.blocked || row.source.thin ? (
        <p
          className={`m-0 px-3 pt-2 text-xs ${row.source.blocked ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {row.source.blocked ? t('card.blocked') : t('card.thin')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 p-3">
        {onOpen ? (
          <Button size="sm" onClick={onOpen}>
            <ExternalLink size={14} />
            {t('card.open')}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onExtractAgain}>
          {t('brand.extractAgain')}
        </Button>
        {onRemove ? (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onRemove}>
            <Trash2 size={14} />
            {t('builder.remove')}
          </Button>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {t('card.extractedAt', { when: when(row.source.extractedAt) })}
        </span>
      </div>
    </Card>
  )
}
