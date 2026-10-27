import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { NotionAvatar } from './avatar'
import { NotionDark } from './dark'
import { NotionLight } from './light'

const Notion = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <NotionLight {...props} className={className} />
  if (variant === 'dark') return <NotionDark {...props} className={className} />
  return (
    <>
      <NotionLight className={cn('dark:hidden', className)} {...props} />
      <NotionDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const NotionIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Notion, {
  Avatar: NotionAvatar,
  colorPrimary: '#000000'
})

export default NotionIcon
