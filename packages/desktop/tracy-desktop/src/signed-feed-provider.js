/**
 * electron-updater's generic provider, with one change: the channel file is believed only when its
 * Ed25519 signature (`<channel file>.sig`, next to it on the feed) verifies against a key pinned in this
 * app (src/feed-signature.js, src/feed-key.js).
 *
 * The check sits where the channel file's bytes enter electron-updater, so nothing downstream ever
 * sees an unverified version or file list: an unsigned or tampered feed makes `checkForUpdates`
 * reject (the updater's ordinary "check failed" path, retried later), `update-available` is never
 * emitted, and `downloadUpdate` has nothing to download. A verified channel file carries every
 * artifact's sha512 and size, and electron-updater checks the downloaded file against that sha512
 * before installing it. The app keeps running either way; it just does not update.
 *
 * Same platform on all three: MacUpdater, NsisUpdater and AppImageUpdater all read through this.
 * The channel file name (`stable.yml`, `stable-mac.yml`, `stable-linux-arm64.yml`, …) is the one the
 * generic provider itself would read, and it is part of what is signed.
 */
const { verifyFeed } = require('./feed-signature.js')

/**
 * @param {{ GenericProvider: any, parseUpdateInfo: Function, newUrlFromBase: Function }} kit -
 *   electron-updater's pieces (build/electron-updater-entry.cjs).
 * @param {{ publicKeys: readonly string[], onVerified?: (verified: { channelFile: string, text: string }) => void }} options
 *   `onVerified` gets every channel file whose signature verified, on every check — an update or not —
 *   so the minimum version policy inside it (src/feed-policy.js) is read from the same signed bytes
 *   (tasks/todo-desktop-update-policy.md C5). A hook that throws does not fail the check.
 * @returns {any} a provider class for `setFeedURL({ provider: 'custom', updateProvider, url })`.
 */
function createSignedFeedProvider(kit, { publicKeys, onVerified }) {
  const keys = Object.freeze([...(publicKeys ?? [])])
  return class SignedFeedProvider extends kit.GenericProvider {
    async getLatestVersion() {
      const channelFile = `${this.channel}.yml`
      const fetch = async (name) =>
        this.httpRequest(kit.newUrlFromBase(name, this.baseUrl, this.updater.isAddNoCacheQuery))
      const text = await fetch(channelFile).catch((error) => {
        if (error?.statusCode === 404)
          throw new Error(`Cannot find channel "${channelFile}" update info: ${error.message}`)
        throw error
      })
      let signature
      try {
        signature = await fetch(`${channelFile}.sig`)
      } catch (error) {
        if (error?.statusCode !== 404) throw error
        throw new Error(`${channelFile}.sig is missing: the feed is not signed, so no update is taken`)
      }
      const verdict = verifyFeed({ channelFile, text: String(text ?? ''), signature, publicKeys: keys })
      if (!verdict.ok) throw new Error(`update feed refused: ${verdict.reason}`)
      try {
        onVerified?.({ channelFile, text: String(text) })
      } catch {
        // The policy is the hook's business; the update check goes on.
      }
      return kit.parseUpdateInfo(text, channelFile, kit.newUrlFromBase(channelFile, this.baseUrl))
    }
  }
}

module.exports = { createSignedFeedProvider }
