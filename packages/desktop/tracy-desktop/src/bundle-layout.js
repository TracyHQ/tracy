/**
 * Where the running app finds the files build/package.sh writes into a packaged build. Pure, with the
 * folders and the path flavour passed in (test/bundle-layout.test.mjs); main.js passes `__dirname`,
 * `process.resourcesPath` and `node:path`.
 *
 * Every layout keeps the app's code in `<resources>/app/src`:
 *   macOS     `Tracy Cowork.app/Contents/Resources/app/src`
 *   Windows   `<install>\resources\app\src`
 *   Linux     `<install>/resources/app/src`
 * so the pinned files (`origin`, `update-channel`, `repo-path`) are next to `src/`, and electron-updater's
 * `app-update.yml` is in `<resources>` itself. Nothing here may count folders up to the bundle root:
 * that root has a different depth on each operating system.
 */

/**
 * @param {{ srcDir: string, resourcesPath: string, pathApi: import('node:path').PlatformPath }} input
 *   `srcDir`: the folder main.js runs from. `resourcesPath`: `process.resourcesPath`.
 * @returns {{ pinnedFile: (name: string) => string, appUpdateYml: string, sourceRepo: string }}
 *   `sourceRepo`: the TCH checkout a SOURCE run lives in (four folders above `src/`); meaningless in
 *   a packaged app, which reads `repo-path` or a pinned `origin` instead.
 */
function bundleLayout({ srcDir, resourcesPath, pathApi }) {
  return {
    pinnedFile: (name) => pathApi.join(srcDir, '..', name),
    appUpdateYml: pathApi.join(resourcesPath, 'app-update.yml'),
    sourceRepo: pathApi.resolve(srcDir, '..', '..', '..', '..')
  }
}

module.exports = { bundleLayout }
