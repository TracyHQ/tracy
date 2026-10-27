jQuery(document).ready(function() {
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

    jQuery(document).on('show.bs.modal', '.modal', function () {
      jQuery(this).appendTo('body');
    });

    // Add Placeholder form contact
    var formContact = jQuery('.com_contact');
    if (formContact.length > 0) {
        jQuery('#jform_contact_name', formContact).attr('placeholder',Joomla.JText._('COM_CONTACT_CONTACT_EMAIL_NAME_LABEL'));
        jQuery('#jform_contact_email', formContact).attr('placeholder',Joomla.JText._('COM_CONTACT_EMAIL_LABEL'));
        jQuery('#jform_contact_emailmsg', formContact).attr('placeholder',Joomla.JText._('COM_CONTACT_CONTACT_MESSAGE_SUBJECT_LABEL'));
        jQuery('#jform_contact_message', formContact).attr('placeholder',Joomla.JText._('COM_CONTACT_CONTACT_ENTER_MESSAGE_LABEL'));
        
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
});

(function($){
    $(document).ready(function() {
      // Theme switcher
      if($('.ja-dark-mode').length > 0) {
        function setTheme() {
            JATheme = $('body').hasClass('dark-active') ? 'isActive' : 'notActive';
            $.cookie('themeCookie', JATheme, { path: '/' });    
        }

        if ($.cookie('themeCookie') == 'isActive') {
            $('body').addClass('dark-active');    
        } else {
            $('body').removeClass('dark-active');
        }

        $(".ja-dark-mode").click(function () {
            $('body').toggleClass('dark-active');
            setTheme();
        });
      }
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
