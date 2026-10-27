/** `onboard.css` arrives as text: esbuild's `text` loader (`scripts/build-client.mjs`). */
declare module '*.css' {
  const text: string
  export default text
}
