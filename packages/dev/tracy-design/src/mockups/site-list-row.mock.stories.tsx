/**
 * THROWAWAY MOCK — the row in "Your sites". Not shipped code.
 *
 * THE QUESTION IT EXISTS TO ANSWER: `Home.tsx` builds that row out of `Card` + `CardContent`,
 * which was the only shape `@tracy/ui` had. The base-nova port on 03/09 brought `Item`, which is
 * exactly this shape — media, title, description, actions — with three sizes and three variants.
 * So: does the list move to `Item`, and at which density?
 *
 * WHAT DECIDES IT, and it is not taste: this list is the first screen a seat holder lands on, and
 * the number of rows it holds is the number of sites a person can see without scrolling. Four
 * rows of `Card` fill the same height as seven rows of `Item size="sm"`. Anyone with more than
 * five sites is scrolling on the current shape.
 *
 * WHAT IS NOT BEING ASKED HERE: the words. `Owner`/`Editor`/`Viewer` come from
 * `docs/references/vocabulary.md` and are not open for redesign in a mockup.
 *
 * ⚠ THIS IS MODE A — Tailwind, Tracy owns `<html>`. The real screen is a dsh plugin, MODE B,
 * plain CSS with `tv-` prefixes. Whichever row wins has to be REWRITTEN, not copied, and the
 * rewrite is what gets reviewed. `DESIGN.md` §0.
 */
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  PlatformGlyph
} from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { sites } from '../fixtures'

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer'
}

const meta: Meta = {
  title: 'Mockups/Site list row',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

function Frame({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        <h1 className="font-semibold text-lg tracking-tight">{title}</h1>
        <p className="mt-1 text-muted-foreground text-sm">{note}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

/** What ships today: one `Card` per site. Here so the two are argued side by side, not from memory. */
export const TodayCard: Story = {
  render: () => (
    <Frame title="Your sites" note="Today — one Card per site. Four rows fill the fold.">
      <div className="flex flex-col gap-3">
        {sites.map((site) => (
          <Card key={site.key} className="transition-colors hover:ring-primary/50">
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <PlatformGlyph platform={site.platform} className="size-8 text-xs" />
                <div className="min-w-0">
                  <CardTitle className="truncate">{site.name}</CardTitle>
                  <CardDescription className="truncate">Working on this site</CardDescription>
                </div>
              </div>
              <div className="flex flex-none items-center gap-2">
                <Badge variant={site.role === 'owner' ? 'default' : 'outline'}>{ROLE_LABEL[site.role]}</Badge>
                <Button size="sm">Open</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Frame>
  )
}

/** The same list on `Item`, default density — one bordered group instead of N floating cards. */
export const ProposedItem: Story = {
  render: () => (
    <Frame
      title="Your sites"
      note="Proposed — one Item group. The rows share a border instead of each carrying one."
    >
      <ItemGroup className="rounded-lg border">
        {sites.map((site, i) => (
          <div key={site.key}>
            <Item render={<button type="button" className="w-full text-left" />}>
              <ItemMedia>
                <PlatformGlyph platform={site.platform} className="size-8 text-xs" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{site.name}</ItemTitle>
                <ItemDescription>Working on this site</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Badge variant={site.role === 'owner' ? 'default' : 'outline'}>{ROLE_LABEL[site.role]}</Badge>
              </ItemActions>
            </Item>
            {i < sites.length - 1 ? <ItemSeparator /> : null}
          </div>
        ))}
      </ItemGroup>
    </Frame>
  )
}

/**
 * `size="sm"` — the density the question is really about. Count the rows above the fold against
 * `TodayCard` at the same viewport before choosing.
 */
export const ProposedItemDense: Story = {
  render: () => (
    <Frame title="Your sites" note="Proposed, dense — size='sm'. This is the one to count rows on.">
      <ItemGroup className="rounded-lg border">
        {[...sites, ...sites].map((site, i, all) => (
          <div key={`${site.key}-${i}`}>
            <Item size="sm" render={<button type="button" className="w-full text-left" />}>
              <ItemMedia>
                <PlatformGlyph platform={site.platform} className="size-6 text-[10px]" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{site.name}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <Badge variant="outline">{ROLE_LABEL[site.role]}</Badge>
              </ItemActions>
            </Item>
            {i < all.length - 1 ? <ItemSeparator /> : null}
          </div>
        ))}
      </ItemGroup>
    </Frame>
  )
}
