jQuery(document).ready(function($) {
   
    /**
     *monitor the element scroll to add class into body for style effect later
     */
    $(window).ready(function() {
        if (
            "IntersectionObserver" in window &&
            "IntersectionObserverEntry" in window &&
            "intersectionRatio" in window.IntersectionObserverEntry.prototype
        ) {
            var options = {
                root: null,
                rootMargin: '0px',
                threshold: 0
            };
            var sections = document.querySelectorAll(".t4-section");
            var maxIdx = 0;
            var sticky = document.querySelectorAll(".t4-sticky");

            function isValid(el) {
                return el.offsetTop < window.innerHeight && el.offsetTop + el.offsetHeight < window.innerHeight + 200;
            }

            function doChange(changes, observer) {
                changes.forEach( function(change){
                    var clientRect = change.boundingClientRect,
                        target = change.target;

                    if (clientRect.top <= -clientRect.height) {
                        document.body.setAttribute('data-top-' + target.id, 'over');
                        document.body.classList.add('top-away');

                    } else {
                        document.body.setAttribute('data-top-' + target.id, 'under');
                        document.body.classList.remove('top-away');
                    }

                })
            }

            var observer = new IntersectionObserver(doChange, options);

            for(var i=0; i<sections.length; i++) {
                var el = sections[i];
                if (isValid(el)) {
                    el.idx = i;
                    observer.observe(el);
                } else {
                    maxIdx = i - 1;
                    break;
                }
            }
            var top = 0;
            var zindex = 300;
            for(var i=0; i<sticky.length; i++) {
                var elSk = sticky[i];
                top += elSk.offsetHeight;
                if(typeof sticky[i+1] != 'undefined'){
                    $(elSk).css({'z-index':zindex});
                    zindex -= 1;
                    $(sticky[i+1]).css({top:top,'z-index':zindex});
                }
                
            }
            // monitor not at top
            var options2 = {
                root: null,
                rootMargin: '0px',
                threshold: 0
            };
            function doChange2(changes) {
                var clientRect = changes[0].boundingClientRect;
                if (clientRect.top <= -100) {
                    document.body.classList.add('not-at-top');
                } else {
                    document.body.classList.remove('not-at-top');
                }
            }
            var observer2 = new IntersectionObserver(doChange2, options2);
            var anchorEl = $('<a name="top-anchor">').prependTo('.t4-content-inner');
            if(anchorEl.get(0)) observer2.observe(anchorEl.get(0));

        }
    });
    
    //check anchor link on menu scroll smoothly
    $(document).on('click', 'a[href^="#"]', function (event) {
        event.preventDefault();
        if($(this).data('slide')) return;
        if(['tab'].indexOf($(this).data('toggle')) > -1) return;
        if(['tab'].indexOf($(this).attr('data-bs-toggle')) > -1) return;
        var el = '';
        if($($.attr(this, 'href')).length){
            var el = $.attr(this, 'href');
        }else if($('[name="' + $.attr(this, 'href').substr(1) + '"]').length){
            var el = '[name="' + $.attr(this, 'href').substr(1) + '"]';
        }else{
            return;
        }
        if($('body').hasClass('has-offcanvas--visible')){
            $('.js-offcanvas-close').trigger('click');
        }
        $('html, body').animate({
            scrollTop: $(el).offset().top
        }, 500);
    });

    $('li.nav-item.dropdown').on('hidden.bs.dropdown', function(e) {
        $(this).find('.show').removeClass('show');
    });

    /**
     * Back-to-top action: scroll back to top
     */
    $('body').on('click','#back-to-top',function() {
        $('html').animate({
            scrollTop : 0
        }, {
            duration: 500,
            start: () => {
                $('html').css('scroll-behavior', 'auto')
            },
            complete: () => {
                $('html').css('scroll-behavior', '');
            }
        });
        return false;
    });
    
    $(document).find('.t4-content').on("scroll",function (event) {
        var scroll = $('.t4-content').scrollTop();
        localStorage.setItem("page_scroll", scroll);
       
    });
});
// Add missing Mootools when Bootstrap is loaded
(function($)
{
    $(document).ready(function(){
        var bootstrapLoaded = (typeof $().carousel == 'function');
        var mootoolsLoaded = (typeof MooTools != 'undefined');
        if (bootstrapLoaded && mootoolsLoaded) {
            Element.implement({
                hide: function () {
                    return this;
                },
                show: function (v) {
                    return this;
                },
                slide: function (v) {
                    return this;
                }
            });
        }
    });
    function refreshCurrentPage () {
        var page = window.location.href;
        var cur  = localStorage.getItem('page');
        if(cur == page){
            return true;
        }
        return false;
    }
    

    window.onload = function () {
        var check  = refreshCurrentPage();
        localStorage.setItem("page",window.location.href);
        if(document.getElementsByClassName("t4-content").length){
            if (check) {
                var match = localStorage.getItem("page_scroll");
                document.getElementsByClassName("t4-content")[0].scrollTop = match;
            }else{
                document.getElementsByClassName("t4-content")[0].scrollTop = 0;
            }
        }
    }
    //add version to js
    var Joomla = window.Joomla || {};
    Joomla.version = $('html').hasClass('j4') ? "4" : "3";
    if(Joomla.version == 3){
        /**
         * Render messages send via JSON
         * Used by some javascripts such as validate.js
         * PLEASE NOTE: do NOT use user supplied input in messages as potential HTML markup is NOT sanitized!
         *
         * @param   {object}  messages    JavaScript object containing the messages to render. Example:
         *                              var messages = {
         *                                  "message": ["Message one", "Message two"],
         *                                  "error": ["Error one", "Error two"]
         *                              };
         * @return  {void}
         */
        Joomla.renderMessages = function( messages ) {
            Joomla.removeMessages();

            var messageContainer = document.getElementById( 'system-message-container' ),
                type, typeMessages, messagesBox, title, titleWrapper, i, messageWrapper, alertClass;

            for ( type in messages ) {
                if ( !messages.hasOwnProperty( type ) ) { continue; }
                // Array of messages of this type
                typeMessages = messages[ type ];

                // Create the alert box
                messagesBox = document.createElement( 'div' );

                // Message class
                alertClass = (type === 'notice') ? 'alert-info' : 'alert-' + type;
                alertClass = (type === 'message') ? 'alert-success' : alertClass;
                alertClass = (type === 'error') ? 'alert-error alert-danger' : alertClass;

                messagesBox.className = 'alert ' + alertClass;

                // Close button
                var buttonWrapper = document.createElement( 'button' );
                buttonWrapper.setAttribute('type', 'button');
                if($('body').hasClass('loaded-bs5')){
                    buttonWrapper.setAttribute('data-bs-dismiss', 'alert');
                }else{
                    buttonWrapper.setAttribute('data-dismiss', 'alert');
                }
                buttonWrapper.className = 'close';
                buttonWrapper.innerHTML = '×';
                messagesBox.appendChild( buttonWrapper );

                // Title
                title = Joomla.JText._( type );

                // Skip titles with untranslated strings
                if ( typeof title != 'undefined' ) {
                    titleWrapper = document.createElement( 'h4' );
                    titleWrapper.className = 'alert-heading';
                    titleWrapper.innerHTML = Joomla.JText._( type );
                    messagesBox.appendChild( titleWrapper );
                }

                // Add messages to the message box
                for ( i = typeMessages.length - 1; i >= 0; i-- ) {
                    messageWrapper = document.createElement( 'div' );
                    messageWrapper.innerHTML = typeMessages[ i ];
                    messagesBox.appendChild( messageWrapper );
                }

                messageContainer.appendChild( messagesBox );
            }
        };
    }
})(jQuery);
