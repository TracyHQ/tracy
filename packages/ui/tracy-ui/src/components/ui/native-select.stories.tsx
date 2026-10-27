/**
 * The browser's own `<select>`, styled to match. It exists for the two places the fancy one is
 * wrong: inside a native form that posts without JavaScript, and on a small screen where the
 * platform picker beats any popup we can draw.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Label } from './label'
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from './native-select'

const meta: Meta<typeof NativeSelect> = {
  title: 'UI/NativeSelect',
  component: NativeSelect,
  argTypes: {
    size: { control: 'inline-radio', options: ['default', 'sm'] },
    disabled: { control: 'boolean' }
  }
}
export default meta
type Story = StoryObj<typeof NativeSelect>

export const Default: Story = {
  render: (args) => (
    <NativeSelect className="w-[16rem]" {...args}>
      <NativeSelectOption value="owner">Owner</NativeSelectOption>
      <NativeSelectOption value="editor">Editor</NativeSelectOption>
      <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
    </NativeSelect>
  )
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <NativeSelect className="w-[16rem]" size="default">
        <NativeSelectOption>Default</NativeSelectOption>
      </NativeSelect>
      <NativeSelect className="w-[16rem]" size="sm">
        <NativeSelectOption>Small</NativeSelectOption>
      </NativeSelect>
    </div>
  )
}

export const Grouped: Story = {
  render: (args) => (
    <div className="flex w-[18rem] flex-col gap-2">
      <Label htmlFor="ns-cms">Content system</Label>
      <NativeSelect id="ns-cms" {...args}>
        <NativeSelectOptGroup label="Content systems">
          <NativeSelectOption value="wp">WordPress</NativeSelectOption>
          <NativeSelectOption value="joomla">Joomla</NativeSelectOption>
        </NativeSelectOptGroup>
        <NativeSelectOptGroup label="Static">
          <NativeSelectOption value="astro">Astro</NativeSelectOption>
        </NativeSelectOptGroup>
      </NativeSelect>
    </div>
  )
}

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <NativeSelect className="w-[16rem]" {...args}>
      <NativeSelectOption>Locked while provisioning</NativeSelectOption>
    </NativeSelect>
  )
}
