/**
 * THROWAWAY MOCK — the motion plugin's gallery tab, drawn before the plugin exists. Not shipped code.
 *
 * THE QUESTION IT EXISTS TO ANSWER: how big is a card, how many fit across a row, and what does a
 * card carry? v1 ships two effects in two slots, so the grid is drawn with exactly that content —
 * a group per slot, one card in each — rather than with invented filler that would flatter the
 * layout. The columns auto-fill from 260px, the width the sibling design-inspiration grid already
 * uses; resize the window to the width the side card really gets and the row count answers itself.
 *
 * WHAT DECIDES IT: a card's job is to make one effect choosable at a glance. The demo cell is a
 * 1280x900 document scaled down by the card, so the cell's shape fixes the card's height before a
 * word of text is added — everything else is what fits underneath it. The candidate answer drawn
 * here is the smallest one worth arguing with: cell, name, one sentence of what the visitor sees.
 * If a card needs to carry more than that, this is the drawing to say so on.
 *
 * WHAT IS NOT BEING ASKED HERE, AND CANNOT BE: whether the demo reads well while it plays. A
 * mockup built from existing blocks cannot run the motion library — it needs its own document —
 * so every cell here is a static placeholder and the running effect is reviewed later, on the
 * real-screen story. Absent by decision, not by omission: no filter (two slots do not need one),
 * no replay button, and no subtle/bold switch (that lives in the preview dialog, not on the grid).
 *
 * ⚠ THIS IS MODE A — Tailwind, Tracy owns <html>. The real gallery is a desk plugin, MODE B, plain
 * CSS with `tv-` prefixes. Whatever wins here is REWRITTEN there, not copied, and the rewrite is
 * what gets reviewed. `DESIGN.md` §0.
 */

import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, CardDescription, CardHeader, CardTitle } from '@tracy/ui'

const meta: Meta = {
  title: 'Mockups/Motion gallery',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

type Effect = { name: string; blurb: string }
type Group = { label: string; effects: Effect[] }

/** The v1 catalogue, whole: two slots, one effect each. Group headings are the slots' labels. */
const GROUPS: Group[] = [
  {
    label: 'Hero entrance',
    effects: [
      {
        name: 'Hero stagger',
        blurb: "On load, the hero's units appear one after another in document order, not all at once."
      }
    ]
  },
  {
    label: 'Section reveal',
    effects: [
      {
        name: 'Fade up',
        blurb: 'As a section below the hero scrolls into view, its units rise slightly and fade in, once.'
      }
    ]
  }
]

/** Stands in for the scaled demo document. Its ratio is the real one: 1280x900. */
function DemoCell() {
  return (
    <div className="flex aspect-[1280/900] items-center justify-center border-b bg-muted">
      <span className="text-muted-foreground text-xs">demo cell — static in a mockup</span>
    </div>
  )
}

export const Grid: Story = {
  render: () => (
    <div className="h-full overflow-auto bg-background">
      <div className="flex flex-col gap-8 px-6 py-8">
        <p className="text-muted-foreground text-sm">
          Mock — resize the window to the width the gallery side card really gets; that width, not this page,
          decides how many cards sit in a row.
        </p>
        {GROUPS.map((group) => (
          <section key={group.label} className="flex flex-col gap-3">
            <h2 className="font-semibold text-sm tracking-tight">{group.label}</h2>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {group.effects.map((effect) => (
                <Card key={effect.name} className="py-0">
                  <DemoCell />
                  <CardHeader className="pb-4">
                    <CardTitle className="text-sm">{effect.name}</CardTitle>
                    <CardDescription>{effect.blurb}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
