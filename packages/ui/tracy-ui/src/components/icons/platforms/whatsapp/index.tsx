import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { WhatsappAvatar } from './avatar'
import { WhatsappDark } from './dark'
import { WhatsappLight } from './light'

const Whatsapp = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <WhatsappLight {...props} className={className} />
  if (variant === 'dark') return <WhatsappDark {...props} className={className} />
  return (
    <>
      <WhatsappLight className={cn('dark:hidden', className)} {...props} />
      <WhatsappDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const WhatsappIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Whatsapp, {
  Avatar: WhatsappAvatar,
  colorPrimary: '#25D366'
})

export default WhatsappIcon
