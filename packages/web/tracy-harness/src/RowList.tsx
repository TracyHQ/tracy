/**
 * The rows one agent carries, on both screens.
 *
 * `editable` IS THE WHOLE DIFFERENCE BETWEEN THE TWO SCREENS, and it is a prop rather than two
 * components because the rows themselves are identical — same data, same order, same source line.
 * On CMS agents a row is a decision somebody makes, so it carries a switch. On Presets the same
 * row is a line in a generated file, so it carries nothing: a control there would offer to edit
 * the output of a generator.
 *
 * IN FILE ORDER, NOT SORTED. The list has to be readable next to the preset's row in `presets.patch.yml` on the other
 * screen; re-ordering it here would make the two say different things about the same preset.
 */
import { Badge, Card, cn, Separator, Switch } from '@tracy/ui'
import { FileCode2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { useT } from './i18n'
import { platforms, sourceOf, type MatrixRow, type PlatformId } from './matrix'

export function RowList({
  title,
  icon,
  rows,
  kind,
  platform,
  editable = false,
  off = [],
  onToggle
}: {
  title: string
  icon: ReactNode
  rows: readonly MatrixRow[]
  kind: 'tool' | 'skill'
  platform: PlatformId
  editable?: boolean
  off?: readonly string[]
  onToggle?: (id: string, on: boolean) => void
}) {
  const t = useT()
  const platformLabel = platforms.find((p) => p.id === platform)?.label

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center gap-2 px-4 py-3 [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        <h3 className="font-medium text-sm">{title}</h3>
        <span className="text-muted-foreground text-xs tabular-nums">{rows.length}</span>
        <span className="ms-auto text-muted-foreground text-xs">{t('matrix.rows.fileOrder')}</span>
      </div>
      <Separator />
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const fromPlatform = row.platforms[platform] === true
          const source = sourceOf(row, kind, t)
          const isOff = off.includes(row.id)
          return (
            <li
              key={row.id}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5',
                isOff && 'bg-muted/40'
              )}
            >
              {editable ? (
                /* A platform row is not this agent's to switch off: dropping it would leave an
                   agent claiming a CMS it can no longer read. On and disabled says both things at
                   once, where hiding the control would say the row has no state. */
                <Switch
                  size="sm"
                  checked={fromPlatform || !isOff}
                  disabled={fromPlatform}
                  onCheckedChange={(on) => onToggle?.(row.id, on)}
                  aria-label={t('matrix.rows.toggle', { id: row.id })}
                />
              ) : null}
              <span className={cn('font-mono text-sm', isOff && 'text-muted-foreground')}>{row.id}</span>
              {/* The row id and the tool names are not the same thing: `tool-fs` is what somebody
                  switches, `read` `write` `edit` are what the MODEL sees. Badges keep them apart. */}
              {row.tools?.map((tool) => (
                <Badge key={tool} variant="secondary" className="font-mono font-normal">
                  {tool}
                </Badge>
              ))}
              {fromPlatform ? (
                <Badge variant="outline" className="font-normal">
                  {t('matrix.rows.fromPlatform', { platform: platformLabel ?? platform })}
                </Badge>
              ) : null}
              <span className="ms-auto flex min-w-0 items-center gap-1.5">
                <FileCode2 className="size-3.5 flex-none text-muted-foreground" />
                {source.href ? (
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate font-mono text-muted-foreground text-xs underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    {source.label}
                  </a>
                ) : (
                  <span
                    className="min-w-0 truncate font-mono text-muted-foreground text-xs"
                    title={source.note}
                  >
                    {source.label}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
