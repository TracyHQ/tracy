/**
 * This is the control on Tracy's sign-in page: as of 01/09/2026 the magic link is gone and a
 * one-time code is the only way in, so this component sits on the single door every seat walks
 * through.
 *
 * It wraps `input-otp`, which renders ONE real input and paints the slots — that is why paste
 * works across all six boxes at once, and why `maxLength` is what sets the count, not the number
 * of slot children.
 *
 * 🔒 THE META IS TYPED ON A HAND-WRITTEN `Shared`. `OTPInputProps` is a union — either `render`
 * or `children`, never both — and typing the meta on `typeof InputOTP` collapses it, after which
 * every story that passes children fails to compile. Naming the one prop the toolbar controls
 * sidesteps that.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import * as React from 'react'

import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from './input-otp'
import { Label } from './label'

type Shared = { disabled?: boolean }

const meta: Meta<Shared> = {
  title: 'UI/InputOTP',
  component: InputOTP as React.ComponentType<Shared>,
  parameters: { layout: 'centered' },
  argTypes: { disabled: { control: 'boolean' } },
  args: { disabled: false }
}
export default meta
type Story = StoryObj<Shared>

const SLOTS = [0, 1, 2, 3, 4, 5]

export const Default: Story = {
  render: (args) => (
    <InputOTP maxLength={6} disabled={args.disabled}>
      <InputOTPGroup>
        {SLOTS.map((i) => (
          <InputOTPSlot key={i} index={i} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}

/** Split into two groups with a separator — easier to read back off a phone. */
export const Grouped: Story = {
  render: (args) => (
    <InputOTP maxLength={6} disabled={args.disabled}>
      <InputOTPGroup>
        {SLOTS.slice(0, 3).map((i) => (
          <InputOTPSlot key={i} index={i} />
        ))}
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        {SLOTS.slice(3).map((i) => (
          <InputOTPSlot key={i} index={i} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}

/** Filled, with a label — what the sign-in page shows after someone types. */
export const Filled: Story = {
  render: function FilledStory(args) {
    const [value, setValue] = React.useState('482913')
    return (
      <div className="flex flex-col items-center gap-3">
        <Label htmlFor="otp">Code from your email</Label>
        <InputOTP id="otp" maxLength={6} value={value} onChange={setValue} disabled={args.disabled}>
          <InputOTPGroup>
            {SLOTS.map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <p className="text-muted-foreground text-xs">Codes expire after 10 minutes.</p>
      </div>
    )
  }
}

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <InputOTP maxLength={6} disabled={args.disabled}>
      <InputOTPGroup>
        {SLOTS.map((i) => (
          <InputOTPSlot key={i} index={i} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}
