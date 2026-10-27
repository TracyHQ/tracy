#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { readConfig } from '../apps/tracy-web/src/config.js'

/** Never follow redirects with an installation credential or print the browser code. */
export async function localLaunchUrl(env, fetcher = fetch) {
  const config = readConfig(env)
  if (!config.localAccess) throw new Error('Local mode is required.')
  const response = await fetcher(`${config.origin}/auth/local/launch`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.localAccess.secret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error(`Local launcher refused (${response.status}).`)
  const url = new URL((await response.json()).url)
  if (
    url.origin !== config.origin ||
    url.pathname !== '/auth/local/open' ||
    url.search ||
    url.username ||
    url.password ||
    !/^#[a-f0-9]{64}$/.test(url.hash)
  )
    throw new Error('Invalid local launch response.')
  return url.href
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const url = await localLaunchUrl(process.env)
    const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
    if (!['darwin', 'linux'].includes(process.platform))
      throw new Error('Use the local launcher from macOS or Linux.')
    const child = spawn(command, [url], { stdio: 'ignore', shell: false })
    await new Promise((resolve, reject) => {
      child.once('error', () => reject(new Error('Could not open the browser.')))
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error('Could not open the browser.'))
      )
    })
    console.log('Tracy opened in your browser.')
  } catch (error) {
    // Fetch errors can contain URLs; report only our bounded, credential-free errors.
    const known =
      /^(Local mode is required\.|Local launcher refused \(\d+\)\.|Invalid local launch response\.|Use the local launcher from macOS or Linux\.|Could not open the browser\.)$/
    console.error(
      known.test(error.message)
        ? error.message
        : 'Could not launch Tracy. Check the local configuration and server.'
    )
    process.exitCode = 1
  }
}
