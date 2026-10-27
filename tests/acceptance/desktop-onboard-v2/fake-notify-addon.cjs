/**
 * TEST ONLY — preloaded into the desktop app main process with `-r <this>`
 * by `lib.mjs` `launchApp({ permission })`. It answers the app's
 * `require(<…>/native/notify-permission.node)` (src/notify-permission.js) with a stand-in whose
 * `read(callback)` reports what the file named by `TRACY_E2E_FAKE_PERMISSION_FILE` says at that
 * moment, so a case can play "macOS blocks notifications" and switch it while the app runs. Nothing
 * of the app is changed: the real reader, its mapping and the bridge all run as shipped.
 */
const fs = require('node:fs')
const Module = require('node:module')

const file = process.env.TRACY_E2E_FAKE_PERMISSION_FILE
if (file) {
  const original = Module._load
  Module._load = function load(request, parent, isMain) {
    if (typeof request === 'string' && request.endsWith('notify-permission.node')) {
      return {
        read(callback) {
          let answer = 'unknown'
          try {
            answer = fs.readFileSync(file, 'utf8').trim()
          } catch {}
          setImmediate(() => callback(answer))
        }
      }
    }
    return original.call(this, request, parent, isMain)
  }
}
