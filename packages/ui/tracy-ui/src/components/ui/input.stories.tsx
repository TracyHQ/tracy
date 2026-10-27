/**
 * Input is a base-ui `Input`, so `aria-invalid` — not a `variant` — is what turns it red. Every
 * error style in this library hangs off that attribute, which is why the invalid story sets the
 * attribute rather than a prop.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Input } from './input'
import { Label } from './label'

const meta = {
  title: 'UI/Input',
  component: Input,
  argTypes: {
    type: { control: 'select', options: ['text', 'email', 'password', 'number', 'search', 'file'] },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' }
  },
  args: { placeholder: 'name@example.com', type: 'email' }
} satisfies Meta<typeof Input>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { render: (args) => <Input className="w-[20rem]" {...args} /> }

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex w-[20rem] flex-col gap-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" {...args} />
    </div>
  )
}

export const States: Story = {
  render: () => (
    <div className="flex w-[20rem] flex-col gap-3">
      <Input placeholder="Empty" />
      <Input defaultValue="example.com" />
      <Input placeholder="Disabled" disabled />
      <Input defaultValue="Disabled with a value" disabled />
      <Input aria-invalid defaultValue="name@" />
      <Input readOnly defaultValue="Read-only" />
    </div>
  )
}

/** Every input type this product uses, in one column. */
export const Types: Story = {
  render: () => (
    <div className="flex w-[20rem] flex-col gap-3">
      <Input type="text" placeholder="text" />
      <Input type="email" placeholder="email" />
      <Input type="password" placeholder="password" defaultValue="hunter2" />
      <Input type="number" placeholder="number" />
      <Input type="search" placeholder="search" />
      <Input type="file" />
    </div>
  )
}
