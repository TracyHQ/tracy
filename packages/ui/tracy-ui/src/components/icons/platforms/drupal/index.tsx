import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { DrupalAvatar } from './avatar'
import { DrupalDark } from './dark'
import { DrupalLight } from './light'

const Drupal = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <DrupalLight {...props} className={className} />
  if (variant === 'dark') return <DrupalDark {...props} className={className} />
  return (
    <>
      <DrupalLight className={cn('dark:hidden', className)} {...props} />
      <DrupalDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const DrupalIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Drupal, {
  Avatar: DrupalAvatar,
  colorPrimary: '#0678BE'
})

export default DrupalIcon
