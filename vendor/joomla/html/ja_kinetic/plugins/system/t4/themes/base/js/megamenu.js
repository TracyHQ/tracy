const T4MegaMenu = {};

jQuery(document).ready(function ($) {
  window.mobileCheck = function () {
    let check = false;
    (function (a) { if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true; })(navigator.userAgent || navigator.vendor || window.opera);
    return check;
  };
  window.isTouchDevice = (('ontouchstart' in window) || (navigator.msMaxTouchPoints > 0));

  // process dropdown hover event
  var navitem_selector = ".t4-megamenu .nav-item";
  var hideDropdowns = function ($activeitem) {
    $activeitem.removeClass("show");
    $activeitem.find(".dropdown-menu").removeClass("show");
    $activeitem.find(".dropdown-menu").css("visibility", "hidden");
    endAnimating($activeitem);
  };

  const winWidth = window.innerWidth;

  function getDropdownWidth($el) {
    const $parent = $el.closest('.dropdown');

    $parent.addClass('animating');

    const width = $el.outerWidth();

    $parent.removeClass('animating');

    return width;
  }

  var pos = function ($activeitem) {
    const $dropdown = $activeitem.children(".dropdown-menu")
    const $parentDropdown = $activeitem.closest(".dropdown-menu");

    if ($parentDropdown.length) {
      const parentDropWidth = $parentDropdown.outerWidth();
      const activeElmOffset = $activeitem.offset();
      const activeElmWidth = $activeitem.width();
      const dropdownWidth = getDropdownWidth($dropdown);
      let marginLeft = 0;

      if (winWidth - activeElmOffset.left - activeElmWidth < parentDropWidth) {
        marginLeft = 0 - dropdownWidth - activeElmWidth;
      } else {
        marginLeft = 0;
      }

      $dropdown.css("margin-left", marginLeft + "px");
    } else {
      var rtl = $("html").attr("dir") == "rtl",
        dw = $dropdown.outerWidth(),
        ww = $(window).width(),
        dl = $dropdown.offset().left,
        iw = $activeitem.width(),
        il = $activeitem.offset().left,
        ml = null,
        align = $activeitem.data("align");
      ml =
        align == "center"
          ? (iw - dw) / 2
          : align == "right"
            ? dw - iw
            : align == "justify"
              ? (iw - dw) / 2
              : 0;
      if (dw < ww) {
        if (il + ml < 20) ml = 20 - il;
        if (il + ml + dw > ww - 20) ml = ww - 20 - il - dw;
      } else {
        ml = (ww - dw) / 2 - il;
      }

      $dropdown.css("margin-left", ml);
    }
  };

  var posrtl = function ($activeitem) {
    const $dropdown = $activeitem.children(".dropdown-menu");
    const $parentDropdown = $activeitem.closest(".dropdown-menu");

    $dropdown.addClass("show");
    $activeitem.addClass("show");

    if ($parentDropdown.length) {
      const parentDropWidth = $parentDropdown.outerWidth();
      const elmOffset = $activeitem.offset();
      const dropdownWidth = getDropdownWidth($dropdown);
      let marginRight = 0;

      if (elmOffset.left < parentDropWidth) {
        marginRight = 0 - dropdownWidth - $activeitem.width();
      } else {
        marginRight = 0;
      }

      $dropdown.css("margin-right", marginRight + "px");
    } else {
      var rtl = $("html").attr("dir") == "rtl",
        dw = $dropdown.width(),
        ww = $(window).width(),
        dl = $dropdown.offset().left,
        iw = $activeitem.width(),
        il = $activeitem.offset().left,
        ml = null,
        align = $activeitem.data("align");

      ml =
        align == "center"
          ? (dw - iw) / 2
          : align == "right"
            ? dw - iw
            : align == "justify"
              ? ww / 2
              : 0;
      if (dw < ww) {
        if (il + iw + ml > ww - 20) ml = ww - 20 - il - iw;
        if (il + iw + ml < dw + 20) ml = dw + 20 - il - iw;
      } else {
        ml = ww - il - iw + (dw - ww) / 2;
      }
      $dropdown.css("margin-right", -ml);
    }
  };

  var showDropdown = function ($activeitem) {
    $activeitem.addClass("show");
    $activeitem.children(".dropdown-menu").addClass("show");
    $activeitem.children(".dropdown-menu").css("visibility", "visible");

    if ($("html").attr("dir") == "rtl") {
      posrtl($activeitem);
    } else {
      pos($activeitem);
    }

    // with animation, start animating after some ms
    startAnimating($activeitem);
  };

  var startAnimating = function ($item) {
    // get duration
    var $menu = $item.closest(".t4-megamenu");

    if (!$menu.hasClass("animate")) return;

    $item.addClass("animating");
  };

  var endAnimating = function ($item) {
    // remove animating class to make sure the dropdown is totally hidden
    // get duration
    var $menu = $item.closest(".t4-megamenu");
    if (!$menu.hasClass("animate")) return;

    $item.removeClass("animating");
  };

  $(navitem_selector).on('mouseenter', e => {
    if (window.isTouchDevice) {
      return;
    }

    const $elm = $(e.currentTarget);
    const $currentDropdown = $elm.children('.dropdown-menu');

    if (!$currentDropdown.length) {
      return;
    }

    if ($elm.hasClass('animating')) {
      return;
    }

    showDropdown($elm);
  }).on('mouseleave', e => {
    if (window.isTouchDevice) {
      return;
    }

    const $elm = $(e.currentTarget);

    if (!$elm.children('.dropdown-menu').length) {
      return;
    }

    hideDropdowns($elm);
  });

  // if menu open, just open the link
  let activeNavId = 0;

  $(".nav-item.dropdown > .dropdown-toggle").on('touchstart', function (e) {
    if (!window.isTouchDevice) {
      return;
    }

    const $el = $(e.currentTarget);
    const $navItem = $el.parent();

    if ($el.parents('.t4-offcanvas').length) {
      return;
    }

    const navId = $navItem.attr('data-id');

    if (activeNavId !== navId) {
      e.stopPropagation();
      e.preventDefault();

      activeNavId = navId;
    }

    showDropdown($navItem);

    if (window.outerWidth > 990) {
      const activeIds = [+$navItem.data('id')];

      $navItem.parents('.nav-item').map((i, el) => {
        activeIds.push(+el.dataset.id);
      });

      $('.t4-megamenu .nav-item.dropdown').each((i, el) => {
        if (activeIds.indexOf(+el.dataset.id) === -1) {
          hideDropdowns($(el));
        }
      });
    }
  });

  $(document).on('click', e => {
    if (window.outerWidth < 990 || !window.isTouchDevice) {
      return;
    }

    const $target = $(e.target);

    if ($target.closest('.t4-megamenu').length) {
      return;
    }

    activeNavId = 0;

    $('.t4-megamenu .nav-item.dropdown.show').each((i, el) => {
      hideDropdowns($(el));
    })
  })

  // show toggler
  $(".t4-megamenu").each(function () {
    $toggle = $('.navbar-toggler[data-target="#' + this.id + '"]');
    if ($toggle.length == 1) $toggle.removeAttr("style");
  });

  T4MegaMenu.showDropdown = showDropdown;
  T4MegaMenu.hideDropdowns = hideDropdowns;
});