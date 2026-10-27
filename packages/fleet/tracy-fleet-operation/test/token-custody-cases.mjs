// Compose shapes for the agent-token custody question, shared by every reader of it: the door's
// `classifyTokenMount` (apps/tracy-host/src/webroot.js), the awk `token_mount_custody` in
// `scripts/provision/mint-agent-token.sh`, the `/_host/agent-token` endpoint and the helper itself.
//
// 🔒 THE EXPECTED ANSWER IS WRITTEN HERE, NOT DERIVED FROM EITHER MATCHER. The two are twins, so
// comparing one with the other only proves they agree — and they once agreed on the wrong answer:
// both matched the source by BASENAME alone, so the legacy `./data/tracy-agent.token`, a named
// volume and a bind belonging to another service all read "protected" (Astra review, 22/09/2026).
//
// 🔒 EXACT FORMS ONLY (Hano, 23/09/2026). Three reviews in a row found a malformed shape a line
// parser read as `none` (`image: {]`, two scalars on one value, `services: invalid` above an
// indented `web:`), and `none` beside an absent host token authorises the legacy mint. So both
// matchers now accept only what the fleet itself writes: `emdashCompose` below is
// `render-compose.sh`'s `tracy_compose_emdash`, line for line (render-compose.test.mjs holds it to
// the real generator's output), with the token bind in the generator's place or in either place
// `emdash/migrate-token-mount.mjs` inserts it. Everything else — including every shape an earlier
// parser accepted as a valid bind or a provable `none` — is `unknown`.
//
// Each case is a function of the site directory: the generator writes the site directory and its
// label into the file, and an absolute source can only be judged against a real one. The file-level
// failures (missing, unreadable) and the host-file rules are not text shapes; `HOST_FILE_CASES`
// carries the latter, and the endpoint and helper tests exercise both directly.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** The one line `render-compose.sh` (and the migration) writes for the protected bind. */
export const TOKEN_BIND = '      - ./tracy-agent.token:/run/tracy-agent.token:ro'

/** The bounded #165 alias `render-compose.sh`'s `tracy_web_dns_alias` derives for `label`. */
export const webDnsAlias = (label) =>
  `tracy-web-${createHash('sha256').update(label).digest('hex').slice(0, 32)}`

/**
 * The web service's `networks:` stanza as `tracy_web_networks` writes it.
 * @param {string} label
 * @param {'generator'|'shorthand'|'alias'} mode - `generator`: what render-compose.sh writes TODAY
 *   (the aliased map form only when `<label>-web-1` exceeds 63 octets); `shorthand`: the one-line
 *   form every label had before #165; `alias`: the map form whatever the label's length.
 * @param {string} [alias] - the alias to write; defaults to the one #165 derives for `label`.
 */
export function webNetworks(label, mode = 'generator', alias = webDnsAlias(label)) {
  const long = `${label}-web-1`.length > 63
  if (mode === 'shorthand' || (mode === 'generator' && !long)) return ['    networks: [default, tracy]']
  return ['    networks:', '      default: {}', '      tracy:', `        aliases: ["${alias}"]`]
}

/** `TRACY_MAIL_URL` as `tracy_mail_url` writes it on a host that sets neither the URL nor a prefix. */
export const DEFAULT_MAIL_URL = 'http://172.30.0.10:8080/_site-mail'

/**
 * The site-mail run `tracy_web_mail_env` writes (#289), or nothing for a file written before it.
 * @param {string} label
 * @param {string|null} url - `TRACY_MAIL_URL`; `null` for no run at all.
 * @param {(line: string) => string[]} c - the builder's comment switch.
 * @param {boolean} [header] - the clone form's own `environment:` line.
 */
function mailRun(label, url, c, header = false) {
  if (url === null) return []
  return [
    ...(header ? ['    environment:'] : []),
    ...c(
      '      # Site mail: web/tracy-sendmail posts every message here (tracy-web decides whether it goes).'
    ),
    `      TRACY_MAIL_URL: "${url}"`,
    `      TRACY_MAIL_LABEL: "${label}"`,
    '      TRACY_MAIL_TOKEN: "${TRACY_MAIL_TOKEN:-}"'
  ]
}

/**
 * What `tracy_site_limits` (render-compose.sh) writes on a host that sets none of its knobs and has
 * four or more cores: `web` for a Joomla/WordPress web service, `emdash` for EmDash's, `db` for
 * MariaDB.
 */
export const DEFAULT_LIMITS = Object.freeze({ web: '2g', emdash: '3g', db: '1g', cpus: '2', pids: '1024' })

/**
 * The resource-cap run `tracy_limits_run` writes on one service (28/09/2026), or nothing for a file
 * written before it.
 * @param {{web?: string, emdash?: string, db?: string, cpus: string, pids: string}|null} limits
 * @param {'web'|'emdash'|'db'} which - the service whose memory cap the run carries.
 * @returns {string[]}
 */
export function limitsRun(limits, which) {
  if (!limits) return []
  const memory = limits[which]
  return [
    `    mem_limit: ${memory}`,
    `    memswap_limit: ${memory}`,
    `    cpus: ${limits.cpus}`,
    `    pids_limit: ${limits.pids}`
  ]
}

/**
 * `tracy_compose_emdash` from `render-compose.sh`, comments included (the matchers drop whole-line
 * comments, so these are here to prove exactly that).
 *
 * @param {string} siteDir - absolute; its basename is the label, as `SITE_DIR=$ROOT/$LABEL`.
 * @param {object} [opts]
 * @param {'none'|'generator'|'first'|'last'} [opts.token] - where the bind sits: nowhere (pre-#155),
 *   the generator's place, or the migration's (first item when a comment follows `volumes:`, last
 *   item when none does).
 * @param {string|null} [opts.dns] - `TRACY_SITE_DNS`, local dev only.
 * @param {boolean} [opts.comments] - the generator's comments; the migration's "last" place is what a
 *   comment-free file gets.
 * @param {string} [opts.image]
 * @param {string} [opts.sitesRoot] - `TRACY_SITES_ROOT`.
 * @param {string} [opts.network] - `TRACY_SITE_NETWORK`.
 * @param {'generator'|'shorthand'|'alias'} [opts.networks] - the web service's stanza (`webNetworks`).
 * @param {string} [opts.alias] - the alias an aliased stanza names.
 * @param {string|null} [opts.mail] - `TRACY_MAIL_URL` of the site-mail run (#289); `null`, the
 *   default, is a file written before it.
 * @param {object|null} [opts.limits] - the cap run (`limitsRun`, its `emdash` memory); `null`, the
 *   default, is a file written before 28/09/2026.
 */
export function emdashCompose(
  siteDir,
  {
    token = 'none',
    dns = null,
    comments = true,
    image = 'tracy/web-emdash:0.37.0',
    sitesRoot = '/srv/tracy-sites',
    network = 'tracy_tracy',
    networks = 'generator',
    alias,
    mail = null,
    limits = null
  } = {}
) {
  const label = path.basename(siteDir)
  const c = (line) => (comments ? [line] : [])
  return [
    'services:',
    '  web:',
    `    image: ${image}`,
    '    restart: unless-stopped',
    '    security_opt: ["no-new-privileges:true"]',
    '    shm_size: 512m',
    ...limitsRun(limits, 'emdash'),
    '    environment:',
    '      EMDASH_ENCRYPTION_KEY: "${EMDASH_ENCRYPTION_KEY}"',
    '      EMDASH_SITE_URL: "${EMDASH_SITE_URL}"',
    ...c("      # Who may frame this site. Read from the site's .env, empty by default."),
    '      TRACY_FRAME_ANCESTORS: "${TRACY_FRAME_ANCESTORS:-}"',
    ...mailRun(label, mail, c),
    '    volumes:',
    ...(token === 'first' ? [TOKEN_BIND] : []),
    ...c("      # The application — code, dist, node_modules — is the SITE'S OWN COPY."),
    '      - app:/app',
    '      - ./data:/app/data',
    '      - ./uploads:/app/uploads',
    ...(token === 'generator'
      ? [
          ...c("      # The site's agent PAT (#155), root-owned 0600 on the host, mounted READ-ONLY here."),
          TOKEN_BIND
        ]
      : []),
    `      - ${sitesRoot}/${label}:/site/${label}`,
    `      - ${siteDir}/data:/site/${label}/.webroot/data`,
    `      - ${siteDir}/uploads:/site/${label}/.webroot/uploads`,
    ...(token === 'last' ? [TOKEN_BIND] : []),
    ...webNetworks(label, networks, alias),
    ...(dns ? [`    dns: [${dns}]`] : []),
    '    ports:',
    '      - "127.0.0.1:${HOST_PORT:?this site\'s .env has no HOST_PORT — refusing to publish it on a default port another site may hold}:4321"',
    '',
    'volumes:',
    '  app:',
    '',
    'networks:',
    '  default:',
    '    external: true',
    `    name: ${label}_default`,
    '  tracy:',
    '    external: true',
    `    name: ${network}`,
    ''
  ].join('\n')
}

/** The pre-#155 canonical file with one exact line replaced (it must be there to be replaced). */
const legacyWith = (siteDir, from, to, opts = {}) => {
  const text = emdashCompose(siteDir, opts)
  if (!text.includes(from)) throw new Error(`fixture: ${JSON.stringify(from)} is not in the canonical form`)
  return text.replace(from, to)
}
const protectedWith = (siteDir, from, to) => legacyWith(siteDir, from, to, { token: 'generator' })

/** Wraps volume items in a minimal `services.web.volumes` block — NOT a fleet form, by design. */
const webVolumes = (...items) =>
  ['services:', '  web:', '    image: tracy/emdash:0.37', '    volumes:', ...items, ''].join('\n')

/** @type {Record<'protected'|'unknown'|'none', Array<[string, (siteDir: string) => string]>>} */
export const CUSTODY_CASES = {
  protected: [
    [
      'the generator, with its comments (render-compose.sh today)',
      (d) => emdashCompose(d, { token: 'generator' })
    ],
    ['the generator, without comments', (d) => emdashCompose(d, { token: 'generator', comments: false })],
    [
      'the generator with the local-dev dns line',
      (d) => emdashCompose(d, { token: 'generator', dns: '10.0.0.53' })
    ],
    [
      'the generator with another image, sites root and network',
      (d) =>
        emdashCompose(d, {
          token: 'generator',
          image: 'tracy/web-emdash:1.2.3@sha256:abc123',
          sitesRoot: '/Users/you/.tracy-data/sites',
          network: 'tch_tracy'
        })
    ],
    [
      'migrated: first volumes item (the generator comment follows `volumes:`)',
      (d) => emdashCompose(d, { token: 'first' })
    ],
    [
      'migrated: last volumes item (a comment-free file)',
      (d) => emdashCompose(d, { token: 'last', comments: false })
    ],
    ['migrated with the dns line', (d) => emdashCompose(d, { token: 'last', dns: '127.0.0.11, 1.1.1.1' })]
  ],
  unknown: [
    // ── the generator's form, broken one way at a time ─────────────────────────────────────────
    // `services: invalid` above an indented `web:` — compose refuses it, and a line parser that
    // accepted a scalar `services` and still marked `web` as seen read it `none` (Astra review,
    // 23/09/2026): with the host token absent, that authorised the legacy mint.
    [
      'services: invalid, then an indented web block',
      (d) => legacyWith(d, 'services:\n', 'services: invalid\n')
    ],
    ['services: invalid, protected form', (d) => protectedWith(d, 'services:\n', 'services: invalid\n')],
    ['image: {] in the generator form', (d) => legacyWith(d, 'image: tracy/web-emdash:0.37.0', 'image: {]')],
    [
      'image: {] in the protected form',
      (d) => protectedWith(d, 'image: tracy/web-emdash:0.37.0', 'image: {]')
    ],
    [
      'an image value with a space',
      (d) => legacyWith(d, 'image: tracy/web-emdash:0.37.0', 'image: tracy/web-emdash 0.37.0')
    ],
    [
      'the token bind twice (generator place and last)',
      (d) =>
        protectedWith(d, '    networks: [default, tracy]', `${TOKEN_BIND}\n    networks: [default, tracy]`)
    ],
    [
      'the token bind twice (first and generator place)',
      (d) => protectedWith(d, '    volumes:\n', `    volumes:\n${TOKEN_BIND}\n`)
    ],
    [
      'a writable token bind in the generator place',
      (d) => protectedWith(d, TOKEN_BIND, '      - ./tracy-agent.token:/run/tracy-agent.token')
    ],
    [
      'the token bind with a trailing comment',
      (d) => protectedWith(d, TOKEN_BIND, `${TOKEN_BIND}  # protected`)
    ],
    [
      'the token bind quoted',
      (d) => protectedWith(d, TOKEN_BIND, '      - "./tracy-agent.token:/run/tracy-agent.token:ro"')
    ],
    ['the token bind with a trailing space', (d) => protectedWith(d, TOKEN_BIND, `${TOKEN_BIND} `)],
    [
      'same basename: the legacy data/ copy in the generator place',
      (d) => protectedWith(d, TOKEN_BIND, '      - ./data/tracy-agent.token:/run/tracy-agent.token:ro')
    ],
    [
      'same basename, absolute: this site’s own path (valid compose, not the generator’s spelling)',
      (d) => protectedWith(d, TOKEN_BIND, `      - ${d}/tracy-agent.token:/run/tracy-agent.token:ro`)
    ],
    [
      'same basename: another site’s absolute path',
      (d) => protectedWith(d, TOKEN_BIND, `      - ${d}-other/tracy-agent.token:/run/tracy-agent.token:ro`)
    ],
    [
      'a named volume in the generator place',
      (d) => protectedWith(d, TOKEN_BIND, '      - tracy-agent.token:/run/tracy-agent.token:ro')
    ],
    [
      'a long-form bind in the generator place',
      (d) =>
        protectedWith(
          d,
          TOKEN_BIND,
          [
            '      - type: bind',
            '        source: ./tracy-agent.token',
            '        target: /run/tracy-agent.token',
            '        read_only: true'
          ].join('\n')
        )
    ],
    [
      'a matching mount under another service (legacy web)',
      (d) =>
        legacyWith(
          d,
          '\nvolumes:\n',
          `  sidecar:\n    image: busybox\n    volumes:\n${TOKEN_BIND}\n\nvolumes:\n`
        )
    ],
    [
      'a matching mount under another service listed first',
      (d) => legacyWith(d, 'services:\n', `services:\n  sidecar:\n    volumes:\n${TOKEN_BIND}\n`)
    ],
    [
      'an extra key under web',
      (d) => legacyWith(d, '    shm_size: 512m\n', '    shm_size: 512m\n    privileged: true\n')
    ],
    [
      'a key missing from web (an older generator)',
      (d) => legacyWith(d, '      TRACY_FRAME_ANCESTORS: "${TRACY_FRAME_ANCESTORS:-}"\n', '')
    ],
    ['a top-level include', (d) => `include:\n  - token.yml\n${emdashCompose(d)}`],
    ['a document marker before the file', (d) => `---\n${emdashCompose(d)}`],
    ['a second document after the file', (d) => `${emdashCompose(d)}---\nservices: {}\n`],
    ['a trailing line after the file', (d) => `${emdashCompose(d)}x-extra: true\n`],
    ['the file cut short (no networks footer)', (d) => emdashCompose(d).split('\nnetworks:\n')[0]],
    ['CRLF line endings', (d) => emdashCompose(d).replace(/\n/g, '\r\n')],
    ['a tab-indented line', (d) => legacyWith(d, '    restart: unless-stopped', '\trestart: unless-stopped')],
    ['a trailing space on a line', (d) => legacyWith(d, '    shm_size: 512m', '    shm_size: 512m ')],
    [
      'the data mount of another site directory',
      (d) => legacyWith(d, `      - ${d}/data:/site/`, `      - ${d}-other/data:/site/`)
    ],
    [
      'the network name of another label',
      (d) => legacyWith(d, `    name: ${path.basename(d)}_default`, '    name: other_default')
    ],
    [
      'a sites-root mount with a `..` segment',
      (d) =>
        legacyWith(
          d,
          `      - /srv/tracy-sites/${path.basename(d)}:`,
          `      - /srv/tracy-sites/../etc/${path.basename(d)}:`
        )
    ],
    ['a dns line carrying another key', (d) => emdashCompose(d, { dns: '1.1.1.1], privileged: [true' })],
    ['an empty dns list', (d) => emdashCompose(d, { dns: ' ' }).replace('    dns: [ ]', '    dns: []')],
    [
      'a dns list that is a lone comma (`[,]`, YAML that does not parse)',
      (d) => emdashCompose(d, { dns: ',' })
    ],
    ['a dns list with a trailing comma', (d) => emdashCompose(d, { dns: '1.1.1.1,' })],
    ['a dns list with a leading comma', (d) => emdashCompose(d, { dns: ',1.1.1.1' })],
    ['a dns list with an empty item', (d) => emdashCompose(d, { dns: '1.1.1.1,,8.8.8.8' })],
    ['a dns list holding a bare `::`', (d) => emdashCompose(d, { dns: '::' })],
    ['a dns item with three octets', (d) => emdashCompose(d, { dns: '1.1.1' })],
    ['a dns item with an octet above 255', (d) => emdashCompose(d, { dns: '256.1.1.1' })],
    ['a dns list with two spaces after a comma', (d) => emdashCompose(d, { dns: '1.1.1.1,  8.8.8.8' })],
    ['a network name with a flow value', (d) => emdashCompose(d, { network: '{]' })],
    // ── the file-shape failures ────────────────────────────────────────────────────────────────
    // ── shapes an earlier line parser read one way or the other; none is a fleet form ─────────────
    [
      'not a fleet form (a valid bind a line parser once accepted): short form, relative to the site directory (what render-compose.sh writes)',
      () => webVolumes('      - ./data:/app/data', '      - ./tracy-agent.token:/run/tracy-agent.token:ro')
    ],
    [
      'not a fleet form (a valid bind a line parser once accepted): short form, quoted, with a trailing comment',
      () => webVolumes('      - "./tracy-agent.token:/run/tracy-agent.token:ro"  # protected')
    ],
    [
      'not a fleet form (a valid bind a line parser once accepted): short form, absolute path of this site',
      (siteDir) => webVolumes(`      - ${siteDir}/tracy-agent.token:/run/tracy-agent.token:ro`)
    ],
    [
      'not a fleet form (a valid bind a line parser once accepted): long form, relative source',
      () =>
        webVolumes(
          '      - app:/app',
          '      - type: bind',
          '        source: ./tracy-agent.token',
          '        target: /run/tracy-agent.token',
          '        read_only: true'
        )
    ],
    [
      'not a fleet form (a valid bind a line parser once accepted): long form, absolute source (docker compose config output), keys reordered, bind options',
      (siteDir) =>
        webVolumes(
          '      -   target: "/run/tracy-agent.token"',
          '          read_only: True',
          `          source: ${siteDir}/tracy-agent.token`,
          '          type: bind',
          '          bind:',
          '            create_host_path: false'
        )
    ],
    [
      'not a fleet form (a valid bind a line parser once accepted): the full shape render-compose.sh writes (flow sequences, quoted interpolations)',
      () =>
        [
          'services:',
          '  web:',
          '    image: tracy/emdash:0.37',
          '    restart: unless-stopped',
          '    security_opt: ["no-new-privileges:true"]',
          '    shm_size: 512m',
          '    environment:',
          '      EMDASH_ENCRYPTION_KEY: "${EMDASH_ENCRYPTION_KEY}"',
          '      # Who may frame this site.',
          '      TRACY_FRAME_ANCESTORS: "${TRACY_FRAME_ANCESTORS:-}"',
          '    volumes:',
          '      - app:/app',
          '      - ./data:/app/data',
          '      - ./tracy-agent.token:/run/tracy-agent.token:ro',
          '    networks: [default, tracy]',
          '    ports:',
          '      - "127.0.0.1:${HOST_PORT:?this site\'s .env has no HOST_PORT — refusing}:4321"',
          '',
          'volumes:',
          '  app:',
          ''
        ].join('\n')
    ],
    [
      'not a fleet form (a valid bind a line parser once accepted): sequence items at the same indent as the volumes key',
      () =>
        [
          'services:',
          '  web:',
          '    volumes:',
          '    - ./data:/app/data',
          '    - ./tracy-agent.token:/run/tracy-agent.token:ro',
          '    ports:',
          '    - "127.0.0.1:51770:4321"',
          ''
        ].join('\n')
    ],
    [
      'not a fleet form (a file a line parser once read as none): only a commented-out mount',
      () => webVolumes('      # - ./tracy-agent.token:/run/tracy-agent.token:ro', '      - ./data:/app/data')
    ],
    [
      'not a fleet form (a file a line parser once read as none): no token mount at all',
      () => webVolumes('      - ./data:/app/data')
    ],
    [
      'not a fleet form (a file a line parser once read as none): the shape render-compose.sh writes, minus the token mount',
      () =>
        [
          'services:',
          '  web:',
          '    image: tracy/emdash:0.37',
          '    restart: unless-stopped',
          '    security_opt: ["no-new-privileges:true"]',
          '    shm_size: 512m',
          '    environment:',
          '      EMDASH_SITE_URL: "${EMDASH_SITE_URL}"',
          '      TRACY_FRAME_ANCESTORS: "${TRACY_FRAME_ANCESTORS:-}"',
          '    volumes:',
          '      - app:/app',
          '      - ./data:/app/data',
          '    networks: [default, tracy]',
          '    ports:',
          '      - "127.0.0.1:${HOST_PORT:?this site\'s .env has no HOST_PORT — refusing}:4321"',
          '',
          'volumes:',
          '  app:',
          '',
          'networks:',
          '  default:',
          '    external: true',
          '    name: site_default',
          ''
        ].join('\n')
    ],
    [
      'not a fleet form (a file a line parser once read as none): nested flow collections closed in the right order',
      () =>
        webVolumes('      - ./data:/app/data').replace(
          'image: tracy/emdash:0.37',
          'labels: {a: [b, "c]"], d: \'{\'}'
        )
    ],
    [
      'not a fleet form (a file a line parser once read as none): quoted scalars with valid escapes, a doubled single quote and flow pairs',
      () =>
        webVolumes('      - ./data:/app/data').replace(
          'image: tracy/emdash:0.37',
          'image: "tracy\\x2Femdash\\u003a0.37"\n    command: [\'it\'\'s\', a: b, {"k":v},]'
        )
    ],
    [
      'not a fleet form (a file a line parser once read as none): a web service with no volumes key',
      () => ['services:', '  web:', '    image: tracy/emdash:0.37', ''].join('\n')
    ],
    [
      'long form without read_only',
      () =>
        webVolumes(
          '      - type: bind',
          '        source: ./tracy-agent.token',
          '        target: /run/tracy-agent.token'
        )
    ],
    ['a writable short-form bind', () => webVolumes('      - ./tracy-agent.token:/run/tracy-agent.token')],
    [
      'a flow mapping',
      () =>
        webVolumes(
          '      - {type: bind, source: ./tracy-agent.token, target: /run/tracy-agent.token, read_only: true}'
        )
    ],
    [
      'the path named in the environment too',
      () =>
        [
          'services:',
          '  web:',
          '    environment:',
          '      TOKEN_FILE: /run/tracy-agent.token',
          '    volumes:',
          '      - ./tracy-agent.token:/run/tracy-agent.token:ro',
          ''
        ].join('\n')
    ],
    ['a differently named host file', () => webVolumes('      - ./other.token:/run/tracy-agent.token:ro')],
    [
      'a protected bind next to a writable duplicate',
      () =>
        webVolumes(
          '      - ./tracy-agent.token:/run/tracy-agent.token:ro',
          '      - ./tracy-agent.token:/run/tracy-agent.token'
        )
    ],
    // ── same basename, different source ──────────────────────────────────────────────────────
    [
      'same basename: the legacy data/ copy, short form',
      () => webVolumes('      - ./data/tracy-agent.token:/run/tracy-agent.token:ro')
    ],
    [
      'same basename: the legacy data/ copy, long form',
      () =>
        webVolumes(
          '      - type: bind',
          '        source: ./data/tracy-agent.token',
          '        target: /run/tracy-agent.token',
          '        read_only: true'
        )
    ],
    [
      'same basename: another site’s absolute path',
      (siteDir) => webVolumes(`      - ${siteDir}-other/tracy-agent.token:/run/tracy-agent.token:ro`)
    ],
    [
      'same basename: a parent directory',
      () => webVolumes('      - ../tracy-agent.token:/run/tracy-agent.token:ro')
    ],
    [
      'an interpolated source compose would resolve at run time',
      () => webVolumes('      - ${TOKEN_DIR}/tracy-agent.token:/run/tracy-agent.token:ro')
    ],
    // ── named volumes ────────────────────────────────────────────────────────────────────────
    [
      'a named volume called tracy-agent.token, short form',
      () => webVolumes('      - tracy-agent.token:/run/tracy-agent.token:ro')
    ],
    [
      'a named volume, long form',
      () =>
        webVolumes(
          '      - type: volume',
          '        source: tracy-agent.token',
          '        target: /run/tracy-agent.token',
          '        read_only: true'
        )
    ],
    [
      'a long-form bind whose source is a bare name',
      () =>
        webVolumes(
          '      - type: bind',
          '        source: tracy-agent.token',
          '        target: /run/tracy-agent.token',
          '        read_only: true'
        )
    ],
    // ── the right bind in the wrong place ────────────────────────────────────────────────────
    [
      'a matching mount under another service',
      () =>
        [
          'services:',
          '  web:',
          '    volumes:',
          '      - ./data:/app/data',
          '  sidecar:',
          '    volumes:',
          '      - ./tracy-agent.token:/run/tracy-agent.token:ro',
          ''
        ].join('\n')
    ],
    [
      'a matching mount under another service listed first',
      () =>
        [
          'services:',
          '  sidecar:',
          '    volumes:',
          '      - ./tracy-agent.token:/run/tracy-agent.token:ro',
          '  web:',
          '    volumes:',
          '      - ./data:/app/data',
          ''
        ].join('\n')
    ],
    [
      'a matching mount in an extension block merged by anchor',
      () =>
        [
          'x-token: &token',
          '  volumes:',
          '    - ./tracy-agent.token:/run/tracy-agent.token:ro',
          'services:',
          '  web:',
          '    <<: *token',
          ''
        ].join('\n')
    ],
    [
      'a web service under a quoted parent the parser cannot name',
      () =>
        [
          'services:',
          '  "other":',
          '    web:',
          '      volumes:',
          '        - ./tracy-agent.token:/run/tracy-agent.token:ro',
          ''
        ].join('\n')
    ],
    // ── a compose file that cannot PROVE the absence of a mount (Hano, 23/09/2026) ───────────────
    // `none` authorises the legacy repair, which revokes, `mv`s and writes the readable copy back.
    // Only a file that shows a `services` → `web` block mapping and names no token path earns it;
    // an empty, comment-only, unreadable-as-compose or opaque file is `unknown`.
    ['an empty compose file', () => ''],
    ['a whitespace-only compose file', () => '\n   \n\t\n'],
    [
      'a comment-only compose file',
      () => '# services:\n#   web:\n#     volumes:\n#       - ./data:/app/data\n'
    ],
    ['services as an empty flow mapping', () => 'services: {}\n'],
    [
      'no web service at all',
      () => ['services:', '  db:', '    volumes:', '      - ./db:/var/lib/mysql', ''].join('\n')
    ],
    [
      'a web service written as a flow mapping',
      () => 'services:\n  web: {image: "tracy/emdash:0.37", volumes: ["./data:/app/data"]}\n'
    ],
    ['bytes that are not YAML at all', () => '\u0000\u0001\u0002PK\u0003\u0004 not a compose file\n'],
    [
      'a web key the parser cannot read as a mapping key',
      () => ['services:', '  web', '    volumes:', '      - ./data:/app/data', ''].join('\n')
    ],
    [
      'a top-level include that can bring mounts from another file',
      () =>
        [
          'include:',
          '  - token.yml',
          'services:',
          '  web:',
          '    volumes:',
          '      - ./data:/app/data',
          ''
        ].join('\n')
    ],
    [
      'a web service that extends another definition',
      () =>
        [
          'services:',
          '  web:',
          '    extends:',
          '      file: base.yml',
          '      service: web',
          '    volumes:',
          '      - ./data:/app/data',
          ''
        ].join('\n')
    ],
    // ── YAML under services.web this line parser cannot follow (Hano, 23/09/2026) ─────────────────
    // Every such file is one `docker compose` itself refuses, so it says nothing about what the
    // running container mounts. Before this rule both parsers read the first one `none`.
    [
      'an unterminated flow sequence under web',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'image: [unterminated')
    ],
    [
      'an unterminated flow mapping under web',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'labels: {a: b')
    ],
    [
      'a flow sequence closed twice',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'networks: [default]]')
    ],
    // A closer of the other kind balances a depth counter but not the YAML (Astra review,
    // 23/09/2026): both parsers once read `image: {]` as a closed collection and the file as `none`.
    [
      'a flow mapping closed by a bracket',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'image: {]')
    ],
    [
      'a flow sequence closed by a brace',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'networks: [default}')
    ],
    [
      'nested flow collections closed in the wrong order',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'labels: {a: [b}]')
    ],
    [
      'text after a closed flow sequence',
      () =>
        webVolumes('      - ./data:/app/data').replace(
          'image: tracy/emdash:0.37',
          'networks: [default] tracy'
        )
    ],
    [
      'an unterminated double-quoted value',
      () =>
        webVolumes('      - ./data:/app/data').replace(
          'image: tracy/emdash:0.37',
          'image: "tracy/emdash:0.37'
        )
    ],
    ['an unterminated single-quoted volume item', () => webVolumes("      - './data:/app/data")],
    [
      'a plain value holding a second mapping',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'image: tracy: emdash')
    ],
    [
      'a line under web that is neither a key nor an item',
      () =>
        webVolumes('      - ./data:/app/data').replace(
          'image: tracy/emdash:0.37',
          'image: tracy/emdash:0.37\n    stray words'
        )
    ],
    [
      'a block scalar that holds the mount as text',
      () =>
        [
          'services:',
          '  web:',
          '    volumes: |',
          '      - ./tracy-agent.token:/run/tracy-agent.token:ro',
          ''
        ].join('\n')
    ],
    [
      'a block scalar anywhere under web',
      () =>
        webVolumes('      - ./data:/app/data').replace(
          'image: tracy/emdash:0.37',
          'command: >-\n      node server.js'
        )
    ],
    [
      'an alias value',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'image: *img')
    ],
    // A quoted scalar is SCANNED, not judged by its first and last character, and a flow
    // collection is read entry by entry (Astra review, 23/09/2026): both parsers once read
    // `image: "bad" "tail"` — two scalars, a file compose refuses — as one closed string and the
    // file as `none`, which authorised the legacy mint on a site with no host token.
    [
      'two double-quoted scalars on one value',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'image: "bad" "tail"')
    ],
    [
      'a single-quoted scalar followed by more text',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', "image: 'bad' tail")
    ],
    [
      'a double-quoted scalar with an escape YAML does not have',
      () =>
        webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'image: "tracy\\qemdash"')
    ],
    [
      'a double-quoted scalar with a short hex escape',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'image: "tracy\\x4"')
    ],
    ['two quoted scalars in one volume item', () => webVolumes('      - "./data" ":/app/data"')],
    [
      'two quoted scalars inside a flow sequence, no comma',
      () =>
        webVolumes('      - ./data:/app/data').replace(
          'image: tracy/emdash:0.37',
          'networks: ["default" "tracy"]'
        )
    ],
    [
      'an empty entry inside a flow sequence',
      () =>
        webVolumes('      - ./data:/app/data').replace(
          'image: tracy/emdash:0.37',
          'networks: [default,,tracy]'
        )
    ],
    [
      'a plain value that starts with a flow closer',
      () => webVolumes('      - ./data:/app/data').replace('image: tracy/emdash:0.37', 'image: ]tracy')
    ],
    [
      'volumes under a nested key of web, not web itself',
      () =>
        [
          'services:',
          '  web:',
          '    develop:',
          '      volumes:',
          '        - ./tracy-agent.token:/run/tracy-agent.token:ro',
          ''
        ].join('\n')
    ]
  ],
  none: [
    ['the pre-#155 generator, with its comments', (d) => emdashCompose(d)],
    ['the pre-#155 generator, without comments', (d) => emdashCompose(d, { comments: false })],
    ['the pre-#155 generator with the dns line', (d) => emdashCompose(d, { dns: '10.0.0.53' })],
    [
      'the pre-#155 generator with a commented-out token bind',
      (d) => legacyWith(d, '      - app:/app\n', `      # ${TOKEN_BIND.trim()}\n      - app:/app\n`)
    ]
  ]
}

/**
 * The host-file half, which no text shape can carry: the compose form, what sits at
 * `<siteDir>/tracy-agent.token`, and the one answer both the door and the helper must reach.
 *   `protected` → the token is answered as is, nothing written;
 *   `mint`      → a first (legacy) mint may run — only for a proven pre-#155 site with no host file;
 *   `unknown`   → TOKEN_CUSTODY_UNKNOWN, nothing written (a protected form whose host file is gone
 *                 included: a new file is an inode the running container never sees).
 * `host` is `'file'` (a root-owned 0600 regular file holding a token), `'absent'`, `'symlink'` (to the
 * legacy data/ copy) or `'dangling'` (a symlink to nowhere). `composeAs` (optional, see `placeCompose`)
 * puts the compose text somewhere other than a plain `docker-compose.yml`.
 * @type {Array<{name: string, compose: (siteDir: string) => string, host: 'file'|'absent'|'symlink'|'dangling', composeAs?: 'symlink'|'fifo', expect: 'protected'|'mint'|'unknown'}>}
 */
export const HOST_FILE_CASES = [
  {
    name: 'generator form, regular host token',
    compose: (d) => emdashCompose(d, { token: 'generator' }),
    host: 'file',
    expect: 'protected'
  },
  {
    name: 'migrated form, regular host token',
    compose: (d) => emdashCompose(d, { token: 'first' }),
    host: 'file',
    expect: 'protected'
  },
  {
    name: 'generator form, host token absent',
    compose: (d) => emdashCompose(d, { token: 'generator' }),
    host: 'absent',
    expect: 'unknown'
  },
  {
    name: 'generator form, host token a symlink to data/',
    compose: (d) => emdashCompose(d, { token: 'generator' }),
    host: 'symlink',
    expect: 'unknown'
  },
  {
    name: 'generator form, host token a dangling symlink',
    compose: (d) => emdashCompose(d, { token: 'generator' }),
    host: 'dangling',
    expect: 'unknown'
  },
  {
    name: 'pre-#155 form, no host token (a genuine legacy site)',
    compose: (d) => emdashCompose(d),
    host: 'absent',
    expect: 'mint'
  },
  {
    name: 'pre-#155 form, host token present (compose lost the mount)',
    compose: (d) => emdashCompose(d),
    host: 'file',
    expect: 'unknown'
  },
  {
    name: 'pre-#155 form, host token a symlink',
    compose: (d) => emdashCompose(d),
    host: 'symlink',
    expect: 'unknown'
  },
  {
    name: 'pre-#155 form, host token a dangling symlink',
    compose: (d) => emdashCompose(d),
    host: 'dangling',
    expect: 'unknown'
  },
  {
    name: 'services: invalid, no host token',
    compose: (d) => emdashCompose(d).replace('services:\n', 'services: invalid\n'),
    host: 'absent',
    expect: 'unknown'
  },
  {
    name: 'image: {], no host token',
    compose: (d) => emdashCompose(d).replace('image: tracy/web-emdash:0.37.0', 'image: {]'),
    host: 'absent',
    expect: 'unknown'
  },
  // 🔒 The fleet writes `docker-compose.yml` as a plain file. A symlink is refused even when its
  // target is the exact form (Astra review, 23/09/2026): the link, not the fleet, chose the text.
  {
    name: 'generator form behind a compose symlink, regular host token',
    compose: (d) => emdashCompose(d, { token: 'generator' }),
    composeAs: 'symlink',
    host: 'file',
    expect: 'unknown'
  },
  {
    name: 'pre-#155 form behind a compose symlink, no host token',
    compose: (d) => emdashCompose(d),
    composeAs: 'symlink',
    host: 'absent',
    expect: 'unknown'
  },
  {
    name: 'compose is a FIFO, no host token',
    compose: (d) => emdashCompose(d),
    composeAs: 'fifo',
    host: 'absent',
    expect: 'unknown'
  }
]

/**
 * Write a row's compose into `siteDir` the way the row says: a plain `docker-compose.yml` (the
 * fleet's own shape), a symlink to a plain file holding the same text, or a FIFO with no writer
 * (a reader that opens it blocking would hang, so a refusal must come without reading it).
 * @param {string} siteDir
 * @param {{compose: (siteDir: string) => string, composeAs?: 'symlink'|'fifo'}} row
 */
export function placeCompose(siteDir, row) {
  const file = path.join(siteDir, 'docker-compose.yml')
  if (row.composeAs === 'fifo') return execFileSync('mkfifo', [file])
  if (row.composeAs !== 'symlink') return writeFileSync(file, row.compose(siteDir))
  const elsewhere = path.join(siteDir, 'elsewhere')
  mkdirSync(elsewhere, { recursive: true })
  writeFileSync(path.join(elsewhere, 'docker-compose.yml'), row.compose(siteDir))
  symlinkSync(path.join(elsewhere, 'docker-compose.yml'), file)
}

/**
 * `tracy_compose_clone`, `tracy_compose_joomla_fresh` or `tracy_compose_wordpress_fresh` from
 * `render-compose.sh`, comments and blank lines included (render-compose.test.mjs holds each to the
 * real generator's output).
 *
 * @param {string} siteDir - its basename is the label.
 * @param {object} [opts]
 * @param {'clone'|'joomla'|'wordpress'} [opts.flavor]
 * @param {string} [opts.image]
 * @param {string} [opts.dbName] - `DB_NAME`, written twice by the fresh forms.
 * @param {string} [opts.sqlMode] - `DB_SQL_MODE`, possibly empty.
 * @param {string} [opts.extensions] - `JOOMLA_EXTENSIONS_URLS`, fresh Joomla only.
 * @param {string} [opts.sitesRoot] - `TRACY_SITES_ROOT`.
 * @param {string} [opts.network] - `TRACY_SITE_NETWORK`.
 * @param {string|null} [opts.dns] - `TRACY_SITE_DNS`, local dev only.
 * @param {boolean} [opts.comments]
 * @param {'generator'|'shorthand'|'alias'} [opts.networks] - the web service's stanza (`webNetworks`).
 * @param {string} [opts.alias] - the alias an aliased stanza names.
 * @param {string|null} [opts.mail] - `TRACY_MAIL_URL` of the site-mail run (#289); `null`, the
 *   default, is a file written before it.
 * @param {object|null} [opts.limits] - the cap runs (`limitsRun`: `db` memory on the database,
 *   `web` memory on the web service); `null`, the default, is a file written before 28/09/2026.
 */
export function phpCompose(
  siteDir,
  {
    flavor = 'clone',
    image = flavor === 'joomla' ? 'tracy/web-joomla:6-php8.3' : 'tracy/web-wordpress:php8.3',
    dbName = flavor === 'joomla' ? 'joomla' : 'wordpress',
    sqlMode = 'NO_ENGINE_SUBSTITUTION',
    extensions = '',
    sitesRoot = '/srv/tracy-sites',
    network = 'tracy_tracy',
    dns = null,
    comments = true,
    networks = 'generator',
    alias,
    mail = null,
    limits = null
  } = {}
) {
  const label = path.basename(siteDir)
  const c = (line) => (comments ? [line] : [])
  const webroot = `${sitesRoot}/${label}/.webroot`
  const installer = {
    clone: [
      '    depends_on: [db]',
      ...c("    # Straight to Apache: the image's entrypoint would install a fresh site of its own, and"),
      ...c("    # this webroot is already the customer's."),
      '    entrypoint: ["apache2-foreground"]',
      ...mailRun(label, mail, c, true)
    ],
    joomla: [
      '    depends_on: [db]',
      '    environment:',
      '      JOOMLA_DB_HOST: db',
      '      JOOMLA_DB_USER: root',
      '      JOOMLA_DB_PASSWORD: "${DB_PASSWORD}"',
      `      JOOMLA_DB_NAME: "${dbName}"`,
      ...c('      # Deterministic, so post-up SQL (the cowork token read) does not have to discover it.'),
      '      JOOMLA_DB_PREFIX: "tr_"',
      `      JOOMLA_SITE_NAME: "${label}"`,
      '      JOOMLA_ADMIN_USER: "Tracy Agent"',
      '      JOOMLA_ADMIN_USERNAME: "tracyagent"',
      '      JOOMLA_ADMIN_PASSWORD: "${JOOMLA_ADMIN_PASSWORD}"',
      '      JOOMLA_ADMIN_EMAIL: "tracy-agent@tracy.ai"',
      `      JOOMLA_EXTENSIONS_URLS: "${extensions}"`,
      ...mailRun(label, mail, c)
    ],
    wordpress: [
      '    depends_on: [db]',
      '    environment:',
      '      WORDPRESS_DB_HOST: db',
      '      WORDPRESS_DB_USER: root',
      '      WORDPRESS_DB_PASSWORD: "${DB_PASSWORD}"',
      `      WORDPRESS_DB_NAME: "${dbName}"`,
      ...c(
        "      # Deterministic, same reasoning as Joomla's tr_ prefix: post-up work must not discover it."
      ),
      '      WORDPRESS_TABLE_PREFIX: "tr_"',
      ...mailRun(label, mail, c)
    ]
  }[flavor]
  return [
    'services:',
    '  db:',
    '    image: mariadb:11',
    '    restart: unless-stopped',
    ...limitsRun(limits, 'db'),
    '    command:',
    ...c(
      `      # Why this is relaxed is the platform's business — see platform/${flavor === 'clone' ? 'wordpress' : flavor}.sh.`
    ),
    `      - --sql-mode=${sqlMode}`,
    ...c('      # A migrated dump batches rows into one multi-row INSERT per export chunk.'),
    '      - --max-allowed-packet=256M',
    '    environment:',
    '      MARIADB_ROOT_PASSWORD: "${DB_PASSWORD}"',
    `      MARIADB_DATABASE: "${dbName}"`,
    '    volumes:',
    '      - db:/var/lib/mysql',
    '',
    '  web:',
    `    image: ${image}`,
    '    restart: unless-stopped',
    '    security_opt: ["no-new-privileges:true"]',
    '    shm_size: 512m',
    ...limitsRun(limits, 'web'),
    ...installer,
    '    volumes:',
    `      - ${webroot}:/var/www/html`,
    '      - ./apache/headers.load:/etc/apache2/mods-enabled/headers.load:ro',
    ...c("      # `zz-` so it loads last and its headers win over anything the site's own config sets."),
    '      - ./apache/tracy-noindex.conf:/etc/apache2/conf-enabled/zz-tracy-noindex.conf:ro',
    `      - ${sitesRoot}/${label}:/site/${label}`,
    `      - ${webroot}:/site/${label}/.webroot`,
    ...webNetworks(label, networks, alias),
    ...(dns ? [`    dns: [${dns}]`] : []),
    '    ports:',
    '      - "127.0.0.1:${HOST_PORT:?this site\'s .env has no HOST_PORT — refusing to publish it on a default port another site may hold}:80"',
    '',
    'volumes:',
    '  db:',
    '',
    'networks:',
    '  default:',
    '    external: true',
    `    name: ${label}_default`,
    '  tracy:',
    '    external: true',
    `    name: ${network}`,
    ''
  ].join('\n')
}

/** A PHP generator form with one exact line replaced (it must be there to be replaced). */
const phpWith = (siteDir, from, to, opts = {}) => {
  const text = phpCompose(siteDir, opts)
  if (!text.includes(from)) throw new Error(`fixture: ${JSON.stringify(from)} is not in the PHP form`)
  return text.replace(from, to)
}
/** The generator's line for this site's webroot bind. */
const webrootBind = (d) => `      - /srv/tracy-sites/${path.basename(d)}/.webroot:/var/www/html`

const JOOMLA_ENV = 'HOST_PORT=51770\nPLATFORM=joomla\nDB_PASSWORD=sekret1\n'
/** A pre-06/09 `.env`: no `PLATFORM=` line, so the compose alone must prove the platform. */
const OLD_ENV = 'HOST_PORT=51770\nDB_PASSWORD=sekret1\n'
/** A hand-written minimal PHP compose — NOT a fleet form, by design. */
const MINIMAL_PHP = 'services:\n  web:\n    volumes:\n      - /srv/tracy-sites/x/.webroot:/var/www/html\n'
const put = (siteDir, name, text) => writeFileSync(path.join(siteDir, name), text)
/** A row whose compose (beside a pre-06/09 `.env`) must be judged by the compose alone. */
const composeOnly = (name, compose, expect) => ({
  name,
  arrange: (d) => {
    put(d, '.env', OLD_ENV)
    put(d, 'docker-compose.yml', compose(d))
  },
  expect
})

/**
 * Is this directory an EmDash site? Asked by the door's `siteShape` and by `site_shape` in
 * `mint-agent-token.sh`, before either reads a token. Each row arranges an EMPTY site directory.
 *
 * 🔒 NOT BY `data/data.db` ALONE (Astra review, 23/09/2026): an EmDash site whose database is missing
 * used to take the Joomla road, where the host token is read with no custody question. Any mark
 * makes the site EmDash; a `.env` or compose that exists but is not one readable regular file is
 * `unknown` (refused); a Joomla or WordPress directory the fleet writes is `other`.
 *
 * 🔒 AND `other` IS PROVEN, NOT INFERRED FROM MISSING MARKS (Astra review, 23/09/2026): an EmDash
 * site that lost every mark, its compose reduced to `services: {}`, read as Joomla. `other` needs
 * `.env` naming `PLATFORM=joomla|wordpress` or a compose that is exactly one of the three PHP forms
 * `render-compose.sh` writes (`phpCompose`); a directory with neither is `unknown`. Every YAML
 * shape a structural walker once accepted (block scalars, multi-line quotes, duplicate keys,
 * `volumes:\t[]`, ...) is kept below as `unknown`.
 * @type {Array<{name: string, arrange: (siteDir: string) => void, expect: 'emdash'|'other'|'unknown'}>}
 */
export const SITE_SHAPE_CASES = [
  { name: 'an empty directory: no mark, no proof', arrange: () => {}, expect: 'unknown' },
  {
    name: 'a Joomla directory the fleet writes',
    arrange: (d) => {
      put(d, '.env', JOOMLA_ENV)
      put(d, 'docker-compose.yml', phpCompose(d, { flavor: 'joomla' }))
      mkdirSync(path.join(d, 'apache'))
    },
    expect: 'other'
  },
  {
    name: 'a Joomla .env beside a hand-written compose: the .env proves it',
    arrange: (d) => {
      put(d, '.env', JOOMLA_ENV)
      put(d, 'docker-compose.yml', MINIMAL_PHP)
    },
    expect: 'other'
  },
  {
    name: 'a Joomla directory whose compose names the token path (not an EmDash mark)',
    arrange: (d) => {
      put(d, '.env', JOOMLA_ENV)
      put(
        d,
        'docker-compose.yml',
        'services:\n  web:\n    volumes:\n      - ./tracy-agent.token:/run/tracy-agent.token\n'
      )
    },
    expect: 'other'
  },
  { name: 'a Joomla .env alone', arrange: (d) => put(d, '.env', JOOMLA_ENV), expect: 'other' },
  {
    name: 'a WordPress .env alone',
    arrange: (d) => put(d, '.env', 'HOST_PORT=51771\nPLATFORM=wordpress\nDB_PASSWORD=x\n'),
    expect: 'other'
  },
  // The three generator forms prove the platform on their own (a pre-06/09 `.env`).
  composeOnly('the generator clone form, compose alone', (d) => phpCompose(d), 'other'),
  composeOnly(
    'the generator Joomla fresh form, compose alone',
    (d) => phpCompose(d, { flavor: 'joomla' }),
    'other'
  ),
  composeOnly(
    'the generator WordPress fresh form, compose alone',
    (d) => phpCompose(d, { flavor: 'wordpress' }),
    'other'
  ),
  composeOnly(
    'the Joomla fresh form with an extension URL, an empty sql-mode, no comments',
    (d) =>
      phpCompose(d, {
        flavor: 'joomla',
        sqlMode: '',
        extensions: 'https://github.com/TracyHQ/claude-cowork/releases/download/v1.2.0/pkg_claudecowork.zip',
        comments: false
      }),
    'other'
  ),
  composeOnly(
    'a PHP form on a local lane: dns list, lane network, another sites root',
    (d) =>
      phpCompose(d, {
        dns: '10.89.0.1, 1.1.1.1',
        network: 'compose_dev_tracy',
        sitesRoot: '/var/lib/tracy/sites'
      }),
    'other'
  ),
  {
    name: 'a generator form with no .env at all',
    arrange: (d) => put(d, 'docker-compose.yml', phpCompose(d)),
    expect: 'other'
  },
  // Everything else is no proof: hand-written, older, or YAML-trick shapes.
  composeOnly('a hand-written minimal PHP compose is not proof', () => MINIMAL_PHP, 'unknown'),
  composeOnly(
    'a relative webroot bind (the pre-render-compose fleet form) is not proof',
    () => 'services:\n  web:\n    volumes:\n      - ./webroot:/var/www/html\n',
    'unknown'
  ),
  {
    name: 'an EmDash site that lost every mark: compose `services: {}`, no .env',
    arrange: (d) => put(d, 'docker-compose.yml', 'services: {}\n'),
    expect: 'unknown'
  },
  {
    name: 'the webroot path only in a comment is not proof',
    arrange: (d) => put(d, 'docker-compose.yml', 'services: {}\n# :/var/www/html\n'),
    expect: 'unknown'
  },
  {
    name: 'the webroot path in an indented comment line is not proof',
    arrange: (d) =>
      put(d, 'docker-compose.yml', 'services:\n  web:\n    volumes:\n      # - x:/var/www/html\n'),
    expect: 'unknown'
  },
  {
    name: 'the webroot path trailing another key is not proof',
    arrange: (d) => put(d, 'docker-compose.yml', 'services:\n  web:\n    image: x # :/var/www/html\n'),
    expect: 'unknown'
  },
  {
    name: 'the webroot bind inside a top-level block scalar is not proof',
    arrange: (d) => put(d, 'docker-compose.yml', 'services: {}\nx-note: |\n  - ./webroot:/var/www/html\n'),
    expect: 'unknown'
  },
  {
    name: 'a whole services tree inside a block scalar is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'x-note: |\n  services:\n    web:\n      volumes:\n        - ./webroot:/var/www/html\nservices: {}\n'
      ),
    expect: 'unknown'
  },
  {
    name: 'the webroot bind inside a block scalar opened at an odd indentation is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'services:\n  web:\n   x: |\n    volumes:\n      - ./webroot:/var/www/html\n'
      ),
    expect: 'unknown'
  },
  {
    name: 'the webroot bind inside a block scalar under volumes is not proof',
    arrange: (d) =>
      put(d, 'docker-compose.yml', 'services:\n  web:\n    volumes: |\n      - ./webroot:/var/www/html\n'),
    expect: 'unknown'
  },
  {
    name: 'the webroot bind inside a multi-line quoted scalar is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'x-note: "\nservices:\n  web:\n    volumes:\n      - ./webroot:/var/www/html\n"\n'
      ),
    expect: 'unknown'
  },
  {
    name: 'the webroot bind inside a multi-line flow collection is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'x-note: [\nservices:\n  web:\n    volumes:\n      - ./webroot:/var/www/html\n]\n'
      ),
    expect: 'unknown'
  },
  {
    name: 'the webroot bind under a volumes key outside services is not proof',
    arrange: (d) =>
      put(d, 'docker-compose.yml', 'x-note:\n  web:\n    volumes:\n      - ./webroot:/var/www/html\n'),
    expect: 'unknown'
  },
  {
    name: 'a webroot bind under a volumes key declared twice in its service is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'services:\n  web:\n    volumes:\n      - ./webroot:/var/www/html\n    volumes: []\n'
      ),
    expect: 'unknown'
  },
  {
    name: 'a duplicate volumes key with a tab after the colon is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'services:\n  web:\n    volumes:\n      - ./webroot:/var/www/html\n    volumes:\t[]\n'
      ),
    expect: 'unknown'
  },
  composeOnly(
    'a generator form followed by `volumes:\\t[]` in the web service is not proof',
    (d) =>
      phpWith(d, '    networks: [default, tracy]\n', '    networks: [default, tracy]\n    volumes:\t[]\n'),
    'unknown'
  ),
  composeOnly(
    'a generator form followed by `volumes: []` in the web service is not proof',
    (d) =>
      phpWith(d, '    networks: [default, tracy]\n', '    networks: [default, tracy]\n    volumes: []\n'),
    'unknown'
  ),
  composeOnly(
    'a generator form with a second top-level services key is not proof',
    (d) => `${phpCompose(d)}services: {}\n`,
    'unknown'
  ),
  composeOnly(
    'a generator form with a second web service is not proof',
    (d) => phpWith(d, '\nvolumes:\n  db:\n', '  web:\n    image: x\n\nvolumes:\n  db:\n'),
    'unknown'
  ),
  {
    name: 'a webroot bind under a volumes key repeated as a quoted key is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'services:\n  web:\n    "volumes": []\n    volumes:\n      - ./webroot:/var/www/html\n'
      ),
    expect: 'unknown'
  },
  {
    name: 'a webroot bind under a service declared twice is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'services:\n  web:\n    volumes:\n      - ./webroot:/var/www/html\n  web:\n    image: x\n'
      ),
    expect: 'unknown'
  },
  {
    name: 'a webroot bind under a services key declared twice is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'services:\n  web:\n    volumes:\n      - ./webroot:/var/www/html\nservices: {}\n'
      ),
    expect: 'unknown'
  },
  {
    name: 'a webroot bind beside an explicit-key entry in its service is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'services:\n  web:\n    ? volumes\n    : []\n    volumes:\n      - ./webroot:/var/www/html\n'
      ),
    expect: 'unknown'
  },
  {
    name: 'two services each with their own volumes key (not a fleet form) is not proof',
    arrange: (d) =>
      put(
        d,
        'docker-compose.yml',
        'services:\n  db:\n    volumes:\n      - db:/var/lib/mysql\n  web:\n    volumes:\n      - ./webroot:/var/www/html\nvolumes:\n  db:\n'
      ),
    expect: 'unknown'
  },
  // Key spellings YAML reads as the same key, and value spellings it reads as the same value.
  composeOnly(
    '`services :` is not the generator line',
    (d) => phpWith(d, 'services:\n', 'services :\n'),
    'unknown'
  ),
  composeOnly(
    'a quoted `"services":` is not the generator line',
    (d) => phpWith(d, 'services:\n', '"services":\n'),
    'unknown'
  ),
  composeOnly(
    "a quoted `'web':` is not the generator line",
    (d) => phpWith(d, '  web:\n', "  'web':\n"),
    'unknown'
  ),
  composeOnly(
    '`volumes :` in the web service is not the generator line',
    (d) => phpWith(d, `    volumes:\n${webrootBind(d)}`, `    volumes :\n${webrootBind(d)}`),
    'unknown'
  ),
  composeOnly(
    'a tab after `volumes:` in the web service is not the generator line',
    (d) => phpWith(d, `    volumes:\n${webrootBind(d)}`, `    volumes:\t\n${webrootBind(d)}`),
    'unknown'
  ),
  composeOnly(
    'the web volumes as a flow list is not the generator form',
    (d) => phpWith(d, `    volumes:\n${webrootBind(d)}`, `    volumes: [${webrootBind(d).slice(8)}]`),
    'unknown'
  ),
  composeOnly(
    'a quoted webroot bind is not the generator line',
    (d) => phpWith(d, webrootBind(d), `      - "${webrootBind(d).slice(8)}"`),
    'unknown'
  ),
  composeOnly(
    'the webroot bind as a block scalar is not the generator line',
    (d) => phpWith(d, webrootBind(d), `      - |\n        ${webrootBind(d).slice(8)}`),
    'unknown'
  ),
  composeOnly('a CRLF generator form is not proof', (d) => phpCompose(d).replace(/\n/g, '\r\n'), 'unknown'),
  composeOnly(
    'a tab-indented line is not proof',
    (d) => phpWith(d, '    shm_size: 512m', '\tshm_size: 512m'),
    'unknown'
  ),
  composeOnly(
    'a trailing space is not proof',
    (d) => phpWith(d, '    shm_size: 512m', '    shm_size: 512m '),
    'unknown'
  ),
  // Missing, extra and reordered lines.
  composeOnly(
    'a generator form missing its headers bind is not proof',
    (d) => phpWith(d, '      - ./apache/headers.load:/etc/apache2/mods-enabled/headers.load:ro\n', ''),
    'unknown'
  ),
  composeOnly(
    'a generator form missing its site-folder mounts is not proof',
    (d) => phpWith(d, `      - /srv/tracy-sites/${path.basename(d)}:/site/${path.basename(d)}\n`, ''),
    'unknown'
  ),
  composeOnly(
    'a generator form with an extra environment line is not proof',
    (d) =>
      phpWith(
        d,
        '      WORDPRESS_TABLE_PREFIX: "tr_"\n',
        '      WORDPRESS_TABLE_PREFIX: "tr_"\n      EXTRA: 1\n',
        { flavor: 'wordpress' }
      ),
    'unknown'
  ),
  composeOnly(
    'a generator form with restart and image swapped is not proof',
    (d) =>
      phpWith(
        d,
        '    image: mariadb:11\n    restart: unless-stopped\n',
        '    restart: unless-stopped\n    image: mariadb:11\n'
      ),
    'unknown'
  ),
  composeOnly(
    'the clone entrypoint on a Joomla fresh form is not proof',
    (d) =>
      phpWith(d, '    depends_on: [db]\n', '    depends_on: [db]\n    entrypoint: ["apache2-foreground"]\n', {
        flavor: 'joomla'
      }),
    'unknown'
  ),
  // Variable lines hold only the values the generator writes.
  composeOnly(
    'an image with a trailing comment is not proof',
    (d) =>
      phpWith(
        d,
        '    image: tracy/web-wordpress:php8.3',
        '    image: tracy/web-wordpress:php8.3 # :/var/www/html'
      ),
    'unknown'
  ),
  composeOnly(
    'an image opening a flow mapping is not proof',
    (d) => phpWith(d, '    image: tracy/web-wordpress:php8.3', '    image: {]'),
    'unknown'
  ),
  composeOnly(
    'a database name that differs between MariaDB and Joomla is not proof',
    (d) =>
      phpWith(d, '      JOOMLA_DB_NAME: "joomla"', '      JOOMLA_DB_NAME: "other"', { flavor: 'joomla' }),
    'unknown'
  ),
  composeOnly(
    'a database name with a quote in it is not proof',
    (d) =>
      phpWith(d, '      MARIADB_DATABASE: "wordpress"', '      MARIADB_DATABASE: "word"press"', {
        flavor: 'wordpress'
      }),
    'unknown'
  ),
  composeOnly(
    'a Joomla site name other than the label is not proof',
    (d) =>
      phpWith(d, `      JOOMLA_SITE_NAME: "${path.basename(d)}"`, '      JOOMLA_SITE_NAME: "another"', {
        flavor: 'joomla'
      }),
    'unknown'
  ),
  composeOnly(
    'an extension list carrying a quote and a newline escape is not proof',
    (d) =>
      phpWith(
        d,
        '      JOOMLA_EXTENSIONS_URLS: ""',
        '      JOOMLA_EXTENSIONS_URLS: "https://x/a.zip"\\n  x: "y"',
        {
          flavor: 'joomla'
        }
      ),
    'unknown'
  ),
  composeOnly(
    'an extension list with a space is not proof',
    (d) =>
      phpWith(d, '      JOOMLA_EXTENSIONS_URLS: ""', '      JOOMLA_EXTENSIONS_URLS: "https://x/a.zip #"', {
        flavor: 'joomla'
      }),
    'unknown'
  ),
  composeOnly(
    'a Joomla admin email the generator never writes is not proof',
    (d) =>
      phpWith(
        d,
        '      JOOMLA_ADMIN_EMAIL: "tracy-agent@tracy.ai"',
        '      JOOMLA_ADMIN_EMAIL: "agent+1@example.test"',
        {
          flavor: 'joomla'
        }
      ),
    'unknown'
  ),
  composeOnly(
    'a Joomla admin email one character off the generator value is not proof',
    (d) =>
      phpWith(
        d,
        '      JOOMLA_ADMIN_EMAIL: "tracy-agent@tracy.ai"',
        '      JOOMLA_ADMIN_EMAIL: "tracy-agent@tracyXai"',
        { flavor: 'joomla' }
      ),
    'unknown'
  ),
  composeOnly(
    'a Joomla admin email carrying a quote and a key is not proof',
    (d) =>
      phpWith(
        d,
        '      JOOMLA_ADMIN_EMAIL: "tracy-agent@tracy.ai"',
        '      JOOMLA_ADMIN_EMAIL: "a@b.c", x: "y@z.ai"',
        { flavor: 'joomla' }
      ),
    'unknown'
  ),
  composeOnly(
    'a Joomla admin email with a space or no domain dot is not proof',
    (d) =>
      phpWith(
        d,
        '      JOOMLA_ADMIN_EMAIL: "tracy-agent@tracy.ai"',
        '      JOOMLA_ADMIN_EMAIL: "a b@localhost"',
        {
          flavor: 'joomla'
        }
      ),
    'unknown'
  ),
  composeOnly(
    'an unquoted Joomla admin email is not proof',
    (d) =>
      phpWith(
        d,
        '      JOOMLA_ADMIN_EMAIL: "tracy-agent@tracy.ai"',
        '      JOOMLA_ADMIN_EMAIL: tracy-agent@tracy.ai',
        {
          flavor: 'joomla'
        }
      ),
    'unknown'
  ),
  composeOnly(
    'a sql-mode carrying a flow value is not proof',
    (d) => phpWith(d, '      - --sql-mode=NO_ENGINE_SUBSTITUTION', '      - --sql-mode=[x]'),
    'unknown'
  ),
  composeOnly(
    "a webroot that is not this label's is not proof",
    (d) => phpWith(d, webrootBind(d), '      - /srv/tracy-sites/other/.webroot:/var/www/html'),
    'unknown'
  ),
  composeOnly(
    'a webroot with a `..` segment is not proof',
    (d) =>
      phpWith(d, webrootBind(d), `      - /srv/tracy-sites/../${path.basename(d)}/.webroot:/var/www/html`),
    'unknown'
  ),
  composeOnly(
    "a site-folder mount that is not the webroot's parent is not proof",
    (d) =>
      phpWith(
        d,
        `      - /srv/tracy-sites/${path.basename(d)}:/site/${path.basename(d)}`,
        `      - /elsewhere/${path.basename(d)}:/site/${path.basename(d)}`
      ),
    'unknown'
  ),
  composeOnly(
    'a network name opening a flow list is not proof',
    (d) => phpWith(d, '    name: tracy_tracy', '    name: [tracy_tracy'),
    'unknown'
  ),
  composeOnly(
    'a dns line that is not a list of IPv4 addresses is not proof',
    (d) => phpWith(d, '    dns: [10.89.0.1]', '    dns: [10.89.0.1, "x"]', { dns: '10.89.0.1' }),
    'unknown'
  ),
  // Non-regular files: the generator form behind a symlink, or a FIFO.
  {
    name: 'compose a symlink to a PHP generator form',
    arrange: (d) => {
      put(d, 'elsewhere.yml', phpCompose(d))
      symlinkSync(path.join(d, 'elsewhere.yml'), path.join(d, 'docker-compose.yml'))
    },
    expect: 'unknown'
  },
  {
    name: 'a Joomla .env symlinked to a regular file',
    arrange: (d) => {
      put(d, 'elsewhere.env', JOOMLA_ENV)
      symlinkSync(path.join(d, 'elsewhere.env'), path.join(d, '.env'))
    },
    expect: 'unknown'
  },
  {
    name: 'no mark and no proof: .env without PLATFORM, compose without a webroot bind',
    arrange: (d) => {
      put(d, '.env', 'HOST_PORT=51770\n')
      put(d, 'docker-compose.yml', 'services:\n  web:\n    image: x\n')
    },
    expect: 'unknown'
  },
  {
    name: '.env naming PLATFORM=joomlax is not proof',
    arrange: (d) => put(d, '.env', 'HOST_PORT=1\nPLATFORM=joomlax\n'),
    expect: 'unknown'
  },
  {
    name: 'a Joomla .env beside an EmDash compose: the mark wins',
    arrange: (d) => {
      put(d, '.env', JOOMLA_ENV)
      put(d, 'docker-compose.yml', emdashCompose(d))
    },
    expect: 'emdash'
  },
  {
    name: 'data/data.db, the old test',
    arrange: (d) => {
      mkdirSync(path.join(d, 'data'))
      put(d, 'data/data.db', 'SQLite format 3\0')
    },
    expect: 'emdash'
  },
  { name: 'data/ without its database', arrange: (d) => mkdirSync(path.join(d, 'data')), expect: 'emdash' },
  { name: 'data as a regular file', arrange: (d) => put(d, 'data', ''), expect: 'emdash' },
  {
    name: 'data/data.db a directory',
    arrange: (d) => mkdirSync(path.join(d, 'data', 'data.db'), { recursive: true }),
    expect: 'emdash'
  },
  {
    name: 'data a dangling symlink',
    arrange: (d) => symlinkSync(path.join(d, 'nowhere'), path.join(d, 'data')),
    expect: 'emdash'
  },
  { name: 'uploads/ alone', arrange: (d) => mkdirSync(path.join(d, 'uploads')), expect: 'emdash' },
  {
    name: '.env naming PLATFORM=emdash',
    arrange: (d) => put(d, '.env', 'HOST_PORT=1\nPLATFORM=emdash\n'),
    expect: 'emdash'
  },
  {
    name: '.env holding an EMDASH_ key',
    arrange: (d) => put(d, '.env', 'HOST_PORT=1\nEMDASH_ENCRYPTION_KEY=abc\n'),
    expect: 'emdash'
  },
  {
    name: 'a pre-#155 EmDash compose alone',
    arrange: (d) => put(d, 'docker-compose.yml', emdashCompose(d)),
    expect: 'emdash'
  },
  {
    name: 'a hand-edited compose naming /app/data',
    arrange: (d) => put(d, 'docker-compose.yml', 'services:\n  web:\n    volumes:\n      - ./db:/app/data\n'),
    expect: 'emdash'
  },
  {
    name: '.env a FIFO',
    arrange: (d) => execFileSync('mkfifo', [path.join(d, '.env')]),
    expect: 'unknown'
  },
  {
    name: 'compose a FIFO',
    arrange: (d) => execFileSync('mkfifo', [path.join(d, 'docker-compose.yml')]),
    expect: 'unknown'
  },
  {
    name: 'compose a symlink to an EmDash compose',
    arrange: (d) => {
      put(d, 'elsewhere.yml', emdashCompose(d))
      symlinkSync(path.join(d, 'elsewhere.yml'), path.join(d, 'docker-compose.yml'))
    },
    expect: 'unknown'
  },
  {
    name: 'compose a directory',
    arrange: (d) => mkdirSync(path.join(d, 'docker-compose.yml')),
    expect: 'unknown'
  },
  {
    name: 'data/ present beside a FIFO compose: the mark wins, custody refuses later',
    arrange: (d) => {
      mkdirSync(path.join(d, 'data'))
      execFileSync('mkfifo', [path.join(d, 'docker-compose.yml')])
    },
    expect: 'emdash'
  }
]

// ── labels long enough for the #165 alias ─────────────────────────────────────────────────────────
//
// 🔒 A LONG LABEL IS A FLEET FORM TOO (Hano, 23/09/2026). Since #165 `render-compose.sh` writes the
// web service's networks as a four-line map carrying a bounded `tracy-web-<hash>` alias whenever
// `<label>-web-1` exceeds 63 octets — i.e. a label of 58 characters or more. Before the matchers knew
// that stanza, every such site the generator wrote (EmDash, and Joomla/WordPress beside a pre-06/09
// `.env`) answered `unknown`. The rows below are labelled because the answer depends on the label:
// the consumer makes `<tmp>/<row.label>` and passes that directory, so the alias the matchers derive
// is this label's. render-compose.test.mjs holds the fixture to the real generator's output for the
// same labels.

const LABEL_SOURCE = `synthetic-dns-165-${'0123456789abcdef'.repeat(4)}`
/** Labels either side of the 63-octet boundary (`<label>-web-1` is the label plus six). */
export const LABELS = Object.freeze({
  short: 'shortsite',
  fits: LABEL_SOURCE.slice(0, 57),
  over: LABEL_SOURCE.slice(0, 58),
  long: LABEL_SOURCE.slice(0, 60)
})

/** An aliased stanza with one exact line replaced (it must be there to be replaced). */
const aliasWith = (compose, siteDir, from, to) => {
  const text = compose(siteDir)
  const at = text.split('\n').indexOf(from)
  if (at === -1) throw new Error(`fixture: ${JSON.stringify(from)} is not in the aliased form`)
  const lines = text.split('\n')
  lines.splice(at, 1, ...to)
  return lines.join('\n')
}
const aliasLine = (d) => `        aliases: ["${webDnsAlias(path.basename(d))}"]`

/**
 * Stanza shapes around the alias that no fleet tool writes, each applied to a compose builder for a
 * long label. The same list refuses for EmDash custody and for the PHP proof.
 * @type {Array<[string, (compose: (d: string, o?: object) => string) => (d: string) => string]>}
 */
const ALIAS_REFUSALS = [
  [
    'an alias naming another label',
    (f) => (d) => f(d, { networks: 'alias', alias: webDnsAlias('othersite') })
  ],
  [
    'the alias in upper-case hex',
    (f) => (d) => f(d, { networks: 'alias', alias: webDnsAlias(path.basename(d)).toUpperCase() })
  ],
  [
    'a truncated alias',
    (f) => (d) => f(d, { networks: 'alias', alias: webDnsAlias(path.basename(d)).slice(0, 41) })
  ],
  ['the alias single-quoted', (f) => (d) => aliasWith(f, d, aliasLine(d), [aliasLine(d).replace(/"/g, "'")])],
  [
    'a second alias beside the right one',
    (f) => (d) =>
      aliasWith(f, d, aliasLine(d), [
        aliasLine(d).replace('"]', '", "tracy-web-00000000000000000000000000000000"]')
      ])
  ],
  [
    'the aliases as a block list',
    (f) => (d) =>
      aliasWith(f, d, aliasLine(d), ['        aliases:', `          - ${webDnsAlias(path.basename(d))}`])
  ],
  [
    'tracy before default',
    (f) => (d) =>
      aliasWith(f, d, '      default: {}', []).replace(aliasLine(d), `${aliasLine(d)}\n      default: {}`)
  ],
  ['default with no value', (f) => (d) => aliasWith(f, d, '      default: {}', ['      default:'])],
  [
    'an extra key under tracy',
    (f) => (d) => aliasWith(f, d, aliasLine(d), [aliasLine(d), '        ipv4_address: 10.0.0.9'])
  ],
  ['the alias line indented further', (f) => (d) => aliasWith(f, d, aliasLine(d), [`  ${aliasLine(d)}`])],
  [
    'the shorthand followed by the alias block',
    (f) => (d) => aliasWith(f, d, '    networks:', ['    networks: [default, tracy]'])
  ]
]

// ── the site-mail run (#289) ───────────────────────────────────────────────────────────────────
// Since #289 every form render-compose.sh writes carries `TRACY_MAIL_URL`, `TRACY_MAIL_LABEL` and
// `TRACY_MAIL_TOKEN` on the web service (the clone form under an `environment:` of its own). Both
// matchers take that run whole or not at all, with the label derived from the site directory and
// the URL held to a plain http(s) class; files written before #289 stay forms. For EmDash the run
// also dates the file: only a generator that puts the token bind in its own place ever wrote it.

/** A host's own `TRACY_MAIL_URL` (render-compose.sh writes it through as given). */
const CONFIGURED_MAIL_URL = 'https://mail-relay.example.test:8443/_site-mail'
const mailUrlLine = (url = DEFAULT_MAIL_URL) => `      TRACY_MAIL_URL: "${url}"`
const mailLabelLine = (d) => `      TRACY_MAIL_LABEL: "${path.basename(d)}"`
const MAIL_TOKEN_LINE = '      TRACY_MAIL_TOKEN: "${TRACY_MAIL_TOKEN:-}"'

/** A compose with the one exact line `from` replaced by `to` (it must be there to be replaced). */
const linesWith = (text, from, to) => {
  const lines = text.split('\n')
  const at = lines.indexOf(from)
  if (at === -1) throw new Error(`fixture: ${JSON.stringify(from)} is not in the form`)
  lines.splice(at, 1, ...to)
  return lines.join('\n')
}

/**
 * Mail runs no fleet tool writes, each applied to a builder `f(d, o)` whose default output carries
 * the default run. The same list refuses for EmDash custody and for the PHP proof.
 * @type {Array<[string, (f: (d: string, o?: object) => string) => (d: string) => string]>}
 */
const MAIL_REFUSALS = [
  [
    'a mail label naming another site',
    (f) => (d) => linesWith(f(d), mailLabelLine(d), ['      TRACY_MAIL_LABEL: "othersite"'])
  ],
  [
    'the mail label upper-cased',
    (f) => (d) =>
      linesWith(f(d), mailLabelLine(d), [mailLabelLine(d).replace(/"[^"]*"$/, (v) => v.toUpperCase())])
  ],
  [
    'mail URL and label swapped',
    (f) => (d) =>
      linesWith(linesWith(f(d), mailUrlLine(), ['SWAP']), mailLabelLine(d), [mailUrlLine()]).replace(
        'SWAP',
        mailLabelLine(d)
      )
  ],
  ['the mail token line missing', (f) => (d) => linesWith(f(d), MAIL_TOKEN_LINE, [])],
  ['the mail URL line missing', (f) => (d) => linesWith(f(d), mailUrlLine(), [])],
  [
    'the mail token without its empty default',
    (f) => (d) => linesWith(f(d), MAIL_TOKEN_LINE, ['      TRACY_MAIL_TOKEN: "${TRACY_MAIL_TOKEN}"'])
  ],
  [
    'the mail token as a literal secret',
    (f) => (d) => linesWith(f(d), MAIL_TOKEN_LINE, ['      TRACY_MAIL_TOKEN: "abc123"'])
  ],
  [
    'the mail run twice',
    (f) => (d) =>
      linesWith(f(d), MAIL_TOKEN_LINE, [MAIL_TOKEN_LINE, mailUrlLine(), mailLabelLine(d), MAIL_TOKEN_LINE])
  ],
  [
    'an extra environment line after the mail run',
    (f) => (d) => linesWith(f(d), MAIL_TOKEN_LINE, [MAIL_TOKEN_LINE, '      EXTRA: "1"'])
  ],
  ['an empty mail URL', (f) => (d) => linesWith(f(d), mailUrlLine(), [mailUrlLine('')])],
  [
    'a mail URL that interpolates',
    (f) => (d) => linesWith(f(d), mailUrlLine(), [mailUrlLine('http://${TRACY_MAIL_HOST}/_site-mail')])
  ],
  [
    'a mail URL with a space',
    (f) => (d) => linesWith(f(d), mailUrlLine(), [mailUrlLine('http://172.30.0.10:8080/_site mail')])
  ],
  [
    'a mail URL with another scheme',
    (f) => (d) => linesWith(f(d), mailUrlLine(), [mailUrlLine('file:///etc/passwd')])
  ],
  [
    'a mail URL single-quoted',
    (f) => (d) => linesWith(f(d), mailUrlLine(), [`      TRACY_MAIL_URL: '${DEFAULT_MAIL_URL}'`])
  ],
  [
    'a mail URL with a trailing comment',
    (f) => (d) => linesWith(f(d), mailUrlLine(), [`${mailUrlLine()} # relay`])
  ],
  ['the mail run indented further', (f) => (d) => linesWith(f(d), mailUrlLine(), [`  ${mailUrlLine()}`])],
  [
    'the mail run moved below the volumes',
    (f) => (d) => {
      const text = linesWith(
        linesWith(linesWith(f(d), mailUrlLine(), []), mailLabelLine(d), []),
        MAIL_TOKEN_LINE,
        []
      )
      return linesWith(text, '    ports:', [
        '    environment:',
        mailUrlLine(),
        mailLabelLine(d),
        MAIL_TOKEN_LINE,
        '    ports:'
      ])
    }
  ]
]

// ── the resource-cap run (28/09/2026) ─────────────────────────────────────────────────────────
// Since 28/09/2026 every form render-compose.sh writes carries `mem_limit`, `memswap_limit` (equal),
// `cpus` and `pids_limit` after `shm_size` on the web service, and after `restart` on MariaDB. Both
// matchers take each run whole or not at all, with every value held to a tight class; files written
// before it stay forms. The run dates the file like the mail run: its generator also writes the mail
// run, the bind in its own place (EmDash), and the run on both services (PHP).

/**
 * The cap run carrying `memory` with its four lines replaced by `edit(run)` (it must be there).
 * @param {string} text
 * @param {string} memory - the `mem_limit` value that finds the run (web and db differ).
 * @param {(run: string[]) => string[]} edit
 */
const runWith = (text, memory, edit) => {
  const lines = text.split('\n')
  const at = lines.indexOf(`    mem_limit: ${memory}`)
  if (at === -1 || lines[at + 1] !== `    memswap_limit: ${memory}`)
    throw new Error(`fixture: no cap run for ${memory} in the form`)
  lines.splice(at, 4, ...edit(lines.slice(at, at + 4)))
  return lines.join('\n')
}

/**
 * Cap runs no fleet tool writes, as edits of the four lines `tracy_limits_run` emits. The same list
 * refuses for EmDash custody and for the PHP proof.
 * @type {Array<[string, (run: string[]) => string[]]>}
 */
const LIMITS_REFUSALS = [
  ['the memswap line missing', ([m, , c, p]) => [m, c, p]],
  ['swap allowed above the memory cap', ([m, , c, p]) => [m, '    memswap_limit: 64g', c, p]],
  ['unlimited swap', ([m, , c, p]) => [m, '    memswap_limit: -1', c, p]],
  [
    'a memory cap in bytes',
    ([, , c, p]) => ['    mem_limit: 1610612736', '    memswap_limit: 1610612736', c, p]
  ],
  ['a memory cap with a decimal', ([, , c, p]) => ['    mem_limit: 1.5g', '    memswap_limit: 1.5g', c, p]],
  ['a memory cap in GB', ([, , c, p]) => ['    mem_limit: 2GB', '    memswap_limit: 2GB', c, p]],
  ['a memory cap quoted', ([, , c, p]) => ['    mem_limit: "2g"', '    memswap_limit: "2g"', c, p]],
  [
    'a memory cap that interpolates',
    ([, , c, p]) => ['    mem_limit: ${TRACY_SITE_MEMORY}', '    memswap_limit: ${TRACY_SITE_MEMORY}', c, p]
  ],
  ['a memory cap with a trailing comment', ([m, s, c, p]) => [`${m} # cap`, s, c, p]],
  ['zero cores (no cap at all)', ([m, s, , p]) => [m, s, '    cpus: 0', p]],
  ['negative cores', ([m, s, , p]) => [m, s, '    cpus: -1', p]],
  ['cores quoted', ([m, s, , p]) => [m, s, '    cpus: "2"', p]],
  ['cores as a fraction with no leading digit', ([m, s, , p]) => [m, s, '    cpus: .5', p]],
  ['no process cap (-1)', ([m, s, c]) => [m, s, c, '    pids_limit: -1']],
  ['a zero process cap', ([m, s, c]) => [m, s, c, '    pids_limit: 0']],
  ['the process cap missing', ([m, s, c]) => [m, s, c]],
  ['cores and processes swapped', ([m, s, c, p]) => [m, s, p, c]],
  ['the run twice', (run) => [...run, ...run]],
  ['a fifth cap inside the run', (run) => [...run, '    cpu_shares: 512']],
  ['the run indented further', (run) => run.map((line) => `  ${line}`)],
  ['the run gone but one line', ([m]) => [m]]
]

/**
 * The same file with the cap run carrying `memory` moved to just above `ports:` — right keys, wrong
 * place: the matchers read a run only where the generator writes it.
 */
const runMoved = (text, memory) => {
  let run = []
  const without = runWith(text, memory, (lines) => {
    run = lines
    return []
  })
  return linesWith(without, '    ports:', [...run, '    ports:'])
}

/** A host's own caps (`TRACY_SITE_*` set, a small machine): still the generator's form. */
const HOST_LIMITS = Object.freeze({ web: '2048m', emdash: '2560m', db: '768m', cpus: '1.5', pids: '4096' })

/**
 * EmDash custody for labelled site directories: `classifyTokenMount` and `token_mount_custody` must
 * both give `expect` for `<tmp>/<label>`.
 * @type {Array<{name: string, label: string, compose: (siteDir: string) => string, expect: 'protected'|'none'|'unknown'}>}
 */
export const LABELLED_CUSTODY_CASES = [
  ...['over', 'long'].flatMap((k) => [
    {
      name: `${k} label: the generator (aliased network), with comments`,
      label: LABELS[k],
      compose: (d) => emdashCompose(d, { token: 'generator' }),
      expect: 'protected'
    },
    {
      name: `${k} label: the generator (aliased network), without comments`,
      label: LABELS[k],
      compose: (d) => emdashCompose(d, { token: 'generator', comments: false }),
      expect: 'protected'
    },
    {
      name: `${k} label: the pre-#155 generator (aliased network)`,
      label: LABELS[k],
      compose: (d) => emdashCompose(d),
      expect: 'none'
    }
  ]),
  {
    name: 'long label: the aliased generator with the local-dev dns line',
    label: LABELS.long,
    compose: (d) => emdashCompose(d, { token: 'generator', dns: '10.0.0.53, 10.0.0.54' }),
    expect: 'protected'
  },
  {
    name: 'long label: the pre-#165 shorthand the DNS migration patches from',
    label: LABELS.long,
    compose: (d) => emdashCompose(d, { token: 'generator', networks: 'shorthand' }),
    expect: 'protected'
  },
  {
    name: 'long label: the pre-#155, pre-#165 file',
    label: LABELS.long,
    compose: (d) => emdashCompose(d, { networks: 'shorthand' }),
    expect: 'none'
  },
  {
    name: 'long label: the token migration’s first place, aliased network',
    label: LABELS.long,
    compose: (d) => emdashCompose(d, { token: 'first' }),
    expect: 'protected'
  },
  {
    name: 'long label: the token migration’s last place, aliased network, no comments',
    label: LABELS.long,
    compose: (d) => emdashCompose(d, { token: 'last', comments: false }),
    expect: 'protected'
  },
  {
    name: 'long label: two token binds around an aliased network',
    label: LABELS.long,
    compose: (d) =>
      emdashCompose(d, { token: 'first' }).replace(
        '      - ./uploads:/app/uploads',
        `      - ./uploads:/app/uploads\n${TOKEN_BIND}`
      ),
    expect: 'unknown'
  },
  {
    name: 'a 57-character label: the generator keeps the shorthand',
    label: LABELS.fits,
    compose: (d) => emdashCompose(d, { token: 'generator' }),
    expect: 'protected'
  },
  {
    name: 'a 57-character label carrying an alias the generator never writes for it',
    label: LABELS.fits,
    compose: (d) => emdashCompose(d, { token: 'generator', networks: 'alias' }),
    expect: 'unknown'
  },
  {
    name: 'a short label carrying an alias',
    label: LABELS.short,
    compose: (d) => emdashCompose(d, { token: 'generator', networks: 'alias' }),
    expect: 'unknown'
  },
  ...ALIAS_REFUSALS.map(([name, make]) => ({
    name: `long label, protected form: ${name}`,
    label: LABELS.long,
    compose: make((d, o = {}) => emdashCompose(d, { token: 'generator', ...o })),
    expect: 'unknown'
  })),
  ...ALIAS_REFUSALS.map(([name, make]) => ({
    name: `long label, pre-#155 form: ${name}`,
    label: LABELS.long,
    compose: make((d, o = {}) => emdashCompose(d, o)),
    expect: 'unknown'
  })),
  // The site-mail run (#289), short and aliased-long labels.
  ...['short', 'long'].flatMap((k) => [
    {
      name: `${k} label: the generator with the mail run (render-compose.sh today)`,
      label: LABELS[k],
      compose: (d) => emdashCompose(d, { token: 'generator', mail: DEFAULT_MAIL_URL }),
      expect: 'protected'
    },
    {
      name: `${k} label: the generator with the mail run, no comments`,
      label: LABELS[k],
      compose: (d) => emdashCompose(d, { token: 'generator', mail: DEFAULT_MAIL_URL, comments: false }),
      expect: 'protected'
    },
    {
      name: `${k} label: the generator with a host's own mail URL and the dns line`,
      label: LABELS[k],
      compose: (d) => emdashCompose(d, { token: 'generator', mail: CONFIGURED_MAIL_URL, dns: '10.0.0.53' }),
      expect: 'protected'
    },
    {
      name: `${k} label: the mail run with no token bind (never written: not the pre-#155 file)`,
      label: LABELS[k],
      compose: (d) => emdashCompose(d, { mail: DEFAULT_MAIL_URL }),
      expect: 'unknown'
    },
    {
      name: `${k} label: the mail run with the bind in the migration's first place`,
      label: LABELS[k],
      compose: (d) => emdashCompose(d, { token: 'first', mail: DEFAULT_MAIL_URL }),
      expect: 'unknown'
    },
    {
      name: `${k} label: the mail run with the bind in the migration's last place`,
      label: LABELS[k],
      compose: (d) => emdashCompose(d, { token: 'last', mail: DEFAULT_MAIL_URL, comments: false }),
      expect: 'unknown'
    },
    {
      name: `${k} label: the mail run with two token binds`,
      label: LABELS[k],
      compose: (d) =>
        emdashCompose(d, { token: 'generator', mail: DEFAULT_MAIL_URL }).replace(
          '      - app:/app',
          `${TOKEN_BIND}\n      - app:/app`
        ),
      expect: 'unknown'
    },
    ...MAIL_REFUSALS.map(([name, make]) => ({
      name: `${k} label, protected form: ${name}`,
      label: LABELS[k],
      compose: make((d, o = {}) => emdashCompose(d, { token: 'generator', mail: DEFAULT_MAIL_URL, ...o })),
      expect: 'unknown'
    }))
  ]),
  // The resource-cap run (28/09/2026), short and aliased-long labels.
  ...['short', 'long'].flatMap((k) => {
    const capped = (d, o = {}) =>
      emdashCompose(d, { token: 'generator', mail: DEFAULT_MAIL_URL, limits: DEFAULT_LIMITS, ...o })
    return [
      {
        name: `${k} label: the generator with its caps (render-compose.sh today)`,
        label: LABELS[k],
        compose: capped,
        expect: 'protected'
      },
      {
        name: `${k} label: the generator with its caps, no comments`,
        label: LABELS[k],
        compose: (d) => capped(d, { comments: false }),
        expect: 'protected'
      },
      {
        name: `${k} label: a host's own caps, mail URL and dns line`,
        label: LABELS[k],
        compose: (d) => capped(d, { limits: HOST_LIMITS, mail: CONFIGURED_MAIL_URL, dns: '10.0.0.53' }),
        expect: 'protected'
      },
      {
        name: `${k} label: caps with no bind and no mail run (never written: not the pre-#155 file)`,
        label: LABELS[k],
        compose: (d) => emdashCompose(d, { limits: DEFAULT_LIMITS }),
        expect: 'unknown'
      },
      {
        name: `${k} label: caps and the mail run with no bind`,
        label: LABELS[k],
        compose: (d) => emdashCompose(d, { mail: DEFAULT_MAIL_URL, limits: DEFAULT_LIMITS }),
        expect: 'unknown'
      },
      {
        name: `${k} label: caps and the bind with no mail run`,
        label: LABELS[k],
        compose: (d) => emdashCompose(d, { token: 'generator', limits: DEFAULT_LIMITS }),
        expect: 'unknown'
      },
      {
        name: `${k} label: caps with the bind in the migration's first place`,
        label: LABELS[k],
        compose: (d) => capped(d, { token: 'first' }),
        expect: 'unknown'
      },
      {
        name: `${k} label: caps with the bind in the migration's last place`,
        label: LABELS[k],
        compose: (d) => capped(d, { token: 'last', comments: false }),
        expect: 'unknown'
      },
      {
        name: `${k} label: the cap run moved above ports`,
        label: LABELS[k],
        compose: (d) => runMoved(capped(d), DEFAULT_LIMITS.emdash),
        expect: 'unknown'
      },
      ...LIMITS_REFUSALS.map(([name, edit]) => ({
        name: `${k} label, capped protected form: ${name}`,
        label: LABELS[k],
        compose: (d) => runWith(capped(d), DEFAULT_LIMITS.emdash, edit),
        expect: 'unknown'
      }))
    ]
  })
]

/**
 * The PHP proof for labelled site directories, beside a pre-06/09 `.env` (no `PLATFORM=` line), so
 * the compose alone decides: `siteShape` and `site_shape` must both give `expect` for
 * `<tmp>/<label>`.
 * @type {Array<{name: string, label: string, arrange: (siteDir: string) => void, expect: 'other'|'unknown'}>}
 */
export const LABELLED_SITE_SHAPE_CASES = ['clone', 'joomla', 'wordpress'].flatMap((flavor) => {
  const opts = flavor === 'joomla' ? { flavor, extensions: 'https://example.com/cowork.zip' } : { flavor }
  const make = (d, o = {}) => phpCompose(d, { ...opts, ...o })
  const row = (name, label, compose, expect) => ({
    name: `${flavor}, ${name}`,
    label,
    arrange: (d) => {
      put(d, '.env', OLD_ENV)
      put(d, 'docker-compose.yml', compose(d))
    },
    expect
  })
  return [
    row('58-character label: the generator (aliased network)', LABELS.over, make, 'other'),
    row('long label: the generator (aliased network)', LABELS.long, make, 'other'),
    row(
      'long label: the generator with the local-dev dns line',
      LABELS.long,
      (d) => make(d, { dns: '10.0.0.53' }),
      'other'
    ),
    row('long label, no comments', LABELS.long, (d) => make(d, { comments: false }), 'other'),
    row(
      'long label: the pre-#165 shorthand',
      LABELS.long,
      (d) => make(d, { networks: 'shorthand' }),
      'other'
    ),
    row('57-character label: the generator keeps the shorthand', LABELS.fits, make, 'other'),
    row(
      '57-character label carrying an alias',
      LABELS.fits,
      (d) => make(d, { networks: 'alias' }),
      'unknown'
    ),
    row('short label carrying an alias', LABELS.short, (d) => make(d, { networks: 'alias' }), 'unknown'),
    ...ALIAS_REFUSALS.map(([name, refuse]) =>
      row(`long label: ${name}`, LABELS.long, refuse(make), 'unknown')
    ),
    // The site-mail run (#289), short and aliased-long labels.
    ...['short', 'long'].flatMap((k) => {
      const mailed = (d, o = {}) => make(d, { mail: DEFAULT_MAIL_URL, ...o })
      return [
        row(`${k} label: the generator with the mail run`, LABELS[k], mailed, 'other'),
        row(
          `${k} label: the mail run, no comments`,
          LABELS[k],
          (d) => mailed(d, { comments: false }),
          'other'
        ),
        row(
          `${k} label: a host's own mail URL and the dns line`,
          LABELS[k],
          (d) => mailed(d, { mail: CONFIGURED_MAIL_URL, dns: '10.0.0.53' }),
          'other'
        ),
        ...(flavor === 'clone'
          ? [
              row(
                `${k} label: the mail run without its environment line`,
                LABELS[k],
                (d) => {
                  const text = mailed(d, { comments: false })
                  const from = '    entrypoint: ["apache2-foreground"]\n    environment:\n'
                  if (!text.includes(from))
                    throw new Error('fixture: the clone mail run has no environment line')
                  return text.replace(from, '    entrypoint: ["apache2-foreground"]\n')
                },
                'unknown'
              ),
              row(
                `${k} label: an environment line with no mail run`,
                LABELS[k],
                (d) =>
                  linesWith(
                    linesWith(
                      linesWith(mailed(d, { comments: false }), mailUrlLine(), []),
                      mailLabelLine(d),
                      []
                    ),
                    MAIL_TOKEN_LINE,
                    []
                  ),
                'unknown'
              )
            ]
          : [
              row(
                `${k} label: the mail run under a second environment line`,
                LABELS[k],
                (d) =>
                  linesWith(mailed(d, { comments: false }), mailUrlLine(), [
                    '    environment:',
                    mailUrlLine()
                  ]),
                'unknown'
              )
            ]),
        ...MAIL_REFUSALS.map(([name, refuse]) =>
          row(`${k} label: ${name}`, LABELS[k], refuse(mailed), 'unknown')
        )
      ]
    }),
    // The resource-cap runs (28/09/2026), short and aliased-long labels.
    ...['short', 'long'].flatMap((k) => {
      const capped = (d, o = {}) => make(d, { mail: DEFAULT_MAIL_URL, limits: DEFAULT_LIMITS, ...o })
      const dropRun = (memory) => (d) => runWith(capped(d), memory, () => [])
      return [
        row(`${k} label: the generator with its caps`, LABELS[k], capped, 'other'),
        row(`${k} label: the caps, no comments`, LABELS[k], (d) => capped(d, { comments: false }), 'other'),
        row(
          `${k} label: a host's own caps, mail URL and dns line`,
          LABELS[k],
          (d) => capped(d, { limits: HOST_LIMITS, mail: CONFIGURED_MAIL_URL, dns: '10.0.0.53' }),
          'other'
        ),
        row(
          `${k} label: caps with no mail run (never written)`,
          LABELS[k],
          (d) => make(d, { limits: DEFAULT_LIMITS }),
          'unknown'
        ),
        row(`${k} label: caps on the web service only`, LABELS[k], dropRun(DEFAULT_LIMITS.db), 'unknown'),
        row(`${k} label: caps on the database only`, LABELS[k], dropRun(DEFAULT_LIMITS.web), 'unknown'),
        row(
          `${k} label: the web cap run moved above ports`,
          LABELS[k],
          (d) => runMoved(capped(d), DEFAULT_LIMITS.web),
          'unknown'
        ),
        ...LIMITS_REFUSALS.map(([name, edit]) =>
          row(
            `${k} label, web caps: ${name}`,
            LABELS[k],
            (d) => runWith(capped(d), DEFAULT_LIMITS.web, edit),
            'unknown'
          )
        ),
        ...LIMITS_REFUSALS.filter(([name]) =>
          [
            'the memswap line missing',
            'a memory cap in bytes',
            'no process cap (-1)',
            'the run twice'
          ].includes(name)
        ).map(([name, edit]) =>
          row(
            `${k} label, database caps: ${name}`,
            LABELS[k],
            (d) => runWith(capped(d), DEFAULT_LIMITS.db, edit),
            'unknown'
          )
        )
      ]
    })
  ]
})
