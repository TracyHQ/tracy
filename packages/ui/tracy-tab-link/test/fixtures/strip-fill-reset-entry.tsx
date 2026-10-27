/**
 * Fixture for `../e2e/strip-fill-reset.test.mjs`: dsh's real frame with a real tab strip in its
 * right panel, and this plugin's strip-fill reset installed on the document.
 *
 * - the frame is `ui-layout`'s own `AppFrame` over its own store (the fork this repo pins), so the
 *   divider, the width rule and the double-click reset under test are the ones customers run;
 * - the right panel holds `ui-dockkit`'s own `DockSurface` (one tab, the `+` control, the split
 *   control, and one chrome button), so the strip gap is dockkit's `[data-dockkit-strip-fill]`;
 * - the panel box stands in for `ui-sidebar-right`'s: anchored to the right edge at the width the
 *   frame hands it, marked with the attribute that shell carries (`data-sidebar-right-panel`).
 *   The test checks that the shipped shell still writes that attribute.
 */
import { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { AppFrame } from '../../../../../vendor/tracy/deepseek-harness/packages/client/ui-layout/src/client/AppFrame'
import { createLayoutStore } from '../../../../../vendor/tracy/deepseek-harness/packages/client/ui-layout/src/client/stores'
import {
  createIdMinter,
  createInitialState,
  DockSurface
} from '../../../../../vendor/tracy/deepseek-harness/packages/client/ui-dockkit/src/index'
import { installStripFillReset } from '../../src/client/strip-fill-reset'

declare global {
  interface Window {
    __harness: {
      ready: boolean
      /** Open the right panel the way its occupant does, at a tab's preferred width. */
      open: (preferred: number) => void
      /** The frame's Conversation width preference: null is the default (the tab's width wins). */
      chat: () => number | null
    }
  }
}

const store = createLayoutStore().create() as any

/** A selector hook over the store, the shape the frame's `useStore` share has. */
function bind<T>(read: () => T) {
  return <R,>(select: (value: T) => R): R => useSyncExternalStore(store.subscribe, () => select(read()))
}

const minter = createIdMinter()
const layout = createInitialState(minter, (id: any) => ({
  id,
  kind: 'site',
  contentId: 'site',
  title: 'Site'
}))

const LABELS = {
  emptyPane: 'Empty pane',
  splitPane: 'Split right',
  splitPaneDisabled: 'Pane budget spent',
  splitPaneNarrow: 'Too narrow to split',
  closeTab: 'Close',
  addTab: 'New tab',
  dockFloat: 'Dock',
  closeFloat: 'Close panel',
  dropZone: { center: 'Move here', left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom' }
}

/** Every intent is a no-op: the test drives widths, not the dock tree. */
const intents = new Proxy({}, { get: () => () => {} }) as any

function Rightbar({ width }: { width: number }) {
  return (
    <div
      data-sidebar-right-panel="push"
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width, background: '#fff' }}
    >
      <DockSurface
        state={layout}
        canSplit
        intents={intents}
        labels={LABELS as any}
        renderTab={(tab: any) => <p>{tab.title} body</p>}
        chrome={
          <button type="button" data-testid="chrome-fullscreen" aria-label="Fullscreen">
            F
          </button>
        }
      />
    </div>
  )
}

const renderSlot = (key: string, owner: any) =>
  key === 'rightbar' && owner.canShow ? <Rightbar width={owner.width} /> : null

const noSessions = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }
const noWorkspaces = {
  items: [],
  archivedSessionIds: [],
  pinnedSessionIds: [],
  state: 'idle',
  phase: 'ready',
  error: null
}

function Frame() {
  return (
    <AppFrame
      {...({
        useStore: bind(() => store.getSnapshot()),
        usePanelInfo: bind(() => store.getSnapshot().panelInfo),
        actions: store.actions,
        renderSlot,
        useSessions: (select: any) => select(noSessions),
        useSessionStatus: (select: any) => select(new Map()),
        useSessionRetainInfo: () => undefined,
        useResource: () => ({ status: 'none', value: undefined, failure: undefined }),
        useWorkspaces: (select: any) => select(noWorkspaces),
        t: (key: string) => key
      } as any)}
    />
  )
}

installStripFillReset(document)
createRoot(document.getElementById('root') as HTMLElement).render(<Frame />)

window.__harness = {
  ready: true,
  open: (preferred) => store.actions.openRightbar(true, false, preferred),
  chat: () => store.getSnapshot().layoutInfo.chat
}
