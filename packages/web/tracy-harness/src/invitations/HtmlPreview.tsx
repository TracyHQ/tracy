import { Button } from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { type AssetRef, RealRequestError } from './real-api'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
export function HtmlPreview({
  html,
  assets,
  campaignId,
  viewport = 'desktop',
  onError
}: {
  html: string
  assets: AssetRef[]
  campaignId: string
  viewport?: 'desktop' | 'mobile'
  onError?: (e: unknown) => void
}) {
  const t = useT()
  const [size, setSize] = useState(viewport)
  const [document, setDocument] = useState<{ input: string; campaignId: string; src: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const errorHandler = useRef(onError)
  errorHandler.current = onError
  const refs = JSON.stringify(assets)
  useEffect(() => {
    const controller = new AbortController()
    setDocument(null)
    setFailed(false)
    async function prepare() {
      if (!UUID.test(campaignId)) throw new RealRequestError('REAL_INVALID_ID', 400)
      // A template is inert: parsing cannot navigate or load resources in the parent document.
      const inert = window.document.createElement('template')
      inert.innerHTML = html
      inert.content
        .querySelectorAll('script,form,iframe,frame,object,embed,link,meta,base,svg,math,video,audio,source')
        .forEach((node) => node.remove())
      for (const node of inert.content.querySelectorAll('*')) {
        for (const attr of Array.from(node.attributes)) {
          if (
            /^on/i.test(attr.name) ||
            [
              'href',
              'target',
              'action',
              'formaction',
              'srcset',
              'ping',
              'background',
              'poster',
              'srcdoc'
            ].includes(attr.name)
          )
            node.removeAttribute(attr.name)
          if (attr.name === 'src' && node.tagName !== 'IMG') node.removeAttribute('src')
        }
      }
      const images = [...inert.content.querySelectorAll('img')]
      const imagesById = new Map<string, string>()
      for (const img of images) {
        const path = img.getAttribute('src'),
          ref = assets.find((a) => a.path === path)
        img.removeAttribute('src')
        if (!ref || !UUID.test(ref.id) || !['image/png', 'image/jpeg', 'image/gif'].includes(ref.mediaType))
          continue
        if (!imagesById.has(ref.id)) {
          const response = await fetch(`/api/ops/invitations/real/campaigns/${campaignId}/assets/${ref.id}`, {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal
          })
          if (!response.ok) throw new RealRequestError('REAL_ASSET_UNAVAILABLE', response.status)
          if (response.headers.get('content-type')?.split(';')[0] !== ref.mediaType)
            throw new RealRequestError('REAL_ASSET_INVALID', 400)
          const bytes = await response.blob()
          if (controller.signal.aborted) return
          // Opaque sandbox origins cannot load parent-origin blob URLs in Chromium.
          // Only authenticated, server-validated managed bytes become in-memory data images.
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(new RealRequestError('REAL_ASSET_INVALID', 400))
            reader.readAsDataURL(bytes)
          })
          if (controller.signal.aborted) return
          imagesById.set(ref.id, data)
        }
        img.setAttribute('src', imagesById.get(ref.id)!)
      }
      if (!controller.signal.aborted)
        setDocument({
          input: html,
          campaignId,
          src: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{overflow-wrap:anywhere;color-scheme:light}body{margin:8px;background:Canvas;color:CanvasText}img{max-width:100%!important;height:auto!important}table{max-width:100%}</style></head><body>${inert.innerHTML}</body></html>`
        })
    }
    void prepare().catch((e) => {
      if (!controller.signal.aborted) {
        setDocument(null)
        setFailed(true)
        errorHandler.current?.(e)
      }
    })
    return () => {
      controller.abort()
    }
  }, [html, refs, campaignId])
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex gap-2">
        <Button variant={size === 'desktop' ? 'default' : 'outline'} onClick={() => setSize('desktop')}>
          {t('invitations.htmlPreview.desktop')}
        </Button>
        <Button variant={size === 'mobile' ? 'default' : 'outline'} onClick={() => setSize('mobile')}>
          {t('invitations.htmlPreview.mobile')}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">{t('invitations.htmlPreview.note')}</p>
      {document?.input === html && document.campaignId === campaignId ? (
        <iframe
          title={t('invitations.htmlPreview.frameTitle')}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={document.src}
          className="rounded-md border border-border"
          style={{
            boxSizing: 'border-box',
            width: size === 'mobile' ? 360 : '100%',
            maxWidth: '100%',
            height: 480
          }}
        />
      ) : (
        <p>{t(failed ? 'invitations.htmlPreview.unavailable' : 'invitations.htmlPreview.preparing')}</p>
      )}
    </div>
  )
}
