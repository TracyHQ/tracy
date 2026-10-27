import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { HubspotAvatar } from './avatar'
import { HubspotDark } from './dark'
import { HubspotLight } from './light'

const Hubspot = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <HubspotLight {...props} className={className} />
  if (variant === 'dark') return <HubspotDark {...props} className={className} />
  return (
    <>
      <HubspotLight className={cn('dark:hidden', className)} {...props} />
      <HubspotDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const HubspotIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Hubspot, {
  Avatar: HubspotAvatar,
  colorPrimary: '#FF7A59'
})

export default HubspotIcon
