# Section 6 step 6 — delete the trial site on local Tracy through the API

Read after `SKILL.md`, when you reach section 6 step 6 (after `tch create` passes). Why not `"$TD" tch teardown`:
`SKILL.md` section 4. `TDP` is set in section 3b; `LABEL` = the label in the JSON of `tch create`.

```bash
TD_LIB="$TDP/lib" LABEL=<label> node --input-type=module -e '
const { status, EMAIL } = await import(`${process.env.TD_LIB}/tch.mjs`)
const { Jar, get } = await import(`${process.env.TD_LIB}/http.mjs`)
const { origin } = await status()
const label = process.env.LABEL
const jar = new Jar()
const headers = { "content-type": "application/json", accept: "application/json" }
const login = await get(`${origin}/login`, { jar, method: "POST", headers, body: JSON.stringify({ email: EMAIL }), redirect: "manual" })
const code = JSON.parse(login.text).localCode
if (!code) throw new Error("no local login code (LOCAL_LOGIN_PREVIEW off)")
const verified = await get(`${origin}/verify`, { jar, method: "POST", headers, body: JSON.stringify({ email: EMAIL, code }), redirect: "manual" })
if (verified.status >= 400 || !jar.names().length) throw new Error(`login failed: ${verified.status}`)
const deleted = await get(`${origin}/api/sites/${label}.tracy.test`, { jar, method: "DELETE", headers, body: "{}", redirect: "manual", timeoutMs: 120000 })
const list = await get(`${origin}/api/sites`, { jar, headers: { accept: "application/json" } })
const doc = JSON.parse(list.text)
const rows = Array.isArray(doc) ? doc : doc.sites
const present = rows.some((r) => r.label === label || r.siteKey === `${label}.tracy.test` || r.key === `${label}.tracy.test`)
console.log(JSON.stringify({ label, status: deleted.status, response: JSON.parse(deleted.text), present }))
if (deleted.status !== 200 || present) process.exitCode = 1
'
```

Pass: `status` 200, `response.host` true, `present` false — then go back to `SKILL.md` section 6 step 6 (delete
the `tch local` folder).
