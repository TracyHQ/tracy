/* Hero showcase: an animated replay of the Tracy app under the homepage hero.

   Same mechanics as the feature block on onorca.dev: a tab row with a sliding
   background and one progress bar, an app window drawn at a fixed 1280 x 696
   and scaled to the box, a scripted timeline per tab, a fake pointer that
   glides in 500ms and rings on each click, and a 0.22s fade + 6px rise when
   content changes. Tab 1 ("Free templates") is scripted here; tabs 2-5 each
   live in their own file (hero-showcase-tab<N>.js) and plug in through
   window.HeroShowcase.register(). A tab with no file stays disabled. Like
   Orca, a tab that reaches its end hands over to the next one, and a click
   on a tab starts that tab from its beginning.

   The look of every part of the window (sizes, colours, icons, text) is
   copied from the live "Design Template" page of the app
   (cowork.tracy.site/design-inspiration, read 22/10/2026). The library's card
   list is the live API snapshot (see WelcomeTemplates); the preview images are screenshots of
   the app's own preview, saved in assets/img/hero-showcase/. */
(function () {
  'use strict';

  var root = document.querySelector('[data-hero-showcase]');
  if (!root || !document.currentScript) return;
  var IMG = new URL('../img/hero-showcase/', document.currentScript.src).href;
  var APP_W = 1280;
  var reduced = false; // The welcome adapter selects a still for every registered tab.

  /* ---- Icons (SVG markup as served by the app) ------------------------ */

  var lucide = function (body) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  };
  var ICON = {
    sparkles: lucide('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>'),
    search: lucide('<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>'),
    filter: lucide('<path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/>'),
    chevDown: lucide('<path d="m6 9 6 6 6-6"/>'),
    eye: lucide('<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'),
    prev: lucide('<path d="m15 18-6-6 6-6"/>'),
    next: lucide('<path d="m9 18 6-6-6-6"/>'),
    sun: lucide('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
    moon: lucide('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
    monitor: lucide('<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>'),
    phone: lucide('<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>'),
    play: lucide('<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>'),
    image: lucide('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'),
    ext: lucide('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
    x: lucide('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    joomla: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#5091CD" d="M16.719 14.759L14.22 17.26l-2.37 2.37-.462.466c-1.368 1.365-3.297 1.83-5.047 1.397-.327 1.424-1.604 2.49-3.13 2.49C1.438 23.983 0 22.547 0 20.772c0-1.518 1.055-2.789 2.469-3.123-.446-1.76.016-3.705 1.396-5.08l.179-.18 2.37 2.37-.184.181c-.769.779-.769 2.024 0 2.789.771.78 2.022.78 2.787 0l.465-.465 2.367-2.371 2.502-2.506 2.368 2.372zm.924 6.652c-1.822.563-3.885.12-5.328-1.318l-.18-.185 2.365-2.369.18.184c.771.768 2.018.768 2.787 0 .765-.765.769-2.01-.004-2.781l-.466-.465-2.365-2.37-2.502-2.503 2.37-2.369 2.499 2.505 2.367 2.37.464.464c1.365 1.36 1.846 3.278 1.411 5.021 1.56.224 2.759 1.56 2.759 3.18 0 1.784-1.439 3.21-3.209 3.21-1.545 0-2.851-1.096-3.135-2.565l-.013-.009zM6.975 9.461l2.508-2.505 2.37-2.369.462-.461C13.74 2.7 15.772 2.251 17.58 2.79c.212-1.561 1.555-2.775 3.179-2.775 1.772 0 3.211 1.437 3.211 3.209 0 1.631-1.216 2.978-2.79 3.186.519 1.799.068 3.816-1.35 5.234l-.182.184-2.369-2.369.184-.184c.769-.77.769-2.016 0-2.783-.766-.766-2.011-.768-2.781.003l-.462.461-2.37 2.369-2.505 2.502-2.37-2.366zm-2.653 2.647l-.461-.462C2.43 10.215 1.986 8.17 2.529 6.358 1.1 6.029.03 4.754.03 3.224.03 1.454 1.47.015 3.24.015c1.596 0 2.92 1.166 3.17 2.691 1.73-.405 3.626.065 4.979 1.415l.184.185-2.37 2.37-.183-.181c-.77-.765-2.016-.765-2.785 0-.771.781-.77 2.025-.005 2.79l.465.466 2.37 2.369 2.505 2.505-2.367 2.37-2.51-2.505-2.371-2.37v-.012z"/></svg>',
    wordpress: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#21759B" d="M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.54.82-2.771.82-3.864 0-.405-.026-.78-.07-1.11m-7.981.105c.647-.03 1.232-.105 1.232-.105.582-.075.514-.93-.067-.899 0 0-1.755.135-2.88.135-1.064 0-2.85-.15-2.85-.15-.585-.03-.661.855-.075.885 0 0 .54.061 1.125.09l1.68 4.605-2.37 7.08L5.354 6.9c.649-.03 1.234-.1 1.234-.1.585-.075.516-.93-.065-.896 0 0-1.746.138-2.874.138-.2 0-.438-.008-.69-.015C4.911 3.15 8.235 1.215 12 1.215c2.809 0 5.365 1.072 7.286 2.833-.046-.003-.091-.009-.141-.009-1.06 0-1.812.923-1.812 1.914 0 .89.513 1.643 1.06 2.531.411.72.89 1.643.89 2.977 0 .915-.354 1.994-.821 3.479l-1.075 3.585-3.9-11.61.001.014zM12 22.784c-1.059 0-2.081-.153-3.048-.437l3.237-9.406 3.315 9.087c.024.053.05.101.078.149-1.12.393-2.325.609-3.582.609M1.211 12c0-1.564.336-3.05.935-4.39L7.29 21.709C3.694 19.96 1.212 16.271 1.211 12M12 0C5.385 0 0 5.385 0 12s5.385 12 12 12 12-5.385 12-12S18.615 0 12 0"/></svg>'
  };
  // The EmDash mark carries two gradients; each copy needs its own ids.
  var emdashN = 0;
  function emdash() {
    var b = 'hs-emb' + (++emdashN), d = 'hs-emd' + emdashN;
    return '<svg viewBox="0 0 75 75" fill="none" aria-hidden="true"><rect x="3" y="3" width="69" height="69" rx="10.518" stroke="url(#' + b + ')" stroke-width="6"/><rect x="18" y="34" width="39.3661" height="6.56101" fill="url(#' + d + ')"/><defs>' +
      '<linearGradient id="' + b + '" x1="-42.9996" y1="124" x2="92.4233" y2="-41.7456" gradientUnits="userSpaceOnUse"><stop stop-color="#0F006B"/><stop offset="0.0833" stop-color="#281A81"/><stop offset="0.1667" stop-color="#5D0C83"/><stop offset="0.25" stop-color="#911475"/><stop offset="0.3333" stop-color="#CE2F55"/><stop offset="0.4167" stop-color="#FF6633"/><stop offset="0.5" stop-color="#F6821F"/><stop offset="0.5833" stop-color="#FBAD41"/><stop offset="0.6667" stop-color="#FFCD89"/><stop offset="0.75" stop-color="#FFE9CB"/><stop offset="0.8333" stop-color="#FFF7EC"/><stop offset="0.9167" stop-color="#FFF8EE"/><stop offset="1" stop-color="white"/></linearGradient>' +
      '<linearGradient id="' + d + '" x1="91.4992" y1="27.4982" x2="28.1217" y2="54.1775" gradientUnits="userSpaceOnUse"><stop stop-color="white"/><stop offset="0.1293" stop-color="#FFF8EE"/><stop offset="0.6171" stop-color="#FBAD41"/><stop offset="0.848" stop-color="#F6821F"/><stop offset="1" stop-color="#FF6633"/></linearGradient></defs></svg>';
  }
  var LOGO = '<svg class="hs-logo" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="450 255 700 292" height="24" fill="none"><g><g><g><path d="M826.184 455.849C816.62 468.213 806.359 478.396 790.199 481.36C768.178 485.4 742.644 475.125 739.208 450.713C738.206 443.721 739.456 436.592 742.759 430.351C758.356 400.475 803.524 408.092 823.044 388.76C828.513 382.104 825.993 375.954 826.146 369.026C828.504 337.898 765.753 336.498 768.388 361.732C772.97 405.522 729.262 380.388 753.258 354.575C772.998 333.344 825.106 329.446 839.72 354.415C852.806 376.772 842.812 426.978 845.991 453.385C847.098 463.584 847.89 469.924 859.545 468.618C863.85 466.782 869.024 464.392 873.434 463.089C871.171 467.859 870.074 470.549 866.714 474.728C861.979 478.734 857.187 481.511 850.868 482.208C845.208 482.847 839.538 481.166 835.138 477.549C827.664 471.305 826.996 464.597 826.184 455.849ZM771.318 464.841C781.904 469.558 790.094 471.09 801.51 466.626C811.017 462.885 818.663 455.549 822.805 446.208C827.721 434.918 826.518 414.699 825.698 402.255C825.602 400.764 823.235 400.536 822.004 400.593C797.787 407.82 744.897 417.983 763.777 456.67C765.095 459.363 768.865 463.03 771.318 464.841Z" fill="currentColor"></path><path d="M461.795 261.457C525.2 260.621 590.509 261.142 654.03 261.382C654.573 269.778 657.558 304.304 654.976 310.641L653.647 311.188C646.685 307.737 642.865 288.896 638.735 282.264C627.731 264.591 596.302 267.824 578.235 268.813C575.258 268.977 571.453 270.729 569.384 272.771C567.16 281.691 567.846 343.525 567.842 356.33L567.823 414.058C567.78 429.094 565.918 451.052 571.328 464.867C575.582 475.729 597.678 470.883 603.596 476.037C600.959 482.089 562.422 478.996 555.664 479.096C545.175 479.253 532.692 479.955 522.325 479.145C517.481 479.094 516.08 479.519 511.962 476.94L511.692 475.362C512.992 474.095 514.274 474.054 516.083 473.672C529.183 472.894 544.382 473.103 544.635 456.187C545.501 398.18 545.914 339.924 544.672 281.926C544.633 280.078 543.839 272.598 542.723 271.889C533.143 265.8 514.175 268.172 503.523 268.942C493.2 269.69 484.348 272.464 478.33 280.756C470.834 289.618 469.972 305.964 462.992 312.309L461.747 312.178C458.064 304.328 461.266 272.061 461.795 261.457Z" fill="currentColor"></path><path d="M1108.91 358.058C1110.67 345.221 1094.95 347.852 1089.49 342.394L1089.73 341.08C1093.81 339.008 1136.27 338.761 1139.04 341.545C1137.28 346.793 1126.09 348.179 1122.9 351.695C1120.64 354.191 1117.76 361.741 1116.31 365.226C1106.09 391.35 1094.32 421.491 1085.05 447.906C1076.1 472.856 1060.86 520.294 1037.78 533.779C1029.01 538.871 1018.55 540.193 1008.79 537.446C997.57 534.353 973.917 518.778 993.971 505.345C1001.75 500.132 1013.37 521.599 1022.02 524.17C1046.08 531.313 1059.19 491.813 1065.7 474.824L1032.11 397.329C1026.89 385.196 1017.41 361.044 1010.65 351.059C1006.42 348.798 992.53 345.602 992.368 342.054C996.415 338.662 1053.57 338.562 1057.53 341.248L1057.42 342.67C1052.38 347.178 1041.68 345.338 1037.98 353.115C1036.84 359.129 1070.04 437.067 1075.21 447.074L1076.37 447.158L1077.76 444.26C1088.91 415.81 1099.3 387.066 1108.91 358.058Z" fill="currentColor"></path><path d="M931.927 338.501C944.107 337.511 955.924 338.585 967.197 343.692C980.417 349.68 995.165 363.694 988.464 379.535C987.548 381.703 985.333 383.895 982.994 384.477C969.679 386.559 967.55 372.595 964.639 363.28C961.107 351.802 953.595 346.581 941.835 345.792C924.062 344.28 908.579 354.815 900.323 370.142C877.958 411.645 899.33 484.594 958.053 466.776C981.057 455.684 979.73 439.755 988.092 434.236L989.237 434.7C991.347 443.611 985.39 454.091 980.236 461.071C961.756 486.073 921.322 488.49 897.488 470.085C865.626 445.488 862.772 395.15 886.759 364.197C898.185 349.477 913.505 340.821 931.927 338.501Z" fill="currentColor"></path><path d="M674.151 365.87C681.226 353.191 686.783 343.922 702.162 338.473C713.197 334.111 736.44 341.42 728.641 356.643C725.692 362.415 719.497 365.767 714.676 361.74C699.642 349.159 691.73 349.083 681.287 366.887C678.565 372.079 675.07 382.294 674.861 388.205C674.004 412.479 672.014 438.866 675.816 462.818C678.228 478.011 702.859 469.564 709.913 476.01L709.942 477.614C705.866 481.299 651.15 479.506 641.998 479.677C637.278 479.94 633.773 481.094 631.149 476.819L632.13 474.901C634.793 472.761 637.428 472.73 640.833 472.256C648.001 470.704 653.519 468.566 654.126 459.913C655.923 434.298 653.743 402.737 654.588 377.732C655.855 340.196 634.725 360.04 630.722 349.533L631.385 347.729C636.985 345.173 666.623 339.292 673.957 337.713C674.14 347.098 674.205 356.484 674.151 365.87Z" fill="currentColor"></path></g></g></g></svg>';

  /* ---- Content, in the app's order ------------------------------------ */

  var TABS = ['Free templates', 'Add site', 'Click to edit', 'Teamwork', 'You own it'];

  // Keep every template gallery in the live API's order and use its card posters.
  var CARDS = window.WelcomeTemplates.map(function(t){return [t.id,t.name,t.category,t.cms.map(function(p){return {joomla:'J',wordpress:'W',emdash:'E'}[p]||'';}).join(''),new URL('../'+t.image,document.currentScript.src).href];});
  var COUNTS = {joomla:0,wp:0,emdash:0};
  window.WelcomeTemplates.forEach(function(t){t.cms.forEach(function(p){COUNTS[p==='wordpress'?'wp':p]++;});});

  // The preview opens JA Kinetic and walks its six pages. Each shot is the
  // app's Live preview at 1280 x 696: one per page in Light, Home in Dark, and
  // Home in Mobile (Light and Dark). Home in Light also has a taller shot of the
  // page below its sticky header, laid over the first one so it can scroll. In
  // Mobile the app draws a phone frame, so that shot is the whole preview body;
  // the page inside the phone is a second, taller shot of the same page at the
  // phone's width (390, 375 without its scrollbar), so it can scroll under the
  // frame.
  var KINETIC_NAME = 'JA Kinetic';
  var PAGES = ['Home', 'Features', 'Pricing', 'Integrations', 'Changelog', 'Blog'];
  var SHOT = function (page) { return 'preview-ja-kinetic-' + page.toLowerCase(); };
  var DARK_SHOT = 'preview-ja-kinetic-home-dark';
  var SHOTS = PAGES.map(SHOT).concat([DARK_SHOT]);

  /* ---- Build ----------------------------------------------------------- */

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function plats(code) {
    return (code.indexOf('J') > -1 ? ICON.joomla : '') + (code.indexOf('W') > -1 ? ICON.wordpress : '') + (code.indexOf('E') > -1 ? emdash() : '');
  }

  var tabsHtml = TABS.map(function (t, i) {
    return '<button type="button" class="hs-tab' + (i ? '' : ' is-active') + '" role="tab" aria-selected="' + (i ? 'false' : 'true') + '"' + (i ? ' disabled aria-disabled="true"' : '') + '>' + t + '</button>';
  }).join('');

  // The script scrolls through the first eight rows only (see SCROLL_DOWN);
  // cards past them are never on screen, so the browser may load them late.
  var cardsHtml = CARDS.map(function (c, i) {
    return '<div class="hs-card"><div class="hs-card-img"><img src="' + c[4] + '" alt="" width="600" height="278" decoding="async"' + (i < 40 ? '' : ' loading="lazy"') + '><div class="hs-card-scrim"></div></div>' +
      '<div class="hs-card-foot"><div class="hs-card-text"><div class="hs-card-name">' + c[1] + '</div><div class="hs-card-cat">' + esc(c[2]) + '</div></div><div class="hs-card-plats">' + plats(c[3]) + '</div></div>' +
      '<div class="hs-card-open"><span>' + ICON.eye + 'Open preview</span></div></div>';
  }).join('');

  var img = function (s, cls) { return '<img src="' + IMG + s + '.webp" alt=""' + (cls ? ' class="' + cls + '"' : '') + ' decoding="async">'; };
  var shotsHtml = SHOTS.map(function (s) {
    if (s === SHOT('Home')) return '<div class="hs-shot" data-shot="' + s + '">' + img(s) + '<div class="hs-dpage">' + img(s + '-page') + '</div></div>';
    return '<img src="' + IMG + s + '.webp" alt="" data-shot="' + s + '" decoding="async">';
  }).join('');

  var CURSOR_HTML = window.WelcomePointer.HTML;
  var STAGE_LABEL = 'Tracy app: browsing '+CARDS.length+' free design templates, then previewing JA Kinetic page by page, in dark mode and on mobile, ending on the Create with WordPress / Joomla / EmDash buttons';

  root.innerHTML =
    '<div class="hs-tabs"><div class="hs-tabs-in" role="tablist" aria-label="What you can do with Tracy"><span class="hs-tab-bg" aria-hidden="true"></span>' + tabsHtml +
    '<span class="hs-progress" aria-hidden="true"><span class="hs-progress-fill"></span></span></div></div>' +
    '<div class="hs-note"></div>' +
    '<div class="hs-stage" role="img" aria-label="' + STAGE_LABEL + '">' +
    '<div class="hs-win" aria-hidden="true"><div class="hs-bar"><i></i><i></i><i></i></div><div class="hs-app">' +
      '<div class="hs-lib"><div class="hs-scroll"><div class="hs-filters">' +
        '<div class="hs-row"><span class="hs-plat">' + ICON.joomla + 'Joomla<span class="hs-count">' + COUNTS.joomla + '</span></span><span class="hs-plat">' + ICON.wordpress + 'WordPress<span class="hs-count">' + COUNTS.wp + '</span></span><span class="hs-plat">' + emdash() + 'EmDash<span class="hs-count">' + COUNTS.emdash + '</span></span></div>' +
        '<div class="hs-row"><div class="hs-search">' + ICON.search + '<span>Search, e.g. JA Fresco</span></div><span class="hs-cat">' + ICON.filter + 'Categories' + ICON.chevDown + '</span></div>' +
        '<div class="hs-showing">Showing all ' + CARDS.length + ' designs</div>' +
      '</div><div class="hs-grid">' + cardsHtml + '</div></div>' +
      '<header class="hs-hdr">' + LOGO + '<span class="hs-hdr-title">Design Template</span><div class="hs-hdr-form"><div class="hs-input">Your domain, or one sentence about your business</div><span class="hs-showme">' + ICON.sparkles + 'Show me</span></div></header></div>' +
      '<div class="hs-overlay"></div>' +
      '<div class="hs-dlg"><div class="hs-dlg-head">' +
        '<span class="hs-nav"><span class="hs-navb hs-prev">' + ICON.prev + '</span><span class="hs-counter"></span><span class="hs-navb hs-next">' + ICON.next + '</span></span>' +
        '<span class="hs-name"></span>' +
        '<div class="hs-create"><span>Create with</span><span class="hs-cbtn hs-cwp">' + ICON.wordpress + 'WordPress</span><span class="hs-cbtn">' + ICON.joomla + 'Joomla</span><span class="hs-cbtn hs-cem">' + emdash() + 'EmDash</span></div>' +
        '<span class="hs-close">' + ICON.x + '</span></div>' +
        '<div class="hs-pills"><span class="hs-pagepills" style="display:contents"></span><span class="hs-tools">' +
          '<span class="hs-seg is-xs hs-theme"><span class="hs-segb is-on hs-light">' + ICON.sun + 'Light</span><span class="hs-segb hs-dark">' + ICON.moon + 'Dark</span></span>' +
          '<span class="hs-seg is-xs"><span class="hs-segb is-on hs-desk">' + ICON.monitor + 'Desktop</span><span class="hs-segb hs-mob">' + ICON.phone + 'Mobile</span></span>' +
          '<span class="hs-seg"><span class="hs-segb is-on is-14">' + ICON.play + 'Live</span><span class="hs-segb is-14">' + ICON.image + 'Screenshot</span></span>' +
          '<span class="hs-demo">Open demo' + ICON.ext + '</span></span></div>' +
        '<div class="hs-dlg-body"><div class="hs-frame">' + shotsHtml + '</div><div class="hs-mobile">' +
          img('preview-ja-kinetic-home-mobile') + img('preview-ja-kinetic-home-mobile-dark', 'hs-mdark') + '<div class="hs-mpage">' +
          img('preview-ja-kinetic-home-mobile-page') + img('preview-ja-kinetic-home-mobile-dark-page', 'hs-mdark') + '</div></div></div><div class="hs-dlg-foot"></div></div>' +
      CURSOR_HTML +
    '</div></div></div>';

  var $ = function (s) { return root.querySelector(s); };
  var stage = $('.hs-stage'), win = $('.hs-win'), app = $('.hs-app'), scrollEl = $('.hs-scroll');
  var tabBg = $('.hs-tab-bg'), fill = $('.hs-progress-fill'), tabBtns = root.querySelectorAll('.hs-tab'), noteEl = $('.hs-note');
  var kineticIndex = CARDS.map(function (c) { return c[1]; }).indexOf(KINETIC_NAME);
  var cursor = $('.hs-cursor'), kineticCard = root.querySelectorAll('.hs-card')[kineticIndex];
  var prevBtn = $('.hs-prev'), counter = $('.hs-counter'), nameEl = $('.hs-name');
  var pillsEl = $('.hs-pagepills'), lightBtn = $('.hs-light'), darkBtn = $('.hs-dark');
  var deskBtn = $('.hs-desk'), mobBtn = $('.hs-mob'), mobileShot = $('.hs-mobile');
  var phonePages = root.querySelectorAll('.hs-mpage img'), cmsBtns = root.querySelectorAll('.hs-cbtn');
  var homePage = $('.hs-dpage'), homePageImg = $('.hs-dpage img');
  var shots = {};
  [].forEach.call(root.querySelectorAll('.hs-frame > [data-shot]'), function (im) { shots[im.getAttribute('data-shot')] = im; });

  /* ---- Scale the fixed-size window to the box ------------------------- */

  var scale = 1, inv = 1, cur = 0; // cur: index of the tab on screen
  function fit() {
    scale = stage.clientWidth / APP_W;
    win.style.transform = 'scale(' + scale + ')';
    inv = Math.min(1.8, Math.max(1, 0.75 / scale));
    win.style.setProperty('--hs-inv', inv); // every tab's pointer inherits it
    placeTabBg();
  }
  function placeTabBg() {
    var b = tabBtns[cur];
    tabBg.style.left = b.offsetLeft + 'px';
    tabBg.style.width = b.offsetWidth + 'px';
  }
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);

  /* ---- State helpers --------------------------------------------------- */

  function rise(el) {
    if (el.animate) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }
  var currentShot = null;
  function showShot(key) {
    var im = shots[key];
    if (im === currentShot) return;
    var old = currentShot;
    currentShot = im;
    im.style.zIndex = 2;
    im.classList.add('is-on');
    rise(im);
    if (old) { old.style.zIndex = 1; setTimeout(function () { if (old !== currentShot) old.classList.remove('is-on'); }, 230); }
  }
  function setPills(active) {
    pillsEl.innerHTML = PAGES.map(function (p, i) {
      return '<span class="hs-pill' + (i === active ? ' is-on' : '') + '"><b>' + p + '</b></span>';
    }).join('');
  }
  function seg(onBtn, offBtn) { onBtn.classList.add('is-on'); offBtn.classList.remove('is-on'); }
  function setMobile(on) {
    seg(on ? mobBtn : deskBtn, on ? deskBtn : mobBtn);
    mobileShot.classList.toggle('is-on', on);
    if (on) rise(mobileShot);
  }

  // The dialog only ever shows JA Kinetic, so its head is filled once: its
  // place in this library's list, as the app counts it. The "Create with
  // EmDash" button is disabled for it, as in the app.
  counter.textContent = (kineticIndex + 1) + ' of ' + CARDS.length;
  nameEl.textContent = KINETIC_NAME;
  $('.hs-cem').classList.add('is-off');

  // A fake pointer living in box (a 1280 x 696 screen). Its position is the
  // top-left of its 12px box, in window pixels. Every tab makes its own.
  /* The shared pointer (pointer.js): scene 1's dot, glide and click ring, used by every scene. */
  function makePointer(cur, box) {
    return window.WelcomePointer.create(cur, box, { scale: function () { return scale; }, inv: function () { return inv; } });
  }
  var p1 = makePointer(cursor, app), pointerTo = p1.to, pointerOn = p1.on, click = p1.click;

  // Direct action moves, concise reading holds, and no unclicked hover tour.
  var LEAD = 0, FIRST = 1500, MOVE = 400;
  var PAGE = 1900;                 // click to click in the preview
  var SPEED = 0.2, RAMP = 1000;    // library scroll: px per ms at full speed, ramp in / out
  var SCROLL_DOWN = 1200;          // rows 1-8 (32 cards) pass by
  var SCROLL_BACK = Math.max(0, Math.floor(kineticIndex / 4) * 220);           // up again until JA Kinetic's row (row 2) sits mid-window
  var ENTER = 320, HOLD = 80;   // pointer in from the corner, then rests on JA Kinetic
  var POINTER_FROM = [1290, 706];  // just past the bottom-right corner, so it slides in from the edge
  var HOME_WAIT = 1500, HOME_SCROLL = 160, HOME_T = 1000, HOME_RAMP = 500; // a little, peak 180px/s
  var HOME_HOLD = 1500, HOME_BACK = 1500; // rest at the bottom; rest at the top before Features
  var PHONE_SCROLL = 180, PHONE_T = 1000; // the page in the phone frame: a little, slowly (peak 150px/s)
  var PHONE_WAIT = 1500, WP_WAIT = 1500, END_HOLD = 1500;
  // The app swaps the preview for a new one on Light / Dark (new iframe, new
  // URL), so the real page comes back at the top. The founder's script keeps
  // the place and then scrolls back up; false = the app's way (jump to top).
  var DARK_KEEPS_SCROLL = true;

  var S_DOWN = 0, T_DOWN = 0, S_UP = 0, T_UP = 0;
  var S_TOP = FIRST;
  function setScroll(y) { scrollEl.parentElement.scrollTop = y; }
  function setPhone(y) { [].forEach.call(phonePages, function (im) { im.style.transform = 'translateY(' + (-y) + 'px)'; }); }
  function setHome(y) {
    homePageImg.style.transform = 'translateY(' + (-y) + 'px)';
    homePage.classList.toggle('is-scrolled', y > 0.5); // the page's sticky header casts a shadow once scrolled
  }
  // Distance covered after e ms of a d px move lasting T ms: speed eases in
  // over r ms, holds, eases out over r ms (half-cosine ramps).
  function glide(e, d, T, r) {
    if (e <= 0) return 0;
    if (e >= T) return d;
    var v = d / (T - r);
    var ramp = function (x) { return v * (x / 2 - r / (2 * Math.PI) * Math.sin(Math.PI * x / r)); };
    if (e < r) return ramp(e);
    if (e <= T - r) return v * r / 2 + v * (e - r);
    return d - ramp(T - e);
  }
  function scrollAt(t) {
    return SCROLL_BACK * Math.min(1, Math.max(0, t / 1000));
  }
  // Down d px from a, then back up from b.
  function downUp(t, a, b, d, T, r) { return t < b ? glide(t - a, d, T, r) : d - glide(t - b, d, T, r); }

  function resetScene() {
    app.classList.remove('is-modal');
    [kineticCard, darkBtn, lightBtn, mobBtn].concat([].slice.call(cmsBtns)).forEach(function (b) { b.classList.remove('is-hover'); });
    prevBtn.classList.add('is-focus');
    seg(lightBtn, darkBtn);
    setMobile(false);
    mobileShot.classList.remove('is-dark');
    setPhone(0);
    setHome(0);
    setPills(0);
    showShot(SHOT('Home'));
    setScroll(0);
    cursor.classList.remove('is-on', 'is-enter');
    pointerTo(POINTER_FROM[0], POINTER_FROM[1], true);
  }

  var steps = [];
  // Glide to el so the click lands at clickAt: move MOVE ms before, hover on
  // arrival (500ms), then the click ring.
  function beat(clickAt, target, onClick, hoverEl) {
    steps.push([clickAt - MOVE, function () { pointerOn(target()); }]);
    if (hoverEl) steps.push([clickAt - 80, function () { hoverEl.classList.add('is-hover'); }]);
    steps.push([clickAt, function () { click(); if (hoverEl) hoverEl.classList.remove('is-hover'); onClick(); }]);
    return clickAt + PAGE;
  }

  // JA Kinetic: in from the corner, opaque from the first frame (the slow
  // glide is .is-enter in hero-showcase.css), hover on arrival, click after HOLD.
  var OPEN = S_TOP + ENTER + HOLD;
  steps.push([S_TOP, function () { cursor.classList.add('is-on', 'is-enter'); pointerOn(kineticCard, 0, -30); }]);
  steps.push([S_TOP + ENTER, function () { cursor.classList.remove('is-enter'); kineticCard.classList.add('is-hover'); }]);
  steps.push([OPEN, function () {
    click();
    kineticCard.classList.remove('is-hover');
    app.classList.add('is-modal');
    var dlg = $('.hs-dlg');
    if (dlg.animate) dlg.animate([{ opacity: 0, transform: 'scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 100, easing: 'ease-out' });
  }]);
  var H0 = OPEN + HOME_WAIT, H1 = H0 + HOME_T + HOME_HOLD, H2 = H1 + HOME_T;
  var at = H2 + HOME_BACK + MOVE;
  PAGES.slice(1).concat(['Home']).forEach(function (page) {
    var k = PAGES.indexOf(page);
    at = beat(at, function () { return pillsEl.children[k]; }, function () {
      prevBtn.classList.remove('is-focus');
      setPills(k);
      showShot(SHOT(page));
    });
  });
  at = beat(at, function () { return darkBtn; }, function () { seg(darkBtn, lightBtn); showShot(DARK_SHOT); }, darkBtn);
  at = beat(at, function () { return lightBtn; }, function () { seg(lightBtn, darkBtn); showShot(SHOT('Home')); }, lightBtn);
  var MOBILE = at;
  beat(MOBILE, function () { return mobBtn; }, function () { setMobile(true); }, mobBtn);
  var P0 = MOBILE + PHONE_WAIT, P1 = P0 + PHONE_T;
  var DARK_M = P1 + WP_WAIT + MOVE;
  beat(DARK_M, function () { return darkBtn; }, function () { seg(darkBtn, lightBtn); mobileShot.classList.add('is-dark'); }, darkBtn);
  var P2 = DARK_M + PHONE_WAIT, P3 = P2 + PHONE_T;
  var WP = P3 + WP_WAIT + MOVE;
  var TOTAL = P3 + END_HOLD;

  /* ---- Tabs and clock --------------------------------------------------
     Every tab is { el, total, reset(), frame(t), label }: el is its 1280 x 696
     screen, total its length in ms, reset() puts it back to its first frame,
     frame(t) draws it t ms in. Tab 1 is the one above; register() adds the
     others (see the head of this file). */

  var next = 0; // tab 1: index of its next step
  var lastScrollTime = null;
  var tabs = [{
    el: app, total: TOTAL, still: OPEN + 500, label: STAGE_LABEL,
    reset: function () { next = 0; lastScrollTime = null; resetScene(); },
    frame: function (t) {
      p1.tick(t);
      while (next < steps.length && steps[next][0] <= t) steps[next++][1]();
      // Preserve native gallery scrolling while paused; resets replay the track.
      if (t < S_TOP + 100 && t !== lastScrollTime) { setScroll(scrollAt(t)); lastScrollTime = t; }
      else if (t > H0 - 100 && t < H2 + 100) setHome(downUp(t, H0, H1, HOME_SCROLL, HOME_T, HOME_RAMP));
      else if (t > P0 - 100 && t < P3 + 100) setPhone(!DARK_KEEPS_SCROLL && t >= DARK_M ? 0 : downUp(t, P0, P2, PHONE_SCROLL, PHONE_T, PHONE_T / 2));
    }
  }, null, null, null, null];

  var t = 0, last = 0, paused = true;
  function show(i) {
    cur = i; t = 0; last = 0;
    tabs.forEach(function (tb, k) { if (tb) tb.el.classList.toggle('is-off', k !== i); });
    [].forEach.call(tabBtns, function (b, k) { b.classList.toggle('is-active', k === i); b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    stage.setAttribute('aria-label', tabs[i].label);
    placeTabBg();
    note('');
    tabs[i].reset();
    rise(tabs[i].el);
  }
  // The next tab that is built, wrapping round to tab 1.
  function after(i) {
    for (var k = 1; k <= tabs.length; k++) if (tabs[(i + k) % tabs.length]) return (i + k) % tabs.length;
    return i;
  }
  function setFill(p) {
    var b = tabBtns[cur];
    fill.style.width = Math.max(0, b.offsetLeft - 5 + b.offsetWidth * Math.min(p, 1)) + 'px';
  }
  function frame(now) {
    // Clamp the step so a hidden tab resumes where it was instead of jumping.
    if (!paused) t += last ? Math.min(now - last, 100) : 0;
    last = now;
    if (t >= tabs[cur].total) { t = tabs[cur].total; paused = true; }
    tabs[cur].frame(t);
    setFill(t / tabs[cur].total);
    requestAnimationFrame(frame);
  }

  // The caption line above the window: site UI, not the app's. Only a tab that
  // shows more than one example uses it; it is cleared on every tab change.
  var noteText = '';
  function note(text) {
    text = text || '';
    if (text === noteText) return;
    noteText = text;
    noteEl.textContent = text;
    if (text) rise(noteEl);
  }

  /* ---- Plug-in point for tabs 2-5 --------------------------------------
     A tab file calls HeroShowcase.register(n, setup) with n = 1..4 (its
     place in TABS). setup(screen, kit) builds the tab inside screen (an
     empty 1280 x 696 box over tab 1's) and returns { total, reset, frame,
     label } as above. kit holds what the tabs share, so all five move and
     look alike. A tab's own classes start with "hs<N+1>-" and its pictures
     sit in assets/img/hero-showcase/tab<N+1>/ (kit.IMG + 'tab<N+1>/'). */

  var kit = {
    IMG: IMG, ICON: ICON, LOGO: LOGO, emdash: emdash, esc: esc,
    LEAD: LEAD, FIRST: FIRST, MOVE: MOVE, PAGE: PAGE,
    rise: rise, glide: glide, downUp: downUp,
    // A pointer for screen: kit.pointer(screen) -> { el, to(x, y, jump), on(el, dx, dy), click() };
    // add / remove "is-on" on its el to show / hide it.
    pointer: function (screen) {
      screen.insertAdjacentHTML('beforeend', CURSOR_HTML);
      return makePointer(screen.lastChild, screen);
    },
    // The caption above the window: kit.note('…') shows it, kit.note('') hides
    // it; same text again does nothing, so frame(t) may call it every frame.
    note: note,
    // The first n characters of text after e ms of typing at ms per character.
    typed: function (text, e, ms) { return text.slice(0, Math.max(0, Math.floor(e / ms))); }
  };
  window.HeroShowcase = {
    kit: kit,
    control: {
      show: function (index) { show(index); tabs[index].frame(0); },
      pause: function (value) { paused = value; last = 0; },
      scale: function (value) { scale = value; inv = Math.min(1.8, Math.max(1, 0.75 / scale)); win.style.setProperty('--hs-inv', inv); },
      state: function () { return { tab: cur, time: t, total: tabs[cur].total, paused: paused, still: tabs[cur].still || tabs[cur].total - 1 }; },
      active: function () { return tabs[cur].el; },
      seek: function (value) {
        show(cur);
        value = Math.max(0, Math.min(value, tabs[cur].total));
        // Replay each timing track so completed typing and scrolling remain faithful.
        root.classList.add('is-seeking');
        for (var at = 0; at < value; at += 50) tabs[cur].frame(at);
        t = value; tabs[cur].frame(t); last = 0;
        root.classList.remove('is-seeking');
        if (root.getAnimations) root.getAnimations({ subtree: true }).forEach(function (a) { if (a.effect && Number.isFinite(a.effect.getComputedTiming().endTime)) a.finish(); });
      }
    },
    register: function (n, setup) {
      if (tabs[n] || !tabBtns[n]) return;
      var el = document.createElement('div');
      el.className = 'hs-app hs-screen is-off';
      app.parentNode.appendChild(el);
      var tb = setup(el, kit);
      tb.el = el;
      tabs[n] = tb;
      tabBtns[n].disabled = false;
      tabBtns[n].removeAttribute('aria-disabled');
    }
  };

  resetScene();
  if (reduced) {
    // A still frame: the library at rest, no pointer, a full bar.
    setFill(1);
    return;
  }
  [].forEach.call(tabBtns, function (b, k) { b.addEventListener('click', function () { if (tabs[k]) show(k); }); });
  requestAnimationFrame(frame);
})();
