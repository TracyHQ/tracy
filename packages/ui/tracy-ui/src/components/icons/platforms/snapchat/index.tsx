import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { SnapchatAvatar } from './avatar'
import { SnapchatDark } from './dark'
import { SnapchatLight } from './light'

const Snapchat = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <SnapchatLight {...props} className={className} />
  if (variant === 'dark') return <SnapchatDark {...props} className={className} />
  return (
    <>
      <SnapchatLight className={cn('dark:hidden', className)} {...props} />
      <SnapchatDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const SnapchatIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Snapchat, {
  Avatar: SnapchatAvatar,
  colorPrimary: '#FFFC00'
})

export default SnapchatIcon
