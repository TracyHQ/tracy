import type { ReactNode } from 'react'

/** The standard content block of a settings page: group title + a card holding the rows. */
export function SettingsSection({
  title,
  badge,
  children
}: {
  title: string
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-border border-b px-5 py-3.5">
        <h2 className="font-semibold text-sm tracking-tight">{title}</h2>
        {badge}
      </div>
      <div className="divide-y divide-border px-5">{children}</div>
    </section>
  )
}

export function SettingsRow({
  label,
  hint,
  children
}: {
  label: ReactNode
  hint?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-13 items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint ? <div className="mt-0.5 text-muted-foreground text-xs">{hint}</div> : null}
      </div>
      <div className="flex flex-none items-center gap-2">{children}</div>
    </div>
  )
}

export function SettingsPage({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-6">
      {title ? <h1 className="font-semibold text-lg tracking-tight">{title}</h1> : null}
      {children}
    </div>
  )
}
