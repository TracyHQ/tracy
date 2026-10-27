/**
 * A skeleton is only honest if it has the shape of what is coming. The composed stories here are
 * the two loading states this product actually shows, not a row of grey bars.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Skeleton } from './skeleton'

const meta: Meta<typeof Skeleton> = {
  title: 'UI/Skeleton',
  component: Skeleton
}
export default meta
type Story = StoryObj<typeof Skeleton>

export const Default: Story = { render: (args) => <Skeleton className="h-4 w-[16rem]" {...args} /> }

/** A site card while the list loads. */
export const SiteCard: Story = {
  render: () => (
    <div className="flex w-[24rem] flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  )
}

/** A table while the proposals load. */
export const TableRows: Story = {
  render: () => (
    <div className="w-[30rem] divide-y rounded-lg border">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}
