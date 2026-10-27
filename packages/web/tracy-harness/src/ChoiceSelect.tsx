import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@tracy/ui'
import type { ReactNode } from 'react'

export interface Choice {
  value: string
  /** What the trigger shows once chosen. */
  label: ReactNode
  /** What the open list shows for this choice, when it says more than the label. */
  option?: ReactNode
}

/**
 * A closed list of choices whose trigger shows the chosen LABEL. A bare `<SelectValue />` prints the
 * value base-ui holds (`auto`, `30d`), in English whatever the language; `items` teaches it the labels.
 */
export function ChoiceSelect({
  value,
  onValueChange,
  choices,
  disabled,
  id,
  className
}: {
  value: string
  onValueChange: (value: string) => void
  choices: readonly Choice[]
  disabled?: boolean
  id?: string
  className?: string
}) {
  return (
    <Select
      value={value}
      items={choices}
      disabled={disabled}
      // A Select can be cleared (null); none of these has a "no choice" state.
      onValueChange={(next) => next !== null && onValueChange(next)}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.option ?? choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
