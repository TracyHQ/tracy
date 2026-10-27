/** Host inventory uses the signed host channel; an unavailable host remains a visible row. */
export async function hostAgents({ config, host, fetchImpl }) {
  const hosts = await Promise.all(
    [...config.hosts.keys()].map(async (name) => {
      const dark = (error) => ({
        host: name,
        ok: false,
        image: null,
        container: null,
        packages: [],
        note: null,
        error
      })
      if (!host) return dark('Host channel is not configured')
      try {
        const answer = await host.hostCall(config, name, '/dsh-versions', {}, { fetchImpl })
        if (!answer.ok || !answer.body?.container || !Array.isArray(answer.body.packages))
          return dark(`Host inventory unavailable (${answer.status})`)
        return {
          host: name,
          ok: true,
          image: answer.body.image ?? null,
          container: answer.body.container,
          packages: answer.body.packages,
          note: answer.body.error ?? null,
          error: null
        }
      } catch {
        return dark('Host inventory could not be reached')
      }
    })
  )
  const live = hosts.filter((row) => row.ok)
  const names = new Set(live.flatMap((row) => row.packages.map((pkg) => pkg.name)))
  const drift = {}
  for (const name of [...names].sort()) {
    const versions = Object.fromEntries(
      live.map((row) => [row.host, row.packages.find((pkg) => pkg.name === name)?.version ?? null])
    )
    if (new Set(Object.values(versions)).size > 1) drift[name] = versions
  }
  return { hosts, drift, error: null, measuredAt: new Date().toISOString() }
}
