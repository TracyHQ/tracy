import { Badge } from '@tracy/ui'
import { Hammer } from 'lucide-react'

/** Placeholder page for a view not built yet — describes the planned content for an agent to build from. */
export function Placeholder({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-background p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2">
          <Hammer className="size-4 text-muted-foreground" />
          <h1 className="font-semibold text-lg tracking-tight">{title}</h1>
          <Badge variant="outline">Planned</Badge>
        </div>
        <p className="mt-2 text-muted-foreground text-sm">This view is not built yet. It will contain:</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground text-sm">
          {items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
