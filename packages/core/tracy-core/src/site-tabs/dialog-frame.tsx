/**
 * The frame a restore dialog draws its content in. On its own a dialog is its own `Dialog`; inside
 * Restore… (`RestoreBackupDialog`) the scope choice holds ONE dialog open around whichever content
 * the chosen scope needs, so switching Everything ⇄ Files only swaps the content, not the window.
 */
import type { JSX, ReactNode } from 'react'
import { Dialog } from '@tracy/ui'

export type DialogFrame = (props: {
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) => JSX.Element

/** A dialog of its own. */
export const OwnDialog: DialogFrame = ({ onOpenChange, children }) => (
  <Dialog open onOpenChange={onOpenChange}>
    {children}
  </Dialog>
)
