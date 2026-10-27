// Preload for Node inside the fence (`NODE_OPTIONS=--import <this file>`): there is no DNS in the fence,
// so names under the QA stand domain answer 127.0.0.1 without asking any resolver (plan §3.2).
// Env: QA_STAND_DOMAIN (default qa.tracy.test); QA_RESOLVE_ONLY=1 fails every other name at once with
// ENOTFOUND instead of trying the system resolver.
// Exports: isStandName(hostname) -> boolean
import dns from 'node:dns'

const DOMAIN = (process.env.QA_STAND_DOMAIN ?? 'qa.tracy.test').toLowerCase()
const ONLY = process.env.QA_RESOLVE_ONLY === '1'

export function isStandName(hostname) {
  const h = String(hostname).toLowerCase()
  return h === DOMAIN || h.endsWith(`.${DOMAIN}`)
}

const LOOPBACK = { address: '127.0.0.1', family: 4 }
const notFound = (hostname) =>
  Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
    code: 'ENOTFOUND',
    errno: -3008,
    syscall: 'getaddrinfo',
    hostname
  })

const realLookup = dns.lookup
dns.lookup = function lookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  if (typeof options === 'number') options = { family: options }
  options ??= {}
  if (isStandName(hostname)) {
    process.nextTick(() =>
      options.all ? callback(null, [{ ...LOOPBACK }]) : callback(null, LOOPBACK.address, LOOPBACK.family)
    )
    return {}
  }
  if (ONLY) {
    process.nextTick(() => callback(notFound(hostname)))
    return {}
  }
  return realLookup.call(dns, hostname, options, callback)
}

const realPromiseLookup = dns.promises.lookup
dns.promises.lookup = async function lookup(hostname, options = {}) {
  if (typeof options === 'number') options = { family: options }
  if (isStandName(hostname)) return options.all ? [{ ...LOOPBACK }] : { ...LOOPBACK }
  if (ONLY) throw notFound(hostname)
  return realPromiseLookup.call(dns.promises, hostname, options)
}
