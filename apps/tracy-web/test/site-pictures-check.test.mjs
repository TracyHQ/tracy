// Tests for the picture check site-pictures-check/5 (ADR 0043): one passing and one failing invented case per rule.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CHECKER_VERSION,
  checkPictures,
  failureListText
} from '../src/site-pictures/picture-check/check-pictures.js'
import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'
import { rungsFor } from '../src/site-pictures/ladder-rungs.js'
import { breaks, entryOf, inputs, ruleOf } from './_site-pictures-check.mjs'

const ALL = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P13']

test('the passing manifest passes every rule and the version is frozen', () => {
  const r = checkPictures(inputs())
  // test-quality: contract ADR 0043 freezes the checker name; a rule change must bump it on purpose
  assert.equal(CHECKER_VERSION, 'site-pictures-check/5')
  assert.equal(r.meta.checker, 'site-pictures-check/5')
  assert.deepEqual(
    r.rules.map((x) => `${x.id}:${x.status}`),
    ALL.map((id) => `${id}:pass`)
  )
  assert.deepEqual(r.inputErrors, [])
  assert.deepEqual(r.summary, { pass: 13, fail: 0, skip: 0 })
  assert.deepEqual(checkPictures(inputs()), r)
  assert.equal(failureListText(r), '')
})

// Point an entry at another generated file, keeping its hash, size and site path consistent.
const usesFile = (e, name, input) => {
  const f = input.files[`out/${name}`]
  Object.assign(e, {
    file: `out/${name}`,
    width: f.width,
    height: f.height,
    sha256: f.sha256,
    sitePath: `images/tracy-content/${f.sha256}.png`
  })
}

test('P01 fails a missing or repeated planned frame, an unplanned frame and a malformed manifest', () => {
  breaks(
    'P01',
    (i) => {
      i.pictures.frames = i.pictures.frames.filter((e) => e.frame !== 'block-3.2')
    },
    /block-3\.2|planned frame has no entry/
  )
  breaks(
    'P01',
    (i) => {
      i.pictures.returns.push({ frame: 'block-3.2', reason: 'no photo' })
    },
    /appears 2 times/
  )
  breaks(
    'P01',
    (i) => {
      i.pictures.returns.push({ frame: 'block-3.1x', reason: 'x' })
      i.kit.blocks[2].frames.push({ ...i.kit.blocks[2].frames[0], id: 'block-3.1x' })
    },
    /not planned/
  )
  breaks(
    'P01',
    (i) => {
      delete i.pictures.fingerprint.prompts.looker
    },
    /looker prompt hash/
  )
  for (const bad of [null, 'x', [], {}, { version: 'site-pictures/1', frames: [null, { frame: 'a' }] }]) {
    const r = checkPictures({ ...inputs(), pictures: bad })
    assert.equal(r.rules.find((x) => x.id === 'P01').status, 'fail')
  }
  const r = checkPictures({ ...inputs(), files: undefined })
  assert.deepEqual(r.inputErrors, ['files is missing'])
})

test('initials and icons carry colour roles only: a colour value, a missing recipe or a final file fail the shape', () => {
  // The broken entry is left out of the view, so P01 fails with the shape problem (a twin of a dropped icon may fail
  // P11 as well).
  const shapeFails = (mutate, detail) => {
    const i = inputs()
    mutate(i)
    const r = ruleOf(i, 'P01')
    assert.equal(r.status, 'fail')
    assert.ok(
      r.failures.some((f) => detail.test(f.detail)),
      r.failures.map((f) => `${f.where}: ${f.detail}`).join('\n')
    )
  }
  shapeFails((i) => {
    entryOf(i, 'block-4.1').paint = { background: '#f44141', foreground: 'on-accent' }
  }, /paint\.background must be a colour role/)
  shapeFails((i) => {
    entryOf(i, 'block-5.1').paint = {
      light: { glyph: '#f44141', plate: null },
      dark: { glyph: 'on-dark', plate: null }
    }
  }, /paint\.light\.glyph must be a colour role/)
  shapeFails((i) => {
    entryOf(i, 'block-5.1').paint = {
      light: { glyph: 'accent', plate: { colour: '#000000', opacity: 1 } },
      dark: { glyph: 'on-dark', plate: null }
    }
  }, /plate must name a role/)
  shapeFails((i) => {
    delete entryOf(i, 'block-4.1').paint
  }, /initials needs "paint"/)
  shapeFails((i) => {
    entryOf(i, 'block-5.1').preview = false
  }, /only a preview/)
  shapeFails((i) => {
    entryOf(i, 'block-5.9').paint = { ...entryOf(i, 'block-5.9').paint, holds: undefined }
  }, /holds/)
  shapeFails((i) => {
    entryOf(i, 'block-2.0').paint = { background: 'accent', foreground: 'on-accent' }
  }, /no paint recipe/)
  shapeFails((i) => {
    delete entryOf(i, 'block-5.1').icon.set
  }, /icon\.set/)
})

test('P02 fails a frame id the kit does not have', () => {
  breaks(
    'P02',
    (i) => {
      i.plan.pages[1].blocks[1].pictures.push({ frame: 'block-8.7', kind: 'photo', match: 'specific' })
      i.pictures.returns.push({ frame: 'block-8.7', reason: 'no such frame' })
    },
    /does not exist in the kit/
  )
})

test('P03 fails a missing file, a changed hash, a wrong size and a site path not named by the hash', () => {
  breaks(
    'P03',
    (i) => {
      delete i.files['out/shelf.png']
    },
    /does not exist/
  )
  breaks(
    'P03',
    (i) => {
      i.files['out/hero.png'].sha256 = 'f'.repeat(64)
    },
    /has sha256/
  )
  breaks(
    'P03',
    (i) => {
      entryOf(i, 'block-2.0').sitePath = 'images/tracy-content/hero.png'
    },
    /site path must be/
  )
  breaks(
    'P03',
    (i) => {
      i.files['out/icon-dark.png'].sha256 = 'f'.repeat(64)
    },
    /dark file/
  )
})

test('P04 fails an aspect off the demo file and a file below the display box; the box aspect is not the reference', () => {
  // The hero's demo file is 400 x 200 (aspect 2) while its display box is 300 x 200 (aspect 1.5): the passing hero
  // file follows the demo file, a file cut to the box aspect fails.
  breaks(
    'P04',
    (i) => {
      usesFile(entryOf(i, 'block-2.0'), 'hero-square.png', i)
    },
    /differs from the demo file aspect 2\.000/
  )
  breaks(
    'P04',
    (i) => {
      usesFile(entryOf(i, 'block-2.0'), 'hero-small.png', i)
    },
    /below the display box 300 x 200/
  )
  const r = ruleOf(inputs(), 'P04')
  assert.ok(r.notes.some((n) => /block-6\.picture-1/.test(n)))
})

test('P05 fails enlarging past 1.5 and an enlarged or low quality photo without a passed sharpness gate', () => {
  breaks(
    'P05',
    (i) => {
      Object.assign(entryOf(i, 'block-2.0'), { enlarge: 1.6, sharpness: { passed: true } })
    },
    /more than 1\.5/
  )
  breaks(
    'P05',
    (i) => {
      Object.assign(entryOf(i, 'block-2.0'), { enlarge: 1.3, sharpness: { passed: false, measure: 40 } })
    },
    /without a passed sharpness gate/
  )
  breaks(
    'P05',
    (i) => {
      Object.assign(entryOf(i, 'block-3.1'), { asset: 'a-small' })
    },
    /low quality owner photo/
  )
  const i = inputs()
  Object.assign(entryOf(i, 'block-2.0'), { enlarge: 1.5, sharpness: { passed: true, measure: 120 } })
  assert.equal(ruleOf(i, 'P05').status, 'pass')
})

test('P06 fails the same owner photo twice on one page, whatever the crop', () => {
  breaks(
    'P06',
    (i) => {
      entryOf(i, 'block-3.1').asset = 'a-wheel'
    },
    /brief asset a-wheel is already shown in block-2\.0 on page-home/
  )
})

test('P07 fails a drawn or extended picture in an any-real frame', () => {
  breaks(
    'P07',
    (i) => {
      const e = entryOf(i, 'block-3.1')
      e.source = 'drawn'
      delete e.asset
      e.enlarge = null
    },
    /any real photo or documents the business, the source is drawn/
  )
  breaks(
    'P07',
    (i) => {
      entryOf(i, 'block-3.1').source = 'owner-photo-extended'
    },
    /owner-photo-extended/
  )
})

test('P08 passes a confirmed portrait and fails a drawn person or a photo not labelled as that person', () => {
  const i = inputs()
  Object.assign(entryOf(i, 'block-4.1'), {
    source: 'owner-photo',
    asset: 'a-rhea',
    letters: undefined,
    paint: undefined,
    preview: undefined
  })
  assert.equal(ruleOf(i, 'P08').status, 'pass')
  breaks(
    'P08',
    (x) => {
      Object.assign(entryOf(x, 'block-4.1'), { source: 'drawn', paint: undefined, preview: undefined })
    },
    /found drawn/
  )
  breaks(
    'P08',
    (x) => {
      Object.assign(entryOf(x, 'block-4.1'), {
        source: 'owner-photo',
        asset: 'a-kiln',
        paint: undefined,
        preview: undefined
      })
    },
    /a-kiln is not labelled as a portrait of f-teacher/
  )
})

test('P09 fails an owner photo with lettering, of another business, or unknown to the brief', () => {
  breaks(
    'P09',
    (i) => {
      entryOf(i, 'block-2.0').asset = 'a-sign'
    },
    /carries lettering or a watermark/
  )
  breaks(
    'P09',
    (i) => {
      entryOf(i, 'block-2.0').asset = 'a-vision'
    },
    /carries lettering/
  )
  breaks(
    'P09',
    (i) => {
      entryOf(i, 'block-2.0').asset = 'a-unlabelled'
    },
    /a-unlabelled label unknown: hasTextOrWatermark and showsOtherBusiness/
  )
  breaks(
    'P09',
    (i) => {
      entryOf(i, 'block-2.0').asset = 'a-rival'
    },
    /another business/
  )
  breaks(
    'P09',
    (i) => {
      entryOf(i, 'block-2.0').asset = 'a-nowhere'
    },
    /does not exist in the brief/
  )
})

test('P10 fails an icon without a dark file or with a name the library does not hold', () => {
  breaks(
    'P10',
    (i) => {
      entryOf(i, 'block-5.1').dark = null
      usesFile(entryOf(i, 'block-5.9'), 'icon-light.png', i)
    },
    /no dark file/
  )
  breaks(
    'P10',
    (i) => {
      entryOf(i, 'block-5.1').icon.dark = 'boxing-glove'
    },
    /not in the library: boxing-glove/
  )
  const r = ruleOf({ ...inputs(), icons: undefined }, 'P10')
  assert.equal(r.status, 'pass')
  assert.ok(r.notes.some((n) => /no icon library/.test(n)))
})

test('P11 fails a twin with another file, the wrong source, its own picture, or a kit twin left out', () => {
  breaks(
    'P11',
    (i) => {
      usesFile(entryOf(i, 'block-7.2'), 'hero.png', i)
      i.kit.contentMap.slots.find((s) => s.key === 'module-7.2').fit.source = { width: 400, height: 200 }
    },
    /different file than its source block-7\.1/
  )
  breaks(
    'P11',
    (i) => {
      entryOf(i, 'block-7.2').twinOf = 'block-2.0'
    },
    /block-2\.0 is not the frame this one is a twin of \(block-7\.1\)/
  )
  breaks(
    'P11',
    (i) => {
      Object.assign(entryOf(i, 'block-7.2'), { source: 'drawn', twinOf: undefined })
      usesFile(entryOf(i, 'block-7.2'), 'drawn-other.png', i)
    },
    /follows block-7\.1; its source must be "twin"/
  )
  breaks(
    'P11',
    (i) => {
      i.pictures.frames = i.pictures.frames.filter((e) => e.frame !== 'block-5.9')
    },
    /kit twin of block-5\.1 has no entry/
  )
})

test('P12 fails hiding a frame that cannot hide and a demo picture left in a frame', () => {
  breaks(
    'P12',
    (i) => {
      i.pictures.frames = i.pictures.frames.map((e) =>
        e.frame === 'block-2.0'
          ? {
              frame: 'block-2.0',
              source: 'hide',
              file: null,
              darkened: false,
              reason: 'x'
            }
          : e
      )
    },
    /cannot be hidden/
  )
  breaks(
    'P12',
    (i) => {
      i.kit.blocks[2].frames[0].pictureSha256 = i.files['out/shelf.png'].sha256
    },
    /is a demo picture of the template/
  )
})

test('P13 fails a picture in a not writable frame and a siteSettings entry that is not a template picture', () => {
  breaks(
    'P13',
    (i) => {
      const s = i.pictures.siteSettings.pop()
      delete s.writeDoor
      i.pictures.frames.push(s)
    },
    /not writable.*siteSettings/
  )
  breaks(
    'P13',
    (i) => {
      const e = entryOf(i, 'block-7.1')
      i.pictures.frames = i.pictures.frames.filter((x) => x !== e)
      i.pictures.siteSettings.push({ ...e, writeDoor: 'none' })
    },
    /only a template level picture/
  )
})

test('the failure list text has one line per failure in the copy check format', () => {
  const i = inputs()
  entryOf(i, 'block-2.0').asset = 'a-sign'
  assert.equal(
    failureListText(checkPictures(i)),
    'P09 | Owner photos carry no lettering and no other business | block-2.0 | brief asset a-sign carries lettering or a watermark\n'
  )
})

test('P04 reports both an aspect fault and a size fault of one file', () => {
  const i = inputs()
  i.files['out/tiny.png'] = { sha256: 'a'.repeat(64), width: 100, height: 100 }
  Object.assign(entryOf(i, 'block-2.0'), {
    file: 'out/tiny.png',
    width: 100,
    height: 100,
    sha256: 'a'.repeat(64),
    sitePath: `images/tracy-content/${'a'.repeat(64)}.png`
  })
  const details = ruleOf(i, 'P04').failures.map((f) => f.detail)
  assert.equal(details.length, 2)
  assert.ok(details.some((d) => /demo file aspect/.test(d)))
  assert.ok(details.some((d) => /below the display box/.test(d)))
})

test('a person frame repeating another (sameAs) is a twin, which P08 accepts and P11 judges', () => {
  const i = inputs()
  i.kit.blocks[3].frames.push({ ...i.kit.blocks[3].frames[0], id: 'block-4.2' })
  i.kit.contentMap.slots.push({ key: 'module-4.2', fit: { source: { width: 150, height: 150 } } })
  i.plan.pages[0].blocks[3].pictures.push({
    frame: 'block-4.2',
    kind: 'photo',
    sameAs: 'block-4.1',
    match: 'person'
  })
  i.pictures.frames.push({
    ...entryOf(i, 'block-4.1'),
    frame: 'block-4.2',
    source: 'twin',
    twinOf: 'block-4.1'
  })
  assert.deepEqual(checkPictures(i).summary, { pass: 13, fail: 0, skip: 0 })
})

test('P11 lets a twin be hidden with its hidden or returned source', () => {
  const hiddenTwin = (i) => {
    i.pictures.frames = i.pictures.frames.map((e) =>
      e.frame === 'block-7.2'
        ? {
            frame: 'block-7.2',
            source: 'hide',
            file: null,
            darkened: false,
            reason: 'source gone'
          }
        : e
    )
  }
  const returned = inputs()
  hiddenTwin(returned)
  returned.pictures.frames = returned.pictures.frames.filter((e) => e.frame !== 'block-7.1')
  returned.pictures.returns.push({ frame: 'block-7.1', reason: 'no fitting picture' })
  assert.equal(ruleOf(returned, 'P11').status, 'pass')
  const kept = inputs()
  hiddenTwin(kept)
  assert.equal(ruleOf(kept, 'P11').status, 'fail')
})

test('P05 keeps a low quality owner photo to small frames, even with a passed sharpness gate', () => {
  const small = inputs()
  Object.assign(entryOf(small, 'block-3.1'), { asset: 'a-small', sharpness: { passed: true, measure: 90 } })
  assert.equal(ruleOf(small, 'P05').status, 'pass')
  const large = inputs()
  Object.assign(entryOf(large, 'block-3.1'), { asset: 'a-small', sharpness: { passed: true, measure: 90 } })
  Object.assign(large.kit.blocks[2].frames[0], { width: 640, height: 160 })
  const r = ruleOf(large, 'P05')
  assert.equal(r.status, 'fail')
  assert.match(r.failures[0].detail, /frame of 640 x 160; it fits only frames up to 600 px/)
})

test('P09 rejects visible scene lettering despite the overlay-only direct answer being false', () => {
  breaks(
    'P09',
    (i) => {
      const e = entryOf(i, 'block-2.0')
      const a = i.brief.assets.find((a) => a.id === e.asset)
      a.hasTextOrWatermark = false
      a.hasTextOverlay = false
      a.textPresence = 'present'
    },
    /carries lettering or a watermark/
  )
})

test('an observed place or owner-post photo stays documentary even when its wish says specific', () => {
  for (const fact of [
    { id: 'document', field: 'facility', sourceKind: 'observed', value: 'A bag room' },
    { id: 'document', field: 'posts', value: { kind: 'post', text: 'Our event' } }
  ]) {
    const i = inputs()
    i.brief.facts.push(fact)
    const wish = i.plan.pages
      .flatMap((p) => p.blocks ?? [])
      .flatMap((b) => b.pictures ?? [])
      .find((w) => w.frame === 'block-2.0')
    wish.factIds = ['document']
    const idx = indexInputs(i)
    assert.ok(idx.documentaryFrame('block-2.0'))
    assert.ok(!rungsFor(idx, 'block-2.0').some((r) => ['draw', 'redraw', 'redraw-alt'].includes(r)))
    entryOf(i, 'block-2.0').source = 'drawn'
    entryOf(i, 'block-2.0').asset = null
    assert.equal(ruleOf(i, 'P07').status, 'fail')
    assert.equal(idx.documentaryFrame('block-2.1'), false, 'a generic cutout remains an illustration')
  }
})
