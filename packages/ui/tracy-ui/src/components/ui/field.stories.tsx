/**
 * `field` is what base-nova put in place of `form`: the registry's `form` entry is an empty stub,
 * because `@base-ui/react` ships the form and field primitives and the react-hook-form wrapper
 * went away. Anyone reaching for `<FormField control={...} />` from the radix generation will
 * find nothing here — this is the replacement.
 *
 * `orientation="responsive"` is the one that needs looking at in two viewports: it is horizontal
 * on a wide container and vertical under it, driven by a container query, not a media query.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Checkbox } from './checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle
} from './field'
import { Input } from './input'
import { Switch } from './switch'
import { Textarea } from './textarea'

const meta: Meta<typeof Field> = {
  title: 'UI/Field',
  component: Field,
  argTypes: {
    orientation: { control: 'inline-radio', options: ['vertical', 'horizontal', 'responsive'] }
  }
}
export default meta
type Story = StoryObj<typeof Field>

export const Default: Story = {
  render: (args) => (
    <div className="w-[28rem]">
      <Field {...args}>
        <FieldLabel htmlFor="site-name">Site name</FieldLabel>
        <Input id="site-name" defaultValue="example.com" />
        <FieldDescription>Shown in your list of sites. The domain does not change.</FieldDescription>
      </Field>
    </div>
  )
}

/** Horizontal: label on one side, control on the other — the settings-row shape. */
export const Horizontal: Story = {
  args: { orientation: 'horizontal' },
  render: (args) => (
    <div className="w-[32rem]">
      <Field {...args}>
        <FieldContent>
          <FieldTitle>Let Tracy write without asking</FieldTitle>
          <FieldDescription>
            Off by default. With it off, every change waits for you in the proposal list.
          </FieldDescription>
        </FieldContent>
        <Switch />
      </Field>
    </div>
  )
}

/** An invalid field with its message. `FieldError` takes either children or an `errors` array. */
export const WithError: Story = {
  render: (args) => (
    <div className="w-[28rem]">
      <Field data-invalid {...args}>
        <FieldLabel htmlFor="bad-email">Email</FieldLabel>
        <Input id="bad-email" aria-invalid defaultValue="name@" />
        <FieldError errors={[{ message: 'That address is missing a domain.' }]} />
      </Field>
    </div>
  )
}

/** A whole form: fieldset, legend, groups and a separator. */
export const FullForm: Story = {
  render: () => (
    <FieldSet className="w-[32rem]">
      <FieldLegend>Connect an existing site</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="f-host">SSH host</FieldLabel>
          <Input id="f-host" placeholder="fleet-01.internal" />
        </Field>
        <Field>
          <FieldLabel htmlFor="f-root">Webroot</FieldLabel>
          <Input id="f-root" placeholder="/srv/tracy/example/public" />
          <FieldDescription>Read-only until you grant write access.</FieldDescription>
        </Field>
        <FieldSeparator />
        <Field orientation="horizontal">
          <Checkbox id="f-backup" defaultChecked />
          <FieldContent>
            <FieldTitle>Take a backup before the first write</FieldTitle>
            <FieldDescription>Stored on the fleet host, kept for 30 days.</FieldDescription>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-note">Note for your team</FieldLabel>
          <Textarea id="f-note" placeholder="What is this site for?" />
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}
