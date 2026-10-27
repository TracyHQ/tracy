import type { CompoundIcon, CompoundIconProps } from '../../types'
import { EmdashAvatar } from './avatar'
import { EmdashLight } from './light'

const Emdash = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <EmdashLight {...props} className={className} />
  return <EmdashLight {...props} className={className} />
}

export const EmdashIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Emdash, {
  Avatar: EmdashAvatar,
  colorPrimary: '#F6821F'
})

export default EmdashIcon
