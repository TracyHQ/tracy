/**
 * Combobox is base-ui's, so unlike the classic shadcn combobox it is not a Popover glued to a
 * Command list — it is one primitive that owns the filtering, the anchor and the chips. That is
 * why the multi-select story needs no state juggling of its own.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue
} from './combobox'
import { Label } from './label'

const meta: Meta<typeof Combobox> = {
  title: 'UI/Combobox',
  component: Combobox,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof Combobox>

const SITES = ['example.com', 'tracy.ai', 'cowork.tracy.ai', 'example.org', 'shop.example.com']

export const Default: Story = {
  render: (args) => (
    <div className="flex w-[20rem] flex-col gap-2">
      <Label>Site</Label>
      <Combobox items={SITES} {...args}>
        <ComboboxInput placeholder="Search sites…" />
        <ComboboxContent>
          <ComboboxEmpty>No site matched.</ComboboxEmpty>
          <ComboboxList>
            {(site: string) => (
              <ComboboxItem key={site} value={site}>
                {site}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}

/** Grouped options with labels. */
export const Grouped: Story = {
  render: (args) => (
    <div className="w-[20rem]">
      <Combobox {...args}>
        <ComboboxInput placeholder="Search…" />
        <ComboboxContent>
          <ComboboxEmpty>Nothing matched.</ComboboxEmpty>
          <ComboboxList>
            <ComboboxGroup>
              <ComboboxLabel>Content systems</ComboboxLabel>
              <ComboboxItem value="wordpress">WordPress</ComboboxItem>
              <ComboboxItem value="joomla">Joomla</ComboboxItem>
            </ComboboxGroup>
            <ComboboxGroup>
              <ComboboxLabel>Static</ComboboxLabel>
              <ComboboxItem value="astro">Astro</ComboboxItem>
              <ComboboxItem value="eleventy">Eleventy</ComboboxItem>
            </ComboboxGroup>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}

/** Multiple, with chips — the shape an "invite these people" field wants. */
export const Multiple: Story = {
  render: (args) => (
    <div className="w-[24rem]">
      <Combobox items={SITES} multiple defaultValue={[SITES[0], SITES[1]]} {...args}>
        <ComboboxChips>
          <ComboboxValue>
            {(value: string[]) =>
              value.map((v) => (
                <ComboboxChip key={v} aria-label={v}>
                  {v}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput placeholder="Add a site…" />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxEmpty>No site matched.</ComboboxEmpty>
          <ComboboxList>
            {(site: string) => (
              <ComboboxItem key={site} value={site}>
                {site}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
