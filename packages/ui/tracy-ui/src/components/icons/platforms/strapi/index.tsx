import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { StrapiAvatar } from './avatar'
import { StrapiDark } from './dark'
import { StrapiLight } from './light'

const Strapi = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <StrapiLight {...props} className={className} />
  if (variant === 'dark') return <StrapiDark {...props} className={className} />
  return (
    <>
      <StrapiLight className={cn('dark:hidden', className)} {...props} />
      <StrapiDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const StrapiIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Strapi, {
  Avatar: StrapiAvatar,
  colorPrimary: '#4945FF'
})

export default StrapiIcon
