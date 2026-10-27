/**
 * Marker is the small gutter glyph beside a line — a status dot, a step bullet, a diff mark. Its
 * three variants differ in what draws the line through them: `separator` grows a line before and
 * after, `border` grows a box. That is what turns a column of markers into a timeline.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CheckIcon, ClockIcon, XIcon } from 'lucide-react'

import { Marker, MarkerContent, MarkerIcon } from './marker'

const meta: Meta<typeof Marker> = {
  title: 'UI/Marker',
  component: Marker,
  argTypes: { variant: { control: 'inline-radio', options: ['default', 'separator', 'border'] } }
}
export default meta
type Story = StoryObj<typeof Marker>

export const Default: Story = {
  render: (args) => (
    <Marker {...args}>
      <MarkerIcon>
        <CheckIcon />
      </MarkerIcon>
      <MarkerContent>Applied 12 changes</MarkerContent>
    </Marker>
  )
}

export const Variants: Story = {
  render: () => (
    <div className="flex w-[26rem] flex-col gap-4">
      {(['default', 'separator', 'border'] as const).map((variant) => (
        <Marker key={variant} variant={variant}>
          <MarkerIcon>
            <CheckIcon />
          </MarkerIcon>
          <MarkerContent>{variant}</MarkerContent>
        </Marker>
      ))}
    </div>
  )
}

/** A history strip: three markers reading as one timeline. */
export const Timeline: Story = {
  render: () => (
    <div className="flex w-[26rem] flex-col gap-4">
      <Marker variant="separator">
        <MarkerIcon>
          <CheckIcon />
        </MarkerIcon>
        <MarkerContent>Site connected</MarkerContent>
      </Marker>
      <Marker variant="separator">
        <MarkerIcon>
          <ClockIcon />
        </MarkerIcon>
        <MarkerContent>12 proposals waiting for review</MarkerContent>
      </Marker>
      <Marker variant="separator">
        <MarkerIcon>
          <XIcon />
        </MarkerIcon>
        <MarkerContent>One write failed — the webroot was read-only</MarkerContent>
      </Marker>
    </div>
  )
}
