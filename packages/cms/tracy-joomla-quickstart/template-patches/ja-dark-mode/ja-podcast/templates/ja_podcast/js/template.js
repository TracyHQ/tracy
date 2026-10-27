jQuery(document).ready(function() {
    // ?theme=dark|light (Tracy's Design inspiration preview frames the demo this way) wins for
    // this load: re-applied here in case the first paint missed it. Never saved; only a click on
    // the switcher below writes the cookie.
    var askedTheme = (window.location.search.match(/[?&]theme=(dark|light)(?:&|$)/) || [])[1];
    if (askedTheme) {
        jQuery('body').toggleClass('dark-active', askedTheme === 'dark').toggleClass('light-active', askedTheme === 'light');
    }

    // Theme switcher
    if (jQuery('.ja-dark-mode').length > 0) {
        const cookieId = jQuery('body').attr('jadark-cookie-id');

        function setTheme() {
          JATheme = jQuery('body').hasClass('dark-active') ? 'isActive' : 'notActive';
          jQuery.cookie(cookieId, JATheme, { path: '/' });
        }

        jQuery(".ja-dark-mode").click(function () {
          jQuery('body').toggleClass('dark-active');
          setTheme();
        });
    };

    jQuery('audio').audioPlayer();

    // Add Placeholder form contact
    var formContact = jQuery('.com_contact');
    if (formContact.length > 0) {
        jQuery('#jform_contact_name', formContact).attr('placeholder',Joomla.JText._('TPL_CONTACT_NAME_PLACEHOLDER'));
        jQuery('#jform_contact_email', formContact).attr('placeholder',Joomla.JText._('TPL_CONTACT_EMAIL_PLACEHOLDER'));
        jQuery('#jform_contact_emailmsg', formContact).attr('placeholder',Joomla.JText._('TPL_CONTACT_MESSAGE_SUBJECT_PLACEHOLDER'));
        jQuery('#jform_contact_message', formContact).attr('placeholder',Joomla.JText._('TPL_CONTACT_ENTER_MESSAGE_PLACEHOLDER'));

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
})
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
