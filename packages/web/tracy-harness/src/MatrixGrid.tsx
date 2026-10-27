/**
 * The whole matrix, in the shape shadcn-admin gives a list you filter (`features/tasks`): a search
 * box, faceted filters, one row per thing, and the multi-value column carried as badges.
 *
 * WHY NOT A CHECKBOX GRID. Seven boolean columns is a spreadsheet, and it fails the way
 * spreadsheets fail an admin screen: at 79 rows nothing is findable, a reader has to hold seven
 * column headings in their head, and the answer people want — "which agents get this tool" — has
 * to be reassembled by eye. Badges answer it in one glance.
 *
 * WHY IT IS A VIEW OF THE AGENTS SCREEN AND NOT A THIRD MENU. It answers the INVERSE question of
 * the roster: not "what does this agent carry" but "who carries this row". Same matrix, turned
 * ninety degrees — and a menu entry would have promised a third place where decisions live.
 */
import {
  Badge,
  Button,
  Card,
  Checkbox,
  cn,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { FileCode2, ListFilter, Wrench, Layers, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Trans, useT } from './i18n'
import {
  groupLabel,
  platforms,
  roleLabel,
  roles,
  skillRows,
  sourceOf,
  toolRows,
  type MatrixRow,
  type RoleId
} from './matrix'

type Kind = 'tool' | 'skill'

interface MatrixEntry {
  row: MatrixRow
  kind: Kind
}

export function MatrixGrid() {
  const t = useT()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<readonly RoleId[]>([])
  const [kindFilter, setKindFilter] = useState<readonly Kind[]>([])

  const all = useMemo<readonly MatrixEntry[]>(
    () => [
      ...toolRows.map((row) => ({ row, kind: 'tool' as const })),
      ...skillRows.map((row) => ({ row, kind: 'skill' as const }))
    ],
    []
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(({ row, kind }) => {
      if (kindFilter.length && !kindFilter.includes(kind)) return false
      if (roleFilter.length && !roleFilter.some((r) => row.roles[r])) return false
      if (!q) return true
      return (
        row.id.toLowerCase().includes(q) ||
        row.tools?.some((t) => t.toLowerCase().includes(q)) === true ||
        row.description?.toLowerCase().includes(q) === true
      )
    })
  }, [all, query, roleFilter, kindFilter])

  const filtered = query !== '' || roleFilter.length > 0 || kindFilter.length > 0

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('matrix.grid.filterPlaceholder')}
          className="h-8 w-56"
        />
        <FacetFilter
          title={t('matrix.grid.facetAgent')}
          options={roles.map((r) => ({ value: r.id, label: roleLabel(r, t) }))}
          selected={roleFilter}
          onChange={setRoleFilter}
        />
        <FacetFilter
          title={t('matrix.grid.facetKind')}
          options={[
            { value: 'tool', label: t('matrix.grid.kindTool') },
            { value: 'skill', label: t('matrix.grid.kindSkill') }
          ]}
          selected={kindFilter}
          onChange={setKindFilter}
        />
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('')
              setRoleFilter([])
              setKindFilter([])
            }}
          >
            {t('matrix.grid.reset')}
            <X />
          </Button>
        ) : null}
        <span className="ms-auto text-muted-foreground text-xs tabular-nums">
          {t('matrix.grid.shown', { shown: shown.length, total: all.length })}
        </span>
      </div>

      <p className="text-muted-foreground text-xs">
        <Trans i18nKey="matrix.grid.explainer" components={{ b: <strong className="font-medium" /> }} />
      </p>

      {/* The table is wider than the card once Source is on it, so it scrolls in its own box.
          Letting the page scroll sideways instead would move the roster and the filters too. */}
      <Card className="overflow-hidden py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[15rem]">{t('matrix.grid.colRow')}</TableHead>
                <TableHead className="w-[8rem]">{t('matrix.grid.colArea')}</TableHead>
                <TableHead className="min-w-[14rem]">{t('matrix.grid.colAgents')}</TableHead>
                <TableHead className="w-[8rem]">{t('matrix.grid.colPlatform')}</TableHead>
                <TableHead className="w-[15rem]">{t('matrix.grid.colSource')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground text-sm">
                    {t('matrix.grid.noMatch')}
                  </TableCell>
                </TableRow>
              ) : null}
              {shown.map(({ row, kind }) => {
                const on = roles.filter((r) => row.roles[r.id])
                const plat = platforms.filter((p) => row.platforms[p.id] === true)
                return (
                  <TableRow key={`${kind}-${row.id}`}>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-2">
                        {kind === 'tool' ? <Wrench className="size-3.5 text-muted-foreground" /> : null}
                        {kind === 'skill' ? <Layers className="size-3.5 text-muted-foreground" /> : null}
                        <span className="font-mono text-sm">{row.id}</span>
                      </div>
                      {row.tools?.length ? (
                        <p className="mt-0.5 font-mono text-muted-foreground text-xs">
                          {row.tools.join(' · ')}
                        </p>
                      ) : null}
                    </TableCell>
                    {/* Only tools carry a group: they are plugins, and the group is the part of the
                      harness each one adds to. Skills are folders on disk with no such axis, so
                      the column names the library they come from instead of showing 53 dashes. */}
                    <TableCell className="align-top text-muted-foreground text-xs">
                      {row.group ? groupLabel(row.group, t) : t('matrix.grid.skillLibrary')}
                    </TableCell>
                    <TableCell className="align-top">
                      {on.length === 0 ? (
                        // A row no agent carries is the finding, not a blank: it is shipped in the
                        // image and wanted by nobody.
                        <span className="text-muted-foreground text-xs italic">
                          {t('matrix.grid.noAgent')}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {on.map((r) => (
                            <Badge key={r.id} variant="secondary" className="font-normal">
                              {roleLabel(r, t)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {plat.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        plat.map((p) => (
                          <Badge key={p.id} variant="outline" className="font-normal">
                            {p.label}
                          </Badge>
                        ))
                      )}
                    </TableCell>
                    {/* WAS A `⋯` MENU THAT COULD NOT EDIT ANYTHING. Its checkboxes mirrored the
                      badges one column to the left and moved nothing when pressed — a control
                      that lies about being a control. The column is worth more spent on the one
                      question the badges cannot answer: where does this row live. */}
                    <TableCell className="max-w-[15rem] align-top">
                      <SourceLine row={row} kind={kind} bare />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}

/** The faceted filter from shadcn-admin's table toolbar, without the cmdk dependency. */
function FacetFilter<T extends string>({
  title,
  options,
  selected,
  onChange
}: {
  title: string
  options: readonly { value: T; label: string }[]
  selected: readonly T[]
  onChange: (next: readonly T[]) => void
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="border-dashed" />}>
        <ListFilter />
        {title}
        {selected.length ? (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-4" />
            {selected.map((v) => (
              <Badge key={v} variant="secondary" className="font-normal">
                {options.find((o) => o.value === v)?.label}
              </Badge>
            ))}
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        {options.map((o) => {
          const checked = selected.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() =>
                onChange(checked ? selected.filter((v) => v !== o.value) : [...selected, o.value])
              }
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={checked} className="pointer-events-none" tabIndex={-1} />
              {o.label}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

/**
 * What one agent carries, in the shape shadcn-admin gives a library you switch on and off
 * (`features/apps`): a filter box, a status select, a sort, and a card per item whose button is
 * the state.
 *
 * WHY NOT THE DENSE LIST THIS REPLACED. Designer carries 27 skills and the list had no way to
 * find one. A roster you cannot search is a roster nobody audits, and the switch that matters is
 * the one nobody scrolled to.
 *
 * WHERE IT DEPARTS FROM THE TEMPLATE. The template hard-codes blue on the connected state; Tracy
 * has tokens for that, and a literal blue would be the one surface that stops following the
 * theme. The group is kept as a badge because the template's flat grid has no equivalent and
 * dropping it would lose which part of the harness a row belongs to.
 */

function SourceLine({ row, kind, bare = false }: { row: MatrixRow; kind: Kind; bare?: boolean }) {
  const t = useT()
  const source = sourceOf(row, kind, t)
  return (
    <p
      className={cn('flex items-center gap-1.5 text-xs', bare ? '' : 'mt-2 border-border border-t pt-2')}
      title={
        source.note ? t('matrix.grid.sourceTitle', { label: source.label, note: source.note }) : source.label
      }
    >
      <FileCode2 className="size-3.5 flex-none text-muted-foreground" />
      {source.href ? (
        <a
          href={source.href}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate font-mono text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          {source.label}
        </a>
      ) : (
        <span className="min-w-0 truncate font-mono text-muted-foreground">{source.label}</span>
      )}
    </p>
  )
}
