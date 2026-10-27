/**
 * `/ops/servers` — which machine does what.
 *
 * WHY IT IS ITS OWN SCREEN AND NOT A SETTINGS PANEL. It is a table, the others are forms; and the
 * one fact it carries is the one most worth being able to look up quickly: where a new customer
 * site gets built. Today that is decided by the FIRST name in a comma-separated `HOSTS` string
 * (`config.js`), and until this screen nothing anywhere said which machine that was.
 *
 * 🔒 THREE THINGS THE TABLE MUST NOT IMPLY, all of them stated on screen:
 *   1. Changing a role would move NEW sites only — the sites already running stay where they are
 *      (each carries its own `site.host`).
 *   2. A machine that is not answering must not be given a role; a provision job would die on the
 *      customer's own build. Layer A cannot grant roles anyway, but the column exists so the rule
 *      is visible before the write door exists.
 *   3. A `record` target takes NO role, ever — Tracy does not install onto it. Its row shows
 *      dashes, never empty checkboxes, because an empty box reads as "not switched on yet".
 */
import { Badge, Card, Skeleton, cn } from '@tracy/ui'
import { Circle, CircleDot, Minus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useT } from '../i18n'
import { type ServerRole, type Servers as ServersPayload, fetchServers } from './api'

const ROLE_ORDER: ServerRole[] = ['newSites', 'demo', 'onboarding', 'landing']

/** Held · not held · does not apply — three marks, because there are three states. */
function RoleCell({ roles, role }: { roles: ServerRole[] | null; role: ServerRole }) {
  const t = useT()
  if (roles === null)
    return (
      <span className="text-muted-foreground" title={t('settings.servers.notApplicable')}>
        <Minus className="size-3.5" />
      </span>
    )
  return roles.includes(role) ? (
    <CircleDot className="size-4 text-primary" aria-label={t('settings.servers.held')} />
  ) : (
    <Circle className="size-4 text-muted-foreground/40" aria-label={t('settings.servers.notHeld')} />
  )
}

export function Servers() {
  const t = useT()
  const [data, setData] = useState<ServersPayload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    fetchServers(ac.signal).then((body) => {
      if (ac.signal.aborted) return
      setData(body)
      setFailed(body === null)
    })
    return () => ac.abort()
  }, [])

  return (
    <div className="mx-auto min-w-0 max-w-5xl px-8 py-7">
      <h1 className="font-semibold text-xl tracking-tight">{t('settings.servers.title')}</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        {t('settings.servers.blurb')} {data?.note ?? t('settings.servers.noteDefault')}
      </p>

      {failed ? (
        <p className="mt-6 text-muted-foreground text-sm">{t('settings.servers.readFailed')}</p>
      ) : !data ? (
        <Skeleton className="mt-6 h-40 w-full" />
      ) : (
        <Card className="mt-5 gap-0 overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs">
                  {t('settings.servers.server')}
                </th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-xs">
                  {t('settings.servers.address')}
                </th>
                {ROLE_ORDER.map((role) => (
                  <th key={role} className="px-3 py-2.5 font-medium text-muted-foreground text-xs">
                    {t(`settings.servers.role.${role}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.servers.map((server) => (
                <tr key={server.name} className="border-border border-b last:border-0">
                  <td className="px-4 py-3 align-top">
                    <span className="font-medium">{server.name}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {server.colocated ? (
                        <Badge variant="secondary" className="text-[11px]">
                          {t('settings.servers.colocated')}
                        </Badge>
                      ) : null}
                      {server.kind === 'record' ? (
                        <Badge variant="outline" className="text-[11px]">
                          {t('settings.servers.recordOnly')}
                        </Badge>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="break-all font-mono text-[13px]">{server.origin}</span>
                    {server.kind === 'record' ? (
                      <p className="mt-1 text-muted-foreground text-xs">{t('settings.servers.recordNote')}</p>
                    ) : null}
                  </td>
                  {ROLE_ORDER.map((role) => (
                    <td key={role} className={cn('px-3 py-3 align-top')}>
                      <RoleCell roles={server.roles} role={role} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/*
        Said in full, under the table, rather than as a tooltip somebody has to find: the one
        misreading that would cost real work is "I moved the role, so the sites moved".
      */}
      <p className="mt-4 text-muted-foreground text-xs">{t('settings.servers.footer')}</p>
    </div>
  )
}
