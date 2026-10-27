import { Avatar, AvatarFallback } from '../../../ui/avatar'
import { cn } from '../../../../lib/utils'

import { type IconAvatarProps } from '../../types'
import { NeteaseYoudaoLight } from './light'

export function NeteaseYoudaoAvatar({
  size = 32,
  shape = 'circle',
  className
}: Omit<IconAvatarProps, 'icon'>) {
  return (
    <Avatar
      className={cn('overflow-hidden', shape === 'circle' ? 'rounded-full' : 'rounded-[20%]', className)}
      style={{ width: size, height: size }}
    >
      <AvatarFallback className="text-foreground">
        <NeteaseYoudaoLight style={{ width: size, height: size }} />
      </AvatarFallback>
    </Avatar>
  )
}
