---
id: own-domain
title: Connect your own domain (DNS)
switch: site-connect-domain
tab: tracy:site-publish
roles: [owner]
platforms: [wordpress, joomla, emdash]
keywords: [domain, own domain, custom domain, dns, cname, txt, record, subdomain, www, cloudflare, nameserver, ten mien, tên miền, tro dns, trỏ dns, ban ghi, bản ghi]
checked: 2026-10-24 @ 5bce63492a
---
Connecting your own domain makes the site open at an address like www.example.com. The site keeps its Tracy address too; the domain is added beside it.

**Where:** the site's Publish tab (My Sites → the site's "…" menu → Publish). Choose "Make it live on Tracy", press Continue, publish the site if it is a draft, then press Continue to the "Your domain" step.

**Who:** only a site Owner can connect, check or remove a domain. An Editor or Viewer asks an Owner.

**Before you start:**
- The site must be published (Live). A domain can only be connected to a live site. If it is a draft, press Publish on the Tracy address step first.
- Enter a subdomain you own, such as www.example.com or shop.example.com. A bare domain such as example.com cannot point at a site on its own and is refused; Tracy suggests the www. version. Do not type https:// or a path.
- One own domain per site. To use another, remove the first.

**Steps:**
1. On the Your domain step, type the subdomain and press Check availability, then Save.
2. Tracy shows the DNS records to add. Add them at the company that manages your domain's DNS (usually your domain registrar or hosting provider), where you manage the domain's records:
   - A TXT record at `_tracy.<your subdomain>` with the value Tracy shows. It proves the domain is yours.
   - A CNAME record at your subdomain pointing to the value Tracy shows. It points the domain at the site.
   - Sometimes a third record that lets the HTTPS certificate be issued. Tracy shows it only when it is needed.
   Each record has a copy button for its name and its value.
3. Press Check again. Each record shows Found with the right value, Found with a different value (fix it), or Not found (not added yet).
4. When the records are right, Tracy connects the domain by itself within a few minutes and issues the HTTPS certificate. The domain then shows Connected / Live.

**Good to know:**
- DNS changes can take up to an hour to reach everyone. If a record was just added and is Not found, wait and check again; Tracy also keeps checking by itself.
- On Cloudflare, set the CNAME to DNS only (grey cloud), not Proxied (orange cloud). A proxied record can be unreadable to Tracy.
- If you add the TXT record within 72 hours the name stays reserved for the site; after that it is released and you reserve it again.
- To make the bare domain (example.com) also work, redirect it to the www. address at your DNS provider or registrar.
- While a publish or Back to draft is running, the domain field waits until it is done.
- Pressing Back to draft takes the domain offline: visitors to it no longer reach the site until you publish again. The domain setup stays.
- Remove domain stops the domain opening the site; the Tracy address keeps working.

**Common problems:**
- "Cannot connect" for example.com → use www.example.com.
- "DNS needs fixing" → a record exists with a different value; correct it, then Check again.
- "Waiting for DNS" / Not found → the record is not added yet, or has not spread; wait up to an hour.
- Not opening the site / certificate pending → the records are in place but the HTTPS certificate is still being issued; give it a few minutes, then Check again.
- "Something else answers at the domain" → the domain's CNAME points somewhere other than the value Tracy shows.
