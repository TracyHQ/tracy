/**
 * Which bash commands WRITE the site's look (ADR 0023, "Addendum 30/09"). Only a real write form
 * counts — an unquoted redirection into a look file, `tee`, `sed -i`/`perl -i`, `cp`/`mv`/`install`
 * onto one, running a look compiler, or an inline script that opens a look file for writing. Text
 * inside quotes is never an operator: measured 30/09 on df2saas1, a read-only
 * `grep --include=*.css … | sed 's/:.*var(/ -> var(/'` was taken for a write by the `>` of ` -> `,
 * and on df2jbiz1 `sed -n 1,30p tools/t4-scss.php` (reading the compiler) fired two measures.
 *
 *   node --test packages/tools/tracy-site-tools/test/shell-look-write.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { shellLookWrite } from '../src/host/shell-look-write.mjs'

const css = '.webroot/templates/tracy_business/css/styles/tracy-business.css'
const scss = 'scss/_tracy-business-home.scss'

/** [command, the look file (or compiler) it writes, or null] */
const CASES = [
  // ── reads: never a write ───────────────────────────────────────────────────────────────────────
  [
    `grep -rn "var(--k-primary)" /app/src --include=*.astro --include=*.css | sed 's/:.*var(/ -> var(/' | sort | uniq -c`,
    null
  ],
  [`grep -n button ${css} 2>&1 | head`, null],
  [`cat ${css} > /dev/null`, null],
  [`cat -n /app/src/styles/tokens.css`, null],
  [`sed -n 1,80p ${scss}`, null],
  [`sed -n 1,30p tools/t4-scss.php`, null],
  [`cat tools/t4-scss.php`, null],
  [`head -40 templates/tpl_tracy/tools/t4-scss.php`, null],
  [`grep -c t4-scss.php README.md`, null],
  [`sed 's/#fff/#000/' ${css}`, null],
  [`echo "a > b.css"`, null],
  [`echo 'x >> theme.json'`, null],
  [`awk '{ print $1 > "out.css" }' ${css}`, null],
  [`diff ${css} /tmp/old.css`, null],
  [`cp ${css} /tmp/backup.css.txt`, null],
  [`python3 -c "print(open('${css}').read())"`, null],
  [`curl -s -o /tmp/home.html http://127.0.0.1/`, null],
  [`echo done > /tmp/log.txt`, null],
  [`ls ${css} 2>/dev/null >&2`, null],
  // ── writes ─────────────────────────────────────────────────────────────────────────────────────
  [`echo 'a{}' >> ${css}`, css],
  [`cat > ${css} <<'EOF'\na { color: #f0f; }\nEOF`, css],
  [`cat >> ${css} <<'EOF'\na{}\nEOF`, css],
  [`printf '%s' x >"${css}"`, css],
  [`sed 's/a/b/' ${css}.bak > ${css}`, css],
  [`echo x | tee -a ${css}`, css],
  [`echo x | sudo tee ${css} >/dev/null`, css],
  [`sed -i 's/#da5a2a/#ff00ff/' ${css}`, css],
  [`sed -i.bak -e 's/a/b/' ${scss}`, scss],
  [`sed -Ei 's/a/b/g' ${css}`, css],
  [`sed --in-place 's/a/b/' /app/src/styles/tokens.css`, '/app/src/styles/tokens.css'],
  [`perl -pi -e 's/a/b/' ${css}`, css],
  [`cp /tmp/new.css ${css}`, css],
  [`mv -f /tmp/theme.json wp-content/themes/t/theme.json`, 'wp-content/themes/t/theme.json'],
  [`install -m 644 /tmp/a.css ${css}`, css],
  [`cd templates/tpl_tracy && php tools/t4-scss.php`, 'tools/t4-scss.php'],
  [`php ./tools/t4-scss.php --all 2>&1 | tail -5`, './tools/t4-scss.php'],
  [`cd x; ./tools/t4-scss.php`, './tools/t4-scss.php'],
  [
    `python3 - <<'PY'\nimport io\np = '/app/src/styles/tokens.css'\ns = io.open(p).read()\nio.open(p, 'w').write(s.replace('a', 'b'))\nPY`,
    '/app/src/styles/tokens.css'
  ],
  [`node -e "require('fs').writeFileSync('${css}', 'a{}')"`, css],
  [`grep -q x ${css} || echo 'a{}' >> ${css}`, css]
]

test('a bash command writes the look only by a real write form; quoted text and reads never count', () => {
  for (const [command, expected] of CASES) assert.equal(shellLookWrite(command), expected, `for: ${command}`)
})

test('an unparsable command (an open quote) is not a write — nothing is guessed', () => {
  assert.equal(shellLookWrite(`echo 'a > ${css}`), null)
})
