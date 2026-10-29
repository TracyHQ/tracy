/**
 * The EmDash template's own personalize tool and seed, where this process can read them — and a way to run the tool.
 *
 * "Apply" writes an EmDash site's words with the SAME tool the Build uses (`tools/personalize.mjs` of the template: it
 * holds the map of which fields hold what, the rules that empty a claim rather than invent one, the model prompts and
 * the writes), run as a child process from here instead of inside the site's container. It is a plain client of the
 * site's own HTTP API with the site's agent token, so it needs nothing the container holds but the template's seed.
 *
 * 🔒 THIS PROCESS CANNOT IMPORT `packages/` IN THE IMAGE (`Dockerfile`: the image carries `apps/tracy-web` alone), so the
 * tool and each template's seed are COPYed to `src/emdash-tool/`, as the seeder's modules are to `src/seeder/`; a checkout
 * reads the packages in place. The three templates ship one byte-identical tool (`test/emdash-tool.test.mjs` holds them equal).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { emdashTemplateIdOf } from './local-releases.js'
import { observeChildPictureCalls } from './picture-model-child.js'

const IN_IMAGE = fileURLToPath(new URL('../emdash-tool/', import.meta.url))
const IN_CHECKOUT = fileURLToPath(new URL('../../../../packages/cms/', import.meta.url))
const PICTURE_PRELOAD = fileURLToPath(new URL('./picture-model-preload.mjs', import.meta.url))

/** The packages of the templates that ship the tool, by the id their quickstart tag starts with. */
const PACKAGE = Object.freeze({
  'tracy-business': 'tracy-emdash-theme-business',
  'tracy-saas': 'tracy-emdash-theme-saas',
  'tracy-base': 'tracy-emdash-theme-base'
})

/**
 * The tool and the seed of the template a quickstart installs, or null when it ships none (a packed release made by
 * the EmDash template skill carries its own and no tool: its words stay as released).
 * @param {string | null | undefined} quickstart - the release tag, e.g. `tracy-business/emdash-0.x`, or a local pack's
 *   `local/tracy-business/emdash-0.x` (read as the release it stands for)
 * @returns {{ templateId: string, tool: string, seedDir: string } | null}
 */
export function emdashToolFor(quickstart) {
  const templateId = emdashTemplateIdOf(quickstart)
  const pkg = PACKAGE[templateId]
  if (!pkg) return null
  const imageSeed = path.join(IN_IMAGE, templateId, 'seed')
  const imageTool = path.join(IN_IMAGE, 'personalize.mjs')
  if (existsSync(path.join(imageSeed, 'seed.json')) && existsSync(imageTool))
    return { templateId, tool: imageTool, seedDir: imageSeed }
  const dir = path.join(IN_CHECKOUT, pkg)
  const tool = path.join(dir, 'tools', 'personalize.mjs')
  const seedDir = path.join(dir, 'seed')
  return existsSync(tool) && existsSync(path.join(seedDir, 'seed.json'))
    ? { templateId, tool, seedDir }
    : null
}

/** The most of a child's output kept: the tool's report names every entry it wrote, and a few MB is the longest it gets. */
const KEEP_BYTES = 64 * 1024 * 1024

/**
 * Run `node …args` and say how it ended. Never rejects: a child that could not start is exit code 1 with the reason in
 * `stderr`.
 * @param {object} input
 * @param {string[]} input.args - everything after `node`
 * @param {Record<string, string>} input.env - the child's WHOLE environment: nothing of this process's is passed on
 * @param {string} [input.cwd]
 * @param {AbortSignal} [input.signal] - ends the child
 * @param {number} [input.timeoutMs]
 * @returns {Promise<{ code: number, stdout: string, stderr: string, killed: boolean }>}
 */
export function runNode({ args, env, cwd, signal, timeoutMs }) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(process.execPath, ['--import', PICTURE_PRELOAD, ...args], {
        env,
        cwd,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe']
      })
      observeChildPictureCalls(child)
    } catch (error) {
      resolve({
        code: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        killed: false
      })
      return
    }
    let stdout = ''
    let stderr = ''
    let killed = false
    const stop = () => {
      killed = true
      child.kill('SIGTERM')
      // A child that ignores SIGTERM is not waited for.
      setTimeout(() => child.kill('SIGKILL'), 3000).unref()
    }
    const timer = timeoutMs ? setTimeout(stop, timeoutMs) : null
    if (signal) {
      if (signal.aborted) stop()
      else signal.addEventListener('abort', stop, { once: true })
    }
    child.stdout.on('data', (chunk) => {
      if (stdout.length < KEEP_BYTES) stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-64 * 1024)
    })
    child.on('error', (error) => {
      stderr += error.message
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
      resolve({ code: code ?? 1, stdout, stderr, killed })
    })
  })
}
