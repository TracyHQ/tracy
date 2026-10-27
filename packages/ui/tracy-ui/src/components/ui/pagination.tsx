import * as React from 'react'
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react'

import { cn } from '../../lib/utils'
import { Button } from './button'

/**
 * Every word this file shows or announces comes from the caller, already translated (#797): the
 * name of the landmark, the two step links (the visible word and the longer accessible name) and
 * the name of the gap. None has a default, so a pager cannot ship English by omission.
 */
function Pagination({ className, label, ...props }: React.ComponentProps<'nav'> & { label: string }) {
  return (
    <nav
      role="navigation"
      aria-label={label}
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul data-slot="pagination-content" className={cn('flex items-center gap-0.5', className)} {...props} />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
  React.ComponentProps<'a'>

function PaginationLink({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) {
  return (
    <Button
      variant={isActive ? 'outline' : 'ghost'}
      size={size}
      className={cn(className)}
      nativeButton={false}
      render={
        <a
          aria-current={isActive ? 'page' : undefined}
          data-slot="pagination-link"
          data-active={isActive}
          {...props}
        />
      }
    />
  )
}

/** `text`: the visible word (may be empty for an icon-only link); `label`: the accessible name. */
type PaginationStepProps = React.ComponentProps<typeof PaginationLink> & { text: string; label: string }

function PaginationPrevious({ className, text, label, ...props }: PaginationStepProps) {
  return (
    <PaginationLink aria-label={label} size="default" className={cn('pl-1.5!', className)} {...props}>
      <ChevronLeftIcon data-icon="inline-start" className="cn-rtl-flip" />
      <span className="hidden sm:block">{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({ className, text, label, ...props }: PaginationStepProps) {
  return (
    <PaginationLink aria-label={label} size="default" className={cn('pr-1.5!', className)} {...props}>
      <span className="hidden sm:block">{text}</span>
      <ChevronRightIcon data-icon="inline-end" className="cn-rtl-flip" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  label,
  ...props
}: React.ComponentProps<'span'> & { label: string }) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
}
