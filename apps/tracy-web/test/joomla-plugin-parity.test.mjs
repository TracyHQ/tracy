/** Pin the executed rule inventory and compare the PHP bytes with a plugin checkout when available. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pluginSource, validateContractWrite } from './_joomla-plugin-validator.mjs'

const sibling = fileURLToPath(new URL('../../../../claude-cowork', import.meta.url))
const root = process.env.CLAUDE_COWORK_DIR ?? (existsSync(sibling) ? sibling : null)
const library = root && path.join(root, 'joomla/cowork/lib')
const slice = (source) =>
  ['checkValue', 'checkDerivedLink', 'imagePath', 'currentValue', 'changeRow']
    .map((name) => {
      const pattern =
        name === 'imagePath'
          ? /^    private static function imagePath.*$/m
          : new RegExp(`^    private (?:static )?function ${name}\\([^]*?^    }`, 'm')
      const found = source.match(pattern)
      assert.ok(found, `the plugin still declares ${name}; refresh the validation fixture if it moved`)
      return found[0]
    })
    .join('\n')

test('the pinned PHP bytes and every value/fit refusal code stay accounted for', () => {
  for (const [name, source] of Object.entries(pluginSource.files))
    assert.equal(createHash('sha256').update(source).digest('hex'), pluginSource.sha256[name], name)
  const source = pluginSource.files['QuickstartContract.php'] + pluginSource.files['SlotFit.php']
  const codes = [
    ...new Set(
      [...source.matchAll(/(?:\$refuse\(|new ContractProblem\()'([A-Z_]+)'/g)].map((match) => match[1])
    )
  ].sort()
  assert.deepEqual(codes, [
    'SLOT_EMPTY_STATE',
    'SLOT_EVIDENCE_REQUIRED',
    'SLOT_IMAGE_INVALID',
    'SLOT_IMAGE_OPAQUE',
    'SLOT_IMAGE_TOO_SMALL',
    'SLOT_LINK_UNSUPPORTED',
    'SLOT_NOT_CONTENT',
    'SLOT_PICTURE_KEPT',
    'SLOT_TOO_LONG',
    'SLOT_UNWRITABLE'
  ])
  assert.ok(pluginSource.files['ContentSlots.php'].includes('HTML slot is missing or ambiguous'))
})

test('the validation fixture is the plugin source, byte for byte', {
  skip: library
    ? false
    : 'no plugin checkout; pinned PHP still runs on CI (set CLAUDE_COWORK_DIR for upstream parity)'
}, () => {
  for (const [name, expected] of Object.entries(pluginSource.files)) {
    const source = readFileSync(path.join(library, name), 'utf8')
    assert.equal(
      name === 'QuickstartContract.php' ? slice(source) : source,
      expected,
      `${name} drifted: refresh the pinned PHP and review new refusal rules`
    )
  }
})

test('the same fixture cases execute against the plugin checkout too', {
  skip: library ? false : 'no plugin checkout for an independent PHP run'
}, () => {
  const sources = Object.fromEntries(
    Object.keys(pluginSource.files).map((name) => {
      const source = readFileSync(path.join(library, name), 'utf8')
      return [name, name === 'QuickstartContract.php' ? slice(source) : source]
    })
  )
  const slot = { key: 'module-1.0', type: 'text', sample: 'Demo', maxCharacters: 100 }
  for (const [patch, value] of [
    [{}, ''],
    [{ sample: '' }, 'Owner'],
    [{ fit: { measured: true, lines: { desktop: 1 } } }, 'One\nTwo'],
    [{ type: 'image', fit: { replace: 'keep' } }, 'images/own.png']
  ]) {
    const input = { slots: [{ ...slot, ...patch }], params: { changes: { [slot.key]: value } } }
    assert.deepEqual(validateContractWrite(input), validateContractWrite({ ...input, sources }))
  }
})
