import { COLUMN_IDS } from './types.ts'
import type { ColumnId, ExtraColumn } from './types.ts'

/** One drawn column after Place: a built-in one, or a consumer's. */
export type ColumnSlot = { kind: 'built-in'; id: ColumnId } | { kind: 'extra'; column: ExtraColumn }

export interface ColumnChoice {
  hidden: ReadonlySet<ColumnId>
  /** The built-in columns that exist at all (default: every one). Always drawn in table order. */
  columns?: readonly ColumnId[]
}

const builtIns = ({ hidden, columns }: ColumnChoice): ColumnId[] =>
  COLUMN_IDS.filter((id) => (columns === undefined || columns.includes(id)) && !hidden.has(id))

/**
 * Columns after Place, in order: `start` extras, the built-ins left with each `after` extra behind its
 * built-in (in that built-in's place when it is hidden), then `end` extras.
 */
export function tableColumns(choice: ColumnChoice & { extraColumns?: readonly ExtraColumn[] }): ColumnSlot[] {
  const extras = choice.extraColumns ?? []
  const slot = (column: ExtraColumn): ColumnSlot => ({ kind: 'extra' as const, column })
  const at = (position: 'start' | 'end'): ColumnSlot[] =>
    extras.filter((c) => c.after === undefined && (c.position ?? 'end') === position).map(slot)
  const shown = new Set(builtIns(choice))
  const middle = COLUMN_IDS.filter(
    (id) => choice.columns === undefined || choice.columns.includes(id)
  ).flatMap((id): ColumnSlot[] => [
    ...(shown.has(id) ? [{ kind: 'built-in' as const, id }] : []),
    ...extras.filter((c) => c.after === id).map(slot)
  ])
  return [...at('start'), ...middle, ...at('end')]
}

/** Whether the Type column is drawn; when it is not, the place line names the type instead. */
export function typeColumnShown(choice: ColumnChoice): boolean {
  return builtIns(choice).includes('type')
}
