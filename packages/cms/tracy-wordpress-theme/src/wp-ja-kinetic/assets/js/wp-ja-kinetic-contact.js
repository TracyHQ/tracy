/**
 * wp-ja-kinetic/kinetic-contact-form — client validation, ported from the script the running
 * source attaches to `form.form-validate` (Joomla core `media/system/js/fields/validate.js`,
 * `JFormValidator`: attachToForm / validate / markValid / markInvalid / removeMarking / isValid)
 * plus the one `Joomla.renderMessages()` call it makes (`media/system/js/messages.js`). Ported
 * rather than re-imagined so an empty submit leaves the exact state the source leaves (measured
 * live 2026-09-23, `/index.php/company/contact`):
 *  - the submit button's click marks every form element (labels get `invalid` + a
 *    `span.form-control-feedback`, fields get `form-control-danger invalid` / `form-control-success`,
 *    parents get `has-danger` / `has-success`) and raises the "form cannot be submitted" alert;
 *  - the form keeps native validation (no `novalidate`, same as the source), so the browser then
 *    focuses the first empty field and shows its own bubble; that focus runs `removeMarking()`,
 *    which is why the source's Name field ends as `invalid valid` with no feedback under its label.
 * The message container is the block's own `#system-message-container` (blocks/kinetic-contact-
 * form/render.php), a sibling ahead of `.contact` exactly as on the source.
 *
 * @package wp-ja-kinetic
 */
;(function () {
  'use strict'

  // Joomla's `joomla.jtext` strings as the source page ships them.
  const TEXT = {
    ERROR: 'Error',
    JCLOSE: 'Close',
    JLIB_FORM_CONTAINS_INVALID_FIELDS:
      "The form cannot be submitted as it's missing required data. <br> Please correct the marked fields and try again.",
    JLIB_FORM_FIELD_REQUIRED_VALUE: 'Please fill in this field',
    JLIB_FORM_FIELD_REQUIRED_CHECK: 'One of the options must be selected',
    JLIB_FORM_FIELD_INVALID_VALUE: 'This value is not valid'
  }

  // validate.js `setHandler('email', …)`. ponytail: ASCII only — the source runs punycode.toASCII()
  // first, so an internationalised domain is accepted there and rejected here; port it if needed.
  const HANDLERS = {
    email: function (value) {
      return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(value)
    }
  }

  function labelFor(element) {
    return element.form.querySelector('label[for="' + element.id + '"]')
  }

  function markValid(element) {
    const label = labelFor(element)
    let message = null
    if ((element.classList.contains('required') || element.getAttribute('required')) && label) {
      message = label.querySelector('span.form-control-feedback')
    }
    element.classList.remove('form-control-danger', 'invalid')
    element.classList.add('form-control-success')
    element.parentNode.classList.remove('has-danger')
    element.parentNode.classList.add('has-success')
    element.setAttribute('aria-invalid', 'false')
    if (message) message.parentNode.removeChild(message)
    if (label) label.classList.remove('invalid')
  }

  function markInvalid(element, empty) {
    const label = labelFor(element)
    element.classList.remove('form-control-success', 'valid')
    element.classList.add('form-control-danger', 'invalid')
    element.parentNode.classList.remove('has-success')
    element.parentNode.classList.add('has-danger')
    element.setAttribute('aria-invalid', 'true')
    const custom = element.getAttribute('data-validation-text')
    const existing = label ? label.querySelector('span.form-control-feedback') : null
    if (!existing) {
      const feedback = document.createElement('span')
      feedback.classList.add('form-control-feedback')
      let key = 'JLIB_FORM_FIELD_INVALID_VALUE'
      if (empty === 'checkbox') key = 'JLIB_FORM_FIELD_REQUIRED_CHECK'
      else if (empty === 'value') key = 'JLIB_FORM_FIELD_REQUIRED_VALUE'
      feedback.textContent = custom !== null ? custom : TEXT[key]
      if (label) label.appendChild(feedback)
    }
    if (label) label.classList.add('invalid')
  }

  function removeMarking(element) {
    const label = labelFor(element)
    const message = label ? label.querySelector('span.form-control-feedback') : null
    element.classList.remove('form-control-danger', 'form-control-success', 'remove')
    element.classList.add('valid')
    element.parentNode.classList.remove('has-danger', 'has-success')
    if (message && label) label.removeChild(message)
    if (label) label.classList.remove('invalid')
  }

  function handleResponse(state, element, empty) {
    const tagName = element.tagName.toLowerCase()
    if ((tagName !== 'button' && element.value !== undefined) || tagName === 'fieldset') {
      if (state === false) markInvalid(element, empty)
      else markValid(element)
    }
  }

  function validate(element) {
    if (element.getAttribute('disabled') === 'disabled' || element.getAttribute('display') === 'none') {
      handleResponse(true, element)
      return true
    }
    if (element.getAttribute('required') || element.classList.contains('required')) {
      const tagName = element.tagName.toLowerCase()
      if (
        tagName === 'fieldset' &&
        (element.classList.contains('radio') || element.classList.contains('checkboxes'))
      ) {
        if (element.querySelector('input:checked') === null) {
          handleResponse(false, element, 'checkbox')
          return false
        }
      } else if (
        (element.getAttribute('type') === 'checkbox' && element.checked !== true) ||
        (tagName === 'select' && !element.value.length)
      ) {
        handleResponse(false, element, 'checkbox')
        return false
      } else if (!element.value || element.classList.contains('placeholder')) {
        handleResponse(false, element, 'value')
        return false
      }
    }
    const cls = element.getAttribute('class')
    const match = cls ? cls.match(/validate-([a-zA-Z0-9_-]+)/) : null
    const handler = match ? match[1] : ''
    if (handler === '') {
      handleResponse(true, element)
      return true
    }
    if (HANDLERS[handler] && element.value && HANDLERS[handler](element.value) !== true) {
      handleResponse(false, element, 'invalid_value')
      return false
    }
    handleResponse(true, element)
    return true
  }

  // messages.js `Joomla.renderMessages({ error: [message] })`, into the block's own container.
  function renderError(message) {
    const container = document.getElementById('system-message-container')
    if (!container) return
    container.innerHTML = ''
    const box = document.createElement('joomla-alert')
    box.setAttribute('type', 'danger')
    box.setAttribute('close-text', TEXT.JCLOSE)
    box.setAttribute('dismiss', 'true')
    box.setAttribute('role', 'alert')
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'joomla-alert--close'
    close.setAttribute('aria-label', TEXT.JCLOSE)
    close.innerHTML = '<span aria-hidden="true">&times;</span>'
    close.addEventListener('click', function () {
      box.remove()
    })
    const heading = document.createElement('div')
    heading.className = 'alert-heading'
    heading.innerHTML = '<span class="error"></span><span class="visually-hidden">' + TEXT.ERROR + '</span>'
    const wrapper = document.createElement('div')
    wrapper.className = 'alert-wrapper'
    wrapper.innerHTML = '<div class="alert-message">' + message + '</div>'
    box.appendChild(close)
    box.appendChild(heading)
    box.appendChild(wrapper)
    container.appendChild(box)
  }

  function isValid(form) {
    let valid = true
    Array.prototype.slice.call(form.elements).forEach(function (field) {
      if (validate(field) === false) valid = false
    })
    if (!valid)
      renderError(form.getAttribute('data-validation-text') || TEXT.JLIB_FORM_CONTAINS_INVALID_FIELDS)
    return valid
  }

  function attachToForm(form) {
    Array.prototype.slice.call(form.elements).forEach(function (element) {
      const tagName = element.tagName.toLowerCase()
      if (
        ['input', 'textarea', 'select', 'fieldset'].indexOf(tagName) > -1 &&
        element.classList.contains('required')
      ) {
        element.setAttribute('required', '')
      }
      const type = element.getAttribute('type')
      if ((tagName === 'input' || tagName === 'button') && (type === 'submit' || type === 'image')) {
        if (element.classList.contains('validate')) {
          element.addEventListener('click', function () {
            isValid(form)
          })
        }
      } else if (
        tagName !== 'button' &&
        !(tagName === 'input' && type === 'button') &&
        tagName !== 'fieldset'
      ) {
        element.addEventListener('blur', function (event) {
          validate(event.target)
        })
        element.addEventListener('focus', function (event) {
          removeMarking(event.target)
        })
      }
    })
  }

  // The server-rendered notice (render.php) closes the same way the source's joomla-alert does.
  function bindServerAlertClose() {
    document
      .querySelectorAll('#system-message-container joomla-alert .joomla-alert--close')
      .forEach(function (button) {
        button.addEventListener('click', function () {
          button.closest('joomla-alert').remove()
        })
      })
  }

  function init() {
    const form = document.querySelector('.kinetic-contact form.form-validate')
    if (form) attachToForm(form)
    bindServerAlertClose()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
