jQuery(document).ready(function () {
	// Theme switcher
	if (jQuery('.ja-dark-mode').length > 0) {
		const cookieId = jQuery('body').attr('jadark-cookie-id');

		function setTheme() {
			JATheme = jQuery('body').hasClass('dark-active') ? 'isActive' : 'notActive';
			jQuery.cookie(cookieId, JATheme, { path: '/' });
		}

		jQuery('.ja-dark-mode').click(function () {
			if (jQuery('body').hasClass('light-active')) {
				jQuery('body').removeClass('light-active').addClass('dark-active');
			} else {
				jQuery('body').removeClass('dark-active').addClass('light-active');
			}
			setTheme();
		});
	}

	// Finance Toggle
	if (jQuery('.finance-toggle').length > 0) {
		jQuery('.finance-toggle').click(function () {
			if (jQuery('.t4-finance').hasClass('hide')) {
				jQuery('.t4-finance').removeClass('hide').addClass('show');
			} else {
				jQuery('.t4-finance').removeClass('show').addClass('hide');
			}
		});
	}
});

jQuery(document).ready(function () {
	jQuery(document).on('scroll', onScroll);
	onepageNavLinks = jQuery('.onepage .t4-navbar .nav-link');

	function onScroll(event) {
		var scrollPos = jQuery(document).scrollTop();
		onepageNavLinks.each(function () {
			var currLink = jQuery(this);
			var refElement = jQuery(currLink.attr('href'));
			if (refElement.position().top <= scrollPos /* && refElement.position().top + refElement.height() > scrollPos*/) {
				onepageNavLinks.removeClass('active');
				currLink.addClass('active');
			} else {
				currLink.removeClass('active');
			}
		});
	}
	jQuery('.podcast-player > audio').audioPlayer();

});

function jsAdvanceSearchResultsNotice(click) {
	document.getElementById('notice').style.display = 'none';
}

(function($){
  jQuery(document).ready(function($) {
    $(".more-articles-by-author .owl-carousel").owlCarousel({
      addClassActive: true,
      items: 4,
      itemsScaleUp : true,
      dots: false,
      margin: 32,
      slideBy: 1,
      autoplaySpeed: 1200,
      smartSpeed: 1000,
      loop: false,
      autoplay:false,
      autoplayTimeout:2000,
      autoplayHoverPause:true,
      nav: true,
      navText: ["<span class='fa fa-angle-left'></span>", "<span class='fa fa-angle-right'></span>"],
      responsive:{
        0:{
            items:1,
        },
        576:{
            items:2,
        },
        1200:{
            items:4,
            loop:false
        }
    }
    });
  });
})(jQuery);
// Tracy (15/10/2026): a worn design system opens the page on its own side of light while the visitor has
// chosen none. The design system's style (#tracy-ds-slot) names its side ("mode: dark" on its first lines);
// the visitor's own choice (this template's cookie) and a ?theme= in the address win.
jQuery(document).ready(function () {
  const slot = document.getElementById('tracy-ds-slot');
  const side = slot && /mode: (light|dark) \*\//.exec(slot.textContent || '');
  if (!side || /[?&]theme=(dark|light)(&|$)/.test(window.location.search)) return;
  const body = document.body;
  const cookie = body.getAttribute('jadark-cookie-id') || 'themeCookie';
  if (new RegExp('(^|;\\s*)' + cookie + '=').test(document.cookie)) return;
  const dark = side[1] === 'dark';
  body.classList.toggle('dark-active', dark);
  if (body.classList.contains('light-active') || !dark) body.classList.toggle('light-active', !dark);
});
