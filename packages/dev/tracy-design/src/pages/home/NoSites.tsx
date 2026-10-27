import { Badge, Button, Card, CardContent, Separator } from '@tracy/ui'
import { Globe, Import, Plus } from 'lucide-react'

/**
 * What a signed-in person sees at `cowork.tracy.ai/` when they hold no seat on any site.
 *
 * Today that request ends at a 403 carrying one line of plain text — measured 02/09 with a real
 * account. It is not a bug in the router: every Tracy surface is a dsh lane, and the door to a lane
 * is a seat on the site that lane serves, so somebody with no site is entitled to no lane. This
 * page is the answer that needs no lane at all: `cowork-web` renders it itself.
 *
 * ⚠ THIS ONE GETS HAND-PORTED INTO A WORKER, so it is deliberately plainer than the rest of the
 * bench. A Worker page cannot load `tokens.css` (`docs/references/worker-tokens.md`) and has no
 * build step — every component here has to survive being rewritten as one `<style>` block and a
 * handful of tags. Anything that needs a popover, a portal, or client state does not belong here.
 *
 * The two branch names are `docs/references/vocabulary.md` §2 verbatim: `Create a new site` and
 * `Import existing site`. There is no third name for either, and "New site" is not a synonym.
 */

export type Invitation = {
  site: string
  role: string
  from: string
}

export type NoSitesProps = {
  email?: string
  /**
   * Somebody holding a pending invitation is NOT the empty case, even though they hold no seat
   * yet: the seat is already in the book, waiting to be accepted. Sending them to Add site would
   * tell them to build the very thing they were invited to.
   */
  invitations?: Invitation[]
  /** Just pressed create: the page is no longer empty, it is waiting for a lane to be built. */
  building?: string | null
}

export function NoSites({
  email = 'samfounder@example.com',
  invitations = [],
  building = null
}: NoSitesProps = {}) {
  return (
    <div className="flex h-full items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="flex flex-col gap-5 py-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Globe className="size-6" aria-hidden="true" />
              </span>
              <div>
                <h1 className="font-semibold text-base tracking-tight">
                  {building ? 'Building your site' : 'You have no sites yet'}
                </h1>
                <p className="mt-1 text-muted-foreground text-sm">
                  {building
                    ? `${building} is being built. Its agent is usually ready a minute later.`
                    : 'Tracy works on one website at a time. Add the first one and its agent is ready a minute later.'}
                </p>
              </div>
            </div>

            {building ? (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Building your site"
              >
                <div className="h-full w-1/3 rounded-full bg-primary" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button className="w-full justify-start gap-2">
                  <Plus className="size-4" aria-hidden="true" />
                  Create a new site
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Import className="size-4" aria-hidden="true" />
                  Import existing site
                </Button>
              </div>
            )}

            {invitations.length > 0 && !building && (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <p className="font-medium text-sm">Waiting for you</p>
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.site}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">{invitation.site}</p>
                        <p className="text-muted-foreground text-xs">
                          {invitation.from} invited you as <Badge variant="outline">{invitation.role}</Badge>
                        </p>
                      </div>
                      <Button size="sm" variant="outline">
                        Join team
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-muted-foreground text-xs">
          Signed in as {email} —{' '}
          <button type="button" className="underline">
            Sign out
          </button>
        </p>
      </div>
    </div>
  )
}
