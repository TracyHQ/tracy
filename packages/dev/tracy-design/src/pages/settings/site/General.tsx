import { Badge, Button, Input, Label } from '@tracy/ui'
import { FolderOpen, X } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { sites } from '../../../fixtures'
import { PlatformGlyph } from '../../../app/PlatformGlyph'
import { SettingsPage, SettingsRow, SettingsSection } from '../SettingsLayout'

const TECH: Record<string, string[]> = {
  joomla: ['Joomla 5', 'PHP 8.3', 'MySQL', 'Cloudflare'],
  wordpress: ['WordPress 6.7', 'WooCommerce', 'PHP 8.2', 'Nginx'],
  shopify: ['Shopify', 'Liquid', 'Hydrogen']
}

export function SiteGeneral() {
  const { siteKey } = useParams()
  const site = sites.find((s) => s.key === siteKey) ?? sites[0]
  return (
    <SettingsPage>
      <SettingsSection title="This site">
        <div className="flex items-center gap-4 py-4">
          <span className="flex size-14 items-center justify-center rounded-xl border border-border bg-muted/40">
            <PlatformGlyph platform={site.platform} className="size-8 text-base" />
          </span>
          <div className="flex-1">
            <Label htmlFor="site-name">Name</Label>
            <Input id="site-name" defaultValue={site.name} className="mt-1 max-w-sm" />
            <p className="mt-1 text-muted-foreground text-xs">Also the site agent’s name.</p>
          </div>
        </div>
        <SettingsRow label="Platform" hint="Seen from the outside.">
          <Badge variant="secondary" className="capitalize">
            {site.platform}
          </Badge>
        </SettingsRow>
        <SettingsRow label="Technology">
          <div className="flex max-w-md flex-wrap justify-end gap-1.5">
            {TECH[site.platform].map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs"
              >
                {t}
                <X className="size-3 text-muted-foreground" />
              </span>
            ))}
            <Button variant="ghost" size="xs">
              Add technology
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow label="Site folder" hint={<code className="font-mono">~/TracyHQ/sites/{site.key}</code>}>
          <Button variant="outline" size="sm">
            <FolderOpen />
            Change
          </Button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Addresses">
        <SettingsRow label="Live site" hint={<code className="font-mono">{site.liveUrl}</code>} />
        <SettingsRow label="Tracy’s copy" hint={<code className="font-mono">{site.previewUrl}</code>} />
        <SettingsRow label="Admin" hint={<code className="font-mono">{site.adminUrl}</code>}>
          <Button variant="outline" size="sm">
            Manage connections
          </Button>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  )
}
