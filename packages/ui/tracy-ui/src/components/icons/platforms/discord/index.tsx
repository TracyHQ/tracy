import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { DiscordAvatar } from './avatar'
import { DiscordDark } from './dark'
import { DiscordLight } from './light'

const Discord = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <DiscordLight {...props} className={className} />
  if (variant === 'dark') return <DiscordDark {...props} className={className} />
  return (
    <>
      <DiscordLight className={cn('dark:hidden', className)} {...props} />
      <DiscordDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const DiscordIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Discord, {
  Avatar: DiscordAvatar,
  colorPrimary: '#5865F2'
})

export default DiscordIcon
