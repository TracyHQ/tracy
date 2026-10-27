/* Group "home": the stepped layout of features-intro style-1 and style-2.
 * The source gives each card an odd / even class by its place and puts its picture (and, in style-2, its price badge)
 * above or below the text. A pattern repeats one card, so the cards are all drawn alike and this script sets the
 * class and the order the Joomla template printed. Without it the cards stay a plain row. */
;(function () {
  'use strict'

  function swapButton(card, odd) {
    const button = card.querySelector('.btn')
    if (!button) return
    button.classList.remove(odd ? 'btn-default' : 'btn-primary')
    button.classList.add(odd ? 'btn-primary' : 'btn-default')
  }

  function arrange(section, style) {
    const cards = section.querySelectorAll('.features-item')
    cards.forEach(function (card, i) {
      const odd = i % 2 === 0
      const inner = card.querySelector(':scope > .features-item-inner')
      const icon = card.querySelector(':scope > .img-icon')
      const price = card.querySelector(':scope > .price')
      card.classList.add(odd ? 'odd' : 'even')
      if (style === 1) {
        // style-1: the first card's picture sits below its text, the second card's above.
        if (icon) {
          icon.classList.add(odd ? 'img-icon-bottom' : 'img-icon-top')
          if (odd) card.appendChild(icon)
        }
        swapButton(card, odd)
      } else {
        // style-2: even places carry picture and price on top, the others below the text (text, price, picture).
        if (price) {
          price.classList.remove('price-top', 'price-bottom')
          price.classList.add(odd ? 'price-top' : 'price-bottom')
        }
        if (icon) icon.classList.add(odd ? 'img-icon-top' : 'img-icon-bottom')
        if (!odd) {
          if (price) card.appendChild(price)
          if (icon) card.appendChild(icon)
        }
      }
      if (inner && inner.parentNode !== card) card.appendChild(inner)
    })
  }

  function init() {
    document.querySelectorAll('.acm-features.style-1').forEach(function (s) {
      arrange(s, 1)
    })
    document.querySelectorAll('.acm-features.style-2').forEach(function (s) {
      arrange(s, 2)
    })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
