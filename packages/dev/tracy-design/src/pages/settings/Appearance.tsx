import {
  Badge,
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch
} from '@tracy/ui'
import { Minus, Monitor, Moon, Plus, Sun } from 'lucide-react'
import { useState } from 'react'

import { useShell } from '../../app/app-context'
import { SettingsPage, SettingsRow, SettingsSection } from './SettingsLayout'

const SWATCHES = ['#a16d4f', '#ef4444', '#f59e0b', '#5b8def', '#8b5cf6', '#7c5cf6']

function ThemeCard({
  label,
  icon,
  active,
  onClick,
  preview
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  preview: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 rounded-xl border p-1.5 text-left transition-colors',
        active ? 'border-primary' : 'border-border hover:border-foreground/30'
      )}
    >
      {preview}
      <div className="flex items-center justify-center gap-1.5 py-2 font-medium text-xs [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
    </button>
  )
}

function LightPreview() {
  return (
    <div className="flex h-20 gap-1 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 p-1.5">
      <div className="w-1/4 rounded bg-white shadow-sm" />
      <div className="flex flex-1 flex-col gap-1 rounded bg-white p-1.5 shadow-sm">
        <div className="h-1.5 w-3/4 rounded-full bg-neutral-200" />
        <div className="h-1.5 w-1/2 rounded-full bg-neutral-200" />
      </div>
    </div>
  )
}

function DarkPreview() {
  return (
    <div className="flex h-20 gap-1 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 p-1.5">
      <div className="w-1/4 rounded bg-neutral-800" />
      <div className="flex flex-1 flex-col gap-1 rounded bg-neutral-800 p-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-neutral-600" />
        <div className="h-1.5 w-1/2 rounded-full bg-neutral-600" />
      </div>
    </div>
  )
}

function SystemPreview() {
  return (
    <div className="flex h-20 overflow-hidden rounded-lg border border-neutral-400">
      <div className="flex-1 bg-neutral-100 p-1.5">
        <div className="h-full rounded bg-white shadow-sm" />
      </div>
      <div className="flex-1 bg-neutral-900 p-1.5">
        <div className="h-full rounded bg-neutral-800" />
      </div>
    </div>
  )
}

export function Appearance() {
  const { dark, setDark } = useShell()
  const [system, setSystem] = useState(false)
  const [color, setColor] = useState(3)
  const [zoom, setZoom] = useState(100)

  return (
    <SettingsPage>
      <SettingsSection title="Theme">
        <div className="flex gap-3 py-4">
          <ThemeCard
            label="Light"
            icon={<Sun />}
            active={!dark && !system}
            onClick={() => (setDark(false), setSystem(false))}
            preview={<LightPreview />}
          />
          <ThemeCard
            label="Dark"
            icon={<Moon />}
            active={dark && !system}
            onClick={() => (setDark(true), setSystem(false))}
            preview={<DarkPreview />}
          />
          <ThemeCard
            label="System"
            icon={<Monitor />}
            active={system}
            onClick={() => setSystem(true)}
            preview={<SystemPreview />}
          />
        </div>
        <SettingsRow label="Primary Color">
          {SWATCHES.map((c, i) => (
            <button
              key={c}
              onClick={() => setColor(i)}
              className={cn(
                'size-6 rounded-full transition-shadow',
                color === i && 'ring-2 ring-offset-2 ring-offset-card'
              )}
              style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
              aria-label={c}
            />
          ))}
          <span className="ml-2 rounded-lg border border-border px-2.5 py-1 font-mono text-muted-foreground text-xs">
            {SWATCHES[color]}
          </span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Display & Language">
        <SettingsRow label="Language">
          <Select defaultValue="en" items={{ en: '🇺🇸 English', vi: '🇻🇳 Tiếng Việt', zh: '🇨🇳 中文' }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">🇺🇸 English</SelectItem>
              <SelectItem value="vi">🇻🇳 Tiếng Việt</SelectItem>
              <SelectItem value="zh">🇨🇳 中文</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Page Zoom">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
          >
            <Minus />
          </Button>
          <span className="w-12 text-center text-sm tabular-nums">{zoom}%</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(200, z + 10))}
          >
            <Plus />
          </Button>
        </SettingsRow>
        <SettingsRow label="Transparent Window" hint="Desktop only.">
          <Switch defaultChecked />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Font Settings" badge={<Badge variant="secondary">New</Badge>}>
        <SettingsRow label="Global Font">
          <Select defaultValue="default" items={{ default: 'Default', inter: 'Inter', system: 'System' }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="inter">Inter</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Code Font">
          <Select
            defaultValue="default"
            items={{ default: 'Default', jetbrains: 'JetBrains Mono', fira: 'Fira Code' }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="jetbrains">JetBrains Mono</SelectItem>
              <SelectItem value="fira">Fira Code</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  )
}
