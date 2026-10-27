import { Avatar, AvatarFallback } from '../../../ui/avatar'
import { cn } from '../../../../lib/utils'

import { type IconAvatarProps } from '../../types'
import { MinTop3Light } from './light'

export function MinTop3Avatar({ size = 32, shape = 'circle', className }: Omit<IconAvatarProps, 'icon'>) {
  return (
    <Avatar
      className={cn('overflow-hidden', shape === 'circle' ? 'rounded-full' : 'rounded-[20%]', className)}
      style={{ width: size, height: size }}
    >
      <AvatarFallback className="text-foreground">
        <MinTop3Light style={{ width: size, height: size }} />
      </AvatarFallback>
    </Avatar>
  )
}
