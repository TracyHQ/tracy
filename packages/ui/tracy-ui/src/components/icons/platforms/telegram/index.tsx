import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { TelegramAvatar } from './avatar'
import { TelegramDark } from './dark'
import { TelegramLight } from './light'

const Telegram = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <TelegramLight {...props} className={className} />
  if (variant === 'dark') return <TelegramDark {...props} className={className} />
  return (
    <>
      <TelegramLight className={cn('dark:hidden', className)} {...props} />
      <TelegramDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const TelegramIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Telegram, {
  Avatar: TelegramAvatar,
  colorPrimary: '#26A5E4'
})

export default TelegramIcon
