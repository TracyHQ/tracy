/**
 * REG-PR-929: the sign-in email keeps its red border when invalid, after blur and on hover. The
 * `:user-invalid` rule must come after the grey base and hover rules of `.auth-card input` in the
 * page loginPage() renders. S3 (a real browser reading the computed colour) is optional in the
 * case and left out here: the order of the rules is what the fix changed.
 */
import { checks, ROOT, run } from './lib.mjs'

const c = checks()
const render = run(process.execPath, [
  '--input-type=module',
  '-e',
  "import {loginPage} from './apps/tracy-web/src/identity/pages.js'; const h=loginPage({}); process.stdout.write(typeof h==='string'?h:await h.text())"
])
c.eq(`S1 loginPage() renders (root ${ROOT}): exit code`, render.status, 0)
const H = render.stdout
const BASE = H.indexOf('.auth-card input{background')
const HOVER = H.indexOf('.auth-card input:hover:not(:focus-visible)')
const BAD = H.indexOf(
  '.auth-card input:user-invalid,.auth-card input:user-invalid:hover{border-color:var(--destructive)}'
)
c.check('BASE >= 0', BASE >= 0, BASE)
c.check('HOVER >= 0', HOVER >= 0, HOVER)
c.check('BAD > BASE', BAD > BASE, { BAD, BASE })
c.check('BAD > HOVER', BAD > HOVER, { BAD, HOVER })
c.done()
