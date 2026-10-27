/**
 * THROWAWAY MOCK — the screens Tracy would administer build configuration from. Not shipped code.
 *
 * THE DESIGN QUESTION IT EXISTS TO ANSWER: can the team see the configuration, the gaps in it, and
 * the reason a build is blocked — all from the same place, for Joomla, WordPress and EmDash at
 * once?
 *
 * Today those three answers live in eight files nobody reads together: a provision JSON on the
 * fleet, a capability catalogue in the Joomla build plugin, three contract files, a mode matrix,
 * twelve generated presets, a form component, and two stage modules with different stage names.
 * Somebody asking "why can this customer not have Airbnb" has to open five of them. The bet these
 * seven screens make is that one overview plus six detail screens answers it.
 *
 * TWO SHAPES WERE DECIDED BY LEE ON 12/09, AGAINST THE FIRST DRAFT, AND BOTH ARE WORTH KNOWING:
 *
 *   - The overview's unit is the CMS, not the configuration area. People arrive holding a CMS, so
 *     the CMS is the panel heading and the seven areas are what you read down inside it.
 *   - There is NO SHARED CHAIN over the build stages. The first draft laid a proposed eight-step
 *     flow across both CMS; it implied a model the code does not have, so it is gone. Each CMS
 *     shows its own six stages from its own `stages.mjs`, and EmDash shows an empty state because
 *     it has no such file at all.
 *
 * THREE THINGS THE DRAWING IS DELIBERATELY STRICT ABOUT, because they are the ways a screen like
 * this usually lies:
 *
 *   1. `In repo`, `Packaged` and `Running` are three columns, never one tick. `Dev` here shows a
 *      base that is right on the branch and old on the host, which is the shape of a real incident
 *      and invisible under a single green dot.
 *   2. `Not verified` is never rendered as `Missing configuration`. Nobody looked and nobody wrote
 *      it are opposite repairs.
 *   3. Nothing is saved, deployed or applied. Every control either does something in local state
 *      or is disabled with the reason on it.
 *
 * WHAT IS REAL AND WHAT IS NOT. The preset screen imports `roles`, `platforms`, `resolve`,
 * `presetYaml` and `RowList` from `@tracy/harness-web`, so its rows, counts and YAML are the
 * product's own. Everything else is hand-copied fixture from commit `d0da35c55` on 12/09/2026, and
 * every panel carries a tag saying whether a value was surveyed, is only planned, or was invented.
 *
 * ⚠ MODE A — Tailwind, Tracy owns `<html>`. If these screens become real they land at `/ops`,
 * which serves the `@tracy/harness-web` SPA and is also mode A, so this is the rare mockup that
 * would port rather than be rewritten. The dsh-side rules in `DESIGN.md` §0 do not apply here.
 *
 * ⚠ DELETE WHEN THE REAL SCREENS EXIST.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, screen, waitFor } from 'storybook/test'

import { OpsApp } from './ops-build-config/app'
import { SiteQuestions } from './ops-build-config/site-questions'
import { Catalog } from './ops-build-config/catalog'
import { Contracts } from './ops-build-config/contracts'
import { Flow } from './ops-build-config/flow'
import { Overview } from './ops-build-config/overview'
import { Presets } from './ops-build-config/presets'
import { States } from './ops-build-config/states'
import { Tools } from './ops-build-config/tools'
import type { ScreenId } from './ops-build-config/fixtures'

function renderScreen(id: ScreenId) {
  switch (id) {
    case 'overview':
      return <Overview />
    case 'flow':
      return <Flow />
    case 'catalog':
      return <Catalog />
    case 'presets':
      return <Presets />
    case 'tools':
      return <Tools />
    case 'brief':
      return <SiteQuestions />
    case 'contracts':
      return <Contracts />
  }
}

const meta = {
  title: 'Mockups/Ops build configuration',
  component: OpsApp,
  parameters: { layout: 'fullscreen' },
  args: { render: renderScreen }
} satisfies Meta<typeof OpsApp>

export default meta
type Story = StoryObj<typeof meta>

/** M01 — one panel per CMS, seven configuration rows inside each, empty panels drawn in full. */
export const M01Overview: Story = {
  args: { screen: 'overview' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Website builds' })).toBeVisible()
    // The banner is part of the frame, so it survives a screenshot of any screen.
    await expect(canvas.getByText('Mock data · UI preview')).toBeVisible()

    // Three panels, one per CMS, each with its own readiness count — the short version of the
    // comparison the old area-first layout did with columns.
    for (const cms of ['Joomla', 'WordPress', 'EmDash']) {
      await expect(canvas.getByRole('heading', { name: cms })).toBeVisible()
    }
    // EmDash is ready on exactly one of the seven — its presets — and the count says so out loud.
    await expect(canvas.getByText('1 of 7 ready')).toBeVisible()
    await expect(canvas.getAllByText('5 of 7 ready')).toHaveLength(2)

    // A blocked row names the rule and the steps, never a percentage.
    await expect(canvas.getByText(/1 of 152 design systems has a template/)).toBeVisible()
    await expect(canvas.getByText('Release the Airbnb contract profile')).toBeVisible()
  }
}

/** M02 — Joomla's own six stages, with the real refusal sentences on them. */
export const M02BuildStages: Story = {
  args: { screen: 'flow' },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('heading', { name: 'Build stages' })).toBeVisible()
    await expect(canvas.getByText('check · template · style · copy · seed · shot')).toBeVisible()

    // `check` is where 151 of 152 designs stop, and the stage says the sentence verbatim.
    await expect(
      canvas.getByText('This design does not yet have a released quickstart content/display contract.')
    ).toBeVisible()

    // `template` installs no template — the sentence it answers with says so itself.
    await userEvent.click(canvas.getByRole('button', { name: /Joomla stage 2 template/ }))
    await expect(canvas.getByText('The original quickstart template is preserved.')).toBeVisible()
  }
}

/** M02 again — the other CMS is a DIFFERENT diagram, not a variant of the first. */
export const StagesDifferPerCms: Story = {
  args: { screen: 'flow' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'WordPress' }))
    await expect(canvas.getByText('check · theme · style · copy · seed · shot')).toBeVisible()

    // Position two is a different stage doing different work, and it is named differently.
    await userEvent.click(canvas.getByRole('button', { name: /WordPress stage 2 theme/ }))
    await expect(canvas.getByText(/Polylang failing is a WARNING, never a failure/)).toBeVisible()

    // And `copy` is not the same function on the two, which is the trap a shared chain would hide.
    await userEvent.click(canvas.getByRole('button', { name: /WordPress stage 4 copy/ }))
    await expect(canvas.getByText(/NOT the same function as Joomla/)).toBeVisible()
  }
}

/** M03 — search, filter, and the two different reasons a template can be absent. */
export const M03QuickstartsAndTemplates: Story = {
  args: { screen: 'catalog' },
  play: async ({ canvas, userEvent }) => {
    // Real bytes and a real sha256 behind the base row.
    await userEvent.click(canvas.getByRole('button', { name: 'Artifacts and checksums for tracy-apple/j6' }))
    // `screen`, not `canvas`: base-ui portals a Sheet onto document.body, outside the story root.
    // And `waitFor`, because the panel opens from `opacity-0` — it is in the DOM before it is visible.
    const checksum = await screen.findByText(/90e91e51af5c3dde/)
    await waitFor(() => expect(checksum).toBeVisible())
    await userEvent.keyboard('{Escape}')

    // A download that failed and a package that was never authored do NOT share a label. Asserted
    // through the row actions, because the status words also appear in the filter's own options.
    await expect(canvas.getByRole('button', { name: 'Why Linear on Joomla is Error' })).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Why BMW on Joomla is Missing configuration' })
    ).toBeVisible()

    // Filtering down to the pending row, and the reason is the catalogue's own sentence.
    // 🔒 `fireEvent.input`, NOT `userEvent.type`. `@tracy/ui`'s Input is base-ui's Field.Control,
    // and typing through it leaves the DOM value updated while React state never moves — measured
    // 12/09: the box read "tailwind" and the table under it still said "8 of 8".
    fireEvent.input(canvas.getByRole('textbox', { name: 'Search designs' }), {
      target: { value: 'airbnb' }
    })
    await userEvent.click(
      canvas.getByRole('button', { name: /Why Airbnb on Joomla is Pending implementation/ })
    )
    // The sentence appears twice on purpose: once as the reason, once inside the catalogue excerpt
    // it was read from — so the reviewer can check the reading against the file without leaving.
    const said = await screen.findAllByText(/separately versioned quickstart content and display contract/)
    await expect(said.length).toBeGreaterThan(1)
    await expect(await screen.findByText(/"state": "pending"/)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
  }
}

/** M04 — the resolver, tried live. Role kept, platform swapped. */
export const M04Presets: Story = {
  args: { screen: 'presets' },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('heading', { name: 'Presets' })).toBeVisible()

    await userEvent.selectOptions(
      canvas.getByRole('combobox', { name: 'Source preset' }),
      'developer-wordpress'
    )
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Target CMS' }), 'joomla')
    await expect(canvas.getByLabelText('Resolved preset')).toHaveTextContent('developer-joomla')

    // A session on one of dsh's own presets has no Tracy role, so a build becomes design work.
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Source preset' }), 'standard')
    await expect(canvas.getByLabelText('Resolved preset')).toHaveTextContent('designer-joomla')

    // The mis-preset panel is computed from the real matrix, so the difference is the real one.
    await expect(canvas.getByText('A session that ran under the wrong preset')).toBeVisible()
    await expect(canvas.getAllByText('t4-framework-knowledge').length).toBeGreaterThan(0)
  }
}

/** M05 — declared and loaded, and still refused on this site. */
export const M05ToolsAndSkills: Story = {
  args: { screen: 'tools' },
  play: async ({ canvas, userEvent }) => {
    // The panel starts closed: a screen that opened one row by itself would look like a verdict.
    await userEvent.click(canvas.getByRole('button', { name: 'Limits on bash' }))
    await expect(
      canvas.getByText(
        'This quickstart allows content-contract tools only; shell, terminal and other write paths are disabled.'
      )
    ).toBeVisible()

    // Guidance and enforcement are never the same sentence.
    await expect(canvas.getByText(/Nothing enforces this/)).toBeVisible()
  }
}

/** M06 — validation, a conditional follow-up, and a Reset that means it. */
export const M06SiteQuestions: Story = {
  args: { screen: 'brief' },
  play: async ({ canvas, userEvent }) => {
    // Editing a label is local state, and the table says so before anyone asks.
    await expect(canvas.queryByText('Preview only · nothing saved')).toBeNull()
    fireEvent.input(canvas.getByRole('textbox', { name: 'Label for name' }), {
      target: { value: 'What is the business called?' }
    })
    await expect(canvas.getByText('Preview only · nothing saved')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Reset' }))
    await expect(canvas.queryByText('Preview only · nothing saved')).toBeNull()

    // The customer's side: two required answers, and the engine's own sentence when they are empty.
    await userEvent.click(canvas.getByRole('tab', { name: 'As the customer sees it' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }))
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Tracy needs a little more before writing your words.'
    )
  }
}

/** M06 again — the follow-up exists only while the page it feeds does. */
export const SiteQuestionFollowUpIsConditional: Story = {
  args: { screen: 'brief' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('switch', { name: /follow-up questions/ }))
    await userEvent.click(canvas.getByRole('tab', { name: 'As the customer sees it' }))
    fireEvent.input(canvas.getByRole('textbox', { name: 'Business name' }), {
      target: { value: 'Claude Studio' }
    })
    fireEvent.input(canvas.getByRole('textbox', { name: 'One line about your business' }), {
      target: { value: 'Interior design for small offices.' }
    })
    // Contact page is on, so the address question is asked.
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }))
    await expect(canvas.getByText('What address should the Contact page show?')).toBeVisible()

    // Switch the page off and the question goes with it, with a line saying why.
    await userEvent.click(canvas.getByRole('button', { name: 'Back' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Contact' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }))
    await expect(canvas.getByText(/The address question is not asked/)).toBeVisible()
  }
}

/** M07 — one change the contract allows, one it refuses, and a site checked against it. */
export const M07ContractsAndFiles: Story = {
  args: { screen: 'contracts' },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('heading', { name: 'Contracts & files' })).toBeVisible()
    // Position and access sit on the row, next to the fields an agent may edit.
    await expect(canvas.getByText('off-canvas')).toBeVisible()

    await userEvent.click(canvas.getByRole('tab', { name: 'Changes & drift' }))
    await expect(canvas.getByText('Allowed by the contract')).toBeVisible()
    await expect(canvas.getByText('Blocked by the contract')).toBeVisible()
    await expect(canvas.getByText(/Position and access are locked fields/)).toBeVisible()
  }
}

/** M07 on WordPress — an empty state that says nothing was written, not that nothing is locked. */
export const ContractMissingOnWordPress: Story = {
  args: { screen: 'contracts', cms: 'wordpress' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No contract for WordPress')).toBeVisible()
    await expect(canvas.getByText(/decided by the sandbox mode and the path fence/)).toBeVisible()
  }
}

/** The walk-through: a choice made on the overview is still in force two screens later. */
export const Tour: Story = {
  args: { screen: 'overview' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Joomla · Template mapping — open Quickstarts & templates' })
    )
    await expect(canvas.getByRole('heading', { name: 'Quickstarts & templates' })).toBeVisible()
    // The frame carries the CMS and offers the way back, naming where back goes.
    await expect(canvas.getByText(/Carrying Joomla/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Back to Website builds' })).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: 'Back to Website builds' }))
    await expect(canvas.getByRole('heading', { name: 'Website builds' })).toBeVisible()
  }
}

/**
 * The environment picker is two BRANCHES (Lee, 12/09): `Main` is what production is cut from —
 * `main-v3` today — and `Dev` is `develop`. It swaps the sample scenario, nothing more.
 */
export const EnvironmentDevShowsVersionMismatch: Story = {
  args: { screen: 'overview', env: 'dev' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('develop @ d0da35c55')).toBeVisible()
    await expect(canvas.getByText('Version mismatch')).toBeVisible()
    await expect(canvas.getByText(/repo 1.1.0 · running 1.0.0/)).toBeVisible()
    // An error is not a missing configuration: the files exist and the fetch failed.
    await expect(canvas.getByText('Contract files unreadable')).toBeVisible()
  }
}

/** `Main` is the baseline, and it names the branch it follows rather than a machine. */
export const EnvironmentMainIsTheBaseline: Story = {
  args: { screen: 'overview', env: 'main' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('main-v3 @ e43d4d06f')).toBeVisible()
    await expect(canvas.getByText('branch main-v3 · cowork.tracy.ai')).toBeVisible()
    // Nobody has checked whether a finished build is right, on either branch.
    await expect(canvas.getAllByText('Not verified').length).toBeGreaterThan(1)
  }
}

/** Filtering to nothing says what the table is a sample of, and offers the way back. */
export const NoSearchResults: Story = {
  args: { screen: 'catalog' },
  play: async ({ canvas, userEvent }) => {
    fireEvent.input(canvas.getByRole('textbox', { name: 'Search designs' }), {
      target: { value: 'tailwind' }
    })
    await expect(canvas.getByText(/No rows match/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Clear the search' }))
    await expect(canvas.getByText(/8 of 8 sample rows/)).toBeVisible()
  }
}

/** EmDash: four presets that boot, and no stages module at all behind them. */
export const EmdashHasPresetsAndNothingElse: Story = {
  args: { screen: 'flow', cms: 'emdash' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No build stages for EmDash')).toBeVisible()
    await expect(canvas.getByText(/not an empty one, none at all/)).toBeVisible()
    await expect(canvas.getByText(/an agent that starts is not a build flow/)).toBeVisible()
  }
}

/** The legend: eight states, three layer combinations, and the disabled-with-a-reason rule. */
export const StateLegend: StoryObj<typeof States> = {
  render: () => <States />,
  parameters: { layout: 'fullscreen' },
  play: async ({ canvas }) => {
    for (const label of [
      'Ready',
      'Not verified',
      'Missing configuration',
      'Pending implementation',
      'Blocked',
      'Version mismatch',
      'Error',
      'Loading'
    ]) {
      await expect(canvas.getAllByText(label).length).toBeGreaterThan(0)
    }
    await expect(canvas.getByRole('button', { name: /Apply to the fleet/ })).toBeDisabled()
  }
}
