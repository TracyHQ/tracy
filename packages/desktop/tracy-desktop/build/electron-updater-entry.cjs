/**
 * What the app takes from electron-updater: build/build-shell.mjs bundles THIS file into
 * src/generated/electron-updater.cjs (the packaged app carries no node_modules), and the tests require
 * it from node_modules — so both run the same pieces.
 *
 * Besides the updaters, three pieces of the generic provider that src/signed-feed-provider.js builds on.
 * They are internal to electron-updater, which is pinned to exactly 6.8.9 in package.json; a bump that
 * moves them fails test/signed-feed-provider.test.mjs.
 */
const updater = require('electron-updater')

module.exports = {
  get autoUpdater() {
    return updater.autoUpdater
  },
  MacUpdater: updater.MacUpdater,
  NsisUpdater: updater.NsisUpdater,
  AppImageUpdater: updater.AppImageUpdater,
  DebUpdater: updater.DebUpdater,
  GenericProvider: require('electron-updater/out/providers/GenericProvider').GenericProvider,
  parseUpdateInfo: require('electron-updater/out/providers/Provider').parseUpdateInfo,
  newUrlFromBase: require('electron-updater/out/util').newUrlFromBase
}
