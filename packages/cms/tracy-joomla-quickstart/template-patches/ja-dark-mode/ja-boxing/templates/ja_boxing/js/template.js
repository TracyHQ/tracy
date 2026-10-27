// Tracy: `?theme=dark|light` on the address picks the side for THIS load only and is never saved (no cookie
// is written). Tracy's template preview frames this site from another origin, so it cannot reach the
// cookie; it asks for a side this way and the popup's Light | Dark switch reloads the frame with it.
// The template's own switch and cookie are untouched: without the parameter nothing here runs.
jQuery(document).ready(function ($) {
  const asked = /[?&]theme=(dark|light)(&|$)/.exec(window.location.search);
  if (!asked) return;
  const dark = asked[1] === 'dark';
  $('body').toggleClass('dark-active', dark).toggleClass('light-active', !dark);
});

jQuery(document).ready(function($) {
  // Theme switcher
  if (jQuery('.ja-dark-mode').length > 0) {
    const cookieId = jQuery('body').attr('jadark-cookie-id');

    function setTheme() {
      JATheme = jQuery('body').hasClass('dark-active') ? 'isActive' : 'notActive';
      jQuery.cookie(cookieId, JATheme, { path: '/' });
    }

    jQuery(".ja-dark-mode").click(function () {
      if ($('body').hasClass('light-active')) {
        $('body').removeClass('light-active').addClass('dark-active');
      } else {
        $('body').removeClass('dark-active').addClass('light-active');
      }
      setTheme();
    });
  };

  // Isotope
  var $container = jQuery('.view-classes-wrap .items-intro');

  if ($container.length) {
    $container.isotope({
      itemSelector: '.item-wrap',
      gutter: 0,
      percentPosition: true,
      masonry: {
        horizontalOrder: true,
      }
    });


    // re-order when images loaded
    $container.imagesLoaded(function () {
      $container.isotope();

      setTimeout (function() {
        $container.isotope();
      }, 2000);  
    });
  };


  jQuery(document).on("scroll", onScroll);
  onepageNavLinks = jQuery('.onepage .t4-navbar .nav-link');

  function onScroll(event){
    var scrollPos = jQuery(document).scrollTop();
    onepageNavLinks.each(function () {
        var currLink = jQuery(this);
        var refElement = jQuery(currLink.attr("href"));
        if (refElement.position().top <= scrollPos /* && refElement.position().top + refElement.height() > scrollPos*/ ) {
            onepageNavLinks.removeClass("active");
            currLink.addClass("active");
        }
        else{
            currLink.removeClass("active");
        }
    });
  }

  // Add Placeholder form contact
  var formContact = jQuery('.com_contact');
  if (formContact.length > 0) {
    const language = window.ja_lang || {};

    jQuery('#jform_contact_name', formContact).attr('placeholder',language['TPL_CONTACT_NAME_PLACEHOLDER']);
    jQuery('#jform_contact_email', formContact).attr('placeholder',language['TPL_CONTACT_EMAIL_PLACEHOLDER']);
    jQuery('#jform_contact_emailmsg', formContact).attr('placeholder',language['TPL_CONTACT_MESSAGE_SUBJECT_PLACEHOLDER']);
    jQuery('#jform_contact_message', formContact).attr('placeholder',language['TPL_CONTACT_ENTER_MESSAGE_PLACEHOLDER']);

    if(jQuery('.ie8').length > 0) {
      jQuery("input[placeholder], textarea[placeholder]", formContact).each(function(i, e){
        if(jQuery(e).val() == "") {
            jQuery(e).val(jQuery(e).attr("placeholder"));
        }
        jQuery(e).blur(function(){
        if(jQuery(this).val()=="")
            jQuery(this).val(jQuery(e).attr("placeholder"));
        }).focus(function() {
        if(jQuery(this).val() == jQuery(e).attr("placeholder"))
            jQuery(this).val("");
        });
      });
    }
  }

  var $elements = $(".section-border-top");
  $elements.each(function() {
    var $parent = $(this).closest(".t4-section");
    if ($parent.length) {
      $parent.addClass("section-border-top");
    }
  });

  $(".t4-content").prepend("<div class='bg-mask'></div>");
});


function jsAdvanceSearchResultsNotice(click) {
  document.getElementById("notice").style.display = 'none';
}
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
