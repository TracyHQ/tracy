/**
 * `@tracy/site-build-core` — the shared half of the two Build plugins. A SOURCE library: each
 * plugin bundles what it imports from here into its own `lib/`, so nothing of this package reaches
 * a customer's machine on its own.
 */
export * from './host/host.js'
