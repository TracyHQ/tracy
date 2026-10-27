/**
 * A `.css` import is its text: `scripts/build-client.mjs` loads `account-cards/*.css` and
 * `accounts-pane.css` with esbuild's `text` loader (every other stylesheet stays `empty`, as
 * `@tracy/ui` tokens.css already reached the bundle through Tailwind).
 */
declare module '*.css' {
  const css: string
  export default css
}
