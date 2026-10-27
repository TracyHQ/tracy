import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { BigcommerceAvatar } from './avatar'
import { BigcommerceDark } from './dark'
import { BigcommerceLight } from './light'

const Bigcommerce = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <BigcommerceLight {...props} className={className} />
  if (variant === 'dark') return <BigcommerceDark {...props} className={className} />
  return (
    <>
      <BigcommerceLight className={cn('dark:hidden', className)} {...props} />
      <BigcommerceDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const BigcommerceIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Bigcommerce, {
  Avatar: BigcommerceAvatar,
  colorPrimary: '#121118'
})

export default BigcommerceIcon
