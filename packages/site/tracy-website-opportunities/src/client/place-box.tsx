/**
 * The Find box: a text field with the place suggestions under it (`place-suggest.ts` asks for them).
 * Free text + Enter searches as typed: with no suggestion highlighted, Enter submits the form.
 */
import type { JSX, ReactNode, RefObject } from 'react'
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList, cn } from '@tracy/ui'

import { type Suggestion, isTypedChange } from './place-suggest.ts'

/**
 * `@tracy/ui`'s `Input` + `InputGroupInput` classes on a native <input>. Those components have no
 * `forwardRef`, so on dsh's React 18 Base UI never got the element, took the popup for a dialog and
 * moved focus into it (typed characters and ↓/Enter were lost).
 */
const FIELD = cn(
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 dark:disabled:bg-input/80',
  'flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent'
)

export function PlaceBox({
  id,
  placeholder,
  listLabel,
  anchor,
  text,
  suggestions,
  open,
  onOpenChange,
  onType,
  onPick,
  children
}: {
  id: string
  placeholder: string
  listLabel: string
  anchor: RefObject<HTMLDivElement | null>
  text: string
  suggestions: Suggestion[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onType: (text: string) => void
  onPick: (choice: Suggestion) => void
  /** Addons inside the field (the place icon, "Use my location"). */
  children?: ReactNode
}): JSX.Element {
  return (
    <Combobox
      items={suggestions}
      filter={null}
      value={null}
      itemToStringLabel={(s: Suggestion) => s.text}
      isItemEqualToValue={(a: Suggestion, b: Suggestion) => a.placeId === b.placeId}
      inputValue={text}
      onInputValueChange={(next: string, details: { reason?: string }) => {
        if (isTypedChange(details.reason)) onType(next)
      }}
      onValueChange={(choice: Suggestion | null) => {
        if (choice) onPick(choice)
      }}
      open={open && suggestions.length > 0}
      onOpenChange={onOpenChange}
    >
      {/* The anchor ref sits on a plain div: dsh's React 18 drops a ref given to a @tracy/ui function component. */}
      <div ref={anchor}>
        <ComboboxInput
          id={id}
          // Trigger and clear are off, so the combobox's own end addon is empty: hide it rather than pad the field.
          className="w-full [&>[data-slot=input-group-addon]:empty]:hidden"
          showTrigger={false}
          placeholder={placeholder}
          render={<input data-slot="input-group-control" className={FIELD} />}
        >
          {children}
        </ComboboxInput>
      </div>
      <ComboboxContent anchor={anchor}>
        <ComboboxList aria-label={listLabel} className="overflow-x-hidden">
          {(s: Suggestion) => (
            // No check mark is drawn (nothing stays selected), so no `pr-8` for one; dsh paints --accent the
            // popup's own colour, so the highlight mixes the text colour in (the plugin's row hover).
            <ComboboxItem
              key={s.placeId}
              value={s}
              className="box-border min-w-0 flex-wrap gap-x-2 gap-y-0 pr-1.5 data-highlighted:bg-foreground/6 data-highlighted:text-foreground"
            >
              <span className="min-w-0 break-words">{s.mainText}</span>
              {s.secondaryText !== null && (
                <span className="tracy-wo-small tracy-wo-muted min-w-0 break-words">{s.secondaryText}</span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
