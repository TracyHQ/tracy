'use client'

import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'

import { cn } from '../../lib/utils'

function Separator({ className, orientation = 'horizontal', ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        // The primitive emits `data-orientation`, not `data-horizontal`. Matching on the wrong
        // attribute cost nothing a build could see: the element renders, carries a background
        // colour, and is zero pixels thick on every surface that uses it.
        'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch',
        className
      )}
      {...props}
    />
  )
}

export { Separator }
