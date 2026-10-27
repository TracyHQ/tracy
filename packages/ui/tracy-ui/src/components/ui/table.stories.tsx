/**
 * Plain semantic table elements — no data layer, no sorting, no virtualisation. Anything that
 * needs those belongs above this component, not inside it.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Badge } from './badge'
import { Checkbox } from './checkbox'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from './table'

const meta: Meta<typeof Table> = {
  title: 'UI/Table',
  component: Table
}
export default meta
type Story = StoryObj<typeof Table>

const SITES = [
  { name: 'example.com', cms: 'WordPress', role: 'Owner', seats: 4 },
  { name: 'tracy.ai', cms: 'Astro', role: 'Editor', seats: 2 },
  { name: 'example.org', cms: 'Joomla', role: 'Viewer', seats: 1 },
  { name: 'cowork.tracy.ai', cms: 'WordPress', role: 'Owner', seats: 6 }
]

export const Default: Story = {
  render: (args) => (
    <Table className="w-[36rem]" {...args}>
      <TableHeader>
        <TableRow>
          <TableHead>Site</TableHead>
          <TableHead>Content system</TableHead>
          <TableHead>Your role</TableHead>
          <TableHead className="text-right">Seats</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {SITES.map((s) => (
          <TableRow key={s.name}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell>{s.cms}</TableCell>
            <TableCell>
              <Badge variant="secondary">{s.role}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">{s.seats}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** With a caption and a footer total — the shape a report wants. */
export const WithFooter: Story = {
  render: (args) => (
    <Table className="w-[36rem]" {...args}>
      <TableCaption>Sites you hold a seat on, as of today.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Site</TableHead>
          <TableHead className="text-right">Seats</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {SITES.map((s) => (
          <TableRow key={s.name}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell className="text-right tabular-nums">{s.seats}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right tabular-nums">{SITES.reduce((n, s) => n + s.seats, 0)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

/** Selectable rows: `data-state="selected"` is what tints a row, not a class. */
export const Selectable: Story = {
  render: (args) => (
    <Table className="w-[36rem]" {...args}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox indeterminate aria-label="Select all" />
          </TableHead>
          <TableHead>Site</TableHead>
          <TableHead>Content system</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {SITES.map((s, i) => (
          <TableRow key={s.name} data-state={i < 2 ? 'selected' : undefined}>
            <TableCell>
              <Checkbox defaultChecked={i < 2} aria-label={`Select ${s.name}`} />
            </TableCell>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell>{s.cms}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** Empty: a table with a header and nothing under it still needs to say so. */
export const Empty: Story = {
  render: (args) => (
    <Table className="w-[36rem]" {...args}>
      <TableHeader>
        <TableRow>
          <TableHead>Site</TableHead>
          <TableHead>Content system</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
            No sites yet.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}
