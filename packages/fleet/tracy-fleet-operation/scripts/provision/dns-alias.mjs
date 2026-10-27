#!/usr/bin/env node
/**
 * The read/compare/patch half of `migrate-web-dns-alias.sh`, kept out of the shell because every
 * step here is a decision about STRUCTURE — a compose file's text, or two `docker compose config
 * --format json` documents — and a `sed`/`grep` version of any of them is the kind of thing that
 * passes its own eye test and silently mangles a customer's compose file the day a field moves.
 *
 * No third-party deps, on purpose (issue #165 rollout runs on a fleet host and a CI dev runner with
 * only the repo checked out): the patch is a line operation over the FINITE set of network stanzas
 * `render-compose.sh` writes, and the comparison is `JSON.parse` + a canonical stringify.
 *
 * 🔒 IT NEVER COMPUTES THE ALIAS ITSELF. `render-compose.sh`'s `tracy_web_dns_alias` is the one
 * derivation (parity-pinned to `webDnsName` in apps/tracy-web/src/sites/label.js and its copy in
 * apps/tracy-host/src/capture.js). The shell passes the already-derived alias in as `--alias`, so
 * there is no fourth copy of the hash to drift.
 *
 * 🔒 IT NEVER PRINTS A CONFIG, AN ENV VALUE OR A CREDENTIAL. The candidate it emits keeps the
 * original's `${VAR}` references verbatim — resolved secrets never touch it. The diff reads the
 * resolved `compose config` JSON only to compare it, and on a mismatch names the differing key, not
 * its value.
 *
 * Subcommands (all read files rather than trust argv for anything but flags):
 *
 *   patch  --service web --alias A --in FILE
 *       Emit the candidate compose to stdout. Exit 0 = patched, 3 = already correct (no change
 *       needed), 4 = refuse (a network stanza this does not recognise, or an alias that disagrees
 *       with the one #165 derives).
 *
 *   diff   --service web --alias A --original OJSON --candidate CJSON
 *       Both files are `docker compose config --format json` output. Exit 0 when the two are equal
 *       except for the one added alias; 5 when anything else differs.
 *
 *   web-port --service web --config CJSON
 *       Print the web service's container port from validated config (80 for Apache, 4321 EmDash).
 *
 *   web-network --service web --config CJSON
 *       Print the real (external) name of the tracy network the web service attaches to, derived
 *       from the validated config — never guessed. Exit 7 when the service does not attach to tracy.
 *
 *   web-image --service web --config CJSON
 *       Print the web service's image reference from the validated config, so the caller can prove
 *       that reference still resolves to the image the running container was created from.
 *
 *   web-endpoint --network NET --inspect IJSON
 *       Print the web container's own IP on NET, so the DNS probe can prove the alias resolves to
 *       THIS endpoint and not some other. Exit 7 when the container has no IP on NET.
 *
 *   config-alias --service web --alias A --config CJSON
 *       Exit 0 when the VALIDATED config gives the web service exactly the one #165 alias on tracy
 *       (so a no-op is proven against the composed config, not just a matching text line), 8 not.
 *
 *   verify-alias --alias A --network NET --inspect IJSON
 *       IJSON is `docker inspect` output. Exit 0 when the container carries the alias on NET, 6 not.
 *
 *   on-network --network NET --inspect IJSON
 *       Exit 0 when the container is attached to NET (so the DNS-probe observer can resolve on it), 6 not.
 */
import { readFileSync } from 'node:fs'

/** Minimal `--flag value` reader; unknown flags are ignored so the shell can pass extras freely. */
function flags(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return out
}

function readText(path) {
  return path && path !== '-' ? readFileSync(path, 'utf8') : readFileSync(0, 'utf8')
}
function readJson(path) {
  return JSON.parse(readText(path))
}

/** A DNS label by construction — `render-compose.sh` writes `tracy-web-<32 hex>`. Anything else is
 * not an alias this tool put there, so it refuses rather than embedding it in a compose file. */
const ALIAS_RE = /^tracy-web-[0-9a-f]{32}$/

// ── the compose text, one service block at a time ────────────────────────────────────────────────

/**
 * The lines of `services.<service>` — from its `  <service>:` header to the next line at the same or
 * shallower indent. Returned as [start, end) indices into `lines`, or null when the service is
 * absent. Indent-based, not a YAML parse: the patch must round-trip every byte it does not touch,
 * and only the finite shapes below are ever edited.
 */
/** Escape regex metacharacters so a service name is matched literally (the shell already restricts it
 * to a slug, but a `.` reaching here must not mean "any character"). */
function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function serviceBlock(lines, service) {
  const header = new RegExp(`^ {2}${reEscape(service)}:\\s*$`)
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (header.test(lines[i])) {
      start = i
      break
    }
  }
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    // A non-blank line indented two spaces or less closes the block: the next service, or a
    // top-level key (volumes:, networks:).
    if (lines[i].trim() !== '' && /^ {0,2}\S/.test(lines[i])) {
      end = i
      break
    }
  }
  return [start, end]
}

/** The map-form network stanza `render-compose.sh` writes for a long label. */
function aliasedStanza(alias) {
  return ['    networks:', '      default: {}', '      tracy:', `        aliases: ["${alias}"]`]
}

/**
 * Add the bounded tracy-network alias to the web service, recognising ONLY the two shapes
 * `render-compose.sh` produces and refusing anything else. Returns { status, text }:
 *   'patched'        the shorthand was expanded to the aliased map form
 *   'already'        the map form is present with exactly this alias
 *   'refuse:<why>'   an unrecognised stanza, or an alias that is not the one #165 derives
 */
function patch(lines, service, alias) {
  const block = serviceBlock(lines, service)
  if (!block) return { status: `refuse:no ${service} service` }
  const [start, end] = block

  let netAt = -1
  for (let i = start + 1; i < end; i += 1) {
    if (/^ {4}networks:/.test(lines[i])) {
      netAt = i
      break
    }
  }
  if (netAt === -1) return { status: `refuse:${service} declares no networks` }

  // Short form: the one-line list shorthand `networks: [default, tracy]`.
  if (/^ {4}networks:\s*\[\s*default\s*,\s*tracy\s*\]\s*$/.test(lines[netAt])) {
    const out = [...lines.slice(0, netAt), ...aliasedStanza(alias), ...lines.slice(netAt + 1)]
    return { status: 'patched', text: out.join('\n') }
  }

  // Map form: `networks:` then an indented block. Read the tracy aliases already there.
  if (/^ {4}networks:\s*$/.test(lines[netAt])) {
    let blockEnd = end
    for (let i = netAt + 1; i < end; i += 1) {
      if (lines[i].trim() !== '' && /^ {0,4}\S/.test(lines[i])) {
        blockEnd = i
        break
      }
    }
    const stanza = lines.slice(netAt, blockEnd)
    const aliasLine = stanza.find((l) => /^ {8}aliases:/.test(l))
    if (!aliasLine) return { status: 'refuse:map-form networks with no tracy alias to compare' }
    const found = [...aliasLine.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2])
    if (found.length === 1 && found[0] === alias) return { status: 'already', text: lines.join('\n') }
    // Do NOT echo the existing alias(es): a customer-chosen value must not reach a shared log. Report
    // only that a different alias is present, and how many.
    return {
      status: `refuse:the tracy alias already present (count ${found.length}) is not the one #165 derives`
    }
  }

  return { status: 'refuse:unrecognised networks stanza' }
}

// ── the two compose config documents ─────────────────────────────────────────────────────────────

/** Recursively sort object keys so two structurally-equal documents stringify identically. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key])
    return out
  }
  return value
}

/** The service's tracy-network aliases, whatever shape compose normalised the attachment to. */
function tracyAliases(doc, service) {
  const nets = doc?.services?.[service]?.networks
  if (!nets) return []
  const tracy = Array.isArray(nets) ? (nets.includes('tracy') ? {} : undefined) : nets.tracy
  if (tracy === undefined || tracy === null) return []
  return Array.isArray(tracy.aliases) ? tracy.aliases : []
}

/**
 * Strip the added alias so everything ELSE can be compared. Normalises a network attachment to
 * `{ name: null | {…} }` and drops `aliases` from the target attachment; an attachment left empty
 * becomes null, so the shorthand's `tracy: null` and the map form's `tracy: {}` compare equal.
 */
function withoutAddedAlias(doc, service) {
  const clone = structuredClone(doc)
  const svc = clone?.services?.[service]
  if (!svc || !svc.networks) return clone
  if (Array.isArray(svc.networks)) {
    // The list shorthand `[default, tracy]` and the map form must compare equal once the alias is
    // out — normalise the shorthand to `{ name: null }`.
    const map = {}
    for (const n of svc.networks) map[n] = null
    svc.networks = map
  }
  // Drop the added alias from the tracy attachment (only there — an alias appearing on any OTHER
  // network is a difference worth catching), then collapse every empty attachment to null so the
  // map form's `tracy: {}` / `default: {}` compare equal to the shorthand's `null`.
  const tracy = svc.networks.tracy
  if (tracy && typeof tracy === 'object' && !Array.isArray(tracy)) delete tracy.aliases
  for (const key of Object.keys(svc.networks)) {
    const v = svc.networks[key]
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
      svc.networks[key] = null
    }
  }
  return clone
}

/**
 * True when candidate == original except for exactly the one added alias. Prints the differing
 * top-level section (keys only) to stderr on mismatch — never a value.
 */
function diffEqual(original, candidate, service, alias) {
  const before = tracyAliases(original, service)
  const after = tracyAliases(candidate, service)
  if (!(before.length === 0 && after.length === 1 && after[0] === alias)) {
    process.stderr.write(
      `candidate does not add exactly the #165 alias (before ${before.length}, after ${after.length})\n`
    )
    return false
  }
  const a = JSON.stringify(canonical(withoutAddedAlias(original, service)))
  const b = JSON.stringify(canonical(withoutAddedAlias(candidate, service)))
  if (a === b) return true
  // Name the sections that differ so an operator has a lead, without emitting resolved config.
  const oa = canonical(withoutAddedAlias(original, service))
  const ob = canonical(withoutAddedAlias(candidate, service))
  const keys = new Set([...Object.keys(oa), ...Object.keys(ob)])
  const differing = [...keys].filter((k) => JSON.stringify(oa[k]) !== JSON.stringify(ob[k]))
  process.stderr.write(`candidate differs from original outside the alias in: ${differing.join(', ')}\n`)
  return false
}

// ── dispatch ─────────────────────────────────────────────────────────────────────────────────────

function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const f = flags(rest)

  if (cmd === 'patch') {
    if (!ALIAS_RE.test(f.alias ?? '')) {
      process.stderr.write(`refusing: ${f.alias} is not a tracy-web-<hash> alias\n`)
      process.exit(4)
    }
    const service = f.service ?? 'web'
    const text = readText(f.in)
    const result = patch(text.split('\n'), service, f.alias)
    if (result.status === 'patched') {
      process.stdout.write(result.text.endsWith('\n') ? result.text : `${result.text}\n`)
      process.exit(0)
    }
    if (result.status === 'already') {
      process.exit(3)
    }
    process.stderr.write(`${result.status.replace(/^refuse:/, 'refusing: ')}\n`)
    process.exit(4)
  }

  if (cmd === 'diff') {
    const service = f.service ?? 'web'
    const ok = diffEqual(readJson(f.original), readJson(f.candidate), service, f.alias)
    process.exit(ok ? 0 : 5)
  }

  if (cmd === 'web-port') {
    const service = f.service ?? 'web'
    const ports = readJson(f.config)?.services?.[service]?.ports ?? []
    const tcp = ports.find((p) => (p.protocol ?? 'tcp') === 'tcp' && p.target) ?? ports[0]
    if (!tcp?.target) {
      process.stderr.write('no published web port in the validated config\n')
      process.exit(1)
    }
    process.stdout.write(String(tcp.target))
    process.exit(0)
  }

  if (cmd === 'web-network') {
    const service = f.service ?? 'web'
    const doc = readJson(f.config)
    const attach = doc?.services?.[service]?.networks
    const attached =
      attach && !Array.isArray(attach)
        ? Object.hasOwn(attach, 'tracy')
        : Array.isArray(attach) && attach.includes('tracy')
    if (!attached) {
      process.stderr.write('the web service does not attach to the tracy network in the validated config\n')
      process.exit(7)
    }
    // The runtime network is keyed by its REAL name (`networks.tracy.name`, external), which is the
    // key `docker inspect` reports under NetworkSettings.Networks — fall back to the compose-local
    // name only when the config declares no external name.
    process.stdout.write(String(doc?.networks?.tracy?.name ?? 'tracy'))
    process.exit(0)
  }

  if (cmd === 'web-image') {
    const service = f.service ?? 'web'
    const image = readJson(f.config)?.services?.[service]?.image
    if (!image) {
      process.stderr.write('the web service declares no image in the validated config\n')
      process.exit(7)
    }
    process.stdout.write(String(image))
    process.exit(0)
  }

  if (cmd === 'web-endpoint') {
    const inspect = readJson(f.inspect)
    const node = Array.isArray(inspect) ? inspect[0] : inspect
    const net = node?.NetworkSettings?.Networks?.[f.network]
    const ip = net?.IPAddress || (Array.isArray(net?.IPAddresses) ? net.IPAddresses[0] : '')
    if (!ip) {
      process.stderr.write('the web container has no IP on the tracy network\n')
      process.exit(7)
    }
    process.stdout.write(String(ip))
    process.exit(0)
  }

  if (cmd === 'config-alias') {
    const service = f.service ?? 'web'
    const aliases = tracyAliases(readJson(f.config), service)
    process.exit(aliases.length === 1 && aliases[0] === f.alias ? 0 : 8)
  }

  if (cmd === 'verify-alias') {
    const inspect = readJson(f.inspect)
    const node = Array.isArray(inspect) ? inspect[0] : inspect
    const net = node?.NetworkSettings?.Networks?.[f.network]
    const aliases = net?.Aliases ?? net?.DNSNames ?? []
    process.exit(aliases.includes(f.alias) ? 0 : 6)
  }

  if (cmd === 'on-network') {
    // Is this container attached to NET at all? (The DNS probe's observer must be, or it proves
    // nothing.) Exit 0 attached, 6 not.
    const inspect = readJson(f.inspect)
    const node = Array.isArray(inspect) ? inspect[0] : inspect
    const net = node?.NetworkSettings?.Networks?.[f.network]
    process.exit(net ? 0 : 6)
  }

  process.stderr.write(`unknown subcommand: ${cmd}\n`)
  process.exit(2)
}

main()
