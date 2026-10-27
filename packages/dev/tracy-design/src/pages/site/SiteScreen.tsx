import { Button } from '@tracy/ui'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { sites, workspaces } from '../../fixtures'
import { useShell } from '../../app/app-context'
import { ChatPane } from './ChatPane'
import { PreviewPane } from './PreviewPane'
import { ToolPane } from './ToolPane'

/**
 * `variant` only touches ChatPane: the other two panes do not change between an empty and a used session.
 * That is why it is a prop of the screen and not a second screen.
 */
export function Workspace({ variant }: { variant?: 'hero' | 'composer' } = {}) {
  const { siteKey } = useParams()
  const { workspaceId, setWorkspaceId } = useShell()
  const site = sites.find((s) => s.key === siteKey) ?? sites[0]
  const [toolPaneOpen, setToolPaneOpen] = useState(true)
  const siteWorkspace = workspaces.find((w) => w.id === site.workspaceId)
  const foreign = site.workspaceId !== workspaceId

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* SiteID belongs to a workspace — opening a site of another workspace offers a switch, as in tracy-desk. */}
      {foreign && siteWorkspace ? (
        <div className="flex flex-none items-center gap-2.5 border-border border-b bg-amber-500/10 px-3 py-2 text-sm">
          <TriangleAlert className="size-4 flex-none text-amber-500" />
          <span className="min-w-0 flex-1 truncate">This site is in another workspace.</span>
          <Button size="xs" variant="outline" onClick={() => setWorkspaceId(siteWorkspace.id)}>
            Switch to {siteWorkspace.name}
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1">
        <ChatPane site={site} variant={variant} className="w-[360px] flex-none max-lg:w-[300px]" />
        {toolPaneOpen ? <ToolPane className="w-[330px] flex-none max-xl:hidden" /> : null}
        <PreviewPane
          site={site}
          toolPaneOpen={toolPaneOpen}
          onToggleToolPane={() => setToolPaneOpen((v) => !v)}
          className="flex-1"
        />
      </div>
    </div>
  )
}
