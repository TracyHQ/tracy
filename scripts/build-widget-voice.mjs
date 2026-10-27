/** Bundle the existing chat voice primitives for the independently framed widget. */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
await build({
  stdin: {
    contents:
      "export {openMicrophone} from './packages/ui/tracy-chat-input/src/client/voice-capture'; export {openPlayer} from './packages/ui/tracy-chat-input/src/client/voice-player'; export {openSpeechLink,speechSocketUrl} from './packages/ui/tracy-chat-input/src/client/voice-link.mjs';",
    resolveDir: process.cwd(),
    sourcefile: 'widget-voice.ts',
    loader: 'ts'
  },
  bundle: true,
  banner: {
    js: '/* Generated from Tracy chat voice modules. esbuild uses var for bundle bindings. */\n/* oxlint-disable no-var */'
  },
  format: 'esm',
  minify: false,
  outfile: 'apps/tracy-web/src/widget/assets/voice.js'
})

execFileSync('node_modules/.bin/biome', ['format', '--write', 'apps/tracy-web/src/widget/assets/voice.js'], {
  stdio: 'inherit'
})
