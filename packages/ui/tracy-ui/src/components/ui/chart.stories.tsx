/**
 * Chart is a thin frame around recharts: `ChartContainer` takes a `config` that maps each series
 * key to a label and a colour, and `ChartStyle` turns that config into the `--color-<key>`
 * variables the marks reference. So a series is coloured by naming it in the config, never by
 * hard-coding a hex in the chart.
 *
 * The five `--chart-*` tokens in `tokens.css` are the palette, and they are the one group of
 * tokens that is NOT mapped to a dsh alias — they keep their own light and dark values.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from './chart'

const meta: Meta<typeof ChartContainer> = {
  title: 'UI/Chart',
  component: ChartContainer,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof ChartContainer>

const DATA = [
  { month: 'April', proposed: 186, applied: 140 },
  { month: 'May', proposed: 305, applied: 260 },
  { month: 'June', proposed: 237, applied: 190 },
  { month: 'July', proposed: 273, applied: 250 },
  { month: 'August', proposed: 209, applied: 180 },
  { month: 'September', proposed: 314, applied: 290 }
]

const CONFIG = {
  proposed: { label: 'Proposed', color: 'var(--chart-1)' },
  applied: { label: 'Applied', color: 'var(--chart-2)' }
} satisfies ChartConfig

export const Bars: Story = {
  render: () => (
    <Card className="w-[32rem]">
      <CardHeader>
        <CardTitle>Changes on example.com</CardTitle>
        <CardDescription>Proposed against applied, last six months</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={CONFIG} className="h-64 w-full">
          <BarChart data={DATA}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="proposed" fill="var(--color-proposed)" radius={4} />
            <Bar dataKey="applied" fill="var(--color-applied)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export const Lines: Story = {
  render: () => (
    <Card className="w-[32rem]">
      <CardHeader>
        <CardTitle>Changes over time</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={CONFIG} className="h-64 w-full">
          <LineChart data={DATA}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <Line dataKey="proposed" stroke="var(--color-proposed)" strokeWidth={2} dot={false} />
            <Line dataKey="applied" stroke="var(--color-applied)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export const Areas: Story = {
  render: () => (
    <Card className="w-[32rem]">
      <CardHeader>
        <CardTitle>Applied changes</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={CONFIG} className="h-64 w-full">
          <AreaChart data={DATA}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Area
              dataKey="applied"
              type="natural"
              fill="var(--color-applied)"
              fillOpacity={0.3}
              stroke="var(--color-applied)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

/** All five palette tokens at once — the sheet to check when a sixth series is asked for. */
export const Palette: Story = {
  render: () => {
    const config = Object.fromEntries(
      [1, 2, 3, 4, 5].map((n) => [`s${n}`, { label: `Series ${n}`, color: `var(--chart-${n})` }])
    ) satisfies ChartConfig
    const data = DATA.map((row, i) => ({
      month: row.month,
      s1: 120 + i * 10,
      s2: 100 + i * 14,
      s3: 80 + i * 18,
      s4: 60 + i * 22,
      s5: 40 + i * 26
    }))
    return (
      <div className="w-[32rem]">
        <ChartContainer config={config} className="h-64 w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {[1, 2, 3, 4, 5].map((n) => (
              <Bar key={n} dataKey={`s${n}`} fill={`var(--color-s${n})`} radius={2} />
            ))}
          </BarChart>
        </ChartContainer>
      </div>
    )
  }
}
