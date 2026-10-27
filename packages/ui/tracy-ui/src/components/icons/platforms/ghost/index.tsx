import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { GhostAvatar } from './avatar'
import { GhostDark } from './dark'
import { GhostLight } from './light'

const Ghost = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <GhostLight {...props} className={className} />
  if (variant === 'dark') return <GhostDark {...props} className={className} />
  return (
    <>
      <GhostLight className={cn('dark:hidden', className)} {...props} />
      <GhostDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const GhostIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Ghost, {
  Avatar: GhostAvatar,
  colorPrimary: '#15171A'
})

export default GhostIcon
