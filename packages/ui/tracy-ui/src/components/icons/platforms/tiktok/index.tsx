import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { TiktokAvatar } from './avatar'
import { TiktokDark } from './dark'
import { TiktokLight } from './light'

const Tiktok = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <TiktokLight {...props} className={className} />
  if (variant === 'dark') return <TiktokDark {...props} className={className} />
  return (
    <>
      <TiktokLight className={cn('dark:hidden', className)} {...props} />
      <TiktokDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const TiktokIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Tiktok, {
  Avatar: TiktokAvatar,
  colorPrimary: '#000000'
})

export default TiktokIcon
