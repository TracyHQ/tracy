import { Avatar, AvatarFallback } from '../../../ui/avatar'
import { cn } from '../../../../lib/utils'

import { type IconAvatarProps } from '../../types'
import { N8nLight } from './light'

export function N8nAvatar({ size = 32, shape = 'circle', className }: Omit<IconAvatarProps, 'icon'>) {
  return (
    <Avatar
      className={cn('overflow-hidden', shape === 'circle' ? 'rounded-full' : 'rounded-[20%]', className)}
      style={{ width: size, height: size }}
    >
      <AvatarFallback className="text-foreground bg-background">
        <N8nLight style={{ width: size, height: size }} />
      </AvatarFallback>
    </Avatar>
  )
}
