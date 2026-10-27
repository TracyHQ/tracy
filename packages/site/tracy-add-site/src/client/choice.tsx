/**
 * What both wizards draw a choice with — two sources (create · import) in `wizard.tsx`, two ways
 * of reading a site (admin · manual) in `import-wizard.tsx`.
 *
 * A file of its own because `wizard.tsx` already imports `import-wizard.tsx`; pulling the other
 * way would be an import cycle.
 *
 * `ChoiceOption` itself lives with the ask form's primitives in `@tracy/site-build-core`
 * (`src/client/ask-form/primitives.tsx`, 04/10/2026) and is re-exported here unchanged.
 */
import type { JSX, ReactNode } from 'react'

export {
  ChoiceOption,
  type ChoiceOptionProps
} from '../../../tracy-site-build-core/src/client/ask-form/primitives'

/** A side note: a dashed-border block, muted text — a reminder, not an error. */
export function Note({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-border border-dashed px-2.5 py-2 text-muted-foreground text-xs">
      {children}
    </div>
  )
}

/**
 * The label of an input, shared by both branches (create · import). Smaller and dimmer than the radio card
 * title (14px/500) on purpose: the three cards are the screen's main question, an input label only annotates one input.
 * Same size flattens the hierarchy — measured 15/09 on the dark build, the "Address" label read like a
 * fourth choice. A STEP title (import_step2_title, progress_title) does not use this class.
 */
export const FIELD_LABEL = 'font-medium text-muted-foreground text-xs'

/**
 * The selected platform chip: the same terracotta border as the selected radio card, plus a 10% fill (option
 * B of three, chosen 15/09). The `dark:` pair is required, not decoration: Button's outline variant
 * carries `dark:border-input` / `dark:bg-input/30`, and tailwind-merge only replaces classes with the SAME variant
 * prefix — so a bare `border-primary` wins in light and loses in dark. The old class
 * `border-foreground/30 bg-accent` lost exactly that way: measured 15/09, the selected chip's border in dark computed to
 * `--input`.
 */
export const CHIP_SELECTED = 'border-primary bg-primary/10 dark:border-primary dark:bg-primary/10'
