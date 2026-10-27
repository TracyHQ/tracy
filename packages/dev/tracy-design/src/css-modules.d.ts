// CSS modules imported by stories that draw on a vendor stylesheet (better-sidebar's
// `sidebar.module.css`). Vite resolves the classes at build time; TypeScript only needs the shape.
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
