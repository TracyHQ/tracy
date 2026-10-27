/**
 * IPC channels of the app's link routing, shared by the preload (shell/preload.ts) and the main
 * process (shell/main.ts). The order of a routed link: the page says it listens (`ready`), the main
 * process asks (`ask`), the page answers with a decision (`answer`), the main process hands a checked
 * navigate/tab decision back (`execute`). `openExternal` is the page asking for the system browser
 * outright (the Browser tab's two "open in the browser" buttons).
 */
module.exports = {
  LINK_CHANNELS: {
    ready: 'tracy-desktop:links-ready',
    ask: 'tracy-desktop:links-ask',
    answer: 'tracy-desktop:links-answer',
    execute: 'tracy-desktop:links-execute',
    openExternal: 'tracy-desktop:open-external'
  }
}
