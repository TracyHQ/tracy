import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { WebflowAvatar } from './avatar'
import { WebflowDark } from './dark'
import { WebflowLight } from './light'

const Webflow = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <WebflowLight {...props} className={className} />
  if (variant === 'dark') return <WebflowDark {...props} className={className} />
  return (
    <>
      <WebflowLight className={cn('dark:hidden', className)} {...props} />
      <WebflowDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const WebflowIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Webflow, {
  Avatar: WebflowAvatar,
  colorPrimary: '#146EF5'
})

export default WebflowIcon
