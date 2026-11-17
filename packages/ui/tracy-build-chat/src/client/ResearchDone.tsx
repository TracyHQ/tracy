/**
 * The done line of a finished research (#575, the build chat mock): "Read 3 sources" and the business on one line,
 * opened by click, Enter or Space to show what each link gave (`LinkReadLines`). The progress block of research
 * settles into this one line, in the conversation and after a reload alike.
 */
import { DisclosureRow, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LinkRead } from '@tracy/core/build-chat'
import { useState } from 'react'
import { LinkReadLines } from './LinkReadLines'
import type { Translate } from './strings'

export function ResearchDone({
  title,
  business,
  links,
  t
}: {
  title: string
  business: string
  links: readonly LinkRead[]
  t: Translate
}) {
  const [open, setOpen] = useState(false)
  return (
    <DisclosureRow
      icon={<IconSearchOutlineRegular size={14} />}
      title={title}
      open={open}
      expandable
      expandOnRowClick
      keepContentWhenOpen
      onToggle={() => setOpen((v) => !v)}
      collapsedContent={business !== '' ? <span className="tv-bc-toolrow-sum">{business}</span> : undefined}
    >
      <LinkReadLines links={links} t={t} />
    </DisclosureRow>
  )
}
