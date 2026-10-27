// The blocked screen's preload (src/blocked.html, tasks/todo-desktop-update-policy.md C7). Sandboxed:
// it may require only `electron`, so the channel names are spelled out here; test/blocked-bridge
// .test.mjs holds them to src/update-channels.js `BLOCKED_CHANNELS`. It exposes `tracyBlocked` with
// the view, the three buttons and the pushed updates — nothing of the product bridge.
const { contextBridge, ipcRenderer } = require('electron')

const GET = 'tracy-desktop:blocked-get'
const ACT = 'tracy-desktop:blocked-act'
const STATE = 'tracy-desktop:blocked-state'

contextBridge.exposeInMainWorld('tracyBlocked', {
  get: () => ipcRenderer.invoke(GET),
  act: (action) => ipcRenderer.invoke(ACT, String(action)),
  onState: (watcher) => {
    if (typeof watcher !== 'function') throw new TypeError('onState takes a function')
    const listener = (_event, view) => watcher(view)
    ipcRenderer.on(STATE, listener)
    return () => ipcRenderer.removeListener(STATE, listener)
  }
})
