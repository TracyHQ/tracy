// Preloaded into the legacy runner and every journey process (NODE_OPTIONS=--import=…).
//  1. registers the module hooks of hooks.mjs
//  2. gives fetch a name→loopback lookup: customer sites answer at <label>.<site domain>, a name
//     Node cannot resolve (`*.localhost` is not special in getaddrinfo on macOS). Only names under
//     the stand's own site domain are redirected, to 127.0.0.1; everything else resolves as usual.

import { createRequire } from 'node:module'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const cfgPath = process.env.QA_FLOWS_TRANSPORT
if (cfgPath) {
  register('./hooks.mjs', import.meta.url)
  const cfg = JSON.parse(readTextSync(cfgPath))
  const repo = path.resolve(HERE, '..', '..', '..', '..', '..')
  const { Agent, setGlobalDispatcher } = createRequire(path.join(repo, 'package.json'))('undici')
  const domain = String(cfg.siteDomain)
  const mine = (host) => host === domain || host.endsWith(`.${domain}`)
  setGlobalDispatcher(
    new Agent({
      connect: {
        lookup(hostname, options, cb) {
          if (mine(hostname)) {
            if (options?.all) cb(null, [{ address: '127.0.0.1', family: 4 }])
            else cb(null, '127.0.0.1', 4)
            return
          }
          import('node:dns').then(({ lookup }) => lookup(hostname, options, cb))
        }
      }
    })
  )
}
