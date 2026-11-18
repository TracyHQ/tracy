/**
 * The round back button shared by the Details header and the Details sub-page headers (#537): a 36px round
 * button with an arrow, whose label says where it goes. Styled by `tracy-wo-subhead-back` in `sub-page-header-css.ts`.
 */
import type { JSX } from 'react'
import { ArrowLeft } from 'lucide-react'

export function BackButton({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="tracy-wo-subhead-back"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <ArrowLeft aria-hidden="true" />
    </button>
  )
}
