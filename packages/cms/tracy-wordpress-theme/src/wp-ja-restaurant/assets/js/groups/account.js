/* wp-ja-restaurant: account group. Show/hide for the password fields and close for the "login first" message. Vanilla; does nothing when the markup is absent. */
;(function () {
  'use strict'
  document.addEventListener('input', function (event) {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !input.classList.contains('js-password-strength')) {
      return
    }
    const group = input.closest('.password-group')
    const meter = group && group.querySelector('meter')
    const label = group && group.querySelector('.jr-strength')
    if (!meter || !label) {
      return
    }
    const v = input.value
    const score = Math.min(
      100,
      v.length * 8 +
        (/[A-Z]/.test(v) ? 12 : 0) +
        (/[0-9]/.test(v) ? 12 : 0) +
        (/[^A-Za-z0-9]/.test(v) ? 16 : 0)
    )
    meter.value = v === '' ? 0 : score
    const key =
      v === '' ? '' : v.length < 4 ? 'tooShort' : score < 40 ? 'weak' : score < 70 ? 'good' : 'strong'
    label.textContent = key === 'tooShort' ? label.dataset.tooShort : key ? label.dataset[key] : ''
  })
  document.addEventListener('click', function (event) {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    const toggle = target.closest('.input-password-toggle')
    if (toggle) {
      const input = toggle.parentElement && toggle.parentElement.querySelector('input')
      if (input) {
        const show = input.type === 'password'
        input.type = show ? 'text' : 'password'
        const icon = toggle.querySelector('.icon-eye, .icon-eye-slash')
        if (icon) {
          icon.className = (show ? 'icon-eye-slash' : 'icon-eye') + ' icon-fw'
        }
      }
      return
    }
    const close = target.closest('.jm-system-message__close')
    if (close && close.parentElement) {
      close.parentElement.remove()
    }
  })
})()
