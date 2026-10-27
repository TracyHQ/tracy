import { Avatar, AvatarFallback } from '../../../ui/avatar'
import { cn } from '../../../../lib/utils'

import { type IconAvatarProps } from '../../types'
import { Gpt5ChatLatestLight } from './light'

export function Gpt5ChatLatestAvatar({
  size = 32,
  shape = 'circle',
  className
}: Omit<IconAvatarProps, 'icon'>) {
  return (
    <Avatar
      className={cn('overflow-hidden', shape === 'circle' ? 'rounded-full' : 'rounded-[20%]', className)}
      style={{ width: size, height: size }}
    >
      <AvatarFallback className="text-foreground bg-background">
        <Gpt5ChatLatestLight style={{ width: size, height: size }} />
      </AvatarFallback>
    </Avatar>
  )
}
