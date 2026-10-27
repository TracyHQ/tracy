/**
 * Every icon the package ships, by group, so a reviewer can find a mark by name and see how the
 * light/dark pairs behave. Copied from tracy-desk on 2026-09-07 with the icon set itself.
 *
 *   <Wordpress />                  auto light/dark (follows the Tailwind `dark:` variant)
 *   <Wordpress variant="light" />  force one side
 *   <Wordpress.Avatar size={32} />  circular avatar wrapper
 *   Wordpress.colorPrimary          brand colour string
 *
 * The four groups are separate barrels on purpose: `general` is UI glyphs, the other three are
 * brand marks whose full catalogs load lazily (`useIcon`) — never re-export a catalog statically.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentType, SVGProps } from 'react'
import * as General from './general'
import * as Models from './models'
import * as Platforms from './platforms'
import * as Providers from './providers'
import type { CompoundIcon } from './types'

type Mark = { name: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }

const marksOf = (mod: Record<string, unknown>): Mark[] =>
  Object.entries(mod)
    .filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === 'function')
    .map(([name, Icon]) => ({ name, Icon: Icon as Mark['Icon'] }))
    .sort((a, b) => a.name.localeCompare(b.name))

function Grid({ marks, fontSize }: { marks: Mark[]; fontSize: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
      {marks.map(({ name, Icon }) => (
        <div
          key={name}
          className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-center"
        >
          <span style={{ fontSize }} className="leading-none">
            <Icon aria-hidden />
          </span>
          <span className="w-full truncate font-mono text-[11px] text-muted-foreground" title={name}>
            {name}
          </span>
        </div>
      ))}
    </div>
  )
}

function Group({ title, marks, fontSize }: { title: string; marks: Mark[]; fontSize: number }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-base">
        {title} <span className="font-normal text-muted-foreground">· {marks.length}</span>
      </h2>
      <Grid marks={marks} fontSize={fontSize} />
    </section>
  )
}

function Showcase({ fontSize = 32 }: { fontSize?: number }) {
  return (
    <div className="space-y-10 p-6">
      <Group title="Platforms — CMS, commerce, social" marks={marksOf(Platforms)} fontSize={fontSize} />
      <Group title="General" marks={marksOf(General)} fontSize={fontSize} />
      <Group title="Providers" marks={marksOf(Providers)} fontSize={fontSize} />
      <Group title="Models" marks={marksOf(Models)} fontSize={fontSize} />
    </div>
  )
}

/** The compound marks that ship a dark twin, both sides forced, so the pair is judged side by side. */
function LightVsDark({ fontSize = 32 }: { fontSize?: number }) {
  const pairs = [...marksOf(Platforms), ...marksOf(Providers), ...marksOf(Models)].filter(
    ({ Icon }) => 'Avatar' in (Icon as unknown as CompoundIcon)
  )
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-6">
      {pairs.map(({ name, Icon }) => {
        const C = Icon as unknown as CompoundIcon
        return (
          <div key={name} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <span style={{ fontSize }} className="rounded bg-white p-1 leading-none">
              <C variant="light" aria-hidden />
            </span>
            <span style={{ fontSize }} className="rounded bg-neutral-900 p-1 leading-none">
              <C variant="dark" aria-hidden />
            </span>
            <span className="truncate font-mono text-[11px] text-muted-foreground" title={name}>
              {name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** The `.Avatar` wrapper of every platform mark — the shape site rows and pickers use. */
function Avatars({ size = 32 }: { size?: number }) {
  return (
    <div className="flex flex-wrap gap-3 p-6">
      {marksOf(Platforms).map(({ name, Icon }) => {
        const C = Icon as unknown as CompoundIcon
        return (
          <div key={name} className="flex flex-col items-center gap-1">
            <C.Avatar size={size} />
            <span className="font-mono text-[10px] text-muted-foreground">{name}</span>
          </div>
        )
      })}
    </div>
  )
}

const meta: Meta<typeof Showcase> = {
  title: 'UI/Icons',
  component: Showcase,
  parameters: { layout: 'fullscreen' },
  argTypes: { fontSize: { control: { type: 'number', min: 12, max: 64, step: 4 } } }
}
export default meta
type Story = StoryObj<typeof Showcase>

export const AllIcons: Story = { args: { fontSize: 32 } }
export const LightAndDark: StoryObj<typeof LightVsDark> = {
  render: (args) => <LightVsDark {...args} />,
  args: { fontSize: 32 }
}
export const PlatformAvatars: StoryObj<typeof Avatars> = {
  render: (args) => <Avatars {...args} />,
  args: { size: 32 }
}
