/* wp-ja-kinetic: behaviours ported from the Joomla source, on elements this theme keeps in the
 * markup but hides with CSS for D-11 element-tree parity (see each block's own render.php doc
 * comment) — reproducing their JS behaviour, not just their DOM, is the same "kept in markup …
 * but not shown" standard the source itself applies.
 *
 * 1. The login/register show-password eye toggle (`[data-wp-ja-kinetic-password-toggle]`): Joomla
 *    core's own `field.passwordview` script flips the field's `type` between `password`/`text` and
 *    swaps the icon (`icon-eye`/`icon-eye-slash`) + the visually-hidden label between "Show
 *    Password"/"Hide Password", then focuses the field. Reproduced
 *    here at the same event contract (click, no keyboard-only path beyond the button's own native
 *    focus/Enter/Space activation).
 * 2. The search page's Advanced Search toggle (`.kinetic-finder__advtoggle`, `data-bs-toggle=
 *    "collapse" data-bs-target="#advancedSearch"`): the source loads Bootstrap's own collapse
 *    component for this; this theme does not ship Bootstrap JS, so this reproduces just the two
 *    things a visitor or a screen reader can observe — `aria-expanded` on the button and the
 *    target's `show` class — not Bootstrap's height-transition animation. Its form's submit
 *    disables every empty filter select first, as the source's `finder.js` does.
 * 3. The register/reset-complete password strength meter (`.js-password-strength`): verbatim port
 *    of the source's own `media/system/js/fields/passwordstrength.js` (Joomla core, MIT-licensed
 *    `PasswordStrength` class — scoring algorithm, DOM insertion order and element attributes
 *    copied unchanged) — an HTML `<meter min=0 max=100 low=40 high=99 optimum=100>` + an `<output>`
 *    label, inserted `afterEnd` of the field's `.input-group` in that exact order (meter ends up
 *    the immediate next sibling, label after it — the same double-`insertAdjacentElement('afterEnd'
 *    , …)` call order the source's own script makes). No custom colour CSS is added: the source
 *    itself never styles `<meter>` beyond `.registration meter{min-width:288px}` (ported to the CSS
 *    file) — the bar's colour is the browser's own native `<meter>` rendering against those
 *    low/high/optimum thresholds, identical in both places because both run in the same engine.
 * 4. Required-field client validation on the four `.form-validate` forms (login/register/reset/
 *    remind): Joomla core's own `validate.js`, measured live on the running source (blur an empty
 *    required field on the login page) — a `.form-control-feedback` bubble appended inside the field's own `<label>`
 *    (after the `.star`, exact text "Please fill in this field") plus ` invalid`/` has-danger`/
 *    ` form-control-danger invalid` added to the label/field's parent/field (valid fields get
 *    ` form-control-success` + parent ` has-success`, `markValid()`). A submit-button click while
 *    invalid additionally raises the source's own form-level summary alert — but only on the
 *    forms whose submit button already carries Joomla's own `.validate` marker class in this port's
 *    markup (register/reset/remind; login's own submit button never had that class even before this
 *    fix — the source's own distinction, not a guess made here) — same `<joomla-alert>` shape as
 *    `wp_ja_kinetic_notice()` builds server-side (inc/extra.php), type "danger" (heading "Error"),
 *    text measured live on the source's own empty-submit registration: "The form cannot be
 *    submitted as it's missing required data. <br> Please correct the marked fields and try again."
 *    On those forms the first invalid field then gets the browser's own bubble and focus, as on the
 *    source (no form carries `novalidate`, there or here). The login form (no `.validate`) gets no
 *    click handler: its empty submit is left to the browser's own check, as on the source
 *    (measured with a real click: native "Please fill out this field." bubble, focus back on
 *    Username, which ends ` invalid valid` with no label bubble — blur marks it, the refocus clears it).
 */
;(() => {
  // ---- 3. password strength meter — verbatim port of the source's `PasswordStrength` class ----
  class WpJaKineticPasswordStrength {
    constructor(settings) {
      this.lowercase = parseInt(settings.lowercase, 10) || 0
      this.uppercase = parseInt(settings.uppercase, 10) || 0
      this.numbers = parseInt(settings.numbers, 10) || 0
      this.special = parseInt(settings.special, 10) || 0
      this.length = parseInt(settings.length, 10) || 12
    }
    getScore(value) {
      let score = 0
      let mods = 0
      const sets = ['lowercase', 'uppercase', 'numbers', 'special', 'length']
      sets.forEach((set) => {
        if (this[set] > 0) mods += 1
      })
      score += WpJaKineticPasswordStrength.calc(value, /[a-z]/g, this.lowercase, mods)
      score += WpJaKineticPasswordStrength.calc(value, /[A-Z]/g, this.uppercase, mods)
      score += WpJaKineticPasswordStrength.calc(value, /[0-9]/g, this.numbers, mods)
      score += WpJaKineticPasswordStrength.calc(
        value,
        /[@$!#?=;:*\-_€%&()`´+[\]{}'"\\|,.<>/~^]/g,
        this.special,
        mods
      )
      if (mods === 1) {
        score += value.length > this.length ? 100 : (100 / this.length) * value.length
      } else {
        score += value.length > this.length ? 100 / mods : (100 / mods / this.length) * value.length
      }
      return score
    }
    static calc(value, pattern, length, mods) {
      const count = value.match(pattern)
      if (count && count.length > length && length !== 0) return 100 / mods
      if (count && length > 0) return (100 / mods / length) * count.length
      return 0
    }
  }

  const wpJaKineticStrengthLabels = {
    complete: 'Password accepted',
    incomplete: "Password doesn't meet site's requirements.",
    spaces: 'Password must not have spaces at the beginning or end.'
  }

  function wpJaKineticMeterFor(field) {
    // Each field owns the meter/output pair immediately after its own `.input-group` (source:
    // `field.parentNode.insertAdjacentElement('afterEnd', …)` twice, field.parentNode being the
    // `.input-group` here too) — scoped per-field, not `document.querySelector('meter')` the
    // source's own script uses (a latent bug there since this page never has two strength fields
    // at once; scoping here is equivalent and avoids depending on than accident).
    const group = field.closest('.input-group')
    return group ? group.nextElementSibling : null
  }

  function wpJaKineticUpdateMeter(field) {
    const meter = wpJaKineticMeterFor(field)
    if (!meter) return
    const label = meter.nextElementSibling
    const strength = new WpJaKineticPasswordStrength({
      lowercase: field.getAttribute('data-min-lowercase') || 0,
      uppercase: field.getAttribute('data-min-uppercase') || 0,
      numbers: field.getAttribute('data-min-integers') || 0,
      special: field.getAttribute('data-min-symbols') || 0,
      length: field.getAttribute('data-min-length') || 12
    })
    const score = strength.getScore(field.value)
    if (field.value !== field.value.trim()) {
      if (label) label.textContent = wpJaKineticStrengthLabels.spaces
      meter.value = 0
      return
    }
    meter.value = score
    if (label) {
      label.textContent =
        score === 100 ? wpJaKineticStrengthLabels.complete : wpJaKineticStrengthLabels.incomplete
      if (!field.value.length) {
        label.textContent = ''
        field.setAttribute('required', '')
      }
    }
  }

  function wpJaKineticInitStrengthMeters() {
    const fields = document.querySelectorAll('.js-password-strength')
    fields.forEach((field, index) => {
      const meter = document.createElement('meter')
      meter.setAttribute('id', `wp-ja-kinetic-progress-${index}`)
      meter.setAttribute('min', '0')
      meter.setAttribute('max', '100')
      meter.setAttribute('low', '40')
      meter.setAttribute('high', '99')
      meter.setAttribute('optimum', '100')
      meter.value = field.value.length ? '' : 0
      const label = document.createElement('output')
      label.setAttribute('id', `wp-ja-kinetic-password-${index}`)
      label.setAttribute('for', field.id)
      const group = field.closest('.input-group')
      if (!group) return
      group.insertAdjacentElement('afterEnd', label)
      group.insertAdjacentElement('afterEnd', meter)
      if (field.value.length > 0) field.setAttribute('required', 'true')
      field.addEventListener('keyup', () => wpJaKineticUpdateMeter(field))
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wpJaKineticInitStrengthMeters)
  } else {
    wpJaKineticInitStrengthMeters()
  }

  document.addEventListener('click', (event) => {
    const toggle =
      event.target && event.target.closest
        ? event.target.closest('[data-wp-ja-kinetic-password-toggle]')
        : null
    if (toggle) {
      event.preventDefault()
      const field = toggle.closest('.input-group')?.querySelector('input')
      if (!field) return
      const shown = field.getAttribute('type') === 'text'
      const icon = toggle.firstElementChild
      if (icon) {
        icon.classList.toggle('icon-eye', shown)
        icon.classList.toggle('icon-eye-slash', !shown)
      }
      field.setAttribute('type', shown ? 'password' : 'text')
      // the source's `passwordview.js` focuses the field after every flip, which blurs whatever had
      // focus before (on the login page the autofocused Username field, so its own required-field
      // check runs) and fires the field's own focus handler below.
      field.focus()
      const label = toggle.querySelector('.visually-hidden')
      if (label) label.textContent = shown ? 'Show Password' : 'Hide Password'
      return
    }

    const advtoggle =
      event.target && event.target.closest ? event.target.closest('.kinetic-finder__advtoggle') : null
    if (advtoggle) {
      event.preventDefault()
      const targetId = advtoggle.getAttribute('data-bs-target')
      const panel = targetId ? document.querySelector(targetId) : null
      if (!panel) return
      const expanded = advtoggle.getAttribute('aria-expanded') === 'true'
      advtoggle.setAttribute('aria-expanded', expanded ? 'false' : 'true')
      panel.classList.toggle('show', !expanded)
    }
  })

  // The source's `media/com_finder/js/finder.js` `onSubmit`: every empty advanced-filter select is
  // disabled at submit time so it is not sent — the query stays `?s=…` with no empty `t[]=`.
  document.querySelectorAll('.js-finder-searchform').forEach((form) => {
    form.addEventListener('submit', () => {
      form.querySelectorAll('.js-finder-advanced select').forEach((field) => {
        if (!field.value) field.setAttribute('disabled', 'disabled')
      })
    })
  })

  // ---- 4. required-field client validation (Joomla core's own `validate.js`) ----
  const WP_JA_KINETIC_VALIDATION_MESSAGES = {
    valueMissing: 'Please fill in this field'
  }

  // The field's own `<label for>` — the lookup the source's `validate.js` makes in all three markers.
  function wpJaKineticLabelFor(field) {
    return field.id ? field.form.querySelector(`label[for="${field.id}"]`) : null
  }

  // Source's `markValid()`: ` form-control-success` on the field, ` has-success` on its direct parent,
  // `aria-invalid="false"`, and a required field's bubble dropped from its label.
  function wpJaKineticMarkValid(field) {
    const label = wpJaKineticLabelFor(field)
    const feedback = label && field.required ? label.querySelector('.form-control-feedback') : null
    field.classList.remove('form-control-danger', 'invalid')
    field.classList.add('form-control-success')
    field.parentNode.classList.remove('has-danger')
    field.parentNode.classList.add('has-success')
    field.setAttribute('aria-invalid', 'false')
    if (feedback) feedback.remove()
    if (label) label.classList.remove('invalid')
  }

  // Source's `markInvalid()`: the field's own marking, ` has-danger` on its direct parent,
  // `aria-invalid="true"`, and the bubble appended inside its label.
  function wpJaKineticMarkInvalid(field) {
    const label = wpJaKineticLabelFor(field)
    const reasonKey = Object.keys(WP_JA_KINETIC_VALIDATION_MESSAGES).find((key) => field.validity[key])
    const message =
      WP_JA_KINETIC_VALIDATION_MESSAGES[reasonKey] || WP_JA_KINETIC_VALIDATION_MESSAGES.valueMissing
    // the source's `markInvalid()` drops the ` valid` its focus handler left behind
    field.classList.remove('form-control-success', 'valid')
    field.classList.add('form-control-danger', 'invalid')
    field.parentNode.classList.remove('has-success')
    field.parentNode.classList.add('has-danger')
    field.setAttribute('aria-invalid', 'true')
    if (!label) return
    const existingFeedback = label.querySelector('.form-control-feedback')
    if (existingFeedback) {
      existingFeedback.textContent = message
    } else {
      const feedback = document.createElement('span')
      feedback.className = 'form-control-feedback'
      feedback.textContent = message
      label.appendChild(feedback)
    }
    label.classList.add('invalid')
  }

  // Source's `validate()` on one field: required fields by their own constraint check, every other
  // field ends marked valid.
  // ponytail: skips the source's `validate-*` handlers on non-required fields — here only the empty
  // hidden `jform[username]`/`jform[password2]` mirrors carry them, and an empty value skips them there too.
  function wpJaKineticValidateField(field) {
    if (!field.required || field.checkValidity()) {
      wpJaKineticMarkValid(field)
      return true
    }
    wpJaKineticMarkInvalid(field)
    return false
  }

  // Source's `removeMarking()`, run on every field focus: clears the field's own marking and its
  // parent's, drops its bubble, and leaves the field with Joomla's own ` valid` class.
  function wpJaKineticRemoveMarking(field) {
    const label = wpJaKineticLabelFor(field)
    const feedback = label ? label.querySelector('.form-control-feedback') : null
    field.classList.remove('form-control-danger', 'form-control-success', 'remove')
    field.classList.add('valid')
    field.parentNode.classList.remove('has-danger', 'has-success')
    if (feedback) feedback.remove()
    if (label) label.classList.remove('invalid')
  }

  // Source's own summary alert, raised by `validate.js` on a failed `.validate`-marked submit through
  // `Joomla.renderMessages({error: [...]})` — measured live on the source's empty-submit registration:
  // `<joomla-alert type="danger" close-text="Close" dismiss="true">`, close button `aria-label="Close"`,
  // heading `<span class="error"></span>` + visually-hidden "Error", and the message
  // JLIB_FORM_CONTAINS_INVALID_FIELDS with its own `<br>` (two lines at 1440). Goes into the
  // `#system-message-container` that `kinetic-auth-notice` always prints just before `.kinetic-auth`
  // (the source's position); only if that container is missing is one created at the same spot.
  function wpJaKineticShowValidationAlert(form) {
    let container = document.getElementById('system-message-container')
    if (!container) {
      const region = form.closest('.kinetic-auth')
      if (!region) return
      container = document.createElement('div')
      container.id = 'system-message-container'
      container.setAttribute('aria-live', 'polite')
      region.before(container)
    }
    container.innerHTML = ''
    const alertEl = document.createElement('joomla-alert')
    alertEl.setAttribute('type', 'danger')
    alertEl.setAttribute('close-text', 'Close')
    alertEl.setAttribute('dismiss', 'true')
    alertEl.setAttribute('role', 'alert')
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'joomla-alert--close'
    closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.innerHTML = '<span aria-hidden="true">&times;</span>'
    // the source's close button removes its own alert only; the container stays for the next one
    closeBtn.addEventListener('click', () => alertEl.remove())
    const heading = document.createElement('div')
    heading.className = 'alert-heading'
    heading.innerHTML = '<span class="error"></span><span class="visually-hidden">Error</span>'
    const wrapper = document.createElement('div')
    wrapper.className = 'alert-wrapper'
    const messageEl = document.createElement('div')
    messageEl.className = 'alert-message'
    messageEl.innerHTML =
      "The form cannot be submitted as it's missing required data. <br> Please correct the marked fields and try again."
    wrapper.appendChild(messageEl)
    alertEl.append(closeBtn, heading, wrapper)
    container.appendChild(alertEl)
  }

  // The source's `validate.js` is a module script, so on a fresh visit it binds its focus handler only
  // after the browser has already autofocused the login page's Username field: that first focus leaves
  // no ` valid` (measured: plain login and the login page reached from "remind sent"). Only when the
  // login page is loaded again from itself (the failed-login round trip, its scripts already cached)
  // does the handler bind first and the autofocused field carry ` valid` — and so does a reload of the
  // page (measured 2026-09-24: the login page reloaded after "remind sent" carries it). This script is
  // deferred and would always bind first, so an autofocused field binds its focus handler on the next
  // animation frame (the browser flushes autofocus before running animation-frame callbacks), except
  // on that round trip or a reload.
  // ponytail: the referrer/reload test stands in for the source's cache timing; other warm-cache
  // arrivals (e.g. from another page of the site) follow the fresh-visit outcome.
  const wpJaKineticSamePageReload = (() => {
    try {
      if (performance.getEntriesByType('navigation')[0]?.type === 'reload') return true
      return !!document.referrer && new URL(document.referrer).pathname === window.location.pathname
    } catch {
      return false
    }
  })()

  function wpJaKineticInitFormValidation() {
    document.querySelectorAll('.kinetic-auth form.form-validate').forEach((form) => {
      // Source's `attachToForm()`: every listed field except buttons gets the blur/focus pair.
      const markable = [...form.elements].filter(
        (el) => el.tagName !== 'BUTTON' && el.tagName !== 'FIELDSET' && el.type !== 'button'
      )
      markable.forEach((field) => {
        field.addEventListener('blur', () => wpJaKineticValidateField(field))
        const bindFocus = () => field.addEventListener('focus', () => wpJaKineticRemoveMarking(field))
        if (field.autofocus && !wpJaKineticSamePageReload) requestAnimationFrame(bindFocus)
        else bindFocus()
        // On that round trip the browser can still flush autofocus before this deferred script
        // runs (measured: 2 of 4 failed-login loads missed ` valid`); the source's handler never
        // misses it there, so a field already focused on arrival gets the handler's outcome now.
        if (field.autofocus && wpJaKineticSamePageReload && document.activeElement === field)
          wpJaKineticRemoveMarking(field)
      })
      // Source's `attachToForm()` binds `isValid()` to the click of a submit button marked `.validate`
      // (register/reset/remind; login's has none, so nothing is bound there). `isValid()` runs
      // `validate()` over every listed element but buttons, in form order, raises the summary alert
      // when one fails and never cancels the click. The form keeps no `novalidate`, so the browser's
      // own constraint check then blocks the submit, focuses the first invalid field and shows its
      // native bubble — that focus runs `removeMarking()`, so the first field ends unmarked (label
      // bubble gone, ` invalid valid`) while the others keep theirs (measured: register).
      form.querySelectorAll('button[type="submit"].validate').forEach((button) => {
        button.addEventListener('click', () => {
          const fields = [...form.elements].filter((el) => el.tagName !== 'BUTTON')
          const allValid = fields.map((field) => wpJaKineticValidateField(field)).every(Boolean)
          if (!allValid) wpJaKineticShowValidationAlert(form)
        })
      })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wpJaKineticInitFormValidation)
  } else {
    wpJaKineticInitFormValidation()
  }
})()
