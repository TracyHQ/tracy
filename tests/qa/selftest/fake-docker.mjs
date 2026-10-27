// In-memory stand-in for tests/qa/lib/docker.mjs with the same methods. Counts every call so
// tests can prove a dry run touched nothing.
export class FakeDocker {
  constructor() {
    this.containers = new Map()
    this.volumes = new Map()
    this.networks = new Map()
    this.calls = []
    this.nextId = 1
    this.unavailable = false
    this.composeFails = false
    this.composeCrashes = false
    this.failingProbes = new Set()
    this.timedOutProbes = new Set()
    this.hooks = {}
    this.image = 'sha256:image-1'
  }

  table(kind) {
    return { container: this.containers, volume: this.volumes, network: this.networks }[kind]
  }

  add(kind, name, project, extra = {}) {
    this.table(kind).set(name, {
      id: kind === 'volume' ? `${name}@t${this.nextId++}` : `id-${this.nextId++}`,
      project,
      image: this.image,
      ...extra
    })
  }

  async available() {
    this.calls.push('available')
    return this.unavailable ? { ok: false, detail: 'cannot connect to the Docker daemon' } : { ok: true }
  }

  async composeUp({ project }) {
    this.calls.push(`composeUp ${project}`)
    if (this.composeGate) await this.composeGate
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (this.composeCrashes) throw new Error('process killed during compose up')
    const names = ['postgres-1', 'tracy-web-1', 'minio-1', 'tracy-host-1', 'dns-1', 'minio-init-1'].map(
      (n) => `${project}-${n}`
    )
    for (const n of [...names, `${project}-docker-proxy`, `${project}-dsh`]) this.add('container', n, project)
    for (const n of ['default', 'docker-api', 'egress', 'tracy'])
      this.add('network', `${project}_${n}`, project)
    for (const n of ['tracy-pg', 'tracy-minio', 'tracy-host-jobs'])
      this.add('volume', `${project}_${n}`, project)
    return this.composeFails
      ? { ok: false, detail: 'pull access denied for tracy/dsh' }
      : { ok: true, detail: '' }
  }

  async list(kind, project) {
    this.calls.push(`list ${kind}`)
    return [...this.table(kind)].filter(([, v]) => v.project === project).map(([name]) => name)
  }

  async listByPrefix(kind, prefix) {
    this.calls.push(`listByPrefix ${kind}`)
    return [...this.table(kind).keys()].filter((n) => n.startsWith(prefix))
  }

  async inspect(kind, name) {
    this.calls.push(`inspect ${kind} ${name}`)
    this.hooks.beforeInspect?.(kind, name, this)
    const found = this.table(kind).get(name) ?? [...this.table(kind).values()].find((v) => v.id === name)
    return found ? { id: found.id, project: found.project, image: found.image } : null
  }

  async remove(kind, ref) {
    this.calls.push(`remove ${kind} ${ref}`)
    const table = this.table(kind)
    const key = [...table].find(([name, v]) => name === ref || v.id === ref)?.[0]
    if (!key) return { ok: false, detail: 'no such resource' }
    table.delete(key)
    return { ok: true, detail: '' }
  }

  async exec(container, argv) {
    this.calls.push(`exec ${container}`)
    if (!this.containers.has(container))
      return { ok: false, detail: `no such container ${container}`, timedOut: false }
    const script = argv.at(-1)
    for (const needle of this.timedOutProbes)
      if (script.includes(needle)) return { ok: false, detail: '', timedOut: true }
    for (const needle of this.failingProbes)
      if (script.includes(needle)) return { ok: false, detail: 'connection refused', timedOut: false }
    return { ok: true, detail: '', timedOut: false }
  }

  names() {
    return {
      containers: [...this.containers.keys()],
      volumes: [...this.volumes.keys()],
      networks: [...this.networks.keys()]
    }
  }
}
