/**
 * The picture card at the tail of the turn that built the site (todo-build-with-experience.md
 * §D2, Lee's point 3): the page the shot stage photographed, in a laptop frame, with "Created
 * <site>", Open site and a way back to the Build tab. When the shot stage had no browser the frame
 * shows the inspiration's page with the words in — never nothing.
 */
import { Button, Card, CardContent, cn } from '@tracy/ui'
import { Check, ChevronRight, ExternalLink } from 'lucide-react'
import { type JSX, useEffect, useState } from 'react'

import { type BuildApi, fetchSite, type Job, type SitePreview } from './api'
import type { Built } from './built'
import type { Translate } from './strings'

export function BuiltRow({
  api,
  built,
  openBuild,
  t
}: {
  api: BuildApi
  built: Built
  openBuild: (() => void) | null
  t: Translate
}): JSX.Element {
  const [job, setJob] = useState<Job | null>(null)
  const [site, setSite] = useState<SitePreview | null>(null)
  useEffect(() => {
    api
      .fetchJob()
      .then(setJob)
      .catch(() => undefined)
    fetchSite()
      .then(setSite)
      .catch(() => undefined)
  }, [api])
  const siteUrl = typeof site?.site.url === 'string' ? site.site.url : ''
  const host = siteUrl ? siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : ''
  const caption = built.rerun ? t('card.updated', { site: host }) : t('card.created', { site: host })
  return (
    <div className="tracy-site-build my-3 text-foreground text-sm">
      <Card className="gap-0 overflow-hidden py-0">
        <div className="bg-muted/40 p-3">
          <div className="mx-auto w-[88%] overflow-hidden rounded-t-md border border-border border-b-0 bg-card">
            <div className={cn('relative h-[150px] overflow-hidden', !built.picture && 'bg-muted')}>
              {built.picture && job ? (
                <img src={api.shotUrl(job)} alt={caption} className="absolute top-0 left-0 w-full" />
              ) : null}
            </div>
          </div>
          <div className="mx-auto h-1.5 w-[96%] rounded-b-md bg-border" />
        </div>
        <CardContent className="flex items-center gap-3 px-4 py-3">
          <Check size={14} className="text-primary" />
          <span className="min-w-0 truncate">{caption}</span>
          {siteUrl ? (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              render={<a href={siteUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink size={14} /> {t('card.open')}
            </Button>
          ) : null}
          {openBuild ? (
            <Button size="sm" variant="ghost" className={siteUrl ? '' : 'ml-auto'} onClick={openBuild}>
              {t('card.buildTab')} <ChevronRight size={14} />
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
