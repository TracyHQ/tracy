/**
 * Consumption-side tsdown config: would run at `pnpm install` time via a
 * `prepare` script. Self-contained: no sibling checkout resolution, no
 * typecheck (type gates belong to dev/CI). Emits three bundles from
 * src/ into lib/.
 *
 * NOTE: This plugin ships a pre-built `lib/` (no `prepare` script in
 * package.json). The pre-built strategy is required because the client
 * half depends on `@deepseek-ai/dsh-client-*` private peer deps that
 * pnpm cannot fetch in a temporary git-install directory. This config is
 * kept for parity with the dsh-spur/dsh-auto-blame/dsh-plugin-input-history
 * templates and as a fallback if the publish strategy ever flips to
 * source-install.
 */
import { defineConfig, type UserConfig } from 'tsdown'

const ID = '@huanlin/dsh-plugin-better-locale'

const CLIENT_EXTERNALS = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-locale/client',
]

const libConfig: UserConfig = {
  name: ID,
  entry: ['src/index.ts', 'src/invariant.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: true,
}

const clientConfig: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  external: CLIENT_EXTERNALS,
}

export default defineConfig([libConfig, clientConfig])
