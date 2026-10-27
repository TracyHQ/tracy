import {
  Badge,
  Button,
  Card,
  CardContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger
} from '@tracy/ui'
import { CheckCircle2, ChevronDown, ExternalLink, Eye, Plug, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { sites } from '../../../fixtures'
import { SettingsPage } from '../SettingsLayout'

function AdminLoginForm({ platform }: { platform: string }) {
  const shopify = platform === 'shopify'
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div>
        <Label htmlFor="conn-url">{shopify ? 'Store domain' : 'Admin URL'}</Label>
        <Input
          id="conn-url"
          placeholder={shopify ? 'acme.myshopify.com' : 'https://yoursite.com/administrator/'}
          className="mt-1"
        />
      </div>
      {shopify ? (
        <div>
          <Label htmlFor="conn-secret">Client secret</Label>
          <Input id="conn-secret" type="password" placeholder="shpss_…" className="mt-1" />
          <p className="mt-1 text-muted-foreground text-xs">
            <a
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
              href="#how"
            >
              How to create the app in Shopify
              <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="conn-user">Username</Label>
              <Input id="conn-user" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="conn-pass">Password</Label>
              <div className="relative mt-1">
                <Input id="conn-pass" type="password" />
                <Eye className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch size="sm" defaultChecked /> Remember me
          </label>
        </>
      )}
      <div className="flex gap-2">
        <Button>Save</Button>
        <Button variant="outline">
          <ExternalLink />
          Open Admin Login
        </Button>
      </div>
    </div>
  )
}

export function SiteConnection() {
  const { siteKey } = useParams()
  const site = sites.find((s) => s.key === siteKey) ?? sites[0]
  const [adding, setAdding] = useState(false)
  const [platform, setPlatform] = useState<string>(site.platform)
  return (
    <SettingsPage>
      <div>
        <h1 className="font-semibold text-lg tracking-tight">Connection</h1>
        <p className="mt-0.5 text-muted-foreground text-sm">
          Tracy connects with your site’s own admin login. One connection per platform.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 py-3">
          <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted">
            <Plug className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm capitalize">{site.platform} admin</span>
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="size-3 text-green-600 dark:text-green-400" />
                Connected
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-muted-foreground text-xs">
              {site.adminUrl} · checked 2 hours ago
            </p>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw />
            Re-check
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive">
            Disconnect
          </Button>
        </CardContent>
      </Card>

      <Collapsible open={adding} onOpenChange={setAdding}>
        <CollapsibleTrigger
          render={
            <Button variant="outline">
              {adding ? <ChevronDown /> : <Plus />}
              Add connection
            </Button>
          }
        />
        <CollapsibleContent>
          <Card className="mt-3">
            <CardContent className="py-4">
              <p className="font-medium text-sm">Which platform runs this site?</p>
              <Tabs value={platform} onValueChange={(v) => setPlatform(v as string)} className="mt-2">
                <TabsList>
                  <TabsTrigger value="wordpress">WordPress</TabsTrigger>
                  <TabsTrigger value="joomla">Joomla</TabsTrigger>
                  <TabsTrigger value="shopify">Shopify</TabsTrigger>
                </TabsList>
              </Tabs>
              <AdminLoginForm platform={platform} />
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </SettingsPage>
  )
}
