/*
 * Fernway Studio: a fictional web agency. One source for the answers typed in the Customize step
 * (addsite replay, scene 5) and for the homepage the new site shows in the Tracy app (sites/fernway/site.js).
 * The site is built on JA Kinetic and wears the Figma design system picked in the wizard (look "system").
 */
(function () {
  'use strict';
  window.TracyBusinesses = window.TracyBusinesses || {};
  window.TracyBusinesses.fernway = {
    id: 'fernway',
    slug: 'fernway',
    host: 'fernway.tracy.ai',
    template: 'JA Kinetic',
    templateId: 'ja-kinetic',
    platform: 'Joomla',
    /* The design system picked in the Add site wizard (scene 4) and worn from the first build on, from addsite/systems-dev.js. */
    designSystem: {
      name: 'Figma',
      id: 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671',
      colors: ['#4d49fc', '#ffffff', '#000000', '#595959']
    },
    /* What the cursor types, question by question (ids follow tch apps/tracy-web/src/questions/joomla.json). */
    answers: {
      name: 'Fernway Studio',
      about: 'A small web studio that builds and cares for Joomla sites for growing teams.',
      language: 'English (United States)',
      tone: 'Plain'
    },
    address: '210 Market Street, Suite 400, Denver, CO 80202',
    phone: '(555) 014-2290',
    email: 'hello@fernway.example',
    hours: 'Monday to Friday, 8 am to 6 pm MT'
  };
})();
