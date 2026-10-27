# `src/mockups/` — drawings of screens that HAVE NO CODE YET

This folder holds **throwaway mockups**: a story that builds a screen not yet coded, from
existing components, to answer **one design question** before someone writes the real code.

It fills the gap that `docs/references/ui-workflow.md` step 1 leaves. The rule there — *"bring the code into
the design bench, do NOT redraw it"* — holds for screens that **already have code**, and must stay: redrawing a
running screen creates a second version, and the two will drift. But a screen **with no code** has nothing to
bring over, and before today there was no place in the repo to draw it.

The convention is copied from `tracy-desk/packages/ui/stories/components/composites/*-mock.stories.tsx`, where
this approach has been used for real.

## Four rules

1. **The file name ends in `.mock.stories.tsx`, the `title` starts with `Mockups/`.**
   Two markers, not one, because they serve two different people: the file suffix for whoever opens the
   folder, the `title` prefix for whoever looks at Storybook's left-hand tree. The reviewer must know they
   are looking at a proposal, not something running — mixing those up means reviewing the wrong product.

2. **The first lines of the file state the QUESTION it exists to answer.** Not a description of what it draws — that is
   visible. A mockup with no question has no point at which it is done, and it stays forever.

3. **Build only with `@tracy/ui`.** No new components, no custom CSS. A mockup is there to answer
   *"which shape is right"*, not *"how nice can it be drawn"* — and a mockup that uses something not
   in the kit is a mockup that cannot be ported to real code.

4. **DELETE it when done.** Once the question is answered and the real code is written, this file goes. It is a
   draft, not documentation. A mockup still lying around after the screen runs for real is a second version of
   the same screen — exactly what the step 1 rule forbids.

## Which way to go when porting to real code

A mockup lives in **mode A** (Tracy owns `<html>`, Tailwind available). The product surface is **mode B**
(a plugin in the dsh page, plain `tv-*` CSS). So the last step **is not a copy** —
`DESIGN.md` §0 and `ui-workflow.md` step 4 hold that rule, and the reviewer must look again at **the
ported version**, not the one here.
