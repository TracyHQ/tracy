import { Avatar, AvatarFallback } from '../../../ui/avatar'
import { cn } from '../../../../lib/utils'

import { type IconAvatarProps } from '../../types'
import { Gpt4oAudioPreviewLight } from './light'

export function Gpt4oAudioPreviewAvatar({
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
        <Gpt4oAudioPreviewLight style={{ width: size, height: size }} />
      </AvatarFallback>
    </Avatar>
  )
}
